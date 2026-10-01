/* ============================================================
   reconcile.js —— 库存对账（把库存交给"流水"来算）
   ------------------------------------------------------------
   要解决的问题：
     物料的 stock 字段存的是"绝对值"。两台设备各自离线时，都拿本机那份
     旧库存做判断，出库都能通过；联网后按"谁的时间戳新谁赢"整行覆盖，
     必然丢掉一次操作 —— 库存字段和 records 流水从此对不上。

   解决办法（不改现有同步规则，先做"发现 + 人工修正"）：
     1. 以 records（流水账）为准，重新推算每件物料的真实库存：
        真实库存 = 最后一条"库存调整"的 after + 之后所有流水的代数和
     2. 推算值与字段值不一致 → 顶栏亮角标，列出清单，确认后修正
     3. 推算出负数 → 说明离线期间"超卖"了：弹窗请操作人填实际出库数，
        改写那条出库记录，并把之后所有记录的 before/after 整体平移
        （链条保持衔接，历史回溯看起来才连续）

   为什么"以流水为准"是安全的：
     · records 每条都有唯一 id，重复上传只会覆盖，不会重复扣减
     · 加减法可交换，"先后顺序"不影响总和，手机时钟不准也算得对
     · 唯一依赖顺序的地方是"找最后一条库存调整当期初锚点"
   ============================================================ */

/* 把 Reconcile.AUTO 改成 true，就进入"第二步"：
   同步后自动把字段值改成流水推算值（负库存除外，那必须人工确认）。
   建议先让第一步跑一段时间、观察清单确实为空，再打开它。 */
var Reconcile = {
  AUTO: false,

  state: {
    conflicts: [],      // 账目对不上的物料：[{ m: 物料, calc: 流水推算值, field: 字段值 }]
    noAnchor: [],       // 缺少期初锚点的物料（没有"库存调整"记录，无法参与对账）
    autoFixed: 0,       // 累计自动修正条数（AUTO 打开后才有值）
    lastRun: 0,         // 上次对账时间（节流用）
    running: false      // 正在对账（防止重复跑）
  },

  /* 打开弹窗时临时存放的数据（物料 / 该物料记录 / 记录索引） */
  _dlg: null,

  /* ---------- 全库对账：找出所有"字段值和流水推算值不一致"的物料 ---------- */
  analyze: async function () {
    var mats = await DB.all('materials');                        // 全部物料（含回收站）
    var recs = await DB.all('records');                          // 全部记录（含墓碑）
    var byId = {};                                               // 记录 id → 记录（冲销要反查原记录）
    var byMat = {};                                              // 物料 id → 该物料的记录数组
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      byId[r.id] = r;                                            // 建立索引
      if (r.deleted) continue;                                   // 墓碑记录不参与计算
      if (!byMat[r.materialId]) byMat[r.materialId] = [];        // 第一次遇到这个物料
      byMat[r.materialId].push(r);
    }
    var conflicts = [];                                          // 对不上账的
    var noAnchor = [];                                           // 没有期初锚点的
    for (var k = 0; k < mats.length; k++) {
      var m = mats[k];
      if (m.deleted) continue;                                   // 回收站里的不管
      var list = sortRecords(byMat[m.id] || []);                 // 按时间升序排好
      var calc = computeStockByRecords(list, byId);              // 流水推算
      if (calc === null) { noAnchor.push(m); continue; }         // 没有锚点：算不出来
      if (calc !== (m.stock || 0)) {                             // 和字段值不一致
        conflicts.push({ m: m, calc: calc, field: (m.stock || 0) });
      }
    }
    return { conflicts: conflicts, noAnchor: noAnchor };
  },

  /* ---------- 跑一轮对账（带 60 秒节流，避免每 8 秒同步都全量算一遍） ---------- */
  run: async function (force) {
    if (this.state.running) return this.state.conflicts;         // 正在跑，直接返回上次结果
    if (!force && Date.now() - this.state.lastRun < 60000) return this.state.conflicts;  // 节流
    this.state.running = true;                                   // 上锁
    try {
      var res = await this.analyze();                            // 算一遍
      this.state.conflicts = res.conflicts;                      // 记下结果
      this.state.noAnchor = res.noAnchor;
      this.state.lastRun = Date.now();                           // 记下本次时间
      if (this.AUTO) await this.autoFix();                       // 第二步：自动以流水为准
      updateReconcileBadge();                                    // 刷新顶栏角标
      return this.state.conflicts;
    } finally {
      this.state.running = false;                                // 解锁
    }
  },

  /* ---------- 第二步（AUTO=true 时）：自动把字段值改成流水推算值 ----------
     注意：负库存（超卖）不自动改 —— 那是真的出问题了，必须人工确认。 */
  autoFix: async function () {
    var left = [];                                               // 留给人处理的
    var changed = 0;                                             // 本次改了几条
    for (var i = 0; i < this.state.conflicts.length; i++) {
      var c = this.state.conflicts[i];
      if (c.calc < 0) { left.push(c); continue; }                // 负库存：不自动改
      c.m.stock = c.calc;                                        // 以流水为准
      stampSync(c.m);                                            // 盖同步时间戳（会传出去，多端收敛到同一个值）
      delete c.m._search;                                        // 清搜索索引缓存
      await DB.put('materials', c.m);                            // 写库
      changed++;
    }
    if (changed > 0) {
      this.state.autoFixed += changed;                           // 累计
      await Log.add('库存对账', '自动按流水修正 ' + changed + ' 件物料的库存字段');  // 留痕
      if (typeof State !== 'undefined' && State.refreshMaterials) await State.refreshMaterials();
    }
    this.state.conflicts = left;                                 // 只剩需要人工处理的
  },

  /* ---------- 给"没有期初锚点"的物料补一条库存调整记录 ----------
     为什么要补：流水推算必须有个起点。老物料建档时初始库存只写进了 stock
     字段、没有留记录，所以查不到期初。补一条 adjust 记录，把"当前库存"
     当成从今天起的起点 —— 之后每一笔流水都能被正确累加，从今往后的
     差异就都能被发现了（更早的历史差异本来就无从还原）。
     记录 id 用固定值 'anchor-物料id'：多台设备各补一次也只会是同一条。 */
  seedAnchors: async function () {
    var list = this.state.noAnchor.slice();                      // 复制一份，避免遍历中被改
    var seeded = 0;                                              // 补了几条
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var anchorId = 'anchor-' + m.id;                           // 固定编号
      var exist = await DB.get('records', anchorId);             // 已经补过就跳过
      if (exist) continue;
      var now = Date.now();                                      // 同一个时间戳
      await DB.put('records', {
        id: anchorId,                                            // 固定编号（多端不会重复补）
        materialId: m.id,                                        // 所属物料
        materialName: m.name,                                    // 冗余物料名
        unit: m.unit || '',                                      // 单位
        type: 'adjust',                                          // 类型：库存调整（绝对赋值，正好当锚点）
        qty: m.stock || 0,                                       // 数量
        price: 0,                                                // 不涉及金额
        operator: '系统',                                        // 系统补的
        project: '',                                             // 不关联项目
        remark: '期初锚点：建立对账起点（此前没有流水可查）',       // 备注
        before: 0,                                               // 起点前视为 0
        after: m.stock || 0,                                     // 起点值 = 当前库存
        seeded: true,                                            // 标记：这是补种出来的锚点
        time: now,                                               // 时间
        createdAt: now,                                          // 创建时间（同步用）
        updatedAt: now                                           // 修改时间（同步用）
      });
      seeded++;
    }
    if (seeded > 0) await Log.add('库存对账', '为 ' + seeded + ' 件物料建立期初锚点');  // 留痕
    await this.run(true);                                        // 补完重新算一遍
    return seeded;                                               // 返回补了几条
  },

  /* ---------- 以流水为准修正单件物料（只改 stock 字段） ---------- */
  fixByLedger: async function (materialId) {
    var c = null;                                                // 找到这条冲突
    for (var i = 0; i < this.state.conflicts.length; i++) {
      if (this.state.conflicts[i].m.id === materialId) { c = this.state.conflicts[i]; break; }
    }
    if (!c) { toast('这条已经对上了，请重新打开清单', 'warn'); return; }
    var m = await DB.get('materials', materialId);               // 重新读一遍（避免用旧对象）
    if (!m) { toast('物料不存在', 'err'); return; }
    m.stock = c.calc;                                            // 改成流水推算值
    stampSync(m);                                                // 盖同步时间戳
    delete m._search;                                            // 清索引
    await DB.put('materials', m);                                // 写库
    await Log.add('库存对账', '「' + m.name + '」按流水修正库存：' + c.field + ' → ' + c.calc);  // 留痕
    await State.refreshMaterials();                              // 刷新物料缓存
    toast('已修正：' + m.name + ' 库存 ' + c.field + ' → ' + c.calc, 'ok');  // 提示
    await this.run(true);                                        // 重新对账
    this.openModal();                                            // 重画清单
  },

  /* ---------- 打开对账清单弹窗 ---------- */
  openModal: async function () {
    await this.run(true);                                        // 打开前先算一次，保证数字是新的
    var cs = this.state.conflicts;                               // 对不上的
    var na = this.state.noAnchor;                                // 缺锚点的
    var html = '';                                               // 弹窗内容

    /* 第一块：账目对不上的物料 */
    if (cs.length === 0) {
      html += '<div class="empty" style="padding:16px 0">所有物料的库存都与流水一致，没有发现问题。</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;line-height:1.8">' +
        '这些物料的「库存字段」和「出入库流水」算出来的数字对不上。<br>' +
        '通常是因为两台设备各自离线登记过同一件物料 —— 联网合并时丢掉了一次操作。</div>';
      html += '<table class="data-table"><thead><tr>' +
        '<th>物料</th><th style="width:80px">字段值</th><th style="width:80px">流水值</th>' +
        '<th style="width:70px">差额</th><th style="width:150px">操作</th></tr></thead><tbody>';
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        var diff = c.calc - c.field;                             // 差额
        var neg = c.calc < 0;                                    // 负库存 = 超卖了
        html += '<tr>' +
          '<td>' + escapeHtml(c.m.name) + (c.m.code ? ' <span style="color:var(--text-muted);font-size:12px">' + escapeHtml(c.m.code) + '</span>' : '') +
            (neg ? ' <span class="badge badge-red">超卖</span>' : '') + '</td>' +
          '<td>' + c.field + ' ' + escapeHtml(c.m.unit || '') + '</td>' +
          '<td style="color:' + (neg ? 'var(--danger)' : 'var(--text)') + ';font-weight:600">' + c.calc + ' ' + escapeHtml(c.m.unit || '') + '</td>' +
          '<td>' + (diff > 0 ? '+' : '') + diff + '</td>' +
          '<td>' +
            (neg
              ? '<button class="btn btn-sm btn-primary" onclick="Reconcile.openFixQtyModal(\'' + c.m.id + '\')">修正出库数量</button>'
              : '<button class="btn btn-sm" onclick="Reconcile.fixByLedger(\'' + c.m.id + '\')">以流水为准</button>') +
          '</td></tr>';
      }
      html += '</tbody></table>';
      if (this.state.autoFixed > 0) {
        html += '<div style="font-size:12px;color:var(--text-muted);margin-top:8px">本次已自动修正 ' + this.state.autoFixed + ' 件（可在操作日志里查）。</div>';
      }
    }

    /* 第二块：缺少期初锚点的物料 */
    if (na.length > 0) {
      html += '<div style="margin-top:18px;padding:12px;border:1px solid var(--border);border-radius:8px">' +
        '<div style="font-weight:600;margin-bottom:6px">有 ' + na.length + ' 件物料缺少期初锚点，无法参与对账</div>' +
        '<div style="font-size:13px;color:var(--text-muted);line-height:1.8">' +
        '流水推算需要知道"从多少开始算"。这些物料是早期建的档，初始库存只写进了库存字段、没有留下记录，所以查不到起点。<br>' +
        '点下面的按钮会给它们各补一条「库存调整」记录，把<b>当前库存</b>当作从今天起的起点。之后每一笔出入库都能被正确累加，' +
        '再出现对不上的情况就能被发现了。</div>' +
        '<button class="btn btn-sm" style="margin-top:10px" onclick="Reconcile.doSeedAnchors()">一键建立期初锚点（' + na.length + ' 件）</button>' +
        '</div>';
    }

    openModal('库存对账', html, '<div class="modal-foot" style="padding:12px 0 0"><button class="btn" onclick="closeModal()">关闭</button></div>', true);
  },

  /* 弹窗里的"一键建立期初锚点"按钮 */
  doSeedAnchors: async function () {
    var ok = await confirmBox('确定给这 ' + this.state.noAnchor.length + ' 件物料建立期初锚点吗？\n' +
      '会把它们当前的库存值当作对账起点，各补一条「库存调整」记录（不改动库存数字本身）。');
    if (!ok) return;
    var n = await this.seedAnchors();                            // 补锚点
    toast('已为 ' + n + ' 件物料建立期初锚点', 'ok');             // 提示
    this.openModal();                                            // 重画清单
  },

  /* ---------- 修正出库数量：让操作人填实际出库了多少 ---------- */
  openFixQtyModal: async function (materialId) {
    var m = await DB.get('materials', materialId);               // 读物料
    if (!m) { toast('物料不存在', 'err'); return; }
    var recs = await DB.all('records');                          // 读全部记录
    var byId = {};                                               // id → 记录
    var mine = [];                                               // 该物料的记录
    for (var i = 0; i < recs.length; i++) {
      byId[recs[i].id] = recs[i];                                // 建索引
      if (!recs[i].deleted && recs[i].materialId === materialId) mine.push(recs[i]);
    }
    mine = sortRecords(mine);                                    // 按时间升序
    /* 只允许修正"出库"记录：超卖问题就出在这里 */
    var outs = [];                                               // 候选出库记录
    for (var j = 0; j < mine.length; j++) {
      var r = mine[j];
      if (r.type === 'out' && !r.revoked) outs.push(r);          // 未撤回的出库记录
    }
    if (outs.length === 0) {
      toast('这件物料没有可修正的出库记录，请用「库存调整」手工改库存', 'warn');
      return;
    }
    this._dlg = { material: m, recs: mine, byId: byId, outs: outs };  // 暂存，供弹窗里的回调使用

    /* 默认选中最后一条出库记录（离线超卖通常就发生在它身上） */
    var last = outs[outs.length - 1];
    var idx = mine.indexOf(last);                                // 它在整条链里的位置
    var avail = stockBeforeRecord(mine, byId, idx);              // 这笔之前的真实可用量
    var suggest = (avail === null) ? last.qty : Math.max(0, Math.min(last.qty, avail));  // 建议值

    var opts = '';                                               // 下拉选项
    for (var k = outs.length - 1; k >= 0; k--) {                 // 从新到旧列出来
      var o = outs[k];
      opts += '<option value="' + o.id + '"' + (o.id === last.id ? ' selected' : '') + '>' +
        fmtDateShort(o.time) + '　出库 ' + o.qty + ' ' + escapeHtml(m.unit || '') + '　' + escapeHtml(o.operator || '') +
        '</option>';
    }

    var html = '' +
      '<div style="font-size:13px;color:var(--text-muted);line-height:1.9;margin-bottom:12px">' +
        '「<b style="color:var(--text)">' + escapeHtml(m.name) + '</b>」按流水算出来是 <b style="color:var(--danger)">' + this._calcFor(m.id) + '</b>，' +
        '说明离线期间出库出多了。<br>请选一条出库记录，填上<b>实际出库了多少</b>，系统会把这条改过来，' +
        '并把之后所有记录的库存快照整体平移，链条保持衔接。' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">' +
        '<label style="flex:1;min-width:260px"><span style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">要修正的出库记录</span>' +
          '<select id="rq-rec" onchange="Reconcile.onPickRec()" style="width:100%">' + opts + '</select></label>' +
        '<label style="width:150px"><span style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">实际出库数量</span>' +
          '<input id="rq-qty" type="number" min="0" step="1" value="' + suggest + '" style="width:100%"></label>' +
      '</div>' +
      '<div id="rq-hint" style="font-size:13px;color:var(--text-muted);margin-top:10px;line-height:1.8"></div>';

    openModal('修正出库数量', html,
      '<div class="modal-foot" style="padding:12px 0 0">' +
        '<button class="btn" onclick="closeModal()">取消</button>' +
        '<button class="btn btn-primary" onclick="Reconcile.saveFixQty()">保存修正</button>' +
      '</div>', true);

    this.onPickRec();                                            // 初始化提示文字
  },

  /* 从当前冲突清单里取某物料的流水推算值（弹窗文案用） */
  _calcFor: function (materialId) {
    for (var i = 0; i < this.state.conflicts.length; i++) {
      if (this.state.conflicts[i].m.id === materialId) return this.state.conflicts[i].calc;
    }
    return 0;
  },

  /* 下拉换了一条记录：重算"这笔之前可用多少"，并更新建议值和提示 */
  onPickRec: function () {
    var sel = document.getElementById('rq-rec');                 // 下拉框
    var hint = document.getElementById('rq-hint');               // 提示区
    var qtyIn = document.getElementById('rq-qty');               // 数量输入框
    if (!sel || !this._dlg) return;
    var rec = this._dlg.byId[sel.value];                         // 选中的记录
    if (!rec) return;
    var idx = this._dlg.recs.indexOf(rec);                       // 它在链里的位置
    var avail = stockBeforeRecord(this._dlg.recs, this._dlg.byId, idx);  // 这笔之前的真实可用量
    var suggest = (avail === null) ? rec.qty : Math.max(0, Math.min(rec.qty, avail));  // 建议值
    if (qtyIn) qtyIn.value = String(suggest);                    // 填进输入框
    if (hint) {
      hint.innerHTML = '这条记录原本写的是 <b>' + rec.qty + '</b> ' + escapeHtml(this._dlg.material.unit || '') +
        (avail === null ? '' : '；按流水算，这笔发生之前实际只有 <b>' + avail + '</b> ' + escapeHtml(this._dlg.material.unit || '') + ' 可用。');
    }
  },

  /* 保存修正：改写记录数量 + 平移后续记录 + 同步修正物料库存 */
  saveFixQty: async function () {
    var sel = document.getElementById('rq-rec');                 // 下拉框
    var qtyIn = document.getElementById('rq-qty');               // 数量输入框
    if (!sel || !qtyIn || !this._dlg) return;
    var rec = this._dlg.byId[sel.value];                         // 目标记录
    if (!rec) { toast('记录不存在', 'err'); return; }
    var newQty = parseInt(qtyIn.value, 10);                      // 实际出库数
    if (isNaN(newQty) || newQty < 0) { toast('请填写有效的出库数量（0 或正整数）', 'err'); return; }
    if (newQty === rec.qty) { toast('数量和原来一样，无需修正', 'warn'); closeModal(); return; }

    /* 如果填的比"可用量"还多，先提醒一下，避免改完还是负的 */
    var idx = this._dlg.recs.indexOf(rec);
    var avail = stockBeforeRecord(this._dlg.recs, this._dlg.byId, idx);
    if (avail !== null && newQty > avail) {
      var go = await confirmBox('这笔出库发生之前，按流水算实际只有 ' + avail + ' 可用，你填的是 ' + newQty + '。\n' +
        '继续保存的话，这件物料的库存仍然会是负数（说明确实超卖了）。确定继续吗？');
      if (!go) return;
    }

    await rewriteOutQty(rec.id, newQty);                         // 改写 + 平移整串
    closeModal();                                                // 关弹窗
    toast('已修正：出库 ' + rec.qty + ' → ' + newQty + '，后续记录已自动衔接', 'ok');  // 提示
    await this.run(true);                                        // 重新对账
    if (typeof refreshCurrentPage === 'function') refreshCurrentPage();  // 刷新当前页面
    if (this.state.conflicts.length > 0 || this.state.noAnchor.length > 0) this.openModal();  // 还有问题就继续显示清单
  }
};

/* ==================== 下面是对账用到的纯计算函数 ==================== */

/* 记录排序：先按 time 升序，time 相同再按 createdAt —— 和流水推算用的顺序保持一致 */
function sortRecords(list) {
  return list.slice().sort(function (a, b) {                     // 复制一份再排，不动原数组
    var ta = a.time || 0, tb = b.time || 0;                      // 取时间
    if (ta !== tb) return ta - tb;                               // 时间不同：早的在前
    return (a.createdAt || 0) - (b.createdAt || 0);              // 时间相同：建档早的在前
  });
}

/* 算一条记录对库存的"贡献量"：正数=让库存增加，负数=让库存减少 */
function recContribution(rec, byId) {
  if (rec.type === 'in') return rec.qty || 0;                    // 入库：加
  if (rec.type === 'out') return -(rec.qty || 0);                // 出库：减
  if (rec.type === 'revoke') {                                   // 撤回冲销：把原记录的影响反向抵消
    var orig = rec.revokesId ? byId[rec.revokesId] : null;       // 反查被冲销的原记录
    if (orig && orig.before !== undefined && orig.after !== undefined) {
      return -(orig.after - orig.before);                        // 优先用原记录的真实变化量（最准）
    }
    if (rec.before !== undefined && rec.after !== undefined) {
      return rec.after - rec.before;                             // 兜底：用冲销记录自身的快照差
    }
    return 0;                                                    // 都没有：不计入
  }
  return 0;                                                      // adjust 是绝对赋值，不参与累加
}

/* 按流水推算某物料的真实库存。
   返回 null 表示"没有期初锚点、算不出来"。 */
function computeStockByRecords(recs, byId) {
  var anchorIdx = -1;                                            // 最后一条有效"库存调整"的位置
  for (var i = 0; i < recs.length; i++) {
    if (recs[i].type === 'adjust' && !recs[i].revoked) anchorIdx = i;  // 被撤回的调整不能当锚点
  }
  if (anchorIdx < 0) return null;                                // 没有锚点 → 无法推算
  var sum = recs[anchorIdx].after || 0;                          // 起点 = 锚点的"操作后库存"
  for (var j = anchorIdx + 1; j < recs.length; j++) {            // 从锚点之后逐条累加
    var r = recs[j];
    if (r.revoked) continue;                                     // 已被撤回的原记录不再计入（冲销记录会抵消它）
    sum += recContribution(r, byId);                             // 累加这条的贡献
  }
  return sum;                                                    // 真实库存
}

/* 算"某条记录发生之前"的真实库存（修正弹窗用来算默认值） */
function stockBeforeRecord(recs, byId, idx) {
  if (idx < 0) return null;                                      // 位置非法
  var anchorIdx = -1;                                            // 这条之前最后一条有效锚点
  for (var i = 0; i < idx; i++) {
    if (recs[i].type === 'adjust' && !recs[i].revoked) anchorIdx = i;
  }
  if (anchorIdx < 0) return null;                                // 没有锚点 → 算不出来
  var sum = recs[anchorIdx].after || 0;                          // 从锚点起算
  for (var j = anchorIdx + 1; j < idx; j++) {                    // 累加到这条记录之前
    if (recs[j].revoked) continue;                               // 撤回的不算
    sum += recContribution(recs[j], byId);
  }
  return sum;
}

/* ==================== 改写出库数量 + 整串平移 ==================== */

/**
 * 把某条出库记录的数量改成 newQty，并把这条之后所有记录的 before/after 整体平移。
 *
 * 为什么必须平移：before / after 是"从期初逐条累加出来的余额"，它们和先后顺序有关。
 * 改动其中一条，它后面每一条的余额都会跟着变。仓库里 cancelRevokeRecord() 已有
 * 同样的写法，这里沿用同一套思路，保证行为一致。
 */
async function rewriteOutQty(recId, newQty) {
  var rec = await DB.get('records', recId);                      // 取目标记录
  if (!rec) { toast('记录不存在', 'err'); return false; }
  var oldQty = rec.qty || 0;                                     // 原来的数量
  var shift = oldQty - newQty;                                   // 出库变少 → 库存整体上移这么多
  if (shift === 0) return true;                                  // 没变化，直接结束

  /* 1. 改写这条记录自身 */
  if (rec.adjustedFrom === undefined) rec.adjustedFrom = oldQty;  // 保留原值：以后想回溯还查得到
  rec.qty = newQty;                                              // 换成实际出库数
  if (rec.before !== undefined) rec.after = rec.before - newQty;  // 出库：操作后 = 操作前 − 数量
  rec.remark = (rec.remark ? rec.remark + '；' : '') + '对账修正：出库数 ' + oldQty + ' → ' + newQty;  // 备注留痕
  stampSync(rec);                                                // 盖同步时间戳
  await DB.put('records', rec);                                  // 写库

  /* 2. 把这之后的所有记录整体平移（保持链条衔接） */
  var all = await DB.all('records');                             // 全部记录
  var later = [];                                                // 排在它后面的有效记录
  for (var i = 0; i < all.length; i++) {
    var x = all[i];
    if (x.deleted) continue;                                     // 墓碑跳过
    if (x.materialId !== rec.materialId) continue;               // 不是同一件物料
    if (x.id === rec.id) continue;                               // 不是它自己
    var after = (x.time || 0) > (rec.time || 0) ||               // 时间更晚
      ((x.time || 0) === (rec.time || 0) && (x.createdAt || 0) > (rec.createdAt || 0));  // 或同一时刻但建档更晚
    if (after) later.push(x);
  }
  later = sortRecords(later);                                    // 按时间升序平移
  for (var j = 0; j < later.length; j++) {
    var lr = later[j];
    if (lr.before !== undefined) lr.before = lr.before + shift;  // 操作前库存平移
    if (lr.after !== undefined) lr.after = lr.after + shift;     // 操作后库存平移
    stampSync(lr);                                               // 盖同步时间戳
    await DB.put('records', lr);                                 // 写库
  }

  /* 3. 物料库存跟着平移 */
  var m = await DB.get('materials', rec.materialId);             // 找物料（含回收站里的）
  if (m) {
    m.stock = (m.stock || 0) + shift;                            // 允许为负：诚实反映超卖，不掩盖问题
    stampSync(m);                                                // 盖同步时间戳
    delete m._search;                                            // 清索引
    await DB.put('materials', m);                                // 写库
  }
  await Log.add('库存对账', '修正出库数量：' + rec.materialName + ' ' + oldQty + ' → ' + newQty + '（后续 ' + later.length + ' 笔记录已衔接平移）');  // 留痕
  await State.refreshMaterials();                                // 刷新物料缓存
  return true;
}

/* ==================== 顶栏角标 + 自动弹窗 ==================== */

/* 刷新顶栏的"库存对账"角标：有问题才显示 */
function updateReconcileBadge() {
  var btn = document.getElementById('rec-btn');                  // 顶栏按钮
  var badge = document.getElementById('rec-badge');              // 角标数字
  if (!btn || !badge) return;                                    // 还没登录 / 还没渲染顶栏
  var n = (typeof Reconcile !== 'undefined') ? Reconcile.state.conflicts.length : 0;  // 账目对不上的
  var na = (typeof Reconcile !== 'undefined') ? Reconcile.state.noAnchor.length : 0;  // 缺锚点的
  var total = n + na;                                            // 合计
  if (total <= 0) {                                              // 没问题：藏起来
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';                                        // 有问题：显示
  badge.style.display = '';
  badge.textContent = String(total);                             // 数字
  btn.title = n > 0
    ? ('库存对账：有 ' + n + ' 件物料的库存和流水对不上')
    : ('库存对账：有 ' + na + ' 件物料缺少期初锚点，无法参与对账');
}

/* 找出"害得库存变成负数"的那条出库记录：该物料最后一条未撤回的出库记录 */
async function findGuiltyOut(materialId) {
  var recs = await DB.all('records');                            // 全部记录
  var mine = [];                                                 // 该物料的
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i];
    if (r.deleted || r.materialId !== materialId) continue;      // 跳过
    if (r.type === 'out' && !r.revoked) mine.push(r);            // 未撤回的出库记录
  }
  if (mine.length === 0) return null;                            // 没有
  mine = sortRecords(mine);                                      // 排好序
  return mine[mine.length - 1];                                  // 最后一条
}

/* 同步后发现"自己出的库把库存搞成负数" → 自动弹窗请他填实际数量。
   同一个操作人同一条记录只弹一次，且已有弹窗时不打扰。 */
async function maybeAutoPromptOversell() {
  if (typeof Auth === 'undefined' || !Auth.user) return;          // 没登录
  if (typeof Reconcile === 'undefined') return;                   // 模块没加载
  if (document.querySelector('.modal-mask')) return;              // 已经开着弹窗，别打扰
  var cs = Reconcile.state.conflicts;                             // 当前冲突
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    if (c.calc >= 0) continue;                                    // 只看负库存（超卖）
    var guilty = await findGuiltyOut(c.m.id);                     // 找肇事记录
    if (!guilty) continue;
    if (guilty.operator !== Auth.user.username) continue;         // 不是自己出的库，不弹给自己
    var key = 'recPrompted_' + guilty.id;                         // 提示过的标记
    try {
      if (localStorage.getItem(key)) continue;                    // 提示过了，别再烦他
      localStorage.setItem(key, '1');                             // 记下已提示
    } catch (e) { /* 隐私模式下 localStorage 可能不可用，忽略 */ }
    Reconcile.openFixQtyModal(c.m.id);                            // 弹窗请他填实际出库数
    return;                                                       // 一次只弹一个
  }
}
