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
function renderWithChrome(res, bundleName, values) {
  var bundle = bundles[bundleName];
  var templatePath = path.join(app.get('views'), bundle.template);
  function pathify(resources) {
    return resources.map(function(r) { return { path: r }; });
  }
  fs.readFile(templatePath, 'utf8', function(err, template) {
    if (!err) {
      res.send(chrome({
        content: mustache.render(template, values),
        title: bundle.title,
        scripts: pathify(base.append(bundle.scripts || [], bundles['root'].scripts)),
        styles: pathify(base.append(bundle.styles || [], bundles['root'].styles))
      }));
    } else res.send(500);
  });
}

app.get('/api/reference', function(req, res) {
  var docs = JSON.parse(fs.readFileSync(sourceDir('resources/docs.json'), 'utf8'));
  renderWithChrome(res, 'api-reference-page', { endpoints: docs.endpoints });
});

app.get('/', function(req, res) {
  renderWithChrome(res, 'home-page', { });
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

