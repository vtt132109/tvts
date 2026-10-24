/**
 * ============================================================================
 * AUTOMATED TEST SUITE: #16 — LỚP LƯU TRỮ IndexedDB (js/store.js)
 * ============================================================================
 * Kiểm thử bằng một IndexedDB giả lập trong bộ nhớ (không cần cài thư viện):
 * 1. Trình duyệt KHÔNG có / chặn IndexedDB -> mọi hàm trả false/null, không ném lỗi.
 * 2. Ghi / đọc / xoá / liệt kê / thống kê.
 * 3. Khôi phục dữ liệu bị mất trong localStorage (chỉ điền chỗ trống).
 * 4. Dây nối vào admin: mirror sau khi ghi localStorage + bootstrap khôi phục.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock localStorage -------------------------------------------------------
class MockStorage {
  constructor() {
    this.store = {};
    this.throwOnGet = false;
    this.throwOnSet = false;
  }
  getItem(key) {
    if (this.throwOnGet) throw new Error('SecurityError');
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, val) {
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockLocalStorage = new MockStorage();
global.localStorage = mockLocalStorage;
global.window = { localStorage: mockLocalStorage };

// 2. IndexedDB giả lập tối thiểu -------------------------------------------
function createFakeIndexedDB() {
  const data = new Map();
  let created = false;

  const db = {
    objectStoreNames: { contains: () => created },
    createObjectStore() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      const store = {
        put(row) {
          data.set(row.key, row);
          setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
          return {};
        },
        get(key) {
          const req = { onsuccess: null, result: data.get(key) };
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess();
            // IndexedDB thật: transaction hoàn tất SAU khi request trả kết quả.
            setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
          }, 0);
          return req;
        },
        getAll() {
          const req = { onsuccess: null, result: Array.from(data.values()) };
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess();
            setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
          }, 0);
          return req;
        },
        delete(key) {
          data.delete(key);
          setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
          return {};
        }
      };
      tx.objectStore = () => store;
      return tx;
    }
  };

  return {
    _data: data,
    open() {
      const req = {};
      setTimeout(() => {
        const isFirst = !created;
        created = true;
        req.result = db;
        if (isFirst && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    }
  };
}

function createBrokenIndexedDB() {
  return {
    open() {
      const req = {};
      setTimeout(() => req.onerror && req.onerror(), 0);
      return req;
    }
  };
}

// 3. Nạp module cần kiểm thử ----------------------------------------------
global.indexedDB = createFakeIndexedDB();
eval(fs.readFileSync(path.resolve(__dirname, '../js/store.js'), 'utf8'));

const Store = global.window.TvtsStore;
assert.ok(Store && typeof Store.write === 'function', 'js/store.js phải export window.TvtsStore');

// 4. Test runner bất đồng bộ ----------------------------------------------
let passedTests = 0;
let totalTests = 0;

async function runTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}: ${err.message}`);
    console.error(err.stack);
  }
}

function resetAll() {
  mockLocalStorage.clear();
  mockLocalStorage.throwOnGet = false;
  mockLocalStorage.throwOnSet = false;
  // Mỗi test dùng một IndexedDB giả lập mới tinh (dữ liệu không dính sang test sau).
  global.indexedDB = createFakeIndexedDB();
  Store._resetConnection();
}

(async () => {
  console.log('================================================================');
  console.log('🗄️  BẮT ĐẦU KIỂM THỬ - LỚP LƯU TRỮ IndexedDB (#16)');
  console.log('================================================================\n');

  // ==========================================================================
  // GROUP 1: KHÔNG CÓ / BỊ CHẶN IndexedDB
  // ==========================================================================
  await runTest('Thiếu IndexedDB: available() = false và mọi hàm trả false/null, không ném lỗi', async () => {
    resetAll();
    Store._resetConnection();
    const saved = global.indexedDB;
    delete global.indexedDB;

    try {
      assert.strictEqual(Store.available(), false);
      assert.strictEqual(await Store.write('k', 'v'), false);
      assert.strictEqual(await Store.read('k'), null);
      assert.strictEqual(await Store.remove('k'), false);
      assert.deepStrictEqual(await Store.listKeys(), []);
      assert.strictEqual(await Store.restoreMissing('k'), false);
      assert.deepStrictEqual(await Store.restoreMissingAll(), []);
      assert.strictEqual(await Store.mirrorFromLocalStorage('k'), false);
    } finally {
      global.indexedDB = saved;
      Store._resetConnection();
    }
  });

  await runTest('IndexedDB lỗi khi mở: ghi thất bại nhưng không ném lỗi', async () => {
    resetAll();
    Store._resetConnection();
    const saved = global.indexedDB;
    global.indexedDB = createBrokenIndexedDB();

    try {
      assert.strictEqual(await Store.write('k', 'v'), false);
      assert.strictEqual(await Store.read('k'), null);
    } finally {
      global.indexedDB = saved;
      Store._resetConnection();
    }
  });

  // ==========================================================================
  // GROUP 2: GHI / ĐỌC / XOÁ
  // ==========================================================================
  await runTest('Ghi rồi đọc: trả lại đúng chuỗi JSON đã lưu', async () => {
    resetAll();
    Store._resetConnection();

    const payload = JSON.stringify({ '2026-10': { month: 10, year: 2026, weeks: [] } });
    assert.strictEqual(await Store.write('ts_scheduler_all_months_v1', payload), true);
    assert.strictEqual(await Store.read('ts_scheduler_all_months_v1'), payload);
  });

  await runTest('Đọc key chưa tồn tại: trả null (không ném lỗi)', async () => {
    resetAll();
    assert.strictEqual(await Store.read('khong_ton_tai'), null);
  });

  await runTest('Ghi đè cùng key: giữ giá trị mới nhất', async () => {
    resetAll();
    await Store.write('k', 'v1');
    await Store.write('k', 'v2');
    assert.strictEqual(await Store.read('k'), 'v2');
  });

  await runTest('Dữ liệu không phải chuỗi bị từ chối (chỉ nhận JSON string)', async () => {
    resetAll();
    assert.strictEqual(await Store.write('k', { a: 1 }), false);
    assert.strictEqual(await Store.write('', 'v'), false);
  });

  await runTest('Xoá key: đọc lại trả null', async () => {
    resetAll();
    await Store.write('k', 'v');
    assert.strictEqual(await Store.remove('k'), true);
    assert.strictEqual(await Store.read('k'), null);
  });

  await runTest('Liệt kê & thống kê: đúng số key và tổng dung lượng', async () => {
    resetAll();
    await Store.write('a', '12345');
    await Store.write('b', '123');

    const keys = await Store.listKeys();
    assert.strictEqual(keys.length, 2);
    assert.ok(keys.every(k => typeof k.savedAt === 'number' && k.savedAt > 0));

    const stats = await Store.stats();
    assert.strictEqual(stats.totalKeys, 2);
    assert.strictEqual(stats.totalBytes, 8);
    assert.strictEqual(stats.available, true);
  });

  // ==========================================================================
  // GROUP 3: KHÔI PHỤC KHI localStorage MẤT DỮ LIỆU
  // ==========================================================================
  await runTest('Khôi phục: localStorage trống mà IndexedDB có -> ghi lại vào localStorage', async () => {
    resetAll();
    const key = 'ts_scheduler_all_months_v1';
    await Store.write(key, '{"2026-10":{}}');
    assert.strictEqual(mockLocalStorage.getItem(key), null);

    assert.strictEqual(await Store.restoreMissing(key), true);
    assert.strictEqual(mockLocalStorage.getItem(key), '{"2026-10":{}}');
  });

  await runTest('Khôi phục: KHÔNG ghi đè dữ liệu đang có trong localStorage', async () => {
    resetAll();
    const key = 'ts_scheduler_all_months_v1';
    await Store.write(key, 'BAN_CU');
    mockLocalStorage.setItem(key, 'BAN_MOI');

    assert.strictEqual(await Store.restoreMissing(key), false);
    assert.strictEqual(mockLocalStorage.getItem(key), 'BAN_MOI', 'Dữ liệu mới hơn phải được giữ nguyên');
  });

  await runTest('Khôi phục: IndexedDB cũng không có thì trả false', async () => {
    resetAll();
    assert.strictEqual(await Store.restoreMissing('ts_scheduler_web_backups_v1'), false);
  });

  await runTest('Khôi phục hàng loạt: chỉ trả về các key thực sự được khôi phục', async () => {
    resetAll();
    await Store.write('ts_scheduler_all_months_v1', '{"a":1}');
    await Store.write('ts_scheduler_web_backups_v1', '[]');
    mockLocalStorage.setItem('ts_scheduler_web_backups_v1', '[{"id":"x"}]');

    const restored = await Store.restoreMissingAll();
    assert.deepStrictEqual(restored, ['ts_scheduler_all_months_v1']);
  });

  await runTest('Khôi phục: localStorage bị chặn (ném lỗi) thì bỏ qua an toàn', async () => {
    resetAll();
    await Store.write('ts_scheduler_all_months_v1', '{"a":1}');
    mockLocalStorage.throwOnGet = true;

    assert.strictEqual(await Store.restoreMissing('ts_scheduler_all_months_v1'), false);

    mockLocalStorage.throwOnGet = false;
    mockLocalStorage.throwOnSet = true;
    assert.strictEqual(await Store.restoreMissing('ts_scheduler_all_months_v1'), false);
    mockLocalStorage.throwOnSet = false;
  });

  await runTest('Mirror: chép đúng giá trị đang có trong localStorage sang IndexedDB', async () => {
    resetAll();
    const key = 'ts_scheduler_web_backups_v1';
    mockLocalStorage.setItem(key, '[{"id":"bk1"}]');

    assert.strictEqual(await Store.mirrorFromLocalStorage(key), true);
    assert.strictEqual(await Store.read(key), '[{"id":"bk1"}]');
  });

  await runTest('Mirror: localStorage không có key thì không ghi rác vào IndexedDB', async () => {
    resetAll();
    assert.strictEqual(await Store.mirrorFromLocalStorage('ts_scheduler_web_backups_v1'), false);
    assert.strictEqual(await Store.read('ts_scheduler_web_backups_v1'), null);
  });

  await runTest('Danh sách key mirror mặc định đúng 2 nhóm dữ liệu nặng', async () => {
    assert.deepStrictEqual(Store.MIRRORED_KEYS, [
      'ts_scheduler_all_months_v1',
      'ts_scheduler_web_backups_v1'
    ]);
  });

  // ==========================================================================
  // GROUP 4: DÂY NỐI VÀO TRANG QUẢN TRỊ
  // ==========================================================================
  await runTest('Dây nối: admin.html nạp store.js TRƯỚC admin.js', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
    const storeTag = /<script\s+src="js\/store\.js[^"]*"/.exec(html);
    const adminTag = /<script\s+src="js\/admin\.js[^"]*"/.exec(html);

    assert.ok(storeTag, 'admin.html phải nạp js/store.js');
    assert.ok(adminTag, 'admin.html phải nạp js/admin.js');
    assert.ok(storeTag.index < adminTag.index, 'store.js phải nạp trước admin.js');
  });

  await runTest('Dây nối: admin.js mirror kho lịch tháng và bản sao lưu web', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');

    const calls = src.match(/mirrorToIndexedDb\(STORAGE_KEYS\.(ALL_MONTHS|WEB_BACKUPS)\)/g) || [];
    assert.ok(calls.some(c => c.includes('ALL_MONTHS')), 'Phải mirror kho lịch tháng');
    assert.ok(calls.some(c => c.includes('WEB_BACKUPS')), 'Phải mirror bản sao lưu web');
  });

  await runTest('Dây nối: admin.js có bootstrap khôi phục và chỉ chạy 1 lần mỗi phiên', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');

    assert.ok(src.includes('restoreMissingAll('), 'Phải gọi restoreMissingAll khi khởi động');
    assert.ok(src.includes('ts_store_recovery_done'), 'Phải có cờ chống lặp tải lại trang');
    assert.ok(src.includes('bootstrapIndexedDbRecovery();'), 'Phải gọi bootstrap trong initAdminPortal');
  });

  // ==========================================================================
  console.log('\n================================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / (totalTests || 1)) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) process.exit(1);
})();
