var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = mongoose.Schema.Types.ObjectId;

var userSchema = Schema({
  handle: String,
  email: String,
  salted_password_md5: String,
  salt: String,
  join_date: { type: Date, default: Date.now },
  avatar_small: { type: String, required: false },
  settings: {
    hide_images_by_default: { type: Boolean, default: false }
  },
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
  last_post_author: String,
  last_post_date: Date
});
threadSchema.path('title').validate(function(val) {
  return val.length > 0 && val.length <= 100;
}, 'Invalid thread title -- length must be in (0,100]');

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

User.render = function(user, consumerOpt, includeSettings) {
  var json = {
    _id: user._id.toString(),
    handle: user.handle,
    email: user.email,
    join_date: user.join_date.getTime(),
    avatar_small: user.avatar_small,
    consumer: consumerOpt && Consumer.render(consumerOpt)
  };
  if (includeSettings) {
    json.settings = {
      hide_images_by_default: user.settings.hide_images_by_default
    };
  }
  return json;
};
Post.render = function(post) {
  return {
    _id: post._id.toString(),
    body_html: post.body_html,
    user_handle: post.user_handle,
    user_id: post.user_id.toString(),
    thread_id: post.thread_id.toString()
  };
};
Thread.render = function(thread) {
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
};
Consumer.render = function(consumer) {
  var json = {
    api_key: consumer.api_key,
    api_secret: consumer.api_secret,
    access_level: consumer.access_level,
  };
  return json;
};

exports.User = User;
exports.Consumer = Consumer;
exports.Session = Session;
exports.Thread = Thread;
exports.Post = Post;
exports.Listener = Listener;

