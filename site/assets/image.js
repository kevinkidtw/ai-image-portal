// site/assets/image.js — 圖片前端壓縮、浮水印與下載處理

var ImageHelper = {
  /**
   * 前端壓縮照片成長邊最多 1024px 的 JPEG (品質 0.85)
   * @param {File|Blob} file 學生上傳或拍照的圖片
   * @param {number} [maxDimension=1024]
   * @param {number} [quality=0.85]
   * @returns {Promise<{base64: string, mime: string, dataUrl: string, width: number, height: number}>}
   */
  compressImage: function(file, maxDimension, quality) {
    maxDimension = maxDimension || 1024;
    quality = quality || 0.85;

    return new Promise(function(resolve, reject) {
      if (!file || !file.type.match(/^image\//)) {
        reject(new Error('請選擇有效的圖片檔案！'));
        return;
      }

      var reader = new FileReader();
      reader.onerror = function() {
        reject(new Error('讀取圖片失敗'));
      };
      reader.onload = function(e) {
        var img = new Image();
        img.onerror = function() {
          reject(new Error('解析圖片失敗'));
        };
        img.onload = function() {
          var width = img.width;
          var height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          var mime = 'image/jpeg';
          var dataUrl = canvas.toDataURL(mime, quality);
          var base64 = dataUrl.split(',')[1];

          resolve({
            base64: base64,
            mime: mime,
            dataUrl: dataUrl,
            width: width,
            height: height
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * 在圖片右下角加上「AI 生成」浮水印，並觸發瀏覽器下載
   * @param {string} imageBase64OrDataUrl
   * @param {string} [mime='image/png']
   * @param {string} [filename='ai-drawing.png']
   */
  downloadWithWatermark: function(imageBase64OrDataUrl, mime, filename) {
    mime = mime || 'image/png';
    filename = filename || 'ai-drawing.png';

    var src = imageBase64OrDataUrl.indexOf('data:') === 0
      ? imageBase64OrDataUrl
      : 'data:' + mime + ';base64,' + imageBase64OrDataUrl;

    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = function() {
        reject(new Error('無法載入圖片進行加浮水印'));
      };
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');

        // 1. 繪製原圖
        ctx.drawImage(img, 0, 0);

        // 2. 右下角加上「AI 生成」標示標籤（AI 素養）
        var text = '✦ AI 生成';
        var fontSize = Math.max(14, Math.round(canvas.width * 0.028));
        ctx.font = '600 ' + fontSize + 'px "Noto Sans TC", sans-serif';

        var metrics = ctx.measureText(text);
        var paddingX = Math.round(fontSize * 0.6);
        var paddingY = Math.round(fontSize * 0.4);
        var badgeWidth = metrics.width + paddingX * 2;
        var badgeHeight = fontSize + paddingY * 2;

        var margin = Math.round(fontSize * 0.8);
        var badgeX = canvas.width - badgeWidth - margin;
        var badgeY = canvas.height - badgeHeight - margin;

        // 半透明深色膠囊背景
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        var radius = Math.round(badgeHeight / 2);
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, radius);
        ctx.fill();

        // 浮水印白色文字
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(text, badgeX + paddingX, badgeY + badgeHeight / 2);
        ctx.restore();

        // 3. 匯出並下載
        var downloadUrl = canvas.toDataURL('image/png');
        var link = document.createElement('a');
        link.download = filename;
        link.href = downloadUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve(downloadUrl);
      };
      img.src = src;
    });
  },

  /**
   * 生成 Mock 假圖（純 Canvas 繪製，模擬真實風格與學生提示詞）
   * @param {string} styleName 風格中文標籤
   * @param {string} prompt 學生輸入描述
   * @param {number} [size=768]
   * @returns {string} base64 純字串
   */
  generateMockImageBase64: function(styleName, prompt, size) {
    size = size || 768;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');

    // 依風格選用不同漸層背景色
    var gradient = ctx.createLinearGradient(0, 0, size, size);
    if (styleName.indexOf('3D') !== -1) {
      gradient.addColorStop(0, '#ff9a9e');
      gradient.addColorStop(0.5, '#fecfef');
      gradient.addColorStop(1, '#a1c4fd');
    } else if (styleName.indexOf('水彩') !== -1) {
      gradient.addColorStop(0, '#84fab0');
      gradient.addColorStop(1, '#8fd3f4');
    } else if (styleName.indexOf('科技') !== -1) {
      gradient.addColorStop(0, '#0f2027');
      gradient.addColorStop(0.5, '#203a43');
      gradient.addColorStop(1, '#2c5364');
    } else if (styleName.indexOf('動漫') !== -1 || styleName.indexOf('日系') !== -1) {
      gradient.addColorStop(0, '#fbc2eb');
      gradient.addColorStop(1, '#a6c1ee');
    } else if (styleName.indexOf('普普') !== -1) {
      gradient.addColorStop(0, '#f857a6');
      gradient.addColorStop(1, '#ff5858');
    } else if (styleName.indexOf('Q 版') !== -1) {
      gradient.addColorStop(0, '#ffecd2');
      gradient.addColorStop(1, '#fcb69f');
    } else {
      gradient.addColorStop(0, '#f6d365');
      gradient.addColorStop(1, '#fda085');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // 裝飾圖形
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(size * 0.2, size * 0.25, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(size * 0.8, size * 0.75, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 中央卡片
    var cardMargin = size * 0.08;
    var cardW = size - cardMargin * 2;
    var cardH = size - cardMargin * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.roundRect(cardMargin, cardMargin, cardW, cardH, 24);
    ctx.fill();
    ctx.restore();

    // 內容文字
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 36px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎨 ' + (styleName || '精選風格'), size / 2, cardMargin + 90);

    ctx.fillStyle = '#64748b';
    ctx.font = '22px "Noto Sans TC", sans-serif';
    ctx.fillText('國小學生創意畫作展示 (Mock 模式)', size / 2, cardMargin + 135);

    // 提示詞多行包裝
    ctx.fillStyle = '#334155';
    ctx.font = '24px "Noto Sans TC", sans-serif';
    var textPrompt = '「' + (prompt || '一隻在星空散步的可愛小貓') + '」';
    var maxWidth = cardW - 80;
    var words = textPrompt.split('');
    var line = '';
    var startY = cardMargin + 240;

    for (var n = 0; n < words.length; n++) {
      var testLine = line + words[n];
      var metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, size / 2, startY);
        line = words[n];
        startY += 38;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, size / 2, startY);

    // 底部小標籤
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Noto Sans TC", sans-serif';
    ctx.fillText('模擬生圖預覽效果 • 不消耗伺服器額度', size / 2, cardMargin + cardH - 50);

    var dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
  }
};
