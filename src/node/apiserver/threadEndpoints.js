var basics = require('../common/basics.js'),
    md = require('node-markdown').Markdown,
    async = require('async'),
    model = require('./model.js');

var Thread = model.Thread,
    Post = model.Post;
var passThrough = basics.passThrough;
var ApiError = require('./apiError.js').ApiError;

module.exports = function(app, emitter) {
  app.post('/thread/new', function(req, res) {
    async.waterfall([
      req.ensureParameters('title'),
      req.withConsumerAndUser(0),
      function(consumer, user, callback) {
        var newThread = new Thread({
          title: req.body.title,
          user_handle: user.handle,
          user_id: user._id,
          last_post_author: user.handle,
          last_post_date: Date.now(),
          reply_count: req.body.body_markdown ? 1 : 0
        });
        newThread.save(passThrough(callback, user));
      },
      function(user, thread, n, callback) {
        if (req.body.body_markdown) {
          var newPost = new Post({
            body_html: md(req.body.body_markdown, true),
            user_handle: user.handle,
            user_id: user._id,
            thread_id: thread._id
          });
          newPost.save(passThrough(callback, thread));
        } else callback(null, thread, null, 0);
      },
      function(thread, postOpt, n, callback) {
        var json = { thread: Thread.render(thread) };
        if (postOpt) json.post = Post.render(postOpt);
        emitter.emit('new-thread', thread, postOpt);
        callback(null, json);
      }
    ], res.handle);
  });

  app.get('/threads', function(req, res) {
    async.waterfall([
      req.withConsumer(0),
      function(consumer, callback) {
        Thread.find({ }).sort({ last_post_date: -1 }).exec(callback);
      },
      function(threads, callback) {
        callback(null, { threads: threads.map(Thread.render) });
      }
    ], res.handle);
  });

  app.get('/thread/:id', function(req, res) {
    async.waterfall([
      req.withConsumer(0),
      function(consumer, callback) {
        Thread.findOne({ _id: req.params.id }, callback);
      },
      function(thread, callback) {
        if (thread) {
          Post.find({ thread_id: thread._id }).sort({ _id: 1 }).exec(
            passThrough(callback, thread));
        } else callback(ApiError.notFound("That thread wasn't found"));
      },
      function(thread, posts, callback) {
        callback(null, {
          thread: Thread.render(thread),
          posts: posts.map(Post.render)
        });
      }
    ], res.handle);
  });
};

