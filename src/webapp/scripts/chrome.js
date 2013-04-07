
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

forerun.views.OnlineIndicator = Backbone.View.extend({
  initialize: function(options) {
    this.onlineUsers = [];
    this.heartbeat();
    setInterval(_.bind(this.heartbeat, this), 1000);
  },
  heartbeat: function() {
    $.getJSON('/heartbeat', _.bind(function(data) {
      this.onlineUsers = data;
      this.render();
    }, this));
  },
  render: function() {
    var renderedUsers = [];
    for (var i = 0; i < this.onlineUsers.length; i++) {
      renderedUsers.push({
        handle: this.onlineUsers[i],
        is_last: i == this.onlineUsers.length - 1
      });
    }
    this.$el.html(forerun.templates.onlineIndicator({
      zero_users: this.onlineUsers.length == 0,
      pluralize_users: this.onlineUsers.length != 1,
      users_count: this.onlineUsers.length,
      users: renderedUsers
    }));
    return this;
  }
});

forerun.views.Drawer = Backbone.View.extend({
  initialize: function(options) {
    this.$el.hide();
    this.open = false;
  },
  toggle: function() {
    if (this.open) {
      this.slideUp();
    } else this.slideDown();
  },
  showInstant: function() {
    this.render();
    this.$el.show();
    this.open = true;
  },
  slideDown: function(complete) {
    this.render();
    this.$el.slideDown(complete);
    this.open = true;
  },
  slideUp: function(complete) {
    this.$el.slideUp(complete);
    this.open = false;
  }
});

forerun.views.MarkdownPreview = Backbone.View.extend({
  initialize: function(options) {
    this.converter = new Showdown.converter();
    this.textarea = options.textarea;
    this.textarea.keyup(_.bind(this.updatePreview, this));
  },
  hide: function() { this.$el.hide(); },
  show: function() { this.$el.show(); },
  clear: function() { this.$el.html(''); },
  updatePreview: function() {
    this.$el.html(this.converter.makeHtml(this.textarea.val()));
  }
});

forerun.views.ComposeForm = forerun.views.Drawer.extend({
  events: {
    'click .collapse-preview': 'collapsePreview',
    'click .expand-preview': 'expandPreview',
    'click .collapse-help': 'collapseHelp',
    'click .expand-help': 'expandHelp'
  },
  initialize: function(options) {
    forerun.views.Drawer.prototype.initialize.apply(this, [options]);
  },
  expandHelp: function() {
    this.$('#formatting-help').html(forerun.templates.formattingHelp());
    this.$collapseHelp.show();
    this.$expandHelp.hide();
  },
  collapseHelp: function() {
    this.$('#formatting-help').html('');
    this.$collapseHelp.hide();
    this.$expandHelp.show();
  },
  expandPreview: function() {
    this.markdownPreview.show();
    this.$collapsePreview.show();
    this.$expandPreview.hide();
  },
  collapsePreview: function() {
    this.markdownPreview.hide();
    this.$collapsePreview.hide();
    this.$expandPreview.show();
  },
  clearPreview: function() {
    this.markdownPreview.clear();
  },
  getTemplate: function() { /* override */ },
  getOptions: function() { return { } },
  render: function() {
    this.$el.html(this.getTemplate()(_.extend({
      compose_form_aux: forerun.templates.composeFormAux()
    }, this.getOptions())));
    this.markdownPreview = new forerun.views.MarkdownPreview({
      el: this.$('#markdown-preview'),
      textarea: this.$('textarea')
    });
    this.markdownPreview.hide();

    this.$collapsePreview = this.$('.collapse-preview');
    this.$expandPreview = this.$('.expand-preview');
    this.$collapsePreview.hide();

    this.$collapseHelp = this.$('.collapse-help');
    this.$expandHelp = this.$('.expand-help');
    this.$collapseHelp.hide();

    this.$('textarea').autogrow();
    return this;
  }
});

function updateTimestamps() {
  $('.timeago').each(function(i, span) {
    var $span = $(span);
    $span.html($.timeago(new Date($span.data('timestamp'))));
  });
}
$(document).ready(function() {
  updateTimestamps();
  setInterval(updateTimestamps, 500);
});

