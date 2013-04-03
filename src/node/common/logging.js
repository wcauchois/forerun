var mongoose = require('mongoose'),
    config = require('config'),
    crypto = require('crypto'),
    logdata = require('./logdata.js');

var Log = null;

exports.init = function(callback) {
  var db = mongoose.createConnection(config.logging.db_url);
  db.on('error', function(err) {
    console.error(err);
    process.exit(1);
  });
  db.once('open', function() {
    Log = db.model('Log', logdata.schema);
    callback();
  });
};

var settings = { };
exports.set = function(key, value) { settings[key] = value; };

function logLevel(level, contextOpt) {
  return function(message, extraOpt) {
    if (!Log) {
      console.error("Logging isn't initialized!");
      return;
    }
    var doc = new Log({
      server: settings['server'] || 'unkown',
      level: level,
      context: contextOpt,
      message: message,
      extra: (typeof extraOpt == 'object') ? JSON.stringify(extraOpt) : extraOpt
    });
    doc.save(function(err) {
      if (err) console.error('Error while saving log: ' + err.message);
    });
    var consoleWriter = (level == 'error') ? console.error : console.log;
    consoleWriter('[' + level + '] ' + message);
  };
}

exports.extendRequest = function() {
  return function(req, res, next) {
    if (req.get('X-Logging-Context')) {
      req.loggingContext = req.get('X-Logging-Context');
    } else {
      req.loggingContext = crypto.createHash('md5')
        .update(req.path).update(req.ip).update(Date.now().toString())
        .digest('hex');
    }
    req.error = logLevel('error', req.loggingContext);
    req.info = logLevel('info', req.loggingContext);
    req.info(req.method.toUpperCase() + ' ' + req.path, {
      ip: req.get('X-Real-IP') || req.ip,
      query: req.query
    });
    next();
  };
};

exports.Log = {
  error: logLevel('error'),
  info: logLevel('info')
};

