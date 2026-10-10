// gas/Logic.gs — 純函式核心邏輯
// 注意：本檔案頂層不准引用任何 GAS 全域物件（PropertiesService、UrlFetchApp、CacheService 等）
// 所有需要外部能力（雜湊、格式化等）的功能均由參數傳入。

/**
 * 風格預設表（PLAN.md 附錄 A）
 * 同時支援文字模式（textPrompt）與照片模式（photoPrompt）
 */
var STYLES = [
  {
    id: 'free',
    label: '✍️ 自訂風格',
    emoji: '✍️',
    textPrompt: '',
    photoPrompt: ''
  },
  {
    id: 'pixar',
    label: '🎬 3D 動畫風',
    emoji: '🎬',
    textPrompt: 'A high-quality 3D animated movie style illustration, cute, cinematic lighting, vibrant colors',
    photoPrompt: 'Transform this photo into a high-quality 3D animated movie style character, cute, cinematic lighting, vibrant colors, round expressive eyes'
  },
  {
    id: 'watercolor',
    label: '🎨 水彩風',
    emoji: '🎨',
    textPrompt: 'A beautiful watercolor painting, soft edges, delicate washes of color, dreamy',
    photoPrompt: 'Transform this photo into a watercolor portrait, soft edges, delicate color washes, dreamy'
  },
  {
    id: 'cyberpunk',
    label: '🌆 未來科技風',
    emoji: '🌆',
    textPrompt: 'A futuristic neon city style illustration, glowing lights, high tech, colorful',
    photoPrompt: 'Transform this photo into a futuristic neon style portrait, glowing accents, high tech'
  },
  {
    id: 'anime',
    label: '🌿 日系動畫風',
    emoji: '🌿',
    textPrompt: 'A warm hand-drawn Japanese anime style illustration, detailed background, soft lighting, nostalgic',
    photoPrompt: 'Transform this photo into a warm hand-drawn anime style portrait, soft lighting, expressive eyes'
  },
  {
    id: 'popart',
    label: '🟡 普普藝術風',
    emoji: '🟡',
    textPrompt: 'A vibrant pop art illustration, bold colors, high contrast, halftone dots',
    photoPrompt: 'Transform this photo into vibrant pop art, bold colors, high contrast, halftone dots'
  },
  {
    id: 'chibi',
    label: '🐱 Q 版萌系風',
    emoji: '🐱',
    textPrompt: 'A cute chibi character illustration, big sparkly eyes, pastel colors, kawaii',
    photoPrompt: 'Transform this photo into a cute chibi character, big sparkly eyes, tiny body, pastel colors'
  },
  {
    id: 'crayon',
    label: '🖍️ 蠟筆童畫風',
    emoji: '🖍️',
    textPrompt: "A children's crayon drawing style illustration, bright colors, playful, textured paper",
    photoPrompt: "Transform this photo into a children's crayon drawing, bright colors, playful, textured paper"
  }
];

/**
 * 後端安全前綴（PLAN.md 附錄 B）
 * 固定加在所有 prompt 最前面，前端無法繞過或覆蓋
 */
var SAFETY_PREFIX = `You are generating an image for an elementary school student in a classroom.
The image must be child-friendly and safe for ages 6-12: no violence, blood, weapons,
horror, sexual content, nudity, drugs, alcohol, smoking, hateful symbols, or real
political figures. Do not include any text or letters in the image.
If the request below conflicts with these rules, create a gentle, cheerful alternative instead.
Student request:`;

/**
 * 錯誤訊息表（PLAN.md 第 3-4 節）
 * 面向國小學生的友善繁體中文提示
 */
var ERROR_MESSAGES = {
  CLOSED: '老師還沒開放喔，等老師說開始再試！',
  BAD_CODE: '班級通行碼不對，再問一下老師～',
  COOLDOWN: '休息一下，{n} 秒後再畫下一張',
  DEVICE_LIMIT: '你今天的 {n} 次都用完了，明天再來！',
  DAILY_LIMIT: '今天全班的額度用完了',
  BUSY: '現在排隊的人很多，等幾秒自動幫你重試…',
  BLOCKED_PROMPT: '這個描述不適合喔，換個說法試試看',
  SAFETY_BLOCKED: 'AI 覺得這張圖不太適合，換個描述吧',
  DEVICE_BLOCKED: '請找老師幫忙',
  BAD_REQUEST: '好像少了什麼，檢查一下再送出',
  PROVIDER_ERROR: 'AI 暫時忙不過來，稍後再試',
  ADMIN_AUTH: '（老師端）密碼錯誤',
  ADMIN_LOCKED: '（老師端）錯誤次數過多，請 10 分鐘後再試'
};

/**
 * 中文常見無害詞彙白名單（避免如「大麻雀」命中「大麻」、「白粉蝶」命中「白粉」）
 */
var ALLOWED_PHRASES = [
  '大麻雀',
  '白粉蝶',
  '白粉色'
];

/**
 * 本地關鍵字黑名單（PLAN.md 第 4-4 節）
 * 涵蓋暴力、血腥、色情、自殘、毒品、武器等類別
 * 注意：已移除 gun、bomb、breasts 等易誤判兒童常見創作（水槍、泡澡球等）之詞彙，交由後端安全前綴與供應商安全層把關
 */
var BLOCKED_KEYWORDS = [
  // 暴力 (Violence)
  '殺人', '殺死', '砍死', '肢解', '斬首', '刺死', '暴打', '分屍', '虐殺', '虐待',
  '處死', '槍殺', '毒殺', '行刑', '屠殺', '打死', '打人', '殺害',
  'murder', 'slaughter', 'massacre', 'decapitate', 'behead', 'torture', 'mutilate',
  'strangle', 'assassinate', 'genocide', 'homicide', 'bloodbath', 'kill',

  // 血腥 (Blood / Gore)
  '血腥', '鮮血', '斷肢', '腸子', '內臟', '割喉', '腦漿', '噴血', '滴血', '殘肢',
  '血肉模糊', '流血', '大出血', '斷頭',
  'bloody', 'blood', 'gore', 'guts', 'intestines', 'dismember', 'bloodshed',

  // 色情 / 裸露 (Porn / Sexual / Nudity)
  '色情', '裸體', '裸照', '脫光', '生殖器', '陰莖', '陰道', '做愛', '射精', '淫穢',
  '強姦', '猥褻', '露點', '巨乳', '自慰', '性交', '下體', '性器官',
  'porn', 'porno', 'pornography', 'nude', 'nudity', 'naked', 'sex', 'intercourse',
  'rape', 'penis', 'vagina', 'erotic', 'hentai', 'blowjob', 'masturbat*',

  // 自殘 (Self-harm)
  '自殺', '自殘', '跳樓', '割腕', '上吊', '服毒', '燒炭', '自焚', '吞藥', '切腹',
  '割手', '想不開', '自縊',
  'suicide', 'selfharm', 'self-harm', 'hangmyself', 'cutwrist', 'killmyself',

  // 毒品 (Drugs)
  '毒品', '海洛因', '古柯鹼', '大麻', '搖頭丸', '冰毒', '安非他命', '吸毒', '販毒',
  '鴉片', '甲基安非他命', '白粉', 'K他命', '毒品交易',
  'heroin', 'cocaine', 'marijuana', 'methamphetamine', 'ecstasy', 'fentanyl', 'opium', 'weed', 'crystalmeth',

  // 武器 (Weapons)
  '手槍', '步槍', '炸彈', '炸藥', '突擊步槍', '衝鋒槍', '地雷', '手榴彈', '毒氣', '核彈',
  '火箭筒', '機關槍', '狙擊槍', '散彈槍', '爆裂物',
  'pistol', 'rifle', 'explosive', 'grenade', 'bazooka', 'assaultrifle', 'landmine', 'dynamite'
];

/**
 * 允許的圖片 MIME 白名單
 */
var ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

/**
 * 驗證前端送進來的生圖請求欄位
 * @param {Object} body
 * @returns {{valid: boolean, code?: string, message?: string, error?: string}}
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'Request body must be an object'
    };
  }

  // deviceId 檢查：限制為 8-64 字元，只能使用 [A-Za-z0-9-]
  if (!body.deviceId || typeof body.deviceId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.deviceId)) {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'deviceId is required and must be 8-64 characters matching [A-Za-z0-9-]'
    };
  }

  // classCode 檢查：若有傳，必須為字串且最多 16 字元
  if (body.classCode !== undefined && body.classCode !== null) {
    if (typeof body.classCode !== 'string' || body.classCode.length > 16) {
      return {
        valid: false,
        code: 'BAD_REQUEST',
        message: ERROR_MESSAGES.BAD_REQUEST,
        error: 'classCode must be string and at most 16 characters'
      };
    }
  }

  // mode 檢查
  if (body.mode !== 'text' && body.mode !== 'photo') {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'mode must be either "text" or "photo"'
    };
  }

  // style 白名單檢查
  var isStyleValid = false;
  for (var i = 0; i < STYLES.length; i++) {
    if (STYLES[i].id === body.style) {
      isStyleValid = true;
      break;
    }
  }
  if (!isStyleValid) {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'style is not in allowed styles whitelist'
    };
  }

  // prompt 檢查（非空、字數 ≤ 300）
  if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'prompt is required and must be non-empty string'
    };
  }
  if (body.prompt.length > 600) {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'prompt must not exceed 600 characters'
    };
  }
  if (/[<>]/.test(body.prompt)) {
    return {
      valid: false,
      code: 'BAD_REQUEST',
      message: ERROR_MESSAGES.BAD_REQUEST,
      error: 'prompt must not contain < or > characters'
    };
  }

  // photo 模式的圖片檢查
  if (body.mode === 'photo') {
    if (!body.image || typeof body.image !== 'string' || body.image.trim() === '') {
      return {
        valid: false,
        code: 'BAD_REQUEST',
        message: ERROR_MESSAGES.BAD_REQUEST,
        error: 'image base64 string is required in photo mode'
      };
    }
    // imageMime 嚴格白名單（只接受 image/jpeg, image/png, image/webp）
    if (!body.imageMime || typeof body.imageMime !== 'string' || ALLOWED_IMAGE_MIMES.indexOf(body.imageMime) === -1) {
      return {
        valid: false,
        code: 'BAD_REQUEST',
        message: ERROR_MESSAGES.BAD_REQUEST,
        error: 'imageMime must be one of: ' + ALLOWED_IMAGE_MIMES.join(', ')
      };
    }
    // 圖片大小限制 ≤ 4 MB base64 (約 4 * 1024 * 1024 字元)
    var maxBase64Length = 4 * 1024 * 1024;
    if (body.image.length > maxBase64Length) {
      return {
        valid: false,
        code: 'BAD_REQUEST',
        message: ERROR_MESSAGES.BAD_REQUEST,
        error: 'image size exceeds maximum 4 MB limit'
      };
    }
  }

  return { valid: true };
}

/**
 * 字串正規化：全形轉半形、轉小寫、去除多餘空白
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // 1. 全形轉半形（0xFF01-0xFF5E 對應 0x0021-0x007E，0x3000 全形空格轉半形空格）
  var half = text.replace(/[\uFF01-\uFF5E]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  }).replace(/\u3000/g, ' ');

  // 2. 轉小寫
  var lower = half.toLowerCase();

  // 3. 去除所有空白
  return lower.replace(/\s+/g, '');
}

/**
 * 檢查輸入是否命中黑名單關鍵字
 * 阻擋大小寫、全形、夾空白/標點等繞過手法，同時防止正常英文句子（如 superhero in space, a dog or elephant）被誤判
 * @param {string} text
 * @param {Array<string>} [customKeywords]
 * @returns {boolean} true 表示被阻擋，false 表示安全
 */
function checkBlocked(text, customKeywords) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  var keywords = customKeywords || BLOCKED_KEYWORDS;

  // 1. 全形轉半形與小寫
  var halfLower = text.replace(/[\uFF01-\uFF5E]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  }).replace(/\u3000/g, ' ').toLowerCase();

  // 2. 中文比對：完全去除空白，並移除白名單安全詞彙（例如「大麻雀」先拿掉，避免誤中「大麻」）
  var noSpaces = halfLower.replace(/\s+/g, '');
  for (var a = 0; a < ALLOWED_PHRASES.length; a++) {
    noSpaces = noSpaces.split(ALLOWED_PHRASES[a]).join('');
  }

  // 3. 英文比對：保留單字邊界空白，只合併單字母間隔繞過（如 "k i l l" -> "kill", "s-e-x" -> "sex"）
  var collapsedSpaced = halfLower.replace(/\b([a-z])(?:[\s._-]+([a-z]))+\b/g, function(m) {
    return m.replace(/[\s._-]+/g, '');
  });

  for (var i = 0; i < keywords.length; i++) {
    var rawKw = keywords[i];
    if (!rawKw) continue;

    if (rawKw.charAt(rawKw.length - 1) === '*') {
      // 標記星號的詞（例如 'masturbat*'）：做單字開頭前綴比對
      var prefix = rawKw.slice(0, -1).toLowerCase();
      var prefixPattern = new RegExp('(^|[^a-z])' + prefix + '[a-z]*([^a-z]|$)', 'i');
      if (prefixPattern.test(collapsedSpaced)) {
        return true;
      }
    } else if (/^[a-z]+$/.test(rawKw.toLowerCase())) {
      // 英文詞彙：一律嚴格進行單字邊界比對，只比對 collapsedSpaced，絕不比對 noSpaces
      var wordPattern = new RegExp('(^|[^a-z])' + rawKw.toLowerCase() + '([^a-z]|$)', 'i');
      if (wordPattern.test(collapsedSpaced)) {
        return true;
      }
    } else {
      // 中文等非純 ASCII 詞彙：在排除白名單後的 noSpaces 中比對
      var normKw = normalizeText(rawKw);
      if (normKw && noSpaces.indexOf(normKw) !== -1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 組合送給 AI 供應商的完整 Prompt
 * 安全前綴保證在最前面，無法被學生描述覆蓋
 * @param {string} styleId
 * @param {string} userPrompt
 * @param {string} [mode='text']
 * @returns {string}
 */
function buildPrompt(styleId, userPrompt, mode) {
  var targetMode = mode === 'photo' ? 'photo' : 'text';
  var selectedStyle = null;

  for (var i = 0; i < STYLES.length; i++) {
    if (STYLES[i].id === styleId) {
      selectedStyle = STYLES[i];
      break;
    }
  }

  var stylePrompt = '';
  if (selectedStyle) {
    stylePrompt = targetMode === 'photo' ? selectedStyle.photoPrompt : selectedStyle.textPrompt;
  }

  var cleanUserPrompt = (userPrompt || '').trim();

  var lines = [SAFETY_PREFIX];
  if (stylePrompt && stylePrompt.trim() !== '') {
    lines.push('Style instruction: ' + stylePrompt);
  }
  lines.push('Student description: ' + cleanUserPrompt);
  return lines.join('\n');
}

/**
 * 額度與存取決策純函式（PLAN.md 第 4-2、7-1 節）
 * 輸入 (state, config, now)，輸出 { allowed, code, message, requestTimestamp?, nextState, remainingSec? }
 * 嚴格唯讀 camelCase 設定，遇到無效型別一律 fail-closed 回傳 CLOSED
 * 嚴禁修改傳入的 state 物件
 * @param {Object} state - 當前動態狀態（計數、冷卻時間、in-flight 等）
 * @param {Object} config - 系統設定（已完成型別轉換之 camelCase 物件）
 * @param {number} now - 當前時間戳記 (ms)
 * @returns {{allowed: boolean, code: ?string, message?: string, requestTimestamp?: number, nextState: Object, remainingSec?: number}}
 */
function decideQuota(state, config, now) {
  var s = state || {};
  var c = config || {};

  // 1. 服務是否開放：嚴格要求 serviceOpen === true
  if (c.serviceOpen !== true) {
    return {
      allowed: false,
      code: 'CLOSED',
      message: ERROR_MESSAGES.CLOSED,
      nextState: Object.assign({}, s)
    };
  }

  // 2. 嚴格檢查數字欄位型別：必須為有限數字，否則 fail-closed
  if (typeof c.dailyLimitGlobal !== 'number' || !Number.isFinite(c.dailyLimitGlobal) ||
      typeof c.dailyLimitPerDevice !== 'number' || !Number.isFinite(c.dailyLimitPerDevice) ||
      typeof c.cooldownSec !== 'number' || !Number.isFinite(c.cooldownSec) ||
      typeof c.maxConcurrent !== 'number' || !Number.isFinite(c.maxConcurrent)) {
    return {
      allowed: false,
      code: 'CLOSED',
      message: ERROR_MESSAGES.CLOSED,
      nextState: Object.assign({}, s)
    };
  }

  // 3. OPEN_UNTIL 自動到期檢查
  if (c.openUntil) {
    var untilTimestamp = typeof c.openUntil === 'number' ? c.openUntil : new Date(c.openUntil).getTime();
    if (!isNaN(untilTimestamp) && now >= untilTimestamp) {
      return {
        allowed: false,
        code: 'CLOSED',
        message: ERROR_MESSAGES.CLOSED,
        nextState: Object.assign({}, s)
      };
    }
  }

  // 4. 裝置封鎖檢查（依據前 8 碼裝置短碼比對）
  var blockedDevices = c.blockedDevices || [];
  var devShort = (s.deviceId || '').substring(0, 8);
  if (devShort && blockedDevices.indexOf(devShort) !== -1) {
    return {
      allowed: false,
      code: 'DEVICE_BLOCKED',
      message: ERROR_MESSAGES.DEVICE_BLOCKED,
      nextState: Object.assign({}, s)
    };
  }


  // 5. 班級通行碼檢查（通行碼為空時不檢查）
  var configuredClassCode = (c.classCode !== undefined && c.classCode !== null ? c.classCode : '').toString().trim();
  if (configuredClassCode !== '') {
    var inputCode = (s.inputClassCode !== undefined && s.inputClassCode !== null ? s.inputClassCode : (s.classCode || '')).toString().trim();
    if (inputCode !== configuredClassCode) {
      return {
        allowed: false,
        code: 'BAD_CODE',
        message: ERROR_MESSAGES.BAD_CODE,
        nextState: Object.assign({}, s)
      };
    }
  }

  // 6. 冷卻時間檢查
  var cooldownSec = c.cooldownSec;
  if (s.lastDeviceRequestTime) {
    var elapsedSec = (now - s.lastDeviceRequestTime) / 1000;
    if (elapsedSec < cooldownSec) {
      var remainingSec = Math.ceil(cooldownSec - elapsedSec);
      var msg = ERROR_MESSAGES.COOLDOWN.replace('{n}', remainingSec);
      return {
        allowed: false,
        code: 'COOLDOWN',
        message: msg,
        remainingSec: remainingSec,
        nextState: Object.assign({}, s)
      };
    }
  }

  // 7. 裝置當日上限檢查
  var dailyLimitPerDevice = c.dailyLimitPerDevice;
  var deviceDailyCount = s.deviceDailyCount || 0;
  if (deviceDailyCount >= dailyLimitPerDevice) {
    var devMsg = ERROR_MESSAGES.DEVICE_LIMIT.replace('{n}', dailyLimitPerDevice);
    return {
      allowed: false,
      code: 'DEVICE_LIMIT',
      message: devMsg,
      nextState: Object.assign({}, s)
    };
  }

  // 8. 全班每日總上限檢查
  var dailyLimitGlobal = c.dailyLimitGlobal;
  var dailyGlobalCount = s.dailyGlobalCount || 0;
  if (dailyGlobalCount >= dailyLimitGlobal) {
    return {
      allowed: false,
      code: 'DAILY_LIMIT',
      message: ERROR_MESSAGES.DAILY_LIMIT,
      nextState: Object.assign({}, s)
    };
  }

  // 9. in-flight 併發上限檢查（過期大於 150 秒項目自動清除）
  var inFlightTimeoutMs = (typeof c.inFlightTimeoutMs === 'number' && Number.isFinite(c.inFlightTimeoutMs)) ? c.inFlightTimeoutMs : 150000;
  var rawInFlight = (s.inFlightRequests && s.inFlightRequests.filter) ? s.inFlightRequests : [];
  var activeInFlight = rawInFlight.filter(function(ts) {
    return (now - ts) < inFlightTimeoutMs;
  });

  var maxConcurrent = c.maxConcurrent;
  if (activeInFlight.length >= maxConcurrent) {
    var busyState = Object.assign({}, s, {
      inFlightRequests: activeInFlight
    });
    return {
      allowed: false,
      code: 'BUSY',
      message: ERROR_MESSAGES.BUSY,
      nextState: busyState
    };
  }

  // 10. 通過限額檢查，執行預扣：全班計數 +1、裝置計數 +1、更新冷卻時間、in-flight 記錄
  var newInFlight = activeInFlight.concat([now]);

  var nextState = Object.assign({}, s, {
    dailyGlobalCount: dailyGlobalCount + 1,
    deviceDailyCount: deviceDailyCount + 1,
    lastDeviceRequestTime: now,
    inFlightRequests: newInFlight
  });

  return {
    allowed: true,
    code: null,
    requestTimestamp: now,
    nextState: nextState
  };
}

/**
 * 退還額度純函式（PLAN.md 第 4-2、7-1 節，附錄：冷卻退還）
 * 供應商錯誤或逾時時退還預扣額度，計數回到原值且保證不為負數
 * 同時恢復冷卻時間至這次請求之前的值
 * 注意：只退還 dailyGlobalCount、deviceDailyCount 與 lastDeviceRequestTime，絕不碰 in-flight
 * @param {Object} state
 * @param {number} [previousLastRequestTime]
 * @returns {Object} nextState
 */
function refundQuota(state, previousLastRequestTime) {
  if (!state || typeof state !== 'object') {
    return {};
  }

  var newGlobal = Math.max(0, (state.dailyGlobalCount || 0) - 1);
  var newDevice = Math.max(0, (state.deviceDailyCount || 0) - 1);
  var prevTime = (typeof previousLastRequestTime === 'number' && Number.isFinite(previousLastRequestTime)) ? previousLastRequestTime : 0;

  return Object.assign({}, state, {
    dailyGlobalCount: newGlobal,
    deviceDailyCount: newDevice,
    lastDeviceRequestTime: prevTime
  });
}

/**
 * 釋放指定 in-flight 請求純函式（PLAN.md 第 4-2 節 finally 區塊調用）
 * 嚴格依 requestTimestamp 移除指定項目，找不到原樣回傳，禁止 pop() fallback
 * @param {Object} state
 * @param {number} requestTimestamp
 * @returns {Object} nextState
 */
function releaseInFlight(state, requestTimestamp) {
  if (!state || typeof state !== 'object') {
    return {};
  }
  if (typeof requestTimestamp !== 'number' || !Number.isFinite(requestTimestamp)) {
    return Object.assign({}, state);
  }

  var rawInFlight = (state.inFlightRequests && state.inFlightRequests.filter) ? state.inFlightRequests : [];
  var idx = rawInFlight.indexOf(requestTimestamp);
  if (idx === -1) {
    return Object.assign({}, state);
  }

  var updated = rawInFlight.slice(0, idx).concat(rawInFlight.slice(idx + 1));
  return Object.assign({}, state, {
    inFlightRequests: updated
  });
}

/**
 * 產生台北時區日期 key (YYYYMMDD)
 * 呼叫端可傳入 formatFn 實作（GAS 下傳入 Utilities.formatDate 包裝，測試傳入 Node 實作）
 * 若未傳入 formatFn，使用內建 UTC+8 換算純 JS 實作
 * @param {Date|number|string} date
 * @param {Function} [formatFn]
 * @returns {string} 例如 '20261006'
 */
function dateKeyTaipei(date, formatFn) {
  var d = date instanceof Date ? date : new Date(date);
  if (typeof formatFn === 'function') {
    return formatFn(d);
  }

  // 台北時區固定為 UTC+8（無夏令時間）
  var taipeiMs = d.getTime() + 8 * 60 * 60 * 1000;
  var taipeiDate = new Date(taipeiMs);
  var year = taipeiDate.getUTCFullYear();
  var month = ('0' + (taipeiDate.getUTCMonth() + 1)).slice(-2);
  var day = ('0' + taipeiDate.getUTCDate()).slice(-2);
  return '' + year + month + day;
}

/**
 * 管理密碼雜湊
 * 頂層不引用 GAS 全域物件，由呼叫端傳入 hashFn 實作
 * @param {string} password
 * @param {string} salt
 * @param {Function} hashFn - 接收 string 回傳十六進位雜湊字串
 * @returns {string}
 */
function hashPassword(password, salt, hashFn) {
  if (typeof password !== 'string' || typeof salt !== 'string') {
    throw new Error('Password and salt must be strings');
  }
  if (typeof hashFn !== 'function') {
    throw new Error('hashFn must be provided as a function');
  }
  return hashFn(password + ':' + salt);
}

/**
 * 常數時間字串比較（固定時間 XOR 比對，防止時序攻擊）
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * 驗證管理密碼
 * @param {string} inputPassword
 * @param {string} storedHash
 * @param {string} storedSalt
 * @param {Function} hashFn
 * @returns {boolean}
 */
function verifyPassword(inputPassword, storedHash, storedSalt, hashFn) {
  if (!inputPassword || typeof inputPassword !== 'string' || !storedHash || !storedSalt) {
    return false;
  }
  var calculatedHash = hashPassword(inputPassword, storedSalt, hashFn);
  return safeEqual(calculatedHash, storedHash);
}

var Logic = {
  STYLES: STYLES,
  ERROR_MESSAGES: ERROR_MESSAGES,
  ALLOWED_PHRASES: ALLOWED_PHRASES,
  BLOCKED_KEYWORDS: BLOCKED_KEYWORDS,
  ALLOWED_IMAGE_MIMES: ALLOWED_IMAGE_MIMES,
  SAFETY_PREFIX: SAFETY_PREFIX,
  validateRequest: validateRequest,
  normalizeText: normalizeText,
  checkBlocked: checkBlocked,
  buildPrompt: buildPrompt,
  decideQuota: decideQuota,
  refundQuota: refundQuota,
  releaseInFlight: releaseInFlight,
  dateKeyTaipei: dateKeyTaipei,
  hashPassword: hashPassword,
  safeEqual: safeEqual,
  verifyPassword: verifyPassword
};

