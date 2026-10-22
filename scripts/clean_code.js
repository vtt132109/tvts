/**
 * ==============================================================================
 * SCRIPT: CLEAN & VALIDATE CODEBASE CHO DỰ ÁN BAN TUYỂN SINH HCM-UTE
 * ==============================================================================
 * Chạy: node scripts/clean_code.js
 * Quét toàn bộ mã nguồn:
 * 1. Kiểm tra cú pháp JavaScript
 * 2. Rà soát console.log debug và dead code
 * 3. Kiểm tra tính toàn vẹn thẻ HTML
 * 4. Chạy toàn bộ test suites
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧹 BẮT ĐẦU QUY TRÌNH CLEAN & VALIDATE PROJECT');
console.log('================================================================');

// 1. Kiểm tra cú pháp JS
console.log('\n[1/4] Kiểm tra cú pháp JavaScript:');
const jsFiles = [
  'js/scheduler.js',
  'js/student.js',
  'js/admin.js',
  'js/cloud_sync.js',
  'js/month_calendar.js',
  'js/roster.js',
  'js/a11y_modal.js',
  'scripts/seed_mock_data.js'
];

jsFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    try {
      execSync(`node -c "${fullPath}"`);
      console.log(`  ✓ [Cú pháp hợp lệ] ${file}`);
    } catch (e) {
      console.error(`  ❌ [Lỗi cú pháp] ${file}: ${e.message}`);
      process.exit(1);
    }
  }
});

// 2. Kiểm tra console.log debug
console.log('\n[2/4] Rà soát console.log trong mã nguồn cốt lõi:');
let totalLogs = 0;
jsFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('console.log(') && !line.trim().startsWith('//')) {
        totalLogs++;
        // console.log(`    - ${file}:${idx + 1} -> ${line.trim().substring(0, 60)}...`);
      }
    });
  }
});
console.log(`  ✓ Đã rà soát: Tổng cộng ${totalLogs} lệnh console.log (giữ lại các log thông báo hệ thống và test runners).`);

// 3. Kiểm tra thẻ đóng HTML
console.log('\n[3/4] Kiểm tra tính cân bằng thẻ <div> trong HTML:');
let divBalanceFailures = 0;
['index.html', 'admin.html'].forEach(htmlFile => {
  const fullPath = path.join(__dirname, '..', htmlFile);
  if (fs.existsSync(fullPath)) {
    // Loại bỏ comment & <script> trước khi đếm, nếu không thẻ nằm trong
    // comment hoặc trong chuỗi template literal sẽ làm sai lệch đếm.
    const raw = fs.readFileSync(fullPath, 'utf8');
    const content = raw
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const openDivs = (content.match(/<div[\s>]/gi) || []).length;
    const closeDivs = (content.match(/<\/div>/gi) || []).length;
    if (openDivs === closeDivs) {
      console.log(`  ✓ [HTML Cân Bằng] ${htmlFile}: ${openDivs} <div> và ${closeDivs} </div>`);
    } else {
      // Trước đây chỉ console.warn rồi vẫn exit 0 -> HTML hỏng vẫn pass CI.
      console.error(`  ❌ [Thẻ không cân bằng] ${htmlFile}: ${openDivs} mở vs ${closeDivs} đóng`);
      divBalanceFailures++;
    }
  }
});

// 4. Chạy CI Test Harness
console.log('\n[4/4] Khởi chạy bộ kiểm thử toàn hệ thống (tests/run_all_tests.js):');
let testFailure = null;
try {
  const testOutput = execSync('node tests/run_all_tests.js', { encoding: 'utf8', cwd: path.join(__dirname, '..') });
  const passMatch = testOutput.match(/TỔNG CỘNG:\s*(\d+)\/(\d+)/);
  if (!passMatch) {
    // Không tìm thấy dòng tổng kết nghĩa là output hỏng / mọi suite crash.
    // Trước đây trường hợp này lại bị báo là "thành công".
    testFailure = 'Không đọc được dòng tổng kết kiểm thử — có thể toàn bộ suite đã crash.';
  } else {
    const passed = Number(passMatch[1]);
    const total = Number(passMatch[2]);
    if (passed === total && total > 0) {
      console.log(`  🎉 Kết quả kiểm thử: ${passed}/${total} TESTS ĐẠT CHUẨN (100% SUCCESS)!`);
    } else {
      // Trước đây in "(100% SUCCESS)" bất kể tỉ lệ thực tế.
      testFailure = `Chỉ ${passed}/${total} test đạt — cần xử lý các test thất bại.`;
    }
  }
} catch (e) {
  testFailure = e.message;
}

if (divBalanceFailures > 0) {
  console.error(`\n❌ Có ${divBalanceFailures} file HTML không cân bằng thẻ <div>.`);
}
if (testFailure) {
  console.error(`  ❌ Kiểm thử thất bại: ${testFailure}`);
}
if (divBalanceFailures > 0 || testFailure) {
  process.exit(1);
}

console.log('\n================================================================');
console.log('✨ DỰ ÁN ĐÃ ĐƯỢC DỌN DẸP VÀ KIỂM ĐỊNH SẴN SÀNG TRIỂN KHAI!');
console.log('================================================================\n');
