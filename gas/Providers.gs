// gas/Providers.gs — AI 供應商 Request 組裝與 Response 解析純函式
// 注意：本檔案頂層不准引用任何 GAS 全域物件（UrlFetchApp、PropertiesService 等）
// 實際網路請求由呼叫端傳入 fetchFn

/**
 * 組裝 Gemini API 的生圖請求
 * 端點：https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent
 * 金鑰一律放 Header x-goog-api-key，絕不可放 URL 參數
 * @param {string} apiKey
 * @param {string} model - 例如 "gemini-3.1-flash-image"
 * @param {Object} options - { prompt: string, mode: 'text'|'photo', image?: string, imageMime?: string }
 * @returns {{url: string, method: string, headers: Object, payload: string}}
 */
function buildGeminiRequest(apiKey, model, options) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('apiKey is required for Gemini request');
  }
  var targetModel = model || 'gemini-3.1-flash-image';
  var opts = options || {};
  var mode = opts.mode === 'photo' ? 'photo' : 'text';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(targetModel) + ':generateContent';

  var parts = [
    { text: opts.prompt || '' }
  ];

  if (mode === 'photo' && opts.image) {
    parts.push({
      inlineData: {
        mimeType: opts.imageMime || 'image/jpeg',
        data: opts.image
      }
    });
  }

  var body = {
    contents: [
      {
        parts: parts
      }
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE']
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' }
    ]
  };

  return {
    url: url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    payload: JSON.stringify(body)
  };
}

/**
 * 解析 Gemini API 的回應 JSON
 * 成功回傳 { ok: true, image: base64, mime: string }
 * 安全阻擋回傳 { ok: false, code: 'SAFETY_BLOCKED', reason: string }
 * 錯誤回傳 { ok: false, code: 'PROVIDER_ERROR', error: string }
 * @param {Object|string} response
 * @returns {{ok: boolean, image?: string, mime?: string, code?: string, reason?: string, error?: string}}
 */
function parseGeminiResponse(response) {
  var data = response;
  if (typeof response === 'string') {
    try {
      data = JSON.parse(response);
    } catch (e) {
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        error: 'Invalid JSON response from Gemini: ' + e.message
      };
    }
  }

  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: 'Empty or non-object response from Gemini'
    };
  }

  // API 錯誤（例如 400/403/500 等由 Google 回傳的 error 物件）
  if (data.error) {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: data.error.message || 'Gemini API Error'
    };
  }

  // 檢查 Prompt 層級的安全阻擋
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    return {
      ok: false,
      code: 'SAFETY_BLOCKED',
      reason: data.promptFeedback.blockReason
    };
  }

  if (!data.candidates || !data.candidates.length) {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: 'No candidates returned from Gemini'
    };
  }

  var candidate = data.candidates[0];

  // 檢查 Candidate 層級的 finishReason
  if (candidate.finishReason === 'SAFETY' ||
      candidate.finishReason === 'BLOCKLIST' ||
      candidate.finishReason === 'PROHIBITED_CONTENT') {
    return {
      ok: false,
      code: 'SAFETY_BLOCKED',
      reason: candidate.finishReason
    };
  }

  // 在 candidate.content.parts 中搜尋第一個帶有 inlineData 的 part
  var parts = (candidate.content && candidate.content.parts) ? candidate.content.parts : [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part.inlineData && part.inlineData.data) {
      return {
        ok: true,
        image: part.inlineData.data,
        mime: part.inlineData.mimeType || 'image/png'
      };
    }
  }

  // 若沒找到 inlineData，且不是上述明確安全阻擋，但 candidate 存在
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: 'Generation finished without image, reason: ' + candidate.finishReason
    };
  }

  return {
    ok: false,
    code: 'PROVIDER_ERROR',
    error: 'No image found in response parts (text-only response)'
  };
}

/**
 * 組裝 OpenAI API 的生圖請求
 * 文字模式：POST https://api.openai.com/v1/images/generations (JSON)
 * 照片模式：POST https://api.openai.com/v1/images/edits (multipart)
 * 注意：GPT image 模型不支援 response_format；edits 端點不支援 moderation
 * @param {string} apiKey
 * @param {string} model - 例如 "gpt-image-1" 或 "gpt-image-2"
 * @param {Object} options - { prompt: string, mode: 'text'|'photo', image?: string, imageMime?: string, quality?: string }
 * @param {Function} [blobBuilder] - 呼叫端傳入之 Blob 產生器（照片模式必填）
 * @returns {{url: string, method: string, headers: Object, payload: any}}
 */
function buildOpenAIRequest(apiKey, model, options, blobBuilder) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('apiKey is required for OpenAI request');
  }
  var targetModel = model || 'gpt-image-1';
  var opts = options || {};
  var mode = opts.mode === 'photo' ? 'photo' : 'text';

  if (mode === 'photo') {
    if (typeof blobBuilder !== 'function') {
      throw new Error('blobBuilder is required for OpenAI photo mode');
    }

    var editsUrl = 'https://api.openai.com/v1/images/edits';

    // 依 MIME 決定檔案副檔名
    var ext = '.png';
    if (opts.imageMime === 'image/jpeg') {
      ext = '.jpg';
    } else if (opts.imageMime === 'image/webp') {
      ext = '.webp';
    }
    var filename = 'image' + ext;

    var editPayload = {
      model: targetModel,
      prompt: opts.prompt || '',
      n: 1,
      size: '1024x1024',
      quality: opts.quality || 'low',
      image: blobBuilder(opts.image, opts.imageMime || 'image/png', filename)
    };

    return {
      url: editsUrl,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey
      },
      payload: editPayload
    };
  }

  // 文字模式
  var genUrl = 'https://api.openai.com/v1/images/generations';
  var body = {
    model: targetModel,
    prompt: opts.prompt || '',
    n: 1,
    size: '1024x1024',
    quality: opts.quality || 'low',
    moderation: 'auto'
  };

  return {
    url: genUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(body)
  };
}

/**
 * 解析 OpenAI API 的回應 JSON
 * 成功回傳 { ok: true, image: base64, mime: 'image/png' }
 * 安全審查擋下回傳 { ok: false, code: 'SAFETY_BLOCKED', error: string }
 * 其他錯誤回傳 { ok: false, code: 'PROVIDER_ERROR', error: string, rawCode?: string }
 * @param {Object|string} response
 * @returns {{ok: boolean, image?: string, mime?: string, code?: string, error?: string, rawCode?: string}}
 */
function parseOpenAIResponse(response) {
  var data = response;
  if (typeof response === 'string') {
    try {
      data = JSON.parse(response);
    } catch (e) {
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        error: 'Invalid JSON response from OpenAI: ' + e.message
      };
    }
  }

  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: 'Empty or non-object response from OpenAI'
    };
  }

  // API 錯誤處理
  if (data.error) {
    var err = data.error;
    var errCode = (err.code || err.type || '').toString().toLowerCase();
    var errMsg = (err.message || '').toString().toLowerCase();

    if (errCode.indexOf('moderation') !== -1 ||
        errCode.indexOf('safety') !== -1 ||
        errCode.indexOf('policy') !== -1 ||
        errMsg.indexOf('safety') !== -1 ||
        errMsg.indexOf('content policy') !== -1 ||
        errMsg.indexOf('moderation') !== -1 ||
        errMsg.indexOf('safety system') !== -1) {
      return {
        ok: false,
        code: 'SAFETY_BLOCKED',
        error: err.message || 'Content moderation safety block'
      };
    }

    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: err.message || 'OpenAI API Error',
      rawCode: err.code
    };
  }

  // 取得生成的圖片（僅接受 b64_json，合約不接受 URL）
  if (data.data && data.data.length > 0) {
    var item = data.data[0];
    if (item.b64_json) {
      return {
        ok: true,
        image: item.b64_json,
        mime: 'image/png'
      };
    }
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      error: 'No b64_json found in response'
    };
  }

  return {
    ok: false,
    code: 'PROVIDER_ERROR',
    error: 'Invalid response format: data array is empty or missing'
  };
}

/**
 * 很薄的 fetch 包裝函式
 * 純包裝呼叫端傳入之 fetchFn（例如在 GAS 中傳入 (url, opt) => UrlFetchApp.fetch(url, opt)）
 * 本檔案頂層不直接引用任何 GAS 全域物件
 * @param {Object} requestParams - { url, method, headers, payload }
 * @param {Function} fetchFn
 * @returns {any}
 */
function fetchWithProvider(requestParams, fetchFn) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn must be provided as a function');
  }
  return fetchFn(requestParams.url, {
    method: requestParams.method || 'POST',
    headers: requestParams.headers,
    payload: requestParams.payload,
    muteHttpExceptions: true
  });
}

var Providers = {
  buildGeminiRequest: buildGeminiRequest,
  parseGeminiResponse: parseGeminiResponse,
  buildOpenAIRequest: buildOpenAIRequest,
  parseOpenAIResponse: parseOpenAIResponse,
  fetchWithProvider: fetchWithProvider
};

