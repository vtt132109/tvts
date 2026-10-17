/**
 * KHOI PHUC DU LIEU FIREBASE.
 *
 * Da xay ra 3 lan danh sach bi mat tren production, deu do cung mot nguyen nhan:
 * may/tab goi CloudSyncManager.pushToCloud() voi localStorage dang rong hoac sai,
 * Firebase PUT de nguyen payload -> ghi de du lieu that.
 *
 * Lan 1: cloud_sync.js gui students: [] (da sua o commit d2169b9)
 * Lan 2: student.js tu sinh 30 danh sach mau roi day len cloud (da sua o 283baa5)
 * Lan 3: probe cua agent seed localStorage bang data/default_students.json
 *         (30 ban ghi mau) roi bam "Gui Dang Ky" -> day 30 nguoi len cloud.
 *
 * Lý do chung: KHONG AI kiem tra payload truoc khi ghi de du lieu da co tren cloud.
 *
 * Cach dung: chay node khoi_phuc_58.js. Script tu kiem tra du lieu truoc khi ghi,
 * tu cho phep khoi phuc cac khoa bi mat, va KHONG bao gio ghi danh sach rong.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BASE = 'https://vtt123-76e07-default-rtdb.firebaseio.com';
const NODE = 'tvts_production_data';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const adminJs = read('js/admin.js');
const schedJs = read('js/scheduler.js');
const csv = read('data/ds-ctv.csv');

// SHIFTS tu scheduler.js
const sStart = schedJs.indexOf('const SHIFTS =');
const sEnd = schedJs.indexOf('];', sStart) + 2;
const SHIFTS = eval(schedJs.slice(sStart, sEnd).replace('const SHIFTS =', ''));

// parseStudentsCsv tu admin.js — dung CHINH ham cua ung dung
const start = adminJs.indexOf('function parseStudentsCsv');
const retIdx = adminJs.indexOf('return candidates;', start);
let depth = 0, end = retIdx;
for (let i = retIdx; i < adminJs.length; i++) {
  if (adminJs[i] === '{') depth++;
  else if (adminJs[i] === '}') { depth--; if (depth < 0) { end = i + 1; break; } }
}
const body = adminJs.slice(start, end);
const fakeState = { importedCandidates: [], students: [] };
const parseStudentsCsv = new Function('SHIFTS', 'state', body + '\nreturn parseStudentsCsv;')(SHIFTS, fakeState);

const students = parseStudentsCsv(csv);

console.log('=== KIEM TRA DU LIEU TRUOC KHI GHI ===');
console.log('  so ho so      :', students.length, '(mong doi 58)');
console.log('  vai tro       :', JSON.stringify(students.reduce((a, s) => {
  const k = s.role || '?'; a[k] = (a[k] || 0) + 1; return a;
}, {})), '(mong doi old=28, new=30)');
console.log('  MSSV trung lap:', students.length - new Set(students.map(s => s.studentId)).size, '(mong doi 0)');
console.log('  thieu ten/MSSV:', students.filter(s => !s.fullName || !s.studentId).length, '(mong doi 0)');

const ids = new Set(students.map(s => s.studentId));
const oldCount = students.filter(s => s.role === 'old').length;
const newCount = students.filter(s => s.role === 'new').length;
const canWrite = students.length === 58 && ids.size === 58 && oldCount === 28 && newCount === 30
  && students.every(s => s.fullName && s.studentId);

// BAO DAM: khong bao gio ghi danh sach rong.
if (!canWrite || students.length === 0) {
  console.log('\nKHONG khop ky vong -> KHONG ghi Firebase. Script dung lai.');
  process.exit(1);
}

(async () => {
  const url = `${BASE}/${NODE}/students.json`;
  console.log('\n=== GHI ===');
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(students),
  });
  console.log('  HTTP', r.status);
  if (!r.ok) {
    console.log('  that bai:', (await r.text()).slice(0, 200));
    process.exit(1);
  }
  const v = await (await fetch(url)).json();
  const list = Array.isArray(v) ? v : [];
  console.log('  doc lai:', list.length, JSON.stringify(list.reduce((a, x) => {
    const k = x.role || '?'; a[k] = (a[k] || 0) + 1; return a;
  }, {})));

  // activeMonth: dat thang hien tai neu thieu.
  const am = await (await fetch(`${BASE}/${NODE}/activeMonth.json`)).json();
  if (!am) {
    await fetch(`${BASE}/${NODE}/activeMonth.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: 10, year: 2026 }),
    });
    console.log('  da dat activeMonth = 10/2026');
  } else {
    console.log('  activeMonth hien tai:', JSON.stringify(am));
  }

  // regConfig: khoi phuc mac dinh neu thieu (dong cung thoi gian mo/ dong cong).
  const rc = await (await fetch(`${BASE}/${NODE}/regConfig.json`)).json();
  if (!rc) {
    await fetch(`${BASE}/${NODE}/regConfig.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'always_open', publishSchedule: true, startTime: '', endTime: '' }),
    });
    console.log('  da dat regConfig = always_open');
  } else {
    console.log('  regConfig hien tai:', JSON.stringify(rc));
  }

  if (list.length === 58) console.log('\n  OK - 58 CTV tren Cloud.');
})();