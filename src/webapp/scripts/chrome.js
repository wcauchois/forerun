
forerun = { };
forerun.views = { };
forerun.templates = { };
forerun.models = { };

forerun.views.FlashMessage = Backbone.View.extend({
  events: {
    'click .dismiss': 'dismiss'
  },
  dismiss: function() {
    this.$el.slideUp();
  },
  render: function() {
    this.$el.html(forerun.templates.flashMessage({
      message: this.options.message,
      type: this.options.type
    }));
    return this;
  }
});

forerun.views.Page = Backbone.View.extend({ });

$("script[type='text/template']").each(function(_, scriptElem) {
  var $scriptElem = $(scriptElem);
  forerun.templates[$scriptElem.data('name')] = function(options) {
    return Mustache.render($scriptElem.text(), options);
  };
});

