/* ============================================================
   pull.js —— 拉取接口（GET /api/pull?since=时间戳）
   ------------------------------------------------------------
   客户端用它下载"别人在这之后改过的数据"。
   since 是客户端上一次同步到的时间点，凡是 rev（服务器收到时间）
   大于 since 的行都下发。返回 serverEmpty 标记空库，
   让客户端决定要不要把本机数据全量补传回来（数据自愈）。
   ============================================================ */

import { json } from '../_shared.js';

export async function onRequest(context) {
  /* 1. 解析 since 参数：客户端的上次同步水位 */
  var url = new URL(context.request.url);
  var since = parseInt(url.searchParams.get('since'), 10) || 0;

  /* 2. 查出所有 rev > since 的数据，按时间从旧到新排序 */
  var rows = await context.env.DB.prepare(
    'SELECT store, id, data FROM sync_rows WHERE rev > ? ORDER BY rev ASC'
  ).bind(since).all();

  /* 3. 把每一行还原成前端认识的样子（data 是 JSON 字符串，要解开） */
  var changes = [];
  for (var i = 0; i < rows.results.length; i++) {
    var row = rows.results[i];
    changes.push({ store: row.store, id: row.id, data: JSON.parse(row.data) });
  }

  /* 4. 统计一共存了多少条数据，0 条 = 空库 */
  var count = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM sync_rows').first();

  return json({
    ok: true,
    serverTime: Date.now(),
    changes: changes,
    serverEmpty: (count.n === 0)                             // 空库标记，供客户端补种
  });
}