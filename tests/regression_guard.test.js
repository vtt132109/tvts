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
// CHUẨN HOÁ line ending về \n.
// File nguồn trong repo dùng CRLF (Windows), nên regex có dạng `;\n  }` sẽ
// KHÔNG khớp vì thực tế là `;\r\n  }`. Đây là nguyên nhân khiến nhiều test
// "không tìm thấy hàm" một cách rất khó chẩn đoán.
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const adminJs = readSrc('js/admin.js');
const studentJs = readSrc('js/student.js');
const schedulerJs = readSrc('js/scheduler.js');
const cloudJs = readSrc('js/cloud_sync.js');
const indexHtml = readSrc('index.html');
const adminHtml = readSrc('admin.html');

const monthCalendarJs = readSrc('js/month_calendar.js');

/**
 * Nạp SchedulerEngine vào sandbox.
 *
 * PHẢI nạp js/month_calendar.js TRƯỚC js/scheduler.js, đúng như index.html và
 * admin.html làm: scheduler.js lấy MonthCalendarHelper từ window, và ném lỗi
 * nếu chưa có. Trước đây test nạp scheduler.js đứng một mình nên không bắt
 * được lỗi phân kỳ giữa hai bản — đó là lý do bug năm 2194 lọt qua test.
 */
const loadScheduler = (global) => {
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', monthCalendarJs)(global, undefined);
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', schedulerJs)(global, { exports: {} });
  return global.SchedulerEngine;
};

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

runTest('3.6: KHÔNG còn dispatchEvent(new Event("storage")) — sự kiện này vô dụng', () => {
  // Event("storage") thuần không có .key/.oldValue, nên mọi listener
  // dạng `if (e.key === SOME_KEY)` đều không bao giờ chạy. Trước đây có
  // 6 chỗ phát sự kiện này nhưng KHÔNG chỗ nào thực sự nhận được thông báo.
  [[adminJs, 'admin.js'], [studentJs, 'student.js']].forEach(([src, name]) => {
    assert.ok(!/new Event\(['"]storage['"]\)/.test(src),
      `${name} vẫn phát Event("storage") vốn không mang .key nên listener không chạy`);
    assert.ok(!/dispatchEvent\(\s*new Event\(\)/.test(src),
      `${name} có Event() không tham số — không xác định được loại sự kiện`);
  });

  // Mọi lần phát thay thế phải kèm danh sách key để lọc được
  const dispatches = [...adminJs.matchAll(/dispatchEvent\(new CustomEvent\('ts:data-changed',\s*\{\s*detail:\s*\{\s*keys:/g)];
  assert.ok(dispatches.length >= 5,
    `Chỉ tìm thấy ${dispatches.length} lần phát ts:data-changed kèm keys — có thể còn chỗ dùng sai cách`);
});

runTest('3.7: handleStartNewMonth phải reset state, không chỉ xoá storage', () => {
  // Bug thật: xoá storage nhưng không cập nhật state.currentSchedule /
  // state.twoWeekSchedule. renderTimetable() và renderStudentTable() đọc
  // 2 biến đó, nên bảng VẪN HIỆN LỊCH CŨ dù dữ liệu trên đĩa đã xoá —
  // và lần saveSchedule() kế tiếp sẽ ghi đè lịch mới bằng lịch cũ.
  const fn = adminJs.match(/function handleStartNewMonth\(\) \{[\s\S]*?\n  \}/);
  assert.ok(fn, 'Không tìm thấy handleStartNewMonth');
  assert.ok(/state\.currentSchedule\s*=/.test(fn[0]),
    'handleStartNewMonth phải cập nhật state.currentSchedule');
  assert.ok(/state\.twoWeekSchedule\s*=/.test(fn[0]),
    'handleStartNewMonth phải cập nhật state.twoWeekSchedule');
});

runTest('3.8: Sao lưu JSON phải chứa events + activeMonth + allMonths', () => {
  // handleConfirmRestore ĐỌC 3 key này nhưng handleExportBackupJson KHÔNG
  // BAO GIỜ XUẤT chúng -> khôi phục "100%" mà mất sạch sự kiện (kéo theo
  // mất eventWorkUnits trong bảng chấm công) và hiển thị lịch khôi phục
  // dưới sai nhãn tháng.
  const exp = adminJs.match(/function handleExportBackupJson\([\s\S]*?const jsonString/);
  assert.ok(exp, 'Không tìm thấy handleExportBackupJson');
  ['events:', 'activeMonth:', 'allMonths:'].forEach(key => {
    assert.ok(new RegExp(`\\b${key.replace(':', '')}\\s*:`).test(exp[0]),
      `Bản sao lưu JSON thiếu "${key}" — dữ liệu sẽ mất khi khôi phục`);
  });
});

runTest('3.9: handleConfirmRestore phải khôi phục đủ state + dùng ts:data-changed', () => {
  const fn = adminJs.match(/function handleConfirmRestore\(\) \{[\s\S]*?\n  \}/);
  assert.ok(fn, 'Không tìm thấy handleConfirmRestore');
  assert.ok(/state\.currentSchedule\s*=/.test(fn[0]),
    'Restore phải tính lại state.currentSchedule, nếu không bảng vẫn hiện dữ liệu CŨ dù đã "khôi phục 100%"');
  assert.ok(/Array\.isArray\(pendingRestoreData\.events\)/.test(fn[0]),
    'Restore phải nạp lại danh sách sự kiện');
  assert.ok(/pendingRestoreData\.activeMonth/.test(fn[0]),
    'Restore phải nạp lại kỳ đang áp dụng, nếu không lịch sẽ hiện sai tháng');
  assert.ok(/!/.test(fn[0]) && /ts:data-changed/.test(fn[0]),
    'Restore phải phát ts:data-changed để cổng sinh viên cập nhật');
});

runTest('3.10: runFullSchedule() KHÔNG được xoá phân công đã chỉnh tay', () => {
  // Bug thật: mọi thao tác gọi runFullSchedule() (đổi vai trò hàng loạt,
  // nhập CSV, thêm/xoá SV, duyệt đổi ca) đều dựng lại lịch từ đầu, khiến
  // mọi đổi nhân sự tay đã được phê duyệt biến mất không một dòng cảnh báo.
  assert.ok(/MANUAL_SLOTS:\s*'/.test(adminJs),
    'Thiếu khoá lưu các ô ca đã chỉnh tay');
  assert.ok(/function recordManualSlot\s*\(/.test(adminJs), 'Thiếu hàm ghi ô ca chỉnh tay');
  assert.ok(/function reapplyManualSlots\s*\(/.test(adminJs), 'Thiếu hàm áp lại ô ca chỉnh tay');

  const rs = adminJs.match(/function runFullSchedule\(\) \{[\s\S]*?\n  \}/);
  assert.ok(rs, 'Không tìm thấy runFullSchedule');
  assert.ok(/reapplyManualSlots\s*\(/.test(rs[0]),
    'runFullSchedule phải gọi reapplyManualSlots sau khi xếp tự động, nếu không mọi chỉnh sửa tay sẽ mất');

  // Cả 2 đường chỉnh tay đều phải ghi nhận
  const manual = adminJs.match(/function saveManualReassignment\(\) \{[\s\S]*?\n  \}/);
  assert.ok(manual && /recordManualSlot\s*\(/.test(manual[0]),
    'saveManualReassignment phải ghi nhận ô đã chỉnh');
  const approve = adminJs.match(/function handleApproveSwap\([^)]*\) \{[\s\S]*?\n  \}/);
  assert.ok(approve && /recordManualSlot\s*\(/.test(approve[0]),
    'handleApproveSwap phải ghi nhận ô đã chỉnh');
});

runTest('3.11: Ô chỉnh tay được kiểm tra lại khi áp dụng lại (không tạo lịch sai)', () => {
  // Nếu áp lại mù quáng, CTV đã bị xoá hoặc không còn rảnh ca sẽ bị gán
  // vào lịch -> lịch không hợp lệ lại quay về.
  const fn = adminJs.match(/function reapplyManualSlots\(monthSchedule\) \{[\s\S]*?\n  return result;\n\}/);
  assert.ok(fn, 'Không tìm thấy reapplyManualSlots');
  const body = fn[0];
  assert.ok(/không còn trong danh sách/.test(body),
    'Phải bỏ qua ô tham chiếu CTV không còn tồn tại');
  assert.ok(/không còn rảnh ca này/.test(body),
    'Phải bỏ qua ô tham chiếu ca CTV không còn rảnh');
  assert.ok(/role !== 'old'/.test(body) && /role !== 'new'/.test(body),
    'Phải bỏ qua ô gán sai vai trò (Chính Thức / Tập Sự)');
  assert.ok(/oldM\.id === newM\.id/.test(body),
    'Phải chặn gán cùng một người cho cả hai vị trí trong một ca');
  assert.ok(/result\.skipped\.push/.test(body) && /showToast/.test(adminJs),
    'Ô bị bỏ qua phải được báo cho người dùng, không im lặng');
});

runTest('3.12: Bảng chấm công phải LỌC sự kiện theo đúng kỳ đang xem', () => {
  // calculateMonthlyPayroll hỗ trợ tham số monthKey để chỉ tính công sự
  // kiện trong tháng. Trước đây cả 3 call site đều KHÔNG truyền ->
  // công của mọi tháng cộng chung vào bảng "Tháng X/YYYY" đang xem, tổng
  // công bị thổi phồng theo thời gian.
  const calls = [...adminJs.matchAll(/calculateMonthlyPayroll\(/g)];
  const bareCalls = [...adminJs.matchAll(/calculateMonthlyPayroll\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)/g)];
  assert.strictEqual(bareCalls.length, 0,
    `Còn ${bareCalls.length} chỗ gọi calculateMonthlyPayroll không truyền monthKey — sẽ cộng công mọi tháng vào kỳ đang xem`);

  // Bản sao lưu phải mang monthKey để xem lại được đúng kỳ
  const exp = adminJs.match(/function createWebBackup\([\s\S]*?const backupPayload = \{[\s\S]*?\};/);
  assert.ok(exp, 'Không tìm thấy backupPayload trong createWebBackup');
  assert.ok(/\bmonthKey\b/.test(exp[0]),
    'Bản sao lưu phải lưu monthKey để lọc công sự kiện đúng kỳ khi xem lại');
});

runTest('3.13: handleStartNewMonth / restore KHÔNG được nuốt lỗi localStorage', () => {
  // catch (e) {} khiến QuotaExceededError biến mất: người dùng thấy
  // "Đã chuyển sang Tháng X" trong khi lịch tháng cũ đã mất vĩnh viễn.
  const rs = adminJs.match(/async function switchAdminMonth\([\s\S]*?\n  \}/);
  assert.ok(rs, 'Không tìm thấy switchAdminMonth');

  // PHẢI bỏ comment trước khi quét — nếu không, dòng comment giải thích
  // "trước đây catch (e) {}" sẽ bị đếm nhầm là code còn sót.
  const codeOnly = rs[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

  const silent = [...codeOnly.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g)];
  assert.strictEqual(silent.length, 0,
    `switchAdminMonth còn ${silent.length} catch rỗng nuốt lỗi (ghi kho lịch tháng)`);
  assert.ok(/showToast/.test(codeOnly) && /trimMonthArchive/.test(codeOnly),
    'Phải cảnh báo người dùng khi không lưu được kho lịch, và có cắt bớt để tránh vượt quota');
  assert.ok(/const MAX_MONTH_ARCHIVE = \d+/.test(adminJs),
    'Phải có giới hạn số tháng lưu trong kho lịch');
});

runTest('3.15: Nhập CSV phải tìm cột VAI TRÒ theo nội dung khi tiêu đề rỗng', () => {
  // File CSV thật của Ban có dạng: STT,Họ và tên,MSSV,Email,
  // — cột thứ 5 KHÔNG có tên tiêu đề, chỉ chứa giá trị "CTV cũ"/"CTV mới".
  // Trước đây khi không tìm thấy cột vai trò theo tiêu đề, code đoán cứng
  // là index 3 — cột đó là EMAIL. Đo thật trên file này: 58/58 người bị
  // nhận thành Tập Sự, 0 Chính Thức, nên luật 1 Cũ + 1 Mới không xếp được.
  assert.ok(!/colIdx\.role\s*=\s*3/.test(adminJs),
    'Không được đoán cứng cột vai trò là index 3 — phải dò theo nội dung');
  assert.ok(/laVaiTro/.test(adminJs) || /laVaiTro\s*\(/.test(adminJs),
    'Phải có hàm nhận diện giá trị vai trò để dò cột');
  assert.ok(/colIdx\.role = -1/.test(adminJs),
    'Thiếu cột vai trò phải để -1 để dò, không lấp cứng theo vị trí');
});

runTest('3.16: Nhập CSV KHÔNG được nhận nhầm chuỗi chứa "cu" là Chính Thức', () => {
  // PHẢI bỏ comment trước khi quét — dòng comment giải thích bug cũ cũng
  // chứa đúng chuỗi đang tìm, sẽ khớp nhầm (giống lỗi ở test 3.13).
  const codeOnly = adminJs
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

  // Trước đây roleRaw.includes('cu') khớp trúng bất kỳ giá trị nào có
  // chuỗi "cu": email "nguyencuong@..." hay tên "Đặng Thị Cúc" đều bị
  // nhận thành Chính Thức.
  assert.ok(!/includes\(\s*'cu'\s*\)/.test(codeOnly),
    "Không được dùng includes('cu') để nhận vai trò — sẽ khớp trúng email/tên chứa 'cu'");
  assert.ok(/test\(roleText\)/.test(codeOnly),
    'Phải so khớp cả giá trị (^...$) thay vì khớp chuỗi con');
});

runTest('3.14: saveManualReassignment phải kiểm tra ca rảnh + vai trò + trùng ngày', () => {
  const fn = adminJs.match(/function saveManualReassignment\(\) \{[\s\S]*?\n  \}/);
  assert.ok(fn, 'Không tìm thấy saveManualReassignment');
  const body = fn[0];
  assert.ok(/KHÔNG đăng ký rảnh ca/.test(body),
    'Phải chặn gán ca ngoài ca SV đã đăng ký rảnh');
  assert.ok(/role !== 'old'/.test(body) && /role !== 'new'/.test(body),
    'Phải chặn gán sai vai trò');
  assert.ok(/cùng ngày/.test(body), 'Phải chặn trùng ca trong cùng ngày');
  assert.ok(/recomputeWeekStats/.test(body),
    'Phải tính lại summary/combinedStats — nếu không số "X/40 ca" và thanh công bằng bị sai');
});

runTest('3.5: pullFromCloud phát hiện xung đột dữ liệu', () => {
  // Không giới hạn cứng độ dài: pullFromCloud đã dài hơn 3000 ký tự sau khi
  // thêm kiểm tra body {"error":...}, giới hạn cứng khiến regex không khớp.
  const m = cloudJs.match(/async function pullFromCloud[\s\S]*?\n  \}/);
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
  loadScheduler(global);
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
  loadScheduler(global);
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
  loadScheduler(global);
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
  loadScheduler(global);
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
  [adminJs, studentJs, readSrc('js/roster.js')].forEach(src => {
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

runTest('6.1: Chỉ chứa tài khoản mặc định, không tài khoản thật', () => {
  // LƯU Ý QUAN TRỌNG: file test này được deploy công khai cùng cả repo.
  // TUYỆT ĐỐI KHÔNG ghi bí mật đã biết vào đây — làm vậy sẽ RÒ LẠI đúng
  // thứ cần xóa. Thay vào đó kiểm tra CẤU TRÚC dữ liệu.
  const ALLOWED_USERNAMES = ['admin', 'diephoi'];
  const DEFAULT_WEAK_PW = ['123', '1234', '12345', '123456', '0000', 'admin', 'password'];
  const DEFAULT_PINS = ['9999', '8888', '1234', '0000', '1111', '7777'];

  const sources = [adminJs, studentJs, schedulerJs, cloudJs];
  try { sources.push(readSrc('data/admin_accounts.json')); } catch (e) { /* đã xóa */ }
  const all = sources.join('\n');

  // 1) username khai báo phải nằm trong allowlist mặc định
  const users = [...new Set([...all.matchAll(/username:\s*'([^']+)'/g)].map(m => m[1]))];
  const odd = users.filter(u => !ALLOWED_USERNAMES.includes(u));
  assert.strictEqual(odd.length, 0,
    `Tài khoản ngoài danh sách mặc định được phép: ${odd.join(', ')}`);

  // 2) mọi mật khẩu phải là nhóm mặc định yếu (không phải MK thật bị hardcode)
  const pws = [...all.matchAll(/password:\s*'([^']*)'/g)].map(m => m[1]).filter(Boolean);
  const realPw = pws.filter(p => !DEFAULT_WEAK_PW.includes(p));
  assert.strictEqual(realPw.length, 0,
    `Có ${realPw.length} mật khẩu không thuộc nhóm mặc định (nghi vấn MK thật)`);

  // 3) PIN phải thuộc nhóm PIN mặc định
  const pins = [...all.matchAll(/pin:\s*'(\d{4,})'/g)].map(m => m[1]);
  const realPin = pins.filter(p => !DEFAULT_PINS.includes(p));
  assert.strictEqual(realPin.length, 0,
    `Có ${realPin.length} PIN không thuộc nhóm mặc định (nghi vấn PIN thật)`);

  // 4) không có id tài khoản sinh từ Date.now() (dấu hiệu account thật từng thêm)
  assert.ok(!/usr_\d{10,}/.test(all),
    'Phát hiện id dạng usr_<timestamp> — dấu hiệu tài khoản thật từng được hardcode');
});

runTest('6.1b: fullName của tài khoản là CHỨC DANH, không phải tên cá nhân', () => {
  // fullName hợp lệ phải là CHỨC DANH ("Trưởng Ban", "Cán Bộ", "Điều phối"...)
  // Chỉ soi CÁC KHỐI KHAI BÁO TÀI KHOẢN QUẢN TRỊ, không soi danh sách
  // sinh viên mẫu (đó là dữ liệu giả lập hợp lệ, không phải rò rỉ tài khoản).
  const blocks = [
    adminJs.match(/const DEFAULT_ADMIN_USERS\s*=\s*\[[\s\S]*?\];/),
    cloudJs.match(/const FALLBACK_ADMIN_USERS\s*=\s*\[[\s\S]*?\];/),
    // data/admin_accounts.json đã bị xoá: không mã nào đọc, và nó chứa
    // thông tin tài khoản trong khi trước đây bị deploy công khai.
    (() => { try { return readSrc('data/admin_accounts.json'); } catch (e) { return null; } })()
  ].filter(Boolean).map(m => m[0]);

  assert.ok(blocks.length > 0, 'Không tìm thấy khối tài khoản nào để kiểm tra');

  const names = blocks.flatMap(b => [...b.matchAll(/fullName"?\s*:\s*["']([^"']+)["']/g)].map(m => m[1]));
  assert.ok(names.length > 0, 'Không tìm thấy fullName nào trong khối tài khoản');

  const ROLE_WORDS = ['Trưởng', 'Cán', 'Điều', 'Ban', 'Phó', 'Chủ', 'Giám', 'Cộng', 'Tác', 'Viên', 'Tuyển', 'Sinh', 'Khoa'];
  const suspicious = names.filter(n =>
    n.split(/\s+/).length >= 2 && !ROLE_WORDS.some(w => n.includes(w))
  );
  assert.strictEqual(suspicious.length, 0,
    `fullName trong khối tài khoản trông như tên cá nhân thay vì chức danh: ${suspicious.join(', ')}`);
});

runTest('6.5: CSS không tham chiếu @keyframes chưa định nghĩa', () => {
  const css = readSrc('css/style.css');
  const defined = new Set(
    [...css.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map(m => m[1])
  );
  const used = new Set();
  // animation: <name> ... (bỏ qua các từ khoá không phải tên keyframes)
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) {
    m[1].split(',').forEach(part => {
      part.trim().split(/\s+/)
        .filter(t => t && !/^[\d.s]/.test(t)
          && !/^ease|^linear|^step|^cubic-bezier/.test(t)
          && !/infinite|alternate|both|forwards|backwards|normal|reverse|none|running|paused/.test(t)
          && !/^!/.test(t))
        .forEach(t => used.add(t));
    });
  }
  const missing = [...used].filter(n => !defined.has(n));
  assert.strictEqual(missing.length, 0,
    `CSS gọi animation dùng @keyframes chưa định nghĩa: ${missing.join(', ')}`);
});

runTest('6.7: escapeCsvCell chống CSV injection + đúng chuẩn RFC 4180', () => {
  const m = adminJs.match(/function escapeCsvCell\(value\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'Thiếu hàm escapeCsvCell trong admin.js');
  // eslint-disable-next-line no-eval
  const fn = eval(`(${m[0]})`);

  // Chống công thức: tên do người dùng nhập có thể bắt đầu bằng ký tự này
  ['=1+1', '+1234', '-2+3', '@SUM(A1)'].forEach(payload => {
    const out = fn(payload);
    // Ô luôn bọc trong dấu nháy kép, và phải có dấu nháy đơn trung hoà ngay
    // sau dấu mở: "'=1+1" chứ không phải "=1+1"
    assert.ok(out.startsWith('"\''),
      `Phải trung hoà ô bắt đầu bằng ký tự công thức: ${JSON.stringify(payload)} -> ${out}`);
  });

  // TAB/CR đứng đầu: bị loại bỏ trước (an toàn, không còn ký tự công thức)
  assert.strictEqual(fn('\tX'), '"X"');
  assert.strictEqual(fn('\rX'), '"X"');
  // Ký tự điều khiển ở GIỮA chuỗi cũng phải được loại (tránh lệch cột)
  assert.strictEqual(fn('A\r\nB'), '"A B"');

  // Escape dấu nháy kép theo RFC 4180 (nhân đôi)
  assert.strictEqual(fn('Nguyễn "An"'), '"Nguyễn ""An"""');
  // Ký tự điều khiển gây lệch cột phải được loại bỏ
  assert.strictEqual(fn('A\nB\tC'), '"A B C"');
  // Giá trị rỗng / null
  assert.strictEqual(fn(''), '""');
  assert.strictEqual(fn(null), '""');
});

runTest('6.8: Không còn chuỗi CSV dựng thủ công thiếu escape', () => {
  // exportScheduleToCsv trước đây nối chuỗi thô: "…${fullName}…" -> tên chứa
  // dấu " làm hỏng cột. Bắt buộc mọi ô nội suy phải qua escapeCsvCell.
  const offenders = [];
  adminJs.split('\n').forEach((line, idx) => {
    if (/\+=\s*`".*\$\{/.test(line) && line.includes('csvContent')) {
      offenders.push(`admin.js:${idx + 1}`);
    }
    if (/rows\.push\(`".*\$\{/.test(line)) {
      offenders.push(`admin.js:${idx + 1}`);
    }
  });
  assert.strictEqual(offenders.length, 0,
    `Còn dựng CSV thủ công không escape: ${offenders.join(', ')}`);
});

runTest('6.6: Thang z-index có token, không dùng số rời rạc', () => {
  const css = readSrc('css/style.css');
  const numeric = [...css.matchAll(/z-index\s*:\s*(\d+)/g)].map(m => m[1]);
  assert.strictEqual(numeric.length, 0,
    `Còn ${numeric.length} z-index dạng số rời rạc (nên dùng var(--z-*))`);

  // Modal lồng nhau PHẢI cao hơn modal thường, và toast phải cao hơn sticky bar
  const token = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(\\d+)`));
    return m ? Number(m[1]) : -1;
  };
  assert.ok(token('z-modal-nested') > token('z-modal'),
    `z-modal-nested (${token('z-modal-nested')}) phải > z-modal (${token('z-modal')})`);
  assert.ok(token('z-toast') > token('z-sticky-hero'),
    `z-toast (${token('z-toast')}) phải > z-sticky-hero (${token('z-sticky-hero')})`);
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

runTest('6.9: KHÔNG file JSON nào trong data/ chứa thông tin tài khoản', () => {
  // data/admin_accounts.json từng được commit và bị deploy công khai
  // (admin/123, PIN 9999). Không một dòng mã nào đọc nó -> đã xoá.
  // data/default_students.json là danh sách CTV công khai HCM-UTE, hợp lệ.
  const SENSITIVE_KEYS = ['"pin"', '"password"', '"username"', 'mustChangePassword'];

  if (fs.existsSync(path.join(ROOT, 'data'))) {
    fs.readdirSync(path.join(ROOT, 'data'))
      .filter(f => f.endsWith('.json'))
      .forEach(f => {
        const full = path.join(ROOT, 'data', f);
        const content = fs.readFileSync(full, 'utf8');
        const hits = SENSITIVE_KEYS.filter(k => content.includes(k));
        assert.strictEqual(hits.length, 0,
          `data/${f} chứa trường tài khoản (${hits.join(', ')}) — không được commit vào kho công khai`);
      });
  }

  // Và phải được .gitignore chặn
  const gi = readSrc('.gitignore');
  assert.ok(/data\/admin_accounts\.json/.test(gi),
    '.gitignore phải chặn data/admin_accounts.json để không bị commit lại');
});

runTest('6.10: data/admin_accounts.json phải KHÔNG còn trong git index', () => {
  let tracked = [];
  try {
    tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    return; // không có git trong môi trường này
  }
  assert.ok(!tracked.includes('data/admin_accounts.json'),
    'data/admin_accounts.json vẫn còn được git track — sẽ tiếp tục bị deploy công khai');
  assert.ok(!tracked.some(f => /\.(csv|xlsx|xls)$/i.test(f)),
    'Không được track file bảng tính (chứa PII)');
});

runTest('6.4: File PII không còn được git track', () => {
  let tracked = [];
  try {
    tracked = require('child_process')
      .execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  } catch (e) {
    return; // Không có git (VD: CI artifact) -> bỏ qua
  }
  const pii = tracked.filter(f => /\.(csv|xlsx|xls)$/i.test(f));
  assert.strictEqual(pii.length, 0,
    `Còn file PII được track trong git: ${pii.join(', ')}`);
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

runTest('7.5: window.* gọi trong TEMPLATE LITERAL của JS cũng phải được định nghĩa', () => {
  // Bug thật: student.js render nút gọi window.studentSwitchToWeek(...)
  // nhưng hàm đó chưa từng được định nghĩa -> nút chết, bấm không ăn.
  // Test 7.4 chỉ quét HTML nên lọt qua; phải quét cả chuỗi trong JS.
  const providedByOtherModules = new Set([
    'SchedulerEngine', 'MonthCalendarHelper', 'CloudSyncManager',
    'SAMPLE_30_STUDENTS', 'SAMPLE_HCM_UTE_STUDENTS', 'SampleDataManager',
    'dispatchEvent', 'scrollY', 'ClipboardItem',
    // API chuẩn của trình duyệt, không phải hàm ứng dụng phải định nghĩa
    'print', 'open', 'location', 'confirm', 'alert', 'scrollTo'
  ]);

  [[adminJs, 'admin.js'], [studentJs, 'student.js']].forEach(([src, name]) => {
    const defined = new Set([...src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1]));
    // Chỉ soi call-site dạng onclick="window.x(...)" nằm trong template literal
    const called = new Set(
      [...src.matchAll(/onclick="window\.([A-Za-z_$][\w$]*)\s*(?:&&|\()?/g)].map(m => m[1])
    );
    const missing = [...called].filter(fn => !defined.has(fn) && !providedByOtherModules.has(fn));
    assert.strictEqual(missing.length, 0,
      `${name} có nút gọi window.${missing.join(', window.')} nhưng không định nghĩa`);
  });
});

// -----------------------------------------------------------------------------
group('GROUP 8: Khả năng tiếp cận (a11y)');
// -----------------------------------------------------------------------------

runTest('8.1a: Mọi hộp thoại đều có role="dialog" + aria-modal + aria-labelledby trỏ tới id có thật', () => {
  const diacriticsFree = s => s;
  // Lấy từng thẻ mở <div ... class="modal-overlay|modal-backdrop" ...>
  const openTags = [];
  for (const [file, html] of [['index.html', indexHtml], ['admin.html', adminHtml]]) {
    const re = /<div\b[^>]*\bclass="[^"]*\bmodal-(?:overlay|backdrop)\b[^"]*"[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      openTags.push({ file, tag: m[0], line: html.slice(0, m.index).split('\n').length });
    }
  }

  assert.ok(openTags.length >= 10,
    `Chỉ tìm thấy ${openTags.length} hộp thoại, mong đợi >= 10`);

  const missingRole = openTags.filter(t => !/role="dialog"/.test(t.tag));
  assert.strictEqual(missingRole.length, 0,
    `Thiếu role="dialog": ${missingRole.map(t => `${t.file}:${t.line}`).join(', ')}`);

  const missingModal = openTags.filter(t => !/aria-modal="true"/.test(t.tag));
  assert.strictEqual(missingModal.length, 0,
    `Thiếu aria-modal="true": ${missingModal.map(t => `${t.file}:${t.line}`).join(', ')}`);

  const missingTab = openTags.filter(t => !/tabindex="-1"/.test(t.tag));
  assert.strictEqual(missingTab.length, 0,
    `Thiếu tabindex="-1" (để nhốt được tiêu điểm): ${missingTab.map(t => `${t.file}:${t.line}`).join(', ')}`);

  // aria-labelledby phải trỏ tới một id THẬT SỰ tồn tại
  const allHtml = indexHtml + '\n' + adminHtml;
  const badRef = openTags.filter(t => {
    const m = t.tag.match(/aria-labelledby="([^"]+)"/);
    if (!m) return true;
    return !new RegExp(`id="${m[1]}"`).test(allHtml);
  });
  assert.strictEqual(badRef.length, 0,
    `aria-labelledby trỏ tới id không tồn tại: ${badRef.map(t => `${t.file}:${t.line}`).join(', ')}`);
});

runTest('8.1b: a11y_modal.js được nạp ở CẢ 2 trang và có focus trap + focus restore', () => {
  assert.ok(indexHtml.includes('js/a11y_modal.js'),
    'index.html chưa nạp a11y_modal.js -> không có focus trap cho hộp thoại đổi ca');
  assert.ok(adminHtml.includes('js/a11y_modal.js'),
    'admin.html chưa nạp a11y_modal.js -> không có focus trap cho 10 hộp thoại quản trị');

  const a11y = readSrc('js/a11y_modal.js');
  assert.ok(/event\.key\s*!==\s*'Tab'/.test(a11y), 'Thiếu xử lý phím Tab để nhốt tiêu điểm');
  assert.ok(/MutationObserver/.test(a11y),
    'Thiếu MutationObserver để bắt mọi lệnh classList.add/remove("active")');
  assert.ok(/previouslyFocused/.test(a11y) && /\.focus\(\)/.test(a11y),
    'Thiếu cơ chế trả tiêu điểm về phần tử đã focus trước khi mở modal');
});

runTest('8.1c: showToast thông báo LỖI qua vùng aria-live assertive', () => {
  [[adminJs, 'admin.js'], [studentJs, 'student.js']].forEach(([src, name]) => {
    const m = src.match(/function showToast\([^)]*\) \{[\s\S]*?toastContainer\.appendChild/);
    assert.ok(m, `Không tìm thấy showToast trong ${name}`);
    assert.ok(/announceAlert/.test(m[0]),
      `${name}: thông báo lỗi phải đi qua vùng assertive, không chỉ aria-live="polite"`);
    assert.ok(/role",\s*"alert"|setAttribute\('role',\s*'alert'\)/.test(m[0]),
      `${name}: thẻ toast loại lỗi phải có role="alert"`);
  });
});

runTest('8.1d: showToast tôn trọng tham số thời lượng', () => {
  // Trước đây showToast(message, type, duration) BỎ QUA duration và luôn
  // cứng 3200ms -> cảnh báo "bộ nhớ trình duyệt đầy" xin 9 giây biến mất
  // sau 3.2 giây, người dùng không kịp đọc.
  [[adminJs, 'admin.js'], [studentJs, 'student.js']].forEach(([src, name]) => {
    const fn = src.match(/function showToast\([^)]*\) \{[\s\S]*?\n  \}/);
    assert.ok(fn, `Không tìm thấy showToast trong ${name}`);
    assert.ok(/duration/.test(fn[0]),
      `${name}: showToast phải nhận tham số thời lượng`);
    assert.ok(/lifetime\s*=\s*Number\(duration\)/.test(fn[0]),
      `${name}: phải dùng duration thay vì hằng số cứng 3200`);
    assert.ok(!/\}, 3200\)/.test(fn[0]),
      `${name}: vẫn còn setTimeout cứng 3200ms bỏ qua tham số duration`);
  });
});

runTest('8.1e: Thanh Tab tuần có id + aria-controls + tabpanel tương ứng', () => {
  const tabs = [...indexHtml.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(m => m[0]);
  assert.ok(tabs.length > 0, 'Không tìm thấy thẻ role="tab" nào trong index.html');

  tabs.forEach(t => {
    assert.ok(/\bid="[^"]+"/.test(t), `Thẻ tab thiếu id (không ai trỏ tới được): ${t}`);
    const ctrl = t.match(/aria-controls="([^"]+)"/);
    assert.ok(ctrl, `Thẻ tab thiếu aria-controls: ${t}`);
    assert.ok(new RegExp(`id="${ctrl[1]}"`).test(indexHtml),
      `aria-controls="${ctrl[1]}" không tồn tại trong index.html`);
    assert.ok(/tabindex="(-1|0)"/.test(t),
      `Thẻ tab thiếu tabindex (cần roving tabindex): ${t}`);
  });

  // Phải có role="tabpanel" cho vùng nội dung
  const panels = [...indexHtml.matchAll(/role="tabpanel"/g)];
  assert.ok(panels.length >= 1, 'Thiếu role="tabpanel" -> trình đọc màn hình không nối được tab với nội dung');

  // Nút tắt bàn phím phải có ARIA ở cả 2 trang
  assert.ok(/role="alert"/.test(adminHtml), 'auth-error-box phải có role="alert"');
  assert.ok(/role="alert"/.test(indexHtml), 'student-invalid-mssv-notice phải có role="alert"');
});

runTest('8.1f: Ô nhập MSSV/PIN có inputmode numeric trên di động', () => {
  // Trước đây input-swap-sender-mssv và admin-input-studentid là type=text
  // trần -> trên điện thoại bàn phím bật chữ cái cho một trường chỉ nhập số.
  const numericFields = [
    ['index.html', indexHtml, 'input-swap-sender-mssv'],
    ['admin.html', adminHtml, 'admin-input-studentid'],
    ['admin.html', adminHtml, 'admin-input-phone'],
    ['admin.html', adminHtml, 'add-user-pin'],
    ['admin.html', adminHtml, 'pin-new'],
    ['admin.html', adminHtml, 'auth-input-pin']
  ];
  numericFields.forEach(([file, html, id]) => {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `Không tìm thấy input#${id} trong ${file}`);
    assert.ok(/inputmode="numeric"/.test(tag[0]),
      `${file}: input#${id} thiếu inputmode="numeric" -> bàn phím di động bật chữ cái`);
  });

  // maxlength của PIN phải khớp với nhãn "4-6 số"
  const pin = adminHtml.match(/<input[^>]*id="auth-input-pin"[^>]*>/)[0];
  const maxlen = pin.match(/maxlength="(\d+)"/);
  assert.ok(maxlen && Number(maxlen[1]) === 6,
    `maxlength của ô PIN phải là 6 (khớp nhãn "4-6 Số"), thực tế: ${maxlen && maxlen[1]}`);
});

// -----------------------------------------------------------------------------
group('GROUP 9: Scheduler cảnh báo dữ liệu bất thường');
// -----------------------------------------------------------------------------

runTest('8.1: Role không hợp lệ/thiếu phải cảnh báo và KHÔNG tự nâng quyền', () => {
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;

  const bad = [
    { id: 'a', fullName: 'A', role: 'tas', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'b', fullName: 'B', role: undefined, availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'c', fullName: 'C', role: 123, availableShifts: S.SHIFTS.map(x => x.id) }
  ];
  const res = S.runMonthSchedule(bad, 2026, 10);
  const joined = res.warnings.join(' | ');
  assert.ok(/không hợp lệ|thiếu/i.test(joined),
    `Phải cảnh báo role không hợp lệ. Warnings: ${joined}`);
  assert.ok(/"tas"/.test(joined), 'Cảnh báo phải nêu rõ giá trị sai');
  assert.ok(/\(thiếu\)/.test(joined), 'Phải báo rõ khi role bị THIẾU hoàn toàn');

  // Điểm mấu chốt: KHÔNG được tự động nâng lên "Chính Thức" (quyền cao hơn).
  // Mặc định phải là "Tập Sự". summary nằm ở cấp tuần.
  const w0 = res.weeks[0].summary;
  assert.strictEqual(w0.newStudentsCount, 3,
    'Role sai/thiếu phải mặc định là Tập Sự, KHÔNG phải Chính Thức');
  assert.strictEqual(w0.oldStudentsCount, 0,
    'Không được tự nâng bất kỳ ai lên Chính Thức');
});

runTest('8.1b: Role viết HOA hoặc dùng tên tiếng Việt vẫn được chuẩn hoá đúng', () => {
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;

  const list = [
    { id: 'a', fullName: 'A', role: 'OLD', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'b', fullName: 'B', role: 'NEW', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'c', fullName: 'C', role: 'Chính Thức', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'd', fullName: 'D', role: 'Tập sự', availableShifts: S.SHIFTS.map(x => x.id) }
  ];
  const res = S.runMonthSchedule(list, 2026, 10);
  const w0 = res.weeks[0].summary;
  assert.strictEqual(w0.oldStudentsCount, 2, 'OLD + "Chính Thức" phải thành Chính Thức');
  assert.strictEqual(w0.newStudentsCount, 2, 'NEW + "Tập sự" phải thành Tập Sự');
  assert.ok(!/không hợp lệ/i.test(res.warnings.join(' | ')),
    'Các biến thể hợp lệ không được cảnh báo');
});

runTest('8.2: Role hợp lệ thì KHÔNG sinh cảnh báo', () => {
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;

  const ok = [
    { id: 'a', fullName: 'A', role: 'old', availableShifts: S.SHIFTS.map(x => x.id) },
    { id: 'b', fullName: 'B', role: 'new', availableShifts: S.SHIFTS.map(x => x.id) }
  ];
  const res = S.runMonthSchedule(ok, 2026, 10);
  assert.ok(!/không hợp lệ/i.test(res.warnings.join(' | ')),
    'Dữ liệu hợp lệ không được sinh cảnh báo');
});

runTest('9.4: Trùng ca cùng ngày phải được TRÁNH khi còn ứng viên khác', () => {
  // Trong bước 2 (greedy), trùng ngày trước đây chỉ là phạt 400 điểm —
  // nhỏ hơn nhiều so với currentCount*1000, nên hành vi luôn thắng.
  // Đo thực tế (trước khi sửa): 3 Chính Thức + 3 Tập Sự (tất cả rảnh mọi
  // ca) -> 2 ca bị trùng ngày dù hoàn toàn có thể tránh.
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;
  const ALL = S.SHIFTS.map(x => x.id);

  const list = [
    ...Array.from({ length: 3 }, (_, i) => ({ id: 'o' + i, fullName: 'O' + i, role: 'old', availableShifts: ALL })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: 'n' + i, fullName: 'N' + i, role: 'new', availableShifts: ALL }))
  ];
  const res = S.runMonthSchedule(list, 2026, 10);

  let sameDayPairs = 0;
  res.weeks.forEach(w => {
    const perDay = {};
    Object.entries(w.scheduleTable).forEach(([sid, slot]) => {
      const dayKey = S.SHIFT_MAP[sid] && S.SHIFT_MAP[sid].dayKey;
      if (!dayKey) return;
      [slot.oldMember, slot.newMember].forEach(m => {
        if (!m) return;
        const key = m.id + '|' + dayKey;
        perDay[key] = (perDay[key] || 0) + 1;
      });
    });
    Object.values(perDay).forEach(v => { if (v > 1) sameDayPairs++; });
  });

  assert.strictEqual(sameDayPairs, 0,
    `Có ${sameDayPairs} ca bị trùng ngày dù có ứng viên khác rảnh — ràng buộc cứng đã bị phá bởi trọng số`);
});

runTest('9.5: Trùng ngày KHÔNG tránh được thì phải CẢNH BÁO, không im lặng', () => {
  // 2 Chính Thức + 1 Tập Sự: về nguyên tắc 10 ca "Người Mới" buộc phải do
  // N1 đảm nhiệm, tức 10 ca trùng ngày là KHÔNG tránh được.
  // Trước đây: 0 cảnh báo dù lịch bất khả thi (1 người trực sáng + chiều
  // T2→T6 liên tục). Nay phải nói rõ để Ban điều hành biết mà thêm CTV.
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;
  const ALL = S.SHIFTS.map(x => x.id);

  const list = [
    { id: 'o1', fullName: 'O1', role: 'old', availableShifts: ALL },
    { id: 'o2', fullName: 'O2', role: 'old', availableShifts: ALL },
    { id: 'n1', fullName: 'N1', role: 'new', availableShifts: ALL }
  ];
  const res = S.runMonthSchedule(list, 2026, 10);
  const joined = res.warnings.join(' | ');

  assert.ok(/trùng ngày/.test(joined),
    `Trùng ngày không tránh được phải được cảnh báo. Warnings: ${joined}`);
  assert.ok(/Tuần 1/.test(joined),
    'Cảnh báo phải nêu rõ tuần nào, không chỉ nói chung chung');
});

runTest('9.6: Cảnh báo của TỪNG TUẦN phải được gom lên warnings cấp tháng', () => {
  // Bug rất dễ bỏ sót: monthWarnings chỉ nhận cảnh báo cấp tháng, còn
  // result.warnings của từng tuần bị bỏ rơi. Giao diện chỉ đọc
  // result.warnings -> người dùng không bao giờ thấy cảnh báo tuần.
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;
  const ALL = S.SHIFTS.map(x => x.id);

  const list = [
    { id: 'o1', fullName: 'O1', role: 'old', availableShifts: ALL },
    { id: 'n1', fullName: 'N1', role: 'new', availableShifts: ALL }
  ];
  const res = S.runMonthSchedule(list, 2026, 10);

  // Cảnh báo tuần nào sinh ra thì phải xuất hiện ở cấp tháng
  res.weeks.forEach(w => {
    (w.warnings || []).forEach(msg => {
      assert.ok(res.warnings.some(m => m.includes(msg)),
        `Cảnh báo của tuần ${w.weekNumber} không được gom lên cấp tháng: "${msg}"`);
    });
  });

  // Và không được trùng lặp vô ích
  assert.strictEqual(res.warnings.length, new Set(res.warnings).size,
    'warnings cấp tháng bị trùng lặp');
});

runTest('9.7: MonthCalendarHelper chỉ có MỘT định nghĩa và luôn tính đúng', () => {
  // Trước đây js/scheduler.js và js/month_calendar.js CÙNG định nghĩa
  // MonthCalendarHelper. Trình duyệt nạp month_calendar.js TRƯỚC
  // scheduler.js nên bản trong scheduler.js là bản thực sự chạy — và nó
  // đã PHÂN KỲ khỏi bản kia:
  //   - nhãn tuần 4 tháng 12/2026: "…/2026" (sai) vs "…/2027" (đúng)
  //   - getFirstMonday(2026) gọi 1 tham số ra năm 2194, do tham số mặc
  //     định rò vào ô month: new Date(2026, 2025, 1)
  // Nghĩa là test chạy trên lịch KHÁC với lịch người dùng thấy. Nay
  // scheduler.js lấy bản canonical trong month_calendar.js.
  //
  // Test này khoá cả hai điều: (1) không còn bản sao để phân kỳ,
  // (2) bản canonical tính đúng ở cả dạng gọi 1 và 2 tham số.
  const schedulerSrc = readSrc('js/scheduler.js');

  // (1) Không được còn định nghĩa object MonthCalendarHelper riêng trong
  // scheduler.js — chỉ được tham chiếu tới bản canonical.
  const definesOwn = /const\s+MonthCalendarHelper\s*=\s*\{/.test(schedulerSrc);
  assert.ok(!definesOwn,
    'scheduler.js KHÔNG được tự định nghĩa lại MonthCalendarHelper '
    + '(phải lấy từ month_calendar.js) — bản sao đã gây phân kỳ năm 2194.');

  // (2) Bản canonical phải đúng ở cả hai dạng gọi.
  // Dùng CHUNG một sandbox để load cả 2 file, đúng như trình duyệt — nếu tách
  // riêng thì mỗi lần nạp tạo object khác nhau và so sánh tham chiếu ở (3)
  // sẽ luôn sai dù code đúng.
  const sandbox = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', readSrc('js/month_calendar.js'))(sandbox, { exports: {} });
  const H = sandbox.MonthCalendarHelper;
  assert.ok(H && typeof H.getMonthWeeks === 'function', 'month_calendar.js phải có MonthCalendarHelper');

  const cases = [[10, 2026], [11, 2026], [12, 2026], [1, 2027], [3, 2026], [6, 2026]];
  cases.forEach(([m, y]) => {
    H.getMonthWeeks(m, y).forEach((wk, i) => {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(wk.days.T2.fullDate),
        `fullDate ${m}/${y} tuần ${i + 1} phải định dạng YYYY-MM-DD, thực tế: ${wk.days.T2.fullDate}`);
      Object.values(wk.days).forEach(d => {
        assert.ok(d.fullDate.startsWith(String(y)) || d.fullDate.startsWith(String(y + 1)),
          `fullDate ${d.fullDate} của tháng ${m}/${y} lệch năm so với tháng đang xếp`);
      });
    });
  });

  // getFirstMonday gọi 1 tham số phải cho đúng tháng 10 năm đó
  const one = H.getFirstMonday(2026);
  assert.strictEqual(one.getFullYear(), 2026,
    `getFirstMonday(2026) phải trả năm 2026, thực tế ${one.getFullYear()} (thường là 2194 do default param)`);
  assert.strictEqual(one.getMonth(), 9,
    `getFirstMonday(2026) phải trả tháng 10, thực tế tháng ${one.getMonth() + 1}`);

  // Gọi 1 tham số vào getMonthWeeks: (2026) bị hiểu là (year) → không được
  // biến thành tháng 2026 / năm 2194.
  const solo = H.getMonthWeeks(2026);
  assert.ok(!/2194/.test(solo[0].label),
    `getMonthWeeks(2026) 1 tham số không được ra năm 2194, thực tế: ${solo[0].label}`);
  assert.ok(solo[0].days.T2.fullDate.startsWith('2026-'),
    `getMonthWeeks(2026) 1 tham số phải ra năm 2026, thực tế: ${solo[0].days.T2.fullDate}`);

  // Nhãn tuần cuối tháng 12/2026 phải kết thúc năm 2027
  const dec = H.getMonthWeeks(12, 2026);
  assert.ok(/\/2027\)?$/.test(dec[3].label),
    `Nhãn tuần 4 tháng 12/2026 phải kết thúc bằng /2027, thực tế: ${dec[3].label}`);

  // scheduler.js phải dùng ĐÚNG bản canonical này, không phải bản khác.
  // Nạp tiếp vào CÙNG sandbox trên để window.MonthCalendarHelper là H.
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', schedulerSrc)(sandbox, { exports: {} });
  assert.strictEqual(sandbox.SchedulerEngine.MonthCalendarHelper, H,
    'SchedulerEngine.MonthCalendarHelper phải là ĐÚNG object canonical '
    + 'từ month_calendar.js');
});

runTest('9.5b: Role không hợp lệ phải được chuẩn hoá đúng', () => {
  // Test 8.1/8.1b đã phủ; test này khẳng định ngưỡng "an toàn": role thiếu
  // hay sai đều KHÔNG bao giờ bị nâng lên Chính Thức.
  const global = {};
  loadScheduler(global);
  const S = global.SchedulerEngine;
  const ALL = S.SHIFTS.map(x => x.id);

  // Chỉ giá trị THỰC SỰ vô nghĩa. 'Chính Thức' và 'ts' là bí danh hợp lệ
  // (xem 8.1b) nên không đưa vào đây.
  const weird = [null, undefined, '', 'veteran2', 42, {}, [], 'ChínhThức', 'OLD-NEW'];
  weird.forEach(role => {
    const res = S.runMonthSchedule(
      [{ id: 'x', fullName: 'X', role, availableShifts: ALL }],
      2026, 10
    );
    const w0 = res.weeks[0].summary;
    assert.strictEqual(w0.oldStudentsCount, 0,
      `role=${JSON.stringify(role)} bị nâng lên Chính Thức — không được phép`);
  });
});

runTest('8.3: Mã định danh trùng được ghi nhận cảnh báo', () => {
  const global = {};
  loadScheduler(global);
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