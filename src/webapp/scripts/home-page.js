
forerun.views.HomePage = forerun.views.Page.extend({
  events: {
    'click #new-thread-button': 'toggleThreadComposeForm'
  },
  initialize: function(options) {
    forerun.views.Page.prototype.initialize.apply(this, [options]);
    this.pendingThreads = [];
    /*this.socket = io.connect(options.config.socket_host + '/threads');
    this.socket.emit('scope', { });
    this.socket.on('new-thread', _.bind(this.onNewThread, this));*/
  },
  render: function() {
    this.newThreadsBar = new forerun.views.NewThreadsBar({
      el: this.$('#new-threads-bar'),
      pendingThreadsShower: _.bind(this.showPendingThreads, this)
    });
    this.threadComposeForm = new forerun.views.ThreadComposeForm({
      el: this.$('#thread-compose-form')
    });
    return this;
  },
  onNewThread: function(thread) {
    this.pendingThreads.push(thread);
    this.newThreadsBar.updateCount(this.pendingThreads.length);
  },
  showPendingThreads: function() {
    this.pendingThreads.forEach(function(thread) {
      var rowDiv = $('<div class="row thread"></div>');
      rowDiv.html(forerun.templates.threadRow(thread));
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

forerun.views.ThreadComposeForm = forerun.views.ComposeForm.extend({
  getTemplate: function() {
    return forerun.templates.threadComposeForm;
  }
});

