// gas/Code.gs — Web App 入口路由與 generate 流程
// 嚴格落實 PLAN.md 第 4-2 節限額與鎖定機制

/**
 * 處理 HTTP GET 請求
 * 主要提供學生端 status 狀態查詢
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || 'status';

    if (action === 'status') {
      var config = Store.getConfig();
      var dateKey = Logic.dateKeyTaipei(new Date(), function(d) {
        return Utilities.formatDate(d, 'Asia/Taipei', 'yyyyMMdd');
      });

      var deviceId = params.deviceId ? String(params.deviceId).trim() : '';
      if (deviceId) {
        if (deviceId.length < 8 || deviceId.length > 64 || !/^[A-Za-z0-9-]+$/.test(deviceId)) {
          return createJsonResponse({
            ok: false,
            code: 'BAD_REQUEST',
            message: Logic.ERROR_MESSAGES.BAD_REQUEST
          });
        }
      }
      var classCode = params.classCode || '';
      var state = Store.getState(deviceId, dateKey);


      var isOpen = config.serviceOpen;
      if (isOpen && config.openUntil) {
        var untilTime = new Date(config.openUntil).getTime();
        if (Date.now() >= untilTime) {
          isOpen = false;
        }
      }

      var needCode = Boolean(config.classCode && config.classCode.trim() !== '');
      var codeOk = true;
      if (needCode) {
        codeOk = (classCode.trim() === config.classCode.trim());
      }

      var styles = [];
      for (var i = 0; i < Logic.STYLES.length; i++) {
        var s = Logic.STYLES[i];
        if (s.id === 'free') continue;
        styles.push({ id: s.id, label: s.label, emoji: s.emoji });
      }

      var remainingToday = Math.max(0, config.dailyLimitGlobal - state.dailyGlobalCount);
      var deviceRemaining = Math.max(0, config.dailyLimitPerDevice - state.deviceDailyCount);

      return createJsonResponse({
        ok: true,
        data: {
          open: isOpen,
          openUntil: config.openUntil,
          needCode: needCode,
          codeOk: codeOk,
          styles: styles,
          remainingToday: remainingToday,
          deviceRemaining: deviceRemaining,
          cooldownSec: config.cooldownSec,
          mode: {
            text: true,
            photo: config.allowPhoto
          }
        }
      });
    }

    return createJsonResponse({
      ok: false,
      code: 'BAD_REQUEST',
      message: Logic.ERROR_MESSAGES.BAD_REQUEST
    });
  } catch (err) {
    console.error('doGet error: ' + err.stack);
    return createJsonResponse({
      ok: false,
      code: 'PROVIDER_ERROR',
      message: Logic.ERROR_MESSAGES.PROVIDER_ERROR
    });
  }
}

/**
 * 處理 HTTP POST 請求
 * 支援 generate 生圖動作與 admin.* 老師端管理動作
 */
function doPost(e) {
  var startTime = Date.now();
  var body = {};

  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (parseErr) {
    return createJsonResponse({
      ok: false,
      code: 'BAD_REQUEST',
      message: Logic.ERROR_MESSAGES.BAD_REQUEST
    });
  }

  var action = body.action || 'generate';

  // 老師端管理動作路由
  if (action.indexOf('admin.') === 0) {
    try {
      var adminConfig = Store.getConfig();
      var adminDateKey = Logic.dateKeyTaipei(new Date(), function(d) {
        return Utilities.formatDate(d, 'Asia/Taipei', 'yyyyMMdd');
      });
      var adminResult = Admin.handleAction(action, body, adminConfig, adminDateKey);
      return createJsonResponse(adminResult);
    } catch (adminErr) {
      console.error('Admin action error: ' + adminErr.stack);
      return createJsonResponse({
        ok: false,
        code: 'PROVIDER_ERROR',
        message: Logic.ERROR_MESSAGES.PROVIDER_ERROR
      });
    }
  }

  // 學生端生圖流程 (action === 'generate')
  if (action === 'generate') {
    return handleGenerate(body, startTime);
  }

  return createJsonResponse({
    ok: false,
    code: 'BAD_REQUEST',
    message: Logic.ERROR_MESSAGES.BAD_REQUEST
  });
}

/**
 * 嚴格依照 PLAN.md 第 4-2 節實作之 generate 流程
 * @param {Object} body
 * @param {number} startTime
 */
function handleGenerate(body, startTime) {
  var lock = LockService.getScriptLock();
  var requestTimestamp = null;
  var preHeld = false;
  var resultCode = 'UNKNOWN';
  var errorDetail = '';
  var dateKey = '';
  var config = null;
  var previousLastRequestTime = 0;

  try {
    // 步驟 1: 驗證欄位（長度、mode、style 白名單、圖片大小 ≤ 4 MB base64）
    var valRes = Logic.validateRequest(body);
    if (!valRes.valid) {
      resultCode = 'BAD_REQUEST';
      errorDetail = valRes.error || 'BAD_REQUEST';
      return createJsonResponse({
        ok: false,
        code: 'BAD_REQUEST',
        message: Logic.ERROR_MESSAGES.BAD_REQUEST
      });
    }

    // 步驟 2: 本地關鍵字過濾 → BLOCKED_PROMPT（這一步不扣額度）
    if (Logic.checkBlocked(body.prompt)) {
      resultCode = 'BLOCKED_PROMPT';
      errorDetail = 'Blocked keyword in prompt';
      return createJsonResponse({
        ok: false,
        code: 'BLOCKED_PROMPT',
        message: Logic.ERROR_MESSAGES.BLOCKED_PROMPT
      });
    }

    // 步驟 3: ── 取得 LockService.getScriptLock()，tryLock(10000)，拿不到回 BUSY ──
    // [鎖取得點 1]
    var acquiredFirstLock = lock.tryLock(10000);
    if (!acquiredFirstLock) {
      resultCode = 'BUSY';
      errorDetail = 'Lock acquisition timed out';
      return createJsonResponse({
        ok: false,
        code: 'BUSY',
        message: Logic.ERROR_MESSAGES.BUSY
      });
    }

    try {
      // 步驟 4: 讀取設定與計數 → 呼叫 Logic.decideQuota(state, config, now) 純函式
      config = Store.getConfig();
      dateKey = Logic.dateKeyTaipei(new Date(), function(d) {
        return Utilities.formatDate(d, 'Asia/Taipei', 'yyyyMMdd');
      });

      var state = Store.getState(body.deviceId, dateKey);
      state.inputClassCode = body.classCode || '';
      previousLastRequestTime = state.lastDeviceRequestTime || 0;
      var now = Date.now();
      var quotaRes = Logic.decideQuota(state, config, now);

      if (!quotaRes.allowed) {
        resultCode = quotaRes.code;
        errorDetail = quotaRes.message || quotaRes.code;
        return createJsonResponse({
          ok: false,
          code: quotaRes.code,
          message: quotaRes.message
        });
      }


      // 步驟 5: 允許 → 「先預扣」：全班計數 +1、裝置計數 +1、寫入冷卻時間、in-flight +1
      requestTimestamp = quotaRes.requestTimestamp;
      Store.saveQuotaPreHold(quotaRes.nextState, dateKey);
      preHeld = true;
    } finally {
      // 步驟 6: ── 釋放鎖 ── ★呼叫 AI 期間絕對不能持有鎖
      // [鎖釋放點 1]
      lock.releaseLock();
    }

    // 步驟 7: 呼叫 AI（UrlFetchApp，muteHttpExceptions: true）
    var fullPrompt = Logic.buildPrompt(body.style, body.prompt, body.mode);
    var parseRes = null;

    if (config.provider === 'openai') {
      var blobBuilder = function(b64, mime, filename) {
        var decoded = Utilities.base64Decode(b64);
        return Utilities.newBlob(decoded, mime, filename);
      };
      var openAiReq = Providers.buildOpenAIRequest(config.openaiApiKey, config.openaiModel, {
        prompt: fullPrompt,
        mode: body.mode,
        image: body.image,
        imageMime: body.imageMime,
        quality: config.openaiQuality
      }, blobBuilder);

      var openAiHttpResp = Providers.fetchWithProvider(openAiReq, function(url, opt) {
        return UrlFetchApp.fetch(url, opt);
      });
      parseRes = Providers.parseOpenAIResponse(openAiHttpResp.getContentText());
    } else {
      // 預設 Gemini
      var geminiReq = Providers.buildGeminiRequest(config.geminiApiKey, config.geminiModel, {
        prompt: fullPrompt,
        mode: body.mode,
        image: body.image,
        imageMime: body.imageMime
      });

      var geminiHttpResp = Providers.fetchWithProvider(geminiReq, function(url, opt) {
        return UrlFetchApp.fetch(url, opt);
      });
      parseRes = Providers.parseGeminiResponse(geminiHttpResp.getContentText());
    }

    // 步驟 8: 判斷生成結果
    if (parseRes && parseRes.ok && parseRes.image) {
      resultCode = 'SUCCESS';

      var latestState = Store.getState(body.deviceId, dateKey);
      var devRemain = Math.max(0, config.dailyLimitPerDevice - latestState.deviceDailyCount);
      var globRemain = Math.max(0, config.dailyLimitGlobal - latestState.dailyGlobalCount);

      return createJsonResponse({
        ok: true,
        data: {
          image: parseRes.image,
          mime: parseRes.mime || 'image/png',
          deviceRemaining: devRemain,
          remainingToday: globRemain,
          requestId: String(requestTimestamp || Date.now())
        }
      });
    }

    // 供應商錯誤或安全阻擋處理
    if (parseRes && parseRes.code === 'SAFETY_BLOCKED') {
      resultCode = 'SAFETY_BLOCKED';
      errorDetail = parseRes.reason || parseRes.error || 'Safety blocked';
      // 安全阻擋 → 不退還（避免學生一直試不當內容）
      return createJsonResponse({
        ok: false,
        code: 'SAFETY_BLOCKED',
        message: Logic.ERROR_MESSAGES.SAFETY_BLOCKED
      });
    }

    // 供應商錯誤／逾時 → 再拿鎖「退還」剛才預扣的額度
    resultCode = 'PROVIDER_ERROR';
    errorDetail = (parseRes && (parseRes.error || parseRes.reason)) ? (parseRes.error || parseRes.reason) : 'Provider error';
    if (preHeld) {
      // [鎖取得點 2]
      if (lock.tryLock(10000)) {
        try {
          var currStateForRefund = Store.getState(body.deviceId, dateKey);
          Store.refundQuota(currStateForRefund, dateKey, previousLastRequestTime);
        } finally {
          // [鎖釋放點 2]
          lock.releaseLock();
        }
      }
    }

    return createJsonResponse({
      ok: false,
      code: 'PROVIDER_ERROR',
      message: Logic.ERROR_MESSAGES.PROVIDER_ERROR
    });

  } catch (unexpectedErr) {
    console.error('generate exception: ' + unexpectedErr.stack);
    resultCode = 'PROVIDER_ERROR';
    errorDetail = unexpectedErr.message || String(unexpectedErr);

    // 例外情況下退還預扣額度
    if (preHeld && dateKey) {
      // [鎖取得點 3]
      if (lock.tryLock(10000)) {
        try {
          var currStateErr = Store.getState(body.deviceId, dateKey);
          Store.refundQuota(currStateErr, dateKey, previousLastRequestTime);
        } finally {
          // [鎖釋放點 3]
          lock.releaseLock();
        }
      }
    }

    return createJsonResponse({
      ok: false,
      code: 'PROVIDER_ERROR',
      message: Logic.ERROR_MESSAGES.PROVIDER_ERROR
    });

  } finally {
    // 步驟 9: finally：拿鎖把 in-flight -1（releaseInFlight）；寫一筆紀錄到試算表
    if (requestTimestamp) {
      // [鎖取得點 4]
      if (lock.tryLock(10000)) {
        try {
          var currStateFinally = Store.getState(body.deviceId, dateKey);
          Store.releaseInFlight(currStateFinally, requestTimestamp);
        } finally {
          // [鎖釋放點 4]
          lock.releaseLock();
        }
      }
    }

    // 被提早擋下的請求（BAD_REQUEST、BLOCKED_PROMPT、BUSY）還沒讀過設定，這裡補讀，確保老師看得到
    if (!config) {
      try { config = Store.getConfig(); } catch (cfgErr) { config = null; }
    }
    if (config && config.logSheetId) {
      Store.logRequest({
        timestamp: new Date().toISOString(),
        deviceId: body.deviceId,
        mode: body.mode,
        style: body.style,
        prompt: body.prompt,
        resultCode: resultCode,
        durationMs: Date.now() - startTime,
        provider: config.provider,
        errorDetail: errorDetail
      }, config.logSheetId);
    }
  }
}


/**
 * 輔助產生 JSON 格式之 TextOutput 回應
 * @param {Object} obj
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
