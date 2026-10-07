// tests/providers.test.js — gas/Providers.gs 單元測試
// 只使用 Node.js 內建之 node:test、node:assert、node:fs、node:path

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadGasScript } = require('./load-gas.js');

const Providers = loadGasScript('gas/Providers.gs');

function loadFixture(filename) {
  const filePath = path.resolve(__dirname, 'fixtures', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('Providers.gs 單元測試', () => {

  // -------------------------------------------------------------
  // 1. Gemini Request 組裝測試
  // -------------------------------------------------------------
  describe('buildGeminiRequest', () => {
    const apiKey = 'AIzaSyFakeKey1234567890';
    const model = 'gemini-3.1-flash-image';

    test('文字模式組裝正確，且金鑰絕不出現在 URL 中', () => {
      const options = {
        prompt: 'A cute 3D cat in a flower garden',
        mode: 'text'
      };

      const req = Providers.buildGeminiRequest(apiKey, model, options);

      // 檢查 URL 絕不含金鑰
      assert.ok(!req.url.includes(apiKey), '金鑰不得出現在 URL 中');
      assert.ok(req.url.includes('models/' + encodeURIComponent(model) + ':generateContent'));

      // 檢查 Headers 包含金鑰與 Content-Type
      assert.strictEqual(req.headers['x-goog-api-key'], apiKey);
      assert.strictEqual(req.headers['Content-Type'], 'application/json');

      // 檢查 Payload 結構
      const body = JSON.parse(req.payload);
      assert.strictEqual(body.contents.length, 1);
      assert.strictEqual(body.contents[0].parts.length, 1);
      assert.strictEqual(body.contents[0].parts[0].text, options.prompt);
      assert.deepStrictEqual(body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);

      // 檢查 safetySettings
      assert.strictEqual(body.safetySettings.length, 4);
      body.safetySettings.forEach(setting => {
        assert.strictEqual(setting.threshold, 'BLOCK_LOW_AND_ABOVE');
      });
    });

    test('照片模式組裝正確（包含 text 與 inlineData 兩部分）', () => {
      const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const options = {
        prompt: 'Transform into watercolor',
        mode: 'photo',
        image: fakeBase64,
        imageMime: 'image/png'
      };

      const req = Providers.buildGeminiRequest(apiKey, model, options);
      const body = JSON.parse(req.payload);

      assert.strictEqual(body.contents[0].parts.length, 2);
      assert.strictEqual(body.contents[0].parts[0].text, options.prompt);
      assert.deepStrictEqual(body.contents[0].parts[1], {
        inlineData: {
          mimeType: 'image/png',
          data: fakeBase64
        }
      });
    });

    test('缺少 apiKey 時拋出錯誤', () => {
      assert.throws(() => {
        Providers.buildGeminiRequest('', model, { prompt: 'hi' });
      }, /apiKey is required/);
    });
  });

  // -------------------------------------------------------------
  // 2. Gemini Response 解析測試
  // -------------------------------------------------------------
  describe('parseGeminiResponse', () => {
    test('成功回應：正確取出 Base64 圖片與 MIME', () => {
      const fixture = loadFixture('gemini-success.json');
      const res = Providers.parseGeminiResponse(fixture);

      assert.strictEqual(res.ok, true);
      assert.ok(res.image && typeof res.image === 'string');
      assert.strictEqual(res.mime, 'image/png');
    });

    test('只有文字沒有圖片：回傳 PROVIDER_ERROR', () => {
      const fixture = loadFixture('gemini-text-only.json');
      const res = Providers.parseGeminiResponse(fixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'PROVIDER_ERROR');
      assert.ok(res.error.includes('No image found'));
    });

    test('promptFeedback.blockReason 為安全阻擋：回傳 SAFETY_BLOCKED', () => {
      const fixture = loadFixture('gemini-safety-block.json');
      const res = Providers.parseGeminiResponse(fixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'SAFETY_BLOCKED');
      assert.strictEqual(res.reason, 'SAFETY');
    });

    test('candidate.finishReason 為 SAFETY：回傳 SAFETY_BLOCKED', () => {
      const fixture = loadFixture('gemini-safety-finish.json');
      const res = Providers.parseGeminiResponse(fixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'SAFETY_BLOCKED');
      assert.strictEqual(res.reason, 'SAFETY');
    });

    test('錯誤 JSON 回應：回傳 PROVIDER_ERROR', () => {
      const fixture = loadFixture('gemini-error.json');
      const res = Providers.parseGeminiResponse(fixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'PROVIDER_ERROR');
      assert.ok(res.error.includes('API key not valid'));
    });

    test('字串形式的 JSON 亦能正確解析', () => {
      const jsonStr = JSON.stringify(loadFixture('gemini-success.json'));
      const res = Providers.parseGeminiResponse(jsonStr);

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.mime, 'image/png');
    });
  });

  // -------------------------------------------------------------
  // 3. OpenAI Request 組裝測試 (包含必修 4 參數校正)
  // -------------------------------------------------------------
  describe('buildOpenAIRequest', () => {
    const apiKey = 'sk-proj-FakeOpenAIKey1234567890';
    const model = 'gpt-image-1';

    test('文字模式組裝正確（不含 response_format，含 moderation: auto 與 quality）(必修 4)', () => {
      const options = {
        prompt: 'A cute pop art puppy',
        mode: 'text',
        quality: 'low'
      };

      const req = Providers.buildOpenAIRequest(apiKey, model, options);

      // 檢查 URL 絕不含金鑰
      assert.ok(!req.url.includes(apiKey), '金鑰不得出現在 URL 中');
      assert.strictEqual(req.url, 'https://api.openai.com/v1/images/generations');

      // 檢查 Headers
      assert.strictEqual(req.headers['Authorization'], 'Bearer ' + apiKey);
      assert.strictEqual(req.headers['Content-Type'], 'application/json');

      // 檢查 Payload：嚴格禁止 response_format
      const body = JSON.parse(req.payload);
      assert.strictEqual(body.model, model);
      assert.strictEqual(body.prompt, options.prompt);
      assert.strictEqual(body.n, 1);
      assert.strictEqual(body.size, '1024x1024');
      assert.strictEqual(body.quality, 'low');
      assert.strictEqual(body.moderation, 'auto');
      assert.strictEqual(body.response_format, undefined, 'GPT image 模型不支援 response_format，不得傳送');
    });

    test('照片模式組裝正確（edits 端點：無 response_format、無 moderation、有 quality）(必修 4)', () => {
      const fakeImage = 'base64imagedata';
      const options = {
        prompt: 'Transform into anime',
        mode: 'photo',
        image: fakeImage,
        imageMime: 'image/jpeg',
        quality: 'low'
      };

      let builtFilename = null;
      const mockBlobBuilder = (b64, mime, filename) => {
        builtFilename = filename;
        return { _type: 'Blob', b64, mime, filename };
      };

      const req = Providers.buildOpenAIRequest(apiKey, model, options, mockBlobBuilder);

      assert.strictEqual(req.url, 'https://api.openai.com/v1/images/edits');
      assert.strictEqual(req.headers['Authorization'], 'Bearer ' + apiKey);
      assert.strictEqual(req.payload.model, model);
      assert.strictEqual(req.payload.prompt, options.prompt);
      assert.strictEqual(req.payload.quality, 'low', 'edits 端點必須包含 quality');
      assert.strictEqual(req.payload.moderation, undefined, 'edits 端點不支援 moderation，不得傳送');
      assert.strictEqual(req.payload.response_format, undefined, 'edits 端點不得傳送 response_format');
      assert.strictEqual(req.payload.image._type, 'Blob');
      assert.strictEqual(builtFilename, 'image.jpg', 'image/jpeg 應對應 .jpg 副檔名');
    });

    test('照片模式依據不同 MIME 指派正確副檔名 (必修 4)', () => {
      const checkMimeExt = (mime, expectedExt) => {
        let fn = null;
        Providers.buildOpenAIRequest(apiKey, model, {
          mode: 'photo',
          image: 'dummy',
          imageMime: mime
        }, (b64, m, filename) => {
          fn = filename;
          return {};
        });
        assert.strictEqual(fn, 'image' + expectedExt);
      };

      checkMimeExt('image/jpeg', '.jpg');
      checkMimeExt('image/png', '.png');
      checkMimeExt('image/webp', '.webp');
    });

    test('照片模式缺少 blobBuilder 時拋出錯誤 (必修 4)', () => {
      assert.throws(() => {
        Providers.buildOpenAIRequest(apiKey, model, {
          mode: 'photo',
          image: 'fake'
        });
      }, /blobBuilder is required for OpenAI photo mode/);
    });

    test('缺少 apiKey 時拋出錯誤', () => {
      assert.throws(() => {
        Providers.buildOpenAIRequest('', model, { prompt: 'hi' });
      }, /apiKey is required/);
    });
  });

  // -------------------------------------------------------------
  // 4. OpenAI Response 解析測試
  // -------------------------------------------------------------
  describe('parseOpenAIResponse', () => {
    test('成功回應：正確取出 b64_json 圖片', () => {
      const fixture = loadFixture('openai-success.json');
      const res = Providers.parseOpenAIResponse(fixture);

      assert.strictEqual(res.ok, true);
      assert.ok(res.image && typeof res.image === 'string');
      assert.strictEqual(res.mime, 'image/png');
    });

    test('只有 url 沒有 b64_json 時回傳 PROVIDER_ERROR (必修 4 刪除 URL 分支)', () => {
      const urlOnlyFixture = {
        data: [{ url: 'https://example.com/image.png' }]
      };
      const res = Providers.parseOpenAIResponse(urlOnlyFixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'PROVIDER_ERROR');
      assert.ok(res.error.includes('No b64_json found'));
    });

    test('安全審查擋下（content_policy_violation）：回傳 SAFETY_BLOCKED', () => {
      const fixture = loadFixture('openai-safety.json');
      const res = Providers.parseOpenAIResponse(fixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'SAFETY_BLOCKED');
      assert.ok(res.error.includes('safety system'));
    });

    test('額度不足或金鑰錯誤（insufficient_quota）：回傳 PROVIDER_ERROR', () => {
      const fixture = loadFixture('openai-error.json');
      const res = Providers.parseOpenAIResponse(fixture);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'PROVIDER_ERROR');
      assert.ok(res.error.includes('exceeded your current quota'));
      assert.strictEqual(res.rawCode, 'insufficient_quota');
    });
  });

  // -------------------------------------------------------------
  // 5. fetchWithProvider 包裝測試
  // -------------------------------------------------------------
  describe('fetchWithProvider', () => {
    test('正確將參數傳遞至 fetchFn 並開啟 muteHttpExceptions', () => {
      let capturedUrl = null;
      let capturedOptions = null;

      const mockFetchFn = (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ok: true })
        };
      };

      const requestParams = {
        url: 'https://example.com/api',
        method: 'POST',
        headers: { 'X-Test': '1' },
        payload: '{"test":true}'
      };

      const res = Providers.fetchWithProvider(requestParams, mockFetchFn);

      assert.strictEqual(capturedUrl, 'https://example.com/api');
      assert.strictEqual(capturedOptions.method, 'POST');
      assert.strictEqual(capturedOptions.headers['X-Test'], '1');
      assert.strictEqual(capturedOptions.payload, '{"test":true}');
      assert.strictEqual(capturedOptions.muteHttpExceptions, true);
      assert.strictEqual(res.getResponseCode(), 200);
    });

    test('未傳入 fetchFn 時拋出例外', () => {
      assert.throws(() => {
        Providers.fetchWithProvider({ url: 'https://example.com' }, null);
      }, /fetchFn must be provided/);
    });
  });
});
