
forerun.views.ThreadPage = forerun.views.Page.extend({
  events: {
    'click #reply-button': 'togglePostComposeForm'
  },
  initialize: function(options) {
    forerun.views.Page.prototype.initialize.apply(this, [options]);
  },
  togglePostComposeForm: function() {
    this.postComposeForm.toggle();
  },
  render: function() {
    this.postComposeForm = new forerun.views.PostComposeForm({
      el: $('#post-compose-form')
    });
    return this;
  }
});

forerun.views.PostComposeForm = forerun.views.ComposeForm.extend({
  getTemplate: function() {
    return forerun.templates.postComposeForm;
  }
});

