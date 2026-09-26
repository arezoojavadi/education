/**
 * بهبود Accessibility
 */

// Enter برای submit در مودال‌ها
function initModalKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal-overlay.show');
      if (openModal) {
        const closeBtn = openModal.querySelector('[onclick*="close"]');
        if (closeBtn) closeBtn.click();
      }
    }
  });
}

// Focus trap در مودال‌ها
function trapFocus(modal) {
  const focusables = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

// Esc برای بستن مودال‌ها
function initAccessibility() {
  initModalKeyboard();
  
  // aria-live برای toast
  const container = document.querySelector('.toast-container');
  if (container) container.setAttribute('aria-live', 'polite');
}