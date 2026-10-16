/**
 * ============================================================================
 * AUTOMATED TEST SUITE: HỒI QUY CHO CÁC BUG ĐÃ SỬA (REGRESSION GUARD)
 * ============================================================================
 * Bộ test này khóa lại các lỗi nghiêm trọng đã phát hiện & sửa, đảm bảo
 * chúng không tái phát trong các phiên bản sau:
 *
 * 1. Cổng Sinh Viên KHÔNG còn hardcode tháng 10/2026:
 *    - Đọc ACTIVE_MONTH từ localStorage, sinh ngày tháng động bằng
 *      MonthCalendarHelper thay cho mảng config viết tay.
 *    - Khi Admin chuyển sang tháng 11/12/2026 hoặc 01/2027, ngày hiển thị
 *      phải thay đổi theo, không bị kẹt ở tháng 10.
 * 2. showToast() phải escape HTML (chống XSS qua tên/MSSV người dùng nhập).
 * 3. Cloud Sync phải phát 'ts:data-changed' kèm danh sách key (sự kiện
 *    'storage' thuần không mang .key nên các nhánh e.key===... không chạy).
 * 4. Payload lịch tháng không được nhân bản trùng lặp.
 * 5. Không có tham chiếu tới DOM element không tồn tại (dead selector).
 * 6. Không còn mật khẩu/tài khoản thật hardcode trong mã nguồn.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const adminJs = readSrc('js/admin.js');
const studentJs = readSrc('js/student.js');
const schedulerJs = readSrc('js/scheduler.js');
const cloudJs = readSrc('js/cloud_sync.js');
const indexHtml = readSrc('index.html');
const adminHtml = readSrc('admin.html');

let passed = 0;
let total = 0;
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n▶ [GROUP] ${name}`);
}

function runTest(desc, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err) {
    console.log(`  ✗ [FAIL] ${desc}`);
    console.log(`        ${err.message}`);
  }
}

// Mock Storage cho phần kiểm thử runtime
class MockStorage {
  constructor() { this.store = {}; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  REGRESSION GUARD: CHỐNG TÁI PHÁT CỦA CÁC BUG ĐÃ SỬA            ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// -----------------------------------------------------------------------------
group('GROUP 1: Cổng Sinh Viên KHÔNG hardcode tháng');
// -----------------------------------------------------------------------------

runTest('1.1: student.js đọc ACTIVE_MONTH từ localStorage', () => {
  assert.ok(
    studentJs.includes("ACTIVE_MONTH: 'ts_scheduler_active_month_v1'"),
    'student.js phải khai báo ACTIVE_MONTH trong STORAGE_KEYS'
  );
  assert.ok(
    /function getActiveMonth\s*\(/.test(studentJs),
    'student.js phải có hàm getActiveMonth()'
  );
});

runTest('1.2: student.js không còn mảng MONTH_WEEKS_CONFIG viết tay', () => {
  assert.ok(
    !/const\s+MONTH_WEEKS_CONFIG\s*=/.test(studentJs),
    'MONTH_WEEKS_CONFIG hardcode vẫn còn trong student.js'
  );
  assert.ok(
    !/const\s+PREV_MONTH_WEEKS_CONFIG\s*=/.test(studentJs),
    'PREV_MONTH_WEEKS_CONFIG hardcode vẫn còn trong student.js'
  );
});

runTest('1.3: Ngày tháng được sinh động qua MonthCalendarHelper', () => {
  assert.ok(
    /function buildMonthWeeksConfig\s*\(/.test(studentJs),
    'student.js phải có buildMonthWeeksConfig()'
  );
  assert.ok(
    studentJs.includes('getMonthWeeks'),
    'buildMonthWeeksConfig phải dùng helper.getMonthWeeks'
  );
});

runTest('1.4: Không còn chuỗi tháng tĩnh trong mã JS', () => {
  // Ngoại trừ chú thích & giá trị dự phòng hợp lệ (return {month:10, year:2026})
  const code = studentJs
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const offenders = [];
  ['Tháng 10/2026', 'Tháng 09/2026', 'trong Tháng 10/2026'].forEach(s => {
    if (code.includes(s)) offenders.push(s);
  });
  assert.strictEqual(offenders.length, 0,
    `Còn nhãn tháng hardcode trong code: ${offenders.join(', ')}`);
});

runTest('1.5: index.html không hardcode tháng trong nhãn hiển thị', () => {
  assert.ok(
    !indexHtml.includes('Đăng Ký Ca Rảnh Trọn Tháng (Tháng 10/2026)'),
    'Tiêu đề card đăng ký vẫn hardcode tháng 10/2026'
  );
  assert.ok(indexHtml.includes('id="reg-month-title"'), 'Thiếu hook #reg-month-title để JS cập nhật động');
  assert.ok(indexHtml.includes('id="reg-matrix-month-label"'), 'Thiếu hook #reg-matrix-month-label');
  assert.ok(indexHtml.includes('id="btn-month-current"'), 'Thiếu nút chuyển tháng');
  assert.ok(indexHtml.includes('id="btn-month-prev"'), 'Thiếu nút chuyển tháng trước');
});

runTest('1.6: student.js lắng nghe ACTIVE_MONTH để vẽ lại nhãn', () => {
  assert.ok(
    studentJs.includes('syncMonthLabelsUI'),
    'student.js phải có hàm syncMonthLabelsUI()'
  );
  const handler = studentJs.match(/addEventListener\('ts:data-changed'[\s\S]{0,2200}/);
  assert.ok(handler, 'student.js phải lắng nghe sự kiện ts:data-changed');
  assert.ok(
    /ACTIVE_MONTH/.test(handler[0]),
    'Handler ts:data-changed của student.js phải xử lý ACTIVE_MONTH'
  );
});

runTest('1.7: Hàm sinh tuần trả về đúng 4 tuần hành chính', () => {
  const global = {};
  const sandbox = { window: global, module: undefined, document: undefined };
  sandbox.global = global;
  // Chạy month_calendar.js trong sandbox tối giản
  const src = readSrc('js/month_calendar.js');
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', src)(global, undefined);
  const helper = global.MonthCalendarHelper;
  assert.ok(helper, 'MonthCalendarHelper không được export');

  [[10, 2026], [11, 2026], [12, 2026], [1, 2027]].forEach(([m, y]) => {
    const weeks = helper.getMonthWeeks(m, y);
    assert.strictEqual(weeks.length, 4, `Tháng ${m}/${y} phải có đúng 4 tuần`);
    weeks.forEach(w => {
      assert.ok(w.days.T2 && w.days.T3 && w.days.T4 && w.days.T5 && w.days.T6,
        `Tuần ${w.weekNumber} của ${m}/${y} thiếu ngày T2..T6`);
      assert.ok(/^\d{2}\/\d{2}$/.test(w.startDateStr), `startDateStr sai định dạng: ${w.startDateStr}`);
    });
  });
  void sandbox;
});

// -----------------------------------------------------------------------------
group('GROUP 2: Chống XSS trong showToast');
// -----------------------------------------------------------------------------

runTest('2.1: showToast escapeHtml trong cả admin.js và student.js', () => {
  [adminJs, studentJs].forEach((src, i) => {
    const name = i === 0 ? 'admin.js' : 'student.js';
    // Cắt tới hết khối thân hàm (đóng bằng cặp thẻ cân bằng)
    const start = src.indexOf('function showToast');
    assert.ok(start > -1, `Không tìm thấy showToast trong ${name}`);
    let depth = 0, end = -1, started = false;
    for (let k = src.indexOf('{', start); k < src.length; k++) {
      if (src[k] === '{') { depth++; started = true; }
      else if (src[k] === '}') { depth--; if (started && depth === 0) { end = k; break; } }
    }
    assert.ok(end > start, `Không xác định được phạm vi showToast trong ${name}`);
    const body = src.slice(start, end + 1);
    assert.ok(/escapeHtml\s*\(/.test(body),
      `showToast của ${name} phải escapeHtml(message) trước khi gán innerHTML`);
    assert.ok(!/<span>\$\{message\}<\/span>/.test(body),
      `showToast của ${name} vẫn chèn message thô vào innerHTML`);
  });
});

runTest('2.2: escapeHtml chuyển đủ 5 ký tự nguy hiểm', () => {
  const m = adminJs.match(/function escapeHtml\(str\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'Thiếu hàm escapeHtml trong admin.js');
  // eslint-disable-next-line no-eval
  const fn = eval(`(${m[0]})`);
  assert.strictEqual(fn('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(fn('a"b\'c&d'), 'a&quot;b&#039;c&amp;d');
  assert.strictEqual(fn(''), '');
  assert.strictEqual(fn(null), '');
  // Đủ 5 phép thay thế
  ['&amp;', '&lt;', '&gt;', '&quot;', '&#039;'].forEach(entity => {
    assert.ok(m[0].includes(entity), `escapeHtml thiếu entity ${entity}`);
  });
});

runTest('2.3: Không còn escapeHtml kép trong call site showToast', () => {
  const bad = [];
  [adminJs, studentJs].forEach((src, i) => {
    const name = i === 0 ? 'admin.js' : 'student.js';
    const re = /showToast\(\s*`[^`]*\n?[^`]*escapeHtml\(/g;
    let m;
    while ((m = re.exec(src)) !== null) bad.push(`${name}: ${m[0].slice(0, 60)}`);
  });
  assert.strictEqual(bad.length, 0,
    `showToast đã escape bên trong, không cần escapeHtml ở call site:\n${bad.join('\n')}`);
});

// -----------------------------------------------------------------------------
group('GROUP 3: Cloud Sync phát sự kiện có keys');
// -----------------------------------------------------------------------------

runTest('3.1: applyPayload phát CustomEvent ts:data-changed kèm keys', () => {
  assert.ok(
    /CustomEvent\(\s*'ts:data-changed'/.test(cloudJs),
    'cloud_sync.js phải phát CustomEvent ts:data-changed'
  );
  const m = cloudJs.match(/ts:data-changed'[\s\S]{0,120}/);
  assert.ok(m && /detail:\s*\{\s*keys/.test(m[0]),
    'Sự kiện ts:data-changed phải có detail.keys');
});

runTest('3.2: KHÔNG phát Event("storage") thuần nữa', () => {
  assert.ok(
    !/dispatchEvent\(\s*new Event\('storage'\)\s*\)/.test(cloudJs),
    'Event("storage") thuần không có .key — nhánh e.key===... sẽ không bao giờ chạy'
  );
});

runTest('3.3: admin.js lắng nghe ts:data-changed', () => {
  assert.ok(
    adminJs.includes("addEventListener('ts:data-changed'"),
    'admin.js phải lắng nghe ts:data-changed'
  );
  assert.ok(
    studentJs.includes("addEventListener('ts:data-changed'"),
    'student.js phải lắng nghe ts:data-changed'
  );
});

runTest('3.4: safeSetItem bắt QuotaExceededError', () => {
  assert.ok(/function safeSetItem\s*\(/.test(cloudJs), 'Thiếu hàm safeSetItem');
  const m = cloudJs.match(/function safeSetItem[\s\S]{0,900}?\n  \}/);
  assert.ok(m && /QuotaExceededError/.test(m[0]),
    'safeSetItem phải nhận diện QuotaExceededError');
  assert.ok(/ts:storage-full/.test(cloudJs), 'Phải phát sự kiện ts:storage-full khi đầy bộ nhớ');
});

runTest('3.5: pullFromCloud phát hiện xung đột dữ liệu', () => {
  const m = cloudJs.match(/async function pullFromCloud[\s\S]{0,3000}?\n  \}/);
  assert.ok(m, 'Không tìm thấy pullFromCloud');
  assert.ok(/lastCloudUpdatedAt/.test(cloudJs), 'Phải lưu mốc lastCloudUpdatedAt');
  assert.ok(/conflict/.test(m[0]), 'pullFromCloud phải xử lý trường hợp xung đột');
  assert.ok(/localUpdatedAt/.test(cloudJs), 'Phải đánh dấu localUpdatedAt khi có thay đổi cục bộ');
});

// -----------------------------------------------------------------------------
group('GROUP 4: Payload lịch gọn & không nhân bản');
// -----------------------------------------------------------------------------

runTest('4.1: monthSchedule nhỏ hơn đáng kể sau khi tối ưu', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', readSrc('js/scheduler.js'))(global, { exports: {} });
  const S = global.SchedulerEngine;

  const students = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`,
    studentId: `2${100000 + i}`,
    role: i % 2 === 0 ? 'old' : 'new',
    availableShifts: S.SHIFTS.map(x => x.id)
  }));

  const res = S.runMonthSchedule(students, 2026, 10);
  const json = JSON.stringify(res);
  const kb = json.length / 1024;

  assert.ok(kb < 160,
    `Payload ${kb.toFixed(1)}KB vẫn quá lớn (kỳ vọng < 160KB sau khi bỏ alias week1..4)`);
});

runTest('4.2: week1..week4 là alias non-enumerable (không bị serialize 2 lần)', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', readSrc('js/scheduler.js'))(global, { exports: {} });
  const S = global.SchedulerEngine;

  const students = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`, studentId: `2${i}`, role: i % 2 === 0 ? 'old' : 'new',
    availableShifts: S.SHIFTS.map(x => x.id)
  }));
  const res = S.runMonthSchedule(students, 2026, 10);

  // Vẫn truy cập được theo kiểu cũ (tương thích ngược)
  assert.ok(res.week1, 'res.week1 phải tồn tại để tương thích mã cũ');
  assert.strictEqual(res.week1, res.weeks[0], 'week1 phải trỏ cùng object với weeks[0]');

  // Nhưng KHÔNG xuất hiện trong JSON
  const json = JSON.stringify(res);
  assert.ok(!/"week1"/.test(json), 'week1 không được serialize vào JSON');
  assert.ok(/"weeks"/.test(json), 'weeks vẫn phải được serialize');
});

runTest('4.3: studentStats/combinedStats không nhân bản hồ sơ sinh viên', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', readSrc('js/scheduler.js'))(global, { exports: {} });
  const S = global.SchedulerEngine;

  const students = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`, studentId: `2${i}`, role: i % 2 === 0 ? 'old' : 'new',
    availableShifts: S.SHIFTS.map(x => x.id), phone: '0900000000'
  }));
  const res = S.runMonthSchedule(students, 2026, 10);
  const stat = res.weeks[0].studentStats[students[0].id];
  assert.ok(stat, 'studentStats phải tồn tại');
  assert.ok(!stat.student, 'studentStats KHÔNG được nhân bản object sinh viên');
  assert.strictEqual(stat.studentId, students[0].id, 'phải giữ studentId để tra cứu');
  assert.ok(stat.assignedCount !== undefined, 'phải giữ assignedCount');
});

runTest('4.4: Không phá vỡ bảo toàn tính toàn vẹn của ca trực', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', readSrc('js/scheduler.js'))(global, { exports: {} });
  const S = global.SchedulerEngine;

  const students = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, studentId: `2${i}`, role: i % 2 === 0 ? 'old' : 'new',
    availableShifts: S.SHIFTS.map(x => x.id)
  }));
  const res = S.runMonthSchedule(students, 2026, 10);

  res.weeks.forEach((w, wi) => {
    assert.strictEqual(w.summary.emptyShifts, 0, `Tuần ${wi + 1} phải lấp đầy`);
    assert.strictEqual(w.summary.fullShifts, 10, `Tuần ${wi + 1} phải đủ 10 ca 1 Cũ + 1 Mới`);
    // Không ai trùng 2 ca cùng 1 ngày
    const perStudent = {};
    Object.values(w.scheduleTable).forEach(slot => {
      [slot.oldMember, slot.newMember].forEach(m => {
        if (!m) return;
        (perStudent[m.id] = perStudent[m.id] || []).push(slot.shiftInfo.dayKey);
      });
    });
    Object.entries(perStudent).forEach(([sid, days]) => {
      assert.ok(new Set(days).size === days.length,
        `${sid} bị trùng ca cùng 1 ngày trong tuần ${wi + 1}`);
    });
  });

  const totals = Object.values(res.combinedStats).map(c => c.totalCount);
  assert.strictEqual(Math.min(...totals) > 0, true, 'Không ai bị đói ca (0 công trong tháng)');
});

// -----------------------------------------------------------------------------
group('GROUP 5: Không còn dead selector');
// -----------------------------------------------------------------------------

runTest('5.1: Mọi getElementById trong JS đều có trong HTML hoặc tạo động', () => {
  const htmlIds = new Set();
  [indexHtml, adminHtml].forEach(h => {
    for (const m of h.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) htmlIds.add(m[1]);
  });
  const dynamic = new Set();
  [adminJs, studentJs, readSrc('js/sample30.js')].forEach(src => {
    for (const m of src.matchAll(/\bid\s*=\s*["'`]([^"'`$]+)["'`]/g)) dynamic.add(m[1]);
  });

  [[studentJs, 'student.js'], [adminJs, 'admin.js']].forEach(([src, name]) => {
    const refs = new Set([...src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
    const dead = [...refs].filter(id => !htmlIds.has(id) && !dynamic.has(id));
    assert.strictEqual(dead.length, 0,
      `${name} tham chiếu ${dead.length} ID không tồn tại: ${dead.join(', ')}`);
  });
});

runTest('5.2: Không còn .substr() (API deprecated)', () => {
  [adminJs, studentJs, schedulerJs, cloudJs].forEach((src, i) => {
    const names = ['admin.js', 'student.js', 'scheduler.js', 'cloud_sync.js'];
    assert.ok(!/\.substr\(/.test(src), `${names[i]} vẫn dùng .substr()`);
  });
});

runTest('5.3: Không còn định nghĩa trùng window.* (last-write-wins che lỗi)', () => {
  [[adminJs, 'admin.js'], [studentJs, 'student.js']].forEach(([src, name]) => {
    const counts = {};
    for (const m of src.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=/gm)) {
      counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    const dups = Object.entries(counts).filter(([, c]) => c > 1);
    assert.strictEqual(dups.length, 0,
      `${name} định nghĩa trùng window.*: ${dups.map(([k, c]) => `${k} x${c}`).join(', ')}`);
  });
});

// -----------------------------------------------------------------------------
group('GROUP 6: Bảo mật — không hardcode bí mật trong mã nguồn');
// -----------------------------------------------------------------------------

runTest('6.1: Không còn tài khoản/mật khẩu thật trong mã nguồn', () => {
  const all = [adminJs, studentJs, schedulerJs, cloudJs, readSrc('data/admin_accounts.json')].join('\n');
  ['Thien3056', '3056', 'usr_1792146825856', 'Phạm Minh Thiện'].forEach(secret => {
    assert.ok(!all.includes(secret),
      `Tìm thấy thông tin tài khoản thật "${secret}" trong mã nguồn công khai`);
  });
});

runTest('6.2: Có cảnh báo bắt buộc đổi mật khẩu mặc định', () => {
  assert.ok(/WEAK_DEFAULT_PASSWORDS/.test(adminJs), 'Thiếu danh sách mật khẩu yếu');
  assert.ok(/function warnIfWeakCredentials\s*\(/.test(adminJs), 'Thiếu hàm cảnh báo mật khẩu yếu');
  assert.ok(adminJs.includes('pulse-security-warning'), 'Chưa áp dụng class cảnh báo');
  assert.ok(readSrc('css/style.css').includes('securityWarningPulse'),
    'Thiếu CSS animation cảnh báo bảo mật');
});

runTest('6.3: .gitignore chặn file chứa PII', () => {
  const gi = readSrc('.gitignore');
  ['*.csv', '*.xlsx', '*.xls'].forEach(pattern => {
    assert.ok(gi.includes(pattern), `.gitignore thiếu ${pattern}`);
  });
});

runTest('6.4: File PII không còn được git track', () => {
  let tracked = [];
  try {
    tracked = require('child_process')
      .execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(f => /\.(csv|xlsx|xls)$/i.test(f));
  } catch (e) {
    return; // Không có git (VD: CI artifact) -> bỏ qua
  }
  assert.strictEqual(tracked.length, 0,
    `Còn file PII được track trong git: ${tracked.join(', ')}`);
});

// -----------------------------------------------------------------------------
group('GROUP 7: UI Sự Kiện không bị chết âm thầm');
// -----------------------------------------------------------------------------

runTest('7.1: admin.html có tab + bảng quản lý Sự Kiện', () => {
  assert.ok(adminHtml.includes('id="btn-tab-events"'), 'Thiếu nút tab Sự Kiện');
  assert.ok(adminHtml.includes('id="tab-event-mgmt"'), 'Thiếu nội dung tab Sự Kiện');
  assert.ok(adminHtml.includes('id="events-table-body"'), 'Thiếu tbody bảng Sự Kiện');
  assert.ok(adminHtml.includes('id="badge-events-count"'), 'Thiếu badge đếm sự kiện');
});

runTest('7.2: renderEventsTable được gọi khi mở tab Sự Kiện', () => {
  const m = adminJs.match(/function switchTab[\s\S]{0,800}?\n  \}/);
  assert.ok(m, 'Không tìm thấy switchTab');
  assert.ok(/tab-event-mgmt/.test(m[0]) && /renderEventsTable/.test(m[0]),
    'switchTab phải render bảng Sự Kiện khi mở tab');
});

runTest('7.3: Modal Sự Kiện dùng modal-event-form (tự tạo, không phụ thuộc HTML)', () => {
  assert.ok(adminJs.includes("document.getElementById('modal-event-form')"),
    'handleOpenAddEventModal phải tự tạo modal-event-form');
  assert.ok(
    !/getElementById\('modal-add-event'\)/.test(adminJs),
    'Không được tham chiếu modal-add-event (không tồn tại trong HTML)'
  );
});

runTest('7.4: window.* được gọi từ HTML đều đã định nghĩa', () => {
  // Gộp định nghĩa từ TẤT CẢ file JS (admin + student)
  const defined = new Set([
    ...adminJs.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g),
    ...studentJs.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)
  ].map(m => m[1]));

  const used = new Set([
    ...adminHtml.matchAll(/window\.([A-Za-z_$][\w$]*)/g),
    ...indexHtml.matchAll(/window\.([A-Za-z_$][\w$]*)/g)
  ].map(m => m[1]));

  const allow = new Set([
    'open', 'print', 'location', 'confirm', 'alert', 'scrollTo', 'matchMedia',
    'addEventListener', 'setTimeout', 'clearTimeout', 'document', 'localStorage',
    'sessionStorage', 'Date', 'Math', 'JSON', 'console', 'parseInt', 'parseFloat'
  ]);
  const missing = [...used].filter(n => !defined.has(n) && !allow.has(n));
  assert.strictEqual(missing.length, 0,
    `HTML gọi window.${missing.join(', window.')} nhưng không có định nghĩa`);
});

// -----------------------------------------------------------------------------
group('GROUP 8: Scheduler cảnh báo dữ liệu bất thường');
// -----------------------------------------------------------------------------

runTest('8.1: Role không hợp lệ phải được cảnh báo, không âm thầm đổi', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', schedulerJs)(global, { exports: {} });
  const S = global.SchedulerEngine;

  const bad = [
    { id: 'a', fullName: 'A', role: 'OLD', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'b', fullName: 'B', role: 'tas', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'c', fullName: 'C', role: undefined, availableShifts: S.SHIFTS.map(x => x.id) }
  ];
  const res = S.runMonthSchedule(bad, 2026, 10);
  const joined = res.warnings.join(' | ');
  assert.ok(/không hợp lệ/i.test(joined),
    `Phải cảnh báo role không hợp lệ. Warnings thực tế: ${joined}`);
  assert.ok(/"OLD"/.test(joined), 'Cảnh báo phải nêu rõ giá trị sai');
});

runTest('8.2: Role hợp lệ thì KHÔNG sinh cảnh báo', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', schedulerJs)(global, { exports: {} });
  const S = global.SchedulerEngine;

  const ok = [
    { id: 'a', fullName: 'A', role: 'old', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'b', fullName: 'B', role: 'new', availableShifts: S.SHIFTS.map(x => x.id) }
  ];
  const res = S.runMonthSchedule(ok, 2026, 10);
  assert.ok(!/không hợp lệ/i.test(res.warnings.join(' | ')),
    'Dữ liệu hợp lệ không được sinh cảnh báo');
});

runTest('8.3: Mã định danh trùng được ghi nhận cảnh báo', () => {
  const global = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', schedulerJs)(global, { exports: {} });
  const S = global.SchedulerEngine;

  const dup = [
    { id: 'x', fullName: 'X', role: 'old', availableShifts: ['T2_S'] },
    { id: 'x', fullName: 'X2', role: 'new', availableShifts: ['T2_C'] }
  ];
  const res = S.runMonthSchedule(dup, 2026, 10);
  assert.ok(/trùng/i.test(res.warnings.join(' | ')),
    'Phải cảnh báo mã định danh trùng');
});

// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN (${Math.round(passed / (total || 1) * 100)}%)`);
console.log('================================================================\n');

if (passed === total) {
  console.log('🎉 TẤT CẢ BỘ KIỂM THỬ HỒI QUY ĐỀU ĐẠT CHUẨN!');
  process.exit(0);
} else {
  console.error(`⚠️ CÓ ${total - passed} TEST THẤT BẠI - ĐÃ CÓ HỒI QUY TRONG MÃ NGUỒN!`);
  process.exit(1);
}