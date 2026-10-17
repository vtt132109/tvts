/**
 * ==========================================================================
 * CLOUD SYNC MANAGER (Đồng Bộ Đám Mây Đa Thiết Bị - Firebase REST API)
 * ==========================================================================
 * Hỗ trợ đồng bộ hai chiều (Cloud ↔ LocalStorage) tự động giữa mọi máy tính,
 * điện thoại và các Tab Ẩn Danh (Incognito).
 * Hoạt động theo nguyên tắc Offline-First: Luôn dùng được bình thường khi mất mạng.
 */

(() => {
  'use strict';

  const STORAGE_KEYS = {
    CLOUD_CONFIG: 'ts_scheduler_cloud_config',
    STUDENTS: 'ts_scheduler_students',
    SCHEDULE: 'ts_scheduler_schedule_result',
    TWO_WEEK_SCHEDULE: 'ts_scheduler_two_week_result',
    MONTH_SCHEDULE: 'ts_scheduler_month_result',
    REG_CONFIG: 'ts_scheduler_reg_config',
    ADMIN_USERS: 'ts_scheduler_admin_users',
    SWAP_REQUESTS: 'ts_scheduler_swap_requests',
    WEB_BACKUPS: 'ts_scheduler_web_backups_v1',
    EVENTS: 'ts_scheduler_events_v1',
    ALL_MONTHS: 'ts_scheduler_all_months_v1',
    ACTIVE_MONTH: 'ts_scheduler_active_month_v1'
  };

  // Cấu hình đồng bộ mặc định (Tích hợp sẵn Cơ sở dữ liệu Firebase của Ban Tuyển Sinh)
  const DEFAULT_CONFIG = {
    enabled: true,
    provider: 'firebase',
    databaseUrl: 'https://vtt123-76e07-default-rtdb.firebaseio.com',
    apiKey: '',
    syncPath: 'tvts_production_data',
    autoSync: true,
    lastSyncTime: null,
    deviceId: ''
  };

  // Danh sách tài khoản khởi tạo CHỈ dùng khi máy chưa có dữ liệu nào.
// LƯU Ý BẢO MẬT: đây là thông tin công khai trong mã nguồn. Ban Tuyển Sinh
// phải đổi mật khẩu & PIN ngay sau lần đăng nhập đầu tiên trên mỗi thiết bị.
// Tài khoản thật KHÔNG được commit vào kho công khai.
  const FALLBACK_ADMIN_USERS = [
    {
      id: 'usr_admin',
      username: 'admin',
      password: '0000',
      pin: '9999',
      fullName: 'Trưởng Ban Tuyển Sinh',
      role: 'Trưởng ban điều hành'
    },
    {
      id: 'usr_diephoi',
      username: 'diephoi',
      password: '0000',
      pin: '8888',
      fullName: 'Cán Bộ Điều Phối Tuyển Sinh',
      role: 'Điều phối viên tuyển sinh'
    }
  ];

  // Khởi tạo Device ID duy nhất cho mỗi máy/tab
  function getOrCreateDeviceId() {
    let devId = '';
    try {
      devId = localStorage.getItem('ts_cloud_device_id');
      if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('ts_cloud_device_id', devId);
      }
    } catch (e) {
      devId = 'dev_temp_' + Date.now();
    }
    return devId;
  }

  // Lấy cấu hình đồng bộ hiện hành
  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CLOUD_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.databaseUrl) {
          parsed.databaseUrl = DEFAULT_CONFIG.databaseUrl;
          parsed.enabled = true;
        }
        return Object.assign({}, DEFAULT_CONFIG, parsed, {
          deviceId: getOrCreateDeviceId()
        });
      }
    } catch (e) {}

    // Fallback: Kiểm tra xem có cấu hình nhúng trước trong window hay không
    if (window.TVTS_CLOUD_CONFIG && typeof window.TVTS_CLOUD_CONFIG === 'object') {
      return Object.assign({}, DEFAULT_CONFIG, window.TVTS_CLOUD_CONFIG, {
        deviceId: getOrCreateDeviceId()
      });
    }

    return Object.assign({}, DEFAULT_CONFIG, {
      deviceId: getOrCreateDeviceId()
    });
  }

  // Lưu cấu hình đồng bộ
  function saveConfig(cfg) {
    try {
      const clean = Object.assign({}, getConfig(), cfg);
      localStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(clean));
      notifyStatusChange();
      return { success: true, config: clean };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Chuẩn hóa Firebase Realtime Database URL
  function formatFirebaseUrl(databaseUrl, syncPath, apiKey) {
    if (!databaseUrl || typeof databaseUrl !== 'string') return null;
    let base = databaseUrl.trim().replace(/\/+$/, '');
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = 'https://' + base;
    }
    const path = (syncPath || 'tvts_production_data').trim().replace(/^\/+|\/+$/g, '');
    let finalUrl = `${base}/${path}.json`;
    if (apiKey && apiKey.trim()) {
      finalUrl += `?auth=${encodeURIComponent(apiKey.trim())}`;
    }
    return finalUrl;
  }

  /**
 * Ghi an toàn vào localStorage, có bắt QuotaExceededError.
 * @returns {boolean} true nếu ghi thành công
 */
  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      const isQuota = e && (e.name === 'QuotaExceededError'
        || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || e.code === 22 || e.code === 1014);
      if (isQuota) {
        console.warn(`[CloudSync] Đã đầy dung lượng lưu trữ khi ghi "${key}".`);
        try {
          window.dispatchEvent(new CustomEvent('ts:storage-full', {
            detail: { key, message: 'Bộ nhớ trình duyệt đã đầy. Hãy xoá bản sao lưu cũ hoặc xuất file .json để lưu an toàn.' }
          }));
        } catch (e2) {}
      } else {
        console.warn(`[CloudSync] Lỗi ghi "${key}":`, e);
      }
      return false;
    }
  }

  /** Đo dung lượng localStorage đã dùng (byte, xấp xỉ). */
  function estimateStorageUsage() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        total += (k ? k.length : 0) + v.length;
      }
    } catch (e) {}
    return total * 2; // UTF-16
  }

  // Đóng gói toàn bộ LocalStorage thành Payload đồng bộ
  function buildPayload() {
    function readKey(k, defaultValue) {
      try {
        const raw = localStorage.getItem(k);
        if (raw === null || raw === undefined) return defaultValue;
        try {
          return JSON.parse(raw);
        } catch (jsonErr) {
          return raw;
        }
      } catch (e) {
        return defaultValue;
      }
    }

    let localAdmins = readKey(STORAGE_KEYS.ADMIN_USERS, []);
    if (!Array.isArray(localAdmins) || localAdmins.length === 0) {
      localAdmins = FALLBACK_ADMIN_USERS;
    }

    const payload = {
      adminUsers: localAdmins,
      students: readKey(STORAGE_KEYS.STUDENTS, []),
      scheduleResult: readKey(STORAGE_KEYS.SCHEDULE, null),
      twoWeekSchedule: readKey(STORAGE_KEYS.TWO_WEEK_SCHEDULE, null),
      monthSchedule: readKey(STORAGE_KEYS.MONTH_SCHEDULE, null),
      regConfig: readKey(STORAGE_KEYS.REG_CONFIG, null),
      swapRequests: readKey(STORAGE_KEYS.SWAP_REQUESTS, []),
      events: readKey(STORAGE_KEYS.EVENTS, []),
      webBackups: readKey(STORAGE_KEYS.WEB_BACKUPS, []),
      allMonthSchedules: readKey(STORAGE_KEYS.ALL_MONTHS, {}),
      allMonths: readKey(STORAGE_KEYS.ALL_MONTHS, {}),
      // Luôn xuất activeMonth dưới dạng object {month, year} cho nhất quán
      // với applyPayload (chấp nhận được cả chuỗi cũ).
      activeMonth: normalizeActiveMonth(readKey(STORAGE_KEYS.ACTIVE_MONTH, null)),
      updatedAt: Date.now(),
      deviceId: getOrCreateDeviceId(),
      version: '1.1'
    };

    return payload;
  }

  /**
   * Chuẩn hoá activeMonth về {month, year}.
   * Nhận được: {month, year} | "2026-12" | "12/2026" | 12
   */
  function normalizeActiveMonth(input) {
    if (input === undefined || input === null || input === '') return null;
    if (typeof input === 'object') {
      const m = parseInt(input.month, 10);
      const y = parseInt(input.year, 10);
      if (!m) return null;
      return { month: m, year: y || 2026 };
    }
    if (typeof input === 'number') {
      return { month: input, year: new Date().getFullYear() };
    }
    const s = String(input).trim();
    const byDash = s.match(/^(\d{4})-(\d{1,2})$/);
    if (byDash) return { month: parseInt(byDash[2], 10), year: parseInt(byDash[1], 10) };
    const bySlash = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (bySlash) return { month: parseInt(bySlash[1], 10), year: parseInt(bySlash[2], 10) };
    const n = parseInt(s, 10);
    if (n) return { month: n, year: new Date().getFullYear() };
    return null;
  }

  // Áp dụng Payload từ Cloud vào LocalStorage an toàn
  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload không hợp lệ' };
    }

    const touchedKeys = [];

    /** Ghi an toàn, ghi nhận key đã thay đổi để phát sự kiện cho UI. */
    function writeKey(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        touchedKeys.push(key);
        return true;
      } catch (e) {
        console.warn(`[CloudSync] Không ghi được "${key}":`, e);
        return false;
      }
    }

    try {
      // 1. Đồng bộ danh sách tài khoản cán bộ & Mã PIN mới nhất
      if (Array.isArray(payload.adminUsers) && payload.adminUsers.length > 0) {
        let currentLocal = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_USERS);
          if (raw) currentLocal = JSON.parse(raw) || [];
        } catch (e) {}

        const mergedMap = new Map();
        currentLocal.forEach(u => u.username && mergedMap.set(u.username.toLowerCase(), u));
        payload.adminUsers.forEach(u => u.username && mergedMap.set(u.username.toLowerCase(), u));

        writeKey(STORAGE_KEYS.ADMIN_USERS, Array.from(mergedMap.values()));
      }

      // 2. Đồng bộ danh sách sinh viên đăng ký
      if (Array.isArray(payload.students)) {
        writeKey(STORAGE_KEYS.STUDENTS, payload.students);
      }

      // 3. Đồng bộ lịch phân ca tháng & tuần
      if (payload.monthSchedule) {
        writeKey(STORAGE_KEYS.MONTH_SCHEDULE, payload.monthSchedule);
      }
      if (payload.scheduleResult) {
        writeKey(STORAGE_KEYS.SCHEDULE, payload.scheduleResult);
      }
      if (payload.twoWeekSchedule) {
        writeKey(STORAGE_KEYS.TWO_WEEK_SCHEDULE, payload.twoWeekSchedule);
      }

      // 4. Đồng bộ cấu hình cổng tuyển sinh
      if (payload.regConfig && typeof payload.regConfig === 'object') {
        writeKey(STORAGE_KEYS.REG_CONFIG, payload.regConfig);
      }

      // 5. Đồng bộ sự kiện & sao lưu
      if (Array.isArray(payload.events)) {
        writeKey(STORAGE_KEYS.EVENTS, payload.events);
      }
      if (Array.isArray(payload.webBackups)) {
        writeKey(STORAGE_KEYS.WEB_BACKUPS, payload.webBackups);
      }
      if (Array.isArray(payload.swapRequests)) {
        writeKey(STORAGE_KEYS.SWAP_REQUESTS, payload.swapRequests);
      }
      const allMonthsData = payload.allMonthSchedules || payload.allMonths;
      if (allMonthsData && typeof allMonthsData === 'object') {
        writeKey(STORAGE_KEYS.ALL_MONTHS, allMonthsData);
      }
      if (payload.activeMonth !== undefined && payload.activeMonth !== null) {
        // Chuẩn hoá về object {month, year} — chấp nhận cả dạng chuỗi "2026-12"
        // của phiên bản cũ, tránh mất vị trí tháng khi kéo từ Cloud cũ.
        const normalized = normalizeActiveMonth(payload.activeMonth);
        if (normalized && safeSetItem(STORAGE_KEYS.ACTIVE_MONTH, JSON.stringify(normalized))) {
          touchedKeys.push(STORAGE_KEYS.ACTIVE_MONTH);
        }
      }

      // Cập nhật timestamp lần đồng bộ
      const cfg = getConfig();
      cfg.lastSyncTime = Date.now();
      // Ghi nhận mốc thời gian của bản trên Cloud để phát hiện xung đột ở lần sau
      if (payload.updatedAt) cfg.lastCloudUpdatedAt = payload.updatedAt;
      safeSetItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(cfg));

      // Phát sự kiện để các view lắng nghe và re-render tự động.
      // Lưu ý: Event('storage') thuần KHÔNG có .key nên các nhánh e.key===... không
      // bao giờ chạy. Dùng CustomEvent 'ts:data-changed' kèm danh sách key.
      try {
        window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: touchedKeys } }));
        window.dispatchEvent(new CustomEvent('ts:cloud-synced', { detail: { payload } }));
      } catch (evErr) {}

      // Nếu hàm adminReloadAdminUsers có sẵn (ở màn hình đăng nhập), kích hoạt nạp lại
      if (typeof window.adminReloadAdminUsers === 'function') {
        window.adminReloadAdminUsers();
      }

      notifyStatusChange();
      return { success: true, timestamp: cfg.lastSyncTime, keys: touchedKeys };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Đẩy dữ liệu từ LocalStorage lên Firebase Cloud (Push)
  async function pushToCloud(customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, cfg.apiKey);
    if (!url) {
      return { success: false, error: 'URL Firebase không hợp lệ!' };
    }

    const payload = buildPayload();

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();

      // Cùng bẫy với pull: Rules từ chối thì Firebase trả 200 + {"error": ...}.
      // Không kiểm tra thì báo "đẩy thành công" trong khi dữ liệu chưa lên Cloud,
      // và mất cả cờ "không còn thay đổi chưa đẩy" (localUpdatedAt = 0).
      if (result && typeof result === 'object' && result.error) {
        const detail = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        return {
          success: false,
          error: `Firebase từ chối ghi: ${detail}` +
            ' — hãy kiểm tra Security Rules trong Firebase Console' +
            ' (Database > Rules), hoặc tắt xác thực ẩn danh nếu đang bật.'
        };
      }

      cfg.lastSyncTime = Date.now();
      // Ghi nhận mốc đã đẩy lên Cloud, dùng để phát hiện xung đột ở lần kéo sau
      cfg.lastCloudUpdatedAt = payload.updatedAt || cfg.lastSyncTime;
      // Không còn thay đổi cục bộ chưa được đẩy
      cfg.localUpdatedAt = 0;
      saveConfig(cfg);

      return {
        success: true,
        timestamp: cfg.lastSyncTime,
        message: 'Đã đẩy dữ liệu lên Đám mây thành công!',
        data: result
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Lỗi kết nối Firebase Cloud'
      };
    }
  }

  // Kéo dữ liệu từ Firebase Cloud về LocalStorage (Pull)
  async function pullFromCloud(customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, cfg.apiKey);
    if (!url) {
      return { success: false, error: 'URL Firebase không hợp lệ!' };
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();

      // ⚠️ BẪY NGHIÊM TRỌNG CỦA FIREBASE REST:
      // Khi Security Rules từ chối truy cập, Firebase KHÔNG trả HTTP 4xx/5xx mà
      // trả HTTP 200 kèm body {"error": "Permission denied"}.
      // Trước đây chỉ kiểm tra response.ok nên:
      //   1) coi đây là thành công,
      //   2) áp payload rỗng (vì data.error không phải payload) — GHI ĐÈ MẤT
      //      toàn bộ dữ liệu cục bộ,
      //   3) trả về { success: true } khiến người dùng tin là đã kéo xong.
      // Nay kiểm tra body để bắt đúng trường hợp này.
      if (data && typeof data === 'object' && data.error) {
        const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(`Firebase từ chối truy cập: ${detail}` +
          ' — hãy kiểm tra Security Rules trong Firebase Console' +
          ' (Database > Rules), hoặc tắt xác thựnh ẩn danh nếu đang bật.');
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {
          success: true,
          message: 'Đám mây hiện chưa có dữ liệu nào để kéo.',
          data: null
        };
      }

      // Phát hiện xung đột: Cloud có bản mới hơn bản lần cuối máy này đồng bộ không?
      const lastCloudUpdatedAt = cfg.lastCloudUpdatedAt || 0;
      const cloudUpdatedAt = data.updatedAt || 0;
      if (lastCloudUpdatedAt && cloudUpdatedAt && cloudUpdatedAt > lastCloudUpdatedAt) {
        const localTouchedAt = cfg.localUpdatedAt || 0;
        if (localTouchedAt > cloudUpdatedAt) {
          // Máy này có thay đổi mới hơn cả Cloud -> hỏi người dùng trước khi ghi đè
          const ok = typeof window.confirm === 'function'
            ? window.confirm(
              '⚠️ Phát hiện xung đột dữ liệu:\n\n' +
              '• Máy này vừa có thay đổi LÚC NÀY (chưa kịp đẩy lên Đám mây).\n' +
              '• Đám mây cũng có bản cập nhật từ thiết bị khác.\n\n' +
              'Chọn "OK" để GHI ĐÈ dữ liệu trên máy bằng bản từ Đám mây.\n' +
              'Chọn "Cancel" để GIỮ dữ liệu trên máy và bỏ qua lần kéo này.'
            )
            : true;

          if (!ok) {
            return {
              success: false,
              conflict: true,
              error: 'Đã bỏ qua kéo dữ liệu để giữ thay đổi cục bộ.',
              message: 'Phát hiện xung đột dữ liệu — đã giữ bản trên máy này.'
            };
          }
        }
      }

      const applyRes = applyPayload(data);
      if (!applyRes.success) {
        throw new Error(applyRes.error);
      }

      return {
        success: true,
        timestamp: Date.now(),
        keys: applyRes.keys,
        message: 'Đã kéo và đồng bộ dữ liệu mới nhất từ Đám mây về máy này thành công!',
        data
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Lỗi kết nối Firebase Cloud'
      };
    }
  }

  // Kiểm tra kết nối thử tới Firebase
  async function testConnection(cfg) {
    if (!cfg || !cfg.databaseUrl) {
      return { success: false, message: 'Vui lòng nhập URL Firebase Database!' };
    }

    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, cfg.apiKey);
    if (!url) {
      return { success: false, message: 'URL Firebase không đúng định dạng!' };
    }

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (res.ok) {
        return {
          success: true,
          message: 'Kết nối Firebase thành công! Cơ sở dữ liệu hoạt động bình thường.'
        };
      } else {
        const txt = await res.text();
        return {
          success: false,
          message: `Firebase trả về mã lỗi HTTP ${res.status} (${res.statusText}). Vui lòng kiểm tra quyền đọc (Rules) hoặc API Key.`
        };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, message: 'Kết nối tới Firebase bị quá thời gian (Timeout). Vui lòng kiểm tra mạng.' };
      }
      return { success: false, message: 'Không thể kết nối tới Firebase: ' + err.message };
    }
  }

  // Thông báo trạng thái thay đổi tới UI
  function notifyStatusChange() {
    try {
      const cfg = getConfig();
      const usedBytes = estimateStorageUsage();
      const event = new CustomEvent('ts:cloud-status', {
        detail: {
          enabled: Boolean(cfg.enabled && cfg.databaseUrl),
          lastSyncTime: cfg.lastSyncTime,
          databaseUrl: cfg.databaseUrl,
          lastCloudUpdatedAt: cfg.lastCloudUpdatedAt || null,
          storageUsedBytes: usedBytes,
          storageUsedMB: Math.round((usedBytes / (1024 * 1024)) * 100) / 100
        }
      });
      window.dispatchEvent(event);
    } catch (e) {}
  }

  // Tự động khởi tạo và kéo dữ liệu khi tải trang (Auto-Pull on Boot)
  async function autoInit() {
    const cfg = getConfig();
    if (cfg.enabled && cfg.databaseUrl) {
      try {
        await pullFromCloud(cfg);
      } catch (e) {
        console.warn('[CloudSync] Tự động kéo dữ liệu ban đầu không thành công:', e.message);
      }
    }
  }

  // Kích hoạt đồng bộ tự động khi có thay đổi trên local (Debounced Auto-Push)
  let autoPushTimer = null;
  function triggerAutoPush() {
    const cfg = getConfig();
    if (!cfg.enabled || !cfg.databaseUrl || !cfg.autoSync) return;

    // Đánh dấu có thay đổi cục bộ chưa đẩy lên Cloud (phục vụ phát hiện xung đột)
    try {
      cfg.localUpdatedAt = Date.now();
      localStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(cfg));
    } catch (e) {}

    if (autoPushTimer) clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(() => {
      pushToCloud().catch(err => {
        console.warn('[CloudSync] Tự động đẩy dữ liệu thất bại:', err.message);
      });
    }, 1500);
  }

  // Lắng nghe các thay đổi dữ liệu LocalStorage để tự động đẩy lên Cloud
  window.addEventListener('storage', (e) => {
    if (e.key && Object.values(STORAGE_KEYS).includes(e.key) && e.key !== STORAGE_KEYS.CLOUD_CONFIG) {
      triggerAutoPush();
    }
  });

  // Tự động chạy khi file JS được nạp
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      setTimeout(autoInit, 100);
    }
  }

  // Xuất API công khai ra window
  window.CloudSyncManager = {
    STORAGE_KEYS,
    DEFAULT_CONFIG,
    getConfig,
    saveConfig,
    formatFirebaseUrl,
    buildPayload,
    applyPayload,
    pushToCloud,
    pullFromCloud,
    testConnection,
    triggerAutoPush,
    autoInit,
    safeSetItem,
    estimateStorageUsage
  };

})();
