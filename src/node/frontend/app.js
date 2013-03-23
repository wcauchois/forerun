var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mustache = require('mustache'),
    crypto = require('crypto');
var apiClient = require('./api-client.js'),
    base = require('../common/base.js');

var app = express();

function sourceDir(name) {
  return path.join(__dirname, '../..', name);
}

app.set('views', sourceDir('resources/mustache-templates'));
app.use(express.static(sourceDir('webapp')));
app.use(express.bodyParser());

var chrome =
  mustache.compile(fs.readFileSync(
    path.join(app.get('views'), 'chrome.mustache'), 'utf8'));
var bundles =
  JSON.parse(fs.readFileSync(sourceDir('resources/bundles.json'), 'utf8'));

function createMD5Hash(val) {
  return crypto.createHash('md5').update(val).digest('hex');
}
function sendInternalServerError(res, err) {
  res.send(500, (err && 'message' in err) ? err.message : 'Unknown');
}
function renderWithChrome(res, bundleName, values, title) {
  var bundle = bundles[bundleName];
  var templatePath = path.join(app.get('views'), bundle.template);
  var scripts = 
    base.append(bundles['root'].scripts, bundle.scripts || []).map(function(p) {
      return { path: p };
    });
  var styles =
    base.append(bundles['root'].styles, bundle.styles || []).map(function(p) {
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
  fs.readFile(templatePath, 'utf8', function(err, template) {
    if (err) {
      sendInternalServerError(res, err);
    } else {
      res.send(chrome({
        content: mustache.render(template, values),
        title: title || "Forerun",
        scripts: scripts,
        styles: styles,
        clientTemplates: clientTemplates
      }));
    }
  });
}

app.get('/api/reference', function(req, res) {
  var docs = JSON.parse(fs.readFileSync(sourceDir('resources/docs.json'), 'utf8'));
  renderWithChrome(res, 'api-reference-page', { endpoints: docs.endpoints });
});

app.get('/', function(req, res) {
  renderWithChrome(res, 'splash-page', { });
});

app.get('/signup', function(req, res) {
  renderWithChrome(res, 'signup-page', { });
});

app.post('/signup', function(req, res) {
  var passwordMD5 = createMD5Hash(req.body.password);
  app.get('client').user.new_(
      req.body.handle, req.body.email, passwordMD5, function(err, meta, response) {
  });
});

var API_KEY = 'hello';
var API_SECRET = 'world';

apiClient.authenticate(API_KEY, API_SECRET, function(err, client) {
  if (err) {
    console.error("Couldn't authenticate frontend server with API");
    process.exit(1);
  } else {
    app.set('client', client);
    app.listen(3000); // XXX: read port from config
    console.log('Listening on port 3000');
  }
});

