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
    { id: 'usr_admin', username: 'admin', pin: '9999', fullName: 'Trưởng Ban', role: 'Trưởng ban điều hành' },
    { id: 'usr_new', username: 'canbo1', pin: '5555', fullName: 'Cán Bộ Một', role: 'Điều phối viên tuyển sinh' }
  ]));
  env.localStorage.setItem('ts_scheduler_students', JSON.stringify([
    { id: 'st_1', fullName: 'Sinh Viên A', studentId: '2102001' }
  ]));
  env.localStorage.setItem('ts_scheduler_reg_config', JSON.stringify({ mode: 'always_open', publishSchedule: true }));

  const payload = csm.buildPayload();
  assert(Array.isArray(payload.adminUsers) && payload.adminUsers.length === 2, '2.1: Đóng gói chính xác danh sách tài khoản cán bộ');
  // BẢO MẬT: payload đi lên Firebase (kênh từng cho đọc công khai) tuyệt đối
  // không được chứa mật khẩu/PIN. Trước đây test này lại khẳng định ngược lại
  // ("Đóng gói đầy đủ mã PIN") — tức là khóa cứng đúng lỗ hổng.
  assert(payload.adminUsers.every(u => !('pin' in u) && !('password' in u)),
    '2.2: Payload KHÔNG chứa pin/password (credential ở lại máy)');
  assert(payload.adminUsers[1].username === 'canbo1' && payload.adminUsers[1].fullName !== undefined,
    '2.2b: Vẫn giữ hồ sơ hiển thị (username/fullName/role) để đồng bộ tên cán bộ');
  assert(Array.isArray(payload.students) && payload.students.length === 1, '2.3: Đóng gói danh sách sinh viên đăng ký ca');
  assert(payload.regConfig && payload.regConfig.publishSchedule === true, '2.4: Đóng gói cấu hình đóng/mở cổng tuyển sinh');
  assert(typeof payload.updatedAt === 'number' && payload.updatedAt > 0, '2.5: Đính kèm timestamp updatedAt chính xác');
  assert(typeof payload.deviceId === 'string', '2.6: Đính kèm định danh thiết bị cập nhật');

  // Tài khoản ĐÃ BĂM: payload phải mang hash + salt, tuyệt đối không plaintext.
  env.localStorage.setItem('ts_scheduler_admin_users', JSON.stringify([
    {
      id: 'usr_h', username: 'hashed_admin', fullName: 'Cán Bộ B', role: 'Điều phối viên tuyển sinh',
      passwordHash: 'a'.repeat(64), passwordSalt: 'salt-a',
      pinHash: 'b'.repeat(64), pinSalt: 'salt-b'
    }
  ]));
  const hashedPayload = csm.buildPayload();
  const hashedRec = hashedPayload.adminUsers[0];
  assert(hashedRec.passwordHash === 'a'.repeat(64) && hashedRec.passwordSalt === 'salt-a',
    '2.7: Hash mật khẩu được đồng bộ để máy khác đăng nhập được');
  assert(hashedRec.pinHash === 'b'.repeat(64) && hashedRec.pinSalt === 'salt-b',
    '2.8: Hash PIN được đồng bộ');
  assert(!('password' in hashedRec) && !('pin' in hashedRec),
    '2.9: Payload chỉ có hash, không có plaintext');
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
      // Bản ghi trên Cloud (dữ liệu cũ hoặc do kẻ tấn công ghi) có kèm
      // credential — applyPayload phải bỏ qua phần bí mật.
      { id: 'usr_admin', username: 'admin', pin: '1234', password: 'hacked', fullName: 'Trưởng Ban Tuyển Sinh' },
      // Tài khoản không tồn tại trên máy: KHÔNG được tạo mới từ Cloud.
      { id: 'usr_evil', username: 'ke_gian', password: 'evil', pin: '0000', fullName: 'Kẻ Gian' },
      // Tài khoản admin cấp ở máy khác, đã băm: ĐƯỢC tạo (yêu cầu nghiệp vụ).
      { id: 'usr_hash', username: 'canbo_hash', fullName: 'Cán Bộ Từ Máy Khác', role: 'Điều phối viên tuyển sinh',
        passwordHash: 'c'.repeat(64), passwordSalt: 'salt-c',
        pinHash: 'd'.repeat(64), pinSalt: 'salt-d' }
    ],
    students: [
      { id: 'st_99', fullName: 'Trần Văn Mới', studentId: '2102099' }
    ],
    monthSchedule: { monthKey: '2026-10', totalWeeks: 4 },
    regConfig: { mode: 'scheduled', publishSchedule: true }
  };

  // Máy này ĐÃ có tài khoản cán bộ với credential riêng.
  env.localStorage.setItem('ts_scheduler_admin_users', JSON.stringify([
    { id: 'usr_admin', username: 'admin', pin: '9999', fullName: 'Trưởng Ban (máy này)', role: 'Trưởng ban điều hành' }
  ]));

  const applyRes = csm.applyPayload(incomingCloudData);
  assert(applyRes.success === true, '3.1: applyPayload trả về success: true');

  const storedAdmins = JSON.parse(env.localStorage.getItem('ts_scheduler_admin_users'));
  assert(storedAdmins.length === 2, '3.2: Chỉ thêm tài khoản CÓ HASH từ Cloud, bỏ qua bản ghi plaintext');
  const adminAfterSync = storedAdmins.find(u => u.username === 'admin');
  assert(adminAfterSync.pin === '9999' && !('password' in adminAfterSync),
    '3.3: PIN/mật khẩu cục bộ KHÔNG bị Cloud ghi đè');
  assert(adminAfterSync.fullName === 'Trưởng Ban Tuyển Sinh',
    '3.3b: Hồ sơ (fullName) vẫn được đồng bộ từ Cloud');
  assert(!storedAdmins.some(u => u.username === 'ke_gian'),
    '3.3c: KHÔNG tạo tài khoản từ bản ghi chỉ có mật khẩu thô');
  const createdFromCloud = storedAdmins.find(u => u.username === 'canbo_hash');
  assert(createdFromCloud && createdFromCloud.passwordHash === 'c'.repeat(64),
    '3.3d: Tài khoản admin cấp ở máy khác được tạo từ hash');
  assert(createdFromCloud && !('password' in createdFromCloud) && !('pin' in createdFromCloud),
    '3.3e: Tài khoản tạo từ Cloud không chứa plaintext');

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

    // Nhận cả PUT và PATCH: pushToCloud() dùng PATCH để không xoá khoá vắng mặt
    // (xem test 7.10). Trước đây mock chỉ khớp PUT nên PATCH rơi xuống cuối,
    // hàm trả undefined và test báo lỗi mạng.
    if (lastFetchMethod === 'PUT' || lastFetchMethod === 'PATCH') {
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
  assert(pushRes.success === true, '4.1: pushToCloud gửi yêu cầu ghi thành công');
  // PATCH chứ không PUT: PUT ghi đè toàn bộ node nên sẽ XOÁ mọi khoá không có
  // trong payload. Xem test 7.10 để biết hậu quả cụ thể.
  assert(lastFetchMethod === 'PATCH',
    `4.2: phải dùng PATCH để không xoá khoá vắng mặt. Thực tế: ${lastFetchMethod}`);
  assert(lastFetchUrl === 'https://test-cloud.firebaseio.com/test_path.json', '4.3: URL đích khớp chuẩn Firebase REST endpoint');
  assert(lastFetchBody && Array.isArray(lastFetchBody.adminUsers), '4.4: Body chứa payload hoàn chỉnh');

  // Test Pull
  const pullRes = await csm.pullFromCloud();
  assert(pullRes.success === true, '4.5: pullFromCloud gửi yêu cầu GET thành công');
  assert(lastFetchMethod === 'GET', '4.6: Phương thức HTTP nhận về là GET');
  
  const adminsAfterPullRaw = env.localStorage.getItem('ts_scheduler_admin_users');
  const adminsAfterPull = adminsAfterPullRaw ? JSON.parse(adminsAfterPullRaw) : [];
  assert(adminsAfterPull.length === 0,
    '4.7: Cloud KHÔNG được tạo tài khoản/PIN trên máy (credential chỉ đến từ máy)');
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

  // Tạo tài khoản mới (đã băm, như admin.js làm sau khi cấp quyền)
  const currentAdmins = [
    { id: 'usr_admin', username: 'admin', pin: '9999' },
    {
      id: 'usr_tris', username: 'tris_admin', fullName: 'Tris Quản Trị',
      passwordHash: 'e'.repeat(64), passwordSalt: 'salt-e',
      pinHash: 'f'.repeat(64), pinSalt: 'salt-f'
    }
  ];
  machine1.localStorage.setItem('ts_scheduler_admin_users', JSON.stringify(currentAdmins));

  const cloudStorageServer = {
    data: machine1.CloudSyncManager.buildPayload()
  };

  assert(cloudStorageServer.data.adminUsers.every(u => !('pin' in u) && !('password' in u)),
    '5.1: Máy 1 KHÔNG đẩy mã PIN 6789 (hay bất kỳ credential nào) lên Cloud');

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

  // Sau khi kéo: tab ẩn danh nhận được TÀI KHOẢN (dạng hash) — đúng yêu cầu
  // "cấp quyền ở máy A, máy B đăng nhập được", nhưng không có bí mật đọc được.
  const incognitoRaw = incognitoTab.localStorage.getItem('ts_scheduler_admin_users');
  const incognitoAdmins = incognitoRaw ? JSON.parse(incognitoRaw) : [];
  const syncedAdmin = incognitoAdmins.find(u => u.username === 'tris_admin');
  assert(syncedAdmin !== undefined,
    '5.4: Tab ẩn danh nhận được tài khoản cán bộ do máy 1 cấp quyền');
  assert(syncedAdmin.passwordHash === 'e'.repeat(64) && syncedAdmin.passwordSalt === 'salt-e',
    '5.5: Credential chỉ đến dưới dạng hash có muối, không phải mật khẩu thô');
  assert(!('pin' in syncedAdmin) && !('password' in syncedAdmin),
    '5.5b: Không có PIN/mật khẩu đọc được trong dữ liệu tải về');
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

  // 7.9 — KHÔNG được ghi danh sách rỗng lên Cloud.
  //
  // Lỗi đã xảy ra thật trên production: máy mới đăng nhập, localStorage chưa
  // có danh sách, pushToCloud() gửi students: [] và Firebase PUT toàn payload —
  // xoá mất 58 CTV trên Cloud, mọi máy sau đó kéo về 0 người.
  //
  // Danh sách rỗng ở máy = "chưa nạp", KHÔNG phải "xoá hết". Phải bỏ hẳn khoá
  // khỏi payload để Firebase giữ nguyên dữ liệu cũ.
  {
    const sent = [];
    const capture = async (url, opts) => {
      sent.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    };
    env.window.fetch = capture;
    env.sandbox.fetch = capture;

    // Máy mới: KHÔNG có khoá students trong localStorage.
    env.localStorage.removeItem('ts_scheduler_students');
    sent.length = 0;
    await csm.pushToCloud();
    assert(sent.length === 1, `7.9: phải có 1 lần ghi. Thực tế: ${sent.length}`);
    assert(!('students' in sent[0]),
      '7.9: máy chưa có danh sách thì KHÔNG được gửi khoá students lên Cloud '
      + '(sẽ xoá danh sách đang có trên Firebase)');

    // Máy ĐÃ có danh sách → phải gửi lên để đồng bộ.
    env.localStorage.setItem('ts_scheduler_students', JSON.stringify([
      { id: 'a', studentId: '1', role: 'old' },
      { id: 'b', studentId: '2', role: 'new' }
    ]));
    sent.length = 0;
    await csm.pushToCloud();
    assert('students' in sent[0], '7.9: máy ĐÃ có danh sách thì phải gửi lên Cloud');
    assert(sent[0].students.length === 2,
      `7.9: phải gửi đúng 2 người. Thực tế: ${sent[0].students.length}`);

    // Danh sách rỗng rõ ràng ([]) cũng không được gửi — cùng nguy cơ xoá.
    env.localStorage.setItem('ts_scheduler_students', '[]');
    sent.length = 0;
    await csm.pushToCloud();
    assert(!('students' in sent[0]),
      '7.9: danh sách rỗng rõ ràng ([]) cũng không được gửi lên Cloud');

    // 7.10 — PHẢI dùng PATCH, không phải PUT.
    //
    // Root cause: Firebase PUT tới path.json ghi đè TOÀN BỘ node — mọi khoá
    // không có trong payload đều bị XOÁ. Payload thiếu `students` vì máy chưa
    // nạp danh sách, nhưng chính việc thiếu đó khiến khoá bị mất. Bản sửa
    // "không ghi danh sách rỗng" chỉ chặn được ghi RỘNG, không chặn được XOÁ.
    // PATCH chỉ cập nhật khoá được gửi, giữ nguyên phần còn lại.
    const methods = [];
    const methodCapture = async (url, opts) => {
      methods.push(opts.method);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    };
    env.window.fetch = methodCapture;
    env.sandbox.fetch = methodCapture;

    env.localStorage.setItem('ts_scheduler_students', JSON.stringify([{ id: 'a' }]));
    await csm.pushToCloud();
    assert(methods[0] === 'PATCH',
      `7.10: phải dùng PATCH để không xoá khoá vắng mặt. Thực tế: ${methods[0]}`);
  }
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
// GROUP 8: Đăng nhập Firebase Auth để đọc/ghi database đang khoá (auth != null)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 8] Đăng Nhập Firebase Auth (Database Khoá Quyền):');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://locked-db.firebaseio.com',
    syncPath: 'tvts_production_data',
    apiKey: 'AIza_test_key',
    authEmail: 'office@tvts.local',
    authPassword: 'matkhau-van-phong'
  });

  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.includes('identitytoolkit')) {
      return {
        ok: true, status: 200,
        json: async () => ({ idToken: 'ID_TOKEN_ABC', expiresIn: '3600' })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  env.sandbox.fetch = env.window.fetch;

  const push = await csm.pushToCloud();
  assert(push.success === true, `8.1: push thành công sau khi đăng nhập. Lỗi: ${push.error}`);

  const authCall = calls.find(c => c.url.includes('identitytoolkit'));
  assert(authCall && authCall.method === 'POST', '8.2: phải gọi signInWithPassword (POST)');
  const sentBody = JSON.parse(authCall.body);
  assert(sentBody.email === 'office@tvts.local', '8.3: gửi đúng email đồng bộ');
  assert(sentBody.password === 'matkhau-van-phong', '8.3b: gửi đúng mật khẩu đồng bộ');
  assert(authCall.url.includes('key=AIza_test_key'), '8.3c: dùng đúng Web API Key');

  const dbCall = calls.find(c => c.url.includes('locked-db'));
  assert(dbCall && /[?&]auth=ID_TOKEN_ABC/.test(dbCall.url),
    `8.4: request database phải kèm ?auth=<idToken>. Thực tế: ${dbCall && dbCall.url}`);

  // Token được cache trong RAM -> lần đồng bộ sau không đăng nhập lại
  const authCallsBefore = calls.filter(c => c.url.includes('identitytoolkit')).length;
  await csm.pullFromCloud();
  const authCallsAfter = calls.filter(c => c.url.includes('identitytoolkit')).length;
  assert(authCallsAfter === authCallsBefore, '8.5: ID token phải được cache, không đăng nhập lại mỗi lần');
}

{
  // Sai mật khẩu đồng bộ -> báo lỗi rõ ràng, KHÔNG gọi database
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://locked-db.firebaseio.com',
    syncPath: 'tvts_production_data',
    apiKey: 'AIza_test_key',
    authEmail: 'office@tvts.local',
    authPassword: 'sai-mat-khau'
  });

  env.window.fetch = async (url) => {
    calls.push(url);
    if (url.includes('identitytoolkit')) {
      return {
        ok: false, status: 400,
        json: async () => ({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pullFromCloud();
  assert(res.success === false, '8.6: Sai mật khẩu đồng bộ phải thất bại');
  assert(/Sai email hoặc mật khẩu/i.test(res.error || ''),
    `8.7: Thông báo lỗi phải dễ hiểu. Thực tế: ${res.error}`);
  assert(!calls.some(u => u.includes('locked-db')), '8.8: Không được gọi database khi chưa đăng nhập được');
}

{
  // Database khoá (401) mà chưa cấu hình tài khoản đồng bộ -> báo đúng nguyên nhân
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://locked-db.firebaseio.com',
    syncPath: 'tvts_production_data',
    apiKey: '',
    authEmail: '',
    authPassword: ''
  });

  env.window.fetch = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'Permission denied' });
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pullFromCloud();
  assert(res.success === false && /401/.test(res.error || ''),
    `8.9: Database khoá phải trả lỗi 401 rõ ràng. Thực tế: ${res.error}`);
}


// -----------------------------------------------------------------------------
// GROUP 9: Dữ liệu công khai cho sinh viên — không PII
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 9] Dữ Liệu Công Khai Cho Sinh Viên (Không PII):');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({
    enabled: false,
    apiKey: 'AIza_PUBLIC_TEST',
    databaseUrl: 'https://pub-db.firebaseio.com'
  });

  const sample = {
    id: 'sv1',
    studentId: 'SV001',
    fullName: 'Nguyễn Văn A',
    role: 'CTV',
    phone: '0909123456',
    email: 'a@example.com',
    bankAccount: '123456789',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    pinHash: 'pinhash',
    pinSalt: 'pinsalt',
    monthlyAvailableShifts: { 1: ['T2-S1'], 2: [], 3: [], 4: [] },
    availableShifts: ['T2-S1'],
    updatedAt: 123456
  };
  env.localStorage.setItem(K.STUDENTS, JSON.stringify([sample]));
  env.localStorage.setItem(K.SCHEDULE, JSON.stringify({ assignments: [] }));

  const payload = csm.buildPublicPayload();
  const rec = payload.directory && payload.directory[0];
  assert(Array.isArray(payload.directory) && payload.directory.length === 1,
    '9.1: buildPublicPayload phải có directory cho sinh viên');
  assert(rec && rec.studentId === 'SV001' && rec.fullName === 'Nguyễn Văn A',
    '9.2: Giữ MSSV & họ tên để tra cứu');
  assert(rec && !('phone' in rec) && !('email' in rec) && !('bankAccount' in rec),
    '9.3: Không đưa SĐT/email/số tài khoản lên nhánh công khai');
  assert(rec && !('passwordHash' in rec) && !('pinHash' in rec)
    && !('passwordSalt' in rec) && !('pinSalt' in rec),
    '9.4: Không đưa hash mật khẩu/PIN lên nhánh công khai');
  assert(rec && JSON.stringify(rec.monthlyAvailableShifts)
    === JSON.stringify(sample.monthlyAvailableShifts),
    '9.5: Giữ ca rảnh để sinh viên xem lại đăng ký');
  assert(payload.clientConfig && payload.clientConfig.apiKey === 'AIza_PUBLIC_TEST',
    '9.6: Công bố Web API Key (công khai) để máy sinh viên tạo phiên ẩn danh');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({ enabled: false, databaseUrl: 'https://pub-db.firebaseio.com' });
  env.localStorage.setItem(K.ADMIN_USERS, JSON.stringify([{ username: 'admin', password: '0000' }]));
  env.localStorage.setItem(K.STUDENTS, JSON.stringify([{ studentId: 'OLD', phone: 'secret' }]));
  env.localStorage.setItem(K.AVAILABILITY_MONTH, JSON.stringify('2026-10'));

  const res = csm.applyPublicPayload({
    directory: [{
      studentId: 'SV002', fullName: 'Trần B', role: 'CTV',
      phone: '0909', email: 'b@x.vn', bankAccount: '999'
    }],
    monthSchedule: { week1: true },
    clientConfig: { apiKey: 'AIza_FROM_PUBLIC', authDomain: 'x.firebaseapp.com' },
    availabilityMonth: '2026-11',
    activeMonth: { month: 10, year: 2026 }
  });

  assert(res.success === true, '9.7: applyPublicPayload phải áp dụng được payload hợp lệ');
  const students = JSON.parse(env.localStorage.getItem(K.STUDENTS));
  assert(students.length === 1 && students[0].studentId === 'SV002',
    '9.8: Danh sách sinh viên phải được thay bằng bản công khai');
  assert(!students[0].phone && !students[0].email && !students[0].bankAccount,
    '9.9: Bản ghi áp dụng vào máy sinh viên vẫn phải sạch PII');
  assert(JSON.parse(env.localStorage.getItem(K.MONTH_SCHEDULE)).week1 === true,
    '9.10: Lịch tháng phải được áp dụng');
  assert(JSON.parse(env.localStorage.getItem(K.ADMIN_USERS))[0].password === '0000',
    '9.11: applyPublicPayload KHÔNG được ghi đè tài khoản cán bộ');
  assert(env.localStorage.getItem(K.AVAILABILITY_MONTH) === JSON.stringify('2026-10'),
    '9.12: Không được ghi đè tháng ca rảnh đang có trên máy');
  assert(csm.getConfig().apiKey === 'AIza_FROM_PUBLIC',
    '9.13: Nhận Web API Key công khai từ Cloud');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;
  const calls = [];

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://pub-db.firebaseio.com',
    apiKey: '',
    authEmail: '',
    authPassword: ''
  });
  env.localStorage.setItem(K.STUDENTS, JSON.stringify([{
    studentId: 'SV001', fullName: 'A', role: 'CTV',
    phone: '0909', email: 'a@x', bankAccount: '123'
  }]));

  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pushPublicToCloud();
  assert(res.success === true, `9.14: pushPublicToCloud phải thành công. Lỗi: ${res.error || ''}`);
  const call = calls[0];
  assert(call && call.method === 'PATCH', '9.15: Phải PATCH để không xoá nhánh khác');
  assert(call && call.url.includes('/tvts_public.json'), '9.16: Phải ghi đúng nhánh tvts_public');
  const body = call ? JSON.parse(call.body) : {};
  assert(JSON.stringify(body).indexOf('0909') === -1
    && JSON.stringify(body).indexOf('a@x') === -1,
  '9.17: Body công khai không chứa SĐT/email');
  assert(body.directory && body.directory[0].studentId === 'SV001',
    '9.18: Body công khai vẫn có MSSV để tra cứu');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://pub-db.firebaseio.com',
    apiKey: '',
    authEmail: '',
    authPassword: ''
  });
  env.localStorage.setItem(K.ADMIN_USERS, JSON.stringify([{ username: 'admin' }]));

  env.window.fetch = async (url) => {
    if (!url.includes('/tvts_public.json')) throw new Error('sai URL: ' + url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        directory: [{
          studentId: 'SV003', fullName: 'Lê C', role: 'CTV',
          phone: '0908', email: 'c@x', bankAccount: '999'
        }],
        monthSchedule: { week2: true },
        clientConfig: { apiKey: 'AIza_PUBLIC_2' }
      })
    };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pullPublicFromCloud();
  assert(res.success === true, `9.19: pullPublicFromCloud phải thành công. Lỗi: ${res.error || ''}`);
  const students = JSON.parse(env.localStorage.getItem(K.STUDENTS));
  assert(students[0].studentId === 'SV003' && !students[0].phone
    && !students[0].email && !students[0].bankAccount,
  '9.20: Dữ liệu kéo về phải được làm sạch PII');
  assert(csm.getConfig().apiKey === 'AIza_PUBLIC_2',
    '9.21: Lưu Web API Key nhận từ nhánh công khai');
  assert(JSON.parse(env.localStorage.getItem(K.ADMIN_USERS))[0].username === 'admin',
    '9.22: Kéo dữ liệu công khai không đụng tài khoản cán bộ');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://pub-db.firebaseio.com',
    authEmail: '',
    authPassword: ''
  });
  env.window.fetch = async () => ({
    ok: false, status: 500, statusText: 'Server Error', text: async () => 'boom'
  });
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pullPublicFromCloud();
  assert(res.success === false && /500/.test(res.error || ''),
    '9.23: Lỗi HTTP khi kéo dữ liệu công khai phải bị bắt');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://sync-db.firebaseio.com',
    apiKey: '',
    authEmail: '',
    authPassword: ''
  });
  env.localStorage.setItem(K.STUDENTS, JSON.stringify([{
    studentId: 'SV001', fullName: 'A', role: 'CTV', phone: '0909'
  }]));
  env.sandbox.document.querySelector = (sel) =>
    (String(sel).indexOf('tvts-publish-public') !== -1 ? { content: 'true' } : null);

  const calls = [];
  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pushToCloud();
  assert(res.success === true && res.publicResult && res.publicResult.success === true,
    '9.24: Trang admin phải tự đẩy cả nhánh công khai sau khi đẩy dữ liệu riêng tư');
  assert(calls.length === 2 && calls[1].url.includes('/tvts_public.json'),
    `9.25: Lần gọi thứ hai phải là PATCH nhánh tvts_public. Thực tế: ${calls.map(c => c.url).join(' | ')}`);
  const publicBody = calls[1] ? JSON.parse(calls[1].body) : {};
  assert(JSON.stringify(publicBody).indexOf('0909') === -1,
    '9.26: Nhánh công khai tự động vẫn không chứa SĐT');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({ enabled: false, databaseUrl: 'https://pub-db.firebaseio.com' });
  const scheduleWithPii = {
    scheduleTable: {
      'T2-S1': {
        oldMember: {
          id: 'sv1', studentId: 'SV001', fullName: 'A', role: 'old',
          phone: '0909123456', email: 'a@example.com', bankAccount: '123456789'
        },
        newMember: {
          id: 'sv2', studentId: 'SV002', fullName: 'B', role: 'new',
          partnerPhone: '0911222333', passwordHash: 'hash'
        }
      }
    }
  };
  env.localStorage.setItem(K.MONTH_SCHEDULE, JSON.stringify(scheduleWithPii));
  env.localStorage.setItem(K.EVENTS, JSON.stringify([
    { id: 'e1', name: 'Sự kiện tư vấn', phone: '0922333444' }
  ]));

  const payload = csm.buildPublicPayload();
  const flat = JSON.stringify({
    monthSchedule: payload.monthSchedule,
    events: payload.events
  });
  assert(flat.indexOf('0909123456') === -1 && flat.indexOf('a@example.com') === -1
    && flat.indexOf('123456789') === -1 && flat.indexOf('0911222333') === -1
    && flat.indexOf('0922333444') === -1,
  '9.27: Lịch/sự kiện công khai phải được quét sạch PII ở mọi cấp');
  const slot = payload.monthSchedule
    && payload.monthSchedule.scheduleTable
    && payload.monthSchedule.scheduleTable['T2-S1'];
  assert(slot && slot.oldMember.fullName === 'A' && slot.oldMember.studentId === 'SV001'
    && slot.newMember.fullName === 'B',
  '9.28: Vẫn giữ họ tên/MSSV cần cho sinh viên xem lịch');
  assert(JSON.parse(env.localStorage.getItem(K.MONTH_SCHEDULE))
    .scheduleTable['T2-S1'].oldMember.phone === '0909123456',
  '9.29: Bản gốc trong máy cán bộ không bị sửa khi đóng gói công khai');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({ enabled: false, databaseUrl: 'https://pub-db.firebaseio.com' });
  const res = csm.applyPublicPayload({
    monthSchedule: {
      scheduleTable: {
        'T3-S2': {
          oldMember: {
            id: 'sv3', studentId: 'SV003', fullName: 'C', role: 'old',
            phone: '0988777666', bankName: 'VCB', bankAccount: '999888'
          }
        }
      }
    },
    events: [{ id: 'e2', name: 'Họp CTV', email: 'c@example.com' }]
  });
  assert(res.success === true, '9.30: applyPublicPayload với lịch công khai hợp lệ');
  const saved = JSON.parse(env.localStorage.getItem(K.MONTH_SCHEDULE));
  const member = saved.scheduleTable['T3-S2'].oldMember;
  assert(member.fullName === 'C' && !member.phone && !member.bankName && !member.bankAccount,
    '9.31: Dữ liệu lịch kéo về máy sinh viên cũng phải sạch PII');
  const events = JSON.parse(env.localStorage.getItem(K.EVENTS));
  assert(events[0].name === 'Họp CTV' && !events[0].email,
    '9.32: Sự kiện công khai kéo về cũng phải sạch email');
}

// -----------------------------------------------------------------------------
// GROUP 10: Sinh viên gửi yêu cầu bằng phiên ẩn danh (không giao diện đăng nhập)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 10] Sinh Viên Gửi Yêu Cầu Bằng Phiên Ẩn Danh:');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://req-db.firebaseio.com',
    apiKey: 'AIza_ANON_TEST',
    authEmail: '',
    authPassword: ''
  });

  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.includes('identitytoolkit')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          idToken: 'ID_TOKEN_ANON',
          localId: 'ANON_UID_1',
          expiresIn: '3600',
          refreshToken: 'REFRESH_1'
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.submitRegistration('SV001', {
    fullName: 'Nguyễn Văn A',
    month: { month: 10, year: 2026 },
    shifts: { 1: ['T2-S1'], 2: [], 3: [], 4: [] },
    availableShifts: ['T2-S1']
  });
  assert(res.success === true, `10.1: submitRegistration phải thành công. Lỗi: ${res.error || ''}`);
  const authCall = calls.find(c => c.url.includes('identitytoolkit') && c.method === 'POST');
  assert(Boolean(authCall), '10.2: Phải tạo phiên ẩn danh, không hiện giao diện đăng nhập');
  const put = calls.find(c => c.method === 'PUT'
    && c.url.includes('/tvts_requests/registrations/SV001.json'));
  assert(Boolean(put), `10.3: Phải PUT đúng node registrations/SV001. URL: ${calls.map(c => c.url).join(' | ')}`);
  const claimPut = calls.find(c => c.method === 'PUT'
    && c.url.includes('/tvts_requests/mssv_owner/SV001.json'));
  assert(Boolean(claimPut) && JSON.parse(claimPut.body) === 'ANON_UID_1',
    '10.3b: Phải giữ chỗ MSSV (mssv_owner) bằng uid trước khi ghi đăng ký');
  assert(put && /[?&]auth=ID_TOKEN_ANON/.test(put.url),
    '10.4: Request phải kèm ID token ẩn danh');
  const body = put ? JSON.parse(put.body) : {};
  assert(body.mssv === 'SV001' && body.uid === 'ANON_UID_1',
    '10.5: Body phải có mssv & uid của phiên ẩn danh');
  assert(body.status === 'registered' && body.month && body.month.month === 10,
    '10.6: Ca rảnh phải ở trạng thái registered (không chờ duyệt) và đúng tháng');
  assert(JSON.stringify(body.shifts) === JSON.stringify({ 1: ['T2-S1'], 2: [], 3: [], 4: [] }),
    '10.7: Giữ nguyên ca rảnh theo tuần');

  const authCallsBefore = calls.filter(c => c.url.includes('identitytoolkit')).length;
  const swap = await csm.submitSwap({
    studentId: 'SV001',
    studentName: 'Nguyễn Văn A',
    targetStudentId: 'SV002',
    weekNum: 1,
    shiftId: 'T2-S1',
    swapType: 'swap',
    reason: 'Bận thi'
  });
  assert(swap.success === true, `10.8: submitSwap phải thành công. Lỗi: ${swap.error || ''}`);
  const authCallsAfter = calls.filter(c => c.url.includes('identitytoolkit')).length;
  assert(authCallsAfter === authCallsBefore,
    '10.9: Dùng lại token ẩn danh đã cache, không đăng nhập lại');
  const swapPut = calls.find(c => c.method === 'PUT'
    && c.url.includes('/tvts_requests/swaps/swap_'));
  assert(Boolean(swapPut), '10.10: Phải ghi đề xuất đổi ca vào nhánh swaps');
  const swapBody = swapPut ? JSON.parse(swapPut.body) : {};
  assert(/^swap_/.test(swapBody.id || '') && swapBody.status === 'pending'
    && swapBody.uid === 'ANON_UID_1',
  '10.11: Đề xuất đổi ca phải có id, status pending và uid');

  // Kể cả khi UI lỡ gửi kèm PII, cloud_sync phải chặn trước khi ghi công khai.
  const piiReg = await csm.submitRegistration('SV002', {
    fullName: 'Trần B', phone: '0900000000', email: 'b@example.com', shifts: {}
  });
  assert(piiReg.success === true, '10.17: Gửi đăng ký kèm PII vẫn xử lý được');
  const piiPut = calls.slice().reverse().find(c => c.method === 'PUT'
    && c.url.includes('/registrations/SV002.json'));
  const piiBody = piiPut ? JSON.parse(piiPut.body) : {};
  assert(piiBody.fullName === 'Trần B' && !piiBody.phone && !piiBody.email,
    '10.18: Body gửi lên phải bị lọc bỏ SĐT/email');

  const piiSwap = await csm.submitSwap({
    id: 'swap_pii_1', studentId: 'SV001', studentName: 'A', phone: '0911222333'
  });
  assert(piiSwap.success === true, '10.19: Gửi đề xuất đổi ca kèm PII vẫn xử lý được');
  const piiSwapPut = calls.slice().reverse().find(c => c.method === 'PUT'
    && c.url.includes('/swaps/swap_pii_1.json'));
  const piiSwapBody = piiSwapPut ? JSON.parse(piiSwapPut.body) : {};
  assert(piiSwapBody.studentId === 'SV001' && !piiSwapBody.phone,
    '10.20: Đề xuất đổi ca công khai cũng phải sạch PII');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://req-db.firebaseio.com',
    apiKey: 'AIza_ANON_TEST',
    authEmail: '',
    authPassword: ''
  });
  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url.includes('identitytoolkit')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'OPERATION_NOT_ALLOWED' } })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.submitRegistration('SV009', { shifts: {} });
  assert(res.success === false && /ẩn danh/i.test(res.error || ''),
    `10.12: Báo lỗi rõ khi Firebase chưa bật Anonymous. Thực tế: ${res.error}`);
  assert(!calls.some(c => c.method === 'PUT'),
    '10.13: Không ghi database khi chưa có phiên ẩn danh');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const res = await csm.submitRegistration('SV 001/../x', { shifts: {} });
  assert(res.success === false,
    '10.14: MSSV chứa ký tự lạ phải bị chặn trước khi ghi Firebase');
}

{
  const env = createMockEnvironment();
  env.sandbox.document.querySelector = (sel) =>
    (String(sel).indexOf('tvts-cloud-role') !== -1 ? { content: 'student' } : null);
  const csm = env.CloudSyncManager;
  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://sync-db.firebaseio.com'
  });
  assert(csm.getConfig().role === 'student',
    '10.15: Thẻ meta tvts-cloud-role=student phải chuyển trang sang chế độ sinh viên');
  const push = await csm.pushToCloud();
  assert(push.success === false && /sinh viên/i.test(push.error || ''),
    '10.16: Trang sinh viên không được đẩy dữ liệu riêng tư');
}

// -----------------------------------------------------------------------------
// GROUP 11: Gộp yêu cầu & cập nhật trạng thái đổi ca
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 11] Gộp Yêu Cầu & Cập Nhật Trạng Thái:');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  csm.saveConfig({ enabled: false, databaseUrl: 'https://req-db.firebaseio.com' });
  const local = [{
    studentId: 'SV001',
    fullName: 'A',
    monthlyAvailableShifts: { 1: ['OLD'] },
    updatedAt: 1000
  }];

  const older = csm.mergeRegistrationRequests(local, {
    SV001: {
      mssv: 'SV001',
      submittedAt: '1970-01-01T00:00:01.000Z',
      shifts: { 1: ['OLD2'] },
      availableShifts: ['OLD2']
    }
  });
  assert(older.mergedCount === 0,
    '11.1: Yêu cầu cũ hơn dữ liệu hiện tại phải bị bỏ qua');

  const newer = csm.mergeRegistrationRequests(local, {
    SV001: {
      mssv: 'SV001',
      submittedAt: '2026-10-22T10:00:00.000Z',
      shifts: { 1: ['NEW'] },
      availableShifts: ['NEW']
    }
  });
  assert(newer.mergedCount === 1 && newer.students[0].monthlyAvailableShifts[1][0] === 'NEW',
    '11.2: Yêu cầu mới hơn phải được gộp vào ca rảnh');
  assert(local[0].monthlyAvailableShifts[1][0] === 'OLD',
    '11.3: Không được sửa mảng đầu vào (tránh tác dụng phụ)');

  const unknown = csm.mergeRegistrationRequests(local, {
    SV999: {
      mssv: 'SV999',
      submittedAt: '2026-10-22T10:00:00.000Z',
      shifts: { 1: ['X'] }
    }
  });
  assert(unknown.mergedCount === 0 && unknown.students.length === 1,
    '11.4: Không tự thêm MSSV lạ vào danh sách CTV');

  // Dữ liệu yêu cầu đến từ client sinh viên -> phải lọc trước khi gộp.
  env.window.SchedulerEngine = { SHIFTS: [{ id: 'T2_S' }, { id: 'T3_C' }] };
  const dirty = csm.mergeRegistrationRequests(local, {
    SV001: {
      mssv: 'SV001',
      submittedAt: '2030-01-01T00:00:00.000Z',
      shifts: { 1: ['T2_S', '<img onerror=alert(1)>', 'T9_X'], 2: 'khong-phai-mang', 5: ['T2_S'] },
      availableShifts: ['T2_S', 'T2_S', 'X', 123]
    }
  });
  assert(dirty.mergedCount === 1, '11.5: Yêu cầu mới vẫn được gộp');
  assert(JSON.stringify(dirty.students[0].monthlyAvailableShifts[1]) === JSON.stringify(['T2_S']),
    `11.6: Chỉ giữ mã ca hợp lệ. Thực tế: ${JSON.stringify(dirty.students[0].monthlyAvailableShifts)}`);
  assert(dirty.students[0].monthlyAvailableShifts[5] === undefined,
    '11.7: Bỏ khoá tuần nằm ngoài 1..4');
  assert(JSON.stringify(dirty.students[0].availableShifts) === JSON.stringify(['T2_S']),
    `11.8: Lọc trùng & phần tử không phải chuỗi. Thực tế: ${JSON.stringify(dirty.students[0].availableShifts)}`);
  assert(dirty.students[0].updatedAt <= Date.now() + 120000,
    '11.9: Mốc thời gian tương lai phải bị chặn (không cho khoá bản ghi vĩnh viễn)');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  const merged = csm.mergeSwapRequests(
    [{ id: 's1', status: 'pending', createdAt: '2026-10-21T00:00:00.000Z' }],
    [
      { id: 's1', status: 'approved', createdAt: '2026-10-21T00:00:00.000Z' },
      { id: 's2', status: 'pending', createdAt: '2026-10-22T00:00:00.000Z' }
    ]
  );
  assert(merged.length === 2 && merged[0].id === 's2',
    '11.5: Gộp & sắp xếp đề xuất mới nhất trước');
  assert(merged.find(x => x.id === 's1').status === 'approved',
    '11.6: Trạng thái approved từ Cloud phải thắng pending cục bộ');

  const keepLocal = csm.mergeSwapRequests(
    [{ id: 's3', status: 'rejected', createdAt: '2026-10-20T00:00:00.000Z' }],
    [{ id: 's3', status: 'pending', createdAt: '2026-10-20T00:00:00.000Z' }]
  );
  assert(keepLocal[0].status === 'rejected',
    '11.7: Không để bản pending trên Cloud ghi đè kết quả đã duyệt trên máy');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({ enabled: false, databaseUrl: 'https://req-db.firebaseio.com' });
  env.localStorage.setItem(K.STUDENTS, JSON.stringify([
    { studentId: 'SV001', fullName: 'A', updatedAt: 0 }
  ]));
  env.localStorage.setItem(K.ADMIN_USERS, JSON.stringify([{ username: 'admin' }]));

  const res = csm.applyRequestsPayload({
    registrations: {
      SV001: {
        mssv: 'SV001',
        submittedAt: '2026-10-22T10:00:00.000Z',
        shifts: { 1: ['NEW'] },
        availableShifts: ['NEW']
      }
    },
    swaps: {
      s1: { id: 's1', status: 'pending', createdAt: '2026-10-22T00:00:00.000Z' }
    }
  });
  assert(res.success === true && res.mergedRegistrations === 1 && res.mergedSwaps === 1,
    '11.8: applyRequestsPayload phải báo đúng số yêu cầu đã gộp');
  const students = JSON.parse(env.localStorage.getItem(K.STUDENTS));
  assert(students[0].monthlyAvailableShifts[1][0] === 'NEW',
    '11.9: Đăng ký mới phải được ghi vào danh sách CTV');
  const swaps = JSON.parse(env.localStorage.getItem(K.SWAP_REQUESTS));
  assert(swaps.length === 1 && swaps[0].id === 's1',
    '11.10: Đề xuất đổi ca phải được ghi vào hàng chờ duyệt');
  assert(JSON.parse(env.localStorage.getItem(K.ADMIN_USERS))[0].username === 'admin',
    '11.11: Gộp yêu cầu không được đụng tài khoản cán bộ');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://req-db.firebaseio.com',
    apiKey: 'AIza_ADMIN_TEST',
    authEmail: 'office@tvts.local',
    authPassword: 'matkhau'
  });
  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.includes('identitytoolkit')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ idToken: 'ADMIN_TOKEN', expiresIn: '3600' })
      };
    }
    if (url.includes('/tvts_requests/swaps/s1.json')) {
      return { ok: true, status: 200, json: async () => ({ status: 'approved' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ registrations: {}, swaps: {} })
    };
  };
  env.sandbox.fetch = env.window.fetch;

  const update = await csm.updateSwapRequest('s1', { status: 'approved' });
  assert(update.success === true,
    `11.12: updateSwapRequest phải thành công. Lỗi: ${update.error || ''}`);
  const patchCall = calls.find(c => c.method === 'PATCH');
  assert(patchCall && patchCall.url.includes('/tvts_requests/swaps/s1.json'),
    '11.13: Phải PATCH đúng yêu cầu đổi ca');
  assert(patchCall && /[?&]auth=ADMIN_TOKEN/.test(patchCall.url),
    '11.14: Cập nhật phải dùng token cán bộ');
  assert(patchCall && JSON.parse(patchCall.body).status === 'approved',
    '11.15: Gửi đúng trạng thái approved');

  const pull = await csm.pullRequests();
  assert(pull.success === true,
    `11.16: pullRequests phải thành công. Lỗi: ${pull.error || ''}`);
  assert(pull.data && typeof pull.data === 'object',
    '11.17: pullRequests trả về object yêu cầu');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const K = csm.STORAGE_KEYS;

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://req-db.firebaseio.com',
    authEmail: '',
    authPassword: ''
  });
  env.localStorage.setItem(K.SWAP_REQUESTS, JSON.stringify([
    { id: 's1', status: 'rejected', createdAt: '2026-10-20T00:00:00.000Z' }
  ]));

  let requestedUrl = '';
  env.window.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        s1: { id: 's1', status: 'pending', createdAt: '2026-10-20T00:00:00.000Z' },
        s2: { id: 's2', status: 'pending', createdAt: '2026-10-22T00:00:00.000Z' }
      })
    };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.pullPublicSwaps();
  assert(res.success === true, '11.18: pullPublicSwaps phải thành công');
  assert(requestedUrl.includes('/tvts_requests/swaps.json'),
    '11.19: Chỉ đọc nhánh swaps công khai');
  const swaps = JSON.parse(env.localStorage.getItem(K.SWAP_REQUESTS));
  assert(swaps.length === 2 && swaps.find(s => s.id === 's1').status === 'rejected',
    '11.20: Giữ kết quả đã duyệt trên máy, chỉ thêm đề xuất mới');
}

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: false,
    databaseUrl: 'https://staff-db.firebaseio.com',
    apiKey: 'AIza_STAFF_TEST',
    authEmail: 'staff@tvts.local',
    authPassword: 'matkhau'
  });
  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url.includes('identitytoolkit')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ idToken: 'STAFF_TOKEN', expiresIn: '3600' })
      };
    }
    if (url.includes('/staff/STAFF_UID.json')) {
      return { ok: true, status: 200, json: async () => true };
    }
    if (url.includes('/staff_emails/staff%40tvts%252Elocal.json')) {
      return { ok: true, status: 200, json: async () => true };
    }
    return { ok: true, status: 200, json: async () => null };
  };
  env.sandbox.fetch = env.window.fetch;

  const allowed = await csm.checkStaffAccess('STAFF_UID');
  assert(allowed.success === true && allowed.allowed === true,
    '11.21: UID có trong /staff phải được phép đăng nhập Google');
  const staffCall = calls.find(c => c.url.includes('/staff/STAFF_UID.json'));
  assert(staffCall && /[?&]auth=STAFF_TOKEN/.test(staffCall.url),
    '11.22: Phải đọc /staff/<uid> bằng ID token của chính tài khoản Google');

  const denied = await csm.checkStaffAccess('OTHER_UID');
  assert(denied.success === true && denied.allowed === false,
    '11.23: UID không có trong /staff phải bị từ chối mở dashboard');

  // Email được add trước trong /staff_emails phải mở được dashboard dù UID
  // chưa có trong /staff. Key email phải mã hóa dấu chấm thành %2E.
  const emailAllowed = await csm.checkStaffAccess('EMAIL_UID', 'staff@tvts.local');
  const emailCall = calls.find(c => c.url.includes('/staff_emails/'));
  assert(emailAllowed.success === true
    && emailAllowed.allowed === true
    && emailAllowed.via === 'email'
    && csm.encodeStaffEmailKey('A.B.C@Gmail.com') === 'a%2Eb%2Ec@gmail%2Ecom'
    && emailCall
    && emailCall.url.includes('/staff_emails/staff%40tvts%252Elocal.json'),
  '11.24: Email đã cấp trước trong /staff_emails phải được phép đăng nhập');
}

// -----------------------------------------------------------------------------
// GROUP 12: Cấu hình trang & Security Rules
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 12] Cấu Hình Trang & Security Rules:');

{
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  let rules = null;
  let rulesError = '';
  try {
    rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8'));
  } catch (e) {
    rulesError = e.message;
  }

  assert(/<meta\s+name="tvts-cloud-role"\s+content="student"/.test(indexHtml),
    '12.1: Trang sinh viên phải khai báo chế độ student bằng thẻ meta');
  assert(indexHtml.includes('firebase-app-compat.js')
    && indexHtml.includes('firebase-auth-compat.js'),
  '12.2: Trang sinh viên phải nạp Firebase SDK để tạo phiên ẩn danh');
  assert(!/window\.TVTS_CLOUD_ROLE\s*=/.test(indexHtml),
    '12.3: Không dùng biến window trong HTML (tránh guard dead-selector)');
  assert(/<meta\s+name="tvts-publish-public"\s+content="true"/.test(adminHtml),
    '12.4: Trang admin phải bật cờ tự đẩy nhánh công khai bằng thẻ meta');
  assert(adminHtml.includes('btn-cloud-google-login')
    && adminHtml.includes('btn-cloud-pull-requests'),
  '12.5: Admin phải có nút Đăng nhập Google và nút nhận ca rảnh');
  assert(!adminHtml.includes('cloud-input-auth-email')
    && !adminHtml.includes('cloud-input-auth-password'),
  '12.6: Đã bỏ tài khoản Email/Password dùng chung khỏi UI admin');
  assert(adminHtml.includes('btn-admin-google-login')
    && adminHtml.includes('admin-google-auth-status'),
  '12.6b: Màn hình đăng nhập admin phải có nút Google và vùng trạng thái');
  assert(!adminHtml.includes('Kéo &amp; Duyệt Yêu Cầu')
    && !adminHtml.includes('Kéo & Duyệt Yêu Cầu'),
  '12.6c: Không còn nút "Kéo & Duyệt" cho đăng ký ca rảnh');
  assert(adminHtml.includes('count-availability-shifts'),
  '12.6d: Dashboard phải có thẻ tổng lượt ca rảnh đã đăng ký');
  const cloudJs = fs.readFileSync(path.join(__dirname, '../js/cloud_sync.js'), 'utf8');
  assert(/prompt:\s*'select_account'/.test(cloudJs),
  '12.6e: Đăng nhập Google phải luôn mở bảng chọn tài khoản');

  assert(rules && rules.rules, '12.7: database.rules.json phải là JSON hợp lệ: ' + rulesError);
  const r = (rules && rules.rules) || {};
  assert(r.tvts_production_data && /staff/.test(r.tvts_production_data['.read'] || ''),
    '12.8: Dữ liệu riêng tư chỉ cho tài khoản trong /staff hoặc email đã cấp đọc');
  assert(r.tvts_public && r.tvts_public['.read'] === true,
    '12.9: Nhánh công khai cho phép mọi người đọc');
  assert(r.tvts_requests && r.tvts_requests.registrations && r.tvts_requests.swaps,
    '12.10: Rules phải có nhánh registrations & swaps cho yêu cầu sinh viên');
  assert(/auth\.uid/.test((r.tvts_requests.registrations['$mssv'] || {})['.write'] || '')
    && /auth\.uid/.test((r.tvts_requests.swaps['$swapId'] || {})['.write'] || ''),
  '12.11: Sinh viên chỉ được ghi yêu cầu gắn với uid của chính mình');
  assert(/auth\.uid/.test((r.staff && r.staff['$uid'] || {})['.read'] || ''),
  '12.12: Rules cho phép cán bộ đọc đúng node staff/<uid> của mình');
  const adminJsSrc = fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8');
  assert(adminJsSrc.includes('function canAutoPushToCloud')
    && /syncImmediate && canAutoPushToCloud\(\)/.test(adminJsSrc),
  '12.13: Lưu cục bộ phải tôn trọng Cloud đang tắt, không tự gửi Firebase');

  const staffEmails = (r.staff_emails || {});
  const emailReadRule = staffEmails['.read'] || '';
  const emailWriteRule = staffEmails['.write'] || '';
  assert(/auth\.token\.email/.test(emailReadRule)
    && emailReadRule.includes('auth.token.email_verified === true')
    && emailReadRule.includes("sign_in_provider === 'google.com'")
    && /auth\.token\.email/.test(emailWriteRule)
    && emailWriteRule.includes('auth.token.email_verified === true')
    && emailWriteRule.includes("sign_in_provider === 'google.com'")
    && /isBoolean/.test((staffEmails['$emailKey'] || {})['.validate'] || ''),
  '12.14: /staff_emails chỉ cho cán bộ Google đã xác thực cấp/thu quyền, giá trị phải là boolean');

  const productionReadRule = (r.tvts_production_data || {})['.read'] || '';
  assert(productionReadRule.includes('staff_emails')
    && /auth\.token\.email/.test(productionReadRule)
    && productionReadRule.includes('auth.token.email_verified === true')
    && productionReadRule.includes("sign_in_provider === 'google.com'")
    && adminJsSrc.includes('checkStaffAccess(user.uid, user.email)'),
  '12.15: Dữ liệu riêng tư mở cho email Google đã cấp và admin phải truyền email khi kiểm tra');

  // Chống ghi đè đăng ký của MSSV người khác
  const regRule = ((r.tvts_requests || {}).registrations || {})['$mssv'] || {};
  assert(/mssv_owner/.test(regRule['.write'] || ''),
    '12.16: Ghi đăng ký phải phụ thuộc mssv_owner (chống ghi đè đăng ký của MSSV khác)');
  const ownerRule = ((r.tvts_requests || {}).mssv_owner || {})['$mssv'] || {};
  assert(/!data\.exists\(\)/.test(ownerRule['.write'] || '')
    && /auth\.uid/.test(ownerRule['.write'] || ''),
  '12.17: mssv_owner chỉ giữ chỗ MỘT lần cho đúng uid');

  // Sinh viên không được tự duyệt đề xuất đổi ca
  const swapRule = ((r.tvts_requests || {}).swaps || {})['$swapId'] || {};
  const swapWrite = swapRule['.write'] || '';
  assert(swapWrite.includes("newData.child('status').val() === 'pending'")
    && swapWrite.includes("data.child('status').val() === 'pending'")
    && swapWrite.includes("newData.child('status').val() === 'cancelled'"),
  '12.18: Sinh viên chỉ tạo được status pending và chỉ huỷ được yêu cầu đang pending');
  assert(!/newData\.child\('status'\)\.val\(\) === 'approved'/.test(swapWrite),
    '12.19: Không có nhánh nào cho sinh viên tự đặt status approved');
  assert(/cancelled/.test(swapRule['.validate'] || '')
    && /approved/.test(swapRule['.validate'] || ''),
  '12.20: Validate chặn giá trị status lạ');
}

// -----------------------------------------------------------------------------
// GROUP 13: Cấp / Thu hồi quyền cán bộ theo email (nút trong trang admin)
// -----------------------------------------------------------------------------
console.log('\n▶ [GROUP 13] Cấp Quyền Cán Bộ Theo Email:');

{
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;
  const calls = [];

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://staff-db.firebaseio.com',
    syncPath: 'tvts_production_data',
    apiKey: 'AIza_key',
    authEmail: 'owner@tvts.local',
    authPassword: 'matkhau'
  });

  env.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'TOKEN_X', expiresIn: '3600' }) };
    }
    if (options.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => null };
    }
    if (options.method === 'PUT') {
      return { ok: true, status: 200, json: async () => true };
    }
    return {
      ok: true, status: 200,
      json: async () => ({ 'a%2Eb@gmail%2Ecom': true, 'da%2Exoa@gmail%2Ecom': false })
    };
  };
  env.sandbox.fetch = env.window.fetch;

  const bad = await csm.grantStaffEmail('khong-phai-email');
  assert(bad.success === false && /không hợp lệ/i.test(bad.error || ''),
    '13.1: Từ chối email sai định dạng (không gọi Firebase)');

  const granted = await csm.grantStaffEmail('A.B@gmail.com');
  assert(granted.success === true, `9.2: Cấp quyền thành công. Lỗi: ${granted.error}`);

  const putCall = calls.find(c => c.method === 'PUT');
  assert(putCall && putCall.url.includes('staff_emails/'),
    '13.3: Ghi đúng nhánh /staff_emails');
  // Email phải được mã hoá 2 lớp: %2E (thay dấu chấm) rồi encodeURIComponent.
  assert(putCall.url.includes('a%252Eb%40gmail%252Ecom'),
    `9.4: Khoá email phải mã hoá dấu chấm thành %2E. Thực tế: ${putCall.url}`);
  assert(putCall.url.includes('auth=TOKEN_X'), '13.5: Request phải kèm ID token của cán bộ');
  assert(putCall.body === 'true', `9.6: Giá trị phải là boolean true. Thực tế: ${putCall.body}`);

  const listed = await csm.listStaffEmails();
  assert(listed.success === true, '13.7: Đọc được danh sách email đã cấp quyền');
  assert(listed.emails.length === 1 && listed.emails[0] === 'a.b@gmail.com',
    `9.8: Giải mã %2E về dấu chấm và bỏ email đã thu hồi. Thực tế: ${JSON.stringify(listed.emails)}`);

  const revoked = await csm.revokeStaffEmail('a.b@gmail.com');
  assert(revoked.success === true, '13.9: Thu hồi quyền thành công');
  const delCall = calls.find(c => c.method === 'DELETE');
  assert(delCall && delCall.url.includes('a%252Eb%40gmail%252Ecom'),
    '13.10: Thu hồi phải DELETE đúng node email');
}

{
  // Tài khoản đang đăng nhập chưa có quyền -> Firebase trả 401
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://staff-db.firebaseio.com',
    apiKey: 'AIza_key',
    authEmail: 'nhanvien@tvts.local',
    authPassword: 'matkhau'
  });

  env.window.fetch = async (url, options = {}) => {
    if (url.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'TOKEN_Y', expiresIn: '3600' }) };
    }
    return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: 'Permission denied' }) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.grantStaffEmail('nguoi-moi@gmail.com');
  assert(res.success === false, '13.11: Không có quyền thì cấp quyền phải thất bại');
  assert(/chưa có quyền cấp quyền/i.test(res.error || ''),
    `13.12: Thông báo phải chỉ rõ cần OWNER_EMAIL hoặc /staff. Thực tế: ${res.error}`);
}

{
  // Chưa đăng nhập / chưa được cấp quyền -> đọc danh sách phải báo dễ hiểu, không phải "HTTP 401"
  const env = createMockEnvironment();
  const csm = env.CloudSyncManager;

  csm.saveConfig({
    enabled: true,
    databaseUrl: 'https://staff-db.firebaseio.com',
    apiKey: 'AIza_key',
    authEmail: 'nhanvien@tvts.local',
    authPassword: 'matkhau'
  });

  env.window.fetch = async (url) => {
    if (url.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'TOKEN_Z', expiresIn: '3600' }) };
    }
    return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: 'Permission denied' }) };
  };
  env.sandbox.fetch = env.window.fetch;

  const res = await csm.listStaffEmails();
  assert(res.success === false, '13.13: Chưa có quyền thì không đọc được danh sách');
  assert(/Đăng nhập Google|chưa được cấp quyền/i.test(res.error || ''),
    `13.14: Thông báo 401 phải hướng dẫn đăng nhập/cấp quyền. Thực tế: ${res.error}`);
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

