// gas/Admin.gs — 老師後台管理功能
// 所有 action 均需驗證 adminPassword，並在伺服器端實施錯誤次數鎖定

var Admin = {
  /**
   * 驗證管理密碼並進行錯誤鎖定防護
   * 連續錯誤 5 次鎖定 10 分鐘 (ADMIN_LOCKED)
   * @param {string} inputPassword
   * @param {Object} config
   * @returns {{ok: boolean, code?: string, message?: string}}
   */
  authenticate: function(inputPassword, config) {
    var cache = CacheService.getScriptCache();
    var isLocked = cache.get('admin_locked');
    if (isLocked === 'true') {
      return {
        ok: false,
        code: 'ADMIN_LOCKED',
        message: Logic.ERROR_MESSAGES.ADMIN_LOCKED
      };
    }

    if (!inputPassword || typeof inputPassword !== 'string') {
      return {
        ok: false,
        code: 'ADMIN_AUTH',
        message: Logic.ERROR_MESSAGES.ADMIN_AUTH
      };
    }

    // 密碼雜湊比對函式（使用 GAS Utilities.computeDigest）
    var hashFn = function(str) {
      var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
      var hex = '';
      for (var i = 0; i < digest.length; i++) {
        var byte = digest[i];
        if (byte < 0) byte += 256;
        var byteHex = byte.toString(16);
        if (byteHex.length === 1) byteHex = '0' + byteHex;
        hex += byteHex;
      }
      return hex;
    };

    var isValid = Logic.verifyPassword(inputPassword, config.adminPasswordHash, config.adminPasswordSalt, hashFn);

    if (!isValid) {
      var failCount = parseInt(cache.get('admin_fail_count') || '0', 10) + 1;
      if (failCount >= 5) {
        cache.put('admin_locked', 'true', 600); // 鎖定 10 分鐘
        cache.remove('admin_fail_count');
        return {
          ok: false,
          code: 'ADMIN_LOCKED',
          message: Logic.ERROR_MESSAGES.ADMIN_LOCKED
        };
      } else {
        cache.put('admin_fail_count', String(failCount), 600);
        return {
          ok: false,
          code: 'ADMIN_AUTH',
          message: Logic.ERROR_MESSAGES.ADMIN_AUTH
        };
      }
    }

    // 驗證成功，清除失敗計數
    cache.remove('admin_fail_count');
    return { ok: true };
  },

  /**
   * 取得安全的不含機敏金鑰與密碼之設定物件
   * @param {Object} config
   * @returns {Object}
   */
  getSafeConfig: function(config) {
    return {
      provider: config.provider,
      geminiModel: config.geminiModel,
      openaiModel: config.openaiModel,
      openaiQuality: config.openaiQuality,
      classCode: config.classCode,
      serviceOpen: config.serviceOpen,
      openUntil: config.openUntil,
      dailyLimitGlobal: config.dailyLimitGlobal,
      dailyLimitPerDevice: config.dailyLimitPerDevice,
      cooldownSec: config.cooldownSec,
      maxConcurrent: config.maxConcurrent,
      allowPhoto: config.allowPhoto,
      costPerImageUsd: config.costPerImageUsd,
      blockedDevices: config.blockedDevices,
      hasGeminiKey: Boolean(config.geminiApiKey && config.geminiApiKey.trim() !== ''),
      hasOpenAIKey: Boolean(config.openaiApiKey && config.openaiApiKey.trim() !== '')
    };
  },

  /**
   * 取得今日統計數據
   * @param {Object} config
   * @param {string} dateKey
   * @returns {Object}
   */
  getTodayStats: function(config, dateKey) {
    var stats = {
      success: 0,
      failure: 0,
      blocked: 0,
      costEstimate: (config.costPerImageUsd !== null && config.costPerImageUsd !== undefined) ? 0 : null
    };

    if (!config.logSheetId) return stats;

    try {
      var ss = SpreadsheetApp.openById(config.logSheetId);
      var sheet = ss.getSheetByName('Logs') || ss.getSheets()[0];
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return stats;

      // 讀取試算表資料（至多讀取最後 2000 列）
      var startRow = Math.max(2, lastRow - 2000 + 1);
      var numRows = lastRow - startRow + 1;
      var range = sheet.getRange(startRow, 1, numRows, 8);
      var values = range.getValues();

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var rowDate = row[0];
        var rowResult = String(row[5] || '');

        var rowDateKey = '';
        if (rowDate) {
          rowDateKey = Logic.dateKeyTaipei(new Date(rowDate));
        }

        if (rowDateKey === dateKey) {
          if (rowResult === 'SUCCESS') {
            stats.success++;
          } else if (rowResult === 'BLOCKED_PROMPT' || rowResult === 'SAFETY_BLOCKED' || rowResult === 'DEVICE_BLOCKED') {
            stats.blocked++;
          } else {
            stats.failure++;
          }
        }
      }

      // 費用估算：依設定之單價計算；未設定時回傳 null
      if (config.costPerImageUsd !== null && config.costPerImageUsd !== undefined) {
        stats.costEstimate = Number((stats.success * config.costPerImageUsd).toFixed(3));
      } else {
        stats.costEstimate = null;
      }
    } catch (e) {
      console.warn('getTodayStats failed: ' + e.message);
    }

    return stats;
  },

  /**
   * 統一處理所有管理後台動作
   * @param {string} action
   * @param {Object} body
   * @param {Object} config
   * @param {string} dateKey
   * @returns {Object}
   */
  handleAction: function(action, body, config, dateKey) {
    // 1. 驗證管理員身分
    var authRes = Admin.authenticate(body.adminPassword, config);
    if (!authRes.ok) {
      return authRes;
    }

    switch (action) {
      case 'admin.login': {
        var safeConfig = Admin.getSafeConfig(config);
        var stats = Admin.getTodayStats(config, dateKey);
        return {
          ok: true,
          data: {
            config: safeConfig,
            stats: stats
          }
        };
      }

      case 'admin.setOpen': {
        var open = Boolean(body.open);
        var updates = { serviceOpen: open };
        if (open && typeof body.minutes === 'number' && body.minutes > 0) {
          var openUntilDate = new Date(Date.now() + body.minutes * 60 * 1000);
          updates.openUntil = openUntilDate.toISOString();
        } else {
          updates.openUntil = null;
        }
        Store.setConfig(updates);
        var updatedConfig = Store.getConfig();
        return {
          ok: true,
          data: Admin.getSafeConfig(updatedConfig)
        };
      }


      case 'admin.setConfig': {
        var configUpdates = {};

        if (body.dailyLimitGlobal !== undefined) {
          if (typeof body.dailyLimitGlobal !== 'number' || !Number.isInteger(body.dailyLimitGlobal) || body.dailyLimitGlobal < 0 || body.dailyLimitGlobal > 5000) {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.dailyLimitGlobal = body.dailyLimitGlobal;
        }

        if (body.dailyLimitPerDevice !== undefined) {
          if (typeof body.dailyLimitPerDevice !== 'number' || !Number.isInteger(body.dailyLimitPerDevice) || body.dailyLimitPerDevice < 0 || body.dailyLimitPerDevice > 100) {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.dailyLimitPerDevice = body.dailyLimitPerDevice;
        }

        if (body.cooldownSec !== undefined) {
          if (typeof body.cooldownSec !== 'number' || !Number.isInteger(body.cooldownSec) || body.cooldownSec < 0 || body.cooldownSec > 600) {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.cooldownSec = body.cooldownSec;
        }

        if (body.maxConcurrent !== undefined) {
          if (typeof body.maxConcurrent !== 'number' || !Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 30) {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.maxConcurrent = body.maxConcurrent;
        }

        if (body.provider !== undefined) {
          if (body.provider !== 'gemini' && body.provider !== 'openai') {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.provider = body.provider;
        }

        if (body.allowPhoto !== undefined) {
          if (typeof body.allowPhoto !== 'boolean') {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.allowPhoto = body.allowPhoto;
        }

        if (body.classCode !== undefined) {
          if (typeof body.classCode !== 'string' || (body.classCode !== '' && !/^\d{4,8}$/.test(body.classCode))) {
            return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
          }
          configUpdates.classCode = body.classCode;
        }

        Store.setConfig(configUpdates);
        var newConf = Store.getConfig();
        return {
          ok: true,
          data: Admin.getSafeConfig(newConf)
        };
      }

      case 'admin.newClassCode': {
        var newCode = String(Math.floor(1000 + Math.random() * 9000));
        Store.setConfig({ classCode: newCode });
        return {
          ok: true,
          data: { classCode: newCode }
        };
      }

      case 'admin.logs': {
        var limit = Math.min(100, Math.max(1, parseInt(body.limit || 50, 10)));
        var logs = [];
        if (config.logSheetId) {
          try {
            var ss = SpreadsheetApp.openById(config.logSheetId);
            var sheet = ss.getSheetByName('Logs') || ss.getSheets()[0];
            var lastRow = sheet.getLastRow();
            if (lastRow > 1) {
              var startRow = Math.max(2, lastRow - limit + 1);
              var numRows = lastRow - startRow + 1;
              var rows = sheet.getRange(startRow, 1, numRows, 9).getValues();
              for (var j = rows.length - 1; j >= 0; j--) {
                var r = rows[j];
                logs.push({
                  timestamp: r[0],
                  deviceIdShort: r[1],
                  mode: r[2],
                  style: r[3],
                  prompt: r[4],
                  resultCode: r[5],
                  durationMs: r[6],
                  provider: r[7],
                  errorDetail: r[8] || ''
                });
              }
            }
          } catch (e) {
            console.warn('read logs failed: ' + e.message);
          }
        }
        return {
          ok: true,
          data: { logs: logs }
        };
      }

      case 'admin.blockDevice': {
        var targetDevice = String(body.deviceId || '').trim().substring(0, 8);
        if (!targetDevice) {
          return { ok: false, code: 'BAD_REQUEST', message: Logic.ERROR_MESSAGES.BAD_REQUEST };
        }
        var currentBlocked = (config.blockedDevices || []).slice();
        if (currentBlocked.indexOf(targetDevice) === -1) {
          currentBlocked.push(targetDevice);
          Store.setConfig({ blockedDevices: currentBlocked });
        }
        return {
          ok: true,
          data: { blockedDevices: currentBlocked }
        };
      }

      case 'admin.unblockDevice': {
        var unblockTarget = String(body.deviceId || '').trim().substring(0, 8);
        var blockedList = (config.blockedDevices || []).filter(function(d) {
          return d !== unblockTarget;
        });
        Store.setConfig({ blockedDevices: blockedList });
        return {
          ok: true,
          data: { blockedDevices: blockedList }
        };
      }


      case 'admin.stats': {
        var todayStats = Admin.getTodayStats(config, dateKey);
        return {
          ok: true,
          data: todayStats
        };
      }

      default:
        return {
          ok: false,
          code: 'BAD_REQUEST',
          message: Logic.ERROR_MESSAGES.BAD_REQUEST
        };
    }
  }
};
