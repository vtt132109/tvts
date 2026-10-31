const allShifts = ['T2_S', 'T2_C', 'T3_S', 'T3_C', 'T4_S', 'T4_C', 'T5_S', 'T5_C', 'T6_S', 'T6_C'];
const dayName = { T2: 'Thứ 2', T3: 'Thứ 3', T4: 'Thứ 4', T5: 'Thứ 5', T6: 'Thứ 6' };

const students = [
  ['s_1', '2102001', 'Nguyễn Văn An'],
  ['s_2', '2211005', 'Trần Thị Bình'],
  ['s_3', '2311007', 'Lê Văn Cường'],
  ['s_4', '2412703', 'Phạm Minh Duy'],
  ['s_5', '2516139', 'Vũ Hoàng Lan'],
  ['s_6', '2614458', 'Đặng Tuấn Anh']
].map(([id, studentId, fullName]) => ({
  id,
  studentId,
  fullName,
  role: 'new',
  availableShifts: allShifts,
  monthlyAvailableShifts: { 1: allShifts, 2: allShifts, 3: allShifts, 4: allShifts }
}));

function shiftInfo(id) {
  const [day, period] = id.split('_');
  return {
    id,
    dayKey: day,
    dayName: dayName[day],
    period: period === 'S' ? 'Sáng' : 'Chiều',
    time: period === 'S' ? '07:30 - 11:30' : '13:00 - 16:30'
  };
}

function makeSchedule() {
  const weeks = [];
  for (let w = 1; w <= 4; w++) {
    const table = {};
    allShifts.forEach((id, idx) => {
      const capacity = (idx === 0 || idx === 6) ? 1 : 2;
      const oldMember = students[(idx + w) % students.length];
      const newMember = capacity === 2 ? students[(idx + w + 2) % students.length] : null;
      table[id] = {
        shiftId: id,
        shiftInfo: shiftInfo(id),
        capacity,
        oldMember,
        newMember,
        thirdMember: null,
        status: 'full'
      };
    });
    weeks.push({ weekNumber: w, month: 10, year: 2026, scheduleTable: table, summary: {}, studentStats: {} });
  }
  return { month: 10, year: 2026, weeks, timestamp: Date.now() };
}

const schedule = makeSchedule();
const admin = { id: 'e2e_admin', username: 'admin', fullName: 'Ban Điều Hành', role: 'admin' };
const cloudDisabled = {
  enabled: false,
  provider: 'firebase',
  databaseUrl: 'https://disabled.invalid',
  apiKey: '',
  autoSync: false
};

const adminLocal = {
  ts_scheduler_students: JSON.stringify(students),
  ts_scheduler_active_month_v1: JSON.stringify({ month: 10, year: 2026 }),
  ts_scheduler_availability_month_v1: '2026-10',
  ts_scheduler_shift_capacity_v1: JSON.stringify({ '2026-10': { peoplePerShift: 2 } }),
  ts_scheduler_month_result: JSON.stringify(schedule),
  ts_scheduler_two_week_result: JSON.stringify(schedule),
  ts_scheduler_manual_slots: JSON.stringify({}),
  ts_scheduler_cloud_config: JSON.stringify(Object.assign({}, cloudDisabled, { role: 'admin' })),
  ts_scheduler_admin_users: JSON.stringify([admin])
};

const adminSession = {
  ts_admin_authenticated: 'true',
  ts_admin_user_data: JSON.stringify(admin)
};

const studentLocal = {
  ts_scheduler_students: JSON.stringify(students),
  ts_scheduler_active_month_v1: JSON.stringify({ month: 10, year: 2026 }),
  ts_scheduler_month_result: JSON.stringify(schedule),
  ts_scheduler_cloud_config: JSON.stringify(Object.assign({}, cloudDisabled, { role: 'student' }))
};

const pendingClaim = {
  mssv: '2999999',
  fullName: 'Người Mới Chờ Duyệt',
  monthKey: '2026-10',
  shifts: { 1: ['T2_S'], 2: [], 3: [], 4: [] },
  availableShifts: ['T2_S'],
  submittedAt: '2026-10-30T10:00:00.000Z',
  uid: 'e2e-anon'
};

module.exports = {
  allShifts,
  students,
  schedule,
  adminLocal,
  adminSession,
  studentLocal,
  pendingClaim
};
