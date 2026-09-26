/* ============================================================
 * js/take.js
 * ------------------------------------------------------------
 * منطق انجام آزمون توسط دانش‌آموز
 * طراحی: فاطمه جوادی
 *
 * قابلیت‌ها:
 *   • چک لاگین + نقش دانش‌آموز
 *   • لود فایل HTML آزمون از Storage در iframe
 *   • تایمر معکوس بر اساس مدت آزمون
 *   • هشدار در یک دقیقه‌ی آخر
 *   • ذخیره‌ی خودکار پاسخ‌ها در localStorage
 *   • capture پاسخ‌های input / textarea / select / radio / checkbox
 *   • جلوگیری از ثبت دوباره
 *   • تأیید قبل از ارسال
 *   • هشدار قبل از بستن صفحه
 *   • ریسپانسیو + Toast + Theme
 *
 * وابستگی: @supabase/supabase-js از CDN
 * ============================================================ */

(function () {
  'use strict';

  if (window.TakePanel && window.TakePanel.__loaded) return;

  /* ============================================================
   * CONFIG
   * ============================================================ */
  var SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';

  var BUCKET = 'exam-files';
  var DRAFT_PREFIX = 'exam_draft_';
  var AUTOSAVE_INTERVAL = 5000;    // هر ۵ ثانیه
  var WARNING_THRESHOLD = 60;      // هشدار در ثانیه‌ی آخر

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
    examId: null,
    fileHtml: null,
    startedAt: null,
    durationSeconds: 0,
    endTime: null,
    remaining: 0,
    timerInterval: null,
    autosaveInterval: null,
    isSubmitting: false,
    isSubmitted: false,
    isRedirecting: false,
    hasUnsavedChanges: false,
    draftRestored: false
  };

  /* ============================================================
   * DOM
   * ============================================================ */
  var el = {};

  function cacheElements() {
    el = {
      themeBtn:      document.getElementById('themeBtn'),
      examTitle:     document.getElementById('examTitle'),
      timerWrap:     document.getElementById('timerWrap'),
      timerText:     document.getElementById('timerText'),
      timerProgress: document.getElementById('timerProgress'),

      loading:       document.getElementById('loadingState'),
      errorState:    document.getElementById('errorState'),
      errorText:     document.getElementById('errorText'),
      examContent:   document.getElementById('examContent'),
      iframe:        document.getElementById('examFrame'),
      iframeWrap:    document.getElementById('iframeWrap'),

      submitBtn:     document.getElementById('submitBtn'),
      submitOverlay: document.getElementById('submitOverlay'),
      submitText:    document.getElementById('submitText'),

      warningBanner: document.getElementById('warningBanner'),
      draftBanner:   document.getElementById('draftBanner'),
      draftRestore:  document.getElementById('draftRestore'),
      draftDiscard:  document.getElementById('draftDiscard'),

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

  function formatTimer(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;

    if (h > 0) {
      return pad(h) + ':' + pad(m) + ':' + pad(sec);
    }
    return pad(m) + ':' + pad(sec);
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatTimerFa(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;

    if (h > 0) {
      return toFa(h) + ':' + pad(m) + ':' + pad(sec);
    }
    return toFa(m) + ':' + pad(sec);
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

  function draftKey(examId) {
    return DRAFT_PREFIX + examId;
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
   * AUTH GUARD — فقط دانش‌آموز
   * ============================================================ */
  async function requireStudent() {
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

    /* معلم → پنل معلم */
    if (profile.role === 'teacher') {
      window.location.replace('teacher.html');
      return null;
    }

    return { user: user, profile: profile };
  }

  /* ============================================================
   * LOAD EXAM
   * ============================================================ */
  async function loadExam() {
    try {
      var r = await state.supabase
        .from('exams')
        .select('id, title, description, file_path, duration_minutes, is_active, created_at')
        .eq('id', state.examId)
        .maybeSingle();

      if (r.error || !r.data) {
        showError('آزمون پیدا نشد یا حذف شده است');
        return null;
      }

      state.exam = r.data;

      /* چک فعال بودن */
      if (state.exam.is_active !== true) {
        showError('این آزمون غیرفعال شده است');
        return null;
      }

      return state.exam;
    } catch (e) {
      console.warn('[take] loadExam failed:', e);
      showError('خطا در بارگذاری آزمون');
      return null;
    }
  }

  /* ============================================================
   * CHECK NOT SUBMITTED BEFORE
   * ============================================================ */
  async function checkNotSubmitted() {
    try {
      var r = await state.supabase
        .from('submissions')
        .select('id')
        .eq('exam_id', state.examId)
        .eq('student_id', state.user.id)
        .maybeSingle();

      if (r.data) {
        showError('شما قبلاً در این آزمون شرکت کرده‌اید');
        setTimeout(function () {
          window.location.replace('student.html');
        }, 2000);
        return false;
      }

      return true;
    } catch (e) {
      console.warn('[take] checkNotSubmitted:', e);
      return true;
    }
  }

  /* ============================================================
   * LOAD FILE
   * ============================================================ */
  async function loadFile() {
    if (!state.exam || !state.exam.file_path) {
      showError('فایل آزمون یافت نشد');
      return false;
    }

    try {
      var r = await state.supabase.storage
        .from(BUCKET)
        .download(state.exam.file_path);

      if (r.error || !r.data) {
        console.warn('[take] download failed:', r.error);
        showError('خطا در بارگذاری فایل آزمون');
        return false;
      }

      var text = await r.data.text();
      state.fileHtml = text;
      return true;

    } catch (e) {
      console.warn('[take] loadFile:', e);
      showError('خطا در بارگذاری فایل');
      return false;
    }
  }

  /* ============================================================
   * RENDER IFRAME
   * ============================================================ */
  function renderIframe() {
    if (!el.iframe || !state.fileHtml) return;

    /* لود از srcdoc */
    el.iframe.srcdoc = state.fileHtml;

    el.iframe.addEventListener('load', function onLoad() {
      el.iframe.removeEventListener('load', onLoad);

      /* مخفی کردن loading، نمایش محتوا */
      if (el.loading) el.loading.style.display = 'none';
      if (el.examContent) el.examContent.style.display = 'block';

      /* بازیابی پیش‌نویس اگه هست */
      restoreDraft();
    });
  }

  /* ============================================================
   * TIMER
   * ============================================================ */
  function startTimer() {
    var duration = state.exam.duration_minutes || 15;

    state.startedAt = Date.now();
    state.durationSeconds = duration * 60;
    state.endTime = state.startedAt + state.durationSeconds * 1000;
    state.remaining = state.durationSeconds;

    updateTimerDisplay();

    state.timerInterval = setInterval(function () {
      var remaining = Math.max(0, Math.floor((state.endTime - Date.now()) / 1000));
      state.remaining = remaining;
      updateTimerDisplay();

      /* هشدار در یک دقیقه آخر */
      if (remaining <= WARNING_THRESHOLD && remaining > 0) {
        if (el.timerWrap && !el.timerWrap.classList.contains('warning')) {
          el.timerWrap.classList.add('warning');
          toast('⏰ یک دقیقه مونده!', 'error', 3000);
        }
      }

      /* تمام شدن زمان → ثبت خودکار */
      if (remaining <= 0) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        toast('⏱ زمان تمام شد! در حال ثبت خودکار...', 'error', 4000);
        doSubmit(true);
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!el.timerText) return;

    el.timerText.textContent = formatTimerFa(state.remaining);

    if (el.timerProgress && state.durationSeconds > 0) {
      var pct = (state.remaining / state.durationSeconds) * 100;
      el.timerProgress.style.width = pct + '%';

      /* رنگ بندی */
      el.timerProgress.classList.remove('mid', 'low');
      if (pct <= 15) el.timerProgress.classList.add('low');
      else if (pct <= 40) el.timerProgress.classList.add('mid');
    }
  }

  /* ============================================================
   * CAPTURE ANSWERS
   * ============================================================ */
  function captureAnswers() {
    if (!el.iframe) return { inputs: [] };

    var doc = null;
    try {
      doc = el.iframe.contentDocument || el.iframe.contentWindow.document;
    } catch (e) {
      console.warn('[take] iframe access failed:', e);
      return { inputs: [] };
    }

    if (!doc) return { inputs: [] };

    var inputs = [];
    var idx = 0;

    /* ─── پیدا کردن label مرتبط ─── */
    function findLabel(node) {
      if (!node) return null;

      /* label with for */
      if (node.id) {
        try {
          var lbl = doc.querySelector('label[for="' + node.id.replace(/"/g, '\\"') + '"]');
          if (lbl && lbl.textContent.trim()) {
            return lbl.textContent.trim().slice(0, 200);
          }
        } catch (e) {}
      }

      /* label والد */
      var parent = node.closest && node.closest('label');
      if (parent && parent.textContent.trim()) {
        return parent.textContent.trim().slice(0, 200);
      }

      /* aria-label */
      var aria = node.getAttribute && node.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim().slice(0, 200);

      /* placeholder */
      var ph = node.getAttribute && node.getAttribute('placeholder');
      if (ph && ph.trim()) return ph.trim().slice(0, 200);

      return null;
    }

    /* ─── RADIO ─── */
    try {
      var radioNames = {};
      doc.querySelectorAll('input[type=radio]').forEach(function (r) {
        if (r.name) radioNames[r.name] = true;
      });

      Object.keys(radioNames).forEach(function (name) {
        var checked = null;
        try {
          checked = doc.querySelector('input[type=radio][name="' + name.replace(/"/g, '\\"') + '"]:checked');
        } catch (e) {}

        var first = null;
        try {
          first = doc.querySelector('input[type=radio][name="' + name.replace(/"/g, '\\"') + '"]');
        } catch (e) {}

        var label = findLabel(first) || name;

        idx++;
        inputs.push({
          index: idx,
          name: name,
          type: 'radio',
          value: checked ? String(checked.value) : '',
          label: label
        });
      });
    } catch (e) {
      console.warn('[take] radio:', e);
    }

    /* ─── CHECKBOX ─── */
    try {
      var checkboxGroups = {};
      doc.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        var key = cb.name || cb.id;
        if (!key) return;
        if (!checkboxGroups[key]) checkboxGroups[key] = [];
        if (cb.checked) checkboxGroups[key].push(String(cb.value || 'true'));
      });

      Object.keys(checkboxGroups).forEach(function (name) {
        var first = null;
        try {
          first = doc.querySelector('input[type=checkbox][name="' + name.replace(/"/g, '\\"') + '"]');
        } catch (e) {}

        var label = findLabel(first) || name;

        idx++;
        inputs.push({
          index: idx,
          name: name,
          type: 'checkbox',
          value: checkboxGroups[name].join(' | '),
          label: label
        });
      });
    } catch (e) {
      console.warn('[take] checkbox:', e);
    }

    /* ─── TEXT / NUMBER / EMAIL / TEL / URL ─── */
    try {
      doc.querySelectorAll(
        'input[type=text], input[type=number], input[type=email], input[type=tel], input[type=url], input[type=search]'
      ).forEach(function (inp) {
        var val = (inp.value || '').trim();
        if (!val) return;
        idx++;
        inputs.push({
          index: idx,
          name: inp.name || inp.id || ('input_' + idx),
          type: inp.type || 'text',
          value: val.slice(0, 5000),
          label: findLabel(inp)
        });
      });
    } catch (e) {
      console.warn('[take] text:', e);
    }

    /* ─── TEXTAREA ─── */
    try {
      doc.querySelectorAll('textarea').forEach(function (ta) {
        var val = (ta.value || '').trim();
        if (!val) return;
        idx++;
        inputs.push({
          index: idx,
          name: ta.name || ta.id || ('textarea_' + idx),
          type: 'textarea',
          value: val.slice(0, 20000),
          label: findLabel(ta)
        });
      });
    } catch (e) {
      console.warn('[take] textarea:', e);
    }

    /* ─── SELECT ─── */
    try {
      doc.querySelectorAll('select').forEach(function (sel) {
        if (!sel.value) return;
        var opt = sel.options[sel.selectedIndex];
        var text = opt ? (opt.textContent || '').trim() : sel.value;
        idx++;
        inputs.push({
          index: idx,
          name: sel.name || sel.id || ('select_' + idx),
          type: 'select',
          value: String(text || sel.value).slice(0, 500),
          label: findLabel(sel)
        });
      });
    } catch (e) {
      console.warn('[take] select:', e);
    }

    /* ─── metadata ─── */
    var duration = Math.floor((Date.now() - state.startedAt) / 1000);

    return {
      inputs: inputs,
      metadata: {
        submitted_at: new Date().toISOString(),
        duration_seconds: duration,
        total_inputs: inputs.length,
        user_agent: (navigator.userAgent || '').slice(0, 200)
      }
    };
  }

  /* ============================================================
   * DRAFT (localStorage)
   * ============================================================ */
  function saveDraft() {
    if (state.isSubmitted || !state.examId) return;

    try {
      var data = captureAnswers();
      var payload = {
        answers: data,
        savedAt: Date.now()
      };
      localStorage.setItem(draftKey(state.examId), JSON.stringify(payload));
      state.hasUnsavedChanges = true;
    } catch (e) {
      console.warn('[take] saveDraft:', e);
    }
  }

  function hasDraft() {
    if (!state.examId) return false;
    try {
      var raw = localStorage.getItem(draftKey(state.examId));
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      return !!(parsed && parsed.answers && parsed.answers.inputs && parsed.answers.inputs.length);
    } catch (e) {
      return false;
    }
  }

  function clearDraft() {
    if (!state.examId) return;
    try { localStorage.removeItem(draftKey(state.examId)); } catch (e) {}
  }

  function restoreDraft() {
    if (!state.examId) return;

    var raw = null;
    try { raw = localStorage.getItem(draftKey(state.examId)); } catch (e) {}
    if (!raw) return;

    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { return; }
    if (!parsed || !parsed.answers || !parsed.answers.inputs) return;

    /* نمایش بنر بازیابی */
    if (el.draftBanner) {
      el.draftBanner.style.display = 'flex';
    }

    /* دکمه‌ی بازیابی */
    if (el.draftRestore) {
      el.draftRestore.addEventListener('click', function () {
        applyDraft(parsed.answers.inputs);
        state.draftRestored = true;
        if (el.draftBanner) el.draftBanner.style.display = 'none';
        toast('✅ پیش‌نویس بازیابی شد', 'success');
      });
    }

    /* دکمه‌ی حذف */
    if (el.draftDiscard) {
      el.draftDiscard.addEventListener('click', function () {
        clearDraft();
        if (el.draftBanner) el.draftBanner.style.display = 'none';
        toast('🗑 پیش‌نویس حذف شد', 'info');
      });
    }
  }

  function applyDraft(inputs) {
    if (!el.iframe) return;

    var doc = null;
    try {
      doc = el.iframe.contentDocument || el.iframe.contentWindow.document;
    } catch (e) { return; }
    if (!doc) return;

    inputs.forEach(function (item) {
      try {
        if (item.type === 'radio' && item.value) {
          var radio = doc.querySelector(
            'input[type=radio][name="' + item.name.replace(/"/g, '\\"') + '"][value="' + item.value.replace(/"/g, '\\"') + '"]'
          );
          if (radio) radio.checked = true;

        } else if (item.type === 'checkbox' && item.value) {
          var values = item.value.split(' | ');
          doc.querySelectorAll('input[type=checkbox][name="' + item.name.replace(/"/g, '\\"') + '"]').forEach(function (cb) {
            if (values.indexOf(String(cb.value)) !== -1) cb.checked = true;
          });

        } else if (item.type === 'textarea') {
          var ta = doc.querySelector('textarea[name="' + item.name.replace(/"/g, '\\"') + '"]') ||
                   (item.name ? doc.getElementById(item.name) : null);
          if (ta) ta.value = item.value;

        } else if (item.type === 'select') {
          var sel = doc.querySelector('select[name="' + item.name.replace(/"/g, '\\"') + '"]') ||
                    (item.name ? doc.getElementById(item.name) : null);
          if (sel) {
            /* تلاش برای پیدا کردن option */
            for (var i = 0; i < sel.options.length; i++) {
              if ((sel.options[i].textContent || '').trim() === item.value) {
                sel.selectedIndex = i;
                break;
              }
            }
          }

        } else if (item.type === 'text' || item.type === 'number' || item.type === 'email' || item.type === 'tel' || item.type === 'url' || item.type === 'search') {
          var inp = doc.querySelector('input[name="' + item.name.replace(/"/g, '\\"') + '"]') ||
                    (item.name ? doc.getElementById(item.name) : null);
          if (inp) inp.value = item.value;
        }
      } catch (e) {
        console.warn('[take] applyDraft item:', e);
      }
    });
  }

  /* ============================================================
   * AUTO-SAVE
   * ============================================================ */
  function startAutosave() {
    if (state.autosaveInterval) clearInterval(state.autosaveInterval);

    state.autosaveInterval = setInterval(function () {
      if (state.isSubmitted) return;
      try { saveDraft(); } catch (e) {}
    }, AUTOSAVE_INTERVAL);
  }

  function stopAutosave() {
    if (state.autosaveInterval) {
      clearInterval(state.autosaveInterval);
      state.autosaveInterval = null;
    }
  }

  /* ============================================================
   * SUBMIT
   * ============================================================ */
  async function doSubmit(auto) {
    if (state.isSubmitting || state.isSubmitted) return;

    /* تأیید دستی */
    if (!auto) {
      var data = captureAnswers();
      var total = data.inputs.length;

      var msg = 'مطمئنی که می‌خوای آزمون رو ثبت کنی؟\n';
      if (total === 0) {
        msg += '\n⚠️ هیچ پاسخی وارد نکردی!';
      } else {
        msg += '\nتعداد پاسخ‌های ثبت‌شده: ' + total;
      }

      if (!confirm(msg)) return;
    }

    state.isSubmitting = true;

    /* UI */
    if (el.submitBtn) el.submitBtn.disabled = true;
    if (el.submitOverlay) el.submitOverlay.style.display = 'flex';
    if (el.submitText) el.submitText.textContent = auto ? 'زمان تمام شد — در حال ثبت...' : 'در حال ثبت...';

    /* توقف تایمر و autosave */
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    stopAutosave();

    try {
      var answers = captureAnswers();

      /* اگر خودکار و بدون پاسخ، حداقل یه placeholder بذار */
      if (auto && answers.inputs.length === 0) {
        answers.inputs = [];
      }

      var duration = Math.floor((Date.now() - state.startedAt) / 1000);

      /* درج در دیتابیس */
      var insertResult = await state.supabase
        .from('submissions')
        .insert({
          exam_id: state.examId,
          student_id: state.user.id,
          answers: answers,
          duration_seconds: duration
        })
        .select('id')
        .maybeSingle();

      if (insertResult.error) {
        console.warn('[take] submit error:', insertResult.error);

        var errMsg = 'خطا در ثبت آزمون';

        if ((insertResult.error.message || '').indexOf('قبلاً') !== -1 ||
            (insertResult.error.message || '').indexOf('duplicate') !== -1) {
          errMsg = 'شما قبلاً این آزمون رو ثبت کرده‌اید';
          state.isSubmitted = true;
          toast('این آزمون قبلاً ثبت شده', 'info', 3000);
          await sleep(1500);
          window.location.replace('student.html');
          return;
        } else if ((insertResult.error.message || '').indexOf('Failed to fetch') !== -1) {
          errMsg = 'اتصال به اینترنت برقرار نشد';
        }

        /* خطا → بازگشت به آزمون */
        state.isSubmitting = false;
        if (el.submitBtn) el.submitBtn.disabled = false;
        if (el.submitOverlay) el.submitOverlay.style.display = 'none';
        toast('❌ ' + errMsg, 'error', 5000);

        /* تایمر رو دوباره شروع کن */
        if (state.remaining > 0) startTimer();
        startAutosave();
        return;
      }

      /* موفق */
      state.isSubmitted = true;
      clearDraft();

      if (el.submitText) el.submitText.textContent = '✅ ثبت شد! در حال انتقال...';

      toast('✅ آزمون با موفقیت ثبت شد', 'success', 2500);

      await sleep(1500);

      window.location.replace('student.html');

    } catch (e) {
      console.warn('[take] submit fatal:', e);
      state.isSubmitting = false;
      if (el.submitBtn) el.submitBtn.disabled = false;
      if (el.submitOverlay) el.submitOverlay.style.display = 'none';
      toast('❌ خطای غیرمنتظره، دوباره تلاش کن', 'error', 5000);

      if (state.remaining > 0) startTimer();
      startAutosave();
    }
  }

  /* ============================================================
   * ERROR
   * ============================================================ */
  function showError(message) {
    if (el.loading) el.loading.style.display = 'none';
    if (el.examContent) el.examContent.style.display = 'none';
    if (el.errorState) {
      el.errorState.style.display = 'flex';
      if (el.errorText) el.errorText.textContent = message;
    }
  }

  /* ============================================================
   * BIND EVENTS
   * ============================================================ */
  function bindEvents() {
    if (el.submitBtn) {
      el.submitBtn.addEventListener('click', function () { doSubmit(false); });
    }

    /* ذخیره قبل از خروج */
    window.addEventListener('beforeunload', function (e) {
      if (state.isSubmitted) return;
      if (!state.startedAt) return;

      /* تلاش برای ذخیره */
      try { saveDraft(); } catch (err) {}

      e.preventDefault();
      e.returnValue = '';
      return '';
    });

    /* کیبورد shortcut */
    document.addEventListener('keydown', function (e) {
      /* Ctrl + S → ذخیره */
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveDraft();
        toast('💾 پیش‌نویس ذخیره شد', 'success', 1500);
      }

      /* Ctrl + Enter → ثبت */
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        doSubmit(false);
      }
    });

    /* ذخیره هنگام مخفی شدن tab */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.startedAt && !state.isSubmitted) {
        try { saveDraft(); } catch (e) {}
      }
    });
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  async function init() {
    try { state.supabase = getSupabase(); }
    catch (e) { console.error('[take]', e); return; }

    cacheElements();
    initTheme();
    bindTheme();

    /* examId از URL */
    var params = getQuery();
    state.examId = params.get('id');

    if (!state.examId) {
      showError('شناسه آزمون یافت نشد');
      return;
    }

    /* Auth */
    var auth = await requireStudent();
    if (!auth) return;

    state.user = auth.user;
    state.profile = auth.profile;

    /* چک قبلاً شرکت کرده */
    var notSubmitted = await checkNotSubmitted();
    if (!notSubmitted) return;

    /* لود آزمون */
    var exam = await loadExam();
    if (!exam) return;

    /* عنوان */
    if (el.examTitle) el.examTitle.textContent = exam.title || 'آزمون';

    /* لود فایل */
    var fileOk = await loadFile();
    if (!fileOk) return;

    /* رندر iframe */
    renderIframe();

    /* تایمر */
    startTimer();

    /* autosave */
    startAutosave();

    /* رویدادها */
    bindEvents();

    try {
      console.log(
        '%c📝 آزمون آغاز شد\n%c' + (exam.title || 'آزمون'),
        'color: #00CEC9; font-size: 14px; font-weight: bold;',
        'color: #6C5CE7; font-size: 12px;'
      );
    } catch (e) {}
  }

  /* ============================================================
   * API عمومی
   * ============================================================ */
  window.TakePanel = {
    __loaded: true,
    init: init,
    state: state,
    submit: function () { doSubmit(false); },
    saveDraft: saveDraft,
    captureAnswers: captureAnswers,
    toast: toast
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
