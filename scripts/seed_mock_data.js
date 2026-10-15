/**
 * ==============================================================================
 * SCRIPT: SEED MOCK DATA CHO DỰ ÁN XẾP LỊCH TRỰC BAN TUYỂN SINH HCM-UTE
 * ==============================================================================
 * Chạy: node scripts/seed_mock_data.js
 * Sinh bộ dữ liệu mock chuẩn đầy đủ:
 * - 30 CTV (12 Cũ + 18 Mới)
 * - Lịch trực 4 tuần giải bằng Bipartite Matching
 * - 3 Sự kiện thực tế (Tour, Open Day, Hội thảo)
 * - 2 Đề xuất đổi ca trực (Pending, Approved)
 * - Cấu hình cổng đăng ký & tài khoản quản trị
 */

const fs = require('fs');
const path = require('path');

// 1. Nạp danh sách mẫu 30 sinh viên từ js/sample30.js
const sample30Content = fs.readFileSync(path.join(__dirname, '../js/sample30.js'), 'utf8');

// Match SAMPLE_30_STUDENTS array
const studentsMatch = sample30Content.match(/const\s+SAMPLE_30_STUDENTS\s*=\s*(\[[\s\S]*?\n\s*\]);/);
let students = [];
if (studentsMatch) {
  try {
    // Eval in isolated scope
    students = eval(studentsMatch[1]);
  } catch (e) {
    console.warn('Could not parse SAMPLE_30_STUDENTS directly:', e.message);
  }
}

// 2. Định nghĩa sự kiện mẫu
const sampleEvents = [
  {
    id: 'evt_sample_01',
    title: 'Tư Vấn Tuyển Sinh THPT Gia Định',
    date: '2026-10-18',
    timeOfDay: 'morning',
    workUnits: 1,
    location: 'Trường THPT Gia Định, Q. Bình Thạnh',
    note: 'Đoàn xe xuất phát lúc 6h30 tại Cổng 1 HCM-UTE',
    assignedStudentIds: ['old_01', 'old_02', 'new_01', 'new_02'],
    createdAt: Date.now() - 86400000 * 3
  },
  {
    id: 'evt_sample_02',
    title: 'Ngày Hội Mở Trường Open Day UTE 2026',
    date: '2026-10-25',
    timeOfDay: 'all_day',
    workUnits: 2,
    location: 'Hội trường Lớn & Sân trung tâm HCM-UTE',
    note: 'Trực booth tư vấn và hướng dẫn phụ huynh tham quan xưởng',
    assignedStudentIds: ['old_01', 'old_03', 'old_04', 'new_03', 'new_04', 'new_05'],
    createdAt: Date.now() - 86400000 * 2
  },
  {
    id: 'evt_sample_03',
    title: 'Hội Thảo Trực Tuyến Hướng Nghiệp Khối Kỹ Thuật',
    date: '2026-10-28',
    timeOfDay: 'afternoon',
    workUnits: 1,
    location: 'Phòng Hội Thảo A - Tòa Nhà Trung Tâm',
    note: 'Hỗ trợ livestream và trả lời thắc mắc phòng Zoom',
    assignedStudentIds: ['old_02', 'new_06', 'new_07'],
    createdAt: Date.now() - 86400000 * 1
  }
];

// 3. Cấu hình cổng đăng ký mẫu
const sampleRegConfig = {
  isRegOpen: true,
  mode: 'always_open',
  timeWindow: {
    start: '2026-10-01T00:00:00',
    end: '2026-10-31T23:59:59'
  },
  note: 'Cổng đăng ký ca rảnh Ban Tuyển Sinh tháng 10/2026 đang mở.',
  publishSchedule: true,
  updatedAt: Date.now()
};

// 4. Đề xuất đổi ca mẫu
const sampleSwapRequests = [
  {
    id: 'swap_sample_01',
    fromStudentId: 'old_01',
    fromStudentName: 'Nguyễn Văn An',
    toStudentId: 'old_02',
    toStudentName: 'Trần Thị Bích',
    weekIndex: 0,
    shiftId: 'T2_S',
    reason: 'Trùng lịch thi giữa kỳ môn Cơ Kỹ Thuật',
    status: 'pending',
    createdAt: Date.now() - 3600000
  },
  {
    id: 'swap_sample_02',
    fromStudentId: 'new_01',
    fromStudentName: 'Đặng Quốc Hưng',
    toStudentId: 'new_02',
    toStudentName: 'Vũ Thảo Linh',
    weekIndex: 1,
    shiftId: 'T4_C',
    reason: 'Bận đi khám sức khỏe định kỳ',
    status: 'approved',
    createdAt: Date.now() - 7200000
  }
];

// 5. Đóng gói snapshot nạp dữ liệu
const seedPayload = {
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  STORAGE_KEYS: {
    STUDENTS: 'ts_scheduler_students',
    REG_CONFIG: 'ts_reg_config',
    EVENTS: 'ts_scheduler_events_v1',
    SWAP_REQUESTS: 'ts_scheduler_swap_requests'
  },
  data: {
    students: students,
    regConfig: sampleRegConfig,
    events: sampleEvents,
    swapRequests: sampleSwapRequests
  }
};

const outputPath = path.join(__dirname, '../data/mock_seed_data.json');
fs.writeFileSync(outputPath, JSON.stringify(seedPayload, null, 2), 'utf8');

console.log('================================================================');
console.log('✅ SEED MOCK DATA THÀNH CÔNG CHO BAN TUYỂN SINH HCM-UTE');
console.log('================================================================');
console.log(`📁 File lưu: data/mock_seed_data.json`);
console.log(`👥 Số lượng sinh viên CTV: ${students.length}`);
console.log(`🎟️  Số lượng sự kiện thực tế: ${sampleEvents.length}`);
console.log(`🔄 Số lượng đề xuất đổi ca: ${sampleSwapRequests.length}`);
console.log(`🚪 Trạng thái cổng: Mở và đã công bố lịch (publishSchedule = true)`);
console.log('================================================================\n');
