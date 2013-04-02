var mongoose = require('mongoose'),
    config = require('config'),
    crypto = require('crypto');

var Log = require('./logschema.js').Log;

exports.init = function(callback) {
  mongoose.connect(config.logging.db_url);
  var db = mongoose.connection;
  db.on('error', function(err) {
    console.error(err);
    process.exit(1);
  });
  db.once('open', function() {
    callback();
  });
}

var settings = { };
exports.set = function(key, value) { settings[key] = value; };

function logLevel(level, contextOpt) {
  return function(message, extraOpt) {
    var doc = new Log({
      server: settings['server'] || 'unkown',
      level: level,
      context: contextOpt,
      message: message,
      extra: (typeof extraOpt == 'object') ? JSON.stringify(extraOpt) : extraOpt
    });
    doc.save(function(err) {
      if (err) console.log('[error] (while saving log) ' + err.message);
    });
    var consoleWriter = (level == 'error') ? console.error : console.log;
    consoleWriter('[' + level + '] ' + message);
  };
}

exports.extendRequest = function() {
  return function(req, res, next) {
    var context = crypto.createHash('md5')
      .update(req.path)
      .update(req.ip)
      .update(Date.now().toString())
      .digest('hex');
    req.error = logLevel('error', context);
    req.info = logLevel('info', context);
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

