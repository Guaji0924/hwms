/* ============================================================
   server.js —— 物料管家同步服务器（零依赖，双击 bat 即可运行）
   ------------------------------------------------------------
   它做两件事：
   1. 静态网站服务器：局域网里任何设备的浏览器打开
      http://这台电脑的IP:8787/ 就能直接使用物料管家
   2. 同步服务器：接收各设备推送的数据变化、下发别人的变化，
      让手机 / 平板 / 电脑共用同一份数据
   特点：
   · 不需要 npm install，只用 Node 自带模块
   · 数据保存在本目录的 data.json 里，重启不丢
   · 冲突规则：同一条数据谁改得晚（updatedAt 新）谁赢
   ============================================================ */

'use strict';

/* ==================== 1. 引入 Node 自带模块 ==================== */

var http = require('http');          // HTTP 服务器
var fs = require('fs');              // 文件读写（静态文件 + 数据文件）
var path = require('path');          // 路径处理
var os = require('os');              // 读本机 IP 用

var PORT = process.env.PORT || 8787;                     // 端口（云平台自动分配 / 本机默认 8787）
var SYNC_KEY = process.env.SYNC_KEY || '';               // 同步密钥（云端部署强烈建议设置，防止陌生人读写数据）
var DATA_FILE = path.join(__dirname, 'data.json');       // 数据文件位置
var WEB_ROOT = path.join(__dirname, '..');               // 网站根目录 = 上一级（hwms 文件夹）
var VERSION = '2.0';                                     // 服务器版本号

/* ==================== 2. 内存数据库（启动时从 data.json 恢复） ==================== */
/* 结构：{ stores: { materials: { id: { data: 数据, rev: 服务器收到时间 } }, ... } } */

var db = { stores: {} };
var SYNC_STORES = ['materials', 'records', 'users', 'logs', 'settings'];  // 五张表都接收
var saveTimer = null;                                     // 延迟保存的定时器（避免频繁写盘）

/* 启动时读取数据文件 */
function loadDb() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');          // 读文件
    var obj = JSON.parse(raw);                             // 解析 JSON
    if (obj && obj.stores) db = obj;                       // 格式对就用
    console.log('[启动] 已从 data.json 恢复数据');
  } catch (e) {                                            // 文件不存在或损坏
    console.log('[启动] 没有历史数据，从空库开始');
  }
}

/* 延迟保存：数据变化后 500ms 统一写盘一次（合并高频写入） */
function saveDb() {
  if (saveTimer) clearTimeout(saveTimer);                  // 重置定时器
  saveTimer = setTimeout(function () {                     // 500ms 后真正写
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db), 'utf8');  // 全量写盘
    } catch (e) {
      console.error('[保存失败]', e.message);              // 写盘失败只提示，不让请求失败
    }
  }, 500);
}

/* ==================== 3. 同步核心逻辑 ==================== */

/* 处理推送：把客户端的变化合并进来（谁 updatedAt 新谁赢） */
function handlePush(body) {
  var changes = (body && body.changes) || [];               // 取出变化列表
  var accepted = 0;                                         // 接受了多少条
  for (var i = 0; i < changes.length; i++) {                // 逐条合并
    var ch = changes[i];                                    // 一条变化 { store, id, data }
    if (SYNC_STORES.indexOf(ch.store) < 0) continue;        // 不认识的表拒收
    if (!ch.id || !ch.data) continue;                       // 缺字段拒收
    if (!db.stores[ch.store]) db.stores[ch.store] = {};     // 表不存在先建
    var old = db.stores[ch.store][ch.id];                   // 服务器上已有的同一条
    var newT = ch.data.updatedAt || ch.data.createdAt || 0;  // 新数据的改动时间
    var oldT = old ? (old.data.updatedAt || old.data.createdAt || 0) : -1;  // 旧数据的改动时间
    if (newT >= oldT) {                                     // 新的 >= 旧的 → 采纳（含完全相同）
      db.stores[ch.store][ch.id] = { data: ch.data, rev: Date.now() };  // rev 用服务器时间
      accepted++;                                           // 计数
    }
  }
  if (accepted > 0) saveDb();                               // 有变化就安排写盘
  return accepted;                                          // 告诉客户端收了几条
}

/* 处理拉取：返回 rev 大于 since 的所有数据（含删除墓碑） */
function handlePull(since) {
  var changes = [];                                         // 结果集
  for (var s = 0; s < SYNC_STORES.length; s++) {            // 遍历五张表
    var storeName = SYNC_STORES[s];                         // 表名
    var table = db.stores[storeName];                       // 表内容
    if (!table) continue;                                   // 空表跳过
    var ids = Object.keys(table);                           // 所有主键
    for (var i = 0; i < ids.length; i++) {                  // 逐条检查
      var row = table[ids[i]];                              // { data, rev }
      if (row.rev > since) {                                // 比客户端水位新 → 下发
        changes.push({ store: storeName, id: ids[i], data: row.data });  // 打包
      }
    }
  }
  return changes;                                           // 交给 HTTP 层返回
}

/* 统计服务器上一共存了多少条数据：0 说明是"空库"（刚部署或云主机磁盘被重置）。
   客户端看到这个标记会自动把本机数据全量补传回来（数据自愈，免费云主机也能放心用） */
function totalRows() {
  var n = 0;                                                // 计数器
  for (var s in db.stores) {                                // 遍历每张表
    var table = db.stores[s] || {};                         // 表内容
    for (var id in table) n++;                              // 逐条累加
  }
  return n;                                                 // 总条数
}

/* ==================== 4. HTTP 服务 ==================== */

/* 常用文件的 Content-Type 映射 */
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/plain; charset=utf-8'
};

/* 统一的 JSON 应答 */
function sendJson(res, code, obj) {
  var text = JSON.stringify(obj);                           // 序列化
  res.writeHead(code, {                                     // 响应头
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'                      // 允许跨域（file:// 打开也能连）
  });
  res.end(text);                                            // 发送
}

/* 读请求体（POST 的 JSON） */
function readBody(req) {
  return new Promise(function (resolve, reject) {           // 包成 Promise
    var chunks = [];                                        // 数据块集合
    var size = 0;                                           // 总大小
    req.on('data', function (c) {                           // 收数据
      size += c.length;                                     // 累计
      if (size > 200 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }  // 上限 200MB（照片多）
      chunks.push(c);                                       // 收集
    });
    req.on('end', function () {                             // 收完
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});  // 解析 JSON
      } catch (e) { reject(new Error('JSON 格式错误')); }   // 格式坏了
    });
    req.on('error', reject);                                // 网络错误
  });
}

/* 静态文件服务：把 hwms 文件夹里的文件发给浏览器 */
function serveStatic(req, res, urlPath) {
  var rel = decodeURIComponent(urlPath);                    // 解码（中文文件名）
  if (rel === '/' || rel === '') rel = '/index.html';       // 首页
  var filePath = path.normalize(path.join(WEB_ROOT, rel));  // 拼出真实路径
  if (filePath.indexOf(WEB_ROOT) !== 0) {                   // 路径越界检查（防 .. 攻击）
    res.writeHead(403); res.end('Forbidden'); return;       // 拒绝
  }
  fs.stat(filePath, function (err, st) {                    // 看文件是否存在
    if (err || !st.isFile()) {                              // 不存在
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 找不到文件：' + rel);                    // 提示
      return;
    }
    var ext = path.extname(filePath).toLowerCase();         // 扩展名
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });  // 对应类型
    fs.createReadStream(filePath).pipe(res);                // 流式发送
  });
}

/* 主处理函数：每个 HTTP 请求都到这里 */
var server = http.createServer(function (req, res) {
  var u = req.url || '/';                                   // 完整地址
  var q = u.indexOf('?');                                   // 参数起点
  var urlPath = q >= 0 ? u.slice(0, q) : u;                 // 纯路径
  var query = {};                                           // 查询参数
  if (q >= 0) {                                             // 有参数就解析
    u.slice(q + 1).split('&').forEach(function (kv) {       // a=1&b=2
      var p = kv.indexOf('=');                              // 找等号
      if (p > 0) query[decodeURIComponent(kv.slice(0, p))] = decodeURIComponent(kv.slice(p + 1));  // 收集
    });
  }

  /* 浏览器预检请求（OPTIONS）直接放行 */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  /* ---- 同步接口 ---- */
  /* 密钥校验：服务器设置了 SYNC_KEY 环境变量后，推送/拉取必须带上正确的 x-sync-key 头 */
  function keyOk() {
    if (!SYNC_KEY) return true;                             // 没设密钥 = 不校验（局域网自用）
    if (req.headers['x-sync-key'] === SYNC_KEY) return true;  // 密钥正确 → 放行
    sendJson(res, 401, { ok: false, message: '同步密钥不正确' });  // 密钥不对 → 拒绝
    return false;
  }
  if (urlPath === '/api/ping' && req.method === 'GET') {    // 探活：设置页"测试连接"用
    return sendJson(res, 200, { ok: true, version: VERSION, serverTime: Date.now(), needKey: !!SYNC_KEY });  // needKey 告诉客户端服务器是否要求密钥
  }
  if (urlPath === '/api/pull' && req.method === 'GET') {    // 拉取：客户端下载新变化
    if (!keyOk()) return;                                   // 密钥不对拒收
    var since = parseInt(query.since, 10) || 0;             // 客户端水位
    var changes = handlePull(since);                        // 收集要下发的
    return sendJson(res, 200, { ok: true, serverTime: Date.now(), changes: changes, serverEmpty: totalRows() === 0 });  // serverEmpty 供客户端判断要不要补种数据
  }
  if (urlPath === '/api/push' && req.method === 'POST') {   // 推送：客户端上传自己的变化
    if (!keyOk()) return;                                   // 密钥不对拒收
    readBody(req).then(function (body) {                    // 读请求体
      var accepted = handlePush(body);                      // 合并进内存库
      sendJson(res, 200, { ok: true, accepted: accepted, serverTime: Date.now() });  // 应答
    }).catch(function (err) {                               // 请求体有问题
      sendJson(res, 400, { ok: false, message: err.message });
    });
    return;
  }

  /* ---- 其余路径一律当静态文件处理 ---- */
  serveStatic(req, res, urlPath);
});

/* ==================== 5. 启动 ==================== */

loadDb();                                                   // 先恢复数据
server.listen(PORT, '0.0.0.0', function () {                // 监听所有网卡（局域网可访问）
  console.log('==============================================');
  console.log('  物料管家同步服务器 v' + VERSION + ' 已启动');
  console.log('  本机访问：  http://localhost:' + PORT);
  /* 打印所有局域网地址，方便填到其他设备的"同步服务器地址"里 */
  var ifs = os.networkInterfaces();                         // 全部网卡
  for (var name in ifs) {                                   // 遍历
    (ifs[name] || []).forEach(function (it) {               // 每个地址
      if (it.family === 'IPv4' && !it.internal) {           // 只要 IPv4 的真实地址
        console.log('  局域网访问：http://' + it.address + ':' + PORT + '  （填到其他设备）');
      }
    });
  }
  console.log('  数据文件：  ' + DATA_FILE);
  console.log('  同步密钥：  ' + (SYNC_KEY ? '已启用（请求需带正确的 x-sync-key）' : '未设置（局域网自用可不设；云端部署建议设置 SYNC_KEY 环境变量）'));
  console.log('  关闭服务器：直接关掉本窗口（数据已自动保存）');
  console.log('==============================================');
});

/* 退出前尽力保存一次（Ctrl+C 时） */
process.on('SIGINT', function () {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db), 'utf8'); } catch (e) {}
  process.exit(0);                                          // 退出
});
