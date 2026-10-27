/**
 * ==========================================================================
 * MASTER TEST RUNNER - HỆ THỐNG BAN TUYỂN SINH HCM-UTE
 * ==========================================================================
 * Thực thi tuần tự toàn bộ các bộ kiểm thử tự động của hệ thống:
 * 1. Thuật toán xếp ca Bipartite Matching & Luân phiên 4 tuần (Scheduler)
 * 2. Xác thực cán bộ, mã PIN & Bảo mật XSS escapeHtml (Auth & Security)
 * 3. Đóng/mở cổng, cờ publishSchedule & Tra cứu MSSV (Portal Visibility & Lookup)
 * 4. Quản lý sao lưu web 6 tháng & Auto-Pruning (Web Backup Manager)
 * 5. Hồi quy: khóa lại các bug đã phát hiện & sửa
 *    (tháng động, XSS toast, cloud sync event, payload, bảo mật)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  { name: 'Thuật Toán Xếp Ca & Luân Phiên (Scheduler Engine)', script: 'scheduler.test.js' },
  { name: 'Xác Thực, Phân Quyền & Bảo Mật XSS (Auth & Security)', script: 'auth.test.js' },
  { name: 'Cổng Sinh Viên: Đóng/Mở & Tra Cứu MSSV (Portal Visibility & Lookup)', script: 'portal.test.js' },
  { name: 'Lịch Sử Ca Trực Cá Nhân Nhiều Tháng (Student Shift History)', script: 'shift_history.test.js' },
  { name: 'Nhật Ký Thao Tác Quản Trị (Admin Audit Log)', script: 'audit.test.js' },
  { name: 'Lớp Lưu Trữ IndexedDB & Khôi Phục Dữ Liệu (IndexedDB Store)', script: 'store.test.js' },
  { name: 'Tiện Ích Dùng Chung & Chống Lệch Module (Common Utils)', script: 'common.test.js' },
  { name: 'Gán Ca Thủ Công & Xếp Tự Động Phải Né (Manual Assignment)', script: 'manual_assignment.test.js' },
  { name: 'Quản Lý Sao Lưu Web 6 Tháng (Web Backup Manager)', script: 'backup.test.js' },
  { name: 'Quản Lý Sự Kiện & Bảng Chấm Công Tháng (Payroll & Events)', script: 'payroll_events.test.js' },
  { name: 'Đăng Ký Ca Rảnh Trọn Tháng & Hiển Thị Ngày (Monthly Registration)', script: 'monthly_registration.test.js' },
  { name: 'Đồng Bộ Đám Mây Đa Thiết Bị & Khắc Phục Tab Ẩn Danh (Cloud Sync Engine)', script: 'cloud_sync.test.js' },
  { name: 'Xác Thực MSSV Nghiêm Ngặt & Bảo Toàn Danh Sách 30 CTV (Strict MSSV Validation)', script: 'student_strict_validation.test.js' },
  { name: 'Lưu Trữ Đám Mây & Chống Ghi Đè Dữ Liệu Khi Tải Lại Trang (Cloud Persistence & Anti-Overwrite)', script: 'cloud_persistence.test.js' },
  { name: 'Điều Hướng Tháng, Hiển Thị Ngày & Tự Động Sao Lưu (Admin Month Navigation & Auto-Backup)', script: 'admin_month_navigation.test.js' },
  { name: 'Đồng Bộ Tài Khoản Cán Bộ Giữa Hai Máy (Credential Sync E2E)', script: 'credential_sync_e2e.test.js' },
  { name: 'Nhập CSV, Trùng MSSV & Cảnh Báo Vai Trò (CSV Import Validation)', script: 'csv_import.test.js' },
  { name: 'Cổng Sinh Viên: Năm Tuần 4, Lịch Tháng Trước & A11y Modal (Portal Bug Guards)', script: 'student_portal_bugs.test.js' },
  { name: 'Hồi Quy: Chống Tái Phát Các Bug Đã Sửa (Regression Guard)', script: 'regression_guard.test.js' }
];

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║   KIỂM THỬ TOÀN DIỆN DỰ ÁN - BAN TUYỂN SINH HCM-UTE (CI HARNESS) ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

let allPassed = true;
let grandTotalTests = 0;
let grandPassedTests = 0;
const suiteResults = [];

suites.forEach((suite, idx) => {
  console.log(`\n▶ [SUITE ${idx + 1}/${suites.length}] Đang chạy: ${suite.name}...`);
  const scriptPath = path.resolve(__dirname, suite.script);
  const result = spawnSync('node', [scriptPath], { encoding: 'utf8' });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  const match = result.stdout ? result.stdout.match(/(\d+)\/(\d+) TESTS ĐẠT CHUẨN/) : null;
  const passed = match ? parseInt(match[1], 10) : 0;
  const total = match ? parseInt(match[2], 10) : 0;
  grandPassedTests += passed;
  grandTotalTests += total;

  const isSuccess = result.status === 0;
  if (!isSuccess) {
    allPassed = false;
    console.error(`\n❌ SUITE THẤT BẠI: ${suite.name}`);
  }

  suiteResults.push({
    name: suite.name,
    script: suite.script,
    passed,
    total,
    status: isSuccess ? 'PASSED' : 'FAILED'
  });
});

console.log('\n==================================================================');
console.log('📋 BẢNG TỔNG HỢP KIỂM THỬ TOÀN HỆ THỐNG');
console.log('==================================================================');
suiteResults.forEach((s, i) => {
  const icon = s.status === 'PASSED' ? '✓' : '✗';
  console.log(`  ${icon} [Suite ${i + 1}] ${s.name}: ${s.passed}/${s.total} PASS (${s.status})`);
});
console.log('------------------------------------------------------------------');
console.log(`🏆 TỔNG CỘNG: ${grandPassedTests}/${grandTotalTests} TESTS ĐẠT CHUẨN (${Math.round((grandPassedTests / (grandTotalTests || 1)) * 100)}%)`);
console.log('==================================================================');

if (allPassed) {
  console.log('🎉 TẤT CẢ CÁC BỘ TEST ĐỀU ĐẠT CHUẨN (100% SUCCESS) - SẴN SÀNG TRIỂN KHAI!');
  console.log('==================================================================\n');
  process.exit(0);
} else {
  console.error('⚠️ CÓ TEST THẤT BẠI - VUI LÒNG KIỂM TRA LẠI MÃ NGUỒN!');
  console.log('==================================================================\n');
  process.exit(1);
}
