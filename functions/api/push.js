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

  /* 4. 全量快照模式（请求体带 full: true）
     把服务器上"本次没上传的行"统一打成删除墓碑。
     为什么需要它：数据在多端之间已经不一致时（早期版本的清空/初始化是真删，
     别的设备根本不知道要删），那些旧行会永远留在服务器和其他设备上 ——
     它们没有任何设备还记得，所以谁也传不出它们的"删除"动作，只能由服务器
     按"以本次上传的完整快照为准"来清理。
     注意这里必须打墓碑而不是直接删行：只有墓碑才会带着新的 rev 被其他设备拉走，
     其他设备才会跟着删掉；直接删行的话它们永远不知道，反而会再推回来。 */
  var tombstoned = 0;                                          // 被清理掉的行数
  if (body && body.full) {                                     // 客户端要求以它为完整快照
    var keep = {};                                             // 本次快照里要保留的行
    for (var j = 0; j < changes.length; j++) {                 // 遍历上传内容
      if (SYNC_STORES.indexOf(changes[j].store) < 0) continue;  // 白名单外的忽略
      if (!changes[j].id) continue;                             // 没有主键的忽略
      keep[changes[j].store + '\u0000' + String(changes[j].id)] = true;  // 记下"要保留"
    }
    var now = Date.now();                                      // 统一用服务器时间，避免各端时钟不一致
    var allRows = await env.DB.prepare('SELECT store, id, data FROM sync_rows').all();  // 服务器现有全部行
    var list = (allRows && allRows.results) || [];             // 结果数组
    for (var k = 0; k < list.length; k++) {                    // 逐行检查
      var row = list[k];                                       // 当前行
      if (SYNC_STORES.indexOf(row.store) < 0) continue;         // 白名单外的不管
      if (row.store === 'settings') continue;                   // 分类树不参与整体清理，避免把各端的物料分类清空
      if (keep[row.store + '\u0000' + String(row.id)]) continue;  // 快照里有这一行：保留
      var d = {};                                              // 解析原有内容
      try { d = JSON.parse(row.data) || {}; } catch (e) { d = {}; }  // 历史脏数据读不出来就当空对象
      if (d.deleted) continue;                                  // 已经是墓碑了，跳过
      d.deleted = true;                                         // 打上删除墓碑
      d.updatedAt = now;                                        // 时间用服务器时间，保证盖过各端本地的时间戳
      await env.DB.prepare(                                     // 更新这一行
        'UPDATE sync_rows SET data = ?, rev = ? WHERE store = ? AND id = ?'
      ).bind(JSON.stringify(d), now, row.store, String(row.id)).run();
      tombstoned++;                                             // 计数
    }
  }

  return json({ ok: true, accepted: accepted, tombstoned: tombstoned, serverTime: Date.now() });
}