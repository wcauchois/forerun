
forerun = { };
forerun.views = { };
forerun.templates = { };
forerun.models = { };

forerun.views.Page = Backbone.View.extend({
  initialize: function(options) {
    this.setElement($('#page'));
  }
});

$("script[type='text/template']").each(function(_, scriptElem) {
  var $scriptElem = $(scriptElem);
  forerun.templates[$scriptElem.data('name')] = function(options) {
    return Mustache.render($scriptElem.text(), options);
  };
});

