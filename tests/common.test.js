/**
 * ============================================================================
 * AUTOMATED TEST SUITE: #16 — TIỆN ÍCH DÙNG CHUNG (js/common.js)
 * ============================================================================
 * Bảo vệ việc tách module:
 * 1. formatVNDateTime / getRemainingText chỉ còn MỘT định nghĩa.
 * 2. Hành vi của chúng đúng như bản cũ (không đổi định dạng hiển thị).
 * 3. escapeHtml vẫn nằm trong từng file (bộ test XSS đọc trực tiếp thân hàm)
 *    — nhưng phải GIỐNG HỆT NHAU giữa hai cổng.
 * 4. Thứ tự nạp script trong HTML đúng.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Môi trường tối thiểu ----------------------------------------------------
global.window = global.window || {};
eval(fs.readFileSync(path.resolve(__dirname, '../js/common.js'), 'utf8'));

const CU = global.window.CommonUtils;
assert.ok(CU, 'js/common.js phải export window.CommonUtils');

const adminSrc = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');
const studentSrc = fs.readFileSync(path.resolve(__dirname, '../js/student.js'), 'utf8');
const adminHtml = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// 2. Test runner ------------------------------------------------------------
let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}: ${err.message}`);
    console.error(err.stack);
  }
}

/** Chạy fn với Date.now() bị đóng băng để kết quả không lệch theo thời gian thực. */
function withFrozenNow(frozenMs, fn) {
  const original = Date.now;
  Date.now = () => frozenMs;
  try {
    return fn();
  } finally {
    Date.now = original;
  }
}

/** Lấy thân hàm `function <name>(...) { ... }` trong mã nguồn. */
function extractFunction(src, name) {
  const pattern = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`);
  const match = pattern.exec(src);
  return match ? match[0] : null;
}

console.log('================================================================');
console.log('🧩 BẮT ĐẦU KIỂM THỬ - TIỆN ÍCH DÙNG CHUNG (#16)');
console.log('================================================================\n');

// ============================================================================
// GROUP 1: MỘT ĐỊNH NGHĨA DUY NHẤT
// ============================================================================
runTest('Tách module: admin.js không còn định nghĩa lại formatVNDateTime', () => {
  const body = extractFunction(adminSrc, 'formatVNDateTime');
  assert.ok(body, 'admin.js phải còn hàm formatVNDateTime (dạng uỷ thác)');
  assert.ok(body.includes('window.CommonUtils.formatVNDateTime'),
    'admin.js phải uỷ thác cho CommonUtils, thay vì tự định nghĩa lại');
  assert.ok(!body.includes('ngày ${day}'),
    'Không được còn bản sao phần định dạng ngày trong admin.js');
});

runTest('Tách module: student.js không còn định nghĩa lại formatVNDateTime', () => {
  const body = extractFunction(studentSrc, 'formatVNDateTime');
  assert.ok(body, 'student.js phải còn hàm formatVNDateTime (dạng uỷ thác)');
  assert.ok(body.includes('window.CommonUtils.formatVNDateTime'));
  assert.ok(!body.includes('ngày ${day}'));
});

runTest('Tách module: admin.js và student.js uỷ thác getRemainingText', () => {
  ['adminSrc', 'studentSrc'].forEach(name => {
    const src = name === 'adminSrc' ? adminSrc : studentSrc;
    const body = extractFunction(src, 'getRemainingText');
    assert.ok(body, `${name} phải còn hàm getRemainingText`);
    assert.ok(body.includes('window.CommonUtils.getRemainingText'),
      `${name} phải uỷ thác cho CommonUtils`);
    assert.ok(!body.includes('Còn ${days}'), `${name} không được giữ bản sao`);
  });
});

// ============================================================================
// GROUP 2: HÀNH VI KHÔNG ĐỔI SO VỚI BẢN CŨ
// ============================================================================
runTest('formatVNDateTime: rỗng/không hợp lệ/đúng định dạng như bản cũ', () => {
  assert.strictEqual(CU.formatVNDateTime(''), '');
  assert.strictEqual(CU.formatVNDateTime(null), '');
  assert.strictEqual(CU.formatVNDateTime(undefined), '');
  assert.strictEqual(CU.formatVNDateTime('không phải ngày'), 'không phải ngày');

  const sample = new Date(2026, 9, 24, 14, 30, 0); // 24/10/2026 14:30 giờ máy
  assert.strictEqual(CU.formatVNDateTime(sample.toISOString()), '14:30 ngày 24/10/2026');
});

runTest('formatVNDateTime: giữ số 0 ở đầu cho giờ/phút/ngày/tháng', () => {
  const sample = new Date(2026, 0, 5, 8, 7, 0); // 05/01/2026 08:07
  assert.strictEqual(CU.formatVNDateTime(sample.toISOString()), '08:07 ngày 05/01/2026');
});

runTest('getRemainingText: mốc đã qua hoặc không hợp lệ -> "Đã hết hạn"', () => {
  const now = Date.now();
  withFrozenNow(now, () => {
    assert.strictEqual(CU.getRemainingText(now - 1000), 'Đã hết hạn');
    assert.strictEqual(CU.getRemainingText(now), 'Đã hết hạn');
    assert.strictEqual(CU.getRemainingText('không phải ngày'), 'Đã hết hạn');
  });
});

runTest('getRemainingText: còn trong ngày -> "Còn X giờ Y phút"', () => {
  const now = Date.now();
  withFrozenNow(now, () => {
    const target = now + (5 * 3600 + 20 * 60) * 1000;
    assert.strictEqual(CU.getRemainingText(target), 'Còn 5 giờ 20 phút');
  });
});

runTest('getRemainingText: còn nhiều ngày -> "Còn X ngày Y giờ"', () => {
  const now = Date.now();
  withFrozenNow(now, () => {
    const target = now + (2 * 24 + 3) * 3600 * 1000;
    assert.strictEqual(CU.getRemainingText(target), 'Còn 2 ngày 3 giờ');
  });
});

// ============================================================================
// GROUP 3: CHỐNG LỆCH GIỮA HAI BẢN escapeHtml
// ============================================================================
runTest('Chống lệch: escapeHtml trong admin.js và student.js phải GIỐNG HỆT nhau', () => {
  const adminEscape = extractFunction(adminSrc, 'escapeHtml');
  const studentEscape = extractFunction(studentSrc, 'escapeHtml');

  assert.ok(adminEscape, 'Thiếu escapeHtml trong admin.js');
  assert.ok(studentEscape, 'Thiếu escapeHtml trong student.js');

  const normalize = code => code.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
  assert.strictEqual(normalize(adminEscape), normalize(studentEscape),
    'Hai bản escapeHtml đã lệch nhau — sửa XSS ở một nơi mà quên nơi kia!');
});

runTest('Chống lệch: escapeHtml vẫn nằm trong từng file (bộ test XSS đọc trực tiếp)', () => {
  // Nếu ai đó "tách" escapeHtml sang common.js, tests/auth.test.js sẽ chỉ còn
  // thấy hàm gọi lại và mất khả năng kiểm chứng đủ 5 thực thể.
  const entities = ['&amp;', '&lt;', '&gt;', '&quot;'];
  [
    { name: 'admin.js', src: adminSrc },
    { name: 'student.js', src: studentSrc }
  ].forEach(file => {
    const body = extractFunction(file.src, 'escapeHtml');
    entities.forEach(entity => {
      assert.ok(body.includes(entity), `${file.name}: escapeHtml thiếu ${entity}`);
    });
    // Dấu nháy đơn có thể viết &#39; hoặc &#039; — miễn là có escape.
    assert.ok(/&#0?39;/.test(body), `${file.name}: escapeHtml chưa escape dấu nháy đơn`);
  });
});

// ============================================================================
// GROUP 4: THỨ TỰ NẠP SCRIPT
// ============================================================================
runTest('Thứ tự nạp: common.js đứng trước admin.js trong admin.html', () => {
  const commonTag = /<script\s+src="js\/common\.js[^"]*"/.exec(adminHtml);
  const adminTag = /<script\s+src="js\/admin\.js[^"]*"/.exec(adminHtml);

  assert.ok(commonTag, 'admin.html phải nạp js/common.js');
  assert.ok(adminTag, 'admin.html phải nạp js/admin.js');
  assert.ok(commonTag.index < adminTag.index, 'common.js phải nạp trước admin.js');
});

runTest('Thứ tự nạp: common.js đứng trước student.js trong index.html', () => {
  const commonTag = /<script\s+src="js\/common\.js[^"]*"/.exec(indexHtml);
  const studentTag = /<script\s+src="js\/student\.js[^"]*"/.exec(indexHtml);

  assert.ok(commonTag, 'index.html phải nạp js/common.js');
  assert.ok(studentTag, 'index.html phải nạp js/student.js');
  assert.ok(commonTag.index < studentTag.index, 'common.js phải nạp trước student.js');
});

runTest('Cache-busting: mọi script nội bộ trong 2 trang dùng cùng một token ?v=', () => {
  const collect = html => (html.match(/<script\s+src="js\/[^"]*\.js\?v=([^"]+)"/g) || [])
    .map(tag => (/\?v=([^"]+)"/.exec(tag) || [])[1]);

  const adminTokens = new Set(collect(adminHtml));
  const indexTokens = new Set(collect(indexHtml));

  assert.ok(adminTokens.size > 0 && indexTokens.size > 0, 'Phải có token ?v= trên script nội bộ');
  assert.strictEqual(adminTokens.size, 1, 'admin.html dùng lẫn nhiều token: ' + [...adminTokens].join(', '));
  assert.strictEqual(indexTokens.size, 1, 'index.html dùng lẫn nhiều token: ' + [...indexTokens].join(', '));
  assert.deepStrictEqual([...adminTokens], [...indexTokens],
    'Hai trang phải dùng cùng token để tránh cache lệch phiên bản');
});

// ============================================================================
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / (totalTests || 1)) * 100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) process.exit(1);
