var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    mongoose = require('mongoose'),
    crypto = require('crypto'),
    statusCodes = require('../common/status-codes.js'),
    basics = require('../common/basics.js'),
    config = require('config'),
    events = require('events'),
    url = require('url');

var curriedHas = basics.curriedHas,
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

var app = express();
app.use(express.bodyParser());

// Used for all app events -- such as adding a user, post, or thread.
var emitter = new events.EventEmitter();

var userSchema = Schema({
  handle: String,
  email: String,
  password_md5: String,
  join_date: { type: Date, default: Date.now },
  consumer_id: ObjectId
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

var threadSchema = Schema({
  title: String,
  user_handle: String,
  user_id: ObjectId,
  reply_count: { type: Number, default: 0 },
  last_post_author: { type: String, required: false },
  last_post_date: { type: Date, required: false }
});
threadSchema.path('title').validate(function(val) {
  return val.length > 0;
}, 'Must provide a thread title');

var postSchema = Schema({
  body_html: String,
  user_handle: String,
  user_id: ObjectId,
  thread_id: ObjectId
});
postSchema.path('body_html').validate(function(val) {
  return val.length > 0;
}, 'Must provide a post body');

var consumerSchema = Schema({
  api_key: String,
  api_secret: String,
  access_level: Number,
});

// Use _id.getTimestamp() to get the date at which a session was created.
var sessionSchema = Schema({
  api_token: String,
  consumer_id: ObjectId,
  touch_date: { type: Date, default: Date.now }
});

var streamReceiverSchema = Schema({
  consumer_id: ObjectId,
  endpoint: String,
});

var User = mongoose.model('User', userSchema);
var Consumer = mongoose.model('Consumer', consumerSchema);
var Session = mongoose.model('Session', sessionSchema);
var Thread = mongoose.model('Thread', threadSchema);
var Post = mongoose.model('Post', postSchema);
var StreamReceiver = mongoose.model('StreamReceiver', streamReceiverSchema);

function renderedPost(post) {
  return {
    _id: post._id.toString(),
    body_html: post.body_html,
    user_handle: post.user_handle,
    user_id: post.user_id.toString(),
    thread_id: post.thread_id.toString()
  };
}
function renderedThread(thread) {
  var json = {
    _id: thread._id.toString(),
    title: thread.title,
    user_handle: thread.user_handle,
    user_id: thread.user_id.toString(),
    reply_count: thread.reply_count
  };
  if (thread.last_post_author && thread.last_post_date) {
    json.last_post = {
      author: thread.last_post_author,
      date: thread.last_post_date.getTime()
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
  res.sendNotFound = function() {
    res.send({
      meta: {
        code: statusCodes.NOT_FOUND,
        errorType: 'not_found',
        errorDetail: 'The requested resource was not found'
      },
      response: { }
    });
  }
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
          session.save();
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
  res.withConsumerAndUser = function(callback) {
    res.withConsumer(function(consumer) {
      User.findOne({ consumer_id: consumer._id }, function(err, user) {
        if (err) {
          res.sendInternalServerError(err);
        } else if (user) {
          callback(consumer, user);
        } else {
          res.sendInternalServerError(new Error("Couldn't find user for consumer"));
        }
      });
    });
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
///     { "api_token": "String" }
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
            var newUserConsumer = new Consumer({
              api_key: generateTimedHash(req.body.handle),
              api_secret: generateTimedHash(req.body.password_md5),
              access_level:
                Math.min(consumer.access_level, req.body.access_level || 0)
            });
            newUserConsumer.save(function(err, userConsumer) {
              if (err) {
                res.sendInternalServerError(err);
              } else {
                var newUser = new User({
                  handle: req.body.handle,
                  email: req.body.email,
                  password_md5: req.body.password_md5,
                  consumer_id: userConsumer._id
                });
                newUser.save(function(err, user) {
                  if (err) {
                    res.maybeSendValidationError(err);
                  } else {
                    emitter.emit('new-user', user);
                    res.send({
                      meta: { code: statusCodes.OK },
                      response: { user: renderedUser(user, userConsumer) }
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

app.post('/thread/new', function(req, res) {
  if (['title'].every(curriedHas(req.body))) {
    res.withConsumerAndUser(function(consumer, user) {
      if (consumer.access_level >= 0) {
        var threadDoc = {
          title: req.body.title,
          user_handle: user.handle,
          user_id: user._id
        }
        if (req.body.body_markdown) {
          threadDoc.last_post_author = user.handle;
          threadDoc.last_post_date = Date.now();
          threadDoc.reply_count = 1;
        }
        var newThread = new Thread(threadDoc);
        newThread.save(function(err, thread) {
          if (err) {
            maybeSendValidationError(err);
          } else {
            function respond(postOpt) {
              var responseJson = { thread: renderedThread(thread) };
              if (postOpt) responseJson.post = renderedPost(post);
              emitter.emit('new-thread', thread, postOpt);
              res.send({
                meta: { code: statusCodes.OK },
                response: responseJson
              });
            }
            if (req.body.body_markdown) {
              // Make a best-effort attempt to create the original post
              var newPost = new Post({
                body_html: req.body.body_markdown,
                user_handle: user.handle,
                user_id: user._id,
                thread_id: thread._id
              });
              newPost.save(function(err, post) {
                if (err) {
                  respond(null);
                } else respond(post);
              });
            } else respond(null);
          }
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

app.get('/threads', function(req, res) {
  res.withConsumer(function(consumer) {
    if (consumer.access_level >= 0) {
      Thread.find({ }, function(err, threads) {
        if (err) {
          res.sendInternalServerError(err);
        } else {
          res.send({
            meta: { code: statusCodes.OK },
            response: { threads: threads.map(renderedThread) }
          });
        }
      });
    } else res.sendNotAuthorized();
  });
});

app.get('/thread/:id', function(req, res) {
  res.withConsumer(function(consumer) {
    if (consumer.access_level >= 0) {
      Thread.findOne({ _id: req.params.id }, function(err, thread) {
        if (err) {
          res.sendInternalServerError(err);
        } else if (thread) {
          Post.find({ thread_id: thread._id }, function(err, posts) {
            if (err) {
              res.sendInternalServerError(err);
            } else {
              res.send({
                meta: { code: statusCodes.OK },
                response: {
                  thread: renderedThread(thread),
                  posts: posts.map(renderedPost)
                }
              });
            }
          });
        } else res.sendNotFound();
      });
    } else res.sendNotAuthorized();
  });
});

app.post('/post/new', function(req, res) {
  if (['body_markdown', 'thread_id'].every(curriedHas(req.body))) {
    res.withConsumerAndUser(function(consumer, user) {
      if (consumer.access_level >= 0) {
        Thread.findOne({ _id: req.body.thread_id }, function(err, thread) {
          if (err) {
            res.sendInternalServerError(err);
          } else if (thread) {
            var newPost = new Post({
              body_html: req.body.body_markdown,
              user_handle: user.handle,
              user_id: user._id,
              thread_id: thread._id
            });
            newPost.save(function(err, post) {
              if (err) {
                res.maybeSendValidationError(err);
              } else {
                // Make a best-effort attempt to update the thread reply count
                // according to the # of posts associated with it.
                Post.find({ thread_id: thread._id }, function(err, posts) {
                  if (!err) {
                    thread.reply_count += posts.length;
                    thread.last_post_author = user.handle;
                    thread.last_post_date = Date.now();
                    thread.save();
                  }
                  emitter.emit('new-post', post);
                  res.send({
                    meta: { code: statusCodes.OK },
                    response: {
                      post: renderedPost(post),
                      thread: renderedThread(thread)
                    }
                  });
                });
              }
            });
          } else res.sendNotFound();
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

app.get('/post/:id', function(req, res) {
  res.withConsumer(function(consumer) {
    if (consumer.access_level >= 0) {
      Post.findOne({ _id: req.params.id }, function(err, post) {
        if (err) {
          res.sendInternalServerError(err);
        } else if (post) {
          res.send({
            meta: { code: statusCodes.OK },
            response: { post: renderedPost(post) }
          });
        } else res.sendNotFound();
      });
    } else res.sendNotAuthorized();
  });
});

app.post('/stream/register-receiver', function(req, res) {
  if (['endpoint'].every(curriedHas(req.body))) {
    res.withConsumer(function(consumer) {
      // XXX might want to rethink this access level restriction
      if (consumer.access_level >= 2) {
        StreamReceiver.findOne({ consumer_id: consumer._id },
            function(err, streamReceiver) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            if (streamReceiver) {
              streamReceiver.endpoint = req.body.endpoint;
            } else {
              streamReceiver = new StreamReceiver({
                consumer_id: consumer._id,
                endpoint: req.body.endpoint
              });
            }
            streamReceiver.save(function(err) {
              if (err) {
                res.sendInternalServerError(err);
              } else {
                res.send({
                  meta: { code: statusCodes.OK },
                  response: { }
                });
              }
            });
          }
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

app.post('/stream/unregister-receiver', function(req, res) {
  // TODO
});

// TODO this should send the app secret so we know we're receiving from a
// reputable source
function callStreamReceivers(data) {
  StreamReceiver.find({ }, function(err, receivers) {
    if (!err) {
      receivers.forEach(function(receiver) {
        var options = url.parse(receiver.endpoint);
        options['method'] = 'POST';
        var req = http.request(options, function(res) {
          // TODO we're gonna wanna track failures and back off
        });
        req.write(JSON.stringify(data));
        req.end();
      });
    }
  });
}

emitter.on('new-thread', function(thread) {
  callStreamReceivers({
    type: 'new-thread',
    thread: renderedThread(thread)
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
