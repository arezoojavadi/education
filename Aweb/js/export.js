/**
 * خروجی CSV از پاسخ‌ها
 */
function exportSubmissionsToCSV(submissions, examTitle = 'آزمون') {
  if (!submissions?.length) {
    showToast('داده‌ای برای خروجی نیست', 'warn');
    return;
  }

  const rows = [
    ['ردیف', 'نام دانش‌آموز', 'کد', 'تاریخ ارسال', 'مدت (ثانیه)', 'تعداد پاسخ', 'جزئیات پاسخ‌ها']
  ];

  submissions.forEach((s, i) => {
    const answers = s.answers?.inputs || [];
    const detail = answers.map(a => 
      `${a.index}. ${a.label || a.name} [${a.type}]: ${a.value || '—'}`
    ).join(' | ');

    rows.push([
      i + 1,
      s.profiles?.full_name || '—',
      s.profiles?.code || '—',
      new Date(s.submitted_at).toLocaleString('fa-IR'),
      s.duration_seconds || 0,
      answers.length,
      detail
    ]);
  });

  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
  
  // BOM برای Excel فارسی
  const blob = new Blob(['\ufeff' + csv], { 
    type: 'text/csv;charset=utf-8' 
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${examTitle.replace(/[^\u0600-\u06FF\w]/g, '_')}_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('✅ فایل CSV دانلود شد', 'success');
}

function escapeCSV(field) {
  const s = String(field ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}