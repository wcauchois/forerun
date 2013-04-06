var crypto = require('crypto'),
    config = require('config');

exports.append = function(first, second) {
  var result = [];
  first.forEach(function(elem) { result.push(elem); });
  second.forEach(function(elem) { result.push(elem); });
  return result;
};

exports.merge = function(left, right) {
  var result = {};
  for (var attr in left) result[attr] = left[attr];
  for (var attr in right) result[attr] = right[attr];
  return result;
};

exports.curriedHas = function(obj) {
  return function(key) {
    return key in obj;
  }
};

exports.simpleMD5 = function(val) {
  return crypto.createHash('md5').update(val).digest('hex');
};

exports.readableDate = function(instant) {
  var d = new Date(instant);
  return '' + (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
};

// http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
exports.escapeRegex = function(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

exports.passThrough = function(callback) {
  var outerArguments = Array.prototype.slice.call(arguments, 1);
  return function(err) {
    if (err) {
      callback(err);
    } else {
      var args = [null];
      function pushArg(arg) { args.push(arg); }
      outerArguments.forEach(pushArg);
      Array.prototype.slice.call(arguments, 1).forEach(pushArg);
      callback.apply(null, args);
    }
  };
}

// Used to generate API keys and secrets
exports.generateTimedHash = function(val) {
  return crypto.createHash('md5')
    .update(config.api_server.salt)
    .update(Date.now().toString())
    .update(val)
    .digest('hex');
}

