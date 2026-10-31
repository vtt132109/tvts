/**
 * ============================================================================
 * HỒI QUY CỔNG SINH VIÊN: 3 LỖI ĐÃ SỬA
 * ============================================================================
 * 1. Tuần 4 của tháng 12 vắt qua năm mới phải in đúng năm kết thúc
 *    (28/12/2026 - 01/01/2027, không phải 01/01/2026).
 * 2. Không được TỰ SINH lịch tháng trước khi kho lưu trữ trống — phải trả
 *    null để giao diện hiện trạng thái trống thay vì lịch bịa.
 * 3. a11y_modal.js phải theo dõi cả style (modal mở bằng display:flex),
 *    quản lý trạng thái mở bằng WeakSet và ngắt observer khi rời trang.
 *
 * File này nạp js/student.js THẬT trong sandbox VM, không chép lại logic.
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✕ [FAIL] ${name}`);
    console.error(`    Chi tiết: ${err.message}\n`);
    testsFailed++;
  }
}

console.log('--- KIỂM THỬ HỒI QUY CỔNG SINH VIÊN (TUẦN/NĂM, LỊCH THÁNG TRƯỚC, A11Y MODAL) ---');

const studentJsPath = path.resolve(__dirname, '../js/student.js');
const a11yJsPath = path.resolve(__dirname, '../js/a11y_modal.js');

/**
 * Dựng sandbox DOM tối thiểu và nạp các module thật theo đúng thứ tự
 * index.html: month_calendar -> scheduler -> common -> student.
 */
function bootStudentPortal(options = {}) {
  const store = Object.assign({}, options.store || {});

  const storage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const errors = [];

  function makeEl(id) {
    const el = {
      id,
      value: '',
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      dataset: {},
      textContent: '',
      innerHTML: '',
      checked: false,
      disabled: false,
      children: [],
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      getAttribute: () => null,
      removeAttribute() {},
      appendChild() {},
      remove() {},
      closest: () => null,
      focus() {},
      scrollIntoView() {},
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 })
    };
    return el;
  }

  const elementCache = {};
  const document = {
    readyState: 'complete',
    body: makeEl('body'),
    documentElement: makeEl('html'),
    getElementById: (id) => {
      if (!elementCache[id]) elementCache[id] = makeEl(id);
      return elementCache[id];
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(tag),
    createTextNode: (t) => ({ textContent: t }),
    addEventListener: (type, fn) => { (document._listeners[type] = document._listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent: () => true,
    activeElement: null,
    _listeners: {}
  };

  const sandboxWindow = {
    localStorage: storage,
    sessionStorage: storage,
    document,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 0,
    clearInterval: (id) => clearInterval(id),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    confirm: () => true,
    alert: (m) => { errors.push(String(m)); },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: async () => ({ ok: false, status: 0, text: async () => '', json: async () => ({}) }),
    Event: function (type) { this.type = type; },
    CustomEvent: function (type, p) { this.type = type; this.detail = p ? p.detail : null; },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    Blob: function () {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    innerWidth: 1280,
    innerHeight: 900,
    scrollY: 0,
    location: { href: 'http://localhost/index.html' },
    SchedulerEngine: undefined,
    MonthCalendarHelper: undefined,
    SampleDataManager: undefined,
    CloudSyncManager: undefined
  };

  const sandbox = {
    window: sandboxWindow,
    document,
    localStorage: storage,
    sessionStorage: storage,
    console: sandboxWindow.console,
    setTimeout: sandboxWindow.setTimeout,
    clearTimeout: sandboxWindow.clearTimeout,
    setInterval: () => 0,
    clearInterval: () => 0,
    Event: sandboxWindow.Event,
    CustomEvent: sandboxWindow.CustomEvent,
    MutationObserver: sandboxWindow.MutationObserver,
    getComputedStyle: sandboxWindow.getComputedStyle,
    fetch: sandboxWindow.fetch,
    Blob: sandboxWindow.Blob,
    URL: sandboxWindow.URL,
    requestAnimationFrame: sandboxWindow.requestAnimationFrame
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  ['js/month_calendar.js', 'js/scheduler.js', 'js/common.js'].forEach(rel => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8'), sandbox, { filename: rel });
  });

  // Đếm số lần sinh lịch tự động — nếu getPrevMonthSchedule còn gọi
  // runMonthSchedule thì test sẽ bắt được.
  let runMonthScheduleCalls = 0;
  if (sandboxWindow.SchedulerEngine) {
    sandboxWindow.SchedulerEngine.runMonthSchedule = function () {
      runMonthScheduleCalls++;
      return { month: 9, year: 2026, weeks: [] };
    };
  }

  vm.runInContext(fs.readFileSync(studentJsPath, 'utf8'), sandbox, { filename: 'js/student.js' });

  return {
    store,
    storage,
    sandbox,
    window: sandboxWindow,
    document,
    errors,
    getRunMonthScheduleCalls: () => runMonthScheduleCalls
  };
}

// ===========================================================================
// TEST 1: Tuần 4 tháng 12/2026 vắt qua năm mới -> năm kết thúc phải là 2027
// ===========================================================================
runTest('Tuần 4 tháng 12/2026 in fullRange 28/12/2026 - 01/01/2027', () => {
  const { window: w } = bootStudentPortal();
  assert.strictEqual(typeof w.studentTestHelper.getMonthWeeksConfig, 'function',
    'studentTestHelper phải export getMonthWeeksConfig để test gọi được');

  const weeks = w.studentTestHelper.getMonthWeeksConfig(12, 2026);
  assert.strictEqual(weeks.length, 4, 'Phải có đúng 4 tuần');

  const week4 = weeks[3];
  assert.strictEqual(week4.weekNumber, 4, 'Tuần thứ 4 phải có weekNumber = 4');
  assert.strictEqual(week4.startDateStr, '28/12', `Ngày bắt đầu tuần 4 phải là 28/12, thực tế ${week4.startDateStr}`);
  assert.strictEqual(week4.endDateStr, '01/01', `Ngày kết thúc tuần 4 phải là 01/01, thực tế ${week4.endDateStr}`);
  assert.strictEqual(week4.fullRange, '28/12/2026 - 01/01/2027',
    `fullRange phải vắt đúng sang năm 2027, thực tế "${week4.fullRange}"`);
  assert.ok(!week4.fullRange.endsWith('/2026'),
    `Năm kết thúc KHÔNG được là 2026: "${week4.fullRange}"`);
});

// ===========================================================================
// TEST 2: Tuần bình thường trong tháng 10/2026 giữ nguyên năm ở cả 2 đầu
// ===========================================================================
runTest('Tuần bình thường tháng 10/2026 giữ cùng năm 2026 ở start/end', () => {
  const { window: w } = bootStudentPortal();
  const weeks = w.studentTestHelper.getMonthWeeksConfig(10, 2026);
  assert.strictEqual(weeks.length, 4);

  weeks.forEach((week, idx) => {
    const parts = String(week.fullRange).split(' - ');
    assert.strictEqual(parts.length, 2, `Tuần ${idx + 1} fullRange sai định dạng: ${week.fullRange}`);
    assert.ok(parts[0].endsWith('/2026'), `Tuần ${idx + 1} ngày bắt đầu phải là năm 2026: ${parts[0]}`);
    assert.ok(parts[1].endsWith('/2026'), `Tuần ${idx + 1} ngày kết thúc phải là năm 2026: ${parts[1]}`);
  });
});

// ===========================================================================
// TEST 3: Kho lưu trữ trống -> getPrevMonthSchedule() trả null, không bịa lịch
// ===========================================================================
runTest('getPrevMonthSchedule trả null khi ALL_MONTHS/WEB_BACKUPS/PREV cache đều trống', () => {
  const { window: w, store, getRunMonthScheduleCalls } = bootStudentPortal();

  assert.strictEqual(typeof w.studentTestHelper.getPrevMonthSchedule, 'function',
    'studentTestHelper phải export getPrevMonthSchedule');

  // Đảm bảo đúng điều kiện "trống" (student.js có thể chưa ghi gì, nhưng kiểm cho chắc).
  assert.ok(!store.ts_scheduler_all_months_v1, 'ALL_MONTHS phải trống trước khi gọi');
  assert.ok(!store.ts_scheduler_web_backups_v1, 'WEB_BACKUPS phải trống trước khi gọi');
  assert.ok(!store.ts_scheduler_prev_month_result, 'PREV_MONTH_SCHEDULE phải trống trước khi gọi');

  const result = w.studentTestHelper.getPrevMonthSchedule();

  assert.strictEqual(result, null,
    `Phải trả null khi không có dữ liệu lưu trữ, thực tế: ${JSON.stringify(result)}`);
  assert.strictEqual(getRunMonthScheduleCalls(), 0,
    'KHÔNG được gọi SchedulerEngine.runMonthSchedule để tự sinh lịch tháng trước');
  assert.ok(!store.ts_scheduler_prev_month_result,
    'KHÔNG được ghi lịch tự sinh vào cache PREV_MONTH_SCHEDULE');
});

// ===========================================================================
// TEST 4: Dữ liệu lưu trữ THẬT vẫn được trả về (không phá tính năng cũ)
// ===========================================================================
runTest('getPrevMonthSchedule vẫn đọc được lịch thật từ kho ALL_MONTHS', () => {
  const archived = {
    month: 9,
    year: 2026,
    weeks: [{ weekNumber: 1, scheduleTable: { T2_S: { status: 'full' } } }]
  };
  const { window: w } = bootStudentPortal({
    store: {
      ts_scheduler_all_months_v1: JSON.stringify({ '2026-09': archived })
    }
  });

  const result = w.studentTestHelper.getPrevMonthSchedule();
  assert.ok(result, 'Phải trả về lịch lưu trữ thật');
  assert.strictEqual(result.month, 9);
  assert.strictEqual(result.year, 2026);
  assert.strictEqual(JSON.stringify(result.weeks), JSON.stringify(archived.weeks),
    'Lịch lưu trữ phải được giữ nguyên nội dung');
});

// ===========================================================================
// TEST 5: a11y_modal không còn câu lệnh rỗng `observer.disconnect;`
// ===========================================================================
runTest('a11y_modal.js không còn câu lệnh rỗng observer.disconnect;', () => {
  const src = fs.readFileSync(a11yJsPath, 'utf8');
  assert.ok(!/(^|\n)\s*observer\.disconnect\s*;\s*(\n|$)/.test(src),
    'Phải bỏ câu lệnh rỗng `observer.disconnect;` (không có dấu ngoặc gọi hàm)');
  assert.ok(/observer\.disconnect\(\)/.test(src),
    'Observer vẫn phải được disconnect() thật khi dọn dẹp');
});

// ===========================================================================
// TEST 6: Observer theo dõi style + WeakSet + chỉ gọi khi trạng thái đổi
// ===========================================================================
runTest('a11y_modal.js theo dõi class+style, dùng WeakSet và chặn gọi lặp', () => {
  const src = fs.readFileSync(a11yJsPath, 'utf8');

  const observeCall = src.match(/observer\.observe\([\s\S]{0,400}?\);/);
  assert.ok(observeCall, 'Phải có lời gọi observer.observe');
  assert.ok(/attributeFilter:\s*\[[^\]]*['"]class['"][^\]]*['"]style['"]/.test(observeCall[0]),
    'attributeFilter phải chứa cả class và style để bắt modal mở bằng style.display');

  assert.ok(/new WeakSet\(\)/.test(src),
    'Phải dùng WeakSet để theo dõi các modal đang mở');
  assert.ok(/openModals\.has\(modal\)/.test(src),
    'Phải kiểm tra trạng thái cũ trước khi gọi onModalOpened/onModalClosed');
  assert.ok(/openModals\.add\(modal\)/.test(src),
    'Phải đánh dấu modal đã mở trong WeakSet');
  assert.ok(/openModals\.delete\(modal\)/.test(src),
    'Phải gỡ modal khỏi WeakSet khi đóng');
  assert.ok(/style\.display/.test(src) || /hasOpenState/.test(src),
    'Phải nhận diện modal đang hiển thị qua style.display');
});

// ===========================================================================
// TEST 7: Ngắt observer khi pagehide + có guard môi trường không có window
// ===========================================================================
runTest('a11y_modal.js disconnect observer trên pagehide và guard window', () => {
  const src = fs.readFileSync(a11yJsPath, 'utf8');

  const pagehideBlock = src.match(/addEventListener\(\s*['"]pagehide['"][\s\S]{0,400}?disconnect\(\)/);
  assert.ok(pagehideBlock,
    'Phải đăng ký pagehide và gọi observer.disconnect() bên trong');
  assert.ok(/typeof window !== 'undefined'/.test(src),
    'Phải guard `typeof window !== \'undefined\'` cho môi trường không có window');
  assert.ok(/document\.addEventListener\(\s*['"]keydown['"]\s*,\s*handleKeydown/.test(src),
    'Vẫn phải giữ focus trap qua keydown như trước');
});

// ===========================================================================
// TEST 7b: Public payload chỉ có allMonthSchedules + activeMonth
// ===========================================================================
runTest('Đọc được lịch tháng đang áp dụng từ allMonthSchedules khi thiếu monthSchedule', () => {
  const archived = {
    month: 11,
    year: 2026,
    weeks: [{ weekNumber: 1, scheduleTable: { T2_S: { status: 'full' } } }]
  };
  const { window: w } = bootStudentPortal({
    store: {
      ts_scheduler_active_month_v1: JSON.stringify({ month: 11, year: 2026 }),
      ts_scheduler_all_months_v1: JSON.stringify({ '2026-11': archived })
    }
  });
  const schedule = w.studentTestHelper.readMonthScheduleStore();
  assert.ok(schedule, 'Phải tìm được lịch trong allMonthSchedules');
  assert.strictEqual(schedule.month, 11);
  assert.strictEqual(schedule.weeks[0].scheduleTable.T2_S.status, 'full');
});

// ===========================================================================
// TEST 8: Ca nền 1 người vẫn hiển thị đủ người thêm thứ 2/thứ 3
// ===========================================================================
runTest('Ca 1 người/ca có người thêm: hiển thị đủ 3 người, trạng thái đủ + số thêm', () => {
  const { window: w } = bootStudentPortal();
  const student = (id, studentId, fullName, role) => ({ id, studentId, fullName, role });

  const slot = {
    capacity: 1,
    status: 'full',
    shiftInfo: { dayName: 'Thứ 2', period: 'Sáng', time: '07:30 - 11:30' },
    oldMember: student('s1', '2102001', 'Nguyen Van A', 'old'),
    newMember: student('s2', '2211005', 'Tran Thi B', 'new'),
    thirdMember: student('s3', '2311007', 'Le Van C', 'new')
  };
  const html = w.studentTestHelper.renderReadOnlyShiftSlot('T2_S', slot);
  ['Nguyen Van A', 'Tran Thi B', 'Le Van C'].forEach(name => {
    assert.ok(html.includes(name), `Phải hiển thị ${name} dù mức nền là 1 người`);
  });
  assert.ok(html.includes('✓ Đủ 1 bạn · +2 thêm'),
    'Trạng thái phải ghi đủ người chính và số người thêm');
  assert.ok(!/Chính Thức|Tập Sự|Người thứ 3/.test(html),
    'Thẻ ca công khai không được gắn nhãn phân loại vai trò');
});

runTest('Ca 2 người/ca có người thêm thứ 3: hiển thị 3 người và +1 thêm', () => {
  const { window: w } = bootStudentPortal();
  const student = (id, studentId, fullName, role) => ({ id, studentId, fullName, role });
  const slot = {
    capacity: 2,
    status: 'full',
    shiftInfo: { dayName: 'Thứ 3', period: 'Chiều', time: '13:00 - 16:30' },
    oldMember: student('s1', '2102001', 'Nguyen Van A', 'old'),
    newMember: student('s2', '2211005', 'Tran Thi B', 'new'),
    thirdMember: student('s3', '2311007', 'Le Van C', 'new')
  };
  const html = w.studentTestHelper.renderReadOnlyShiftSlot('T3_C', slot);
  ['Nguyen Van A', 'Tran Thi B', 'Le Van C'].forEach(name => {
    assert.ok(html.includes(name), `Phải hiển thị ${name}`);
  });
  assert.ok(html.includes('✓ Đủ 2 bạn · +1 thêm'), 'Trạng thái phải ghi đủ 2 người nền + 1 thêm');
});

// ===========================================================================
// TEST 9: Trích xuất ca cá nhân của người thêm vẫn thấy người chính + người thêm
// ===========================================================================
runTest('Người thêm thứ 2 ở ca nền 1 người vẫn thấy người chính và người thêm thứ 3', () => {
  const { window: w } = bootStudentPortal();
  const student = (id, studentId, fullName, role) => ({ id, studentId, fullName, role });
  const schedule = {
    weeks: [{
      scheduleTable: {
        T2_S: {
          capacity: 1,
          oldMember: student('s1', '2102001', 'Nguyen Van A', 'old'),
          newMember: student('s2', '2211005', 'Tran Thi B', 'new'),
          thirdMember: student('s3', '2311007', 'Le Van C', 'new')
        }
      }
    }]
  };
  const mine = w.studentTestHelper.extractStudentShiftsFromSchedule('2211005', schedule);
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].selfPosition, 'new');
  assert.strictEqual(mine[0].capacity, 1);
  assert.strictEqual(mine[0].partnerName, 'Nguyen Van A');
  assert.strictEqual(mine[0].thirdName, 'Le Van C');
});

console.log('\n==================================================');
console.log(`KẾT QUẢ: ${testsPassed}/${testsPassed + testsFailed} TESTS ĐẠT CHUẨN`);
if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
