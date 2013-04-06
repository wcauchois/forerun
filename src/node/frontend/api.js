var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    events = require('events'),
    basics = require('../common/basics.js'),
    statusCodes = require('../common/status-codes.js'),
    config = require('config');

var merge = basics.merge;

function rawService(method, path, params, callback, loggerOpt) {
  var options = {
    hostname: config.frontend_server.api_hostname,
    port: config.frontend_server.api_port,
    method: method,
    path: url.format({
      pathname: path,
      query: (method == 'GET') ? params : null
    }),
    headers: { }
  };
  var data = null;
  if (method == 'POST') {
    data = querystring.stringify(params);
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.headers['Content-Length'] = data.length;
  }
  if (loggerOpt) {
    loggerOpt.info('Making API request: ' + method + ' ' + path);
    options.headers['X-Logging-Context'] = loggerOpt.loggingContext;
  }
  var req = http.request(options, function(res) {
    res.setEncoding('utf8');
    res.on('error', function(err) {
      if (loggerOpt) loggerOpt.error('HTTP error making API call: ' + err.message);
      callback(err);
    });
    res.on('readable', function() {
      var raw = res.read();
      var json = null;
      try {
        json = JSON.parse(raw);
      } catch(ex) { }
      if (json != null) {
        if (loggerOpt && (json.meta.code < 200 || json.meta.code > 299)) {
          loggerOpt.error('API error ' + json.meta.code + ' (' +
            (json.meta.error_type || 'unknown') + '): ' +
            (json.meta.error_detail || 'Unknown'));
        }
        callback(null, json.meta, json.response);
      } else {
        if (loggerOpt) loggerOpt.error('Got malformed JSON from API: ' + raw);
        callback(new Error("Malformed API response"));
      }
    });
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
    },
    find: function(handle, callback) {
      service('GET', '/user/find', {
        handle: handle
      }, callback);
    },
  };
}

function threadEndpoints(service) {
  return {
    all: function(callback) {
      service('GET', '/threads', { }, callback);
    },
    new_: function(title, body_markdown, callback) {
      service('POST', '/thread/new', {
        title: title,
        body_markdown: body_markdown
      }, callback);
    },
    get: function(id, callback) {
      service('GET', '/thread/' + id, { }, callback);
    }
  };
}

function postEndpoints(service) {
  return {
    new_: function(thread_id, body_markdown, callback) {
      service('POST', '/post/new', {
        body_markdown: body_markdown,
        thread_id: thread_id
      }, callback);
    },
    get: function(id, callback) {
      service('GET', '/post/' + id, { }, callback);
    }
  };
}

function listenerEndpoints(service) {
  return {
    register: function(endpoint, callback) {
      service('POST', '/listener/register', {
        endpoint: endpoint
      }, callback);
    }
  };
}

exports.Client = function(api_token, reqOpt) {
  function service(method, path, params, callback) {
    var newParams = merge(params, { api_token: api_token });
    rawService(method, path, newParams, callback, reqOpt);
  }
  return {
    api_token: api_token,
    user: userEndpoints(service),
    thread: threadEndpoints(service),
    post: postEndpoints(service),
    listener: listenerEndpoints(service),
    revoke: function(callback) {
      service('POST', '/revoke', { api_token: api_token }, callback);
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

