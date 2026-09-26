/* ============================================================
 * js/student.js
 * ------------------------------------------------------------
 * منطق پنل دانش‌آموز — نسخه‌ی قطعی
 * طراحی: فاطمه جوادی
 *
 * تغییرات کلیدی نسبت به نسخه‌ی قبل:
 *   • خواندن پروفایل از طریق RPC (دور زدن RLS)
 *   • چک تازه‌ی profile بعد از redirect
 *   • retry هوشمند اگر profile null برگشت
 *   • بدون loop
 *
 * وابستگی: @supabase/supabase-js از CDN
 * ============================================================ */

(function () {
  'use strict';

  if (window.StudentPanel && window.StudentPanel.__loaded) return;

  /* ============================================================
   * CONFIG
   * ============================================================ */
  var SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';

  /* ============================================================
   * SUPABASE
   * ============================================================ */
  function getSupabase() {
    if (window.supabaseClient) return window.supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase SDK not loaded');
    }
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return window.supabaseClient;
  }

  /* ============================================================
   * STATE
   * ============================================================ */
  var state = {
    supabase: null,
    user: null,
    profile: null,
    activeExams: [],
    doneExams: [],
    ready: false
  };

  /* ============================================================
   * DOM
   * ============================================================ */
  var el = {};

  function cacheElements() {
    el = {
      themeBtn:     document.getElementById('themeBtn'),
      logoutBtn:    document.getElementById('logoutBtn'),
      userName:     document.getElementById('userName'),
      userAvatar:   document.getElementById('userAvatar'),
      heroGreeting: document.getElementById('heroGreeting'),
      heroEmoji:    document.getElementById('heroEmoji'),
      statActive:   document.getElementById('statActive'),
      statDone:     document.getElementById('statDone'),
      statTotal:    document.getElementById('statTotal'),
      statRate:     document.getElementById('statRate'),
      activeCount:  document.getElementById('activeCount'),
      doneCount:    document.getElementById('doneCount'),
      activeExams:  document.getElementById('activeExams'),
      doneExams:    document.getElementById('doneExams'),
      toasts:       document.getElementById('toastContainer')
    };
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */
  var FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  function toFa(n) {
    return String(n === null || n === undefined ? 0 : n)
      .replace(/\d/g, function (d) { return FA[+d]; });
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function getInitials(name) {
    if (!name || typeof name !== 'string') return '؟';
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '؟';
    if (parts.length === 1) return parts[0][0] || '؟';
    return (parts[0][0] || '') + (parts[parts.length - 1][0] || '');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: 'short', day: 'numeric'
      }).format(new Date(iso));
    } catch (e) { return '—'; }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(iso));
    } catch (e) { return '—'; }
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return '—';
    var s = parseInt(seconds, 10) || 0;
    var m = Math.floor(s / 60);
    var sec = s % 60;
    if (m === 0) return toFa(sec) + ' ثانیه';
    if (sec === 0) return toFa(m) + ' دقیقه';
    return toFa(m) + ':' + (sec < 10 ? '۰' : '') + toFa(sec) + ' دقیقه';
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* ============================================================
   * THEME
   * ============================================================ */
  function applyTheme(isDark) {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
    var meta = document.getElementById('themeMeta');
    if (meta) meta.setAttribute('content', isDark ? '#0F0C24' : '#6C5CE7');
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved === 'dark' || (!saved && prefersDark));
  }

  function bindTheme() {
    if (el.themeBtn) {
      el.themeBtn.addEventListener('click', function () {
        applyTheme(!document.documentElement.classList.contains('dark'));
      });
    }
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function (e) {
        var saved = null;
        try { saved = localStorage.getItem('theme'); } catch (err) {}
        if (!saved) applyTheme(e.matches);
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }

  /* ============================================================
   * TOAST
   * ============================================================ */
  function toast(message, type, duration) {
    if (!el.toasts) { console.log('[' + (type || 'info') + ']', message); return; }
    type = type || 'info';
    duration = duration || 3000;
    var node = document.createElement('div');
    node.className = 'toast ' + type;
    node.textContent = message;
    el.toasts.appendChild(node);
    setTimeout(function () {
      node.classList.add('removing');
      setTimeout(function () { node.remove(); }, 300);
    }, duration);
  }

  /* ============================================================
   * GREETING
   * ============================================================ */
  function updateGreeting(name) {
    if (!el.heroGreeting) return;
    var h = new Date().getHours();
    var greet = 'سلام', emoji = '👋';
    if (h >= 5 && h < 11) { greet = 'صبح بخیر'; emoji = '☀️'; }
    else if (h >= 11 && h < 15) { greet = 'ظهر بخیر'; emoji = '🌤️'; }
    else if (h >= 15 && h < 19) { greet = 'عصر بخیر'; emoji = '🌇'; }
    else if (h >= 19 && h < 23) { greet = 'شب بخیر'; emoji = '🌙'; }
    else { greet = 'شب آرام'; emoji = '✨'; }
    var first = (name || '').trim().split(/\s+/)[0] || '';
    el.heroGreeting.textContent = greet + (first ? '، ' + first : '') + ' ' + emoji;
    if (el.heroEmoji) el.heroEmoji.textContent = emoji;
  }

  /* ============================================================
   * AUTH GUARD — با RPC قطعی
   * ============================================================ */
  async function requireStudent() {
    var sb = state.supabase;

    /* ۱) نشست */
    var sessionResult;
    try {
      sessionResult = await sb.auth.getSession();
    } catch (e) {
      window.location.replace('index.html');
      return null;
    }

    if (!sessionResult || !sessionResult.data || !sessionResult.data.session) {
      window.location.replace('index.html');
      return null;
    }

    /* ۲) کاربر */
    var userResult;
    try {
      userResult = await sb.auth.getUser();
    } catch (e) {
      window.location.replace('index.html');
      return null;
    }

    var user = userResult && userResult.data && userResult.data.user;
    if (!user) {
      window.location.replace('index.html');
      return null;
    }

    /* ۳) پروفایل — از طریق RPC (دور زدن RLS) */
    var profile = null;

    /* تلاش اول: RPC */
    try {
      var rpcResult = await sb.rpc('get_my_profile');
      if (!rpcResult.error && rpcResult.data) {
        profile = rpcResult.data;
      }
    } catch (e) {
      console.warn('[student] get_my_profile RPC failed:', e);
    }

    /* تلاش دوم: SELECT مستقیم (backup) */
    if (!profile) {
      try {
        var selectResult = await sb
          .from('profiles')
          .select('id, code, full_name, role, name_confirmed')
          .eq('id', user.id)
          .maybeSingle();
        if (!selectResult.error && selectResult.data) {
          profile = selectResult.data;
        }
      } catch (e) {
        console.warn('[student] fallback select failed:', e);
      }
    }

    /* اگه پروفایل نیست → انتخاب نام */
    if (!profile) {
      window.location.replace('choose-name.html');
      return null;
    }

    /* معلم → پنل معلم */
    if (profile.role === 'teacher') {
      window.location.replace('teacher.html');
      return null;
    }

    /* نام تأیید نشده → انتخاب نام (با صبر کوتاه برای retry) */
    if (profile.name_confirmed !== true) {
      /* یه بار دیگه امتحان کن — شاید commit تأخیر داشته */
      await sleep(600);

      try {
        var retry = await sb.rpc('get_my_profile');
        if (!retry.error && retry.data && retry.data.name_confirmed === true) {
          profile = retry.data;
        }
      } catch (e) {}

      if (profile.name_confirmed !== true) {
        window.location.replace('choose-name.html');
        return null;
      }
    }

    return { user: user, profile: profile };
  }

  /* ============================================================
   * LOGOUT
   * ============================================================ */
  async function logout() {
    try { await state.supabase.auth.signOut(); } catch (e) {}
    try { localStorage.removeItem('auth_profile_cache'); } catch (e) {}
    window.location.replace('index.html');
  }

  function bindLogout() {
    if (!el.logoutBtn) return;
    el.logoutBtn.addEventListener('click', function () {
      if (confirm('از حساب خود خارج می‌شوید؟')) logout();
    });
  }

  /* ============================================================
   * STATS
   * ============================================================ */
  function renderStats(activeCount, doneCount, total) {
    if (el.statActive) el.statActive.textContent = toFa(activeCount);
    if (el.statDone) el.statDone.textContent = toFa(doneCount);
    if (el.statTotal) el.statTotal.textContent = toFa(total);
    var rate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    if (el.statRate) el.statRate.textContent = toFa(rate) + '٪';
    if (el.activeCount) el.activeCount.textContent = toFa(activeCount);
    if (el.doneCount) el.doneCount.textContent = toFa(doneCount);
  }

  /* ============================================================
   * SKELETONS
   * ============================================================ */
  function renderActiveSkeletons() {
    if (!el.activeExams) return;
    var skel = '';
    for (var i = 0; i < 2; i++) {
      skel +=
        '<div class="skeleton-card">' +
          '<div style="display:flex; gap:12px;">' +
            '<div class="skeleton skel-icon"></div>' +
            '<div style="flex:1;">' +
              '<div class="skeleton skel-line title" style="margin-bottom:8px;"></div>' +
              '<div class="skeleton skel-line short"></div>' +
            '</div>' +
          '</div>' +
          '<div class="skeleton skel-line tiny"></div>' +
          '<div class="skeleton skel-btn"></div>' +
        '</div>';
    }
    el.activeExams.innerHTML = skel;
  }

  /* ============================================================
   * EMPTY STATES
   * ============================================================ */
  function renderActiveEmpty() {
    if (!el.activeExams) return;
    el.activeExams.innerHTML =
      '<div class="empty-state" style="grid-column: 1/-1;">' +
        '<div class="empty-icon">' +
          '<svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
        '</div>' +
        '<div class="empty-title">هیچ آزمون فعالی نیست</div>' +
        '<div class="empty-text">منتظر باش تا معلم آزمون جدید آپلود کنه.</div>' +
      '</div>';
  }

  function renderDoneEmpty() {
    if (!el.doneExams) return;
    el.doneExams.innerHTML =
      '<div class="empty-state" style="grid-column: 1/-1;">' +
        '<div class="empty-icon">' +
          '<svg viewBox="0 0 24 24">' +
            '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
            '<polyline points="22 4 12 14.01 9 11.01"/>' +
          '</svg>' +
        '</div>' +
        '<div class="empty-title">هنوز آزمونی انجام ندادی</div>' +
        '<div class="empty-text">وقتی آزمونی رو انجام بدی، این‌جا نمایش داده می‌شه.</div>' +
      '</div>';
  }

  function renderActiveError(message) {
    if (!el.activeExams) return;
    el.activeExams.innerHTML =
      '<div class="empty-state" style="grid-column: 1/-1;">' +
        '<div class="empty-icon">' +
          '<svg viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="8" x2="12" y2="12"/>' +
            '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
          '</svg>' +
        '</div>' +
        '<div class="empty-title">خطا در بارگذاری</div>' +
        '<div class="empty-text">' + (message || 'اینترنت رو چک کن.') + '</div>' +
      '</div>';
  }

  /* ============================================================
   * ACTIVE EXAMS
   * ============================================================ */
  function renderActiveExams(list) {
    if (!el.activeExams) return;
    if (!list.length) { renderActiveEmpty(); return; }

    var html = '';
    list.forEach(function (exam, i) {
      var delay = (i * 0.06).toFixed(2) + 's';
      html +=
        '<div class="exam-card" style="animation-delay:' + delay + ';">' +
          '<div class="exam-card-head">' +
            '<div class="exam-card-icon">' +
              '<svg viewBox="0 0 24 24">' +
                '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
                '<path d="M14 2v6h6"/>' +
                '<path d="M9 15l2 2 4-4"/>' +
              '</svg>' +
            '</div>' +
            '<div class="exam-card-title-wrap">' +
              '<div class="exam-card-title">' + escapeHtml(exam.title) + '</div>' +
              (exam.description
                ? '<div class="exam-card-desc">' + escapeHtml(exam.description) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="exam-card-meta">' +
            '<span class="meta-pill brand">' +
              '<svg viewBox="0 0 24 24">' +
                '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
                '<line x1="16" y1="2" x2="16" y2="6"/>' +
                '<line x1="8" y1="2" x2="8" y2="6"/>' +
                '<line x1="3" y1="10" x2="21" y2="10"/>' +
              '</svg>' +
              formatDate(exam.created_at) +
            '</span>' +
            '<span class="meta-pill">' +
              '<svg viewBox="0 0 24 24">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<polyline points="12 6 12 12 16 14"/>' +
              '</svg>' +
              'آماده شرکت' +
            '</span>' +
          '</div>' +
          '<div class="exam-card-footer">' +
            '<a href="take.html?id=' + encodeURIComponent(exam.id) + '" class="btn-start">' +
              '<span>شروع آزمون</span>' +
              '<svg viewBox="0 0 24 24">' +
                '<line x1="19" y1="12" x2="5" y2="12"/>' +
                '<polyline points="12 19 5 12 12 5"/>' +
              '</svg>' +
            '</a>' +
          '</div>' +
        '</div>';
    });
    el.activeExams.innerHTML = html;
  }

  /* ============================================================
   * DONE EXAMS
   * ============================================================ */
  function renderDoneExams(list) {
    if (!el.doneExams) return;
    if (!list.length) { renderDoneEmpty(); return; }

    var html = '';
    list.forEach(function (item, i) {
      var exam = item.exam;
      var sub = item.submission;
      var delay = (i * 0.06).toFixed(2) + 's';
      html +=
        '<div class="exam-card done" style="animation-delay:' + delay + ';">' +
          '<div class="exam-card-head">' +
            '<div class="exam-card-icon">' +
              '<svg viewBox="0 0 24 24">' +
                '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                '<polyline points="22 4 12 14.01 9 11.01"/>' +
              '</svg>' +
            '</div>' +
            '<div class="exam-card-title-wrap">' +
              '<div class="exam-card-title">' + escapeHtml(exam.title) + '</div>' +
              (exam.description
                ? '<div class="exam-card-desc">' + escapeHtml(exam.description) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="exam-card-meta">' +
            '<span class="meta-pill success">' +
              '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
              'ثبت‌شده' +
            '</span>' +
            '<span class="meta-pill">' +
              '<svg viewBox="0 0 24 24">' +
                '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
                '<line x1="16" y1="2" x2="16" y2="6"/>' +
                '<line x1="8" y1="2" x2="8" y2="6"/>' +
                '<line x1="3" y1="10" x2="21" y2="10"/>' +
              '</svg>' +
              formatDateTime(sub.submitted_at) +
            '</span>' +
            (sub.duration_seconds
              ? '<span class="meta-pill">' +
                  '<svg viewBox="0 0 24 24">' +
                    '<circle cx="12" cy="12" r="10"/>' +
                    '<polyline points="12 6 12 12 16 14"/>' +
                  '</svg>' +
                  formatDuration(sub.duration_seconds) +
                '</span>' : '') +
          '</div>' +
          '<div class="exam-card-footer">' +
            '<div class="badge-done">' +
              '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
              'تحویل داده شد' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    el.doneExams.innerHTML = html;
  }

  /* ============================================================
   * LOAD DATA
   * ============================================================ */
  async function loadData() {
    var sb = state.supabase;

    var examsResult;
    try {
      examsResult = await sb
        .from('exams')
        .select('id, title, description, created_at, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
    } catch (e) {
      renderActiveError('اتصال به سرور برقرار نشد');
      return;
    }

    if (examsResult.error) {
      renderActiveError('خطا در بارگذاری آزمون‌ها');
      return;
    }

    var allExams = examsResult.data || [];

    var subsResult;
    try {
      subsResult = await sb
        .from('submissions')
        .select('exam_id, submitted_at, duration_seconds')
        .eq('student_id', state.user.id)
        .order('submitted_at', { ascending: false });
    } catch (e) {
      subsResult = { data: [] };
    }

    var submissions = (subsResult.error ? [] : subsResult.data) || [];
    var subMap = {};
    submissions.forEach(function (s) { subMap[s.exam_id] = s; });

    var active = [], done = [];
    allExams.forEach(function (exam) {
      if (subMap[exam.id]) {
        done.push({ exam: exam, submission: subMap[exam.id] });
      } else {
        active.push(exam);
      }
    });

    state.activeExams = active;
    state.doneExams = done;

    renderActiveExams(active);
    renderDoneExams(done);
    renderStats(active.length, done.length, allExams.length);
  }

  /* ============================================================
   * FILL HEADER
   * ============================================================ */
  function fillHeader() {
    if (!state.profile) return;
    if (el.userName) el.userName.textContent = state.profile.full_name || 'کاربر';
    if (el.userAvatar) el.userAvatar.textContent = getInitials(state.profile.full_name);
    updateGreeting(state.profile.full_name);
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  async function init() {
    try { state.supabase = getSupabase(); }
    catch (e) {
      console.error('[student]', e);
      return;
    }

    cacheElements();
    initTheme();
    bindTheme();
    bindLogout();
    renderActiveSkeletons();

    var auth = await requireStudent();
    if (!auth) return;

    state.user = auth.user;
    state.profile = auth.profile;

    fillHeader();
    await loadData();

    state.ready = true;

    try {
      console.log(
        '%c🎓 پنل دانش‌آموز آماده\n%c' + (state.profile.full_name || 'کاربر'),
        'color: #00CEC9; font-size: 14px; font-weight: bold;',
        'color: #6C5CE7; font-size: 12px;'
      );
    } catch (e) {}
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */
  window.StudentPanel = {
    __loaded: true,
    init: init,
    logout: logout,
    toast: toast,
    state: state,
    reload: loadData
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
