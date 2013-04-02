var mongoose = require('mongoose');

var logSchema = mongoose.Schema({
  server: String,
  level: String,
  context: { type: String, required: false },
  message: String,
  extra: String
});

exports.Log = mongoose.model('Log', logSchema);

