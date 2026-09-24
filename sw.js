/* ============================================================
   sw.js —— Service Worker（让网页能"像 App 一样"离线打开）
   ------------------------------------------------------------
   原理：第一次打开网页时，把所有程序文件缓存到浏览器里；
        之后即使断网，浏览器也能从缓存把应用完整打开。
   注意：数据（物料、记录等）存在 IndexedDB，由 sync.js 负责
        离线读写和联网自动同步；这里只缓存"程序本身"。
   版本升级：程序文件有改动时，把下面的 v1 改成 v2 即可强制刷新缓存。
   ============================================================ */

var CACHE = 'hwms-v4';                          // 缓存版本号（升级程序时 +1；本次升级：使用手册 + 班级字段 + 会徽 + 云同步密钥）
var SHELL = [                                    // 预缓存的应用外壳文件清单
  './',
  './index.html',
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
  './js/pages_manual.js',
  './js/sync.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* 安装阶段：把外壳文件一次性下载进缓存 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)                                        // 打开缓存空间
      .then(function (c) { return c.addAll(SHELL); })          // 批量下载入库
      .then(function () { return self.skipWaiting(); })        // 新 SW 立即接管
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
  if (req.mode === 'navigate') {                                 // 情况1：打开页面
    e.respondWith(
      fetch(req).then(function (res) {                           // 先尝试联网拿最新
        return res;
      }).catch(function () {                                     // 断网了
        return caches.match('./index.html');                      // 用缓存的应用外壳顶上
      })
    );
    return;
  }
  e.respondWith(                                                 // 情况2：静态文件，缓存优先
    caches.match(req).then(function (hit) {
      if (hit) return hit;                                       // 缓存里有：直接用（秒开）
      return fetch(req).then(function (res) {                     // 没有：联网下载
        if (res && res.ok) {                                     // 下载成功
          var copy = res.clone();                                 // 复制一份响应体
          caches.open(CACHE).then(function (c) { c.put(req, copy); });  // 存进缓存备用
        }
        return res;
      });
    })
  );
});
