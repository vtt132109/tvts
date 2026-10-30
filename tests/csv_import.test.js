/**
 * ============================================================================
 * AUTOMATED TEST SUITE: CSV IMPORT VALIDATION (QA-AGENT)
 * ============================================================================
 * Kiểm thử analyzeStudentsCsv()/parseStudentsCsv() trong js/admin.js:
 *  - File hợp lệ nạp đủ 6 CTV (fixture synthetic)
 *  - Trùng MSSV trong file là lỗi chặn nhập (dòng trùng bị bỏ qua)
 *  - Thiếu cột Họ tên/MSSV và không có fallback vị trí hợp lý => lỗi
 *  - Thiếu cột vai trò => cảnh báo, mặc định Tập Sự
 *  - Dòng thiếu Họ tên/MSSV được đếm vào ignoredRows
 *  - Fixture synthetic không chứa dấu vết PII thật
 *
 * Chạy: node tests/csv_import.test.js
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Mock Storage & DOM tối thiểu (cùng kiểu với tests/auth.test.js)
// ---------------------------------------------------------------------------
class MockStorage {
  constructor() { this.store = {}; }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, val) { this.store[key] = String(val); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();
const elementsMap = {};

function createMockElement(id = '', tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
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
  removeEventListener: () => {},
  dispatchEvent: () => {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  location: { href: 'http://localhost/admin.html', reload: () => {} },
  confirm: () => true,
  alert: () => {},
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

// ---------------------------------------------------------------------------
// 2. Nạp scheduler engine (để có SHIFTS thật) rồi admin.js
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const monthCalendarCode = readSrc('js/month_calendar.js');
const schedulerCode = readSrc('js/scheduler.js');
// new Function('window', 'module') giống regression_guard: không ghi đè
// module.exports của chính file test này.
// eslint-disable-next-line no-new-func
new Function('window', 'module', monthCalendarCode)(global.window, undefined);
// eslint-disable-next-line no-new-func
new Function('window', 'module', schedulerCode)(global.window, undefined);

eval(readSrc('js/common.js'));
eval(readSrc('js/admin.js'));

assert.ok(global.window.csvImportTestHelper, 'admin.js phải export window.csvImportTestHelper');
const { parseStudentsCsv, analyzeStudentsCsv, isGoogleFormResponseCsv, analyzeGoogleFormCsv } = global.window.csvImportTestHelper;

// ---------------------------------------------------------------------------
// 3. Runner
// ---------------------------------------------------------------------------
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

console.log('================================================================');
console.log('📥 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG - VALIDATE NHẬP CSV DANH SÁCH CTV');
console.log('================================================================\n');

const fixturePath = path.join(__dirname, 'fixtures', 'roster_sample.csv');
const fixtureCsv = fs.readFileSync(fixturePath, 'utf8');

runTest('File fixture hợp lệ: nạp đủ 6 CTV (3 cũ + 3 mới), không lỗi/cảnh báo', () => {
  const report = analyzeStudentsCsv(fixtureCsv);

  assert.strictEqual(report.errors.length, 0,
    `Không được có lỗi: ${report.errors.join(' | ')}`);
  assert.strictEqual(report.warnings.length, 0,
    `Không được có cảnh báo: ${report.warnings.join(' | ')}`);
  assert.strictEqual(report.candidates.length, 6, 'Phải nạp đủ 6 CTV');
  assert.strictEqual(report.stats.validRows, 6);
  assert.strictEqual(report.stats.totalRows, 6);
  assert.strictEqual(report.stats.duplicateRows, 0);
  assert.strictEqual(report.stats.ignoredRows, 0);
  assert.strictEqual(report.stats.roleColumnFound, true, 'Fixture có cột Vai trò');

  const oldCount = report.candidates.filter(c => c.role === 'old').length;
  const newCount = report.candidates.filter(c => c.role === 'new').length;
  assert.strictEqual(oldCount, 3, 'Phải có 3 CTV cũ');
  assert.strictEqual(newCount, 3, 'Phải có 3 CTV mới');

  // parseStudentsCsv() vẫn phải trả về MẢNG (hợp đồng cho khoi_phuc_58.js)
  const parsed = parseStudentsCsv(fixtureCsv);
  assert.ok(Array.isArray(parsed), 'parseStudentsCsv phải trả về mảng');
  assert.strictEqual(parsed.length, 6);
});

runTest('Trùng MSSV trong file là LỖI chặn nhập; dòng trùng bị bỏ qua', () => {
  const csv = [
    'Họ và tên,MSSV,Vai trò',
    'Mẫu Trùng Một,99000011,CTV cũ',
    'Mẫu Trùng Hai,99000011,CTV mới',
    'Mẫu Hợp Lệ,99000012,CTV mới'
  ].join('\n');

  const report = analyzeStudentsCsv(csv);
  assert.ok(report.errors.length >= 1, 'Trùng MSSV phải tạo lỗi');
  assert.ok(report.errors.some(msg => /trùng/i.test(msg)), 'Thông báo lỗi phải nêu rõ trùng MSSV');
  assert.strictEqual(report.stats.duplicateRows, 1, 'Phải đếm đúng 1 dòng trùng');
  assert.strictEqual(report.candidates.length, 2, 'Chỉ giữ dòng MSSV xuất hiện đầu tiên');
  assert.strictEqual(report.stats.validRows, 2);
  assert.strictEqual(report.candidates.filter(c => c.studentId === '99000011').length, 1);
});

runTest('Thiếu cột Họ tên/MSSV và không có fallback vị trí hợp lý => LỖI', () => {
  const csv = [
    'Email,Số điện thoại',
    'khong.phai.ten@example.com,0901234567',
    'cung.khong.phai@example.com,0912345678'
  ].join('\n');

  const report = analyzeStudentsCsv(csv);
  assert.ok(report.errors.length >= 1, 'Phải báo lỗi khi không nhận diện được Họ tên/MSSV');
  assert.strictEqual(report.candidates.length, 0, 'Không được đoán bừa email/SĐT thành hồ sơ CTV');
  assert.ok(report.errors.some(msg => /Họ tên\/MSSV/i.test(msg)),
    'Thông báo lỗi phải nhắc cột Họ tên/MSSV');
});

runTest('Thiếu cột vai trò => CẢNH BÁO và mặc định Tập Sự (new)', () => {
  const csv = [
    'Họ và tên,MSSV,SĐT,Các ca rảnh',
    'Mẫu Không Vai Trò Một,99000021,,T2_S',
    'Mẫu Không Vai Trò Hai,99000022,,T3_C'
  ].join('\n');

  const report = analyzeStudentsCsv(csv);
  assert.strictEqual(report.errors.length, 0,
    `Thiếu cột vai trò chỉ là cảnh báo: ${report.errors.join(' | ')}`);
  assert.ok(report.warnings.length >= 1, 'Phải có cảnh báo thiếu cột vai trò');
  assert.ok(report.warnings.some(msg => /vai trò/i.test(msg)), 'Cảnh báo phải nhắc cột vai trò');
  assert.strictEqual(report.stats.roleColumnFound, false);
  assert.strictEqual(report.candidates.length, 2);
  assert.ok(report.candidates.every(c => c.role === 'new'),
    'Tất cả phải được mặc định là Tập Sự (new)');
});

runTest('Dòng thiếu Họ tên/MSSV được đếm vào ignoredRows và có cảnh báo', () => {
  const csv = [
    'Họ và tên,MSSV,Vai trò',
    'Mẫu Hợp Lệ,99000031,CTV cũ',
    ',99000032,CTV mới',
    'Thiếu Mã Sinh Viên,,CTV mới',
    'Mẫu Hợp Lệ Hai,99000033,CTV mới'
  ].join('\n');

  const report = analyzeStudentsCsv(csv);
  assert.strictEqual(report.errors.length, 0);
  assert.strictEqual(report.stats.totalRows, 4);
  assert.strictEqual(report.stats.ignoredRows, 2, 'Phải đếm 2 dòng thiếu tên/MSSV');
  assert.strictEqual(report.candidates.length, 2);
  assert.ok(report.warnings.some(msg => /bỏ qua/i.test(msg)), 'Phải cảnh báo các dòng bị bỏ qua');
});

runTest('Mã ca không nhận diện được => CẢNH BÁO, không chặn nhập', () => {
  const csv = [
    'Họ và tên,MSSV,Vai trò,Các ca rảnh',
    'Mẫu Ca Lạ,99000041,CTV mới,"T2_S, T9_Z"'
  ].join('\n');

  const report = analyzeStudentsCsv(csv);
  assert.strictEqual(report.errors.length, 0);
  assert.ok(report.warnings.some(msg => /mã ca/i.test(msg)), 'Phải cảnh báo mã ca lạ');
  assert.deepStrictEqual(report.candidates[0].availableShifts, ['T2_S']);
});

runTest('File Google Sheets có dòng tiêu đề lớn + dòng trống: vẫn tìm đúng header', () => {
  const csv = [
    'DANH SÁCH CTV TVTS,,,,',
    ',,,,',
    'STT,Họ và tên,MSSV,SĐT',
    '1,Mẫu Tiêu Đề Một,99000051,',
    '2,Mẫu Tiêu Đề Hai,99000052,',
    ',,,,',
    ',,,,'
  ].join('\n');

  const report = analyzeStudentsCsv(csv);
  assert.strictEqual(report.errors.length, 0, report.errors.join(' | '));
  assert.strictEqual(report.candidates.length, 2, 'Phải bỏ qua dòng tiêu đề lớn và dòng trống');
  assert.strictEqual(report.stats.totalRows, 2, 'Dòng ",,,," không được tính là dữ liệu lỗi');
  assert.strictEqual(report.stats.ignoredRows, 0);
});

runTest('Fixture synthetic không chứa dấu vết PII thật', () => {
  assert.ok(/giả lập/i.test(fixtureCsv), 'Fixture phải ghi rõ là dữ liệu giả lập');
  assert.ok(!fixtureCsv.includes('@'), 'Fixture không được chứa email');
  assert.ok(!/hcmute/i.test(fixtureCsv), 'Fixture không được chứa domain trường');
  assert.ok(!/(^|,)\s*0\d{9}\s*(,|$)/m.test(fixtureCsv), 'Fixture không được chứa SĐT thật');
  // MSSV synthetic nằm trong dải 99000001-99000006, không phải MSSV thật.
  const ids = [...fixtureCsv.matchAll(/(?:^|,)(9900000\d)(?=,|$)/gm)].map(m => m[1]);
  assert.strictEqual(new Set(ids).size, 6, 'Phải có đúng 6 MSSV synthetic dạng 9900000x');
});

// ---------------------------------------------------------------------------
// Google Form response importer
// ---------------------------------------------------------------------------
function seedFormStudents() {
  mockLocalStorage.setItem('ts_scheduler_active_month_v1', JSON.stringify({ month: 11, year: 2026 }));
  mockLocalStorage.setItem('ts_scheduler_availability_month_v1', '2026-11');
  mockLocalStorage.setItem('ts_scheduler_students', JSON.stringify([
    { id: 's_21', studentId: '99000021', fullName: 'Mẫu Form Một', role: 'old', availableShifts: [], monthlyAvailableShifts: { 1: [], 2: [], 3: [], 4: [] }, updatedAt: 1 },
    { id: 's_22', studentId: '99000022', fullName: 'Mẫu Form Hai', role: 'new', availableShifts: [], monthlyAvailableShifts: { 1: [], 2: [], 3: [], 4: [] }, updatedAt: 1 }
  ]));
  global.window.adminTestHelper.loadData();
}

const FORM_HEADER = '"Dấu thời gian","Họ và tên","Mã số sinh viên",'
  + '"Ngày 2–6/11/2026 — Chọn các buổi có thể làm",'
  + '"Ngày 9–13/11/2026 — Chọn các buổi có thể làm",'
  + '"Ngày 16–20/11/2026 — Chọn các buổi có thể làm",'
  + '"Ngày 23–27/11/2026 — Chọn các buổi có thể làm"';

const FORM_ROWS = [
  '"2026/10/16 9:50:18 CH GMT+7","Mẫu Form Một","99000021","2/11 (Thứ Hai) — Sáng;3/11 (Thứ Ba) — Chiều;20/10 (Thứ Ba) — Sáng","9/11 (Thứ Hai) — Chiều","16/11 (Thứ Hai) — Sáng","23/11 (Thứ Ba) — Chiều"',
  '"2026/10/30 10:00:00 CH GMT+7","Mẫu Form Một","99000021","4/11 (Thứ Tư) — Sáng","10/11 (Thứ Ba) — Sáng","17/11 (Thứ Ba) — Sáng","24/11 (Thứ Ba) — Sáng"',
  '"2026/10/16 9:55:00 CH GMT+7","Mẫu Form Hai","99000022","5/11 (Thứ Năm) — Chiều","","",""',
  '"2026/10/16 9:56:00 CH GMT+7","Mẫu Ngoài Danh Sách","99000099","2/11 (Thứ Hai) — Sáng","","",""'
];

runTest('Google Form: nhận dạng đúng file phản hồi, không nhận nhầm CSV danh sách', () => {
  assert.strictEqual(isGoogleFormResponseCsv(FORM_HEADER + '\n' + FORM_ROWS[0]), true);
  assert.strictEqual(isGoogleFormResponseCsv(fixtureCsv), false);
});

runTest('Google Form tháng 11: ánh xạ ngày → tuần/mã ca, bỏ ngày tháng 10, bỏ MSSV lạ', () => {
  seedFormStudents();
  const report = analyzeGoogleFormCsv(FORM_HEADER + '\n' + FORM_ROWS.join('\n'), { month: 11, year: 2026 });

  assert.strictEqual(report.errors.length, 0, report.errors.join(' | '));
  assert.strictEqual(report.candidates.length, 2, 'Chỉ 2 MSSV có trong danh sách CTV');
  assert.strictEqual(report.stats.duplicateRows, 1, 'Một MSSV gửi 2 phản hồi');
  assert.strictEqual(report.stats.unmatchedRows, 1, 'Một MSSV không có trong danh sách');
  assert.strictEqual(report.stats.outOfMonthSelections, 1, 'Một lựa chọn ngày 20/10 phải bị bỏ');
  assert.strictEqual(report.stats.validRows, 2);

  const one = report.candidates.find(c => c.studentId === '99000021');
  // Phản hồi mới nhất (30/10) thắng: 4/11, 10/11, 17/11, 24/11.
  assert.deepStrictEqual(one.monthlyAvailableShifts[1], ['T4_S']);
  assert.deepStrictEqual(one.monthlyAvailableShifts[2], ['T3_S']);
  assert.deepStrictEqual(one.monthlyAvailableShifts[3], ['T3_S']);
  assert.deepStrictEqual(one.monthlyAvailableShifts[4], ['T3_S']);
  assert.deepStrictEqual(one.availableShifts.sort(), ['T3_S', 'T4_S']);

  const two = report.candidates.find(c => c.studentId === '99000022');
  assert.deepStrictEqual(two.monthlyAvailableShifts[1], ['T5_C']);
  assert.strictEqual(two.role, 'new', 'Phải giữ vai trò hiện có của CTV');
});

runTest('Google Form: bỏ qua người đã có ca rảnh cập nhật SAU thời điểm form', () => {
  seedFormStudents();
  const students = JSON.parse(mockLocalStorage.getItem('ts_scheduler_students'));
  students[0].monthlyAvailableShifts = { 1: ['T2_S'], 2: [], 3: [], 4: [] };
  students[0].availableShifts = ['T2_S'];
  students[0].updatedAt = Date.parse('2030-01-01T00:00:00Z');
  mockLocalStorage.setItem('ts_scheduler_students', JSON.stringify(students));
  global.window.adminTestHelper.loadData();

  const report = analyzeGoogleFormCsv(FORM_HEADER + '\n' + FORM_ROWS.join('\n'), { month: 11, year: 2026 });
  assert.strictEqual(report.stats.skippedNewerRows, 1, 'Phải bỏ qua phản hồi cũ hơn dữ liệu đang có');
  assert.ok(!report.candidates.some(c => c.studentId === '99000021'));
  assert.strictEqual(report.candidates.length, 1);
});

runTest('Google Form: chọn tháng không có ngày nào => báo lỗi rõ, không nhập rỗng', () => {
  seedFormStudents();
  const report = analyzeGoogleFormCsv(FORM_HEADER + '\n' + FORM_ROWS.join('\n'), { month: 12, year: 2026 });
  assert.ok(report.errors.length > 0, 'Phải báo không có ca trong tháng 12');
  assert.strictEqual(report.candidates.length, 0);
});

runTest('Giao diện: có nút Nhập Google Form và gợi ý đúng chế độ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(html.includes('id="btn-open-form-import"'), 'Phải có nút Nhập Google Form');
  assert.ok(html.includes('id="import-mode-hint"'), 'Modal nhập phải có gợi ý chế độ');
  assert.ok(typeof isGoogleFormResponseCsv === 'function'
    && typeof analyzeGoogleFormCsv === 'function',
  'admin.js phải xuất bộ phân tích Google Form cho kiểm thử');
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN (${Math.round((passed / total) * 100)}%)`);
console.log('================================================================\n');

if (passed !== total) {
  process.exit(1);
} else {
  process.exit(0);
}
