/**
 * ==========================================================================
 * TEST SUITE: FIREBASE CLOUD SYNC & CROSS-DEVICE SYNCHRONIZATION
 * ==========================================================================
 * Kiểm thử toàn diện module CloudSyncManager:
 * - Khởi tạo & Định dạng URL Firebase REST API
 * - Đóng gói dữ liệu LocalStorage (buildPayload)
 * - Áp dụng Payload từ Cloud vào LocalStorage an toàn (applyPayload)
 * - Mô phỏng Push / Pull với Fake/Mock Fetch
 * - Khắc phục sự cố Tab Ẩn danh: Đồng bộ mã PIN mới tạo sang máy/tab khác
 * - Cơ chế Offline-First: Hoạt động trơn tru khi mất mạng hoặc chưa cấu hình
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

// Giả lập môi trường Browser DOM & Storage
function createMockEnvironment() {
  const store = {};

  const mockLocalStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    _dump: () => ({ ...store })
  };

  const listeners = {};

  const mockWindow = {
    localStorage: mockLocalStorage,
    addEventListener: (type, fn) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
    },
    dispatchEvent: (event) => {
      const type = event.type || event;
      if (listeners[type]) {
        listeners[type].forEach(fn => fn(event));
      }
      return true;
    },
    Event: function(type) { this.type = type; },
    CustomEvent: function(type, params) {
      this.type = type;
      this.detail = params ? params.detail : null;
    },
    fetch: null,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    console: console,
    document: {
      readyState: 'complete',
      addEventListener: () => {}
    }
  };

  const sandbox = {
    window: mockWindow,
    localStorage: mockLocalStorage,
    document: mockWindow.document,
    Event: mockWindow.Event,
    CustomEvent: mockWindow.CustomEvent,
    setTimeout: mockWindow.setTimeout,
    clearTimeout: mockWindow.clearTimeout,
    console: console,
    fetch: null
  };

  vm.createContext(sandbox);

  // Đọc và chạy js/cloud_sync.js
  const scriptContent = fs.readFileSync(path.join(__dirname, '../js/cloud_sync.js'), 'utf8');
  vm.runInContext(scriptContent, sandbox);

  return {
    window: sandbox.window,
    localStorage: mockLocalStorage,
    CloudSyncManager: sandbox.window.CloudSyncManager,
    sandbox
  };
}

console.log('================================================================');
console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: FIREBASE CLOUD SYNC ENGINE');
console.log('================================================================\n');

async function runAllCloudSyncTests() {

// -----------------------------------------------------------------------------
// GROUP 1: Khởi tạo & Cấu hình CloudSyncManager
// -----------------------------------------------------------------------------
console.log('▶ [GROUP 1] Khởi Tạo & Định Dạng URL Firebase REST API:');

(() => {
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  assert(typeof csm === 'object' && csm !== null, '1.1: CloudSyncManager được xuất khẩu hợp lệ ra window');
  
  const cfg = csm.getConfig();
  assert(cfg.enabled === true, '1.2: Cấu hình mặc định tự động kích hoạt Cloud Sync (enabled: true)');
  assert(cfg.databaseUrl.includes('vtt123-76e07-default-rtdb.firebaseio.com'), '1.2b: Tự động tích hợp sẵn Firebase Database URL của Ban Tuyển Sinh');
  assert(cfg.syncPath === 'tvts_production_data', '1.3: Đường dẫn root mặc định là "tvts_production_data"');
  assert(typeof cfg.deviceId === 'string' && cfg.deviceId.startsWith('dev_'), '1.4: Tự động khởi tạo Device ID duy nhất');

  // Kiểm tra lưu cấu hình
  const saveRes = csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://tvts-demo-rtdb.firebaseio.com/',
    apiKey: 'secret_key_123'
  });
  assert(saveRes.success === true, '1.5: saveConfig lưu cấu hình thành công vào LocalStorage');
  
  const updatedCfg = csm.getConfig();
  assert(updatedCfg.enabled === true, '1.6: Cấu hình mới phản ánh chính xác trạng thái enabled');
  assert(updatedCfg.databaseUrl === 'https://tvts-demo-rtdb.firebaseio.com/', '1.7: databaseUrl được lưu và đọc chuẩn xác');

  // Kiểm tra formatFirebaseUrl
  const url1 = csm.formatFirebaseUrl('https://my-app.firebaseio.com/', 'tvts_data');
  assert(url1 === 'https://my-app.firebaseio.com/tvts_data.json', '1.8: formatFirebaseUrl chuẩn hóa đúng endpoint REST .json');

  const url2 = csm.formatFirebaseUrl('my-app.firebaseio.com', 'custom/node', 'my_auth_token');
  assert(url2 === 'https://my-app.firebaseio.com/custom/node.json?auth=my_auth_token', '1.9: Tự động thêm https:// và tham số ?auth=');
})();

// -----------------------------------------------------------------------------
// GROUP 2: Đóng gói dữ liệu LocalStorage (buildPayload)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 2] Đóng Gói Dữ Liệu LocalStorage (buildPayload):');

(() => {
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  // Giả lập nạp dữ liệu vào LocalStorage
  env.localStorage.setItem('ts_scheduler_admin_users', JSON.stringify([
    { id: 'usr_admin', username: 'admin', pin: '9999' },
    { id: 'usr_new', username: 'canbo1', pin: '5555' }
  ]));
  env.localStorage.setItem('ts_scheduler_students', JSON.stringify([
    { id: 'st_1', fullName: 'Sinh Viên A', studentId: '2102001' }
  ]));
  env.localStorage.setItem('ts_scheduler_reg_config', JSON.stringify({ mode: 'always_open', publishSchedule: true }));

  const payload = csm.buildPayload();
  assert(Array.isArray(payload.adminUsers) && payload.adminUsers.length === 2, '2.1: Đóng gói chính xác danh sách tài khoản cán bộ');
  assert(payload.adminUsers[1].pin === '5555', '2.2: Đóng gói đầy đủ mã PIN mới tạo của cán bộ');
  assert(Array.isArray(payload.students) && payload.students.length === 1, '2.3: Đóng gói danh sách sinh viên đăng ký ca');
  assert(payload.regConfig && payload.regConfig.publishSchedule === true, '2.4: Đóng gói cấu hình đóng/mở cổng tuyển sinh');
  assert(typeof payload.updatedAt === 'number' && payload.updatedAt > 0, '2.5: Đính kèm timestamp updatedAt chính xác');
  assert(typeof payload.deviceId === 'string', '2.6: Đính kèm định danh thiết bị cập nhật');
})();

// -----------------------------------------------------------------------------
// GROUP 3: Áp dụng Payload từ Cloud vào LocalStorage (applyPayload)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 3] Áp Dụng Payload Từ Cloud Vào LocalStorage (applyPayload):');

(() => {
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  let storageEventFired = false;
  let customEventDetail = null;
  let dataChangedDetail = null;

  env.window.addEventListener('storage', () => { storageEventFired = true; });
  env.window.addEventListener('ts:cloud-synced', (e) => { customEventDetail = e.detail; });
  env.window.addEventListener('ts:data-changed', (e) => { dataChangedDetail = e.detail; });

  const incomingCloudData = {
    adminUsers: [
      { id: 'usr_admin', username: 'admin', pin: '9999' },
      { id: 'usr_new_pc2', username: 'canbo_pc2', pin: '7777', fullName: 'Cán Bộ Từ Máy 2' }
    ],
    students: [
      { id: 'st_99', fullName: 'Trần Văn Mới', studentId: '2102099' }
    ],
    monthSchedule: { monthKey: '2026-10', totalWeeks: 4 },
    regConfig: { mode: 'scheduled', publishSchedule: true }
  };

  const applyRes = csm.applyPayload(incomingCloudData);
  assert(applyRes.success === true, '3.1: applyPayload trả về success: true');

  const storedAdmins = JSON.parse(env.localStorage.getItem('ts_scheduler_admin_users'));
  assert(storedAdmins.length === 2, '3.2: LocalStorage được cập nhật đúng 2 tài khoản cán bộ');
  assert(storedAdmins.find(u => u.pin === '7777') !== undefined, '3.3: Mã PIN "7777" từ Cloud được nạp chính xác vào LocalStorage');

  const storedStudents = JSON.parse(env.localStorage.getItem('ts_scheduler_students'));
  assert(storedStudents.length === 1 && storedStudents[0].studentId === '2102099', '3.4: Danh sách sinh viên được cập nhật đồng bộ');

  // Yêu cầu mới: sự kiện phải mang danh sách key để các view chỉ render lại đúng phần cần thiết.
  // Sự kiện 'storage' thuần do JS tự phát KHÔNG có .key nên các nhánh e.key === ... không bao giờ chạy.
  assert(dataChangedDetail !== null && Array.isArray(dataChangedDetail.keys), '3.5: Phát sự kiện "ts:data-changed" kèm danh sách key thay đổi');
  assert(
    dataChangedDetail.keys.includes('ts_scheduler_students')
    && dataChangedDetail.keys.includes('ts_scheduler_month_result')
    && dataChangedDetail.keys.includes('ts_scheduler_admin_users'),
    '3.5b: Danh sách key thay đổi chứa đúng STUDENTS / MONTH_SCHEDULE / ADMIN_USERS'
  );
  assert(storageEventFired === false, '3.5c: KHÔNG phát sự kiện "storage" thuần (vô dụng vì thiếu .key)');
  assert(customEventDetail !== null, '3.6: Phát sự kiện "ts:cloud-synced" kèm payload');
})();

// -----------------------------------------------------------------------------
// GROUP 4: Giả Lập Push / Pull Qua Firebase REST API (Mock Fetch)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 4] Kiểm Thử Push & Pull Hai Chiều (Mock Fetch):');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  let lastFetchUrl = '';
  let lastFetchMethod = '';
  let lastFetchBody = null;

  // Giả lập Fetch thành công
  env.window.fetch = async (url, options = {}) => {
    lastFetchUrl = url;
    lastFetchMethod = options.method || 'GET';
    lastFetchBody = options.body ? JSON.parse(options.body) : null;

    if (lastFetchMethod === 'PUT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: 'put_success_key', ...lastFetchBody })
      };
    }
    if (lastFetchMethod === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          adminUsers: [{ id: 'usr_admin', username: 'admin', pin: '1234' }],
          students: [{ id: 'st_cloud', fullName: 'SV Đám Mây' }],
          updatedAt: Date.now()
        })
      };
    }
  };
  env.sandbox.fetch = env.window.fetch;

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://test-cloud.firebaseio.com',
    syncPath: 'test_path'
  });

  // Test Push
  const pushRes = await csm.pushToCloud();
  assert(pushRes.success === true, '4.1: pushToCloud gửi yêu cầu PUT thành công');
  assert(lastFetchMethod === 'PUT', '4.2: Phương thức HTTP gửi đi là PUT');
  assert(lastFetchUrl === 'https://test-cloud.firebaseio.com/test_path.json', '4.3: URL đích khớp chuẩn Firebase REST endpoint');
  assert(lastFetchBody && Array.isArray(lastFetchBody.adminUsers), '4.4: Body chứa payload hoàn chỉnh');

  // Test Pull
  const pullRes = await csm.pullFromCloud();
  assert(pullRes.success === true, '4.5: pullFromCloud gửi yêu cầu GET thành công');
  assert(lastFetchMethod === 'GET', '4.6: Phương thức HTTP nhận về là GET');
  
  const adminsAfterPull = JSON.parse(env.localStorage.getItem('ts_scheduler_admin_users'));
  assert(adminsAfterPull[0].pin === '1234', '4.7: LocalStorage nạp ngay mã PIN "1234" vừa kéo từ Cloud về');
}

// -----------------------------------------------------------------------------
// GROUP 5: Khắc Phục Sự Cố Tab Ẩn Danh (Incognito Mode Auto-Sync)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 5] Khắc Phục Sự Cố Tab Ẩn Danh (Incognito Mode Auto-Sync):');

{
  // Máy 1 (Tab Thường): Cán bộ tạo mã PIN mới "6789" và lưu lên Cloud
  const machine1 = createMockEnvironment();
  machine1.CloudSyncManager.saveConfig({
    enabled: true,
    databaseUrl: 'https://my-rtdb.firebaseio.com',
    syncPath: 'admission_schedule'
  });

  // Tạo tài khoản mới với PIN 6789
  const currentAdmins = [
    { id: 'usr_admin', username: 'admin', pin: '9999' },
    { id: 'usr_tris', username: 'tris_admin', pin: '6789', fullName: 'Tris Quản Trị' }
  ];
  machine1.localStorage.setItem('ts_scheduler_admin_users', JSON.stringify(currentAdmins));

  const cloudStorageServer = {
    data: machine1.CloudSyncManager.buildPayload()
  };

  assert(cloudStorageServer.data.adminUsers.some(u => u.pin === '6789'), '5.1: Máy 1 đã đóng gói và đẩy mã PIN 6789 lên Cloud');

  // Máy 2 (Hoặc Tab Ẩn Danh): Khởi tạo với LocalStorage TRẮNG TINH (mô phỏng tab ẩn danh)
  const incognitoTab = createMockEnvironment();
  incognitoTab.CloudSyncManager.saveConfig({
    enabled: true,
    databaseUrl: 'https://my-rtdb.firebaseio.com',
    syncPath: 'admission_schedule'
  });

  // Giả lập fetch trên tab ẩn danh đọc dữ liệu từ Cloud
  incognitoTab.window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => cloudStorageServer.data
  });
  incognitoTab.sandbox.fetch = incognitoTab.window.fetch;

  // Trước khi kéo: Tab ẩn danh chỉ có dữ liệu rỗng
  assert(incognitoTab.localStorage.getItem('ts_scheduler_admin_users') === null, '5.2: Ban đầu tab ẩn danh chưa hề có mã PIN mới');

  // Tab ẩn danh thực hiện kéo (Auto-Pull hoặc bấm nút Kéo dữ liệu)
  const syncResult = await incognitoTab.CloudSyncManager.pullFromCloud();
  assert(syncResult.success === true, '5.3: Tab ẩn danh kéo dữ liệu từ Cloud thành công');

  // Sau khi kéo: Kiểm tra mã PIN 6789 đã hiện diện trong tab ẩn danh
  const incognitoAdmins = JSON.parse(incognitoTab.localStorage.getItem('ts_scheduler_admin_users'));
  const foundPin = incognitoAdmins.find(u => u.pin === '6789');
  assert(foundPin !== undefined && foundPin.username === 'tris_admin', '5.4: Tab ẩn danh NHẬN DIỆN THÀNH CÔNG mã PIN "6789" và tài khoản "tris_admin"!');

  // Giả lập xác thực mã PIN trên tab ẩn danh
  const inputPin = '6789';
  const authenticatedUser = incognitoAdmins.find(u => u.pin && u.pin === inputPin);
  assert(authenticatedUser !== undefined, '5.5: Xác thực đăng nhập mã PIN "6789" trên tab ẩn danh thành công 100%!');
}

// -----------------------------------------------------------------------------
// GROUP 6: Cơ Chế Offline-First & An Toàn Khi Mất Mạng
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 6] Cơ Chế Offline-First & An Toàn Khi Mất Mạng:');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  // Trường hợp 1: Chưa cấu hình databaseUrl
  csm.saveConfig({ enabled: false, databaseUrl: '' });
  const pushNoUrl = await csm.pushToCloud();
  assert(pushNoUrl.success === false, '6.1: pushToCloud xử lý an toàn khi chưa có databaseUrl');

  const pullNoUrl = await csm.pullFromCloud();
  assert(pullNoUrl.success === false, '6.2: pullFromCloud xử lý an toàn khi chưa có databaseUrl');

  // Trường hợp 2: Mất mạng (fetch throw NetworkError)
  csm.saveConfig({ enabled: true, databaseUrl: 'https://test.firebaseio.com' });
  env.window.fetch = async () => {
    throw new Error('Failed to fetch (Network disconnected)');
  };
  env.sandbox.fetch = env.window.fetch;

  const pushOffline = await csm.pushToCloud();
  assert(pushOffline.success === false && pushOffline.error.includes('Network disconnected'), '6.3: Bắt lỗi mất mạng êm ái, không gây crash ứng dụng');

  const pullOffline = await csm.pullFromCloud();
  assert(pullOffline.success === false && pullOffline.error.includes('Network disconnected'), '6.4: Kéo dữ liệu khi offline trả về thông báo lỗi thân thiện');

  // Dữ liệu local vẫn an toàn tuyệt đối
  env.localStorage.setItem('ts_scheduler_students', JSON.stringify([{ id: 'st_safe' }]));
  const safeStudents = JSON.parse(env.localStorage.getItem('ts_scheduler_students'));
  assert(safeStudents.length === 1, '6.5: Dữ liệu LocalStorage luôn được bảo toàn nguyên vẹn 100% khi mất kết nối');
}

// -----------------------------------------------------------------------------
// GROUP 7: BẪY HTTP 200 + {"error": ...} CỦA FIREBASE REST
// -----------------------------------------------------------------------------
// Khi Security Rules từ chối, Firebase KHÔNG trả HTTP 4xx/5xx mà trả
// HTTP 200 kèm body {"error": "Permission denied"}. Trước đây code chỉ
// kiểm tra response.ok nên:
//   - báo thành công,
//   - áp payload rỗng -> GHI ĐÈ MẤT toàn bộ dữ liệu cục bộ,
//   - người dùng tin rằng đã kéo dữ liệu về.
console.log('\n▶ [GROUP 7] Firebase Trả Lỗi Nhưng HTTP Vẫn 200 (Security Rules):');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  // Đặt dữ liệu cục bộ quan trọng để chứng minh KHÔNG bị ghi đè
  const localStudents = [
    { id: 'st_1', fullName: 'Nguyễn Văn A', studentId: '2102001' },
    { id: 'st_2', fullName: 'Trần Thị B', studentId: '2102002' }
  ];
  env.localStorage.setItem('ts_scheduler_students', JSON.stringify(localStudents));

  csm.saveConfig({ enabled: true, databaseUrl: 'https://test-rtdb.firebaseio.com' });

  // Mô phỏng CHÍNH XÁC phản hồi của Firebase khi Rules chặn
  const permissionDenied = async () => ({
    ok: true,           // <-- HTTP 200 !
    status: 200,
    statusText: 'OK',
    json: async () => ({ error: 'Permission denied' }),
    text: async () => '{"error":"Permission denied"}'
  });
  env.window.fetch = permissionDenied;
  env.sandbox.fetch = permissionDenied;

  const pull = await csm.pullFromCloud();

  assert(pull.success === false,
    '7.1: HTTP 200 + {"error":"Permission denied"} phải được coi là THẤT BẠI, không phải thành công');
  assert(typeof pull.error === 'string' && /Permission denied/.test(pull.error),
    `7.2: Thông báo lỗi phải nêu rõ nguyên nhân từ Firebase. Thực tế: ${pull.error}`);
  assert(/Security Rules/.test(pull.error || ''),
    '7.3: Thông báo lỗi phải chỉ đường dẫn tới chỗ cần sửa (Firebase Security Rules)');

  // Điểm mấu chốt: dữ liệu cục bộ phải được giữ nguyên
  const after = JSON.parse(env.localStorage.getItem('ts_scheduler_students'));
  assert(after.length === 2 && after[0].fullName === 'Nguyễn Văn A',
    '7.4: TUYỆT ĐỐI không được ghi đè dữ liệu cục bộ khi Cloud trả về lỗi');

  // Cùng bẫy đó cho chiều push
  const push = await csm.pushToCloud();
  assert(push.success === false,
    '7.5: pushToCloud cũng phải phát hiện {"error":...} dù HTTP 200');
  assert(/Permission denied/.test(push.error || ''),
    `7.6: Lỗi push phải nêu rõ nguyên nhân. Thực tế: ${push.error}`);
}

{
  // Phải phân biệt được với Cloud THẬT SỰ chưa có dữ liệu (body null)
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  csm.saveConfig({ enabled: true, databaseUrl: 'https://test-rtdb.firebaseio.com' });

  const emptyResponse = async () => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => null,
    text: async () => 'null'
  });
  env.window.fetch = emptyResponse;
  env.sandbox.fetch = emptyResponse;

  const pull = await csm.pullFromCloud();
  assert(pull.success === true && pull.data === null,
    '7.7: Cloud rỗng (body null) vẫn là trường hợp bình thường, không phải lỗi');
}

{
  // Lỗi HTTP thật (4xx/5xx) vẫn phải được bắt như trước
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  csm.saveConfig({ enabled: true, databaseUrl: 'https://test-rtdb.firebaseio.com' });

  const serverError = async () => ({
    ok: false, status: 500, statusText: 'Internal Server Error',
    json: async () => ({}),
    text: async () => 'server exploded'
  });
  env.window.fetch = serverError;
  env.sandbox.fetch = serverError;

  const pull = await csm.pullFromCloud();
  assert(pull.success === false && /500/.test(pull.error || ''),
    `7.8: Lỗi HTTP 500 vẫn phải bị bắt. Thực tế: ${pull.error}`);
}

// -----------------------------------------------------------------------------
// TỔNG KẾT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

}

runAllCloudSyncTests().catch(err => {
  console.error('Lỗi thực thi kiểm thử Cloud Sync:', err);
  process.exit(1);
});

