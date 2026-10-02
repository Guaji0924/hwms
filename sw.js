/* ============================================================
   sw.js —— Service Worker（让网页能"像 App 一样"离线打开）
   ------------------------------------------------------------
   原理：第一次打开网页时，把所有程序文件缓存到浏览器里；
        之后即使断网，浏览器也能从缓存把应用完整打开。
   注意：数据（物料、记录等）存在 IndexedDB，由 sync.js 负责
        离线读写和联网自动同步；这里只缓存"程序本身"。

   前提条件（很重要，否则整个离线能力都不存在）：
   Service Worker 只能在"安全上下文"里注册 ——
     ✓ https://  （Cloudflare Pages 等）
     ✓ http://localhost、http://127.0.0.1
     ✗ http://192.168.x.x:8787 （局域网 IP，浏览器拒绝注册）
     ✗ file:// 双击打开（浏览器不支持注册）
   不安全的情况下浏览器会直接拒绝注册，控制台会打印原因（见 index.html）。

   版本升级：程序文件有改动时，把下面的构建序号 +1（如 b8 → b9）即可强制刷新缓存。
   ============================================================ */

var CACHE = 'hwms-v1.0-b29';                     // 缓存名 = 版本号(v1.0) + 构建序号；改了前端文件就把序号 +1（b17 → b18），老设备才会拉新文件

/* 预缓存的应用外壳文件清单。
   注意：这里**故意不写 './index.html'** ——
   Cloudflare Pages 会把 /index.html 重定向到 /（HTML 页面去扩展名规则），
   而带重定向的响应会让缓存写入失败，进而连累整个离线安装。
   用 './' 就够了：它返回的就是 index.html。 */
var SHELL = [
  './',
  './style.css',
  './manifest.json',
  './assets/logo.png',
  './js/core.js',
  './js/data.js',
  './js/main.js',
  './js/pages_main.js',
  './js/pages_stats.js',
  './js/pages_admin.js',
  './js/pages_ai.js',
  './js/pages_pmix.js',                          // 项目配料（AI 配料 / 嘉立创 BOM 导入与更正 / 历史项目）——漏了会离线打不开
  './js/pages_manual.js',
  './js/reconcile.js',                           // 库存对账（流水推算 / 期初锚点 / 超卖修正）——漏了会离线点不动对账按钮
  './js/sync.js',
  './js/lib/xlsx.full.min.js',                   // 本地 SheetJS：离线解析 xlsx BOM——漏了会离线导不了 BOM
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* 安装阶段：把外壳文件逐个下载进缓存
   —— 关键改动：改用"逐个 add + 各自 try/catch"，而不是 addAll。
   addAll 是全有或全无的：清单里任何一个文件 404 或发生重定向，
   整个 install 就会失败，Service Worker 永远不激活，离线能力彻底没有，
   而且错误信息还会被静默吞掉、极难排查。逐个下载后，个别文件失败
   只丢那一个文件，其余照常缓存，并且失败原因会打印到控制台。 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {                     // 打开缓存空间
      return Promise.all(SHELL.map(function (url) {            // 逐个文件处理
        return c.add(url).catch(function (err) {               // 单个失败只记录，不中断
          console.warn('[SW] 预缓存失败，已跳过：' + url, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })        // 新 SW 立即接管
  );
});

/* 激活阶段：删掉旧版本遗留的缓存 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {                      // 拿到所有缓存名
      return Promise.all(keys.map(function (k) {              // 逐个检查
        return k === CACHE ? null : caches.delete(k);          // 不是当前版本的删掉
      }));
    }).then(function () { return self.clients.claim(); })      // 立刻控制已打开页面
  );
});

/* 拦截网络请求，按类型分流 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                             // 只处理 GET 请求
  var url = new URL(req.url);
  if (/\/api\//.test(url.pathname)) return;                      // 同步接口放行走网络（数据新鲜度由 sync.js 管）
  if (url.origin !== self.location.origin) return;               // 跨域请求（如 AI 接口）不接管、不缓存，直接走网络

  if (req.mode === 'navigate') {                                 // 情况1：打开页面
    e.respondWith(
      fetch(req).then(function (res) {                           // 先尝试联网拿最新
        return res;
      }).catch(function () {                                     // 断网了：按优先级回退到缓存
        return caches.match(req)                                 // ① 请求地址本身
          .then(function (hit) { return hit || caches.match('./'); })   // ② 应用外壳首页
          .then(function (hit) { return hit || caches.match('./index.html'); })  // ③ 老缓存的兜底
          .then(function (hit) {
            if (hit) return hit;                                 // 找到了就用缓存顶上
            return new Response('离线且没有可用缓存，请联网后重新打开一次。', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
    );
    return;
  }

  /* 情况2：静态文件（样式 / 脚本 / 图标）—— 网络优先，缓存只作离线兜底
     为什么不是"缓存优先"：缓存优先会让已经访问过的设备永远吃旧文件，
     必须靠人手去改上面的 CACHE 版本号才能刷新。改一处代码忘了改版本号，
     就会出现"手机看到新界面、电脑还是旧界面"这种鬼问题（而且极难排查）。
     网络优先 = 有网时永远用最新的；断网时才回退到缓存，离线能力不受影响。 */
  e.respondWith(
    fetch(req).then(function (res) {                             // 先联网取最新
      if (res && res.ok && !res.redirected) {                    // 成功且不是重定向：顺手更新缓存
        var copy = res.clone();                                  // 复制一份响应体
        caches.open(CACHE).then(function (c) { c.put(req, copy); });  // 存进缓存，供下次断网用
      }
      return res;
    }).catch(function () {                                       // 断网了
      return caches.match(req).then(function (hit) {              // 回退到缓存
        return hit || new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
