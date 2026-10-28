/**
 * ============================================================================
 * AUTOMATED TEST SUITE: FIREBASE APP CHECK (tuỳ chọn)
 * ============================================================================
 * App Check chặn việc dùng Web API Key công khai để gọi REST trái phép.
 * Bộ test này khoá 3 hành vi:
 * 1. Chưa cấu hình site key -> hoàn toàn không đổi hành vi (không header, không SDK).
 * 2. Có site key -> request gửi kèm header X-Firebase-AppCheck.
 * 3. Mọi lỗi App Check đều bị nuốt, không làm hỏng nghiệp vụ.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// --- Môi trường giả lập -----------------------------------------------------
class MockStorage {
  constructor() { this.store = {}; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

const LS = new MockStorage();
const SS = new MockStorage();

global.localStorage = LS;
global.sessionStorage = SS;
global.setInterval = () => 1;
global.clearInterval = () => {};

const fetchCalls = [];
global.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options: options || {} });
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
    text: async () => 'null',
    headers: { get: () => 'application/json' }
  };
};

global.window = {
  localStorage: LS,
  sessionStorage: SS,
  addEventListener: () => {},
  dispatchEvent: () => {},
  location: { href: 'https://example.test/', origin: 'https://example.test' },
  navigator: { userAgent: 'node' }
};

global.document = {
  readyState: 'complete',
  head: {
    // Giả lập trình duyệt KHÔNG nạp được script CDN: gọi onerror ở tick sau,
    // để promise nạp SDK kết thúc thay vì treo vô hạn.
    appendChild: (el) => { setTimeout(() => { if (el && el.onerror) el.onerror(new Error('không nạp được script')); }, 0); }
  },
  body: { appendChild: () => {} },
  createElement: () => ({}),
  getElementById: () => null,
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

eval(fs.readFileSync(path.resolve(__dirname, '../js/cloud_sync.js'), 'utf8'));

const Cloud = global.window.CloudSyncManager;
assert.ok(Cloud, 'cloud_sync.js phải export window.CloudSyncManager');

// --- Runner -----------------------------------------------------------------
let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    // Chặn treo: mọi test phải xong trong 5 giây
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, rej) => setTimeout(() => rej(new Error('quá 5 giây (treo)')), 5000))
    ]);
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    console.error(err.stack);
  }
}

(async () => {
  console.log('================================================================');
  console.log('🛡️  BẮT ĐẦU KIỂM THỬ - FIREBASE APP CHECK');
  console.log('================================================================\n');

  await runTest('Mặc định: App Check TẮT, không có site key trong cấu hình', () => {
    LS.clear();
    const cfg = Cloud.getConfig();
    assert.strictEqual(cfg.appCheckSiteKey, '', 'Mặc định phải rỗng');
    assert.strictEqual(Cloud.isAppCheckEnabled(), false);
  });

  await runTest('Chưa cấu hình: token = null và request KHÔNG có header App Check', async () => {
    LS.clear();
    fetchCalls.length = 0;

    const token = await Cloud.getAppCheckToken();
    assert.strictEqual(token, null, 'Chưa bật thì không lấy token');

    await Cloud.__request('https://example.test/data.json', { method: 'GET' });
    assert.strictEqual(fetchCalls.length, 1, 'Vẫn phải gọi fetch bình thường');
    const headers = fetchCalls[0].options.headers || {};
    assert.strictEqual(headers['X-Firebase-AppCheck'], undefined,
      'Không được gắn header khi chưa cấu hình App Check');
  });

  await runTest('Đã cấu hình: request gửi kèm header X-Firebase-AppCheck', async () => {
    LS.clear();
    Cloud.saveConfig({ appCheckSiteKey: '6Lc-test-site-key' });
    assert.strictEqual(Cloud.isAppCheckEnabled(), true);

    // Giả lập SDK App Check đã có sẵn (không cần nạp script CDN)
    let activated = null;
    global.window.firebase = {
      app: () => ({ name: '[DEFAULT]' }),
      initializeApp: () => ({ name: '[DEFAULT]' }),
      appCheck: () => ({
        activate(key) { activated = key; },
        async getToken() { return { token: 'fake-appcheck-token', expireTimeMillis: Date.now() + 3600000 }; }
      })
    };

    fetchCalls.length = 0;
    const token = await Cloud.getAppCheckToken();
    assert.strictEqual(token, 'fake-appcheck-token', 'Phải lấy được token từ SDK');
    assert.strictEqual(activated, '6Lc-test-site-key', 'Phải activate đúng site key');

    await Cloud.__request('https://example.test/data.json', { method: 'GET' });
    const headers = fetchCalls[0].options.headers || {};
    assert.strictEqual(headers['X-Firebase-AppCheck'], 'fake-appcheck-token',
      'Request phải gửi kèm header X-Firebase-AppCheck');
  });

  await runTest('Đã cấu hình nhưng SDK lỗi: trả null, request vẫn chạy, không ném lỗi', async () => {
    LS.clear();
    Cloud.saveConfig({ appCheckSiteKey: '6Lc-test-site-key' });
    // Xoá cache token/khởi tạo để mô phỏng lần chạy đầu tiên
    Cloud.__resetAppCheck();
    // Không có window.firebase -> initAppCheck trả null (nạp script thất bại trong env giả lập)
    delete global.window.firebase;

    fetchCalls.length = 0;
    let token;
    await assert.doesNotReject(async () => { token = await Cloud.getAppCheckToken(); });
    assert.strictEqual(token, null, 'Lỗi App Check phải trả null');

    await Cloud.__request('https://example.test/data.json', { method: 'GET' });
    assert.strictEqual(fetchCalls.length, 1, 'Không được chặn request vì App Check lỗi');
    const headers = fetchCalls[0].options.headers || {};
    assert.strictEqual(headers['X-Firebase-AppCheck'], undefined);
  });

  await runTest('Header App Check đi qua ĐÚNG hàm request của app (không sửa 18 chỗ gọi)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../js/cloud_sync.js'), 'utf8');
    const rawFetch = (src.match(/await fetch\(/g) || []).length;
    const wrapped = (src.match(/await fbFetch\(/g) || []).length;

    assert.strictEqual(rawFetch, 0, 'Không được còn lời gọi fetch() thô nào trong cloud_sync.js');
    assert.ok(wrapped >= 15, 'Mọi request Firebase phải đi qua fbFetch');
    assert.ok(/function fbFetch\(/.test(src), 'Thiếu hàm fbFetch');
  });

  await runTest('Cấu hình App Check được lưu và đọc lại đúng', () => {
    LS.clear();
    Cloud.saveConfig({ appCheckSiteKey: '6Lc-abc' });
    assert.strictEqual(Cloud.getConfig().appCheckSiteKey, '6Lc-abc');
    Cloud.saveConfig({ appCheckSiteKey: '' });
    assert.strictEqual(Cloud.isAppCheckEnabled(), false, 'Xoá site key phải tắt App Check');
  });

  console.log('\n================================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN (${Math.round((passed / (total || 1)) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) process.exit(1);
})();
