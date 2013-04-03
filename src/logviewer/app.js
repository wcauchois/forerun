var express = require('express'),
    http = require('http'),
    mustache = require('mustache'),
    path = require('path'),
    fs = require('fs'),
    config = require('config'),
    mongoose = require('mongoose'),
    basics = require('../node/common/basics.js'),
    logdata = require('../node/common/logdata.js');

var app = express();
var page = mustache.compile(
  fs.readFileSync(path.join(__dirname, 'page.mustache'), 'utf8'));
var Log = mongoose.model('Log', logdata.schema);

app.get('/', function(req, res) {
  var select = { };
  if (req.query.level) select.level = req.query.level;
  Log.find(select)
      .sort({ _id: -1 })
      .limit(500)
      .exec(function(err, logs) {
    if (err) {
      console.error(err);
      res.send(500);
    } else {
      res.send(page({ logs: logs.map(function(log) {
        var logDate = new Date(log._id.getTimestamp());
        function padZeroes(n) {
          return (n < 10) ? ('0' + n) : ('' + n);
        }
        return basics.merge(log, {
          context_snippet: log.context.substring(0, 4),
          timestamp_string: ''+logDate.getFullYear()+'-'+
            padZeroes(logDate.getMonth())+'-'+
            padZeroes(logDate.getDate())+' '+logDate.getHours()+':'+
            logDate.getMinutes()+':'+logDate.getSeconds()
        });
      }) }));
    }
  });
});

mongoose.connect(config.logging.db_url);
var db = mongoose.connection;
db.on('error', function(err) {
  console.error(err);
  process.exit(1);
});
db.once('open', function() {
  app.listen(config.log_viewer.port);
  console.log('Listening on port ' + config.log_viewer.port);
});

