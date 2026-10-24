/**
 * ============================================================================
 * AUTOMATED TEST SUITE: #10 — NHẬT KÝ THAO TÁC QUẢN TRỊ (AUDIT LOG)
 * ============================================================================
 * Kiểm thử module js/audit.js:
 * 1. Ghi nhật ký: thứ tự mới→cũ, giới hạn 200 dòng, không ném lỗi.
 * 2. Người thực hiện: lấy từ phiên đăng nhập hoặc tham số, có fallback.
 * 3. Lọc: theo nhóm, theo từ khoá, theo giới hạn.
 * 4. Hiển thị: escapeHtml chống XSS, trạng thái rỗng, nhãn thời gian.
 * 5. Xoá: không xoá được dấu vết của chính thao tác xoá.
 * 6. Dây nối vào admin: audit.js được nạp trước admin.js và các thao tác
 *    quan trọng thực sự gọi auditLog(...).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Môi trường giả lập ------------------------------------------------------
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
global.localStorage = mockLocalStorage;
global.window = { localStorage: mockLocalStorage };

// 2. Nạp module cần kiểm thử -----------------------------------------------
eval(fs.readFileSync(path.resolve(__dirname, '../js/audit.js'), 'utf8'));

const Audit = global.window.AuditLog;
assert.ok(Audit && typeof Audit.log === 'function', 'js/audit.js phải export window.AuditLog');

// 3. Test runner ------------------------------------------------------------
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

function reset() {
  mockLocalStorage.clear();
  delete global.window.AdminAuth;
}

function rawEntries() {
  return JSON.parse(mockLocalStorage.getItem(Audit.STORAGE_KEY) || '[]');
}

console.log('================================================================');
console.log('🧾 BẮT ĐẦU KIỂM THỬ - NHẬT KÝ THAO TÁC QUẢN TRỊ (#10)');
console.log('================================================================\n');

// ============================================================================
// GROUP 1: GHI NHẬT KÝ
// ============================================================================
runTest('Ghi nhật ký: lưu đúng thao tác, mô tả, người thực hiện và thời gian', () => {
  reset();
  const entry = Audit.log('STUDENT_ADD', 'Thêm CTV "Nguyễn Văn A" (2102001)');

  assert.ok(entry, 'Phải trả về bản ghi vừa tạo');
  assert.strictEqual(entry.action, 'STUDENT_ADD');
  assert.ok(entry.detail.includes('Nguyễn Văn A'));
  assert.ok(entry.ts && !isNaN(new Date(entry.ts).getTime()), 'Phải có mốc thời gian hợp lệ');
  assert.strictEqual(entry.actorName, 'Không xác định', 'Chưa đăng nhập thì phải có nhãn fallback');

  assert.strictEqual(rawEntries().length, 1, 'Phải ghi đúng 1 dòng');
});

runTest('Ghi nhật ký: lấy tên người thực hiện từ phiên đăng nhập', () => {
  reset();
  global.window.AdminAuth = {
    getCurrentUser: () => ({ id: 'u1', username: 'admin', fullName: 'Trưởng Ban TVTS', role: 'admin' })
  };

  const entry = Audit.log('SCHEDULE_RUN', 'Xếp lịch tự động cho 30 CTV');
  assert.strictEqual(entry.actorName, 'Trưởng Ban TVTS');
  assert.strictEqual(entry.actorId, 'u1');
});

runTest('Ghi nhật ký: tham số actor được ưu tiên hơn phiên đăng nhập', () => {
  reset();
  global.window.AdminAuth = { getCurrentUser: () => ({ id: 'u1', fullName: 'Người Trong Phiên' }) };

  const entry = Audit.log('ACCOUNT_GRANT', 'Cấp quyền', { actor: { id: 'u2', name: 'Người Được Chỉ Định' } });
  assert.strictEqual(entry.actorName, 'Người Được Chỉ Định');
  assert.strictEqual(entry.actorId, 'u2');
});

runTest('Ghi nhật ký: dòng mới nhất đứng đầu danh sách', () => {
  reset();
  Audit.log('LOGIN', 'Lần 1');
  Audit.log('LOGOUT', 'Lần 2');
  Audit.log('SCHEDULE_RUN', 'Lần 3');

  const items = Audit.list();
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].detail, 'Lần 3', 'Mới nhất phải đứng đầu');
  assert.strictEqual(items[2].detail, 'Lần 1');
});

runTest('Ghi nhật ký: chỉ giữ tối đa 200 dòng, dòng cũ nhất bị đẩy ra', () => {
  reset();
  for (let i = 0; i < Audit.MAX_ENTRIES + 5; i++) {
    Audit.log('SETTINGS_UPDATE', `Thay đổi ${i}`);
  }

  const items = Audit.list();
  assert.strictEqual(items.length, Audit.MAX_ENTRIES, 'Chỉ được giữ 200 dòng');
  assert.strictEqual(items[0].detail, `Thay đổi ${Audit.MAX_ENTRIES + 4}`, 'Dòng mới nhất vẫn còn');
  assert.ok(!items.some(it => it.detail === 'Thay đổi 0'), 'Dòng cũ nhất phải bị đẩy ra');
});

runTest('Ghi nhật ký: action rỗng bị bỏ qua, không tạo dòng rác', () => {
  reset();
  assert.strictEqual(Audit.log('', 'không có action'), null);
  assert.strictEqual(Audit.log(null, 'null'), null);
  assert.strictEqual(Audit.list().length, 0);
});

runTest('Ghi nhật ký: mô tả được cắt gọn 1 dòng và tối đa 300 ký tự', () => {
  reset();
  const longText = 'A\nB\tC  ' + 'x'.repeat(500);
  const entry = Audit.log('STUDENT_UPDATE', longText);

  assert.ok(!/[\r\n\t]/.test(entry.detail), 'Không được giữ xuống dòng/tab');
  assert.ok(entry.detail.length <= 300, 'Mô tả tối đa 300 ký tự, thực tế: ' + entry.detail.length);
});

runTest('Ghi nhật ký: localStorage đầy (quota) thì trả null và KHÔNG ném lỗi', () => {
  reset();
  const originalSetItem = mockLocalStorage.setItem.bind(mockLocalStorage);
  mockLocalStorage.setItem = () => { throw new Error('QuotaExceededError'); };

  let result;
  assert.doesNotThrow(() => {
    result = Audit.log('BACKUP_CREATE', 'Tạo bản sao lưu');
  }, 'Nhật ký không được làm sập thao tác nghiệp vụ');
  assert.strictEqual(result, null, 'Không ghi được thì trả null');

  mockLocalStorage.setItem = originalSetItem;
});

// ============================================================================
// GROUP 2: LỌC & THỐNG KÊ
// ============================================================================
runTest('Lọc: theo nhóm thao tác (auth / member / schedule)', () => {
  reset();
  Audit.log('LOGIN', 'đăng nhập');
  Audit.log('STUDENT_ADD', 'thêm CTV');
  Audit.log('SCHEDULE_RUN', 'xếp lịch');
  Audit.log('STUDENT_DELETE', 'xoá CTV');

  assert.strictEqual(Audit.list({ group: 'auth' }).length, 1);
  assert.strictEqual(Audit.list({ group: 'member' }).length, 2);
  assert.strictEqual(Audit.list({ group: 'schedule' }).length, 1);
  assert.strictEqual(Audit.list({ group: 'all' }).length, 4, 'Nhóm "all" phải trả hết');
});

runTest('Lọc: theo từ khoá trong mô tả và tên người thực hiện', () => {
  reset();
  global.window.AdminAuth = { getCurrentUser: () => ({ id: 'u9', fullName: 'Cô Thư Ký' }) };
  Audit.log('STUDENT_ADD', 'Thêm CTV "Trần Thị B" (2211005)');
  Audit.log('STUDENT_ADD', 'Thêm CTV "Lê Văn C" (2102002)');
  delete global.window.AdminAuth;

  assert.strictEqual(Audit.list({ query: '2211005' }).length, 1);
  assert.strictEqual(Audit.list({ query: 'trần thị b' }).length, 1, 'Tìm không phân biệt hoa/thường');
  assert.strictEqual(Audit.list({ query: 'cô thư ký' }).length, 2, 'Tìm được theo tên người thực hiện');
  assert.strictEqual(Audit.list({ query: 'không tồn tại' }).length, 0);
});

runTest('Lọc: giới hạn số dòng trả về', () => {
  reset();
  for (let i = 0; i < 10; i++) Audit.log('LOGIN', `lần ${i}`);
  assert.strictEqual(Audit.list({ limit: 3 }).length, 3);
  assert.strictEqual(Audit.list({ limit: 0 }).length, 10, 'limit 0 nghĩa là không giới hạn');
});

runTest('Thống kê: đếm tổng và theo nhóm, lấy mốc thời gian mới nhất', () => {
  reset();
  const empty = Audit.stats();
  assert.strictEqual(empty.total, 0);
  assert.strictEqual(empty.lastTs, null);

  Audit.log('LOGIN', 'a');
  Audit.log('LOGIN_FAILED', 'b');
  Audit.log('BACKUP_CREATE', 'c');

  const stats = Audit.stats();
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.byGroup.auth, 2);
  assert.strictEqual(stats.byGroup.data, 1);
  assert.ok(stats.lastTs);
});

// ============================================================================
// GROUP 3: HIỂN THỊ
// ============================================================================
runTest('Hiển thị: escape HTML trong mô tả và tên người thực hiện (chống XSS)', () => {
  reset();
  global.window.AdminAuth = {
    getCurrentUser: () => ({ id: 'x', fullName: '<img src=x onerror=alert(1)>' })
  };
  Audit.log('STUDENT_ADD', '<script>alert("xss")</script>');
  delete global.window.AdminAuth;

  const html = Audit.renderTimeline(Audit.list());

  assert.ok(!html.includes('<script>alert'), 'Không được để lọt thẻ <script>');
  assert.ok(!html.includes('<img src=x'), 'Không được để lọt thẻ <img>');
  assert.ok(html.includes('&lt;script&gt;'), 'Phải escape thành thực thể HTML');
  assert.ok(html.includes('&lt;img'), 'Phải escape cả tên người thực hiện');
});

runTest('Hiển thị: nhãn thao tác lấy từ danh mục ACTIONS', () => {
  reset();
  Audit.log('STUDENT_ADD', 'Thêm CTV');
  const html = Audit.renderTimeline(Audit.list());

  assert.ok(html.includes('Thêm cộng tác viên'), 'Phải hiện nhãn tiếng Việt');
  assert.ok(html.includes('audit-entry'), 'Phải dùng đúng class CSS');
});

runTest('Hiển thị: trạng thái rỗng có hướng dẫn, không vỡ giao diện', () => {
  reset();
  const html = Audit.renderTimeline([]);
  assert.ok(html.includes('Chưa có thao tác nào'), 'Phải có thông điệp rỗng');
  assert.ok(html.includes('audit-empty'));
});

runTest('Hiển thị: dữ liệu không phải mảng không làm sập hàm render', () => {
  reset();
  assert.doesNotThrow(() => Audit.renderTimeline(null));
  assert.doesNotThrow(() => Audit.renderTimeline(undefined));
  assert.ok(Audit.renderTimeline(null).includes('Chưa có thao tác nào'));
});

runTest('Hiển thị: nhãn thời gian tương đối đúng các mốc', () => {
  reset();
  const now = Date.now();
  assert.strictEqual(Audit.formatRelative(new Date(now - 10 * 1000).toISOString()), 'vừa xong');
  assert.strictEqual(Audit.formatRelative(new Date(now - 5 * 60000).toISOString()), '5 phút trước');
  assert.strictEqual(Audit.formatRelative(new Date(now - 3 * 3600000).toISOString()), '3 giờ trước');
  assert.strictEqual(Audit.formatRelative(new Date(now - 2 * 86400000).toISOString()), '2 ngày trước');
  assert.ok(/^\d{2}\/\d{2}\/\d{4}$/.test(Audit.formatRelative('2020-01-15T08:00:00.000Z')));
  assert.strictEqual(Audit.formatRelative('không phải ngày'), '');
});

// ============================================================================
// GROUP 4: XOÁ & XUẤT
// ============================================================================
runTest('Xoá: xoá hết nhưng vẫn ghi lại chính thao tác xoá', () => {
  reset();
  Audit.log('LOGIN', 'a');
  Audit.log('LOGOUT', 'b');

  const removed = Audit.clear({ id: 'u1', name: 'Trưởng Ban' });
  assert.strictEqual(removed, 2);

  const items = Audit.list();
  assert.strictEqual(items.length, 1, 'Chỉ còn dòng ghi thao tác xoá');
  assert.strictEqual(items[0].action, 'AUDIT_CLEAR');
  assert.ok(items[0].detail.includes('2'), 'Dòng xoá phải nêu số dòng đã xoá');
  assert.strictEqual(items[0].actorName, 'Trưởng Ban');
});

runTest('Xuất JSON: hợp lệ, có tổng số dòng và đầy đủ bản ghi', () => {
  reset();
  Audit.log('LOGIN', 'a');
  Audit.log('STUDENT_ADD', 'b');

  const parsed = JSON.parse(Audit.exportJson());
  assert.strictEqual(parsed.total, 2);
  assert.strictEqual(parsed.entries.length, 2);
  assert.ok(parsed.exportedAt);
});

runTest('Dữ liệu hỏng trong localStorage: coi như rỗng, không ném lỗi', () => {
  reset();
  mockLocalStorage.setItem(Audit.STORAGE_KEY, '{ hỏng json');
  assert.doesNotThrow(() => Audit.list());
  assert.deepStrictEqual(Audit.list(), []);

  mockLocalStorage.setItem(Audit.STORAGE_KEY, '{"khong":"phai mang"}');
  assert.deepStrictEqual(Audit.list(), [], 'Object không phải mảng phải bị bỏ qua');
});

// ============================================================================
// GROUP 5: DÂY NỐI VÀO TRANG QUẢN TRỊ
// ============================================================================
runTest('Dây nối: admin.html nạp audit.js TRƯỚC admin.js', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
  // Chỉ so khớp thẻ <script src=...>: trong HTML còn nhiều chú thích nhắc tới
  // "js/admin.js" ở phía trên, nếu dùng indexOf thô sẽ so sai vị trí.
  const auditTag = /<script\s+src="js\/audit\.js[^"]*"/.exec(html);
  const adminTag = /<script\s+src="js\/admin\.js[^"]*"/.exec(html);

  assert.ok(auditTag, 'admin.html phải nạp js/audit.js bằng thẻ <script>');
  assert.ok(adminTag, 'admin.html phải nạp js/admin.js bằng thẻ <script>');
  assert.ok(auditTag.index < adminTag.index, 'audit.js phải nạp trước admin.js');
});

runTest('Dây nối: các thao tác quan trọng trong admin.js thực sự gọi auditLog', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');
  const requiredActions = [
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
    'STUDENT_ADD', 'STUDENT_UPDATE', 'STUDENT_DELETE', 'STUDENT_CLEAR', 'ROLE_CHANGE',
    'SCHEDULE_RUN', 'SHIFT_ASSIGN', 'SHIFT_CLEAR',
    'SWAP_APPROVE', 'SWAP_REJECT',
    'MONTH_SWITCH', 'MONTH_RESET', 'BACKUP_CREATE', 'BACKUP_DELETE', 'BACKUP_RESTORE', 'BACKUP_IMPORT',
    'SETTINGS_UPDATE', 'PASSWORD_CHANGE', 'ACCOUNT_GRANT', 'ACCOUNT_REVOKE'
  ];

  const missing = requiredActions.filter(action => !src.includes(`auditLog('${action}'`));
  assert.deepStrictEqual(missing, [], 'Thiếu dây nối nhật ký cho: ' + missing.join(', '));
});

runTest('Dây nối: nhật ký KHÔNG bao giờ ghi mật khẩu/PIN của người dùng', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');

  // Cắt từng lời gọi auditLog(...) rồi soi phần tham số: nếu nội suy biến
  // chứa mật khẩu/PIN thì đó là rò rỉ bí mật vào nơi ai cũng đọc được.
  const forbidden = [
    /\$\{\s*password\s*\}/,
    /\$\{\s*currentPwd\s*\}/,
    /\$\{\s*newPwd\s*\}/,
    /\$\{\s*confirmPwd\s*\}/,
    /\$\{\s*pwd\s*\}/,
    /\$\{\s*pin\s*\}/,
    /\$\{\s*pStr\s*\}/
  ];

  const calls = [];
  let cursor = 0;
  while (true) {
    const at = src.indexOf('auditLog(', cursor);
    if (at === -1) break;
    calls.push(src.slice(at, at + 260));
    cursor = at + 1;
  }

  assert.ok(calls.length > 20, 'Phải có nhiều điểm gọi auditLog, thực tế: ' + calls.length);
  calls.forEach(snippet => {
    forbidden.forEach(pattern => {
      assert.ok(!pattern.test(snippet),
        'Không được nội suy mật khẩu/PIN vào nhật ký: ' + snippet.slice(0, 120));
    });
  });
});

// ============================================================================
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / (totalTests || 1)) * 100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
