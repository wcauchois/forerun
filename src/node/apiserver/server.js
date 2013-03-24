var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mongoose = require('mongoose'),
    crypto = require('crypto'),
    statusCodes = require('../common/status-codes.js'),
    basics = require('../common/basics.js'),
    config = require('config');

var curriedHas = basics.curriedHas;
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;

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
  return /^\w(\w|\+|\.)*@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/.test(val);
}, 'Invalid email address');
userSchema.path('password_md5').validate(function(val) {
  return /^[a-f0-9]{32}$/.test(val);
}, 'Invalid password MD5');

var boardSchema = Schema({
  title: String,
  subtitle: String,
  thread_count: { type: Number, default: 0 },
  post_count: { type: Number, default: 0 },
  last_post_by: { type: String, required: false },
  last_post_date: { type: Date, required: false }
});
boardSchema.path('title').validate(function(val) {
  return val.length > 0
}, 'Must provide a board title');

var consumerSchema = Schema({
  api_key: String,
  api_secret: String,
  access_level: Number,
  user_id: { type: Schema.Types.ObjectId, required: false }
});

// Use _id.getTimestamp() to get the date at which a session was created.
var sessionSchema = Schema({
  api_token: String,
  consumer_id: Schema.Types.ObjectId,
  touch_date: { type: Date, default: Date.now }
});

var User = mongoose.model('User', userSchema);
var Consumer = mongoose.model('Consumer', consumerSchema);
var Session = mongoose.model('Session', sessionSchema);
var Board = mongoose.model('Board', boardSchema);

function renderedBoard(board) {
  var json = {
    _id: board._id.toString(),
    title: board.title,
    subtitle: board.subtitle,
    thread_count: board.thread_count,
    post_count: board.post_count,
  };
  if (board.last_post_by && board.last_post_date) {
    json.last_post = {
      by: board.last_post_by,
      date: board.last_post_date.getTime()
    };
  }
  return json;
}
function renderedConsumer(consumer) {
  var json = {
    api_key: consumer.api_key,
    api_secret: consumer.api_secret,
    access_level: consumer.access_level,
  };
  if (consumer.user_id)
    json['user_id'] = consumer.user_id.toString();
  return json;
}
function renderedUser(user, consumerOpt) {
  var json = {
    _id: user._id.toString(),
    handle: user.handle,
    email: user.email,
    join_date: user.join_date.getTime()
  };
  if (consumerOpt)
    json['consumer'] = renderedConsumer(consumerOpt);
  return json;
}
function generateTimedHash(val) {
  return crypto.createHmac('sha1', config.api_server.salt)
    .update(val)
    .update(Date.now().toString())
    .digest('base64');
}

app.use(function(req, res, next) {
  res.sendInternalServerError = function(err) {
    res.send({
      meta: {
        code: statusCodes.INTERNAL_SERVER_ERROR,
        errorType: 'server_error',
        errorDetail: (err && 'message' in err) ? err.message : 'Unknown'
      },
      response: { }
    });
  };
  res.sendInsufficientParameters = function() {
    res.send({
      meta: {
        code: statusCodes.BAD_REQUEST,
        errorType: 'insufficient_params',
        errorDetail: 'Insufficient parameters for this call'
      },
      response: { }
    });
  };
  res.sendNotAuthorized = function() {
    res.send({
      meta: {
        code: statusCodes.NOT_AUTHORIZED,
        errorType: 'not_authorized',
        errorDetail: 'You are not authorized to make this call'
      },
      response: { }
    });
  };
  res.sendValidationError = function(err) {
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
      },
      response: { }
    });
  };
  res.maybeSendValidationError = function(err) {
    if (err.name == 'ValidationError') {
      res.sendValidationError(err);
    } else res.sendInternalServerError(err);
  };
  res.withConsumer = function(callback) {
    var api_token = req.query.api_token || req.body.api_token;
    if (api_token) {
      Session.findOne({ api_token: api_token }, function(err, session) {
        if (err) {
          res.sendInternalServerError(err);
        } else if (session) {
          session.touch_date = Date.now();
          session.save(function(err) { });
          Consumer.findOne({ _id: session.consumer_id }, function(err, consumer) {
            if (err) {
              res.sendInternalServerError(err);
            } else if (consumer) {
              callback(consumer);
            } else res.sendNotAuthorized();
          });
        } else res.sendNotAuthorized();
      });
    } else res.sendNotAuthorized();
  };
  next();
});

/// <endpoint path="/revoke" method="POST">
///   <summary>
///     Revoke the current API token, ensuring that no further requests can
///     be made using it.
///   </summary>
///   <param name="api_token">The API token.</param>
///   <result>{ }</result>
/// </endpoint>
app.post('/revoke', function(req, res) {
  if (['api_token'].every(curriedHas(req.body))) {
    Session.remove({ api_token: req.body.api_token }, function(err) {
      if (err) {
        res.sendInternalServerError(err);
      } else {
        res.send({
          meta: { code: statusCodes.OK },
          response: { }
        });
      }
    });
  } else res.sendInsufficientParameters();
});

/// <endpoint path="/authenticate" method="POST">
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
app.post('/authenticate', function(req, res) {
  if (['api_key', 'api_secret'].every(curriedHas(req.body))) {
    Consumer.findOne({ api_key: req.body.api_key }, function(err, consumer) {
      if (err) {
        res.sendInternalServerError(err);
      } else if (consumer && req.body.api_secret == consumer.api_secret) {
        var newSession = new Session({
          api_token: generateTimedHash(consumer.api_key),
          consumer_id: consumer._id
        });
        newSession.save(function(err, session) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            res.send({
              meta: { code: statusCodes.OK },
              response: { api_token: session.api_token }
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
    });
  } else res.sendInsufficientParameters();
});

/// <endpoint path="/user/login" method="POST">
/// <summary>
///   Used when logging in a user, this endpoint will verify the user's handle
///   and password and, if corrrect, return the user object (with consumer).
///   Note that the notion of "logging in" does not exist on the API; you must
///   still authenticate using the consumer to gain an API token.
/// </summary>
/// <param name="handle">The user's handle.</param>
/// <param name="password_md5">An MD5 hash of the password to test.</param>
/// <param name="api_token">The API token (access level 6 required).</param>
/// <response>
/// {
///   "user": {
///     "_id": "ObjectId",
///     "handle": "String",
///     "email": "String",
///     "join_date": "Date"
///     "consumer": {
///       "api_key": "String",
///       "api_secret": "String",
///       "access_level": "Number"
///     }
///   }
/// }
/// </response>
/// </endpoint>
app.post('/user/login', function(req, res) {
  if (['handle', 'password_md5'].every(curriedHas(req.body))) {
    res.withConsumer(function(consumer) {
      if (consumer.access_level >= 6) {
        User.findOne({ handle: req.body.handle }, function(err, user) {
          if (err) {
            res.sendInternalServerError(err);
          } else if (user) {
            if (user.password_md5 == req.body.password_md5) {
              Consumer.findOne({ _id: user.consumer_id }, function(err, consumer) {
                if (err) {
                  res.sendInternalServerError(err);
                } else if (consumer) {
                  res.send({
                    meta: { code: statusCodes.OK },
                    response: { user: renderedUser(user, consumer) }
                  });
                } else {
                  res.sendInternalServerError(new Error("Couldn't find consumer"));
                }
              });
            } else {
              res.send({
                meta: {
                  code: statusCodes.BAD_REQUEST,
                  errorType: 'login_failed',
                  errorDetail: 'The password was incorrect'
                },
                response: { }
              });
            }
          } else {
            res.send({
              meta: {
                code: statusCodes.BAD_REQUEST,
                errorType: 'login_failed',
                errorDetail: 'No user with that handle exists'
              },
              response: { }
            });
          }
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

/// <endpoint path="/user/new" method="POST">
/// <summary>
///   Create a new user, along with an associated consumer.
/// </summary>
/// <param name="handle">The handle this user will go by.</param>
/// <param name="email">The email of the new user.</param>
/// <param name="password_md5">An MD5 hash of the desired password.</param>
/// <param name="access_level">The desired access level for the new user.</param>
/// <param name="api_token">The API token (access level 6 required).</param>
/// <response>
/// {
///   "user": {
///     "_id": "ObjectId",
///     "handle": "String",
///     "email": "String",
///     "join_date": "Date"
///     "consumer": {
///       "api_key": "String",
///       "api_secret": "String",
///       "access_level": "Number"
///     }
///   }
/// }
/// </response>
/// </endpoint>
app.post('/user/new', function(req, res) {
  if (['handle', 'email', 'password_md5'].every(curriedHas(req.body))) {
    res.withConsumer(function(consumer) {
      if (consumer.access_level >= 6) {
        User.find({ handle: req.body.handle }, function(err, users) {
          if (err) {
            res.sendInternalServerError(err);
          } else if (users.length > 0) {
            res.send({
              meta: {
                code: statusCodes.BAD_REQUEST,
                errorType: 'handle_taken',
                errorDetail: 'That handle has been taken'
              },
              response: { }
            });
          } else {
            var newConsumer = new Consumer({
              api_key: generateTimedHash(req.body.handle),
              api_secret: generateTimedHash(req.body.password_md5),
              access_level:
                Math.min(consumer.access_level, req.body.access_level || 0)
            });
            newConsumer.save(function(err, consumer) {
              if (err) {
                res.sendInternalServerError(err);
              } else {
                var newUser = new User({
                  handle: req.body.handle,
                  email: req.body.email,
                  password_md5: req.body.password_md5,
                  consumer_id: consumer._id
                });
                newUser.save(function(err, user) {
                  if (err) {
                    res.maybeSendValidationError(err);
                  } else {
                    res.send({
                      meta: { code: statusCodes.OK },
                      response: { user: renderedUser(user, consumer) }
                    });
                  }
                });
              }
            });
          }
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

app.post('/board/new', function(req, res) {
  if (['title', 'subtitle'].every(curriedHas(req.body))) {
    res.withConsumer(function(consumer) {
      if (consumer.access_level >= 0) {
        var newBoard = new Board({
          title: req.body.title,
          subtitle: req.body.subtitle
        });
        newBoard.save(function(err, board) {
          if (err) {
            res.maybeSendValidationError(err);
          } else {
            res.send({
              meta: { code: statusCodes.OK },
              response: { board: renderedBoard(board) }
            });
          }
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

app.get('/boards', function(req, res) {
  res.withConsumer(function(consumer) {
    if (consumer.access_level >= 0) {
      Board.find({ }, function(err, boards) {
        if (err) {
          res.sendInternalServerError(err);
        } else {
          res.send({
            meta: { code: statusCodes.OK },
            response: { boards: boards.map(renderedBoard) }
          });
        }
      });
    } else res.sendNotAuthorized();
  });
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
  app.listen(config.api_server.port);
  console.log('Listening on port ' + config.api_server.port);
});
