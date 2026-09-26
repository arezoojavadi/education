/* ============================================================
 * js/teacher.js
 * ------------------------------------------------------------
 * منطق پنل معلم
 * طراحی: فاطمه جوادی
 *
 * نسخه‌ی جدید:
 *   • فیلد مدت زمان آزمون (duration_minutes)
 *   • presets برای انتخاب سریع
 *   • ارسال duration به دیتابیس
 *
 * وابستگی: @supabase/supabase-js از CDN
 * ============================================================ */

(function () {
  'use strict';

  if (window.TeacherPanel && window.TeacherPanel.__loaded) return;

  /* ============================================================
   * CONFIG
   * ============================================================ */
  var SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';

  var BUCKET = 'exam-files';
  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var ALLOWED_EXT = ['.html', '.htm'];

  var DEFAULT_DURATION = 15;
  var MIN_DURATION = 1;
  var MAX_DURATION = 240;

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
    isUploading: false,
    isRedirecting: false,
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

      statExams:    document.getElementById('statExams'),
      statSubs:     document.getElementById('statSubmissions'),
      statStudents: document.getElementById('statStudents'),

      newExamBtn:   document.getElementById('newExamBtn'),
      examsList:    document.getElementById('examsList'),
      examsCount:   document.getElementById('examsCount'),

      uploadModal:  document.getElementById('uploadModal'),
      modalTitle:   document.getElementById('examTitle'),
      modalDesc:    document.getElementById('examDesc'),
      modalDuration: document.getElementById('examDuration'),
      durationPresets: document.getElementById('durationPresets'),
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

  function formatDuration(minutes) {
    if (!minutes && minutes !== 0) return '—';
    var m = parseInt(minutes, 10) || 0;
    if (m < 60) return toFa(m) + ' دقیقه';
    var h = Math.floor(m / 60);
    var rem = m % 60;
    if (rem === 0) return toFa(h) + ' ساعت';
    return toFa(h) + ':' + (rem < 10 ? '۰' : '') + toFa(rem) + ' ساعت';
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
      node.classList.remove('showing');
      node.classList.add('removing');
      setTimeout(function () { node.remove(); }, 300);
    }, duration);
  }

  /* ============================================================
   * AUTH GUARD
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

      if (el.statExams)    el.statExams.textContent = toFa(state.stats.exams);
      if (el.statSubs)     el.statSubs.textContent = toFa(state.stats.submissions);
      if (el.statStudents) el.statStudents.textContent = toFa(state.stats.students);
    } catch (e) {
      console.warn('[teacher] stats failed:', e);
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
        .select('id, title, description, file_path, file_size, is_active, duration_minutes, created_at')
        .order('created_at', { ascending: false });
    } catch (e) {
      renderExamsError();
      return;
    }

    if (result.error) {
      console.warn('[teacher] exams:', result.error);
      renderExamsError();
      return;
    }

    state.exams = result.data || [];

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
            'روی «آزمون جدید» بزن و یه فایل HTML آپلود کن تا شروع کنیم.' +
          '</div>' +
        '</div>';
      return;
    }

    var html = '';
    state.exams.forEach(function (exam, i) {
      var delay = (i * 0.05).toFixed(2) + 's';
      var subsCount = state.counts[exam.id] || 0;
      var active = exam.is_active === true;
      var dur = exam.duration_minutes || 15;

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
            '<div class="stat-pill duration">' +
              '<svg viewBox="0 0 24 24">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<polyline points="12 6 12 12 16 14"/>' +
              '</svg>' +
              '<span>' + formatDuration(dur) + '</span>' +
            '</div>' +
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
            (exam.file_size
              ? '<div class="stat-pill">' +
                  '<svg viewBox="0 0 24 24">' +
                    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
                    '<polyline points="17 8 12 3 7 8"/>' +
                    '<line x1="12" y1="3" x2="12" y2="15"/>' +
                  '</svg>' +
                  '<span>' + formatBytes(exam.file_size) + '</span>' +
                '</div>'
              : '') +
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
        '<div class="empty-title">خطا در بارگذاری آزمون‌ها</div>' +
        '<div class="empty-text">اینترنت رو چک کن و صفحه رو رفرش کن.</div>' +
      '</div>';
  }

  /* ============================================================
   * TOGGLE EXAM
   * ============================================================ */
  async function toggleExam(examId, newState) {
    if (!examId) return;

    try {
      var result = await state.supabase
        .from('exams')
        .update({ is_active: newState })
        .eq('id', examId);

      if (result.error) {
        console.warn('[toggle]', result.error);
        toast('خطا در تغییر وضعیت', 'error');
        return;
      }

      toast(newState ? '✅ آزمون فعال شد' : '⏸ آزمون غیرفعال شد', 'success');
      await loadExams();
    } catch (e) {
      console.warn('[toggle fatal]', e);
      toast('خطای غیرمنتظره', 'error');
    }
  }

  /* ============================================================
   * DELETE EXAM
   * ============================================================ */
  async function deleteExam(examId, title) {
    if (!examId) return;

    if (!confirm('مطمئنی «' + title + '» رو حذف کنی؟\nتمام پاسخ‌های این آزمون هم پاک می‌شن.')) {
      return;
    }

    try {
      try {
        var examResult = await state.supabase
          .from('exams')
          .select('file_path')
          .eq('id', examId)
          .maybeSingle();

        if (examResult.data && examResult.data.file_path) {
          await state.supabase.storage
            .from(BUCKET)
            .remove([examResult.data.file_path]);
        }
      } catch (e) {
        console.warn('[delete] storage remove failed:', e);
      }

      var del = await state.supabase.from('exams').delete().eq('id', examId);

      if (del.error) {
        console.warn('[delete]', del.error);
        toast('خطا در حذف آزمون', 'error');
        return;
      }

      toast('✅ آزمون حذف شد', 'success');
      await loadExams();
      await loadStats();
    } catch (e) {
      console.warn('[delete fatal]', e);
      toast('خطای غیرمنتظره', 'error');
    }
  }

  /* ============================================================
   * DURATION PRESETS
   * ============================================================ */
  function bindDurationPresets() {
    if (!el.durationPresets) return;

    el.durationPresets.addEventListener('click', function (e) {
      var btn = e.target.closest('.duration-preset');
      if (!btn) return;

      var min = parseInt(btn.getAttribute('data-min'), 10);
      if (!min || min < MIN_DURATION) return;

      if (el.modalDuration) {
        el.modalDuration.value = min;
      }

      el.durationPresets.querySelectorAll('.duration-preset').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
    });
  }

  function updateDurationPresetActive() {
    if (!el.durationPresets || !el.modalDuration) return;

    var current = parseInt(el.modalDuration.value, 10);
    if (!current) current = DEFAULT_DURATION;

    el.durationPresets.querySelectorAll('.duration-preset').forEach(function (b) {
      var min = parseInt(b.getAttribute('data-min'), 10);
      b.classList.toggle('active', min === current);
    });
  }

  /* ============================================================
   * UPLOAD MODAL
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
    if (state.isUploading) {
      if (!confirm('آپلود در حال انجامه. مطمئنی می‌خوای ببندی؟')) return;
    }
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
    if (el.modalDuration) el.modalDuration.value = DEFAULT_DURATION;
    if (el.fileInput) el.fileInput.value = '';
    if (el.filePreview) el.filePreview.innerHTML = '';
    if (el.progressBar) el.progressBar.style.display = 'none';
    if (el.progressFill) el.progressFill.style.width = '0%';
    if (el.progressText) el.progressText.textContent = '';

    updateDurationPresetActive();

    if (el.uploadBtn) {
      el.uploadBtn.disabled = true;
      el.uploadBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></svg>' +
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
            '<svg viewBox="0 0 24 24">' +
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
              '<path d="M14 2v6h6"/>' +
            '</svg>' +
          '</div>' +
          '<div class="file-preview-info">' +
            '<div class="file-preview-name">' + escapeHtml(file.name) + '</div>' +
            '<div class="file-preview-size">' + formatBytes(file.size) + '</div>' +
          '</div>' +
          '<button type="button" class="file-preview-remove" aria-label="حذف">' +
            '<svg viewBox="0 0 24 24">' +
              '<line x1="18" y1="6" x2="6" y2="18"/>' +
              '<line x1="6" y1="6" x2="18" y2="18"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      var removeBtn = el.filePreview.querySelector('.file-preview-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          state.selectedFile = null;
          el.filePreview.innerHTML = '';
          if (el.fileInput) el.fileInput.value = '';
          updateUploadBtn();
        });
      }
    }

    updateUploadBtn();
  }

  function updateUploadBtn() {
    if (!el.uploadBtn) return;
    var title = el.modalTitle ? el.modalTitle.value.trim() : '';
    var duration = el.modalDuration ? parseInt(el.modalDuration.value, 10) : 0;
    var hasFile = !!state.selectedFile;
    var validDuration = duration >= MIN_DURATION && duration <= MAX_DURATION;

    el.uploadBtn.disabled = !(hasFile && title.length >= 2 && validDuration);
  }

  function bindUploadEvents() {
    if (el.newExamBtn) {
      el.newExamBtn.addEventListener('click', openUpload);
    }

    if (el.closeModal) {
      el.closeModal.addEventListener('click', closeUpload);
    }

    if (el.cancelBtn) {
      el.cancelBtn.addEventListener('click', closeUpload);
    }

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
        if (e.target.files && e.target.files.length) {
          handleFile(e.target.files[0]);
        }
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

    if (el.modalTitle) {
      el.modalTitle.addEventListener('input', updateUploadBtn);
    }

    if (el.modalDuration) {
      el.modalDuration.addEventListener('input', function () {
        var v = parseInt(el.modalDuration.value, 10);
        if (v > MAX_DURATION) el.modalDuration.value = MAX_DURATION;
        if (v < MIN_DURATION && el.modalDuration.value !== '') el.modalDuration.value = MIN_DURATION;
        updateDurationPresetActive();
        updateUploadBtn();
      });

      el.modalDuration.addEventListener('blur', function () {
        var v = parseInt(el.modalDuration.value, 10);
        if (!v || v < MIN_DURATION) el.modalDuration.value = DEFAULT_DURATION;
        if (v > MAX_DURATION) el.modalDuration.value = MAX_DURATION;
        updateDurationPresetActive();
        updateUploadBtn();
      });
    }

    if (el.uploadBtn) {
      el.uploadBtn.addEventListener('click', doUpload);
    }

    bindDurationPresets();
  }

  /* ============================================================
   * DO UPLOAD
   * ============================================================ */
  async function doUpload() {
    if (state.isUploading) return;
    if (!state.selectedFile) {
      toast('فایل رو انتخاب کن', 'error');
      return;
    }

    var title = el.modalTitle ? el.modalTitle.value.trim() : '';
    var description = el.modalDesc ? el.modalDesc.value.trim() : '';

    if (title.length < 2) {
      toast('عنوان آزمون رو وارد کن', 'error');
      return;
    }

    /* مدت زمان */
    var durationMinutes = parseInt(el.modalDuration ? el.modalDuration.value : '', 10);
    if (!durationMinutes || durationMinutes < MIN_DURATION) {
      durationMinutes = DEFAULT_DURATION;
    }
    if (durationMinutes > MAX_DURATION) {
      durationMinutes = MAX_DURATION;
    }

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
        console.warn('[upload]', uploadResult.error);
        throw new Error(uploadResult.error.message || 'خطا در آپلود فایل');
      }

      if (el.progressFill) el.progressFill.style.width = '70%';
      if (el.progressText) el.progressText.textContent = 'در حال ذخیره در دیتابیس...';

      var dbResult = await sb
        .from('exams')
        .insert({
          title: title,
          description: description || null,
          file_path: path,
          file_size: state.selectedFile.size,
          duration_minutes: durationMinutes,
          created_by: state.user.id,
          is_active: true
        })
        .select()
        .single();

      if (dbResult.error) {
        try { await sb.storage.from(BUCKET).remove([path]); } catch (e) {}
        console.warn('[insert]', dbResult.error);

        if ((dbResult.error.message || '').indexOf('محدودیت') !== -1) {
          throw new Error('محدودیت آپلود: حداکثر ۱۰ فایل در ساعت');
        }
        throw new Error(dbResult.error.message || 'خطا در ذخیره');
      }

      if (el.progressFill) el.progressFill.style.width = '100%';
      if (el.progressText) el.progressText.textContent = '✅ آپلود موفق!';

      toast('✅ آزمون با موفقیت ساخته شد', 'success');

      await sleep(700);
      closeUpload();
      await loadExams();
      await loadStats();

    } catch (err) {
      console.warn('[upload fatal]', err);
      state.isUploading = false;

      if (el.uploadBtn) {
        el.uploadBtn.disabled = false;
        el.uploadBtn.innerHTML =
          '<svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></svg>' +
          '<span>آپلود و ساخت آزمون</span>';
      }
      if (el.progressBar) el.progressBar.style.display = 'none';

      var msg = err.message || 'خطای غیرمنتظره';
      toast('❌ ' + msg, 'error', 5000);
    }
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  async function init() {
    try { state.supabase = getSupabase(); }
    catch (e) {
      console.error('[teacher]', e);
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

    fillHeader();

    await Promise.all([
      loadStats(),
      loadExams()
    ]);

    state.ready = true;

    try {
      console.log(
        '%c👨‍🏫 پنل معلم آماده\n%c' + (state.profile.full_name || 'کاربر'),
        'color: #6C5CE7; font-size: 14px; font-weight: bold;',
        'color: #00CEC9; font-size: 12px;'
      );
    } catch (e) {}
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */
  window.TeacherPanel = {
    __loaded: true,
    init: init,
    logout: logout,
    toast: toast,
    state: state,
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
