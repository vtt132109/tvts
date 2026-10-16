/**
 * ============================================================================
 * AUTOMATED TEST SUITE: MONTHLY SHIFT REGISTRATION & MULTI-WEEK SCHEDULER
 * ============================================================================
 * Kiểm thử tự động tính năng Đăng Ký Ca Rảnh Trọn Tháng & Hiển Thị Ngày Cụ Thể
 * Tuân thủ nghiêm ngặt Section 9 trong .antigravity/memory/api-contracts.md:
 *
 * Test 1: MonthCalendarHelper tính chính xác ngày tháng cho các tuần trong tháng 10/2026 (T2 - T6).
 * Test 2: Đăng ký sinh viên với monthlyAvailableShifts và tự động sinh availableShifts hợp nhất.
 * Test 3: Thuật toán solveMultiWeekSchedule áp dụng đúng ca rảnh của tuần 1, tuần 2, tuần 3, tuần 4 theo từng sinh viên.
 * Test 4: Tương thích ngược 100%: Sinh viên chỉ có availableShifts thông thường vẫn được xếp ca chính xác qua 4 tuần.
 * Test 5: Tính năng sao chép ca 1 tuần ra cả 4 tuần (clone week to month).
 * Test 6: Kiểm tra an toàn khi sinh viên để trống ca ở một tuần bất kỳ (ví dụ tuần thi cử).
 *
 * Chạy trực tiếp: node tests/monthly_registration.test.js
 * ============================================================================
 */

const assert = require('assert');
const path = require('path');

// 1. Khởi tạo môi trường mô phỏng Browser Window nếu chạy trên Node.js
global.window = global.window || {};

// 2. Nạp module MonthCalendarHelper, SchedulerEngine và Mock Data 30 CTV
require('../js/month_calendar.js');
require('../js/scheduler.js');
require('../js/sample30.js');

const MonthCalendarHelper = window.MonthCalendarHelper || require('../js/month_calendar.js');
const SchedulerEngine = window.SchedulerEngine || require('../js/scheduler.js');
const { solveMultiWeekSchedule, runMonthSchedule, SHIFTS, SHIFT_MAP } = SchedulerEngine;
const sampleStudents = window.SAMPLE_30_STUDENTS || require('../js/sample30.js').SAMPLE_30_STUDENTS;

console.log('================================================================');
console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: ĐĂNG KÝ CA RẢNH TRỌN THÁNG (MONTHLY REG)');
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
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// ============================================================================
// TEST GROUP 1: MonthCalendarHelper tính chính xác ngày tháng Tháng 10/2026
// ============================================================================
console.log('▶ [GROUP 1] MonthCalendarHelper & Tính Ngày Tháng Tháng 10/2026 (T2 - T6):');

runTest('1.1: Khởi tạo MonthCalendarHelper với đầy đủ API chuẩn Contract Section 9B', () => {
  assert.ok(MonthCalendarHelper, 'MonthCalendarHelper phải được khởi tạo thành công');
  assert.strictEqual(typeof MonthCalendarHelper.getMonthWeeks, 'function', 'Phải có getMonthWeeks');
  assert.strictEqual(typeof MonthCalendarHelper.getFirstMonday, 'function', 'Phải có getFirstMonday');
  assert.strictEqual(typeof MonthCalendarHelper.mergeMonthlyShifts, 'function', 'Phải có mergeMonthlyShifts');
  assert.strictEqual(typeof MonthCalendarHelper.cloneWeekToMonth, 'function', 'Phải có cloneWeekToMonth');
  assert.strictEqual(typeof MonthCalendarHelper.prepareStudentRegistration, 'function', 'Phải có prepareStudentRegistration');
});

runTest('1.2: Xác định chính xác Thứ 2 đầu tiên của Tháng 10/2026 là ngày 05/10/2026', () => {
  const firstMonday = MonthCalendarHelper.getFirstMonday(2026, 10);
  assert.strictEqual(firstMonday.getFullYear(), 2026, 'Năm phải là 2026');
  assert.strictEqual(firstMonday.getMonth(), 9, 'Tháng phải là 9 (Tháng 10 index 0)');
  assert.strictEqual(firstMonday.getDate(), 5, 'Ngày phải là 05 (Thứ 2 đầu tiên của tháng)');
  assert.strictEqual(firstMonday.getDay(), 1, 'Thứ phải là Thứ 2 (day index 1)');
});

runTest('1.3: getMonthWeeks(10, 2026) trả về đúng 4 tuần làm việc hành chính', () => {
  const weeks = MonthCalendarHelper.getMonthWeeks(10, 2026);
  assert.ok(Array.isArray(weeks), 'Kết quả phải là một mảng');
  assert.strictEqual(weeks.length, 4, 'Tháng phải có đúng 4 tuần làm việc hành chính');
  assert.strictEqual(weeks[0].weekNumber, 1);
  assert.strictEqual(weeks[1].weekNumber, 2);
  assert.strictEqual(weeks[2].weekNumber, 3);
  assert.strictEqual(weeks[3].weekNumber, 4);
});

runTest('1.4: Tuần 1 bắt đầu ngày 05/10/2026 và kết thúc ngày 09/10/2026 với nhãn chuẩn', () => {
  const weeks = MonthCalendarHelper.getMonthWeeks(10, 2026);
  const w1 = weeks[0];
  assert.strictEqual(w1.startDateStr, '05/10', 'startDateStr của Tuần 1 phải là 05/10');
  assert.strictEqual(w1.endDateStr, '09/10', 'endDateStr của Tuần 1 phải là 09/10');
  assert.strictEqual(w1.label, 'Tuần 1 (05/10 - 09/10/2026)', 'Nhãn hiển thị Tuần 1 phải chuẩn xác');
});

runTest('1.5: Tuần 2 (12/10 - 16/10), Tuần 3 (19/10 - 23/10), Tuần 4 (26/10 - 30/10) khớp chính xác từng ngày', () => {
  const weeks = MonthCalendarHelper.getMonthWeeks(10, 2026);
  // Tuần 2
  assert.strictEqual(weeks[1].startDateStr, '12/10');
  assert.strictEqual(weeks[1].endDateStr, '16/10');
  assert.strictEqual(weeks[1].label, 'Tuần 2 (12/10 - 16/10/2026)');

  // Tuần 3
  assert.strictEqual(weeks[2].startDateStr, '19/10');
  assert.strictEqual(weeks[2].endDateStr, '23/10');
  assert.strictEqual(weeks[2].label, 'Tuần 3 (19/10 - 23/10/2026)');

  // Tuần 4
  assert.strictEqual(weeks[3].startDateStr, '26/10');
  assert.strictEqual(weeks[3].endDateStr, '30/10');
  assert.strictEqual(weeks[3].label, 'Tuần 4 (26/10 - 30/10/2026)');
});

runTest('1.6: Mỗi ngày trong tuần (T2..T6) chứa đầy đủ dayKey, dayName, dateStr và fullDate', () => {
  const weeks = MonthCalendarHelper.getMonthWeeks(10, 2026);
  const w1Days = weeks[0].days;
  const expectedKeys = ['T2', 'T3', 'T4', 'T5', 'T6'];
  const expectedNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
  const expectedDates = ['05/10', '06/10', '07/10', '08/10', '09/10'];
  const expectedFullDates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

  expectedKeys.forEach((key, idx) => {
    const day = w1Days[key];
    assert.ok(day, `Ngày ${key} phải tồn tại`);
    assert.strictEqual(day.dayKey, key);
    assert.strictEqual(day.dayName, expectedNames[idx]);
    assert.strictEqual(day.dateStr, expectedDates[idx]);
    assert.strictEqual(day.fullDate, expectedFullDates[idx]);
  });
});

runTest('1.7: Mỗi ngày chứa cấu trúc 2 ca trực chuẩn Sáng/Chiều với id, name, time và fullLabel', () => {
  const weeks = MonthCalendarHelper.getMonthWeeks(10, 2026);
  const t2 = weeks[0].days.T2;
  assert.ok(t2.shifts && t2.shifts.S && t2.shifts.C, 'Phải có 2 ca Sáng và Chiều');

  // Ca Sáng
  assert.strictEqual(t2.shifts.S.id, 'T2_S');
  assert.strictEqual(t2.shifts.S.name, 'Sáng');
  assert.strictEqual(t2.shifts.S.time, '07:30 - 11:30');
  assert.strictEqual(t2.shifts.S.fullLabel, 'Thứ 2 (05/10) - Sáng');

  // Ca Chiều
  assert.strictEqual(t2.shifts.C.id, 'T2_C');
  assert.strictEqual(t2.shifts.C.name, 'Chiều');
  assert.strictEqual(t2.shifts.C.time, '13:00 - 16:30');
  assert.strictEqual(t2.shifts.C.fullLabel, 'Thứ 2 (05/10) - Chiều');
});

runTest('1.8: Hỗ trợ linh hoạt các định dạng đầu vào: "2026-10", "10/2026", (10, 2026), (2026, 10)', () => {
  const wA = MonthCalendarHelper.getMonthWeeks('2026-10');
  const wB = MonthCalendarHelper.getMonthWeeks('10/2026');
  const wC = MonthCalendarHelper.getMonthWeeks(10, 2026);
  const wD = MonthCalendarHelper.getMonthWeeks(2026, 10);
  const wDef = MonthCalendarHelper.getMonthWeeks(); // default 10/2026

  assert.strictEqual(wA[0].startDateStr, '05/10');
  assert.strictEqual(wB[0].startDateStr, '05/10');
  assert.strictEqual(wC[0].startDateStr, '05/10');
  assert.strictEqual(wD[0].startDateStr, '05/10');
  assert.strictEqual(wDef[0].startDateStr, '05/10');
});

// ============================================================================
// TEST GROUP 2: Đăng ký sinh viên với monthlyAvailableShifts & Union availableShifts
// ============================================================================
console.log('\n▶ [GROUP 2] Đăng Ký monthlyAvailableShifts & Tự Động Sinh availableShifts Hợp Nhất:');

runTest('2.1: mergeMonthlyShifts hợp nhất chính xác các ca rảnh của cả 4 tuần', () => {
  const monthlyShifts = {
    1: ['T2_S', 'T4_C'],
    2: ['T3_S'],
    3: ['T2_C', 'T5_S'],
    4: ['T6_C']
  };
  const union = MonthCalendarHelper.mergeMonthlyShifts(monthlyShifts);
  assert.ok(Array.isArray(union), 'Kết quả phải là một mảng');
  assert.strictEqual(union.length, 6, 'Tổng cộng có đúng 6 ca rảnh duy nhất');
  ['T2_S', 'T4_C', 'T3_S', 'T2_C', 'T5_S', 'T6_C'].forEach(s => {
    assert.ok(union.includes(s), `Ca ${s} phải có trong mảng hợp nhất`);
  });
});

runTest('2.2: mergeMonthlyShifts tự động khử trùng lặp khi ca xuất hiện ở nhiều tuần', () => {
  const monthlyShifts = {
    1: ['T2_S', 'T3_S'],
    2: ['T2_S', 'T4_S'],
    3: ['T2_S', 'T5_S'],
    4: ['T2_S', 'T6_S']
  };
  const union = MonthCalendarHelper.mergeMonthlyShifts(monthlyShifts);
  const countT2S = union.filter(s => s === 'T2_S').length;
  assert.strictEqual(countT2S, 1, 'Ca T2_S chỉ xuất hiện đúng 1 lần trong union');
  assert.strictEqual(union.length, 5, 'Chỉ có 5 ca duy nhất');
});

runTest('2.3: prepareStudentRegistration tự động tính và gán availableShifts từ monthlyAvailableShifts', () => {
  const rawStudent = {
    studentId: '2102001',
    fullName: 'Nguyễn Văn An',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S', 'T3_C'],
      2: ['T4_S'],
      3: ['T5_C'],
      4: ['T6_S', 'T6_C']
    }
  };

  const student = MonthCalendarHelper.prepareStudentRegistration(rawStudent);
  assert.ok(student.availableShifts, 'Phải tự động sinh availableShifts');
  assert.strictEqual(student.availableShifts.length, 6, 'Hợp nhất phải có đúng 6 ca');
  assert.ok(student.availableShifts.includes('T2_S'));
  assert.ok(student.availableShifts.includes('T3_C'));
  assert.ok(student.availableShifts.includes('T4_S'));
  assert.ok(student.availableShifts.includes('T5_C'));
  assert.ok(student.availableShifts.includes('T6_S'));
  assert.ok(student.availableShifts.includes('T6_C'));
});

runTest('2.4: prepareStudentRegistration bảo toàn đầy đủ các trường thông tin của sinh viên', () => {
  const rawStudent = {
    id: 'stu_test_01',
    studentId: '2102009',
    fullName: 'Trần Thị Bích',
    phone: '0912345678',
    role: 'new',
    registrationMonth: '2026-10',
    monthlyAvailableShifts: { 1: ['T2_S'] }
  };
  const student = MonthCalendarHelper.prepareStudentRegistration(rawStudent);
  assert.strictEqual(student.id, 'stu_test_01');
  assert.strictEqual(student.studentId, '2102009');
  assert.strictEqual(student.fullName, 'Trần Thị Bích');
  assert.strictEqual(student.phone, '0912345678');
  assert.strictEqual(student.role, 'new');
  assert.strictEqual(student.registrationMonth, '2026-10');
});

runTest('2.5: Xử lý an toàn khi sinh viên chỉ chọn ca ở 1 hoặc 2 tuần, các tuần còn lại để trống', () => {
  const rawStudent = {
    studentId: '2102010',
    fullName: 'Lê Hoàng Minh',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      3: ['T4_C']
      // Tuần 2 và Tuần 4 không khai báo
    }
  };
  const student = MonthCalendarHelper.prepareStudentRegistration(rawStudent);
  assert.strictEqual(student.availableShifts.length, 2);
  assert.ok(student.availableShifts.includes('T2_S'));
  assert.ok(student.availableShifts.includes('T4_C'));
});

// ============================================================================
// TEST GROUP 3: solveMultiWeekSchedule áp dụng đúng ca rảnh của từng tuần
// ============================================================================
console.log('\n▶ [GROUP 3] solveMultiWeekSchedule Phân Bổ Theo Đúng Ca Rảnh Từng Tuần:');

runTest('3.1: Sinh viên chỉ được phân công đúng các ca đã đăng ký trong tuần đó', () => {
  const studentA = {
    id: 'stu_old_A',
    studentId: '2101001',
    fullName: 'Cựu Binh A',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T3_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const studentB = {
    id: 'stu_new_B',
    studentId: '2301002',
    fullName: 'Tân Binh B',
    role: 'new',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T3_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const monthResult = solveMultiWeekSchedule([studentA, studentB], 4);
  assert.ok(monthResult && monthResult.weeks, 'Phải có kết quả lịch 4 tuần');
  assert.strictEqual(monthResult.weeks.length, 4);

  // Tuần 1: Chỉ rảnh T2_S
  const w1Table = monthResult.weeks[0].scheduleTable;
  assert.strictEqual(w1Table['T2_S'].oldMember?.studentId, '2101001');
  assert.strictEqual(w1Table['T2_S'].newMember?.studentId, '2301002');

  // Tuần 2: Chỉ rảnh T3_S
  const w2Table = monthResult.weeks[1].scheduleTable;
  assert.strictEqual(w2Table['T3_S'].oldMember?.studentId, '2101001');
  assert.strictEqual(w2Table['T3_S'].newMember?.studentId, '2301002');

  // Tuần 3: Chỉ rảnh T4_S
  const w3Table = monthResult.weeks[2].scheduleTable;
  assert.strictEqual(w3Table['T4_S'].oldMember?.studentId, '2101001');
  assert.strictEqual(w3Table['T4_S'].newMember?.studentId, '2301002');

  // Tuần 4: Chỉ rảnh T5_S
  const w4Table = monthResult.weeks[3].scheduleTable;
  assert.strictEqual(w4Table['T5_S'].oldMember?.studentId, '2101001');
  assert.strictEqual(w4Table['T5_S'].newMember?.studentId, '2301002');
});

runTest('3.2: Tuần 1: Sinh viên TUYỆT ĐỐI KHÔNG bị xếp vào ca của tuần 2, 3, 4', () => {
  const studentOld = {
    id: 's_old_exclusive',
    studentId: '2101005',
    fullName: 'Người Cũ Ca Lệch',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T3_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };
  const studentNew = {
    id: 's_new_exclusive',
    studentId: '2301005',
    fullName: 'Người Mới Ca Lệch',
    role: 'new',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T3_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const result = solveMultiWeekSchedule([studentOld, studentNew], 4);
  const w1 = result.weeks[0];

  // Kiểm tra Tuần 1: Không được có ở T3_S, T4_S, T5_S
  ['T3_S', 'T4_S', 'T5_S'].forEach(shiftId => {
    assert.notStrictEqual(w1.scheduleTable[shiftId].oldMember?.studentId, '2101005', `Tuần 1 không thể có ca ${shiftId}`);
    assert.notStrictEqual(w1.scheduleTable[shiftId].newMember?.studentId, '2301005', `Tuần 1 không thể có ca ${shiftId}`);
  });
});

runTest('3.3: Tuần 2: Sinh viên TUYỆT ĐỐI KHÔNG bị xếp vào ca của tuần 1', () => {
  const studentOld = {
    id: 's_old_ex2',
    studentId: '2101006',
    fullName: 'Người Cũ Tuần 2',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T3_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };
  const studentNew = {
    id: 's_new_ex2',
    studentId: '2301006',
    fullName: 'Người Mới Tuần 2',
    role: 'new',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T3_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const result = solveMultiWeekSchedule([studentOld, studentNew], 4);
  const w2 = result.weeks[1];
  assert.notStrictEqual(w2.scheduleTable['T2_S'].oldMember?.studentId, '2101006', 'Tuần 2 không được xếp vào ca T2_S');
  assert.notStrictEqual(w2.scheduleTable['T2_S'].newMember?.studentId, '2301006', 'Tuần 2 không được xếp vào ca T2_S');
});

runTest('3.4: Kiểm thử với nhiều sinh viên so le ca: 100% ca được xếp thỏa mãn ca rảnh tương ứng của tuần đó', () => {
  // Tạo 6 sinh viên (3 Cũ, 3 Mới) với ca rảnh biến thiên theo tuần
  const cohort = [
    {
      id: 'o1', role: 'old', studentId: '21001',
      monthlyAvailableShifts: { 1: ['T2_S', 'T3_C'], 2: ['T4_S'], 3: ['T5_C'], 4: ['T6_S'] }
    },
    {
      id: 'o2', role: 'old', studentId: '21002',
      monthlyAvailableShifts: { 1: ['T3_S'], 2: ['T2_C', 'T5_S'], 3: ['T6_C'], 4: ['T4_S'] }
    },
    {
      id: 'o3', role: 'old', studentId: '21003',
      monthlyAvailableShifts: { 1: ['T4_C', 'T5_S'], 2: ['T6_S'], 3: ['T2_S', 'T3_S'], 4: ['T5_C'] }
    },
    {
      id: 'n1', role: 'new', studentId: '23001',
      monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T4_S', 'T6_S'], 3: ['T3_S'], 4: ['T6_S'] }
    },
    {
      id: 'n2', role: 'new', studentId: '23002',
      monthlyAvailableShifts: { 1: ['T3_C', 'T4_C'], 2: ['T2_C'], 3: ['T5_C', 'T6_C'], 4: ['T4_S'] }
    },
    {
      id: 'n3', role: 'new', studentId: '23003',
      monthlyAvailableShifts: { 1: ['T5_S'], 2: ['T5_S'], 3: ['T2_S'], 4: ['T5_C'] }
    }
  ];

  const res = solveMultiWeekSchedule(cohort, 4);
  res.weeks.forEach(w => {
    const wNum = w.weekNumber;
    Object.entries(w.scheduleTable).forEach(([shiftId, slot]) => {
      if (slot.oldMember) {
        const student = cohort.find(s => s.studentId === slot.oldMember.studentId);
        const validShiftsInWeek = student.monthlyAvailableShifts[wNum] || [];
        assert.ok(
          validShiftsInWeek.includes(shiftId),
          `Người cũ ${student.studentId} bị xếp nhầm ca ${shiftId} ở tuần ${wNum} (chỉ rảnh: ${validShiftsInWeek.join(', ')})`
        );
      }
      if (slot.newMember) {
        const student = cohort.find(s => s.studentId === slot.newMember.studentId);
        const validShiftsInWeek = student.monthlyAvailableShifts[wNum] || [];
        assert.ok(
          validShiftsInWeek.includes(shiftId),
          `Người mới ${student.studentId} bị xếp nhầm ca ${shiftId} ở tuần ${wNum} (chỉ rảnh: ${validShiftsInWeek.join(', ')})`
        );
      }
    });
  });
});

runTest('3.5: Cân bằng công bằng lũy kế (cumulative fairness) hoạt động chính xác theo ca rảnh tuần sau', () => {
  // 2 người cũ, 2 người mới
  const students = [
    { id: 'fa_o1', role: 'old', studentId: '21051', monthlyAvailableShifts: { 1: ['T2_S', 'T3_S'], 2: ['T2_S', 'T3_S'] } },
    { id: 'fa_o2', role: 'old', studentId: '21052', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T2_S', 'T3_S'] } },
    { id: 'fa_n1', role: 'new', studentId: '23051', monthlyAvailableShifts: { 1: ['T2_S', 'T3_S'], 2: ['T2_S', 'T3_S'] } },
    { id: 'fa_n2', role: 'new', studentId: '23052', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T2_S', 'T3_S'] } }
  ];

  const res = solveMultiWeekSchedule(students, 2);
  assert.ok(res.success);
  // Cả 4 bạn đều được phân công ít nhất 1 ca qua 2 tuần
  const totalAssigned = Object.values(res.combinedStats).filter(st => st.totalCount > 0).length;
  assert.strictEqual(totalAssigned, 4, 'Cả 4 sinh viên đều được phân bổ ca công bằng');
});

// ============================================================================
// TEST GROUP 4: Tương thích ngược 100% (Backward Compatibility)
// ============================================================================
console.log('\n▶ [GROUP 4] Tương Thích Ngược 100% (Backward Compatibility):');

runTest('4.1: Sinh viên chỉ có availableShifts thông thường vẫn được xếp ca qua cả 4 tuần', () => {
  const legacyCohort = [
    { id: 'leg_o1', role: 'old', studentId: '21081', availableShifts: ['T2_S', 'T3_C', 'T5_S'] },
    { id: 'leg_o2', role: 'old', studentId: '21082', availableShifts: ['T2_C', 'T4_S', 'T6_C'] },
    { id: 'leg_n1', role: 'new', studentId: '23081', availableShifts: ['T2_S', 'T3_C', 'T5_S'] },
    { id: 'leg_n2', role: 'new', studentId: '23082', availableShifts: ['T2_C', 'T4_S', 'T6_C'] }
  ];

  const res = solveMultiWeekSchedule(legacyCohort, 4);
  assert.strictEqual(res.weeks.length, 4, 'Vẫn phải đủ 4 tuần');
  assert.strictEqual(res.totalStudents, 4);
  assert.ok(res.success);
});

runTest('4.2: Toàn bộ ca được xếp cho sinh viên kiểu cũ luôn nằm trong availableShifts gốc ở cả 4 tuần', () => {
  const legacyStudentOld = { id: 'leg_chk_o', role: 'old', studentId: '21099', availableShifts: ['T2_S', 'T4_C'] };
  const legacyStudentNew = { id: 'leg_chk_n', role: 'new', studentId: '23099', availableShifts: ['T2_S', 'T4_C'] };

  const res = solveMultiWeekSchedule([legacyStudentOld, legacyStudentNew], 4);
  res.weeks.forEach((w, idx) => {
    Object.entries(w.scheduleTable).forEach(([shiftId, slot]) => {
      if (slot.oldMember?.studentId === '21099') {
        assert.ok(['T2_S', 'T4_C'].includes(shiftId), `Tuần ${idx + 1}: Ca ${shiftId} phải thuộc availableShifts gốc`);
      }
      if (slot.newMember?.studentId === '23099') {
        assert.ok(['T2_S', 'T4_C'].includes(shiftId), `Tuần ${idx + 1}: Ca ${shiftId} phải thuộc availableShifts gốc`);
      }
    });
  });
});

runTest('4.3: Hỗn hợp dữ liệu: Sinh viên monthlyAvailableShifts và sinh viên availableShifts xếp ca mượt mà', () => {
  const mixedCohort = [
    // Sinh viên đăng ký theo tháng
    { id: 'mix_m1', role: 'old', studentId: '21071', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T3_S'], 3: ['T4_S'], 4: ['T5_S'] } },
    { id: 'mix_m2', role: 'new', studentId: '23071', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T3_S'], 3: ['T4_S'], 4: ['T5_S'] } },
    // Sinh viên kiểu cũ chỉ có availableShifts
    { id: 'mix_l1', role: 'old', studentId: '21072', availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C'] },
    { id: 'mix_l2', role: 'new', studentId: '23072', availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C'] }
  ];

  const res = solveMultiWeekSchedule(mixedCohort, 4);
  assert.strictEqual(res.weeks.length, 4);
  assert.strictEqual(res.totalStudents, 4);

  // Sinh viên mix_m1 chỉ có mặt ở ca Sáng tương ứng từng tuần
  assert.strictEqual(res.weeks[0].scheduleTable['T2_S'].oldMember?.studentId, '21071');
  assert.strictEqual(res.weeks[1].scheduleTable['T3_S'].oldMember?.studentId, '21071');
  // Sinh viên mix_l1 chỉ có mặt ở ca Chiều
  assert.strictEqual(res.weeks[0].scheduleTable['T2_C'].oldMember?.studentId, '21072');
  assert.strictEqual(res.weeks[1].scheduleTable['T3_C'].oldMember?.studentId, '21072');
});

runTest('4.4: Toàn bộ 30 CTV mẫu SAMPLE_30_STUDENTS (chỉ có availableShifts) được xếp ca 100% chuẩn xác', () => {
  const monthResult = runMonthSchedule(sampleStudents);
  assert.strictEqual(monthResult.weeks.length, 4, 'Phải có đúng 4 tuần');
  assert.strictEqual(monthResult.totalStudents, 30, 'Tổng sinh viên phải là 30');

  // Đảm bảo cả 30 CTV đều được xếp ca (anti-starvation)
  const scheduledIds = new Set();
  monthResult.weeks.forEach(w => {
    Object.values(w.scheduleTable).forEach(slot => {
      if (slot.oldMember?.studentId) scheduledIds.add(slot.oldMember.studentId);
      if (slot.newMember?.studentId) scheduledIds.add(slot.newMember.studentId);
    });
  });

  assert.strictEqual(scheduledIds.size, 30, 'Tất cả 30 CTV đều phải được phân công ít nhất 1 ca');
});

// ============================================================================
// TEST GROUP 5: Tính năng sao chép ca 1 tuần ra cả 4 tuần (Clone Week to Month)
// ============================================================================
console.log('\n▶ [GROUP 5] Tính Năng Sao Chép Ca 1 Tuần Ra Cả 4 Tuần (Clone Week to Month):');

runTest('5.1: cloneWeekToMonth tạo ra cấu trúc đủ 4 tuần với các ca giống hệt tuần nguồn', () => {
  const sourceShifts = ['T2_S', 'T3_C', 'T5_S'];
  const cloned = MonthCalendarHelper.cloneWeekToMonth(sourceShifts);

  assert.ok(cloned && typeof cloned === 'object');
  assert.strictEqual(Object.keys(cloned).length, 4, 'Phải có đủ 4 tuần');
  for (let w = 1; w <= 4; w++) {
    assert.deepStrictEqual(cloned[w], ['T2_S', 'T3_C', 'T5_S'], `Tuần ${w} phải chứa các ca nguồn`);
  }
});

runTest('5.2: Đảm bảo tính độc lập bộ nhớ (Deep Copy / No Reference Leak)', () => {
  const sourceShifts = ['T2_S', 'T4_S'];
  const cloned = MonthCalendarHelper.cloneWeekToMonth(sourceShifts);

  // Sửa tuần 2: thêm ca 'T6_C'
  cloned[2].push('T6_C');

  assert.strictEqual(cloned[2].length, 3, 'Tuần 2 có 3 ca');
  assert.strictEqual(cloned[1].length, 2, 'Tuần 1 không bị ảnh hưởng, vẫn có 2 ca');
  assert.strictEqual(cloned[3].length, 2, 'Tuần 3 không bị ảnh hưởng');
  assert.strictEqual(cloned[4].length, 2, 'Tuần 4 không bị ảnh hưởng');
  assert.strictEqual(sourceShifts.length, 2, 'Mảng nguồn gốc không bị biến đổi');
});

runTest('5.3: Hợp nhất của 4 tuần sau khi sao chép tương đương hoàn toàn mảng ca nguồn', () => {
  const sourceShifts = ['T2_C', 'T3_S', 'T5_C'];
  const cloned = MonthCalendarHelper.cloneWeekToMonth(sourceShifts);
  const union = MonthCalendarHelper.mergeMonthlyShifts(cloned);

  assert.strictEqual(union.length, 3);
  sourceShifts.forEach(s => assert.ok(union.includes(s)));
});

runTest('5.4: Xử lý an toàn các trường hợp biên: mảng nguồn rỗng hoặc phần tử không hợp lệ', () => {
  const clonedEmpty = MonthCalendarHelper.cloneWeekToMonth([]);
  assert.deepStrictEqual(clonedEmpty[1], []);
  assert.deepStrictEqual(clonedEmpty[4], []);

  const clonedDirty = MonthCalendarHelper.cloneWeekToMonth(['T2_S', '', null, undefined, '  ', 'T3_C']);
  assert.deepStrictEqual(clonedDirty[1], ['T2_S', 'T3_C'], 'Phải tự động lọc bỏ các phần tử rác');
});

// ============================================================================
// TEST GROUP 6: Kiểm tra an toàn khi sinh viên để trống ca ở một tuần bất kỳ
// ============================================================================
console.log('\n▶ [GROUP 6] Kiểm Tra An Toàn Khi Sinh Viên Để Trống Ca Ở 1 Tuần (Tuần Thi Cử):');

runTest('6.1: Sinh viên để trống hoàn toàn ca ở Tuần 2 (thi cử) đảm bảo 0 ca trực ở Tuần 2', () => {
  const examStudentOld = {
    id: 'exam_o1',
    studentId: '210601',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: [], // BẬN THI GIỮA KỲ: 0 ca rảnh
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const buddyOld = {
    id: 'exam_o2',
    studentId: '210602',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T2_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const buddyNew = {
    id: 'exam_n1',
    studentId: '230601',
    role: 'new',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: ['T2_S'],
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const res = solveMultiWeekSchedule([examStudentOld, buddyOld, buddyNew], 4);
  assert.ok(res.success);

  // Kiểm tra Tuần 2: exam_o1 TUYỆT ĐỐI KHÔNG có ca nào
  const w2Assigned = res.weeks[1].studentStats['exam_o1']?.assignedCount || 0;
  assert.strictEqual(w2Assigned, 0, 'Ở tuần bận thi (Tuần 2), số ca được phân bổ của exam_o1 phải là 0');
  Object.values(res.weeks[1].scheduleTable).forEach(slot => {
    assert.notStrictEqual(slot.oldMember?.studentId, '210601', 'Không được xuất hiện trong bất kỳ ca nào của tuần 2');
  });

  // Trong khi đó buddyOld vẫn được phân công ở Tuần 2 bình thường
  assert.strictEqual(res.weeks[1].scheduleTable['T2_S'].oldMember?.studentId, '210602');
});

runTest('6.2: Sinh viên vẫn được phân công bình thường ở các tuần khác có đăng ký', () => {
  const examStudentOld = {
    id: 'exam_o1_cont',
    studentId: '210603',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: [], // Tuần 2 nghỉ
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const examStudentNew = {
    id: 'exam_n1_cont',
    studentId: '230603',
    role: 'new',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: [], // Tuần 2 nghỉ
      3: ['T4_S'],
      4: ['T5_S']
    }
  };

  const res = solveMultiWeekSchedule([examStudentOld, examStudentNew], 4);
  // Tuần 1 được xếp
  assert.strictEqual(res.weeks[0].scheduleTable['T2_S'].oldMember?.studentId, '210603');
  assert.strictEqual(res.weeks[0].scheduleTable['T2_S'].newMember?.studentId, '230603');

  // Tuần 3 được xếp
  assert.strictEqual(res.weeks[2].scheduleTable['T4_S'].oldMember?.studentId, '210603');
  assert.strictEqual(res.weeks[2].scheduleTable['T4_S'].newMember?.studentId, '230603');

  // Tuần 4 được xếp
  assert.strictEqual(res.weeks[3].scheduleTable['T5_S'].oldMember?.studentId, '210603');
  assert.strictEqual(res.weeks[3].scheduleTable['T5_S'].newMember?.studentId, '230603');
});

runTest('6.3: Nhiều sinh viên cùng để trống ca ở tuần thi: Hệ thống không crash, xử lý mượt mà', () => {
  // Toàn bộ 4 sinh viên đều bận thi ở tuần 3
  const cohortExamWeek = [
    { id: 'ex_o1', role: 'old', studentId: '210001', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T3_S'], 3: [], 4: ['T5_S'] } },
    { id: 'ex_o2', role: 'old', studentId: '210002', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T3_S'], 3: [], 4: ['T5_S'] } },
    { id: 'ex_n1', role: 'new', studentId: '230001', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T3_S'], 3: [], 4: ['T5_S'] } },
    { id: 'ex_n2', role: 'new', studentId: '230002', monthlyAvailableShifts: { 1: ['T2_S'], 2: ['T3_S'], 3: [], 4: ['T5_S'] } }
  ];

  assert.doesNotThrow(() => {
    const res = solveMultiWeekSchedule(cohortExamWeek, 4);
    assert.strictEqual(res.weeks.length, 4);
    // Tuần 3 tất cả đều trống
    const w3EmptyShifts = res.weeks[2].summary.emptyShifts;
    assert.strictEqual(w3EmptyShifts, 10, 'Tuần 3 tất cả 10 ca đều trống vì không có ai rảnh');
  }, 'Không được văng ngoại lệ khi có tuần không ai đăng ký');
});

runTest('6.4: Thống kê tổng hợp (combinedStats) và cảnh báo (warnings) phản ánh chính xác', () => {
  const studentVacation = {
    id: 'stu_vac',
    studentId: '210999',
    role: 'old',
    monthlyAvailableShifts: {
      1: ['T2_S'],
      2: [],
      3: [],
      4: [] // Nghỉ 3 tuần sau
    }
  };
  const dummyNew = {
    id: 'stu_dum_new',
    studentId: '230999',
    role: 'new',
    availableShifts: ['T2_S']
  };

  const res = solveMultiWeekSchedule([studentVacation, dummyNew], 4);
  const vacStats = res.combinedStats['stu_vac'];
  assert.ok(vacStats, 'Phải có thống kê cho stu_vac');
  assert.strictEqual(vacStats.week1Count, 1, 'Tuần 1 có 1 ca');
  assert.strictEqual(vacStats.week2Count, 0, 'Tuần 2 có 0 ca');
  assert.strictEqual(vacStats.week3Count, 0, 'Tuần 3 có 0 ca');
  assert.strictEqual(vacStats.week4Count, 0, 'Tuần 4 có 0 ca');
  assert.strictEqual(vacStats.totalMonthCount, 1, 'Tổng cả tháng là 1 ca');
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / (totalTests || 1)) * 100)}%)`);
console.log('================================================================\n');

if (passedTests === totalTests && totalTests > 0) {
  process.exit(0);
} else {
  process.exit(1);
}
