let currentProfile = null;
let examData = null;
let allSubmissions = [];
let filteredSubmissions = [];

const params = new URLSearchParams(location.search);
const examId = params.get('id');
const submissionId = params.get('sub');

(async function init() {
  initTheme();

  const auth = await requireAuth('teacher');
  if (!auth) return;
  currentProfile = auth.profile;

  if (!examId) {
    window.location.href = 'teacher.html';
    return;
  }

  await loadExam();
  await loadSubmissions();
  const channel = subscribeToSubmissions(examId, (newSub) => {
  allSubmissions.unshift(newSub);
  filteredSubmissions = [...allSubmissions];
  renderList();
  showToast(`📬 پاسخ جدید از ${newSub.profiles?.full_name || 'دانش‌آموز'}`, 'success');
});

// پاک‌سازی هنگام خروج
window.addEventListener('beforeunload', () => {
  supabase.removeChannel(channel);
});

  if (submissionId) {
    showDetail(submissionId);
  } else {
    showList();
  }
})();

async function loadExam() {
  const { data } = await supabase
    .from('exams')
    .select('id, title, description')
    .eq('id', examId)
    .single();

  examData = data;
  if (examData) {
    document.getElementById('examTitle').textContent = '📝 ' + examData.title;
    document.getElementById('pageTitle').textContent = examData.title;
  }
}

async function loadSubmissions() {
  const { data, error } = await supabase
    .from('submissions')
    .select(`
      id, submitted_at, duration_seconds, answers,
      profiles:student_id (id, code, full_name)
    `)
    .eq('exam_id', examId)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error(error);
    document.getElementById('loading').innerHTML = 
      '<p>❌ خطا در بارگذاری پاسخ‌ها</p>';
    return;
  }

  allSubmissions = data || [];
  filteredSubmissions = [...allSubmissions];

  document.getElementById('loading').style.display = 'none';

  // سرچ
  document.getElementById('searchInput').addEventListener('input', debounce(e => {
    const q = e.target.value.trim().toLowerCase();
    filteredSubmissions = allSubmissions.filter(s =>
      (s.profiles?.full_name || '').toLowerCase().includes(q) ||
      (s.profiles?.code || '').includes(q)
    );
    renderList();
  }, 200));
}

function showList() {
  document.getElementById('studentsList').style.display = 'block';
  document.getElementById('detailView').style.display = 'none';
  renderList();
}

function renderList() {
  const el = document.getElementById('submissionsList');

  if (!filteredSubmissions.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="emoji">📭</span>
        <h3>${allSubmissions.length ? 'نتیجه‌ای پیدا نشد' : 'هنوز هیچ پاسخی نیومده'}</h3>
        <p>${allSubmissions.length ? 'عبارت دیگه‌ای جستجو کن' : 'منتظر بمون تا دانش‌آموزان پاسخ بدن'}</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>نام دانش‌آموز</th>
            <th>کد</th>
            <th>زمان ارسال</th>
            <th>مدت</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filteredSubmissions.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${escapeHtml(s.profiles?.full_name || '—')}</strong></td>
              <td><code>${escapeHtml(s.profiles?.code || '—')}</code></td>
              <td>${formatDateTime(s.submitted_at)}</td>
              <td>${formatTime(s.duration_seconds)}</td>
              <td>
                <button class="btn btn-primary btn-sm" 
                        onclick="showDetail('${s.id}')">
                  مشاهده
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function showDetail(subId) {
  const sub = allSubmissions.find(s => s.id === subId);
  if (!sub) return;

  document.getElementById('studentsList').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';

  document.getElementById('studentName').textContent = 
    sub.profiles?.full_name || 'دانش‌آموز';
  document.getElementById('submitMeta').textContent = 
    `کد: ${sub.profiles?.code || '—'} • ${formatDateTime(sub.submitted_at)} • مدت: ${formatTime(sub.duration_seconds)}`;

  renderAnswers(sub.answers);
}

function backToList() {
  history.replaceState(null, '', `view.html?id=${examId}`);
  showList();
}

function renderAnswers(answers) {
  const el = document.getElementById('answersContainer');
  const inputs = answers?.inputs || [];

  if (!inputs.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="emoji">📝</span>
        <h3>هیچ پاسخی ثبت نشده</h3>
        <p>دانش‌آموز هیچ فیلدی رو پر نکرده</p>
      </div>`;
    return;
  }

  const typeLabels = {
    radio: 'تک‌انتخابی',
    checkbox: 'چندگزینه‌ای',
    text: 'متنی',
    number: 'عددی',
    email: 'ایمیل',
    tel: 'تلفن',
    textarea: 'تشریحی',
    select: 'انتخابی'
  };

  el.innerHTML = inputs.map(item => `
    <div class="answer-item">
      <div class="answer-label">
        ${item.index}. 
        ${item.label ? escapeHtml(item.label) : escapeHtml(item.name)}
        <span class="badge badge-muted" style="margin-right:8px; font-size:11px;">
          ${typeLabels[item.type] || item.type}
        </span>
      </div>
      <div class="answer-value ${!item.value ? 'empty' : ''}">
        ${item.value ? escapeHtml(item.value) : 'بدون پاسخ'}
      </div>
    </div>
  `).join('');
}
function exportAll() {
  exportSubmissionsToCSV(filteredSubmissions, examData?.title);
}
