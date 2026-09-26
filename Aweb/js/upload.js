let selectedFile = null;
let currentUser = null;

function setupUpload() {
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  // کلیک روی zone
  zone.addEventListener('click', () => input.click());

  // انتخاب فایل
  input.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  // Drag & Drop
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
}

function handleFile(file) {
  // اعتبارسنجی
  if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
    showToast('فقط فایل HTML مجازه', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('حجم فایل نباید بیشتر از ۱۰ مگابایت باشه', 'error');
    return;
  }

  selectedFile = file;

  // پیش‌نمایش
  document.getElementById('filePreview').innerHTML = `
    <div class="file-preview">
      <span class="file-icon">📄</span>
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${formatBytes(file.size)}</div>
      </div>
      <button class="btn-icon" onclick="clearFile()" title="حذف">✕</button>
    </div>`;

  updateUploadBtn();
}

function clearFile() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').innerHTML = '';
  updateUploadBtn();
}

function updateUploadBtn() {
  const title = document.getElementById('examTitle').value.trim();
  const btn = document.getElementById('uploadBtn');
  btn.disabled = !(selectedFile && title.length >= 2);
}

// لیسنر روی عنوان
document.addEventListener('DOMContentLoaded', () => {
  const titleInput = document.getElementById('examTitle');
  if (titleInput) titleInput.addEventListener('input', updateUploadBtn);
});

function openUploadModal() {
  document.getElementById('uploadModal').classList.add('show');
  document.getElementById('examTitle').focus();
}

function closeUploadModal() {
  if (document.getElementById('progressBar').style.display !== 'none') {
    if (!confirm('آپلود در حال انجامه. مطمئنی می‌خوای ببندی؟')) return;
  }
  document.getElementById('uploadModal').classList.remove('show');
  resetUploadModal();
}

function resetUploadModal() {
  document.getElementById('examTitle').value = '';
  document.getElementById('examDesc').value = '';
  clearFile();
  document.getElementById('progressBar').style.display = 'none';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('uploadBtn').disabled = true;
  document.getElementById('uploadBtn').textContent = 'آپلود';
  document.getElementById('uploadBtn').onclick = uploadExam;
}

async function uploadExam() {
  if (!selectedFile || !currentUser) return;

  const title = document.getElementById('examTitle').value.trim();
  const description = document.getElementById('examDesc').value.trim();

  if (title.length < 2) {
    showToast('عنوان آزمون خیلی کوتاهه', 'error');
    return;
  }

  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  btn.textContent = 'در حال آپلود...';

  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';

  try {
    // ۱. ساخت مسیر یکتا
    const ext = selectedFile.name.split('.').pop();
    const path = `${currentUser.id}/${Date.now()}.${ext}`;

    // ۲. آپلود به Storage
    const { error: uploadError } = await supabase.storage
      .from('exam-files')
      .upload(path, selectedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'text/html'
      });

    if (uploadError) throw uploadError;
    progressFill.style.width = '80%';

    // ۳. ساخت رکورد در exams
    const { data: examData, error: dbError } = await supabase
      .from('exams')
      .insert({
        title,
        description: description || null,
        file_path: path,
        file_size: selectedFile.size,
        created_by: currentUser.id,
        is_active: true
      })
      .select()
      .single();

    if (dbError) {
      // rollback: فایل رو پاک کن
      await supabase.storage.from('exam-files').remove([path]);
      throw dbError;
    }

    progressFill.style.width = '100%';
    showToast('✅ آزمون با موفقیت آپلود شد', 'success');

    setTimeout(() => {
      closeUploadModal();
      loadTeacherExams();
      loadStats();
    }, 800);

  } catch (err) {
    console.error(err);
    showToast('❌ خطا: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'آپلود';
    progressBar.style.display = 'none';
  }
}
