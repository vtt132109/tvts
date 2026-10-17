/**
 * ============================================================================
 * UNIT TEST SUITE CHO LÕI THUẬT TOÁN XẾP CA (SCHEDULER ENGINE TESTS)
 * ============================================================================
 * Chạy trực tiếp bằng Node.js: node tests/scheduler.test.js
 * Được quản trị và vận hành bởi QA-Agent
 */

const assert = require('assert');
const path = require('path');

// 1. Thiết lập môi trường mô phỏng Browser Window
global.window = {};

// 2. Nạp Module Scheduler Engine và Mock Data
// month_calendar.js phai duoc nap TRUOC scheduler.js: scheduler.js lay
// MonthCalendarHelper tu window va nem loi neu chua co.
require('../js/month_calendar.js');
require('../js/scheduler.js');
require('../js/roster.js');
// Du lieu kiem thu: dung fixture rieng trong tests/, KHONG dung danh sach
// CTV thuoc san pham (nay rong - danh sach that nap tu CSV).
const { TEST_STUDENTS: sampleStudents } = require('./fixtures/test_students.js');

const {
  SHIFTS,
  SHIFT_MAP,
  runAutoSchedule,
  runTwoWeekSchedule,
  runMonthSchedule
} = window.SchedulerEngine;


console.log('================================================================');
console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG - HỆ THỐNG BAN TUYỂN SINH');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`  ✕ [FAIL] ${name}`);
    console.error(`    Chi tiết: ${error.message}\n`);
  }
}

// ============================================================================
// TEST GROUP 1: Cấu trúc ca trực và Khởi tạo động cơ
// ============================================================================
runTest('Kiểm tra danh mục 10 ca hành chính (T2-T6, Sáng & Chiều)', () => {
  assert.strictEqual(SHIFTS.length, 10, 'Phải có đúng 10 ca trực trong tuần');
  assert.ok(SHIFT_MAP['T2_S'], 'Ca T2_S phải tồn tại');
  assert.ok(SHIFT_MAP['T6_C'], 'Ca T6_C phải tồn tại');
});

runTest('Kiểm tra dữ liệu mẫu 30 CTV (12 Người Cũ + 18 Người Mới)', () => {
  assert.strictEqual(sampleStudents.length, 30, 'Bộ dữ liệu mẫu phải có đúng 30 CTV');
  const olds = sampleStudents.filter(s => s.role === 'old');
  const news = sampleStudents.filter(s => s.role === 'new');
  assert.strictEqual(olds.length, 12, 'Phải có đúng 12 Người Cũ');
  assert.strictEqual(news.length, 18, 'Phải có đúng 18 Người Mới');
});

// ============================================================================
// TEST GROUP 2: Ràng buộc xếp ca 1 tuần (1 Cũ + 1 Mới)
// ============================================================================
runTest('Xếp ca 1 tuần: Ràng buộc 1 Cũ + 1 Mới và đúng ca rảnh', () => {
  const result = runAutoSchedule(sampleStudents);
  assert.ok(result && result.scheduleTable, 'Kết quả phải trả về bảng phân công');

  let filledCount = 0;
  Object.entries(result.scheduleTable).forEach(([shiftId, slot]) => {
    if (slot.oldMember) {
      assert.strictEqual(slot.oldMember.role, 'old', `Slot ${shiftId} người cũ phải có role="old"`);
      assert.ok(
        slot.oldMember.availableShifts.includes(shiftId),
        `Sinh viên ${slot.oldMember.fullName} không đăng ký rảnh ca ${shiftId}`
      );
    }
    if (slot.newMember) {
      assert.strictEqual(slot.newMember.role, 'new', `Slot ${shiftId} người mới phải có role="new"`);
      assert.ok(
        slot.newMember.availableShifts.includes(shiftId),
        `Sinh viên ${slot.newMember.fullName} không đăng ký rảnh ca ${shiftId}`
      );
    }
    if (slot.oldMember && slot.newMember) {
      filledCount++;
    }
  });

  assert.ok(filledCount >= 8, `Số ca hoàn chỉnh phải đạt ít nhất 8/10 ca (hiện tại: ${filledCount})`);
});

// ============================================================================
// TEST GROUP 3: Thuật toán Luân phiên 4 Tuần (Fairness & Anti-Starvation)
// ============================================================================
runTest('Luân phiên 4 Tuần: 100% cả 30 sinh viên đều được phân công trực', () => {
  const monthResult = runMonthSchedule(sampleStudents);
  assert.strictEqual(monthResult.weeks.length, 4, 'Lịch tháng phải có đủ 4 tuần');

  const scheduledMssvSet = new Set();
  monthResult.weeks.forEach((w) => {
    Object.values(w.scheduleTable).forEach((slot) => {
      if (slot.oldMember?.studentId) scheduledMssvSet.add(slot.oldMember.studentId);
      if (slot.newMember?.studentId) scheduledMssvSet.add(slot.newMember.studentId);
    });
  });

  assert.strictEqual(
    scheduledMssvSet.size,
    30,
    `Tất cả 30 sinh viên phải được phân công ít nhất 1 ca (Thực tế: ${scheduledMssvSet.size}/30)`
  );
});

// ============================================================================
// TEST GROUP 4: Trường hợp biên (Edge Cases)
// ============================================================================
runTest('Edge Case: Danh sách rỗng không làm sập ứng dụng (Graceful Handling)', () => {
  const emptyResult = runAutoSchedule([]);
  assert.ok(emptyResult && emptyResult.scheduleTable, 'Danh sách rỗng phải trả về bảng trống hợp lệ');
  assert.strictEqual(emptyResult.summary.totalStudents, 0);
  assert.strictEqual(emptyResult.summary.emptyShifts, 10);
});

runTest('Edge Case: Xử lý biên khi số lượng Người Cũ = 0 (Hệ thống không crash, tạo bảng phân công với cảnh báo hợp lệ)', () => {
  const onlyNews = sampleStudents.filter(s => s.role === 'new');
  assert.ok(onlyNews.length > 0, 'Phải có danh sách người mới');
  
  const result = runAutoSchedule(onlyNews);
  assert.ok(result && result.scheduleTable, 'Phải trả về kết quả xếp ca');
  assert.strictEqual(result.summary.oldStudentsCount, 0, 'Số lượng người cũ phải là 0');
  assert.strictEqual(result.summary.fullShifts, 0, 'Không thể có ca nào hoàn chỉnh khi thiếu người cũ');
  
  // Xác nhận toàn bộ 10 ca đều không có oldMember và hệ thống vẫn giữ nguyên tính toàn vẹn
  Object.values(result.scheduleTable).forEach(slot => {
    assert.strictEqual(slot.oldMember, null, 'Không được có người cũ trong slot');
  });

  // Có cảnh báo rõ ràng về việc thiếu nhóm Người Cũ
  assert.ok(
    result.warnings.some(w => w.includes('Người Cũ')),
    'Phải có thông báo cảnh báo về việc thiếu Người Cũ'
  );
});

runTest('Edge Case: Xử lý biên khi số lượng Người Mới = 0 (Hệ thống không crash, tạo bảng phân công với cảnh báo hợp lệ)', () => {
  const onlyOlds = sampleStudents.filter(s => s.role === 'old');
  assert.ok(onlyOlds.length > 0, 'Phải có danh sách người cũ');

  const result = runAutoSchedule(onlyOlds);
  assert.ok(result && result.scheduleTable, 'Phải trả về kết quả xếp ca');
  assert.strictEqual(result.summary.newStudentsCount, 0, 'Số lượng người mới phải là 0');
  assert.strictEqual(result.summary.fullShifts, 0, 'Không thể có ca nào hoàn chỉnh khi thiếu người mới');

  // Xác nhận toàn bộ 10 ca đều không có newMember
  Object.values(result.scheduleTable).forEach(slot => {
    assert.strictEqual(slot.newMember, null, 'Không được có người mới trong slot');
  });

  // Có cảnh báo rõ ràng về việc thiếu nhóm Người Mới
  assert.ok(
    result.warnings.some(w => w.includes('Người Mới')),
    'Phải có thông báo cảnh báo về việc thiếu Người Mới'
  );
});

runTest('Edge Case: Luân phiên 4 Tuần (runMonthSchedule) xử lý trơn tru khi Người Cũ = 0 hoặc Người Mới = 0', () => {
  const onlyNews = sampleStudents.filter(s => s.role === 'new');
  const monthResultNews = runMonthSchedule(onlyNews);
  assert.ok(monthResultNews && monthResultNews.weeks, 'Phải tạo thành công lịch 4 tuần khi không có người cũ');
  assert.strictEqual(monthResultNews.weeks.length, 4, 'Vẫn phải đủ 4 tuần');
  assert.strictEqual(monthResultNews.totalStudents, onlyNews.length);

  const onlyOlds = sampleStudents.filter(s => s.role === 'old');
  const monthResultOlds = runMonthSchedule(onlyOlds);
  assert.ok(monthResultOlds && monthResultOlds.weeks, 'Phải tạo thành công lịch 4 tuần khi không có người mới');
  assert.strictEqual(monthResultOlds.weeks.length, 4, 'Vẫn phải đủ 4 tuần');
  assert.strictEqual(monthResultOlds.totalStudents, onlyOlds.length);
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}

