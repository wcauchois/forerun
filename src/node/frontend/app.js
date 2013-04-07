var express = require('express'),
    fs = require('fs'),
    querystring = require('querystring'),
    path = require('path'),
    mustache = require('mustache'),
    crypto = require('crypto'),
    api = require('./api.js'),
    basics = require('../common/basics.js'),
    statusCodes = require('../common/status-codes.js'),
    config = require('config'),
    http = require('http'),
    url = require('url'),
    events = require('events'),
    md = require('node-markdown').Markdown,
    domain = require('domain'),
    logging = require('../common/logging.js'),
    AmazonSES = require('amazon-ses');

var append = basics.append,
    merge = basics.merge,
    curriedHas = basics.curriedHas;

var emailClient = new AmazonSES(
  config.frontend_server.aws_access_key,
  config.frontend_server.aws_secret);
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var emitter = new events.EventEmitter();
var onlineUsers = { };

function sourceDir(name) {
  return path.join(__dirname, '../..', name);
}

app.use(logging.extendRequest());
logging.set('server', 'frontend');

app.set('views', sourceDir('resources/mustache-templates'));
app.use(express.static(sourceDir('webapp')));
app.use((function() {
  var bodyParser = express.bodyParser();
  return function(req, res, next) {
    if (req.path == '/callback') {
      req.setEncoding('utf8');
      req.on('readable', function() {
        req.data = JSON.parse(req.read());
        next();
      });
    } else bodyParser(req, res, next);
  };
})());
app.use(express.cookieParser());
app.use(express.cookieSession({ secret: config.frontend_server.cookie_secret }));

var chrome =
  mustache.compile(fs.readFileSync(
    path.join(app.get('views'), 'chrome.mustache'), 'utf8'));
var bundles =
  JSON.parse(fs.readFileSync(sourceDir('resources/bundles.json'), 'utf8'));
bundles['root'].partials.forEach(function(partial) {
  mustache.compilePartial(path.basename(partial, '.mustache'),
    fs.readFileSync(path.join(app.get('views'), partial), 'utf8'));
});
function renderTemplate(filename, options) {
  var template = fs.readFileSync(path.join(app.get('views'), filename), 'utf8');
  return mustache.render(template, options);
}

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
  res.renderWithChrome = function(bundleName, options, titleOpt) {
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
        req.info('Rendering bundle: ' + bundleName);
        res.send(chrome({
          content: mustache.render(template,
            merge({ config_json: JSON.stringify(config.client) }, options)),
          title: titleOpt || 'Forerun',
          scripts: scripts,
          styles: styles,
          clientTemplates: clientTemplates,
          flash: flashOpt,
          logged_in: !!(req.session && req.session.api_token)
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
  res.loginRedirect = function() {
    req.info('Redirecting user to login');
    req.session = null;
    res.clearCookie('api_token');
    res.flash('error', 'Please login to view that page');
    res.redirect('/#login');
  };
  res.withUser = function(loggedInCallback, loggedOutCallback) {
    if (req.session['api_token']) {
      loggedInCallback(req.session['user'], api.Client(req.session['api_token'], req));
    } else if (loggedOutCallback) {
      req.session = null;
      loggedOutCallback();
    } else res.loginRedirect();
  };
  req.withClient = function(loggedInCallback, loggedOutCallback) {
    if (req.session.api_token) {
      loggedInCallback(api.Client(req.session.api_token, req));
    } else if (loggedOutCallback) {
      req.session = null;
      loggedOutCallback();
    } else res.loginRedirect();
  };
  req.withClientAndUser = function(loggedInCallback, loggedOutCallback) {
    req.withClient(function(client) {
    }, loggedOutCallback);
  };
  next();
});

/* XXX this whole pipeline is totally broken
app.get('/api/reference', function(req, res) {
  var docs = JSON.parse(fs.readFileSync(sourceDir('resources/docs.json'), 'utf8'));
  res.renderWithChrome('api-reference-page', { endpoints: docs.endpoints });
});
*/

app.get('/', function(req, res) {
  res.withUser(function(user, client) {
    client.thread.all(function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        if (meta.error_type == 'invalid_token') {
          res.loginRedirect();
        } else {
          if (meta.code != statusCodes.OK)
            res.flash('error', "Sorry, we couldn't get the threads list for you");
          res.renderWithChrome('home-page', { threads: response.threads || [] });
        }
      }
    });
  }, function() {
    res.renderWithChrome('splash-page', { });
  });
});

app.get('/thread/:id', function(req, res) {
  res.withUser(function(user, client) {
    client.thread.get(req.params.id, function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        if (meta.error_type == 'invalid_token') {
          res.loginRedirect();
        } else if (meta.code != statusCodes.OK) {
          res.flash('error', "Sorry, we couldn't get that thread for you");
          res.redirect('/');
        } else {
          res.renderWithChrome('thread-page', {
            thread: response.thread,
            posts: response.posts
          }, basics.maybeElide(response.thread.title) + ' - Forerun');
        }
      }
    });
  });
});

app.get('/passwordReset', function(req, res) {
  if (req.query.hasOwnProperty('handle') && req.query.hasOwnProperty('token')) {
    res.renderWithChrome('password-reset-page', {
      reset: {
        handle: req.query.handle,
        token: req.query.token,
      }
    });
  } else {
    res.renderWithChrome('password-reset-page', { reset: false });
  }
});

app.post('/passwordReset', function(req, res) {
  if (['token', 'handle', 'password'].every(curriedHas(req.body))) {
    var client = api.Client(app.get('api_token'), req);
    var password_md5 = basics.simpleMD5(req.body.password);
    client.user.passwordReset(req.body.token, req.body.handle, password_md5,
        function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        if (meta.code == 400) {
          res.flash('error', 'Invalid reset token. Try sending the email again.');
          res.redirect('/passwordReset');
        } else if (meta.code != 200) {
          res.flash('error',
            "Couldn't reset your password. Try sending the email again");
          res.redirect('/passwordReset');
        } else {
          res.flash('info', 'Your password was reset! Now you can log in.');
          res.redirect('/#login');
        }
      }
    });
  } else res.sendBadRequest();
});

app.post('/sendPasswordReset', function(req, res) {
  if (req.body.handle_or_email && req.body.handle_or_email.length >= 0) {
    var client = api.Client(app.get('api_token'), req);
    client.user.passwordResetToken(req.body.handle_or_email,
        function(err, meta, response) {
      if (err) {
        res.sendInternalServerError();
      } else {
        if (meta.code == 404) {
          res.flash('error', "No user found with that handle or email");
          res.redirect('/passwordReset');
        } else if (meta.code != 200) {
          res.flash('error', 'There was an error sending your reset link. Try again?');
          res.redirect('/passwordReset');
        } else {
          var options = {
            user: response.user,
            thanks_from: config.frontend_server.admin_real_name,
            url: config.frontend_server.url + "/passwordReset?" +
              querystring.stringify({
                token: response.token,
                handle: response.user.handle
              })
          };
          emailClient.send({
            from: config.frontend_server.from_email,
            to: [response.user.email],
            replyTo: [config.frontend_server.from_email],
            subject: 'Reset your Forerun password',
            body: {
              html: renderTemplate('email/password-reset.mustache', { html: options }),
              text: renderTemplate('email/password-reset.mustache', { text: options })
            }
          });
          res.flash('info', 'Your reset link has been sent!');
          res.redirect('/#login');
        }
      }
    });
  } else {
    res.flash('error', 'Please enter your handle or email');
    res.redirect('/passwordReset');
  }
});

app.post('/thread/new', function(req, res) {
  if (['title', 'body_markdown'].every(curriedHas(req.body))) {
    res.withUser(function(user, client) {
      client.thread.new_(req.body.title, req.body.body_markdown,
          function(err, meta, response) {
        if (err) {
          res.sendInternalServerError(err);
        } else {
          if (meta.code != statusCodes.OK) {
            if (meta.error_type == 'param_error' &&
                meta.paramErrors.some(function(err) { return err.param == 'title' })) {
              res.flash('error', 'Please provide a title for your thread');
            } else {
              res.flash('error', "Sorry, we couldn't create your thread. Try again?");
            }
            res.redirect('/');
          } else res.redirect('/thread/' + response.thread._id);
        }
      });
    });
  } else res.sendBadRequest();
});

app.post('/post/new', function(req, res) {
  if (['body_markdown', 'thread_id'].every(curriedHas(req.body))) {
    res.withUser(function(user, client) {
      client.post.new_(req.body.thread_id, req.body.body_markdown,
          function(err, meta, response) {
        if (err) {
          res.sendInternalServerError(err);
        } else {
          if (meta.code != statusCodes.OK)
            res.flash('error', "Sorry, we couldn't make your post");
          res.redirect('/thread/' + req.body.thread_id);
        }
      });
    });
  } else res.sendBadRequest();
});

(function(callback) {
  app.get('/profile', function(req, res) {
    callback(null, req, res);
  });
  app.get('/user/:handle', function(req, res) {
    callback(req.params.handle, req, res);
  });
})(function(handleOpt, req, res) {
  function render(currentUser, user, userAccessLevel) {
    var isSelf = currentUser._id == user._id;
    res.renderWithChrome('user-page', {
      user: user,
      settings: user.settings,
      readable_join_date: basics.readableDate(user.join_date),
      access_level: userAccessLevel,
      show_email: isSelf,
      can_edit_access_level: currentUser.consumer.access_level >= 3,
      can_edit_avatar: isSelf,
      avatar: user.avatar_small && { small: user.avatar_small }
    });
  }
  res.withUser(function(currentUser, client) {
    if (handleOpt) {
      client.user.find(handleOpt, function(err, meta, response) {
        if (err) {
          res.sendInternalServerError();
        } else if (meta.code != statusCodes.OK) {
          if (meta.code == statusCodes.NOT_FOUND) {
            res.flash('error', "That user doesn't seem to exist");
          } else res.flash('error', "Sorry, we couldn't get that user for you");
          res.redirect('/');
        } else render(currentUser, response.user, response.access_level);
      });
    } else render(currentUser, currentUser, currentUser.consumer.access_level);
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
    var password_md5 = basics.simpleMD5(req.body.password);
    var client = api.Client(app.get('api_token'), req);
    client.user.login(req.body.handle, password_md5,
        function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else if (meta.code != statusCodes.OK) {
        if (meta.error_type == 'login_failed') {
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
    var password_md5 = basics.simpleMD5(req.body.password);
    var client = api.Client(app.get('api_token'), req);
    client.user.new_(
        req.body.handle, req.body.email, password_md5, 0,
        function(err, meta, response) {
      if (err) {
        res.sendInternalServerError(err);
      } else if (meta.code != statusCodes.OK) {
        if (meta.error_type == 'handle_taken') {
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

app.get('/heartbeat', function(req, res) {
  res.withUser(function(user) {
    onlineUsers[user.handle] = new Date().getTime();
    res.send(Object.keys(onlineUsers));
  });
});

setInterval(function() {
  var now = new Date().getTime();
  Object.keys(onlineUsers).forEach(function(handle) {
    var timestamp = onlineUsers[handle];
    if (now - timestamp > 2000) delete onlineUsers[handle];
  });
}, 2000);

app.post('/callback', function(req, res) {
  if (req.data.type && req.data.api_secret == config.frontend_server.api_secret) {
    emitter.emit(req.data.type, req.data);
    res.send('');
  }
});

function matchesScope(data, scope) {
  return Object.keys(scope).every(function(key) {
    return scope[key] == data[key];
  });
}

io.on('error', function(err) { console.error(err); });
io.of('/posts').on('connection', function(socket) {
  socket.on('error', function(err) { console.error(err); });
  socket.once('scope', function(scope) {
    var newPostListener = function(data) {
      if (matchesScope(data.post, scope)) {
        socket.emit('new-post', data.post);
      }
    }
    emitter.on('new-post', newPostListener);
    socket.on('disconnect', function() {
      emitter.removeListener('new-post', newPostListener);
    });
  });
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

logging.init(function() {
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

      api.Client(api_token).listener.register(
          url.format({
            protocol: 'http',
            hostname: config.frontend_server.listener_hostname,
            port: config.frontend_server.listener_port,
            pathname: '/callback'
          }), function(err, meta, response) {
        if (err || meta.code != statusCodes.OK) {
          console.error("Couldn't register listener");
        }
      });
    }
  });
});

