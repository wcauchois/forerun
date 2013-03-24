
forerun = { };
forerun.views = { };
forerun.templates = { };
forerun.models = { };

forerun.views.FlashMessageView = Backbone.View.extend({
  events: {
    'click .dismiss': 'dismiss'
  },
  dismiss: function() {
    this.$el.slideUp();
  }
});

forerun.views.Page = Backbone.View.extend({
  initialize: function(options) {
    this.setElement($('#page'));
    if ($('#flash-message').length > 0) {
      this.flashMessage =
        new forerun.views.FlashMessageView({ el: this.$('#flash-message') });
    }
  }
});

$("script[type='text/template']").each(function(_, scriptElem) {
  var $scriptElem = $(scriptElem);
  forerun.templates[$scriptElem.data('name')] = function(options) {
    return Mustache.render($scriptElem.text(), options);
  };
});

