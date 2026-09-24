// 加载冒烟测试：用最小 DOM 桩在 Node 中执行全部 JS 文件，检查加载期是否报错
// 用法：node smoke_test.js （在 hwms 目录下运行）
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const jsFiles = ['js/data.js', 'js/core.js', 'js/pages_main.js', 'js/pages_stats.js', 'js/pages_admin.js', 'js/pages_ai.js', 'js/main.js'];

// ---------- 最小 DOM 桩 ----------
function makeEl() {
  const el = {
    children: [], style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {},
    addEventListener() {}, removeEventListener() {},
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    focus() {}, select() {}, click() {}, scrollIntoView() {},
    insertAdjacentHTML() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getContext() { return null; },
  };
  return el;
}

const documentStub = {
  body: makeEl(),
  documentElement: makeEl(),
  head: makeEl(),
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  createTextNode(t) { return { textContent: t }; },
  addEventListener() {},
  removeEventListener() {},
};

const sandbox = {
  console,
  document: documentStub,
  navigator: { userAgent: 'node-smoke', onLine: true, clipboard: { writeText() { return Promise.resolve(); } } },
  location: { hash: '#/login', href: 'file:///hwms/index.html#/login', origin: 'file://', pathname: '/hwms/index.html', search: '', reload() {} },
  history: { pushState() {}, replaceState() {} },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  sessionStorage: {
    _d: {},
    getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  indexedDB: { open() { return {}; } },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame(fn) { return setTimeout(fn, 16); },
  matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
  alert() {}, confirm() { return true; }, prompt() { return null; },
  fetch() { return Promise.reject(new Error('smoke: no network')); },
  FileReader: function () { this.readAsText = function () {}; this.readAsDataURL = function () {}; },
  Blob: function (parts) { this.size = 0; this.type = ''; },
  URL: { createObjectURL() { return 'blob:smoke'; }, revokeObjectURL() {} },
  crypto: { randomUUID() { return 'smoke-uuid'; }, getRandomValues(a) { return a; } },
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Set, Map, Symbol, BigInt, Proxy, WeakMap,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = function () {};                 // window.addEventListener 桩
sandbox.removeEventListener = function () {};            // window.removeEventListener 桩
sandbox.scrollTo = function () {};

const context = vm.createContext(sandbox);

let failed = false;
for (const f of jsFiles) {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    vm.runInContext(code, context, { filename: f });
    console.log('加载 OK: ' + f);
  } catch (e) {
    failed = true;
    console.log('加载 FAIL: ' + f);
    console.log('  ' + e.constructor.name + ': ' + e.message);
    if (e.stack) {
      const lines = e.stack.split('\n').filter(l => l.includes(f)).slice(0, 3);
      lines.forEach(l => console.log('  ' + l.trim()));
    }
  }
}

// 额外验证：核心对象是否都已挂载（名字以实际代码为准）
const mustHave = ['PINYIN_MAP', 'ALIAS_MAP', 'CATEGORY_TREE', 'UNIT_OPTIONS', 'RECIPES', 'DEMO_MATERIALS', 'DEMO_PROJECTS', 'DB', 'Auth', 'State', 'Search', 'Log', 'ICONS'];
for (const name of mustHave) {
  const ok = vm.runInContext('typeof ' + name + ' !== "undefined"', context);
  console.log((ok ? '对象存在: ' : '对象缺失: ') + name);
  if (!ok) failed = true;
}

if (failed) { console.log('冒烟测试未通过。'); process.exit(1); }
console.log('冒烟测试通过：全部脚本可正常加载执行。');

// ---------- 功能级断言（搜索引擎 / 智能配料 / 示例数据 / 安全） ----------
const testCode = `
(function () {
  var results = [];
  function t(name, cond, detail) { results.push({ name: name, ok: !!cond, detail: detail || '' }); }

  // 准备：给示例物料补 id（真实系统里由 IndexedDB 自动生成），并注入内存状态
  DEMO_MATERIALS.forEach(function (m, i) { if (!m.id) m.id = 'demo-' + i; });
  State.materials = DEMO_MATERIALS;

  // 1. 中文模糊搜索
  var r1 = Search.query('电阻');
  t('搜索"电阻"有结果', r1.length > 0, '共 ' + r1.length + ' 条');

  // 2. 拼音首字母搜索
  var r2 = Search.query('dz');
  t('拼音首字母 dz 能搜到电阻', r2.length > 0 && r2.some(function (m) { return m.name.indexOf('电阻') >= 0; }),
    r2.slice(0, 3).map(function (m) { return m.name; }).join(' / '));

  // 3. 拼音全拼搜索
  var r3 = Search.query('dianzu');
  t('全拼 dianzu 能搜到电阻', r3.length > 0 && r3.some(function (m) { return m.name.indexOf('电阻') >= 0; }));

  // 4. 多关键词（空格分隔，全都要命中）
  var r4 = Search.query('arduino 入门');
  t('多关键词搜索 arduino+入门', r4.length > 0);

  // 5. 丝印搜索
  var r5 = Search.query('c8t6');
  t('丝印 c8t6 能搜到 STM32 板', r5.length > 0 && r5.some(function (m) { return m.name.indexOf('STM32') >= 0; }));

  // 6. 智能配料：循迹小车
  var plan = localRecipeMatch('做个循迹小车');
  t('配料命中"循迹小车"模板', plan.note.indexOf('循迹小车') >= 0, plan.note);
  t('配料输出清单非空', plan.items.length + plan.missing.length > 0,
    '可领 ' + plan.items.length + ' 项 / 待购 ' + plan.missing.length + ' 项');

  // 7. 全部配料模板的关键词都能在示例物料库中找到（保证开箱即用）
  var kwFail = [];
  RECIPES.forEach(function (rc) {
    rc.needs.forEach(function (nd) {
      var kws = String(nd.kw).split('|');
      var found = kws.some(function (k) { return Search.query(k.trim()).length > 0; });
      if (!found) kwFail.push(rc.name + ' -> ' + nd.kw);
    });
  });
  t('配料模板关键词全部可匹配示例库', kwFail.length === 0, kwFail.join('; '));

  // 8. 分类树结构
  var catOk = CATEGORY_TREE.every(function (c) { return c.name && Array.isArray(c.subs) && c.subs.length > 0; });
  t('分类树结构完整', catOk, CATEGORY_TREE.length + ' 个母分类');

  // 9. 示例出入库记录生成
  var recs = genDemoRecords(DEMO_MATERIALS, '管理员');
  t('示例记录生成数量正常', Array.isArray(recs) && recs.length >= 15, '共 ' + recs.length + ' 条');
  var recOk = recs.every(function (r) { return r.materialId && (r.type === 'in' || r.type === 'out_use') && r.qty > 0 && r.time; });
  t('示例记录字段完整', recOk);

  // 10. HTML 转义防注入
  t('escapeHtml 防注入', escapeHtml('<img onerror=1>').indexOf('<') < 0);

  return results;
})()
`;

let fnFailed = false;
try {
  const results = vm.runInContext(testCode, context, { filename: 'functional-tests' });
  for (const r of results) {
    console.log((r.ok ? '  [通过] ' : '  [失败] ') + r.name + (r.detail ? '  (' + r.detail + ')' : ''));
    if (!r.ok) fnFailed = true;
  }
} catch (e) {
  fnFailed = true;
  console.log('功能测试执行异常: ' + e.message);
}

if (fnFailed) { console.log('功能测试未全部通过。'); process.exit(1); }
console.log('功能测试全部通过。');
