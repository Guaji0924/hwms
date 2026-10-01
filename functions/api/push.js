/* ============================================================
   push.js —— 推送接口（POST /api/push）
   ------------------------------------------------------------
   客户端把自己"上次同步之后改过的数据"上传到这里合并。
   冲突规则：同一条数据（同 store + id），谁的 updatedAt（没有就用
   createdAt）更新谁赢，和原来的 server.js 完全一致。
   请求体格式：{ device, changes: [{ store, id, data }, ...] }

   性能注意：这里刻意"先一次性读全表，再批量写入"。
   早期版本是每条数据都单独查一次、写一次（1 条 = 2 次数据库往返），
   几百条就是上千次串行往返，光网络延迟就要十几秒，会直接撞上客户端
   30 秒的同步超时 —— 表现就是"同步特别久，然后提示同步异常"。
   改成现在这样以后，往返次数从上千次降到个位数。
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
  var now = Date.now();                                      // 本次请求统一用这个服务器时间当 rev

  /* 3. 一次性把服务器现有的行读出来，建立索引：key → { t, data }
     这样每条数据都不用再单独查一次数据库（原来最耗时的就是这一步）。 */
  var existing = {};                                         // 服务器现有行的索引
  var allRows = await env.DB.prepare('SELECT store, id, data FROM sync_rows').all();  // 一次读全表
  var list = (allRows && allRows.results) || [];             // 结果数组
  for (var r = 0; r < list.length; r++) {                    // 逐行建索引
    var rowData = {};                                        // 解析出来的内容
    try { rowData = JSON.parse(list[r].data) || {}; } catch (e) { rowData = {}; }  // 历史脏数据读不出来就当空对象
    existing[list[r].store + '\u0000' + String(list[r].id)] = {                     // 记入索引
      t: rowData.updatedAt || rowData.createdAt || 0,         // 这一行在服务器上的改动时间
      data: rowData                                            // 解析后的内容（全量快照模式要用）
    };
  }

  /* 4. 逐条合并：把要写的 SQL 攒进数组，最后一次性批量提交 */
  var stmts = [];                                            // 待执行的 SQL 语句
  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i];

    /* 表名不在白名单 / 缺字段的，一律跳过 */
    if (SYNC_STORES.indexOf(ch.store) < 0) continue;
    if (!ch.id || !ch.data) continue;

    var newT = ch.data.updatedAt || ch.data.createdAt || 0;   // 新数据的改动时间
    var hit = existing[ch.store + '\u0000' + String(ch.id)];  // 服务器上已有的同一条（可能不存在）
    var oldT = hit ? hit.t : -1;                              // 没有旧数据就记 -1（表示"必收录"）

    /* 新的 >= 旧的才采纳（含完全相同，用于补种） */
    if (newT >= oldT) {
      /* 有就更新、没有就插入（SQLite 的 UPSERT 写法） */
      stmts.push(env.DB.prepare(
        'INSERT INTO sync_rows (store, id, data, rev) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, rev = excluded.rev'
      ).bind(ch.store, String(ch.id), JSON.stringify(ch.data), now));
      accepted++;
    }
  }

  /* 5. 全量快照模式（请求体带 full: true）
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
    for (var key in existing) {                                // 遍历服务器上现有的每一行
      if (!Object.prototype.hasOwnProperty.call(existing, key)) continue;  // 只看自己的属性
      var store = key.split('\u0000')[0];                      // 还原表名
      if (SYNC_STORES.indexOf(store) < 0) continue;             // 白名单外的不管
      if (store === 'settings') continue;                       // 分类树不参与整体清理，避免把各端的物料分类清空
      if (keep[key]) continue;                                  // 快照里有这一行：保留
      if (existing[key].data.deleted) continue;                  // 已经是墓碑了，跳过
      existing[key].data.deleted = true;                         // 打上删除墓碑
      existing[key].data.updatedAt = now;                        // 时间用服务器时间，保证盖过各端本地的时间戳
      stmts.push(env.DB.prepare(                                 // 更新这一行
        'UPDATE sync_rows SET data = ?, rev = ? WHERE store = ? AND id = ?'
      ).bind(JSON.stringify(existing[key].data), now, store, key.split('\u0000')[1]));
      tombstoned++;                                              // 计数
    }
  }

  /* 6. 分批提交：每 100 条一组，避免一次塞太多语句 */
  for (var b = 0; b < stmts.length; b += 100) {
    await env.DB.batch(stmts.slice(b, b + 100));
  }

  return json({ ok: true, accepted: accepted, tombstoned: tombstoned, serverTime: Date.now() });
}
