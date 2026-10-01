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
  var force = !!(body && body.force);                        // force=true：允许"复活"已删除的账号（恢复备份时用）
  var now = Date.now();                                      // 本次请求统一用这个服务器时间当 rev

  /* 账号上"只有管理员能改"的权限字段。
     这些字段不看整行的 updatedAt，改看 permAt（权限最后修改时间），
     原因见下面合并循环里的详细说明。 */
  var USER_PERM_FIELDS = ['deleted', 'active', 'role', 'passwordHash', 'salt',
                          'canManage', 'pwdChanged', 'username', 'cls'];

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

    /* ---------- 账号（users 表）的两条铁律 ----------
       这两条都刻意"不比时间戳"，因为各设备时钟有快慢（手机常比电脑快几十秒），
       一旦按时间戳比大小，管理员的删除动作反而会被当成"过期消息"丢掉。 */

    /* 铁律一：删除是终态，永远优先。
       被删成员只要在自己设备上刷新一下页面，就会更新"最近使用时间"，
       那条"还活着"的记录时间戳比墓碑还新 —— 按下面常规的时间戳规则，
       墓碑会被判为过期而丢弃，账号永远删不掉，成员还能继续登记出入库。
       所以只要这一条是墓碑，一律无条件采纳。 */
    var incomingUserTombstone = (ch.store === 'users' && !!ch.data.deleted);

    /* 铁律二：不允许"复活"。服务器上已经是墓碑的账号，任何设备都不能再用一条
       "还活着"的记录覆盖回来（成员端刷新一次时间戳就会变成这样）。
       两个例外：① 固定 id 的兜底管理员 —— 它是"防止系统失去所有管理员"的保险，
       初始化时会重建，必须允许恢复；② force=true —— 只有管理员恢复备份 /
       初始化全库快照时才带，此时本机快照就是权威，允许把账号恢复回来。 */
    if (!force && ch.store === 'users' && !incomingUserTombstone &&
        String(ch.id) !== 'user_bootstrap_admin' &&
        hit && hit.data.deleted) {
      continue;                                               // 拒绝复活：保持删除状态
    }

    /* ---------- 账号权限字段的单独保护 ----------
       背景：成员端每次打开 / 刷新页面都会更新"最近使用时间"，整行的 updatedAt
       因此被顶到最新，而它那条记录里的"启用状态 / 角色 / 密码"还是从服务器上
       抄下来的旧值。如果这些权限字段也跟着比 updatedAt，管理员刚做完的
       "停用 / 改角色 / 重置密码"就会被成员端的日常活动覆盖回去 ——
       表现就是被停用的成员照样能登录、照样能登记出入库。
       所以权限字段单独用 permAt（权限最后修改时间）判定：
       · 上传方没带 permAt（只是刷新最近使用时间这类日常活动）→ 权限字段一律沿用服务器上的；
       · 上传方带了 permAt → 谁的 permAt 新谁赢。
       注意：删除墓碑在上面的"铁律一"里已经无条件采纳，不会被这里剥掉；
       固定 id 的兜底管理员也不受本规则约束 —— 它是"防止系统失去所有管理员"的保险，
       必须保证任何时候都能被恢复回来（否则被删掉就再也救不回来了）。 */
    if (!force && ch.store === 'users' && hit && !incomingUserTombstone &&
        String(ch.id) !== 'user_bootstrap_admin') {
      var oldPerm = hit.data.permAt || 0;                      // 服务器上"权限最后一次被改"的时间
      var newPerm = ch.data.permAt || 0;                       // 上传方"权限最后一次被改"的时间
      if (newPerm <= oldPerm) {                                // 上传方没有改权限（或改得更早）
        for (var pf = 0; pf < USER_PERM_FIELDS.length; pf++) {  // 逐个字段还原成服务器上的值
          ch.data[USER_PERM_FIELDS[pf]] = hit.data[USER_PERM_FIELDS[pf]];
        }
        ch.data.permAt = hit.data.permAt;                      // 权限时间也跟着还原
      }
    }

    /* 新的 >= 旧的才采纳（含完全相同，用于补种）；
       墓碑、以及 force 模式下的账号，都不看时间戳，直接放行。 */
    if (incomingUserTombstone || (force && ch.store === 'users') || newT >= oldT) {
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
