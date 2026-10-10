// site/assets/app.js — 學生生圖介面互動邏輯（含年段分級）

document.addEventListener('DOMContentLoaded', function() {
  // 核心狀態
  var state = {
    level: null, // 'middle' | 'upper' | 'junior'
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
    juniorStructureOpen: true,
    currentTemplate: null,
    overrides: {},
    statusTimer: null,
    sessionGallery: [], // 僅存於記憶體，重新整理即消失
    currentArtwork: null
  };

  // 常見色碼與編號對照（規格 5-3）
  var SEG_COLOR_MAP = {
    subject: '#FFD43B',
    action: '#8CE99A',
    setting: '#74C0FC',
    composition: '#FFA8A8',
    lighting: '#FFA94D',
    material: '#E599F7',
    style: '#B197FC',
    constraints: '#ADB5BD'
  };

  var SEG_NUM_MAP = {
    subject: '①',
    action: '②',
    setting: '③',
    composition: '④',
    lighting: '⑤',
    material: '⑥',
    style: '⑦',
    constraints: '⑧'
  };

  // DOM 元素引用
  var mockBanner = document.getElementById('mockBanner');
  var siteTitle = document.getElementById('siteTitle');
  var schoolName = document.getElementById('schoolName');
  var statusLight = document.getElementById('statusLight');
  var remainingBadge = document.getElementById('remainingBadge');
  var levelNavBadge = document.getElementById('levelNavBadge');
  var currentLevelName = document.getElementById('currentLevelName');
  var changeLevelBtn = document.getElementById('changeLevelBtn');
  var levelPickerSection = document.getElementById('levelPickerSection');
  var classCodeCard = document.getElementById('classCodeCard');
  var classCodeInput = document.getElementById('classCodeInput');
  var classCodeBtn = document.getElementById('classCodeBtn');
  var classCodeNotice = document.getElementById('classCodeNotice');
  var mainWorkspace = document.getElementById('mainWorkspace');
  var modeTextBtn = document.getElementById('modeTextBtn');
  var modePhotoBtn = document.getElementById('modePhotoBtn');
  var photoSection = document.getElementById('photoSection');
  var photoInputHint = document.getElementById('photoInputHint');
  var cameraFileInput = document.getElementById('cameraFileInput');
  var albumFileInput = document.getElementById('albumFileInput');
  var cameraTriggerBtn = document.getElementById('cameraTriggerBtn');
  var albumTriggerBtn = document.getElementById('albumTriggerBtn');
  var uploadBtnGroup = document.getElementById('uploadBtnGroup');
  var photoPreviewBox = document.getElementById('photoPreviewBox');
  var photoPreviewImg = document.getElementById('photoPreviewImg');
  var removePhotoBtn = document.getElementById('removePhotoBtn');
  var stylesGrid = document.getElementById('stylesGrid');
  var styleNote = document.getElementById('styleNote');

  // 年段專屬工作區容器
  var middleWorkspace = document.getElementById('middleWorkspace');
  var middleTemplatesGrid = document.getElementById('middleTemplatesGrid');
  var middleSlotsContainer = document.getElementById('middleSlotsContainer');
  var middleSentencePreview = document.getElementById('middleSentencePreview');

  var upperWorkspace = document.getElementById('upperWorkspace');
  var upperTemplatesGrid = document.getElementById('upperTemplatesGrid');
  var upperBlanksContainer = document.getElementById('upperBlanksContainer');
  var upperExtrasContainer = document.getElementById('upperExtrasContainer');

  var juniorWorkspace = document.getElementById('juniorWorkspace');
  var juniorStructureToggle = document.getElementById('juniorStructureToggle');
  var juniorToggleBtn = document.getElementById('juniorToggleBtn');
  var juniorStructureBody = document.getElementById('juniorStructureBody');
  var juniorBlocksRow = document.getElementById('juniorBlocksRow');
  var juniorTemplatesGrid = document.getElementById('juniorTemplatesGrid');
  var juniorSegmentsContainer = document.getElementById('juniorSegmentsContainer');
  var juniorPreviewBox = document.getElementById('juniorPreviewBox');

  var promptAreaWrapper = document.getElementById('promptAreaWrapper');
  var promptTextarea = document.getElementById('promptTextarea');
  var charCounter = document.getElementById('charCounter');
  var rebuildFromBlanksBtn = document.getElementById('rebuildFromBlanksBtn');
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

  // 按鈕可按狀態與文字提示
  function refreshStartButton() {
    if (!startBtn) return;
    var canPress = state.serverOpen &&
                   !state.loading &&
                   state.cooldownRemaining <= 0 &&
                   !state.retryPending &&
                   !state.deviceBlocked;

    startBtn.disabled = !canPress;

    if (state.loading) {
      startBtn.classList.remove('wait');
      startBtn.textContent = 'AI 正在畫…';
    } else if (state.retryPending) {
      startBtn.classList.remove('wait');
      startBtn.textContent = '排隊等待自動重試中…';
    } else if (state.cooldownRemaining > 0) {
      startBtn.classList.add('wait');
      startBtn.textContent = '休息一下，還有 ' + state.cooldownRemaining + ' 秒';
    } else if (!state.serverOpen) {
      startBtn.classList.remove('wait');
      startBtn.textContent = '還沒開放';
    } else if (state.deviceBlocked) {
      startBtn.classList.remove('wait');
      startBtn.textContent = '請找老師協助';
    } else {
      startBtn.classList.remove('wait');
      startBtn.textContent = '開始畫！';
    }
  }

  // 取得風格物件
  function getStyleObj(styleId) {
    var found = ApiClient.STYLES.find(function(s) { return s.id === styleId; });
    if (found) return found;
    return { id: styleId, label: styleId };
  }

  // 渲染當前年段允許之風格卡片
  function renderStylesForCurrentLevel() {
    if (!stylesGrid) return;
    stylesGrid.innerHTML = '';
    var allowedIds = (state.level && LEVELS[state.level]) ? LEVELS[state.level].styles : ['free', 'crayon', 'watercolor', 'pixar', 'anime', 'popart', 'chibi', 'cyberpunk'];

    if (allowedIds.indexOf(state.selectedStyle) === -1) {
      state.selectedStyle = (state.level === 'junior') ? 'free' : allowedIds[0];
    }

    allowedIds.forEach(function(id) {
      var s = getStyleObj(id);
      var card = document.createElement('div');
      card.className = 'style-card' + (s.id === state.selectedStyle ? ' selected' : '');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      var cleanLabel = (s.label || s.id).replace(/\p{Extended_Pictographic}️?/gu, '').trim();
      card.setAttribute('aria-label', cleanLabel);
      card.dataset.styleId = s.id;

      var nameDiv = document.createElement('div');
      nameDiv.className = 'style-name';
      nameDiv.textContent = cleanLabel;

      card.appendChild(nameDiv);

      function selectCard() {
        document.querySelectorAll('.style-card').forEach(function(c) {
          c.classList.remove('selected');
        });
        card.classList.add('selected');
        state.selectedStyle = s.id;
        onStyleChanged();
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

    onStyleChanged();
  }

  // 風格更換時的連動
  function onStyleChanged() {
    if (state.level === 'junior') {
      if (styleNote) {
        if (state.selectedStyle === 'free') {
          styleNote.textContent = '選了自訂風格，AI 只聽第 ⑦ 段的風格描述。';
          styleNote.style.display = 'block';
        } else {
          styleNote.textContent = '';
          styleNote.style.display = 'none';
        }
      }
      updateJuniorStyleConflict();
    } else {
      if (styleNote) styleNote.style.display = 'none';
    }
  }

  function updateJuniorStyleConflict() {
    var conflictEl = document.getElementById('segConflictStyle');
    if (!conflictEl) return;
    if (state.selectedStyle !== 'free') {
      var styleObj = getStyleObj(state.selectedStyle);
      var cleanLabel = (styleObj.label || state.selectedStyle).replace(/\p{Extended_Pictographic}️?/gu, '').trim();
      conflictEl.textContent = '你已經選了『' + cleanLabel + '』卡片，⑦ 跟卡片同時存在時，兩個都會送給 AI，可能互相打架。';
      conflictEl.style.display = 'block';
    } else {
      conflictEl.textContent = '';
      conflictEl.style.display = 'none';
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

      if (data.cooldownSec !== undefined) {
        state.cooldownSec = data.cooldownSec;
      }

      if (!data.open) {
        state.serverOpen = false;
        statusLight.className = 'status-indicator closed';
        statusLight.textContent = '還沒開放';
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
        statusLight.textContent = '開放中' + openUntilText;
      }

      if (remainingBadge) {
        var devRemaining = (data.deviceRemaining !== undefined) ? data.deviceRemaining : data.remainingToday;
        remainingBadge.textContent = '你今天還可以畫 ' + devRemaining + ' 張';
        if (data.remainingToday !== undefined) {
          remainingBadge.title = '全班今日剩餘：' + data.remainingToday + ' 張';
        }
      }

      if (data.needCode && (!savedCode || data.codeOk === false)) {
        if (classCodeCard) classCodeCard.style.display = 'block';
        if (mainWorkspace) mainWorkspace.style.display = 'none';
        if (levelPickerSection) levelPickerSection.style.display = 'none';
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
        if (!state.level) {
          showLevelPicker();
        } else {
          if (mainWorkspace) mainWorkspace.style.display = 'block';
        }
      }

      if (data.mode && data.mode.photo === false) {
        if (modePhotoBtn) modePhotoBtn.style.display = 'none';
        switchMode('text');
      }

      renderStylesForCurrentLevel();
      refreshStartButton();
    });
  }

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

  // 切換畫圖模式（文字／照片）
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

  // 照片上傳與拍照處理
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

  // 字數計數器更新
  function updateCharCount() {
    var maxLen = (state.level && LEVELS[state.level]) ? LEVELS[state.level].maxLength : 600;
    var len = (promptTextarea.value || '').length;
    charCounter.textContent = len + ' / ' + maxLen;
    if (len > maxLen) {
      charCounter.style.color = 'var(--danger)';
    } else {
      charCounter.style.color = 'var(--text-muted)';
    }
  }

  if (promptTextarea) {
    promptTextarea.addEventListener('input', function() {
      if (state.level === 'upper') {
        state.promptFilledByHelper = false;
        if (rebuildFromBlanksBtn) rebuildFromBlanksBtn.style.display = 'inline-block';
      }
      updateCharCount();
    });
  }

  if (rebuildFromBlanksBtn) {
    rebuildFromBlanksBtn.addEventListener('click', function() {
      if (state.level === 'upper' && state.currentTemplate) {
        promptTextarea.value = LevelsUtil.assemble('upper', state.currentTemplate, state.overrides);
        state.promptFilledByHelper = true;
        rebuildFromBlanksBtn.style.display = 'none';
        updateCharCount();
      }
    });
  }

  // =========================================================
  // 年段切換機制（規格 1-1）
  // =========================================================
  function showLevelPicker() {
    state.level = null;
    if (mainWorkspace) mainWorkspace.style.display = 'none';
    if (levelPickerSection) levelPickerSection.style.display = 'block';
    if (levelNavBadge) levelNavBadge.style.display = 'none';
  }

  function changeLevel() {
    localStorage.removeItem('ai_portal_level');
    var u = new URL(window.location.href);
    u.searchParams.delete('level');
    window.history.replaceState({}, '', u.toString());
    showLevelPicker();
  }

  if (changeLevelBtn) {
    changeLevelBtn.addEventListener('click', changeLevel);
  }

  // 綁定年段選擇卡片點擊
  document.querySelectorAll('.level-card').forEach(function(card) {
    function pick() {
      var lvl = card.dataset.level;
      if (lvl && LEVELS[lvl]) {
        applyLevel(lvl);
      }
    }
    card.addEventListener('click', pick);
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
  });

  function applyLevel(levelId) {
    var L = LEVELS[levelId];
    if (!L) return;

    state.level = levelId;
    localStorage.setItem('ai_portal_level', levelId);

    var u = new URL(window.location.href);
    u.searchParams.set('level', levelId);
    window.history.replaceState({}, '', u.toString());

    if (currentLevelName) currentLevelName.textContent = L.name;
    if (levelNavBadge) levelNavBadge.style.display = 'inline-flex';
    if (levelPickerSection) levelPickerSection.style.display = 'none';
    if (mainWorkspace) mainWorkspace.style.display = 'block';

    if (promptTextarea) {
      promptTextarea.setAttribute('maxlength', String(L.maxLength));
    }

    // 依年段顯示對應的工作區
    if (middleWorkspace) middleWorkspace.style.display = (levelId === 'middle') ? 'block' : 'none';
    if (upperWorkspace) upperWorkspace.style.display = (levelId === 'upper') ? 'block' : 'none';
    if (juniorWorkspace) juniorWorkspace.style.display = (levelId === 'junior') ? 'block' : 'none';

    // 中年級不顯示大文字框
    if (promptAreaWrapper) {
      promptAreaWrapper.style.display = (levelId === 'middle') ? 'none' : 'block';
    }

    if (photoInputHint) photoInputHint.style.display = 'none';

    renderStylesForCurrentLevel();

    if (levelId === 'middle') {
      initMiddleUI();
    } else if (levelId === 'upper') {
      initUpperUI();
    } else if (levelId === 'junior') {
      initJuniorUI();
    }

    refreshStartButton();
  }

  function initLevel() {
    var params = new URLSearchParams(window.location.search);
    var urlLevel = params.get('level');
    var storedLevel = localStorage.getItem('ai_portal_level');

    if (urlLevel && LEVELS[urlLevel]) {
      applyLevel(urlLevel);
    } else if (storedLevel && LEVELS[storedLevel]) {
      applyLevel(storedLevel);
    } else {
      showLevelPicker();
    }
  }

  // =========================================================
  // 中年級介面（規格 3）
  // =========================================================
  function initMiddleUI() {
    var L = LEVELS.middle;
    state.overrides = {};

    // 1. 故事卡渲染
    if (middleTemplatesGrid) {
      middleTemplatesGrid.innerHTML = '';
      L.templates.forEach(function(tpl, idx) {
        var card = document.createElement('div');
        card.className = 'template-card' + (idx === 0 ? ' selected' : '');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.dataset.templateId = tpl.id;

        var tTitle = document.createElement('div');
        tTitle.className = 'template-title';
        tTitle.textContent = tpl.title;
        card.appendChild(tTitle);

        function selectStory() {
          document.querySelectorAll('#middleTemplatesGrid .template-card').forEach(function(c) {
            c.classList.remove('selected');
          });
          card.classList.add('selected');
          applyMiddleStory(tpl);
        }

        card.addEventListener('click', selectStory);
        card.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectStory();
          }
        });

        middleTemplatesGrid.appendChild(card);
      });
    }

    // 2. 四排詞卡渲染
    if (middleSlotsContainer) {
      middleSlotsContainer.innerHTML = '';
      L.slots.forEach(function(slot) {
        var row = document.createElement('div');
        row.className = 'slot-row';
        row.dataset.slotKey = slot.key;

        var label = document.createElement('div');
        label.className = 'slot-row-label';
        label.textContent = slot.label;
        row.appendChild(label);

        var chipsWrap = document.createElement('div');
        chipsWrap.className = 'slot-chips-wrap';

        // 預設選項詞卡
        slot.options.forEach(function(opt) {
          var chip = document.createElement('span');
          chip.className = 'word-chip';
          chip.textContent = opt;
          chip.dataset.slotKey = slot.key;
          chip.dataset.value = opt;

          chip.addEventListener('click', function() {
            chipsWrap.querySelectorAll('.word-chip').forEach(function(c) {
              c.classList.remove('selected');
            });
            chip.classList.add('selected');
            var customInput = chipsWrap.querySelector('.word-custom-input');
            if (customInput) customInput.value = '';
            state.overrides[slot.key] = opt;
            updateMiddleSentence();
          });

          chipsWrap.appendChild(chip);
        });

        // 每排最後一張「自己寫」輸入框
        var customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'word-custom-input';
        customInput.maxLength = 10;
        customInput.placeholder = '自己寫';
        customInput.setAttribute('aria-label', slot.label + ' 自訂輸入');

        customInput.addEventListener('input', function() {
          var val = customInput.value.trim();
          chipsWrap.querySelectorAll('.word-chip').forEach(function(c) {
            c.classList.remove('selected');
          });
          state.overrides[slot.key] = val;
          updateMiddleSentence();
        });

        customInput.addEventListener('focus', function() {
          chipsWrap.querySelectorAll('.word-chip').forEach(function(c) {
            c.classList.remove('selected');
          });
          if (customInput.value.trim()) {
            state.overrides[slot.key] = customInput.value.trim();
            updateMiddleSentence();
          }
        });

        chipsWrap.appendChild(customInput);
        row.appendChild(chipsWrap);
        middleSlotsContainer.appendChild(row);
      });
    }

    applyMiddleStory(L.templates[0]);
  }

  function applyMiddleStory(tpl) {
    state.currentTemplate = tpl;
    state.overrides = {};
    for (var k in tpl.values) {
      state.overrides[k] = tpl.values[k];
    }

    // 更新風格
    if (tpl.style) {
      state.selectedStyle = tpl.style;
      renderStylesForCurrentLevel();
    }

    // 更新詞卡選中狀態
    if (middleSlotsContainer) {
      middleSlotsContainer.querySelectorAll('.slot-row').forEach(function(row) {
        var key = row.dataset.slotKey;
        var targetVal = state.overrides[key];
        var foundChip = false;

        row.querySelectorAll('.word-chip').forEach(function(chip) {
          if (chip.dataset.value === targetVal) {
            chip.classList.add('selected');
            foundChip = true;
          } else {
            chip.classList.remove('selected');
          }
        });

        var customInput = row.querySelector('.word-custom-input');
        if (customInput) {
          if (!foundChip && targetVal) {
            customInput.value = targetVal;
          } else {
            customInput.value = '';
          }
        }
      });
    }

    updateMiddleSentence();
  }

  function updateMiddleSentence() {
    if (!state.currentTemplate) return;
    var sentence = LevelsUtil.assemble('middle', state.currentTemplate, state.overrides);
    if (middleSentencePreview) {
      middleSentencePreview.textContent = sentence;
    }
    if (promptTextarea) {
      promptTextarea.value = sentence;
      updateCharCount();
    }
  }

  // =========================================================
  // 高年級介面（規格 4）
  // =========================================================
  function initUpperUI() {
    var L = LEVELS.upper;
    state.overrides = { extras: [] };
    state.promptFilledByHelper = true;

    // 1. 範本卡網格渲染
    if (upperTemplatesGrid) {
      upperTemplatesGrid.innerHTML = '';
      L.templates.forEach(function(tpl, idx) {
        var card = document.createElement('div');
        card.className = 'template-card' + (idx === 0 ? ' selected' : '');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        var title = document.createElement('div');
        title.className = 'template-title';
        title.textContent = tpl.title;
        card.appendChild(title);

        if (tpl.tip) {
          var tip = document.createElement('div');
          tip.className = 'template-tip';
          tip.textContent = tpl.tip;
          card.appendChild(tip);
        }

        function selectTemplate() {
          document.querySelectorAll('#upperTemplatesGrid .template-card').forEach(function(c) {
            c.classList.remove('selected');
          });
          card.classList.add('selected');
          applyUpperTemplate(tpl);
        }

        card.addEventListener('click', selectTemplate);
        card.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectTemplate();
          }
        });

        upperTemplatesGrid.appendChild(card);
      });
    }

    // 2. 加一點細節詞卡渲染
    if (upperExtrasContainer) {
      upperExtrasContainer.innerHTML = '';
      L.extras.forEach(function(extra) {
        var chip = document.createElement('span');
        chip.className = 'extra-chip';
        chip.textContent = extra;

        chip.addEventListener('click', function() {
          var arr = state.overrides.extras || [];
          var pos = arr.indexOf(extra);
          if (pos === -1) {
            arr.push(extra);
            chip.classList.add('selected');
          } else {
            arr.splice(pos, 1);
            chip.classList.remove('selected');
          }
          state.overrides.extras = arr;
          if (state.promptFilledByHelper) {
            promptTextarea.value = LevelsUtil.assemble('upper', state.currentTemplate, state.overrides);
            updateCharCount();
          }
        });

        upperExtrasContainer.appendChild(chip);
      });
    }

    applyUpperTemplate(L.templates[0]);
  }

  function applyUpperTemplate(tpl) {
    state.currentTemplate = tpl;
    state.overrides = { extras: [] };
    state.promptFilledByHelper = true;

    if (rebuildFromBlanksBtn) rebuildFromBlanksBtn.style.display = 'none';

    if (tpl.style) {
      state.selectedStyle = tpl.style;
      renderStylesForCurrentLevel();
    }
    switchMode(tpl.mode || 'text');

    // 清除細節詞卡選中狀態
    if (upperExtrasContainer) {
      upperExtrasContainer.querySelectorAll('.extra-chip').forEach(function(c) {
        c.classList.remove('selected');
      });
    }

    // 渲染填空欄位
    if (upperBlanksContainer) {
      upperBlanksContainer.innerHTML = '';
      tpl.blanks.forEach(function(b) {
        var item = document.createElement('div');
        item.className = 'upper-blank-item';

        var bLabel = document.createElement('span');
        bLabel.className = 'upper-blank-label';
        bLabel.textContent = b.label;
        item.appendChild(bLabel);

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'blank-input';
        input.value = b.value;
        input.setAttribute('aria-label', b.label);

        state.overrides[b.key] = b.value;

        input.addEventListener('input', function() {
          state.overrides[b.key] = input.value;
          if (state.promptFilledByHelper) {
            promptTextarea.value = LevelsUtil.assemble('upper', state.currentTemplate, state.overrides);
            updateCharCount();
          }
        });

        item.appendChild(input);
        upperBlanksContainer.appendChild(item);
      });
    }

    promptTextarea.value = LevelsUtil.assemble('upper', tpl, state.overrides);
    updateCharCount();
  }

  // =========================================================
  // 國中介面（規格 5）★ 本次重點
  // =========================================================
  function initJuniorUI() {
    var L = LEVELS.junior;
    state.overrides = {};

    // 1. 架構說明小方塊渲染
    if (juniorBlocksRow) {
      juniorBlocksRow.innerHTML = '';
      L.segments.forEach(function(seg) {
        var block = document.createElement('div');
        block.className = 'junior-block-item';
        block.textContent = SEG_NUM_MAP[seg.key] + ' ' + seg.label;
        block.style.backgroundColor = SEG_COLOR_MAP[seg.key] || '#FFD43B';
        juniorBlocksRow.appendChild(block);
      });
    }

    // 架構說明收合切換
    if (juniorStructureToggle && juniorToggleBtn) {
      function toggleGuide() {
        state.juniorStructureOpen = !state.juniorStructureOpen;
        if (juniorStructureBody) {
          juniorStructureBody.style.display = state.juniorStructureOpen ? 'block' : 'none';
        }
        juniorToggleBtn.textContent = state.juniorStructureOpen ? '收合說明' : '展開說明';
      }
      juniorToggleBtn.onclick = toggleGuide;
    }

    // 2. 國中範本卡渲染
    if (juniorTemplatesGrid) {
      juniorTemplatesGrid.innerHTML = '';
      L.templates.forEach(function(tpl, idx) {
        var card = document.createElement('div');
        card.className = 'template-card' + (idx === 0 ? ' selected' : '');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        var title = document.createElement('div');
        title.className = 'template-title';
        title.textContent = tpl.title;
        card.appendChild(title);

        if (tpl.credit) {
          var cred = document.createElement('div');
          cred.className = 'template-credit';
          cred.textContent = tpl.credit;
          card.appendChild(cred);
        }

        function selectJuniorTpl() {
          document.querySelectorAll('#juniorTemplatesGrid .template-card').forEach(function(c) {
            c.classList.remove('selected');
          });
          card.classList.add('selected');
          applyJuniorTemplate(tpl);
        }

        card.addEventListener('click', selectJuniorTpl);
        card.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectJuniorTpl();
          }
        });

        juniorTemplatesGrid.appendChild(card);
      });
    }

    applyJuniorTemplate(L.templates[0]);
  }

  function applyJuniorTemplate(tpl) {
    state.currentTemplate = tpl;
    state.overrides = {};

    switchMode(tpl.mode || 'text');

    if (tpl.mode === 'photo' && tpl.inputHint) {
      if (photoInputHint) {
        photoInputHint.textContent = tpl.inputHint;
        photoInputHint.style.display = 'block';
      }
    } else {
      if (photoInputHint) photoInputHint.style.display = 'none';
    }

    // 風格預設設為 free
    state.selectedStyle = tpl.style || 'free';
    renderStylesForCurrentLevel();

    renderJuniorSegments();
    updateJuniorPreview();
  }

  function renderJuniorSegments() {
    if (!juniorSegmentsContainer || !state.currentTemplate) return;
    juniorSegmentsContainer.innerHTML = '';
    var L = LEVELS.junior;

    L.segments.forEach(function(seg) {
      var segKey = seg.key;
      var partData = state.currentTemplate.parts[segKey] || { text: '', note: '' };

      var card = document.createElement('div');
      card.className = 'segment-card seg-' + segKey;
      card.id = 'segmentCard_' + segKey;
      card.dataset.segKey = segKey;

      // 頂部列：段號與名稱、先不要這段勾選框
      var headerRow = document.createElement('div');
      headerRow.className = 'segment-header-row';

      var titleDiv = document.createElement('div');
      titleDiv.className = 'segment-title';

      var colorDot = document.createElement('span');
      colorDot.className = 'segment-color-indicator';
      colorDot.style.backgroundColor = SEG_COLOR_MAP[segKey] || '#FFD43B';
      titleDiv.appendChild(colorDot);

      var titleText = document.createElement('span');
      titleText.textContent = SEG_NUM_MAP[segKey] + ' ' + seg.label;
      titleDiv.appendChild(titleText);
      headerRow.appendChild(titleDiv);

      var skipLabel = document.createElement('label');
      skipLabel.className = 'segment-skip-label';
      var skipCb = document.createElement('input');
      skipCb.type = 'checkbox';
      skipCb.className = 'segment-skip-cb';
      var skipText = document.createElement('span');
      skipText.textContent = '先不要這段';
      skipLabel.appendChild(skipCb);
      skipLabel.appendChild(skipText);
      headerRow.appendChild(skipLabel);
      card.appendChild(headerRow);

      // 問題
      var qDiv = document.createElement('div');
      qDiv.className = 'segment-question';
      qDiv.textContent = seg.question;
      card.appendChild(qDiv);

      // 可編輯文字框
      var textarea = document.createElement('textarea');
      textarea.className = 'segment-textarea';
      textarea.value = partData.text || '';
      textarea.setAttribute('aria-label', seg.label + ' 描述內容');
      card.appendChild(textarea);

      // 這句的效果（note）
      var noteDiv = document.createElement('div');
      noteDiv.className = 'segment-note';
      noteDiv.textContent = '這句的效果：' + (partData.note || '');
      card.appendChild(noteDiv);

      // 這段在做什麼（通用作用，預設收合）
      var effectToggle = document.createElement('div');
      effectToggle.className = 'segment-effect-toggle';
      effectToggle.textContent = '這段在做什麼（通用作用）▾';
      card.appendChild(effectToggle);

      var effectText = document.createElement('div');
      effectText.className = 'segment-effect-text';
      effectText.textContent = seg.effect;
      effectText.style.display = 'none';
      card.appendChild(effectText);

      effectToggle.addEventListener('click', function() {
        var isHidden = effectText.style.display === 'none';
        effectText.style.display = isHidden ? 'block' : 'none';
        effectToggle.textContent = isHidden ? '收起作用說明 ▴' : '這段在做什麼（通用作用）▾';
      });

      // 少了這段會怎樣（勾選不要時顯示）
      var missingDiv = document.createElement('div');
      missingDiv.className = 'segment-missing-text';
      missingDiv.textContent = '少了這段會怎樣：' + seg.ifMissing;
      missingDiv.style.display = 'none';
      card.appendChild(missingDiv);

      // 第 ⑦ 段風格打架提醒容器
      if (segKey === 'style') {
        var conflictDiv = document.createElement('div');
        conflictDiv.className = 'segment-conflict-note';
        conflictDiv.id = 'segConflictStyle';
        conflictDiv.style.display = 'none';
        card.appendChild(conflictDiv);
      }

      // 輸入事件
      textarea.addEventListener('input', function() {
        if (!skipCb.checked) {
          state.overrides[segKey] = textarea.value;
          updateJuniorPreview();
        }
      });

      // 勾選框事件
      skipCb.addEventListener('change', function() {
        if (skipCb.checked) {
          card.classList.add('segment-disabled');
          textarea.disabled = true;
          state.overrides[segKey] = null;
          missingDiv.style.display = 'block';
        } else {
          card.classList.remove('segment-disabled');
          textarea.disabled = false;
          state.overrides[segKey] = textarea.value;
          missingDiv.style.display = 'none';
        }
        updateJuniorPreview();
      });

      // 滑鼠連動
      card.addEventListener('mouseenter', function() {
        highlightJuniorSpan(segKey, true);
      });
      card.addEventListener('mouseleave', function() {
        highlightJuniorSpan(segKey, false);
      });

      juniorSegmentsContainer.appendChild(card);
    });

    updateJuniorStyleConflict();
  }

  function highlightJuniorSpan(segKey, isHighlighted) {
    if (!juniorPreviewBox) return;
    var span = juniorPreviewBox.querySelector('.preview-segment-span[data-seg-key="' + segKey + '"]');
    if (span) {
      if (isHighlighted) {
        span.classList.add('highlighted');
      } else {
        span.classList.remove('highlighted');
      }
    }
  }

  function highlightJuniorCard(segKey, isHighlighted) {
    if (!juniorSegmentsContainer) return;
    var card = document.getElementById('segmentCard_' + segKey);
    if (card) {
      if (isHighlighted) {
        card.classList.add('highlighted');
      } else {
        card.classList.remove('highlighted');
      }
    }
  }

  function updateJuniorPreview() {
    if (!juniorPreviewBox || !state.currentTemplate) return;
    juniorPreviewBox.innerHTML = '';
    var L = LEVELS.junior;

    L.segments.forEach(function(seg) {
      var segKey = seg.key;
      var has = Object.prototype.hasOwnProperty.call(state.overrides, segKey);
      var text = has ? state.overrides[segKey] : (state.currentTemplate.parts[segKey] && state.currentTemplate.parts[segKey].text);

      if (text) {
        var span = document.createElement('span');
        span.className = 'preview-segment-span hl-' + segKey;
        span.dataset.segKey = segKey;
        span.textContent = String(text).trim();

        span.addEventListener('mouseenter', function() {
          highlightJuniorCard(segKey, true);
        });
        span.addEventListener('mouseleave', function() {
          highlightJuniorCard(segKey, false);
        });
        span.addEventListener('click', function() {
          var card = document.getElementById('segmentCard_' + segKey);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        juniorPreviewBox.appendChild(span);
        juniorPreviewBox.appendChild(document.createTextNode(' '));
      }
    });

    var assembled = LevelsUtil.assemble('junior', state.currentTemplate, state.overrides);
    if (promptTextarea) {
      promptTextarea.value = assembled;
      updateCharCount();
    }
  }

  // =========================================================
  // 生圖流程（規格 3-4）
  // =========================================================
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

      var prompt = '';
      if (state.level === 'middle') {
        prompt = LevelsUtil.assemble('middle', state.currentTemplate, state.overrides);
      } else {
        prompt = (promptTextarea.value || '').trim();
      }

      if (!prompt) {
        showAlert('warning', '請在上方輸入想讓 AI 畫出的描述喔！');
        if (state.level !== 'middle' && promptTextarea) promptTextarea.focus();
        return;
      }

      var maxLimit = (state.level && LEVELS[state.level]) ? LEVELS[state.level].maxLength : 600;
      if (prompt.length > maxLimit) {
        showAlert('danger', '描述長度超過 ' + maxLimit + ' 字囉，請精簡一下！');
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
      var artworkLabel = document.getElementById('artworkLabel');
      if (artworkLabel) {
        var labelPrompt = reqPayload.prompt || '';
        if (labelPrompt.length > 16) {
          labelPrompt = labelPrompt.substring(0, 16) + '…';
        }
        var styleName = '';
        var styleObj = getStyleObj(state.selectedStyle);
        if (styleObj && styleObj.label) {
          styleName = styleObj.label.replace(/\p{Extended_Pictographic}️?/gu, '').trim();
        }
        artworkLabel.textContent = '《' + labelPrompt + '》・' + (styleName ? styleName + '・' : '') + 'AI 生成';
      }
      resultCard.style.display = 'block';
      resultCard.scrollIntoView({ behavior: 'smooth' });

      // 更新今日與裝置額度
      if (remainingBadge && imgData.remainingToday !== undefined) {
        var devRem = (imgData.deviceRemaining !== undefined) ? imgData.deviceRemaining : imgData.remainingToday;
        remainingBadge.textContent = '你今天還可以畫 ' + devRem + ' 張';
        remainingBadge.title = '全班今日剩餘：' + imgData.remainingToday + ' 張';
      }

      addToSessionGallery(fullImgSrc);

      // 冷卻倒數
      startCooldown(state.cooldownSec);
    });
  }

  // 錯誤處理
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

  // 冷卻倒數
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

  // 下載作品
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

  // 本節課的作品縮圖列
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
    if (alertIcon) alertIcon.textContent = '';
    alertText.textContent = message;
    alertBox.style.display = 'flex';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  // 啟動程序
  initLevel();
  checkStatus();
  startStatusAutoPolling();

  // 檢查 URL 參數以輔助測試模式
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
    }
  }

  var mockCode = ApiClient.getMockErrorCode();
  if (mockCode) {
    if (mockCode === 'CLOSED') {
      showAlert('danger', ApiClient.ERROR_MESSAGES.CLOSED);
      statusLight.className = 'status-indicator closed';
      statusLight.textContent = '還沒開放';
      state.serverOpen = false;
      refreshStartButton();
    } else if (mockCode === 'DAILY_LIMIT') {
      showAlert('danger', ApiClient.ERROR_MESSAGES.DAILY_LIMIT);
      if (remainingBadge) remainingBadge.textContent = '你今天還可以畫 0 張';
      state.serverOpen = false;
      refreshStartButton();
    } else if (mockCode === 'DEVICE_LIMIT') {
      showAlert('danger', ApiClient.ERROR_MESSAGES.DEVICE_LIMIT);
      if (remainingBadge) {
        remainingBadge.textContent = '你今天還可以畫 0 張';
        remainingBadge.title = '全班今日剩餘：180 張';
      }
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
      if (promptTextarea) promptTextarea.value = '一把發光的手槍';
      updateCharCount();
      handleGenerateError('BLOCKED_PROMPT', ApiClient.ERROR_MESSAGES.BLOCKED_PROMPT);
    } else if (mockCode === 'SAFETY_BLOCKED') {
      if (promptTextarea) promptTextarea.value = '奇幻冒險角色';
      updateCharCount();
      handleGenerateError('SAFETY_BLOCKED', ApiClient.ERROR_MESSAGES.SAFETY_BLOCKED);
    } else if (ApiClient.ERROR_MESSAGES[mockCode]) {
      handleGenerateError(mockCode, ApiClient.ERROR_MESSAGES[mockCode]);
    }
  }
});
