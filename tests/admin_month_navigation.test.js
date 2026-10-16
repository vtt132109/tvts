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

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    console.error(err);
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
  mockLocalStorage.setItem('ts_scheduler_students_v1', JSON.stringify(students));
  const sch = window.SchedulerEngine.solveMultiWeekSchedule(students, 4);
  mockLocalStorage.setItem('ts_scheduler_month_schedule_v1', JSON.stringify(sch));

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
  const activeMonthStr = mockLocalStorage.getItem('ts_scheduler_active_month_v1');
  assert.strictEqual(activeMonthStr, '2026-12', 'Active month trong localStorage phải là 2026-12');
});

runTest('2.4: Di chuyển tiếp sang Kỳ 13 (Tháng 01/2027) bằng adminGoToNextMonth', async () => {
  await window.adminGoToNextMonth();
  const activeMonthStr = mockLocalStorage.getItem('ts_scheduler_active_month_v1');
  assert.strictEqual(activeMonthStr, '2027-01', 'Active month phải chuyển sang năm 2027 kỳ 13 (2027-01)');
});

runTest('2.5: Di chuyển lùi lại Tháng 12/2026 bằng adminGoToPrevMonth', async () => {
  await window.adminGoToPrevMonth();
  const activeMonthStr = mockLocalStorage.getItem('ts_scheduler_active_month_v1');
  assert.strictEqual(activeMonthStr, '2026-12', 'Active month phải quay lại 2026-12');
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
  assert.strictEqual(payload.activeMonth, '2026-11', 'Payload activeMonth phải là 2026-11');
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
  const activeMonth = mockLocalStorage.getItem('ts_scheduler_active_month_v1');
  const allMonthsRaw = mockLocalStorage.getItem('ts_scheduler_all_months_v1');
  assert.strictEqual(activeMonth, '2026-12', 'LocalStorage phải nhận activeMonth 2026-12');
  assert(allMonthsRaw && allMonthsRaw.includes('Lịch T12 từ cloud'), 'LocalStorage phải nhận allMonths từ cloud');
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passCount}/${totalCount} TESTS ĐẠT CHUẨN (${Math.round(passCount/totalCount*100)}%)`);
console.log('================================================================\n');

if (passCount === totalCount) {
  process.exit(0);
} else {
  process.exit(1);
}
