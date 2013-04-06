var basics = require('../common/basics.js'),
    md = require('node-markdown').Markdown,
    async = require('async'),
    model = require('./model.js');

var Post = model.Post,
    Thread = model.Thread;
var passThrough = basics.passThrough;

module.exports = function(app, emitter) {
  app.post('/post/new', function(req, res) {
    async.waterfall([
      req.ensureParameters('body_markdown', 'thread_id'),
      req.withConsumerAndUser(0),
      function(consumer, user, callback) {
        Thread.findOne({ _id: req.body.thread_id }, passThrough(callback, user));
      },
      function(user, thread, callback) {
        if (thread) {
          var newPost = new Post({
            body_html: md(req.body.body_markdown, true),
            user_handle: user.handle,
            user_id: user._id,
            thread_id: thread._id
          });
          newPost.save(passThrough(callback, user, thread));
        } else callback(ApiError.notFound("Can't post to a nonexistent thread"));
      },
      function(user, thread, post, n, callback) {
        Post.find({ thread_id: thread._id },
          passThrough(callback, user, thread, post));
      },
      function(user, thread, post, allPosts, callback) {
        thread.reply_count = allPosts.length;
        thread.last_post_author = user.handle;
        thread.last_post_date = Date.now();
        thread.save();
        emitter.emit('new-post', post);
        callback(null, {
          post: Post.render(post),
          thread: Thread.render(thread)
        });
      }
    ], res.handle);
  });

  app.get('/post/:id', function(req, res) {
    req.withConsumer(0),
    function(consumer, callback) {
      Post.findOne({ _id: req.params.id }, callback);
    },
    function(post, callback) {
      if (post) {
        callback(null, { post: Post.render(post) });
      } else callback(ApiError.notFound("That post wasn't found"));
    }
  });
};

