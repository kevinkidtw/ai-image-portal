// tests/frontend-static.test.js — 前端靜態安全檢查（由 Claude 撰寫並擁有）
//
// ⚠️ 執行者（Antigravity）注意：這個檔案是審查關卡，不准修改、刪除或 skip 任何斷言。
//   有疑慮寫進 說明/測試報告.md 的「待討論」。

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '..', 'site');
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8');
const jsFiles = fs.readdirSync(path.join(SITE, 'assets')).filter((f) => f.endsWith('.js'));
const htmlFiles = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));

describe('前端靜態檢查', () => {
  test('site/ 不含任何金鑰、金鑰欄位或直接呼叫 AI 供應商', () => {
    for (const f of [...jsFiles.map((j) => 'assets/' + j), ...htmlFiles]) {
      const src = read(f);
      assert.ok(!/sk-[A-Za-z0-9]|AIza|api[_-]?key|generativelanguage|api\.openai/i.test(src), f + ' 含有金鑰相關字串');
    }
  });

  test('不可用字串拼接的方式寫入 innerHTML / outerHTML，也不可用 insertAdjacentHTML、document.write', () => {
    for (const f of jsFiles) {
      const lines = read('assets/' + f).split('\n');
      lines.forEach((line, i) => {
        const where = f + ':' + (i + 1) + '  ' + line.trim();
        assert.ok(!/insertAdjacentHTML|document\.write|outerHTML\s*=/.test(line), '禁用的 API：' + where);
        // innerHTML 只允許在同一行指定「單一純字面字串」，例如 el.innerHTML = '';
        // 動態內容（後端回傳、使用者輸入、變數）一律用 textContent / createElement
        if (/innerHTML\s*=/.test(line)) {
          const rhs = line.split(/innerHTML\s*=/)[1];
          assert.ok(/^\s*('[^'\\]*'|"[^"\\]*")\s*;?\s*$/.test(rhs),
            'innerHTML 只能指定單一純字面字串（動態內容請用 textContent / createElement）：' + where);
        }
      });
    }
  });

  test('每個 HTML 頁面都有 CSP，且 script-src 不允許 inline', () => {
    for (const f of htmlFiles) {
      const src = read(f);
      // 屬性值本身含有 'self' 這類單引號，所以用反向引用比對開頭與結尾的同一種引號
      // （2026-10-09 修正：原本的 [^"']+ 會在第一個單引號停下，由 Antigravity 在報告 11-5 指出）
      const m = src.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])(.*?)\1/i);
      assert.ok(m, f + ' 缺少 Content-Security-Policy meta');
      const csp = m[2];
      const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
      assert.ok(/'self'/.test(scriptSrc), f + ' 的 script-src 必須包含 \'self\'');
      assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(scriptSrc), f + ' 的 script-src 不可含 unsafe-inline / unsafe-eval / *');
      assert.ok(/connect-src[^;]*script\.google\.com/.test(csp), f + ' 的 connect-src 要允許 script.google.com');
      assert.ok(/connect-src[^;]*script\.googleusercontent\.com/.test(csp), f + ' 的 connect-src 要允許 script.googleusercontent.com（GAS 會轉址到這裡）');
      assert.ok(!/<script>/.test(src) && !/\son[a-z]+=/.test(src), f + ' 不可有 inline <script> 或 inline 事件屬性');
    }
  });

  // 2026-10-10 新增：素描本改版（說明/改版規格_素描本.md 第 2 節）
  test('畫面上不含 emoji（api.js 的 mock 資料要跟後端一致，不檢查）', () => {
    const files = [...htmlFiles, 'assets/style.css', ...jsFiles.filter((j) => j !== 'api.js').map((j) => 'assets/' + j)];
    for (const f of files) {
      if (!fs.existsSync(path.join(SITE, f))) continue;
      read(f).split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/<!--.*?-->/g, '');
        const m = code.match(/\p{Extended_Pictographic}/u);
        assert.ok(!m, f + ':' + (i + 1) + ' 含有 emoji「' + (m && m[0]) + '」：' + line.trim());
      });
    }
  });

  // 2026-10-11 新增：年段分級改版（說明/改版規格_年段分級.md 第 7 節）
  test('網站一律淺色：沒有深色模式，並宣告 color-scheme: light', () => {
    const css = read('assets/style.css');
    assert.ok(!/prefers-color-scheme\s*:\s*dark/.test(css), 'style.css 不可再有深色模式');
    assert.ok(!/data-theme\s*=\s*["']?dark/.test(css), 'style.css 不可有深色主題選擇器');
    assert.ok(/color-scheme\s*:\s*light/.test(css), 'style.css 的 :root 要宣告 color-scheme: light');
    for (const f of htmlFiles) {
      assert.ok(/<meta\s+name=["']color-scheme["']\s+content=["']light["']/.test(read(f)), f + ' 要有 <meta name="color-scheme" content="light">');
    }
  });

  test('有用 Google Fonts，CSP 就要允許對應網域', () => {
    for (const f of htmlFiles) {
      const src = read(f);
      if (!/fonts\.googleapis\.com/.test(src)) continue;
      const csp = (src.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])(.*?)\1/i) || [])[2] || '';
      assert.ok(/style-src[^;]*https:\/\/fonts\.googleapis\.com/.test(csp), f + ' 的 style-src 要允許 https://fonts.googleapis.com');
      assert.ok(/font-src[^;]*https:\/\/fonts\.gstatic\.com/.test(csp), f + ' 要有 font-src https://fonts.gstatic.com');
    }
  });
});
