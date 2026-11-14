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

  /* 3. 分页查出 rev > since 的数据，按 (rev, store, id) 从旧到新排序。
     为什么分页：设备攒了几天的变化可能有几 MB，一个请求打包返回，
     在劣化网络（pages.dev 被间歇干扰等）下传输一半就被掐断，重试又从头来，
     永远同步不完。拆成每页 limit 条，小包存活率高得多。
     游标用 (rev, store, id) 三个值：同一次推送写入的多行共享同一个 rev（push
     统一用一个时间戳当 rev），只按 rev 翻页会把 rev 相同的行漏掉；
     用 store+id 做并列第二名，配合 (rev, store, id) 复合索引能走
     "SEARCH 覆盖索引"的范围查询（不是全表扫描，不烧读取额度）。
     兼容性：不带 limit 参数的旧客户端 = 不分页，一次返回全部（老行为不变）。 */
  var limit = parseInt(url.searchParams.get('limit'), 10) || 0;    // 每页条数上限（0 = 不分页；实际还会被字节数进一步压小，见下面）
  var cursorRevParam = url.searchParams.get('cursorRev');          // 游标：上一页最后一条的 rev
  var cursorStoreParam = url.searchParams.get('cursorStore');      // 游标：上一页最后一条的表名
  var cursorIdParam = url.searchParams.get('cursorId');            // 游标：上一页最后一条的主键
  var rows;
  try {
    if (limit > 0 && cursorRevParam !== null) {                    // 翻页：从游标之后接着取
      rows = await context.env.DB.prepare(
        'SELECT rev, store, id, data FROM sync_rows ' +
        'WHERE (rev, store, id) > (?, ?, ?) ORDER BY rev ASC, store ASC, id ASC LIMIT ?'
      ).bind(parseInt(cursorRevParam, 10) || 0, cursorStoreParam || '', cursorIdParam || '', limit + 1).all();  // 多取 1 条用来探路
    } else if (limit > 0) {                                        // 第一页：从水位之后取
      rows = await context.env.DB.prepare(
        'SELECT rev, store, id, data FROM sync_rows ' +
        'WHERE rev > ? ORDER BY rev ASC, store ASC, id ASC LIMIT ?'
      ).bind(since, limit + 1).all();                              // 同样多取 1 条
    } else {                                                       // 旧客户端：一次全给（不分页）
      rows = await context.env.DB.prepare(
        'SELECT store, id, data FROM sync_rows WHERE rev > ? ORDER BY rev ASC'
      ).bind(since).all();
    }
  } catch (e) {                                                    // 数据库出错：返回人话错误而不是裸 500
    return json({ ok: false, message: friendlyDbError(e) }, 500);
  }

  /* 分页裁剪：条数和字节双上限，取先到的那个。
     为什么不能只按条数：物料行里存着 base64 照片，单行可能几百 KB，
     按"每页 50 条"切，一页仍可能好几 MB —— 在劣化网络（实测约 15KB/s）下
     30 秒超时内根本传不完，这一页就永远过不去。按字节截断到约 300KB
     （和推送端 pushChanges 的 300KB 一批对齐），小包才能活着到达。
     例外：单行本身就超过 300KB 时也完整发出（一条数据没法拆两半），
     这种页会大一点，只能指望更好的网络窗口了。
     旧客户端（不带 limit 参数）不裁剪，仍然一次返回全部。 */
  var PAGE_BYTES = 300 * 1024;                                      // 每页字节上限（约 300KB）
  var enc = new TextEncoder();                                      // 精确计量字节数（中文 1 字 = 3 字节，base64 1 字符 = 1 字节）
  var hasMore = false;                                              // 还有下一页吗
  if (limit > 0) {                                                  // 只有分页模式才裁剪
    var usedBytes = 0;                                              // 本页已累计的字节
    var keep = 0;                                                   // 本页实际保留多少条
    while (keep < rows.results.length) {                            // 逐条往本页里装
      var rowBytes = enc.encode(rows.results[keep].data || '').length;  // 这一条的字节数
      if (keep > 0 && usedBytes + rowBytes > PAGE_BYTES) break;     // 装不下就停（第一条永远放行，再大也得完整发出）
      usedBytes += rowBytes;                                        // 装得下就计入
      keep++;
    }
    if (keep < rows.results.length) {                               // 有取回来但装不下的 → 一定还有下一页
      rows.results.length = keep;                                   // 本页只保留装得下的那些
      hasMore = true;
    } else if (rows.results.length > limit) {                       // 全装下了，但取满了 limit+1 条（探路的那条出现了）
      rows.results.length = limit;                                  // 丢掉第 limit+1 条（只用来探路）
      hasMore = true;
    }
  }
  var lastRow = rows.results.length ? rows.results[rows.results.length - 1] : null;  // 本页最后一条（做下一页的游标）

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
    serverEmpty: !one,                                        // 空库标记，供客户端补种
    hasMore: hasMore,                                         // 还有下一页吗（旧客户端不认，无影响）
    cursorRev: lastRow ? lastRow.rev : 0,                     // 翻页游标：本页最后一条的 rev
    cursorStore: lastRow ? lastRow.store : '',                // 翻页游标：本页最后一条的表名
    cursorId: lastRow ? lastRow.id : ''                       // 翻页游标：本页最后一条的主键
  });
}