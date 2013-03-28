
forerun.views.HomePage = forerun.views.Page.extend({
  events: {
    'click #new-thread-button': 'toggleThreadComposeForm'
  },
  initialize: function(options) {
    this.pendingThreads = [];
    this.socket = io.connect(options.config.socket_host + '/threads');
    this.socket.emit('scope', { });
    this.socket.on('new-thread', _.bind(this.onNewThread, this));
  },
  render: function() {
    this.newThreadsBar = new forerun.views.NewThreadsBar({
      el: this.$('#new-threads-bar'),
      pendingThreadsShower: _.bind(this.showPendingThreads, this)
    });
    this.threadComposeForm = new forerun.views.ThreadComposeForm({
      el: this.$('#thread-compose-form')
    });
    this.$('#thread-compose-form textarea').autogrow();
    return this;
  },
  onNewThread: function(thread) {
    this.pendingThreads.push(thread);
    this.newThreadsBar.updateCount(this.pendingThreads.length);
  },
  showPendingThreads: function() {
    this.pendingThreads.forEach(function(thread) {
      var rowDiv = $('<div class="row thread"></div>');
      rowDiv.html(forerun.templates.thread(thread));
      rowDiv.insertAfter(this.$('#new-threads-bar'));
    });
    this.pendingThreads = [];
  },
  toggleThreadComposeForm: function() {
    this.threadComposeForm.toggle();
  }
});

forerun.views.NewThreadsBar = Backbone.View.extend({
  events: {
    'click': 'showPendingThreads'
  },
  showPendingThreads: function() {
    this.$el.hide();
    this.shown = false;
    this.pendingThreadsShower();
  },
  initialize: function(options) {
    this.count = 0;
    this.pendingThreadsShower = options.pendingThreadsShower;
    this.$el.hide();
    this.shown = false;
  },
  updateCount: function(newCount) {
    this.count = newCount;
    this.render();
    if (!this.shown) {
      this.$el.slideDown();
      this.shown = true;
    }
  },
  render: function() {
    this.$el.html(forerun.templates.newThreadsBar({
      count: this.count,
      plural: this.count > 1
    }));
    return this;
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

forerun.views.ThreadComposeForm = forerun.views.Drawer.extend({
  events: {
    'click .collapse-preview': 'collapsePreview',
    'click .expand-preview': 'expandPreview'
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
  initialize: function(options) {
    forerun.views.Drawer.prototype.initialize.apply(this, [options]);
  },
  render: function() {
    this.$el.html(forerun.templates.threadComposeForm());
    this.markdownPreview = new forerun.views.MarkdownPreview({
      el: this.$('#markdown-preview'),
      textarea: this.$('textarea')
    });
    this.markdownPreview.hide();
    this.$collapsePreview = this.$('.collapse-preview');
    this.$expandPreview = this.$('.expand-preview');
    this.$collapsePreview.hide();
    return this;
  }
});

