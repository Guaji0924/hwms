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

/* 把底层数据库错误翻译成新手看得懂的话（保留原始信息方便进一步排查）。
   没有它，数据库出问题时云端只会返回干巴巴的 500 + "error code: 1101"，
   用户根本不知道该去检查绑定、建表还是等配额恢复。 */
export function friendlyDbError(e) {
  var msg = (e && e.message) || String(e || '未知错误');       // 原始错误信息
  if (/no such table/i.test(msg)) {                           // 表没建
    return '数据库里还没有 sync_rows 表：请在 D1 控制台 Console 执行 d1-schema.sql 里的建表语句';
  }
  if (/daily limit|quota/i.test(msg)) {                       // 免费额度用完
    return '今日 D1 免费额度已用完，北京时间明早 8 点自动恢复（原始信息：' + msg + '）';
  }
  return '数据库访问失败：' + msg;                              // 其他错误原样带上
}

