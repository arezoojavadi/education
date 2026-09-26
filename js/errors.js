/**
 * Error Boundary سراسری
 * هر خطای JS رو می‌گیره و به کاربر پیام مناسب نشون می‌ده
 */

// ============================================
// خطاهای سراسری
// ============================================
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
  handleGlobalError(e.error || new Error(e.message));
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise:', e.reason);
  handleGlobalError(e.reason);
});

function handleGlobalError(err) {
  // خطاهای Auth که ما خودمون هندل می‌کنیم رو نادیده بگیر
  const msg = String(err?.message || err || '');

  if (msg.includes('Invalid login') || 
      msg.includes('JWT') ||
      msg.includes('session')) {
    return; // Auth errors خودشون هندل می‌شن
  }

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    showToast('🌐 اتصال به اینترنت رو بررسی کن', 'error', 5000);
    return;
  }

  showToast('❌ خطای غیرمنتظره: ' + msg.slice(0, 100), 'error', 5000);
}

// ============================================
// چک اتصال اینترنت
// ============================================
function initOnlineCheck() {
  window.addEventListener('online', () => {
    showToast('✅ اتصال برقرار شد', 'success');
  });

  window.addEventListener('offline', () => {
    showToast('⚠️ اینترنت قطع شد', 'warn', 8000);
  });
}

// ============================================
// Fallback برای Supabase errors
// ============================================
function handleSupabaseError(error, customMsg = 'خطا') {
  console.error(error);
  
  if (!error) return;
  
  let msg = error.message || String(error);
  
  // ترجمه خطاهای رایج
  const translations = {
    'duplicate key': 'این مورد قبلاً ثبت شده',
    'row-level security': 'دسترسی شما مجاز نیست',
    'JWT expired': 'نشست شما منقضی شده، دوباره وارد شو',
    'Invalid login': 'کد معتبر نیست',
    'Failed to fetch': 'اتصال به سرور برقرار نشد'
  };

  for (const [key, val] of Object.entries(translations)) {
    if (msg.includes(key)) {
      msg = val;
      break;
    }
  }

  showToast(`❌ ${customMsg}: ${msg}`, 'error', 5000);
}
