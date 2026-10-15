/**
 * ============================================================================
 * AUTOMATED TEST SUITE: WEB BACKUP MANAGER & RETENTION POLICY (QA-AGENT)
 * ============================================================================
 * Kiểm thử toàn diện tính năng Sao Lưu Dữ Liệu Trực Tiếp Trên Web:
 * 1. Khởi tạo & cấu trúc đối tượng WebBackupItem chuẩn hợp đồng (API Contracts)
 * 2. Chính sách lưu trữ tối đa 6 tháng (Retention Policy: 180 ngày) & Auto-Pruning
 * 3. Giới hạn tối đa 6 bản sao lưu gần nhất (MAX_WEB_BACKUPS = 6)
 * 4. Khôi phục toàn vẹn dữ liệu 1-click (1-Click Restore) vào State & LocalStorage
 * 5. Xóa bản sao lưu theo ID và bảo toàn danh sách còn lại
 * 6. Tích hợp tự động snapshot khi khởi tạo tháng mới (Auto-Snapshot on New Month)
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
    checked: false,
    disabled: false,
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
    click() {
      const fns = this.listeners['click'] || [];
      fns.forEach(fn => fn({ type: 'click', target: this }));
    }
  };
  if (id) elementsMap[id] = el;
  return el;
}

global.localStorage = mockLocalStorage;
global.sessionStorage = mockSessionStorage;

global.confirm = () => true;
global.prompt = (msg, def) => def;
global.alert = () => {};
global.Blob = class Blob {
  constructor(parts = []) {
    this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : 0), 0);
  }
};
global.URL = {
  createObjectURL: () => 'blob:mock-url',
  revokeObjectURL: () => {}
};
global.Event = class Event {
  constructor(type) { this.type = type; }
};

global.window = {
  addEventListener: () => {},
  dispatchEvent: () => {},
  matchMedia: () => ({ matches: false }),
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  confirm: global.confirm,
  prompt: global.prompt,
  alert: global.alert,
  setInterval: () => 1,
  clearInterval: () => {},
  scrollY: 0,
  print: () => {}
};

global.document = {
  readyState: 'complete',
  documentElement: createMockElement('html', 'html'),
  body: createMockElement('body', 'body'),
  getElementById: (id) => elementsMap[id] || createMockElement(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => createMockElement('', tag),
  addEventListener: () => {}
};

// 2. Nạp mã nguồn admin.js để kích hoạt WebBackupManager và các tính năng liên quan
const adminJsPath = path.resolve(__dirname, '../js/admin.js');
const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

eval(adminJsContent);

const { WebBackupManager } = global.window;

// 3. Test Runner & Assertions
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
console.log('🗄️  BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG - WEB BACKUP MANAGER (6 THÁNG RETENTION)');
console.log('================================================================\n');

// Reset Storage trước các test
mockLocalStorage.clear();
mockSessionStorage.clear();

runTest('Khởi tạo API window.WebBackupManager với đầy đủ phương thức và hằng số', () => {
  assert(WebBackupManager, 'WebBackupManager phải tồn tại trên window');
  assert.strictEqual(typeof WebBackupManager.getWebBackups, 'function');
  assert.strictEqual(typeof WebBackupManager.createWebBackup, 'function');
  assert.strictEqual(typeof WebBackupManager.restoreFromWebBackup, 'function');
  assert.strictEqual(typeof WebBackupManager.deleteWebBackup, 'function');
  assert.strictEqual(WebBackupManager.MAX_WEB_BACKUPS, 6, 'Giới hạn tối đa phải là 6 bản sao lưu');
  assert.strictEqual(
    WebBackupManager.RETENTION_PERIOD_MS,
    180 * 24 * 60 * 60 * 1000,
    'Hạn lưu trữ phải là 180 ngày (6 tháng) tính theo mili-giây'
  );
});

runTest('Tạo bản sao lưu trên web: Chuẩn hóa ID, Tên, Ngày tạo và Hạn lưu 180 ngày', () => {
  mockLocalStorage.clear();

  // Tạo mock dữ liệu sinh viên trong localStorage
  const sampleStudents = [
    { id: 's1', fullName: 'Nguyễn Văn A', studentId: '2101001', role: 'old' },
    { id: 's2', fullName: 'Trần Thị B', studentId: '2302002', role: 'new' }
  ];
  mockLocalStorage.setItem('ts_scheduler_students', JSON.stringify(sampleStudents));

  const backup = WebBackupManager.createWebBackup('Sao lưu thử nghiệm Tháng 10');

  assert.ok(backup, 'createWebBackup phải trả về đối tượng backup');
  assert.ok(backup.id.startsWith('wbk_'), 'ID bản lưu phải bắt đầu bằng prefix wbk_');
  assert.strictEqual(backup.name, 'Sao lưu thử nghiệm Tháng 10');
  assert.ok(backup.createdAt > 0, 'createdAt phải là timestamp hợp lệ');
  assert.strictEqual(
    backup.expiresAt,
    backup.createdAt + WebBackupManager.RETENTION_PERIOD_MS,
    'expiresAt phải đúng bằng createdAt + 180 ngày'
  );
  assert.ok(backup.sizeBytes > 0, 'sizeBytes phải lớn hơn 0');
  assert.ok(backup.payload, 'payload phải tồn tại');
  assert.strictEqual(backup.payload.students.length, 2, 'payload phải chứa 2 sinh viên');

  // Kiểm tra lưu vào LocalStorage
  const storedBackups = JSON.parse(mockLocalStorage.getItem('ts_scheduler_web_backups_v1'));
  assert.strictEqual(storedBackups.length, 1);
  assert.strictEqual(storedBackups[0].id, backup.id);
});

runTest('Auto-Pruning: Tự động xóa các bản sao lưu đã quá hạn 180 ngày (> 6 tháng)', () => {
  mockLocalStorage.clear();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Giả lập 3 bản sao lưu với các mốc thời gian khác nhau:
  // 1. Bản mới tạo hôm nay (0 ngày tuổi) -> Hợp lệ
  // 2. Bản tạo cách đây 120 ngày (4 tháng tuổi) -> Hợp lệ (< 180 ngày)
  // 3. Bản tạo cách đây 190 ngày (> 6 tháng tuổi) -> Đã quá hạn, phải bị prune
  const backupsMock = [
    {
      id: 'wbk_today',
      name: 'Bản lưu hôm nay',
      createdAt: now,
      expiresAt: now + (180 * dayMs),
      sizeBytes: 1024,
      payload: { students: [] }
    },
    {
      id: 'wbk_4months_ago',
      name: 'Bản lưu 4 tháng trước',
      createdAt: now - (120 * dayMs),
      expiresAt: now + (60 * dayMs),
      sizeBytes: 1024,
      payload: { students: [] }
    },
    {
      id: 'wbk_expired_190days',
      name: 'Bản lưu 190 ngày trước (quá hạn 6 tháng)',
      createdAt: now - (190 * dayMs),
      expiresAt: now - (10 * dayMs),
      sizeBytes: 1024,
      payload: { students: [] }
    }
  ];

  mockLocalStorage.setItem('ts_scheduler_web_backups_v1', JSON.stringify(backupsMock));

  // Gọi getWebBackups() để kích hoạt cơ chế auto-prune
  const validBackups = WebBackupManager.getWebBackups();

  assert.strictEqual(validBackups.length, 2, 'Chỉ còn lại đúng 2 bản sao lưu hợp lệ');
  assert.strictEqual(validBackups.some(b => b.id === 'wbk_expired_190days'), false, 'Bản 190 ngày phải bị dọn sạch');
  assert.strictEqual(validBackups[0].id, 'wbk_today', 'Bản mới nhất phải xếp đầu tiên');
  assert.strictEqual(validBackups[1].id, 'wbk_4months_ago', 'Bản 4 tháng trước vẫn được bảo toàn');

  // Kiểm tra LocalStorage cũng đã được cập nhật sau khi auto-prune
  const updatedInStorage = JSON.parse(mockLocalStorage.getItem('ts_scheduler_web_backups_v1'));
  assert.strictEqual(updatedInStorage.length, 2);
});

runTest('Giới hạn tối đa 6 bản ghi (MAX_WEB_BACKUPS = 6): Tự động cắt tỉa bản ghi cũ thứ 7 trở đi', () => {
  mockLocalStorage.clear();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Tạo liên tiếp 8 bản sao lưu hợp lệ (trong vòng 6 tháng)
  for (let i = 1; i <= 8; i++) {
    // Mỗi bản cách nhau 5 ngày
    const item = {
      id: `wbk_test_${i}`,
      name: `Bản lưu số ${i}`,
      createdAt: now - ((8 - i) * 5 * dayMs),
      expiresAt: now + (150 * dayMs),
      sizeBytes: 1024,
      payload: { students: [{ id: `s_${i}` }] }
    };
    const current = WebBackupManager.getWebBackups();
    current.unshift(item);
    mockLocalStorage.setItem('ts_scheduler_web_backups_v1', JSON.stringify(current));
  }

  // Gọi getWebBackups() kiểm tra
  const finalBackups = WebBackupManager.getWebBackups();
  assert.strictEqual(finalBackups.length, 6, 'Danh sách phải bị giới hạn đúng 6 bản sao lưu gần nhất');
  
  // Bản số 8 và số 7 mới nhất phải còn, bản số 1 và số 2 cũ nhất phải bị loại bỏ
  assert.strictEqual(finalBackups[0].id, 'wbk_test_8', 'Bản số 8 mới nhất phải ở đầu danh sách');
  assert.strictEqual(finalBackups.some(b => b.id === 'wbk_test_1'), false, 'Bản số 1 cũ nhất phải bị cắt tỉa');
  assert.strictEqual(finalBackups.some(b => b.id === 'wbk_test_2'), false, 'Bản số 2 cũ thứ hai phải bị cắt tỉa');
});

runTest('Khôi phục nhanh 1-Click (Restore): Đồng bộ toàn vẹn dữ liệu từ bản sao lưu vào LocalStorage & State', () => {
  mockLocalStorage.clear();

  // Tạo một bản sao lưu chứa dữ liệu hoàn chỉnh
  const targetBackupId = 'wbk_restore_target';
  const targetStudents = [
    { id: 's_special_1', fullName: 'Lê Văn Khôi Phục', studentId: '2109999', role: 'old' }
  ];
  const targetRegConfig = {
    isRegOpen: false,
    publishSchedule: true,
    note: 'Cấu hình khôi phục đặc biệt'
  };

  const backupToRestore = {
    id: targetBackupId,
    name: 'Bản lưu chuẩn để khôi phục',
    createdAt: Date.now(),
    expiresAt: Date.now() + WebBackupManager.RETENTION_PERIOD_MS,
    sizeBytes: 2048,
    payload: {
      students: targetStudents,
      monthSchedule: { weeks: [{ weekNumber: 1, scheduleTable: {} }] },
      regConfig: targetRegConfig,
      adminUsers: [{ username: 'admin_test', role: 'Admin' }],
      swapRequests: [{ id: 'sw1', status: 'approved' }]
    }
  };

  mockLocalStorage.setItem('ts_scheduler_web_backups_v1', JSON.stringify([backupToRestore]));

  // Đổi confirm sang true
  global.window.confirm = () => true;

  // Thực hiện khôi phục
  WebBackupManager.restoreFromWebBackup(targetBackupId);

  // Kiểm tra dữ liệu sau khi khôi phục trong LocalStorage
  const restoredStudents = JSON.parse(mockLocalStorage.getItem('ts_scheduler_students'));
  assert.strictEqual(restoredStudents.length, 1);
  assert.strictEqual(restoredStudents[0].studentId, '2109999');
  assert.strictEqual(restoredStudents[0].fullName, 'Lê Văn Khôi Phục');

  const restoredConfig = JSON.parse(mockLocalStorage.getItem('ts_scheduler_reg_config'));
  assert.strictEqual(restoredConfig.isRegOpen, false);
  assert.strictEqual(restoredConfig.publishSchedule, true);

  const restoredSwaps = JSON.parse(mockLocalStorage.getItem('ts_scheduler_swap_requests'));
  assert.strictEqual(restoredSwaps.length, 1);
  assert.strictEqual(restoredSwaps[0].id, 'sw1');
});

runTest('Xóa bản sao lưu (Delete): Xóa đúng mục chỉ định và bảo toàn các mục khác', () => {
  mockLocalStorage.clear();
  const b1 = { id: 'wbk_del_1', name: 'Bản 1', createdAt: Date.now(), expiresAt: Date.now() + 1000, payload: {} };
  const b2 = { id: 'wbk_del_2', name: 'Bản 2', createdAt: Date.now() - 1000, expiresAt: Date.now() + 1000, payload: {} };
  mockLocalStorage.setItem('ts_scheduler_web_backups_v1', JSON.stringify([b1, b2]));

  global.window.confirm = () => true;

  WebBackupManager.deleteWebBackup('wbk_del_1');

  const remaining = WebBackupManager.getWebBackups();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].id, 'wbk_del_2');
});

runTest('Tích hợp Khởi tạo Tháng Mới: Tự động tạo snapshot sao lưu trước khi làm sạch lịch', () => {
  mockLocalStorage.clear();

  // Giả lập dữ liệu tháng cũ
  const oldMonthStudents = [
    { id: 's_old_month', fullName: 'Trần Văn Cũ', studentId: '2001111', role: 'old' }
  ];
  
  // Nạp dữ liệu tháng cũ vào state thông qua bản lưu setup
  const oldMonthSetup = {
    id: 'wbk_setup_old',
    name: 'Setup Old Month',
    createdAt: Date.now(),
    expiresAt: Date.now() + WebBackupManager.RETENTION_PERIOD_MS,
    payload: {
      students: oldMonthStudents,
      monthSchedule: { weeks: [1, 2, 3, 4] }
    }
  };
  mockLocalStorage.setItem('ts_scheduler_web_backups_v1', JSON.stringify([oldMonthSetup]));
  global.confirm = () => true;
  WebBackupManager.restoreFromWebBackup('wbk_setup_old');

  // Xóa danh sách backups để kiểm tra snapshot mới được tạo
  mockLocalStorage.removeItem('ts_scheduler_web_backups_v1');

  // Đảm bảo confirm trả về true để thực thi
  global.confirm = () => true;
  global.window.confirm = () => true;

  // Thực thi hàm adminStartNewMonth đã được export trên window
  assert.strictEqual(typeof global.window.adminStartNewMonth, 'function', 'adminStartNewMonth phải được export');
  global.window.adminStartNewMonth();

  // Kiểm tra danh sách web backups phải có thêm 1 bản snapshot tự động
  const backups = WebBackupManager.getWebBackups();
  assert.ok(backups.length >= 1, 'Phải có ít nhất 1 bản sao lưu tự động được tạo');
  assert.ok(
    backups[0].name.includes('Tự động lưu trữ trước khi sang tháng mới') || backups[0].name.includes('Bản sao lưu'),
    'Tên bản sao lưu tự động phải thể hiện rõ snapshot tháng mới'
  );
  assert.strictEqual(backups[0].payload.students[0].studentId, '2001111', 'Snapshot phải lưu giữ đúng danh sách sinh viên cũ');
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
