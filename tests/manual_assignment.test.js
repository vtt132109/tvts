/**
 * ============================================================================
 * AUTOMATED TEST SUITE: GÁN CA THỦ CÔNG & XẾP TỰ ĐỘNG PHẢI "NÉ" CA GÁN TAY
 * ============================================================================
 * Bối cảnh: Ban Điều Hành báo "không gán được thủ công" và "xếp tự động xoá
 * mất ca đã gán tay". Bộ test này khoá lại 6 hành vi:
 *
 * 1. Bấm vào ô ca trống -> chọn CTV -> lưu: ô ca có người, lịch được ghi.
 * 2. Sổ tay gán ca lưu THEO THÁNG ('YYYY-MM'), không còn khoá phẳng theo tuần.
 * 3. Chạy xếp lịch tự động -> ca gán tay KHÔNG bị ghi đè (kể cả trái vai trò,
 *    chưa đăng ký rảnh).
 * 4. Ca gán tay của tháng khác KHÔNG bị áp sang tháng đang xem.
 * 5. Chọn "-- Để trống --" thì xoá người ở ô đó, và vẫn trống sau khi auto.
 * 6. Tháng chưa có lịch vẫn vẽ đủ 40 ô bấm được (không cần nút "xếp thủ công"
 *    riêng) và nút đó đã bị gỡ khỏi giao diện.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 1. Môi trường giả lập ------------------------------------------------------
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
      toggle(c, f) { if (f === undefined) f = !this._c.has(c); if (f) this._c.add(c); else this._c.delete(c); return f; }
    },
    value: '', textContent: '', innerHTML: '', checked: false, disabled: false, listeners: {},
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (this.listeners[ev.type || ev] || []).forEach(fn => fn(ev)); },
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    focus() {}, scrollIntoView() {},
    click() { (this.listeners.click || []).forEach(fn => fn({ type: 'click', target: this })); }
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
  location: { href: '' }
};

global.document = {
  readyState: 'complete',
  documentElement: mockEl('html', 'html'),
  body: mockEl('body', 'body'),
  getElementById: (id) => els[id] || mockEl(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => mockEl('', t),
  addEventListener: () => {}
};

// 2. Dữ liệu mẫu + phiên đăng nhập ------------------------------------------
const STUDENTS = [
  {
    id: 's_1', studentId: '2102001', fullName: 'Nguyen Van A', role: 'old',
    availableShifts: ['T2_S'],
    monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T2_S'], 3: [], 4: [] }
  },
  {
    id: 's_2', studentId: '2211005', fullName: 'Tran Thi B', role: 'new',
    availableShifts: ['T2_S'],
    monthlyAvailableShifts: { 1: ['T2_S'], 2: [], 3: [], 4: [] }
  }
];

function seed() {
  LS.clear();
  SS.clear();
  LS.setItem('ts_scheduler_students', JSON.stringify(STUDENTS));
  LS.setItem('ts_scheduler_active_month_v1', JSON.stringify({ month: 10, year: 2026 }));
  LS.setItem('ts_scheduler_admin_users', JSON.stringify([
    { id: 'u1', username: 'admin', fullName: 'TB', role: 'admin', password: 'x', pin: '1234' }
  ]));
  SS.setItem('ts_admin_authenticated', 'true');
  SS.setItem('ts_admin_user_data', JSON.stringify({ id: 'u1', username: 'admin', fullName: 'TB', role: 'admin' }));
}

// 3. Nạp mã nguồn thật ------------------------------------------------------
// Phải seed TRƯỚC khi nạp admin.js: lúc nạp, admin.js kiểm tra phiên đăng nhập
// và chỉ khi đã đăng nhập mới bind sự kiện cho nút "Xác Nhận Thay Đổi".
seed();

require(path.join(ROOT, 'js', 'month_calendar.js'));
require(path.join(ROOT, 'js', 'scheduler.js'));
require(path.join(ROOT, 'js', 'common.js'));
require(path.join(ROOT, 'js', 'audit.js'));
require(path.join(ROOT, 'js', 'store.js'));
eval(fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8'));

const H = global.window.adminTestHelper;
assert.ok(H, 'admin.js phải export window.adminTestHelper');

// 4. Test runner ------------------------------------------------------------
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

/** Đọc ô ca trong lịch tháng đã lưu. */
function savedSlot(weekNum, shiftId) {
  const sched = JSON.parse(LS.getItem('ts_scheduler_month_result') || 'null');
  if (!sched) return null;
  return sched.weeks[weekNum - 1].scheduleTable[shiftId] || null;
}

function manualMap() {
  return JSON.parse(LS.getItem('ts_scheduler_manual_slots') || '{}');
}

/** Gán tay qua đúng luồng giao diện: mở modal -> chọn người -> bấm lưu.
 * studentRef: id HOẶC mã sinh viên (tự quy ra chỉ số option hiện hành). */
function assignViaUi(shiftId, role, weekNum, studentRef) {
  global.window.adminOpenReassignModal(shiftId, role, weekNum);
  const sel = els['modal-candidate-select'];
  const modalData = H.getState().reassignModalData || {};
  const candidates = modalData.candidates || [];

  let value = '';
  if (studentRef !== undefined && studentRef !== null && studentRef !== '') {
    const idx = candidates.findIndex(s => s && (s.id === studentRef || s.studentId === studentRef));
    value = idx >= 0 ? String(idx) : String(studentRef);
  }
  sel.value = value;
  els['btn-save-modal'].click();
}

console.log('================================================================');
console.log('✍️  BẮT ĐẦU KIỂM THỬ - GÁN CA THỦ CÔNG & XẾP TỰ ĐỘNG PHẢI NÉ');
console.log('================================================================\n');

// ============================================================================
// GROUP 1: GÁN TAY QUA GIAO DIỆN
// ============================================================================
runTest('Gán tay: mở modal từ ô ca trống, chọn CTV, lưu -> ô ca có người', () => {
  seed();
  H.loadData();
  assert.strictEqual(H.getState().monthSchedule, null, 'Ban đầu chưa có lịch tháng');

  assignViaUi('T2_S', 'old', 1, 's_1');

  const slot = savedSlot(1, 'T2_S');
  assert.ok(slot, 'Phải tạo được ô ca T2_S tuần 1');
  assert.strictEqual(slot.oldMember && slot.oldMember.fullName, 'Nguyen Van A');
  assert.strictEqual(slot.status, 'partial', 'Chỉ có 1 người -> Thiếu 1 bạn');
  assert.strictEqual(slot.manuallyEdited, true, 'Ô ca phải được đánh dấu là gán tay');
});

runTest('Gán tay: chọn "-- Để trống --" thì xoá người khỏi ô ca', () => {
  seed();
  H.loadData();
  assignViaUi('T2_S', 'old', 1, 's_1');
  assert.ok(savedSlot(1, 'T2_S').oldMember, 'Bước 1: phải gán được');

  assignViaUi('T2_S', 'old', 1, '');
  assert.strictEqual(savedSlot(1, 'T2_S').oldMember, null, 'Chọn để trống phải xoá người');
});

runTest('Gán tay: sổ tay lưu theo THÁNG, không phải khoá phẳng theo tuần', () => {
  seed();
  H.loadData();
  assignViaUi('T2_S', 'old', 1, 's_1');

  const map = manualMap();
  assert.ok(map['2026-10'], 'Phải có nhánh tháng 2026-10, thực tế: ' + JSON.stringify(map));
  assert.ok(map['2026-10']['1']['T2_S'], 'Phải có bản ghi tuần 1 / ca T2_S');
  assert.strictEqual(map['2026-10']['1']['T2_S'].oldId, 's_1');
});

// ============================================================================
// GROUP 2: XẾP TỰ ĐỘNG PHẢI "NÉ" CA GÁN TAY
// ============================================================================
runTest('Xếp tự động: KHÔNG ghi đè ca đã gán tay (đúng vai trò, có đăng ký rảnh)', () => {
  seed();
  H.loadData();
  assignViaUi('T2_S', 'old', 1, 's_1');
  assignViaUi('T2_S', 'new', 1, 's_2');

  H.runFullSchedule();

  const slot = savedSlot(1, 'T2_S');
  assert.strictEqual(slot.oldMember.fullName, 'Nguyen Van A', 'Vị trí Chính Thức phải giữ nguyên');
  assert.strictEqual(slot.newMember.fullName, 'Tran Thi B', 'Vị trí Tập Sự phải giữ nguyên');
  assert.strictEqual(slot.status, 'full');
});

runTest('Xếp tự động: giữ cả ca gán TRÁI vai trò / người chưa đăng ký rảnh', () => {
  seed();
  H.loadData();
  // s_2 là Tập Sự nhưng gán vào vị trí Chính Thức ở tuần 2 (tuần này s_2 không đăng ký rảnh)
  assignViaUi('T3_C', 'old', 2, 's_2');
  assert.strictEqual(savedSlot(2, 'T3_C').oldMember.fullName, 'Tran Thi B', 'Bước 1: phải gán được');

  H.runFullSchedule();

  const slot = savedSlot(2, 'T3_C');
  assert.strictEqual(slot.oldMember && slot.oldMember.fullName, 'Tran Thi B',
    'Quyết định gán tay không được bị xếp tự động xoá');
});

runTest('Xếp tự động: ca gán tay đã chọn "Để trống" vẫn trống sau khi auto', () => {
  seed();
  H.loadData();
  assignViaUi('T2_S', 'old', 1, 's_1');
  assignViaUi('T2_S', 'old', 1, '');

  H.runFullSchedule();

  const slot = savedSlot(1, 'T2_S');
  assert.strictEqual(slot.oldMember, null, 'Auto không được tự điền lại người vào ô đã xoá tay');
});

runTest('Xếp tự động: ca gán tay của THÁNG KHÁC không bị áp sang tháng này', () => {
  seed();
  H.loadData();

  // Ghi tay cho tháng 10
  H.recordManualSlot(1, 'T2_S', {
    oldMember: { id: 's_1', fullName: 'Nguyen Van A' },
    newMember: null
  }, 10, 2026);

  // Lịch tháng 11 (rỗng) — không được dính người của tháng 10
  const novSchedule = {
    month: 11, year: 2026,
    weeks: [{
      weekNumber: 1,
      scheduleTable: {
        T2_S: { shiftId: 'T2_S', shiftInfo: { dayName: 'Thứ Hai' }, oldMember: null, newMember: null, status: 'empty' }
      }
    }]
  };
  const resNov = H.reapplyManualSlots(novSchedule);
  assert.strictEqual(resNov.applied, 0, 'Không được áp ca gán tay của tháng 10 sang tháng 11');
  assert.strictEqual(novSchedule.weeks[0].scheduleTable.T2_S.oldMember, null);

  // Cùng lịch nhưng là tháng 10 -> phải áp
  const octSchedule = JSON.parse(JSON.stringify(novSchedule));
  octSchedule.month = 10;
  const resOct = H.reapplyManualSlots(octSchedule);
  assert.strictEqual(resOct.applied, 1, 'Đúng tháng thì phải áp lại');
  assert.strictEqual(octSchedule.weeks[0].scheduleTable.T2_S.oldMember.fullName, 'Nguyen Van A');
});

runTest('Xếp tự động: ca manuallyEdited kéo từ Cloud vẫn giữ dù sổ tay máy này trống', () => {
  seed();
  H.loadData();
  H.runFullSchedule();

  const students = H.getState().students;
  const s1 = students.find(s => s.id === 's_1');
  const sched = H.getState().monthSchedule;
  assert.ok(sched && sched.weeks && sched.weeks[0], 'Phải có lịch tháng để mô phỏng');

  const slot = sched.weeks[0].scheduleTable['T2_S'];
  slot.oldMember = s1;
  slot.newMember = null;
  slot.status = 'partial';
  slot.manuallyEdited = true;

  // Mô phỏng lịch vừa kéo từ Cloud: có cờ manuallyEdited nhưng máy này chưa
  // có sổ tay gán ca (localStorage trống).
  LS.setItem('ts_scheduler_month_result', JSON.stringify(sched));
  LS.setItem('ts_scheduler_manual_slots', JSON.stringify({}));
  H.loadData();
  H.runFullSchedule();

  const after = H.getState().monthSchedule.weeks[0].scheduleTable['T2_S'];
  assert.strictEqual(after.oldMember && after.oldMember.id, 's_1',
    'Ca gán tay trong lịch Cloud phải được giữ khi xếp tự động');
  const map = manualMap();
  assert.ok(map['2026-10'] && map['2026-10']['1'] && map['2026-10']['1']['T2_S'],
    'Sổ tay phải được dựng lại từ cờ manuallyEdited của lịch Cloud');
});

runTest('Sổ tay: dữ liệu cũ (khoá phẳng theo tuần) vẫn được áp dụng', () => {
  seed();
  H.loadData();
  // Định dạng cũ: { "1": { "T2_S": {...} } }
  LS.setItem('ts_scheduler_manual_slots', JSON.stringify({
    1: { T2_S: { oldId: 's_1', newId: null, at: Date.now() } }
  }));

  const sched = {
    month: 10, year: 2026,
    weeks: [{
      weekNumber: 1,
      scheduleTable: {
        T2_S: { shiftId: 'T2_S', shiftInfo: {}, oldMember: null, newMember: null, status: 'empty' }
      }
    }]
  };
  const res = H.reapplyManualSlots(sched);
  assert.strictEqual(res.applied, 1, 'Phải đọc được định dạng cũ để không mất ca đã gán');
  assert.strictEqual(sched.weeks[0].scheduleTable.T2_S.oldMember.id, 's_1');
});

runTest('Sổ tay: CTV đã bị xoá khỏi danh sách thì bỏ qua và báo cảnh báo', () => {
  seed();
  H.loadData();
  LS.setItem('ts_scheduler_manual_slots', JSON.stringify({
    '2026-10': { 1: { T2_S: { oldId: 's_khong_ton_tai', newId: null, at: Date.now() } } }
  }));

  const sched = {
    month: 10, year: 2026,
    weeks: [{
      weekNumber: 1,
      scheduleTable: {
        T2_S: { shiftId: 'T2_S', shiftInfo: {}, oldMember: null, newMember: null, status: 'empty' }
      }
    }]
  };
  const res = H.reapplyManualSlots(sched);
  assert.strictEqual(res.applied, 0, 'Không được gán người không còn tồn tại');
  assert.ok(res.skipped.length > 0, 'Phải ghi nhận lý do bỏ qua');
  assert.strictEqual(sched.weeks[0].scheduleTable.T2_S.oldMember, null);
});

runTest('Gán tay: KHÔNG mở hộp thoại confirm, không thể bị "chặn hộp thoại" làm mất thao tác', () => {
  seed();
  H.loadData();

  // Giả lập trình duyệt đã chặn hộp thoại: confirm() luôn trả về false.
  // Nếu code còn dùng confirm, thao tác gán sẽ bị huỷ âm thầm -> test fail.
  let confirmCalls = 0;
  const originalConfirm = global.window.confirm;
  global.window.confirm = () => { confirmCalls++; return false; };
  global.confirm = global.window.confirm;

  try {
    // s_2 chưa đăng ký rảnh tuần 2 và trái vai trò => trước đây sẽ bật confirm
    assignViaUi('T3_C', 'old', 2, 's_2');
  } finally {
    global.window.confirm = originalConfirm;
    global.confirm = originalConfirm;
  }

  assert.strictEqual(confirmCalls, 0, 'Không được gọi confirm() khi gán ca');
  const slot = savedSlot(2, 'T3_C');
  assert.ok(slot && slot.oldMember, 'Dù có cảnh báo, ca vẫn phải được gán');
  assert.strictEqual(slot.oldMember.fullName, 'Tran Thi B');
});

/**
 * Dựng tình huống máy CHỈ có "lịch 1 tuần" kiểu cũ (ts_scheduler_schedule_result)
 * và CHƯA có lịch tháng — đúng trạng thái của máy đã dùng bản cũ trước đây.
 * Trong đó ca T3_C đã có người xếp từ trước.
 */
function seedLegacyWeekSchedule() {
  seed();
  const table = {};
  ['T2', 'T3', 'T4', 'T5', 'T6'].forEach(d => {
    ['S', 'C'].forEach(p => {
      const id = `${d}_${p}`;
      table[id] = {
        shiftId: id,
        shiftInfo: { id, dayKey: d, dayName: `Thứ ${d.slice(1)}`, period: p === 'S' ? 'Sáng' : 'Chiều', time: '' },
        oldMember: null,
        newMember: null,
        status: 'empty'
      };
    });
  });
  table['T3_C'].oldMember = { id: 's_1', studentId: '2102001', fullName: 'Nguyen Van A', role: 'old' };
  table['T3_C'].status = 'partial';
  LS.setItem('ts_scheduler_schedule_result', JSON.stringify({ scheduleTable: table, stats: {} }));
  LS.removeItem('ts_scheduler_month_result');
  LS.removeItem('ts_scheduler_manual_slots');
}

runTest('Máy chỉ có lịch 1 TUẦN cũ: gán tay phải tạo lịch THÁNG, lưu được và lưới tháng hiện tên', () => {
  seedLegacyWeekSchedule();
  H.loadData();
  assert.strictEqual(H.getState().monthSchedule, null, 'Ban đầu chưa có lịch tháng');

  assignViaUi('T2_S', 'old', 1, 's_1');

  const after = H.getState();
  assert.ok(after.monthSchedule && after.monthSchedule.weeks.length === 4,
    'Phải tạo lịch THÁNG 4 tuần khi gán tay (không ghi vào object tuần rời)');

  const raw = LS.getItem('ts_scheduler_month_result');
  assert.notStrictEqual(raw, 'null', 'Không được ghi chuỗi "null" vào lịch tháng');
  assert.ok(raw && raw !== '', 'Phải có lịch tháng trong storage');

  const saved = JSON.parse(raw);
  assert.strictEqual(saved.weeks[0].scheduleTable['T2_S'].oldMember.fullName, 'Nguyen Van A',
    'Ca vừa gán phải nằm trong lịch THÁNG đã lưu');

  // Đây là triệu chứng người dùng thấy: lưới tháng (chế độ Toàn cảnh) vẫn trống
  H.renderMasterMonthGrid();
  const master = Object.values(els).find(e =>
    typeof e.innerHTML === 'string' && e.innerHTML.includes('master-week-section-4'));
  assert.ok(master, 'Phải render được lưới tháng');
  assert.ok(master.innerHTML.includes('Nguyen Van A'),
    'Lưới tháng phải hiển thị người vừa gán — nếu không thì "báo đã lưu mà không thấy gì"');
});

runTest('Tạo lịch tháng từ lịch tuần cũ: giữ nguyên ca đã xếp trước đó', () => {
  seedLegacyWeekSchedule();
  H.loadData();
  assignViaUi('T2_S', 'old', 1, 's_2');

  const saved = JSON.parse(LS.getItem('ts_scheduler_month_result'));
  assert.strictEqual(saved.weeks[0].scheduleTable['T3_C'].oldMember.fullName, 'Nguyen Van A',
    'Ca T3_C của lịch cũ phải được chuyển sang lịch tháng, không được mất');
});

// ============================================================================
// GROUP 2b: DỮ LIỆU CTV THIẾU `id` (nguồn Cloud cũ)
// ============================================================================
runTest('CTV thiếu id: loadData tự bổ sung id duy nhất', () => {
  seed();
  LS.setItem('ts_scheduler_students', JSON.stringify([
    { studentId: '22133001', fullName: 'Khong Co Id 1', role: 'old' },
    { studentId: '22133002', fullName: 'Khong Co Id 2', role: 'new' },
    { studentId: '22133001', fullName: 'Trung MSSV', role: 'new' }
  ]));
  H.loadData();

  const ids = H.getState().students.map(s => s.id);
  assert.strictEqual(ids.filter(Boolean).length, 3, 'Mọi CTV phải có id');
  assert.strictEqual(new Set(ids).size, 3, 'Id phải duy nhất');
});

runTest('CTV thiếu id: chọn người rồi lưu vẫn gán đúng, không bị hiểu là "để trống"', () => {
  seed();
  LS.setItem('ts_scheduler_students', JSON.stringify([
    { studentId: '22133001', fullName: 'Khong Co Id 1', role: 'old', availableShifts: ['T2_S'], monthlyAvailableShifts: { 1: ['T2_S'], 2: [], 3: [], 4: [] } },
    { studentId: '22133002', fullName: 'Khong Co Id 2', role: 'new', availableShifts: ['T2_S'], monthlyAvailableShifts: { 1: ['T2_S'], 2: [], 3: [], 4: [] } }
  ]));
  H.loadData();

  assignViaUi('T2_S', 'old', 1, '22133001');

  assert.strictEqual(savedSlot(1, 'T2_S').oldMember.fullName, 'Khong Co Id 1',
    'Phải gán được CTV thiếu id (trước đây value option là "undefined" nên thành để trống)');
});

runTest('CTV thiếu id: checkbox data-id trong bảng CTV hợp lệ (không rỗng, không trùng)', () => {
  seed();
  LS.setItem('ts_scheduler_students', JSON.stringify([
    { studentId: '22133001', fullName: 'Khong Co Id 1', role: 'old' },
    { studentId: '22133002', fullName: 'Khong Co Id 2', role: 'new' }
  ]));
  H.loadData();
  H.renderStudentTable();

  const table = Object.values(els).find(e =>
    typeof e.innerHTML === 'string' && e.innerHTML.includes('cb-student-row'));
  assert.ok(table, 'Phải render được bảng CTV');

  const ids = [...table.innerHTML.matchAll(/data-id="([^"]*)"/g)].map(m => m[1]);
  assert.strictEqual(ids.length, 2, 'Phải có 2 checkbox');
  assert.ok(ids.every(id => id && id !== 'undefined'),
    'data-id không được rỗng/undefined: ' + JSON.stringify(ids));
  assert.strictEqual(new Set(ids).size, 2, 'data-id phải duy nhất');

  // id đã chuẩn hoá phải được ghi lại xuống storage (Cloud/cổng SV cùng thấy)
  const stored = JSON.parse(LS.getItem('ts_scheduler_students'));
  assert.ok(stored.every(s => s.id), 'loadData phải lưu lại id đã chuẩn hoá vào localStorage');
});

runTest('Chọn option không hợp lệ KHÔNG được xoá ca đang có người', () => {
  seed();
  H.loadData();
  assignViaUi('T2_S', 'old', 1, 's_1');
  assert.ok(savedSlot(1, 'T2_S').oldMember, 'Bước 1: phải gán được');

  // Mô phỏng value rác (dữ liệu cũ / trình duyệt lạ)
  global.window.adminOpenReassignModal('T2_S', 'old', 1);
  els['modal-candidate-select'].value = '9999';
  els['btn-save-modal'].click();

  assert.strictEqual(savedSlot(1, 'T2_S').oldMember.fullName, 'Nguyen Van A',
    'Lựa chọn không xác định được thì phải bỏ qua, không được coi là "để trống"');
});

// ============================================================================
// GROUP 3: GIAO DIỆN — KHÔNG CÒN NÚT "XẾP THỦ CÔNG", LƯỚI LUÔN BẤM ĐƯỢC
// ============================================================================
runTest('Giao diện: tháng chưa có lịch vẫn vẽ đủ 40 ô bấm được để gán tay', () => {
  seed();
  H.loadData();
  assert.strictEqual(H.getState().monthSchedule, null, 'Chưa có lịch tháng');

  H.renderMasterMonthGrid();

  // Lưới tháng = container chứa đủ 4 khối tuần.
  const container = Object.values(els).find(e =>
    typeof e.innerHTML === 'string'
    && e.innerHTML.includes('master-week-section-4')
    && e.innerHTML.includes('adminOpenReassignModal'));
  assert.ok(container, 'Lưới tháng phải render các ô ca bấm được');

  // Mỗi ca có 2 ô nền + 1 ô thêm người thứ 3 + nút "➕ Thêm người":
  // 4 tuần × 10 ca × 4 = 160 điểm bấm.
  const calls = container.innerHTML.match(/adminOpenReassignModal\(/g) || [];
  assert.strictEqual(calls.length, 160, '4 tuần × 10 ca × 4 = 160 ô bấm được, thực tế: ' + calls.length);
  assert.ok((container.innerHTML.match(/➕ Thêm người/g) || []).length >= 40,
    'Mỗi ca phải có nút thêm người');
  assert.ok(container.innerHTML.includes('admin-blank-month-notice'),
    'Phải có dải nhắc "bấm vào ô ca để gán tay"');
  assert.ok(!container.innerHTML.includes('adminCreateBlankMonth'),
    'Không được còn nút tạo khung trống');
});

runTest('Giao diện: danh sách CTV rỗng thì hướng dẫn nhập CSV thay vì vẽ ô', () => {
  LS.clear();
  SS.clear();
  LS.setItem('ts_scheduler_active_month_v1', JSON.stringify({ month: 10, year: 2026 }));
  H.loadData();
  assert.strictEqual(H.getState().students.length, 0, 'Đã xoá hết CTV');

  H.renderMasterMonthGrid();

  const container = Object.values(els).find(e => typeof e.innerHTML === 'string' && e.innerHTML.includes('Nhập Danh Sách CTV'));
  assert.ok(container, 'Phải hướng dẫn nhập danh sách CTV');
  assert.ok(!container.innerHTML.includes('adminOpenReassignModal'),
    'Không vẽ ô gán ca khi chưa có CTV nào');
});

runTest('Giao diện: nút "Xếp thủ công" đã bị gỡ khỏi admin.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(!/id="btn-admin-manual-schedule"/.test(html), 'Không được còn nút Xếp thủ công');
  assert.ok(!/adminCreateBlankMonth/.test(html), 'Không được còn tham chiếu hàm đã gỡ');
  assert.ok(!/XẾP THỦ CÔNG/i.test(html), 'Không được còn nhãn XẾP THỦ CÔNG');
});

runTest('Khởi tạo kỳ mới: sổ tay gán ca của tháng đó cũng bị xoá', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
  const block = src.match(/async function handleStartNewMonth\(\)[\s\S]*?\n  \}/);
  assert.ok(block, 'Thiếu handleStartNewMonth');
  assert.ok(/delete manualMap\[resetKey\]/.test(block[0]),
    'Sau khi xoá bảng phân công phải xoá sổ tay gán ca của tháng để auto không áp lại người cũ');
});

runTest('Cấu hình tháng 1 người/ca: mỗi ca 1 người, gán tay 1 người được giữ sau auto', () => {
  seed();
  const students = JSON.parse(LS.getItem('ts_scheduler_students'));
  students.forEach(s => {
    s.availableShifts = ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'];
    s.monthlyAvailableShifts = { 1: [...s.availableShifts], 2: [...s.availableShifts], 3: [...s.availableShifts], 4: [...s.availableShifts] };
  });
  LS.setItem('ts_scheduler_students', JSON.stringify(students));
  LS.setItem('ts_scheduler_active_month_v1', JSON.stringify({ month: 11, year: 2026 }));
  LS.setItem('ts_scheduler_availability_month_v1', '2026-11');
  LS.setItem('ts_scheduler_shift_capacity_v1', JSON.stringify({
    '2026-11': { peoplePerShift: 1 }
  }));
  H.loadData();
  H.runFullSchedule();

  const sched = H.getState().monthSchedule;
  Object.values(sched.weeks[0].scheduleTable).forEach(slot => {
    assert.strictEqual(slot.capacity, 1, 'Mọi ca phải là capacity 1');
    assert.strictEqual(slot.newMember, null, 'Ca 1 người không có vị trí thứ 2');
  });

  assignViaUi('T2_S', 'single', 1, 's_2');
  const slot = savedSlot(1, 'T2_S');
  assert.strictEqual(slot.oldMember && slot.oldMember.id, 's_2', 'Phải gán được người trực duy nhất');
  assert.strictEqual(slot.newMember, null);
  assert.strictEqual(slot.thirdMember, null);
  assert.strictEqual(slot.capacity, 1);
  assert.strictEqual(slot.status, 'full');

  H.runFullSchedule();
  const after = savedSlot(1, 'T2_S');
  assert.strictEqual(after.oldMember && after.oldMember.id, 's_2', 'Auto phải giữ ca 1 người đã gán tay');
});

runTest('Tháng 1 người/ca: vẫn gán tay thêm được người thứ 2 và thứ 3 cho đúng ca đó', () => {
  seed();
  const students = JSON.parse(LS.getItem('ts_scheduler_students'));
  students.forEach(s => {
    s.availableShifts = ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'];
    s.monthlyAvailableShifts = { 1: [...s.availableShifts], 2: [...s.availableShifts], 3: [...s.availableShifts], 4: [...s.availableShifts] };
  });
  students.push({
    id: 's_3', studentId: '2311007', fullName: 'Le Van C', role: 'new',
    availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'],
    monthlyAvailableShifts: { 1: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], 2: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], 3: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], 4: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'] }
  });
  LS.setItem('ts_scheduler_students', JSON.stringify(students));
  LS.setItem('ts_scheduler_active_month_v1', JSON.stringify({ month: 11, year: 2026 }));
  LS.setItem('ts_scheduler_availability_month_v1', '2026-11');
  LS.setItem('ts_scheduler_shift_capacity_v1', JSON.stringify({
    '2026-11': { peoplePerShift: 1 }
  }));
  H.loadData();
  H.runFullSchedule();

  const sched = H.getState().monthSchedule;
  Object.values(sched.weeks[0].scheduleTable).forEach(slot => {
    assert.strictEqual(slot.capacity, 1, 'Mọi ca phải là nền 1 người');
    assert.strictEqual(slot.newMember, null, 'Auto không được thêm người thứ 2');
    assert.strictEqual(slot.thirdMember, null, 'Auto không được thêm người thứ 3');
  });
  assert.ok(savedSlot(1, 'T2_S').oldMember, 'Auto phải xếp người trực chính cho T2_S');
  const mainId = savedSlot(1, 'T2_S').oldMember.id;
  const otherIds = ['s_1', 's_2', 's_3'].filter(id => id !== mainId);
  const extra2 = otherIds[0];
  const extra3 = otherIds[1];

  // Gán tay người thêm thứ 2 dù tháng cấu hình 1 người/ca.
  assignViaUi('T2_S', 'new', 1, extra2);
  let slot = savedSlot(1, 'T2_S');
  assert.strictEqual(slot.oldMember && slot.oldMember.id, mainId,
    'Thêm người thứ 2 không được thay người trực chính');
  assert.strictEqual(slot.newMember && slot.newMember.id, extra2, 'Phải gán được người thêm thứ 2');
  assert.strictEqual(slot.thirdMember, null);
  assert.strictEqual(slot.status, 'full', 'Có người chính là đủ, người thêm không đổi trạng thái');
  assert.strictEqual(slot.capacity, 1, 'Mức nền tháng vẫn là 1');

  // Gán tay người thêm thứ 3.
  assignViaUi('T2_S', 'third', 1, extra3);
  slot = savedSlot(1, 'T2_S');
  assert.strictEqual(slot.thirdMember && slot.thirdMember.id, extra3,
    'Phải gán được người thêm thứ 3');
  assert.strictEqual(slot.status, 'full');
  assert.strictEqual(slot.capacity, 1);

  const stats = H.getState().monthSchedule.weeks[0].studentStats;
  [mainId, extra2, extra3].forEach(id => {
    assert.ok(stats[id] && stats[id].assignedCount >= 1,
      `Người ${id} phải được tính vào thống kê/công bằng`);
  });

  const rec = manualMap()['2026-11']?.['1']?.['T2_S'];
  assert.ok(rec, 'Phải ghi sổ tay gán ca của tháng 11');
  assert.strictEqual(rec.oldId, mainId);
  assert.strictEqual(rec.newId, extra2);
  assert.strictEqual(rec.thirdId, extra3);

  H.runFullSchedule();
  const after = savedSlot(1, 'T2_S');
  assert.strictEqual(after.oldMember && after.oldMember.id, mainId, 'Auto phải giữ người chính');
  assert.strictEqual(after.newMember && after.newMember.id, extra2, 'Auto phải giữ người thêm thứ 2');
  assert.strictEqual(after.thirdMember && after.thirdMember.id, extra3, 'Auto phải giữ người thêm thứ 3');
});

runTest('Tháng 2 người/ca: vẫn gán tay thêm được người thứ 3, auto giữ nguyên', () => {
  seed();
  const students = JSON.parse(LS.getItem('ts_scheduler_students'));
  students.forEach(s => {
    s.availableShifts = ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'];
    s.monthlyAvailableShifts = { 1: [...s.availableShifts], 2: [...s.availableShifts], 3: [...s.availableShifts], 4: [...s.availableShifts] };
  });
  students.push({
    id: 's_3', studentId: '2311007', fullName: 'Le Van C', role: 'new',
    availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'],
    monthlyAvailableShifts: { 1: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], 2: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], 3: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], 4: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'] }
  });
  LS.setItem('ts_scheduler_students', JSON.stringify(students));
  LS.setItem('ts_scheduler_shift_capacity_v1', JSON.stringify({
    '2026-10': { peoplePerShift: 2 }
  }));
  H.loadData();
  H.runFullSchedule();

  const before = savedSlot(1, 'T2_S');
  assert.strictEqual(before.capacity, 2, 'Mức nền tháng 10 là 2 người');
  assert.ok(before.oldMember && before.newMember, 'Auto phải xếp đủ 2 người nền');
  assert.strictEqual(before.thirdMember, null, 'Auto không được điền người thứ 3');

  const used = [before.oldMember.id, before.newMember.id];
  const thirdId = ['s_1', 's_2', 's_3'].find(id => !used.includes(id));
  assignViaUi('T2_S', 'third', 1, thirdId);
  const afterAssign = savedSlot(1, 'T2_S');
  assert.strictEqual(afterAssign.thirdMember && afterAssign.thirdMember.id, thirdId,
    'Phải gán được người thứ 3');
  assert.strictEqual(afterAssign.status, 'full');
  assert.strictEqual(afterAssign.capacity, 2, 'Người thứ 3 là người thêm, không đổi mức nền');

  H.runFullSchedule();
  const afterAuto = savedSlot(1, 'T2_S');
  assert.strictEqual(afterAuto.thirdMember && afterAuto.thirdMember.id, thirdId,
    'Auto phải giữ người thứ 3 đã gán tay');
});

runTest('Giao diện: có nút Số người/ca, modal chỉ chọn mức nền, thêm người theo từng ca', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
  assert.ok(html.includes('id="btn-shift-capacity"'), 'Phải có nút Số người/ca');
  assert.ok(html.includes('id="modal-shift-capacity"'), 'Phải có modal cấu hình');
  assert.ok(html.includes('➕ Thêm người'), 'Modal phải hướng dẫn thêm người theo từng ca');
  assert.ok(!html.includes('shift-capacity-third-list'), 'Không còn danh sách ca 3 người cố định');
  assert.ok(js.includes('saveMonthCapacity'), 'Phải có hàm lưu cấu hình tháng');
  assert.ok(js.includes('slot.thirdMember'), 'Phải hỗ trợ người thêm thứ 3');
  assert.ok(!/shiftCapacityThird/.test(js), 'Không còn đọc checkbox ca 3 người đã bị gỡ');
});

runTest('Xóa tuần: chỉ xóa người trong tuần đang xem, giữ tuần khác và sổ tay tuần khác', () => {
  seed();
  H.loadData();
  H.runFullSchedule();

  assignViaUi('T2_S', 'old', 1, 's_1');
  assignViaUi('T2_S', 'old', 2, 's_1');
  const beforeWeek2 = savedSlot(2, 'T2_S').oldMember?.id;
  assert.strictEqual(beforeWeek2, 's_1');

  const res = H.clearWeekAssignments(1, 10, 2026);
  assert.ok(res.success, 'Phải xóa được tuần 1');
  assert.ok(res.cleared > 0, 'Phải đếm số ca đã xóa');

  const week1 = savedSlot(1, 'T2_S');
  assert.strictEqual(week1.oldMember, null, 'Tuần 1 phải xóa người cũ');
  assert.strictEqual(week1.newMember, null, 'Tuần 1 phải xóa người mới');
  assert.strictEqual(week1.thirdMember, null, 'Tuần 1 phải xóa người thứ 3');
  assert.strictEqual(week1.status, 'empty');

  const week2 = savedSlot(2, 'T2_S');
  assert.strictEqual(week2.oldMember && week2.oldMember.id, 's_1',
    'Tuần 2 KHÔNG được xóa');

  const map = manualMap();
  assert.ok(!(map['2026-10'] && map['2026-10']['1']),
    'Sổ tay tuần 1 phải bị xóa để auto không áp lại');
  assert.ok(map['2026-10'] && map['2026-10']['2'],
    'Sổ tay tuần 2 phải còn');
});

runTest('Giao diện: có nút Xóa Tuần Này', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(html.includes('id="btn-clear-week"'), 'Phải có nút Xóa Tuần Này');
});

// ============================================================================
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN (${Math.round((passed / (total || 1)) * 100)}%)`);
console.log('================================================================\n');

if (passed !== total) process.exit(1);
