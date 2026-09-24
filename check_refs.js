// 交叉引用校验脚本：检查 HTML/JS 中调用的全局函数是否都有定义
// 用法：node check_refs.js （在 hwms 目录下运行）
'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const jsFiles = ['js/data.js', 'js/core.js', 'js/pages_main.js', 'js/pages_stats.js', 'js/pages_admin.js', 'js/pages_ai.js', 'js/main.js'];
const htmlFile = 'index.html';

let allText = '';
jsFiles.forEach(f => { allText += '\n' + fs.readFileSync(path.join(dir, f), 'utf8'); });
const htmlText = fs.readFileSync(path.join(dir, htmlFile), 'utf8');

// 1. 收集已定义的全局名字：function 声明 / var-let-const 顶层 / window.x = / const X = 
const defined = new Set();
const fnDefRe = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
let m;
while ((m = fnDefRe.exec(allText))) defined.add(m[1]);
const varDefRe = /(?:^|\n)\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g;
while ((m = varDefRe.exec(allText))) defined.add(m[1]);
const winDefRe = /window\.([A-Za-z_$][\w$]*)\s*=/g;
while ((m = winDefRe.exec(allText))) defined.add(m[1]);
// 对象方法挂在全局对象上（如 App.xxx / State.xxx / DB.xxx / UI.xxx）
const objDefRe = /(?:^|\n)\s*(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
const globalObjs = new Set();
while ((m = objDefRe.exec(allText))) globalObjs.add(m[1]);

// 2. 收集事件处理器里的函数调用（onclick="fn(...)" onchange=... 以及 JS 字符串拼接的 onclick）
const callRe = /on(?:click|change|input|submit|keyup|keydown|blur|focus|load|toggle)\s*=\s*(?:"([^"]*)"|'([^']*)'|\\'([^\\']*)\\')/g;
const calls = new Map(); // name -> [locations]
function recordCall(name, src) {
  if (!name) return;
  if (!calls.has(name)) calls.set(name, []);
  calls.get(name).push(src);
}
const searchTargets = allText + '\n' + htmlText;
while ((m = callRe.exec(searchTargets))) {
  const handler = m[1] || m[2] || m[3] || '';
  // 提取 handler 开头的函数名
  const fn = handler.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
  if (fn) recordCall(fn[1], 'event-handler');
}

// 3. 检查 routeTo 路由表中引用的页面渲染函数
const routeRe = /['"]#\/([\w-]+)['"]\s*:\s*([A-Za-z_$][\w$]*)/g;
while ((m = routeRe.exec(allText))) recordCall(m[2], 'route-table');

// JS 关键字（可能出现在 onclick="if(...) ..." 这类内联条件语句开头）
const jsKeywords = new Set(['if', 'for', 'while', 'return', 'else', 'do', 'switch', 'try', 'catch', 'void', 'typeof', 'new', 'delete', 'in', 'of', 'var', 'let', 'const', 'async', 'await', 'yield', 'break', 'continue', 'throw', 'function', 'class', 'extends', 'super', 'this', 'null', 'true', 'false', 'undefined']);

const builtin = new Set(['alert', 'confirm', 'prompt', 'event', 'this', 'document', 'window', 'location', 'history', 'fetch', 'console', 'setTimeout', 'setInterval', 'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Date', 'Math', 'RegExp', 'Error', 'Promise', 'localStorage', 'sessionStorage', 'crypto', 'URL', 'FileReader', 'Blob', 'File', 'navigator', 'indexedDB', 'Proxy', 'Set', 'Map', 'WeakMap', 'Symbol', 'BigInt', 'WebSocket', 'XMLHttpRequest', 'Audio', 'Image', 'requestAnimationFrame', 'matchMedia', 'getComputedStyle', 'AbortController', 'TextDecoder', 'TextEncoder']);

// 记录每个来源文件+行号，便于定位
const callSites = new Map(); // name -> Set('file:line')
function recordCall2(name, file, line) {
  if (!callSites.has(name)) callSites.set(name, new Set());
  callSites.get(name).add(file + ':' + line);
}
const allSources = [];
jsFiles.forEach(f => allSources.push([f, fs.readFileSync(path.join(dir, f), 'utf8')]));
allSources.push([htmlFile, htmlText]);
for (const [file, text] of allSources) {
  let mm;
  const re = /on(?:click|change|input|submit|keyup|keydown)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  while ((mm = re.exec(text))) {
    const handler = mm[1] || mm[2] || '';
    const fn = handler.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
    if (fn) {
      const line = text.slice(0, mm.index).split('\n').length;
      recordCall2(fn[1], file, line);
    }
  }
}

const missing = [];
for (const [name, sites] of callSites) {
  if (defined.has(name)) continue;
  if (builtin.has(name)) continue;
  if (jsKeywords.has(name)) continue;
  if (globalObjs.has(name)) continue;
  missing.push(name + '  <- ' + [...sites].join(', '));
}

if (missing.length) {
  console.log('未定义的函数引用 ' + missing.length + ' 处：');
  missing.forEach(x => console.log('  ' + x));
  process.exit(1);
} else {
  console.log('交叉引用检查通过：所有事件处理器函数均有定义。');
  console.log('已定义全局函数/变量共 ' + defined.size + ' 个。');
}
