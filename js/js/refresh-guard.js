/* ============================================================
 * js/refresh-guard.js
 * ------------------------------------------------------------
 * تشخیص رفرش صفحه و بازگشت به پنل مناسب
 * طراحی: فاطمه جوادی
 *
 * ⚠️ فقط به این صفحات اضافه شود:
 *   • take.html  →  student.html
 *   • view.html  →  teacher.html
 *
 * ⛔ هرگز به این صفحات اضافه نشود:
 *   • index.html
 *   • choose-name.html
 *   • student.html
 *   • teacher.html
 *   • 404.html
 *
 * چطور کار می‌کنه:
 *   • اگه کاربر F5 یا Ctrl+R بزنه → می‌ره پنل مربوطه
 *   • اگه از لینک باز کنه → عادی کار می‌کنه
 *   • اگه از History برگرده → عادی کار می‌کنه
 * ============================================================ */

(function () {
  'use strict';

  /* ────────────────────────────────────────────────────────────
   * ۰) جلوگیری از اجرای دوباره
   * ──────────────────────────────────────────────────────────── */
  if (window.__RefreshGuardLoaded) return;
  window.__RefreshGuardLoaded = true;

  /* ────────────────────────────────────────────────────────────
   * ۱) حالت دیباگ
   * برای دیدن پیام‌ها در Console، true بذار
   * ──────────────────────────────────────────────────────────── */
  var DEBUG = true;

  function log() {
    if (!DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    try {
      console.log.apply(console, ['%c[RefreshGuard]', 'color: #6C5CE7; font-weight: bold;'].concat(args));
    } catch (e) {}
  }

  /* ────────────────────────────────────────────────────────────
   * ۲) نام دقیق فایل جاری
   * ──────────────────────────────────────────────────────────── */
  function getCurrentFile() {
    try {
      var path = String(window.location.pathname || '');

      /* حذف query string و hash */
      path = path.split('?')[0].split('#')[0];

      /* آخرین بخش مسیر (نام فایل) */
      var parts = path.split('/');
      var file = parts[parts.length - 1] || '';

      /* اگه فایل خالی بود (ریشه) → index.html */
      if (!file) file = 'index.html';

      return file.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  /* ────────────────────────────────────────────────────────────
   * ۳) تشخیص رفرش
   * ──────────────────────────────────────────────────────────── */
  function isPageReload() {
    /* روش مدرن: PerformanceNavigationTiming */
    try {
      if (window.performance && typeof performance.getEntriesByType === 'function') {
        var entries = performance.getEntriesByType('navigation');
        if (entries && entries.length) {
          var type = entries[0] && entries[0].type;
          log('Navigation type:', type);
          if (type === 'reload') return true;
          if (type === 'navigate' || type === 'back_forward') return false;
        }
      }
    } catch (e) {
      log('getEntriesByType failed:', e);
    }

    /* Fallback: performance.navigation (مرورگرهای قدیمی) */
    try {
      if (window.performance && performance.navigation) {
        var navType = performance.navigation.type;
        log('Legacy navigation type:', navType);
        if (navType === 1) return true;       /* TYPE_RELOAD */
        if (navType === 0) return false;      /* TYPE_NAVIGATE */
        if (navType === 2) return false;      /* TYPE_BACK_FORWARD */
      }
    } catch (e) {
      log('performance.navigation failed:', e);
    }

    /* اگه هیچی تشخیص نشد → فرض کن رفرش نیست */
    return false;
  }

  /* ────────────────────────────────────────────────────────────
   * ۴) نقشه‌ی مقصد — فقط برای این دو فایل
   * ──────────────────────────────────────────────────────────── */
  var PAGE_DESTINATIONS = {
    'take.html': 'student.html',
    'view.html': 'teacher.html'
  };

  /* ────────────────────────────────────────────────────────────
   * ۵) جلوگیری از حلقه‌ی بی‌نهایت
   * ──────────────────────────────────────────────────────────── */
  function hasRecentlyRedirected() {
    try {
      var last = sessionStorage.getItem('_refresh_guard_ts');
      if (!last) return false;

      var ts = parseInt(last, 10);
      if (isNaN(ts)) return false;

      /* اگه کمتر از ۳ ثانیه پیش بوده → حلقه */
      return (Date.now() - ts) < 3000;
    } catch (e) {
      return false;
    }
  }

  function markRedirect() {
    try {
      sessionStorage.setItem('_refresh_guard_ts', String(Date.now()));
    } catch (e) {}
  }

  /* ────────────────────────────────────────────────────────────
   * ۶) اصلی
   * ──────────────────────────────────────────────────────────── */
  var currentFile = getCurrentFile();
  log('فایل جاری:', currentFile);

  /* چک کن این فایل توی نقشه هست یا نه */
  var destination = PAGE_DESTINATIONS[currentFile];

  if (!destination) {
    /* این صفحه نباید ریدایرکت کنه → عادی کار کن */
    log('این صفحه توی نقشه نیست → عادی کار می‌کنه');
    return;
  }

  log('این صفحه در نقشه هست → مقصد:', destination);

  /* چک رفرش */
  var reloaded = isPageReload();

  if (!reloaded) {
    log('رفرش نبود → عادی کار می‌کنه');
    return;
  }

  log('🚨 رفرش تشخیص داده شد!');

  /* چک حلقه */
  if (hasRecentlyRedirected()) {
    log('⚠️ ریدایرکت اخیر بوده → جلوگیری از حلقه');
    return;
  }

  /* ریدایرکت */
  markRedirect();
  log('➡️ ریدایرکت به:', destination);

  try {
    window.location.replace(destination);
  } catch (e) {
    try {
      window.location.href = destination;
    } catch (e2) {
      log('❌ ریدایرکت شکست خورد:', e2);
    }
  }

})();
