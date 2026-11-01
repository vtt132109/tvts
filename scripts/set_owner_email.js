#!/usr/bin/env node
/**
 * Đổi email chủ sở hữu trong database.rules.json ở TẤT CẢ các chỗ cùng lúc.
 *
 * Firebase Rules không có biến/hàm dùng chung, nên email phải được ghi cứng ở
 * nhiều điều khoản. Sửa tay dễ bỏ sót một chỗ -> quyền lệch giữa các nhánh.
 *
 * Dùng:  node scripts/set_owner_email.js email.moi@gmail.com
 * Kiểm tra: node tests/run_all_tests.js (mục 12.21 canh mọi chỗ phải giống nhau)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'database.rules.json');
const next = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(next)) {
  console.error('Cần truyền một email hợp lệ: node scripts/set_owner_email.js <email>');
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const pattern = /(auth\.token\.email\.toLowerCase\(\) === ')([^']+)(')/g;
const found = new Set();
let count = 0;
const out = text.replace(pattern, (m, a, email, c) => {
  found.add(email);
  count++;
  return a + next + c;
});
if (count === 0) {
  console.error('Không tìm thấy điều kiện email chủ sở hữu trong Rules.');
  process.exit(1);
}
JSON.parse(out); // không ghi file hỏng
fs.writeFileSync(file, out);
console.log(`Đã đổi ${count} chỗ (email cũ: ${[...found].join(', ')}) -> ${next}`);
console.log('Nhớ Publish database.rules.json trong Firebase Console.');
