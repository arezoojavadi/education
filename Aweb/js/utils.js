// ============================================
// اتصال Supabase (مشترک بین همه صفحات)
// ============================================
// ⚠️ این مقادیر رو از فاز ۱ کپی کن
const SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qf3R9hPgjApwe2c-qQMoJA_jitobazq';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Sanitize (ضد XSS)
// ============================================
function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .slice(0, 20000);
}

// ============================================
// تاریخ و ساعت فارسی
// ============================================
function formatDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(iso));
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ثانیه`;
  return `${m}:${String(s).padStart(2, '0')} دقیقه`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// ============================================
// Toast (پیام‌های شناور)
// ============================================
function showToast(message, type = 'success', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// تم (دارک/لایت)
// ============================================
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
  }
  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
  }
}

// ============================================
// خروج
// ============================================
async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

// ============================================
// Escape HTML (برای نمایش امن)
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

// ============================================
// گرفتن حروف اول نام (برای آواتار)
// ============================================
function getInitials(name) {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0];
  return parts[0][0] + parts[parts.length - 1][0];
}

// ============================================
// دیبانس
// ============================================
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
