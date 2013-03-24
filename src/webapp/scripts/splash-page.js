
forerun.views.SplashPage = forerun.views.Page.extend({
  initialize: function(options) {
    forerun.views.Page.prototype.initialize.apply(this, [options]);
    this.signupForm = new forerun.views.SignupForm({ el: this.$('#signupForm') });
    this.loginForm = new forerun.views.LoginForm({ el: this.$('#loginForm') });
  },
  events: {
    'click #signup': 'showSignup',
    'click #login': 'showLogin'
  },
  render: function() {
    var hash = window.location.hash.substring(1);
    if (hash == 'signup') {
      this.signupForm.render();
      this.signupForm.$el.show();
    } else if (hash == 'login') {
      this.loginForm.render();
      this.loginForm.$el.show();
    }
    return this;
  },
  showSignup: function() {
    this.loginForm.slideUp(_.bind(function() {
      this.signupForm.slideDown();
    }, this));
  },
  showLogin: function() {
    this.signupForm.slideUp(_.bind(function() {
      this.loginForm.slideDown();
    }, this));
  }
});

forerun.views.SignupForm = forerun.views.Drawer.extend({
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
    email: /^\w(\w|\+|\.)*@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/
  }
});

forerun.views.LoginForm = forerun.views.Drawer.extend({
  render: function() {
    this.$el.html(forerun.templates.loginForm());
    return this;
  }
});

