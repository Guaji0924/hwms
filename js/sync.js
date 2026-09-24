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

/* ==================== 1. 同步引擎主体 ==================== */

var Sync = {
  /* 运行状态（内存里，不进数据库） */
  state: {
    enabled: false,          // 是否启用同步（来自设置页）
    url: '',                 // 同步服务器地址（云端如 https://xxx.onrender.com；局域网如 http://192.168.1.100:8787）
    key: '',                 // 同步密钥（服务器设置了 SYNC_KEY 时两端要一致，防止陌生人读写）
    device: '',              // 本机设备名（方便在服务器日志里认账）
    lastSync: 0,             // 上次同步到的时间点（毫秒），下次只同步这之后的变化
    syncing: false,          // 正在同步中（防止重复跑）
    lastError: '',           // 最近一次失败的错误信息（给顶栏图标提示用）
    timer: null              // 定时同步的句柄
  },

  /* 需要同步的表：物料 / 出入库记录 / 用户 / 操作日志
     settings 表特殊：只同步"物料分类树"，其余（AI 配置、同步配置等）留在本机 */
  STORES: ['materials', 'records', 'users', 'logs'],

  /* ---------- 启动：应用初始化时调用一次 ---------- */
  init: async function () {
    var cfg = await DB.getSetting('syncConfig', null);          // 读配置
    if (cfg) {                                                  // 有配置就恢复
      this.state.enabled = !!cfg.enabled;                       // 开关
      this.state.url = cfg.url || '';                           // 服务器地址
      this.state.key = cfg.key || '';                           // 同步密钥
      this.state.device = cfg.device || '';                     // 设备名
      this.state.lastSync = cfg.lastSync || 0;                  // 上次同步时间
    }
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
    this.state.enabled = !!cfg.enabled;                         // 开关
    this.state.url = cfg.url || '';                             // 地址
    this.state.key = cfg.key || '';                             // 密钥
    this.state.device = cfg.device || '';                       // 设备名
    this.state.lastSync = cfg.lastSync || 0;                    // 保留上次同步时间
    this.state.lastError = '';                                  // 清空旧错误
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

  /* ---------- 请求头：带上同步密钥（服务器设置过 SYNC_KEY 时必须匹配） ---------- */
  authHeaders: function () {
    var h = { 'Content-Type': 'application/json' };             // 基础头
    if (this.state.key) h['x-sync-key'] = this.state.key;       // 有密钥就带上
    return h;
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
    if (this.state.syncing) return { pushed: 0, pulled: 0 };    // 正在同步：直接返回防重入
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
        var pushRes = await fetch(this.state.url + '/api/push', {   // 推送接口
          method: 'POST',                                       // POST 方式
          headers: this.authHeaders(),                          // JSON 体 + 同步密钥
          body: JSON.stringify({ device: this.state.device, changes: local })  // 数据
        });
        if (!pushRes.ok) throw new Error('上传失败，服务器返回 ' + pushRes.status);  // 服务器报错
        pushed = local.length;                                  // 记录条数
      }
      /* 第二步：从服务器拉取别人的新变化 */
      var pullRes = await fetch(this.state.url + '/api/pull?since=' + this.state.lastSync + '&device=' + encodeURIComponent(this.state.device), { headers: this.authHeaders() });  // 拉取接口
      if (!pullRes.ok) throw new Error('下载失败，服务器返回 ' + pullRes.status);  // 服务器报错
      var data = await pullRes.json();                          // { serverTime, changes, serverEmpty }
      var pulled = await this.applyServerChanges(data.changes || []);  // 应用到本机
      /* 服务器报"空库"（刚部署 / 免费云主机磁盘被重置）而本机有数据时，
         自动把本机全部数据重新上传一遍帮服务器恢复 —— 数据不会因为云主机重启而丢 */
      if (data.serverEmpty) {
        var seed = await this.collectLocalChanges(0);           // 全量收集（不过滤时间）
        if (seed.length > 0) {                                  // 本机有数据才补种
          var seedRes = await fetch(this.state.url + '/api/push', {  // 全量推送
            method: 'POST',                                     // POST 方式
            headers: this.authHeaders(),                        // 含同步密钥
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
    var cfg = {                                                  // 重组配置对象
      enabled: this.state.enabled,
      url: this.state.url,
      key: this.state.key,                                       // 同步密钥也要存，刷新后还在
      device: this.state.device,
      lastSync: this.state.lastSync
    };
    await DB.setSetting('syncConfig', cfg);                      // 写库
  }
};

/* ==================== 2. 顶栏网络状态小图标 ==================== */
/* main.js 的顶栏里放了 <span id="net-state">，这里负责画内容 */

function updateNetState() {
  var el = document.getElementById('net-state');                 // 顶栏容器
  if (!el) return;                                               // 还没渲染就先跳过
  var s = (typeof Sync !== 'undefined') ? Sync.state : null;     // 同步状态
  var html = '';                                                 // 要画的内容
  var cls = 'net-state';                                         // 样式类
  if (!s || !s.enabled) {                                        // 没启用同步（单机使用）
    el.style.display = '';                                       // 照常显示，别再藏起来了
    el.className = 'net-state ns-on';                            // 绿色 = 状态正常
    el.title = '数据保存在本机浏览器；联网后可在【系统设置 → 多端同步】开启云端同步';
    el.innerHTML = ICONS.wifi + '<span>本地模式</span>';          // 明确告诉用户数据存在哪
    return;
  }
  el.style.display = '';                                         // 启用了就显示
  if (s.syncing) {                                               // 正在同步
    cls += ' ns-busy';                                           // 蓝色 + 转圈动画
    html = ICONS.refresh + '<span>同步中</span>';
  } else if (!navigator.onLine) {                                // 断网
    cls += ' ns-off';                                            // 灰色
    html = ICONS.wifi + '<span>离线模式</span>';                  // 数据照常记，联网自动补传
  } else if (s.lastError) {                                      // 有网但同步失败
    cls += ' ns-err';                                            // 橙色警告
    html = ICONS.cloud + '<span title="' + escapeHtml(s.lastError) + '">同步异常</span>';
  } else {                                                       // 一切正常
    cls += ' ns-on';                                             // 绿色
    html = ICONS.cloud + '<span>已同步</span>';
  }
  el.className = cls;                                            // 应用样式类
  el.innerHTML = html;                                           // 画内容
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
