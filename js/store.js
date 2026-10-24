/**
 * ==========================================================================
 * TVTS STORE — LỚP LƯU TRỮ BỔ SUNG BẰNG IndexedDB (#16)
 * ==========================================================================
 * VÌ SAO CẦN:
 *   localStorage chỉ có ~5MB và ghi đồng bộ. Mỗi lịch tháng ~108KB, cộng 6 bản
 *   sao lưu web → rất dễ chạm trần (đã từng phải tự cắt bớt tháng cũ). IndexedDB
 *   cho hàng trăm MB và không chặn giao diện.
 *
 * CHIẾN LƯỢC AN TOÀN (quan trọng):
 *   - GIAI ĐOẠN NÀY: localStorage vẫn là NGUỒN ĐỌC CHÍNH. Mọi thao tác đọc
 *     trong app vẫn đồng bộ như cũ → không thể vỡ luồng đang chạy.
 *   - IndexedDB chỉ GHI SONG SONG (mirror) các key nặng. Nhờ vậy:
 *       + Nếu localStorage bị xoá / hết dung lượng / người dùng "Clear site
 *         data", dữ liệu vẫn còn trong IndexedDB để khôi phục.
 *       + Bước tiếp theo (chưa làm) có thể chuyển hẳn sang đọc bất đồng bộ.
 *   - Mọi hàm đều KHÔNG ném lỗi: trình duyệt chặn IndexedDB (chế độ riêng tư,
 *     iframe sandbox) thì trả về null/false và app chạy tiếp bình thường.
 *
 * KHÔNG lưu bí mật ở đây: không mật khẩu, không PIN, không token. Chỉ lịch
 * trực, danh sách CTV và bản sao lưu — giống hệt những gì localStorage đang có.
 */

(() => {
  'use strict';

  const DB_NAME = 'tvts_scheduler_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';

  /** Các key nặng được mirror sang IndexedDB. */
  const MIRRORED_KEYS = [
    'ts_scheduler_all_months_v1',
    'ts_scheduler_web_backups_v1'
  ];

  let dbPromise = null;

  function available() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  /** Mở (và tạo nếu chưa có) database. Luôn resolve — lỗi thì trả null. */
  function open() {
    if (!available()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        } catch (e) { /* để onerror xử lý */ }
      };

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });

    return dbPromise;
  }

  /** Chạy 1 thao tác trong transaction, luôn resolve (không reject). */
  function withStore(mode, operation) {
    return open().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction(STORE_NAME, mode);
        } catch (e) {
          resolve(null);
          return;
        }

        tx.onabort = () => resolve(null);
        tx.onerror = () => resolve(null);

        let result = null;
        try {
          result = operation(tx.objectStore(STORE_NAME), (value) => { result = value; });
        } catch (e) {
          resolve(null);
          return;
        }

        tx.oncomplete = () => resolve(result);
      });
    }).catch(() => null);
  }

  /**
   * Ghi 1 key vào IndexedDB.
   * @param {string} key
   * @param {string} value chuỗi JSON (giống hệt giá trị trong localStorage)
   * @returns {Promise<boolean>}
   */
  function write(key, value) {
    if (!key || typeof value !== 'string') return Promise.resolve(false);
    return withStore('readwrite', (store) => {
      store.put({ key: String(key), value, savedAt: Date.now() });
      return true;
    }).then(result => result === true);
  }

  /** Đọc 1 key. Trả về chuỗi hoặc null. */
  function read(key) {
    if (!key) return Promise.resolve(null);
    return withStore('readonly', (store, done) => {
      const req = store.get(String(key));
      req.onsuccess = () => {
        const row = req.result;
        done(row && typeof row.value === 'string' ? row.value : null);
      };
      return null;
    }).then(result => (typeof result === 'string' ? result : null));
  }

  /** Xoá 1 key khỏi IndexedDB. */
  function remove(key) {
    if (!key) return Promise.resolve(false);
    return withStore('readwrite', (store) => {
      store.delete(String(key));
      return true;
    }).then(result => result === true);
  }

  /** Danh sách key đang có trong IndexedDB (kèm thời điểm ghi). */
  function listKeys() {
    return withStore('readonly', (store, done) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        done(rows.map(row => ({
          key: row.key,
          savedAt: row.savedAt || 0,
          bytes: typeof row.value === 'string' ? row.value.length : 0
        })));
      };
      return null;
    }).then(result => (Array.isArray(result) ? result : []));
  }

  /** Thống kê dung lượng đang dùng trong IndexedDB. */
  function stats() {
    return listKeys().then(items => ({
      available: available(),
      keys: items,
      totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
      totalKeys: items.length
    }));
  }

  /**
   * Ghi mirror 2 chiều cho 1 key: nếu localStorage không có (hoặc rỗng) mà
   * IndexedDB có thì khôi phục lại localStorage.
   *
   * CHỈ ĐIỀN CHỖ TRỐNG — không bao giờ ghi đè dữ liệu đang có, nên không thể
   * làm mất dữ liệu mới hơn.
   *
   * @param {string} key
   * @returns {Promise<boolean>} true nếu vừa khôi phục được
   */
  function restoreMissing(key) {
    if (!key) return Promise.resolve(false);

    const hasLocal = (() => {
      try {
        const raw = localStorage.getItem(key);
        return typeof raw === 'string' && raw.length > 0;
      } catch (e) {
        return true; // localStorage bị chặn: coi như "đã có", không đụng vào
      }
    })();
    if (hasLocal) return Promise.resolve(false);

    return read(key).then(value => {
      if (!value) return false;
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Khôi phục mọi key nặng đang thiếu trong localStorage.
   * @returns {Promise<string[]>} danh sách key vừa được khôi phục
   */
  function restoreMissingAll(keys) {
    const wanted = Array.isArray(keys) && keys.length > 0 ? keys : MIRRORED_KEYS;
    return Promise.all(wanted.map(key => restoreMissing(key).then(ok => (ok ? key : null))))
      .then(results => results.filter(Boolean));
  }

  /**
   * Ghi mirror một giá trị đang có trong localStorage (nếu có).
   * Dùng sau khi admin vừa ghi xong key nặng.
   */
  function mirrorFromLocalStorage(key) {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (typeof raw !== 'string' || raw.length === 0) return Promise.resolve(false);
      return write(key, raw);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  window.TvtsStore = {
    DB_NAME,
    STORE_NAME,
    MIRRORED_KEYS,
    available,
    open,
    write,
    read,
    remove,
    listKeys,
    stats,
    restoreMissing,
    restoreMissingAll,
    mirrorFromLocalStorage,
    // Dùng cho kiểm thử: xoá kết nối đã cache để nạp lại môi trường khác.
    _resetConnection: () => { dbPromise = null; }
  };
})();
