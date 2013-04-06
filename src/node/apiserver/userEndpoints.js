// started at 213
var basics = require('../common/basics.js'),
    async = require('async'),
    model = require('./model.js'),
    crypto = require('crypto');

var User = model.User,
    Consumer = model.Consumer,
    Session = model.Session,
    Thread = model.Thread,
    Post = model.Post,
    Listener = model.Listener;
var passThrough = basics.passThrough,
    generateTimedHash = basics.generateTimedHash;
var ApiError = require('./apiError.js').ApiError;

function saltedHash(salt, hash) {
  return crypto.createHash('md5')
    .update(salt)
    .update(hash)
    .digest('hex');
}

module.exports = function(app, emitter) {
  app.post('/user/login', function(req, res) {
    async.waterfall([
      req.ensureParameters('handle', 'password_md5'),
      req.withConsumer(6),
      function(consumer, callback) {
        User.findOne({ handle: req.body.handle }, callback);
      },
      function(user, callback) {
        if (user) {
          var salted_password_md5 = saltedHash(user.salt, req.body.password_md5);
          if (user.salted_password_md5 == salted_password_md5) {
            Consumer.findOne({ _id: user.consumer_id }, passThrough(callback, user));
          } else callback(ApiError.loginFailed('The password was incorrect'));
        } else callback(ApiError.loginFailed('That user does not exist'));
      },
      function(user, consumer, callback) {
        if (consumer) {
          callback(null, {
            user: User.render(user, consumer)
          });
        } else callback(ApiError.serverError("Couldn't find consumer"));
      }
    ], res.handle);
  });

  app.post('/user/new', function(req, res) {
    async.waterfall([
      req.ensureParameters('handle', 'email', 'password_md5'),
      req.withConsumer(6),
      function(consumer, callback) {
        var handleRegex = new RegExp(basics.escapeRegex(req.body.handle), 'i');
        User.find({ handle: handleRegex }, passThrough(callback, consumer));
      },
      function(consumer, existingUser, callback) {
        if (existingUser) {
          callback(ApiError.handleTaken());
        } else {
          var newUserConsumer = new Consumer({
            api_key: generateTimedHash(req.body.handle),
            // TODO: get rid of api secret; only use key
            api_secret: generateTimedHash(''),
            access_level:
              Math.min(consumer.access_level, req.body.access_level || 0)
          });
          newUserConsumer.save(callback);
        }
      },
      function(userConsumer, n, callback) {
        var salt = crypto.randomBytes(16).toString('hex');
        var salted_password_md5 = saltedHash(salt, req.body.password_md5);
        var newUser = new User({
          handle: req.body.handle,
          email: req.body.email,
          salted_password_md5: salted_password_md5,
          salt: salt,
          consumer_id: userConsumer._id
        });
        newUser.save(passThrough(callback, userConsumer));
      },
      function(userConsumer, user, n, callback) {
        callback(null, {
          user: User.render(user, userConsumer)
        });
      }
    ], res.handle);
  });

  app.get('/user/find', function(req, res) {
    async.waterfall([
      req.ensureParameters('handle'),
      req.withConsumerAndUser(0),
      function(consumer, user, callback) {
        User.findOne({ handle: req.query.handle },
          passThrough(callback, consumer, user));
      },
      function(consumer, user, targetUser, callback) {
        if (targetUser) {
          Consumer.findOne({ _id: targetUser.consumer_id },
            passThrough(callback, consumer, user, targetUser));
        } else callback(ApiError.notFound('User not found'));
      },
      function (consumer, user, targetUser, targetConsumer, callback) {
        if (targetConsumer) {
          var isSelf = user._id == targetUser._id;
          callback(null, {
            user: User.render(targetUser, null, isSelf),
            access_level: targetConsumer.access_level
          });
        } else callback(ApiError.serverError("Couldn't find consumer for user"));

      }
    ], res.handle);
  });

  app.post('/user/update', function(req, res) {
    async.waterfall([
      req.withConsumerAndUser(),
      function(consumer, user, callback) {
        var targetUserId = req.body.user_id || user._id;
        User.find({ _id: targetUserId }, passThrough(callback, consumer, user));
      },
      function(consumer, user, targetUser) {
        if (targetUser) {
          var isSelf = targetUser._id == user._id;
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
            targetUser.save(passThrough(callback, newAccessLevel));
          } else callback(ApiError.notAuthorized("You can't make those changes"));
        } else callback(ApiError.notFound("That user doesn't exist"));
      },
      function(newAccessLevel, targetUser, n, callback) {
        if (newAccessLevel) {
          Consumer.update({ _id: targetUser.consumer_id },
              { $set: { access_level: newAccessLevel } }, function(err, consumer) {
            callback(err, targetUser);
          });
        } else callback(null, targetUser);
      },
      function(targetUser, callback) {
        callback(null, { user: renderedUser(targetUser) });
      }
    ], res.handle);
  });
};
