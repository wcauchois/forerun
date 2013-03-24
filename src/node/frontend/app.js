var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mustache = require('mustache'),
    crypto = require('crypto'),
    api = require('./api.js'),
    basics = require('../common/basics.js'),
    statusCodes = require('../common/status-codes.js');

var append = basics.append;
var curriedHas = basics.curriedHas;

var app = express();

function sourceDir(name) {
  return path.join(__dirname, '../..', name);
}

var COOKIE_SECRET = 'oh you';

app.set('views', sourceDir('resources/mustache-templates'));
app.use(express.static(sourceDir('webapp')));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.cookieSession({ secret: COOKIE_SECRET }));

var chrome =
  mustache.compile(fs.readFileSync(
    path.join(app.get('views'), 'chrome.mustache'), 'utf8'));
var bundles =
  JSON.parse(fs.readFileSync(sourceDir('resources/bundles.json'), 'utf8'));

app.use(function(req, res, next) {
  res.sendBadRequest = function() {
    res.send(statusCodes.BAD_REQUEST, 'Bad request');
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
    var clientTemplates = (bundle.clientTemplates || []).map(function(t) {
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
    res.renderWithChrome('home-page', { });
  }, function() {
    res.renderWithChrome('splash-page', { });
  });
});

app.get('/profile', function(req, res) {
  res.withUser(function(user, client) {
    res.renderWithChrome('user-page', {
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
  if (req.body.handle && req.body.password) {
    var passwordMD5 = basics.createMD5Hash(req.body.password);
    app.get('client').user.login(req.body.handle, passwordMD5,
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
        api.authenticate(api_key, api_secret, function(err, apiToken) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            res.cookie('api_token', apiToken);
            req.session['api_token'] = apiToken;
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
    var passwordMD5 = basics.createMD5Hash(req.body.password);
    app.get('client').user.new_(
        req.body.handle, req.body.email, passwordMD5, 0,
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
        api.authenticate(api_key, api_secret, function(err, apiToken) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            res.cookie('api_token', apiToken);
            req.session['api_token'] = apiToken;
            req.session['user'] = response.user;
            res.redirect('/');
          }
        });
      }
    });
  } else res.sendBadRequest();
});

var API_KEY = 'hello';
var API_SECRET = 'world';

api.authenticate(API_KEY, API_SECRET, function(err, apiToken) {
  if (err) {
    console.error("Couldn't authenticate frontend server with API");
    process.exit(1);
  } else {
    app.set('client', api.Client(apiToken));
    app.listen(3000); // XXX: read port from config
    console.log('Listening on port 3000');
  }
});

