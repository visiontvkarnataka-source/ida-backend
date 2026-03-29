(function() {
  'use strict';

  // ==================== UTILITY FUNCTIONS ====================

  function debounce(fn, delay = 200) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function isLoggedIn() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return false;
    const screenText = (activeScreen.textContent || '').toLowerCase();
    const preLoginKeywords = [
      'get started',
      'how will you use',
      'enter your phone',
      'enter otp',
      'verification (kyc)',
      'driver verification',
      'auto â¢ cab',
      'indian drivers association'
    ];
    return !preLoginKeywords.some(kw => screenText.includes(kw));
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }

  function showElement(el) {
    if (!el) return;
    el.style.removeProperty('display');
  }

  function hideElement(el) {
    if (!el) return;
    el.style.setProperty('display', 'none', 'important');
  }

  // ==================== STYLE INJECTION ====================

  const globalStyles = `
    * {
      transition: color 0.3s ease, background-color 0.3s ease;
    }

    html {
      scroll-behavior: smooth;
    }

    .screen {
      display: none;
    }

    .screen.active {
      display: block !important;
    }

    /* Color palette */
    :root {
      --ida-gold: #FFD700;
      --ida-red: #DC2626;
      --ida-bg: #0a0a0a;
      --ida-card: #1a1a1a;
    }

    /* Gold ripple effect */
    .ripple {
      position: relative;
      overflow: hidden;
    }

    .ripple::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 215, 0, 0.6);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .ripple.active::after {
      animation: rippleEffect 0.6s ease-out;
    }

    @keyframes rippleEffect {
      to {
        width: 300px;
        height: 300px;
        opacity: 0;
      }
    }

    /* Button touch feedback */
    button, .button, [role="button"] {
      transition: transform 0.1s ease;
    }

    button:active, .button:active, [role="button"]:active {
      transform: scale(0.98);
    }

    /* Smooth page transitions */
    .screen {
      animation: fadeInScreen 0.4s ease-in;
    }

    @keyframes fadeInScreen {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Scroll-triggered fade-in */
    .card-fade-in {
      opacity: 0;
      animation: cardFadeIn 0.6s ease-out forwards;
    }

    @keyframes cardFadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Login gradient animation */
    .auth-gradient {
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
      animation: gradientShift 3s ease-in-out infinite;
    }

    @keyframes gradientShift {
      0%, 100% {
        background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
      }
      50% {
        background: linear-gradient(135deg, rgba(220, 38, 38, 0.05) 0%, rgba(255, 215, 0, 0.1) 100%);
      }
    }

    /* Role selector styling */
    .role-selector {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      padding: 16px 0;
      border-bottom: 1px solid rgba(255, 215, 0, 0.2);
    }

    .role-btn {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid rgba(255, 215, 0, 0.3);
      background: rgba(255, 215, 0, 0.05);
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .role-btn:hover {
      border-color: rgba(255, 215, 0, 0.6);
      background: rgba(255, 215, 0, 0.15);
    }

    .role-btn.active {
      border-color: #FFD700;
      background: rgba(255, 215, 0, 0.2);
      color: #FFD700;
      box-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
    }

    /* Bottom nav enhancement */
    nav button, nav [role="button"] {
      transition: all 0.3s ease;
    }

    nav button.active, nav [role="button"].active {
      color: #FFD700;
      border-bottom: 3px solid #FFD700;
    }

    nav button:not(.active), nav [role="button"]:not(.active) {
      color: #999;
    }

    /* Fee breakdown styling */
    .fee-breakdown {
      background: rgba(255, 215, 0, 0.08);
      border: 1px solid rgba(255, 215, 0, 0.2);
      border-radius: 8px;
      padding: 12px;
      margin: 12px 0;
      font-size: 13px;
    }

    .fee-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      color: #ccc;
    }

    .fee-row.total {
      border-top: 1px solid rgba(255, 215, 0, 0.2);
      padding-top: 8px;
      margin-top: 8px;
      color: #FFD700;
      font-weight: 700;
    }

    /* Wallet balance counter */
    .wallet-balance {
      font-size: 32px;
      font-weight: 700;
      color: #FFD700;
    }

    .wallet-balance.animate {
      animation: balanceCounter 0.6s ease-out;
    }

    @keyframes balanceCounter {
      from {
        transform: scale(0.8);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    /* Logo styling */
    .ida-logo {
      height: 40px;
      margin: 12px 0;
      object-fit: contain;
    }

    .header-logo {
      position: absolute;
      top: 12px;
      right: 16px;
      height: 36px;
      object-fit: contain;
    }

    /* Hide promo elements */
    [class*="promo"], [id*="promo"],
    [class*="coupon"], [id*="coupon"],
    [class*="discount"], [id*="discount"] {
      display: none !important;
    }

    /* Bottom sheet on pre-login */
    .bottom-sheet {
      transition: all 0.3s ease;
    }

    .bottom-sheet.hidden {
      display: none !important;
    }
  `;

  addStyle(globalStyles);

  // ==================== MODULE: Role Selector ====================

  class RoleSelector {
    constructor() {
      this.selectedRole = localStorage.getItem('ida_user_role') || null;
      this.injected = false;
      this.handleAuthScreenChange = debounce(() => this.onAuthScreenActive(), 300);
    }

    init() {
      try {
        console.log('[IDA] RoleSelector: Initializing');
        this.setupMutationObserver();
        this.checkCurrentScreen();
      } catch (error) {
        console.error('[IDA] RoleSelector init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleAuthScreenChange);
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class']
      });
    }

    checkCurrentScreen() {
      const authScreen = document.getElementById('authScreen');
      if (authScreen && authScreen.classList.contains('active')) {
        this.onAuthScreenActive();
      }
    }

    onAuthScreenActive() {
      if (this.injected) return;

      const authScreen = document.getElementById('authScreen');
      if (!authScreen) return;

      const phoneInput = authScreen.querySelector('input[type="tel"], input[type="text"][placeholder*="phone"], input[placeholder*="Phone"]');
      if (!phoneInput) return;

      this.injectRoleSelector(phoneInput);
      this.injected = true;
    }

    injectRoleSelector(phoneInput) {
      const existingSelector = document.querySelector('.role-selector');
      if (existingSelector) return;

      const selector = document.createElement('div');
      selector.className = 'role-selector';
      selector.innerHTML = `
        <button class="role-btn" data-role="rider">ð§ Rider</button>
        <button class="role-btn" data-role="driver">ð Driver</button>
      `;

      phoneInput.parentNode.insertBefore(selector, phoneInput);

      const buttons = selector.querySelectorAll('.role-btn');
      buttons.forEach(btn => {
        if (this.selectedRole === btn.dataset.role) {
          btn.classList.add('active');
        }

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedRole = btn.dataset.role;
          localStorage.setItem('ida_user_role', this.selectedRole);
          this.addRippleEffect(btn);
          if (navigator.vibrate) {
            navigator.vibrate(50);
          }
        });
      });
    }

    addRippleEffect(btn) {
      btn.classList.add('ripple', 'active');
      setTimeout(() => {
        btn.classList.remove('active');
      }, 600);
    }

    getSelectedRole() {
      return this.selectedRole;
    }

    destroy() {
      console.log('[IDA] RoleSelector: Destroying');
      const selector = document.querySelector('.role-selector');
      if (selector) {
        selector.remove();
      }
    }
  }

  // ==================== MODULE: Promo Removal ====================

  class PromoRemover {
    constructor() {
      this.isUpdating = false;
      this.handlePromoCheck = debounce(() => this.removePromoElements(), 250);
    }

    init() {
      try {
        console.log('[IDA] PromoRemover: Initializing');
        this.removePromoElements();
        this.setupMutationObserver();
        this.interceptPromoAPI();
      } catch (error) {
        console.error('[IDA] PromoRemover init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handlePromoCheck);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    removePromoElements() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const selectors = [
          '[class*="promo"]',
          '[id*="promo"]',
          '[class*="coupon"]',
          '[id*="coupon"]',
          '[class*="discount"]',
          '[id*="discount"]'
        ];

        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            hideElement(el);
          });
        });

        const textPatterns = ['Promo', 'Coupon', 'Discount', 'Apply Promo'];
        document.body.querySelectorAll('*').forEach(el => {
          const text = el.textContent || '';
          textPatterns.forEach(pattern => {
            if (text.includes(pattern) && el.children.length === 0) {
              hideElement(el);
            }
          });
        });
      } finally {
        this.isUpdating = false;
      }
    }

    interceptPromoAPI() {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0] || '';
        if (typeof url === 'string' && url.includes('/api/promo')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: false, error: 'Promo disabled' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        return originalFetch.apply(this, args);
      };

      const originalXHR = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && url.includes('/api/promo')) {
          this._isPromoRequest = true;
        }
        return originalXHR.apply(this, [method, url, ...rest]);
      };

      const originalSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = function(data) {
        if (this._isPromoRequest) {
          this.addEventListener('loadstart', () => {
            this.status = 400;
            this.responseText = JSON.stringify({ success: false, error: 'Promo disabled' });
            this.dispatchEvent(new ProgressEvent('load'));
          });
          return;
        }
        return originalSend.apply(this, [data]);
      };
    }

    destroy() {
      console.log('[IDA] PromoRemover: Destroying');
    }
  }

  // ==================== MODULE: Wallet Fee ====================

  class WalletFeeHandler {
    constructor() {
      this.isUpdating = false;
      this.platformFeePercent = 2;
      this.handleRechargeScreen = debounce(() => this.setupFeeBreakdown(), 300);
    }

    init() {
      try {
        console.log('[IDA] WalletFeeHandler: Initializing');
        this.setupMutationObserver();
        this.interceptPaymentAPI();
      } catch (error) {
        console.error('[IDA] WalletFeeHandler init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleRechargeScreen);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    setupFeeBreakdown() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const walletScreen = document.getElementById('walletScreen');
        if (!walletScreen || !walletScreen.classList.contains('active')) {
          this.isUpdating = false;
          return;
        }

        const amountInputs = walletScreen.querySelectorAll('input[type="number"], input[type="tel"], input[placeholder*="amount"]');
        amountInputs.forEach(input => {
          if (input._feeHandlerAttached) return;
          input._feeHandlerAttached = true;

          const updateFee = () => {
            const amount = parseFloat(input.value) || 0;
            if (amount <= 0) return;

            let feeBreakdown = input.parentNode.querySelector('.fee-breakdown');
            if (!feeBreakdown) {
              feeBreakdown = document.createElement('div');
              feeBreakdown.className = 'fee-breakdown';
              input.parentNode.insertBefore(feeBreakdown, input.nextSibling);
            }

            const fee = (amount * this.platformFeePercent) / 100;
            const total = amount + fee;

            feeBreakdown.innerHTML = `
              <div class="fee-row">
                <span>Recharge Amount</span>
                <span>â¹${amount.toFixed(2)}</span>
              </div>
              <div class="fee-row">
                <span>Platform Fee (${this.platformFeePercent}%)</span>
                <span>â¹${fee.toFixed(2)}</span>
              </div>
              <div class="fee-row total">
                <span>Total Payable</span>
                <span>â¹${total.toFixed(2)}</span>
              </div>
            `;
          };

          input.addEventListener('input', updateFee);
          input.addEventListener('change', updateFee);
        });
      } finally {
        this.isUpdating = false;
      }
    }

    interceptPaymentAPI() {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0] || '';
        const options = args[1] || {};

        if (typeof url === 'string' && url.includes('/api/payment')) {
          return originalFetch.apply(this, args).then(response => {
            if (response.ok) {
              return response.clone().json().then(data => {
                if (data.amount) {
                  data.platformFee = (data.amount * 2) / 100;
                  data.totalAmount = data.amount + data.platformFee;
                }
                return new Response(JSON.stringify(data), {
                  status: response.status,
                  headers: response.headers
                });
              });
            }
            return response;
          });
        }

        return originalFetch.apply(this, args);
      };
    }

    destroy() {
      console.log('[IDA] WalletFeeHandler: Destroying');
    }
  }

  // ==================== MODULE: Navigation Visibility ====================

  class NavVisibilityHandler {
    constructor() {
      this.isUpdating = false;
      this.handleNavVisibility = debounce(() => this.updateNavVisibility(), 250);
    }

    init() {
      try {
        console.log('[IDA] NavVisibilityHandler: Initializing');
        this.updateNavVisibility();
        this.setupMutationObserver();
      } catch (error) {
        console.error('[IDA] NavVisibilityHandler init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleNavVisibility);
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class']
      });
    }

    updateNavVisibility() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const nav = document.querySelector('nav');
        const sosButton = document.querySelector('[class*="sos"], button[data-sos], [aria-label*="SOS"]');
        const bottomSheets = document.querySelectorAll('.bottom-sheet');

        const loggedIn = isLoggedIn();

        if (nav) {
          if (loggedIn) {
            showElement(nav);
            this.hideQRPayAndVoice(nav);
          } else {
            hideElement(nav);
          }
        }

        if (sosButton) {
          if (loggedIn) {
            showElement(sosButton);
          } else {
            hideElement(sosButton);
          }
        }

        bottomSheets.forEach(sheet => {
          if (loggedIn) {
            sheet.classList.remove('hidden');
            showElement(sheet);
          } else {
            sheet.classList.add('hidden');
            hideElement(sheet);
          }
        });
      } finally {
        this.isUpdating = false;
      }
    }

    hideQRPayAndVoice(nav) {
      const buttons = nav.querySelectorAll('button, [role="button"]');
      const qrPayKeywords = ['qr', 'pay', 'scan'];
      const voiceKeywords = ['voice', 'speak'];

      buttons.forEach(btn => {
        const text = (btn.textContent || '').toLowerCase();
        const isQRPay = qrPayKeywords.some(kw => text.includes(kw));
        const isVoice = voiceKeywords.some(kw => text.includes(kw));

        if (isQRPay || isVoice) {
          hideElement(btn);
        }
      });
    }

    destroy() {
      console.log('[IDA] NavVisibilityHandler: Destroying');
    }
  }

  // ==================== MODULE: Bottom Nav Enhancement ====================

  class BottomNavEnhancer {
    constructor() {
      this.isUpdating = false;
      this.handleNavUpdate = debounce(() => this.enhanceNavBar(), 300);
    }

    init() {
      try {
        console.log('[IDA] BottomNavEnhancer: Initializing');
        this.enhanceNavBar();
        this.setupMutationObserver();
        this.setupScreenChangeListener();
      } catch (error) {
        console.error('[IDA] BottomNavEnhancer init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleNavUpdate);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    setupScreenChangeListener() {
      const observer = new MutationObserver(() => {
        this.updateActiveNavItem();
      });

      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class']
      });
    }

    enhanceNavBar() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const nav = document.querySelector('nav');
        if (!nav) {
          this.isUpdating = false;
          return;
        }

        const buttons = nav.querySelectorAll('button, [role="button"]');
        const navItems = ['Home', 'Rides', 'Wallet', 'Profile', 'Earnings'];

        buttons.forEach(btn => {
          const text = btn.textContent.trim();
          const isNavItem = navItems.some(item => text.toLowerCase().includes(item.toLowerCase()));

          if (isNavItem) {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              this.updateActiveNavItem();
              if (navigator.vibrate) {
                navigator.vibrate(30);
              }
            });

            if (!btn._enhancementDone) {
              btn.classList.add('ripple');
              btn._enhancementDone = true;
            }
          }
        });

        this.updateActiveNavItem();
      } finally {
        this.isUpdating = false;
      }
    }

    updateActiveNavItem() {
      const nav = document.querySelector('nav');
      if (!nav) return;

      const buttons = nav.querySelectorAll('button, [role="button"]');
      buttons.forEach(btn => btn.classList.remove('active'));

      const activeScreen = document.querySelector('.screen.active');
      if (!activeScreen) return;

      const screenId = activeScreen.id;
      let activeNavIndex = -1;

      if (screenId === 'homeScreen') activeNavIndex = 0;
      else if (screenId === 'ridesScreen') activeNavIndex = 1;
      else if (screenId === 'walletScreen') activeNavIndex = 3;
      else if (screenId === 'profileScreen' || screenId === 'earningsScreen') activeNavIndex = 4;

      if (activeNavIndex >= 0 && buttons[activeNavIndex]) {
        buttons[activeNavIndex].classList.add('active');
      }
    }

    destroy() {
      console.log('[IDA] BottomNavEnhancer: Destroying');
    }
  }

  // ==================== MODULE: Logo Handler ====================

  class LogoHandler {
    constructor() {
      this.logoUrl = 'Modern%20Indian%20Drivers%20Association%20logo.png';
      this.isUpdating = false;
      this.handleLogoInject = debounce(() => this.injectLogos(), 300);
    }

    init() {
      try {
        console.log('[IDA] LogoHandler: Initializing');
        this.injectLogos();
        this.setupMutationObserver();
      } catch (error) {
        console.error('[IDA] LogoHandler init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleLogoInject);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    injectLogos() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) {
          this.isUpdating = false;
          return;
        }

        const preLoginScreens = ['splashScreen', 'authScreen', 'roleSelectScreen', 'kycScreen'];
        const screenId = activeScreen.id;

        if (preLoginScreens.includes(screenId)) {
          this.injectAuthLogo(activeScreen);
        }

        this.injectHeaderLogo();
      } finally {
        this.isUpdating = false;
      }
    }

    injectAuthLogo(screen) {
      if (screen.querySelector('.ida-logo')) return;

      const logo = document.createElement('img');
      logo.className = 'ida-logo';
      logo.src = this.logoUrl;
      logo.alt = 'IDA Logo';

      const firstChild = screen.firstChild;
      if (firstChild) {
        screen.insertBefore(logo, firstChild);
      } else {
        screen.appendChild(logo);
      }
    }

    injectHeaderLogo() {
      const header = document.querySelector('header, [role="banner"], .header, .top-bar');
      if (!header || header.querySelector('.header-logo')) return;

      const logo = document.createElement('img');
      logo.className = 'header-logo';
      logo.src = this.logoUrl;
      logo.alt = 'IDA';

      header.appendChild(logo);
    }

    destroy() {
      console.log('[IDA] LogoHandler: Destroying');
      document.querySelectorAll('.ida-logo, .header-logo').forEach(el => el.remove());
    }
  }

  // ==================== MODULE: Animations ====================

  class AnimationHandler {
    constructor() {
      this.isUpdating = false;
      this.handleAnimations = debounce(() => this.setupAnimations(), 300);
    }

    init() {
      try {
        console.log('[IDA] AnimationHandler: Initializing');
        this.setupAnimations();
        this.setupMutationObserver();
        this.setupScrollTrigger();
      } catch (error) {
        console.error('[IDA] AnimationHandler init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleAnimations);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    setupAnimations() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) {
          this.isUpdating = false;
          return;
        }

        // Button ripple setup
        activeScreen.querySelectorAll('button, [role="button"]').forEach(btn => {
          if (btn._rippleSetup) return;
          btn._rippleSetup = true;

          btn.addEventListener('click', (e) => {
            btn.classList.add('ripple', 'active');
            setTimeout(() => btn.classList.remove('active'), 600);
          });
        });

        // Wallet balance counter
        const walletBalance = activeScreen.querySelector('.wallet-balance, [class*="balance"]');
        if (walletBalance) {
          walletBalance.classList.add('animate');
          setTimeout(() => walletBalance.classList.remove('animate'), 600);
        }

        // Auth gradient
        const authScreen = document.getElementById('authScreen');
        if (authScreen && authScreen.classList.contains('active')) {
          authScreen.classList.add('auth-gradient');
        }
      } finally {
        this.isUpdating = false;
      }
    }

    setupScrollTrigger() {
      if (!window.IntersectionObserver) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('card-fade-in');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });

      const observeCards = () => {
        document.querySelectorAll('.card, [class*="card"]').forEach(card => {
          if (!card.classList.contains('card-fade-in')) {
            observer.observe(card);
          }
        });
      };

      observeCards();

      const mutationObserver = new MutationObserver(observeCards);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    destroy() {
      console.log('[IDA] AnimationHandler: Destroying');
    }
  }

  // ==================== MODULE: Haptic Feedback ====================

  class HapticFeedback {
    constructor() {
      this.isUpdating = false;
      this.handleHapticSetup = debounce(() => this.setupHaptics(), 300);
    }

    init() {
      try {
        console.log('[IDA] HapticFeedback: Initializing');
        this.setupHaptics();
        this.setupMutationObserver();
      } catch (error) {
        console.error('[IDA] HapticFeedback init error:', error);
      }
    }

    setupMutationObserver() {
      const observer = new MutationObserver(this.handleHapticSetup);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    setupHaptics() {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        if (!navigator.vibrate) {
          this.isUpdating = false;
          return;
        }

        document.querySelectorAll('button, [role="button"]').forEach(btn => {
          if (btn._hapticSetup) return;
          btn._hapticSetup = true;

          btn.addEventListener('click', () => {
            navigator.vibrate(50);
          });

          btn.addEventListener('touchstart', () => {
            navigator.vibrate(20);
          });
        });
      } finally {
        this.isUpdating = false;
      }
    }

    destroy() {
      console.log('[IDA] HapticFeedback: Destroying');
    }
  }

  // ==================== MASTER INITIALIZER ====================

  class IDAEnhancer {
    constructor() {
      this.modules = [];
      this.initialized = false;
    }

    init() {
      if (this.initialized) {
        console.warn('[IDA] Already initialized');
        return;
      }

      console.log('[IDA] Initializing all modules...');

      try {
        const roleSelector = new RoleSelector();
        roleSelector.init();
        this.modules.push(roleSelector);

        const promoRemover = new PromoRemover();
        promoRemover.init();
        this.modules.push(promoRemover);

        const walletFee = new WalletFeeHandler();
        walletFee.init();
        this.modules.push(walletFee);

        const navVisibility = new NavVisibilityHandler();
        navVisibility.init();
        this.modules.push(navVisibility);

        const navEnhancer = new BottomNavEnhancer();
        navEnhancer.init();
        this.modules.push(navEnhancer);

        const logoHandler = new LogoHandler();
        logoHandler.init();
        this.modules.push(logoHandler);

        const animationHandler = new AnimationHandler();
        animationHandler.init();
        this.modules.push(animationHandler);

        const hapticFeedback = new HapticFeedback();
        hapticFeedback.init();
        this.modules.push(hapticFeedback);

        this.initialized = true;
        console.log('[IDA] All modules initialized successfully');
        console.log('[IDA] Enhancement script active - v1.0.0');
      } catch (error) {
        console.error('[IDA] Critical initialization error:', error);
      }
    }

    destroy() {
      console.log('[IDA] Destroying all modules...');
      this.modules.forEach(module => {
        try {
          if (module.destroy) {
            module.destroy();
          }
        } catch (error) {
          console.error('[IDA] Error destroying module:', error);
        }
      });
      this.modules = [];
      this.initialized = false;
    }
  }

  // ==================== STARTUP ====================

  const enhancer = new IDAEnhancer();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enhancer.init();
    });
  } else {
    enhancer.init();
  }

  // Expose for debugging/control
  window.IDAEnhancer = enhancer;

  // Auto-initialize on window load as fallback
  window.addEventListener('load', () => {
    if (!enhancer.initialized) {
      enhancer.init();
    }
  });

})();
