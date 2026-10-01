/* ============================================================
   _shared.js —— 同步接口共用的工具函数
   ------------------------------------------------------------
   三个接口（ping/pull/push）都会用到的几样东西放这里，
   避免每个文件重复写一遍。下划线开头 = 不会被当成页面路由。
   前端 sync.js 完全不改，接口格式和原来的 server.js 保持一致。
   ============================================================ */

/* 允许同步的表：物料 / 出入库记录 / 用户 / 操作日志 / 设置（只同步分类树）
   不在这名单里的表一律拒收，防止坏数据写进来 */
export var SYNC_STORES = ['materials', 'records', 'users', 'logs', 'settings'];

/* 服务器版本号：前端只是显示一下，不会因为版本号不同而拒绝连接 */
export var VERSION = '2.0-cf';

/* 统一的 JSON 应答：把对象转成 JSON 字符串，带上正确的内容类型头 */
export function json(obj, status) {
  status = status || 200;                                    // 默认 200 成功
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/* 同步密钥校验：返回 null 表示"通过"，返回一个 401 响应表示"拒绝"
   规则和 server.js 一样：服务器没设 SYNC_KEY 就不校验（谁都能用）；
   设了就必须带上正确的 x-sync-key 请求头才放行。
   比较用的是时序安全比较（crypto.subtle.timingSafeEqual，
   Cloudflare Workers 提供的非标准扩展），逐字节比较耗时一致，
   防止攻击者根据"比较快慢"一点点猜出密钥内容。 */
export function checkKey(request, env) {
  if (!env.SYNC_KEY) return null;                            // 没设密钥 → 不校验
  var given = request.headers.get('x-sync-key') || '';        // 客户端带来的密钥
  var expected = env.SYNC_KEY;                               // 服务器配置的密钥
  if (given.length !== expected.length) {                    // 长度先比（timingSafeEqual 要求两边等长，长度不等没有可比性）
    return json({ ok: false, message: '同步密钥不正确' }, 401);
  }
  var a = new TextEncoder().encode(given);                   // 转成字节数组再比
  var b = new TextEncoder().encode(expected);
  if (crypto.subtle.timingSafeEqual(a, b)) return null;      // 逐字节等时比较 → 密钥对 → 放行
  return json({ ok: false, message: '同步密钥不正确' }, 401);  // 密钥错 → 拒绝
}