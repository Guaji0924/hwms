/* ============================================================
   pull.js —— 拉取接口（GET /api/pull?since=时间戳）
   ------------------------------------------------------------
   客户端用它下载"别人在这之后改过的数据"。
   since 是客户端上一次同步到的时间点，凡是 rev（服务器收到时间）
   大于 since 的行都下发。返回 serverEmpty 标记空库，
   让客户端决定要不要把本机数据全量补传回来（数据自愈）。
   ============================================================ */

import { json, friendlyDbError } from '../_shared.js';

export async function onRequest(context) {
  /* 0. 先检查 D1 绑定：没绑定的话 env.DB 是 undefined，
     直接访问 .prepare 会抛 TypeError 变成裸 500，不如明说哪里没配 */
  if (!context.env || !context.env.DB) {
    return json({ ok: false, message: 'D1 数据库未绑定：请在 Pages 项目 Settings → Bindings 里把数据库绑定为 DB，然后重新部署' }, 500);
  }

  /* 1. 解析 since 参数：客户端的上次同步水位 */
  var url = new URL(context.request.url);
  var since = parseInt(url.searchParams.get('since'), 10) || 0;

  /* 2. 先取"截止时刻"，再查数据 —— 顺序不能反。
     客户端会把返回的 serverTime 当作下次的 since（水位线）。如果先查数据、
     最后才取当前时间，那么在这两步之间刚被别的设备推上来的行（比如"删除成员"
     的墓碑）就不会出现在本次结果里，却又被水位线跳过去了 —— 这条变化会被
     永久漏掉，被删的成员在其他设备上就永远删不掉。先取时刻就不会出现这种情况。 */
  var now = Date.now();                                        // 本次同步的截止时刻（水位线）

  /* 3. 查出所有 rev > since 的数据，按时间从旧到新排序 */
  var rows;
  try {
    rows = await context.env.DB.prepare(
      'SELECT store, id, data FROM sync_rows WHERE rev > ? ORDER BY rev ASC'
    ).bind(since).all();
  } catch (e) {                                                // 数据库出错：返回人话错误而不是裸 500
    return json({ ok: false, message: friendlyDbError(e) }, 500);
  }

  /* 4. 把每一行还原成前端认识的样子（data 是 JSON 字符串，要解开）
     容错：万一某一行 data 损坏解析不了，跳过它继续发其余的 ——
     不能让一行脏数据把整轮拉取打成 500，否则所有设备都同步瘫痪 */
  var changes = [];
  for (var i = 0; i < rows.results.length; i++) {
    var row = rows.results[i];
    var data;
    try { data = JSON.parse(row.data); } catch (e) { continue; }  // 脏行跳过，不拖垮整轮
    changes.push({ store: row.store, id: row.id, data: data });
  }

  /* 5. 判断服务器是不是空库（决定客户端要不要把本机数据全量补传回来）
     注意：这里**不要用 SELECT COUNT(*) 数总数** —— Cloudflare 把"读取额度"
     算作"查询扫描过的行数"，COUNT(*) 要扫全表，而客户端每 30 秒就拉一次，
     一天下来会把 5,000,000 行/天的读取额度吃光。改成只探一行即可，
     扫描行数从"表内总行数"降到 1，效果完全一样。 */
  var one;                                                     // 探测结果（null = 空库）
  try {
    one = await context.env.DB.prepare('SELECT 1 FROM sync_rows LIMIT 1').first();
  } catch (e) {                                                // 数据库出错：返回人话错误而不是裸 500
    return json({ ok: false, message: friendlyDbError(e) }, 500);
  }

  return json({
    ok: true,
    serverTime: now,
    changes: changes,
    serverEmpty: !one                                       // 空库标记，供客户端补种
  });
}