/* ============================================================
   sync.js —— 多端同步引擎（离线优先）
   ------------------------------------------------------------
   设计思路（给新手的白话版）：
   1. 所有数据本来就存在"本机浏览器数据库"（IndexedDB）里，
      所以断网时查询、登记完全不受影响 —— 这叫"离线优先"。
   2. 每条数据都有 updatedAt（最后修改时间）。同步时：
      · 把本机"上次同步之后改过的数据"上传给服务器（推 push）
      · 把服务器上"新于上次同步的数据"下载回来覆盖本机（拉 pull）
   3. 两边都改了同一条怎么办？—— 谁的 updatedAt 更新谁赢，
      这是最简单可靠的做法，协会场景够用。
   4. 删除不是真删，而是打上 deleted 标记（墓碑），
      这样"删除"这个动作才能被同步到其他设备。
   5. 有网时每 8 秒自动同步一次；刚断网恢复、刚回到页面时
      也会立刻同步 —— 平时完全不用管它。
   服务器端见 server/server.js（一个零依赖的 Node 小服务器）。
   ============================================================ */

/* ==================== 0. 协会统一的默认同步配置 ==================== */
/* admin 在服务器端设置后，全体成员打开网页就自动从服务器拉取配置，谁都不用自己填；
   成员仍可在「系统设置 → 多端同步」里单独改，改过之后优先用他自己填的。 */
var SYNC_DEFAULT = {
  enabled: true,     // 默认就开启多端同步（填 false 则默认不开，需要各自手动开启）
  url: ''            // 服务器地址：留空 = 自动用"网页自己的地址"
};

/* 取"网页自己的地址"：只有通过 http / https 打开才有意义（双击本地文件没有服务器） */
function syncOwnOrigin() {
  if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;  // 有域名就返回它
  return '';                                                                                     // file:// 打开：拿不到服务器地址
}

/* ---------- 带超时的 fetch：给所有同步网络请求加一个"最多等多久"的上限 ----------
   为什么需要它：服务器地址写错、手机连的不是同一个网络时，请求可能一直挂着不返回，
   同步就会永远卡在"同步中"，之后点"立即同步"全都变成假的 0 条，真正的故障被藏起来。
   这里统一加 30 秒上限，超时就中断并抛出一句人话错误，让问题暴露出来。 */
async function fetchWithTimeout(url, options, ms) {
  var ctrl = new AbortController();                                    // 中断控制器
  var timer = setTimeout(function () { ctrl.abort(); }, ms || 30000);  // 到点自动中断
  var opt = Object.assign({}, options || {}, { signal: ctrl.signal }); // 把中断信号挂到请求上
  try {
    return await fetch(url, opt);                                      // 正常发请求
  } catch (e) {
    /* 被我们主动中断的请求，错误信息换成新手看得懂的话 */
    if (e && e.name === 'AbortError') throw new Error('连接同步服务器超时（30 秒无响应）：请检查"同步服务器地址"是否写对、本机和服务器是否在同一个网络');
    throw e;                                                           // 其他网络错误（如断网）原样抛出
  } finally {
    clearTimeout(timer);                                               // 无论成败都要清掉定时器
  }
}

/* 从服务器拉取最新同步配置（admin 改后成员自动同步） */
async function fetchServerConfig() {
  try {
    var origin = syncOwnOrigin();                                // 当前网页的域名
    if (!origin) return null;                                    // file:// 打开：没有服务器
    var res = await fetchWithTimeout(origin + '/api/sync-config', {  // 请求服务器配置（带超时，避免卡住启动）
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }, 8000);
    if (!res.ok) return null;                                    // 服务器没这个接口（旧版本）
    var data = await res.json();                                 // 解析应答
    if (!data || !data.ok) return null;                          // 服务器返回错误
    return {
      enabled: data.enabled !== false,                           // 默认 true
      url: data.url || ''                                        // 服务器指定的地址（留空 = 用当前域名）
    };
  } catch (e) {
    return null;                                                 // 网络错误、服务器未启动等
  }
}

/* ==================== 1. 同步引擎主体 ==================== */

var Sync = {
  /* 运行状态（内存里，不进数据库） */
  state: {
    enabled: false,          // 是否启用同步（默认取 SYNC_DEFAULT.enabled，成员可在设置页改）
    url: '',                 // 实际使用的服务器地址（已解析：成员自己填的 > 协会默认 > 网页自己的地址）
    userUrl: '',             // 成员自己在设置页填的地址（留空 = 用协会默认）
    device: '',              // 本机设备名（方便在服务器日志里认账）
    lastSync: 0,             // 上次同步到的时间点（毫秒），下次只同步这之后的变化
    syncing: false,          // 正在同步中（防止重复跑）
    lastError: '',           // 最近一次失败的错误信息（给顶栏图标提示用）
    timer: null              // 定时同步的句柄
  },

  /* 需要同步的表：物料 / 出入库记录 / 用户 / 操作日志
     settings 表特殊：只同步"物料分类树"，其余（AI 配置、同步配置等）留在本机 */
  STORES: ['materials', 'records', 'users', 'logs'],

  /* ---------- 合成实际要用的服务器地址 ----------
     优先级：成员自己填的 > 协会默认（SYNC_DEFAULT） > 网页自己的地址
     成员留空就自动跟随协会统一设置，不用自己填任何东西 */
  resolve: function (userUrl) {
    this.state.userUrl = userUrl || '';                                              // 记下成员自己填的地址（可能为空）
    this.state.url = this.state.userUrl || SYNC_DEFAULT.url || syncOwnOrigin();      // 依次回退，取到第一个非空的
  },

  /* ---------- 启动：应用初始化时调用一次 ---------- */
  init: async function () {
    var cfg = await DB.getSetting('syncConfig', null);          // 读本机保存的配置（从没配过是 null）
    this.state.device = cfg ? (cfg.device || '') : '';          // 设备名
    this.state.lastSync = cfg ? (cfg.lastSync || 0) : 0;        // 上次同步时间

    /* 第一步：尝试从服务器拉取最新配置（admin 改后成员自动同步） */
    var serverCfg = await fetchServerConfig();                   // 请求服务器配置
    if (serverCfg) {
      SYNC_DEFAULT.enabled = serverCfg.enabled;                  // 更新默认配置
      SYNC_DEFAULT.url = serverCfg.url;
    }

    /* 开关：成员在设置页手动定过（enabledSet）就用他的，否则跟随服务器/协会默认 */
    this.state.enabled = (cfg && cfg.enabledSet) ? !!cfg.enabled : !!SYNC_DEFAULT.enabled;
    this.resolve(cfg ? cfg.url : '');                           // 合成服务器地址
    if (!this.state.url) this.state.enabled = false;            // 拿不到服务器地址（如本地双击打开）→ 只能本地模式

    var self = this;                                            // 保存 this
    /* 浏览器"联网/断网"事件：网络一恢复就立刻同步一次 */
    window.addEventListener('online', function () {
      updateNetState();                                         // 先刷新顶栏图标
      if (self.state.enabled) self.syncNow().catch(function () {});  // 立刻补传离线期间的改动
    });
    window.addEventListener('offline', function () { updateNetState(); });  // 断网：刷新图标即可
    /* 从后台切回页面时也同步一次（手机上很常用） */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && self.state.enabled && navigator.onLine) {
        self.syncNow().catch(function () {});
      }
    });
    this.startTimer();                                          // 启动定时同步
    updateNetState();                                           // 刷新顶栏图标
    /* 启动时就试一次（有网且启用时静默同步，失败不打扰用户） */
    if (this.state.enabled && navigator.onLine) this.syncNow().catch(function () {});
  },

  /* ---------- 设置页保存配置后调用：立即生效 ---------- */
  applyConfig: function (cfg) {
    this.state.enabled = !!cfg.enabled;                         // 开关（成员自己定的）
    this.state.device = cfg.device || '';                       // 设备名
    this.state.lastSync = cfg.lastSync || 0;                    // 保留上次同步时间
    this.state.lastError = '';                                  // 清空旧错误
    this.resolve(cfg.url);                                      // 合成服务器地址
    if (!this.state.url) this.state.enabled = false;            // 没地址就没法同步，退回本地模式
    this.startTimer();                                          // 重启定时器
    updateNetState();                                           // 刷新顶栏
    if (this.state.enabled && navigator.onLine) this.syncNow().catch(function () {});  // 立刻试同步
  },

  /* ---------- 定时同步：每 8 秒检查一次 ---------- */
  startTimer: function () {
    if (this.state.timer) clearInterval(this.state.timer);      // 先清掉旧定时器
    var self = this;                                            // 保存 this
    this.state.timer = setInterval(function () {                // 周期任务
      if (self.state.enabled && navigator.onLine && !self.state.syncing) {  // 条件满足才跑
        self.syncNow().catch(function () {});                   // 静默失败（不打扰）
      }
    }, 8000);                                                   // 8 秒一轮
  },

  /* ---------- 同步请求统一使用的请求头 ---------- */
  authHeaders: function () {
    return { 'Content-Type': 'application/json' };              // 只声明 JSON 请求体
  },

  /* ---------- 收集本机待上传的变化 ----------
     规则：updatedAt（没有就用 createdAt）大于 lastSync 的都算"改过"，
     包括墓碑（deleted 标记的数据，删除也要同步出去） */
  collectLocalChanges: async function (since) {
    var changes = [];                                           // 结果集
    for (var s = 0; s < this.STORES.length; s++) {              // 遍历四张表
      var store = this.STORES[s];                               // 表名
      var rows = await DB.all(store);                           // 全量读取（数据量不大，简单可靠）
      for (var i = 0; i < rows.length; i++) {                   // 逐条检查
        var t = rows[i].updatedAt || rows[i].createdAt || 0;    // 这条数据的"改动时间"
        /* 自愈：早期版本写下的数据可能根本没有时间戳（比如旧的日志只有 time 字段），
           算出来 t=0，永远不满足"晚于上次同步"，会一直卡在本机传不出去。
           这里就地补上时间戳（优先用记录里的 time，没有就用当前时间），
           补完当场就能上传 —— 不用让用户手动清理，历史数据自己会补回来。 */
        if (t === 0) {                                          // 没有时间戳 = 老数据
          t = rows[i].time || Date.now();                       // 用记录自带的时间，退而求其次用当前时间
          rows[i].createdAt = t;                                // 补创建时间
          rows[i].updatedAt = t;                                // 补修改时间
          await DB.put(store, rows[i]);                         // 写回本机（下次就不会再补了）
        }
        if (since === 0 || t > since) {                         // 晚于上次同步才上传；since=0 是"全量补种"，一条不落
          changes.push({ store: store, id: rows[i].id, data: rows[i] });  // 打包
        }
      }
    }
    /* settings 表只同步"物料分类树"这一项（让自定义分类也能多端共享） */
    var catRow = await DB.get('settings', 'categoryTree');       // 读原始行（带 updatedAt）
    if (catRow && (since === 0 || (catRow.updatedAt || 0) > since)) {  // 改过才传；since=0 全量补种时也要带上
      changes.push({ store: 'settings', id: 'categoryTree', data: catRow });  // 打包整行
    }
    return changes;                                             // 交给调用方上传
  },

  /* ---------- 执行一轮完整同步：先推后拉 ---------- */
  syncNow: async function () {
    /* 已经有一轮同步在跑（比如 8 秒定时任务刚触发，或上一轮请求卡住）：
       不能返回 0 条冒充成功，否则"立即同步"按钮会谎报"同步完成：上传 0 条"。
       这里返回 busy 标记，让按钮提示用户稍等，真实错误才不会被掩盖 */
    if (this.state.syncing) return { pushed: 0, pulled: 0, busy: true };
    if (!this.state.enabled) throw new Error('尚未启用同步，请先到 系统设置 里开启');   // 没开
    if (!navigator.onLine) throw new Error('当前设备没有联网');  // 断网
    if (!this.state.url) throw new Error('尚未填写同步服务器地址');  // 没地址
    this.state.syncing = true;                                  // 上锁
    updateNetState();                                           // 顶栏显示"同步中"
    try {
      /* 第一步：把本机的新变化推给服务器 */
      var local = await this.collectLocalChanges(this.state.lastSync);  // 收集
      var pushed = 0;                                           // 实际推送条数
      if (local.length > 0) {                                   // 有东西才推
        var pushRes = await fetchWithTimeout(this.state.url + '/api/push', {  // 推送接口（带 30 秒超时）
          method: 'POST',                                       // POST 方式
          headers: this.authHeaders(),                          // JSON 请求体
          body: JSON.stringify({ device: this.state.device, changes: local })  // 数据
        });
        if (pushRes.status === 401) throw new Error('服务器拒绝访问（401）：请确认"同步服务器地址"是否正确');  // 401 = 服务器不接受这台设备
        if (!pushRes.ok) throw new Error('上传失败，服务器返回 ' + pushRes.status);  // 其他服务器错误
        pushed = local.length;                                  // 记录条数
      }
      /* 第二步：从服务器拉取别人的新变化 */
      var pullRes = await fetchWithTimeout(this.state.url + '/api/pull?since=' + this.state.lastSync + '&device=' + encodeURIComponent(this.state.device), { headers: this.authHeaders() });  // 拉取接口（带 30 秒超时）
      if (pullRes.status === 401) throw new Error('服务器拒绝访问（401）：请确认"同步服务器地址"是否正确');  // 401 = 服务器不接受这台设备
      if (!pullRes.ok) throw new Error('下载失败，服务器返回 ' + pullRes.status);  // 其他服务器错误
      var data = await pullRes.json();                          // { serverTime, changes, serverEmpty }
      var pulled = await this.applyServerChanges(data.changes || []);  // 应用到本机
      /* 服务器报"空库"（刚部署 / 免费云主机磁盘被重置）而本机有数据时，
         自动把本机全部数据重新上传一遍帮服务器恢复 —— 数据不会因为云主机重启而丢 */
      if (data.serverEmpty) {
        var seed = await this.collectLocalChanges(0);           // 全量收集（不过滤时间）
        if (seed.length > 0) {                                  // 本机有数据才补种
          var seedRes = await fetchWithTimeout(this.state.url + '/api/push', {  // 全量推送（带 30 秒超时）
            method: 'POST',                                     // POST 方式
            headers: this.authHeaders(),                        // JSON 请求体
            body: JSON.stringify({ device: this.state.device, changes: seed })  // 全部数据
          });
          if (!seedRes.ok) throw new Error('补传数据失败，服务器返回 ' + seedRes.status);  // 补种失败要报错
          pushed = seed.length;                                 // 上传条数按补种算
        }
      }
      /* 第三步：记录本次同步到的位置（用服务器时间，避免各设备时钟不一致） */
      this.state.lastSync = data.serverTime || Date.now();      // 更新水位
      this.state.lastError = '';                                // 成功：清空错误
      await this.persistState();                                // 把 lastSync 存进数据库
      if (pulled > 0) syncSafeRefresh();                        // 别人改了数据 → 智能刷新页面
      return { pushed: pushed, pulled: pulled };                // 返回给"立即同步"按钮用
    } catch (err) {                                             // 任何一步失败
      this.state.lastError = err.message || String(err);        // 记下来（顶栏图标提示）
      updateNetState();                                         // 刷新顶栏
      throw err;                                                // 继续抛给调用方（手动同步时要提示）
    } finally {                                                 // 无论成败都要做的收尾
      this.state.syncing = false;                               // 解锁
      updateNetState();                                         // 顶栏恢复正常图标
    }
  },

  /* ---------- 把服务器的变化应用到本机（冲突解决在这里） ---------- */
  applyServerChanges: async function (changes) {
    var applied = 0;                                            // 实际应用条数
    var matsChanged = false;                                    // 物料表有没有变动（循环结束统一刷缓存）
    for (var i = 0; i < changes.length; i++) {                  // 逐条处理
      var ch = changes[i];                                      // 一条远程变化
      if (ch.store === 'settings') {                            // 设置表：只认分类树
        if (ch.id === 'categoryTree') {
          var localCat = await DB.get('settings', 'categoryTree');   // 本机原始行
          var remoteT = (ch.data && ch.data.updatedAt) || 0;         // 远程的改动时间
          var localT = (localCat && localCat.updatedAt) || 0;        // 本地的改动时间
          if (remoteT > localT) {                                     // 远程更新才覆盖
            await DB.put('settings', ch.data);                        // 写入（整行含 updatedAt）
            if (typeof CAT_TREE !== 'undefined' && ch.data.value) {
              CAT_TREE = ch.data.value;                               // 同步更新内存里的分类树
            }
            applied++;                                                // 计数
          }
        }
        continue;                                                   // 其他设置项不下发
      }
      var local = await DB.get(ch.store, ch.id);                  // 本机同一条数据
      var remote = ch.data || {};                                 // 远程数据
      var rT = remote.updatedAt || remote.createdAt || 0;         // 远程改动时间
      var lT = local ? (local.updatedAt || local.createdAt || 0) : -1;  // 本地改动时间（没有算 -1，必收）
      if (rT <= lT) continue;                                     // 本机已是最新的（含自己推出去的回声）→ 跳过
      if (remote.deleted) {                                       // 远程被打上了"删除墓碑"
        await DB.del(ch.store, ch.id);                            // 本机也真删
      } else {                                                    // 正常数据
        if (ch.store === 'records') fixLegacyType(remote);        // 记录类数据顺手修正旧类型（out_use → out），防止旧类型从别的设备流回来
        await DB.put(ch.store, remote);                           // 直接覆盖本机（谁新谁赢）
        /* 同步下来的正好是"当前登录的这个账号"：内存里的登录资料也一起换新。
           这样在别的设备把角色改成管理员后，本机不用退出重登就能立刻生效。 */
        if (ch.store === 'users' && typeof Auth !== 'undefined' && Auth.user && Auth.user.id === ch.id) {
          var roleChanged = (Auth.user.role !== remote.role);      // 角色有没有变化
          Auth.user = remote;                                      // 更新内存中的登录用户
          if (roleChanged && typeof renderShell === 'function') renderShell();  // 角色变了：重画侧边栏和顶栏
        }
      }
      if (ch.store === 'materials') matsChanged = true;           // 标记物料表变动
      applied++;                                                  // 计数
    }
    if (matsChanged && typeof State !== 'undefined' && State.refreshMaterials) {
      await State.refreshMaterials();                             // 物料缓存 + 搜索索引一次性重建
    }
    return applied;                                               // 返回应用条数
  },

  /* ---------- 把同步进度（lastSync）存进数据库，刷新页面不丢 ---------- */
  persistState: async function () {
    var old = await DB.getSetting('syncConfig', {}) || {};        // 旧配置（用来保留"是否手动定过开关"的标记）
    var cfg = {                                                  // 重组配置对象
      enabledSet: !!old.enabledSet,                              // 保留标记：成员没手动定过就继续跟随协会默认
      enabled: this.state.enabled,
      url: this.state.userUrl,                                   // 只存成员自己填的（留空 = 继续用协会默认/网页自己的地址）
      device: this.state.device,
      lastSync: this.state.lastSync
    };
    await DB.setSetting('syncConfig', cfg);                      // 写库
  },

  /* ---------- 以本机数据为"完整快照"，让服务器清理掉本机没有的行 ----------
     用途：数据在多端之间已经不一致时（早期版本的清空/初始化是真删，别的设备
     根本不知道要删），那些历史残留会永远留在服务器和其他设备上 —— 没有任何
     设备还记得它们，所以谁也传不出"删除"这个动作。只有让服务器以本机的完整
     快照为准去比对，才能把它们一并打成墓碑清掉。
     只在「所有数据初始化」时调用，属于危险操作，调用方必须先让用户确认。 */
  pushFullSnapshot: async function () {
    if (!this.state.enabled) throw new Error('尚未启用同步，无法清理云端数据');
    if (!this.state.url) throw new Error('尚未填写同步服务器地址');
    if (!navigator.onLine) throw new Error('当前设备没有联网，无法清理云端数据');
    var changes = await this.collectLocalChanges(0);             // 全量收集本机所有行（含刚打的墓碑）
    var res = await fetchWithTimeout(this.state.url + '/api/push', {  // 推送接口（带 30 秒超时）
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ device: this.state.device, full: true, changes: changes })
    });
    if (!res.ok) throw new Error('服务器返回 ' + res.status);     // 服务器错误
    return await res.json();                                     // { ok, accepted, tombstoned }
  }
};

/* ==================== 2. 顶栏网络状态小图标 ==================== */
/* main.js 的顶栏里放了 <span id="net-state">，这里负责画内容 */

function updateNetState() {
  var s = (typeof Sync !== 'undefined') ? Sync.state : null;     // 同步状态
  var el = document.getElementById('net-state');                 // 顶栏容器（登录后才存在）
  var lg = document.getElementById('login-sync');                // 登录页的同步提示条（登录前存在）

  /* ---- 1) 登录后的顶栏小图标 ---- */
  if (el) {
    var html = '';                                               // 要画的内容
    var cls = 'net-state';                                       // 样式类
    if (!s || !s.enabled) {                                      // 没启用同步（单机使用）
      el.style.display = '';                                     // 照常显示，别再藏起来了
      el.className = 'net-state ns-on';                          // 绿色 = 状态正常
      el.title = '数据保存在本机浏览器；联网后可在【系统设置 → 多端同步】开启云端同步';
      el.innerHTML = ICONS.wifi + '<span>本地模式</span>';        // 明确告诉用户数据存在哪
    } else {
      el.style.display = '';                                     // 启用了就显示
      if (s.syncing) {                                           // 正在同步
        cls += ' ns-busy';                                       // 蓝色 + 转圈动画
        html = ICONS.refresh + '<span>同步中</span>';
      } else if (!navigator.onLine) {                            // 断网
        cls += ' ns-off';                                        // 灰色
        html = ICONS.wifi + '<span>离线模式</span>';              // 数据照常记，联网自动补传
      } else if (s.lastError) {                                  // 有网但同步失败
        cls += ' ns-err';                                        // 橙色警告
        html = ICONS.cloud + '<span title="' + escapeHtml(s.lastError) + '">同步异常</span>';
      } else {                                                   // 一切正常
        cls += ' ns-on';                                         // 绿色
        html = ICONS.cloud + '<span>已同步</span>';
      }
      el.className = cls;                                        // 应用样式类
      el.innerHTML = html;                                       // 画内容
    }
  }

  /* ---- 2) 登录页的同步提示条 ----
     同步引擎在登录页就已经启动（见 main.js 初始化第 6 步），成员账号正是靠它从服务器拉下来的。
     不把状态显示出来，用户就会以为"必须先登 admin 才能同步"，白跑一趟。 */
  if (lg) {
    var lc = 'login-sync';                                       // 样式类
    var lt = '';                                                 // 要显示的文字
    if (!s || !s.enabled) {                                      // 没启用同步：只能本地模式
      lc += ' ls-warn';
      lt = '本地模式：账号只存在本机。想用协会统一账号，请管理员先开启多端同步';
    } else if (s.syncing) {                                      // 正在同步
      lc += ' ls-busy';
      lt = '正在从服务器同步数据（含账号），请稍等几秒…';
    } else if (!navigator.onLine) {                              // 断网
      lc += ' ls-warn';
      lt = '当前离线：拿不到服务器上的账号，请连上网络后刷新本页';
    } else if (s.lastError) {                                    // 同步失败：把原因直接摆出来
      lc += ' ls-err';
      lt = '同步失败：' + s.lastError;
    } else {                                                     // 一切正常
      lc += ' ls-on';
      lt = '已同步（服务器：' + (s.url || '未知') + '）。第一次使用的话，现在就能用自己的账号登录';
    }
    lg.className = lc;                                           // 应用样式类
    lg.textContent = lt;                                         // 写文字
  }
}

/* ==================== 3. 同步后的智能刷新 ==================== */
/* 别的设备改了数据时，本机页面要跟着更新；但如果用户正在输入
   或开着弹窗，就先不打扰（避免把人家填了一半的表单冲掉）。 */

function syncSafeRefresh() {
  var ae = document.activeElement;                               // 当前焦点元素
  var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');  // 正在输入？
  var modal = document.querySelector('.modal-mask');             // 有没有开着弹窗
  if (typing || modal) return;                                   // 都先不打扰，下次再刷
  if (typeof routeTo === 'function') routeTo();                  // 重画当前页面（数据就是新的了）
}
