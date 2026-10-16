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

  // Khởi tạo Device ID duy nhất cho mỗi máy/tab
  function getOrCreateDeviceId() {
    let devId = '';
    try {
      devId = localStorage.getItem('ts_cloud_device_id');
      if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
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
      localAdmins = [
        { id: 'usr_admin', username: 'admin', password: '123', pin: '9999', fullName: 'Trưởng Ban Tuyển Sinh', role: 'Trưởng ban điều hành' },
        { id: 'usr_diephoi', username: 'diephoi', password: '123', pin: '8888', fullName: 'Cán Bộ Điều Phối Tuyển Sinh', role: 'Điều phối viên tuyển sinh' },
        { id: 'usr_1792146825856', username: 'thien', password: 'Thien3056', pin: '3056', fullName: 'Phạm Minh Thiện', role: 'Trưởng ban điều hành' }
      ];
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
      activeMonth: readKey(STORAGE_KEYS.ACTIVE_MONTH, null),
      updatedAt: Date.now(),
      deviceId: getOrCreateDeviceId(),
      version: '1.0'
    };

    return payload;
  }

  // Áp dụng Payload từ Cloud vào LocalStorage an toàn
  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload không hợp lệ' };
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

        const mergedList = Array.from(mergedMap.values());
        localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(mergedList));
      }

      // 2. Đồng bộ danh sách sinh viên đăng ký
      if (Array.isArray(payload.students)) {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(payload.students));
      }

      // 3. Đồng bộ lịch phân ca tháng & tuần
      if (payload.monthSchedule) {
        localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(payload.monthSchedule));
      }
      if (payload.scheduleResult) {
        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(payload.scheduleResult));
      }
      if (payload.twoWeekSchedule) {
        localStorage.setItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE, JSON.stringify(payload.twoWeekSchedule));
      }

      // 4. Đồng bộ cấu hình cổng tuyển sinh
      if (payload.regConfig && typeof payload.regConfig === 'object') {
        localStorage.setItem(STORAGE_KEYS.REG_CONFIG, JSON.stringify(payload.regConfig));
      }

      // 5. Đồng bộ sự kiện & sao lưu
      if (Array.isArray(payload.events)) {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(payload.events));
      }
      if (Array.isArray(payload.webBackups)) {
        localStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify(payload.webBackups));
      }
      if (Array.isArray(payload.swapRequests)) {
        localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(payload.swapRequests));
      }
      const allMonthsData = payload.allMonthSchedules || payload.allMonths;
      if (allMonthsData && typeof allMonthsData === 'object') {
        localStorage.setItem(STORAGE_KEYS.ALL_MONTHS, JSON.stringify(allMonthsData));
      }
      if (payload.activeMonth !== undefined && payload.activeMonth !== null) {
        const activeMonthVal = typeof payload.activeMonth === 'object' ? JSON.stringify(payload.activeMonth) : String(payload.activeMonth);
        localStorage.setItem(STORAGE_KEYS.ACTIVE_MONTH, activeMonthVal);
      }

      // Cập nhật timestamp lần đồng bộ
      const cfg = getConfig();
      cfg.lastSyncTime = Date.now();
      localStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(cfg));

      // Phát sự kiện để các view lắng nghe và re-render tự động
      try {
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('ts:cloud-synced', { detail: { payload } }));
      } catch (evErr) {}

      // Nếu hàm adminReloadAdminUsers có sẵn (ở màn hình đăng nhập), kích hoạt nạp lại
      if (typeof window.adminReloadAdminUsers === 'function') {
        window.adminReloadAdminUsers();
      }

      notifyStatusChange();
      return { success: true, timestamp: cfg.lastSyncTime };
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
      cfg.lastSyncTime = Date.now();
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
      if (!data) {
        return {
          success: true,
          message: 'Đám mây hiện chưa có dữ liệu nào để kéo.',
          data: null
        };
      }

      const applyRes = applyPayload(data);
      if (!applyRes.success) {
        throw new Error(applyRes.error);
      }

      return {
        success: true,
        timestamp: Date.now(),
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
      const event = new CustomEvent('ts:cloud-status', {
        detail: {
          enabled: Boolean(cfg.enabled && cfg.databaseUrl),
          lastSyncTime: cfg.lastSyncTime,
          databaseUrl: cfg.databaseUrl
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
    autoInit
  };

})();
