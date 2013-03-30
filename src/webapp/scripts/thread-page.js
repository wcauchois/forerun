
forerun.views.ThreadPage = forerun.views.Page.extend({
  events: {
    'click #reply-button': 'togglePostComposeForm'
  },
  initialize: function(options) {
    forerun.views.Page.prototype.initialize.apply(this, [options]);
    this.threadId = options.threadId;
    var socket = io.connect(options.config.socket_host + '/posts');
    socket.emit('scope', { });
    socket.on('new-post', _.bind(this.addNewPost, this));
  },
  addNewPost: function(post) {
    var postContainer = $('<div class="row post-container">');
    postContainer.html(forerun.templates.postRow(post));
    postContainer.insertAfter('.post-container:last');
    if ($('#post-compose-form textarea').is(':focus')) {
      $('html, body').scrollTop($(document).height());
    }
  },
  togglePostComposeForm: function() {
    this.postComposeForm.toggle();
  },
  render: function() {
    this.postComposeForm = new forerun.views.PostComposeForm({
      el: $('#post-compose-form'),
      threadId: this.threadId
    });
    this.postComposeForm.showInstant();
    return this;
  }
});

forerun.views.PostComposeForm = forerun.views.ComposeForm.extend({
  subEvents: {
    'click #implicit-submit-checkbox': 'updateSubmit',
    'keyup textarea': 'onTextareaKeyup',
    'keydown textarea': 'onTextareaKeydown'
  },
  onTextareaKeydown: function(evt) {
    if (evt.keyCode == 16) this.shiftPressed = true;
    if (evt.keyCode == 13 && !this.shiftPressed && this.implicitSubmitEnabled()) {
      evt.preventDefault();
    }
  },
  onTextareaKeyup: function(evt) {
    if (evt.keyCode == 16) this.shiftPressed = false;
    if (evt.keyCode == 13 && !this.shiftPressed && this.implicitSubmitEnabled()) {
      this.$('form').submit();
    }
  },
  updateSubmit: function() {
    if (this.implicitSubmitEnabled()) {
      this.$submitButton.hide();
    } else this.$submitButton.show();
  },
  implicitSubmitEnabled: function() {
    return this.$implicitSubmitCheckbox.is(':checked');
  },
  initialize: function(options) {
    forerun.views.ComposeForm.prototype.initialize.apply(this, [options]);
    this.threadId = options.threadId;
    this.shiftPressed = false;
    this.events = _.extend({ }, this.events, this.subEvents);
  },
  render: function() {
    forerun.views.ComposeForm.prototype.render.apply(this);
    this.$textarea = this.$('textarea');
    this.originalTextareaHeight = this.$textarea.height();
    this.$implicitSubmitCheckbox = $('#implicit-submit-checkbox');
    this.$submitButton = this.$(':submit');
    this.$submitButton.hide();
    this.$('form').submit(_.bind(function() {
      $.post('/post/new', {
        body_markdown: this.$textarea.val(),
        thread_id: this.threadId
      });
      this.$textarea.val('');
      this.$textarea.height(this.originalTextareaHeight);
      this.clearPreview();
      return false;
    }, this));
  },
  getTemplate: function() {
    return forerun.templates.postComposeForm;
  },
  getOptions: function() {
    return { thread_id: this.threadId };
  }
});

