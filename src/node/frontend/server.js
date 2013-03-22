var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mustache = require('mustache');

var app = express();

function sourceDir(name) {
  return path.join(__dirname, '../..', name);
}

function merge(left, right) {
  var result = {};
  for (var attr in left) result[attr] = left[attr];
  for (var attr in right) result[attr] = right[attr];
  return result;
}

function append(first, second) {
  var result = [];
  first.forEach(function(elem) { result.push(elem); });
  second.forEach(function(elem) { result.push(elem); });
  return result;
}

app.set('views', sourceDir('resources/mustache-templates'));
app.use(express.static(sourceDir('webapp')));

var chromeTemplate =
  fs.readFileSync(path.join(app.get('views'), 'chrome.mustache'), 'utf8');
var chrome =
  mustache.compile(fs.readFileSync(
    path.join(app.get('views'), 'chrome.mustache'), 'utf8'));
var bundles =
  JSON.parse(fs.readFileSync(sourceDir('resources/bundles.json'), 'utf8'));

app.engine('mu', function(path, options, callback) {
  fs.readFile(path, 'utf8', function(err, template) {
    if (err) {
      callback(err);
    } else callback(null, mustache.render(template, options));
  });
});


function renderWithChrome(res, bundleName, values) {
  var bundle = bundles[bundleName];
  var templatePath = path.join(app.get('views'), bundle.template);
  function pathify(resources) {
    return resources.map(function(r) { return {path: r}; });
  }
  fs.readFile(templatePath, 'utf8', function(err, template) {
    if (!err) {
      var body = mustache.render(template, values);
      res.send(chrome({
        body: body,
        title: bundle.title,
        scripts: pathify(append(bundle.scripts, bundles['root'].scripts)),
        styles: pathify(append(bundle.styles, bundles['root'].styles))
      }));
    } else res.send(500);
  });
}

app.get('/', function(req, res) {
  renderWithChrome(res, 'home-page', {});
});

app.listen(3000); // XXX: read port from config
console.log('Listening on port 3000');

