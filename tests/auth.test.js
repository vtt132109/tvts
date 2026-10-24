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

// Seed tài khoản cục bộ KHÔNG mặc định trước khi eval admin.js.
// admin.js không còn DEFAULT_ADMIN_USERS: nếu storage trống thì danh sách rỗng
// và giao diện chuyển sang form "Thiết lập lần đầu". Test cần tài khoản để
// kiểm thử đăng nhập/PIN, nên tự seed dữ liệu plaintext (legacy) như máy cũ.
const QA_ADMIN_A = {
  id: 'usr_qa_truongban',
  username: 'truongban.qa',
  password: 'QaTruongBan#2026',
  pin: '246813',
  fullName: 'Trưởng Ban Kiểm Thử',
  role: 'Trưởng ban điều hành',
  createdAt: Date.now() - 500000
};
const QA_ADMIN_B = {
  id: 'usr_qa_dieuphoi',
  username: 'dieuphoi.qa',
  password: 'QaDieuPhoi#2026',
  pin: '135792',
  fullName: 'Điều Phối Kiểm Thử',
  role: 'Điều phối viên tuyển sinh',
  createdAt: Date.now() - 300000
};
const QA_ADMIN_USERS_KEY = 'ts_scheduler_admin_users';
mockLocalStorage.setItem(QA_ADMIN_USERS_KEY, JSON.stringify([QA_ADMIN_A, QA_ADMIN_B]));

// Tiện ích dùng chung phải nạp trước (giống thứ tự <script> trong admin.html).
eval(fs.readFileSync(path.resolve(__dirname, '../js/common.js'), 'utf8'));

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

runTest('Đăng nhập thành công với tài khoản Trưởng ban đã seed (truongban.qa)', () => {
  mockSessionStorage.clear();
  const res = AdminAuth.login(QA_ADMIN_A.username, QA_ADMIN_A.password);
  assert.strictEqual(res.success, true, 'Đăng nhập Trưởng ban phải thành công');
  assert.strictEqual(res.user.username, QA_ADMIN_A.username);
  assert.strictEqual(res.user.role, 'Trưởng ban điều hành');
  assert.strictEqual(AdminAuth.isAuthenticated(), true, 'Trạng thái đăng nhập phải là true');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), 'true', 'sessionStorage phải lưu token');
});

runTest('Đăng nhập thành công với tài khoản Điều phối đã seed (dieuphoi.qa)', () => {
  mockSessionStorage.clear();
  const res = AdminAuth.login(QA_ADMIN_B.username, QA_ADMIN_B.password);
  assert.strictEqual(res.success, true, 'Đăng nhập Điều phối phải thành công');
  assert.strictEqual(res.user.username, QA_ADMIN_B.username);
  assert.strictEqual(res.user.role, 'Điều phối viên tuyển sinh');
  assert.strictEqual(AdminAuth.isAuthenticated(), true);
});

runTest('Đăng nhập thành công bằng Mã PIN nhanh của hai tài khoản seed', () => {
  mockSessionStorage.clear();
  const res1 = AdminAuth.loginPin(QA_ADMIN_A.pin);
  assert.strictEqual(res1.success, true, 'PIN của Trưởng ban phải khớp');
  assert.strictEqual(res1.user.username, QA_ADMIN_A.username);

  mockSessionStorage.clear();
  const res2 = AdminAuth.loginPin(QA_ADMIN_B.pin);
  assert.strictEqual(res2.success, true, 'PIN của Điều phối phải khớp');
  assert.strictEqual(res2.user.username, QA_ADMIN_B.username);
});

runTest('Từ chối khi nhập sai mật khẩu hoặc sai username', () => {
  mockSessionStorage.clear();
  AdminAuth.logout();

  const badPwd = AdminAuth.login(QA_ADMIN_A.username, 'sai_mat_khau');
  assert.strictEqual(badPwd.success, false, 'Sai mật khẩu phải trả về false');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), null);

  const badUser = AdminAuth.login('khong_ton_tai.qa', '123');
  assert.strictEqual(badUser.success, false, 'Username không tồn tại phải trả về false');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
});

runTest('Từ chối khi nhập sai Mã PIN', () => {
  mockSessionStorage.clear();
  AdminAuth.logout();

  const badPin = AdminAuth.loginPin('314159');
  assert.strictEqual(badPin.success, false, 'Mã PIN sai phải trả về false');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
});

runTest('Quy trình Đăng Xuất (Logout) xóa sạch phiên và khóa hệ thống', () => {
  AdminAuth.login(QA_ADMIN_A.username, QA_ADMIN_A.password);
  assert.strictEqual(AdminAuth.isAuthenticated(), true);
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), 'true');

  AdminAuth.logout();
  assert.strictEqual(AdminAuth.isAuthenticated(), false, 'Sau khi logout, isAuthenticated phải là false');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), null, 'sessionStorage phải bị dọn sạch');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_user_data'), null);
});

// ============================================================================
// TEST GROUP: BẢO MẬT MÃ PIN NÂNG CAO (PIN SECURITY & HARDENING)
// ============================================================================
runTest('Bảo mật mã PIN: Từ chối các mã PIN rỗng, null, khoảng trắng hoặc ký tự chữ cái', () => {
  mockSessionStorage.clear();
  AdminAuth.logout();

  // Test PIN rỗng
  const emptyRes = AdminAuth.loginPin('');
  assert.strictEqual(emptyRes.success, false, 'PIN rỗng phải bị từ chối');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);

  // Test PIN chỉ chứa khoảng trắng
  const spaceRes = AdminAuth.loginPin('   ');
  assert.strictEqual(spaceRes.success, false, 'PIN khoảng trắng phải bị từ chối');

  // Test PIN null hoặc undefined
  const nullRes = AdminAuth.loginPin(null);
  assert.strictEqual(nullRes.success, false, 'PIN null phải bị từ chối');
  const undefRes = AdminAuth.loginPin(undefined);
  assert.strictEqual(undefRes.success, false, 'PIN undefined phải bị từ chối');

  // Test PIN chứa chữ cái hoặc độ dài bất thường
  const textRes = AdminAuth.loginPin('khong_phai_pin');
  assert.strictEqual(textRes.success, false, 'PIN chữ cái phải bị từ chối');
  const longRes = AdminAuth.loginPin('123456789012');
  assert.strictEqual(longRes.success, false, 'PIN sai độ dài phải bị từ chối');
});

runTest('Bảo mật mã PIN: Phân quyền chính xác và lưu phiên an toàn trong sessionStorage', () => {
  mockSessionStorage.clear();
  AdminAuth.logout();

  // Đăng nhập PIN của tài khoản Trưởng ban đã seed
  const pinAdminRes = AdminAuth.loginPin(QA_ADMIN_A.pin);
  assert.strictEqual(pinAdminRes.success, true);
  assert.strictEqual(pinAdminRes.user.role, 'Trưởng ban điều hành');
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), 'true');

  // Dữ liệu người dùng trong session
  const storedUserJson = mockSessionStorage.getItem('ts_admin_user_data');
  assert.ok(storedUserJson, 'Phải có dữ liệu người dùng trong session');
  const storedUser = JSON.parse(storedUserJson);
  assert.strictEqual(storedUser.username, QA_ADMIN_A.username);

  // Logout và kiểm tra lại
  AdminAuth.logout();
  assert.strictEqual(AdminAuth.isAuthenticated(), false);
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_authenticated'), null);
  assert.strictEqual(mockSessionStorage.getItem('ts_admin_user_data'), null);
});

// ============================================================================
// TEST GROUP: CHỐNG DÒ MẬT KHẨU / PIN & HẾT HẠN PHIÊN
// ============================================================================
runTest('Chống dò PIN: khoá 60 giây sau 5 lần nhập sai đúng định dạng', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  AdminAuth.logout();

  for (let i = 0; i < 5; i++) {
    const res = AdminAuth.loginPin('0001');
    assert.strictEqual(res.success, false, `Lần sai #${i + 1} phải thất bại`);
  }

  const locked = AdminAuth.loginPin(QA_ADMIN_A.pin);
  assert.strictEqual(locked.success, false,
    'Đang bị khoá thì nhập PIN ĐÚNG cũng phải bị từ chối');

  mockLocalStorage.removeItem('ts_admin_login_guard');
  const unlocked = AdminAuth.loginPin(QA_ADMIN_A.pin);
  assert.strictEqual(unlocked.success, true, 'Hết thời gian khoá thì PIN đúng phải đăng nhập được');
  AdminAuth.logout();
});

runTest('Chống dò PIN: nhập sai ĐỊNH DẠNG không bị tính là dò', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  AdminAuth.logout();

  ['', '   ', 'abc', '12', '123456789012'].forEach(pin => AdminAuth.loginPin(pin));

  const res = AdminAuth.loginPin(QA_ADMIN_A.pin);
  assert.strictEqual(res.success, true, 'Gõ nhầm/rỗng không được làm khoá tài khoản');
  AdminAuth.logout();
});

runTest('Phiên đăng nhập hết hạn sau 12 giờ', () => {
  mockSessionStorage.clear();

  mockSessionStorage.setItem('ts_admin_session_started', String(Date.now() - 13 * 60 * 60 * 1000));
  assert.strictEqual(AdminAuth.isSessionExpired(), true, 'Phiên 13 giờ phải coi là hết hạn');

  mockSessionStorage.setItem('ts_admin_session_started', String(Date.now()));
  assert.strictEqual(AdminAuth.isSessionExpired(), false, 'Phiên vừa tạo không được coi là hết hạn');

  mockSessionStorage.clear();
});

// ============================================================================
// TEST GROUP: BĂM MẬT KHẨU / PIN (KHÔNG LƯU PLAINTEXT)
// ============================================================================
runTest('Băm mật khẩu: SHA-256 khớp vector chuẩn FIPS 180-4', () => {
  const C = global.window.AdminCredential;
  assert.ok(C, 'Thiếu window.AdminCredential');
  assert.strictEqual(C.sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'SHA-256 chuỗi rỗng sai');
  assert.strictEqual(C.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'SHA-256 "abc" sai');
});

runTest('Băm mật khẩu: có muối, không lưu plaintext, xác thực đúng/sai chuẩn', () => {
  const C = global.window.AdminCredential;
  const user = { username: 'kiem_thu' };
  C.setUserSecret(user, 'password', 'MatKhauManh123');

  assert.strictEqual(user.password, undefined, 'Không được lưu mật khẩu thô');
  assert.ok(user.passwordHash && user.passwordSalt, 'Phải có hash + salt');
  assert.strictEqual(C.verifyUserSecret(user, 'password', 'MatKhauManh123'), true, 'Mật khẩu đúng phải khớp');
  assert.strictEqual(C.verifyUserSecret(user, 'password', 'sai_mat_khau'), false, 'Mật khẩu sai phải trượt');

  // Cùng mật khẩu nhưng salt khác -> hash khác (chống rainbow table)
  const other = { username: 'kiem_thu_2' };
  C.setUserSecret(other, 'password', 'MatKhauManh123');
  assert.notStrictEqual(user.passwordHash, other.passwordHash,
    'Hai tài khoản cùng mật khẩu phải ra hash khác nhau');
});

runTest('Storage trống: danh sách cán bộ rỗng, KHÔNG seed tài khoản mặc định', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  AdminAuth.logout();

  window.adminReloadAdminUsers();
  assert.strictEqual(AdminAuth.getAdminUsers().length, 0,
    'Không được tự sinh tài khoản mặc định khi localStorage trống');
  assert.strictEqual(mockLocalStorage.getItem(QA_ADMIN_USERS_KEY), null,
    'Không được ghi danh sách mặc định vào storage');
});

runTest('Băm mật khẩu: tài khoản plaintext legacy tự nâng cấp sau lần đăng nhập đầu', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  AdminAuth.logout();

  const legacyUser = {
    id: 'usr_legacy_qa',
    username: 'legacy.qa',
    password: 'LegacyPass#2026',
    pin: '112233',
    fullName: 'Cán Bộ Nâng Cấp',
    role: 'Điều phối viên tuyển sinh',
    createdAt: Date.now()
  };
  mockLocalStorage.setItem(QA_ADMIN_USERS_KEY, JSON.stringify([legacyUser]));
  window.adminReloadAdminUsers();

  const before = AdminAuth.getAdminUsers().find(u => u.username === 'legacy.qa');
  assert.ok(before && before.password === 'LegacyPass#2026',
    'Dữ liệu seed phải còn plaintext trước lần đăng nhập đầu');

  const res = AdminAuth.login('legacy.qa', 'LegacyPass#2026');
  assert.strictEqual(res.success, true, 'Đăng nhập tài khoản legacy phải thành công');
  assert.strictEqual(res.user.password, undefined, 'Sau đăng nhập, plaintext phải bị xoá');
  assert.ok(res.user.passwordHash && res.user.passwordSalt, 'Phải được băm có muối');

  AdminAuth.logout();
  const again = AdminAuth.login('legacy.qa', 'LegacyPass#2026');
  assert.strictEqual(again.success, true, 'Lần sau phải đăng nhập được bằng hash');
  AdminAuth.logout();
});

runTest('Tự vô hiệu hoá tài khoản còn dùng credential mặc định cũ (kể cả đã băm)', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  AdminAuth.logout();

  const C = global.window.AdminCredential;
  const hashedDefault = {
    id: 'usr_old_diephoi',
    username: 'diephoi',
    fullName: 'Điều Phối Cũ',
    role: 'Điều phối viên tuyển sinh'
  };
  C.setUserSecret(hashedDefault, 'password', '0000');
  C.setUserSecret(hashedDefault, 'pin', '8888');

  const plainDefault = {
    id: 'usr_old_admin',
    username: 'admin',
    password: '0000',
    pin: '9999',
    fullName: 'Trưởng Ban Cũ',
    role: 'Trưởng ban điều hành'
  };

  mockLocalStorage.setItem(QA_ADMIN_USERS_KEY, JSON.stringify([
    plainDefault,
    hashedDefault,
    QA_ADMIN_A
  ]));

  window.adminReloadAdminUsers();
  const left = AdminAuth.getAdminUsers();
  assert.strictEqual(left.length, 1, 'Chỉ tài khoản không dùng credential mặc định được giữ');
  assert.strictEqual(left[0].username, QA_ADMIN_A.username);
  assert.strictEqual(JSON.parse(mockLocalStorage.getItem(QA_ADMIN_USERS_KEY)).length, 1,
    'Danh sách trong storage cũng phải được dọn');
  assert.strictEqual(AdminAuth.login('admin', '0000').success, false,
    'Tài khoản admin/0000 cũ không được đăng nhập nữa');
});

runTest('Thiết lập lần đầu: chặn xác nhận PIN sai và tạo được Trưởng ban khi storage trống', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  AdminAuth.logout();
  window.adminReloadAdminUsers();
  assert.strictEqual(AdminAuth.getAdminUsers().length, 0, 'Phải bắt đầu từ danh sách rỗng');
  assert.strictEqual(elementsMap['admin-first-run'].style.display, 'block',
    'Phải hiện form thiết lập lần đầu khi chưa có tài khoản');
  assert.strictEqual(elementsMap['admin-auth-tabs'].style.display, 'none',
    'Phải ẩn tab đăng nhập khi chưa có tài khoản');
  assert.strictEqual(elementsMap['form-auth-credentials'].style.display, 'none',
    'Phải ẩn form đăng nhập khi chưa có tài khoản');
  assert.strictEqual(elementsMap['auth-error-box'].style.display, 'none',
    'Phải ẩn hộp lỗi đăng nhập khi chưa có tài khoản');

  const form = elementsMap['form-admin-first-run'];
  assert.ok(form && form.listeners && form.listeners.submit && form.listeners.submit.length > 0,
    'admin.js phải bind submit cho #form-admin-first-run');
  const submit = form.listeners.submit[0];

  elementsMap['first-run-fullname'].value = 'Trưởng Ban Khởi Tạo';
  elementsMap['first-run-username'].value = 'first.run.qa';
  elementsMap['first-run-password'].value = 'FirstRun#2026';
  elementsMap['first-run-password-confirm'].value = 'FirstRun#2026';
  elementsMap['first-run-pin'].value = '112244';
  elementsMap['first-run-pin-confirm'].value = '112245'; // cố ý lệch

  submit({ preventDefault() {} });
  assert.strictEqual(AdminAuth.getAdminUsers().length, 0, 'PIN xác nhận lệch không được tạo tài khoản');
  assert.strictEqual(AdminAuth.isAuthenticated(), false);

  elementsMap['first-run-pin-confirm'].value = '112244';
  submit({ preventDefault() {} });

  assert.strictEqual(AdminAuth.getAdminUsers().length, 1, 'Phải tạo đúng 1 Trưởng ban');
  const created = AdminAuth.getAdminUsers()[0];
  assert.strictEqual(created.username, 'first.run.qa');
  assert.strictEqual(created.role, 'Trưởng ban điều hành');
  assert.strictEqual(created.password, undefined, 'Không được lưu mật khẩu thô');
  assert.ok(created.passwordHash && created.pinHash, 'Mật khẩu/PIN phải được băm');
  assert.strictEqual(AdminAuth.isAuthenticated(), true, 'Tạo xong phải vào dashboard ngay');
  assert.strictEqual(elementsMap['admin-first-run'].style.display, 'none',
    'Sau khi tạo tài khoản, form thiết lập lần đầu phải ẩn đi');
  assert.notStrictEqual(elementsMap['admin-auth-tabs'].style.display, 'none',
    'Sau khi tạo tài khoản, tab đăng nhập phải hiện lại cho lần sau');

  const stored = JSON.parse(mockLocalStorage.getItem(QA_ADMIN_USERS_KEY));
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].username, 'first.run.qa');
  assert.ok(stored[0].passwordHash && stored[0].pinHash, 'Storage cũng chỉ lưu hash');
});

// ============================================================================
// TEST GROUP: LÀM SẠCH DỮ LIỆU & PHÒNG CHỐNG XSS (ESCAPEHTML SANITIZATION)
// ============================================================================
// Trích xuất hàm escapeHtml từ admin.js và student.js để kiểm thử bảo mật
const adminEscapeMatch = adminJsContent.match(/function escapeHtml\(str\) \{[\s\S]*?\n  \}/);
assert.ok(adminEscapeMatch, 'Hàm escapeHtml phải được định nghĩa trong admin.js');
const escapeHtmlAdmin = eval(`(${adminEscapeMatch[0]})`);

const studentJsPath = path.resolve(__dirname, '../js/student.js');
const studentJsContent = fs.readFileSync(studentJsPath, 'utf8');
const studentEscapeMatch = studentJsContent.match(/function escapeHtml\(str\) \{[\s\S]*?\n  \}/);
assert.ok(studentEscapeMatch, 'Hàm escapeHtml phải được định nghĩa trong student.js');
const escapeHtmlStudent = eval(`(${studentEscapeMatch[0]})`);

runTest('escapeHtml: Loại bỏ các thẻ độc hại <script> và đóng thẻ </script>', () => {
  const payload = '<script>alert("Hacked!");</script>';
  const sanitized = escapeHtmlAdmin(payload);
  assert.strictEqual(
    sanitized,
    '&lt;script&gt;alert(&quot;Hacked!&quot;);&lt;/script&gt;',
    'Phải mã hóa toàn bộ thẻ script và dấu ngoặc kép'
  );
  assert.strictEqual(sanitized.includes('<script>'), false, 'Không được còn thẻ mở script');
  assert.strictEqual(sanitized.includes('</script>'), false, 'Không được còn thẻ đóng script');
});

runTest('escapeHtml: Mã hóa dấu ngoặc kép " và dấu nháy đơn \' ngăn chặn attribute injection', () => {
  const quotePayload = '"><img src=x onerror=alert(1)>';
  const sanitizedQuotes = escapeHtmlAdmin(quotePayload);
  assert.strictEqual(sanitizedQuotes.includes('"'), false, 'Dấu ngoặc kép phải được chuyển thành &quot;');
  assert.strictEqual(sanitizedQuotes.includes('&quot;'), true);

  const singleQuotePayload = "' onfocus='alert(2)";
  const sanitizedSingle = escapeHtmlAdmin(singleQuotePayload);
  assert.strictEqual(sanitizedSingle.includes("'"), false, "Dấu nháy đơn phải được chuyển thành &#039;");
  assert.strictEqual(sanitizedSingle.includes('&#039;'), true);
});

runTest('escapeHtml: Mã hóa ký tự & thành &amp; tránh nhầm lẫn thực thể HTML', () => {
  const ampersandPayload = 'Ban Tuyển Sinh & Tư Vấn Hướng Nghiệp';
  const sanitized = escapeHtmlAdmin(ampersandPayload);
  assert.strictEqual(sanitized, 'Ban Tuyển Sinh &amp; Tư Vấn Hướng Nghiệp');

  const multipleAmpersands = 'A & B && C & D';
  const multiSanitized = escapeHtmlAdmin(multipleAmpersands);
  assert.strictEqual(multiSanitized, 'A &amp; B &amp;&amp; C &amp; D');
});

runTest('escapeHtml: Phòng chống payload XSS phức hợp kết hợp script, event handlers, img, svg', () => {
  const complexPayload = `<script src="http://evil.com/xss.js" id='hack' test="a&b"></script><svg onload=alert(document.cookie)>`;
  const sanitized = escapeHtmlAdmin(complexPayload);

  // Không còn bất kỳ ký tự raw nguy hiểm nào: <, >, ", '
  assert.strictEqual(sanitized.includes('<'), false);
  assert.strictEqual(sanitized.includes('>'), false);
  assert.strictEqual(sanitized.includes('"'), false);
  assert.strictEqual(sanitized.includes("'"), false);

  assert.strictEqual(
    sanitized,
    '&lt;script src=&quot;http://evil.com/xss.js&quot; id=&#039;hack&#039; test=&quot;a&amp;b&quot;&gt;&lt;/script&gt;&lt;svg onload=alert(document.cookie)&gt;'
  );
});

runTest('escapeHtml: Xử lý an toàn các giá trị biên (chuỗi rỗng, null, undefined, số)', () => {
  assert.strictEqual(escapeHtmlAdmin(''), '', 'Chuỗi rỗng trả về chuỗi rỗng');
  assert.strictEqual(escapeHtmlAdmin(null), '', 'null trả về chuỗi rỗng');
  assert.strictEqual(escapeHtmlAdmin(undefined), '', 'undefined trả về chuỗi rỗng');
  assert.strictEqual(escapeHtmlAdmin(0), '', 'Giá trị falsy 0 trả về chuỗi rỗng an toàn');
  assert.strictEqual(escapeHtmlAdmin(2026), '2026', 'Số 2026 trả về chuỗi "2026"');
  assert.strictEqual(escapeHtmlAdmin('HCM-UTE Tuyển Sinh'), 'HCM-UTE Tuyển Sinh', 'Văn bản thuần túy không đổi');
});

runTest('escapeHtml: Tính đồng nhất tuyệt đối giữa triển khai trong admin.js và student.js', () => {
  const testInputs = [
    '<script>alert("test")</script>',
    'SV: Nguyễn Văn A & Trần B <cũ>',
    `"><svg/onload=alert('xss')>`,
    'MSSV: 2102001',
    '',
    null,
    undefined,
    12345
  ];

  testInputs.forEach((input) => {
    const adminOutput = escapeHtmlAdmin(input);
    const studentOutput = escapeHtmlStudent(input);
    assert.strictEqual(
      adminOutput,
      studentOutput,
      `Kết quả escapeHtml cho input "${input}" giữa admin.js và student.js phải hoàn toàn giống nhau`
    );
  });
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
