const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ⚠️ از Settings → API بردار (service_role، نه anon)
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOi...';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function loadCodes(file) {
  return fs.readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => /^\d{4}$/.test(l));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createUser(code, role, index, total) {
  const email = `${code}@exam.local`;
  const password = `${code}${code}`;

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      code,
      role,
      full_name: ''
    }
  });

  if (error) {
    console.log(`❌ [${index}/${total}] ${code}: ${error.message}`);
    return { code, ok: false };
  }
  console.log(`✅ [${index}/${total}] ${code} → ${role}`);
  return { code, ok: true };
}

(async () => {
  const teacherCodes = loadCodes('teacher-codes.txt');
  const studentCodes = loadCodes('student-codes.txt');

  console.log(`📚 ${teacherCodes.length} معلم + ${studentCodes.length} دانش‌آموز\n`);

  let ok = 0, fail = 0;

  console.log('=== معلم‌ها ===');
  for (let i = 0; i < teacherCodes.length; i++) {
    const r = await createUser(teacherCodes[i], 'teacher', i + 1, teacherCodes.length);
    r.ok ? ok++ : fail++;
    await sleep(200);
  }

  console.log('\n=== دانش‌آموزها ===');
  for (let i = 0; i < studentCodes.length; i++) {
    const r = await createUser(studentCodes[i], 'student', i + 1, studentCodes.length);
    r.ok ? ok++ : fail++;
    await sleep(150);
  }

  console.log('\n' + '='.repeat(40));
  console.log(`✅ موفق: ${ok}`);
  console.log(`❌ ناموفق: ${fail}`);
})();
