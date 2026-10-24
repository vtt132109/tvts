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
    AVAILABILITY_MONTH: 'ts_scheduler_availability_month_v1',
    ACTIVE_MONTH: 'ts_scheduler_active_month_v1'
  };

  // Cấu hình đồng bộ mặc định (Tích hợp sẵn Cơ sở dữ liệu Firebase của Ban Tuyển Sinh)
  const DEFAULT_CONFIG = {
    enabled: true,
    provider: 'firebase',
    databaseUrl: 'https://vtt123-76e07-default-rtdb.firebaseio.com',
    // Web API Key của Firebase (Project settings > General > Web API Key).
    apiKey: '',
    // Tài khoản "đồng bộ văn phòng" (Firebase Authentication - Email/Password).
    // Nhập 1 lần trên mỗi máy; dùng để lấy ID token cho Rules `auth != null`.
    authEmail: '',
    authPassword: '',
    syncPath: 'tvts_production_data',
    // Nhánh CÔNG KHAI: trang sinh viên chỉ được ĐỌC (không PII).
    publicPath: 'tvts_public',
    // Nhánh YÊU CẦU: sinh viên ghi đăng ký ca & đề xuất đổi ca.
    // Ca rảnh được cán bộ nhận tự động; đề xuất đổi ca vẫn chờ duyệt.
    requestsPath: 'tvts_requests',
    // 'admin' | 'student' — trang sinh viên tự khai báo window.TVTS_CLOUD_ROLE.
    role: 'admin',
    autoSync: true,
    lastSyncTime: null,
    deviceId: ''
  };

  /**
   * Cache ID token trong RAM (không ghi ra localStorage).
   * Token Firebase sống 1 giờ; hết hạn thì đăng nhập lại bằng email/mật khẩu
   * đã lưu trên máy — không cần refresh token.
   */
  let authTokenCache = { token: '', expiresAt: 0, email: '' };

  /** Thông báo lỗi dễ hiểu cho các mã lỗi Firebase Auth hay gặp. */
  function mapAuthError(code) {
    const c = String(code || '');
    if (c.includes('OPERATION_NOT_ALLOWED')) {
      return 'Firebase chưa bật đăng nhập Email/Password (Authentication > Sign-in method).';
    }
    if (c.includes('EMAIL_NOT_FOUND') || c.includes('INVALID_PASSWORD')
      || c.includes('INVALID_LOGIN_CREDENTIALS') || c.includes('INVALID_EMAIL')) {
      return 'Sai email hoặc mật khẩu tài khoản đồng bộ.';
    }
    if (c.includes('API_KEY_INVALID') || c.includes('API key not valid')) {
      return 'Web API Key không hợp lệ (Project settings > General > Web API Key).';
    }
    if (c.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
      return 'Firebase tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ít phút.';
    }
    if (c.includes('CONFIGURATION_NOT_FOUND')) {
      return 'Firebase Authentication chưa được khởi tạo cho dự án này.';
    }
    return 'Không đăng nhập được tài khoản đồng bộ: ' + c;
  }

  /**
   * Lấy đối tượng Auth của Firebase SDK (compat) nếu trang đã nạp SDK.
   * Trả về null khi trang không nạp SDK (ví dụ môi trường Node test).
   */
  function getFirebaseAuthSdk() {
    try {
      if (typeof window !== 'undefined'
        && window.firebase
        && typeof window.firebase.auth === 'function') {
        return window.firebase.auth();
      }
    } catch (e) {}
    return null;
  }

  /**
   * Khởi tạo Firebase SDK bằng cấu hình đang lưu (nếu trang đã nạp SDK).
   * Web API Key là thông tin CÔNG KHAI phía client, không phải bí mật.
   */
  function ensureFirebaseApp(cfg) {
    try {
      if (typeof window === 'undefined'
        || !window.firebase
        || typeof window.firebase.initializeApp !== 'function') {
        return null;
      }
      if (window.firebase.apps && window.firebase.apps.length > 0) {
        return window.firebase.app();
      }
      const apiKey = ((cfg && cfg.apiKey) || '').trim();
      if (!apiKey) return null;
      window.firebase.initializeApp({
        apiKey: apiKey,
        authDomain: (cfg && cfg.authDomain) || 'vtt123-76e07.firebaseapp.com',
        databaseURL: (cfg && cfg.databaseUrl) || DEFAULT_CONFIG.databaseUrl,
        projectId: (cfg && cfg.projectId) || 'vtt123-76e07'
      });
      return window.firebase.app();
    } catch (e) {
      console.warn('[CloudSync] Không khởi tạo được Firebase SDK:', e.message);
      return null;
    }
  }

  /** Thông tin người đang đăng nhập Firebase SDK (nếu có). */
  function getCurrentAuthUser() {
    // Khởi tạo app (nếu đã có Web API Key) để Firebase khôi phục phiên Google
    // sau khi tải lại trang.
    ensureFirebaseApp(getConfig());
    const auth = getFirebaseAuthSdk();
    const user = auth && auth.currentUser;
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      isAnonymous: Boolean(user.isAnonymous)
    };
  }

  /** Lỗi đăng nhập Google dễ hiểu. */
  function mapGoogleAuthError(err) {
    const code = String((err && err.code) || (err && err.message) || '');
    if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
      return 'Đã huỷ đăng nhập Google.';
    }
    if (code.includes('popup-blocked')) {
      return 'Trình duyệt chặn cửa sổ đăng nhập Google. Hãy cho phép popup cho trang này rồi thử lại.';
    }
    if (code.includes('unauthorized-domain')) {
      return 'Tên miền này chưa được phép đăng nhập Google (Firebase Console > Authentication > Settings > Authorized domains).';
    }
    if (code.includes('operation-not-allowed')) {
      return 'Firebase chưa bật nhà cung cấp đăng nhập Google (Authentication > Sign-in method).';
    }
    if (code.includes('api-key-not-valid') || code.includes('API_KEY_INVALID')) {
      return 'Web API Key không hợp lệ hoặc chưa được nhập trong cấu hình Cloud.';
    }
    if (code.includes('network-request-failed')) {
      return 'Không kết nối được tới Google/Firebase. Kiểm tra mạng rồi thử lại.';
    }
    return 'Không đăng nhập được Google: ' + ((err && err.message) || code || 'lỗi không xác định');
  }

  /** Lỗi đăng nhập ẩn danh dễ hiểu. */
  function mapAnonError(err) {
    const raw = String((err && err.code) || (err && err.message) || '');
    const code = raw.toLowerCase();
    if (code.includes('operation-not-allowed')) {
      return 'Firebase chưa bật đăng nhập Ẩn danh (Authentication > Sign-in method > Anonymous).';
    }
    if (code.includes('api-key-not-valid') || code.includes('api_key_invalid')) {
      return 'Web API Key không hợp lệ — không tạo được phiên ẩn danh cho sinh viên.';
    }
    if (code.includes('network-request-failed')) {
      return 'Không kết nối được tới Firebase Authentication. Kiểm tra mạng.';
    }
    return 'Không tạo được phiên gửi yêu cầu ẩn danh: ' + (raw || 'lỗi không xác định');
  }

  /**
   * Đăng nhập Google cho CÁN BỘ. Không dùng mật khẩu dùng chung.
   * Sau khi đăng nhập, UID phải có trong node /staff trên Firebase thì Rules
   * mới cho đọc/ghi dữ liệu riêng tư.
   */
  async function signInWithGoogle(customCfg) {
    const cfg = customCfg || getConfig();
    if (!((cfg.apiKey || '').trim())) {
      return { success: false, error: 'Vui lòng nhập Web API Key của Firebase trước khi đăng nhập Google.' };
    }
    ensureFirebaseApp(cfg);
    const auth = getFirebaseAuthSdk();
    if (!auth || typeof window.firebase.auth.GoogleAuthProvider !== 'function') {
      return { success: false, error: 'Chưa nạp Firebase SDK trên trang này (firebase-app-compat + firebase-auth-compat).' };
    }
    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await auth.signInWithPopup(provider);
      const user = result && result.user;
      authTokenCache = { token: '', expiresAt: 0, email: '' };
      return {
        success: true,
        user: user ? {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || ''
        } : getCurrentAuthUser()
      };
    } catch (err) {
      return { success: false, error: mapGoogleAuthError(err), code: err && err.code };
    }
  }

  /** Đăng xuất phiên Firebase SDK (Google hoặc ẩn danh). */
  async function signOutFirebase() {
    const auth = getFirebaseAuthSdk();
    if (auth && typeof auth.signOut === 'function') {
      try { await auth.signOut(); } catch (e) {}
    }
    authTokenCache = { token: '', expiresAt: 0, email: '' };
    anonymousAuthCache = { token: '', uid: '', expiresAt: 0, refreshToken: '', apiKey: '' };
    return { success: true };
  }

  /** Cache token cho phiên ẩn danh tạo bằng REST (khi trang không nạp SDK). */
  let anonymousAuthCache = { token: '', uid: '', expiresAt: 0, refreshToken: '', apiKey: '' };
  let lastAnonymousAuthError = '';

  /** Giải mã payload JWT (không kiểm chữ ký — chỉ để lấy uid). */
  function decodeJwtPayload(token) {
    try {
      const part = String(token || '').split('.')[1];
      if (!part) return null;
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      let json = '';
      if (typeof atob === 'function') {
        json = atob(padded);
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(padded, 'base64').toString('binary');
      } else {
        return null;
      }
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  /**
   * Tạo phiên ẨN DANH cho sinh viên — hoàn toàn không hiện giao diện đăng nhập.
   * Sinh viên vẫn chỉ cần nhập MSSV; Firebase Auth chỉ dùng để Rules biết
   * "cùng một trình duyệt" và chặn sửa yêu cầu của người khác.
   */
  async function signInAnonymous(customCfg) {
    const cfg = customCfg || getConfig();
    ensureFirebaseApp(cfg);
    const auth = getFirebaseAuthSdk();
    if (auth) {
      if (auth.currentUser) {
        return { success: true, user: getCurrentAuthUser() };
      }
      try {
        const cred = await auth.signInAnonymously();
        return {
          success: true,
          user: cred && cred.user
            ? { uid: cred.user.uid, isAnonymous: true }
            : getCurrentAuthUser()
        };
      } catch (err) {
        return { success: false, error: mapAnonError(err), code: err && err.code };
      }
    }

    // Fallback REST: hữu ích khi trang không nạp Firebase SDK.
    const apiKey = ((cfg.apiKey) || '').trim();
    if (!apiKey) {
      return { success: false, error: 'Thiếu Web API Key của Firebase — không gửi được yêu cầu ẩn danh.' };
    }
    if (anonymousAuthCache.token
      && anonymousAuthCache.apiKey === apiKey
      && Date.now() < anonymousAuthCache.expiresAt - 60 * 1000) {
      return { success: true, uid: anonymousAuthCache.uid, token: anonymousAuthCache.token };
    }
    try {
      const res = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(apiKey),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnSecureToken: true })
        }
      );
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || !data.idToken) {
        const code = (data && data.error && data.error.message) || ('HTTP ' + res.status);
        return { success: false, error: mapAnonError(code) };
      }
      const expiresIn = parseInt(data.expiresIn, 10) || 3600;
      anonymousAuthCache = {
        token: data.idToken,
        uid: data.localId || '',
        expiresAt: Date.now() + expiresIn * 1000,
        refreshToken: data.refreshToken || '',
        apiKey: apiKey
      };
      return { success: true, uid: anonymousAuthCache.uid, token: data.idToken };
    } catch (e) {
      return { success: false, error: 'Không kết nối được Firebase Authentication: ' + e.message };
    }
  }

  /** Lấy ID token ẩn danh, tự tạo mới/refresh khi cần. */
  async function getAnonymousIdToken(customCfg) {
    const cfg = customCfg || getConfig();
    lastAnonymousAuthError = '';
    ensureFirebaseApp(cfg);
    const auth = getFirebaseAuthSdk();
    if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      try {
        const token = await auth.currentUser.getIdToken();
        if (token) return token;
      } catch (e) {}
    }
    const apiKey = ((cfg.apiKey) || '').trim();
    if (anonymousAuthCache.token
      && anonymousAuthCache.apiKey === apiKey
      && Date.now() < anonymousAuthCache.expiresAt - 60 * 1000) {
      return anonymousAuthCache.token;
    }
    if (anonymousAuthCache.refreshToken && apiKey) {
      try {
        const res = await fetch(
          'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(apiKey),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(anonymousAuthCache.refreshToken)
          }
        );
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (res.ok && data && data.id_token) {
          anonymousAuthCache.token = data.id_token;
          anonymousAuthCache.refreshToken = data.refresh_token || anonymousAuthCache.refreshToken;
          anonymousAuthCache.expiresAt = Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000;
          return data.id_token;
        }
      } catch (e) {}
    }
    const result = await signInAnonymous(cfg);
    if (result && result.token) return result.token;
    lastAnonymousAuthError = (result && result.error) || '';
    return '';
  }

  /**
   * Lấy ID token để gọi Realtime Database (Rules `auth != null`).
   * Ưu tiên phiên Firebase SDK (Google cho cán bộ, ẩn danh cho sinh viên),
   * sau đó mới fallback tài khoản Email/Password cũ.
   * Trả về '' nếu chưa cấu hình tài khoản đồng bộ (khi đó database phải mở,
   * hoặc request sẽ nhận 401 kèm hướng dẫn).
   */
  async function getAuthToken(cfg) {
    ensureFirebaseApp(cfg);
    const auth = getFirebaseAuthSdk();
    if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      try {
        const sdkToken = await auth.currentUser.getIdToken();
        if (sdkToken) return sdkToken;
      } catch (e) {}
    }

    const email = (cfg && cfg.authEmail || '').trim();

    const password = cfg && cfg.authPassword || '';
    const apiKey = (cfg && cfg.apiKey || '').trim();
    if (!email || !password) return '';
    if (!apiKey) {
      throw new Error('Thiếu Web API Key của Firebase — không đăng nhập được tài khoản đồng bộ.');
    }

    if (authTokenCache.token
      && authTokenCache.email === email
      && Date.now() < authTokenCache.expiresAt - 60 * 1000) {
      return authTokenCache.token;
    }

    let res;
    try {
      res = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='
        + encodeURIComponent(apiKey),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true })
        }
      );
    } catch (e) {
      throw new Error('Không kết nối được tới Firebase Authentication: ' + e.message);
    }

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok || !data || !data.idToken) {
      const code = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error(mapAuthError(code));
    }

    const expiresIn = parseInt(data.expiresIn, 10) || 3600;
    authTokenCache = {
      token: data.idToken,
      expiresAt: Date.now() + expiresIn * 1000,
      email
    };
    return data.idToken;
  }

  /**
   * Chuyển email thành key Realtime Database an toàn.
   * RTDB không cho phép dấu chấm trong key, nên thay TẤT CẢ dấu chấm bằng
   * "%2E" (đúng quy ước Firebase Rules dùng trong database.rules.json).
   */
  function encodeStaffEmailKey(email) {
    return String(email || '').trim().toLowerCase().replace(/\./g, '%2E');
  }

  /**
   * Đọc một cờ quyền cán bộ trên Firebase.
   * Chỉ chấp nhận đúng giá trị boolean true; false/null đều là không có quyền.
   */
  async function readStaffFlag(url, label) {
    try {
      const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      let data = null;
      try { data = await response.json(); } catch (e) { data = null; }

      if (!response.ok) {
        const detail = data && data.error
          ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
          : ('HTTP ' + response.status);
        return { ok: false, error: label + ': ' + detail };
      }
      // Firebase REST trả HTTP 200 kèm { error: 'Permission denied' } khi Rules chặn.
      if (data && typeof data === 'object' && data.error) {
        const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        return { ok: false, error: label + ': ' + detail };
      }
      return { ok: true, allowed: data === true, data };
    } catch (err) {
      return { ok: false, error: label + ': ' + (err.message || 'lỗi kết nối Firebase Cloud') };
    }
  }

  /**
   * Kiểm tra quyền cán bộ theo UID hoặc email đã được cấp trước.
   *
   * - `/staff/<uid>: true` dành cho tài khoản quản trị chính.
   * - `/staff_emails/<email đã mã hóa>: true` dành cho người được add trước.
   *   Email mã hóa bằng cách thay dấu chấm thành %2E, ví dụ:
   *   ten@gmail.com -> ten@gmail%2Ecom
   *
   * Rules chỉ cho mỗi tài khoản đọc đúng node của mình, nên client xác minh
   * được quyền mà không mở toàn bộ danh sách.
   */
  async function checkStaffAccess(uid, email, customCfg) {
    // Giữ tương thích với cách gọi cũ: checkStaffAccess(uid, config)
    if (email && typeof email === 'object') {
      customCfg = email;
      email = '';
    }

    const cfg = customCfg || getConfig();
    const id = String(uid || '').trim();
    const rawEmail = String(email || '').trim().toLowerCase();
    const emailKey = encodeStaffEmailKey(rawEmail);

    if (!id) {
      return { success: false, allowed: false, error: 'Thiếu UID tài khoản Google.' };
    }
    if (!cfg.databaseUrl) {
      return { success: false, allowed: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, allowed: false, error: authErr.message };
    }
    if (!token) {
      return { success: false, allowed: false, error: 'Chưa có phiên đăng nhập Google hợp lệ.' };
    }

    const uidUrl = formatFirebaseUrl(
      cfg.databaseUrl,
      'staff/' + encodeURIComponent(id),
      token
    );
    if (!uidUrl) {
      return { success: false, allowed: false, error: 'URL Firebase không hợp lệ!' };
    }

    const uidResult = await readStaffFlag(uidUrl, 'UID');
    if (uidResult.ok && uidResult.allowed) {
      return {
        success: true,
        allowed: true,
        via: 'uid',
        uid: id,
        email: rawEmail,
        emailKey,
        data: uidResult.data
      };
    }

    let emailResult = null;
    if (emailKey) {
      const emailUrl = formatFirebaseUrl(
        cfg.databaseUrl,
        'staff_emails/' + encodeURIComponent(emailKey),
        token
      );
      if (emailUrl) {
        emailResult = await readStaffFlag(emailUrl, 'email');
        if (emailResult.ok && emailResult.allowed) {
          return {
            success: true,
            allowed: true,
            via: 'email',
            uid: id,
            email: rawEmail,
            emailKey,
            data: emailResult.data
          };
        }
      }
    }

    const emailGuidance = emailKey
      ? ` hoặc email ${rawEmail} vào /staff_emails (khóa ${emailKey})`
      : '';
    const guidance = `Thêm UID ${id} vào /staff${emailGuidance} với giá trị boolean true.`;
    const errors = [uidResult.error, emailResult && emailResult.error].filter(Boolean);

    if (errors.length) {
      return {
        success: false,
        allowed: false,
        uid: id,
        email: rawEmail,
        emailKey,
        error: 'Không đọc được quyền cán bộ trên Firebase: ' + errors.join(' | ')
          + '. Hãy Publish database.rules.json. ' + guidance
      };
    }

    return {
      success: true,
      allowed: false,
      uid: id,
      email: rawEmail,
      emailKey,
      error: 'Tài khoản ' + (rawEmail || id) + ' chưa được cấp quyền cán bộ. ' + guidance
    };
  }

  // ---------------------------------------------------------------------------
  // QUẢN LÝ QUYỀN CÁN BỘ THEO EMAIL (dùng cho nút trong trang admin)
  // ---------------------------------------------------------------------------
  // Ghi /staff_emails/<email đã mã hoá> = true. Nhờ vậy không phải mở Firebase
  // Console tạo node bằng tay: cán bộ đã có quyền cấp quyền cho người khác,
  // sau đó người đó chỉ cần đăng nhập Google bằng đúng email ấy.
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function normalizeStaffEmail(email) {
    const raw = String(email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(raw)) {
      return { ok: false, error: 'Email không hợp lệ: ' + (raw || '(trống)') };
    }
    return { ok: true, email: raw, key: encodeStaffEmailKey(raw) };
  }

  /** Chuẩn bị URL + token cho các thao tác trên /staff_emails. */
  async function prepareStaffEmailsRequest(customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { ok: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }
    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { ok: false, error: authErr.message };
    }
    if (!token) {
      return { ok: false, error: 'Chưa có phiên đăng nhập Google hợp lệ. Hãy đăng nhập bằng Google trước.' };
    }
    return { ok: true, cfg, token };
  }

  /** Ghi một node bất kỳ và kiểm tra cả bẫy HTTP 200 + {"error": ...}. */
  async function writeNode(relPath, value, customCfg) {
    const prep = await prepareStaffEmailsRequest(customCfg);
    if (!prep.ok) return { success: false, error: prep.error };

    const url = formatFirebaseUrl(prep.cfg.databaseUrl, relPath, prep.token);
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
      });
      let data = null;
      try { data = await response.json(); } catch (e) { data = null; }

      if (!response.ok) {
        return {
          success: false,
          error: `Firebase HTTP ${response.status}: `
            + (data && data.error ? (data.error.message || JSON.stringify(data.error)) : response.statusText)
        };
      }
      if (data && typeof data === 'object' && data.error) {
        return { success: false, error: 'Firebase từ chối ghi: ' + (data.error.message || JSON.stringify(data.error)) };
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, error: 'Lỗi kết nối Firebase: ' + (err.message || err) };
    }
  }

  /** Cấp quyền cán bộ cho một email. */
  async function grantStaffEmail(email, customCfg) {
    const norm = normalizeStaffEmail(email);
    if (!norm.ok) return { success: false, error: norm.error };

    const res = await writeNode('staff_emails/' + encodeURIComponent(norm.key), true, customCfg);
    if (!res.success) {
      if (/HTTP 401|HTTP 403|Permission denied/i.test(res.error || '')) {
        return {
          success: false,
          error: 'Tài khoản đang đăng nhập chưa có quyền cấp quyền. '
            + 'Cần thêm email của bạn vào Rules (OWNER_EMAIL) hoặc /staff trước.'
        };
      }
      return res;
    }
    return { success: true, email: norm.email, key: norm.key };
  }

  /** Thu hồi quyền của một email. */
  async function revokeStaffEmail(email, customCfg) {
    const norm = normalizeStaffEmail(email);
    if (!norm.ok) return { success: false, error: norm.error };

    const prep = await prepareStaffEmailsRequest(customCfg);
    if (!prep.ok) return { success: false, error: prep.error };

    const url = formatFirebaseUrl(
      prep.cfg.databaseUrl,
      'staff_emails/' + encodeURIComponent(norm.key),
      prep.token
    );
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, { method: 'DELETE' });
      let data = null;
      try { data = await response.json(); } catch (e) { data = null; }
      if (!response.ok) {
        return { success: false, error: `Firebase HTTP ${response.status}: ${response.statusText}` };
      }
      if (data && typeof data === 'object' && data.error) {
        return { success: false, error: 'Firebase từ chối xoá: ' + (data.error.message || JSON.stringify(data.error)) };
      }
      return { success: true, email: norm.email };
    } catch (err) {
      return { success: false, error: 'Lỗi kết nối Firebase: ' + (err.message || err) };
    }
  }

  /** Đọc danh sách email đã được cấp quyền. */
  async function listStaffEmails(customCfg) {
    const prep = await prepareStaffEmailsRequest(customCfg);
    if (!prep.ok) return { success: false, error: prep.error };

    const url = formatFirebaseUrl(prep.cfg.databaseUrl, 'staff_emails', prep.token);
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: 'Chưa đăng nhập Google hoặc tài khoản chưa được cấp quyền cán bộ. '
              + 'Hãy đăng nhập Google bằng email đã được cấp (hoặc email OWNER trong Rules).'
          };
        }
        return { success: false, error: `Firebase HTTP ${response.status}: ${response.statusText}` };
      }
      if (data && typeof data === 'object' && data.error) {
        return { success: false, error: 'Firebase từ chối đọc: ' + (data.error.message || JSON.stringify(data.error)) };
      }
      const emails = Object.keys(data || {})
        .filter(k => data[k] === true)
        .map(k => k.replace(/%2E/gi, '.'))
        .sort();
      return { success: true, emails };
    } catch (err) {
      return { success: false, error: 'Lỗi kết nối Firebase: ' + (err.message || err) };
    }
  }

  // Hồ sơ cán bộ được phép đồng bộ qua Cloud.
  //
  // CHỈ đẩy hash đã có muối (passwordHash/passwordSalt/pinHash/pinSalt) —
  // KHÔNG BAO GIỜ đẩy password/pin thô. Máy khác vẫn đăng nhập được bằng đúng
  // mật khẩu/PIN đã cấp vì nó băm lại đầu vào rồi so với hash tải về.
  function publicAdminProfile(user) {
    if (!user || typeof user !== 'object' || !user.username) return null;
    const profile = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    };
    ['password', 'pin'].forEach(field => {
      if (user[field + 'Hash'] && user[field + 'Salt']) {
        profile[field + 'Hash'] = user[field + 'Hash'];
        profile[field + 'Salt'] = user[field + 'Salt'];
      }
    });
    return profile;
  }

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
          role: getDeclaredRole() || parsed.role || DEFAULT_CONFIG.role,
          deviceId: getOrCreateDeviceId()
        });
      }
    } catch (e) {}

    // Fallback: Kiểm tra xem có cấu hình nhúng trước trong window hay không
    if (window.TVTS_CLOUD_CONFIG && typeof window.TVTS_CLOUD_CONFIG === 'object') {
      const embedded = window.TVTS_CLOUD_CONFIG;
      return Object.assign({}, DEFAULT_CONFIG, embedded, {
        role: getDeclaredRole() || embedded.role || DEFAULT_CONFIG.role,
        deviceId: getOrCreateDeviceId()
      });
    }

    return Object.assign({}, DEFAULT_CONFIG, {
      role: getDeclaredRole() || DEFAULT_CONFIG.role,
      deviceId: getOrCreateDeviceId()
    });
  }

  /**
   * Trang nào đang chạy: 'admin' (mặc định, có toàn quyền) hay 'student'
   * (chỉ đọc dữ liệu công khai và gửi yêu cầu).
   *
   * Trang sinh viên khai báo window.TVTS_CLOUD_ROLE = 'student' TRƯỚC khi nạp
   * js/cloud_sync.js. Trong môi trường test (không khai báo) mặc định là admin
   * để giữ nguyên toàn bộ hành vi cũ.
   */
  /** Đọc nội dung thẻ <meta name="..."> (dùng thay cho biến window trong HTML). */
  function getMetaContent(name) {
    try {
      if (typeof document === 'undefined' || typeof document.querySelector !== 'function') {
        return '';
      }
      const el = document.querySelector('meta[name="' + name + '"]');
      return el && el.content !== undefined ? String(el.content).trim() : '';
    } catch (e) {
      return '';
    }
  }

  function getDeclaredRole() {
    const metaRole = getMetaContent('tvts-cloud-role');
    if (metaRole === 'student' || metaRole === 'admin') return metaRole;
    try {
      if (typeof window !== 'undefined'
        && (window.TVTS_CLOUD_ROLE === 'student' || window.TVTS_CLOUD_ROLE === 'admin')) {
        return window.TVTS_CLOUD_ROLE;
      }
    } catch (e) {}
    return null;
  }

  /** Trang sinh viên có bị cấm ghi dữ liệu riêng tư / dữ liệu công khai không. */
  function isStudentMode(cfg) {
    return Boolean(cfg && cfg.role === 'student');
  }

  /**
   * Chỉ trang admin.html bật cờ này trước khi nạp cloud_sync.js.
   * Nhờ vậy mỗi lần đẩy dữ liệu riêng tư thành công, app cũng tự cập nhật
   * nhánh công khai cho trang sinh viên — mà test/Node không phát sinh request.
   */
  function shouldPublishPublic(cfg) {
    return !isStudentMode(cfg)
      && (getMetaContent('tvts-publish-public') === 'true'
        || (typeof window !== 'undefined' && window.TVTS_PUBLISH_PUBLIC === true));
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

    // KHÔNG có tài khoản mặc định/fallback trong mã nguồn.
    //
    // Máy chưa có danh sách (hoặc danh sách rỗng) nghĩa là "chưa nạp", KHÔNG
    // phải "xoá hết" hay "dùng tài khoản mẫu". Bỏ hẳn khoá adminUsers khỏi
    // payload để PATCH giữ nguyên dữ liệu đang có trên Cloud.
    const localAdmins = readKey(STORAGE_KEYS.ADMIN_USERS, null);
    const adminsToPush = Array.isArray(localAdmins) && localAdmins.length > 0
      ? localAdmins.map(publicAdminProfile).filter(Boolean)
      : undefined;

    // KHÔNG được đẩy danh sách rỗng lên Cloud.
    //
    // Lỗi này đã xảy ra thật: máy mới đăng nhập, localStorage chưa có danh sách,
    // pushToCloud() gửi students: [] và Firebase PUT toàn bộ payload — XOÁ mất
    // 58 CTV trên Cloud. Mọi máy sau đó kéo về 0 người.
    //
    // Danh sách rỗng ở máy có nghĩa là "chưa nạp", KHÔNG phải "xoá hết". Nên bỏ
    // hẳn khoá khỏi payload: Firebase giữ nguyên giá trị cũ thay vì ghi đè.
    const localStudents = readKey(STORAGE_KEYS.STUDENTS, null);
    const studentsToPush = Array.isArray(localStudents) && localStudents.length > 0
      ? localStudents
      : undefined;

    const payload = {
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
      // Khoá tháng ca rảnh: gửi lên Cloud để máy mới biết ca rảnh hiện tại thuộc
      // tháng nào, thay vì tự đoán "chưa đăng ký" rồi xoá nhầm ca rảnh thật.
      availabilityMonth: readKey(STORAGE_KEYS.AVAILABILITY_MONTH, null),
      updatedAt: Date.now(),
      deviceId: getOrCreateDeviceId(),
    };
    // Chỉ đẩy HỒ SƠ cán bộ (id/username/fullName/role + hash nếu có). Mật khẩu
    // & PIN thô ở lại máy. Không có danh sách thì bỏ khoá để Cloud giữ nguyên.
    //
    // Trước đây mảng adminUsers nguyên bản (kèm password + pin plaintext) được
    // PATCH lên Firebase — nơi ai có URL cũng đọc được. Đó là lý do phát hiện
    // CRITICAL ngày 2026-10-22: 4 tài khoản cán bộ bị lộ mật khẩu/PIN.
    if (adminsToPush && adminsToPush.length > 0) {
      payload.adminUsers = adminsToPush;
    }
    // Chỉ gán khi máy này THẬT SỰ có danh sách. Bỏ khoá khỏi JSON.stringify()
    // khiến Firebase giữ nguyên dữ liệu cũ (không ghi đè bằng rỗng).
    if (studentsToPush !== undefined) {
      payload.students = studentsToPush;
    }
    payload.version = '1.1';

    return payload;
  }

  /**
   * Serialize ổn định (không phụ thuộc thứ tự key) để so sánh payload cục bộ
   * với bản đọc từ Firebase. Nhờ vậy chỉ PATCH đúng các khoá thực sự đổi.
   */
  function stableStringify(value) {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(item => stableStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }

  /** Khoá meta luôn gửi kèm mỗi lần PATCH (kể cả khi dữ liệu không đổi). */
  const PUSH_META_KEYS = ['updatedAt', 'deviceId', 'version'];

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
      // 1. Đồng bộ danh sách cán bộ.
      //
      // Quy tắc bảo mật (đã có test canh):
      //  - KHÔNG bao giờ ghi password/pin thô từ Cloud xuống máy.
      //  - Chỉ nhận tài khoản MỚI khi bản ghi có hash + salt hợp lệ.
      //  - Hash được đồng bộ để đổi mật khẩu/PIN ở máy này có hiệu lực ở máy kia.
      //
      // ⚠️ Vì có thể tạo tài khoản từ Cloud, Security Rules của Firebase PHẢI
      // chặn ghi từ người lạ (xem SECURITY.md). Nếu database còn mở, kẻ tấn
      // công có thể chèn tài khoản của họ vào node adminUsers.
      if (Array.isArray(payload.adminUsers) && payload.adminUsers.length > 0) {
        let currentLocal = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_USERS);
          if (raw) currentLocal = JSON.parse(raw) || [];
        } catch (e) {}

        const byUsername = new Map();
        currentLocal.forEach(u => {
          if (u && u.username) byUsername.set(String(u.username).toLowerCase(), u);
        });

        let adminsChanged = false;

        payload.adminUsers.forEach(remote => {
          if (!remote || !remote.username) return;
          const key = String(remote.username).toLowerCase();
          const local = byUsername.get(key);

          if (!local) {
            if (!remote.passwordHash || !remote.passwordSalt) return;
            const created = {
              id: remote.id,
              username: remote.username,
              fullName: remote.fullName,
              role: remote.role,
              passwordHash: remote.passwordHash,
              passwordSalt: remote.passwordSalt
            };
            if (remote.pinHash && remote.pinSalt) {
              created.pinHash = remote.pinHash;
              created.pinSalt = remote.pinSalt;
            }
            currentLocal.push(created);
            byUsername.set(key, created);
            adminsChanged = true;
            return;
          }

          ['fullName', 'role'].forEach(field => {
            if (remote[field] && remote[field] !== local[field]) {
              local[field] = remote[field];
              adminsChanged = true;
            }
          });

          ['password', 'pin'].forEach(field => {
            if (!remote[field + 'Hash'] || !remote[field + 'Salt']) return;
            if (local[field + 'Hash'] !== remote[field + 'Hash']
              || local[field + 'Salt'] !== remote[field + 'Salt']) {
              local[field + 'Hash'] = remote[field + 'Hash'];
              local[field + 'Salt'] = remote[field + 'Salt'];
              delete local[field]; // không giữ lại bản plaintext cũ
              adminsChanged = true;
            }
          });
        });

        if (adminsChanged) {
          writeKey(STORAGE_KEYS.ADMIN_USERS, currentLocal);
        }
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

      // 4b. Khoá tháng ca rảnh — máy mới CẦN CÓ để không xoá nhầm ca rảnh thật.
      if (typeof payload.availabilityMonth === 'string' && payload.availabilityMonth) {
        let currentLocal = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.AVAILABILITY_MONTH);
          if (raw) currentLocal = JSON.parse(raw);
        } catch (e) {}
        if (!currentLocal) {
          writeKey(STORAGE_KEYS.AVAILABILITY_MONTH, payload.availabilityMonth);
        }
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

  /**
   * ==========================================================================
   * DỮ LIỆU CÔNG KHAI CHO TRANG SINH VIÊN (KHÔNG PII)
   * ==========================================================================
   * Chỉ các trường cần cho việc tra cứu MSSV, xem lịch và đăng ký ca:
   *   - id, studentId, fullName, role
   *   - registrationMonth, monthlyAvailableShifts, availableShifts
   * Tuyệt đối KHÔNG đưa phone/email/bank/passwordHash/pinHash lên nhánh này.
   */
  function publicStudentRecord(student) {
    if (!student || typeof student !== 'object') return null;
    const record = {
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      role: student.role
    };
    ['registrationMonth', 'monthlyAvailableShifts', 'availableShifts', 'faculty', 'className']
      .forEach(field => {
        if (student[field] !== undefined && student[field] !== null) {
          record[field] = student[field];
        }
      });
    if (student.updatedAt) record.updatedAt = student.updatedAt;
    return record;
  }

  /**
   * Trạng thái đổi ca được công bố cho trang sinh viên.
   *
   * CHỈ các trường cần để hiển thị kết quả duyệt. Tuyệt đối không có
   * reason / studentName / targetStudentName / uid (dữ liệu riêng tư).
   */
  function publicSwapStatus(swap) {
    if (!swap || typeof swap !== 'object' || !swap.id) return null;
    const record = {
      id: String(swap.id),
      studentId: typeof swap.studentId === 'string' ? swap.studentId : '',
      status: typeof swap.status === 'string' ? swap.status : 'pending',
      weekNum: Number(swap.weekNum) || 0,
      shiftId: typeof swap.shiftId === 'string' ? swap.shiftId : ''
    };
    if (typeof swap.targetStudentId === 'string' && swap.targetStudentId) {
      record.targetStudentId = swap.targetStudentId;
    }
    return record;
  }

  /** Đọc JSON từ localStorage, trả về mặc định nếu thiếu/hỏng. */
  function readStorageJson(key, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
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

  /**
   * Các khoá PII TUYỆT ĐỐI không được xuất hiện trong nhánh công khai.
   * Lịch trực chứa nguyên object sinh viên (oldMember/newMember), nên chỉ
   * whitelist `directory` là KHÔNG đủ — phải quét sâu toàn bộ lịch/sự kiện.
   */
  const PUBLIC_SENSITIVE_KEYS = new Set([
    'phone', 'mobile', 'email', 'bankname', 'bankaccount',
    'password', 'passwordsalt', 'passwordhash',
    'pin', 'pinsalt', 'pinhash',
    'address', 'cccd', 'cmnd', 'dob', 'birthday', 'ngaysinh', 'quequan'
  ]);

  function isSensitivePublicKey(key) {
    const k = String(key || '').toLowerCase();
    if (!k) return false;
    if (PUBLIC_SENSITIVE_KEYS.has(k)) return true;
    return k.endsWith('phone') || k.endsWith('email')
      || k.endsWith('bankaccount') || k.endsWith('bankname')
      || k.endsWith('password') || k.endsWith('pinhash') || k.endsWith('pinsalt');
  }

  /**
   * Bản sao sạch PII của dữ liệu công khai (lịch, sự kiện, cấu hình).
   * Không sửa object gốc trong localStorage.
   */
  function sanitizePublicData(value, depth) {
    const level = depth || 0;
    if (level > 20) return null;
    if (Array.isArray(value)) {
      return value.map(item => sanitizePublicData(item, level + 1));
    }
    if (!value || typeof value !== 'object') return value;
    const clean = {};
    Object.keys(value).forEach(key => {
      if (isSensitivePublicKey(key)) return;
      clean[key] = sanitizePublicData(value[key], level + 1);
    });
    return clean;
  }

  /**
   * Đóng gói bản CÔNG KHAI từ LocalStorage của cán bộ.
   * Dùng PATCH để không xoá nhánh khác nếu máy này chưa có dữ liệu.
   */
  function buildPublicPayload() {
    const localStudents = readStorageJson(STORAGE_KEYS.STUDENTS, null);
    const directory = Array.isArray(localStudents)
      ? localStudents.map(publicStudentRecord).filter(Boolean)
      : [];

    const cfg = getConfig();
    const localSwaps = readStorageJson(STORAGE_KEYS.SWAP_REQUESTS, []);
    // Cùng giới hạn 200 với danh sách cục bộ; chỉ công bố trạng thái, không PII.
    const swapStatuses = Array.isArray(localSwaps)
      ? localSwaps.slice(0, 200).map(publicSwapStatus).filter(Boolean)
      : [];
    const payload = {
      meta: {
        updatedAt: Date.now(),
        version: 'public-1.0',
        deviceId: getOrCreateDeviceId()
      },
      // Cấu hình client công khai (Web API Key KHÔNG phải bí mật). Nhờ đó máy
      // sinh viên biết API Key để tạo phiên ẩn danh mà không cần nhập tay.
      clientConfig: {
        apiKey: (cfg.apiKey || '').trim(),
        authDomain: cfg.authDomain || 'vtt123-76e07.firebaseapp.com',
        projectId: cfg.projectId || 'vtt123-76e07'
      },
      scheduleResult: sanitizePublicData(readStorageJson(STORAGE_KEYS.SCHEDULE, null)),
      twoWeekSchedule: sanitizePublicData(readStorageJson(STORAGE_KEYS.TWO_WEEK_SCHEDULE, null)),
      monthSchedule: sanitizePublicData(readStorageJson(STORAGE_KEYS.MONTH_SCHEDULE, null)),
      regConfig: sanitizePublicData(readStorageJson(STORAGE_KEYS.REG_CONFIG, null)),
      events: sanitizePublicData(readStorageJson(STORAGE_KEYS.EVENTS, [])),
      allMonthSchedules: sanitizePublicData(readStorageJson(STORAGE_KEYS.ALL_MONTHS, {})),
      allMonths: sanitizePublicData(readStorageJson(STORAGE_KEYS.ALL_MONTHS, {})),
      activeMonth: normalizeActiveMonth(readStorageJson(STORAGE_KEYS.ACTIVE_MONTH, null)),
      availabilityMonth: readStorageJson(STORAGE_KEYS.AVAILABILITY_MONTH, null),
      swapStatuses,
      updatedAt: Date.now(),
      deviceId: getOrCreateDeviceId(),
      version: 'public-1.0'
    };

    // Cùng nguyên tắc chống xoá nhầm như buildPayload: máy chưa có danh sách
    // thì không gửi khoá directory (PATCH sẽ giữ nguyên bản cũ trên Cloud).
    if (directory.length > 0) payload.directory = directory;
    return payload;
  }

  /**
   * Gộp trạng thái đổi ca CÔNG KHAI vào danh sách cục bộ.
   *
   * - Chỉ cập nhật các yêu cầu ĐÃ CÓ trên máy (không tạo yêu cầu lạ).
   * - Chỉ chạm status/weekNum/shiftId/targetStudentId; giữ nguyên reason,
   *   studentName, targetStudentName, uid...
   * - Không để bản pending cũ trên Cloud ghi đè kết quả đã duyệt trên máy.
   */
  const PUBLIC_SWAP_STATUS_VALUES = new Set(['pending', 'approved', 'rejected', 'cancelled']);

  function normalizePublicSwapStatusList(input) {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') {
      return Object.keys(input).map(key => {
        const item = input[key];
        if (!item || typeof item !== 'object') return null;
        return Object.assign({ id: key }, item);
      }).filter(Boolean);
    }
    return [];
  }

  function mergePublicSwapStatuses(localList, remoteList) {
    const swaps = Array.isArray(localList)
      ? localList.map(item => Object.assign({}, item))
      : [];
    const indexById = new Map();
    swaps.forEach((item, index) => {
      if (item && item.id) indexById.set(String(item.id), index);
    });

    let updated = 0;
    normalizePublicSwapStatusList(remoteList).forEach(remote => {
      if (!remote || !remote.id) return;
      const index = indexById.get(String(remote.id));
      if (index === undefined) return; // KHÔNG tạo yêu cầu lạ từ nhánh công khai
      const current = swaps[index];
      let changed = false;

      if (typeof remote.status === 'string' && PUBLIC_SWAP_STATUS_VALUES.has(remote.status)) {
        const localHandled = current.status === 'approved' || current.status === 'rejected';
        const remotePending = remote.status === 'pending';
        if (!(localHandled && remotePending) && current.status !== remote.status) {
          current.status = remote.status;
          changed = true;
        }
      }

      const weekNum = Number(remote.weekNum);
      if (Number.isInteger(weekNum) && weekNum >= 1 && weekNum <= 4
        && current.weekNum !== weekNum) {
        current.weekNum = weekNum;
        changed = true;
      }

      if (typeof remote.shiftId === 'string' && remote.shiftId
        && current.shiftId !== remote.shiftId) {
        current.shiftId = remote.shiftId;
        changed = true;
      }

      if (typeof remote.targetStudentId === 'string'
        && current.targetStudentId !== remote.targetStudentId) {
        current.targetStudentId = remote.targetStudentId;
        changed = true;
      }

      if (changed) updated++;
    });

    return { swaps, updated };
  }

  /**
   * Áp dụng dữ liệu CÔNG KHAI vào LocalStorage của trang sinh viên.
   * Không bao giờ ghi adminUsers / webBackups / swapRequests nguyên bản từ
   * nhánh này; chỉ gộp trạng thái đổi ca (swapStatuses) vào yêu cầu đã có.
   */
  function applyPublicPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload công khai không hợp lệ' };
    }

    const touchedKeys = [];

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
      const remoteDirectory = Array.isArray(payload.directory)
        ? payload.directory
        : (Array.isArray(payload.students) ? payload.students : null);
      if (remoteDirectory) {
        const sanitized = remoteDirectory.map(publicStudentRecord).filter(Boolean);
        writeKey(STORAGE_KEYS.STUDENTS, sanitized);
      }

      if (payload.monthSchedule) writeKey(STORAGE_KEYS.MONTH_SCHEDULE, sanitizePublicData(payload.monthSchedule));
      if (payload.scheduleResult) writeKey(STORAGE_KEYS.SCHEDULE, sanitizePublicData(payload.scheduleResult));
      if (payload.twoWeekSchedule) writeKey(STORAGE_KEYS.TWO_WEEK_SCHEDULE, sanitizePublicData(payload.twoWeekSchedule));

      if (payload.regConfig && typeof payload.regConfig === 'object') {
        writeKey(STORAGE_KEYS.REG_CONFIG, sanitizePublicData(payload.regConfig));
      }

      // Khoá tháng ca rảnh chỉ ghi khi máy chưa có — tránh xoá ca rảnh thật.
      if (typeof payload.availabilityMonth === 'string' && payload.availabilityMonth) {
        let currentLocal = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.AVAILABILITY_MONTH);
          if (raw) currentLocal = JSON.parse(raw);
        } catch (e) {}
        if (!currentLocal) writeKey(STORAGE_KEYS.AVAILABILITY_MONTH, payload.availabilityMonth);
      }

      if (Array.isArray(payload.events)) writeKey(STORAGE_KEYS.EVENTS, sanitizePublicData(payload.events));

      // Trạng thái đổi ca: chỉ cập nhật yêu cầu đã có, không tạo mới và không
      // bao giờ ghi đè lý do/tên người gửi.
      if (payload.swapStatuses !== undefined && payload.swapStatuses !== null) {
        const localSwaps = readStorageJson(STORAGE_KEYS.SWAP_REQUESTS, []);
        const mergedSwaps = mergePublicSwapStatuses(localSwaps, payload.swapStatuses);
        if (mergedSwaps.updated > 0) {
          writeKey(STORAGE_KEYS.SWAP_REQUESTS, mergedSwaps.swaps);
        }
      }

      const allMonthsData = payload.allMonthSchedules || payload.allMonths;
      if (allMonthsData && typeof allMonthsData === 'object') {
        writeKey(STORAGE_KEYS.ALL_MONTHS, sanitizePublicData(allMonthsData));
      }

      if (payload.activeMonth !== undefined && payload.activeMonth !== null) {
        const normalized = normalizeActiveMonth(payload.activeMonth);
        if (normalized && safeSetItem(STORAGE_KEYS.ACTIVE_MONTH, JSON.stringify(normalized))) {
          touchedKeys.push(STORAGE_KEYS.ACTIVE_MONTH);
        }
      }

      const cfg = getConfig();
      // Nhận Web API Key công khai do cán bộ công bố để máy sinh viên tạo được
      // phiên ẩn danh (Firebase Auth yêu cầu apiKey).
      if (payload.clientConfig && payload.clientConfig.apiKey) {
        cfg.apiKey = payload.clientConfig.apiKey;
        if (payload.clientConfig.authDomain) cfg.authDomain = payload.clientConfig.authDomain;
        if (payload.clientConfig.projectId) cfg.projectId = payload.clientConfig.projectId;
      }
      cfg.lastSyncTime = Date.now();
      cfg.lastPublicSyncTime = Date.now();
      if (payload.updatedAt) cfg.lastCloudUpdatedAt = payload.updatedAt;
      safeSetItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(cfg));

      try {
        window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: touchedKeys } }));
        window.dispatchEvent(new CustomEvent('ts:cloud-synced', { detail: { payload, public: true } }));
      } catch (evErr) {}

      notifyStatusChange();
      return { success: true, timestamp: cfg.lastSyncTime, keys: touchedKeys };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** Đẩy riêng nhánh dữ liệu công khai (chỉ cán bộ đã đăng nhập mới ghi được). */
  async function pushPublicToCloud(customCfg) {
    const cfg = customCfg || getConfig();
    if (isStudentMode(cfg)) {
      return { success: false, error: 'Trang sinh viên không có quyền ghi nhánh dữ liệu công khai.' };
    }
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, error: authErr.message };
    }

    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.publicPath || 'tvts_public', token);
    if (!url) {
      return { success: false, error: 'URL Firebase không hợp lệ!' };
    }
    const payload = buildPublicPayload();

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      let result = null;
      try { result = await response.json(); } catch (e) { result = null; }
      if (result && typeof result === 'object' && result.error) {
        const detail = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        return {
          success: false,
          error: `Firebase từ chối ghi nhánh công khai: ${detail} — kiểm tra Rules của tvts_public.`
        };
      }
      cfg.lastPublicSyncTime = Date.now();
      saveConfig(cfg);
      return {
        success: true,
        timestamp: cfg.lastPublicSyncTime,
        message: 'Đã cập nhật dữ liệu công khai cho trang sinh viên!',
        data: result
      };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  /** Kéo dữ liệu công khai về máy sinh viên (hoặc cán bộ). */
  async function pullPublicFromCloud(customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      token = '';
    }
    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.publicPath || 'tvts_public', token);
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
      if (data && typeof data === 'object' && data.error) {
        const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(`Firebase từ chối truy cập nhánh công khai: ${detail}`);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {
          success: true,
          message: 'Đám mây hiện chưa có dữ liệu công khai nào để kéo.',
          data: null
        };
      }

      const applyRes = applyPublicPayload(data);
      if (!applyRes.success) throw new Error(applyRes.error);
      return {
        success: true,
        timestamp: Date.now(),
        keys: applyRes.keys,
        message: 'Đã kéo dữ liệu công khai mới nhất từ Đám mây!',
        data
      };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  /**
   * ==========================================================================
   * YÊU CẦU TỪ SINH VIÊN (đăng ký ca & đổi ca)
   * ==========================================================================
   * Ghi vào tvts_requests/<loại>/<id>. Rules bắt buộc:
   *   - auth != null (phiên ẩn danh hoặc Google của cán bộ)
   *   - newData.uid === auth.uid (chống sửa yêu cầu của người khác)
   *
   * Ca rảnh: cán bộ nhận và gộp TỰ ĐỘNG, không có bước duyệt từng yêu cầu.
   * Đổi ca: vẫn giữ quy trình cán bộ duyệt vì ảnh hưởng lịch trực đã công bố.
   */

  function generateRequestId(prefix) {
    return (prefix || 'req') + '_'
      + Date.now().toString(36) + '_'
      + Math.random().toString(36).slice(2, 8);
  }

  /** Ghi một node yêu cầu bằng ID token (ẩn danh cho sinh viên). */
  async function putRequestNode(relPath, body, customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    // Sinh viên dùng phiên ẩn danh; cán bộ đã đăng nhập Google thì dùng phiên đó.
    let token = await getAnonymousIdToken(cfg);
    if (!token) {
      try { token = await getAuthToken(cfg); } catch (e) { token = ''; }
    }
    if (!token) {
      return {
        success: false,
        error: lastAnonymousAuthError
          || 'Không tạo được phiên gửi yêu cầu. Hãy kiểm tra Firebase Authentication > Anonymous và Web API Key.'
      };
    }

    const claims = decodeJwtPayload(token) || {};
    const sdkUser = getCurrentAuthUser();
    const uid = claims.user_id || claims.sub
      || (sdkUser && sdkUser.uid)
      || anonymousAuthCache.uid
      || '';
    const payload = Object.assign({}, body || {});
    if (uid) payload.uid = uid;

    const normalizedPath = String(relPath || '').replace(/^\/+/, '');
    if (!normalizedPath) return { success: false, error: 'Thiếu đường dẫn yêu cầu.' };

    const url = formatFirebaseUrl(
      cfg.databaseUrl,
      (cfg.requestsPath || 'tvts_requests') + '/' + normalizedPath,
      token
    );
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

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
      let result = null;
      try { result = await response.json(); } catch (e) { result = null; }
      if (result && typeof result === 'object' && result.error) {
        const detail = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        return { success: false, error: `Firebase từ chối ghi yêu cầu: ${detail}` };
      }
      return { success: true, uid, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  /**
   * Giữ chỗ một MSSV cho uid đang đăng nhập (ghi được MỘT lần).
   *
   * Rules yêu cầu node `mssv_owner/<mssv> = <uid>` tồn tại trước khi ghi đăng ký.
   * Nhờ vậy sinh viên A không thể PUT đè đăng ký của MSSV thuộc về B: lần ghi
   * đầu tiên giữ chỗ, các lần sau chỉ đúng uid đó mới ghi tiếp được.
   */
  async function claimMssv(mssv, customCfg) {
    const id = String(mssv || '').trim();
    if (!/^[A-Za-z0-9_-]{2,32}$/.test(id)) {
      return { success: false, error: 'MSSV không hợp lệ để gửi lên Đám mây.' };
    }
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    let token = await getAnonymousIdToken(cfg);
    if (!token) {
      try { token = await getAuthToken(cfg); } catch (e) { token = ''; }
    }
    if (!token) {
      return {
        success: false,
        error: lastAnonymousAuthError
          || 'Không tạo được phiên gửi yêu cầu. Hãy kiểm tra Firebase Authentication > Anonymous và Web API Key.'
      };
    }

    const claims = decodeJwtPayload(token) || {};
    const sdkUser = getCurrentAuthUser();
    const uid = claims.user_id || claims.sub
      || (sdkUser && sdkUser.uid)
      || anonymousAuthCache.uid
      || '';
    if (!uid) return { success: false, error: 'Không xác định được phiên người dùng.' };

    const url = formatFirebaseUrl(
      cfg.databaseUrl,
      (cfg.requestsPath || 'tvts_requests') + '/mssv_owner/' + encodeURIComponent(id),
      token
    );
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uid)
      });
      let data = null;
      try { data = await response.json(); } catch (e) { data = null; }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: 'MSSV này đã được một phiên khác đăng ký trước. '
              + 'Vui lòng liên hệ Ban Tuyển Sinh nếu cần cập nhật.'
          };
        }
        return { success: false, error: `Firebase HTTP ${response.status}: ${response.statusText}` };
      }
      if (data && typeof data === 'object' && data.error) {
        return { success: false, error: 'Firebase từ chối giữ chỗ MSSV.' };
      }
      return { success: true, uid };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  /**
   * Sinh viên gửi đăng ký ca rảnh cả tháng.
   * Trạng thái 'registered' nghĩa là đã ghi nhận — cán bộ KHÔNG phải duyệt
   * từng đăng ký; ca rảnh được gộp tự động khi cán bộ nhận dữ liệu.
   * @param {string} mssv
   * @param {object} payload { fullName, month:{month,year}, shifts:{1..4}, availableShifts }
   */
  async function submitRegistration(mssv, payload, customCfg) {
    const id = String(mssv || '').trim();
    if (!/^[A-Za-z0-9_-]{2,32}$/.test(id)) {
      return { success: false, error: 'MSSV không hợp lệ để gửi lên Đám mây.' };
    }

    // Bước 1: giữ chỗ MSSV cho phiên này (chống ghi đè của MSSV khác).
    const claim = await claimMssv(id, customCfg);
    if (!claim.success) return claim;

    const body = Object.assign({}, sanitizePublicData(payload) || {});
    body.mssv = id;
    body.status = body.status || 'registered';
    body.submittedAt = body.submittedAt || new Date().toISOString();

    const res = await putRequestNode('registrations/' + encodeURIComponent(id), body, customCfg);
    if (res.success) {
      try {
        window.dispatchEvent(new CustomEvent('ts:request-submitted', {
          detail: { type: 'registration', mssv: id }
        }));
      } catch (e) {}
    }
    return res;
  }

  /** Sinh viên gửi đề xuất đổi ca / nhờ trực hộ. */
  async function submitSwap(request, customCfg) {
    const body = Object.assign({}, sanitizePublicData(request) || {});
    body.id = body.id || generateRequestId('swap');
    // Luôn 'pending' khi sinh viên gửi — trạng thái duyệt chỉ do cán bộ đặt.
    // (Rules cũng chỉ cho owner ghi status 'pending' khi tạo mới.)
    body.status = 'pending';
    body.createdAt = body.createdAt || new Date().toISOString();

    const res = await putRequestNode('swaps/' + encodeURIComponent(body.id), body, customCfg);
    if (res.success) {
      try {
        window.dispatchEvent(new CustomEvent('ts:request-submitted', {
          detail: { type: 'swap', id: body.id }
        }));
      } catch (e) {}
    }
    return res;
  }

  /**
   * Cán bộ tải TOÀN BỘ yêu cầu (cần đăng nhập Google + UID trong /staff).
   * GET ở node cha tvts_requests — Rules cho staff đọc cả nhánh.
   */
  async function pullRequests(customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }
    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, error: authErr.message };
    }
    if (!token) {
      return { success: false, error: 'Cần đăng nhập Google (cán bộ) để tải yêu cầu sinh viên.' };
    }

    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.requestsPath || 'tvts_requests', token);
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      const data = await response.json();
      if (data && typeof data === 'object' && data.error) {
        const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(`Firebase từ chối đọc yêu cầu: ${detail}`);
      }
      return {
        success: true,
        data: (data && typeof data === 'object' && !Array.isArray(data)) ? data : {},
        message: 'Đã tải yêu cầu từ sinh viên.'
      };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  /**
   * Trang sinh viên tải TRẠNG THÁI đề xuất đổi ca từ nhánh CÔNG KHAI.
   *
   * Rules mới không còn cho đọc cả collection tvts_requests/swaps (chỉ staff
   * hoặc chủ sở hữu từng yêu cầu). Vì vậy chỉ GET tvts_public và gộp
   * swapStatuses (status-only) vào các yêu cầu đã có trên máy.
   */
  async function pullPublicSwaps(customCfg) {
    const cfg = customCfg || getConfig();
    if (!cfg.databaseUrl) return { success: false, error: 'Chưa cấu hình URL Firebase!' };
    const url = formatFirebaseUrl(
      cfg.databaseUrl,
      cfg.publicPath || 'tvts_public',
      ''
    );
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      const data = await response.json();
      if (data && typeof data === 'object' && data.error) {
        return { success: false, error: 'Firebase từ chối đọc trạng thái đổi ca.' };
      }

      const localSwaps = readStorageJson(STORAGE_KEYS.SWAP_REQUESTS, []);
      const remoteStatuses = data && typeof data === 'object' ? data.swapStatuses : null;
      const merged = mergePublicSwapStatuses(localSwaps, remoteStatuses);
      if (merged.updated > 0) {
        localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(merged.swaps));
        try {
          window.dispatchEvent(new CustomEvent('ts:data-changed', {
            detail: { keys: [STORAGE_KEYS.SWAP_REQUESTS] }
          }));
        } catch (e) {}
      }
      return { success: true, swaps: merged.swaps, updated: merged.updated };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  /**
   * Gộp yêu cầu đổi ca từ Cloud vào danh sách cục bộ.
   * Giữ trạng thái đã xử lý trên máy này; bản approved/rejected từ Cloud sẽ
   * thắng bản pending để sinh viên thấy kết quả duyệt.
   */
  function mergeSwapRequests(localList, remoteList) {
    const byId = new Map();
    (Array.isArray(localList) ? localList : []).forEach(item => {
      if (item && item.id) byId.set(String(item.id), Object.assign({}, item));
    });
    (Array.isArray(remoteList) ? remoteList : []).forEach(item => {
      if (!item || !item.id) return;
      const id = String(item.id);
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, Object.assign({}, item));
        return;
      }
      const localHandled = existing.status === 'approved' || existing.status === 'rejected';
      const remoteHandled = item.status === 'approved' || item.status === 'rejected';
      if (localHandled && !remoteHandled) return;
      byId.set(id, Object.assign({}, existing, item, { id: existing.id || item.id }));
    });
    return Array.from(byId.values())
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 200);
  }

  /**
   * Gộp yêu cầu đăng ký ca vào danh sách sinh viên cục bộ của cán bộ.
   * Chỉ cập nhật người ĐÃ CÓ trong danh sách; không tự thêm MSSV lạ.
   */
  // ---- Kiểm tra dữ liệu yêu cầu trước khi gộp vào danh sách CTV -------------
  // Yêu cầu đến từ client sinh viên nên KHÔNG đáng tin: Rules chỉ kiểm tra có
  // trường, không kiểm tra nội dung. Mọi ca phải khớp mã ca chuẩn của app.
  const WEEK_KEYS = ['1', '2', '3', '4'];
  const MAX_SHIFTS_PER_WEEK = 10;

  function getCanonicalShiftIds() {
    const engine = (typeof window !== 'undefined' && window.SchedulerEngine) || {};
    const list = Array.isArray(engine.SHIFTS) ? engine.SHIFTS : [];
    return new Set(list.map(s => s && s.id).filter(Boolean));
  }

  /** Lọc một mảng mã ca: chuỗi, đúng định dạng, thuộc danh mục, tối đa 10. */
  function sanitizeShiftIdList(value, validIds) {
    if (!Array.isArray(value)) return null;
    const out = [];
    for (const raw of value) {
      if (typeof raw !== 'string') continue;
      const id = raw.trim();
      if (!id || id.length > 12 || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
      if (validIds && validIds.size && !validIds.has(id)) continue;
      if (!out.includes(id)) out.push(id);
      if (out.length >= MAX_SHIFTS_PER_WEEK) break;
    }
    return out;
  }

  /** Lọc ca rảnh theo tuần: chỉ nhận khoá 1..4, mỗi tuần là mảng mã ca hợp lệ. */
  function sanitizeWeeklyAvailability(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const validIds = getCanonicalShiftIds();
    const out = {};
    let hasAny = false;
    WEEK_KEYS.forEach(week => {
      const source = value[week] !== undefined ? value[week] : value[Number(week)];
      const cleaned = sanitizeShiftIdList(source, validIds);
      if (cleaned) {
        out[week] = cleaned;
        hasAny = true;
      }
    });
    return hasAny ? out : null;
  }

  function mergeRegistrationRequests(localList, remoteMap) {
    const students = Array.isArray(localList)
      ? localList.map(s => Object.assign({}, s))
      : [];
    const indexByMssv = new Map();
    students.forEach((s, idx) => {
      if (s && s.studentId) indexByMssv.set(String(s.studentId).toLowerCase(), idx);
    });

    let mergedCount = 0;
    Object.keys(remoteMap || {}).forEach(key => {
      const req = remoteMap[key];
      if (!req || typeof req !== 'object') return;
      const mssv = String(req.mssv || key || '');
      const idx = indexByMssv.get(mssv.toLowerCase());
      if (idx === undefined) return;

      const current = students[idx];
      // Mốc thời gian do client gửi -> chặn tương lai để không "khoá" bản ghi
      // vĩnh viễn (gửi năm 2030 thì mọi cập nhật sau đều bị coi là cũ).
      const reqStampRaw = Date.parse(req.submittedAt || '') || 0;
      const reqStamp = reqStampRaw ? Math.min(reqStampRaw, Date.now() + 60 * 1000) : 0;
      const currentStamp = Number(current.updatedAt) || 0;
      if (reqStamp && reqStamp <= currentStamp) return;

      const safeShifts = sanitizeWeeklyAvailability(req.shifts);
      const safeAvailable = sanitizeShiftIdList(req.availableShifts, getCanonicalShiftIds());

      students[idx] = Object.assign({}, current, {
        monthlyAvailableShifts: safeShifts || current.monthlyAvailableShifts,
        availableShifts: safeAvailable || current.availableShifts,
        updatedAt: reqStamp || Date.now()
      });
      mergedCount++;
    });

    return { students, mergedCount };
  }

  /**
   * Áp dụng yêu cầu đã tải từ Cloud vào LocalStorage của cán bộ.
   * Ca rảnh được gộp NGAY, không cần duyệt từng yêu cầu; lịch trực vẫn chỉ
   * được xếp khi cán bộ chủ động bấm nút xếp ca.
   */
  function applyRequestsPayload(data) {
    const touchedKeys = [];
    let mergedRegistrations = 0;
    let mergedSwaps = 0;

    try {
      if (data && data.registrations && typeof data.registrations === 'object') {
        const localStudents = readStorageJson(STORAGE_KEYS.STUDENTS, []);
        const merged = mergeRegistrationRequests(localStudents, data.registrations);
        if (merged.mergedCount > 0) {
          localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(merged.students));
          touchedKeys.push(STORAGE_KEYS.STUDENTS);
          mergedRegistrations = merged.mergedCount;
        }
      }

      if (data && data.swaps && typeof data.swaps === 'object') {
        const remoteSwaps = Object.keys(data.swaps).map(key =>
          Object.assign({ id: key }, data.swaps[key] || {})
        );
        const localSwaps = readStorageJson(STORAGE_KEYS.SWAP_REQUESTS, []);
        const merged = mergeSwapRequests(localSwaps, remoteSwaps);
        const changed = JSON.stringify(merged) !== JSON.stringify(localSwaps);
        if (changed) {
          localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(merged));
          touchedKeys.push(STORAGE_KEYS.SWAP_REQUESTS);
        }
        mergedSwaps = remoteSwaps.length;
      }

      if (touchedKeys.length > 0) {
        try {
          window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: touchedKeys } }));
        } catch (e) {}
      }
      return { success: true, mergedRegistrations, mergedSwaps, keys: touchedKeys };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** Cán bộ cập nhật trạng thái một đề xuất đổi ca trên Cloud. */
  async function updateSwapRequest(swapId, patch, customCfg) {
    const cfg = customCfg || getConfig();
    const id = String(swapId || '').trim();
    if (!id) return { success: false, error: 'Thiếu mã yêu cầu đổi ca.' };

    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, error: authErr.message };
    }
    if (!token) {
      return { success: false, error: 'Cần đăng nhập Google (cán bộ) để cập nhật yêu cầu.' };
    }

    const url = formatFirebaseUrl(
      cfg.databaseUrl,
      (cfg.requestsPath || 'tvts_requests') + '/swaps/' + encodeURIComponent(id),
      token
    );
    if (!url) return { success: false, error: 'URL Firebase không hợp lệ!' };

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch || {})
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      let result = null;
      try { result = await response.json(); } catch (e) { result = null; }
      if (result && typeof result === 'object' && result.error) {
        return { success: false, error: 'Firebase từ chối cập nhật yêu cầu.' };
      }
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Lỗi kết nối Firebase Cloud' };
    }
  }

  // Đẩy dữ liệu từ LocalStorage lên Firebase Cloud (Push)
  //
  // options.force === true: bỏ qua cảnh báo xung đột / guard thu nhỏ danh sách.
  // Chỉ dùng sau khi người dùng đã xác nhận rõ ràng.
  async function pushToCloud(customCfg, options = {}) {
    const cfg = customCfg || getConfig();
    if (isStudentMode(cfg)) {
      return { success: false, error: 'Trang sinh viên không có quyền đẩy dữ liệu riêng tư lên Cloud.' };
    }
    if (!cfg.databaseUrl) {
      return { success: false, error: 'Chưa cấu hình URL Cơ sở dữ liệu Firebase!' };
    }

    const force = Boolean(options && options.force === true);

    const url = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, cfg.apiKey);
    if (!url) {
      return { success: false, error: 'URL Firebase không hợp lệ!' };
    }

    // Đăng nhập tài khoản đồng bộ (nếu đã cấu hình) để lấy ID token.
    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, error: authErr.message };
    }
    const authedUrl = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, token);
    if (!authedUrl) {
      return { success: false, error: 'URL Firebase không hợp lệ!' };
    }

    const payload = buildPayload();
    const lastCloudUpdatedAt = Number(cfg.lastCloudUpdatedAt) || 0;
    const localStudents = Array.isArray(payload.students) ? payload.students : null;

    // -----------------------------------------------------------------------
    // PREFLIGHT: máy đã từng đồng bộ thì đọc bản trên Cloud trước khi ghi.
    //
    // Bỏ qua khi lastCloudUpdatedAt = 0 (lần đẩy đầu tiên) để luồng đơn giản
    // và không phát sinh thêm request. Nếu đọc lỗi, DỪNG hẳn — thà không đẩy
    // còn hơn ghi đè mù dữ liệu của thiết bị khác (trừ khi force).
    // -----------------------------------------------------------------------
    let remote = null;
    const needsPreflight = lastCloudUpdatedAt > 0
      || (Array.isArray(payload.adminUsers) && payload.adminUsers.length > 0);
    if (needsPreflight) {
      let preflightError = '';
      try {
        const preflightResponse = await fetch(authedUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        let preflightData = null;
        let parseFailed = false;
        try { preflightData = await preflightResponse.json(); } catch (e) {
          preflightData = null;
          parseFailed = true;
        }

        if (!preflightResponse.ok) {
          const detail = preflightData && preflightData.error
            ? (typeof preflightData.error === 'string'
              ? preflightData.error
              : JSON.stringify(preflightData.error))
            : (preflightResponse.statusText || ('HTTP ' + preflightResponse.status));
          preflightError = `Firebase HTTP ${preflightResponse.status}: ${detail}`;
        } else if (parseFailed) {
          preflightError = 'Phản hồi Cloud không phải JSON hợp lệ';
        } else if (preflightData && typeof preflightData === 'object'
          && !Array.isArray(preflightData) && preflightData.error) {
          const detail = typeof preflightData.error === 'string'
            ? preflightData.error
            : JSON.stringify(preflightData.error);
          preflightError = 'Firebase từ chối đọc: ' + detail;
        } else {
          remote = (preflightData && typeof preflightData === 'object'
            && !Array.isArray(preflightData)) ? preflightData : {};
        }
      } catch (preflightErr) {
        preflightError = preflightErr.message || 'Lỗi kết nối Firebase Cloud';
      }

      if (preflightError && !force) {
        return {
          success: false,
          error: 'Không kiểm tra được dữ liệu trên Cloud trước khi đẩy nên đã dừng lại '
            + 'để bảo vệ dữ liệu: ' + preflightError
        };
      }
    }

    const remoteStudentsCount = (() => {
      if (!remote || !remote.students) return 0;
      if (Array.isArray(remote.students)) return remote.students.length;
      return typeof remote.students === 'object' ? Object.keys(remote.students).length : 0;
    })();

    // Tài khoản cán bộ là dữ liệu nhạy cảm nhất: máy mới thiết lập lần đầu
    // tuyệt đối không được PATCH đè danh sách tài khoản đang có trên Cloud.
    const remoteAdminCount = (() => {
      if (!remote || !remote.adminUsers) return 0;
      if (Array.isArray(remote.adminUsers)) return remote.adminUsers.length;
      return typeof remote.adminUsers === 'object' ? Object.keys(remote.adminUsers).length : 0;
    })();
    const localAdminCount = Array.isArray(payload.adminUsers) ? payload.adminUsers.length : 0;

    if (!force && remote) {
      if (remoteAdminCount > 0 && localAdminCount > 0 && localAdminCount < remoteAdminCount) {
        return {
          success: false,
          guard: true,
          remoteAdminCount,
          localAdminCount,
          error: `Cloud đang có ${remoteAdminCount} tài khoản cán bộ, máy này chỉ có ${localAdminCount}. `
            + 'Đã chặn đẩy để tránh xoá quyền của người khác. '
            + 'Hãy kéo dữ liệu Cloud trước, hoặc xác nhận ghi đè (force) nếu chắc chắn.'
        };
      }
      // XUNG ĐỘT: Cloud có bản mới hơn mốc máy này biết, máy này cũng có thay
      // đổi chưa đẩy, và bản trên Cloud do thiết bị khác tạo.
      const remoteUpdatedAt = Number(remote.updatedAt) || 0;
      const localUpdatedAt = Number(cfg.localUpdatedAt) || 0;
      const remoteDeviceId = typeof remote.deviceId === 'string'
        ? remote.deviceId
        : (typeof remote.updatedByDeviceId === 'string' ? remote.updatedByDeviceId : '');
      if (remoteUpdatedAt > lastCloudUpdatedAt
        && localUpdatedAt > 0
        && (!remoteDeviceId || remoteDeviceId !== payload.deviceId)) {
        return {
          success: false,
          conflict: true,
          remoteUpdatedAt,
          localUpdatedAt,
          error: 'Cloud có bản cập nhật mới hơn từ thiết bị khác. '
            + 'Hãy kéo dữ liệu mới nhất trước, hoặc xác nhận ghi đè (force) nếu chắc chắn.'
        };
      }

      // GUARD 1: danh sách cục bộ teo bất thường so với bản trên Cloud.
      if (localStudents && remoteStudentsCount > 0) {
        const localCount = localStudents.length;
        const lost = remoteStudentsCount - localCount;
        if (localCount < Math.ceil(remoteStudentsCount * 0.5) && lost >= 3) {
          return {
            success: false,
            guard: true,
            remoteCount: remoteStudentsCount,
            localCount,
            error: `Danh sách trên máy chỉ còn ${localCount}/${remoteStudentsCount} CTV `
              + '(mất ' + lost + ' người). Đã chặn đẩy để tránh xoá nhầm dữ liệu Cloud. '
              + 'Hãy kiểm tra lại hoặc xác nhận ghi đè (force).'
          };
        }
      }
    }

    // GUARD 2: so với số CTV của lần đẩy thành công gần nhất trên máy này.
    if (!force && localStudents) {
      const lastPushedCount = Number(cfg.lastPushedStudentCount) || 0;
      if (lastPushedCount >= 10
        && localStudents.length < Math.ceil(lastPushedCount * 0.5)) {
        return {
          success: false,
          guard: true,
          remoteCount: remoteStudentsCount,
          localCount: localStudents.length,
          error: `Danh sách trên máy (${localStudents.length}) ít hơn một nửa số CTV `
            + `đã đẩy lần trước (${lastPushedCount}). Đã chặn đẩy để tránh mất dữ liệu. `
            + 'Hãy kiểm tra lại hoặc xác nhận ghi đè (force).'
        };
      }
    }

    // -----------------------------------------------------------------------
    // CHỈ PATCH các khoá thực sự thay đổi (so với bản preflight).
    //
    // Firebase PUT tới `path.json` GHI ĐÈ TOÀN BỘ node: mọi khoá không có trong
    // payload đều bị XOÁ. PATCH chỉ cập nhật khoá được gửi lên, giữ nguyên phần
    // còn lại. Khoá meta (updatedAt/deviceId/version) luôn được gửi để Cloud
    // biết lần đồng bộ này; nếu dữ liệu không đổi thì body chỉ còn meta.
    // -----------------------------------------------------------------------
    let bodyToSend = payload;
    if (remote) {
      bodyToSend = {};
      Object.keys(payload).forEach(key => {
        if (PUSH_META_KEYS.includes(key)) {
          bodyToSend[key] = payload[key];
          return;
        }
        if (stableStringify(payload[key]) === stableStringify(remote[key])) return;
        bodyToSend[key] = payload[key];
      });
    }

    try {
      const response = await fetch(authedUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSend)
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
      // Nhớ số CTV vừa đẩy để chặn lần sau nếu danh sách teo bất thường.
      if (localStudents) {
        cfg.lastPushedStudentCount = localStudents.length;
      }
      saveConfig(cfg);

      // Cập nhật luôn nhánh công khai cho trang sinh viên (nếu là trang admin).
      let publicResult = null;
      if (shouldPublishPublic(cfg)) {
        publicResult = await pushPublicToCloud(cfg);
      }

      return {
        success: true,
        timestamp: cfg.lastSyncTime,
        keys: Object.keys(bodyToSend),
        message: 'Đã đẩy dữ liệu lên Đám mây thành công!',
        data: result,
        publicResult
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

    // Đăng nhập tài khoản đồng bộ (nếu đã cấu hình) để lấy ID token.
    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, error: authErr.message };
    }
    const authedUrl = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, token);

    try {
      const response = await fetch(authedUrl, {
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

    let token = '';
    try {
      token = await getAuthToken(cfg);
    } catch (authErr) {
      return { success: false, message: authErr.message };
    }
    const authedUrl = formatFirebaseUrl(cfg.databaseUrl, cfg.syncPath, token);

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

      const res = await fetch(authedUrl, {
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
        if (isStudentMode(cfg)) {
          // Trang sinh viên: chỉ kéo nhánh công khai (đã bao gồm swapStatuses).
          await pullPublicFromCloud(cfg);
        } else {
          // Chưa đăng nhập Google và chưa cấu hình tài khoản đồng bộ thì
          // không gọi GET nhánh riêng tư (Rules trả 401, chỉ làm nhiễu console).
          // Người dùng đăng nhập rồi mới tự động kéo.
          const authUser = typeof getCurrentAuthUser === 'function' ? getCurrentAuthUser() : null;
          const hasSyncCreds = Boolean(authUser || (cfg.authEmail && cfg.authPassword));
          if (!hasSyncCreds) {
            console.info('[CloudSync] Chưa đăng nhập Google — bỏ qua tự động kéo dữ liệu riêng tư.');
            return;
          }
          await pullFromCloud(cfg);
        }
      } catch (e) {
        console.warn('[CloudSync] Tự động kéo dữ liệu ban đầu không thành công:', e.message);
      }
    }
  }

  // Kích hoạt đồng bộ tự động khi có thay đổi trên local (Debounced Auto-Push)
  let autoPushTimer = null;
  function triggerAutoPush() {
    const cfg = getConfig();
    // Trang sinh viên TUYỆT ĐỐI không tự đẩy dữ liệu riêng tư lên Cloud.
    if (isStudentMode(cfg)) return;
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
    getAuthToken,
    triggerAutoPush,
    autoInit,
    safeSetItem,
    estimateStorageUsage,

    // ---- Dữ liệu công khai cho trang sinh viên ----
    publicStudentRecord,
    publicSwapStatus,
    buildPublicPayload,
    applyPublicPayload,
    pushPublicToCloud,
    pullPublicFromCloud,
    mergePublicSwapStatuses,

    // ---- Yêu cầu từ sinh viên ----
    submitRegistration,
    submitSwap,
    putRequestNode,
    pullRequests,
    applyRequestsPayload,
    pullPublicSwaps,
    updateSwapRequest,
    mergeRegistrationRequests,
    mergeSwapRequests,

    // ---- Xác thực: Google cho cán bộ, ẩn danh cho sinh viên ----
    signInWithGoogle,
    signOutFirebase,
    getCurrentAuthUser,
    encodeStaffEmailKey,
    checkStaffAccess,
    grantStaffEmail,
    revokeStaffEmail,
    listStaffEmails,
    signInAnonymous,
    getAnonymousIdToken,
    isStudentMode,
    shouldPublishPublic
  };

})();
