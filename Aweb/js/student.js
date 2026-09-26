let currentProfile = null;

(async function init() {
  initTheme();

  const auth = await requireAuth('student');
  if (!auth) return;

  currentProfile = auth.profile;
  fillUserHeader(currentProfile);

  document.getElementById('greeting').textContent = 
    `خوش آمدی، ${currentProfile.full_name} 👋`;

  await loadExams(auth.user.id);
})();

async function loadExams(userId) {
  // همه آزمون‌های فعال
  const { data: exams, error } = await supabase
    .from('exams')
    .select('id, title, description, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    document.getElementById('activeExams').innerHTML = 
      '<div class="empty-state"><p>خطا در بارگذاری</p></div>';
    return;
  }

  // پاسخ‌های قبلی این دانش‌آموز
  const { data: submissions } = await supabase
    .from('submissions')
    .select('exam_id, submitted_at, duration_seconds')
    .eq('student_id', userId);

  const takenMap = new Map(
    (submissions || []).map(s => [s.exam_id, s])
  );

  // تفکیک
  const activeList = [];
  const doneList = [];

  (exams || []).forEach(exam => {
    if (takenMap.has(exam.id)) {
      doneList.push({ ...exam, submission: takenMap.get(exam.id) });
    } else {
      activeList.push(exam);
    }
  });

  renderActive(activeList);
  renderDone(doneList);
}
function showSkeleton() {
  document.getElementById('activeExams').innerHTML = `
    <div class="skeleton-grid">
      ${[1,2,3].map(() => `
        <div class="skeleton-card">
          <div class="skeleton skeleton-line title"></div>
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-btn"></div>
        </div>
      `).join('')}
    </div>`;
  
  document.getElementById('doneExams').innerHTML = `
    <div class="skeleton-grid">
      ${[1,2].map(() => `
        <div class="skeleton-card">
          <div class="skeleton skeleton-line title"></div>
          <div class="skeleton skeleton-line short"></div>
        </div>
      `).join('')}
    </div>`;
}
function renderActive(list) {
  const el = document.getElementById('activeExams');

  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🎉</span>
        <h3>همه آزمون‌ها رو انجام دادی!</h3>
        <p>منتظر آزمون‌های جدید باش</p>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="grid">${list.map(exam => `
    <div class="card card-hover">
      <h4 class="card-title">${escapeHtml(exam.title)}</h4>
      ${exam.description 
        ? `<p style="color:var(--text-muted); font-size:14px; margin-bottom:12px;">${escapeHtml(exam.description)}</p>` 
        : ''}
      <div class="card-meta">
        <span>📅 ${formatDate(exam.created_at)}</span>
      </div>
      <div class="card-actions">
        <a href="take.html?id=${exam.id}" class="btn btn-primary btn-sm">
          شروع آزمون ←
        </a>
      </div>
    </div>
  `).join('')}</div>`;
}

function renderDone(list) {
  const el = document.getElementById('doneExams');

  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="emoji">📭</span>
        <p>هنوز آزمونی انجام ندادی</p>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="grid">${list.map(exam => `
    <div class="card">
      <h4 class="card-title">${escapeHtml(exam.title)}</h4>
      <div class="card-meta">
        <span>🕐 ${formatDateTime(exam.submission.submitted_at)}</span>
        <span>⏱ ${formatTime(exam.submission.duration_seconds)}</span>
      </div>
      <div class="card-actions">
        <span class="badge badge-success">✅ ارسال شده</span>
      </div>
    </div>
  `).join('')}</div>`;
}
