/* ============================================================
 * js/teacher.js
 * ------------------------------------------------------------
 * پنل معلم — نسخه‌ی مقاوم با عیب‌یابی کامل
 * طراحی: فاطمه جوادی
 * ============================================================ */

(function () {
  'use strict';

  if (window.TeacherPanel && window.TeacherPanel.__loaded) return;

  var SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';
  var BUCKET = 'exam-files';
  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var ALLOWED_EXT = ['.html', '.htm'];

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
    exams: [],
    counts: {},
    stats: { exams: 0, submissions: 0, students: 0 },
    selectedFile: null,
    isUploading: false
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

      statExams:    document.getElementById('statExams'),
      statSubs:     document.getElementById('statSubmissions'),
      statStudents: document.getElementById('statStudents'),

      newExamBtn:   document.getElementById('newExamBtn'),
      examsList:    document.getElementById('examsList'),
      examsCount:   document.getElementById('examsCount'),

      uploadModal:  document.getElementById('uploadModal'),
      modalTitle:   document.getElementById('examTitle'),
      modalDesc:    document.getElementById('examDesc'),
      uploadZone:   document.getElementById('uploadZone'),
      fileInput:    document.getElementById('fileInput'),
      filePreview:  document.getElementById('filePreview'),
      progressBar:  document.getElementById('progressBar'),
      progressFill: document.getElementById('progressFill'),
      progressText: document.getElementById('progressText'),
      uploadBtn:    document.getElementById('uploadBtn'),
      cancelBtn:    document.getElementById('cancelBtn'),
      closeModal:   document.getElementById('closeModal'),

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

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '۰ B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    var val = (bytes / Math.pow(k, i)).toFixed(1);
    return toFa(val) + ' ' + sizes[i];
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function fileExt(name) {
    var lower = String(name || '').toLowerCase();
    var i = lower.lastIndexOf('.');
    return i === -1 ? '' : lower.slice(i);
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
   * 🆕 نمایش خطا به‌جای پرت کردن
   * ============================================================ */
  function showBlocker(title, detail, actions) {
    /* پنهان کردن همه‌چیز */
    document.body.innerHTML = '';

    var wrapper = document.createElement('div');
    wrapper.style.cssText =
      'min-height:100vh; display:flex; align-items:center; justify-content:center;' +
      'padding:20px; font-family:Vazirmatn,system-ui,sans-serif;' +
      'background:linear-gradient(135deg,#EEF0FF 0%,#F5F0FF 50%,#FFF0F8 100%);' +
      'direction:rtl;';

    var card = document.createElement('div');
    card.style.cssText =
      'background:#fff; border-radius:24px; padding:32px 28px;' +
      'max-width:440px; width:100%; box-shadow:0 12px 40px rgba(108,92,231,0.15);' +
      'text-align:center;';

    var icon = document.createElement('div');
    icon.style.cssText =
      'width:72px; height:72px; margin:0 auto 16px; border-radius:22px;' +
      'background:linear-gradient(135deg,#FF6B6B,#FF8E8E);' +
      'display:flex; align-items:center; justify-content:center;' +
      'box-shadow:0 10px 24px rgba(255,107,107,0.3);';
    icon.innerHTML =
      '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<line x1="12" y1="8" x2="12" y2="12"/>' +
        '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
      '</svg>';

    var h = document.createElement('h2');
    h.style.cssText = 'font-size:19px; font-weight:900; color:#1E1B3A; margin-bottom:8px;';
    h.textContent = title;

    var p = document.createElement('p');
    p.style.cssText = 'font-size:13.5px; color:#6B6789; line-height:1.7; margin-bottom:20px; font-weight:600; white-space:pre-wrap; word-break:break-word;';
    p.textContent = detail;

    card.appendChild(icon);
    card.appendChild(h);
    card.appendChild(p);

    (actions || []).forEach(function (action) {
      var btn = document.createElement('a');
      btn.href = action.href || '#';
      btn.textContent = action.label;
      btn.style.cssText =
        'display:inline-block; margin:4px; padding:12px 22px; border-radius:14px;' +
        'font-size:14px; font-weight:800; text-decoration:none; cursor:pointer;' +
        'background:linear-gradient(135deg,#6C5CE7,#8E7CFF); color:#fff;' +
        'box-shadow:0 6px 18px rgba(108,92,231,0.28);';
      if (action.onclick) {
        btn.onclick = function (e) { e.preventDefault(); action.onclick(); };
      }
      card.appendChild(btn);
    });

    wrapper.appendChild(card);
    document.body.appendChild(wrapper);
  }

  /* ============================================================
   * AUTH GUARD — 🆕 با لاگ کامل
   * ============================================================ */
  async function requireTeacher() {
    var sb = state.supabase;

    console.log('🔐 [teacher] شروع بررسی احراز هویت...');

    /* ─── ۱) نشست ─── */
    var sessionResult;
    try {
      sessionResult = await sb.auth.getSession();
    } catch (e) {
      console.error('❌ [teacher] خطای getSession:', e);
      showBlocker(
        'خطا در بررسی نشست',
        'اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید.\n\n' + (e.message || ''),
        [
          { label: 'تلاش مجدد', onclick: function () { window.location.reload(); } },
          { label: 'خروج', href: 'index.html' }
        ]
      );
      return null;
    }

    var session = sessionResult && sessionResult.data && sessionResult.data.session;
    console.log('📋 [teacher] session:', session ? 'وجود دارد' : 'خالی');

    if (!session) {
      console.log('➡️ [teacher] نشست نیست → index.html');
      window.location.replace('index.html');
      return null;
    }

    /* ─── ۲) کاربر ─── */
    var userResult;
    try {
      userResult = await sb.auth.getUser();
    } catch (e) {
      console.error('❌ [teacher] خطای getUser:', e);
      showBlocker(
        'خطا در دریافت کاربر',
        e.message || 'دوباره تلاش کنید',
        [{ label: 'تلاش مجدد', onclick: function () { window.location.reload(); } }]
      );
      return null;
    }

    var user = userResult && userResult.data && userResult.data.user;
    console.log('👤 [teacher] user:', user ? user.id : 'خالی');

    if (!user) {
      window.location.replace('index.html');
      return null;
    }

    /* ─── ۳) پروفایل — با RPC ─── */
    var profile = null;

    try {
      var rpc = await sb.rpc('get_my_profile');
      console.log('🔍 [teacher] RPC result:', rpc);

      if (rpc.error) {
        console.warn('⚠️ [teacher] RPC error:', rpc.error);
      } else if (rpc.data) {
        profile = rpc.data;
      }
    } catch (e) {
      console.warn('⚠️ [teacher] RPC exception:', e);
    }

    /* ─── ۴) پروفایل — با SELECT (backup) ─── */
    if (!profile) {
      console.log('🔍 [teacher] تلاش با SELECT مستقیم...');

      try {
        var sel = await sb
          .from('profiles')
          .select('id, code, full_name, role, name_confirmed')
          .eq('id', user.id)
          .maybeSingle();

        console.log('🔍 [teacher] SELECT result:', sel);

        if (sel.error) {
          console.warn('⚠️ [teacher] SELECT error:', sel.error);
        } else if (sel.data) {
          profile = sel.data;
        }
      } catch (e) {
        console.warn('⚠️ [teacher] SELECT exception:', e);
      }
    }

    console.log('📄 [teacher] profile:', profile);

    /* ─── ۵) پروفایل نیست؟ ─── */
    if (!profile) {
      console.error('❌ [teacher] پروفایل پیدا نشد');
      showBlocker(
        'پروفایل شما پیدا نشد',
        'ممکن است حساب شما کامل ساخته نشده باشد.\n' +
        'کد شما: ' + (user.email || '').replace('@exam.local', '') + '\n\n' +
        'لطفاً با مدیر سامانه تماس بگیرید.',
        [
          { label: 'انتخاب نام دوباره', href: 'choose-name.html' },
          { label: 'خروج', href: 'index.html' }
        ]
      );
      return null;
    }

    /* ─── ۶) نام تأیید نشده؟ ─── */
    if (profile.name_confirmed !== true) {
      console.log('⚠️ [teacher] نام تأیید نشده → choose-name');

      /* یه بار دیگه چک کن */
      await sleep(600);
      try {
        var retry = await sb.rpc('get_my_profile');
        if (!retry.error && retry.data && retry.data.name_confirmed === true) {
          profile = retry.data;
          console.log('✅ [teacher] بعد از retry، نام تأیید شده');
        }
      } catch (e) {}

      if (profile.name_confirmed !== true) {
        window.location.replace('choose-name.html');
        return null;
      }
    }

    /* ─── ۷) نقش ─── */
    console.log('🎭 [teacher] نقش:', profile.role);

    if (profile.role === 'student') {
      console.log('➡️ [teacher] نقش دانش‌آموز است → student.html');
      window.location.replace('student.html');
      return null;
    }

    if (profile.role !== 'teacher') {
      console.error('❌ [teacher] نقش نامعتبر:', profile.role);
      showBlocker(
        'نقش شما معلم نیست',
        'نقش فعلی: ' + (profile.role || 'نامشخص') + '\n' +
        'کد: ' + (profile.code || '—') + '\n\n' +
        'اگه فکر می‌کنی اشتباهه، با مدیر تماس بگیر.',
        [{ label: 'خروج', href: 'index.html' }]
      );
      return null;
    }

    console.log('✅ [teacher] احراز هویت موفق');
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
   * STATS
   * ============================================================ */
  async function loadStats() {
    var sb = state.supabase;

    try {
      var results = await Promise.all([
        sb.from('exams').select('id', { count: 'exact', head: true }),
        sb.from('submissions').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student')
      ]);

      state.stats.exams = results[0].count || 0;
      state.stats.submissions = results[1].count || 0;
      state.stats.students = results[2].count || 0;

      if (el.statExams) el.statExams.textContent = toFa(state.stats.exams);
      if (el.statSubs) el.statSubs.textContent = toFa(state.stats.submissions);
      if (el.statStudents) el.statStudents.textContent = toFa(state.stats.students);

      console.log('📊 [teacher] stats:', state.stats);
    } catch (e) {
      console.warn('⚠️ [teacher] stats failed:', e);
    }
  }

  /* ============================================================
   * LOAD EXAMS
   * ============================================================ */
  async function loadExams() {
    var sb = state.supabase;

    var result;
    try {
      result = await sb
        .from('exams')
        .select('id, title, description, file_path, file_size, is_active, created_at')
        .order('created_at', { ascending: false });
    } catch (e) {
      console.error('❌ [teacher] loadExams:', e);
      renderExamsError();
      return;
    }

    if (result.error) {
      console.error('❌ [teacher] exams error:', result.error);
      renderExamsError();
      return;
    }

    state.exams = result.data || [];
    console.log('📚 [teacher] exams:', state.exams.length);

    /* شمارش پاسخ‌ها */
    try {
      var subsResult = await sb.from('submissions').select('exam_id');
      state.counts = {};
      (subsResult.data || []).forEach(function (s) {
        state.counts[s.exam_id] = (state.counts[s.exam_id] || 0) + 1;
      });
    } catch (e) {
      state.counts = {};
    }

    renderExams();
  }

  /* ============================================================
   * RENDER EXAMS
   * ============================================================ */
  function renderExams() {
    if (!el.examsList) return;

    if (el.examsCount) el.examsCount.textContent = toFa(state.exams.length);

    if (!state.exams.length) {
      el.examsList.innerHTML =
        '<div class="empty-state" style="grid-column: 1/-1;">' +
          '<div class="empty-icon">' +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
              '<path d="M14 2v6h6"/>' +
            '</svg>' +
          '</div>' +
          '<div class="empty-title">هنوز آزمونی نساختی</div>' +
          '<div class="empty-text">' +
            'روی «آزمون جدید» بزن و یه فایل HTML آپلود کن.' +
          '</div>' +
          '<button class="btn-primary" onclick="TeacherPanel.openUpload()" style="margin-top:16px;">' +
            '<svg viewBox="0 0 24 24" style="width:18px;height:18px;">' +
              '<line x1="12" y1="5" x2="12" y2="19"/>' +
              '<line x1="5" y1="12" x2="19" y2="12"/>' +
            '</svg>' +
            '<span>ساخت اولین آزمون</span>' +
          '</button>' +
        '</div>';
      return;
    }

    var html = '';
    state.exams.forEach(function (exam, i) {
      var delay = (i * 0.05).toFixed(2) + 's';
      var subsCount = state.counts[exam.id] || 0;
      var active = exam.is_active === true;

      html +=
        '<div class="exam-card" style="animation-delay:' + delay + ';">' +
          '<div class="exam-card-head">' +
            '<div class="exam-card-icon ' + (active ? '' : 'inactive') + '">' +
              '<svg viewBox="0 0 24 24">' +
                '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
                '<path d="M14 2v6h6"/>' +
                '<path d="M9 15l2 2 4-4"/>' +
              '</svg>' +
            '</div>' +
            '<div class="exam-card-title-wrap">' +
              '<div class="exam-card-title">' + escapeHtml(exam.title) + '</div>' +
              (exam.description
                ? '<div class="exam-card-desc">' + escapeHtml(exam.description) + '</div>'
                : '') +
            '</div>' +
            '<span class="badge-status ' + (active ? 'active' : 'inactive') + '">' +
              '<span class="badge-dot"></span>' +
              (active ? 'فعال' : 'غیرفعال') +
            '</span>' +
          '</div>' +

          '<div class="exam-card-stats">' +
            '<div class="stat-pill">' +
              '<svg viewBox="0 0 24 24">' +
                '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
                '<circle cx="9" cy="7" r="4"/>' +
                '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' +
                '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>' +
              '</svg>' +
              '<span>' + toFa(subsCount) + ' پاسخ</span>' +
            '</div>' +
            '<div class="stat-pill">' +
              '<svg viewBox="0 0 24 24">' +
                '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
                '<line x1="16" y1="2" x2="16" y2="6"/>' +
                '<line x1="8" y1="2" x2="8" y2="6"/>' +
                '<line x1="3" y1="10" x2="21" y2="10"/>' +
              '</svg>' +
              '<span>' + formatDate(exam.created_at) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="exam-card-footer">' +
            '<a href="view.html?id=' + encodeURIComponent(exam.id) + '" class="btn-ghost">' +
              '<svg viewBox="0 0 24 24">' +
                '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
                '<circle cx="12" cy="12" r="3"/>' +
              '</svg>' +
              '<span>مشاهده پاسخ‌ها</span>' +
            '</a>' +
            '<button class="btn-ghost" onclick="TeacherPanel.toggleExam(\'' + exam.id + '\', ' + (!active) + ')">' +
              (active
                ? '<svg viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>'
                : '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
              ) +
              '<span>' + (active ? 'غیرفعال' : 'فعال') + '</span>' +
            '</button>' +
            '<button class="btn-ghost danger" onclick="TeacherPanel.deleteExam(\'' + exam.id + '\', \'' + escapeHtml(exam.title).replace(/'/g, "\\'") + '\')">' +
              '<svg viewBox="0 0 24 24">' +
                '<polyline points="3 6 5 6 21 6"/>' +
                '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
              '</svg>' +
              '<span>حذف</span>' +
            '</button>' +
          '</div>' +
        '</div>';
    });

    el.examsList.innerHTML = html;
  }

  function renderExamsError() {
    if (!el.examsList) return;
    el.examsList.innerHTML =
      '<div class="empty-state" style="grid-column: 1/-1;">' +
        '<div class="empty-icon">' +
          '<svg viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="8" x2="12" y2="12"/>' +
            '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
          '</svg>' +
        '</div>' +
        '<div class="empty-title">خطا در بارگذاری</div>' +
        '<div class="empty-text">اتصال اینترنت را بررسی کن و رفرش کن.</div>' +
      '</div>';
  }

  /* ============================================================
   * TOGGLE / DELETE
   * ============================================================ */
  async function toggleExam(examId, newState) {
    if (!examId) return;

    try {
      var result = await state.supabase
        .from('exams')
        .update({ is_active: newState })
        .eq('id', examId);

      if (result.error) {
        toast('خطا: ' + (result.error.message || ''), 'error');
        return;
      }

      toast(newState ? '✅ آزمون فعال شد' : '⏸ آزمون غیرفعال شد', 'success');
      await loadExams();
    } catch (e) {
      toast('خطای غیرمنتظره', 'error');
    }
  }

  async function deleteExam(examId, title) {
    if (!examId) return;
    if (!confirm('مطمئنی «' + title + '» حذف بشه؟\nهمه‌ی پاسخ‌ها هم پاک می‌شن.')) return;

    try {
      try {
        var examResult = await state.supabase
          .from('exams').select('file_path').eq('id', examId).maybeSingle();

        if (examResult.data && examResult.data.file_path) {
          await state.supabase.storage.from(BUCKET).remove([examResult.data.file_path]);
        }
      } catch (e) {}

      var del = await state.supabase.from('exams').delete().eq('id', examId);

      if (del.error) {
        toast('خطا: ' + (del.error.message || ''), 'error');
        return;
      }

      toast('✅ حذف شد', 'success');
      await loadExams();
      await loadStats();
    } catch (e) {
      toast('خطای غیرمنتظره', 'error');
    }
  }

  /* ============================================================
   * UPLOAD
   * ============================================================ */
  function openUpload() {
    if (!el.uploadModal) return;
    resetUploadModal();
    el.uploadModal.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      if (el.modalTitle) el.modalTitle.focus();
    }, 200);
  }

  function closeUpload() {
    if (state.isUploading && !confirm('آپلود در جریانه. ببندم؟')) return;
    if (!el.uploadModal) return;
    el.uploadModal.classList.remove('show');
    document.body.style.overflow = '';
    resetUploadModal();
  }

  function resetUploadModal() {
    state.selectedFile = null;
    state.isUploading = false;

    if (el.modalTitle) el.modalTitle.value = '';
    if (el.modalDesc) el.modalDesc.value = '';
    if (el.fileInput) el.fileInput.value = '';
    if (el.filePreview) el.filePreview.innerHTML = '';
    if (el.progressBar) el.progressBar.style.display = 'none';
    if (el.progressFill) el.progressFill.style.width = '0%';
    if (el.progressText) el.progressText.textContent = '';

    if (el.uploadBtn) {
      el.uploadBtn.disabled = true;
      el.uploadBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>' +
        '<span>آپلود و ساخت آزمون</span>';
    }
  }

  function handleFile(file) {
    if (!file) return;

    var ext = fileExt(file.name);
    if (ALLOWED_EXT.indexOf(ext) === -1) {
      toast('فقط فایل HTML مجازه', 'error');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast('حجم فایل نباید بیشتر از ۱۰ مگابایت باشه', 'error');
      return;
    }

    state.selectedFile = file;

    if (el.filePreview) {
      el.filePreview.innerHTML =
        '<div class="file-preview-item">' +
          '<div class="file-preview-icon">' +
            '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
          '</div>' +
          '<div class="file-preview-info">' +
            '<div class="file-preview-name">' + escapeHtml(file.name) + '</div>' +
            '<div class="file-preview-size">' + formatBytes(file.size) + '</div>' +
          '</div>' +
          '<button type="button" class="file-preview-remove">' +
            '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>';

      var rm = el.filePreview.querySelector('.file-preview-remove');
      if (rm) rm.addEventListener('click', function () {
        state.selectedFile = null;
        el.filePreview.innerHTML = '';
        if (el.fileInput) el.fileInput.value = '';
        updateUploadBtn();
      });
    }

    updateUploadBtn();
  }

  function updateUploadBtn() {
    if (!el.uploadBtn) return;
    var title = el.modalTitle ? el.modalTitle.value.trim() : '';
    el.uploadBtn.disabled = !(state.selectedFile && title.length >= 2);
  }

  function bindUploadEvents() {
    if (el.newExamBtn) el.newExamBtn.addEventListener('click', openUpload);
    if (el.closeModal) el.closeModal.addEventListener('click', closeUpload);
    if (el.cancelBtn) el.cancelBtn.addEventListener('click', closeUpload);

    if (el.uploadModal) {
      el.uploadModal.addEventListener('click', function (e) {
        if (e.target === el.uploadModal) closeUpload();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.uploadModal && el.uploadModal.classList.contains('show')) {
        closeUpload();
      }
    });

    if (el.uploadZone && el.fileInput) {
      el.uploadZone.addEventListener('click', function () { el.fileInput.click(); });

      el.fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
      });

      el.uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        el.uploadZone.classList.add('dragover');
      });

      el.uploadZone.addEventListener('dragleave', function () {
        el.uploadZone.classList.remove('dragover');
      });

      el.uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        el.uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (el.modalTitle) el.modalTitle.addEventListener('input', updateUploadBtn);
    if (el.uploadBtn) el.uploadBtn.addEventListener('click', doUpload);
  }

  async function doUpload() {
    if (state.isUploading) return;
    if (!state.selectedFile) { toast('فایل انتخاب کن', 'error'); return; }

    var title = el.modalTitle ? el.modalTitle.value.trim() : '';
    var description = el.modalDesc ? el.modalDesc.value.trim() : '';

    if (title.length < 2) { toast('عنوان رو وارد کن', 'error'); return; }

    state.isUploading = true;
    if (el.uploadBtn) {
      el.uploadBtn.disabled = true;
      el.uploadBtn.innerHTML = '<span>در حال آپلود</span><span class="spinner-sm"></span>';
    }
    if (el.progressBar) el.progressBar.style.display = 'block';
    if (el.progressFill) el.progressFill.style.width = '0%';
    if (el.progressText) el.progressText.textContent = 'در حال آماده‌سازی...';

    var sb = state.supabase;

    try {
      var ext = fileExt(state.selectedFile.name) || '.html';
      var path = state.user.id + '/' + Date.now() + ext;

      if (el.progressFill) el.progressFill.style.width = '20%';
      if (el.progressText) el.progressText.textContent = 'در حال آپلود فایل...';

      var uploadResult = await sb.storage
        .from(BUCKET)
        .upload(path, state.selectedFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'text/html'
        });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message || 'خطا در آپلود');
      }

      if (el.progressFill) el.progressFill.style.width = '70%';
      if (el.progressText) el.progressText.textContent = 'در حال ذخیره...';

      var dbResult = await sb
        .from('exams')
        .insert({
          title: title,
          description: description || null,
          file_path: path,
          file_size: state.selectedFile.size,
          created_by: state.user.id,
          is_active: true
        })
        .select()
        .single();

      if (dbResult.error) {
        try { await sb.storage.from(BUCKET).remove([path]); } catch (e) {}
        throw new Error(dbResult.error.message || 'خطا در ذخیره');
      }

      if (el.progressFill) el.progressFill.style.width = '100%';
      if (el.progressText) el.progressText.textContent = '✅ موفق!';

      toast('✅ آزمون ساخته شد', 'success');

      await sleep(600);
      closeUpload();
      await loadExams();
      await loadStats();

    } catch (err) {
      console.warn('[upload]', err);
      state.isUploading = false;

      if (el.uploadBtn) {
        el.uploadBtn.disabled = false;
        el.uploadBtn.innerHTML =
          '<svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>' +
          '<span>آپلود و ساخت آزمون</span>';
      }
      if (el.progressBar) el.progressBar.style.display = 'none';

      toast('❌ ' + (err.message || 'خطا'), 'error', 5000);
    }
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  async function init() {
    console.log('%c🚀 [teacher] شروع پنل معلم', 'color: #6C5CE7; font-size: 16px; font-weight: bold;');

    try { state.supabase = getSupabase(); }
    catch (e) {
      console.error('❌ [teacher] Supabase init failed:', e);
      showBlocker('Supabase لود نشد', 'اینترنت خود را بررسی کنید.', [{ label: 'تلاش مجدد', onclick: function () { location.reload(); } }]);
      return;
    }

    cacheElements();
    initTheme();
    bindTheme();
    bindLogout();
    bindUploadEvents();

    var auth = await requireTeacher();
    if (!auth) return;

    state.user = auth.user;
    state.profile = auth.profile;

    console.log('✅ [teacher] Auth موفق، بارگذاری داده‌ها...');

    fillHeader();

    await Promise.all([loadStats(), loadExams()]);

    try {
      console.log('%c✅ [teacher] پنل آماده', 'color: #00B894; font-size: 14px; font-weight: bold;');
    } catch (e) {}
  }

  /* ============================================================
   * API
   * ============================================================ */
  window.TeacherPanel = {
    __loaded: true,
    state: state,
    toast: toast,
    logout: logout,
    reload: async function () { await loadExams(); await loadStats(); },
    openUpload: openUpload,
    closeUpload: closeUpload,
    toggleExam: toggleExam,
    deleteExam: deleteExam
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
