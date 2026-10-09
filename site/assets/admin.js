// site/assets/admin.js — 老師後台管理端邏輯

document.addEventListener('DOMContentLoaded', function() {
  var state = {
    config: null,
    stats: null,
    refreshTimer: null,
    openUntilTimer: null
  };

  // DOM 元素引用
  var mockBanner = document.getElementById('mockBanner');
  var loginSection = document.getElementById('loginSection');
  var dashboardSection = document.getElementById('dashboardSection');
  var passwordInput = document.getElementById('passwordInput');
  var loginBtn = document.getElementById('loginBtn');
  var loginMsg = document.getElementById('loginMsg');
  var logoutBtn = document.getElementById('logoutBtn');

  // 開關與倒數
  var openStatusText = document.getElementById('openStatusText');
  var openTimerCountdown = document.getElementById('openTimerCountdown');
  var btnOpen30 = document.getElementById('btnOpen30');
  var btnOpen50 = document.getElementById('btnOpen50');
  var btnOpenForever = document.getElementById('btnOpenForever');
  var btnCloseNow = document.getElementById('btnCloseNow');

  // 班級通行碼
  var currentClassCodeDisplay = document.getElementById('currentClassCodeDisplay');
  var newCodeBtn = document.getElementById('newCodeBtn');
  var clearCodeBtn = document.getElementById('clearCodeBtn');

  // 用量與統計
  var usageProgressFill = document.getElementById('usageProgressFill');
  var usageCountText = document.getElementById('usageCountText');
  var successCount = document.getElementById('successCount');
  var failureCount = document.getElementById('failureCount');
  var blockedCount = document.getElementById('blockedCount');
  var costEstimateText = document.getElementById('costEstimateText');

  // 金鑰狀態與設定表單
  var geminiStatusBadge = document.getElementById('geminiStatusBadge');
  var openaiStatusBadge = document.getElementById('openaiStatusBadge');
  var inputDailyGlobal = document.getElementById('inputDailyGlobal');
  var inputDailyDevice = document.getElementById('inputDailyDevice');
  var inputCooldown = document.getElementById('inputCooldown');
  var inputMaxConcurrent = document.getElementById('inputMaxConcurrent');
  var inputProvider = document.getElementById('inputProvider');
  var inputAllowPhoto = document.getElementById('inputAllowPhoto');
  var saveConfigBtn = document.getElementById('saveConfigBtn');
  var saveConfigMsg = document.getElementById('saveConfigMsg');

  // 日誌表格
  var logsTableBody = document.getElementById('logsTableBody');
  var refreshLogsBtn = document.getElementById('refreshLogsBtn');

  // 檢查 Mock 模式標籤
  if (ApiClient.isMockMode() && mockBanner) {
    mockBanner.style.display = 'flex';
  }

  // 登入事件處理
  if (loginBtn) {
    loginBtn.addEventListener('click', function() {
      var pw = (passwordInput.value || '').trim();
      if (!pw) {
        showLoginError('請輸入管理密碼');
        return;
      }
      sessionStorage.setItem('ai_drawing_portal_admin_pw', pw);
      performLogin();
    });
  }

  function showLoginError(msg) {
    if (loginMsg) {
      loginMsg.textContent = msg;
      loginMsg.style.display = 'block';
    }
  }

  function performLogin() {
    loginMsg.style.display = 'none';
    ApiClient.adminRequest('admin.login').then(function(res) {
      if (!res.ok) {
        sessionStorage.removeItem('ai_drawing_portal_admin_pw');
        showLoginError(res.message || '登入失敗，密碼錯誤');
        return;
      }

      state.config = res.data.config;
      state.stats = res.data.stats;

      loginSection.style.display = 'none';
      dashboardSection.style.display = 'block';

      renderAllDashboard();
      startAutoRefresh();
    });
  }

  // 登出
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      sessionStorage.removeItem('ai_drawing_portal_admin_pw');
      if (state.refreshTimer) clearInterval(state.refreshTimer);
      if (state.openUntilTimer) clearInterval(state.openUntilTimer);
      dashboardSection.style.display = 'none';
      loginSection.style.display = 'block';
      if (passwordInput) passwordInput.value = '';
    });
  }

  // 渲染所有管理端畫面
  function renderAllDashboard() {
    renderOpenStatus();
    renderClassCode();
    renderStats();
    renderConfigForm();
    loadLogs();
  }

  // 1. 開放狀態與按鈕
  function renderOpenStatus() {
    var c = state.config;
    if (state.openUntilTimer) clearInterval(state.openUntilTimer);

    if (!c.serviceOpen) {
      openStatusText.textContent = '目前為關閉狀態';
      openStatusText.style.color = 'var(--danger)';
      openTimerCountdown.textContent = '';
      return;
    }

    if (c.openUntil) {
      openStatusText.textContent = '定時開放中';
      openStatusText.style.color = 'var(--success)';
      var updateCountdown = function() {
        var remainMs = new Date(c.openUntil).getTime() - Date.now();
        if (remainMs <= 0) {
          clearInterval(state.openUntilTimer);
          openStatusText.textContent = '已到期關閉';
          openStatusText.style.color = 'var(--danger)';
          openTimerCountdown.textContent = '';
        } else {
          var remainMins = Math.floor(remainMs / 60000);
          var remainSecs = Math.floor((remainMs % 60000) / 1000);
          openTimerCountdown.textContent = '剩餘 ' + remainMins + ' 分 ' + remainSecs + ' 秒';
        }
      };
      updateCountdown();
      state.openUntilTimer = setInterval(updateCountdown, 1000);
    } else {
      openStatusText.textContent = '開放中（直到手動關閉）';
      openStatusText.style.color = 'var(--success)';
      openTimerCountdown.textContent = '';
    }
  }

  // 開關按鈕綁定
  if (btnOpen30) {
    btnOpen30.addEventListener('click', function() {
      ApiClient.adminRequest('admin.setOpen', { open: true, minutes: 30 }).then(function(res) {
        if (res.ok) { state.config = res.data; renderOpenStatus(); }
      });
    });
  }

  if (btnOpen50) {
    btnOpen50.addEventListener('click', function() {
      ApiClient.adminRequest('admin.setOpen', { open: true, minutes: 50 }).then(function(res) {
        if (res.ok) { state.config = res.data; renderOpenStatus(); }
      });
    });
  }

  if (btnOpenForever) {
    btnOpenForever.addEventListener('click', function() {
      ApiClient.adminRequest('admin.setOpen', { open: true }).then(function(res) {
        if (res.ok) { state.config = res.data; renderOpenStatus(); }
      });
    });
  }

  if (btnCloseNow) {
    btnCloseNow.addEventListener('click', function() {
      ApiClient.adminRequest('admin.setOpen', { open: false }).then(function(res) {
        if (res.ok) { state.config = res.data; renderOpenStatus(); }
      });
    });
  }

  // 2. 班級通行碼
  function renderClassCode() {
    var code = state.config.classCode;
    if (code) {
      currentClassCodeDisplay.textContent = code;
      currentClassCodeDisplay.style.fontSize = '48px';
      currentClassCodeDisplay.style.color = 'var(--primary)';
    } else {
      currentClassCodeDisplay.textContent = '（未設通行碼・任何人可畫）';
      currentClassCodeDisplay.style.fontSize = '24px';
      currentClassCodeDisplay.style.color = 'var(--text-muted)';
    }
  }

  if (newCodeBtn) {
    newCodeBtn.addEventListener('click', function() {
      ApiClient.adminRequest('admin.newClassCode').then(function(res) {
        if (res.ok) {
          state.config.classCode = res.data.classCode;
          renderClassCode();
        }
      });
    });
  }

  if (clearCodeBtn) {
    clearCodeBtn.addEventListener('click', function() {
      ApiClient.adminRequest('admin.setConfig', { classCode: '' }).then(function(res) {
        if (res.ok) {
          state.config = res.data;
          renderClassCode();
        }
      });
    });
  }

  // 3. 用量與統計
  function renderStats() {
    var s = state.stats;
    var c = state.config;
    if (!s) return;

    var success = s.success || 0;
    var totalLimit = c.dailyLimitGlobal || 200;
    var percent = Math.min(100, Math.round((success / totalLimit) * 100));

    usageProgressFill.style.width = percent + '%';
    usageCountText.textContent = success + ' / ' + totalLimit + ' 張 (' + percent + '%)';
    successCount.textContent = success;
    failureCount.textContent = s.failure || 0;
    blockedCount.textContent = s.blocked || 0;

    // 費用估算（若為 null 顯示「未設定單價」）
    if (s.costEstimate === null || s.costEstimate === undefined) {
      costEstimateText.textContent = '未設定單價';
    } else {
      costEstimateText.textContent = '約 $' + s.costEstimate + ' 美元';
    }
  }

  // 4. 設定表單
  function renderConfigForm() {
    var c = state.config;
    if (!c) return;

    inputDailyGlobal.value = c.dailyLimitGlobal;
    inputDailyDevice.value = c.dailyLimitPerDevice;
    inputCooldown.value = c.cooldownSec;
    inputMaxConcurrent.value = c.maxConcurrent;
    inputProvider.value = c.provider || 'gemini';
    inputAllowPhoto.checked = c.allowPhoto !== false;

    // 金鑰設定狀態徽章（絕不顯示金鑰內容）
    geminiStatusBadge.textContent = c.hasGeminiKey ? 'Gemini 已設定' : 'Gemini 未設定';
    geminiStatusBadge.className = 'badge-tag ' + (c.hasGeminiKey ? 'success' : 'fail');

    openaiStatusBadge.textContent = c.hasOpenAIKey ? 'OpenAI 已設定' : 'OpenAI 未設定';
    openaiStatusBadge.className = 'badge-tag ' + (c.hasOpenAIKey ? 'success' : 'fail');
  }

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', function() {
      saveConfigMsg.style.display = 'none';

      var updates = {
        dailyLimitGlobal: parseInt(inputDailyGlobal.value, 10),
        dailyLimitPerDevice: parseInt(inputDailyDevice.value, 10),
        cooldownSec: parseInt(inputCooldown.value, 10),
        maxConcurrent: parseInt(inputMaxConcurrent.value, 10),
        provider: inputProvider.value,
        allowPhoto: Boolean(inputAllowPhoto.checked)
      };

      ApiClient.adminRequest('admin.setConfig', updates).then(function(res) {
        if (res.ok) {
          state.config = res.data;
          renderConfigForm();
          saveConfigMsg.textContent = '設定已成功儲存！';
          saveConfigMsg.style.color = 'var(--success)';
          saveConfigMsg.style.display = 'block';
        } else {
          saveConfigMsg.textContent = '儲存失敗：' + (res.message || '格式不符');
          saveConfigMsg.style.color = 'var(--danger)';
          saveConfigMsg.style.display = 'block';
        }
      });
    });
  }

  // 5. 讀取並渲染日誌紀錄
  function loadLogs() {
    ApiClient.adminRequest('admin.logs', { limit: 50 }).then(function(res) {
      if (!res.ok || !res.data || !res.data.logs) return;
      var logs = res.data.logs;
      logsTableBody.innerHTML = '';

      if (logs.length === 0) {
        var emptyTr = document.createElement('tr');
        var emptyTd = document.createElement('td');
        emptyTd.colSpan = 9;
        emptyTd.style.textAlign = 'center';
        emptyTd.style.color = 'var(--text-muted)';
        emptyTd.textContent = '目前尚無生圖紀錄';
        emptyTr.appendChild(emptyTd);
        logsTableBody.appendChild(emptyTr);
        return;
      }

      logs.forEach(function(r) {
        var tr = document.createElement('tr');

        // 時間格式化 HH:MM:SS
        var timeStr = r.timestamp || '';
        try {
          var d = new Date(r.timestamp);
          timeStr = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
        } catch (e) {}

        // 1. 時間
        var tdTime = document.createElement('td');
        tdTime.textContent = timeStr;
        tr.appendChild(tdTime);

        // 2. 裝置短碼
        var tdDev = document.createElement('td');
        var codeEl = document.createElement('code');
        codeEl.textContent = r.deviceIdShort || '';
        tdDev.appendChild(codeEl);
        tr.appendChild(tdDev);

        // 3. 模式
        var tdMode = document.createElement('td');
        tdMode.textContent = r.mode === 'photo' ? '照片' : '文字';
        tr.appendChild(tdMode);

        // 4. 風格
        var tdStyle = document.createElement('td');
        tdStyle.textContent = r.style || '';
        tr.appendChild(tdStyle);

        // 5. 學生描述 (XSS 防護：純 textContent，防護 <img onerror=...>)
        var tdPrompt = document.createElement('td');
        tdPrompt.style.maxWidth = '240px';
        tdPrompt.style.overflow = 'hidden';
        tdPrompt.style.textOverflow = 'ellipsis';
        tdPrompt.title = r.prompt || '';
        tdPrompt.textContent = r.prompt || '';
        tr.appendChild(tdPrompt);

        // 6. 結果代碼
        var tdCode = document.createElement('td');
        var badgeSpan = document.createElement('span');
        var badgeClass = 'success';
        if (r.resultCode === 'BLOCKED_PROMPT' || r.resultCode === 'SAFETY_BLOCKED' || r.resultCode === 'DEVICE_BLOCKED') {
          badgeClass = 'block';
        } else if (r.resultCode !== 'SUCCESS') {
          badgeClass = 'fail';
        }
        badgeSpan.className = 'badge-tag ' + badgeClass;
        badgeSpan.textContent = r.resultCode || '';
        tdCode.appendChild(badgeSpan);
        tr.appendChild(tdCode);

        // 7. 建議修 8: 錯誤細節 (前 40 字，完整內容在 title)
        var tdErr = document.createElement('td');
        tdErr.style.maxWidth = '180px';
        tdErr.style.overflow = 'hidden';
        tdErr.style.textOverflow = 'ellipsis';
        var errDetailText = r.errorDetail || '';
        tdErr.title = errDetailText;
        tdErr.textContent = errDetailText.length > 40 ? errDetailText.substring(0, 40) + '…' : errDetailText;
        tr.appendChild(tdErr);

        // 8. 耗時
        var tdDuration = document.createElement('td');
        tdDuration.textContent = r.durationMs ? r.durationMs + 'ms' : '-';
        tr.appendChild(tdDuration);

        // 9. 操作按鈕
        var tdAction = document.createElement('td');
        var isBlocked = (state.config.blockedDevices || []).indexOf(r.deviceIdShort) !== -1;
        var btn = document.createElement('button');
        btn.dataset.device = r.deviceIdShort || '';
        btn.style.minHeight = '36px';
        btn.style.padding = '4px 8px';
        btn.style.fontSize = '12px';
        if (isBlocked) {
          btn.className = 'quick-btn unblock-btn';
          btn.textContent = '已封鎖 (解除)';
        } else {
          btn.className = 'quick-btn block-btn';
          btn.style.color = 'var(--danger)';
          btn.textContent = '封鎖此裝置';
        }
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        logsTableBody.appendChild(tr);
      });

      // 綁定封鎖／解鎖按鈕
      document.querySelectorAll('.block-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var dev = btn.dataset.device;
          if (confirm('確定要封鎖裝置短碼 ' + dev + ' 嗎？該裝置將無法繼續生圖。')) {
            ApiClient.adminRequest('admin.blockDevice', { deviceId: dev }).then(function(bRes) {
              if (bRes.ok) {
                state.config.blockedDevices = bRes.data.blockedDevices;
                loadLogs();
              }
            });
          }
        });
      });

      document.querySelectorAll('.unblock-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var dev = btn.dataset.device;
          ApiClient.adminRequest('admin.unblockDevice', { deviceId: dev }).then(function(uRes) {
            if (uRes.ok) {
              state.config.blockedDevices = uRes.data.blockedDevices;
              loadLogs();
            }
          });
        });
      });
    });
  }

  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadLogs);
  }

  // 6. 定時 15 秒自動刷新（分頁不在前景時暫停）
  function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(function() {
      if (document.visibilityState === 'visible') {
        ApiClient.adminRequest('admin.stats').then(function(res) {
          if (res.ok) {
            state.stats = res.data;
            renderStats();
          }
        });
        loadLogs();
      }
    }, 15000);
  }

  // 自動登入檢查（若 sessionStorage 已有密碼，或 mock 模式帶入 ?mock=1 / ?mock=dashboard）
  var urlParams = new URLSearchParams(window.location.search);
  if (ApiClient.isMockMode() && (urlParams.get('mock') === '1' || urlParams.get('mock') === 'dashboard' || urlParams.get('mock') === 'true')) {
    if (!sessionStorage.getItem('ai_drawing_portal_admin_pw')) {
      sessionStorage.setItem('ai_drawing_portal_admin_pw', 'mock-password');
    }
  }

  if (sessionStorage.getItem('ai_drawing_portal_admin_pw')) {
    performLogin();
  }
});
