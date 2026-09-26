let currentProfile = null;
let currentUser = null;

(async function init() {
  initTheme();

  const auth = await requireAuth('teacher');
  if (!auth) return;

  currentProfile = auth.profile;
  currentUser = auth.user;
  fillUserHeader(currentProfile);

  setupUpload();
  await loadStats();
  await loadTeacherExams();
})();

async function loadStats() {
  const [examsRes, subsRes, studentsRes] = await Promise.all([
    supabase.from('exams').select('id', { count: 'exact', head: true }),
    supabase.from('submissions').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student')
  ]);

  document.getElementById('statExams').textContent = examsRes.count ?? 0;
  document.getElementById('statSubmissions').textContent = subsRes.count ?? 0;
  document.getElementById('statStudents').textContent = studentsRes.count ?? 0;
}

async function loadTeacherExams() {
  const el = document.getElementById('examsList');

  const { data: exams, error } = await supabase
    .from('exams')
    .select('id, title, description, is_active, created_at, file_size')
    .order('created_at', { ascending: false });

  if (error) {
    el.innerHTML = '<div class="empty-state"><p>خطا در بارگذاری</p></div>';
    return;
  }

  if (!exams?.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="emoji">📭</span>
        <h3>هنوز آزمونی نساختی</h3>
        <p>روی «آزمون جدید» کلیک کن</p>
      </div>`;
    return;
  }

  // گرفتن تعداد پاسخ‌ها برای هر آزمون
  const { data: counts } = await supabase
    .from('submissions')
    .select('exam_id');

  const countMap = {};
  (counts || []).forEach(c => {
    countMap[c.exam_id] = (countMap[c.exam_id] || 0) + 1;
  });

  el.innerHTML = `<div class="grid">${exams.map(exam => `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <h4 class="card-title">${escapeHtml(exam.title)}</h4>
        <span class="badge ${exam.is_active ? 'badge-success' : 'badge-muted'}">
          ${exam.is_active ? 'فعال' : 'غیرفعال'}
        </span>
      </div>
      ${exam.description 
        ? `<p style="color:var(--text-muted); font-size:13px; margin-bottom:8px;">${escapeHtml(exam.description)}</p>` 
        : ''}
      <div class="card-meta">
        <span>📅 ${formatDate(exam.created_at)}</span>
        <span>👥 ${countMap[exam.id] || 0} پاسخ</span>
        <span>💾 ${formatBytes(exam.file_size)}</span>
      </div>
      <div class="card-actions">
        <a href="view.html?id=${exam.id}" class="btn btn-primary btn-sm">
          مشاهده پاسخ‌ها
        </a>
        <button class="btn btn-secondary btn-sm" 
                onclick="toggleExam('${exam.id}', ${!exam.is_active})">
          ${exam.is_active ? 'غیرفعال' : 'فعال'}
        </button>
        <button class="btn btn-danger btn-sm" 
                onclick="deleteExam('${exam.id}', '${escapeHtml(exam.title)}')">
          حذف
        </button>
      </div>
    </div>
  `).join('')}</div>`;
}

async function toggleExam(examId, newState) {
  const { error } = await supabase
    .from('exams')
    .update({ is_active: newState })
    .eq('id', examId);

  if (error) {
    showToast('خطا: ' + error.message, 'error');
    return;
  }
  showToast(newState ? 'آزمون فعال شد' : 'آزمون غیرفعال شد', 'success');
  loadTeacherExams();
}

async function deleteExam(examId, title) {
  if (!confirm(`مطمئنی می‌خوای «${title}» رو حذف کنی؟\nهمه‌ی پاسخ‌ها هم پاک می‌شن.`)) return;

  // اول فایل رو از Storage پاک کن
  const { data: exam } = await supabase
    .from('exams')
    .select('file_path')
    .eq('id', examId)
    .single();

  if (exam?.file_path) {
    await supabase.storage.from('exam-files').remove([exam.file_path]);
  }

  // بعد رکورد
  const { error } = await supabase
    .from('exams')
    .delete()
    .eq('id', examId);

  if (error) {
    showToast('خطا: ' + error.message, 'error');
    return;
  }
  showToast('آزمون حذف شد', 'success');
  loadTeacherExams();
  loadStats();
}
