// site/assets/levels.js — 年段資料（規格：說明/改版規格_年段分級.md）
// 純資料加上一個純函式。不准引用 window、document、localStorage（tests/levels.test.js 會在沒有瀏覽器的環境載入）。
// 國中範本改編自 PicoTrex/Awesome-Nano-Banana-images（Apache-2.0），已改寫為適合課堂的內容。

var LEVELS = {
  middle: {
    id: 'middle',
    name: '中年級',
    grades: '3–4 年級',
    maxLength: 120,
    styles: ['crayon', 'watercolor', 'pixar', 'chibi'],
    slots: [
      { key: 'who', label: '主角是誰？', options: ['小貓', '小狗', '恐龍', '兔子', '企鵝', '獨角獸', '機器人', '小熊'] },
      { key: 'where', label: '在哪裡？', options: ['太空', '海底', '森林', '雲朵上', '遊樂園', '海邊', '雪地', '糖果屋'] },
      { key: 'doing', label: '在做什麼？', options: ['吃冰淇淋', '跳舞', '放風箏', '盪鞦韆', '開火車', '看書', '踢足球', '睡午覺'] },
      { key: 'mood', label: '看起來怎麼樣？', options: ['很開心', '很好奇', '很安靜', '很勇敢', '笑嘻嘻', '很驚訝'] }
    ],
    sentence: '{who}在{where}{doing}，看起來{mood}。',
    templates: [
      { id: 'space-picnic', title: '太空野餐', mode: 'text', style: 'pixar',
        values: { who: '企鵝', where: '太空', doing: '吃冰淇淋', mood: '很開心' } },
      { id: 'ocean-concert', title: '海底音樂會', mode: 'text', style: 'crayon',
        values: { who: '小熊', where: '海底', doing: '跳舞', mood: '笑嘻嘻' } },
      { id: 'cloud-adventure', title: '雲上探險', mode: 'text', style: 'watercolor',
        values: { who: '恐龍', where: '雲朵上', doing: '放風箏', mood: '很勇敢' } },
      { id: 'forest-library', title: '森林圖書館', mode: 'text', style: 'chibi',
        values: { who: '兔子', where: '森林', doing: '看書', mood: '很安靜' } }
    ]
  },

  upper: {
    id: 'upper',
    name: '高年級',
    grades: '5–6 年級',
    maxLength: 300,
    styles: ['crayon', 'watercolor', 'pixar', 'anime', 'popart', 'chibi', 'cyberpunk', 'free'],
    extras: ['天上有很多星星', '飄著櫻花花瓣', '遠處有一道彩虹', '旁邊有小動物朋友', '正在下毛毛雨', '地上有很多落葉'],
    templates: [
      { id: 'picture-book', title: '繪本封面', mode: 'text', style: 'watercolor',
        tip: '主角加一個「外觀特色」，例如顏色或配件，AI 就不會亂猜。',
        text: '一本兒童繪本的封面：{who}正在{doing}，背景是{where}。畫面溫暖可愛，上方留一塊空白位置放書名。',
        blanks: [
          { key: 'who', label: '主角', value: '戴紅色圍巾的小狐狸' },
          { key: 'doing', label: '在做什麼', value: '在森林小路上撿橡果' },
          { key: 'where', label: '背景', value: '秋天的楓樹林' }
        ] },
      { id: 'postcard', title: '風景明信片', mode: 'text', style: 'watercolor',
        tip: '把畫面分成「前景、背景、天空」，畫面會更有層次。',
        text: '一張手繪風景明信片：{scene}，前景有{who}，天空是{sky}，像旅行時寄給朋友的紀念品。',
        blanks: [
          { key: 'scene', label: '風景', value: '夕陽下的海邊小鎮' },
          { key: 'who', label: '前景', value: '一隻在堤防上散步的貓' },
          { key: 'sky', label: '天空', value: '粉紅色和橘色的晚霞' }
        ] },
      { id: 'plush', title: '毛絨玩偶', mode: 'text', style: 'free',
        tip: '「全身覆蓋細細的絨毛」是讓東西變毛絨的關鍵句，拿掉看看會怎樣。',
        text: '把{thing}做成柔軟蓬鬆的毛絨玩偶，全身覆蓋細細的絨毛，放在乾淨的淺灰色背景正中央，光線柔和，看起來很想抱一下。',
        blanks: [
          { key: 'thing', label: '要變成玩偶的東西', value: '一顆藍色的地球' }
        ] },
      { id: 'chalkboard', title: '黑板粉筆畫', mode: 'text', style: 'free',
        tip: '說明「從哪裡看過去」，畫面會更像真的照片。',
        text: '教室黑板上的彩色粉筆畫，畫的是{what}，旁邊還畫了{deco}當裝飾，從教室座位斜斜地看過去。',
        blanks: [
          { key: 'what', label: '畫的內容', value: '一群在雨中撐傘的青蛙' },
          { key: 'deco', label: '裝飾', value: '小花和雲朵' }
        ] },
      { id: 'four-seasons', title: '四季接力', mode: 'text', style: 'watercolor',
        tip: '寫「沒有明顯的分界線」，AI 才不會切成四格。',
        text: '一幅橫長的風景畫，畫的是{place}。畫面從左到右慢慢變成冬天、春天、夏天、秋天，季節之間自然融合，沒有明顯的分界線。',
        blanks: [
          { key: 'place', label: '地點', value: '我家附近的公園' }
        ] },
      { id: 'mini-room', title: '迷你房間', mode: 'text', style: 'chibi',
        tip: '列出房間裡的「具體物品」，房間才不會空空的。',
        text: '一個像玩具模型的迷你房間，裝在一個切開的透明方塊裡。房間裡是{room}，有一個 Q 版小人正在{doing}，燈光暖暖的。',
        blanks: [
          { key: 'room', label: '房間裡有什麼', value: '堆滿書和植物的閱讀角落' },
          { key: 'doing', label: '小人在做什麼', value: '趴在地毯上看書' }
        ] }
    ]
  },

  junior: {
    id: 'junior',
    name: '國中',
    grades: '7–9 年級',
    maxLength: 600,
    styles: ['free', 'crayon', 'watercolor', 'pixar', 'anime', 'popart', 'chibi', 'cyberpunk'],
    segments: [
      { key: 'subject', label: '主體', question: '畫面的主角是什麼？長什麼樣子？',
        effect: '決定 AI 畫「誰」。寫得越具體（顏色、大小、特徵），AI 越不用自己猜。',
        ifMissing: 'AI 會自己挑一個主角，常常不是你想的那個。' },
      { key: 'action', label: '動作與情境', question: '主角在做什麼？發生了什麼事？',
        effect: '讓畫面有故事。動詞越精準，姿勢越明確。',
        ifMissing: '主角會呆呆地站著，像證件照。' },
      { key: 'setting', label: '環境與背景', question: '在哪裡？什麼時間？畫面裡還有哪些東西？',
        effect: '決定背景和氣氛。列出具體物品，AI 才會放進去。',
        ifMissing: '背景會變得很空，或是 AI 隨便補一些東西。' },
      { key: 'composition', label: '構圖與視角', question: '從哪個角度看？主角放在畫面哪裡？',
        effect: '同樣的內容，俯視像地圖、仰視顯得巨大、特寫看得到細節。',
        ifMissing: 'AI 多半會選最普通的正面平視。' },
      { key: 'lighting', label: '光線', question: '光從哪裡來？是什麼顏色？',
        effect: '光線最影響情緒：暖光溫馨、冷光安靜、強烈對比顯得緊張。',
        ifMissing: '光線平平的，畫面比較沒有氣氛。' },
      { key: 'material', label: '材質與色彩', question: '東西是什麼做的？主要是什麼顏色？',
        effect: '同一隻貓可以是毛絨、黏土或玻璃做的；色調統一，畫面才和諧。',
        ifMissing: 'AI 會用預設的材質和顏色，作品比較沒有特色。' },
      { key: 'style', label: '風格與媒材', question: '像用什麼方式畫出來的？',
        effect: '決定整體畫風：水彩、3D 模型、版畫、照片……選「自訂風格」時，AI 只聽這一段。',
        ifMissing: '如果也沒選風格卡片，AI 會自己決定畫風。' },
      { key: 'constraints', label: '限制條件', question: '有什麼不要的？',
        effect: '擋掉 AI 常自作主張加上的東西，例如文字、浮水印、多餘的人。',
        ifMissing: 'AI 可能加上奇怪的文字或多出來的東西。' }
    ],
    templates: [
      { id: 'mini-room', title: '等距微縮房間', mode: 'text', style: 'free', inputHint: '',
        credit: '改編自 Awesome-Nano-Banana-images 例 47（Apache-2.0）',
        parts: {
          subject: { text: '一個被切開一面的立方體微縮房間，所有物品都收在立方體裡面。',
            note: '「切開一面」讓我們看得到房間內部；「收在立方體裡」限制了範圍，東西才不會散出去。' },
          action: { text: '房間裡有一個 Q 版小人，正坐在書桌前組裝一台小機器人。',
            note: '給角色一個正在做的動作，房間就有了「正在發生的故事」。' },
          setting: { text: '這是一間發明家的工作室，牆上貼滿設計圖，桌上散落著齒輪、螺絲和工具。',
            note: '列出具體物品，AI 才會畫出來；如果只寫「工作室」，畫面會很空。' },
          composition: { text: '從略微俯視的等距四分之三視角來看，立方體正面的邊角在畫面中央。',
            note: '等距視角像遊戲地圖，可以同時看到兩面牆和地板。' },
          lighting: { text: '檯燈發出暖黃色的光，窗外透進一點傍晚的藍光。',
            note: '一暖一冷兩種光，讓畫面更有層次。' },
          material: { text: '小人像霧面塑膠公仔，頭大身體小；家具像木頭做的模型。',
            note: '指定材質，畫面才會像「模型」，而不是普通的插畫。' },
          style: { text: '精緻的 3D 微縮模型攝影，細節豐富。',
            note: '「攝影」兩個字讓 AI 用拍照的方式呈現，而不是畫圖。' },
          constraints: { text: '背景是乾淨的淺灰色，畫面中沒有文字，也沒有浮水印。',
            note: '乾淨的背景讓視線集中在房間；排除文字，避免 AI 亂寫字。' }
        } },
      { id: 'four-seasons', title: '四季全景', mode: 'text', style: 'free', inputHint: '',
        credit: '改編自 Awesome-Nano-Banana-images 例 50（Apache-2.0）',
        parts: {
          subject: { text: '一幅橫長的全景插畫，畫的是我們學校的操場和教室。',
            note: '「橫長的全景」決定畫面形狀，為後面的四季排列留出空間。' },
          action: { text: '畫面從左到右，依序經過冬天、春天、夏天、秋天。',
            note: '規定時間的順序，AI 才知道四個季節要怎麼排。' },
          setting: { text: '冬天有薄霜，春天開滿了花，夏天陽光強烈、樹很綠，秋天落葉金黃。',
            note: '每個季節給一個代表物，才看得出是哪個季節。' },
          composition: { text: '平視的寬廣視角，地平線大約在畫面三分之一高的地方。',
            note: '地平線的位置決定天空和地面各占多少。' },
          lighting: { text: '光線從左邊冷冷的白色，慢慢變成右邊溫暖的金色。',
            note: '光線跟著季節改變，時間流動的感覺更強。' },
          material: { text: '季節之間的顏色自然漸變，沒有明顯的分界線。',
            note: '沒有這句，AI 常常會切成四格。這句就是範本的關鍵，可以拿掉試試看。' },
          style: { text: '細緻的數位插畫，像電影裡的場景。',
            note: '「電影場景」會讓光影和構圖更有戲劇感。' },
          constraints: { text: '畫面中沒有文字。',
            note: '避免 AI 自己加上季節名稱。' }
        } },
      { id: 'plush', title: '讓你的畫變成毛絨玩偶', mode: 'photo', style: 'free',
        inputHint: '上傳一張你畫的圖，或一個小東西的照片',
        credit: '改編自 Awesome-Nano-Banana-images 例 12（Apache-2.0）',
        parts: {
          subject: { text: '把照片裡的圖案變成一個柔軟蓬鬆的立體玩偶，保留原本的顏色和形狀。',
            note: '「保留原本的顏色和形狀」要 AI 以你的照片為準，不要自己換掉。' },
          action: { text: '玩偶輕輕地漂浮在空中。',
            note: '漂浮會讓主體更突出，看起來像商品照。' },
          setting: { text: '背景是乾淨的淺灰色。',
            note: '簡單的背景，讓視線集中在玩偶身上。' },
          composition: { text: '玩偶放在畫面正中央，鏡頭從正面稍微往上看。',
            note: '稍微仰視會讓玩偶看起來更可愛、更有份量。' },
          lighting: { text: '攝影棚的柔光，陰影很柔和。',
            note: '柔光讓毛的質感跑出來；如果用強光，會顯得很兇。' },
          material: { text: '全身覆蓋細緻蓬鬆的毛，看得到一根一根的毛。',
            note: '這是讓東西變毛絨的關鍵句，拿掉它就不會變成毛絨玩偶。' },
          style: { text: '寫實的 3D 產品攝影，觸感豐富又可愛。',
            note: '「產品攝影」讓 AI 用拍商品的方式呈現。' },
          constraints: { text: '不要加上文字，也不要加入其他物品。',
            note: '確保畫面只有你的作品。' }
        } },
      { id: 'study-poster', title: '學習小報', mode: 'text', style: 'free', inputHint: '',
        credit: '改編自 Awesome-Nano-Banana-images 例 8（Apache-2.0）',
        parts: {
          subject: { text: '一張直式的兒童學習小報，主題是台灣的海洋生物。',
            note: '先說清楚「這是一張小報」，AI 才會用排版的方式來畫。' },
          action: { text: '中間是一幅主題插畫，周圍分成幾個小區塊，每塊介紹一種生物。',
            note: '描述版面怎麼分區，AI 才會排版，而不是只畫一張圖。' },
          setting: { text: '插畫裡要清楚畫出海龜、小丑魚、珊瑚、海星和寄居蟹。',
            note: '列出「一定要出現」的清單，避免漏畫。' },
          composition: { text: '物品之間留出空間，邊界清楚，不要太擠。',
            note: '版面有留白，才容易閱讀。' },
          lighting: { text: '明亮、溫暖、積極的氣氛。',
            note: '這類資訊圖不需要戲劇性的光，用「氣氛」描述就夠了。' },
          material: { text: '以藍色和綠色為主，搭配鮮豔的點綴色。',
            note: '主色加點綴色，畫面才統一又不單調。' },
          style: { text: '卡通插畫，每個物品都像貼紙一樣有白色描邊。',
            note: '「貼紙＋白色描邊」讓每個物品和背景分開。' },
          constraints: { text: '先不要寫字，在每個物品旁邊留一個空白標籤，之後再自己寫上名稱。',
            note: 'AI 很容易把中文寫錯。先留白、之後自己寫，是常見的解決方法。' }
        } },
      { id: 'chalkboard', title: '把你的畫搬上黑板', mode: 'photo', style: 'free',
        inputHint: '上傳一張你畫的圖',
        credit: '改編自 Awesome-Nano-Banana-images 例 28（Apache-2.0）',
        parts: {
          subject: { text: '把照片裡的圖畫，用彩色粉筆重新畫在教室的黑板上。',
            note: '指定「用粉筆重畫」，AI 會保留你的構圖，但換成粉筆的筆觸。' },
          action: { text: '圖畫旁邊用粉筆畫了一些小星星和箭頭當裝飾。',
            note: '加一點裝飾，看起來像真的有人在黑板上畫畫。' },
          setting: { text: '黑板靠著牆，前面有一張老師的講桌。',
            note: '加入周邊的物品，「黑板」才會像真的放在教室裡。' },
          composition: { text: '從教室後方斜斜地拍向黑板。',
            note: '斜斜的角度比正面更像真實的照片。' },
          lighting: { text: '白天的自然光從旁邊的窗戶照進來。',
            note: '窗光讓黑板有明暗變化。' },
          material: { text: '看得到粉筆的顆粒和擦過的痕跡。',
            note: '小細節會讓真實感大幅提升。' },
          style: { text: '寫實的照片。',
            note: '跟前面的細節搭配，整張圖會像是用手機拍下來的。' },
          constraints: { text: '黑板上不要寫任何字。',
            note: '避免 AI 自己在黑板上寫字。' }
        } },
      { id: 'hometown-magnets', title: '家鄉地標磁貼', mode: 'text', style: 'free', inputHint: '',
        credit: '改編自 Awesome-Nano-Banana-images 例 35（Apache-2.0）',
        parts: {
          subject: { text: '一組屏東車城地標的 3D 迷你冰箱磁貼。',
            note: '把主題換成你的家鄉，就是你專屬的紀念品。' },
          action: { text: '磁貼排得很整齊，堆成一座小山的形狀。',
            note: '規定排列方式，畫面才不會亂糟糟。' },
          setting: { text: '磁貼包含福安宮、海生館的鯨鯊、洋蔥田和恆春古城門。',
            note: '地標要寫出具體名稱。試試看：AI 認識越有名的地標，畫得越像；比較少人知道的地方，AI 可能會亂畫。這就是 AI 的限制。' },
          composition: { text: '從正上方往下看的俯視圖。',
            note: '俯視讓每個磁貼都看得清楚。' },
          lighting: { text: '柔和的自然光，陰影淡淡的。',
            note: '商品照常用柔光，讓顏色看起來更乾淨。' },
          material: { text: '每個磁貼都像精緻的樹脂迷你模型。',
            note: '指定材質，才會像真正的磁貼，而不是一張圖。' },
          style: { text: '寫實的商品照片。',
            note: '讓整張圖看起來像拍照，而不是插畫。' },
          constraints: { text: '每個磁貼都不重複，畫面中沒有文字。',
            note: '「不重複」避免 AI 偷懶，複製同一個地標好幾次。' }
        } }
    ]
  }
};

var LevelsUtil = {
  // 唯一的組句函式，學生頁和自動測試都用它。規格第 2 節。
  assemble: function (levelId, template, overrides) {
    var level = LEVELS[levelId];
    var o = overrides || {};
    if (!level || !template) return '';

    var fill = function (text, values) {
      return text.replace(/\{(\w+)\}/g, function (m, key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : m;
      });
    };

    if (levelId === 'middle') {
      var lv = {};
      for (var k in template.values) lv[k] = template.values[k];
      for (var ok in o) if (typeof o[ok] === 'string' && o[ok] !== '') lv[ok] = o[ok];
      return fill(level.sentence, lv).trim();
    }

    if (levelId === 'upper') {
      var uv = {};
      template.blanks.forEach(function (b) {
        uv[b.key] = (typeof o[b.key] === 'string' && o[b.key] !== '') ? o[b.key] : b.value;
      });
      var out = fill(template.text, uv);
      if (o.extras && o.extras.length) out += '畫面裡還有：' + o.extras.join('、') + '。';
      return out.trim();
    }

    if (levelId === 'junior') {
      var lines = [];
      level.segments.forEach(function (seg) {
        var has = Object.prototype.hasOwnProperty.call(o, seg.key);
        var text = has ? o[seg.key] : (template.parts[seg.key] && template.parts[seg.key].text);
        if (text) lines.push(String(text).trim());
      });
      return lines.join('\n').trim();
    }

    return '';
  }
};
