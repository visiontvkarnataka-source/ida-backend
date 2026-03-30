// IDA Session Persistence & Login/Signup Flow
(function() {
  var SESSION_KEY = 'idapp_session';

  function saveSession(phone, role) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        phone: phone || '',
        role: role || 'customer',
        ts: Date.now()
      }));
    } catch(e) {}
  }

  function getSession() {
    try {
      var s = localStorage.getItem(SESSION_KEY);
      if (s) return JSON.parse(s);
    } catch(e) {}
    return null;
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
  }

  // Direct screen transition (works even if showAuth is broken)
  function goToAuth() {
    try {
      var splash = document.getElementById('splashScreen');
      var auth = document.getElementById('authScreen');
      if (splash) splash.classList.remove('active');
      if (auth) auth.classList.add('active');
      // Also try calling showAuth if available
      if (typeof window.showAuth === 'function') {
        try { window.showAuth(); } catch(e) {}
      }
    } catch(e) {
      console.log('[Session] goToAuth error:', e);
    }
  }

  function checkSessionOnLoad() {
    var session = getSession();
    if (session && session.phone && session.role) {
      setTimeout(function() {
        var screens = document.querySelectorAll('.screen');
        screens.forEach(function(s) { s.classList.remove('active'); });
        if (typeof enterApp === 'function') {
          enterApp();
        } else {
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

  // Monkey-patch selectAppRole
  var origSelectAppRole = window.selectAppRole;
  if (origSelectAppRole) {
    window.selectAppRole = function(role) {
      var phoneInput = document.querySelector('#phoneInput') || document.querySelector('input[type="tel"]');
      var phone = phoneInput ? phoneInput.value : '';
      saveSession(phone, role);
      return origSelectAppRole.call(this, role);
    };
  }

  // Monkey-patch enterApp
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

  // Monkey-patch logout
  var origLogout = window.logout;
  if (origLogout) {
    window.logout = function() {
      clearSession();
      return origLogout.apply(this, arguments);
    };
  }

  // Monkey-patch showAuth
  var origShowAuth = window.showAuth;
  if (origShowAuth) {
    window.showAuth = function() {
      var session = getSession();
      if (session && session.phone) {
        setTimeout(function() {
          var phoneInput = document.querySelector('#phoneInput') || document.querySelector('input[type="tel"]');
          if (phoneInput) phoneInput.value = session.phone;
        }, 100);
      }
      return origShowAuth.apply(this, arguments);
    };
  }

  // === BULLETPROOF SPLASH BUTTON FIX ===
  // Add direct click handler to Get Started button
  // This works even if showAuth() is broken/undefined
  var splashBtn = document.querySelector('.splash-btn');
  if (splashBtn) {
    splashBtn.addEventListener('click', function(e) {
      goToAuth();
    });
    // Also make sure it's tappable on mobile
    splashBtn.style.position = 'relative';
    splashBtn.style.zIndex = '100';
  }

  // Auto-transition from splash to auth after 3 seconds (for new users)
  var hasSession = checkSessionOnLoad();
  if (!hasSession) {
    setTimeout(function() {
      var splash = document.getElementById('splashScreen');
      if (splash && splash.classList.contains('active')) {
        goToAuth();
      }
    }, 3000);
  }
})();
