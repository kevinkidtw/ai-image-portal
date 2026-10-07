// gas/Setup.gs — 系統初始化、定時觸發器與管理密碼設定
// 老師初次部署時在此執行 setupOnce()、setAdminPassword() 與 selfTest()

/**
 * 初次初始化（不覆蓋已存在的屬性）
 * 1. 寫入所有預設 Script Properties
 * 2. 自動建立紀錄日誌試算表並設定表頭
 * 3. 安裝每日維護觸發器
 */
function setupOnce() {
  var props = PropertiesService.getScriptProperties();
  var currentProps = props.getProperties() || {};
  var toSet = {};

  for (var key in DEFAULT_CONFIG) {
    if (currentProps[key] === undefined || currentProps[key] === '') {
      toSet[key] = DEFAULT_CONFIG[key];
    }
  }

  // 自動建立紀錄試算表
  if (!currentProps.LOG_SHEET_ID) {
    try {
      var ss = SpreadsheetApp.create('AI生圖紀錄表（教師私有）');
      var sheet = ss.getSheets()[0];
      sheet.setName('Logs');
      sheet.appendRow([
        '時間',
        '裝置短碼',
        '模式',
        '風格',
        '學生描述',
        '結果代碼',
        '耗時(ms)',
        '供應商',
        '錯誤細節'
      ]);
      // 凍結第一列表頭
      sheet.setFrozenRows(1);
      toSet.LOG_SHEET_ID = ss.getId();
      console.log('已建立紀錄試算表，ID: ' + ss.getId());
    } catch (e) {
      console.error('建立試算表失敗: ' + e.message);
    }
  }

  props.setProperties(toSet);
  installTriggers();
  console.log('setupOnce 完成！請接續執行 setAdminPassword("你的密碼")。');
}

/**
 * 安裝每日凌晨 3 點之清理觸發器（避免重複安裝）
 */
function installTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var hasCleanupTrigger = false;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'cleanup') {
      hasCleanupTrigger = true;
      break;
    }
  }

  if (!hasCleanupTrigger) {
    ScriptApp.newTrigger('cleanup')
      .timeBased()
      .atHour(3)
      .everyDays(1)
      .inTimezone('Asia/Taipei')
      .create();
    console.log('已成功安裝每日凌晨 3 點 cleanup 觸發器。');
  } else {
    console.log('cleanup 觸發器已存在，略過安裝。');
  }
}

/**
 * 每日定時維護清理工作
 * 清除超過 3 天前之每日計數屬性 (count_YYYYMMDD)
 */
function cleanup() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties() || {};

  // 清理 3 天前的 count key
  var threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  var cutoffDateKey = parseInt(Logic.dateKeyTaipei(threeDaysAgo, function(d) {
    return Utilities.formatDate(d, 'Asia/Taipei', 'yyyyMMdd');
  }), 10);

  var keysToDelete = [];
  for (var propKey in allProps) {
    if (propKey.indexOf('count_') === 0) {
      var keyDateStr = propKey.substring(6);
      var keyDateNum = parseInt(keyDateStr, 10);
      if (Number.isFinite(keyDateNum) && keyDateNum < cutoffDateKey) {
        keysToDelete.push(propKey);
      }
    }
  }

  for (var j = 0; j < keysToDelete.length; j++) {
    props.deleteProperty(keysToDelete[j]);
  }
  console.log('已清理過期計數屬性數量: ' + keysToDelete.length);
}


/**
 * 設定老師管理後台密碼（長度至少 8 位）
 * 儲存 SHA-256 雜湊與隨機 salt，不存明碼
 * @param {string} password
 */
function setAdminPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('密碼長度至少需要 8 個字元！');
  }

  var salt = Utilities.getUuid();
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

  var hash = Logic.hashPassword(password, salt, hashFn);

  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_HASH: hash,
    ADMIN_PASSWORD_SALT: salt
  });

  console.log('管理密碼已成功設定！請記得在部署前清除編輯器中的密碼字串。');
}

/**
 * 部署後自我檢查（不花費任何 AI Token）
 * 檢驗屬性是否齊備、試算表能否寫入等
 * @returns {Object} 診斷結果
 */
function selfTest() {
  var config = Store.getConfig();
  var results = {
    hasPassword: Boolean(config.adminPasswordHash && config.adminPasswordSalt),
    hasGeminiKey: Boolean(config.geminiApiKey && config.geminiApiKey.trim() !== ''),
    hasOpenAIKey: Boolean(config.openaiApiKey && config.openaiApiKey.trim() !== ''),
    provider: config.provider,
    serviceOpen: config.serviceOpen,
    canAccessSheet: false,
    allChecksPass: false
  };

  if (config.logSheetId) {
    try {
      var ss = SpreadsheetApp.openById(config.logSheetId);
      results.canAccessSheet = Boolean(ss);
    } catch (e) {
      results.canAccessSheet = false;
      results.sheetError = e.message;
    }
  }

  results.allChecksPass = results.hasPassword &&
    (config.provider === 'openai' ? results.hasOpenAIKey : results.hasGeminiKey) &&
    results.canAccessSheet;

  console.log('=== 自我檢查結果 ===');
  console.log('管理密碼已設定: ' + (results.hasPassword ? '✅' : '❌'));
  console.log('Gemini 金鑰: ' + (results.hasGeminiKey ? '✅' : '❌'));
  console.log('OpenAI 金鑰: ' + (results.hasOpenAIKey ? '✅' : '未設定（選填）'));
  console.log('紀錄試算表可讀寫: ' + (results.canAccessSheet ? '✅' : '❌'));
  console.log('服務開放狀態: ' + (results.serviceOpen ? '🟢 開放中' : '🔴 關閉中'));
  console.log('全部核心檢查通過: ' + (results.allChecksPass ? '✅' : '⚠️ 有項目未齊全'));

  return results;
}
