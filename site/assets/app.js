// site/assets/app.js — 學生生圖介面互動邏輯

document.addEventListener('DOMContentLoaded', function() {
  // 核心狀態
  var state = {
    mode: 'text', // 'text' | 'photo'
    selectedStyle: 'pixar',
    photoBase64: '',
    photoMime: '',
    serverOpen: true,
    loading: false,
    retryPending: false,
    deviceBlocked: false,
    cooldownRemaining: 0,
    cooldownSec: 20,
    cooldownTimer: null,
    busyRetryCount: 0,
    promptFilledByHelper: true,
    statusTimer: null,
    sessionGallery: [], // 僅存於記憶體，重新整理即消失
    currentArtwork: null
  };

  // DOM 元素引用
  var mockBanner = document.getElementById('mockBanner');
  var siteTitle = document.getElementById('siteTitle');
  var schoolName = document.getElementById('schoolName');
  var statusLight = document.getElementById('statusLight');
  var remainingBadge = document.getElementById('remainingBadge');
  var classCodeCard = document.getElementById('classCodeCard');
  var classCodeInput = document.getElementById('classCodeInput');
  var classCodeBtn = document.getElementById('classCodeBtn');
  var classCodeNotice = document.getElementById('classCodeNotice');
  var mainWorkspace = document.getElementById('mainWorkspace');
  var modeTextBtn = document.getElementById('modeTextBtn');
  var modePhotoBtn = document.getElementById('modePhotoBtn');
  var photoSection = document.getElementById('photoSection');
  var cameraFileInput = document.getElementById('cameraFileInput');
  var albumFileInput = document.getElementById('albumFileInput');
  var cameraTriggerBtn = document.getElementById('cameraTriggerBtn');
  var albumTriggerBtn = document.getElementById('albumTriggerBtn');
  var uploadBtnGroup = document.getElementById('uploadBtnGroup');
  var photoPreviewBox = document.getElementById('photoPreviewBox');
  var photoPreviewImg = document.getElementById('photoPreviewImg');
  var removePhotoBtn = document.getElementById('removePhotoBtn');
  var stylesGrid = document.getElementById('stylesGrid');
  var promptTextarea = document.getElementById('promptTextarea');
  var charCounter = document.getElementById('charCounter');
  var subjectInput = document.getElementById('subjectInput');
  var actionInput = document.getElementById('actionInput');
  var locationInput = document.getElementById('locationInput');
  var feelingInput = document.getElementById('feelingInput');
  var startBtn = document.getElementById('startBtn');
  var loadingBox = document.getElementById('loadingBox');
  var progressBar = document.getElementById('progressBar');
  var loadingTips = document.getElementById('loadingTips');
  var resultCard = document.getElementById('resultCard');
  var artworkImage = document.getElementById('artworkImage');
  var downloadBtn = document.getElementById('downloadBtn');
  var restartBtn = document.getElementById('restartBtn');
  var galleryStrip = document.getElementById('galleryStrip');
  var alertBox = document.getElementById('alertBox');
  var alertText = document.getElementById('alertText');
  var alertIcon = document.getElementById('alertIcon');

  // 初始化站名
  if (siteTitle) siteTitle.textContent = CONFIG.SITE_NAME || 'AI 創意生圖小幫手';
  if (schoolName) schoolName.textContent = CONFIG.SCHOOL_NAME || '國小課堂 AI 探索';

  // 檢查 Mock 模式標記
  if (ApiClient.isMockMode() && mockBanner) {
    mockBanner.style.display = 'flex';
  }

  // 必修 2：單一函式控制按鈕可按狀態與文字提示
  function refreshStartButton() {
    if (!startBtn) return;
    var canPress = state.serverOpen &&
                   !state.loading &&
                   state.cooldownRemaining <= 0 &&
                   !state.retryPending &&
                   !state.deviceBlocked;

    startBtn.disabled = !canPress;

    if (state.loading) {
      startBtn.textContent = '🎨 AI 正在努力畫圖中…';
    } else if (state.retryPending) {
      startBtn.textContent = '⏳ 排隊等待自動重試中…';
    } else if (state.cooldownRemaining > 0) {
      startBtn.textContent = '⏳ 請稍候（' + state.cooldownRemaining + ' 秒）';
    } else if (!state.serverOpen) {
      startBtn.textContent = '🔴 尚未開放畫圖';
    } else if (state.deviceBlocked) {
      startBtn.textContent = '⚠️ 請找老師協助';
    } else {
      startBtn.textContent = '🚀 開始畫圖';
    }
  }

  // 1. 初始化與定時讀取服務狀態
  function checkStatus() {
    var savedCode = localStorage.getItem('ai_portal_class_code') || '';
    ApiClient.getStatus(savedCode).then(function(res) {
      if (!res.ok) {
        showAlert('warning', res.message || '無法取得伺服器狀態');
        return;
      }
      var data = res.data;

      // 取得後端設定之冷卻秒數（必修 4）
      if (data.cooldownSec !== undefined) {
        state.cooldownSec = data.cooldownSec;
      }

      // 服務開關燈號與按鈕狀態更新（必修 3）
      if (!data.open) {
        state.serverOpen = false;
        statusLight.className = 'status-indicator closed';
        statusLight.textContent = '🔴 尚未開放';
      } else {
        state.serverOpen = true;
        statusLight.className = 'status-indicator open';
        var openUntilText = '';
        if (data.openUntil) {
          var d = new Date(data.openUntil);
          var hh = ('0' + d.getHours()).slice(-2);
          var mm = ('0' + d.getMinutes()).slice(-2);
          openUntilText = '（到 ' + hh + ':' + mm + '）';
        }
        statusLight.textContent = '🟢 開放中' + openUntilText;
      }

      // 額度徽章更新（建議修 6: 顯示全班與個人次數）
      if (remainingBadge) {
        var devText = (data.deviceRemaining !== undefined) ? ' ｜ 你還可畫：' + data.deviceRemaining + ' 次' : '';
        remainingBadge.textContent = '今日剩餘：' + data.remainingToday + ' 次' + devText;
      }

      // 通行碼檢查與更換提醒（建議修 7）
      if (data.needCode && (!savedCode || data.codeOk === false)) {
        if (classCodeCard) classCodeCard.style.display = 'block';
        if (mainWorkspace) mainWorkspace.style.display = 'none';
        if (classCodeNotice) {
          if (savedCode && data.codeOk === false) {
            classCodeNotice.textContent = '通行碼已更換，請重新輸入老師提供的新通行碼！';
            classCodeNotice.style.color = 'var(--danger)';
          } else {
            classCodeNotice.textContent = '老師會在黑板或投影幕上公布今日的 4 位數字通行碼喔！';
            classCodeNotice.style.color = 'var(--text-muted)';
          }
        }
        refreshStartButton();
        return;
      } else {
        if (classCodeCard) classCodeCard.style.display = 'none';
        if (mainWorkspace) mainWorkspace.style.display = 'block';
      }

      // 照片模式是否受老師開放
      if (data.mode && data.mode.photo === false) {
        if (modePhotoBtn) modePhotoBtn.style.display = 'none';
        switchMode('text');
      }

      // 載入風格按鈕卡片
      renderStyles(data.styles || ApiClient.STYLES);

      refreshStartButton();
    });
  }

  // 必修 3：每 15 秒重新呼叫一次 status（分頁不在前景時暫停）
  function startStatusAutoPolling() {
    if (state.statusTimer) clearInterval(state.statusTimer);
    state.statusTimer = setInterval(function() {
      if (document.visibilityState === 'visible') {
        checkStatus();
      }
    }, 15000);
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      checkStatus();
    }
  });

  // 驗證班級通行碼按鈕
  if (classCodeBtn) {
    classCodeBtn.addEventListener('click', function() {
      var code = (classCodeInput.value || '').trim();
      if (!code) {
        alert('請輸入老師提供的 4 位數字通行碼！');
        return;
      }
      localStorage.setItem('ai_portal_class_code', code);
      checkStatus();
    });
  }

  // 2. 渲染風格卡片（必修 1: 不用 innerHTML；建議修 9: 去除重複 emoji）
  function renderStyles(styles) {
    stylesGrid.innerHTML = '';
    styles.forEach(function(s) {
      var card = document.createElement('div');
      card.className = 'style-card' + (s.id === state.selectedStyle ? ' selected' : '');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', s.label);
      card.dataset.styleId = s.id;

      var emojiDiv = document.createElement('div');
      emojiDiv.className = 'style-emoji';
      emojiDiv.textContent = s.emoji;

      var nameDiv = document.createElement('div');
      nameDiv.className = 'style-name';
      nameDiv.textContent = (s.label || '').replace(s.emoji, '').trim();

      card.appendChild(emojiDiv);
      card.appendChild(nameDiv);

      function selectCard() {
        document.querySelectorAll('.style-card').forEach(function(c) {
          c.classList.remove('selected');
        });
        card.classList.add('selected');
        state.selectedStyle = s.id;
      }

      card.addEventListener('click', selectCard);
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCard();
        }
      });

      stylesGrid.appendChild(card);
    });
  }

  // 3. 切換畫圖模式（文字／照片）
  function switchMode(newMode) {
    state.mode = newMode;
    if (newMode === 'text') {
      modeTextBtn.classList.add('active');
      modePhotoBtn.classList.remove('active');
      photoSection.style.display = 'none';
    } else {
      modeTextBtn.classList.remove('active');
      modePhotoBtn.classList.add('active');
      photoSection.style.display = 'block';
    }
  }

  if (modeTextBtn) modeTextBtn.addEventListener('click', function() { switchMode('text'); });
  if (modePhotoBtn) modePhotoBtn.addEventListener('click', function() { switchMode('photo'); });

  // 必修 5：照片上傳與拍照處理（分離拍照與相簿）
  function handlePhotoFileSelected(file) {
    if (!file) return;
    ImageHelper.compressImage(file, 1024, 0.85)
      .then(function(result) {
        state.photoBase64 = result.base64;
        state.photoMime = result.mime;
        photoPreviewImg.src = result.dataUrl;
        photoPreviewBox.style.display = 'inline-block';
        if (uploadBtnGroup) uploadBtnGroup.style.display = 'none';
      })
      .catch(function(err) {
        showAlert('danger', err.message || '照片壓縮失敗，請換一張再試');
      });
  }

  if (cameraTriggerBtn && cameraFileInput) {
    cameraTriggerBtn.addEventListener('click', function() { cameraFileInput.click(); });
    cameraFileInput.addEventListener('change', function(e) {
      handlePhotoFileSelected(e.target.files && e.target.files[0]);
    });
  }

  if (albumTriggerBtn && albumFileInput) {
    albumTriggerBtn.addEventListener('click', function() { albumFileInput.click(); });
    albumFileInput.addEventListener('change', function(e) {
      handlePhotoFileSelected(e.target.files && e.target.files[0]);
    });
  }

  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', function() {
      state.photoBase64 = '';
      state.photoMime = '';
      if (cameraFileInput) cameraFileInput.value = '';
      if (albumFileInput) albumFileInput.value = '';
      photoPreviewBox.style.display = 'none';
      if (uploadBtnGroup) uploadBtnGroup.style.display = 'flex';
    });
  }

  // 4. 描述小幫手邏輯（建議修 10: 學生自訂後不自動覆蓋）
  function updatePromptFromHelper() {
    var subject = (subjectInput.value || '').trim();
    var action = (actionInput.value || '').trim();
    var location = (locationInput.value || '').trim();
    var feeling = (feelingInput.value || '').trim();

    var parts = [];
    if (subject) parts.push(subject);
    if (location) parts.push('在' + location);
    if (action) parts.push(action);
    if (feeling) parts.push('感覺' + feeling);

    if (parts.length > 0) {
      var currentPrompt = (promptTextarea.value || '').trim();
      if (!currentPrompt || state.promptFilledByHelper) {
        promptTextarea.value = parts.join('，') + '。';
        state.promptFilledByHelper = true;
        updateCharCount();
      }
    }
  }

  [subjectInput, actionInput, locationInput, feelingInput].forEach(function(input) {
    if (input) {
      input.addEventListener('input', updatePromptFromHelper);
    }
  });

  function updateCharCount() {
    var len = (promptTextarea.value || '').length;
    charCounter.textContent = len + ' / 300';
    if (len > 300) {
      charCounter.style.color = 'var(--danger)';
    } else {
      charCounter.style.color = 'var(--text-muted)';
    }
  }

  if (promptTextarea) {
    promptTextarea.addEventListener('input', function() {
      state.promptFilledByHelper = false;
      updateCharCount();
    });
  }

  // 靈感按鈕
  var inspirationData = {
    cat: {
      subject: '戴著發光太空帽的橘色小貓',
      action: '輕巧地踩著彩虹滑板在星空穿梭',
      location: '閃爍著粉紫色光芒的銀河宇宙裡',
      feeling: '充滿好奇心與歡樂活潑的童趣氛圍'
    },
    owl: {
      subject: '戴眼鏡的聰明魔法小貓頭鷹',
      action: '用發光的金羽毛筆專注寫魔法書',
      location: '開滿發光七彩花朵的森林巨木樹屋上',
      feeling: '溫暖祥和、奇幻又充滿智慧的光景'
    },
    dolphin: {
      subject: '會發出金黃色微光的小海豚',
      action: '高高躍過彩虹般的七彩珊瑚礁',
      location: '清澈透亮的水藍色夢幻深海世界',
      feeling: '水波閃耀、充滿活力與開心的笑容'
    }
  };

  document.querySelectorAll('.inspiration-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key = btn.dataset.inspire;
      var data = inspirationData[key];
      if (data) {
        subjectInput.value = data.subject;
        actionInput.value = data.action;
        locationInput.value = data.location;
        feelingInput.value = data.feeling;
        state.promptFilledByHelper = true;
        updatePromptFromHelper();
      }
    });
  });

  // 5. 開始畫圖主流程
  var tipsCycle = [
    'AI 正在想像你的畫面…',
    'AI 正在仔細勾勒輪廓線條…',
    'AI 正在為作品調配明亮色彩…',
    '正在進行細節潤飾與光影修飾…',
    '作品快要完成了，請稍候片刻…'
  ];
  var tipsInterval = null;

  function startLoadingAnimation() {
    state.loading = true;
    refreshStartButton();
    loadingBox.style.display = 'block';
    progressBar.style.width = '10%';
    var tipIdx = 0;
    loadingTips.textContent = tipsCycle[0];

    var progress = 10;
    tipsInterval = setInterval(function() {
      tipIdx = (tipIdx + 1) % tipsCycle.length;
      loadingTips.textContent = tipsCycle[tipIdx];
      if (progress < 88) {
        progress += Math.floor(Math.random() * 15) + 5;
        progressBar.style.width = progress + '%';
      }
    }, 1800);
  }

  function stopLoadingAnimation() {
    if (tipsInterval) clearInterval(tipsInterval);
    progressBar.style.width = '100%';
    setTimeout(function() {
      loadingBox.style.display = 'none';
      state.loading = false;
      refreshStartButton();
    }, 300);
  }

  if (startBtn) {
    startBtn.addEventListener('click', function() {
      hideAlert();

      var prompt = (promptTextarea.value || '').trim();
      if (!prompt) {
        showAlert('warning', '請在上方輸入想讓 AI 畫出的描述喔！');
        promptTextarea.focus();
        return;
      }
      if (prompt.length > 300) {
        showAlert('danger', '描述長度超過 300 字囉，請精簡一下！');
        return;
      }
      if (/[<>]/.test(prompt)) {
        showAlert('danger', '描述中請勿包含 < 或 > 等符號喔！');
        return;
      }
      if (state.mode === 'photo' && !state.photoBase64) {
        showAlert('warning', '照片模式需要先拍照或上傳一張照片喔！');
        return;
      }

      var code = localStorage.getItem('ai_portal_class_code') || '';
      startLoadingAnimation();

      var reqPayload = {
        mode: state.mode,
        style: state.selectedStyle,
        prompt: prompt,
        classCode: code
      };
      if (state.mode === 'photo') {
        reqPayload.image = state.photoBase64;
        reqPayload.imageMime = state.photoMime || 'image/jpeg';
      }

      sendGenerateRequest(reqPayload);
    });
  }

  function sendGenerateRequest(reqPayload) {
    ApiClient.generate(reqPayload).then(function(res) {
      stopLoadingAnimation();

      if (!res.ok) {
        handleGenerateError(res.code, res.message, reqPayload);
        return;
      }

      // 成功生成
      state.busyRetryCount = 0;
      var imgData = res.data;
      var fullImgSrc = 'data:' + (imgData.mime || 'image/png') + ';base64,' + imgData.image;

      state.currentArtwork = {
        src: fullImgSrc,
        mime: imgData.mime || 'image/png',
        style: state.selectedStyle,
        prompt: reqPayload.prompt
      };

      // 顯示大圖與成果卡片
      artworkImage.src = fullImgSrc;
      resultCard.style.display = 'block';
      resultCard.scrollIntoView({ behavior: 'smooth' });

      // 更新今日與裝置額度（建議修 6）
      if (remainingBadge && imgData.remainingToday !== undefined) {
        var devTxt = (imgData.deviceRemaining !== undefined) ? ' ｜ 你還可畫：' + imgData.deviceRemaining + ' 次' : '';
        remainingBadge.textContent = '今日剩餘：' + imgData.remainingToday + ' 次' + devTxt;
      }

      // 加入「這節課的作品」縮圖列
      addToSessionGallery(fullImgSrc);

      // 必修 4：依後端回傳之 cooldownSec 啟動冷卻倒數
      startCooldown(state.cooldownSec);
    });
  }

  // 錯誤處理與畫面反應（符合 PLAN.md 3-4）
  function handleGenerateError(code, customMessage, retryPayload) {
    var friendlyMsg = customMessage || ApiClient.ERROR_MESSAGES[code] || 'AI 暫時忙不過來，稍後再試！';

    switch (code) {
      case 'BUSY':
        if (state.busyRetryCount < 3) {
          state.busyRetryCount++;
          state.retryPending = true;
          refreshStartButton();
          var waitSec = 5;
          showAlert('warning', '目前排隊人數較多，' + waitSec + ' 秒後自動重試（第 ' + state.busyRetryCount + ' / 3 次）…');
          var retryInterval = setInterval(function() {
            waitSec--;
            if (waitSec <= 0) {
              clearInterval(retryInterval);
              state.retryPending = false;
              startLoadingAnimation();
              sendGenerateRequest(retryPayload);
            } else {
              showAlert('warning', '目前排隊人數較多，' + waitSec + ' 秒後自動重試（第 ' + state.busyRetryCount + ' / 3 次）…');
            }
          }, 1000);
        } else {
          state.busyRetryCount = 0;
          state.retryPending = false;
          refreshStartButton();
          showAlert('danger', '目前排隊人數過多，請稍等片刻後再按一次畫圖按鈕。');
        }
        break;

      case 'COOLDOWN':
        var matchSec = friendlyMsg.match(/(\d+)\s*秒/);
        var sec = matchSec ? parseInt(matchSec[1], 10) : state.cooldownSec;
        startCooldown(sec);
        showAlert('warning', friendlyMsg);
        break;

      case 'BAD_CODE':
        showAlert('danger', friendlyMsg);
        if (classCodeCard) classCodeCard.style.display = 'block';
        if (mainWorkspace) mainWorkspace.style.display = 'none';
        break;

      case 'DEVICE_BLOCKED':
        state.deviceBlocked = true;
        refreshStartButton();
        showAlert('danger', friendlyMsg);
        break;

      case 'CLOSED':
        state.serverOpen = false;
        refreshStartButton();
        showAlert('danger', friendlyMsg);
        break;

      case 'DAILY_LIMIT':
      case 'DEVICE_LIMIT':
      case 'BLOCKED_PROMPT':
      case 'SAFETY_BLOCKED':
      case 'BAD_REQUEST':
      case 'PROVIDER_ERROR':
      default:
        showAlert('danger', friendlyMsg);
        break;
    }
  }

  // 必修 2：冷卻倒數與按鈕狀態綁定
  function startCooldown(seconds) {
    if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    state.cooldownRemaining = seconds;
    refreshStartButton();

    if (seconds <= 0) return;

    state.cooldownTimer = setInterval(function() {
      state.cooldownRemaining--;
      if (state.cooldownRemaining <= 0) {
        clearInterval(state.cooldownTimer);
        state.cooldownTimer = null;
        state.cooldownRemaining = 0;
      }
      refreshStartButton();
    }, 1000);
  }

  // 6. 下載作品（帶浮水印）
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      if (!state.currentArtwork) return;
      var filename = '我的AI畫作_' + Date.now() + '.png';
      ImageHelper.downloadWithWatermark(state.currentArtwork.src, state.currentArtwork.mime, filename)
        .then(function() {
          showAlert('warning', '作品已下載完成！右下角標有「AI 生成」字樣。');
        });
    });
  }

  // 再畫一張
  if (restartBtn) {
    restartBtn.addEventListener('click', function() {
      resultCard.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 7. 本節課的作品縮圖列
  function addToSessionGallery(src) {
    state.sessionGallery.unshift(src);
    renderGallery();
  }

  function renderGallery() {
    if (!galleryStrip) return;
    galleryStrip.innerHTML = '';
    state.sessionGallery.forEach(function(src, idx) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = '作品 ' + (idx + 1);
      img.className = 'gallery-thumb' + (idx === 0 ? ' active' : '');
      img.addEventListener('click', function() {
        document.querySelectorAll('.gallery-thumb').forEach(function(t) { t.classList.remove('active'); });
        img.classList.add('active');
        artworkImage.src = src;
        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth' });
      });
      galleryStrip.appendChild(img);
    });
  }

  // 友善警告橫幅控制
  function showAlert(type, message) {
    if (!alertBox || !alertText) return;
    alertBox.className = 'alert-box ' + (type === 'danger' ? 'danger' : 'warning');
    alertIcon.textContent = type === 'danger' ? '⚠️' : '💡';
    alertText.textContent = message;
    alertBox.style.display = 'flex';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  // 執行初次狀態檢查並啟動定時輪詢
  checkStatus();
  startStatusAutoPolling();

  // 檢查 URL 參數以輔助測試模式（如 ?mock=CODE 或 ?mode=photo）
  var urlParams = new URLSearchParams(window.location.search);
  var requestedMode = urlParams.get('mode');
  if (requestedMode === 'photo') {
    switchMode('photo');
    if (ApiClient.isMockMode() && !state.photoBase64) {
      var sampleB64 = ImageHelper.generateMockImageBase64('照片模式範例', '書桌上的彩色小玩偶', 400);
      state.photoBase64 = sampleB64;
      state.photoMime = 'image/png';
      photoPreviewImg.src = 'data:image/png;base64,' + sampleB64;
      photoPreviewBox.style.display = 'inline-block';
      if (uploadBtnGroup) uploadBtnGroup.style.display = 'none';
      if (promptTextarea && !promptTextarea.value) {
        promptTextarea.value = '把我的小玩偶變成 3D 動畫風的探險家！';
        updateCharCount();
      }
    }
  }

  var mockCode = ApiClient.getMockErrorCode();
  if (mockCode) {
    if (mockCode === 'CLOSED') {
      showAlert('danger', ApiClient.ERROR_MESSAGES.CLOSED);
      statusLight.className = 'status-indicator closed';
      statusLight.textContent = '🔴 尚未開放';
      state.serverOpen = false;
      refreshStartButton();
    } else if (mockCode === 'DAILY_LIMIT') {
      showAlert('danger', ApiClient.ERROR_MESSAGES.DAILY_LIMIT);
      if (remainingBadge) remainingBadge.textContent = '今日剩餘：0 次 ｜ 你還可畫：0 次';
      state.serverOpen = false;
      refreshStartButton();
    } else if (mockCode === 'DEVICE_LIMIT') {
      showAlert('danger', ApiClient.ERROR_MESSAGES.DEVICE_LIMIT);
      if (remainingBadge) remainingBadge.textContent = '今日剩餘：全班 180 次 ｜ 你還可畫：0 次';
      state.serverOpen = false;
      refreshStartButton();
    } else if (mockCode === 'COOLDOWN') {
      handleGenerateError('COOLDOWN', ApiClient.ERROR_MESSAGES.COOLDOWN.replace('{n}', '20'));
    } else if (mockCode === 'BUSY') {
      handleGenerateError('BUSY', ApiClient.ERROR_MESSAGES.BUSY, {});
    } else if (mockCode === 'BAD_CODE') {
      handleGenerateError('BAD_CODE', ApiClient.ERROR_MESSAGES.BAD_CODE);
    } else if (mockCode === 'DEVICE_BLOCKED') {
      handleGenerateError('DEVICE_BLOCKED', ApiClient.ERROR_MESSAGES.DEVICE_BLOCKED);
    } else if (mockCode === 'BLOCKED_PROMPT') {
      promptTextarea.value = '一把發光的手槍';
      updateCharCount();
      handleGenerateError('BLOCKED_PROMPT', ApiClient.ERROR_MESSAGES.BLOCKED_PROMPT);
    } else if (mockCode === 'SAFETY_BLOCKED') {
      promptTextarea.value = '奇幻冒險角色';
      updateCharCount();
      handleGenerateError('SAFETY_BLOCKED', ApiClient.ERROR_MESSAGES.SAFETY_BLOCKED);
    } else if (ApiClient.ERROR_MESSAGES[mockCode]) {
      handleGenerateError(mockCode, ApiClient.ERROR_MESSAGES[mockCode]);
    }
  }
});
