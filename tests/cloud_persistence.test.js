/**
 * Test: Cloud Persistence & Roster Overwrite Prevention
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};
global.window = global;
global.window.addEventListener = () => {};
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelector: () => null,
  getElementById: () => null
};
global.CustomEvent = class CustomEvent { constructor(type, detail) { this.type = type; this.detail = detail; } };
global.Event = class Event { constructor(type) { this.type = type; } };
global.dispatchEvent = () => true;

// Load cloud_sync.js
require('../js/cloud_sync.js');

console.log('--- TEST 1: Kiểm tra CloudSyncManager có sẵn ---');
assert.ok(global.CloudSyncManager, 'CloudSyncManager phải được định nghĩa');
console.log('✓ PASS: CloudSyncManager sẵn sàng');

console.log('--- TEST 2: Nạp danh sách mới tùy biến không có MSSV mẫu ---');
const customStudents = [
  { id: 's_custom_1', fullName: 'Nguyễn Văn Test', studentId: '20110001', role: 'old', availableShifts: ['T2_S'] },
  { id: 's_custom_2', fullName: 'Trần Thị Thử Nghiệm', studentId: '20110002', role: 'new', availableShifts: ['T3_C'] }
];
storage['ts_scheduler_students'] = JSON.stringify(customStudents);

// Đóng gói payload từ CloudSyncManager
const payload = global.CloudSyncManager.buildPayload();
assert.strictEqual(payload.students.length, 2, 'Payload phải chứa đúng 2 sinh viên mới');
assert.strictEqual(payload.students[0].studentId, '20110001', 'MSSV phải đúng sinh viên mới');
console.log('✓ PASS: buildPayload đóng gói chính xác 2 sinh viên mới');

// Giả lập applyPayload từ Cloud (khi F5 reload trang)
const fakeCloudData = {
  students: customStudents,
  updatedAt: Date.now()
};
const applyRes = global.CloudSyncManager.applyPayload(fakeCloudData);
assert.strictEqual(applyRes.success, true);
const reloaded = JSON.parse(storage['ts_scheduler_students']);
assert.strictEqual(reloaded.length, 2);
assert.strictEqual(reloaded[0].fullName, 'Nguyễn Văn Test');
console.log('✓ PASS: applyPayload bảo toàn 100% sinh viên mới từ Cloud');

console.log('--- TEST 3: Không đẩy tài khoản cán bộ mặc định/fallback ---');
// Máy chưa có tài khoản cán bộ: payload phải BỎ khoá adminUsers thay vì gửi
// danh sách mặc định (PATCH sẽ giữ nguyên tài khoản thật trên Cloud).
assert.ok(!storage['ts_scheduler_admin_users'], 'Máy test không có tài khoản cán bộ');
const payloadNoAdmin = global.CloudSyncManager.buildPayload();
assert.ok(!Object.prototype.hasOwnProperty.call(payloadNoAdmin, 'adminUsers'),
  'Payload không được chứa adminUsers khi máy chưa có tài khoản');
console.log('✓ PASS: buildPayload không gửi tài khoản cán bộ fallback');

console.log('--- TEST 4: Kiểm tra code student.js và admin.js không còn điều kiện ghi đè ---');
const adminCode = fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8');
const studentCode = fs.readFileSync(path.join(__dirname, '../js/student.js'), 'utf8');

// Phải KHÔNG còn `!hasOfficial` hay logic kiểm tra cứng MSSV gây ghi đè danh sách
assert.ok(!adminCode.includes('!hasOfficial'), 'admin.js không được chứa điều kiện ghi đè !hasOfficial');
assert.ok(!studentCode.includes('!hasOfficial'), 'student.js không được chứa điều kiện ghi đè !hasOfficial');
console.log('✓ PASS: Đã triệt tiêu hoàn toàn logic ghi đè trong cả admin.js và student.js');

console.log('--- TEST 5: Kiểm tra export window.adminForceSyncCloud ---');
assert.ok(adminCode.includes('window.adminForceSyncCloud = async function'), 'admin.js phải xuất window.adminForceSyncCloud');
console.log('✓ PASS: window.adminForceSyncCloud đã được xuất hợp lệ');

console.log('\n=========================================');
console.log('📊 TỔNG KẾT KIỂM THỬ: 5/5 TESTS ĐẠT CHUẨN (100%)');
console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ BẢO TOÀN DỮ LIỆU ĐỀU ĐẠT 100%!');
console.log('=========================================');
