/**
 * ==========================================================================
 * AUTOMATED TEST SUITE: AUTHENTICATION & ACCESS CONTROL (QA-AGENT)
 * ==========================================================================
 * Kiểm thử toàn diện cơ chế đăng nhập, xác thực mã PIN, phiên làm việc
 * và tính năng phân quyền cán bộ quản trị.
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

// 2. Mock Window & Document
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
    hasAttribute() { return false; }
  };
  if (id) elementsMap[id] = el;
  return el;
}

global.localStorage = mockLocalStorage;
global.sessionStorage = mockSessionStorage;

global.window = {
  addEventListener: () => {},
  dispatchEvent: () => {},
  matchMedia: () => ({ matches: false }),
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  confirm: () => true,
  setInterval: () => 1,
  clearInterval: () => {}
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

// 3. Nạp mã nguồn admin.js để kích hoạt AdminAuth
const adminJsPath = path.resolve(__dirname, '../js/admin.js');
const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

// Chạy mã admin.js trong ngữ cảnh global đã mock
eval(adminJsContent);

const { AdminAuth } = global.window;

// 4. Test Runner & Assertions
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
console.log('🛡️  BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG - XÁC THỰC & ĐĂNG NHẬP (AUTH QA)');
console.log('================================================================\n');

// Reset mock session
mockSessionStorage.clear();

runTest('Khởi tạo API xác thực window.AdminAuth thành công', () => {
  assert(AdminAuth, 'AdminAuth phải tồn tại trên window');
  assert.strictEqual(typeof AdminAuth.login, 'function', 'AdminAuth.login phải là hàm');
  assert.strictEqual(typeof AdminAuth.loginPin, 'function', 'AdminAuth.loginPin phải là hàm');
  assert.strictEqual(typeof AdminAuth.logout, 'function', 'AdminAuth.logout phải là hàm');
  assert.strictEqual(AdminAuth.isAuthenticated(), false, 'Mặc định chưa đăng nhập');
});

runTest('Đăng nhập thành công với tài khoản Trưởng ban (admin / 123)', () => {
  mockSessionStorage.clear();
  const res = AdminAuth.login('admin', '123');
  assert.strictEqual(res.success, true, 'Đăng nhập admin phải thành công');
  assert.strictEqual(res.user.username, 'admin');
  assert.strictEqual(res.user.role, 'Trưởng ban điều hành');
  assert.strictEqual(AdminAuth.isAuthenticated(), true, 'Trạng thái đăng nhập phải là true');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), 'true', 'sessionStorage phải lưu token');
});

runTest('Đăng nhập thành công với tài khoản Điều phối (diephoi / 123)', () => {
  mockSessionStorage.clear();
  const res = AdminAuth.login('diephoi', '123');
  assert.strictEqual(res.success, true, 'Đăng nhập diephoi phải thành công');
  assert.strictEqual(res.user.username, 'diephoi');
  assert.strictEqual(res.user.role, 'Điều phối viên tuyển sinh');
  assert.strictEqual(AdminAuth.isAuthenticated(), true);
});

runTest('Đăng nhập thành công bằng Mã PIN nhanh (9999 & 8888)', () => {
  mockSessionStorage.clear();
  const res1 = AdminAuth.loginPin('9999');
  assert.strictEqual(res1.success, true, 'Mã PIN 9999 phải khớp với Trưởng ban');
  assert.strictEqual(res1.user.username, 'admin');

  mockSessionStorage.clear();
  const res2 = AdminAuth.loginPin('8888');
  assert.strictEqual(res2.success, true, 'Mã PIN 8888 phải khớp với Điều phối');
  assert.strictEqual(res2.user.username, 'diephoi');
});

runTest('Từ chối khi nhập sai mật khẩu hoặc sai username', () => {
  mockSessionStorage.clear();
  AdminAuth.logout();

  const badPwd = AdminAuth.login('admin', 'sai_mat_khau');
  assert.strictEqual(badPwd.success, false, 'Sai mật khẩu phải trả về false');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), null);

  const badUser = AdminAuth.login('hacker', '123');
  assert.strictEqual(badUser.success, false, 'Username không tồn tại phải trả về false');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
});

runTest('Từ chối khi nhập sai Mã PIN', () => {
  mockSessionStorage.clear();
  AdminAuth.logout();

  const badPin = AdminAuth.loginPin('0000');
  assert.strictEqual(badPin.success, false, 'Mã PIN sai phải trả về false');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
});

runTest('Quy trình Đăng Xuất (Logout) xóa sạch phiên và khóa hệ thống', () => {
  AdminAuth.login('admin', '123');
  assert.strictEqual(AdminAuth.isAuthenticated(), true);
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), 'true');

  AdminAuth.logout();
  assert.strictEqual(AdminAuth.isAuthenticated(), false, 'Sau khi logout, isAuthenticated phải là false');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), null, 'sessionStorage phải bị dọn sạch');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_user_data'), null);
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
