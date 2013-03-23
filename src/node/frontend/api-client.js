var http = require('http'),
    url = require('url'),
    querystring = require('querystring');
var base = require('../common/base.js');

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
  });
  req.on('error', function(err) { callback(err); });
  if (data) {
    req.write(data);
    req.end();
  }
}

function sessionEndpoints(service) {
  return {
    revoke: function(callback) {
    }
  };
}

function authenticatedClient(apiToken) {
  function service(method, path, params, callback) {
    var newParams = base.merge(params, { api_token: apiToken });
    rawService(method, path, newParams, callback);
  }
  return {
    apiToken: apiToken,
    session: sessionEndpoints(service)
  };
};

exports.fromToken = authenticatedClient

exports.authenticate = function(api_key, api_secret, callback) {
  rawService('POST', '/authenticate', {
    api_key: api_key,
    api_secret: api_secret
  }, function(err, meta, response) {
    if (err || meta.code != 200) {
      callback(new Error("Failed to authenticate"));
    } else callback(null, authenticatedClient(response.api_token));
  });
}

