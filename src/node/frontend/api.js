var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    events = require('events'),
    basics = require('../common/basics.js'),
    statusCodes = require('../common/status-codes.js');

var merge = basics.merge;

var API_HOSTNAME = 'localhost';
var API_PORT = 4000;

function rawService(method, path, params, callback) {
  var options = {
    hostname: API_HOSTNAME,
    port: API_PORT,
    method: method,
    path: url.format({
      pathname: path,
      query: (method == 'GET') ? params : null
    }),
    headers: {}
  };
  var data = null;
  if (method == 'POST') {
    data = querystring.stringify(params);
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.headers['Content-Length'] = data.length;
  }
  var req = http.request(options, function(res) {
    if (res.statusCode == statusCodes.OK) {
      res.setEncoding('utf8');
      res.on('readable', function() {
        var raw = res.read();
        var json = null;
        try {
          json = JSON.parse(raw);
        } catch(_) { }
        if (json != null) {
          callback(null, json.meta, json.response);
        } else callback(new Error("Malformed response"));
      });
    } else callback(new Error("API server returned a " + res.statusCode));
  });
  req.on('error', function(err) { callback(err); });
  if (data) req.write(data);
  req.end();
}

function userEndpoints(service) {
  return {
    new_: function(handle, email, passwordMD5, accessLevel, callback) {
      service('POST', '/user/new', {
        handle: handle,
        email: email,
        password_md5: passwordMD5,
        access_level: accessLevel
      }, callback);
    },
    login: function(handle, passwordMD5, callback) {
      service('POST', '/user/login', {
        handle: handle,
        password_md5: passwordMD5
      }, callback);
    }
  };
}

function boardEndpoints(service) {
  return {
    all: function(callback) {
      service('GET', '/boards', { }, callback);
    },
    new: function(title, subtitle, callback) {
      service('POST', '/board/new', {
        title: title,
        subtitle: subtitle
      }, callback);
    }
  };
}

exports.Client = function(apiToken) {
  function service(method, path, params, callback) {
    var newParams = merge(params, { api_token: apiToken });
    rawService(method, path, newParams, callback);
  }
  return {
    apiToken: apiToken,
    user: userEndpoints(service),
    board: boardEndpoints(service),
    revoke: function(callback) {
      service('POST', '/revoke', { api_token: apiToken }, callback);
    }
  };
};

exports.authenticate = function(api_key, api_secret, callback) {
  rawService('POST', '/authenticate', {
    api_key: api_key,
    api_secret: api_secret
  }, function(err, meta, response) {
    if (err || meta.code != 200) {
      callback(new Error("Failed to authenticate"));
    } else callback(null, response.api_token);
  });
}

