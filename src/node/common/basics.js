var crypto = require('crypto');

exports.append = function(first, second) {
  var result = [];
  first.forEach(function(elem) { result.push(elem); });
  second.forEach(function(elem) { result.push(elem); });
  return result;
}

exports.merge = function(left, right) {
  var result = {};
  for (var attr in left) result[attr] = left[attr];
  for (var attr in right) result[attr] = right[attr];
  return result;
}

exports.curriedHas = function(obj) {
  return function(key) {
    return obj.hasOwnProperty(key);
  }
}
exports.createMD5Hash = function(val) {
  return crypto.createHash('md5').update(val).digest('hex');
}

