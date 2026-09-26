/**
 * Route Guard: کاربر باید لاگین کرده باشه
 * @param {string} requiredRole - 'student' یا 'teacher' یا null (هر نقشی)
 * @returns {Promise<Object>} - اطلاعات کاربر
 */
async function requireAuth(requiredRole = null) {
    initIdleLogout();
  // چک لاگین
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = 'index.html';
    return null;
  }

  // چک پروفایل
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('code, full_name, role, name_confirmed')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    console.error('Profile error:', error);
    await supabase.auth.signOut();
    window.location.href = 'index.html';
    return null;
  }

  // اگه اسم تأیید نشده
  if (!profile.name_confirmed) {
    window.location.href = 'choose-name.html';
    return null;
  }

  // چک نقش
  if (requiredRole && profile.role !== requiredRole) {
    // ریدایرکت به پنل درست
    window.location.href = profile.role === 'teacher' 
      ? 'teacher.html' 
      : 'student.html';
    return null;
  }

  return { user, profile };
}

/**
 * پر کردن هدر با اطلاعات کاربر
 */
function fillUserHeader(profile) {
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  
  if (nameEl) nameEl.textContent = profile.full_name || 'کاربر';
  if (avatarEl) avatarEl.textContent = getInitials(profile.full_name);
}
