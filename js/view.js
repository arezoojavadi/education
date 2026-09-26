/* ============================================================
 * js/view.js
 * ------------------------------------------------------------
 * پنل مشاهده و نمره‌دهی پاسخ‌های دانش‌آموزان
 * طراحی: فاطمه جوادی
 *
 * 🆕 نسخه‌ی جدید:
 *   • نقشه‌ی سؤالات (نقشه‌ی بصری ۱ تا N)
 *   • شمارش دقیق (X از Y)
 *   • نوار پیشرفت
 *   • هر سؤال با بج سبز/قرمز
 *   • سؤالات خالی با پس‌زمینه‌ی متمایز
 * ============================================================ */

(function () {
  'use strict';

  if (window.ViewPanel && window.ViewPanel.__loaded) return;

  /* ============================================================
   * CONFIG
   * ============================================================ */
  var SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';

  var MAX_SCORE = 20;
  var DEBUG = true;

  function log() {
    if (!DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    try { console.log.apply(console, a); } catch (e) {}
  }
  function logError() {
    var a = Array.prototype.slice.call(arguments);
    try { console.error.apply(console, a); } catch (e) {}
  }
  function logWarn() {
    var a = Array.prototype.slice.call(arguments);
    try { console.warn.apply(console, a); } catch (e) {}
  }

  /* ============================================================
   * SUPABASE
   * ============================================================ */
  function getSupabase() {
    if (window.supabaseClient) return window.supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase SDK بارگذاری نشده');
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
    exam: null,
    submissions: [],
    filtered: [],
    currentId: null,
    view: 'list',
    sort: 'date-desc',
    query: '',
    channel: null
  };

  /* ============================================================
   * DOM
   * ============================================================ */
  var el = {};

  function cacheElements() {
    el = {
      themeBtn:      document.getElementById('themeBtn'),
      logoutBtn:     document.getElementById('logoutBtn'),
      backToList:    document.getElementById('backToList'),
      refreshBtn:    document.getElementById('refreshBtn'),

      userName:      document.getElementById('userName'),
      userAvatar:    document.getElementById('userAvatar'),

      examTitle:     document.getElementById('examTitle'),
      examMeta:      document.getElementById('examMeta'),
      pageTitle:     document.getElementById('pageTitle'),

      loading:       document.getElementById('loading'),
      errorBox:      document.getElementById('errorBox'),
      errorText:     document.getElementById('errorText'),
      studentsView:  document.getElementById('studentsView'),
      detailView:    document.getElementById('detailView'),

      searchInput:   document.getElementById('searchInput'),
      sortSelect:    document.getElementById('sortSelect'),
      exportBtn:     document.getElementById('exportBtn'),

      countAll:      document.getElementById('countAll'),
      countGraded:   document.getElementById('countGraded'),
      countPending:  document.getElementById('countPending'),

      submissionsList: document.getElementById('submissionsList'),

      detailAvatar:  document.getElementById('detailAvatar'),
      detailName:    document.getElementById('detailName'),
      detailCode:    document.getElementById('detailCode'),
      detailTime:    document.getElementById('detailTime'),
      answersList:   document.getElementById('answersList'),

      gradeInput:    document.getElementById('gradeInput'),
      gradeNote:     document.getElementById('gradeNote'),
      saveGradeBtn:  document.getElementById('saveGradeBtn'),
      clearGradeBtn: document.getElementById('clearGradeBtn'),
      gradeStatus:   document.getElementById('gradeStatus'),
      gradeMax:      document.getElementById('gradeMax'),

      prevBtn:       document.getElementById('prevBtn'),
      nextBtn:       document.getElementById('nextBtn'),
      positionText:  document.getElementById('positionText'),

      toasts:        document.getElementById('toastContainer')
    };
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */
  var FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  function toFa(n) {
    return String(n === null || n === undefined ? 0 : n)
      .replace(/\d/g, function (d) { return FA_DIGITS[+d]; });
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

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

  function normalizeDigits(str) {
    if (!str) return '';
    return String(str)
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
  }

  function normalizeForSearch(str) {
    if (!str) return '';
    return normalizeDigits(String(str))
      .toLowerCase()
      .replace(/[يى]/g, 'ی')
      .replace(/[كک]/g, 'ک')
      .replace(/[أإآا]/g, 'ا')
      .replace(/\u200c/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(iso));
    } catch (e) { return '—'; }
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(iso));
    } catch (e) { return '—'; }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return formatDate(iso) + ' — ' + formatTime(iso);
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return '—';
    var s = parseInt(seconds, 10) || 0;
    if (s === 0) return '—';
    var m = Math.floor(s / 60);
    var sec = s % 60;
    if (m === 0) return toFa(sec) + ' ثانیه';
    if (sec === 0) return toFa(m) + ' دقیقه';
    return toFa(m) + ' دقیقه و ' + toFa(sec) + ' ثانیه';
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function getQuery() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return { get: function () { return null; } };
    }
  }

  function hasScore(sub) {
    return sub && sub.score !== null && sub.score !== undefined && sub.score !== '';
  }

  function isAnswered(item) {
    if (!item) return false;
    var v = item.value;
    return v !== null && v !== undefined && String(v).trim() !== '';
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
  }

  /* ============================================================
   * TOAST
   * ============================================================ */
  function toast(message, type, duration) {
    if (!el.toasts) { log('[' + (type || 'info') + '] ' + message); return; }
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
   * AUTH GUARD
   * ============================================================ */
  async function requireTeacher() {
    var sb = state.supabase;

    log('%c🔐 [Auth] شروع...', 'color: #6C5CE7; font-weight: bold;');

    var sessionResult;
    try { sessionResult = await sb.auth.getSession(); }
    catch (e) {
      showError('خطا در بررسی نشست. اینترنت را بررسی کن.');
      return null;
    }

    var session = sessionResult && sessionResult.data && sessionResult.data.session;
    if (!session) {
      window.location.replace('index.html');
      return null;
    }

    var userResult;
    try { userResult = await sb.auth.getUser(); }
    catch (e) {
      showError('خطا در دریافت کاربر');
      return null;
    }

    var user = userResult && userResult.data && userResult.data.user;
    if (!user) { window.location.replace('index.html'); return null; }

    var profile = null;

    try {
      var rpc = await sb.rpc('get_my_profile');
      if (!rpc.error && rpc.data) profile = rpc.data;
    } catch (e) {}

    if (!profile) {
      try {
        var sel = await sb
          .from('profiles')
          .select('id, code, full_name, role, name_confirmed')
          .eq('id', user.id)
          .maybeSingle();
        if (!sel.error && sel.data) profile = sel.data;
      } catch (e) {}
    }

    if (!profile) {
      window.location.replace('choose-name.html');
      return null;
    }

    if (profile.name_confirmed !== true) {
      await sleep(500);
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

    if (profile.role !== 'teacher') {
      window.location.replace('student.html');
      return null;
    }

    log('✅ [Auth] موفق');
    return { user: user, profile: profile };
  }

  /* ============================================================
   * LOGOUT
   * ============================================================ */
  async function logout() {
    try { await state.supabase.auth.signOut(); } catch (e) {}
    try { localStorage.removeItem('auth_profile_cache'); } catch (e) {}
    if (state.channel) {
      try { state.supabase.removeChannel(state.channel); } catch (e) {}
    }
    window.location.replace('index.html');
  }

  function bindLogout() {
    if (!el.logoutBtn) return;
    el.logoutBtn.addEventListener('click', function () {
      if (confirm('از حساب خود خارج می‌شوید؟')) logout();
    });
  }

  /* ============================================================
   * HEADER
   * ============================================================ */
  function fillHeader() {
    if (!state.profile) return;
    if (el.userName) el.userName.textContent = state.profile.full_name || 'کاربر';
    if (el.userAvatar) el.userAvatar.textContent = getInitials(state.profile.full_name);
  }

  /* ============================================================
   * LOAD EXAM
   * ============================================================ */
  async function loadExam(examId) {
    try {
      var r = await state.supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .maybeSingle();

      if (r.error || !r.data) {
        showError('آزمون پیدا نشد');
        return null;
      }

      state.exam = r.data;

      if (el.examTitle) el.examTitle.textContent = state.exam.title || 'آزمون';
      if (el.pageTitle) el.pageTitle.textContent = state.exam.title || 'مشاهده پاسخ‌ها';

      if (el.examMeta) {
        var parts = [];
        parts.push('ایجاد: ' + formatDate(state.exam.created_at));
        parts.push(state.exam.is_active ? 'فعال' : 'غیرفعال');
        el.examMeta.textContent = parts.join(' • ');
      }

      return state.exam;
    } catch (e) {
      logError('❌ [loadExam]', e);
      showError('خطا در بارگذاری آزمون');
      return null;
    }
  }

  /* ============================================================
   * LOAD PROFILES
   * ============================================================ */
  async function fetchProfiles(userIds) {
    if (!userIds || !userIds.length) return {};

    var sb = state.supabase;
    var map = {};

    try {
      var rpc = await sb.rpc('get_students_profiles', {
        p_user_ids: userIds
      });

      if (!rpc.error && Array.isArray(rpc.data)) {
        rpc.data.forEach(function (p) {
          if (p && p.id) map[p.id] = p;
        });
        if (Object.keys(map).length > 0) return map;
      }
    } catch (e) {}

    try {
      var sel = await sb
        .from('profiles')
        .select('id, code, full_name')
        .in('id', userIds);

      if (!sel.error && Array.isArray(sel.data)) {
        sel.data.forEach(function (p) {
          if (p && p.id) map[p.id] = p;
        });
      }
    } catch (e) {}

    return map;
  }

  /* ============================================================
   * LOAD SUBMISSIONS
   * ============================================================ */
  async function loadSubmissions() {
    if (!state.exam) return;

    log('📥 [Load] بارگذاری پاسخ‌ها...');

    try {
      var r = await state.supabase
        .from('submissions')
        .select('*')
        .eq('exam_id', state.exam.id)
        .order('submitted_at', { ascending: false });

      if (r.error) {
        logError('❌ [Load]', r.error);
        showError('خطا در بارگذاری پاسخ‌ها: ' + (r.error.message || ''));
        return;
      }

      var subs = r.data || [];

      var userIds = [];
      subs.forEach(function (s) {
        if (s.student_id && userIds.indexOf(s.student_id) === -1) {
          userIds.push(s.student_id);
        }
      });

      var profilesMap = await fetchProfiles(userIds);

      subs.forEach(function (s) {
        s.profiles = profilesMap[s.student_id] || null;
      });

      state.submissions = subs;
      log('✅ [Load] ' + subs.length + ' پاسخ');

      applyFilter();
      renderCounts();
      renderList();

    } catch (e) {
      logError('❌ [Load]', e);
      showError('خطا در بارگذاری');
    }
  }

  /* ============================================================
   * COUNTS
   * ============================================================ */
  function renderCounts() {
    var total = state.submissions.length;
    var graded = state.submissions.filter(hasScore).length;

    if (el.countAll) el.countAll.textContent = toFa(total);
    if (el.countGraded) el.countGraded.textContent = toFa(graded);
    if (el.countPending) el.countPending.textContent = toFa(total - graded);
  }

  /* ============================================================
   * FILTER + SORT
   * ============================================================ */
  function applyFilter() {
    var list = state.submissions.slice();

    if (state.query) {
      var q = normalizeForSearch(state.query);
      if (q.length > 0) {
        list = list.filter(function (s) {
          var profile = s.profiles || {};
          var name = normalizeForSearch(profile.full_name || '');
          var code = normalizeForSearch(profile.code || '');
          return name.indexOf(q) !== -1 || code.indexOf(q) !== -1;
        });
      }
    }

    if (state.sort === 'date-desc') {
      list.sort(function (a, b) {
        return new Date(b.submitted_at) - new Date(a.submitted_at);
      });
    } else if (state.sort === 'date-asc') {
      list.sort(function (a, b) {
        return new Date(a.submitted_at) - new Date(b.submitted_at);
      });
    } else if (state.sort === 'name') {
      list.sort(function (a, b) {
        var na = (a.profiles && a.profiles.full_name) || '';
        var nb = (b.profiles && b.profiles.full_name) || '';
        return na.localeCompare(nb, 'fa');
      });
    } else if (state.sort === 'pending-first') {
      list.sort(function (a, b) {
        var aG = hasScore(a) ? 1 : 0;
        var bG = hasScore(b) ? 1 : 0;
        return aG - bG;
      });
    }

    state.filtered = list;
  }

  /* ============================================================
   * محاسبه آمار یک submission
   * ============================================================ */
  function getSubmissionStats(sub) {
    var inputs = (sub && sub.answers && sub.answers.inputs) ? sub.answers.inputs : [];
    var total = inputs.length;
    var answered = 0;
    inputs.forEach(function (item) {
      if (isAnswered(item)) answered++;
    });
    var percent = total > 0 ? Math.round((answered / total) * 100) : 0;
    return {
      total: total,
      answered: answered,
      empty: total - answered,
      percent: percent
    };
  }

  /* ============================================================
   * RENDER LIST
   * ============================================================ */
  function renderList() {
    if (!el.submissionsList) return;

    if (el.studentsView) el.studentsView.style.display = 'block';
    if (el.detailView) el.detailView.style.display = 'none';
    state.view = 'list';

    if (!state.submissions.length) {
      el.submissionsList.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
              '<path d="M14 2v6h6"/>' +
            '</svg>' +
          '</div>' +
          '<div class="empty-title">هنوز هیچ پاسخی نیومده</div>' +
          '<div class="empty-text">وقتی دانش‌آموزی آزمون رو ثبت کنه، این‌جا نمایش داده می‌شه.</div>' +
        '</div>';
      return;
    }

    if (!state.filtered.length) {
      el.submissionsList.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' +
            '<svg viewBox="0 0 24 24">' +
              '<circle cx="11" cy="11" r="8"/>' +
              '<line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
            '</svg>' +
          '</div>' +
          '<div class="empty-title">نتیجه‌ای پیدا نشد</div>' +
          '<div class="empty-text">عبارت جستجو رو تغییر بده.</div>' +
        '</div>';
      return;
    }

    var html = '';
    state.filtered.forEach(function (s, i) {
      var profile = s.profiles || {};
      var name = (profile.full_name && profile.full_name.trim()) || 'بدون نام';
      var code = profile.code || '—';
      var initials = getInitials(name);
      var delay = (i * 0.03).toFixed(2) + 's';

      var graded = hasScore(s);
      var scoreDisplay = graded ? toFa(s.score) : '—';

      var stats = getSubmissionStats(s);

      html +=
        '<div class="student-row ' + (graded ? 'graded' : 'pending') + '" data-id="' + s.id + '" style="animation-delay:' + delay + ';">' +
          '<div class="student-avatar">' + escapeHtml(initials) + '</div>' +

          '<div class="student-info">' +
            '<div class="student-name">' + escapeHtml(name) + '</div>' +
            '<div class="student-meta">' +
              '<span class="meta-code">' + escapeHtml(code) + '</span>' +
              '<span class="meta-sep">•</span>' +
              '<span>' + formatDate(s.submitted_at) + '</span>' +
              '<span class="meta-sep">•</span>' +
              '<span>' + formatTime(s.submitted_at) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="student-extra">' +
            '<div class="extra-answers">' +
              '<b>' + toFa(stats.answered) + '</b> از ' + toFa(stats.total) +
            '</div>' +
            '<div class="extra-duration">' + formatDuration(s.duration_seconds) + '</div>' +
          '</div>' +

          '<div class="student-score ' + (graded ? 'graded' : 'pending') + '">' +
            '<div class="score-value">' + scoreDisplay + '</div>' +
            '<div class="score-label">' + (graded ? 'از ۲۰' : 'تصحیح نشده') + '</div>' +
          '</div>' +

          '<div class="student-arrow">' +
            '<svg viewBox="0 0 24 24">' +
              '<polyline points="15 18 9 12 15 6"/>' +
            '</svg>' +
          '</div>' +
        '</div>';
    });

    el.submissionsList.innerHTML = html;

    el.submissionsList.querySelectorAll('.student-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.getAttribute('data-id');
        if (id) showDetail(id);
      });
    });
  }

  /* ============================================================
   * SHOW DETAIL
   * ============================================================ */
  function showDetail(submissionId) {
    var sub = null;
    for (var i = 0; i < state.submissions.length; i++) {
      if (state.submissions[i].id === submissionId) {
        sub = state.submissions[i];
        break;
      }
    }
    if (!sub) { toast('پاسخ پیدا نشد', 'error'); return; }

    state.currentId = submissionId;
    state.view = 'detail';

    try {
      var url = new URL(window.location.href);
      url.searchParams.set('sub', submissionId);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}

    if (el.studentsView) el.studentsView.style.display = 'none';
    if (el.detailView) el.detailView.style.display = 'block';

    var profile = sub.profiles || {};
    var name = (profile.full_name && profile.full_name.trim()) || 'بدون نام';

    if (el.detailAvatar) el.detailAvatar.textContent = getInitials(name);
    if (el.detailName) el.detailName.textContent = name;
    if (el.detailCode) el.detailCode.textContent = profile.code || '—';

    if (el.detailTime) {
      el.detailTime.textContent = formatDateTime(sub.submitted_at) + ' • مدت: ' + formatDuration(sub.duration_seconds);
    }

    renderAnswers(sub.answers);
    renderGrading(sub);
    updatePosition();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToList() {
    state.currentId = null;
    state.view = 'list';

    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('sub');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}

    renderList();
  }

  /* ============================================================
   * 🆕 RENDER ANSWERS — با نقشه‌ی سؤالات + شمارش دقیق
   * ============================================================ */
  function renderAnswers(answers) {
    if (!el.answersList) return;

    var inputs = (answers && answers.inputs) ? answers.inputs : [];

    if (!inputs.length) {
      el.answersList.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
              '<path d="M14 2v6h6"/>' +
            '</svg>' +
          '</div>' +
          '<div class="empty-title">هیچ سؤالی ثبت نشده</div>' +
          '<div class="empty-text">فایل آزمون سؤالی نداشت یا هنوز پاسخی ثبت نشده.</div>' +
        '</div>';
      return;
    }

    var typeLabels = {
      radio: 'تک‌انتخابی',
      checkbox: 'چندگزینه‌ای',
      text: 'متنی',
      number: 'عددی',
      email: 'ایمیل',
      tel: 'تلفن',
      textarea: 'تشریحی',
      select: 'انتخابی',
      url: 'لینک',
      date: 'تاریخ',
      time: 'ساعت'
    };

    /* شمارش */
    var answeredCount = 0;
    var emptyCount = 0;
    inputs.forEach(function (it) {
      if (isAnswered(it)) answeredCount++;
      else emptyCount++;
    });

    var total = inputs.length;
    var percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

    /* ══════════════════════════════════════════════════════
       بخش ۱: خلاصه‌ی کلی (Counters + Progress)
       ══════════════════════════════════════════════════════ */
    var summaryHtml =
      '<div class="answers-overview">' +

        '<div class="overview-counters">' +
          '<div class="ov-counter ok">' +
            '<span class="ov-value">' + toFa(answeredCount) + '</span>' +
            '<span class="ov-label">پاسخ داده</span>' +
          '</div>' +
          '<div class="ov-counter empty">' +
            '<span class="ov-value">' + toFa(emptyCount) + '</span>' +
            '<span class="ov-label">بدون پاسخ</span>' +
          '</div>' +
          '<div class="ov-counter total">' +
            '<span class="ov-value">' + toFa(total) + '</span>' +
            '<span class="ov-label">کل سؤالات</span>' +
          '</div>' +
        '</div>' +

        '<div class="overview-progress">' +
          '<div class="prog-label">' +
            '<span>پیشرفت پاسخ‌دهی</span>' +
            '<span class="prog-percent">' + toFa(percent) + '٪</span>' +
          '</div>' +
          '<div class="prog-bar">' +
            '<div class="prog-fill" style="width:' + percent + '%"></div>' +
          '</div>' +
        '</div>' +

      '</div>';

    /* ══════════════════════════════════════════════════════
       بخش ۲: نقشه‌ی سؤالات (Question Map)
       ══════════════════════════════════════════════════════ */
    var mapItemsHtml = '';
    inputs.forEach(function (item, i) {
      var idx = item.index || (i + 1);
      var answered = isAnswered(item);
      var label = item.label || item.name || 'سؤال ' + idx;

      mapItemsHtml +=
        '<div class="qmap-item ' + (answered ? 'ok' : 'empty') + '" ' +
             'data-target="q-detail-' + idx + '" ' +
             'title="' + escapeHtml(label.slice(0, 100)) + '">' +
          '<span class="qmap-num">' + toFa(idx) + '</span>' +
          (answered
            ? '<svg class="qmap-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg class="qmap-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          ) +
        '</div>';
    });

    var mapHtml =
      '<div class="qmap-card">' +
        '<div class="qmap-header">' +
          '<div class="qmap-title">' +
            '<svg viewBox="0 0 24 24">' +
              '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
              '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
              '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
              '<rect x="14" y="14" width="7" height="7" rx="1"/>' +
            '</svg>' +
            '<span>نقشه‌ی سؤالات</span>' +
          '</div>' +
          '<div class="qmap-legend">' +
            '<span class="legend-item">' +
              '<span class="legend-dot ok"></span>' +
              '<span>پاسخ داده</span>' +
            '</span>' +
            '<span class="legend-item">' +
              '<span class="legend-dot empty"></span>' +
              '<span>بدون پاسخ</span>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="qmap-grid">' + mapItemsHtml + '</div>' +
      '</div>';

    /* ══════════════════════════════════════════════════════
       بخش ۳: لیست تفصیلی هر سؤال
       ══════════════════════════════════════════════════════ */
    var detailsHtml = '<div class="answers-details">';

    inputs.forEach(function (item, i) {
      var idx = item.index || (i + 1);
      var type = item.type || 'text';
      var value = item.value;
      var answered = isAnswered(item);
      var label = item.label || item.name || 'سؤال ' + toFa(idx);
      var typeLabel = typeLabels[type] || type;

      detailsHtml +=
        '<div class="answer-item ' + (answered ? 'ok' : 'empty') + '" id="q-detail-' + idx + '" ' +
             'style="animation-delay:' + (i * 0.015).toFixed(2) + 's;">' +

          '<div class="answer-head">' +
            '<span class="answer-number ' + (answered ? 'ok' : 'empty') + '">' + toFa(idx) + '</span>' +
            '<div class="answer-label">' +
              '<div class="answer-label-text">' + escapeHtml(label) + '</div>' +
              '<span class="answer-type">' + escapeHtml(typeLabel) + '</span>' +
            '</div>' +
            (answered
              ? '<span class="answer-badge ok">' +
                  '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
                  'پاسخ داده' +
                '</span>'
              : '<span class="answer-badge empty">' +
                  '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                  'بدون پاسخ' +
                '</span>'
            ) +
          '</div>' +

          '<div class="answer-value ' + (answered ? 'has-content' : 'empty') + '">' +
            (answered ? escapeHtml(String(value)) : 'این سؤال رو پاسخ نداده') +
          '</div>' +

        '</div>';
    });

    detailsHtml += '</div>';

    /* ══════════════════════════════════════════════════════
       ترکیب نهایی
       ══════════════════════════════════════════════════════ */
    el.answersList.innerHTML = summaryHtml + mapHtml + detailsHtml;

    /* ─── کلیک روی نقشه → اسکرول به جزئیات ─── */
    el.answersList.querySelectorAll('.qmap-item').forEach(function (node) {
      node.addEventListener('click', function () {
        var targetId = node.getAttribute('data-target');
        var target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('flash');
          setTimeout(function () { target.classList.remove('flash'); }, 1200);
        }
      });
    });
  }

  /* ============================================================
   * GRADING
   * ============================================================ */
  function renderGrading(sub) {
    if (!sub) return;

    var graded = hasScore(sub);

    if (el.gradeMax) el.gradeMax.textContent = toFa(MAX_SCORE);

    if (el.gradeInput) {
      el.gradeInput.value = graded ? String(sub.score) : '';
      el.gradeInput.max = MAX_SCORE;
    }

    if (el.gradeNote) {
      el.gradeNote.value = sub.teacher_note || '';
    }

    if (el.gradeStatus) {
      if (graded) {
        var gradedAt = sub.graded_at ? formatDateTime(sub.graded_at) : '';
        el.gradeStatus.innerHTML =
          '<div class="grade-status-box ok">' +
            '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
            '<div>' +
              '<b>نمره ثبت شده: ' + toFa(sub.score) + ' از ' + toFa(MAX_SCORE) + '</b>' +
              (gradedAt ? '<div class="grade-status-time">آخرین تصحیح: ' + gradedAt + '</div>' : '') +
            '</div>' +
          '</div>';
      } else {
        el.gradeStatus.innerHTML =
          '<div class="grade-status-box pending">' +
            '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
            '<div><b>هنوز تصحیح نشده</b></div>' +
          '</div>';
      }
    }

    if (el.clearGradeBtn) {
      el.clearGradeBtn.style.display = graded ? 'inline-flex' : 'none';
    }
  }

  async function saveGrade() {
    if (!state.currentId) return;

    var score = el.gradeInput ? parseFloat(el.gradeInput.value) : NaN;
    var note = el.gradeNote ? el.gradeNote.value.trim() : '';

    if (isNaN(score)) {
      toast('نمره رو وارد کن', 'error');
      if (el.gradeInput) el.gradeInput.focus();
      return;
    }

    if (score < 0 || score > MAX_SCORE) {
      toast('نمره باید بین ۰ تا ' + toFa(MAX_SCORE) + ' باشه', 'error');
      if (el.gradeInput) el.gradeInput.focus();
      return;
    }

    var btn = el.saveGradeBtn;
    var oldHTML = btn ? btn.innerHTML : '';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm"></span><span>در حال ذخیره...</span>';
    }

    try {
      var r = await state.supabase
        .from('submissions')
        .update({
          score: score,
          teacher_note: note || null,
          graded_at: new Date().toISOString(),
          graded_by: state.user.id
        })
        .eq('id', state.currentId);

      if (r.error) {
        logError('❌ [Grade]', r.error);
        toast('خطا: ' + (r.error.message || ''), 'error');
        return;
      }

      for (var i = 0; i < state.submissions.length; i++) {
        if (state.submissions[i].id === state.currentId) {
          state.submissions[i].score = score;
          state.submissions[i].teacher_note = note || null;
          state.submissions[i].graded_at = new Date().toISOString();
          state.submissions[i].graded_by = state.user.id;
          break;
        }
      }

      toast('✅ نمره ذخیره شد', 'success');

      var updated = null;
      for (var j = 0; j < state.submissions.length; j++) {
        if (state.submissions[j].id === state.currentId) {
          updated = state.submissions[j];
          break;
        }
      }

      renderGrading(updated);
      renderCounts();
      applyFilter();

    } catch (e) {
      logError('❌ [Grade]', e);
      toast('خطای غیرمنتظره', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHTML;
      }
    }
  }

  async function clearGrade() {
    if (!state.currentId) return;
    if (!confirm('مطمئنی می‌خوای نمره رو پاک کنی؟')) return;

    try {
      var r = await state.supabase
        .from('submissions')
        .update({
          score: null,
          teacher_note: null,
          graded_at: null,
          graded_by: null
        })
        .eq('id', state.currentId);

      if (r.error) {
        toast('خطا: ' + (r.error.message || ''), 'error');
        return;
      }

      for (var i = 0; i < state.submissions.length; i++) {
        if (state.submissions[i].id === state.currentId) {
          state.submissions[i].score = null;
          state.submissions[i].teacher_note = null;
          state.submissions[i].graded_at = null;
          state.submissions[i].graded_by = null;
          break;
        }
      }

      toast('🗑 نمره پاک شد', 'info');

      var updated = null;
      for (var j = 0; j < state.submissions.length; j++) {
        if (state.submissions[j].id === state.currentId) {
          updated = state.submissions[j];
          break;
        }
      }

      renderGrading(updated);
      renderCounts();
      applyFilter();

    } catch (e) {
      logError('❌ [Grade]', e);
      toast('خطای غیرمنتظره', 'error');
    }
  }

  /* ============================================================
   * NAV
   * ============================================================ */
  function updatePosition() {
    if (!state.currentId) return;

    var list = state.filtered.length ? state.filtered : state.submissions;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.currentId) { idx = i; break; }
    }

    if (idx === -1) return;

    if (el.positionText) el.positionText.textContent = toFa(idx + 1) + ' از ' + toFa(list.length);
    if (el.prevBtn) el.prevBtn.disabled = idx === 0;
    if (el.nextBtn) el.nextBtn.disabled = idx === list.length - 1;
  }

  function goPrev() {
    var list = state.filtered.length ? state.filtered : state.submissions;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.currentId) {
        if (i > 0) showDetail(list[i - 1].id);
        return;
      }
    }
  }

  function goNext() {
    var list = state.filtered.length ? state.filtered : state.submissions;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.currentId) {
        if (i < list.length - 1) showDetail(list[i + 1].id);
        return;
      }
    }
  }

  /* ============================================================
   * EXPORT CSV
   * ============================================================ */
  function exportCSV() {
    if (!state.submissions.length) {
      toast('داده‌ای برای خروجی نیست', 'warn');
      return;
    }

    var rows = [
      ['ردیف', 'نام دانش‌آموز', 'کد', 'تاریخ', 'ساعت', 'مدت (ثانیه)', 'پاسخ داده', 'بدون پاسخ', 'کل', 'نمره', 'یادداشت معلم']
    ];

    state.submissions.forEach(function (s, i) {
      var profile = s.profiles || {};
      var stats = getSubmissionStats(s);

      rows.push([
        i + 1,
        profile.full_name || '—',
        profile.code || '—',
        formatDate(s.submitted_at),
        formatTime(s.submitted_at),
        s.duration_seconds || 0,
        stats.answered,
        stats.empty,
        stats.total,
        hasScore(s) ? s.score : '—',
        s.teacher_note || '—'
      ]);
    });

    var csv = rows.map(function (r) {
      return r.map(escapeCSV).join(',');
    }).join('\n');

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var filename = 'نمرات_' +
      (state.exam && state.exam.title
        ? state.exam.title.replace(/[^\u0600-\u06FF\w]/g, '_')
        : 'آزمون') +
      '_' + Date.now() + '.csv';

    downloadBlob(blob, filename);
    toast('✅ CSV دانلود شد', 'success');
  }

  function escapeCSV(field) {
    var s = String(field === null || field === undefined ? '' : field);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadBlob(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      toast('خطا در دانلود', 'error');
    }
  }

  /* ============================================================
   * REALTIME
   * ============================================================ */
  function subscribeRealtime() {
    if (!state.exam) return;

    try {
      var channel = state.supabase
        .channel('exam_subs_' + state.exam.id)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: 'exam_id=eq.' + state.exam.id
        }, async function (payload) {
          try {
            var profilesMap = await fetchProfiles([payload.new.student_id]);

            var full = Object.assign({}, payload.new, {
              profiles: profilesMap[payload.new.student_id] || null
            });

            state.submissions.unshift(full);
            applyFilter();
            renderCounts();
            if (state.view === 'list') renderList();

            var name = (profilesMap[payload.new.student_id] && profilesMap[payload.new.student_id].full_name) || 'دانش‌آموز';
            toast('📬 پاسخ جدید از ' + name, 'success', 4000);
          } catch (e) {
            logWarn('⚠️ [Realtime]', e);
          }
        })
        .subscribe();

      state.channel = channel;
    } catch (e) {
      logWarn('⚠️ [Realtime] subscribe:', e);
    }
  }

  function unsubscribeRealtime() {
    if (state.channel) {
      try { state.supabase.removeChannel(state.channel); } catch (e) {}
      state.channel = null;
    }
  }

  /* ============================================================
   * ERROR
   * ============================================================ */
  function showError(message) {
    if (el.loading) el.loading.style.display = 'none';
    if (el.studentsView) el.studentsView.style.display = 'none';
    if (el.detailView) el.detailView.style.display = 'none';

    if (el.errorBox) {
      el.errorBox.style.display = 'block';
      if (el.errorText) el.errorText.textContent = message;
    }
  }

  /* ============================================================
   * BIND EVENTS
   * ============================================================ */
  function bindEvents() {
    if (el.searchInput) {
      var t = null;
      el.searchInput.addEventListener('input', function (e) {
        clearTimeout(t);
        var val = e.target.value;
        t = setTimeout(function () {
          state.query = (val || '').trim();
          applyFilter();
          renderList();
        }, 250);
      });

      el.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          el.searchInput.value = '';
          state.query = '';
          applyFilter();
          renderList();
        }
      });
    }

    if (el.sortSelect) {
      el.sortSelect.addEventListener('change', function (e) {
        state.sort = e.target.value || 'date-desc';
        applyFilter();
        renderList();
      });
    }

    if (el.exportBtn) el.exportBtn.addEventListener('click', exportCSV);
    if (el.backToList) el.backToList.addEventListener('click', backToList);
    if (el.prevBtn) el.prevBtn.addEventListener('click', goPrev);
    if (el.nextBtn) el.nextBtn.addEventListener('click', goNext);
    if (el.saveGradeBtn) el.saveGradeBtn.addEventListener('click', saveGrade);
    if (el.clearGradeBtn) el.clearGradeBtn.addEventListener('click', clearGrade);

    if (el.refreshBtn) {
      el.refreshBtn.addEventListener('click', async function () {
        toast('🔄 رفرش...', 'info', 1000);
        await loadSubmissions();
        toast('✅ رفرش شد', 'success', 1500);
      });
    }

    if (el.gradeInput) {
      el.gradeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveGrade();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (el.searchInput) el.searchInput.focus();
      }

      if (state.view === 'detail') {
        if (e.key === 'Escape') backToList();
        else if (e.key === 'ArrowLeft') {
          if (!el.nextBtn || !el.nextBtn.disabled) goNext();
        } else if (e.key === 'ArrowRight') {
          if (!el.prevBtn || !el.prevBtn.disabled) goPrev();
        }
      }
    });

    window.addEventListener('beforeunload', function () {
      unsubscribeRealtime();
    });
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  async function init() {
    log(
      '%c📋 پنل نمره‌دهی\n%cطراحی: فاطمه جوادی',
      'color: #6C5CE7; font-size: 16px; font-weight: bold;',
      'color: #00CEC9; font-size: 12px;'
    );

    try {
      state.supabase = getSupabase();
    } catch (e) {
      logError('❌ [Init]', e);
      showError('خطا در بارگذاری سیستم');
      return;
    }

    cacheElements();
    initTheme();
    bindTheme();
    bindLogout();
    bindEvents();

    var auth = await requireTeacher();
    if (!auth) return;

    state.user = auth.user;
    state.profile = auth.profile;
    fillHeader();

    var params = getQuery();
    var examId = params.get('id');

    if (!examId) {
      showError('شناسه آزمون یافت نشد');
      return;
    }

    var exam = await loadExam(examId);
    if (!exam) return;

    await loadSubmissions();

    if (el.loading) el.loading.style.display = 'none';
    if (el.studentsView) el.studentsView.style.display = 'block';

    subscribeRealtime();

    var subId = params.get('sub');
    if (subId) {
      setTimeout(function () { showDetail(subId); }, 200);
    }

    log('%c✅ [Init] آماده', 'color: #00B894; font-weight: bold;');
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */
  window.ViewPanel = {
    __loaded: true,
    state: state,
    reload: loadSubmissions,
    showDetail: showDetail,
    backToList: backToList,
    exportCSV: exportCSV,
    saveGrade: saveGrade,
    clearGrade: clearGrade,
    toast: toast
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
