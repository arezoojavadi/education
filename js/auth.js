/* ============================================================
 * js/auth.js
 * ------------------------------------------------------------
 * نگهبان مسیر (Route Guard) — احراز هویت و کنترل دسترسی
 * طراحی: فاطمه جوادی
 *
 * قابلیت‌ها:
 *   • چک لاگین بودن کاربر
 *   • بررسی پروفایل (code, full_name, role, name_confirmed)
 *   • کنترل نقش (student / teacher)
 *   • ریدایرکت هوشمند به مسیر درست
 *   • کش پروفایل در حافظه + localStorage (برای سرعت)
 *   • مدیریت نشست منقضی
 *   • خروج امن
 *   • همگام‌سازی چندتبی
 *
 * پیش‌نیاز: js/utils.js (برای toast, supabase)
 * یا: پنجره‌ی window.supabase باید آماده باشد
 * ============================================================ */

(function () {
  'use strict';

  /* جلوگیری از بارگذاری دوباره */
  if (window.Auth && window.Auth.__loaded) return;

  /* ============================================================
   * تنظیمات
   * ============================================================ */

  var PATHS = {
    login:      'index.html',
    chooseName: 'choose-name.html',
    student:    'student.html',
    teacher:    'teacher.html'
  };

  var CACHE_KEY = 'auth_profile_cache';
  var CACHE_TTL = 5 * 60 * 1000; /* ۵ دقیقه */

  /* ============================================================
   * کش پروفایل
   * ============================================================ */

  var profileCache = {
    data: null,
    userId: null,
    timestamp: 0
  };

  function loadCacheFromStorage() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.userId || !parsed.timestamp) return;

      /* اگه منقضی شده، پاک کن */
      if (Date.now() - parsed.timestamp > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return;
      }

      profileCache = {
        data: parsed.data || null,
        userId: parsed.userId,
        timestamp: parsed.timestamp
      };
    } catch (e) {}
  }

  function saveCacheToStorage(userId, data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        userId: userId,
        data: data,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  function clearProfileCache() {
    profileCache = { data: null, userId: null, timestamp: 0 };
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  /* ============================================================
   * Supabase — اتصال ایمن
   * ============================================================ */

  function getSupabase() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && typeof window.supabase.auth !== 'undefined' && typeof window.supabase.auth.getUser === 'function') {
      return window.supabase;
    }
    if (window.supabase && window.supabase.createClient) {
      /* ساخت خودکار در صورت نبود */
      var url = window.SUPABASE_URL || 'https://cfkwvzbqgapguuaqibmq.supabase.co';
      var key = window.SUPABASE_KEY || 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';
      window.supabaseClient = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
      return window.supabaseClient;
    }
    throw new Error('Supabase client is not available');
  }

  /* ============================================================
   * ریدایرکت ایمن (بدون حلقه)
   * ============================================================ */

  function getCurrentPage() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    return path.toLowerCase();
  }

  function redirect(to, reason) {
    var current = getCurrentPage();
    var target = (to || '').toLowerCase();

    /* جلوگیری از حلقه */
    if (current === target) return false;

    if (reason && window.Utils && typeof window.Utils.toast === 'function') {
      try { window.Utils.toast(reason, 'info', 1500); } catch (e) {}
    }

    try {
      window.location.replace(to);
    } catch (e) {
      window.location.href = to;
    }
    return true;
  }

  /* ============================================================
   * بازیابی نشست
   * ============================================================ */

  async function getSession() {
    var sb = getSupabase();

    try {
      var result = await sb.auth.getSession();
      if (result && result.data && result.data.session) {
        return result.data.session;
      }
    } catch (e) {
      console.warn('[auth] getSession failed:', e);
    }

    return null;
  }

  async function getUser() {
    var sb = getSupabase();

    try {
      var result = await sb.auth.getUser();
      if (result && result.data && result.data.user) {
        return result.data.user;
      }
    } catch (e) {
      console.warn('[auth] getUser failed:', e);
    }

    return null;
  }

  /* ============================================================
   * بارگذاری پروفایل
   * ============================================================ */

  async function fetchProfile(userId) {
    if (!userId) return null;

    var sb = getSupabase();

    try {
      var result = await sb
        .from('profiles')
        .select('id, code, full_name, role, name_confirmed')
        .eq('id', userId)
        .maybeSingle();

      if (result.error) {
        console.warn('[auth] profile fetch error:', result.error);
        return null;
      }

      return result.data || null;
    } catch (e) {
      console.warn('[auth] profile fetch failed:', e);
      return null;
    }
  }

  /**
   * گرفتن پروفایل (با کش)
   * @param {string} userId
   * @param {boolean} [force] - نادیده گرفتن کش
   */
  async function getProfile(userId, force) {
    if (!userId) return null;

    /* از کش حافظه */
    if (!force && profileCache.userId === userId && profileCache.data) {
      var age = Date.now() - profileCache.timestamp;
      if (age < CACHE_TTL) return profileCache.data;
    }

    /* از Supabase */
    var profile = await fetchProfile(userId);

    if (profile) {
      profileCache = {
        data: profile,
        userId: userId,
        timestamp: Date.now()
      };
      saveCacheToStorage(userId, profile);
    }

    return profile;
  }

  /* ============================================================
   * تعیین مقصد بر اساس پروفایل
   * ============================================================ */

  function getDestination(profile) {
    if (!profile) return PATHS.chooseName;

    /* اگه اسم تأیید نشده */
    if (!profile.name_confirmed) return PATHS.chooseName;

    if (profile.role === 'teacher') return PATHS.teacher;
    return PATHS.student;
  }

  /* ============================================================
   * نگهبان مسیر — اصلی
   * ============================================================ */

  /**
   * requireAuth — محافظت از صفحه
   * @param {string|null} [requiredRole] - 'student' یا 'teacher' یا null
   * @param {object} [options]
   * @param {boolean} [options.allowUnconfirmed] - اجازه‌ی name_confirmed=false
   * @param {boolean} [options.silent] - بدون redirect، فقط برگرداند
   * @returns {Promise<{user, profile} | null>}
   */
  async function requireAuth(requiredRole, options) {
    options = options || {};

    /* ۱) نشست فعال؟ */
    var session = await getSession();
    if (!session) {
      if (!options.silent) {
        redirect(PATHS.login);
      }
      return null;
    }

    /* ۲) کاربر */
    var user = await getUser();
    if (!user) {
      /* نشست هست ولی کاربر نیست → پاک کن */
      try { await getSupabase().auth.signOut(); } catch (e) {}
      clearProfileCache();
      if (!options.silent) redirect(PATHS.login);
      return null;
    }

    /* ۳) پروفایل */
    var profile = await getProfile(user.id);

    if (!profile) {
      /* پروفایل نداره — برو انتخاب نام */
      if (!options.silent && !options.allowUnconfirmed) {
        redirect(PATHS.chooseName);
      }
      return { user: user, profile: null };
    }

    /* ۴) name_confirmed */
    if (!profile.name_confirmed && !options.allowUnconfirmed) {
      if (!options.silent) redirect(PATHS.chooseName);
      return null;
    }

    /* ۵) نقش */
    if (requiredRole && profile.role !== requiredRole) {
      if (!options.silent) {
        var dest = profile.role === 'teacher' ? PATHS.teacher : PATHS.student;
        redirect(dest, 'دسترسی شما به این صفحه مجاز نیست');
      }
      return null;
    }

    return { user: user, profile: profile };
  }

  /* ============================================================
   * توابع کمکی
   * ============================================================ */

  /**
   * بررسی سریع لاگین بودن (بدون redirect)
   */
  async function isLoggedIn() {
    var session = await getSession();
    return !!session;
  }

  /**
   * گرفتن نقش کاربر فعلی
   */
  async function getCurrentRole() {
    var user = await getUser();
    if (!user) return null;
    var profile = await getProfile(user.id);
    return profile ? profile.role : null;
  }

  /**
   * خروج
   */
  async function logout(reason) {
    try {
      var sb = getSupabase();
      await sb.auth.signOut();
    } catch (e) {
      console.warn('[auth] logout failed:', e);
    }

    clearProfileCache();

    if (reason && window.Utils && typeof window.Utils.toast === 'function') {
      try { window.Utils.toast(reason, 'info', 1200); } catch (e) {}
    }

    setTimeout(function () {
      try { window.location.replace(PATHS.login); } catch (e) { window.location.href = PATHS.login; }
    }, reason ? 600 : 0);
  }

  /**
   * به‌روزرسانی کش پس از تغییر پروفایل
   */
  function updateCachedProfile(patch) {
    if (!profileCache.data || !patch) return;
    for (var key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        profileCache.data[key] = patch[key];
      }
    }
    profileCache.timestamp = Date.now();
    saveCacheToStorage(profileCache.userId, profileCache.data);
  }

  /**
   * پاک کردن کش (مثلاً بعد از نام)
   */
  function invalidateProfileCache() {
    clearProfileCache();
  }

  /* ============================================================
   * همگام‌سازی چندتبی
   * ============================================================ */

  function initCrossTabSync() {
    window.addEventListener('storage', function (e) {
      if (e.key === CACHE_KEY) {
        /* تب دیگه‌ای پروفایل رو آپدیت کرد */
        loadCacheFromStorage();
      }
    });

    /* چک دوره‌ای نشست (هر ۶۰ ثانیه) */
    setInterval(async function () {
      var session = await getSession();
      if (!session) {
        clearProfileCache();
      }
    }, 60000);
  }

  /* ============================================================
   * پر کردن هدر (برای پنل‌ها)
   * ============================================================ */

  /**
   * پر کردن هدر با اطلاعات کاربر
   * @param {object} profile
   */
  function fillUserHeader(profile) {
    if (!profile) return;

    var nameEl = document.getElementById('userName');
    var avatarEl = document.getElementById('userAvatar');
    var roleEl = document.getElementById('userRole');

    if (nameEl) {
      nameEl.textContent = profile.full_name || 'کاربر';
    }

    if (avatarEl) {
      avatarEl.textContent = getInitials(profile.full_name);
    }

    if (roleEl) {
      roleEl.textContent = profile.role === 'teacher' ? 'معلم' : 'دانش‌آموز';
    }
  }

  function getInitials(name) {
    if (!name || typeof name !== 'string') return '؟';
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '؟';
    if (parts.length === 1) return parts[0][0] || '؟';
    return (parts[0][0] || '') + (parts[parts.length - 1][0] || '');
  }

  /* ============================================================
   * راه‌اندازی
   * ============================================================ */

  function init() {
    loadCacheFromStorage();
    initCrossTabSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */

  window.Auth = {
    __loaded: true,

    /* مسیرها */
    PATHS: PATHS,

    /* نگهبان اصلی */
    requireAuth: requireAuth,

    /* کمکی */
    isLoggedIn: isLoggedIn,
    getUser: getUser,
    getSession: getSession,
    getProfile: getProfile,
    getCurrentRole: getCurrentRole,
    getDestination: getDestination,
    logout: logout,

    /* کش */
    updateCachedProfile: updateCachedProfile,
    invalidateProfileCache: invalidateProfileCache,

    /* UI */
    fillUserHeader: fillUserHeader,
    getInitials: getInitials
  };

  /* کامن برای راحتی */
  window.requireAuth = requireAuth;
  window.logout = logout;

  /* Console */
  try {
    console.log(
      '%c🔐 Auth Guard آماده\n%cطراحی: فاطمه جوادی',
      'color: #6C5CE7; font-size: 14px; font-weight: bold;',
      'color: #00CEC9; font-size: 11px;'
    );
  } catch (e) {}

})();
