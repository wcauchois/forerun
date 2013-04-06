var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mongoose = require('mongoose'),
    crypto = require('crypto'),
    statusCodes = require('../common/status-codes.js'),
    basics = require('../common/basics.js'),
    config = require('config'),
    events = require('events'),
    url = require('url'),
    http = require('http'),
    logging = require('../common/logging.js'),
    async = require('async'),
    model = require('./model.js');

var User = model.User,
    Consumer = model.Consumer,
    Session = model.Session,
    Thread = model.Thread,
    Post = model.Post,
    Listener = model.Listener;
var merge = basics.merge,
    generateTimedHash = basics.generateTimedHash,
    passThrough = basics.passThrough;
var ApiError = require('./apiError.js').ApiError;

var app = express();

app.use(logging.extendRequest());
logging.set('server', 'api');

app.use(express.bodyParser());
app.use(function(req, res, next) {
  // http://www.w3.org/TR/access-control/
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

// Used for all app events -- such as adding a user, post, or thread.
var emitter = new events.EventEmitter();

function extractMentions(doc) {
  return doc.match(/@\w+/g);
}

app.use(function(req, res, next) {
  res.error = (function(err) {
    var code, type;
    if (err.code && err.type) {
      code = err.code;
      type = err.type;
    } else {
      code = 500;
      type = 'server_error';
    }
    res.send(code, {
      meta: {
        code: code,
        error_type: type,
        error_detail: (err && err.message) ? err.message : 'Unknown'
      },
      response: { }
    });
  }).bind(res);
  res.handle = (function(err, response) {
    if (err) {
      this.error(err);
    } else {
      this.send(200, {
        meta: { code: 200 },
        response: response || { }
      });
    }
  }).bind(res);
  req.ensureParameters = function() {
    var required = Array.prototype.slice.call(arguments);
    return (function(callback) {
      var bodyKeys = Object.keys(this.body), queryKeys = Object.keys(this.query);
      var obj = (bodyKeys.length > queryKeys.length) ? this.body : this.query;
      if(required.every(obj.hasOwnProperty.bind(obj))) {
        callback(null);
      } else {
        var missing = [];
        required.forEach(function(param) {
          if (!obj.hasOwnProperty(param)) missing.push(param);
        });
        var message = 'Missing params: ' + missing.join(', ');
        callback(ApiError.insufficientParams(message));
      }
    }).bind(this);
  };
  req.withConsumer = (function(minAccessLevel) {
    return (function(callback) {
      var api_token = this.query.api_token || this.body.api_token;
      if (api_token) {
        async.waterfall([
          function(callback) {
            Session.findOne({ api_token: api_token }, callback);
          },
          function(session, callback) {
            if (session) {
              Consumer.findOne({ _id: session.consumer_id }, callback);
            } else callback(ApiError.invalidToken());
          },
          function(consumer, callback) {
            if (consumer) {
              if (minAccessLevel == null || consumer.access_level >= minAccessLevel) {
                callback(null, consumer);
              } else callback(ApiError.accessLevelTooLow());
            } else callback(ApiError.invalidToken());
          }
        ], callback);
      } else callback(ApiError.invalidToken());
    }).bind(this);
  }).bind(req);
  req.withConsumerAndUser = (function(minAccessLevel) {
    return (function(callback) {
      async.waterfall([
        this.withConsumer(minAccessLevel),
        function(consumer, callback) {
          User.findOne({ consumer_id: consumer._id }, passThrough(callback, consumer));
        },
        function(consumer, user, callback) {
          if (user) {
            callback(null, consumer, user);
          } else callback(ApiError.invalidToken());
        }
      ], callback);
    }).bind(this);
  }).bind(req);

  next();
});

app.post('/revoke', function(req, res) {
  async.waterfall([
    req.ensureParameters('api_token'),
    function(callback) {
      Session.remove({ api_token: req.body.api_token }, callback);
    }
  ], res.handle);
});

app.post('/authenticate', function(req, res) {
  async.waterfall([
    req.ensureParameters('api_key', 'api_secret'),
    function(callback) {
      Consumer.findOne({ api_key: req.body.api_key }, callback);
    },
    function(consumer, callback) {
      if (consumer && req.body.api_secret == consumer.api_secret) {
        var newSession = new Session({
          api_token: generateTimedHash(consumer.api_key),
          consumer_id: consumer._id
        });
        newSession.save(callback);
      } else callback(ApiError.authFailed());
    },
    function(session, n, callback) {
      callback(null, { api_token: session.api_token });
    }
  ], res.handle);
});

require('./userEndpoints.js')(app, emitter);
require('./threadEndpoints.js')(app, emitter);
require('./postEndpoints.js')(app, emitter);
require('./listenerEndpoints.js')(app, emitter);

function callListeners(data) {
  Listener.find({ }, function(err, listeners) {
    if (!err) {
      listeners.forEach(function(listener) {
        Consumer.findOne({ _id: listener.consumer_id }, function(err, consumer) {
          if (!err && consumer) {
            var options = url.parse(listener.endpoint);
            options['method'] = 'POST';
            var req = http.request(options, function(res) {
              // TODO we're gonna wanna track failures and back off
              res.on('readable', function() { res.read(); });
            });
            req.on('error', function(err) { console.error(err); });
            req.write(JSON.stringify(
              merge(data, { api_secret: consumer.api_secret })));
            req.end();
          }
        });
      });
    }
  });
}

emitter.on('new-thread', function(thread) {
  callListeners({
    type: 'new-thread',
    thread: Thread.render(thread)
  });
});
emitter.on('new-post', function(post) {
  callListeners({
    type: 'new-post',
    post: Post.render(post)
  });
  /*
  extractMentions(post.body_html).forEach(function(mention) {
    User.findOne({ handle: mention }, function(err, mentionedUser) {
      if (!err && mentionedUser) {
        callListeners({
          type: 'notification',
          notification: {
            type: 'mention',
            by_user: { id: post.user_id, handle: post.user_handle },
            target_user: { id: mentionedUser._id, handle: mentionedUser.handle }
          }
        });
      }
    });
  });
  */
});

mongoose.connect(config.api_server.db_url);
var db = mongoose.connection;
db.on('error', function(err) {
  console.error(err);
  process.exit(1);
});
db.once('open', function() {
  if (config.frontend_server) {
    // Ensure that the frontend server is authorized to access us
    Consumer.findOne({ api_key: config.frontend_server.api_key },
        function(err, consumer) {
      if (!err) {
        if (consumer) {
          if (consumer.api_secret != config.frontend_server.api_secret) {
            consumer.api_secret = config.frontend_server.api_secret;
            consumer.save();
            console.log('Updated frontend consumer');
          }
        } else {
          (new Consumer({
            api_key: config.frontend_server.api_key,
            api_secret: config.frontend_server.api_secret,
            access_level: 6
          })).save();
          console.log('Created frontend consumer');
        }
      }
    });
  }
  logging.init(function() {
    app.listen(config.api_server.port);
    console.log('Listening on port ' + config.api_server.port);
  });
});

