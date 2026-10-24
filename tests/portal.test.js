/**
 * ============================================================================
 * AUTOMATED TEST SUITE: PORTAL VISIBILITY & LOOKUP (QA-AGENT)
 * ============================================================================
 * Kiểm thử toàn diện:
 * 1. Cơ chế đóng/mở cổng đăng ký và cờ publishSchedule:
 *    - Cổng mở & publishSchedule = false -> Lịch trực bị ẩn, form đăng ký hiển thị.
 *    - Cổng mở & publishSchedule = true  -> Lịch trực hiển thị, form đăng ký hiển thị.
 *    - Cổng đóng -> Form đăng ký bị ẩn, nút submit disabled, lịch trực hiển thị.
 *    - Đổi ca luôn giữ nguyên ở mọi trạng thái.
 * 2. Tính năng tra cứu lịch trực cá nhân theo MSSV khi lịch mở vs đóng.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Tạo Mock Storage & DOM môi trường Client-side
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

// Chống treo event loop trong Node.js
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

// 2. Nạp SchedulerEngine
// month_calendar.js phai duoc nap TRUOC scheduler.js: scheduler.js lay
// MonthCalendarHelper tu window va nem loi neu chua co.
require('../js/month_calendar.js');
require('../js/scheduler.js');

// 3. Nạp và kích hoạt Student Portal Logic
const studentJsPath = path.resolve(__dirname, '../js/student.js');
const studentJsContent = fs.readFileSync(studentJsPath, 'utf8');
// Tiện ích dùng chung phải nạp trước (giống thứ tự <script> trong index.html).
eval(fs.readFileSync(path.resolve(__dirname, '../js/common.js'), 'utf8'));
eval(studentJsContent);

// Test Runner Helpers
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

console.log('================================================================');
console.log('🌐 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG - CỔNG SINH VIÊN & TRA CỨU MSSV (PORTAL QA)');
console.log('================================================================\n');

const secReg = elementsMap['section-student-registration'];
const secTimetable = elementsMap['section-student-timetable'];
const secLookup = elementsMap['section-student-lookup'];
const secPending = elementsMap['student-schedule-pending-notice'];
const swapCallout = elementsMap['section-student-swap-callout'];
const btnSubmit = elementsMap['btn-submit-reg'];
const inputLookup = elementsMap['input-lookup-mssv'];
const btnLookup = elementsMap['btn-lookup'];
const lookupResult = elementsMap['lookup-result'];

// ============================================================================
// TEST GROUP 1: LOGIC ĐÓNG/MỞ CỔNG & CỜ CÔNG BỐ LỊCH (PUBLISHSCHEDULE)
// ============================================================================

runTest('Portal Visibility: Cổng MỞ và CHƯA CÔNG BỐ (publishSchedule: false) -> Lịch trực bị ẩn, form đăng ký mở', () => {
  mockLocalStorage.setItem('ts_scheduler_reg_config', JSON.stringify({
    mode: 'always_open',
    publishSchedule: false
  }));
  global.window.dispatchEvent({ type: 'storage', key: 'ts_scheduler_reg_config' });

  assert.strictEqual(secReg.style.display, 'block', 'Form đăng ký phải hiển thị khi cổng mở');
  assert.strictEqual(secTimetable.style.display, 'none', 'Bảng lịch trực phải BỊ ẨN khi chưa công bố');
  assert.strictEqual(secLookup.style.display, 'none', 'Phân hệ tra cứu MSSV phải BỊ ẨN khi chưa công bố');
  assert.strictEqual(secPending.style.display, 'block', 'Thông báo chờ công bố lịch phải hiển thị');
  assert.strictEqual(swapCallout.style.display, 'flex', 'Nút đổi ca trực luôn giữ nguyên hiển thị');
  assert.strictEqual(btnSubmit.disabled, false, 'Nút submit đăng ký phải khả dụng khi cổng mở');
});

runTest('Portal Visibility: Cổng MỞ và ĐÃ CÔNG BỐ (publishSchedule: true) -> Lịch trực và Form đăng ký cùng hiển thị', () => {
  mockLocalStorage.setItem('ts_scheduler_reg_config', JSON.stringify({
    mode: 'always_open',
    publishSchedule: true
  }));
  global.window.dispatchEvent({ type: 'storage', key: 'ts_scheduler_reg_config' });

  assert.strictEqual(secReg.style.display, 'block', 'Form đăng ký hiển thị');
  assert.strictEqual(secTimetable.style.display, 'block', 'Bảng lịch trực ĐƯỢC HIỂN THỊ khi Admin công bố');
  assert.strictEqual(secLookup.style.display, 'block', 'Phân hệ tra cứu MSSV ĐƯỢC HIỂN THỊ khi Admin công bố');
  assert.strictEqual(secPending.style.display, 'none', 'Thông báo chờ phải bị ẩn');
  assert.strictEqual(swapCallout.style.display, 'flex', 'Nút đổi ca luôn giữ nguyên');
});

runTest('Portal Visibility: Cổng ĐÓNG (mode: closed) -> Form đăng ký bị ẩn hoàn toàn, Lịch trực được hiển thị', () => {
  mockLocalStorage.setItem('ts_scheduler_reg_config', JSON.stringify({
    mode: 'closed',
    publishSchedule: false,
    closedNotice: 'Cổng đăng ký đã đóng để chốt lịch chính thức.'
  }));
  global.window.dispatchEvent({ type: 'storage', key: 'ts_scheduler_reg_config' });

  assert.strictEqual(secReg.style.display, 'none', 'Form đăng ký phải BỊ ẨN khi cổng đóng');
  assert.strictEqual(btnSubmit.disabled, true, 'Nút submit đăng ký phải bị vô hiệu hóa (disabled)');
  assert.strictEqual(secTimetable.style.display, 'block', 'Lịch trực tuần ĐƯỢC HIỂN THỊ khi cổng đóng');
  assert.strictEqual(secLookup.style.display, 'block', 'Tra cứu MSSV ĐƯỢC HIỂN THỊ khi cổng đóng');
  assert.strictEqual(secPending.style.display, 'none', 'Thông báo chờ phải bị ẩn');
  assert.strictEqual(swapCallout.style.display, 'flex', 'Nút đổi ca luôn giữ nguyên');
});

runTest('Portal Visibility: Khung giờ time_window - Ngoài giờ (chưa tới hoặc đã hết hạn) tương đương Cổng Đóng', () => {
  // 1. Đã hết hạn (endTime trong quá khứ)
  mockLocalStorage.setItem('ts_scheduler_reg_config', JSON.stringify({
    mode: 'time_window',
    startTime: '2020-01-01T00:00',
    endTime: '2020-01-02T00:00',
    publishSchedule: false
  }));
  global.window.dispatchEvent({ type: 'storage', key: 'ts_scheduler_reg_config' });

  assert.strictEqual(secReg.style.display, 'none', 'Hết hạn đăng ký: Form đăng ký phải bị ẩn');
  assert.strictEqual(btnSubmit.disabled, true, 'Nút submit phải bị vô hiệu hóa');
  assert.strictEqual(secTimetable.style.display, 'block', 'Bảng lịch trực hiển thị');

  // 2. Chưa tới giờ mở (startTime trong tương lai xa)
  mockLocalStorage.setItem('ts_scheduler_reg_config', JSON.stringify({
    mode: 'time_window',
    startTime: '2099-01-01T00:00',
    endTime: '2099-01-02T00:00',
    publishSchedule: false
  }));
  global.window.dispatchEvent({ type: 'storage', key: 'ts_scheduler_reg_config' });

  assert.strictEqual(secReg.style.display, 'none', 'Chưa tới giờ mở: Form đăng ký phải bị ẩn');
  assert.strictEqual(btnSubmit.disabled, true);
  assert.strictEqual(secTimetable.style.display, 'block');
});

runTest('Portal Visibility: Khung giờ time_window - Đang trong thời gian mở đăng ký', () => {
  const past = new Date(Date.now() - 3600000).toISOString();
  const future = new Date(Date.now() + 3600000).toISOString();

  mockLocalStorage.setItem('ts_scheduler_reg_config', JSON.stringify({
    mode: 'time_window',
    startTime: past,
    endTime: future,
    publishSchedule: false
  }));
  global.window.dispatchEvent({ type: 'storage', key: 'ts_scheduler_reg_config' });

  assert.strictEqual(secReg.style.display, 'block', 'Đang trong khung giờ mở: Form đăng ký hiển thị');
  assert.strictEqual(btnSubmit.disabled, false, 'Nút submit sẵn sàng');
  assert.strictEqual(secTimetable.style.display, 'none', 'publishSchedule = false nên lịch trực bị ẩn');
});

// ============================================================================
// TEST GROUP 2: TÍNH NĂNG TRA CỨU MSSV KHI LỊCH MỞ VS ĐÓNG
// ============================================================================

runTest('Tra cứu MSSV: Khi hệ thống chưa có dữ liệu lịch phân công -> Hiển thị cảnh báo chưa công bố', () => {
  mockLocalStorage.removeItem('ts_scheduler_schedule_result');
  mockLocalStorage.removeItem('ts_scheduler_month_result');
  mockLocalStorage.removeItem('ts_scheduler_two_week_result');

  inputLookup.value = '2102001';
  btnLookup.dispatchEvent({ type: 'click' });

  assert.strictEqual(lookupResult.style.display, 'block');
  assert.ok(
    lookupResult.innerHTML.includes('Chưa có lịch trực công bố'),
    'Phải thông báo Ban điều hành đang hoàn thiện phân công'
  );
});

runTest('Tra cứu MSSV: Khi đã có lịch trực 1 tuần -> Tìm thấy ca trực, hiển thị bạn trực cùng và vai trò', () => {
  const mockSchedule = {
    scheduleTable: {
      T2_S: {
        shiftInfo: { id: 'T2_S', dayKey: 'T2', dayName: 'Thứ 2', period: 'Sáng', time: '07:30 - 11:30' },
        oldMember: { studentId: '2102001', fullName: 'Nguyễn Văn A', phone: '0901234567', role: 'old' },
        newMember: { studentId: '2211005', fullName: 'Trần Thị B', phone: '0907654321', role: 'new' },
        status: 'full'
      },
      T3_C: {
        shiftInfo: { id: 'T3_C', dayKey: 'T3', dayName: 'Thứ 3', period: 'Chiều', time: '13:00 - 16:30' },
        oldMember: { studentId: '2102002', fullName: 'Lê Văn C', phone: '0901111222', role: 'old' },
        newMember: { studentId: '2102001', fullName: 'Nguyễn Văn A', phone: '0901234567', role: 'new' },
        status: 'full'
      }
    }
  };

  mockLocalStorage.setItem('ts_scheduler_schedule_result', JSON.stringify(mockSchedule));

  // Tra cứu sinh viên Nguyễn Văn A (MSSV: 2102001)
  inputLookup.value = '2102001';
  btnLookup.dispatchEvent({ type: 'click' });

  assert.strictEqual(lookupResult.style.display, 'block');
  assert.ok(lookupResult.innerHTML.includes('Nguyễn Văn A'), 'Phải hiển thị họ tên sinh viên tra cứu');
  assert.ok(lookupResult.innerHTML.includes('Trần Thị B'), 'Phải hiển thị tên đối tác trực cùng ca T2_S');
  assert.ok(lookupResult.innerHTML.includes('Thứ 2'), 'Phải hiển thị Thứ 2');
  assert.ok(lookupResult.innerHTML.includes('07:30 - 11:30'), 'Phải hiển thị khung giờ ca trực');
});

runTest('Tra cứu MSSV: Hỗ trợ tìm kiếm không phân biệt chữ hoa / chữ thường (Case-Insensitive)', () => {
  // Tra cứu bằng chữ hoa '2102001'
  inputLookup.value = '2102001';
  btnLookup.dispatchEvent({ type: 'click' });
  assert.ok(lookupResult.innerHTML.includes('Nguyễn Văn A'));

  // Giả lập MSSV có chữ như 'UTE2102'
  const mockScheduleWithLetters = {
    scheduleTable: {
      T4_S: {
        shiftInfo: { id: 'T4_S', dayKey: 'T4', dayName: 'Thứ 4', period: 'Sáng', time: '07:30 - 11:30' },
        oldMember: { studentId: 'UTE2102', fullName: 'Phạm Minh D', phone: '0912345678', role: 'old' },
        newMember: null,
        status: 'partial'
      }
    }
  };
  mockLocalStorage.setItem('ts_scheduler_schedule_result', JSON.stringify(mockScheduleWithLetters));

  // Tra cứu bằng chữ thường 'ute2102'
  inputLookup.value = 'ute2102';
  btnLookup.dispatchEvent({ type: 'click' });
  assert.ok(lookupResult.innerHTML.includes('Phạm Minh D'), 'Tra cứu chữ thường phải khớp với MSSV chữ hoa trong database');
});

runTest('Tra cứu MSSV: Khi nhập MSSV không có ca trực trong tháng -> Hiển thị thông báo không tìm thấy', () => {
  inputLookup.value = '9999999';
  btnLookup.dispatchEvent({ type: 'click' });

  assert.strictEqual(lookupResult.style.display, 'block');
  assert.ok(
    lookupResult.innerHTML.includes('Không tìm thấy lịch trực của MSSV'),
    'Phải thông báo rõ ràng không tìm thấy lịch trực của MSSV này'
  );
  assert.ok(lookupResult.innerHTML.includes('9999999'));
});

runTest('Tra cứu MSSV: Khi để trống ô nhập hoặc chỉ chứa khoảng trắng -> Hệ thống xử lý an toàn', () => {
  lookupResult.innerHTML = '';
  inputLookup.value = '   ';
  btnLookup.dispatchEvent({ type: 'click' });

  assert.strictEqual(
    lookupResult.innerHTML,
    '',
    'Không được hiển thị kết quả rác khi người dùng không nhập MSSV'
  );
});

runTest('Tra cứu MSSV: Tra cứu thành công trong lịch luân phiên 4 tuần (Month Schedule)', () => {
  const mockMonth = {
    month: 10,
    year: 2026,
    weeks: [
      {
        weekNumber: 1,
        scheduleTable: {
          T2_S: {
            shiftInfo: { id: 'T2_S', dayName: 'Thứ 2', period: 'Sáng', time: '07:30 - 11:30' },
            oldMember: { studentId: '2102001', fullName: 'Nguyễn Văn A', role: 'old' },
            newMember: { studentId: '2211005', fullName: 'Trần Thị B', role: 'new' }
          }
        }
      },
      {
        weekNumber: 2,
        scheduleTable: {}
      },
      {
        weekNumber: 3,
        scheduleTable: {
          T5_C: {
            shiftInfo: { id: 'T5_C', dayName: 'Thứ 5', period: 'Chiều', time: '13:00 - 16:30' },
            oldMember: { studentId: '2102001', fullName: 'Nguyễn Văn A', role: 'old' },
            newMember: { studentId: '2211006', fullName: 'Vũ Quốc C', role: 'new' }
          }
        }
      },
      {
        weekNumber: 4,
        scheduleTable: {}
      }
    ]
  };

  mockLocalStorage.setItem('ts_scheduler_month_result', JSON.stringify(mockMonth));

  inputLookup.value = '2102001';
  btnLookup.dispatchEvent({ type: 'click' });

  assert.ok(lookupResult.innerHTML.includes('Tuần 1'), 'Phải hiển thị ca ở Tuần 1');
  assert.ok(lookupResult.innerHTML.includes('Tuần 3'), 'Phải hiển thị ca ở Tuần 3');
  assert.ok(lookupResult.innerHTML.includes('Vũ Quốc C'), 'Phải hiển thị bạn trực cùng ở Tuần 3');
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
