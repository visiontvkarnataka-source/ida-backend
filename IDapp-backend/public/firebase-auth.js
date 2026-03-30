// ============================================================
// IDA Firebase Phone Authentication Module
// Handles: Phone OTP send, verify, session management
// ============================================================
(function() {
  'use strict';

  // ===== FIREBASE CONFIG =====
  const firebaseConfig = {
    apiKey: "AIzaSyDgM5YY0CS1oqn-Us7rZLtzPxtyJbaCNLk",
    authDomain: "project-18bcddb7-1b7d-4641-8ec.firebaseapp.com",
    projectId: "project-18bcddb7-1b7d-4641-8ec",
    storageBucket: "project-18bcddb7-1b7d-4641-8ec.firebasestorage.app",
    messagingSenderId: "837592402050",
    appId: "1:837592402050:web:9966d23fa7b59ae3e44c9b",
    measurementId: "G-ST7H4LBZHY"
  };

  // ===== STATE =====
  let firebaseApp = null;
  let firebaseAuth = null;
  let confirmationResult = null;
  let recaptchaVerifier = null;
  let recaptchaWidgetId = null;
  let isInitialized = false;

  // ===== LOAD FIREBASE SDK VIA CDN =====
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.type = 'module';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Load Firebase compat SDKs (works without bundler)
  function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      const compatBase = 'https://www.gstatic.com/firebasejs/10.12.2/';

      // Load app first, then auth
      const appScript = document.createElement('script');
      appScript.src = compatBase + 'firebase-app-compat.js';
      appScript.onload = () => {
        const authScript = document.createElement('script');
        authScript.src = compatBase + 'firebase-auth-compat.js';
        authScript.onload = () => {
          console.log('[IDA Auth] Firebase SDK loaded');
          resolve();
        };
        authScript.onerror = reject;
        document.head.appendChild(authScript);
      };
      appScript.onerror = reject;

      // Check if already loaded
      if (window.firebase && window.firebase.auth) {
        resolve();
        return;
      }
      if (window.firebase && !window.firebase.auth) {
        const authScript = document.createElement('script');
        authScript.src = compatBase + 'firebase-auth-compat.js';
        authScript.onload = () => resolve();
        authScript.onerror = reject;
        document.head.appendChild(authScript);
        return;
      }

      document.head.appendChild(appScript);
    });
  }

  // ===== INITIALIZE =====
  async function initFirebaseAuth() {
    if (isInitialized) return true;

    try {
      await loadFirebaseSDK();

      // Initialize Firebase app
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        firebaseApp = window.firebase.initializeApp(firebaseConfig);
      } else {
        firebaseApp = window.firebase.apps[0];
      }

      firebaseAuth = window.firebase.auth();

      // Set language to user's browser language or default to English
      firebaseAuth.languageCode = navigator.language || 'en';

      // Use local persistence so user stays logged in
      await firebaseAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);

      isInitialized = true;
      console.log('[IDA Auth] Firebase Auth initialized successfully');
      return true;
    } catch (error) {
      console.error('[IDA Auth] Firebase init error:', error);
      return false;
    }
  }

  // ===== RECAPTCHA SETUP =====
  function setupRecaptcha(buttonId) {
    try {
      // Clean up existing verifier
      if (recaptchaVerifier) {
        try { recaptchaVerifier.clear(); } catch(e) {}
        recaptchaVerifier = null;
      }

      // Remove existing recaptcha container if any
      const existing = document.getElementById('ida-recaptcha-container');
      if (existing) existing.remove();

      // Create invisible recaptcha container
      const container = document.createElement('div');
      container.id = 'ida-recaptcha-container';
      container.style.cssText = 'position:fixed;bottom:0;left:0;z-index:-1;opacity:0;pointer-events:none;';
      document.body.appendChild(container);

      recaptchaVerifier = new window.firebase.auth.RecaptchaVerifier('ida-recaptcha-container', {
        size: 'invisible',
        callback: (response) => {
          console.log('[IDA Auth] reCAPTCHA solved');
        },
        'expired-callback': () => {
          console.log('[IDA Auth] reCAPTCHA expired, resetting...');
          if (recaptchaVerifier) {
            try { recaptchaVerifier.clear(); } catch(e) {}
            recaptchaVerifier = null;
          }
        }
      });

      return recaptchaVerifier.render().then((widgetId) => {
        recaptchaWidgetId = widgetId;
        console.log('[IDA Auth] reCAPTCHA rendered, widget:', widgetId);
        return recaptchaVerifier;
      });
    } catch (error) {
      console.error('[IDA Auth] reCAPTCHA setup error:', error);
      throw error;
    }
  }

  // ===== SEND OTP =====
  async function sendOTP(phoneNumber) {
    try {
      if (!isInitialized) {
        const ok = await initFirebaseAuth();
        if (!ok) throw new Error('Firebase not initialized');
      }

      // Format phone number - ensure +91 prefix for India
      let formattedPhone = phoneNumber.trim().replace(/\s+/g, '');
      if (!formattedPhone.startsWith('+')) {
        // Remove leading 0 if present
        formattedPhone = formattedPhone.replace(/^0+/, '');
        // Add India country code
        if (!formattedPhone.startsWith('91')) {
          formattedPhone = '+91' + formattedPhone;
        } else {
          formattedPhone = '+' + formattedPhone;
        }
      }

      // Validate: must be +91 followed by 10 digits
      if (!/^\+91\d{10}$/.test(formattedPhone)) {
        throw new Error('Please enter a valid 10-digit Indian phone number');
      }

      console.log('[IDA Auth] Sending OTP to:', formattedPhone);

      // Setup recaptcha
      await setupRecaptcha();

      // Send OTP via Firebase
      confirmationResult = await firebaseAuth.signInWithPhoneNumber(formattedPhone, recaptchaVerifier);

      console.log('[IDA Auth] OTP sent successfully');

      // Store phone for later use
      localStorage.setItem('ida_auth_phone', formattedPhone);

      return { success: true, message: 'OTP sent to ' + formattedPhone };
    } catch (error) {
      console.error('[IDA Auth] Send OTP error:', error);

      // Clean up recaptcha on error
      if (recaptchaVerifier) {
        try { recaptchaVerifier.clear(); } catch(e) {}
        recaptchaVerifier = null;
      }

      // User-friendly error messages
      let message = 'Failed to send OTP. Please try again.';
      if (error.code === 'auth/invalid-phone-number') {
        message = 'Invalid phone number. Please enter a valid 10-digit number.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please wait a few minutes and try again.';
      } else if (error.code === 'auth/quota-exceeded') {
        message = 'SMS quota exceeded. Please try again later.';
      } else if (error.code === 'auth/captcha-check-failed') {
        message = 'reCAPTCHA verification failed. Please refresh and try again.';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, message: message };
    }
  }

  // ===== VERIFY OTP =====
  async function verifyOTP(otpCode) {
    try {
      if (!confirmationResult) {
        throw new Error('No OTP was sent. Please request a new OTP.');
      }

      const otp = otpCode.trim();
      if (!/^\d{6}$/.test(otp)) {
        throw new Error('Please enter a valid 6-digit OTP');
      }

      console.log('[IDA Auth] Verifying OTP...');

      // Verify with Firebase
      const userCredential = await confirmationResult.confirm(otp);
      const user = userCredential.user;

      console.log('[IDA Auth] OTP verified! User:', user.uid);

      // Get Firebase ID token
      const idToken = await user.getIdToken();

      // Get the role from localStorage (set by RoleSelector in redesign.js)
      const role = localStorage.getItem('ida_user_role') || 'rider';
      const phone = localStorage.getItem('ida_auth_phone') || user.phoneNumber;

      // Send token to our backend to create/validate session
      const backendResponse = await registerWithBackend(idToken, phone, role, user.uid);

      if (backendResponse.success) {
        // Store session data
        localStorage.setItem('ida_user_id', backendResponse.userId || user.uid);
        localStorage.setItem('ida_user_phone', phone);
        localStorage.setItem('ida_user_role', role);
        localStorage.setItem('ida_auth_token', idToken);
        localStorage.setItem('ida_logged_in', 'true');

        console.log('[IDA Auth] Login complete! Role:', role);

        return {
          success: true,
          message: 'Login successful!',
          user: {
            uid: user.uid,
            phone: phone,
            role: role,
            userId: backendResponse.userId || user.uid
          }
        };
      } else {
        throw new Error(backendResponse.message || 'Backend registration failed');
      }
    } catch (error) {
      console.error('[IDA Auth] Verify OTP error:', error);

      let message = 'OTP verification failed. Please try again.';
      if (error.code === 'auth/invalid-verification-code') {
        message = 'Invalid OTP. Please check and try again.';
      } else if (error.code === 'auth/code-expired') {
        message = 'OTP has expired. Please request a new one.';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, message: message };
    }
  }

  // ===== REGISTER WITH BACKEND =====
  async function registerWithBackend(idToken, phone, role, firebaseUid) {
    try {
      const response = await fetch('/api/auth/firebase-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: idToken,
          phone: phone,
          role: role,
          firebaseUid: firebaseUid
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[IDA Auth] Backend register error:', error);
      // If backend is unreachable, still allow login (frontend-only mode)
      return {
        success: true,
        userId: firebaseUid,
        message: 'Logged in (offline mode)'
      };
    }
  }

  // ===== RESEND OTP =====
  async function resendOTP() {
    const phone = localStorage.getItem('ida_auth_phone');
    if (!phone) {
      return { success: false, message: 'No phone number found. Please go back and enter your number.' };
    }

    // Clear previous confirmation
    confirmationResult = null;

    // Clean up recaptcha
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch(e) {}
      recaptchaVerifier = null;
    }

    return await sendOTP(phone);
  }

  // ===== CHECK AUTH STATE =====
  function checkAuthState() {
    return new Promise((resolve) => {
      if (!isInitialized || !firebaseAuth) {
        resolve(null);
        return;
      }

      const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
        unsubscribe();
        if (user) {
          resolve({
            uid: user.uid,
            phone: user.phoneNumber,
            role: localStorage.getItem('ida_user_role') || 'rider'
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  // ===== SIGN OUT =====
  async function signOut() {
    try {
      if (firebaseAuth) {
        await firebaseAuth.signOut();
      }

      // Clear all IDA auth data
      localStorage.removeItem('ida_user_id');
      localStorage.removeItem('ida_user_phone');
      localStorage.removeItem('ida_user_role');
      localStorage.removeItem('ida_auth_token');
      localStorage.removeItem('ida_auth_phone');
      localStorage.removeItem('ida_logged_in');

      console.log('[IDA Auth] Signed out');
      return { success: true };
    } catch (error) {
      console.error('[IDA Auth] Sign out error:', error);
      return { success: false, message: error.message };
    }
  }

  // ===== UI INTEGRATION =====
  // This wires into the existing auth screen from redesign.js

  function injectAuthUI() {
    const authScreen = document.getElementById('authScreen');
    if (!authScreen) {
      console.log('[IDA Auth] No authScreen found, retrying...');
      setTimeout(injectAuthUI, 500);
      return;
    }

    // Find the existing phone input
    const phoneInput = authScreen.querySelector('input[type="tel"], input[type="text"][placeholder*="phone"], input[placeholder*="Phone"], input[placeholder*="mobile"], input[placeholder*="Mobile"]');

    // Find or create the send OTP button
    let sendBtn = authScreen.querySelector('.send-otp-btn, button[onclick*="sendOtp"], button[onclick*="sendOTP"]');
    if (!sendBtn) {
      // Look for any button that might be the "Continue" or "Send OTP" button
      const buttons = authScreen.querySelectorAll('button');
      for (const btn of buttons) {
        const txt = btn.textContent.toLowerCase();
        if (txt.includes('send') || txt.includes('continue') || txt.includes('get otp') || txt.includes('verify') || txt.includes('login') || txt.includes('proceed')) {
          sendBtn = btn;
          break;
        }
      }
    }

    // Override the send OTP button behavior
    if (sendBtn && phoneInput) {
      // Clone to remove old event listeners
      const newBtn = sendBtn.cloneNode(true);
      sendBtn.parentNode.replaceChild(newBtn, sendBtn);

      newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const phone = phoneInput.value;
        if (!phone || phone.length < 10) {
          showToast('Please enter a valid 10-digit phone number', 'error');
          phoneInput.focus();
          return;
        }

        // Check if role is selected
        const role = localStorage.getItem('ida_user_role');
        if (!role) {
          showToast('Please select Rider or Driver first', 'error');
          return;
        }

        // Show loading state
        newBtn.disabled = true;
        const originalText = newBtn.textContent;
        newBtn.innerHTML = '<span class="ida-spinner"></span> Sending OTP...';

        const result = await sendOTP(phone);

        if (result.success) {
          showToast('OTP sent to +91 ' + phone.slice(-10), 'success');
          // Navigate to OTP screen
          showOTPScreen(phone);
        } else {
          showToast(result.message, 'error');
          newBtn.disabled = false;
          newBtn.textContent = originalText;
        }
      });

      console.log('[IDA Auth] Auth UI wired to existing button');
    } else {
      console.log('[IDA Auth] Could not find phone input or send button, will create custom UI');
      createCustomAuthUI(authScreen);
    }
  }

  // ===== CUSTOM AUTH UI (if no existing elements found) =====
  function createCustomAuthUI(authScreen) {
    // Check if we already injected
    if (authScreen.querySelector('.ida-firebase-auth')) return;

    const authContainer = document.createElement('div');
    authContainer.className = 'ida-firebase-auth';
    authContainer.innerHTML = `
      <div class="ida-auth-phone-section">
        <div class="ida-phone-input-wrapper">
          <span class="ida-phone-prefix">+91</span>
          <input type="tel" class="ida-phone-input" id="idaPhoneInput"
                 placeholder="Enter mobile number" maxlength="10"
                 pattern="[0-9]*" inputmode="numeric" autocomplete="tel">
        </div>
        <button class="ida-send-otp-btn" id="idaSendOtpBtn">
          Send OTP
        </button>
      </div>
    `;

    // Insert after the role selector if it exists, otherwise at the form area
    const roleSelector = authScreen.querySelector('.role-selector');
    const form = authScreen.querySelector('form') || authScreen.querySelector('.auth-form') || authScreen;

    if (roleSelector && roleSelector.nextSibling) {
      roleSelector.parentNode.insertBefore(authContainer, roleSelector.nextSibling);
    } else {
      // Find a good insertion point
      const existingInput = authScreen.querySelector('input');
      if (existingInput) {
        existingInput.parentNode.insertBefore(authContainer, existingInput);
        existingInput.style.display = 'none'; // Hide old input
      } else {
        form.appendChild(authContainer);
      }
    }

    // Wire up the button
    const phoneInput = document.getElementById('idaPhoneInput');
    const sendBtn = document.getElementById('idaSendOtpBtn');

    // Auto-format and restrict to numbers only
    phoneInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
    });

    // Send on Enter key
    phoneInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendBtn.click();
    });

    sendBtn.addEventListener('click', async () => {
      const phone = phoneInput.value;
      if (!phone || phone.length < 10) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        phoneInput.focus();
        return;
      }

      const role = localStorage.getItem('ida_user_role');
      if (!role) {
        showToast('Please select Rider or Driver first', 'error');
        return;
      }

      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="ida-spinner"></span> Sending...';

      const result = await sendOTP(phone);

      if (result.success) {
        showToast('OTP sent successfully!', 'success');
        showOTPScreen(phone);
      } else {
        showToast(result.message, 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send OTP';
      }
    });
  }

  // ===== OTP VERIFICATION SCREEN =====
  function showOTPScreen(phone) {
    // Check if there's already an OTP screen in the app
    const existingOtpScreen = document.getElementById('otpScreen');

    if (existingOtpScreen) {
      // Use existing OTP screen - wire into it
      if (typeof window.showScreen === 'function') {
        window.showScreen('otpScreen');
      } else {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        existingOtpScreen.classList.add('active');
      }
      wireExistingOTPScreen(existingOtpScreen, phone);
      return;
    }

    // Create our own OTP verification overlay
    const overlay = document.createElement('div');
    overlay.id = 'idaOtpOverlay';
    overlay.className = 'ida-otp-overlay';
    overlay.innerHTML = `
      <div class="ida-otp-card">
        <button class="ida-otp-back" id="idaOtpBack">&larr;</button>
        <div class="ida-otp-icon">🔐</div>
        <h2 class="ida-otp-title">Verify OTP</h2>
        <p class="ida-otp-subtitle">Enter the 6-digit code sent to<br><strong>+91 ${phone.slice(-10)}</strong></p>

        <div class="ida-otp-inputs" id="idaOtpInputs">
          <input type="tel" maxlength="1" pattern="[0-9]" inputmode="numeric" class="ida-otp-digit" data-idx="0" autofocus>
          <input type="tel" maxlength="1" pattern="[0-9]" inputmode="numeric" class="ida-otp-digit" data-idx="1">
          <input type="tel" maxlength="1" pattern="[0-9]" inputmode="numeric" class="ida-otp-digit" data-idx="2">
          <input type="tel" maxlength="1" pattern="[0-9]" inputmode="numeric" class="ida-otp-digit" data-idx="3">
          <input type="tel" maxlength="1" pattern="[0-9]" inputmode="numeric" class="ida-otp-digit" data-idx="4">
          <input type="tel" maxlength="1" pattern="[0-9]" inputmode="numeric" class="ida-otp-digit" data-idx="5">
        </div>

        <button class="ida-verify-btn" id="idaVerifyBtn">Verify & Login</button>

        <div class="ida-otp-footer">
          <span id="idaResendTimer">Resend OTP in <strong>30s</strong></span>
          <button class="ida-resend-btn" id="idaResendBtn" style="display:none;">Resend OTP</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    // Wire OTP digit inputs
    wireOTPDigitInputs();

    // Wire verify button
    document.getElementById('idaVerifyBtn').addEventListener('click', handleVerify);

    // Wire back button
    document.getElementById('idaOtpBack').addEventListener('click', () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    });

    // Start resend timer
    startResendTimer();

    // Focus first input
    setTimeout(() => {
      const firstInput = overlay.querySelector('.ida-otp-digit');
      if (firstInput) firstInput.focus();
    }, 400);
  }

  function wireExistingOTPScreen(otpScreen, phone) {
    // Find OTP input(s) in the existing screen
    const otpInput = otpScreen.querySelector('input[type="tel"], input[type="text"], input[type="number"]');
    let verifyBtn = null;

    // Find verify button
    const buttons = otpScreen.querySelectorAll('button');
    for (const btn of buttons) {
      const txt = btn.textContent.toLowerCase();
      if (txt.includes('verify') || txt.includes('confirm') || txt.includes('submit') || txt.includes('login')) {
        verifyBtn = btn;
        break;
      }
    }

    if (verifyBtn) {
      const newBtn = verifyBtn.cloneNode(true);
      verifyBtn.parentNode.replaceChild(newBtn, verifyBtn);

      newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const otp = otpInput ? otpInput.value : '';
        if (!otp || otp.length < 6) {
          showToast('Please enter the 6-digit OTP', 'error');
          return;
        }

        newBtn.disabled = true;
        newBtn.innerHTML = '<span class="ida-spinner"></span> Verifying...';

        const result = await verifyOTP(otp);

        if (result.success) {
          showToast('Login successful! Welcome to IDA', 'success');
          navigateAfterLogin(result.user.role);
        } else {
          showToast(result.message, 'error');
          newBtn.disabled = false;
          newBtn.textContent = 'Verify OTP';
        }
      });
    }
  }

  // ===== OTP INPUT HANDLING =====
  function wireOTPDigitInputs() {
    const inputs = document.querySelectorAll('.ida-otp-digit');

    inputs.forEach((input, idx) => {
      // Only allow numbers
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
        if (e.target.value && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
        // Auto-verify when all 6 digits entered
        if (idx === inputs.length - 1 && e.target.value) {
          const otp = Array.from(inputs).map(i => i.value).join('');
          if (otp.length === 6) {
            document.getElementById('idaVerifyBtn').click();
          }
        }
      });

      // Handle backspace
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          inputs[idx - 1].focus();
          inputs[idx - 1].value = '';
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').substring(0, 6);
        pasted.split('').forEach((char, i) => {
          if (inputs[i]) inputs[i].value = char;
        });
        if (pasted.length > 0) {
          const focusIdx = Math.min(pasted.length, inputs.length - 1);
          inputs[focusIdx].focus();
        }
        if (pasted.length === 6) {
          document.getElementById('idaVerifyBtn').click();
        }
      });
    });
  }

  // ===== VERIFY HANDLER =====
  async function handleVerify() {
    const inputs = document.querySelectorAll('.ida-otp-digit');
    const otp = Array.from(inputs).map(i => i.value).join('');

    if (otp.length < 6) {
      showToast('Please enter all 6 digits', 'error');
      return;
    }

    const btn = document.getElementById('idaVerifyBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="ida-spinner"></span> Verifying...';

    const result = await verifyOTP(otp);

    if (result.success) {
      showToast('Login successful! Welcome to IDA', 'success');

      // Remove OTP overlay
      const overlay = document.getElementById('idaOtpOverlay');
      if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
      }

      // Navigate to appropriate screen
      navigateAfterLogin(result.user.role);
    } else {
      showToast(result.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Verify & Login';
      // Clear inputs on wrong OTP
      inputs.forEach(i => i.value = '');
      inputs[0].focus();
    }
  }

  // ===== RESEND TIMER =====
  function startResendTimer() {
    let seconds = 30;
    const timerEl = document.getElementById('idaResendTimer');
    const resendBtn = document.getElementById('idaResendBtn');

    if (!timerEl || !resendBtn) return;

    const interval = setInterval(() => {
      seconds--;
      if (timerEl) timerEl.innerHTML = 'Resend OTP in <strong>' + seconds + 's</strong>';

      if (seconds <= 0) {
        clearInterval(interval);
        if (timerEl) timerEl.style.display = 'none';
        if (resendBtn) resendBtn.style.display = 'inline-block';
      }
    }, 1000);

    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending...';

      const result = await resendOTP();

      if (result.success) {
        showToast('OTP resent!', 'success');
        resendBtn.style.display = 'none';
        timerEl.style.display = 'inline';
        seconds = 30;
        startResendTimer();
      } else {
        showToast(result.message, 'error');
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend OTP';
      }
    });
  }

  // ===== NAVIGATION AFTER LOGIN =====
  function navigateAfterLogin(role) {
    // Try using the app's native showScreen function
    if (typeof window.showScreen === 'function') {
      if (role === 'driver') {
        // Check if KYC is needed
        window.showScreen('driverHomeScreen') || window.showScreen('homeScreen');
      } else {
        window.showScreen('homeScreen');
      }
    } else {
      // Fallback: manually switch screens
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const homeScreen = document.getElementById('homeScreen') || document.getElementById('driverHomeScreen');
      if (homeScreen.classList.add('active');
    }

    // Trigger any existing app login handlers
    if (typeof window.onLoginSuccess === 'function') {
      window.onLoginSuccess({ role: role, phone: localStorage.getItem('ida_auth_phone') });
    }

    // Dispatch custom event for other modules to listen
    window.dispatchEvent(new CustomEvent('ida-login-success', {
      detail: { role: role, phone: localStorage.getItem('ida_auth_phone') }
    }));
  }

  // ===== TOAST HELPER =====
  function showToast(message, type) {
    // Try using app's existing toast
    const existingToast = document.getElementById('toast');
    if (existingToast) {
      existingToast.textContent = message;
      existingToast.className = 'show ' + (type || '');
      existingToast.style.background = type === 'error' ? '#DC2626' : type === 'success' ? '#16A34A' : '#FFD700';
      existingToast.style.color = type === 'success' || type === 'error' ? '#fff' : '#0a0a0a';
      setTimeout(() => { existingToast.className = ''; }, 3000);
      return;
    }

    // Create custom toast
    const toast = document.createElement('div');
    toast.className = 'ida-toast ida-toast-' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ===== INJECT STYLES =====
  function injectAuthStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Firebase Auth Phone Input */
      .ida-firebase-auth {
        width: 100%;
        margin: 16px 0;
      }

      .ida-auth-phone-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .ida-phone-input-wrapper {
        display: flex;
        align-items: center;
        background: #1a1a1a;
        border: 2px solid #333;
        border-radius: 12px;
        overflow: hidden;
        transition: border-color 0.3s;
      }

      .ida-phone-input-wrapper:focus-within {
        border-color: #FFD700;
        box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.15);
      }

      .ida-phone-prefix {
        padding: 14px 12px;
        color: #FFD700;
        font-weight: 700;
        font-size: 16px;
        border-right: 1px solid #333;
        background: rgba(255, 215, 0, 0.05);
        user-select: none;
      }

      .ida-phone-input {
        flex: 1;
        padding: 14px 12px;
        background: transparent;
        border: none;
        color: #fff;
        font-size: 18px;
        font-weight: 500;
        letter-spacing: 1px;
        outline: none;
        font-family: inherit;
      }

      .ida-phone-input::placeholder {
        color: #666;
        font-weight: 400;
        letter-spacing: 0;
      }

      .ida-send-otp-btn {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #FFD700, #B8860B);
        color: #0a0a0a;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .ida-send-otp-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
      }

      .ida-send-otp-btn:disabled {
        opacity: 0.7;
        transform: none;
        cursor: not-allowed;
      }

      /* OTP Overlay */
      .ida-otp-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
        padding: 20px;
        box-sizing: border-box;
      }

      .ida-otp-overlay.active {
        opacity: 1;
      }

      .ida-otp-card {
        background: linear-gradient(145deg, #1a1a1a, #0d0d0d);
        border: 1px solid rgba(255, 215, 0, 0.2);
        border-radius: 24px;
        padding: 32px 24px;
        width: 100%;
        max-width: 380px;
        text-align: center;
        position: relative;
        animation: slideUp 0.4s ease;
      }

      @keyframes slideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .ida-otp-back {
        position: absolute;
        top: 16px;
        left: 16px;
        background: none;
        border: 1px solid #333;
        color: #FFD700;
        font-size: 20px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .ida-otp-back:hover {
        background: rgba(255, 215, 0, 0.1);
        border-color: #FFD700;
      }

      .ida-otp-icon {
        font-size: 48px;
        margin-bottom: 8px;
      }

      .ida-otp-title {
        color: #FFD700;
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 8px;
      }

      .ida-otp-subtitle {
        color: #999;
        font-size: 14px;
        margin: 0 0 24px;
        line-height: 1.4;
      }

      .ida-otp-subtitle strong {
        color: #fff;
      }

      /* OTP Digit Inputs */
      .ida-otp-inputs {
        display: flex;
        gap: 8px;
        justify-content: center;
        margin-bottom: 24px;
      }

      .ida-otp-digit {
        width: 46px;
        height: 54px;
        background: #0a0a0a;
        border: 2px solid #333;
        border-radius: 12px;
        color: #FFD700;
        font-size: 22px;
        font-weight: 700;
        text-align: center;
        outline: none;
        transition: all 0.2s;
        caret-color: #FFD700;
      }

      .ida-otp-digit:focus {
        border-color: #FFD700;
        box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.15);
        background: rgba(255, 215, 0, 0.03);
      }

      .ida-otp-digit:not(:placeholder-shown) {
        border-color: #FFD700;
      }

      /* Verify Button */
      .ida-verify-btn {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #FFD700, #B8860B);
        color: #0a0a0a;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 16px;
      }

      .ida-verify-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
      }

      .ida-verify-btn:disabled {
        opacity: 0.7;
        transform: none;
        cursor: not-allowed;
      }

      /* Footer */
      .ida-otp-footer {
        color: #666;
        font-size: 13px;
      }

      .ida-resend-btn {
        background: none;
        border: none;
        color: #FFD700;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
        text-decoration: underline;
        padding: 4px 8px;
      }

      .ida-resend-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Spinner */
      .ida-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(10, 10, 10, 0.3);
        border-top-color: #0a0a0a;
        border-radius: 50%;
        animation: idaSpin 0.6s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }

      @keyframes idaSpin {
        to { transform: rotate(360deg); }
      }

      /* Toast */
      .ida-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 12px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        z-index: 99999;
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 90%;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }

      .ida-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .ida-toast-success {
        background: #16A34A;
        color: #fff;
      }

      .ida-toast-error {
        background: #DC2626;
        color: #fff;
      }

      .ida-toast-info {
        background: #FFD700;
        color: #0a0a0a;
      }
    `;
    document.head.appendChild(style);
  }

  // ===== AUTO-INIT ON DOM READY =====
  // LAZY LOADING: Only inject styles + UI on page load.
  // Firebase SDK is loaded on-demand when user taps "Send OTP".
  function autoInit() {
    injectAuthStyles();

    // Check if user was previously logged in (without loading Firebase SDK)
    if (localStorage.getItem('ida_logged_in') === 'true') {
      console.log('[IDA Auth] Previous session detected, skipping auth UI');
      // Don't load SDK or show auth - let the app handle navigation
      return;
    }

    // Just wire up the auth UI - SDK loads lazily on first sendOTP call
    injectAuthUI();
    console.log('[IDA Auth] Auth UI ready (Firebase SDK will load on demand)');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(autoInit, 800));
  } else {
    // Small delay to let redesign.js inject the role selector first
    setTimeout(autoInit, 800);
  }

  // ===== EXPOSE PUBLIC API =====
  window.IDAAuth = {
    sendOTP: sendOTP,
    verifyOTP: verifyOTP,
    resendOTP: resendOTP,
    signOut: signOut,
    checkAuthState: checkAuthState,
    init: initFirebaseAuth
  };

})();
