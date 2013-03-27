
forerun.views.HomePage = forerun.views.Page.extend({
  events: {
    'click #new-board-button': 'toggleNewBoardForm'
  },
  initialize: function(options) {
    this.newBoardForm = new forerun.views.NewBoardForm({ el: $('#new-board-form') });
  },
  toggleNewBoardForm: function() {
    this.newBoardForm.toggle();
  }
});

forerun.views.NewBoardForm = forerun.views.Drawer.extend({
  render: function() {
    this.$el.html(forerun.templates.newBoardForm());
    return this;
  }
});

// XXX hacky
//var socket = io.connect('http://localhost:3000/threads');
//socket.emit('scope', { });
//socket.on('new-thread', function() { alert('YOOYOYO'); });

