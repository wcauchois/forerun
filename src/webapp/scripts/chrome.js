
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

