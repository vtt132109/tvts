/**
 * ============================================================================
 * AUTOMATED TEST SUITE: BỎ ĐĂNG NHẬP CỤC BỘ + MÃ KHÔI PHỤC THIẾT BỊ
 * ============================================================================
 * Sản phẩm chuyển sang chỉ đăng nhập Google. Bộ test này khoá lại:
 * 1. `AdminAuth.login` / `loginPin` KHÔNG dùng được ngoài môi trường test
 *    (không còn cửa sau đăng nhập bằng mật khẩu local).
 * 2. Hash mật khẩu/PIN còn sót của bản cũ bị xoá một lần, giữ lại tên/vai trò.
 * 3. Mã khôi phục thiết bị: tạo được, lưu dạng hash, xác thực đúng/sai,
 *    khoá 60 giây sau 5 lần sai, và phiên khôi phục không đẩy dữ liệu Cloud.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- Môi trường giả lập -----------------------------------------------------
class MockStorage {
  constructor() { this.store = {}; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

const LS = new MockStorage();
const SS = new MockStorage();
const els = {};

function mockEl(id = '', tag = 'div') {
  const e = {
    id, tagName: tag.toUpperCase(), style: {},
    classList: {
      _c: new Set(),
      add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); },
      contains(c) { return this._c.has(c); },
      toggle(c, f) { if (f === undefined) f = !this._c.has(c); f ? this._c.add(c) : this._c.delete(c); return f; }
    },
    value: '', textContent: '', innerHTML: '', checked: false, disabled: false, listeners: {},
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (this.listeners[ev.type || ev] || []).forEach(fn => fn(ev)); },
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    focus() {}, scrollIntoView() {}, click() { (this.listeners.click || []).forEach(fn => fn({ type: 'click', target: this })); }
  };
  if (id) els[id] = e;
  return e;
}

global.localStorage = LS;
global.sessionStorage = SS;
global.confirm = () => true;
global.prompt = (m, d) => d;
global.alert = () => {};
global.Blob = class { constructor() { this.size = 0; } };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.Event = class { constructor(t) { this.type = t; } };
global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
global.FileReader = class { readAsText() {} };
global.setInterval = () => 1;
global.clearInterval = () => {};

global.window = {
  addEventListener: () => {}, dispatchEvent: () => {},
  matchMedia: () => ({ matches: false }),
  localStorage: LS, sessionStorage: SS,
  confirm: global.confirm, prompt: global.prompt, alert: global.alert,
  setInterval: () => 1, clearInterval: () => {}, scrollY: 0, print() {},
  location: { href: '' },
  navigator: {}
};

global.document = {
  readyState: 'complete',
  documentElement: mockEl('html', 'html'),
  body: mockEl('body', 'body'),
  head: mockEl('head', 'head'),
  getElementById: (id) => els[id] || mockEl(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => mockEl('', t),
  addEventListener: () => {}
};

// --- Nạp mã nguồn (KHÔNG bật cờ test: đây là môi trường production) ---------
require(path.join(ROOT, 'js', 'month_calendar.js'));
require(path.join(ROOT, 'js', 'scheduler.js'));
require(path.join(ROOT, 'js', 'common.js'));
require(path.join(ROOT, 'js', 'audit.js'));
require(path.join(ROOT, 'js', 'store.js'));
eval(fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8'));

const AdminAuth = global.window.AdminAuth;
assert.ok(AdminAuth, 'admin.js phải export window.AdminAuth');

// --- Runner -----------------------------------------------------------------
let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    console.error(err.stack);
  }
}

const USERS_KEY = 'ts_scheduler_admin_users';

function seededUsers() {
  return [
    {
      id: 'usr_1', username: 'admin', fullName: 'Trưởng Ban',
      role: 'admin', password: 'x', pin: '1234'
    },
    {
      id: 'usr_2', username: 'pho', fullName: 'Phó Ban',
      role: 'admin', passwordHash: 'abc', passwordSalt: 's1', pinHash: 'def', pinSalt: 's2'
    }
  ];
}

/** Đăng nhập local chỉ để TẠO mã khôi phục (bật cờ test có kiểm soát). */
function loginForSetup() {
  global.window.__TVTS_AUTH_TEST__ = true;
  LS.setItem(USERS_KEY, JSON.stringify(seededUsers()));
  global.window.adminReloadAdminUsers();
  const res = AdminAuth.login('admin', 'x');
  global.window.__TVTS_AUTH_TEST__ = false;
  return res;
}

console.log('================================================================');
console.log('🔐 BẮT ĐẦU KIỂM THỬ - BỎ LOGIN CỤC BỘ & MÃ KHÔI PHỤC THIẾT BỊ');
console.log('================================================================\n');

// ============================================================================
// GROUP 1: KHÔNG CÒN CỬA SAU ĐĂNG NHẬP CỤC BỘ
// ============================================================================
runTest('AdminAuth.login bị vô hiệu ngoài môi trường test', () => {
  LS.clear();
  SS.clear();
  const res = AdminAuth.login('admin', 'x');
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.code, 'LOCAL_LOGIN_DISABLED', 'Phải trả mã lỗi rõ ràng');
  assert.strictEqual(AdminAuth.isAuthenticated(), false, 'Không được tạo phiên');
});

runTest('AdminAuth.loginPin bị vô hiệu ngoài môi trường test', () => {
  LS.clear();
  SS.clear();
  const res = AdminAuth.loginPin('1234');
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.code, 'LOCAL_LOGIN_DISABLED');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
});

// ============================================================================
// GROUP 2: XOÁ HASH MẬT KHẨU/PIN CÒN SÓT
// ============================================================================
runTest('Purge: xoá password/pin (cả hash+salt), giữ id/tên/vai trò', () => {
  LS.clear();
  SS.clear();
  LS.setItem(USERS_KEY, JSON.stringify(seededUsers()));
  global.window.__TVTS_AUTH_TEST__ = true;
  global.window.adminReloadAdminUsers();
  global.window.__TVTS_AUTH_TEST__ = false;

  // Cờ "đã purge" chưa có -> lần gọi này thực sự xoá
  const changed = AdminAuth.purgeLocalCredentials();
  assert.strictEqual(changed, true, 'Phải báo đã xoá');

  const users = JSON.parse(LS.getItem(USERS_KEY));
  users.forEach(u => {
    ['password', 'passwordHash', 'passwordSalt', 'pin', 'pinHash', 'pinSalt'].forEach(f => {
      assert.ok(!(f in u), `Không được còn trường ${f} của ${u.username}`);
    });
    assert.ok(u.id && u.username && u.fullName, 'Phải giữ id/username/fullName để hiển thị');
  });
});

runTest('Purge: chỉ chạy một lần (có cờ), lần sau không thay đổi gì', () => {
  LS.clear();
  SS.clear();
  LS.setItem(USERS_KEY, JSON.stringify(seededUsers()));
  global.window.__TVTS_AUTH_TEST__ = true;
  global.window.adminReloadAdminUsers();
  global.window.__TVTS_AUTH_TEST__ = false;

  assert.strictEqual(AdminAuth.purgeLocalCredentials(), true);
  assert.strictEqual(LS.getItem('ts_admin_local_creds_purged_v1'), '1', 'Phải đặt cờ một lần');
  assert.strictEqual(AdminAuth.purgeLocalCredentials(), false, 'Lần sau phải bỏ qua');
});

// ============================================================================
// GROUP 3: MÃ KHÔI PHỤC THIẾT BỊ
// ============================================================================
runTest('Mã khôi phục: chưa đăng nhập thì không tạo được', () => {
  LS.clear();
  SS.clear();
  global.window.AdminAuth.logout();
  const res = AdminAuth.createRecoveryCode();
  assert.ok(res.error, 'Phải báo lỗi khi chưa đăng nhập');
  assert.strictEqual(AdminAuth.hasRecoveryCode(), false);
});

runTest('Mã khôi phục: tạo được khi đã đăng nhập, lưu dạng hash (không plaintext)', () => {
  LS.clear();
  SS.clear();
  loginForSetup();

  const res = AdminAuth.createRecoveryCode();
  assert.ok(res.code, 'Phải trả về mã: ' + (res.error || ''));
  assert.ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(res.code), 'Định dạng XXXX-XXXX-XXXX: ' + res.code);
  assert.strictEqual(AdminAuth.hasRecoveryCode(), true);

  const raw = LS.getItem('ts_admin_recovery_v1');
  assert.ok(raw, 'Phải lưu bản ghi');
  assert.ok(!raw.includes(res.code.replace(/-/g, '')), 'Không được lưu plaintext mã');
  const rec = JSON.parse(raw);
  assert.ok(rec.hash && rec.salt && rec.hash !== res.code, 'Phải lưu hash + salt');
});

runTest('Mã khôi phục: nhập ĐÚNG thì mở phiên cục bộ và bật cờ localOnlySession', () => {
  LS.clear();
  SS.clear();
  loginForSetup();
  const created = AdminAuth.createRecoveryCode();

  global.window.AdminAuth.logout();
  assert.strictEqual(AdminAuth.isAuthenticated(), false, 'Phải đăng xuất trước khi khôi phục');

  const res = AdminAuth.verifyRecoveryCode(created.code);
  assert.strictEqual(res.success, true, 'Mã đúng phải mở được phiên: ' + JSON.stringify(res));
  assert.strictEqual(AdminAuth.isAuthenticated(), true);
  assert.strictEqual(AdminAuth.isLocalOnlySession(), true, 'Phải đánh dấu phiên chỉ dùng dữ liệu cục bộ');
});

runTest('Mã khôi phục: chấp nhận mã nhập có/không gạch, chữ thường', () => {
  LS.clear();
  SS.clear();
  loginForSetup();
  const created = AdminAuth.createRecoveryCode();
  global.window.AdminAuth.logout();

  const messy = ' ' + created.code.toLowerCase().replace(/-/g, ' ') + ' ';
  const res = AdminAuth.verifyRecoveryCode(messy);
  assert.strictEqual(res.success, true, 'Phải chuẩn hoá được mã người dùng nhập');
});

runTest('Mã khôi phục: nhập SAI thì không mở phiên', () => {
  LS.clear();
  SS.clear();
  loginForSetup();
  AdminAuth.createRecoveryCode();
  global.window.AdminAuth.logout();

  const res = AdminAuth.verifyRecoveryCode('AAAA-BBBB-CCCC');
  assert.strictEqual(res.success, false);
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
});

runTest('Mã khôi phục: sai 5 lần thì khoá 60 giây (dùng chung bộ đếm với đăng nhập)', () => {
  LS.clear();
  SS.clear();
  loginForSetup();
  AdminAuth.createRecoveryCode();
  global.window.AdminAuth.logout();

  for (let i = 0; i < 5; i++) AdminAuth.verifyRecoveryCode('ZZZZ-ZZZZ-ZZZZ');

  const res = AdminAuth.verifyRecoveryCode('ZZZZ-ZZZZ-ZZZZ');
  assert.strictEqual(res.success, false);
  assert.ok(/Tạm khoá/.test(res.message || ''), 'Phải báo đang bị khoá: ' + res.message);
});

runTest('Mã khôi phục: máy chưa tạo mã thì báo rõ, không cho qua', () => {
  LS.clear();
  SS.clear();
  const res = AdminAuth.verifyRecoveryCode('AAAA-BBBB-CCCC');
  assert.strictEqual(res.success, false);
  assert.ok(/chưa tạo mã khôi phục/i.test(res.message || ''), 'Thông báo phải hướng dẫn: ' + res.message);
});

// ============================================================================
// GROUP 4: PHIÊN KHÔI PHỤC KHÔNG ĐƯỢC ĐẨY CLOUD
// ============================================================================
runTest('Phiên khôi phục: chặn đẩy Cloud (không có phiên Google để xác thực)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
  const fn = src.match(/function canAutoPushToCloud\(\) \{[\s\S]*?\n  \}/);
  assert.ok(fn, 'Thiếu canAutoPushToCloud');
  assert.ok(/if \(state\.localOnlySession\) return false;/.test(fn[0]),
    'canAutoPushToCloud phải chặn khi đang ở phiên khôi phục');
});

// ============================================================================
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN (${Math.round((passed / (total || 1)) * 100)}%)`);
console.log('================================================================\n');

if (passed !== total) process.exit(1);
