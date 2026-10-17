/**
 * ============================================================================
 * AUTOMATED TEST SUITE: ADMIN MONTH NAVIGATION & AUTO-BACKUP (QA-AGENT)
 * ============================================================================
 * Kiểm thử toàn diện tính năng:
 * 1. Hiển thị ngày tháng chính xác trên bảng phân công (MonthCalendarHelper)
 *    cho các tháng 10/2026, 11/2026, 12/2026, 01/2027 (Kỳ 13)
 * 2. Điều hướng chuyển tháng: Next month, Prev month, Quick select
 * 3. Tự động sao lưu (Auto-backup) tháng cũ khi chuyển sang tháng mới
 * 4. Lưu trữ lịch đa tháng trong STORAGE_KEYS.ALL_MONTHS và đồng bộ Cloud
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock Storage & DOM môi trường Client-side
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
    children: [],
    options: [],
    selectedIndex: 0,
    addEventListener: () => {},
    appendChild(child) {
      this.children.push(child);
      if (this.tagName === 'SELECT') {
        this.options.push(child);
      }
    },
    setAttribute: () => {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return el;
}

const requiredIds = [
  'admin-auth-guard', 'admin-dashboard-container', 'admin-current-user', 'admin-user-badge',
  'admin-login-error', 'admin-pin-error', 'admin-pin-display', 'admin-account-form',
  'admin-pin-container', 'btn-admin-logout', 'tbody-admin-accounts', 'modal-admin-account',
  'modal-title-account', 'form-admin-account', 'input-account-username', 'input-account-fullname',
  'input-account-password', 'input-account-role', 'admin-lock-overlay', 'admin-lock-countdown',
  'schedule-timetable-wrapper', 'tbody-schedule', 'schedule-stats-summary', 'table-students',
  'tbody-students', 'badge-student-count', 'reg-status-badge', 'reg-status-text',
  'admin-quick-stats', 'badge-total-students', 'badge-assigned-shifts', 'badge-completion-rate',
  'admin-active-sync-badge', 'admin-sync-device-id', 'admin-sync-last-time', 'admin-sync-endpoint',
  'admin-sync-payload-size', 'admin-sync-toggle-cloud', 'admin-sync-device-uuid',
  'btn-admin-auto-schedule', 'btn-export-csv', 'btn-clear-schedule', 'btn-clear-students',
  'btn-toggle-publish-schedule', 'btn-publish-schedule-text', 'btn-publish-schedule-icon',
  'btn-print-schedule', 'btn-open-excel-modal', 'btn-quick-copy-sheet', 'btn-export-full-excel',
  'btn-export-weekly-excel', 'btn-export-attendance-excel', 'modal-excel-options',
  'admin-cloud-indicator', 'admin-cloud-sync-status', 'admin-cloud-sync-time',
  'tbody-web-backups', 'badge-backup-count', 'btn-create-web-backup', 'btn-hero-view-payroll',
  'modal-month-payroll', 'modal-payroll-title', 'payroll-stat-total-students',
  'payroll-stat-office-shifts', 'payroll-stat-event-units', 'payroll-stat-total-units',
  'tbody-month-payroll', 'payroll-role-filter', 'payroll-search-input',
  'btn-print-payroll', 'btn-export-payroll-csv', 'modal-add-event', 'form-add-event',
  'input-event-title', 'input-event-date', 'select-event-shift', 'input-event-location',
  'input-event-note', 'event-student-list-container', 'event-student-search',
  'btn-open-add-event', 'tbody-events-list', 'badge-event-count',
  // Month navigation elements
  'btn-admin-prev-month', 'btn-admin-next-month', 'admin-current-month-title',
  'admin-month-status-badge', 'admin-select-quick-month', 'admin-timetable-month-subtitle',
  'btn-admin-week-1', 'btn-admin-week-2', 'btn-admin-week-3', 'btn-admin-week-4',
  'btn-admin-view-all-month', 'admin-week-selector', 'cb-student-select-all', 'bulk-student-actions',
  'bulk-selected-count'
];

requiredIds.forEach(id => {
  elementsMap[id] = createMockElement(id, id.includes('select') ? 'select' : (id.includes('input') ? 'input' : (id.includes('table') || id.includes('tbody') ? 'tbody' : 'div')));
});

// Setup mock window & document
global.window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  location: { reload: () => {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  matchMedia: () => ({ matches: false }),
  confirm: () => true,
  alert: () => {},
  prompt: (msg, def) => def || 'Mock Name',
  AdminAuth: null,
  CloudSyncManager: null,
  SchedulerEngine: null,
  WebBackupManager: null,
  EventManager: null,
  PayrollCalculator: null,
  adminSwitchMonth: null,
  adminGoToNextMonth: null,
  adminGoToPrevMonth: null
};

global.document = {
  readyState: 'complete',
  documentElement: createMockElement('html', 'html'),
  body: createMockElement('body', 'body'),
  getElementById: (id) => elementsMap[id] || createMockElement(id),
  querySelectorAll: (selector) => {
    if (selector.includes('cb-student-row')) return [];
    if (selector.includes('.nav-tab')) return [];
    return [];
  },
  querySelector: (selector) => {
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      return elementsMap[id] || createMockElement(id);
    }
    return createMockElement('generic');
  },
  createElement: (tag) => createMockElement('dyn_' + Math.random().toString(36).substr(2, 5), tag),
  addEventListener: () => {}
};

global.localStorage = mockLocalStorage;
global.sessionStorage = mockSessionStorage;

// Load engine scripts
// month_calendar.js phải nạp TRƯỚC scheduler.js: file sau lấy
// MonthCalendarHelper từ window và ném lỗi nếu chưa có. Đây cũng là thứ tự
// admin.html dùng.
const monthCalendarCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'month_calendar.js'), 'utf-8');
eval(monthCalendarCode);

const schedulerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'scheduler.js'), 'utf-8');
eval(schedulerCode);

const sampleCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'sample30.js'), 'utf-8');
eval(sampleCode);

const cloudSyncCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud_sync.js'), 'utf-8');
eval(cloudSyncCode);

const adminCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin.js'), 'utf-8');
eval(adminCode);

console.log('================================================================');
console.log('🗓️  BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG - ADMIN MONTH NAVIGATION & AUTO-BACKUP');
console.log('================================================================\n');

let passCount = 0;
let totalCount = 0;

// PHẢI await: nhiều test trong file này là async (await adminGoToNextMonth()).
// Bản cũ gọi fn() không await nên try/catch thoát trước khi promise resolve —
// mọi assert trong test async đều không thể làm test fail (false PASS).
// Các test cũng phải chạy TUẦN TỰ: test 2.2->2.5 phụ thuộc trạng thái tháng
// do test trước tạo ra, nếu chạy song song sẽ đảo thứ tự và hỏng.
const testQueue = [];

/** Đọc ACTIVE_MONTH từ mock storage, chấp nhận object JSON hoặc chuỗi cũ. */
function readActiveMonth() {
  const raw = mockLocalStorage.getItem('ts_scheduler_active_month_v1');
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') return { month: parseInt(p.month, 10), year: parseInt(p.year, 10) };
    return { month: parseInt(p, 10), year: null };
  } catch (e) {
    const s = String(raw).trim();
    const d = s.match(/^(\d{4})-(\d{1,2})$/);
    if (d) return { month: parseInt(d[2], 10), year: parseInt(d[1], 10) };
    const sl = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (sl) return { month: parseInt(sl[1], 10), year: parseInt(sl[2], 10) };
    return { month: parseInt(s, 10), year: null };
  }
}

function runTest(name, fn) {
  totalCount++;
  testQueue.push({ name, fn });
}

async function runAllTests() {
  for (const { name, fn } of testQueue) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passCount++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      console.error(err);
    }
  }

  console.log('\n================================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passCount}/${totalCount} TESTS ĐẠT CHUẨN (${Math.round(passCount/totalCount*100)}%)`);
  console.log('================================================================\n');

  if (passCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// GROUP 1: Kiểm thử MonthCalendarHelper cho các tháng 10, 11, 12/2026 và 01/2027
console.log('▶ [GROUP 1] Kiểm Tra Tính Toán Lịch & Ngày Tháng (MonthCalendarHelper):');

runTest('1.1: MonthCalendarHelper tính chính xác 4 tuần cho Tháng 10/2026 (05/10 - 30/10)', () => {
  const weeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(10, 2026);
  assert.strictEqual(weeks.length, 4, 'Phải có đúng 4 tuần làm việc');
  assert.strictEqual(weeks[0].startDateStr, '05/10', 'Tuần 1 bắt đầu Thứ 2 ngày 05/10');
  assert.strictEqual(weeks[0].endDateStr, '09/10', 'Tuần 1 kết thúc Thứ 6 ngày 09/10');
  assert.strictEqual(weeks[3].startDateStr, '26/10', 'Tuần 4 bắt đầu Thứ 2 ngày 26/10');
  assert.strictEqual(weeks[3].endDateStr, '30/10', 'Tuần 4 kết thúc Thứ 6 ngày 30/10');
});

runTest('1.2: MonthCalendarHelper tính chính xác 4 tuần cho Tháng 11/2026 (02/11 - 27/11)', () => {
  const weeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(11, 2026);
  assert.strictEqual(weeks.length, 4, 'Phải có đúng 4 tuần làm việc');
  assert.strictEqual(weeks[0].startDateStr, '02/11', 'Tuần 1 bắt đầu Thứ 2 ngày 02/11');
  assert.strictEqual(weeks[0].endDateStr, '06/11', 'Tuần 1 kết thúc Thứ 6 ngày 06/11');
  assert.strictEqual(weeks[3].startDateStr, '23/11', 'Tuần 4 bắt đầu Thứ 2 ngày 23/11');
  assert.strictEqual(weeks[3].endDateStr, '27/11', 'Tuần 4 kết thúc Thứ 6 ngày 27/11');
});

runTest('1.3: MonthCalendarHelper tính chính xác 4 tuần cho Tháng 12/2026 (07/12 - 01/01)', () => {
  const weeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(12, 2026);
  assert.strictEqual(weeks.length, 4, 'Phải có đúng 4 tuần làm việc');
  assert.strictEqual(weeks[0].startDateStr, '07/12', 'Tuần 1 bắt đầu Thứ 2 ngày 07/12');
  assert.strictEqual(weeks[0].endDateStr, '11/12', 'Tuần 1 kết thúc Thứ 6 ngày 11/12');
});

runTest('1.4: MonthCalendarHelper tính chính xác Kỳ 13 (Tháng 01/2027: 04/01 - 29/01)', () => {
  const weeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(1, 2027);
  assert.strictEqual(weeks.length, 4, 'Phải có đúng 4 tuần làm việc');
  assert.strictEqual(weeks[0].startDateStr, '04/01', 'Tuần 1 bắt đầu Thứ 2 ngày 04/01/2027');
  assert.strictEqual(weeks[3].endDateStr, '29/01', 'Tuần 4 kết thúc Thứ 6 ngày 29/01/2027');
});

// GROUP 2: Kiểm thử Chuyển Tháng & Tự Động Sao Lưu
console.log('\n▶ [GROUP 2] Kiểm Thử Chuyển Tháng & Tự Động Sao Lưu (Auto-Backup):');

runTest('2.1: Các hàm điều hướng tháng được xuất khẩu đầy đủ ra window', () => {
  assert.strictEqual(typeof window.adminSwitchMonth, 'function', 'Phải có window.adminSwitchMonth');
  assert.strictEqual(typeof window.adminGoToNextMonth, 'function', 'Phải có window.adminGoToNextMonth');
  assert.strictEqual(typeof window.adminGoToPrevMonth, 'function', 'Phải có window.adminGoToPrevMonth');
});

runTest('2.2: Tự động sao lưu Tháng 10 khi chuyển sang Tháng 11', async () => {
  // Đăng nhập admin
  window.AdminAuth.login('admin', '123');

  // Đặt dữ liệu lịch Tháng 10
  const students = window.getSample30Students ? window.getSample30Students() : [];
  // Dùng ĐÚNG key như STORAGE_KEYS trong admin.js. Bản cũ ghi vào
  // '..._v1' vốn không tồn tại nên admin không bao giờ đọc được dữ liệu này.
  mockLocalStorage.setItem('ts_scheduler_students', JSON.stringify(students));
  const sch = window.SchedulerEngine.solveMultiWeekSchedule(students, 4, 2026, 10);
  mockLocalStorage.setItem('ts_scheduler_month_result', JSON.stringify(sch));

  // switchAdminMonth() chỉ sao lưu khi state.monthSchedule đã được nạp,
  // nên phải gọi loadData() (được export cho test) sau khi ghi storage.
  if (typeof window.adminTestHelper && typeof window.adminTestHelper.loadData === 'function') {
    window.adminTestHelper.loadData();
  }

  const initialBackups = window.WebBackupManager.getWebBackups();
  const initialBackupCount = initialBackups.length;

  // Chuyển sang tháng 11
  await window.adminSwitchMonth(11, 2026, true);

  const updatedBackups = window.WebBackupManager.getWebBackups();
  assert.strictEqual(updatedBackups.length, initialBackupCount + 1, 'Phải có thêm 1 bản sao lưu tự động');
  assert(updatedBackups[0].name.includes('Tháng 10/2026'), 'Tên bản sao lưu phải chỉ định rõ Tháng 10/2026');
});

runTest('2.3: Di chuyển tiếp sang Tháng 12/2026 bằng adminGoToNextMonth', async () => {
  await window.adminGoToNextMonth();
  const active = readActiveMonth();
  assert(active && active.month === 12 && active.year === 2026,
    `Active month phải là 12/2026, thực tế: ${JSON.stringify(active)}`);
});

runTest('2.4: Di chuyển tiếp sang Kỳ 13 (Tháng 01/2027) bằng adminGoToNextMonth', async () => {
  await window.adminGoToNextMonth();
  const active = readActiveMonth();
  assert(active && active.month === 1 && active.year === 2027,
    `Active month phải chuyển sang 01/2027, thực tế: ${JSON.stringify(active)}`);
});

runTest('2.5: Di chuyển lùi lại Tháng 12/2026 bằng adminGoToPrevMonth', async () => {
  await window.adminGoToPrevMonth();
  const active = readActiveMonth();
  assert(active && active.month === 12 && active.year === 2026,
    `Active month phải quay lại 12/2026, thực tế: ${JSON.stringify(active)}`);
});

// GROUP 3: Kiểm thử Đóng Gói Cloud Sync với ALL_MONTHS
console.log('\n▶ [GROUP 3] Kiểm Thử Đồng Bộ Cloud với ALL_MONTHS & ACTIVE_MONTH:');

runTest('3.1: buildPayload đóng gói chính xác ALL_MONTHS và ACTIVE_MONTH', () => {
  mockLocalStorage.setItem('ts_scheduler_active_month_v1', '2026-11');
  mockLocalStorage.setItem('ts_scheduler_all_months_v1', JSON.stringify({
    '2026-10': { note: 'Lịch tháng 10' },
    '2026-11': { note: 'Lịch tháng 11' }
  }));

  const payload = window.CloudSyncManager.buildPayload();
  assert(payload.allMonths, 'Payload phải chứa allMonths');
  assert(payload.activeMonth && String(payload.activeMonth.month) === '11',
    `Payload activeMonth phải là tháng 11, thực tế: ${JSON.stringify(payload.activeMonth)}`);
  assert(payload.allMonths['2026-10'], 'Payload allMonths phải chứa 2026-10');
});

runTest('3.2: applyPayload nạp thành công ALL_MONTHS từ Cloud xuống LocalStorage', () => {
  const remotePayload = {
    updatedAt: Date.now(),
    deviceId: 'remote_device',
    activeMonth: '2026-12',
    allMonths: {
      '2026-10': { note: 'Lịch T10 từ cloud' },
      '2026-11': { note: 'Lịch T11 từ cloud' },
      '2026-12': { note: 'Lịch T12 từ cloud' }
    }
  };

  window.CloudSyncManager.applyPayload(remotePayload);
  const activeMonthRaw = mockLocalStorage.getItem('ts_scheduler_active_month_v1');
  const allMonthsRaw = mockLocalStorage.getItem('ts_scheduler_all_months_v1');
  // Code lưu ACTIVE_MONTH dưới dạng JSON object {month, year} (xem admin.js
  // switchAdminMonth). Test cũ kỳ vọng chuỗi thuần '2026-12' — sai với hành vi
  // hiện tại và là lý do assert này luôn fail.
  let activeMonth = null;
  try { activeMonth = JSON.parse(activeMonthRaw); } catch (e) { activeMonth = activeMonthRaw; }
  assert(activeMonth && String(activeMonth.month) === '12',
    `LocalStorage phải nhận activeMonth = tháng 12, thực tế: ${activeMonthRaw}`);
  assert(allMonthsRaw && allMonthsRaw.includes('Lịch T12 từ cloud'), 'LocalStorage phải nhận allMonths từ cloud');
});

// Chạy toàn bộ hàng đợi test (tuần tự) rồi mới in tổng kết & thoát
runAllTests();
