/**
 * ============================================================================
 * KIỂM THỬ XÁC THỰC MSSV NGHIÊM NGẶT & KHÔNG TỰ ĐỘNG THÊM SINH VIÊN MỚI
 * ============================================================================
 * Kiểm định các yêu cầu từ Tris:
 * 1. Nhập sai MSSV -> Báo lỗi, không được tự động thêm vào danh sách sinh viên.
 * 2. Danh sách 30 CTV HCM-UTE luôn được bảo toàn và nạp sẵn cố định.
 * 3. Khi nhập đúng MSSV -> Giữ nguyên Họ và tên, MSSV, Ca trực của tháng.
 * 4. Cho phép đăng ký 0 ca rảnh (nghỉ tháng này).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✕ [FAIL] ${name}`);
    console.error(`    Chi tiết: ${err.message}\n`);
    testsFailed++;
  }
}

console.log('--- KIỂM THỬ XÁC THỰC MSSV & BẢO TOÀN DANH SÁCH 30 CTV HCM-UTE ---');

// Đọc danh sách chuẩn default_students.json
const defaultStudentsPath = path.resolve(__dirname, '../data/default_students.json');
const defaultStudents = JSON.parse(fs.readFileSync(defaultStudentsPath, 'utf8'));

// Mock Storage
const mockStorage = {
  ts_scheduler_students: JSON.stringify(defaultStudents)
};

function getStorageStudents() {
  return JSON.parse(mockStorage.ts_scheduler_students || '[]');
}

function saveStorageStudents(list) {
  mockStorage.ts_scheduler_students = JSON.stringify(list);
}

// Giả lập hàm xác thực và đăng ký ca trực như trong js/student.js
function simulateRegisterStudent(studentId, monthlyShifts) {
  const students = getStorageStudents();
  const existingIndex = students.findIndex(s => s.studentId && s.studentId.toLowerCase() === studentId.trim().toLowerCase());

  if (existingIndex === -1) {
    return {
      success: false,
      error: 'MSSV_NOT_FOUND',
      message: 'Mã số sinh viên không tồn tại trong danh sách Ban Tư Vấn Tuyển Sinh! Không thể thêm mới sinh viên.'
    };
  }

  const existingStudent = students[existingIndex];
  const unionShifts = Array.from(new Set([
    ...(monthlyShifts[1] || []),
    ...(monthlyShifts[2] || []),
    ...(monthlyShifts[3] || []),
    ...(monthlyShifts[4] || [])
  ]));

  students[existingIndex] = {
    ...existingStudent,
    monthlyAvailableShifts: {
      1: [...(monthlyShifts[1] || [])],
      2: [...(monthlyShifts[2] || [])],
      3: [...(monthlyShifts[3] || [])],
      4: [...(monthlyShifts[4] || [])]
    },
    availableShifts: unionShifts,
    updatedAt: Date.now()
  };

  saveStorageStudents(students);
  return {
    success: true,
    student: students[existingIndex],
    totalShifts: unionShifts.length
  };
}

// TEST 1: Danh sách 30 CTV HCM-UTE chuẩn chỉnh
runTest('Danh sách nạp sẵn có đúng 30 CTV và chứa đầy đủ MSSV Vũ Tiến Tài (25161393)', () => {
  assert.strictEqual(defaultStudents.length, 30, 'Phải có đúng 30 CTV');
  const tai = defaultStudents.find(s => s.studentId === '25161393');
  assert.ok(tai, 'Phải tìm thấy sinh viên Vũ Tiến Tài với MSSV 25161393');
  assert.strictEqual(tai.fullName, 'Vũ Tiến Tài', 'Họ và tên phải chính xác là Vũ Tiến Tài');
  assert.strictEqual(tai.major, 'Điện tử viễn thông', 'Ngành phải là Điện tử viễn thông');
});

// TEST 2: Nhập sai MSSV -> Chặn, báo lỗi và KHÔNG tăng số lượng sinh viên
runTest('Nhập sai MSSV (9999999) -> Báo lỗi, không thêm vào danh sách SV, số lượng giữ nguyên 30', () => {
  const countBefore = getStorageStudents().length;
  assert.strictEqual(countBefore, 30);

  const res = simulateRegisterStudent('9999999', { 1: ['T2_S'], 2: ['T3_S'], 3: [], 4: [] });
  assert.strictEqual(res.success, false, 'Không được phép đăng ký thành công');
  assert.strictEqual(res.error, 'MSSV_NOT_FOUND', 'Phải trả về lỗi MSSV không tồn tại');

  const countAfter = getStorageStudents().length;
  assert.strictEqual(countAfter, 30, 'Số lượng sinh viên phải giữ nguyên là 30, tuyệt đối không được tăng lên');
});

// TEST 3: Nhập đúng MSSV -> Cập nhật thành công, Họ tên và MSSV được giữ nguyên
runTest('Nhập đúng MSSV (25161393) -> Cập nhật ca trực thành công, Họ tên Vũ Tiến Tài và MSSV được giữ nguyên', () => {
  const newShifts = {
    1: ['T2_S', 'T3_S'],
    2: ['T4_S'],
    3: ['T5_C'],
    4: ['T6_S']
  };

  const res = simulateRegisterStudent('25161393', newShifts);
  assert.strictEqual(res.success, true, 'Phải cập nhật thành công');
  assert.strictEqual(res.student.fullName, 'Vũ Tiến Tài', 'Họ tên phải giữ nguyên');
  assert.strictEqual(res.student.studentId, '25161393', 'MSSV phải giữ nguyên');
  assert.strictEqual(res.student.monthlyAvailableShifts[1].length, 2, 'Tuần 1 phải có 2 ca');
  assert.strictEqual(res.student.monthlyAvailableShifts[2].length, 1, 'Tuần 2 phải có 1 ca');
  assert.strictEqual(getStorageStudents().length, 30, 'Tổng số sinh viên vẫn đúng 30');
});

// TEST 4: Cho phép đăng ký 0 ca rảnh (nghỉ cả tháng)
runTest('Cho phép CTV đăng ký 0 ca rảnh (nghỉ tháng) mà không bị từ chối', () => {
  const emptyShifts = { 1: [], 2: [], 3: [], 4: [] };
  const res = simulateRegisterStudent('25161393', emptyShifts);
  assert.strictEqual(res.success, true, 'Phải thành công khi đăng ký 0 ca');
  assert.strictEqual(res.student.availableShifts.length, 0, 'Số ca hợp nhất phải bằng 0');
  assert.strictEqual(getStorageStudents().length, 30, 'Tổng số sinh viên vẫn đúng 30');
});

console.log(`\n==================================================`);
console.log(`KẾT QUẢ: ${testsPassed}/${testsPassed + testsFailed} TESTS ĐẠT CHUẨN`);
if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
