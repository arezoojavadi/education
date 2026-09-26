/* ============================================================
 * create-users.js
 * ------------------------------------------------------------
 * ساخت خودکار ۹۹۰ کاربر (۳۰ معلم + ۹۶۰ دانش‌آموز)
 * طراحی: فاطمه جوادی
 *
 * نحوه‌ی اجرا:
 *   1. پروژه‌ی Supabase ساخته شده باشه
 *   2. فایل‌های teacher-codes.txt و student-codes.txt موجود باشن
 *   3. npm install @supabase/supabase-js
 *   4. node create-users.js
 *
 * ⚠️ SECRET_KEY فقط روی لپ‌تاپ خودت — هرگز commit نکن
 * ============================================================ */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

/* ============================================================
 * CONFIG
 * ============================================================ */

const SUPABASE_URL = 'https://cfkwvzbqgapguuaqibmq.supabase.co';

/* ⚠️ این کلید رو از Supabase → Settings → API Keys → Secret keys بردار
 *    هرگز این فایل رو توی GitHub آپلود نکن
 */
const SECRET_KEY = 'sb_secret_اینجا-کلید-secret-خودت-رو-بذار';

/* فایل‌های ورودی — هر خط یه کد ۶ رقمی */
const TEACHER_FILE = 'teacher-codes.txt';
const STUDENT_FILE = 'student-codes.txt';

/* تنظیمات */
const DELAY_MS = 150;            // تأخیر بین درخواست‌ها (ضد rate limit)
const MAX_RETRIES = 3;           // حداکثر تلاش مجدد
const EMAIL_DOMAIN = 'exam.local';
const LOG_SUCCESS = true;        // لاگ موفقیت‌ها
const LOG_SKIP = true;           // لاگ کاربران تکراری

/* ============================================================
 * SUPABASE CLIENT
 * ============================================================ */

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/* ============================================================
 * HELPERS
 * ============================================================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readCodes(file) {
  const fullPath = path.join(__dirname, file);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ فایل پیدا نشد: ${file}`);
    console.error(`   مسیر مورد انتظار: ${fullPath}`);
    return [];
  }

  const content = fs.readFileSync(fullPath, 'utf-8');

  const codes = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{6}$/.test(line));

  return codes;
}

function makeEmail(code) {
  return `${code}@${EMAIL_DOMAIN}`;
}

function makePassword(code) {
  return `${code}${code}`; // ۱۲ کاراکتر
}

function isDuplicateError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('already been registered') ||
    msg.includes('already exists') ||
    msg.includes('duplicate') ||
    msg.includes('user already')
  );
}

/* ============================================================
 * CREATION
 * ============================================================ */

async function createUser(code, role, attempt) {
  attempt = attempt || 1;

  const email = makeEmail(code);
  const password = makePassword(code);

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        code: code,
        role: role,
        full_name: ''
      }
    });

    /* موفقیت */
    if (!error && data && data.user) {
      return { ok: true, status: 'created', user: data.user };
    }

    /* کاربر تکراری */
    if (isDuplicateError(error)) {
      return { ok: true, status: 'exists' };
    }

    /* خطای rate limit → retry */
    const msg = (error && error.message) || '';
    if (
      (msg.toLowerCase().includes('rate') ||
        msg.toLowerCase().includes('too many')) &&
      attempt < MAX_RETRIES
    ) {
      const wait = 2000 * attempt;
      console.log(`⏳ rate limit — صبر ${wait}ms و تلاش مجدد (${attempt}/${MAX_RETRIES})`);
      await sleep(wait);
      return createUser(code, role, attempt + 1);
    }

    /* خطای واقعی */
    return { ok: false, status: 'error', error: error };
  } catch (err) {
    /* خطای شبکه → retry */
    if (attempt < MAX_RETRIES) {
      const wait = 1000 * attempt;
      await sleep(wait);
      return createUser(code, role, attempt + 1);
    }
    return { ok: false, status: 'exception', error: err };
  }
}

/* ============================================================
 * MAIN
 * ============================================================ */

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log('   📚 ساخت خودکار کاربران — سامانه آزمون');
  console.log('   ✨ طراحی: فاطمه جوادی');
  console.log('══════════════════════════════════════════════════');
  console.log('');

  /* ─── بررسی کلید ─── */
  if (!SECRET_KEY || SECRET_KEY.includes('اینجا')) {
    console.error('❌ SECRET_KEY تنظیم نشده!');
    console.error('   برو به Supabase → Settings → API Keys → Secret keys');
    console.error('   و کلید رو در خط ۲۷ همین فایل جایگزین کن.');
    process.exit(1);
  }

  /* ─── خواندن کدها ─── */
  console.log('📂 در حال خواندن فایل‌های کد...');
  const teacherCodes = readCodes(TEACHER_FILE);
  const studentCodes = readCodes(STUDENT_FILE);

  console.log(`   ✅ ${teacherCodes.length} کد معلم`);
  console.log(`   ✅ ${studentCodes.length} کد دانش‌آموز`);
  console.log('');

  if (teacherCodes.length === 0 && studentCodes.length === 0) {
    console.error('❌ هیچ کدی پیدا نشد!');
    console.error('   فایل‌های teacher-codes.txt و student-codes.txt رو چک کن.');
    console.error('   هر خط باید یه کد ۶ رقمی باشه (مثلاً: 123456)');
    process.exit(1);
  }

  if (teacherCodes.length === 0) {
    console.warn('⚠️ فایل teacher-codes.txt خالیه یا کد معتبر نداره.');
  }
  if (studentCodes.length === 0) {
    console.warn('⚠️ فایل student-codes.txt خالیه یا کد معتبر نداره.');
  }

  const total = teacherCodes.length + studentCodes.length;
  const startTime = Date.now();

  /* ─── آمار ─── */
  let created = 0;
  let existed = 0;
  let failed = 0;
  const failures = [];

  /* ─── ساخت معلم‌ها ─── */
  if (teacherCodes.length > 0) {
    console.log('══════════════════════════════════════════════════');
    console.log('   👨‍🏫 ساخت معلم‌ها');
    console.log('══════════════════════════════════════════════════');
    console.log('');

    for (let i = 0; i < teacherCodes.length; i++) {
      const code = teacherCodes[i];
      const progress = `[${i + 1}/${teacherCodes.length}]`;

      const result = await createUser(code, 'teacher');

      if (result.status === 'created') {
        created++;
        if (LOG_SUCCESS) console.log(`✅ ${progress} ${code}  →  معلم`);
      } else if (result.status === 'exists') {
        existed++;
        if (LOG_SKIP) console.log(`⏭  ${progress} ${code}  →  از قبل هست`);
      } else {
        failed++;
        const errMsg =
          (result.error && result.error.message) ||
          (result.error && result.error.toString()) ||
          'خطای نامشخص';
        failures.push({ code, role: 'teacher', error: errMsg });
        console.log(`❌ ${progress} ${code}  →  ${errMsg}`);
      }

      await sleep(DELAY_MS);
    }

    console.log('');
  }

  /* ─── ساخت دانش‌آموزها ─── */
  if (studentCodes.length > 0) {
    console.log('══════════════════════════════════════════════════');
    console.log('   🎓 ساخت دانش‌آموزها');
    console.log('══════════════════════════════════════════════════');
    console.log('');

    for (let i = 0; i < studentCodes.length; i++) {
      const code = studentCodes[i];
      const progress = `[${i + 1}/${studentCodes.length}]`;

      const result = await createUser(code, 'student');

      if (result.status === 'created') {
        created++;
        if (LOG_SUCCESS) console.log(`✅ ${progress} ${code}  →  دانش‌آموز`);
      } else if (result.status === 'exists') {
        existed++;
        if (LOG_SKIP) console.log(`⏭  ${progress} ${code}  →  از قبل هست`);
      } else {
        failed++;
        const errMsg =
          (result.error && result.error.message) ||
          (result.error && result.error.toString()) ||
          'خطای نامشخص';
        failures.push({ code, role: 'student', error: errMsg });
        console.log(`❌ ${progress} ${code}  →  ${errMsg}`);
      }

      await sleep(DELAY_MS);
    }

    console.log('');
  }

  /* ─── نتیجه نهایی ─── */
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('══════════════════════════════════════════════════');
  console.log('   📊 گزارش نهایی');
  console.log('══════════════════════════════════════════════════');
  console.log('');
  console.log(`   🆕 ساخته‌شده:        ${created}`);
  console.log(`   ⏭  از قبل موجود:     ${existed}`);
  console.log(`   ❌ ناموفق:           ${failed}`);
  console.log(`   📦 کل پردازش‌شده:    ${total}`);
  console.log(`   ⏱  زمان:            ${elapsed} ثانیه`);
  console.log('');

  if (failed === 0) {
    console.log('   🎉 همه‌ی کاربران با موفقیت پردازش شدن!');
    console.log('');
    console.log('   ✅ برو به Supabase → Authentication → Users');
    console.log('      و تعداد کاربران رو چک کن.');
    console.log('');
  } else {
    console.log('   ⚠️ بعضی کاربران ناموفق بودن.');
    console.log('');

    if (failures.length > 0) {
      const failFile = path.join(__dirname, 'failed-users.json');
      fs.writeFileSync(
        failFile,
        JSON.stringify(failures, null, 2),
        'utf-8'
      );
      console.log(`   📄 لیست کامل خطاها: failed-users.json`);
      console.log('');
      console.log('   💡 می‌تونی همین اسکریپت رو دوباره اجرا کنی —');
      console.log('      کاربران موفق دوباره ساخته نمی‌شن.');
      console.log('');
    }
  }

  /* ─── نمونه‌ی اطلاعات ─── */
  if (created > 0 || existed > 0) {
    console.log('   ℹ️  نمونه‌ی فرمت ورود:');
    const sampleCode = teacherCodes[0] || studentCodes[0];
    if (sampleCode) {
      console.log(`      ایمیل:  ${makeEmail(sampleCode)}`);
      console.log(`      پسورد: ${makePassword(sampleCode)}`);
      console.log('');
      console.log('   🔑 کاربر با کد ۶ رقمی خودش وارد می‌شه —');
      console.log('      ایمیل رو نمی‌بینه و وارد نمی‌کنه.');
      console.log('');
    }
  }

  console.log('══════════════════════════════════════════════════');
  console.log('   پایان — طراحی: فاطمه جوادی');
  console.log('══════════════════════════════════════════════════');
  console.log('');
}

/* ============================================================
 * اجرا
 * ============================================================ */

main().catch((err) => {
  console.error('');
  console.error('💥 خطای غیرمنتظره:');
  console.error(err);
  console.error('');
  process.exit(1);
});
