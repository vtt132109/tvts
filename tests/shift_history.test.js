/**
 * ============================================================================
 * AUTOMATED TEST SUITE: #12 — LỊCH SỬ CA TRỰC CÁ NHÂN (SHIFT HISTORY)
 * ============================================================================
 * Bảo vệ 4 nhóm hành vi:
 * 1. Tổng hợp đúng ca của một MSSV trên nhiều tháng (không lẫn người khác).
 * 2. Gộp & khử trùng lặp giữa kho lưu trữ ALL_MONTHS, bản sao lưu web và
 *    lịch tháng đang áp dụng.
 * 3. KHÔNG bịa lịch sử: không bao giờ dùng lịch mẫu tự sinh.
 * 4. Trạng thái thời gian (đã qua / sắp tới), giới hạn 24 tháng và escapeHtml.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Môi trường giả lập trình duyệt -----------------------------------------
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();
const elementsMap = {};

function createMockElement(id = '', tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      contains(cls) { return this._classes.has(cls); },
      toggle(cls, force) {
        if (force !== undefined) {
          if (force) this.add(cls); else this.remove(cls);
          return force;
        }
        if (this.contains(cls)) { this.remove(cls); return false; }
        this.add(cls); return true;
      }
    },
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    checked: false,
    listeners: {},
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const fns = this.listeners[event.type || event] || [];
      fns.forEach(fn => fn(event));
    },
    appendChild(child) { return child; },
    removeChild(child) { return child; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
    focus() {},
    scrollIntoView() {}
  };
  if (id) elementsMap[id] = el;
  return el;
}

global.setInterval = () => 1;
global.clearInterval = () => {};

const windowListeners = {};
global.localStorage = mockLocalStorage;
global.sessionStorage = mockSessionStorage;

global.window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  addEventListener(evt, fn) {
    if (!windowListeners[evt]) windowListeners[evt] = [];
    windowListeners[evt].push(fn);
  },
  dispatchEvent(evt) {
    const fns = windowListeners[evt.type || evt] || [];
    fns.forEach(fn => fn(evt));
  },
  print: () => {},
  location: { href: '' }
};

global.document = {
  readyState: 'complete',
  documentElement: createMockElement('html', 'html'),
  body: createMockElement('body', 'body'),
  getElementById(id) {
    return elementsMap[id] || createMockElement(id);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return createMockElement('', tag); },
  addEventListener() {}
};

// 2. Nạp engine + portal ----------------------------------------------------
require('../js/month_calendar.js');
require('../js/scheduler.js');
// Tiện ích dùng chung phải nạp trước (giống thứ tự <script> trong index.html).
require('../js/common.js');
eval(fs.readFileSync(path.resolve(__dirname, '../js/student.js'), 'utf8'));

const helper = global.window.studentTestHelper;
assert.ok(helper && typeof helper.buildShiftHistory === 'function',
  'studentTestHelper phải export buildShiftHistory');

// 3. Test runner ------------------------------------------------------------
let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}: ${err.message}`);
    console.error(err.stack);
  }
}

// 4. Fixture helpers --------------------------------------------------------
const KEYS = {
  ALL_MONTHS: 'ts_scheduler_all_months_v1',
  WEB_BACKUPS: 'ts_scheduler_web_backups_v1',
  MONTH_SCHEDULE: 'ts_scheduler_month_result',
  TWO_WEEK: 'ts_scheduler_two_week_result',
  PREV_MONTH: 'ts_scheduler_prev_month_result',
  ACTIVE_MONTH: 'ts_scheduler_active_month_v1',
  STUDENTS: 'ts_scheduler_students'
};

function resetStorage() {
  mockLocalStorage.clear();
}

function makeSlot(shiftId, member, asNew) {
  const parts = shiftId.split('_');
  const dayKey = parts[0];
  const periodKey = parts[1];
  return {
    shiftInfo: {
      id: shiftId,
      dayKey,
      dayName: `Thứ ${dayKey.slice(1)}`,
      period: periodKey === 'S' ? 'Sáng' : 'Chiều',
      time: periodKey === 'S' ? '07:30 - 11:30' : '13:00 - 16:30'
    },
    oldMember: asNew ? null : member,
    newMember: asNew ? member : null,
    status: 'full'
  };
}

/**
 * entries: [{ shiftId, week, studentId, name, asNew }]
 */
function makeMonthSchedule(month, year, entries) {
  const weeks = [1, 2, 3, 4].map(w => ({ weekNumber: w, scheduleTable: {} }));
  entries.forEach(en => {
    const member = {
      studentId: en.studentId,
      fullName: en.name || `SV ${en.studentId}`,
      phone: '0900000000'
    };
    weeks[(en.week || 1) - 1].scheduleTable[en.shiftId] = makeSlot(en.shiftId, member, en.asNew === true);
  });
  return { month, year, weeks };
}

function saveArchive(map) {
  mockLocalStorage.setItem(KEYS.ALL_MONTHS, JSON.stringify(map));
}

function saveBackups(list) {
  mockLocalStorage.setItem(KEYS.WEB_BACKUPS, JSON.stringify(list));
}

// ============================================================================
console.log('================================================================');
console.log('📜 BẮT ĐẦU KIỂM THỬ - LỊCH SỬ CA TRỰC CÁ NHÂN (#12)');
console.log('================================================================\n');

// GROUP 1: TỔNG HỢP ĐÚNG MSSV
// ============================================================================
runTest('Lịch sử: chỉ tổng hợp ca của đúng MSSV, bỏ qua ca của người khác', () => {
  resetStorage();
  saveArchive({
    '2026-08': makeMonthSchedule(8, 2026, [
      { shiftId: 'T2_S', week: 1, studentId: '2102001', name: 'Nguyễn Văn A' },
      { shiftId: 'T3_C', week: 2, studentId: '2102001', name: 'Nguyễn Văn A', asNew: true },
      { shiftId: 'T4_S', week: 1, studentId: '2211005', name: 'Trần Thị B' }
    ])
  });

  const history = helper.buildShiftHistory('2102001');

  assert.strictEqual(history.totalShifts, 2, 'Chỉ được đếm 2 ca của 2102001');
  assert.strictEqual(history.totalMonths, 1, 'Chỉ có 1 tháng');
  assert.strictEqual(history.months[0].key, '2026-08');
  assert.strictEqual(history.months[0].count, 2);
});

runTest('Lịch sử: so khớp MSSV không phân biệt hoa/thường và bỏ khoảng trắng', () => {
  resetStorage();
  saveArchive({
    '2026-08': makeMonthSchedule(8, 2026, [
      { shiftId: 'T2_S', week: 1, studentId: 'UTE2102', name: 'Lê Văn C' }
    ])
  });

  const history = helper.buildShiftHistory('  ute2102  ');
  assert.strictEqual(history.totalShifts, 1, 'Phải khớp được MSSV có chữ');
});

runTest('Lịch sử: MSSV rỗng hoặc không có ca -> trả về rỗng, không ném lỗi', () => {
  resetStorage();
  const empty = helper.buildShiftHistory('');
  assert.strictEqual(empty.totalShifts, 0);
  assert.strictEqual(empty.totalMonths, 0);
  assert.deepStrictEqual(empty.months, []);

  const noShifts = helper.buildShiftHistory('9999999');
  assert.strictEqual(noShifts.totalShifts, 0);
});

// ============================================================================
// GROUP 2: GỘP NHIỀU NGUỒN & KHỬ TRÙNG LẶP
// ============================================================================
runTest('Lịch sử: gộp kho lưu trữ + bản sao lưu web + lịch tháng đang áp dụng', () => {
  resetStorage();
  saveArchive({
    '2026-08': makeMonthSchedule(8, 2026, [
      { shiftId: 'T2_S', week: 1, studentId: '2102001' }
    ]),
    '2026-09': makeMonthSchedule(9, 2026, [
      { shiftId: 'T3_C', week: 1, studentId: '2102001' }
    ])
  });
  saveBackups([
    {
      name: 'Sao lưu 07/2026',
      monthKey: '2026-07',
      payload: {
        monthSchedule: makeMonthSchedule(7, 2026, [
          { shiftId: 'T4_S', week: 2, studentId: '2102001' }
        ])
      }
    }
  ]);
  mockLocalStorage.setItem(KEYS.ACTIVE_MONTH, JSON.stringify({ month: 10, year: 2026 }));
  mockLocalStorage.setItem(KEYS.MONTH_SCHEDULE, JSON.stringify(
    makeMonthSchedule(10, 2026, [{ shiftId: 'T5_S', week: 1, studentId: '2102001' }])
  ));

  const history = helper.buildShiftHistory('2102001');
  const keys = history.months.map(m => m.key);

  assert.deepStrictEqual(keys, ['2026-10', '2026-09', '2026-08', '2026-07'],
    'Lịch sử phải gộp đủ 4 nguồn, sắp xếp mới nhất trước');
  assert.strictEqual(history.totalShifts, 4);
  assert.strictEqual(history.totalMonths, 4);
});

runTest('Lịch sử: cùng một tháng xuất hiện ở kho lưu trữ và bản sao lưu -> chỉ đếm 1 lần', () => {
  resetStorage();
  const september = makeMonthSchedule(9, 2026, [
    { shiftId: 'T2_S', week: 1, studentId: '2102001' }
  ]);
  saveArchive({ '2026-09': september });
  saveBackups([{ name: 'Sao lưu 09/2026', monthKey: '2026-09', payload: { monthSchedule: september } }]);

  const history = helper.buildShiftHistory('2102001');
  assert.strictEqual(history.totalMonths, 1, 'Không được nhân đôi tháng');
  assert.strictEqual(history.totalShifts, 1, 'Không được nhân đôi ca');
});

runTest('Lịch sử: dữ liệu rác trong localStorage không làm sập lịch sử', () => {
  resetStorage();
  mockLocalStorage.setItem(KEYS.ALL_MONTHS, '{ khong phai json');
  mockLocalStorage.setItem(KEYS.WEB_BACKUPS, 'null');
  mockLocalStorage.setItem(KEYS.PREV_MONTH, '[[[');

  const history = helper.buildShiftHistory('2102001');
  assert.strictEqual(history.totalMonths, 0, 'Phải bỏ qua dữ liệu hỏng thay vì ném lỗi');
});

// ============================================================================
// GROUP 3: KHÔNG BỊA LỊCH SỬ
// ============================================================================
runTest('Lịch sử: không tự sinh lịch mẫu khi máy chưa có dữ liệu tháng trước', () => {
  resetStorage();
  // Chỉ có danh sách CTV, hoàn toàn KHÔNG có lịch tháng/năm nào được lưu.
  mockLocalStorage.setItem(KEYS.STUDENTS, JSON.stringify([
    { studentId: '2102001', fullName: 'Nguyễn Văn A', availableShifts: ['T2_S', 'T3_C'] }
  ]));

  const history = helper.buildShiftHistory('2102001');
  assert.strictEqual(history.totalMonths, 0,
    'Lịch mẫu do SchedulerEngine sinh ra KHÔNG được tính là lịch sử đã trực');
  assert.strictEqual(history.totalShifts, 0);
});

// ============================================================================
// GROUP 4: TRẠNG THÁI THỜI GIAN
// ============================================================================
runTest('Lịch sử: ca trong quá khứ được đánh dấu "đã qua"', () => {
  resetStorage();
  saveArchive({
    '2020-03': makeMonthSchedule(3, 2020, [
      { shiftId: 'T2_S', week: 1, studentId: '2102001' }
    ])
  });

  const history = helper.buildShiftHistory('2102001');
  assert.strictEqual(history.totalShifts, 1);
  assert.strictEqual(history.months[0].shifts[0].timing, 'past', 'Ca năm 2020 phải là đã qua');
  assert.strictEqual(history.passedShifts, 1);
  assert.strictEqual(history.upcomingShifts, 0);
  assert.ok(/^\d{2}\/\d{2}\/\d{4}$/.test(history.months[0].shifts[0].dateLabel),
    'Phải có nhãn ngày dạng DD/MM/YYYY');
});

runTest('Lịch sử: ca trong tương lai được đánh dấu "sắp tới"', () => {
  resetStorage();
  saveArchive({
    '2099-05': makeMonthSchedule(5, 2099, [
      { shiftId: 'T3_C', week: 2, studentId: '2102001' }
    ])
  });

  const history = helper.buildShiftHistory('2102001');
  assert.strictEqual(history.months[0].shifts[0].timing, 'upcoming');
  assert.strictEqual(history.upcomingShifts, 1);
});

// ============================================================================
// GROUP 5: GIỚI HẠN & BẢO MẬT HIỂN THỊ
// ============================================================================
runTest('Lịch sử: tối đa 24 tháng, giữ các tháng mới nhất và báo đã bị cắt', () => {
  resetStorage();
  const archive = {};
  for (let i = 0; i < 30; i++) {
    const month = (i % 12) + 1;
    const year = 2024 + Math.floor(i / 12);
    archive[`${year}-${String(month).padStart(2, '0')}`] = makeMonthSchedule(month, year, [
      { shiftId: 'T2_S', week: 1, studentId: '2102001' }
    ]);
  }
  saveArchive(archive);

  const history = helper.buildShiftHistory('2102001');
  assert.strictEqual(history.months.length, 24, 'Chỉ hiển thị tối đa 24 tháng');
  assert.strictEqual(history.limited, true, 'Phải bật cờ báo đã bị cắt bớt');
  // 30 tháng: 2024-01 → 2026-06, nên tháng mới nhất là 2026-06.
  assert.strictEqual(history.months[0].key, '2026-06', 'Tháng mới nhất phải đứng đầu');
});

runTest('Lịch sử: HTML hiển thị được escape, không chèn được thẻ lạ', () => {
  resetStorage();
  const evil = makeMonthSchedule(9, 2026, [
    { shiftId: 'T2_S', week: 1, studentId: '2102001', name: '<img src=x onerror=alert(1)>' }
  ]);
  // Tên ngày độc hại nhét vào shiftInfo để chắc chắn đi qua đường render.
  evil.weeks[0].scheduleTable.T2_S.shiftInfo.dayName = '<script>alert(2)</script>';
  saveArchive({ '2026-09': evil });

  const history = helper.buildShiftHistory('2102001');
  const html = helper.renderShiftHistorySection(history);

  assert.ok(html.includes('Lịch sử ca trực của bạn'), 'Phải render được khối lịch sử');
  assert.ok(!html.includes('<script>alert(2)</script>'), 'Không được để lọt thẻ <script>');
  assert.ok(html.includes('&lt;script&gt;'), 'Phải escape thành thực thể HTML');
  assert.ok(!html.includes('<img src=x'), 'Không được để lọt thẻ <img>');
});

runTest('Lịch sử: khối lịch sử hiển thị trong kết quả tra cứu MSSV', () => {
  resetStorage();
  saveArchive({
    '2026-09': makeMonthSchedule(9, 2026, [
      { shiftId: 'T2_S', week: 1, studentId: '2102001', name: 'Nguyễn Văn A' }
    ])
  });
  mockLocalStorage.setItem(KEYS.ACTIVE_MONTH, JSON.stringify({ month: 10, year: 2026 }));
  mockLocalStorage.setItem(KEYS.MONTH_SCHEDULE, JSON.stringify(
    makeMonthSchedule(10, 2026, [
      { shiftId: 'T3_C', week: 1, studentId: '2102001', name: 'Nguyễn Văn A' }
    ])
  ));

  const input = elementsMap['input-lookup-mssv'] || createMockElement('input-lookup-mssv');
  const btn = elementsMap['btn-lookup'] || createMockElement('btn-lookup');
  const result = elementsMap['lookup-result'] || createMockElement('lookup-result');

  input.value = '2102001';
  btn.dispatchEvent({ type: 'click' });

  assert.strictEqual(result.style.display, 'block');
  assert.ok(result.innerHTML.includes('Lịch sử ca trực của bạn'),
    'Thẻ cá nhân phải có khối lịch sử ca trực');
  assert.ok(result.innerHTML.includes('Tổng ca đã nhận'), 'Phải có ô thống kê tổng ca');
  assert.ok(result.innerHTML.includes('2 ca'), 'Phải cộng dồn 2 ca ở 2 tháng');
  assert.ok(result.innerHTML.includes('Tháng 09/2026'), 'Phải liệt kê tháng 09/2026');
  assert.ok(result.innerHTML.includes('Tháng 10/2026'), 'Phải liệt kê tháng đang áp dụng');
});

// ============================================================================
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / (totalTests || 1)) * 100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
