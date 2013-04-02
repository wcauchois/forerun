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
    md = require('node-markdown').Markdown;

var curriedHas = basics.curriedHas,
    merge = basics.merge,
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

var app = express();
app.use(express.bodyParser());
app.use(function(req, res, next) {
  // http://www.w3.org/TR/access-control/
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

// Used for all app events -- such as adding a user, post, or thread.
var emitter = new events.EventEmitter();

var userSchema = Schema({
  handle: String,
  email: String,
  salted_password_md5: String,
  salt: String,
  join_date: { type: Date, default: Date.now },
  avatar_small: { type: String, required: false },
  consumer_id: ObjectId
});
userSchema.path('handle').validate(function(val) {
  return /^\w+$/.test(val);
}, 'Can only contain letters, numbers, and underscores');
userSchema.path('email').validate(function(val) {
  return /^\w(\w|\+|\.)*@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/.test(val);
}, 'Invalid email address');

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

var listenerSchema = Schema({
  consumer_id: ObjectId,
  endpoint: String,
});

var User = mongoose.model('User', userSchema);
var Consumer = mongoose.model('Consumer', consumerSchema);
var Session = mongoose.model('Session', sessionSchema);
var Thread = mongoose.model('Thread', threadSchema);
var Post = mongoose.model('Post', postSchema);
var Listener = mongoose.model('Listener', listenerSchema);

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
  } else json.last_post = null;
  return json;
}
function renderedConsumer(consumer) {
  var json = {
    api_key: consumer.api_key,
    api_secret: consumer.api_secret,
    access_level: consumer.access_level,
  };
  return json;
}
function renderedUser(user, consumerOpt) {
  var json = {
    _id: user._id.toString(),
    handle: user.handle,
    email: user.email,
    join_date: user.join_date.getTime(),
    avatar_small: user.avatar_small,
    consumer: consumerOpt && renderedConsumer(consumerOpt)
  };
  return json;
}
// Used to generate API keys and secrets
function generateTimedHash(val) {
  return crypto.createHash('md5')
    .update(config.api_server.salt)
    .update(Date.now().toString())
    .update(val)
    .digest('hex');
}
function saltedHash(salt, hash) {
  return crypto.createHash('md5')
    .update(salt)
    .update(hash)
    .digest('hex');
}
function extractMentions(doc) {
  return doc.match(/@\w+/g);
}

app.use(function(req, res, next) {
  res.sendInternalServerError = function(err) {
    res.send(statusCodes.INTERNAL_SERVER_ERROR, {
      meta: {
        code: statusCodes.INTERNAL_SERVER_ERROR,
        errorType: 'server_error',
        errorDetail: (err && 'message' in err) ? err.message : 'Unknown'
      },
      response: { }
    });
  };
  res.sendBadRequest = function(typeOpt, detailOpt) {
    res.send(statusCodes.BAD_REQUEST, {
      meta: {
        code: statusCodes.BAD_REQUEST,
        errorType: 'bad_request',
        errorDetail: 'Bad request'
      },
      response: { }
    });
  };
  res.sendNotFound = function() {
    res.send(statusCodes.NOT_FOUND, {
      meta: {
        code: statusCodes.NOT_FOUND,
        errorType: 'not_found',
        errorDetail: 'The requested resource was not found'
      },
      response: { }
    });
  };
  res.sendInsufficientParameters = function() {
    res.send(statusCodes.BAD_REQUEST, {
      meta: {
        code: statusCodes.BAD_REQUEST,
        errorType: 'insufficient_params',
        errorDetail: 'Insufficient parameters for this call'
      },
      response: { }
    });
  };
  res.sendNotAuthorized = function(typeOpt, detailOpt) {
    res.send(statusCodes.NOT_AUTHORIZED, {
      meta: {
        code: statusCodes.NOT_AUTHORIZED,
        errorType: typeOpt || 'not_authorized',
        errorDetail: detailOpt || 'You are not authorized to make this call'
      },
      response: { }
    });
  };
  res.sendValidationError = function(err) {
    res.send(statusCodes.BAD_REQUEST, {
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
            } else {
              res.sendNotAuthorized('invalid_token', 'No consumer for that token');
            }
          });
        } else {
          res.sendNotAuthorized('invalid_token', 'No such token exists');
        }
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
        res.sendNotAuthorized('authentication_failed', 'Failed to authenticate');
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
            var salted_password_md5 = saltedHash(user.salt, req.body.password_md5);
            if (user.salted_password_md5 == salted_password_md5) {
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
              // XXX factor out sendBadRequest?
              res.send(statusCodes.BAD_REQUEST, {
                meta: {
                  code: statusCodes.BAD_REQUEST,
                  errorType: 'login_failed',
                  errorDetail: 'The password was incorrect'
                },
                response: { }
              });
            }
          } else {
            res.send(statusCodes.BAD_REQUEST, {
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
        var handleRegex = new RegExp(basics.escapeRegex(req.body.handle), 'i');
        User.find({ handle: handleRegex }, function(err, users) {
          if (err) {
            res.sendInternalServerError(err);
          } else if (users.length > 0) {
            res.send(statusCodes.BAD_REQUEST, {
              meta: {
                code: statusCodes.BAD_REQUEST,
                errorType: 'handle_taken',
                errorDetail: 'That handle has been taken'
              },
              response: { }
            });
          } else {
            var salt = crypto.randomBytes(16).toString('hex');
            var salted_password_md5 = saltedHash(salt, req.body.password_md5);
            var newUserConsumer = new Consumer({
              api_key: generateTimedHash(req.body.handle),
              api_secret: generateTimedHash(salted_password_md5),
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
                  salted_password_md5: salted_password_md5,
                  salt: salt,
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

app.get('/user/find', function(req, res) {
  if (['handle'].every(curriedHas(req.query))) {
    res.withConsumer(function(consumer) {
      if (consumer.access_level >= 0) {
        User.findOne({ handle: req.query.handle }, function(err, targetUser) {
          if (err) {
            res.sendInternalServerError(err);
          } else if (targetUser) {
            Consumer.findOne({ _id: targetUser.consumer_id },
                function(err, targetConsumer) {
              if (err) {
                res.sendInternalServerError(err);
              } else if (targetConsumer) {
                res.send({
                  meta: { code: statusCodes.OK },
                  response: {
                    user: renderedUser(targetUser),
                    access_level: targetConsumer.access_level
                  }
                });
              } else {
                res.sendInternalServerError(
                  new Error("Couldn't find consumer for user"));
              }
            });
          } else res.sendNotFound();
        });
      } else res.sendNotAuthorized();
    });
  } else res.sendInsufficientParameters();
});

app.post('/user/update', function(req, res) {
  res.withConsumerAndUser(function(consumer, user) {
    var targetUserId = req.body.user_id || user._id;
    var isSelf = targetUserId == user._id;
    User.find({ _id: targetUserId }, function(err, targetUser) {
      if (err) {
        res.sendInternalServerError(err);
      } else if (targetUser) {
        var allowed = true;
        var newAccessLevel = null;
        if (req.body.hasOwnProperty('access_level')) {
          if (consumer.access_level >= 3 &&
              req.body.access_level <= consumer.access_level) {
            newAccessLevel = parseInt(req.body.access_level);
          } else allowed = false;
        }
        if (req.body.hasOwnProperty('avatar_small')) {
          if (consumer.access_level >= 3 || isSelf) {
            targetUser.avatar_small = req.body.avatar_small;
          } else allowed = false;
        }
        if (allowed) {
          function saveUser() {
            targetUser.save(function(err, user) {
              if (err) {
                res.sendInternalServerError(err);
              } else {
                res.send({
                  meta: { code: statusCodes.OK },
                  response: { user: renderedUser(user) }
                });
              }
            });
          }
          if (newAccessLevel) {
            Consumer.update({ _id: targetUser.consumer_id },
                { $set: { access_level: newAccessLevel } }, function(err) {
              if (err) {
                res.sendInternalServerError(err);
              } else saveUser();
            });
          } else saveUser();
        } else {
          res.sendNotAuthorized(null, 'You are not allowed to make those changes');
        }
      } else res.sendNotFound();
    });
  });
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
            res.maybeSendValidationError(err);
          } else {
            function respond(postOpt) {
              var responseJson = { thread: renderedThread(thread) };
              if (postOpt) responseJson.post = renderedPost(postOpt);
              emitter.emit('new-thread', thread, postOpt);
              res.send({
                meta: { code: statusCodes.OK },
                response: responseJson
              });
            }
            if (req.body.body_markdown) {
              var newPost = new Post({
                body_html: md(req.body.body_markdown, true),
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
          threads.sort(function(x, y) {
            var y_ts, x_ts;
            if (y.last_post_date) {
              y_ts = y.last_post_date.getTime();
            } else y_ts = y._id.getTimestamp();
            if (x.last_post_date) {
              x_ts = x.last_post_date.getTime();
            } else x_ts = x._id.getTimestamp();
            return (y_ts - x_ts);
          });
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
          Post.find({ thread_id: thread._id }).sort({ _id: 1 }).exec(
              function(err, posts) {
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
              body_html: md(req.body.body_markdown, true),
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
                    thread.reply_count = posts.length;
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

app.post('/listener/register', function(req, res) {
  if (['endpoint'].every(curriedHas(req.body))) {
    res.withConsumer(function(consumer) {
      // XXX might want to rethink this access level restriction
      if (consumer.access_level >= 2) {
        Listener.findOne({ consumer_id: consumer._id },
            function(err, listener) {
          if (err) {
            res.sendInternalServerError(err);
          } else {
            if (listener) {
              listener.endpoint = req.body.endpoint;
            } else {
              listener = new Listener({
                consumer_id: consumer._id,
                endpoint: req.body.endpoint
              });
            }
            listener.save(function(err) {
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

app.post('/listener/unregister', function(req, res) {
  // TODO
});

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
    thread: renderedThread(thread)
  });
});
emitter.on('new-post', function(post) {
  callListeners({
    type: 'new-post',
    post: renderedPost(post)
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
  app.listen(config.api_server.port);
  console.log('Listening on port ' + config.api_server.port);
});
