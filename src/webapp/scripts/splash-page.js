
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
  },
  events: {
    'blur #handle': 'showFieldErrors',
    'blur #email': 'showFieldErrors',
    'click #submit': 'checkSubmitEnabled'
  },
  checkSubmitEnabled: function() {
    return !this.$('#submit').hasClass('disabled');
  },
  showFieldErrors: function() {
    var $submit = this.$('#submit');
    var valid = true;
    _.forEach(['handle', 'email'], function(field) {
      var $field = $('#' + field);
      if ($field.val().length > 0 &&
          !forerun.views.SignupForm.REGEXES[field].test($field.val())) {
        $field.parent().addClass('error');
        valid = false;
      } else $field.parent().removeClass('error');
    });
    if (valid) {
      $submit.removeClass('disabled');
      $submit.addClass('btn-success');
    } else {
      $submit.addClass('disabled');
      $submit.removeClass('btn-success');
    }
  },
  render: function() {
    this.$el.html(forerun.templates.signupForm());
    return this;
  }
}, {
  REGEXES: {
    handle: /^\w+$/,
    email: /^\w(\w|\+)*@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/
  }
});

forerun.views.LoginForm = forerun.views.FormDrawer.extend({
  render: function() {
    this.$el.html(forerun.templates.loginForm());
    return this;
  }
});

