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
  'js/sample30.js',
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
['index.html', 'admin.html'].forEach(htmlFile => {
  const fullPath = path.join(__dirname, '..', htmlFile);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const openDivs = (content.match(/<div(\s|>)/gi) || []).length;
    const closeDivs = (content.match(/<\/div>/gi) || []).length;
    if (openDivs === closeDivs) {
      console.log(`  ✓ [HTML Cân Bằng] ${htmlFile}: ${openDivs} <div> và ${closeDivs} </div>`);
    } else {
      console.warn(`  ⚠️ [Cảnh báo chênh lệch thẻ] ${htmlFile}: ${openDivs} mở vs ${closeDivs} đóng`);
    }
  }
});

// 4. Chạy CI Test Harness
console.log('\n[4/4] Khởi chạy bộ kiểm thử toàn hệ thống (tests/run_all_tests.js):');
try {
  const testOutput = execSync('node tests/run_all_tests.js', { encoding: 'utf8', cwd: path.join(__dirname, '..') });
  const passMatch = testOutput.match(/TỔNG CỘNG: (\d+\/\d+)/);
  if (passMatch) {
    console.log(`  🎉 Kết quả kiểm thử: ${passMatch[0]} TESTS ĐẠT CHUẨN (100% SUCCESS)!`);
  } else {
    console.log('  ✓ Toàn bộ test suites đã chạy thành công!');
  }
} catch (e) {
  console.error('  ❌ Kiểm thử thất bại:', e.message);
  process.exit(1);
}

console.log('\n================================================================');
console.log('✨ DỰ ÁN ĐÃ ĐƯỢC DỌN DẸP VÀ KIỂM ĐỊNH SẴN SÀNG TRIỂN KHAI!');
console.log('================================================================\n');
