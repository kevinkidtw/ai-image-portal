// gas/Store.gs — 儲存層與狀態管理
// 封裝 PropertiesService, CacheService, LockService, SpreadsheetApp

/**
 * 預設設定值
 */
var DEFAULT_CONFIG = {
  PROVIDER: 'gemini',
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-3.1-flash-image',
  OPENAI_API_KEY: '',
  OPENAI_MODEL: 'gpt-image-1',
  OPENAI_QUALITY: 'low',
  ADMIN_PASSWORD_HASH: '',
  ADMIN_PASSWORD_SALT: '',
  CLASS_CODE: '',
  SERVICE_OPEN: 'false',
  OPEN_UNTIL: '',
  DAILY_LIMIT_GLOBAL: '200',
  DAILY_LIMIT_PER_DEVICE: '10',
  COOLDOWN_SEC: '20',
  MAX_CONCURRENT: '8',
  ALLOW_PHOTO: 'true',
  LOG_SHEET_ID: '',
  COST_PER_IMAGE_USD: '',
  BLOCKED_DEVICES: '[]'
};

var Store = {
  /**
   * 集中讀取設定並完成型別轉換與預設值補齊（唯一型別轉換位置）
   * @param {Object} [customProps] - 供測試注入或自訂 Properties
   * @returns {Object} 完整 camelCase 設定物件
   */
  getConfig: function(customProps) {
    var raw = {};
    if (customProps && typeof customProps === 'object') {
      raw = customProps;
    } else {
      try {
        raw = PropertiesService.getScriptProperties().getProperties() || {};
      } catch (e) {
        raw = {};
      }
    }

    var parseNum = function(val, defaultVal) {
      if (val === undefined || val === null || val === '') return defaultVal;
      var n = parseInt(val, 10);
      return Number.isFinite(n) ? n : defaultVal;
    };

    var parseJson = function(val) {
      if (!val) return JSON.parse('[]');
      try {
        var parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : JSON.parse('[]');
      } catch (e) {
        return JSON.parse('[]');
      }
    };

    return {
      provider: raw.PROVIDER || DEFAULT_CONFIG.PROVIDER,
      geminiApiKey: raw.GEMINI_API_KEY || '',
      geminiModel: raw.GEMINI_MODEL || DEFAULT_CONFIG.GEMINI_MODEL,
      openaiApiKey: raw.OPENAI_API_KEY || '',
      openaiModel: raw.OPENAI_MODEL || DEFAULT_CONFIG.OPENAI_MODEL,
      openaiQuality: raw.OPENAI_QUALITY || DEFAULT_CONFIG.OPENAI_QUALITY,
      adminPasswordHash: raw.ADMIN_PASSWORD_HASH || '',
      adminPasswordSalt: raw.ADMIN_PASSWORD_SALT || '',
      classCode: raw.CLASS_CODE !== undefined ? raw.CLASS_CODE : DEFAULT_CONFIG.CLASS_CODE,
      serviceOpen: raw.SERVICE_OPEN === 'true',
      openUntil: raw.OPEN_UNTIL || null,
      dailyLimitGlobal: parseNum(raw.DAILY_LIMIT_GLOBAL, 200),
      dailyLimitPerDevice: parseNum(raw.DAILY_LIMIT_PER_DEVICE, 10),
      cooldownSec: parseNum(raw.COOLDOWN_SEC, 20),
      maxConcurrent: parseNum(raw.MAX_CONCURRENT, 8),
      allowPhoto: raw.ALLOW_PHOTO !== 'false',
      logSheetId: raw.LOG_SHEET_ID || '',
      costPerImageUsd: (raw.COST_PER_IMAGE_USD && !isNaN(parseFloat(raw.COST_PER_IMAGE_USD))) ? parseFloat(raw.COST_PER_IMAGE_USD) : null,
      blockedDevices: parseJson(raw.BLOCKED_DEVICES, []),
      inFlightTimeoutMs: 150000
    };
  },

  /**
   * 寫入設定（由 camelCase 轉回 UPPER_CASE 字串儲存）
   * @param {Object} updates
   */
  setConfig: function(updates) {
    if (!updates || typeof updates !== 'object') return;
    var mapping = {
      provider: 'PROVIDER',
      geminiApiKey: 'GEMINI_API_KEY',
      geminiModel: 'GEMINI_MODEL',
      openaiApiKey: 'OPENAI_API_KEY',
      openaiModel: 'OPENAI_MODEL',
      openaiQuality: 'OPENAI_QUALITY',
      adminPasswordHash: 'ADMIN_PASSWORD_HASH',
      adminPasswordSalt: 'ADMIN_PASSWORD_SALT',
      classCode: 'CLASS_CODE',
      serviceOpen: 'SERVICE_OPEN',
      openUntil: 'OPEN_UNTIL',
      dailyLimitGlobal: 'DAILY_LIMIT_GLOBAL',
      dailyLimitPerDevice: 'DAILY_LIMIT_PER_DEVICE',
      cooldownSec: 'COOLDOWN_SEC',
      maxConcurrent: 'MAX_CONCURRENT',
      allowPhoto: 'ALLOW_PHOTO',
      logSheetId: 'LOG_SHEET_ID',
      costPerImageUsd: 'COST_PER_IMAGE_USD',
      blockedDevices: 'BLOCKED_DEVICES'
    };


    var toSave = {};
    for (var key in updates) {
      if (mapping[key]) {
        var val = updates[key];
        if (typeof val === 'boolean') {
          toSave[mapping[key]] = val ? 'true' : 'false';
        } else if (typeof val === 'object' && val !== null) {
          toSave[mapping[key]] = JSON.stringify(val);
        } else if (val === null || val === undefined) {
          toSave[mapping[key]] = '';
        } else {
          toSave[mapping[key]] = String(val);
        }
      }
    }
    PropertiesService.getScriptProperties().setProperties(toSave);
  },

  /**
   * 讀取當前運行動態狀態
   * @param {string} deviceId
   * @param {string} dateKey
   * @returns {Object} state
   */
  getState: function(deviceId, dateKey) {
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();

    var dailyGlobalCount = parseInt(props.getProperty('count_' + dateKey) || '0', 10);
    if (!Number.isFinite(dailyGlobalCount)) dailyGlobalCount = 0;

    var deviceDailyCount = parseInt(cache.get('dev_' + dateKey + '_' + deviceId) || '0', 10);
    if (!Number.isFinite(deviceDailyCount)) deviceDailyCount = 0;

    var lastDeviceRequestTime = parseInt(cache.get('cool_' + deviceId) || '0', 10);
    if (!Number.isFinite(lastDeviceRequestTime)) lastDeviceRequestTime = 0;

    var rawInFlight = cache.get('in_flight');
    var inFlightRequests = [];
    if (rawInFlight) {
      try {
        inFlightRequests = JSON.parse(rawInFlight);
      } catch (e) {
        inFlightRequests = [];
      }
    }

    return {
      deviceId: deviceId,
      dailyGlobalCount: dailyGlobalCount,
      deviceDailyCount: deviceDailyCount,
      lastDeviceRequestTime: lastDeviceRequestTime,
      inFlightRequests: inFlightRequests
    };
  },

  /**
   * 儲存預扣後的配額狀態（在鎖內執行）
   * @param {Object} nextState
   * @param {string} dateKey
   */
  saveQuotaPreHold: function(nextState, dateKey) {
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();

    // 1. 全班當日計數存 PropertiesService
    props.setProperty('count_' + dateKey, String(nextState.dailyGlobalCount));

    // 2. 裝置計數與冷卻存 CacheService (TTL 最長 6 小時 = 21600 秒)
    var deviceKey = 'dev_' + dateKey + '_' + nextState.deviceId;
    cache.put(deviceKey, String(nextState.deviceDailyCount), 21600);

    var coolKey = 'cool_' + nextState.deviceId;
    cache.put(coolKey, String(nextState.lastDeviceRequestTime), 21600);

    // 3. in-flight 記錄存 CacheService (TTL 300 秒)
    cache.put('in_flight', JSON.stringify(nextState.inFlightRequests), 300);
  },

  /**
   * 退還額度（在鎖內執行，僅退還計數）
   * @param {Object} state
   * @param {string} dateKey
   */
  refundQuota: function(state, dateKey) {
    var nextState = Logic.refundQuota(state);
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();

    props.setProperty('count_' + dateKey, String(nextState.dailyGlobalCount));
    var deviceKey = 'dev_' + dateKey + '_' + state.deviceId;
    cache.put(deviceKey, String(nextState.deviceDailyCount), 21600);

    return nextState;
  },

  /**
   * 釋放指定 in-flight（在鎖內執行）
   * @param {Object} state
   * @param {number} requestTimestamp
   */
  releaseInFlight: function(state, requestTimestamp) {
    var nextState = Logic.releaseInFlight(state, requestTimestamp);
    var cache = CacheService.getScriptCache();
    cache.put('in_flight', JSON.stringify(nextState.inFlightRequests), 300);
    return nextState;
  },

  /**
   * 寫入日誌紀錄到 Google 試算表（寫紀錄失敗絕不中斷主流程）
   * 防範試算表公式注入：任何以 = + - @ 開頭的字串前面加上單引號 '
   * 記錄 9 欄：時間、裝置短碼、模式、風格、學生描述、結果代碼、耗時(ms)、供應商、錯誤細節
   * @param {Object} record - { timestamp, deviceId, mode, style, prompt, resultCode, durationMs, provider, errorDetail }
   * @param {string} sheetId
   */
  logRequest: function(record, sheetId) {
    if (!sheetId) return;
    try {
      var ss = SpreadsheetApp.openById(sheetId);
      var sheet = ss.getSheetByName('Logs') || ss.getSheets()[0];
      var devShort = String(record.deviceId || '').substring(0, 8);

      var sanitize = function(val) {
        if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
          return "'" + val;
        }
        return val;
      };

      var errorDetail = record.errorDetail ? String(record.errorDetail).substring(0, 300) : '';

      sheet.appendRow([
        sanitize(record.timestamp || new Date().toISOString()),
        sanitize(devShort),
        sanitize(record.mode || ''),
        sanitize(record.style || ''),
        sanitize(String(record.prompt || '').substring(0, 300)),
        sanitize(record.resultCode || ''),
        record.durationMs || 0,
        sanitize(record.provider || ''),
        sanitize(errorDetail)
      ]);
    } catch (e) {
      console.warn('logRequest failed: ' + e.message);
    }
  }
};

