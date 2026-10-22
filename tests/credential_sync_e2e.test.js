/**
 * ==========================================================================
 * AUTOMATED TEST SUITE: ĐỒNG BỘ TÀI KHOẢN CÁN BỘ GIỮA HAI MÁY (END-TO-END)
 * ==========================================================================
 * Mục tiêu nghiệp vụ: "Cấp quyền ở máy A -> máy B đăng nhập được ngay bằng
 * đúng mật khẩu/PIN vừa cấp", nhưng KHÔNG được để lộ mật khẩu/PIN trên Cloud.
 *
 * Bộ test này dựng HAI môi trường trình duyệt độc lập (máy A, máy B), nạp
 * admin.js + cloud_sync.js thật, rồi chạy đúng luồng:
 *
 *   Máy A: setUserSecret() -> localStorage -> buildPayload() (chỉ hash)
 *   Máy B: applyPayload() -> localStorage -> verifyUserSecret()
 *
 * Nhờ vậy nó bắt được lệch tên trường giữa hai module — loại lỗi mà test
 * đơn vị riêng lẻ không thấy (mỗi bên tự đúng nhưng ghép lại sai).
 * ========================================================================== */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const adminSrc = fs.readFileSync(path.join(ROOT, 'js/admin.js'), 'utf8');
const cloudSrc = fs.readFileSync(path.join(ROOT, 'js/cloud_sync.js'), 'utf8');

let passed = 0;
let total = 0;

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

/** Môi trường tối giản mô phỏng một trình duyệt riêng biệt. */
function createBrowserEnv() {
  const store = {};
  const storage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: i => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; }
  };

  const win = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    sessionStorage: storage,
    matchMedia: () => ({ matches: false }),
    crypto: nodeCrypto.webcrypto,
    confirm: () => true,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {}
  };

  const makeEl = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild() {}, addEventListener() {},
    querySelectorAll: () => [], querySelector: () => null,
    textContent: '', innerHTML: '', value: ''
  });

  const doc = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: makeEl,
    body: { appendChild() {} },
    documentElement: { setAttribute() {}, removeAttribute() {} }
  };

  return { store, storage, win, doc };
}

/** Nạp admin.js vào môi trường (chỉ cần AdminCredential, không cần DOM thật). */
function loadAdmin(env) {
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'localStorage', 'sessionStorage', 'navigator', adminSrc)(
    env.win, env.doc, env.storage, env.storage, { userAgent: 'node' }
  );
  return env.win.AdminCredential;
}

/** Nạp cloud_sync.js vào môi trường, trả về CloudSyncManager. */
function loadCloud(env) {
  const FakeCustomEvent = function (type, init) {
    this.type = type;
    this.detail = init && init.detail;
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'localStorage', 'fetch', 'CustomEvent', 'setTimeout', cloudSrc)(
    env.win, env.doc, env.storage, env.win.fetch, FakeCustomEvent, () => 0
  );
  return env.win.CloudSyncManager;
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  ĐỒNG BỘ TÀI KHOẢN CÁN BỘ GIỮA HAI MÁY (END-TO-END)               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// --- Máy A: tạo tài khoản như form "Thêm Cán Bộ" -------------------------
const machineA = createBrowserEnv();
const credentialA = loadAdmin(machineA);
const cloudA = loadCloud(machineA);

const newUser = {
  id: 'usr_e2e',
  username: 'canbo_e2e',
  fullName: 'Cán Bộ Kiểm Thử',
  role: 'Điều phối viên tuyển sinh'
};
const PLAIN_PASSWORD = 'MatKhau123';
const PLAIN_PIN = '864209';
credentialA.setUserSecret(newUser, 'password', PLAIN_PASSWORD);
credentialA.setUserSecret(newUser, 'pin', PLAIN_PIN);
machineA.storage.setItem('ts_scheduler_admin_users', JSON.stringify([newUser]));

runTest('E2E.1: Máy A lưu tài khoản dưới dạng hash, không còn plaintext', () => {
  assert.strictEqual(newUser.password, undefined, 'Máy A còn lưu password thô');
  assert.strictEqual(newUser.pin, undefined, 'Máy A còn lưu pin thô');
  assert.ok(newUser.passwordHash && newUser.passwordSalt, 'Thiếu passwordHash/passwordSalt');
  assert.ok(newUser.pinHash && newUser.pinSalt, 'Thiếu pinHash/pinSalt');
});

// --- Máy A đẩy lên Cloud -------------------------------------------------
const payload = cloudA.buildPayload();
const sentRecord = payload.adminUsers.find(u => u.username === 'canbo_e2e');

runTest('E2E.2: Payload gửi Cloud chỉ chứa hash, không có mật khẩu/PIN thô', () => {
  assert.ok(sentRecord, 'Payload không chứa tài khoản vừa tạo');
  assert.strictEqual(sentRecord.password, undefined, 'Payload lộ password thô');
  assert.strictEqual(sentRecord.pin, undefined, 'Payload lộ pin thô');
  assert.ok(sentRecord.passwordHash === newUser.passwordHash, 'Hash mật khẩu không được đóng gói');
  assert.ok(sentRecord.pinHash === newUser.pinHash, 'Hash PIN không được đóng gói');
});

// --- Máy B: localStorage trống, kéo payload về ---------------------------
const machineB = createBrowserEnv();
const credentialB = loadCloud(machineB);
const applyResult = credentialB.applyPayload(JSON.parse(JSON.stringify(payload)));
const syncedOnB = JSON.parse(machineB.storage.getItem('ts_scheduler_admin_users') || '[]')
  .find(u => u.username === 'canbo_e2e');

runTest('E2E.3: Máy B nhận được tài khoản do máy A cấp quyền', () => {
  assert.strictEqual(applyResult.success, true, 'applyPayload thất bại');
  assert.ok(syncedOnB, 'Máy B không nhận được tài khoản — "cấp quyền máy A, dùng máy B" hỏng');
  assert.strictEqual(syncedOnB.password, undefined, 'Máy B nhận password thô từ Cloud');
  assert.strictEqual(syncedOnB.pin, undefined, 'Máy B nhận pin thô từ Cloud');
});

runTest('E2E.4: Máy B đăng nhập đúng mật khẩu/PIN vừa cấp, sai thì bị từ chối', () => {
  const validPassword = credentialA.verifyUserSecret(syncedOnB, 'password', PLAIN_PASSWORD);
  const wrongPassword = credentialA.verifyUserSecret(syncedOnB, 'password', 'SaiMatKhau');
  const validPin = credentialA.verifyUserSecret(syncedOnB, 'pin', PLAIN_PIN);
  const wrongPin = credentialA.verifyUserSecret(syncedOnB, 'pin', '000000');

  assert.strictEqual(validPassword, true, 'Máy B không đăng nhập được bằng mật khẩu đã cấp');
  assert.strictEqual(wrongPassword, false, 'Máy B chấp nhận mật khẩu sai');
  assert.strictEqual(validPin, true, 'Máy B không đăng nhập được bằng PIN đã cấp');
  assert.strictEqual(wrongPin, false, 'Máy B chấp nhận PIN sai');
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN (${Math.round((passed / (total || 1)) * 100)}%)`);
console.log('================================================================\n');

process.exit(passed === total && total > 0 ? 0 : 1);
