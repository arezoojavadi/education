/**
 * Auto-logout بعد از بی‌فعالیت
 * پیش‌فرض: ۳۰ دقیقه
 */
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 دقیقه
const WARNING_BEFORE = 60 * 1000;    // ۱ دقیقه قبل هشدار

let idleTimer = null;
let warningTimer = null;
let warningShown = false;

const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(warningTimer);
  warningShown = false;

  // حذف هشدار قبلی
  const existingWarning = document.getElementById('idleWarning');
  if (existingWarning) existingWarning.remove();

  // تایمر هشدار
  warningTimer = setTimeout(() => {
    showIdleWarning();
  }, IDLE_TIMEOUT - WARNING_BEFORE);

  // تایمر خروج
  idleTimer = setTimeout(async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  }, IDLE_TIMEOUT);
}

function showIdleWarning() {
  if (warningShown) return;
  warningShown = true;

  const warning = document.createElement('div');
  warning.id = 'idleWarning';
  warning.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: var(--surface, #fff);
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.15);
    border-right: 4px solid #FDCB6E;
    z-index: 9999;
    font-family: inherit;
    max-width: 320px;
    animation: slideUp .3s ease;
  `;
  warning.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">⏰ نشستت داره منقضی می‌شه</div>
    <div style="font-size:13px; color:var(--text-muted, #666); line-height:1.6;">
      برای ادامه، یه جا کلیک کن.
    </div>
    <button onclick="resetIdleTimer(); this.parentElement.remove();" 
            style="margin-top:12px; padding:8px 16px; background:var(--primary,#6C5CE7);
                   color:#fff; border:none; border-radius:8px; cursor:pointer;
                   font-family:inherit; font-size:13px;">
      ادامه می‌دم
    </button>
  `;
  document.body.appendChild(warning);
}

function initIdleLogout() {
  events.forEach(ev => {
    document.addEventListener(ev, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
}
