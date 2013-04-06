var basics = require('../common/basics.js'),
    async = require('async'),
    model = require('./model.js');

var passThrough = basics.passThrough;
var Listener = model.Listener;

module.exports = function(app, emitter) {
  app.post('/listener/register', function(req, res) {
    async.waterfall([
      req.ensureParameters('endpoint'),
      req.withConsumer(3),
      function(consumer, callback) {
        Listener.findOne({ consumer_id: consumer._id },
          passThrough(callback, consumer));
      },
      function(consumer, listener, callback) {
        if (listener) {
          listener.endpoint = req.body.endpoint;
        } else {
          listener = new Listener({
            consumer_id: consumer._id,
            endpoint: req.body.endpoint
          });
        }
        listener.save(callback);
      },
      function(listener, n, callback) {
        callback(null, { });
      }
    ], res.handle);
  });
}

