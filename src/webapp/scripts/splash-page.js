
forerun.views.SplashPage = forerun.views.Page.extend({
  initialize: function(options) {
    forerun.views.Page.prototype.initialize.apply(this, [options]);
    var hash = window.location.hash.substring(1);
    this.signupForm = new forerun.views.SignupForm({
      el: this.$('#signupForm'),
      showByDefault: hash == 'signup'
    });
    this.loginForm = new forerun.views.LoginForm({
      el: this.$('#loginForm'),
      showByDefault: hash == 'login'
    });
  },
  events: {
    'click #signup': 'showSignup',
    'click #login': 'showLogin'
  },
  showSignup: function() {
    this.loginForm.hide(_.bind(function() {
      this.signupForm.show();
    }, this));
  },
  showLogin: function() {
    this.signupForm.hide(_.bind(function() {
      this.loginForm.show();
    }, this));
  }
});

forerun.views.FormDrawer = Backbone.View.extend({
  initialize: function(options) {
    if (options.showByDefault) {
      this.render();
    } else this.$el.hide();
  },
  show: function(complete) {
    this.render();
    this.$el.slideDown(complete);
  },
  hide: function(complete) {
    this.$el.slideUp(complete);
  }
});

forerun.views.SignupForm = forerun.views.FormDrawer.extend({
  initialize: function(options) {
    forerun.views.FormDrawer.prototype.initialize.apply(this, [options]);
    this.$submit = this.$('#submit');
  },
  events: {
    'blur #handle': 'validateHandle',
    'blur #email': 'validateEmail',
    'click #submit': 'checkSubmitEnabled'
  },
  checkSubmitEnabled: function() {
    return !this.$submit.hasClass('disabled');
  },
  disableSubmit: function() {
    this.$submit.addClass('disabled');
    this.$submit.removeClass('btn-success');
  },
  enableSubmit: function() {
    this.$submit.removeClass('disabled');
    this.$submit.addClass('btn-success');
  },
  validateHandle: function() {
    if (!/^\w+$/.test($('#handle').val())) {
      $('#handle-group').addClass('error');
      this.disableSubmit();
    } else {
      $('#handle-group').removeClass('error');
      this.enableSubmit();
    }
  },
  validateEmail: function() {
    if (!/^\w(\w|\+)*@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/.test($('#email').val())) {
      $('#email-group').addClass('error');
      this.disableSubmit();
    } else {
      $('#email-group').removeClass('error');
      this.enableSubmit();
    }
  },
  render: function() {
    this.$el.html(forerun.templates.signupForm());
    return this;
  }
});

forerun.views.LoginForm = forerun.views.FormDrawer.extend({
  render: function() {
    this.$el.html(forerun.templates.loginForm());
    return this;
  }
});

