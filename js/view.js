/* ============================================================
 * js/view.js
 * ------------------------------------------------------------
 * منطق مشاهده‌ی پاسخ‌های دانش‌آموزان توسط معلم
 * طراحی: فاطمه جوادی
 *
 * قابلیت‌ها:
 *   • چک لاگین + نقش معلم
 *   • لود آزمون و پاسخ‌های مربوطه
 *   • لیست دانش‌آموزان با جستجوی زنده
 *   • نمایش جزئیات یک پاسخ
 *   • مرتب‌سازی بر اساس تاریخ / نام
 *   • خروجی CSV
 *   • Realtime — پاسخ جدید زنده میاد
 *   • Toast + Theme + ریسپانسیو
 *
 * وابستگی: @supabase/supabase-js از CDN
 * ============================================================ */

(function () {
  'use strict';

  if (window.ViewPanel && window.ViewPanel.__loaded) return;

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
    exam: null,
    submissions: [],
    filtered: [],
    currentId: null,
    view: 'list', // 'list' | 'detail'
    sort: 'date-desc',
    query: '',
    channel: null,
    isRedirecting: false,
    ready: false
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

      userName:      document.getElementById('userName'),
      userAvatar:    document.getElementById('userAvatar'),

      examTitle:     document.getElementById('examTitle'),
      examMeta:      document.getElementById('examMeta'),
      pageTitle:     document.getElementById('pageTitle'),

      loading:       document.getElementById('loading'),
      studentsView:  document.getElementById('studentsView'),
      detailView:    document.getElementById('detailView'),

      searchInput:   document.getElementById('searchInput'),
      sortSelect:    document.getElementById('sortSelect'),
      exportBtn:     document.getElementById('exportBtn'),

      totalCount:    document.getElementById('totalCount'),
      submissionsList: document.getElementById('submissionsList'),

      detailAvatar:  document.getElementById('detailAvatar'),
      detailName:    document.getElementById('detailName'),
      detailMeta:    document.getElementById('detailMeta'),
      answersList:   document.getElementById('answersList'),

      prevBtn:       document.getElementById('prevBtn'),
      nextBtn:       document.getElementById('nextBtn'),
      positionText:  document.getElementById('positionText'),

      toasts:        document.getElementById('toastContainer')
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

  function formatTime(seconds) {
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

  function getQuery() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return { get: function () { return null; } };
    }
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
   * AUTH GUARD — فقط معلم
   * ============================================================ */
  async function requireTeacher() {
    var sb = state.supabase;

    var sessionResult;
    try { sessionResult = await sb.auth.getSession(); }
    catch (e) { window.location.replace('index.html'); return null; }

    if (!sessionResult || !sessionResult.data || !sessionResult.data.session) {
      window.location.replace('index.html');
      return null;
    }

    var userResult;
    try { userResult = await sb.auth.getUser(); }
    catch (e) { window.location.replace('index.html'); return null; }

    var user = userResult && userResult.data && userResult.data.user;
    if (!user) { window.location.replace('index.html'); return null; }

    var profile = null;

    /* RPC */
    try {
      var rpc = await sb.rpc('get_my_profile');
      if (!rpc.error && rpc.data) profile = rpc.data;
    } catch (e) {}

    /* fallback */
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
        .select('id, title, description, file_path, file_size, is_active, created_at')
        .eq('id', examId)
        .maybeSingle();

      if (r.error || !r.data) {
        toast('آزمون پیدا نشد', 'error');
        setTimeout(function () {
          window.location.replace('teacher.html');
        }, 1200);
        return null;
      }

      state.exam = r.data;

      if (el.examTitle) el.examTitle.textContent = state.exam.title || 'آزمون';
      if (el.pageTitle) el.pageTitle.textContent = state.exam.title || 'مشاهده پاسخ‌ها';

      if (el.examMeta) {
        var parts = [];
        parts.push(formatDate(state.exam.created_at));
        if (state.exam.file_size) {
          parts.push(toFa((state.exam.file_size / 1024).toFixed(0)) + ' کیلوبایت');
        }
        parts.push(state.exam.is_active ? 'فعال' : 'غیرفعال');
        el.examMeta.textContent = parts.join(' • ');
      }

      return state.exam;
    } catch (e) {
      console.warn('[view] loadExam failed:', e);
      toast('خطا در بارگذاری آزمون', 'error');
      return null;
    }
  }

  /* ============================================================
   * LOAD SUBMISSIONS
   * ============================================================ */
  async function loadSubmissions() {
    if (!state.exam) return;

    try {
      var r = await state.supabase
        .from('submissions')
        .select(`
          id,
          submitted_at,
          duration_seconds,
          answers,
          student_id
        `)
        .eq('exam_id', state.exam.id)
        .order('submitted_at', { ascending: false });

      if (r.error) {
        console.warn('[view] submissions:', r.error);
        renderError('خطا در بارگذاری پاسخ‌ها');
        return;
      }

      var subs = r.data || [];

      /* اطلاعات پروفایل رو جدا می‌گیریم (چون join ممکنه RLS داشته باشه) */
      var userIds = [];
      subs.forEach(function (s) {
        if (s.student_id && userIds.indexOf(s.student_id) === -1) {
          userIds.push(s.student_id);
        }
      });

      var profilesMap = {};
      if (userIds.length) {
        try {
          var pr = await state.supabase
            .from('profiles')
            .select('id, code, full_name')
            .in('id', userIds);

          (pr.data || []).forEach(function (p) {
            profilesMap[p.id] = p;
          });
        } catch (e) {
          console.warn('[view] profiles fetch:', e);
        }
      }

      /* ادغام */
      subs.forEach(function (s) {
        s.profiles = profilesMap[s.student_id] || null;
      });

      state.submissions = subs;
      state.filtered = subs.slice();
      applySortAndFilter();
      renderList();

    } catch (e) {
      console.warn('[view] loadSubmissions:', e);
      renderError('خطا در بارگذاری');
    }
  }

  /* ============================================================
   * SORT + FILTER
   * ============================================================ */
  function applySortAndFilter() {
    var list = state.submissions.slice();

    /* فیلتر جستجو */
    if (state.query) {
      var q = state.query.toLowerCase();
      list = list.filter(function (s) {
        var name = (s.profiles && s.profiles.full_name) || '';
        var code = (s.profiles && s.profiles.code) || '';
        return name.toLowerCase().indexOf(q) !== -1 ||
               code.indexOf(q) !== -1;
      });
    }

    /* مرتب‌سازی */
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
    } else if (state.sort === 'duration-desc') {
      list.sort(function (a, b) {
        return (b.duration_seconds || 0) - (a.duration_seconds || 0);
      });
    }

    state.filtered = list;
  }

  /* ============================================================
   * RENDER LIST
   * ============================================================ */
  function renderList() {
    if (!el.submissionsList) return;

    /* نمایش view لیست */
    if (el.studentsView) el.studentsView.style.display = 'block';
    if (el.detailView) el.detailView.style.display = 'none';
    state.view = 'list';

    /* تعداد کل */
    if (el.totalCount) {
      el.totalCount.textContent = toFa(state.submissions.length);
    }

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
          '<div class="empty-text">' +
            'وقتی دانش‌آموزی آزمون رو ثبت کنه، این‌جا نمایش داده می‌شه.' +
          '</div>' +
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
          '<div class="empty-text">عبارت دیگه‌ای جستجو کن.</div>' +
        '</div>';
      return;
    }

    var html = '';
    state.filtered.forEach(function (s, i) {
      var profile = s.profiles || {};
      var name = profile.full_name || 'دانش‌آموز';
      var code = profile.code || '—';
      var initials = getInitials(name);
      var answersCount = (s.answers && s.answers.inputs) ? s.answers.inputs.length : 0;
      var delay = (i * 0.04).toFixed(2) + 's';

      html +=
        '<div class="submission-card" data-id="' + s.id + '" style="animation-delay:' + delay + ';">' +
          '<div class="submission-avatar">' + escapeHtml(initials) + '</div>' +
          '<div class="submission-info">' +
            '<div class="submission-name">' + escapeHtml(name) + '</div>' +
            '<div class="submission-meta">' +
              '<span class="submission-code">' + escapeHtml(code) + '</span>' +
              '<span class="meta-dot">•</span>' +
              '<span>' + formatDateTime(s.submitted_at) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="submission-stats">' +
            '<div class="submission-stat">' +
              '<svg viewBox="0 0 24 24">' +
                '<polyline points="9 11 12 14 22 4"/>' +
                '<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' +
              '</svg>' +
              '<span>' + toFa(answersCount) + ' پاسخ</span>' +
            '</div>' +
            '<div class="submission-stat">' +
              '<svg viewBox="0 0 24 24">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<polyline points="12 6 12 12 16 14"/>' +
              '</svg>' +
              '<span>' + formatTime(s.duration_seconds) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="submission-arrow">' +
            '<svg viewBox="0 0 24 24">' +
              '<polyline points="15 18 9 12 15 6"/>' +
            '</svg>' +
          '</div>' +
        '</div>';
    });

    el.submissionsList.innerHTML = html;

    /* رویداد کلیک */
    el.submissionsList.querySelectorAll('.submission-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-id');
        if (id) showDetail(id);
      });
    });
  }

  function renderError(message) {
    if (el.loading) el.loading.style.display = 'none';
    if (el.studentsView) el.studentsView.style.display = 'block';
    if (el.submissionsList) {
      el.submissionsList.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' +
            '<svg viewBox="0 0 24 24">' +
              '<circle cx="12" cy="12" r="10"/>' +
              '<line x1="12" y1="8" x2="12" y2="12"/>' +
              '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
            '</svg>' +
          '</div>' +
          '<div class="empty-title">خطا</div>' +
          '<div class="empty-text">' + (message || 'دوباره تلاش کن.') + '</div>' +
        '</div>';
    }
  }

  /* ============================================================
   * SHOW DETAIL
   * ============================================================ */
  function showDetail(submissionId) {
    var sub = null;
    for (var i = 0; i < state.filtered.length; i++) {
      if (state.filtered[i].id === submissionId) {
        sub = state.filtered[i];
        break;
      }
    }

    if (!sub) {
      /* شاید توی کل لیست باشه ولی فیلتر شده */
      for (var j = 0; j < state.submissions.length; j++) {
        if (state.submissions[j].id === submissionId) {
          sub = state.submissions[j];
          break;
        }
      }
    }

    if (!sub) {
      toast('پاسخ پیدا نشد', 'error');
      return;
    }

    state.currentId = submissionId;
    state.view = 'detail';

    /* تغییر URL بدون reload */
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('sub', submissionId);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}

    /* هدر */
    if (el.studentsView) el.studentsView.style.display = 'none';
    if (el.detailView) el.detailView.style.display = 'block';

    var profile = sub.profiles || {};
    var name = profile.full_name || 'دانش‌آموز';

    if (el.detailAvatar) el.detailAvatar.textContent = getInitials(name);
    if (el.detailName) el.detailName.textContent = name;

    if (el.detailMeta) {
      var parts = [];
      if (profile.code) parts.push('کد: ' + profile.code);
      parts.push(formatDateTime(sub.submitted_at));
      if (sub.duration_seconds) parts.push('مدت: ' + formatTime(sub.duration_seconds));
      el.detailMeta.textContent = parts.join(' • ');
    }

    /* پاسخ‌ها */
    renderAnswers(sub.answers);

    /* موقعیت */
    updatePosition();

    /* اسکرول به بالا */
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToList() {
    state.currentId = null;
    state.view = 'list';

    /* حذف از URL */
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('sub');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}

    renderList();
  }

  /* ============================================================
   * POSITION (Prev / Next)
   * ============================================================ */
  function updatePosition() {
    if (!state.currentId) return;

    var list = state.filtered.length ? state.filtered : state.submissions;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.currentId) { idx = i; break; }
    }

    if (idx === -1) return;

    if (el.positionText) {
      el.positionText.textContent = toFa(idx + 1) + ' از ' + toFa(list.length);
    }

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
   * RENDER ANSWERS
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
          '<div class="empty-title">هیچ پاسخی ثبت نشده</div>' +
          '<div class="empty-text">دانش‌آموز هیچ فیلدی رو پر نکرده.</div>' +
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
      time: 'ساعت',
      range: 'بازه',
      color: 'رنگ',
      file: 'فایل'
    };

    var html = '';
    inputs.forEach(function (item, i) {
      var idx = item.index || (i + 1);
      var type = item.type || 'text';
      var value = item.value;
      var hasValue = value !== null && value !== undefined && String(value).trim() !== '';
      var label = item.label || item.name || 'سؤال ' + toFa(idx);
      var typeLabel = typeLabels[type] || type;

      html +=
        '<div class="answer-item" style="animation-delay:' + (i * 0.03).toFixed(2) + 's;">' +
          '<div class="answer-head">' +
            '<span class="answer-number">' + toFa(idx) + '</span>' +
            '<div class="answer-label">' +
              '<div class="answer-label-text">' + escapeHtml(label) + '</div>' +
              '<span class="answer-type">' + escapeHtml(typeLabel) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="answer-value ' + (hasValue ? '' : 'empty') + '">' +
            (hasValue ? escapeHtml(String(value)) : 'بدون پاسخ') +
          '</div>' +
        '</div>';
    });

    el.answersList.innerHTML = html;
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
      ['ردیف', 'نام دانش‌آموز', 'کد', 'تاریخ ثبت', 'مدت (ثانیه)', 'تعداد پاسخ', 'جزئیات پاسخ‌ها']
    ];

    state.submissions.forEach(function (s, i) {
      var profile = s.profiles || {};
      var answers = (s.answers && s.answers.inputs) ? s.answers.inputs : [];

      var detail = answers.map(function (a) {
        var label = a.label || a.name || 'سؤال ' + a.index;
        var value = a.value !== null && a.value !== undefined ? a.value : '—';
        return '[' + a.index + '] ' + label + ': ' + value;
      }).join(' | ');

      rows.push([
        i + 1,
        profile.full_name || '—',
        profile.code || '—',
        s.submitted_at ? new Date(s.submitted_at).toLocaleString('fa-IR') : '—',
        s.duration_seconds || 0,
        answers.length,
        detail
      ]);
    });

    var csv = rows.map(function (r) {
      return r.map(escapeCSV).join(',');
    }).join('\n');

    /* BOM برای Excel فارسی */
    var blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8'
    });

    var filename = 'پاسخ‌های_' +
      (state.exam && state.exam.title ? state.exam.title.replace(/[^\u0600-\u06FF\w]/g, '_') : 'آزمون') +
      '_' + Date.now() + '.csv';

    downloadBlob(blob, filename);
    toast('✅ فایل CSV دانلود شد', 'success');
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
      console.warn('[view] download failed:', e);
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
            /* گرفتن اطلاعات پروفایل */
            var pr = await state.supabase
              .from('profiles')
              .select('id, code, full_name')
              .eq('id', payload.new.student_id)
              .maybeSingle();

            var full = Object.assign({}, payload.new, {
              profiles: pr.data || null
            });

            state.submissions.unshift(full);
            applySortAndFilter();
            if (state.view === 'list') renderList();

            toast('📬 پاسخ جدید از ' + (pr.data && pr.data.full_name || 'دانش‌آموز'), 'success', 4000);
          } catch (e) {
            console.warn('[view] realtime insert:', e);
          }
        })
        .subscribe();

      state.channel = channel;
    } catch (e) {
      console.warn('[view] realtime subscribe:', e);
    }
  }

  function unsubscribeRealtime() {
    if (state.channel) {
      try { state.supabase.removeChannel(state.channel); } catch (e) {}
      state.channel = null;
    }
  }

  /* ============================================================
   * BIND EVENTS
   * ============================================================ */
  function bindEvents() {
    if (el.searchInput) {
      var debounceTimer = null;
      el.searchInput.addEventListener('input', function (e) {
        clearTimeout(debounceTimer);
        var val = e.target.value;
        debounceTimer = setTimeout(function () {
          state.query = (val || '').trim();
          applySortAndFilter();
          renderList();
        }, 200);
      });
    }

    if (el.sortSelect) {
      el.sortSelect.addEventListener('change', function (e) {
        state.sort = e.target.value || 'date-desc';
        applySortAndFilter();
        renderList();
      });
    }

    if (el.exportBtn) {
      el.exportBtn.addEventListener('click', exportCSV);
    }

    if (el.backToList) {
      el.backToList.addEventListener('click', backToList);
    }

    if (el.prevBtn) {
      el.prevBtn.addEventListener('click', goPrev);
    }

    if (el.nextBtn) {
      el.nextBtn.addEventListener('click', goNext);
    }

    /* کیبورد */
    document.addEventListener('keydown', function (e) {
      if (state.view === 'detail') {
        if (e.key === 'Escape') {
          backToList();
        } else if (e.key === 'ArrowLeft') {
          /* در RTL: چپ = بعدی */
          if (!el.nextBtn || !el.nextBtn.disabled) goNext();
        } else if (e.key === 'ArrowRight') {
          if (!el.prevBtn || !el.prevBtn.disabled) goPrev();
        }
      }
    });

    /* قبل از خروج */
    window.addEventListener('beforeunload', function () {
      unsubscribeRealtime();
    });
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  async function init() {
    try { state.supabase = getSupabase(); }
    catch (e) { console.error('[view]', e); return; }

    cacheElements();
    initTheme();
    bindTheme();
    bindLogout();
    bindEvents();

    /* Auth */
    var auth = await requireTeacher();
    if (!auth) return;

    state.user = auth.user;
    state.profile = auth.profile;

    fillHeader();

    /* گرفتن id از URL */
    var params = getQuery();
    var examId = params.get('id');

    if (!examId) {
      toast('شناسه آزمون یافت نشد', 'error');
      setTimeout(function () {
        window.location.replace('teacher.html');
      }, 1200);
      return;
    }

    /* لود آزمون */
    var exam = await loadExam(examId);
    if (!exam) return;

    /* لود پاسخ‌ها */
    await loadSubmissions();

    /* مخفی کردن loading */
    if (el.loading) el.loading.style.display = 'none';
    if (el.studentsView) el.studentsView.style.display = 'block';

    /* Realtime */
    subscribeRealtime();

    /* اگه ?sub=xxx توی URL بود، مستقیم باز کن */
    var subId = params.get('sub');
    if (subId) {
      setTimeout(function () { showDetail(subId); }, 200);
    }

    state.ready = true;

    try {
      console.log(
        '%c👁 مشاهده‌ی پاسخ‌ها آماده\n%c' + (state.exam.title || 'آزمون'),
        'color: #6C5CE7; font-size: 14px; font-weight: bold;',
        'color: #00CEC9; font-size: 12px;'
      );
    } catch (e) {}
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */
  window.ViewPanel = {
    __loaded: true,
    init: init,
    logout: logout,
    toast: toast,
    state: state,
    reload: loadSubmissions,
    showDetail: showDetail,
    backToList: backToList,
    exportCSV: exportCSV
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
