/**
 * ==========================================================================
 * MASTER TEST RUNNER - HỆ THỐNG BAN TUYỂN SINH HCM-UTE
 * ==========================================================================
 * Thực thi tuần tự toàn bộ các bộ kiểm thử tự động của hệ thống
 */

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  { name: 'Thuật Toán Xếp Ca & Luân Phiên (Scheduler Engine)', script: 'scheduler.test.js' },
  { name: 'Xác Thực & Phân Quyền Đăng Nhập (Auth & Security)', script: 'auth.test.js' }
];

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║   KIỂM THỬ TOÀN DIỆN DỰ ÁN - BAN TUYỂN SINH HCM-UTE (CI HARNESS) ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

let allPassed = true;

suites.forEach((suite, idx) => {
  console.log(`\n▶ [SUITE ${idx + 1}/${suites.length}] Đang chạy: ${suite.name}...`);
  const scriptPath = path.resolve(__dirname, suite.script);
  const result = spawnSync('node', [scriptPath], { stdio: 'inherit' });

  if (result.status !== 0) {
    allPassed = false;
    console.error(`\n❌ SUITE THẤT BẠI: ${suite.name}`);
  }
});

console.log('\n==================================================================');
if (allPassed) {
  console.log('🎉 TẤT CẢ CÁC BỘ TEST ĐỀU ĐẠT CHUẨN (100% SUCCESS) - SẴN SÀNG TRIỂN KHAI!');
  console.log('==================================================================\n');
  process.exit(0);
} else {
  console.error('⚠️ CÓ TEST THẤT BẠI - VUI LÒNG KIỂM TRA LẠI MÃ NGUỒN!');
  console.log('==================================================================\n');
  process.exit(1);
}
