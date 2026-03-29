/**
 * IDA - Indian Drivers Association App Redesign & Enhancement Script
 *
 * Features:
 * 1. Promo code UI removal
 * 2. 2% platform fee display on wallet recharge
 * 3. Particle background effect
 * 4. Page transition animations
 * 5. Scroll-triggered card animations
 * 6. Button ripple effect
 * 7. Counter animation for wallet balance
 * 8. Bottom navigation enhancement
 * 9. Smooth scroll and haptic feedback
 * 10. Login screen gradient animation
 */

(function() {
  'use strict';

  // ============================================================================
  // Configuration & Constants
  // ============================================================================

  const CONFIG = {
    platformFeePercent: 2,
    particleColor: '#3B82F6',
    particleColorAlt: '#FFFFFF',
    particleOpacity: 0.6,
    animationDuration: 300,
    rippleDuration: 600,
    countAnimationDuration: 1000,
  };

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Check if an element is visible in the DOM
   */
  function isElementVisible(element) {
    return element && element.offsetParent !== null;
  }

  /**
   * Safely calculate 2% fee with precise paise rounding
   */
  function calculatePlatformFee(amount) {
    const fee = amount * (CONFIG.platformFeePercent / 100);
    return Math.ceil(fee); // Round up to nearest paisa
  }

  /**
   * Find all elements containing specific text
   */
  function findElementsByText(text, options = {}) {
    const { partial = false, tagName = '*' } = options;
    const elements = [];
    const regex = partial ? new RegExp(text, 'i') : new RegExp(`^${text}$`, 'i');

    document.querySelectorAll(tagName).forEach(el => {
      if (regex.test(el.textContent || el.innerText || '')) {
        elements.push(el);
      }
    });

    return elements;
  }

  /**
   * Find elements by multiple attributes
   */
  function findElementsByAttributes(selectors) {
    let results = [];
    selectors.forEach(selector => {
      results.push(...document.querySelectorAll(selector));
    });
    return results;
  }

  /**
   * Request animation frame with fallback
   */
  function animationFrame(callback) {
    return window.requestAnimationFrame(callback) || setTimeout(callback, 16);
  }

  /**
   * Emit haptic feedback if available
   */
  function hapticFeedback() {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  // ============================================================================
  // 1. Promo Code UI Removal
  // ============================================================================

  class PromoCodeRemover {
    constructor() {
      this.promoSelectors = [
        '[placeholder*="promo" i]',
        '[placeholder*="coupon" i]',
        '[placeholder*="discount" i]',
        'input[type="text"][class*="promo" i]',
        'input[type="text"][class*="coupon" i]',
        'button:contains("Apply"):has(+ input[placeholder*="promo" i])',
        'button:contains("Apply Promo")i',
        'button:contains("Apply Code")i',
        '[class*="promo" i]',
        '[id*="promo" i]',
        'label:contains("Promo Discount")i',
      ];

      this.observer = null;
    }

    /**
     * Hide promo elements
     */
    hide() {
      // Find and hide promo input fields
      const promoInputs = document.querySelectorAll(
        'input[placeholder*="promo" i], ' +
        'input[placeholder*="coupon" i], ' +
        'input[placeholder*="discount" i], ' +
        'input[class*="promo" i], ' +
        'input[class*="coupon" i]'
      );
      promoInputs.forEach(input => {
        this.hideElement(input);
      });

      // Find and hide promo sections/containers
      const promoContainers = document.querySelectorAll(
        '[class*="promo" i], ' +
        '[id*="promo" i], ' +
        '[class*="coupon" i]'
      );
      promoContainers.forEach(container => {
        // Only hide if it's actually a promo-related element
        if (this.isPromoElement(container)) {
          this.hideElement(container);
        }
      });

      // Find and hide text nodes containing "Promo Discount"
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      const nodesToHide = [];
      while (node = walker.nextNode()) {
        if (/promo discount|apply promo|promo code|coupon/i.test(node.textContent)) {
          nodesToHide.push(node.parentElement);
        }
      }
      nodesToHide.forEach(el => this.hideElement(el));

      // Find and hide "Apply" buttons near promo inputs
      const applyButtons = document.querySelectorAll('button');
      applyButtons.forEach(btn => {
        if (/apply|redeem|coupon|promo/i.test(btn.textContent)) {
          const nearby = btn.parentElement?.querySelector('input[placeholder*="promo" i]') ||
                        btn.parentElement?.querySelector('input[placeholder*="coupon" i]');
          if (nearby) {
            this.hideElement(btn);
          }
        }
      });
    }

    /**
     * Check if element is actually promo-related
     */
    isPromoElement(element) {
      const text = (element.textContent || '').toLowerCase();
      const classes = (element.className || '').toLowerCase();
      const id = (element.id || '').toLowerCase();

      return /(promo|coupon|discount|code)/i.test(text + classes + id);
    }

    /**
     * Safely hide an element
     */
    hideElement(element) {
      if (!element) return;

      element.style.display = 'none';
      element.style.visibility = 'hidden';
      element.style.height = '0';
      element.style.opacity = '0';
      element.setAttribute('aria-hidden', 'true');
    }

    /**
     * Setup MutationObserver for dynamically added promo elements
     */
    observeDOMChanges() {
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                if (this.isPromoElement(node)) {
                  this.hideElement(node);
                }
              }
            });
          }
        });
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'style', 'placeholder'],
      });
    }

    /**
     * Initialize promo code remover
     */
    init() {
      this.hide();
      this.observeDOMChanges();
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // ============================================================================
  // 2. Platform Fee Display on Wallet Recharge
  // ============================================================================

  class WalletFeeCalculator {
    constructor() {
      this.presetAmounts = [100, 200, 500, 1000, 2000, 5000];
      this.selectedAmount = null;
      this.feeBreakdownElement = null;
      this.observer = null;
    }

    /**
     * Create fee breakdown UI
     */
    createFeeBreakdown(amount) {
      const fee = calculatePlatformFee(amount);
      const total = amount + fee;

      const breakdownHTML = `
        <div class="ida-fee-breakdown" style="
          margin: 12px 0;
          padding: 14px 16px;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 12px;
          font-size: 14px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          backdrop-filter: blur(8px);
          animation: fadeInUp 0.3s ease-out;
        ">
          <div style="
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
          ">
            <span style="color: #9ca3af;">Recharge Amount</span>
            <span style="font-weight: 500; color: #e5e7eb;">â¹${amount}</span>
          </div>
          <div style="
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
          ">
            <span style="color: #9ca3af;">Platform Fee (${CONFIG.platformFeePercent}%)</span>
            <span style="font-weight: 500; color: #f59e0b;">â¹${fee}</span>
          </div>
          <div style="
            display: flex;
            justify-content: space-between;
            padding-top: 4px;
          ">
            <span style="color: #d1d5db; font-weight: 600;">Total Payable</span>
            <span style="font-weight: 700; color: #3b82f6; font-size: 16px;">â¹${total}</span>
          </div>
        </div>
      `;

      return breakdownHTML;
    }

    /**
     * Update or create fee breakdown element
     */
    updateFeeBreakdown(amount) {
      this.selectedAmount = amount;

      // Remove existing breakdown
      const existing = document.querySelector('.ida-fee-breakdown');
      if (existing) {
        existing.remove();
      }

      // Find the wallet add money form/section
      const walletAddMoneySection = this.findWalletAddMoneySection();
      if (!walletAddMoneySection) return;

      // Create new breakdown
      const breakdownContainer = document.createElement('div');
      breakdownContainer.innerHTML = this.createFeeBreakdown(amount);

      // Insert after amount selection or before submit button
      const submitButton = walletAddMoneySection.querySelector('button[type="submit"], button:contains("Pay"):contains("Add"):contains("Recharge")');
      if (submitButton) {
        submitButton.parentElement.insertBefore(breakdownContainer.firstElementChild, submitButton);
      } else {
        walletAddMoneySection.appendChild(breakdownContainer.firstElementChild);
      }
    }

    /**
     * Find wallet add money section
     */
    findWalletAddMoneySection() {
      const selectors = [
        '[class*="wallet" i]',
        '[id*="wallet" i]',
        '[class*="add-money" i]',
        '[id*="add-money" i]',
        '[class*="recharge" i]',
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (/wallet|add money|recharge|topup/i.test(el.textContent)) {
            return el;
          }
        }
      }

      return null;
    }

    /**
     * Find preset amount buttons
     */
    findPresetAmountButtons() {
      const buttons = [];

      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent?.trim();
        if (this.presetAmounts.some(amount => text === `â¹${amount}` || text === amount.toString())) {
          buttons.push(btn);
        }
      });

      return buttons;
    }

    /**
     * Find custom amount input
     */
    findCustomAmountInput() {
      const selectors = [
        'input[type="number"][placeholder*="amount" i]',
        'input[type="text"][placeholder*="amount" i]',
        'input[type="number"][placeholder*="enter" i]',
        'input[type="text"][placeholder*="enter" i]',
      ];

      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input) return input;
      }

      return null;
    }

    /**
     * Intercept fetch calls to add 2% platform fee on wallet recharge
     * Monkey-patches window.fetch to intercept /api/payments/create-order
     */
    interceptRazorpayPayment() {
      const self = this;
      const originalFetch = window.fetch;

      window.fetch = function(url, options) {
        // Intercept wallet recharge payment creation
        if (typeof url === 'string' && url.includes('/api/payments/create-order') && self.selectedAmount) {
          try {
            const body = JSON.parse(options?.body || '{}');
            if (body.amount) {
              const fee = calculatePlatformFee(body.amount);
              body.amount = body.amount + fee; // Add 2% platform fee
              body._platformFee = fee;
              body._originalAmount = body.amount - fee;
              options = { ...options, body: JSON.stringify(body) };
              console.log('[IDA] Platform fee applied:', { original: body._originalAmount, fee, total: body.amount });
            }
          } catch (e) {
            console.warn('[IDA] Could not parse payment body:', e);
          }
        }

        // Also intercept promo code validation to always fail
        if (typeof url === 'string' && url.includes('/api/promo/validate')) {
          return Promise.resolve(new Response(JSON.stringify({
            success: false,
            error: 'Promo codes are no longer available'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }

        return originalFetch.apply(this, [url, options]);
      };

      // Also intercept XMLHttpRequest for older code paths
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._idaUrl = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
      };

      XMLHttpRequest.prototype.send = function(body) {
        if (this._idaUrl && this._idaUrl.includes('/api/payments/create-order') && self.selectedAmount) {
          try {
            const parsed = JSON.parse(body);
            if (parsed.amount) {
              const fee = calculatePlatformFee(parsed.amount);
              parsed.amount = parsed.amount + fee;
              body = JSON.stringify(parsed);
            }
          } catch (e) { /* ignore */ }
        }

        if (this._idaUrl && this._idaUrl.includes('/api/promo/validate')) {
          // Fake a successful response with promo disabled
          const self2 = this;
          setTimeout(() => {
            Object.defineProperty(self2, 'responseText', { value: JSON.stringify({ success: false, error: 'Promo codes are no longer available' }) });
            Object.defineProperty(self2, 'status', { value: 200 });
            Object.defineProperty(self2, 'readyState', { value: 4 });
            self2.onreadystatechange && self2.onreadystatechange();
            self2.onload && self2.onload();
          }, 50);
          return;
        }

        return originalXHRSend.apply(this, [body]);
      };
    }

    /**
     * Setup event listeners for preset amounts
     */
    setupPresetAmountListeners() {
      const presetButtons = this.findPresetAmountButtons();
      presetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const text = btn.textContent?.trim().replace('â¹', '');
          const amount = parseInt(text, 10);

          if (!isNaN(amount)) {
            this.updateFeeBreakdown(amount);
            hapticFeedback();
          }
        });
      });

      // Listen for custom amount input
      const customInput = this.findCustomAmountInput();
      if (customInput) {
        let inputTimeout;
        customInput.addEventListener('input', (e) => {
          clearTimeout(inputTimeout);
          inputTimeout = setTimeout(() => {
            const amount = parseInt(e.target.value, 10);
            if (!isNaN(amount) && amount > 0) {
              this.updateFeeBreakdown(amount);
            }
          }, 300);
        });
      }
    }

    /**
     * Observe wallet section for changes
     */
    observeWalletSection() {
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            this.setupPresetAmountListeners();
          }
        });
      });

      const walletSection = this.findWalletAddMoneySection();
      if (walletSection) {
        this.observer.observe(walletSection, {
          childList: true,
          subtree: true,
        });
      }
    }

    /**
     * Initialize wallet fee calculator
     */
    init() {
      this.setupPresetAmountListeners();
      this.observeWalletSection();
      this.interceptRazorpayPayment();
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // ============================================================================
  // 3. Particle Background Effect
  // ============================================================================

  class ParticleBackground {
    constructor(containerId = null) {
      this.containerId = containerId;
      this.canvas = null;
      this.ctx = null;
      this.particles = [];
      this.animationId = null;
      this.particleCount = 50;
      this.connectionDistance = 150;
      this.particleRadius = 2;
      this.particleVelocity = 0.5;
    }

    /**
     * Initialize particle system
     */
    init() {
      this.createCanvas();
      this.createParticles();
      this.animate();
      window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * Create canvas element
     */
    createCanvas() {
      const container = this.containerId
        ? document.getElementById(this.containerId)
        : document.body;

      if (!container) return;

      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'fixed';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.zIndex = '-1';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.background = 'transparent';

      container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.resizeCanvas();
    }

    /**
     * Resize canvas to match window
     */
    resizeCanvas() {
      if (!this.canvas) return;

      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    /**
     * Handle window resize
     */
    handleResize() {
      this.resizeCanvas();
    }

    /**
     * Create particles
     */
    createParticles() {
      this.particles = [];

      for (let i = 0; i < this.particleCount; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          vx: (Math.random() - 0.5) * this.particleVelocity,
          vy: (Math.random() - 0.5) * this.particleVelocity,
          radius: this.particleRadius,
          color: Math.random() > 0.5 ? CONFIG.particleColor : CONFIG.particleColorAlt,
          opacity: CONFIG.particleOpacity,
        });
      }
    }

    /**
     * Update particle positions
     */
    updateParticles() {
      this.particles.forEach(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges
        if (particle.x < 0) particle.x = this.canvas.width;
        if (particle.x > this.canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = this.canvas.height;
        if (particle.y > this.canvas.height) particle.y = 0;
      });
    }

    /**
     * Draw particles
     */
    drawParticles() {
      this.particles.forEach(particle => {
        this.ctx.fillStyle = `rgba(59, 130, 246, ${particle.opacity})`;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        this.ctx.fill();
      });
    }

    /**
     * Draw connection lines between nearby particles
     */
    drawConnections() {
      this.ctx.strokeStyle = `rgba(59, 130, 246, 0.2)`;
      this.ctx.lineWidth = 1;

      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const dx = this.particles[i].x - this.particles[j].x;
          const dy = this.particles[i].y - this.particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < this.connectionDistance) {
            const opacity = 1 - (distance / this.connectionDistance);
            this.ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.3})`;
            this.ctx.beginPath();
            this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
            this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
            this.ctx.stroke();
          }
        }
      }
    }

    /**
     * Animation loop
     */
    animate() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.updateParticles();
      this.drawConnections();
      this.drawParticles();

      this.animationId = animationFrame(() => this.animate());
    }

    /**
     * Destroy particle system
     */
    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
      if (this.canvas) {
        this.canvas.remove();
      }
    }
  }

  // ============================================================================
  // 4. Page Transition Animations
  // ============================================================================

  class PageTransitionAnimator {
    constructor() {
      this.currentPage = null;
      this.observer = null;
    }

    /**
     * Add slide-in animation CSS
     */
    addAnimationStyles() {
      if (document.getElementById('ida-transition-styles')) return;

      const style = document.createElement('style');
      style.id = 'ida-transition-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideOutLeft {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(-30px);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .ida-page-enter {
          animation: slideInRight ${CONFIG.animationDuration}ms ease-out forwards;
        }

        .ida-page-exit {
          animation: slideOutLeft ${CONFIG.animationDuration}ms ease-in forwards;
        }
      `;

      document.head.appendChild(style);
    }

    /**
     * Detect page changes
     */
    detectPageChanges() {
      const pages = document.querySelectorAll(
        '[role="main"], main, .page, [class*="page" i], [class*="screen" i]'
      );

      pages.forEach(page => {
        const isVisible = page.style.display !== 'none' &&
                         page.offsetHeight > 0 &&
                         getComputedStyle(page).visibility !== 'hidden';

        if (isVisible && page !== this.currentPage) {
          this.animatePageEnter(page);
          this.currentPage = page;
        }
      });
    }

    /**
     * Animate page enter
     */
    animatePageEnter(page) {
      page.classList.remove('ida-page-exit');
      page.classList.add('ida-page-enter');
      hapticFeedback();

      setTimeout(() => {
        page.classList.remove('ida-page-enter');
      }, CONFIG.animationDuration);
    }

    /**
     * Animate page exit
     */
    animatePageExit(page) {
      page.classList.remove('ida-page-enter');
      page.classList.add('ida-page-exit');
    }

    /**
     * Observe page changes
     */
    observePageChanges() {
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            this.detectPageChanges();
          }
        });
      });

      this.observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    /**
     * Initialize page transition animator
     */
    init() {
      this.addAnimationStyles();
      this.detectPageChanges();
      this.observePageChanges();
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // ============================================================================
  // 5. Scroll-Triggered Card Animations
  // ============================================================================

  class ScrollCardAnimator {
    constructor() {
      this.observer = null;
      this.observedCards = new Set();
    }

    /**
     * Add card animation styles
     */
    addAnimationStyles() {
      if (document.getElementById('ida-card-animation-styles')) return;

      const style = document.createElement('style');
      style.id = 'ida-card-animation-styles';
      style.textContent = `
        @keyframes fadeUpCard {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ida-card-animated {
          animation: fadeUpCard 600ms ease-out forwards;
        }

        .ida-card-stagger-1 { animation-delay: 0ms; }
        .ida-card-stagger-2 { animation-delay: 100ms; }
        .ida-card-stagger-3 { animation-delay: 200ms; }
        .ida-card-stagger-4 { animation-delay: 300ms; }
        .ida-card-stagger-5 { animation-delay: 400ms; }
      `;

      document.head.appendChild(style);
    }

    /**
     * Find cards to animate
     */
    findCards() {
      const selectors = [
        '[class*="card" i]',
        '[role="article"]',
        '.ride-item',
        '.history-item',
        '[class*="item" i]:not(nav *)',
      ];

      let cards = [];
      selectors.forEach(selector => {
        cards.push(...document.querySelectorAll(selector));
      });

      return [...new Set(cards)]; // Remove duplicates
    }

    /**
     * Animate card when it enters viewport
     */
    animateCard(card) {
      if (this.observedCards.has(card)) return;

      this.observedCards.add(card);

      const staggerIndex = Array.from(card.parentElement?.children || []).indexOf(card);
      const staggerClass = `ida-card-stagger-${Math.min(staggerIndex + 1, 5)}`;

      card.classList.add('ida-card-animated', staggerClass);
    }

    /**
     * Setup IntersectionObserver for cards
     */
    setupIntersectionObserver() {
      const options = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      };

      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.animateCard(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      }, options);

      const cards = this.findCards();
      cards.forEach(card => this.observer.observe(card));
    }

    /**
     * Observe DOM for new cards
     */
    observeNewCards() {
      const domObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) { // Element node
                const cards = node.querySelectorAll('[class*="card" i], [role="article"], .ride-item, .history-item');
                cards.forEach(card => {
                  if (this.observer && !this.observedCards.has(card)) {
                    this.observer.observe(card);
                  }
                });
              }
            });
          }
        });
      });

      domObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    /**
     * Initialize scroll card animator
     */
    init() {
      this.addAnimationStyles();
      this.setupIntersectionObserver();
      this.observeNewCards();
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // ============================================================================
  // 6. Button Ripple Effect
  // ============================================================================

  class ButtonRippleEffect {
    constructor() {
      this.rippleSelector = 'button, [role="button"], a[href]:not([href^="#"])';
    }

    /**
     * Add ripple effect styles
     */
    addRippleStyles() {
      if (document.getElementById('ida-ripple-styles')) return;

      const style = document.createElement('style');
      style.id = 'ida-ripple-styles';
      style.textContent = `
        @keyframes ripple {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }

        .ida-ripple-container {
          position: relative;
          overflow: hidden;
        }

        .ida-ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          pointer-events: none;
          animation: ripple ${CONFIG.rippleDuration}ms ease-out;
        }
      `;

      document.head.appendChild(style);
    }

    /**
     * Create ripple effect at click position
     */
    createRipple(event) {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();

      // Make sure container has position relative
      if (getComputedStyle(button).position === 'static') {
        button.style.position = 'relative';
      }

      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const ripple = document.createElement('span');
      ripple.className = 'ida-ripple';
      ripple.style.width = ripple.style.height = '20px';
      ripple.style.left = `${x - 10}px`;
      ripple.style.top = `${y - 10}px`;

      button.appendChild(ripple);

      setTimeout(() => ripple.remove(), CONFIG.rippleDuration);
    }

    /**
     * Add ripple listeners to buttons
     */
    setupRippleListeners() {
      const buttons = document.querySelectorAll(this.rippleSelector);
      buttons.forEach(btn => {
        if (!btn.dataset.rippleEnabled) {
          btn.addEventListener('click', (e) => this.createRipple(e), { passive: true });
          btn.dataset.rippleEnabled = 'true';
        }
      });
    }

    /**
     * Observe for new buttons
     */
    observeNewButtons() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) { // Element node
                this.setupRippleListeners();
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    /**
     * Initialize button ripple effect
     */
    init() {
      this.addRippleStyles();
      this.setupRippleListeners();
      this.observeNewButtons();
    }
  }

  // ============================================================================
  // 7. Counter Animation for Wallet Balance
  // ============================================================================

  class WalletBalanceCounter {
    constructor() {
      this.observer = null;
      this.currentBalance = 0;
    }

    /**
     * Animate number counter
     */
    animateCounter(element, fromValue, toValue, duration = CONFIG.countAnimationDuration) {
      const startTime = performance.now();
      const startValue = fromValue;
      const difference = toValue - fromValue;

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const currentValue = Math.floor(startValue + difference * progress);
        element.textContent = `â¹${currentValue}`;

        if (progress < 1) {
          animationFrame(animate);
        } else {
          element.textContent = `â¹${toValue}`;
        }
      };

      animationFrame(animate);
    }

    /**
     * Find wallet balance element
     */
    findWalletBalanceElement() {
      const selectors = [
        '[class*="wallet" i] [class*="balance" i]',
        '[id*="wallet" i] [class*="balance" i]',
        '[class*="balance" i]',
      ];

      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element && /â¹\d+/.test(element.textContent)) {
            return element;
          }
        } catch(e) { /* skip invalid selectors */ }
      }

      // Fallback: manually find spans containing â¹
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (/â¹\d+/.test(span.textContent)) {
          return span;
        }
      }

      return null;
    }

    /**
     * Extract numeric value from balance text
     */
    extractBalance(text) {
      const match = text.match(/â¹(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Observe wallet balance changes
     */
    observeBalanceChanges() {
      const balanceElement = this.findWalletBalanceElement();
      if (!balanceElement) return;

      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'characterData' || mutation.type === 'childList') {
            const newBalance = this.extractBalance(balanceElement.textContent);

            if (newBalance !== this.currentBalance && newBalance > 0) {
              this.animateCounter(balanceElement, this.currentBalance, newBalance);
              this.currentBalance = newBalance;
            }
          }
        });
      });

      this.currentBalance = this.extractBalance(balanceElement.textContent);

      this.observer.observe(balanceElement, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    }

    /**
     * Initialize wallet balance counter
     */
    init() {
      this.observeBalanceChanges();

      // Retry if wallet balance element not found yet
      if (!this.observer) {
        setTimeout(() => this.init(), 1000);
      }
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // ============================================================================
  // 8. Bottom Navigation Enhancement
  // ============================================================================

  class BottomNavEnhancer {
    constructor() {
      this.navItems = [
        { icon: 'ð ', label: 'Home', id: 'nav-home' },
        { icon: 'ð', label: 'Rides', id: 'nav-rides' },
        { icon: 'ð°', label: 'Earnings', id: 'nav-earnings' },
        { icon: 'ð¤', label: 'Profile', id: 'nav-profile' },
      ];

      this.hiddenItems = ['qr-pay', 'voice', 'qr'];
    }

    /**
     * Find bottom navigation element
     */
    findBottomNav() {
      const selectors = [
        'nav:last-of-type',
        '[role="navigation"]:last-of-type',
        '[class*="bottom-nav" i]',
        '[class*="tab-bar" i]',
        '[class*="navbar" i]:last-of-type',
      ];

      for (const selector of selectors) {
        const nav = document.querySelector(selector);
        if (nav && nav.querySelector('button, [role="button"], a')) {
          return nav;
        }
      }

      return null;
    }

    /**
     * Get current nav items
     */
    getCurrentNavItems() {
      const nav = this.findBottomNav();
      if (!nav) return [];

      return Array.from(nav.querySelectorAll('button, [role="button"], a, li'));
    }

    /**
     * Hide specific nav items
     */
    hideNavItems() {
      const nav = this.findBottomNav();
      if (!nav) return;

      const items = this.getCurrentNavItems();
      items.forEach(item => {
        const text = (item.textContent || '').toLowerCase();
        if (this.hiddenItems.some(hiddenItem => text.includes(hiddenItem))) {
          item.style.display = 'none';
          item.style.visibility = 'hidden';
          item.setAttribute('aria-hidden', 'true');
        }
      });
    }

    /**
     * Find earnings/dashboard button and ensure it's labeled correctly
     */
    enhanceEarningsItem() {
      const nav = this.findBottomNav();
      if (!nav) return;

      const items = this.getCurrentNavItems();
      items.forEach(item => {
        const text = (item.textContent || '').toLowerCase();

        if (text.includes('earn') || text.includes('dashboard') || text.includes('history')) {
          item.innerHTML = 'ð° Earnings';
          item.style.display = '';
          item.style.visibility = '';
        }

        if (text.includes('home')) {
          item.innerHTML = 'ð  Home';
        }

        if (text.includes('ride')) {
          item.innerHTML = 'ð Rides';
        }

        if (text.includes('profile') || text.includes('account')) {
          item.innerHTML = 'ð¤ Profile';
        }
      });
    }

    /**
     * Add click handlers for nav items
     */
    addNavHandlers() {
      const nav = this.findBottomNav();
      if (!nav) return;

      const items = this.getCurrentNavItems();
      items.forEach(item => {
        item.addEventListener('click', (e) => {
          items.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          hapticFeedback();
        });
      });
    }

    /**
     * Initialize bottom nav enhancement
     */
    init() {
      this.hideNavItems();
      this.enhanceEarningsItem();
      this.addNavHandlers();

      // Observe for dynamic navigation changes
      const observer = new MutationObserver(() => {
        this.hideNavItems();
        this.enhanceEarningsItem();
      });

      const nav = this.findBottomNav();
      if (nav) {
        observer.observe(nav, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
    }
  }

  // ============================================================================
  // 9. Smooth Scroll & Haptic-Like Feedback
  // ============================================================================

  class SmoothScrollEnhancer {
    constructor() {
      this.touchStartY = 0;
      this.touchStartX = 0;
    }

    /**
     * Add smooth scroll styles
     */
    addSmoothScrollStyles() {
      if (document.getElementById('ida-smooth-scroll-styles')) return;

      const style = document.createElement('style');
      style.id = 'ida-smooth-scroll-styles';
      style.textContent = `
        html {
          scroll-behavior: smooth;
        }

        * {
          -webkit-tap-highlight-color: transparent;
        }

        button, [role="button"], a {
          touch-action: manipulation;
          -webkit-user-select: none;
          user-select: none;
        }

        input, textarea, select {
          -webkit-user-select: text;
          user-select: text;
        }
      `;

      document.head.appendChild(style);
    }

    /**
     * Add touch feedback transform
     */
    addTouchFeedback() {
      const interactiveElements = document.querySelectorAll('button, [role="button"], a, input');

      interactiveElements.forEach(el => {
        if (!el.dataset.touchFeedbackAdded) {
          el.addEventListener('touchstart', (e) => {
            el.style.transform = 'scale(0.98)';
            el.style.transition = 'transform 100ms ease-out';
          });

          el.addEventListener('touchend', (e) => {
            el.style.transform = 'scale(1)';
            setTimeout(() => {
              el.style.transition = '';
            }, 100);
          });

          el.dataset.touchFeedbackAdded = 'true';
        }
      });
    }

    /**
     * Observe for new interactive elements
     */
    observeNewElements() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            this.addTouchFeedback();
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    /**
     * Initialize smooth scroll enhancer
     */
    init() {
      this.addSmoothScrollStyles();
      this.addTouchFeedback();
      this.observeNewElements();
    }
  }

  // ============================================================================
  // 10. Login Screen Gradient Animation
  // ============================================================================

  class LoginGradientAnimation {
    constructor() {
      this.animationId = null;
      this.gradientAngle = 0;
    }

    /**
     * Find login screen
     */
    findLoginScreen() {
      const selectors = [
        '[class*="login" i]',
        '[class*="auth" i]',
        '[class*="welcome" i]',
        '[class*="signin" i]',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.offsetHeight > 100) {
          return element;
        }
      }

      return null;
    }

    /**
     * Apply animated gradient background
     */
    applyGradientBackground(element) {
      if (!element) return;

      element.style.background = this.generateGradient(0);
      element.style.backgroundAttachment = 'fixed';
      element.style.transition = 'background 5s ease-in-out';
    }

    /**
     * Generate gradient string
     */
    generateGradient(angle) {
      return `
        linear-gradient(
          ${angle}deg,
          rgba(59, 130, 246, 0.1) 0%,
          rgba(139, 92, 246, 0.1) 50%,
          rgba(59, 130, 246, 0.1) 100%
        )
      `;
    }

    /**
     * Animate gradient
     */
    animateGradient() {
      const loginScreen = this.findLoginScreen();
      if (!loginScreen) return;

      this.gradientAngle = (this.gradientAngle + 1) % 360;
      loginScreen.style.backgroundImage = this.generateGradient(this.gradientAngle);

      this.animationId = setTimeout(() => this.animateGradient(), 5000);
    }

    /**
     * Initialize login gradient animation
     */
    init() {
      const loginScreen = this.findLoginScreen();
      if (loginScreen) {
        this.applyGradientBackground(loginScreen);
        this.animateGradient();
      }

      // Retry if login screen not found
      if (!loginScreen) {
        setTimeout(() => this.init(), 1000);
      }
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this.animationId) {
        clearTimeout(this.animationId);
      }
    }
  }

  // ============================================================================
  // Logo Enhancer - Ensures IDA logo appears everywhere
  // ============================================================================

  class LogoEnhancer {
    constructor() {
      this.logoUrl = 'Modern%20Indian%20Drivers%20Association%20logo.png';
      this.observer = null;
    }

    init() {
      this.ensureLogos();
      this.handleSOSVisibility();
      // Re-check when DOM changes (screen transitions)
      this.observer = new MutationObserver(() => {
        this.ensureLogos();
        this.handleSOSVisibility();
      });
      this.observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    isLoggedIn() {
      // Check if we're past the login/role/KYC screens and into the main app
      const activeScreen = document.querySelector('.screen.active');
      if (!activeScreen) return false;
      const screenText = (activeScreen.textContent || '').toLowerCase();
      // Pre-login screens: splash, role selection, phone/OTP, KYC
      const preLoginKeywords = ['get started', 'how will you use', 'enter your phone', 'enter otp', 'verification (kyc)', 'driver verification'];
      return !preLoginKeywords.some(kw => screenText.includes(kw));
    }

    handleSOSVisibility() {
      const sosBtn = document.querySelector('.sos-btn, .sos-button, [class*="sos"]');
      if (sosBtn) {
        if (this.isLoggedIn()) {
          sosBtn.style.display = '';
          sosBtn.style.visibility = 'visible';
        } else {
          sosBtn.style.display = 'none';
          sosBtn.style.visibility = 'hidden';
        }
      }
    }

    ensureLogos() {
      // Header logo
      const headerLogo = document.querySelector('.header-logo');
      if (headerLogo && !headerLogo.querySelector('img')) {
        const img = document.createElement('img');
        img.src = this.logoUrl;
        img.style.cssText = 'width:32px;height:32px;border-radius:6px;object-fit:contain;margin-right:8px;';
        headerLogo.prepend(img);
      }

      // Login / OTP screens - add logo at top if not present
      const activeScreen = document.querySelector('.screen.active');
      if (activeScreen && !activeScreen.querySelector('.ida-screen-logo')) {
        const screenText = activeScreen.textContent || '';
        // Add logo to screens that should have it (login, phone, OTP, role selection)
        if (/phone|otp|login|verify|mobile|how will you use/i.test(screenText) || activeScreen.querySelector('input[type="tel"]')) {
          const logoDiv = document.createElement('div');
          logoDiv.className = 'ida-screen-logo';
          logoDiv.style.cssText = 'text-align:center;padding:24px 0 16px;';
          logoDiv.innerHTML = '<img src="' + this.logoUrl + '" style="width:80px;height:80px;border-radius:16px;object-fit:contain;box-shadow:0 8px 32px rgba(59,130,246,0.3);">';
          activeScreen.prepend(logoDiv);
        }
      }
    }

    destroy() {
      if (this.observer) this.observer.disconnect();
    }
  }

  // ============================================================================
  // Master Initializer
  // ============================================================================

  class IDAAppEnhancer {
    constructor() {
      this.modules = [];
    }

    /**
     * Initialize all enhancement modules
     */
    async init() {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initialize());
      } else {
        this.initialize();
      }
    }

    /**
     * Initialize enhancement modules
     */
    initialize() {
      const moduleList = [
        ['PromoCodeRemover', PromoCodeRemover],
        ['WalletFeeCalculator', WalletFeeCalculator],
        ['ParticleBackground', ParticleBackground],
        ['PageTransitionAnimator', PageTransitionAnimator],
        ['ScrollCardAnimator', ScrollCardAnimator],
        ['ButtonRippleEffect', ButtonRippleEffect],
        ['WalletBalanceCounter', WalletBalanceCounter],
        ['BottomNavEnhancer', BottomNavEnhancer],
        ['SmoothScrollEnhancer', SmoothScrollEnhancer],
        ['LoginGradientAnimation', LoginGradientAnimation],
        ['LogoEnhancer', LogoEnhancer],
      ];

      for (const [name, ModuleClass] of moduleList) {
        try {
          const instance = new ModuleClass();
          instance.init();
          this.modules.push(instance);
        } catch (error) {
          console.warn(`IDA module ${name} failed to init:`, error.message);
        }
      }

      console.log(`IDA App Enhancement initialized: ${this.modules.length}/${moduleList.length} modules`);
    }

    /**
     * Cleanup all modules
     */
    destroy() {
      this.modules.forEach(module => {
        if (module.destroy && typeof module.destroy === 'function') {
          module.destroy();
        }
      });
      this.modules = [];
    }
  }

  // ============================================================================
  // Startup
  // ============================================================================

  // Create and initialize the main enhancer
  const enhancer = new IDAAppEnhancer();
  enhancer.init();

  // Allow access to enhancer from window for debugging
  window.IDAAppEnhancer = enhancer;

})();
