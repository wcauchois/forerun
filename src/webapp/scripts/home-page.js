
forerun.views.HomePage = forerun.views.Page.extend({
  events: {
    //'click #new-board-button': 'toggleNewBoardForm'
  },
  initialize: function(options) {
    this.newThreadsBar = new forerun.views.NewThreadsBar({
      el: $('#new-threads-bar'),
      pendingThreadsShower: _.bind(this.showPendingThreads, this)
    });
    this.pendingThreads = [];
    this.socket = io.connect(options.config.socket_host + '/threads');
    this.socket.emit('scope', { });
    this.socket.on('new-thread', _.bind(this.onNewThread, this));
  },
  onNewThread: function(thread) {
    this.pendingThreads.push(thread);
    this.newThreadsBar.updateCount(this.pendingThreads.length);
  },
  showPendingThreads: function() {
    this.pendingThreads.forEach(function(thread) {
      var rowDiv = $('<div class="row thread"></div>');
      rowDiv.html(forerun.templates.thread(thread));
      rowDiv.insertAfter($('#new-threads-bar'));
    });
    this.pendingThreads = [];
  }
  /*
  initialize: function(options) {
    this.newBoardForm = new forerun.views.NewBoardForm({ el: $('#new-board-form') });
  },
  toggleNewBoardForm: function() {
    this.newBoardForm.toggle();
  }*/
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

/*
forerun.views.NewBoardForm = forerun.views.Drawer.extend({
  render: function() {
    this.$el.html(forerun.templates.newBoardForm());
    return this;
  }
});
*/

// XXX hacky
//var socket = io.connect('http://localhost:3000/threads');
//socket.emit('scope', { });
//socket.on('new-thread', function() { alert('YOOYOYO'); });

