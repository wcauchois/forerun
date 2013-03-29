
forerun.views.ThreadPage = forerun.views.Page.extend({
  events: {
    'click #reply-button': 'togglePostComposeForm'
  },
  initialize: function(options) {
    forerun.views.Page.prototype.initialize.apply(this, [options]);
    this.threadId = options.threadId;
  },
  togglePostComposeForm: function() {
    this.postComposeForm.toggle();
  },
  render: function() {
    this.postComposeForm = new forerun.views.PostComposeForm({
      el: $('#post-compose-form'),
      threadId: this.threadId
    });
    return this;
  }
});

forerun.views.PostComposeForm = forerun.views.ComposeForm.extend({
  initialize: function(options) {
    forerun.views.ComposeForm.prototype.initialize.apply(this, [options]);
    this.threadId = options.threadId;
  },
  getTemplate: function() {
    return forerun.templates.postComposeForm;
  },
  getOptions: function() {
    return { thread_id: this.threadId };
  }
});

