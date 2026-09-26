let currentUser = null;
let examData = null;
let startedAt = null;
let timerInterval = null;
let durationSeconds = 0;
let autoSaveInterval = null;

const params = new URLSearchParams(location.search);
const examId = params.get('id');

// ============================================
// INIT
// ============================================
(async function init() {
  initTheme();

  const auth = await requireAuth('student');
  if (!auth) return;

  currentUser = auth.user;

  if (!examId) {
    alert('شناسه آزمون یافت نشد');
    window.location.href = 'student.html';
    return;
  }

  await loadExam();
  await checkNotSubmitted();
  await loadFileIntoFrame();

  startedAt = Date.now();
  startTimer();

  // ذخیره خودکار هر ۵ ثانیه در localStorage
  autoSaveInterval = setInterval(autoSaveDraft, 5000);

  // هشدار قبل از خروج
  window.addEventListener('beforeunload', e => {
    e.preventDefault();
    e.returnValue = '';
  });
})();

// ============================================
// بارگذاری آزمون
// ============================================
async function loadExam() {
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('id', examId)
    .single();

  if (error || !data) {
    alert('آزمون یافت نشد');
    window.location.href = 'student.html';
    return;
  }

  if (!data.is_active) {
    alert('این آزمون غیرفعال شده');
    window.location.href = 'student.html';
    return;
  }

  examData = data;
  document.getElementById('examTitle').textContent = data.title;
}

async function checkNotSubmitted() {
  const { data } = await supabase
    .from('submissions')
    .select('id')
    .eq('exam_id', examId)
    .eq('student_id', currentUser.id)
    .maybeSingle();

  if (data) {
    alert('شما قبلاً در این آزمون شرکت کرده‌اید');
    window.location.href = 'student.html';
  }
}

// ============================================
// بارگذاری فایل HTML در iframe
// ============================================
async function loadFileIntoFrame() {
  const { data, error } = await supabase.storage
    .from('exam-files')
    .download(examData.file_path);

  if (error) {
    document.getElementById('loading').innerHTML = 
      '<p>❌ خطا در بارگذاری فایل آزمون</p>';
    return;
  }

  const htmlText = await data.text();

  const iframe = document.getElementById('examFrame');

  // استفاده از srcdoc → همان origin، دسترسی به contentDocument ممکنه
  iframe.srcdoc = htmlText;

  iframe.addEventListener('load', () => {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('examContent').style.display = 'block';

    // بازیابی draft
    restoreDraft();
  });
}

// ============================================
// تایمر
// ============================================
function startTimer() {
  timerInterval = setInterval(() => {
    durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    const s = durationSeconds % 60;

    const text = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`;

    document.getElementById('timerText').textContent = text;
  }, 1000);
}

// ============================================
// Capture پاسخ‌ها
// ============================================
function captureAnswers() {
  const iframe = document.getElementById('examFrame');
  const doc = iframe.contentDocument || iframe.contentWindow.document;

  if (!doc) return { inputs: [] };

  const inputs = [];
  let idx = 0;

  const addItem = (el, type, value, label) => {
    inputs.push({
      index: ++idx,
      name: el.name || el.id || `input_${idx}`,
      type,
      value: sanitize(String(value)),
      label: label || null
    });
  };

  // پیدا کردن label مرتبط
  const findLabel = (el) => {
    if (el.id) {
      const l = doc.querySelector(`label[for="${el.id}"]`);
      if (l) return l.textContent.trim().slice(0, 200);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.trim().slice(0, 200);
    return null;
  };

  // RADIO
  const radioGroups = new Set();
  doc.querySelectorAll('input[type=radio]').forEach(el => {
    if (radioGroups.has(el.name)) return;
    radioGroups.add(el.name);
    const checked = doc.querySelector(`input[type=radio][name="${el.name}"]:checked`);
    const label = findLabel(el);
    inputs.push({
      index: ++idx,
      name: el.name,
      type: 'radio',
      value: checked ? sanitize(checked.value) : '',
      label
    });
  });

  // CHECKBOX
  const checkboxGroups = {};
  doc.querySelectorAll('input[type=checkbox]').forEach(el => {
    const key = el.name || el.id;
    if (!key) return;
    if (!checkboxGroups[key]) checkboxGroups[key] = [];
    if (el.checked) checkboxGroups[key].push(el.value);
  });
  Object.entries(checkboxGroups).forEach(([name, values]) => {
    inputs.push({
      index: ++idx,
      name,
      type: 'checkbox',
      value: sanitize(values.join(' | ')),
      label: null
    });
  });

  // TEXT / NUMBER / EMAIL
  doc.querySelectorAll('input[type=text], input[type=number], input[type=email], input[type=tel]').forEach(el => {
    if (el.value && el.value.trim()) {
      addItem(el, el.type, el.value.trim(), findLabel(el));
    }
  });

  // TEXTAREA
  doc.querySelectorAll('textarea').forEach(el => {
    if (el.value && el.value.trim()) {
      addItem(el, 'textarea', el.value.trim(), findLabel(el));
    }
  });

  // SELECT
  doc.querySelectorAll('select').forEach(el => {
    if (el.value) {
      const opt = el.options[el.selectedIndex];
      addItem(el, 'select', opt ? opt.text : el.value, findLabel(el));
    }
  });

  return { inputs };
}

// ============================================
// ذخیره خودکار draft
// ============================================
function autoSaveDraft() {
  try {
    const data = captureAnswers();
    localStorage.setItem(`exam_draft_${examId}`, JSON.stringify({
      answers: data,
      savedAt: Date.now()
    }));
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

function restoreDraft() {
  const raw = localStorage.getItem(`exam_draft_${examId}`);
  if (!raw) return;

  try {
    const { answers } = JSON.parse(raw);
    if (!answers?.inputs?.length) return;

    const iframe = document.getElementById('examFrame');
    const doc = iframe.contentDocument;

    answers.inputs.forEach(item => {
      if (item.type === 'radio' && item.value) {
        const el = doc.querySelector(`input[type=radio][name="${item.name}"][value="${item.value}"]`);
        if (el) el.checked = true;
      } else if (item.type === 'checkbox' && item.value) {
        const values = item.value.split(' | ');
        doc.querySelectorAll(`input[type=checkbox][name="${item.name}"]`).forEach(el => {
          if (values.includes(el.value)) el.checked = true;
        });
      } else if (['text','number','email','tel','textarea','select'].includes(item.type)) {
        const el = doc.querySelector(`[name="${item.name}"], #${item.name}`);
        if (el) el.value = item.value;
      }
    });

    showToast('✏️ پیش‌نویس قبلی بازیابی شد', 'warn');
  } catch (e) {
    console.warn('Restore failed:', e);
  }
}

// ============================================
// ثبت نهایی
// ============================================
async function submitExam() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'در حال ثبت...';

  try {
    const { inputs } = captureAnswers();

    const answers = {
      inputs,
      metadata: {
        submitted_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        user_agent: navigator.userAgent.slice(0, 200)
      }
    };

    const { error } = await supabase
      .from('submissions')
      .insert({
        exam_id: examId,
        student_id: currentUser.id,
        answers,
        duration_seconds: durationSeconds
      });

    if (error) throw error;

    // پاک کردن draft
    localStorage.removeItem(`exam_draft_${examId}`);
    clearInterval(timerInterval);
    clearInterval(autoSaveInterval);

    // حذف هشدار
    window.removeEventListener('beforeunload', () => {});

    btn.textContent = '✅ ثبت شد!';
    showToast('✅ پاسخ‌های شما با موفقیت ثبت شد', 'success', 2000);

    setTimeout(() => {
      window.location.href = 'student.html';
    }, 1500);

  } catch (err) {
    console.error(err);
    showToast('❌ خطا: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ ثبت نهایی و ارسال به معلم';
  }
}