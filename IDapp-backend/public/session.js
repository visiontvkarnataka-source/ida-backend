// IDA Session Persistence & Login/Signup Flow
(function() {
  var SESSION_KEY = 'idapp_session';

  // Save session after user enters the app
  function saveSession(phone, role) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        phone: phone || '',
        role: role || 'customer',
        ts: Date.now()
      }));
    } catch(e) {}
  }

  // Get saved session
  function getSession() {
    try {
      var s = localStorage.getItem(SESSION_KEY);
      if (s) return JSON.parse(s);
    } catch(e) {}
    return null;
  }

  // Clear session (for logout)
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
  }

  // Check session on page load and auto-login
  function checkSessionOnLoad() {
    var session = getSession();
    if (session && session.phone && session.role) {
      // User was logged in before - skip auth, go straight to app
      setTimeout(function() {
        // Hide splash and auth screens
        var screens = document.querySelectorAll('.screen');
        screens.forEach(function(s) { s.classList.remove('active'); });
        // Enter the app directly
        if (typeof enterApp === 'function') {
          enterApp();
        } else {
          // Fallback - show home screen manually
          var home = document.getElementById('homeScreen');
          if (home) home.classList.add('active');
          var nav = document.getElementById('bottomNav');
          if (nav) nav.classList.add('active');
        }
      }, 1800);
      return true;
    }
    return false;
  }

  // Monkey-patch selectAppRole to save session on signup
  var origSelectAppRole = window.selectAppRole;
  if (origSelectAppRole) {
    window.selectAppRole = function(role) {
      var phoneInput = document.querySelector('#phoneInput') || document.querySelector('input[type="tel"]');
      var phone = phoneInput ? phoneInput.value : '';
      saveSession(phone, role);
      return origSelectAppRole.call(this, role);
    };
  }

  // Monkey-patch enterApp to save session if not saved yet
  var origEnterApp = window.enterApp;
  if (origEnterApp) {
    window.enterApp = function() {
      var session = getSession();
      if (!session) {
        var phoneInput = document.querySelector('#phoneInput') || document.querySelector('input[type="tel"]');
        saveSession(phoneInput ? phoneInput.value : '', 'customer');
      }
      return origEnterApp.apply(this, arguments);
    };
  }

  // Monkey-patch logout to clear session
  var origLogout = window.logout;
  if (origLogout) {
    window.logout = function() {
      clearSession();
      return origLogout.apply(this, arguments);
    };
  }

  // Modify the splash screen Get Started button behavior
  var origShowAuth = window.showAuth;
  if (origShowAuth) {
    window.showAuth = function() {
      // Check if returning user
      var session = getSession();
      if (session && session.phone) {
        // Returning user - auto-fill phone and show login mode
        setTimeout(function() {
          var phoneInput = document.querySelector('#phoneInput') || document.querySelector('input[type="tel"]');
          if (phoneInput) phoneInput.value = session.phone;
          var authTitle = document.querySelector('.auth-header h2, .auth-header .auth-title');
          if (authTitle) authTitle.textContent = 'Welcome Back!';
          var authSub = document.querySelector('.auth-header p, .auth-header .auth-subtitle');
          if (authSub) authSub.textContent = 'Sign in with your phone number';
        }, 100);
      }
      return origShowAuth.apply(this, arguments);
    };
  }

  // Run session check
  checkSessionOnLoad();
})();
