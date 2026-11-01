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

runTest('Capacity 1 người/ca: mỗi ca đúng 1 người, không điền vị trí thứ 2', () => {
  const result = runMonthSchedule(sampleStudents, 2026, 11, { peoplePerShift: 1, thirdShifts: [] });
  assert.ok(result && result.weeks && result.weeks.length === 4);
  let total = 0;
  result.weeks.forEach(week => {
    Object.values(week.scheduleTable).forEach(slot => {
      total++;
      assert.strictEqual(slot.capacity, 1, 'Mọi ca phải có capacity 1');
      assert.ok(slot.oldMember, 'Ca 1 người phải có người trực');
      assert.strictEqual(slot.newMember, null, 'Không được điền vị trí thứ 2');
      assert.strictEqual(slot.thirdMember, null, 'Không có người thứ 3');
      assert.strictEqual(slot.status, 'full', 'Ca 1 người có người là đủ');
    });
  });
  assert.strictEqual(total, 40, 'Đủ 40 ca trong tháng');
});

runTest('Capacity 2 + ca đặc biệt 3: auto chỉ điền 2, người thứ 3 để trống', () => {
  const result = runMonthSchedule(sampleStudents, 2026, 11, {
    peoplePerShift: 2,
    thirdShifts: ['T2_S']
  });
  result.weeks.forEach(week => {
    const special = week.scheduleTable['T2_S'];
    assert.strictEqual(special.capacity, 3, 'T2_S phải là ca 3 người');
    assert.ok(special.oldMember && special.newMember, 'Auto phải điền đủ 2 người');
    assert.strictEqual(special.thirdMember, null, 'Auto KHÔNG được điền người thứ 3');
    assert.strictEqual(special.status, 'partial', 'Ca 3 người còn thiếu người thứ 3 phải là partial');
    Object.entries(week.scheduleTable).forEach(([id, slot]) => {
      if (id !== 'T2_S') {
        assert.strictEqual(slot.capacity, 2, 'Ca thường phải là capacity 2');
      }
    });
  });
});

runTest('Capacity 1 + ca đặc biệt 3: 9 ca 1 người + 1 ca 3 người mỗi tuần', () => {
  const result = runMonthSchedule(sampleStudents, 2026, 11, {
    peoplePerShift: 1,
    thirdShifts: ['T2_S']
  });
  result.weeks.forEach(week => {
    let single = 0;
    let special = 0;
    Object.entries(week.scheduleTable).forEach(([id, slot]) => {
      if (id === 'T2_S') {
        special++;
        assert.strictEqual(slot.capacity, 3);
        assert.ok(slot.oldMember && slot.newMember);
        assert.strictEqual(slot.thirdMember, null);
        assert.strictEqual(slot.status, 'partial');
      } else {
        single++;
        assert.strictEqual(slot.capacity, 1);
        assert.strictEqual(slot.newMember, null);
        assert.strictEqual(slot.thirdMember, null);
      }
    });
    assert.strictEqual(single, 9, 'Phải có 9 ca 1 người mỗi tuần');
    assert.strictEqual(special, 1, 'Phải có 1 ca đặc biệt 3 người mỗi tuần');

    // Không ai trực 2 ca cùng ngày (kể cả ca đặc biệt).
    const seen = new Set();
    Object.entries(week.scheduleTable).forEach(([id, slot]) => {
      const day = id.split('_')[0];
      [slot.oldMember, slot.newMember, slot.thirdMember].filter(Boolean).forEach(member => {
        const key = `${member.id}@${day}`;
        assert.ok(!seen.has(key), `CTV ${member.id} bị xếp 2 ca cùng ngày ${day}`);
        seen.add(key);
      });
    });
  });
});

runTest('Any-role 2 người/ca: 2 CTV cùng vai trò vẫn được xếp đủ, không cần Cũ + Mới', () => {
  const allShifts = SHIFTS.map(s => s.id);
  const sameRole = [
    { id: 'any_a', studentId: '90000001', fullName: 'Any A', role: 'new', availableShifts: allShifts },
    { id: 'any_b', studentId: '90000002', fullName: 'Any B', role: 'new', availableShifts: allShifts },
    { id: 'any_c', studentId: '90000003', fullName: 'Any C', role: 'new', availableShifts: allShifts },
    { id: 'any_d', studentId: '90000004', fullName: 'Any D', role: 'new', availableShifts: allShifts }
  ];
  const week = window.SchedulerEngine.solveWeeklyScheduleAnyRole(sameRole, [], {}, 2);
  assert.strictEqual(week.summary.fullShifts, 10,
    `Cả 10 ca phải đủ 2 người dù tất cả cùng vai trò (thực tế ${week.summary.fullShifts})`);
  Object.values(week.scheduleTable).forEach(slot => {
    assert.strictEqual(slot.capacity, 2);
    assert.ok(slot.oldMember && slot.newMember, 'Mỗi ca phải có đủ 2 người bất kỳ');
    assert.strictEqual(slot.thirdMember, null);
  });
  const seen = new Set();
  Object.entries(week.scheduleTable).forEach(([id, slot]) => {
    const day = id.split('_')[0];
    [slot.oldMember, slot.newMember].forEach(member => {
      const key = `${member.id}@${day}`;
      assert.ok(!seen.has(key), `${member.fullName} bị xếp 2 ca cùng ngày ${day}`);
      seen.add(key);
    });
  });
});

runTest('Any-role 2 người/ca: mọi người đều role old vẫn xếp đủ 2 người', () => {
  const allShifts = SHIFTS.map(s => s.id);
  const sameRole = ['a', 'b', 'c', 'd'].map((k, idx) => ({
    id: `old_${k}`, studentId: `8000000${idx}`, fullName: `Old ${k.toUpperCase()}`,
    role: 'old', availableShifts: allShifts
  }));
  const week = window.SchedulerEngine.solveWeeklyScheduleAnyRole(sameRole, [], {}, 2);
  assert.strictEqual(week.summary.fullShifts, 10,
    'Không được để ca trống chỉ vì thiếu nhóm Tập Sự');
});

runTest('Any-role 1 người/ca: chọn 1 người bất kỳ', () => {
  const allShifts = SHIFTS.map(s => s.id);
  const sameRole = ['a', 'b', 'c', 'd'].map((k, idx) => ({
    id: `one_${k}`, studentId: `7000000${idx}`, fullName: `One ${k.toUpperCase()}`,
    role: idx % 2 === 0 ? 'old' : 'new', availableShifts: allShifts
  }));
  const week = window.SchedulerEngine.solveWeeklyScheduleAnyRole(sameRole, [], {}, 1);
  assert.strictEqual(week.summary.fullShifts, 10);
  Object.values(week.scheduleTable).forEach(slot => {
    assert.strictEqual(slot.capacity, 1);
    assert.ok(slot.oldMember);
    assert.strictEqual(slot.newMember, null);
  });
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

runTest('Ưu tiên Mới: dành 1 ca/tháng cho từng người Mới rồi xếp người Cũ, đúng ca rảnh từng tuần', () => {
  const allShifts = SHIFTS.map(s => s.id);
  const students = [
    { id: 'new_flexible', role: 'new', availableShifts: allShifts },
    { id: 'new_late', role: 'new', availableShifts: ['T2_S'],
      monthlyAvailableShifts: { 1: [], 2: [], 3: [], 4: ['T2_S'] } },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `old_${i}`, role: 'old', availableShifts: allShifts }))
  ];
  const result = runMonthSchedule(students, 2026, 11, { peoplePerShift: 1, schedulingMode: 'new-first' });
  const members = result.weeks.flatMap(w => Object.values(w.scheduleTable).map(s => s.oldMember));
  assert.strictEqual(members.filter(s => s?.id === 'new_flexible').length, 1);
  assert.strictEqual(members.filter(s => s?.id === 'new_late').length, 1);
  assert.strictEqual(result.weeks[3].scheduleTable.T2_S.oldMember.id, 'new_late');
  assert.strictEqual(members.filter(s => s?.role === 'old').length, 38);
});

runTest('Ưu tiên Mới: ghép lại ca linh hoạt để không bỏ sót người chỉ rảnh một ca', () => {
  const students = [
    { id: 'flex', role: 'new', availableShifts: ['T2_S', 'T3_S'] },
    { id: 'scarce', role: 'new', availableShifts: ['T2_S'] },
    { id: 'old', role: 'old', availableShifts: SHIFTS.map(s => s.id) }
  ].map(s => ({ ...s, monthlyAvailableShifts: { 1: s.availableShifts, 2: [], 3: [], 4: [] } }));
  const result = runMonthSchedule(students, 2026, 11, { peoplePerShift: 1, schedulingMode: 'new-first' });
  assert.strictEqual(result.weeks[0].scheduleTable.T2_S.oldMember.id, 'scarce');
  assert.strictEqual(result.weeks[0].scheduleTable.T3_S.oldMember.id, 'flex');
  assert.ok(result.combinedStats.flex.totalCount >= 1);
  assert.ok(result.combinedStats.scarce.totalCount >= 1);
});

function randomMonth(students, capacity, seed) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return runMonthSchedule(students, 2026, 11, { peoplePerShift: capacity, schedulingMode: 'random' });
  } finally { Math.random = original; }
}

runTest('Random: đúng số người/ca, ca rảnh từng tuần, không phân biệt vai trò và không sửa đầu vào', () => {
  const allShifts = SHIFTS.map(s => s.id);
  for (const role of ['old', 'new']) {
    const students = Array.from({ length: 8 }, (_, i) => ({
      id: `random_${i}`, studentId: `90000${i}`, fullName: `CTV ${i}`, role,
      availableShifts: allShifts,
      monthlyAvailableShifts: { 1: allShifts, 2: i === 0 ? [] : allShifts, 3: allShifts, 4: allShifts }
    }));
    const before = JSON.stringify(students);
    for (const capacity of [1, 2]) {
      const result = randomMonth(students, capacity, 19);
      result.weeks.forEach(week => {
        const seen = new Set();
        Object.entries(week.scheduleTable).forEach(([id, slot]) => {
          const members = [slot.oldMember, slot.newMember, slot.thirdMember].filter(Boolean);
          assert.strictEqual(members.length, capacity);
          assert.strictEqual(slot.capacity, capacity);
          assert.strictEqual(slot.status, 'full');
          members.forEach(member => {
            assert.ok(member.monthlyAvailableShifts[week.weekNumber].includes(id));
            const key = `${member.id}@${id.split('_')[0]}`;
            assert.ok(!seen.has(key), 'Không trùng người trong ca hoặc trùng ngày khi đủ người');
            seen.add(key);
          });
        });
      });
    }
    assert.strictEqual(JSON.stringify(students), before);
  }
});

runTest('Random: kết quả phụ thuộc nguồn ngẫu nhiên, không ép vị trí Cũ/Mới', () => {
  const students = Array.from({ length: 8 }, (_, i) => ({
    id: `r_${i}`, role: i % 2 ? 'new' : 'old', availableShifts: SHIFTS.map(s => s.id)
  }));
  const signature = result => result.weeks.map(w => Object.values(w.scheduleTable)
    .map(s => [s.oldMember?.id, s.newMember?.id]));
  const first = randomMonth(students, 2, 1);
  assert.deepStrictEqual(signature(first), signature(randomMonth(students, 2, 1)));
  assert.notDeepStrictEqual(signature(first), signature(randomMonth(students, 2, 92)));
  assert.ok(first.weeks.some(w => Object.values(w.scheduleTable)
    .some(s => s.oldMember?.role === 'new' || s.newMember?.role === 'old')));
});

const availabilityModes = [
  { peoplePerShift: 2 },
  { peoplePerShift: 1 },
  { peoplePerShift: 1, anyRole: true },
  { peoplePerShift: 2, anyRole: true },
  { peoplePerShift: 1, schedulingMode: 'random' },
  { peoplePerShift: 2, schedulingMode: 'random' },
  { peoplePerShift: 1, schedulingMode: 'new-first' }
];

runTest('Mọi chế độ: tuần null hoặc thiếu từ Firebase là 0 ca, không lấy ca T4_S của tuần khác', () => {
  for (const weekly of [{ 1: null, 2: ['T4_S'], 4: null }, [null, null, ['T4_S']]]) {
    const students = ['old', 'new'].map(role => ({
      id: `sparse_${role}`, role, availableShifts: ['T4_S'], monthlyAvailableShifts: weekly
    }));
    const before = JSON.stringify(students);
    for (const options of availabilityModes) {
      const result = runMonthSchedule(students, 2026, 11, options);
      result.weeks.forEach((week, i) => {
        const assigned = Object.values(week.scheduleTable)
          .flatMap(slot => [slot.oldMember, slot.newMember, slot.thirdMember].filter(Boolean));
        if (i === 1) assert.ok(assigned.length > 0, 'Tuần 2 có đăng ký T4_S vẫn phải được xếp');
        else assert.strictEqual(assigned.length, 0, `Tuần ${i + 1} không đăng ký nhưng bị xếp; ${JSON.stringify(options)}`);
      });
    }
    assert.strictEqual(JSON.stringify(students), before, 'Không sửa dữ liệu đăng ký đầu vào');
  }
});

runTest('Mọi chế độ: cấu trúc tuần rỗng/null không được dùng danh sách gộp còn sót', () => {
  for (const weekly of [{}, [], { 1: null, 2: null, 3: null, 4: null }]) {
    const students = ['old', 'new'].map(role => ({
      id: `empty_${role}`, role, availableShifts: ['T4_S'], monthlyAvailableShifts: weekly
    }));
    for (const options of availabilityModes) {
      const result = runMonthSchedule(students, 2026, 11, options);
      assert.strictEqual(result.uniqueAssignedCount, 0, JSON.stringify(options));
    }
  }
});

runTest('Dữ liệu cũ chưa có cấu trúc tuần vẫn dùng availableShifts, không xếp ngoài ca đã khai', () => {
  const students = ['old', 'new'].map(role => ({ id: `legacy_${role}`, role, availableShifts: ['T4_C'] }));
  for (const options of availabilityModes) {
    const result = runMonthSchedule(students, 2026, 11, options);
    result.weeks.forEach(week => {
      assert.ok(week.scheduleTable.T4_C.oldMember || week.scheduleTable.T4_C.newMember);
      assert.strictEqual(week.scheduleTable.T4_S.oldMember, null);
      assert.strictEqual(week.scheduleTable.T4_S.newMember, null);
    });
  }
});

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}

