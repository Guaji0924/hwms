/* ============================================================
   push.js —— 推送接口（POST /api/push）
   ------------------------------------------------------------
   客户端把自己"上次同步之后改过的数据"上传到这里合并。
   冲突规则：同一条数据（同 store + id），谁的 updatedAt（没有就用
   createdAt）更新谁赢，和原来的 server.js 完全一致。
   请求体格式：{ device, changes: [{ store, id, data }, ...] }
   ============================================================ */

import { json, SYNC_STORES } from '../_shared.js';

export async function onRequest(context) {
  var req = context.request;
  var env = context.env;

  /* 1. 只收 POST */
  if (req.method !== 'POST') return json({ ok: false, message: '请用 POST 方式' }, 405);

  /* 2. 读请求体（JSON） */
  var body = {};
  try {
    body = await req.json();
  } catch (e) {
    return json({ ok: false, message: 'JSON 格式错误' }, 400);
  }

  var changes = (body && body.changes) || [];                // 要合并的变化列表
  var accepted = 0;                                          // 实际采纳的条数

  /* 3. 逐条合并 */
  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i];

    /* 表名不在白名单 / 缺字段的，一律跳过 */
    if (SYNC_STORES.indexOf(ch.store) < 0) continue;
    if (!ch.id || !ch.data) continue;

    /* 新数据的改动时间 */
    var newT = ch.data.updatedAt || ch.data.createdAt || 0;

    /* 查服务器上已有的同一条（可能不存在） */
    var oldRow = await env.DB.prepare(
      'SELECT data FROM sync_rows WHERE store = ? AND id = ?'
    ).bind(ch.store, String(ch.id)).first();

    /* 旧数据的改动时间；没有旧数据就记 -1（表示"必收录"） */
    var oldT = -1;
    if (oldRow) {
      try {
        var oldData = JSON.parse(oldRow.data);
        oldT = oldData.updatedAt || oldData.createdAt || 0;
      } catch (e) { /* 历史脏数据读不出来就当没有 */ }
    }

    /* 新的 >= 旧的才采纳（含完全相同，用于补种） */
    if (newT >= oldT) {
      var rev = Date.now();                                  // 用服务器时间当"收到时间"
      /* 有就更新、没有就插入（SQLite 的 UPSERT 写法） */
      await env.DB.prepare(
        'INSERT INTO sync_rows (store, id, data, rev) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, rev = excluded.rev'
      ).bind(ch.store, String(ch.id), JSON.stringify(ch.data), rev).run();
      accepted++;
    }
  }

  return json({ ok: true, accepted: accepted, serverTime: Date.now() });
}