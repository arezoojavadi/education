/* ============================================================
 * js/refresh-guard.js
 * ------------------------------------------------------------
 * تشخیص رفرش صفحه و بازگشت به پنل مناسب
 * طراحی: فاطمه جوادی
 *
 * چطور کار می‌کنه:
 *   • اگه کاربر صفحه رو F5 یا Ctrl+R کنه → می‌ره پنل
 *   • اگه از یه لینک باز کنه → عادی کار می‌کنه
 *   • اگه از یه دکمه → عادی کار می‌کنه
 *
 * صفحه‌های پشتیبانی‌شده:
 *   • take.html → student.html
 *   • view.html → teacher.html
 *   • student.html → student.html (نمونه)
 *   • teacher.html → teacher.html (نمونه)
 * ============================================================ */

(function () {
  'use strict';

  /* جلوگیری از اجرای دوباره */
  if (window.__RefreshGuard__) return;
  window.__RefreshGuard__ = true;

  /* ============================================================
   * تشخیص رفرش
   * ============================================================ */
  var isReload = false;

  try {
    /* روش مدرن: PerformanceNavigationTiming */
    if (window.performance && typeof performance.getEntriesByType === 'function') {
      var entries = performance.getEntriesByType('navigation');
      if (entries && entries.length && entries[0] && entries[0].type) {
        isReload = (entries[0].type === 'reload');
      }
    }

    /* Fallback: performance.navigation (مرورگرهای قدیمی) */
    if (!isReload && window.performance && performance.navigation) {
      isReload = (performance.navigation.type === 1);
    }
  } catch (e) {
    /* خطای دسترسی → رفرش نیست */
    isReload = false;
  }

  /* اگه رفرش نبود → کاری نکن */
  if (!isReload) return;

  /* ============================================================
   * تعیین صفحه‌ی مقصد
   * ============================================================ */
  var path = '';

  try {
    path = String(window.location.pathname || '').toLowerCase();
  } catch (e) {}

  var dest = 'index.html';

  /* ترتیب مهمه — take قبل از student چک بشه */
  if (path.indexOf('take') !== -1) {
    dest = 'student.html';
  } else if (path.indexOf('view') !== -1) {
    dest = 'teacher.html';
  } else if (path.indexOf('choose-name') !== -1) {
    dest = 'index.html';
  } else if (path.indexOf('student') !== -1) {
    dest = 'student.html';
  } else if (path.indexOf('teacher') !== -1) {
    dest = 'teacher.html';
  } else {
    dest = 'index.html';
  }

  /* ============================================================
   * علامت‌گذاری قبل از ریدایرکت (برای جلوگیری از حلقه)
   * ============================================================ */
  try {
    sessionStorage.setItem('_refresh_redirected', '1');
  } catch (e) {}

  /* ============================================================
   * ریدایرکت — با replace تا دکمه‌ی Back گیر نکنه
   * ============================================================ */
  try {
    window.location.replace(dest);
  } catch (e) {
    window.location.href = dest;
  }

  /* توقف ادامه‌ی اجرای اسکریپت‌ها */
  try {
    document.documentElement.style.opacity = '0';
  } catch (e) {}

})();
