var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mustache = require('mustache'),
    crypto = require('crypto'),
    api = require('./api.js'),
    basics = require('../common/basics.js'),
    statusCodes = require('../common/status-codes.js'),
    config = require('config'),
    http = require('http'),
    url = require('url'),
    events = require('events');

var append = basics.append,
    curriedHas = basics.curriedHas;

var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var emitter = new events.EventEmitter();

function sourceDir(name) {
  return path.join(__dirname, '../..', name);
}

app.set('views', sourceDir('resources/mustache-templates'));
app.use(express.static(sourceDir('webapp')));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.cookieSession({ secret: config.frontend_server.cookie_secret }));

var chrome =
  mustache.compile(fs.readFileSync(
    path.join(app.get('views'), 'chrome.mustache'), 'utf8'));
var bundles =
  JSON.parse(fs.readFileSync(sourceDir('resources/bundles.json'), 'utf8'));

app.use(function(req, res, next) {
  res.sendBadRequest = function() {
    res.send(statusCodes.BAD_REQUEST, 'Bad request');
  };
  res.sendNotFound = function() {
    res.send(statusCodes.NOT_FOUND, 'Not found');
  };
  res.sendInternalServerError = function(err) {
    res.send(statusCodes.INTERNAL_SERVER_ERROR,
      (err && 'message' in err) ? err.message : 'Unkown error');
  };
  res.renderWithChrome = function(bundleName, options) {
    var bundle = bundles[bundleName];
    var templatePath = path.join(app.get('views'), bundle.template);
    var scripts = 
      append(bundles['root'].scripts, bundle.scripts || []).map(function(p) {
        return { path: p };
      });
    var styles =
      append(bundles['root'].styles, bundle.styles || []).map(function(p) {
        return {
          path: p,
          rel: (path.extname(p) == '.less') ? 'stylesheet/less' : 'stylesheet'
        };
      });
    var clientTemplates =
      append(bundles['root'].clientTemplates,
        bundle.clientTemplates || []).map(function(t) {
      var code = fs.readFileSync(path.join(app.get('views'), t), 'utf8');
      return {
        name: path.basename(t, '.mustache'),
        code: code
      };
    });
    var flashOpt = null;
    if (req.cookies['flash.message'] && req.cookies['flash.type']) {
      flashOpt = {
        message: req.cookies['flash.message'],
        type: req.cookies['flash.type']
      };
      res.clearCookie('flash.message');
      res.clearCookie('flash.type');
    }
    fs.readFile(templatePath, 'utf8', function(err, template) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        res.send(chrome({
          content: mustache.render(template, options),
          title: 'Forerun',
          scripts: scripts,
          styles: styles,
          clientTemplates: clientTemplates,
          flash: flashOpt,
          user: req.session && req.session['user']
        }));
      }
    });
  };
  res.flash = function(type, message) {
    res.cookie('flash.type', type);
    res.cookie('flash.message', message);

    // This is so that if we call renderWithChrome in the same response handler,
    // we'll still get the flash.
    req.cookies['flash.type'] = type;
    req.cookies['flash.message'] = message;
  };
  res.withUser = function(loggedInCallback, loggedOutCallback) {
    if (req.session['api_token']) {
      loggedInCallback(req.session['user'], api.Client(req.session['api_token']));
    } else if (loggedOutCallback) {
      req.session = null;
      loggedOutCallback();
    } else res.redirect('/');
  }
  next();
});

app.get('/api/reference', function(req, res) {
  // XXX this whole pipeline is totally broken
  var docs = JSON.parse(fs.readFileSync(sourceDir('resources/docs.json'), 'utf8'));
  res.renderWithChrome('api-reference-page', { endpoints: docs.endpoints });
});

app.get('/', function(req, res) {
  res.withUser(function(user, client) {
    client.thread.all(function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        if (meta.code != statusCodes.OK)
          res.flash('error', "Sorry, we couldn't get the threads list for you");
        res.renderWithChrome('home-page', { threads: response.threads || [] });
      }
    });
  }, function() {
    res.renderWithChrome('splash-page', { });
  });
});

app.get('/thread/:id', function(req, res) {
  res.withUser(function(user, client) {
    client.thread.get(function(err, meta, response) {
    });
  });
});

app.get('/board/:id', function(req, res) {
  res.withUser(function (user, client) {
    client.board.get(req.params.id, function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        if (meta.code == statusCodes.NOT_FOUND) {
          res.sendNotFound();
        } else if (meta.code != statusCodes.OK) {
          // XXX better error reporting in these types of cases? i don't know
          res.flash('error', "We couldn't access that board for you");
          res.redirect('/');
        } else {
          res.renderWithChrome('board-page', {
            board: response.board,
            threads: response.threads
          });
        }
      }
    });
  });
});

app.post('/board/new', function(req, res) {
  if (['title', 'subtitle'].every(curriedHas(req.body))) {
    res.withUser(function(user, client) {
      client.board.new(req.body.title, req.body.subtitle,
          function(err, meta, response) {
        if (err) {
          res.sendInternalServerError(err);
        } else {
          if (meta.code != statusCodes.OK) {
            if (meta.errorType == 'param_error') {
              res.flash('error', 'Please provide a title for the new board');
            } else {
              res.flash('error', "Sorry, we couldn't create the board. Try again?");
            }
          }
          res.redirect('/');
        }
      });
    });
  } else res.sendBadRequest();
});

app.get('/profile', function(req, res) {
  res.withUser(function(user, client) {
    res.renderWithChrome('profile-page', {
      user: user,
      readable_join_date: basics.readableDate(user.join_date)
    });
  });
});

app.get('/logout', function(req, res) {
  res.withUser(function(user, client) {
    req.session = null;
    res.clearCookie('api_token');
    client.revoke(function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else res.redirect('/');
    });
  }, function() { res.redirect('/'); });
});

app.post('/login', function(req, res) {
  if (['handle', 'password'].every(curriedHas(req.body))) {
    var password_md5 = basics.createMD5Hash(req.body.password);
    var client = api.Client(app.get('api_token'));
    client.user.login(req.body.handle, password_md5,
        function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else if (meta.code != statusCodes.OK) {
        if (meta.errorType == 'login_failed') {
          res.flash('error', 'Your username or password was incorrect');
        } else res.flash('error', "Sorry, we couldn't log you in. Try again?");
        res.redirect('/#login');
      } else {
        var api_key = response.user.consumer.api_key;
        var api_secret = response.user.consumer.api_secret;
        api.authenticate(api_key, api_secret, function(err, api_token) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            res.cookie('api_token', api_token);
            req.session['api_token'] = api_token;
            req.session['user'] = response.user;
            res.redirect('/');
          }
        });
      }
    });
  } else res.sendBadRequest();
});

app.post('/signup', function(req, res) {
  if (['handle', 'email', 'password'].every(curriedHas(req.body))) {
    var password_md5 = basics.createMD5Hash(req.body.password);
    var client = api.Client(app.get('api_token'));
    client.user.new_(
        req.body.handle, req.body.email, password_md5, 0,
        function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else if (meta.code != statusCodes.OK) {
        if (meta.errorType == 'handle_taken') {
          res.flash('error', "Sorry, but there's already a user with that handle!");
        } else res.flash('error', "Sorry, we couldn't sign you up. Try again?");
        res.redirect('/#signup');
      } else {
        var api_key = response.user.consumer.api_key;
        var api_secret = response.user.consumer.api_secret;
        api.authenticate(api_key, api_secret, function(err, api_token) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            res.cookie('api_token', api_token);
            req.session['api_token'] = api_token;
            req.session['user'] = response.user;
            res.redirect('/');
          }
        });
      }
    });
  } else res.sendBadRequest();
});

app.post('/stream-receiver', function(req, res) {
  // TODO check API secret on request, when that's done
  console.log(req);
});

server.on('request', function(req, res) {
  console.log(req.url);
  // XXX
});

function authenticateWithRetries(api_key, api_secret, numRetries, callback) {
  if (numRetries == 0) {
    callback(new Error("Couldn't authenticate with retries"));
  } else {
    api.authenticate(api_key, api_secret, function(err, api_token) {
      if (err) {
        setTimeout(function() {
          authenticateWithRetries(api_key, api_secret, numRetries - 1, callback);
        }, 500);
      } else callback(null, api_token);
    });
  }
}

authenticateWithRetries(
    config.frontend_server.api_key,
    config.frontend_server.api_secret,
    5, function(err, api_token) {
  if (err) {
    console.error("Couldn't authenticate frontend server with API");
    process.exit(1);
  } else {
    app.set('api_token', api_token);
    server.listen(config.frontend_server.port);
    console.log('Using API token: ' + api_token);
    console.log('Listening on port ' + config.frontend_server.port);

    api.Client(api_token).stream.registerReceiver(
        url.format({
          protocol: 'http',
          hostname: config.frontend_server.receiver_hostname,
          port: config.frontend_server.receiver_port,
          pathname: '/stream-receiver'
        }), function(err, meta, response) {
      if (err || meta.code != statusCodes.OK) {
        console.error("Couldn't register stream receiver");
      }
    });
  }
});

