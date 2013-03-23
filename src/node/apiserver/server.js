var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mongoose = require('mongoose'),
    crypto = require('crypto');

var statusCodes = require('../common/status-codes.js');

var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;

var API_SALT = 'billybob';

var app = express();
app.use(express.bodyParser());

var userSchema = Schema({
  handle: String,
  email: String,
  password_md5: String,
  join_date: { type: Date, default: Date.now },
  consumer_id: Schema.Types.ObjectId
});
userSchema.path('handle').validate(function(val) {
  return /^\w+$/.test(val);
}, 'Can only contain letters, numbers, and underscores');
userSchema.path('email').validate(function(val) {
  return /^\w(\w|\+)*@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/.test(val);
}, 'Invalid email address');
userSchema.path('password_md5').validate(function(val) {
  return /^[a-f0-9]{32}$/.test(val);
}, 'Invalid password MD5');

var consumerSchema = Schema({
  api_key: String,
  api_secret: String,
  access_level: Number,
  user_id: { type: Schema.Types.ObjectId, required: false }
});

var sessionSchema = Schema({
  api_token: String,
  consumer_id: Schema.Types.ObjectId
});

var User = mongoose.model('User', userSchema);
var Consumer = mongoose.model('Consumer', consumerSchema);
var Session = mongoose.model('Session', sessionSchema);

function renderedConsumer(consumer) {
  var json = {
    api_key: consumer.api_key,
    api_secret: consumer.api_secret,
    access_level: consumer.access_level,
  };
  if (consumer.user_id)
    json['user_id'] = consumer.user_id;
  return json;
}
function renderedUser(user) {
  return {
    handle: user.handle,
    email: user.email,
    join_date: user.join_date.toString()
  };
}
function renderedSession(session) {
  return { api_token: session.api_token };
}
function generateTimedHash(val) {
  return crypto.createHmac('sha1', API_SALT)
    .update(val)
    .update(Date.now().toString())
    .digest('base64');
}
function sendInternalServerError(res, err) {
  res.send({
    meta: {
      code: statusCodes.INTERNAL_SERVER_ERROR,
      errorType: 'server_error',
      errorDetail: (err && 'message' in err) ? err.message : 'Unknown'
    }
  });
}
function sendNotAuthorized(res) {
  res.send({
    meta: {
      code: statusCodes.NOT_AUTHORIZED,
      errorType: 'not_authorized',
      errorDetail: 'You are not authorized to make this call'
    }
  });
}
function sendValidationError(res, err) {
  res.send({
    meta: {
      code: statusCodes.BAD_REQUEST,
      errorType: 'param_error',
      errorDetail: 'Invalid parameters',
      paramErrors: Object.keys(err.errors).map(function(param) {
        return {
          param: param,
          message: err.errors[param].type,
          value: err.errors[param].value
        };
      })
    }
  });
}
function maybeSendValidationError(res, err) {
  ((err.name == 'ValidationError') ?
    sendValidationError : sendInternalServerError)(res, err);
}
function authorized(adminAccessLevel, baseAccessLevel) {
  return function(apiToken, userId, callback) {
    Session.findOne({ api_token: apiToken }, function(err, session) {
      if (err) {
        callback(err);
      } else {
        Consumer.findOne({ _id: session.consumer_id }, function(err, consumer) {
          if (err) {
            callback(err);
          } else {
            // If they have administrative privileges in this domain, we let them
            // do what they want.
            if (consumer.access_level >= adminAccessLevel) {
              callback(null, consumer);
            // If they're a regular user, then (if this is a user-specific action)
            // ensure that they're operating on themselves.
            } else if (consumer.access_level >= baseAccessLevel &&
                (user_id == null || consumer.user_id == new ObjectId(userId))) {
              callback(null, consumer);
            } else callback(null, null);
          }
        });
      }
    });
  };
}

/// <endpoint path="/session/revoke" method="POST" requires_token="true">
///   <summary>
///     Revoke the current API token, ensuring that no further requests can
///     be made using it.
///   </summary>
/// </endpoint>
app.post('/session/revoke', function(req, res) {
  Session.remove({ api_token: req.body.api_token }, function(err) {
    if (err) {
      sendInternalServerError(res, err);
    } else {
      res.send({
        meta: { code: statusCodes.OK },
        response: { }
      });
    }
  });
});

/// <endpoint path="/session/authenticate" method="POST" requires_token="false">
///   <summary>
///     Authenticate using an API key and secret, returning an API token
///     that may be used in subsequent API calls.
///   </summary>
///   <param name="api_key">
///     The API key that identifies the consumer you wish to authenticate.
///   </param>
///   <param name="api_secret">
///     The API secret for the consumer identified by that key.
///   </param>
///   <response>
///     { "session": { "api_token": "String" } }
///   </response>
/// </endpoint>
app.post('/session/authenticate', function(req, res) {
  Consumer.findOne({ api_key: req.body.api_key }, function(err, consumer) {
    if (err) {
      sendInternalServerError(res, err);
    } else {
      if (req.body.api_secret == consumer.api_secret) {
        var newSession = new Session({
          api_token: generateTimedHash(consumer.api_key),
          consumer_id: consumer._id
        });
        newSession.save(function(err, session) {
          if (err) {
            sendInternalServerError(res, err);
          } else {
            res.send({
              meta: { code: statusCodes.OK },
              response: { session: renderedSession(session) }
            });
          }
        });
      } else {
        res.send({
          meta: {
            code: statusCodes.NOT_AUTHORIZED,
            errorType: 'authentication_failed',
            errorDetail: 'Failed to authenticate'
          },
          response: { }
        });
      }
    }
  });
});

app.post('/user/login', function(req, res) {
});

/// <endpoint path="/user/new" method="POST" requires_token="true">
/// <summary>
///   Create a new user.
/// </summary>
/// <param name="handle">The handle this user will go by.</param>
/// <param name="email">The email of the new user.</param>
/// <param name="password_md5">An MD5 hash of the desired password.</param>
/// <response>
/// {
///   "user": {
///     "handle": "String",
///     "email": "String",
///     "join_date": "Date"
///   },
///   "consumer": {
///     "api_key": "String",
///     "api_secret": "String",
///     "access_level": "Number"
///   }
/// }
/// </response>
/// </endpoint>
app.post('/user/new', function(req, res) {
  authorized(6)(req.body.api_token, null, function(err, consumer) {
    if (err) {
      sendInternalServerError(res, err);
    } else if (consumer) {
      User.find({ handle: req.body.handle }, function(err, users) {
        if (err) {
          sendInternalServerError(res, err);
        } else if (users.length > 0) {
          res.send({
            meta: {
              code: statusCodes.BAD_REQUEST,
              errorType: 'param_error',
              errorDetail: 'Handle taken',
              paramErrors: [{
                param: 'handle',
                message: 'There is already a user with that handle',
                value: req.body.handle
              }]
            },
            response: { }
          });
        } else {
          var newConsumer = new Consumer({
            api_key: generateTimedHash(req.body.handle),
            api_secret: generateTimedHash(req.body.password_md5),
            access_level: Math.min(consumer.access_level, req.body.access_level || 0)
          });
          newConsumer.save(function(err, consumer) {
            if (err) {
              sendInternalServerError(res, err);
            } else {
              var newUser = new User({
                handle: req.body.handle,
                email: req.body.email,
                password_md5: req.body.password_md5,
                consumer_id: consumer._id
              });
              newUser.save(function(err, user) {
                if (err) {
                  maybeSendValidationError(res, err);
                } else {
                  res.send({
                    meta: { code: statusCodes.OK },
                    response: {
                      user: renderedUser(user),
                      consumer: renderedConsumer(consumer)
                    }
                  });
                }
              });
            }
          });
        }
      });
    } else sendNotAuthorized(res);
  });
});

mongoose.connect('mongodb://localhost/forerun');
var db = mongoose.connection;
db.on('error', function(err) {
  console.error(err);
  process.exit(1);
});
db.once('open', function() {
  app.listen(4000);
});
