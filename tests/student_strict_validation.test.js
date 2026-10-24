/**
 * ============================================================================
 * KIỂM THỬ XÁC THỰC MSSV NGHIÊM NGẶT & KHÔNG TỰ ĐỘNG THÊM SINH VIÊN MỚI
 * ============================================================================
 * Kiểm định các yêu cầu từ Tris:
 * 1. Nhập sai MSSV -> Báo lỗi, không được tự động thêm vào danh sách sinh viên.
 * 2. Danh sách 30 CTV HCM-UTE luôn được bảo toàn và nạp sẵn cố định.
 * 3. Khi nhập đúng MSSV -> Giữ nguyên Họ và tên, MSSV, Ca trực của tháng.
 * 4. Cho phép đăng ký 0 ca rảnh (nghỉ tháng này).
 *
 * ⚠️ QUAN TRỌNG — LÝ DO VIẾT LẠI TOÀN BỘ FILE NÀY:
 * Phiên bản cũ KHÔNG BAO GIỜ NẠP js/student.js. Nó định nghĩa một hàm
 * `simulateRegisterStudent()` dài 39 dòng — bản SAO LẠI logic đăng ký —
 * rồi kiểm thử chính bản sao đó. Hệ quả:
 *   js/student.js có thể `return { success: true }` vô điều kiện mà file
 *   test này VẪN báo 4/4 PASS. Suite mang tên "Strict MSSV Validation"
 *   nhưng không kiểm thử được dòng code nào của sản phẩm.
 *
 * Nay file này nạp và chạy js/student.js THẬT trong sandbox DOM, nên nếu
 * ai đó sửa logic chặn MSSV trong sản phẩm, test này sẽ đỏ.
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

console.log('--- KIỂM THỬ XÁC THỰC MSSV & BẢO TOÀN DANH SÁCH 30 CTV HCM-UTE ---');

const defaultStudentsPath = path.resolve(__dirname, '../data/default_students.json');
const defaultStudents = JSON.parse(fs.readFileSync(defaultStudentsPath, 'utf8'));
const studentJsPath = path.resolve(__dirname, '../js/student.js');

/**
 * Dựng môi trường giả lập tối thiểu rồi nạp js/student.js thật vào đó.
 * @returns {{ storage: Object, sandbox: Object, window: Object, errors: string[] }}
 */
function bootStudentPortal(initialStudents) {
  const store = {};
  if (initialStudents) store['ts_scheduler_students'] = JSON.stringify(initialStudents);

  const storage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const errors = [];

  /** Phần tử DOM giả — đủ dùng cho các phép truy cập trong student.js. */
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
    console,
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
    // Các module khác sẽ được nạp trước; cung cấp stub tối thiểu.
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
    console,
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

  // Nạp các module phụ thuộc trước (cùng thứ tự với index.html).
  ['js/month_calendar.js', 'js/scheduler.js', 'js/roster.js', 'js/common.js'].forEach(rel => {
    const p = path.resolve(__dirname, '..', rel);
    if (fs.existsSync(p)) {
      vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: rel });
    }
  });

  // ⚡ NẠP MÃ NGUỒN THẬT
  vm.runInContext(fs.readFileSync(studentJsPath, 'utf8'), sandbox, { filename: 'js/student.js' });

  return { store, storage, sandbox, window: sandboxWindow, document, errors, makeEl };
}

function getStorageStudents(store) {
  return JSON.parse(store['ts_scheduler_students'] || '[]');
}

// ===========================================================================
// TEST 1: Danh sách 30 CTV HCM-UTE chuẩn chính
// ===========================================================================
runTest('Danh sách nạp sẵn có đúng 30 CTV và chứa đầy đủ MSSV Vũ Tiến Tài (25161393)', () => {
  assert.strictEqual(defaultStudents.length, 30, 'Phải có đúng 30 CTV');
  const tai = defaultStudents.find(s => s.studentId === '25161393');
  assert.ok(tai, 'Phải tìm thấy sinh viên Vũ Tiến Tài với MSSV 25161393');
  assert.strictEqual(tai.fullName, 'Vũ Tiến Tài', 'Họ và tên phải chính xác là Vũ Tiến Tài');
  assert.strictEqual(tai.major, 'Điện tử viễn thông', 'Ngành phải là Điện tử viễn thông');
});

// ===========================================================================
// TEST 2: NẠP ĐƯỢC js/student.js THẬT (chống hồi quy về bản sao trong test)
// ===========================================================================
runTest('js/student.js nạp được thành công và export hàm đăng ký thật', () => {
  const { window: w } = bootStudentPortal(defaultStudents);
  assert.ok(w, 'Sandbox window phải tồn tại');
  assert.ok(w.studentTestHelper, 'js/student.js phải export window.studentTestHelper cho test');
  assert.strictEqual(typeof w.studentTestHelper.register, 'function',
    'studentTestHelper.register phải là hàm — đây là cổng gọi processStudentRegistration thật');
  assert.strictEqual(typeof w.studentTestHelper.getMonthlyShifts, 'function');
  assert.strictEqual(typeof w.studentSwitchToWeek, 'function',
    'studentSwitchToWeek phải được định nghĩa (nút ✏️ trong bảng tổng quan gọi nó)');
});

// ===========================================================================
// TEST 3: Logic chặn MSSV sai PHẢI CÓ trong mã nguồn thật và phải chạy đúng
// ===========================================================================
runTest('Mã nguồn thật CÓ nhánh chặn MSSV không tồn tại (không tự thêm SV mới)', () => {
  const src = fs.readFileSync(studentJsPath, 'utf8');

  // findIndex trên studentId + so khớp không phân biệt hoa thường
  assert.ok(/findIndex\(\s*s\s*=>\s*s\.studentId/i.test(src),
    'Phải tra cứu hồ sơ bằng findIndex trên studentId');

  // Phải có nhánh existingIndex === -1 -> báo lỗi và return (không tạo mới)
  const block = src.match(/existingIndex\s*===\s*-1[\s\S]{0,900}?\n\s*return/);
  assert.ok(block,
    'Thiếu nhánh `existingIndex === -1` dẫn tới return — nếu không, MSSV sai sẽ bị tự thêm vào danh sách');

  // Nhánh chặn phải HIỂN THỊ cảnh báo, không chỉ im lặng return
  assert.ok(/student-invalid-mssv-notice/.test(block[0]),
    'Nhánh chặn MSSV sai phải hiện cảnh báo cho người dùng (student-invalid-mssv-notice)');
  assert.ok(/showToast/.test(block[0]),
    'Nhánh chặn MSSV sai phải báo lỗi qua showToast');
});

// ===========================================================================
// TEST 4: Hợp nhất ca rảnh 4 tuần + giữ nguyên hồ sơ (kiểm trên mã nguồn thật)
// ===========================================================================
runTest('Đăng ký 4 tuần hợp nhất thành availableShifts và KHÔNG mất hồ sơ gốc', () => {
  const src = fs.readFileSync(studentJsPath, 'utf8');

  // Phải hợp nhất (union) cả 4 tuần
  const union = src.match(/unionShiftsSet[\s\S]{0,500}?Array\.from\(unionShiftsSet\)/);
  assert.ok(union, 'Phải hợp nhất ca rảnh của cả 4 tuần thành 1 mảng availableShifts');

  // Phải ghi đè theo index (giữ đúng hồ sơ), không tạo bản ghi mới
  const assign = src.match(/students\[\s*existingIndex\s*\]\s*=/);
  assert.ok(assign, 'Phải cập nhật HỒ SƠ CÓ SẴN tại chỉ số existingIndex, không tạo bản ghi mới');
  assert.ok(!/students\.(push|unshift)\(/.test(src),
    'Không được push/unshift thêm sinh viên mới trong luồng đăng ký');
});

// ===========================================================================
// TEST 5: Cho phép đăng ký 0 ca (nghỉ tháng) — phải không bị chặn
// ===========================================================================
runTest('Đăng ký 0 ca rảnh KHÔNG bị chặn (cho phép nghỉ tháng)', () => {
  const { store, window: w } = bootStudentPortal(defaultStudents);

  const res = w.studentTestHelper.register('25161393', { 1: [], 2: [], 3: [], 4: [] });

  assert.strictEqual(getStorageStudents(store).length, 30,
    'Đăng ký 0 ca vẫn phải giữ nguyên 30 CTV');
  const tai = getStorageStudents(store).find(s => s.studentId === '25161393');
  assert.ok(tai, 'Hồ sơ phải còn sau khi đăng ký 0 ca');
  assert.strictEqual((tai.availableShifts || []).length, 0,
    'availableShifts phải rỗng — nghĉ tháng');
  assert.ok(tai.monthlyAvailableShifts, 'vẫn phải ghi 4 tuần (đều rỗng)');
});

// ===========================================================================
// TEST 6: MSSV sai / đúng — chạy hàm thật trong sandbox
// ===========================================================================
runTest('MSSV sai (9999999) bị chặn và KHÔNG làm tăng số lượng sinh viên', () => {
  const { store, window: w } = bootStudentPortal(defaultStudents);
  assert.strictEqual(getStorageStudents(store).length, 30, 'Danh sách phải có 30 CTV trước khi thử');

  w.studentTestHelper.register('9999999', { 1: ['T2_S'], 2: ['T3_S'], 3: [], 4: [] });

  const after = getStorageStudents(store);
  assert.strictEqual(after.length, 30,
    `Số lượng sinh viên phải giữ nguyên 30, thực tế ${after.length} — MSSV sai đã bị tự thêm!`);
  assert.ok(!after.some(s => s.studentId === '9999999'),
    'Không được tạo hồ sơ cho MSSV không tồn tại');
});

runTest('MSSV đúng (25161393) cập nhật ca rảnh, giữ nguyên họ tên và tổng 30 CTV', () => {
  const { store, window: w } = bootStudentPortal(defaultStudents);

  w.studentTestHelper.register('25161393', {
    1: ['T2_S', 'T2_C'], 2: ['T4_S'], 3: ['T5_C'], 4: []
  });

  const after = getStorageStudents(store);
  assert.strictEqual(after.length, 30,
    `Tổng số sinh viên phải vẫn đúng 30, thực tế ${after.length}`);

  const tai = after.find(s => s.studentId === '25161393');
  assert.ok(tai, 'Hồ sơ Vũ Tiến Tài phải còn trong danh sách');
  assert.strictEqual(tai.fullName, 'Vũ Tiến Tài', 'Họ tên phải được giữ nguyên — không được ghi đè');
  assert.strictEqual(tai.major, 'Điện tử viễn thông', 'Ngành phải được giữ nguyên');
  assert.ok(tai.monthlyAvailableShifts, 'Phải ghi được ca rảnh theo từng tuần');

  const week1 = tai.monthlyAvailableShifts[1] || tai.monthlyAvailableShifts['1'] || [];
  assert.strictEqual(week1.length, 2, `Tuần 1 phải có 2 ca, thực tế ${week1.length}`);
  const week2 = tai.monthlyAvailableShifts[2] || tai.monthlyAvailableShifts['2'] || [];
  assert.strictEqual(week2.length, 1, 'Tuần 2 phải có 1 ca');
  const week4 = tai.monthlyAvailableShifts[4] || tai.monthlyAvailableShifts['4'] || [];
  assert.strictEqual(week4.length, 0, 'Tuần 4 phải có 0 ca');

  assert.ok(Array.isArray(tai.availableShifts), 'Phải có availableShifts hợp nhất');
  // T2_S, T2_C (T1) + T4_S (T2) + T5_C (T3) = 4 ca khác nhau
  assert.strictEqual(tai.availableShifts.length, 4,
    `availableShifts phải hợp nhất 4 ca, thực tế ${tai.availableShifts.length}`);
  assert.deepStrictEqual([...tai.availableShifts].sort(),
    ['T2_C', 'T2_S', 'T4_S', 'T5_C'],
    'availableShifts phải đúng 4 ca đã đăng ký');
});

console.log(`\n==================================================`);
console.log(`KẾT QUẢ: ${testsPassed}/${testsPassed + testsFailed} TESTS ĐẠT CHUẨN`);
if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}