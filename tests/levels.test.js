// tests/levels.test.js — 年段資料檢查（由 Claude 撰寫並擁有）
//
// ⚠️ 執行者（Antigravity）注意：這個檔案是審查關卡，不准修改、刪除或 skip 任何斷言。
//   規格見 說明/改版規格_年段分級.md 第 2、3-1、4-1、5-2、5-4、9 節。

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LEVELS_PATH = path.join(ROOT, 'site', 'assets', 'levels.js');
const SEGMENT_KEYS = ['subject', 'action', 'setting', 'composition', 'lighting', 'material', 'style', 'constraints'];
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const BANNED_IP = /lego|樂高|星巴克|starbucks|minecraft|麥塊|寶可夢|pokemon|pikachu|皮卡丘|迪士尼|disney|吉卜力|ghibli|漫威|marvel|鋼彈|gundam|皮克敏|pikmin|hello\s?kitty/i;

function loadAll() {
  assert.ok(fs.existsSync(LEVELS_PATH), '找不到 site/assets/levels.js（規格第 2 節）');
  // 不提供 window / document / localStorage：levels.js 不准依賴瀏覽器
  const ctx = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas', 'Logic.gs'), 'utf8'), ctx, { filename: 'Logic.gs' });
  vm.runInContext(fs.readFileSync(LEVELS_PATH, 'utf8'), ctx, { filename: 'levels.js' });
  return ctx;
}

function check(ctx, levelId, tpl, prompt) {
  const L = ctx.LEVELS[levelId];
  const where = levelId + '/' + tpl.id;
  assert.strictEqual(typeof prompt, 'string', where + ' 組句結果要是字串');
  assert.ok(prompt.length > 0, where + ' 組句結果不可為空');
  assert.ok(prompt.length <= L.maxLength, where + ' 超過字數上限 ' + L.maxLength + '（實際 ' + prompt.length + '）');
  assert.ok(!/[{}]/.test(prompt), where + ' 還有沒取代的 {key}：' + prompt);
  const body = { deviceId: 'test-device-0001', mode: tpl.mode, style: tpl.style, prompt };
  if (tpl.mode === 'photo') { body.image = TINY_PNG; body.imageMime = 'image/png'; }
  const v = ctx.Logic.validateRequest(body);
  assert.ok(v.valid, where + ' 沒通過後端 validateRequest：' + (v.error || ''));
  assert.strictEqual(ctx.Logic.checkBlocked(prompt), false, where + ' 被後端關鍵字過濾擋下：' + prompt);
  assert.ok(!BANNED_IP.test(prompt), where + ' 含有品牌或受著作權保護的角色名稱（規格第 9 節）');
}

describe('年段資料 levels.js', () => {
  test('三個年段都存在，maxLength 符合規格，風格都在後端白名單內', () => {
    const ctx = loadAll();
    const ids = ctx.Logic.STYLES.map((s) => s.id);
    assert.ok(ids.includes('free'), '後端 Logic.STYLES 要新增 free 風格（規格第 8 節）');
    const expectMax = { middle: 120, upper: 300, junior: 600 };
    for (const id of Object.keys(expectMax)) {
      const L = ctx.LEVELS[id];
      assert.ok(L, '缺少年段 ' + id);
      assert.strictEqual(L.id, id);
      assert.strictEqual(L.maxLength, expectMax[id], id + ' 的 maxLength');
      assert.ok(Array.isArray(L.styles) && L.styles.length > 0, id + ' 要有 styles');
      for (const s of L.styles) assert.ok(ids.includes(s), id + ' 的風格 ' + s + ' 不在後端白名單');
      assert.ok(Array.isArray(L.templates) && L.templates.length > 0, id + ' 要有 templates');
      for (const t of L.templates) {
        assert.ok(t.id && t.title, id + ' 的範本要有 id 與 title');
        assert.ok(t.mode === 'text' || t.mode === 'photo', id + '/' + t.id + ' 的 mode');
        assert.ok(L.styles.includes(t.style), id + '/' + t.id + ' 的 style 要在該年段的 styles 內');
      }
    }
    assert.ok(!ctx.LEVELS.lower, '1–2 年級沒有電腦課，不需要 lower 年段（2026-10-11 老師決定）');
    assert.deepStrictEqual(Array.from(ctx.LEVELS.middle.styles).sort(), ['chibi', 'crayon', 'pixar', 'watercolor']);
  });

  test('後端描述上限是 600 字，buildPrompt 遇到 free 風格不輸出 Style instruction', () => {
    const ctx = loadAll();
    const base = { deviceId: 'test-device-0001', mode: 'text', style: 'free' };
    assert.ok(ctx.Logic.validateRequest(Object.assign({}, base, { prompt: '貓'.repeat(600) })).valid, '600 字應該可以通過');
    assert.ok(!ctx.Logic.validateRequest(Object.assign({}, base, { prompt: '貓'.repeat(601) })).valid, '601 字應該被擋');
    const p = ctx.Logic.buildPrompt('free', '一隻貓', 'text');
    assert.ok(p.startsWith(ctx.Logic.SAFETY_PREFIX), '安全前綴一定要在最前面');
    assert.ok(!p.includes('Style instruction'), 'free 風格不應輸出 Style instruction');
    assert.ok(p.includes('一隻貓'));
  });

  test('中年級：四排詞卡、每排至少 6 個選項、4 張故事卡都能組句並通過後端', () => {
    const ctx = loadAll();
    const L = ctx.LEVELS.middle;
    assert.deepStrictEqual(Array.from(L.slots, (s) => s.key), ['who', 'where', 'doing', 'mood']);
    for (const s of L.slots) assert.ok(s.label && s.options.length >= 6, 'slot ' + s.key + ' 至少 6 個選項');
    for (const k of (L.sentence.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1))) {
      assert.ok(L.slots.some((s) => s.key === k), 'sentence 的 {' + k + '} 沒有對應的 slot');
    }
    assert.strictEqual(L.templates.length, 4, '中年級 4 張故事卡');
    for (const t of L.templates) {
      assert.strictEqual(t.mode, 'text', '中年級沒有照片模式範本');
      check(ctx, 'middle', t, ctx.LevelsUtil.assemble('middle', t));
    }
    const t0 = L.templates[0];
    const changed = ctx.LevelsUtil.assemble('middle', t0, { who: '獨角獸' });
    assert.ok(changed.includes('獨角獸'), 'overrides 要能替換詞卡');
    // 任意組合最長的那一組也不可超過上限
    const longest = {};
    for (const s of L.slots) longest[s.key] = s.options.reduce((a, b) => (b.length > a.length ? b : a));
    check(ctx, 'middle', t0, ctx.LevelsUtil.assemble('middle', t0, longest));
  });

  test('高年級：6 張範本，填空與加細節都能組句並通過後端', () => {
    const ctx = loadAll();
    const L = ctx.LEVELS.upper;
    assert.strictEqual(L.templates.length, 6, '高年級 6 張範本');
    assert.ok(Array.isArray(L.extras) && L.extras.length >= 5, '加一點細節至少 5 個');
    for (const t of L.templates) {
      assert.ok(Array.isArray(t.blanks) && t.blanks.length > 0, t.id + ' 要有 blanks');
      for (const b of t.blanks) assert.ok(t.text.includes('{' + b.key + '}'), t.id + ' 的 text 缺少 {' + b.key + '}');
      const plain = ctx.LevelsUtil.assemble('upper', t);
      for (const b of t.blanks) assert.ok(plain.includes(b.value), t.id + ' 組句要包含預設值 ' + b.value);
      check(ctx, 'upper', t, plain);
      const withExtras = ctx.LevelsUtil.assemble('upper', t, { extras: Array.from(L.extras) });
      for (const e of L.extras) assert.ok(withExtras.includes(e), t.id + ' 加細節後要包含 ' + e);
      check(ctx, 'upper', t, withExtras);
    }
  });

  test('國中：8 段架構固定，6 張範本每段都有 text 與 note，並標示出處', () => {
    const ctx = loadAll();
    const L = ctx.LEVELS.junior;
    assert.deepStrictEqual(Array.from(L.segments, (s) => s.key), SEGMENT_KEYS, '8 段的 key 與順序');
    for (const s of L.segments) {
      for (const f of ['label', 'question', 'effect', 'ifMissing']) assert.ok(s[f], 'segment ' + s.key + ' 缺少 ' + f);
    }
    assert.strictEqual(L.templates.length, 6, '國中 6 張範本');
    assert.ok(L.templates.some((t) => t.mode === 'photo'), '國中至少要有一張照片模式範本');
    for (const t of L.templates) {
      assert.ok(/Awesome-Nano-Banana-images/.test(t.credit || ''), t.id + ' 要標示出處');
      if (t.mode === 'photo') assert.ok(t.inputHint, t.id + ' 是照片模式，要有 inputHint');
      for (const k of SEGMENT_KEYS) {
        assert.ok(t.parts[k] && t.parts[k].text && t.parts[k].note, t.id + ' 的 ' + k + ' 要有 text 與 note');
        assert.ok(/。$/.test(t.parts[k].text), t.id + ' 的 ' + k + ' 要以「。」結尾');
      }
      const full = ctx.LevelsUtil.assemble('junior', t);
      assert.strictEqual(full.split('\n').length, 8, t.id + ' 組句要有 8 行');
      check(ctx, 'junior', t, full);
      const skipped = ctx.LevelsUtil.assemble('junior', t, { lighting: null });
      assert.ok(!skipped.includes(t.parts.lighting.text), t.id + ' 傳入 null 應跳過該段');
      assert.strictEqual(skipped.split('\n').length, 7);
      const edited = ctx.LevelsUtil.assemble('junior', t, { lighting: '紫色霓虹燈從下方照上來。' });
      assert.ok(edited.includes('紫色霓虹燈從下方照上來。'), t.id + ' overrides 要能替換段落');
    }
  });
});
