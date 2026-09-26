/* ============================================================
 * js/a11y.js
 * ------------------------------------------------------------
 * دسترس‌پذیری (Accessibility) سراسری
 * طراحی: فاطمه جوادی
 *
 * قابلیت‌ها:
 *   • اعلان‌های زنده برای صفحه‌خوان (live regions)
 *   • تله‌ی فوکوس (focus trap) در مودال‌ها
 *   • بستن مودال با ESC
 *   • پرش سریع به محتوای اصلی (skip link)
 *   • تشخیص ناوبری با کیبورد (focus-visible fallback)
 *   • احترام به prefers-reduced-motion
 *   • تشخیص اتوماتیک پیام‌ها و toastها
 *
 * وابستگی: هیچ
 * ساختار: کاملاً مستقل — با هر صفحه‌ای کار می‌کند
 * ============================================================ */

(function () {
  'use strict';

  /* جلوگیری از بارگذاری دوباره */
  if (window.A11y && window.A11y.__loaded) return;

  /* ============================================================
   * ابزار داخلی
   * ============================================================ */

  var FOCUSABLE_SELECTOR = [
    'a[href]:not([disabled])',
    'button:not([disabled]):not([aria-hidden="true"])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    var style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function getFocusables(root) {
    if (!root) return [];
    var list = root.querySelectorAll(FOCUSABLE_SELECTOR);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (isVisible(list[i])) out.push(list[i]);
    }
    return out;
  }

  /* ============================================================
   * تزریق استایل‌های ضروری
   * ============================================================ */

  function injectStyles() {
    if (document.getElementById('a11y-styles')) return;

    var style = document.createElement('style');
    style.id = 'a11y-styles';
    style.textContent = [
      /* پنهان برای چشم — فقط برای صفحه‌خوان */
      '.sr-only {',
      '  position: absolute !important;',
      '  width: 1px !important;',
      '  height: 1px !important;',
      '  padding: 0 !important;',
      '  margin: -1px !important;',
      '  overflow: hidden !important;',
      '  clip: rect(0, 0, 0, 0) !important;',
      '  white-space: nowrap !important;',
      '  border: 0 !important;',
      '}',

      /* لینک پرش */
      '.skip-link {',
      '  position: fixed;',
      '  top: -100px;',
      '  right: 20px;',
      '  z-index: 9999;',
      '  padding: 12px 20px;',
      '  background: #6C5CE7;',
      '  color: #fff;',
      '  font-family: inherit;',
      '  font-weight: 700;',
      '  font-size: 14px;',
      '  text-decoration: none;',
      '  border-radius: 12px;',
      '  box-shadow: 0 8px 24px rgba(108, 92, 231, 0.4);',
      '  transition: top 0.25s ease;',
      '}',
      '.skip-link:focus {',
      '  top: 20px;',
      '  outline: 3px solid #FDCB6E;',
      '  outline-offset: 2px;',
      '}',

      /* فوکوس-ویزیبل fallback برای مرورگرهای قدیمی */
      'body.using-keyboard *:focus {',
      '  outline: 2px solid #6C5CE7;',
      '  outline-offset: 2px;',
      '  border-radius: 4px;',
      '}',
      'html.dark body.using-keyboard *:focus {',
      '  outline-color: #A29BFE;',
      '}',
      'body.using-keyboard .otp input:focus {',
      '  outline: 2px solid #6C5CE7;',
      '  outline-offset: 2px;',
      '}',

      /* حذف outline پیش‌فرض موس */
      'body:not(.using-keyboard) *:focus {',
      '  outline: none;',
      '}',

      /* حالت reduced motion */
      '@media (prefers-reduced-motion: reduce) {',
      '  html.reduced-motion *,',
      '  html.reduced-motion *::before,',
      '  html.reduced-motion *::after {',
      '    animation-duration: 0.01ms !important;',
      '    animation-iteration-count: 1 !important;',
      '    transition-duration: 0.01ms !important;',
      '    scroll-behavior: auto !important;',
      '  }',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  /* ============================================================
   * اعلان صفحه‌خوان (Live Regions)
   * ============================================================ */

  var livePolite = null;
  var liveAssertive = null;

  function ensureLiveRegions() {
    if (livePolite && liveAssertive) return;

    if (!livePolite) {
      livePolite = document.createElement('div');
      livePolite.className = 'sr-only';
      livePolite.setAttribute('role', 'status');
      livePolite.setAttribute('aria-live', 'polite');
      livePolite.setAttribute('aria-atomic', 'true');
      document.body.appendChild(livePolite);
    }

    if (!liveAssertive) {
      liveAssertive = document.createElement('div');
      liveAssertive.className = 'sr-only';
      liveAssertive.setAttribute('role', 'alert');
      liveAssertive.setAttribute('aria-live', 'assertive');
      liveAssertive.setAttribute('aria-atomic', 'true');
      document.body.appendChild(liveAssertive);
    }
  }

  /**
   * اعلان برای صفحه‌خوان
   * @param {string} text - متن اعلان
   * @param {string} [priority='polite'] - 'polite' یا 'assertive'
   */
  function announce(text, priority) {
    if (!text) return;
    ensureLiveRegions();

    var el = priority === 'assertive' ? liveAssertive : livePolite;

    /* خالی کردن برای اطمینان از اعلان مجدد */
    el.textContent = '';
    setTimeout(function () { el.textContent = String(text).trim(); }, 80);
  }

  /* ============================================================
   * تله‌ی فوکوس (Focus Trap)
   * ============================================================ */

  var trapHandlers = new WeakMap();

  /**
   * فوکوس را در یک المان حبس می‌کند
   * @param {HTMLElement} container
   */
  function trapFocus(container) {
    if (!container || trapHandlers.has(container)) return;

    /* ذخیره آخرین فوکوس برای بازگردانی */
    container.__lastFocused = document.activeElement;

    function handler(e) {
      if (e.key !== 'Tab') return;

      var focusables = getFocusables(container);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener('keydown', handler);
    trapHandlers.set(container, handler);

    /* فوکوس روی اولین المان */
    var focusables = getFocusables(container);
    if (focusables.length) {
      setTimeout(function () {
        try { focusables[0].focus(); } catch (err) {}
      }, 60);
    }
  }

  /**
   * آزادسازی فوکوس
   */
  function releaseFocus(container) {
    if (!container) return;

    var handler = trapHandlers.get(container);
    if (handler) {
      container.removeEventListener('keydown', handler);
      trapHandlers.delete(container);
    }

    /* بازگردانی فوکوس */
    if (container.__lastFocused && typeof container.__lastFocused.focus === 'function') {
      try { container.__lastFocused.focus(); } catch (e) {}
    }
    delete container.__lastFocused;
  }

  /* ============================================================
   * بستن با ESC
   * ============================================================ */

  function isModalOpen(el) {
    if (!el) return false;
    if (el.classList.contains('show')) return true;
    if (el.getAttribute('aria-hidden') === 'false') return true;
    if (el.style.display && el.style.display !== 'none') return true;
    return isVisible(el) && el.getAttribute('role') === 'dialog';
  }

  function closeTopModal() {
    var candidates = document.querySelectorAll(
      '.modal-overlay.show, .modal.show, [role="dialog"][aria-hidden="false"]'
    );

    if (!candidates.length) return false;

    /* بالاترین = آخری در DOM */
    var top = candidates[candidates.length - 1];

    /* تلاش برای پیدا کردن دکمه‌ی بستن */
    var closeBtn = top.querySelector(
      '[data-modal-close], [data-dismiss], .modal-close, .btn-cancel, button[onclick*="close" i]'
    );

    if (closeBtn) {
      closeBtn.click();
      return true;
    }

    /* بدون دکمه — خودمان ببندیم */
    top.classList.remove('show');
    top.setAttribute('aria-hidden', 'true');
    releaseFocus(top);
    document.body.style.overflow = '';
    announce('بسته شد', 'polite');
    return true;
  }

  function onEsc(e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (closeTopModal()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /* ============================================================
   * تشخیص کیبورد
   * ============================================================ */

  var keyboardMode = false;

  function enableKeyboardMode() {
    if (keyboardMode) return;
    keyboardMode = true;
    document.body.classList.add('using-keyboard');
  }

  function disableKeyboardMode() {
    if (!keyboardMode) return;
    keyboardMode = false;
    document.body.classList.remove('using-keyboard');
  }

  function initKeyboardDetection() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
        enableKeyboardMode();
      }
    }, true);

    document.addEventListener('mousedown', disableKeyboardMode, true);
    document.addEventListener('touchstart', disableKeyboardMode, { passive: true, capture: true });
  }

  /* ============================================================
   * پیام‌ها و Toastها → صفحه‌خوان
   * ============================================================ */

  function detectLiveContent() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];

        /* کلاس تغییر کرده — پیام باز/بسته شده */
        if (m.type === 'attributes' && m.attributeName === 'class') {
          var el = m.target;
          if (!el.classList) continue;

          if (el.classList.contains('message') && el.classList.contains('show')) {
            var text = (el.textContent || '').trim();
            if (text) {
              announce(text, el.classList.contains('error') ? 'assertive' : 'polite');
            }
          }
        }

        /* المان جدید اضافه شده — toast */
        if (m.type === 'childList' && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType !== 1) continue;

            if (node.classList && node.classList.contains('toast')) {
              var toastText = (node.textContent || '').trim();
              if (toastText) {
                var isErr = node.classList.contains('error');
                announce(toastText, isErr ? 'assertive' : 'polite');
              }
            }

            /* اعلان‌های role=alert که خودشون اضافه شدن */
            if (node.getAttribute && node.getAttribute('role') === 'alert') {
              var alertText = (node.textContent || '').trim();
              if (alertText) announce(alertText, 'assertive');
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /* ============================================================
   * لینک پرش به محتوا
   * ============================================================ */

  function initSkipLink() {
    if (document.querySelector('.skip-link')) return;

    var main = document.querySelector('main, [role="main"], .app, .container');
    if (!main) return;

    if (!main.id) main.id = 'main-content';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

    var skip = document.createElement('a');
    skip.href = '#' + main.id;
    skip.className = 'skip-link';
    skip.textContent = 'پرش به محتوای اصلی';

    skip.addEventListener('click', function () {
      setTimeout(function () {
        try { main.focus(); } catch (e) {}
      }, 50);
    });

    if (document.body.firstChild) {
      document.body.insertBefore(skip, document.body.firstChild);
    } else {
      document.body.appendChild(skip);
    }
  }

  /* ============================================================
   * کاهش حرکت
   * ============================================================ */

  function checkReducedMotion() {
    if (!window.matchMedia) return;

    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    function apply() {
      if (mq.matches) document.documentElement.classList.add('reduced-motion');
      else document.documentElement.classList.remove('reduced-motion');
    }

    apply();

    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }

  /* ============================================================
   * دسترسی سریع به عناصر اصلی با کیبورد
   * ============================================================ */

  function initLandmarks() {
    /* اطمینان از اینکه main یک landmark است */
    var main = document.querySelector('main');
    if (main && !main.getAttribute('role')) main.setAttribute('role', 'main');

    /* اطمینان از اینکه هدر یک banner است */
    var header = document.querySelector('header');
    if (header && !header.getAttribute('role')) header.setAttribute('role', 'banner');

    /* اطمینان از اینکه footer یک contentinfo است */
    var footer = document.querySelector('footer');
    if (footer && !footer.getAttribute('role')) footer.setAttribute('role', 'contentinfo');
  }

  /* ============================================================
   * مودال‌ها — تله‌ی فوکوس خودکار
   * ============================================================ */

  function initModals() {
    if (!window.MutationObserver) return;

    var modalObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;

        var el = m.target;
        if (!el.classList) continue;

        var isModal = el.classList.contains('modal-overlay') ||
                      el.classList.contains('modal') ||
                      el.getAttribute('role') === 'dialog';

        if (!isModal) continue;

        var isOpen = el.classList.contains('show');

        if (isOpen) {
          if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
          if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');

          document.body.style.overflow = 'hidden';
          trapFocus(el);
        } else {
          document.body.style.overflow = '';
          releaseFocus(el);
        }
      }
    });

    modalObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /* ============================================================
   * راه‌اندازی
   * ============================================================ */

  function init() {
    injectStyles();
    ensureLiveRegions();
    initKeyboardDetection();
    initSkipLink();
    initLandmarks();
    detectLiveContent();
    initModals();
    checkReducedMotion();

    document.addEventListener('keydown', onEsc, true);
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */

  window.A11y = {
    __loaded: true,
    init: init,
    announce: announce,
    trapFocus: trapFocus,
    releaseFocus: releaseFocus,
    getFocusables: getFocusables,
    isVisible: isVisible,
    closeTopModal: closeTopModal
  };

  /* اجرا */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
