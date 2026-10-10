// site/assets/api.js — 前端 API 呼叫封裝與 Mock 模式處理

var ApiClient = {
  ERROR_MESSAGES: {
    CLOSED: '老師還沒開放喔，等老師說開始再試！',
    BAD_CODE: '班級通行碼不對，再問一下老師～',
    COOLDOWN: '休息一下，{n} 秒後再畫下一張',
    DEVICE_LIMIT: '你今天的次數都用完了，明天再來！',
    DAILY_LIMIT: '今天全班的額度用完了，明天再來喔！',
    BUSY: '現在排隊的人很多，等幾秒自動幫你重試…',
    BLOCKED_PROMPT: '這個描述不適合喔，換個說法試試看',
    SAFETY_BLOCKED: 'AI 覺得這張圖不太適合，換個描述吧',
    DEVICE_BLOCKED: '請找老師幫忙',
    BAD_REQUEST: '好像少了什麼，檢查一下再送出',
    PROVIDER_ERROR: 'AI 暫時忙不過來，稍後再試',
    ADMIN_AUTH: '管理密碼錯誤',
    ADMIN_LOCKED: '錯誤次數過多，請 10 分鐘後再試'
  },

  STYLES: [
    { id: 'free', label: '✍️ 自訂風格', emoji: '✍️' },
    { id: 'pixar', label: '🎬 3D 動畫風', emoji: '🎬' },
    { id: 'watercolor', label: '🎨 水彩風', emoji: '🎨' },
    { id: 'cyberpunk', label: '🌆 未來科技風', emoji: '🌆' },
    { id: 'anime', label: '🌿 日系動畫風', emoji: '🌿' },
    { id: 'popart', label: '🟡 普普藝術風', emoji: '🟡' },
    { id: 'chibi', label: '🐱 Q 版萌系風', emoji: '🐱' },
    { id: 'crayon', label: '🖍️ 蠟筆童畫風', emoji: '🖍️' }
  ],

  /**
   * 取得或初始化 8-64 字元之唯一裝置識別碼
   * @returns {string}
   */
  getDeviceId: function() {
    var stored = localStorage.getItem('ai_drawing_portal_device_id');
    var valid = stored && stored.length >= 8 && stored.length <= 64 && /^[A-Za-z0-9-]+$/.test(stored);
    if (!valid) {
      stored = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now();
      localStorage.setItem('ai_drawing_portal_device_id', stored);
    }
    return stored;
  },

  /**
   * 檢查是否處於 Mock 測試模式
   * 條件：網址帶有 ?mock 或 CONFIG.BACKEND_URL 為空
   * @returns {boolean}
   */
  isMockMode: function() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('mock')) {
      return true;
    }
    return !CONFIG.BACKEND_URL || CONFIG.BACKEND_URL.trim() === '';
  },

  /**
   * 取得指定之 Mock 錯誤碼（若有傳入 ?mock=ERROR_CODE）
   * @returns {string|null}
   */
  getMockErrorCode: function() {
    var urlParams = new URLSearchParams(window.location.search);
    var mockVal = urlParams.get('mock');
    if (mockVal && mockVal !== '1' && mockVal !== 'true') {
      return mockVal.toUpperCase();
    }
    return null;
  },

  /**
   * 封裝帶有 120 秒超時的 Fetch 請求
   * @param {string} url
   * @param {Object} options
   * @returns {Promise<any>}
   */
  fetchWithTimeout: function(url, options) {
    options = options || {};
    var controller = new AbortController();
    var timeoutId = setTimeout(function() {
      controller.abort();
    }, 120000); // 120 秒超時防護

    options.signal = controller.signal;

    return fetch(url, options)
      .then(function(res) {
        clearTimeout(timeoutId);
        return res.text();
      })
      .then(function(text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          // 當後端回應 HTML 錯誤頁或非 JSON 格式時，友善封裝為 PROVIDER_ERROR
          return {
            ok: false,
            code: 'PROVIDER_ERROR',
            message: ApiClient.ERROR_MESSAGES.PROVIDER_ERROR
          };
        }
      })
      .catch(function(err) {
        clearTimeout(timeoutId);
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: ApiClient.ERROR_MESSAGES.PROVIDER_ERROR
        };
      });
  },

  // ==============================================================
  // 學生端 API
  // ==============================================================

  /**
   * 查詢系統服務狀態
   * @param {string} [classCode='']
   * @returns {Promise<{ok: boolean, data?: Object, code?: string, message?: string}>}
   */
  getStatus: function(classCode) {
    var self = this;
    var deviceId = this.getDeviceId();

    if (this.isMockMode()) {
      var mockCode = this.getMockErrorCode();
      if (mockCode && mockCode === 'CLOSED') {
        return Promise.resolve({
          ok: true,
          data: {
            open: false,
            openUntil: null,
            needCode: false,
            codeOk: true,
            styles: self.STYLES,
            remainingToday: 0,
            deviceRemaining: 0,
            cooldownSec: 20,
            mode: { text: true, photo: true }
          }
        });
      }

      if (mockCode && mockCode === 'NEEDCODE') {
        return Promise.resolve({
          ok: true,
          data: {
            open: true,
            openUntil: null,
            needCode: true,
            codeOk: false,
            styles: self.STYLES,
            remainingToday: 180,
            deviceRemaining: 10,
            cooldownSec: 5,
            mode: { text: true, photo: true }
          }
        });
      }

      // Mock 成功狀態
      return Promise.resolve({
        ok: true,
        data: {
          open: true,
          openUntil: null,
          needCode: false,
          codeOk: true,
          styles: self.STYLES,
          remainingToday: 180,
          deviceRemaining: 10,
          cooldownSec: 5,
          mode: { text: true, photo: true }
        }
      });
    }

    var qs = '?action=status&deviceId=' + encodeURIComponent(deviceId);
    if (classCode) {
      qs += '&classCode=' + encodeURIComponent(classCode);
    }
    return this.fetchWithTimeout(CONFIG.BACKEND_URL + qs, { method: 'GET' });
  },

  /**
   * 請求生成 AI 圖片
   * @param {Object} params - { mode, style, prompt, image, imageMime, classCode }
   * @returns {Promise<{ok: boolean, data?: Object, code?: string, message?: string}>}
   */
  generate: function(params) {
    var self = this;
    var deviceId = this.getDeviceId();

    if (this.isMockMode()) {
      var mockCode = this.getMockErrorCode();
      if (mockCode && self.ERROR_MESSAGES[mockCode]) {
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve({
              ok: false,
              code: mockCode,
              message: self.ERROR_MESSAGES[mockCode]
            });
          }, 300);
        });
      }

      // 模擬生成等待 2 秒
      return new Promise(function(resolve) {
        setTimeout(function() {
          var styleObj = self.STYLES.find(function(s) { return s.id === params.style; });
          var styleLabel = styleObj ? styleObj.label : params.style;
          var fakeBase64 = ImageHelper.generateMockImageBase64(styleLabel, params.prompt);

          resolve({
            ok: true,
            data: {
              image: fakeBase64,
              mime: 'image/png',
              deviceRemaining: 9,
              remainingToday: 179,
              requestId: 'mock-' + Date.now()
            }
          });
        }, 2000);
      });
    }

    var bodyPayload = {
      action: 'generate',
      deviceId: deviceId,
      classCode: params.classCode || '',
      mode: params.mode || 'text',
      style: params.style,
      prompt: params.prompt
    };

    if (params.mode === 'photo') {
      bodyPayload.image = params.image; // 純 Base64
      bodyPayload.imageMime = params.imageMime || 'image/jpeg';
    }

    // POST 一律以 text/plain 避免 CORS preflight 限制
    return this.fetchWithTimeout(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(bodyPayload)
    });
  },

  // ==============================================================
  // 老師端 API
  // ==============================================================

  /**
   * 呼叫管理端動作（一律夾帶 adminPassword）
   * @param {string} action
   * @param {Object} extraData
   * @returns {Promise<{ok: boolean, data?: any, code?: string, message?: string}>}
   */
  adminRequest: function(action, extraData) {
    var adminPassword = sessionStorage.getItem('ai_drawing_portal_admin_pw') || '';
    var payload = Object.assign({
      action: action,
      adminPassword: adminPassword
    }, extraData || {});

    if (this.isMockMode()) {
      return this._handleMockAdmin(action, payload);
    }

    return this.fetchWithTimeout(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
  },

  /**
   * 處理老師端的 Mock 假資料回傳
   */
  _handleMockAdmin: function(action, payload) {
    var self = this;
    if (!payload.adminPassword) {
      return Promise.resolve({ ok: false, code: 'ADMIN_AUTH', message: self.ERROR_MESSAGES.ADMIN_AUTH });
    }

    return new Promise(function(resolve) {
      var mockState = JSON.parse(sessionStorage.getItem('ai_mock_admin_state') || JSON.stringify({
          serviceOpen: true,
          openUntil: null,
          classCode: '4821',
          dailyLimitGlobal: 200,
          dailyLimitPerDevice: 10,
          cooldownSec: 20,
          maxConcurrent: 8,
          provider: 'gemini',
          allowPhoto: true,
          hasGeminiKey: true,
          hasOpenAIKey: false,
          costPerImageUsd: null,
          blockedDevices: []
        }));

        switch (action) {
          case 'admin.login':
            resolve({
              ok: true,
              data: {
                config: mockState,
                stats: {
                  success: 42,
                  failure: 3,
                  blocked: 2,
                  costEstimate: mockState.costPerImageUsd !== null ? 1.26 : null
                }
              }
            });
            break;

          case 'admin.setOpen':
            mockState.serviceOpen = Boolean(payload.open);
            if (payload.open && payload.minutes > 0) {
              mockState.openUntil = new Date(Date.now() + payload.minutes * 60000).toISOString();
            } else {
              mockState.openUntil = null;
            }
            sessionStorage.setItem('ai_mock_admin_state', JSON.stringify(mockState));
            resolve({ ok: true, data: mockState });
            break;

          case 'admin.setConfig':
            for (var k in payload) {
              if (k !== 'action' && k !== 'adminPassword' && mockState[k] !== undefined) {
                mockState[k] = payload[k];
              }
            }
            sessionStorage.setItem('ai_mock_admin_state', JSON.stringify(mockState));
            resolve({ ok: true, data: mockState });
            break;

          case 'admin.newClassCode':
            mockState.classCode = String(Math.floor(1000 + Math.random() * 9000));
            sessionStorage.setItem('ai_mock_admin_state', JSON.stringify(mockState));
            resolve({ ok: true, data: { classCode: mockState.classCode } });
            break;

          case 'admin.logs':
            resolve({
              ok: true,
              data: {
                logs: [
                  {
                    timestamp: new Date().toISOString(),
                    deviceIdShort: 'dev-a1b2',
                    mode: 'text',
                    style: 'pixar',
                    prompt: '一隻在森林裡喝水的小鹿',
                    resultCode: 'SUCCESS',
                    durationMs: 3120,
                    provider: 'gemini',
                    errorDetail: ''
                  },
                  {
                    timestamp: new Date(Date.now() - 60000).toISOString(),
                    deviceIdShort: 'dev-c3d4',
                    mode: 'photo',
                    style: 'watercolor',
                    prompt: '變成水彩畫像',
                    resultCode: 'SUCCESS',
                    durationMs: 4210,
                    provider: 'gemini',
                    errorDetail: ''
                  },
                  {
                    timestamp: new Date(Date.now() - 120000).toISOString(),
                    deviceIdShort: 'dev-e5f6',
                    mode: 'text',
                    style: 'anime',
                    prompt: '壞壞的詞句',
                    resultCode: 'BLOCKED_PROMPT',
                    durationMs: 45,
                    provider: 'gemini',
                    errorDetail: 'Blocked keyword in prompt'
                  }
                ]
              }
            });
            break;

          case 'admin.blockDevice':
            var dev = String(payload.deviceId || '').substring(0, 8);
            if (mockState.blockedDevices.indexOf(dev) === -1) {
              mockState.blockedDevices.push(dev);
            }
            sessionStorage.setItem('ai_mock_admin_state', JSON.stringify(mockState));
            resolve({ ok: true, data: { blockedDevices: mockState.blockedDevices } });
            break;

          case 'admin.unblockDevice':
            var unDev = String(payload.deviceId || '').substring(0, 8);
            mockState.blockedDevices = mockState.blockedDevices.filter(function(d) { return d !== unDev; });
            sessionStorage.setItem('ai_mock_admin_state', JSON.stringify(mockState));
            resolve({ ok: true, data: { blockedDevices: mockState.blockedDevices } });
            break;

          case 'admin.stats':
            resolve({
              ok: true,
              data: {
                success: 42,
                failure: 3,
                blocked: 2,
                costEstimate: mockState.costPerImageUsd !== null ? 1.26 : null
              }
            });
            break;

          default:
            resolve({ ok: false, code: 'BAD_REQUEST', message: self.ERROR_MESSAGES.BAD_REQUEST });
            break;
        }
      });
  }
};
