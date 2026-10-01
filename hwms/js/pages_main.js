/* ============================================================
   pages_main.js —— 主要业务页面
   ------------------------------------------------------------
   内容：
   1. pageDashboard()     仪表盘（出库统计兼容旧数据）
   2. pageMaterials()     物料库列表（搜索/筛选/分页）
   3. 物料新增/编辑表单弹窗（含实物照片上传、自定义分类）
   4. pageMaterialDetail() 物料详情 + 实物照片 + 全链路时间线
   5. pageStockIO()       出入库登记页（只有 入库/出库/库存调整 三种）
   6. pageAlerts()        库存预警页
   7. applyStockRecord()  出入库核心逻辑（所有页面共用）
   8. openStockIOModal()  快捷出入库弹窗（列表/详情页按钮）
   注：RECORD_TYPES / isOutType / isInType / compressImage 统一在 core.js 定义
   ============================================================ */

/* 说明：出入库类型 RECORD_TYPES / isOutType() / isInType() 已统一放在 core.js，
   全系统只有三种操作：入库（+）、出库（−）、库存调整（盘点纠错）。
   原来的"领用出库/消耗出库/借出/归还"全部简化，旧数据启动时自动迁移（见 core.js migrateLegacyData） */

/* ==================== 2. 仪表盘 ==================== */

async function pageDashboard() {
  var records = await State.loadRecords();                     // 全部出入库记录
  var mats = State.materials;                                  // 全部物料
  var admin = isAdminNow();                                    // 管理员视角才显示涉钱内容（普通成员隐藏）
  /* ---- 计算统计指标 ---- */
  var totalValue = 0;                                          // 库存总价值
  for (var i = 0; i < mats.length; i++) { totalValue += (mats[i].price || 0) * (mats[i].stock || 0); }  // Σ 单价×库存
  var alerts = State.alertList();                              // 预警物料
  var monthNow = monthKey();                                   // 当前月份 "2026-09"
  var monthOutCount = 0;                                       // 本月出库笔数
  for (var r = 0; r < records.length; r++) {                   // 遍历记录
    if (records[r].revoked || records[r].deleted) continue;      // 已撤回 / 已删除的记录不算
    if (monthKey(records[r].time) === monthNow && isOutType(records[r].type)) monthOutCount++;  // 出库（新旧类型都算）
  }
  /* ---- 消耗排行（近 90 天出库数量 Top8） ---- */
  var day90 = Date.now() - 90 * 86400000;                      // 90 天前的时间戳
  var useMap = {};                                             // key -> 出库量聚合（带 id/名称）
  for (var u = 0; u < records.length; u++) {                   // 遍历记录
    var rec = records[u];                                      // 当前记录
    if (rec.revoked || rec.deleted) continue;                  // 已撤回 / 已删除的记录不算
    if (rec.time >= day90 && isOutType(rec.type)) {             // 近 90 天出库（新旧类型都算）
      var key = rec.materialId || rec.materialName;            // 聚合键（优先 id）
      if (!useMap[key]) useMap[key] = { qty: 0, mid: rec.materialId || '', name: rec.materialName };  // 初始化
      useMap[key].qty += rec.qty;                               // 累加数量
    }
  }
  var rankArr = [];                                            // 转数组
  for (var k in useMap) rankArr.push({ label: useMap[k].name, value: useMap[k].qty, id: useMap[k].mid });  // 装入（id：条形可点弹详情）
  rankArr.sort(function (a, b) { return b.value - a.value; });  // 降序
  var rankTop = rankArr.slice(0, 8).map(function (x) { x.text = x.value + ' 个/件'; return x; });  // 取前 8
  /* ---- 近 6 个月采购支出 / 领用成本趋势 ---- */
  var labels = [], buyVals = [], useVals = [];                 // 三个数组：月份、采购、领用
  for (var m = 5; m >= 0; m--) {                               // 从 5 个月前到本月
    var d = new Date();                                        // 当前
    d.setMonth(d.getMonth() - m);                              // 往前推 m 个月
    var mk = monthKey(d.getTime());                            // 月份键
    labels.push(mk.slice(2));                                  // 标签 "26-09"
    buyVals.push(0); useVals.push(0);                           // 初始 0
    for (var b = 0; b < records.length; b++) {                 // 遍历记录累计
      if (records[b].revoked || records[b].deleted) continue;  // 已撤回 / 已删除的记录不算
      if (monthKey(records[b].time) !== mk) continue;          // 不在本月跳过
      if (isInType(records[b].type)) buyVals[buyVals.length - 1] += (records[b].qty * (records[b].price || 0));  // 入库金额（旧"归还"也算）
      if (isOutType(records[b].type)) useVals[useVals.length - 1] += (records[b].qty * (records[b].price || 0));  // 出库成本（新旧类型都算）
    }
  }
  var buyValsInt = buyVals.map(function (v) { return Math.round(v); });  // 取整显示
  var useValsInt = useVals.map(function (v) { return Math.round(v); });
  /* ---- 最近动态（最新 8 条，已撤回的旧账不再展示） ---- */
  var activeRecs = [];                                            // 有效记录集合
  for (var ar = 0; ar < records.length; ar++) {                   // 过滤掉已撤回 / 已删除的
    if (!records[ar].revoked && !records[ar].deleted) activeRecs.push(records[ar]);
  }
  var sorted = activeRecs.sort(function (a, b) { return b.time - a.time; });  // 按时间倒序
  var recent = sorted.slice(0, 8);                             // 取前 8
  var recentHtml = '';                                         // 动态 HTML
  for (var q = 0; q < recent.length; q++) {                    // 逐条渲染
    var rc = recent[q];                                        // 当前记录
    var tp = RECORD_TYPES[rc.type] || { label: rc.type, badge: 'badge-gray' };  // 类型信息
    recentHtml += '<div class="act-item">' +
      '<span class="badge ' + tp.badge + '" style="flex:none">' + tp.label + '</span>' +
      '<span class="t-link" style="flex:1" onclick="gotoMaterial(\'' + rc.materialId + '\')">' + escapeHtml(rc.materialName) + ' <b>×' + rc.qty + '</b></span>' +
      '<span style="flex:none;font-size:12px;color:var(--text-sub)">' + escapeHtml(rc.operator) + ' · ' + fmtDateShort(rc.time) + '</span>' +
      '</div>';
  }
  if (recent.length === 0) recentHtml = '<div class="empty">还没有出入库记录，到"物料库"点行尾的 入 / 出 按钮记一笔吧</div>';  // 空状态（出入库已改为弹窗，无独立页面）
  /* ---- 预警前 5 ---- */
  var alertHtml = '';                                          // 预警列表 HTML
  var alertTop = alerts.slice(0, 5);                           // 前 5 条
  for (var a = 0; a < alertTop.length; a++) {                   // 逐条渲染
    var al = alertTop[a];                                      // 当前预警
    alertHtml += '<div class="act-item">' +
      '<span class="badge ' + (al.level === 'danger' ? 'badge-red' : 'badge-yellow') + '">' + (al.level === 'danger' ? '告急' : '偏低') + '</span>' +
      '<span class="t-link" style="flex:1" onclick="gotoMaterial(\'' + al.m.id + '\')">' + escapeHtml(al.m.name) + '</span>' +
      '<span style="flex:none;font-size:12px;color:var(--text-sub)">剩 ' + al.m.stock + ' / 警戒 ' + al.m.minStock + '</span>' +
      '</div>';
  }
  if (alertTop.length === 0) alertHtml = '<div class="empty">库存都很充足，棒棒的</div>';  // 空状态

  /* ---- 输出页面 ---- */
  $('#page').innerHTML = '' +
    /* 页头大标题（顶栏不再重复显示页面名） */
    '<div class="page-head"><div><div class="page-title">仪表盘</div><div class="page-desc">库存与经费一览</div></div></div>' +
    /* 统计卡片 */
    '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-ico" style="background:var(--primary-light);color:var(--primary)">' + ICONS.box + '</div><div><div class="s-val">' + mats.length + '</div><div class="s-label">物料种类</div></div></div>' +
      /* "库存总价值"涉及钱：只给管理员看，普通成员不渲染这张卡片 */
      (admin ? '<div class="stat-card"><div class="stat-ico" style="background:rgba(22,163,74,.12);color:var(--success)">' + ICONS.chart + '</div><div><div class="s-val">' + fmtMoney(totalValue) + '</div><div class="s-label">库存总价值</div></div></div>' : '') +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(220,38,38,.1);color:var(--danger)">' + ICONS.alert + '</div><div><div class="s-val" style="color:' + (alerts.length ? 'var(--danger)' : 'inherit') + '">' + alerts.length + '</div><div class="s-label">预警物料</div></div></div>' +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(2,132,199,.1);color:var(--info)">' + ICONS.swap + '</div><div><div class="s-val">' + monthOutCount + '</div><div class="s-label">本月出库笔数</div></div></div>' +
    '</div>' +
    /* 两个趋势图放同一行、一样大小（涉钱：仅管理员渲染这一行） */
    (admin ? '<div class="grid-2">' +
      '<div class="card"><div class="card-title">入库支出趋势（近 6 个月 / 元）</div>' + lineChart(labels, buyValsInt, null, '#16a34a') + '</div>' +
      '<div class="card"><div class="card-title">出库成本趋势（近 6 个月 / 元）</div>' + lineChart(labels, useValsInt, null, '#0284c7') + '</div>' +
    '</div>' : '') +
    /* 排行 + 预警同一行（成员版右侧不再留空白） */
    '<div class="grid-2">' +
      '<div class="card"><div class="card-title">消耗排行（近 90 天）<span class="more"><a onclick="gotoPage(\'stats\')" style="cursor:pointer">查看全部 →</a></span></div>' + barChart(rankTop) + '</div>' +
      '<div class="card"><div class="card-title">库存预警<span class="more"><a onclick="gotoPage(\'alerts\')" style="cursor:pointer">全部预警 →</a></span></div><div class="dash-activity">' + alertHtml + '</div></div>' +
    '</div>' +
    /* 最近动态独占一行（通栏展示更完整） */
    '<div class="card"><div class="card-title">最近动态<span class="more"><a onclick="gotoPage(\'history\')" style="cursor:pointer">历史追溯 →</a></span></div><div class="dash-activity">' + recentHtml + '</div></div>';
}

/* ==================== 3. 物料库列表 ==================== */

/* 列表筛选状态（全局，切页保持） */
var MatState = { q: '', pkg: '', loc: '', cat: '', sub: '', tag: '', sort: 'locNo', sortDir: 'asc', page: 1, pageSize: 15, showAllTags: false };

async function pageMaterials() {
  /* 单价已全员可见，无需角色分支 */
  /* 按筛选条件搜索 */
  var list = Search.query(MatState.q);                          // 先按关键词模糊搜索
  if (MatState.pkg) {                                           // 选择了封装
    list = list.filter(function (m) { return (m.pkg || '') === MatState.pkg; });  // 过滤
  }
  if (MatState.loc) {                                           // 选择了存放位置
    if (MatState.loc === '其他') list = list.filter(function (m) { var _lv = m.loc || ''; return _lv.indexOf('货架') !== 0 && _lv.indexOf('货柜') !== 0; });  // 其他=不以货架/货柜开头的自定义
    else list = list.filter(function (m) { return (m.loc || '').indexOf(MatState.loc) === 0; });  // 货架/货柜前缀匹配（如"货架A"）
  }
  if (MatState.cat) {                                            // 选择了母分类
    list = list.filter(function (m) { return m.cat === MatState.cat; });  // 过滤
  }
  if (MatState.sub) {                                           // 选择了子分类
    list = list.filter(function (m) { return m.sub === MatState.sub; });    // 过滤
  }
  if (MatState.tag) {                                           // 选择了标签
    list = list.filter(function (m) { return (m.tags || []).indexOf(MatState.tag) >= 0; });  // 过滤
  }
  /* 排序 */
  var s = MatState.sort;                                        // 排序方式
  list = list.slice().sort(function (a, b) {                    // 不改变原数组
    if (s === 'name') return (a.name || '').localeCompare(b.name || '');           // 按名称
    if (s === 'time') return MatState.sortDir === 'desc'                           // 更新时间：按方向按钮
      ? (b.updatedAt || 0) - (a.updatedAt || 0)
      : (a.updatedAt || 0) - (b.updatedAt || 0);
    if (s === 'stock') return MatState.sortDir === 'desc'                          // 库存：按方向按钮
      ? (b.stock || 0) - (a.stock || 0)
      : (a.stock || 0) - (b.stock || 0);
    if (s === 'price') return MatState.sortDir === 'desc'                          // 单价：按方向按钮
      ? (b.price || 0) - (a.price || 0)
      : (a.price || 0) - (b.price || 0);
    return MatState.sortDir === 'desc'                                             // 位置编号：按当前方向
      ? (b.locNo || '').localeCompare(a.locNo || '')
      : (a.locNo || '').localeCompare(b.locNo || '');
  });
  /* 分页 */
  var total = list.length;                                       // 总条数
  var totalPages = Math.max(Math.ceil(total / MatState.pageSize), 1);  // 总页数
  if (MatState.page > totalPages) MatState.page = totalPages;     // 越界纠正
  var start = (MatState.page - 1) * MatState.pageSize;           // 起始下标
  var pageItems = list.slice(start, start + MatState.pageSize);  // 本页数据

  /* 生成行 HTML */
  var rows = '';                                                  // 行集合
  for (var i = 0; i < pageItems.length; i++) {                    // 遍历本页
    var m = pageItems[i];                                         // 当前物料
    var stockBadge = '';                                          // 库存徽章
    if (m.minStock && m.stock <= m.minStock) stockBadge = '<span class="badge badge-red">' + m.stock + ' ' + escapeHtml(m.unit || '') + '</span>';  // 告急
    else if (m.minStock && m.stock <= m.minStock * 1.5) stockBadge = '<span class="badge badge-yellow">' + m.stock + ' ' + escapeHtml(m.unit || '') + '</span>';  // 偏低
    else stockBadge = '<span class="num">' + m.stock + ' ' + escapeHtml(m.unit || '') + '</span>';  // 正常
    var tagsHtml = '';                                            // 标签串
    var tags = m.tags || [];                                      // 标签数组
    for (var t = 0; t < tags.length && t < 3; t++) {              // 最多显示 3 个
      tagsHtml += '<span class="tag-chip" onclick="filterByTag(\'' + escapeHtml(tags[t]) + '\')">' + escapeHtml(tags[t]) + '</span> ';  // 点标签筛选
    }
    rows += '<tr>' +
      '<td style="white-space:nowrap">' + locBadge(m.loc, m.locNo, !canSeeLoc(m.id)) + '</td>' +   // 位置+编号一个框拼一起（#FF7F27）
      '<td><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + '</div></td>' +
      '<td style="white-space:nowrap">' + escapeHtml(m.pkg || '-') + '</td>' +
      '<td style="white-space:nowrap">' + escapeHtml(m.cat || '') + '<div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.sub || '') + '</div></td>' +
      '<td>' + tagsHtml + '</td>' +
      '<td>' + stockBadge + '</td>' +
      '<td class="num">' + fmtMoney(m.price) + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-success" onclick="openStockIOModal(\'' + m.id + '\',\'in\')" title="入库">入</button> ' +
        '<button class="btn btn-sm btn-blue" onclick="openStockIOModal(\'' + m.id + '\',\'out\')" title="出库">出</button> ' +
        (Auth.can('manage') ? '<button class="btn btn-sm btn-outline" onclick="openMaterialForm(\'' + m.id + '\')" title="编辑">' + ICONS.edit + '</button> ' : '') +
      '</td>' +
      '</tr>';
  }
  if (pageItems.length === 0) {                                  // 没数据
    rows = '<tr><td colspan="8"><div class="empty"><div class="e-ico">' + ICONS.box + '</div>没有找到物料<br><span style="font-size:12px">试试换个关键词，或点击"新增物料"</span></div></td></tr>';
  }

  /* 封装下拉选项（从物料聚合） */
  var pkgSet = {};                                                // 封装去重集合
  for (var pk = 0; pk < State.materials.length; pk++) {          // 遍历物料
    if (State.materials[pk].pkg) pkgSet[State.materials[pk].pkg] = 1;  // 收集
  }
  var pkgOpts = '<option value="">全部封装</option>';            // 默认项
  for (var pk2 in pkgSet) pkgOpts += '<option value="' + escapeHtml(pk2) + '"' + (MatState.pkg === pk2 ? ' selected' : '') + '>' + escapeHtml(pk2) + '</option>';
  /* 存放位置下拉固定四项：全部位置 / 货柜 / 货架 / 其他（其他=自定义位置） */
  var locOpts = '<option value="">全部位置</option>' +
    '<option value="货柜"' + (MatState.loc === '货柜' ? ' selected' : '') + '>货柜</option>' +
    '<option value="货架"' + (MatState.loc === '货架' ? ' selected' : '') + '>货架</option>' +
    '<option value="其他"' + (MatState.loc === '其他' ? ' selected' : '') + '>其他</option>';
  /* 母分类下拉选项 */
  var catOpts = '<option value="">全部母类</option>';            // 默认项
  for (var c = 0; c < CAT_TREE.length; c++) {                     // 遍历分类树
    catOpts += '<option value="' + escapeHtml(CAT_TREE[c].name) + '"' + (MatState.cat === CAT_TREE[c].name ? ' selected' : '') + '>' + escapeHtml(CAT_TREE[c].name) + '</option>';
  }
  /* 子分类下拉选项（跟随母分类） */
  var subOpts = '<option value="">全部子类</option>';            // 默认项
  if (MatState.cat) {                                             // 已选母分类
    for (var s2 = 0; s2 < CAT_TREE.length; s2++) {                // 找到该母分类
      if (CAT_TREE[s2].name === MatState.cat) {                   // 匹配
        var subs = CAT_TREE[s2].subs;                             // 子分类数组
        for (var sb = 0; sb < subs.length; sb++) {                // 生成选项
          subOpts += '<option value="' + escapeHtml(subs[sb]) + '"' + (MatState.sub === subs[sb] ? ' selected' : '') + '>' + escapeHtml(subs[sb]) + '</option>';
        }
        break;                                                    // 找到就停
      }
    }
  }
  /* 全部标签聚合（供标签筛选） */
  var tagSet = {};                                                // 标签去重集合
  for (var tg = 0; tg < State.materials.length; tg++) {           // 遍历物料
    var tt = State.materials[tg].tags || [];                       // 物料标签
    for (var t2 = 0; t2 < tt.length; t2++) tagSet[tt[t2]] = (tagSet[tt[t2]] || 0) + 1;  // 计数
  }
  /* 标签按使用次数排序，默认只露 12 个高频的，其余收进"更多"，避免标签墙把表格挤出屏幕 */
  var tagEntries = [];                                            // [标签, 次数] 数组
  for (var key in tagSet) tagEntries.push([key, tagSet[key]]);    // 转数组
  tagEntries.sort(function (a, b) { return b[1] - a[1]; });       // 用得多的在前
  var TAG_LIMIT = 12;                                             // 默认显示个数
  var showAll = !!MatState.showAllTags;                           // 是否已展开
  var visible = (showAll || tagEntries.length <= TAG_LIMIT) ? tagEntries : tagEntries.slice(0, TAG_LIMIT);  // 本次显示
  var tagChips = '';                                              // 标签栏 HTML
  for (var te = 0; te < visible.length; te++) {                   // 遍历可见标签
    var tk = visible[te][0];                                      // 标签名
    var on = MatState.tag === tk ? ' style="outline:2px solid var(--primary)"' : '';  // 选中态
    tagChips += '<span class="tag-chip" ' + on + 'onclick="filterByTag(\'' + escapeHtml(tk) + '\')">' + escapeHtml(tk) + '</span> ';  // 可点筛选
  }
  if (MatState.tag && !visible.some(function (v) { return v[0] === MatState.tag; })) {   // 选中的标签被折叠了
    tagChips += '<span class="tag-chip" style="outline:2px solid var(--primary)" onclick="filterByTag(\'' + escapeHtml(MatState.tag) + '\')">' + escapeHtml(MatState.tag) + '</span> ';  // 补显出来
  }
  if (tagEntries.length > TAG_LIMIT) {                            // 还有被折叠的标签
    tagChips += '<span class="tag-chip" style="opacity:.75" onclick="MatState.showAllTags=!MatState.showAllTags;pageMaterials()">' + (showAll ? '收起 ↑' : '更多 ' + (tagEntries.length - TAG_LIMIT) + ' ↓') + '</span> ';  // 展开/收起
  }

  /* 面包屑：只有选了分类才显示（否则和页头标题重复） */
  var crumb = (MatState.cat || MatState.sub)
    ? '<div class="breadcrumb"><a onclick="gotoPage(\'materials\')">物料库</a>' +
      (MatState.cat ? ' › <a onclick="filterByCat(\'' + escapeHtml(MatState.cat) + '\')">' + escapeHtml(MatState.cat) + '</a>' : '') +
      (MatState.sub ? ' › <span class="cur">' + escapeHtml(MatState.sub) + '</span>' : '') +
      '</div>'
    : '';

  /* 输出页面 */
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">物料库</div><div class="page-desc">支持中文 / 拼音 / 型号 / 丝印 / 别称 / 用途描述模糊搜索</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-outline" onclick="openPhotoRecog()">' + ICONS.image + '图片识别</button>' +  // 图片识别：AI 看图自动填登记表
        (Auth.can('manage') ? '<button class="btn btn-outline" onclick="exportMaterialsCSV()">' + ICONS.database + '导出 Excel</button>' : '') +
        (Auth.can('manage') ? '<button class="btn btn-primary" onclick="openMaterialForm(\'\')">' + ICONS.plus + '新增物料</button>' : '') +
      '</div>' +
    '</div>' +
    crumb +
    '<div class="card">' +
      /* 搜索与筛选工具栏 */
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">' +
        '<div style="flex:1 1 180px;min-width:150px;position:relative">' +
          '<input class="input" id="mat-q" placeholder="搜索名称 / 型号 / 丝印 / 封装 / 位置…" value="' + escapeHtml(MatState.q) + '" oninput="onMatSearch(this.value)" />' +
        '</div>' +
        '<select class="select" style="width:105px" id="mat-pkg" onchange="filterByPkg(this.value)">' + pkgOpts + '</select>' +
        '<select class="select" style="width:110px" id="mat-loc" onchange="filterByLoc(this.value)">' + locOpts + '</select>' +
        '<select class="select" style="width:120px" id="mat-cat" onchange="filterByCat(this.value)">' + catOpts + '</select>' +
        '<select class="select" style="width:112px" id="mat-sub" onchange="filterBySub(this.value)">' + subOpts + '</select>' +
        '<select class="select" style="width:130px" onchange="MatState.sort=this.value;MatState.page=1;pageMaterials()">' +
          '<option value="locNo"' + (MatState.sort === 'locNo' ? ' selected' : '') + '>按位置编号排序</option>' +
          '<option value="stock"' + (MatState.sort === 'stock' ? ' selected' : '') + '>按库存排序</option>' +
          '<option value="price"' + (MatState.sort === 'price' ? ' selected' : '') + '>按单价排序</option>' +
          '<option value="time"' + (MatState.sort === 'time' ? ' selected' : '') + '>按照更新时间排序</option>' +
        '</select>' +
        '<button class="btn btn-primary" style="padding:0 16px;height:38px;font-size:13.5px;font-weight:600;white-space:nowrap" onclick="toggleSortDir()" title="切换正序 / 倒序">' + (MatState.sortDir === 'desc' ? '降序 ↓' : '升序 ↑') + '</button>' +
      '</div>' +
      /* 标签栏 + 清除按钮同一行：左标签、右清除；没有任何筛选时整行不渲染，界面更干净 */
      (function () {
        var hasFilter = !!(MatState.q || MatState.pkg || MatState.loc || MatState.cat || MatState.sub || MatState.tag);  // 是否有生效的筛选
        if (!tagChips && !hasFilter) return '';                                       // 无标签也无筛选：不占空间
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
          (tagChips ? '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:12px;color:var(--text-sub)">按标签筛选：</span>' + tagChips + '</div>' : '<span></span>') +
          (hasFilter ? '<button class="btn-clear" onclick="matClearAll()">' + ICONS.close + '清除筛选</button>' : '') +
        '</div>';
      })() +
      (!isAdminNow() ? '<div class="form-hint" style="margin-bottom:10px">🔒 普通成员只能查看自己<b>做过有效出入库</b>（数量不能为 0）的物料位置，解锁后 <b>10 分钟</b>内有效。</div>' : '') +
      /* 表格 */
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>位置</th><th>名称 / 型号</th><th>封装</th><th>类别</th><th>标签</th><th>库存</th><th>单价</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      /* 分页 */
      '<div class="pager">' +
        '<span class="p-info">共 ' + total + ' 种物料 · 第 ' + MatState.page + ' / ' + totalPages + ' 页</span>' +
        '<div class="p-btns">' +
          '<button class="btn btn-sm" ' + (MatState.page <= 1 ? 'disabled' : '') + ' onclick="MatState.page--;pageMaterials()">上一页</button>' +
          '<button class="btn btn-sm" ' + (MatState.page >= totalPages ? 'disabled' : '') + ' onclick="MatState.page++;pageMaterials()">下一页</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* 恢复搜索框光标到末尾（输入时重渲染导致光标丢失的修补） */
  var qInput = $('#mat-q');                                       // 搜索框
  if (qInput && document.activeElement !== qInput && MatState.q) {  // 之前正在输入
    qInput.focus();                                               // 聚焦
    qInput.setSelectionRange(qInput.value.length, qInput.value.length);  // 光标移到末尾
  }
}

/* 清除所有排序筛选：搜索词 + 全部筛选 + 排序恢复默认 */
function matClearAll() {
  MatState.q = ''; MatState.pkg = ''; MatState.loc = ''; MatState.cat = ''; MatState.sub = ''; MatState.tag = '';
  MatState.sort = 'locNo'; MatState.sortDir = 'asc'; MatState.page = 1;
  pageMaterials();
}

/* 搜索框输入（防抖后刷新列表） */
var onMatSearch = debounce(function (val) {
  MatState.q = val;                                               // 保存关键词
  MatState.page = 1;                                              // 回到第一页
  pageMaterials();                                                // 重新渲染
}, 250);

/* 按母分类筛选 */
function filterByCat(cat) {
  MatState.cat = cat;                                              // 保存选择
  MatState.sub = '';                                               // 子分类重置
  MatState.page = 1;                                               // 回第一页
  pageMaterials();                                                 // 刷新
}

/* 按子分类筛选 */
function filterBySub(sub) {
  MatState.sub = sub;                                              // 保存
  MatState.page = 1;
  pageMaterials();
}

/* 按标签筛选（再次点击取消） */
function filterByTag(tag) {
  MatState.tag = (MatState.tag === tag) ? '' : tag;                // 相同标签再点一次 = 取消
  MatState.page = 1;
  pageMaterials();
}

/* 按封装筛选 */
function filterByPkg(v) {
  MatState.pkg = v;                                                 // 保存选择
  MatState.page = 1;                                                // 回第一页
  pageMaterials();                                                  // 刷新
}

/* 按存放位置筛选 */
function filterByLoc(v) {
  MatState.loc = v;                                                 // 保存选择
  MatState.page = 1;                                                // 回第一页
  pageMaterials();                                                  // 刷新
}

/* 切换排序方向（升序 / 降序） */
function toggleSortDir() {
  MatState.sortDir = (MatState.sortDir === 'desc') ? 'asc' : 'desc';  // 切换方向
  MatState.page = 1;                                                  // 回第一页
  pageMaterials();                                                    // 刷新
}

/* ==================== 4. 物料新增 / 编辑表单 ==================== */

/* 打开物料表单弹窗：传空串=新增，传 id=编辑 */
function openMaterialForm(id) {
  if (!Auth.can('manage')) { toast('您没有管理物料的权限，请联系管理员', 'warn'); return; }  // 权限检查
  var m = null;                                                    // 编辑目标
  if (id) {                                                        // 传了 id：找出物料
    for (var i = 0; i < State.materials.length; i++) {             // 遍历缓存
      if (State.materials[i].id === id) { m = State.materials[i]; break; }  // 找到
    }
    if (!m) { toast('物料不存在', 'err'); return; }                // 没找到
  }
  /* 母分类下拉选项（支持自定义：最后加一个"自定义…"选项） */
  var catOpts = '<option value="">-- 请选择 --</option>';
  var selCat = m ? m.cat : '';                                     // 当前选中母分类
  var catIsCustom = selCat && !CAT_TREE.some(function (c) { return c.name === selCat; });  // 当前分类不在树里 = 历史自定义分类
  for (var c = 0; c < CAT_TREE.length; c++) {
    catOpts += '<option value="' + escapeHtml(CAT_TREE[c].name) + '"' + (selCat === CAT_TREE[c].name ? ' selected' : '') + '>' + escapeHtml(CAT_TREE[c].name) + '</option>';
  }
  catOpts += '<option value="自定义"' + (catIsCustom ? ' selected' : '') + '>自定义…</option>';  // 自定义入口
  mfPhotoCamCancel();                                              // 清掉上次可能残留的摄像头流
  if (m) mfPhotos = (m.photos || []).slice();                      // 编辑时把已有照片装进暂存区
  else mfPhotos = [];                                              // 新增时清空
  /* 存放位置（组合框直接回显） */
  var locVal = m ? (m.loc || '') : '';                               // 当前存放位置

  openModal(m ? '编辑物料：' + escapeHtml(m.name) : '新增物料', '' +
    '<form id="mat-form" onsubmit="saveMaterialForm(event, \'' + (id || '') + '\')">' +
      /* 1. 名称 / 型号（型号必填） */
      '<div class="form-row">' +
        '<div class="form-item"><label>名称 <span class="req">*</span></label><input class="input" name="name" required maxlength="60" value="' + escapeHtml(m ? m.name : '') + '" placeholder="如：超声波测距模块" /></div>' +
        '<div class="form-item"><label>型号 / 规格 <span class="req">*</span></label><input class="input" name="model" required maxlength="60" value="' + escapeHtml(m ? (m.model || '') : '') + '" placeholder="如：HC-SR04" /></div>' +
      '</div>' +
      /* 2. 封装（联想输入，必填） / 丝印 */
      '<div class="form-row">' +
        '<div class="form-item" style="position:relative"><label>封装 <span class="req">*</span></label><input class="input" name="pkg" id="mf-pkg" required maxlength="60" value="' + escapeHtml(m ? (m.pkg || '') : '') + '" placeholder="如：DIP-8 / SOP-8 / 0805" oninput="mfPkgInput(this.value)" onfocus="mfPkgInput(this.value)" onblur="setTimeout(function(){var el=$(\'#mf-pkg-sug\');if(el)el.style.display=\'none\';},120)" /><div class="pkg-suggest" id="mf-pkg-sug"></div></div>' +
        '<div class="form-item"><label>丝印（元件上印的字）</label><input class="input" name="silk" maxlength="60" value="' + escapeHtml(m ? (m.silk || '') : '') + '" placeholder="如：HC-SR04 / 102" /></div>' +
      '</div>' +
      /* 3. 库存数量 / 库存预警线 / 单位（单位放最后，收窄） */
      '<div class="form-row">' +
        (m
          ? '<div class="form-item"><label>库存数量</label><input class="input" type="number" value="' + m.stock + '" readonly /><div class="form-hint">只能通过出入库修改</div></div>'
          : '<div class="form-item"><label>库存数量 <span class="req">*</span></label><input class="input" name="stock" type="number" min="0" step="1" value="0" placeholder="0" /></div>') +
        /* 预警线：管理员可改；普通成员也保留输入框但禁用，数字在框内、小字提示在框下（与管理员同构） */
        (isAdminNow() ?
          '<div class="form-item"><label>库存预警线（低于此数标红提醒）</label><input class="input" name="minStock" type="number" min="0" step="1" value="' + (m ? (m.minStock || 0) : 5) + '" /><div class="form-hint">新增默认 5，系统会按用量自动微调</div></div>' :
          '<div class="form-item"><label>库存预警线（低于此数标红提醒）</label><input class="input" type="number" min="0" step="1" value="' + (m ? (m.minStock || 0) : 5) + '" disabled /><div class="form-hint">仅管理员可修改</div></div>') +
        '<div class="form-item" style="flex:0 1 120px"><label>单位</label><input class="input" name="unit" maxlength="10" value="' + escapeHtml(m ? (m.unit || '个') : '个') + '" placeholder="个/块/米" /></div>' +
      '</div>' +
      /* 4. 存放位置（组合框：下拉选货架/货柜，也可直接打字=自定义） / 位置编号 */
      '<div class="form-row">' +
        '<div class="form-item"><label>存放位置 <span class="req">*</span></label>' +
          '<div style="position:relative">' +
            '<input class="input" name="loc" id="mf-loc" required maxlength="40" autocomplete="off" value="' + escapeHtml(locVal) + '" placeholder="点右侧▮选择，或直接输入自定义位置" oninput="mfLocInput()" onfocus="mfLocMenu(true)" onblur="setTimeout(function(){mfLocMenu(false)},150)" />' +
            '<button type="button" class="mf-loc-btn" onclick="mfLocToggle(event)" tabindex="-1">▾</button>' +
            '<div id="mf-loc-menu" class="mf-loc-menu"></div>' +
          '</div>' +
        '</div>' +
        '<div class="form-item"><label id="mf-locno-label">位置编号 <span class="req">*</span></label><input class="input" name="locNo" id="mf-locno" maxlength="40" value="' + escapeHtml(m ? (m.locNo || '') : '') + '" placeholder="如：A-1-03（架-层-盒）" /></div>' +
      '</div>' +
      /* 5. 母分类 / 子分类 */
      '<div class="form-row">' +
        '<div class="form-item"><label>母分类 <span class="req">*</span></label><select class="select" name="cat" id="mf-cat" required onchange="mfCatChanged()">' + catOpts + '</select>' +
          '<input class="input" name="cat2" id="mf-cat2" maxlength="20" placeholder="输入自定义分类名，如：传感器模块" style="display:none;margin-top:8px" /></div>' +
        '<div class="form-item"><label>子分类</label><select class="select" name="sub" id="mf-sub" onchange="mfSubCustom()"><option value="">-- 可不选 --</option></select>' +
          '<input class="input" name="sub2" id="mf-sub2" maxlength="20" placeholder="输入自定义子类名" style="display:none;margin-top:8px" /></div>' +
      '</div>' +
      /* 6. 别称 / 标签 */
      '<div class="form-row">' +
        '<div class="form-item"><label>别称（搜索用，分号分隔）</label><input class="input" name="alias" maxlength="200" value="' + escapeHtml(m ? (m.alias || '') : '') + '" placeholder="如：超声波;超声;ultrasonic" /></div>' +
        '<div class="form-item"><label>标签（逗号分隔）</label><input class="input" name="tags" maxlength="120" value="' + escapeHtml(m ? ((m.tags || []).join(',')) : '') + '" placeholder="如：常用,小车必备,比赛" /></div>' +
      '</div>' +
      /* 6.5 数据手册链接（标签下一行） */
      '<div class="form-item"><label>数据手册链接</label><input class="input" name="datasheet" maxlength="300" value="' + escapeHtml(m ? (m.datasheet || '') : '') + '" placeholder="https://... （元件 PDF 数据手册，点击可跳转）" /></div>' +
      /* 7. 购买链接 / 供应商 / 单价 */
      '<div class="form-row">' +
        '<div class="form-item"><label>参考购买链接</label><input class="input" name="link" maxlength="300" value="' + escapeHtml(m ? (m.link || '') : '') + '" placeholder="https://... （可粘贴淘宝/立创商城链接）" /></div>' +
        '<div class="form-item"><label>供应商</label><input class="input" name="supplier" maxlength="60" value="' + escapeHtml(m ? (m.supplier || '') : '') + '" placeholder="如：立创商城 / 淘宝xx店" /></div>' +
        '<div class="form-item"><label>单价（元）</label><input class="input" name="price" type="number" step="0.01" min="0" value="' + (m ? (m.price || 0) : 0) + '" placeholder="0.00" /></div>' +
      '</div>' +
      /* 8. 实物照片 */
      '<div class="form-item"><label>实物照片（最多 3 张，拍了方便大家认物，也能给 AI 识别当参考）</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<div id="mf-photos" style="display:flex;gap:8px;flex-wrap:wrap"></div>' +
          '<label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0">' + ICONS.image + ' 选图' +
            '<input type="file" accept="image/*" multiple style="display:none" onchange="mfPhotoAdd(this,\'pick\')" /></label>' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="mfPhotoCamClick()">' + ICONS.camera + ' 拍照</button>' +
          '<input type="file" id="mf-file-cam" accept="image/*" multiple capture="environment" style="display:none" onchange="mfPhotoAdd(this,\'cam\')" />' +
        '</div>' +
        '<div id="mf-cam-area" style="display:none;margin-top:8px;position:relative">' +
          '<video id="mf-cam-video" autoplay playsinline muted style="width:100%;border-radius:8px;max-height:220px"></video>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button type="button" class="btn btn-sm btn-primary" style="flex:1" onclick="mfPhotoCamSnap()">拍照</button>' +
            '<button type="button" class="btn btn-sm" style="flex:1" onclick="mfPhotoCamCancel()">取消</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-hint">手机上点"拍照"直接调起系统相机，电脑上会在框内摄像头取景；也可以 Ctrl+V 粘贴，或把图片拖到页面任意位置（最多 3 张，自动压缩存储）</div>' +
      '</div>' +
      /* 9. 用途描述 */
      '<div class="form-item"><label>用途描述（会被搜索到，也方便 AI 理解）</label><textarea class="textarea" name="desc" maxlength="500" placeholder="这个元件是干什么用的、用在什么项目上…">' + escapeHtml(String(m ? (m.desc || '') : '').replace(/<br\s*\/?>/gi, '\n')) + '</textarea></div>' +
      '<div class="form-hint">带 <span class="req">*</span> 为必填；别称和描述填得越全，模糊搜索越容易找到（支持拼音搜索）</div>' +
    '</form>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="$(\'#mat-form\').requestSubmit()">' + (m ? '保存修改' : '创建物料') + '</button>',
    'mid');

  /* 表单打开后：填充子分类下拉（编辑时要回显） */
  mfCatChanged();                                                   // 触发一次子分类联动
  if (m && m.sub) $('#mf-sub').value = m.sub;                       // 编辑时回显子分类
  if (m && m.loc) {                                                  // 回显存放位置（组合框直接显示）
    $('#mf-loc').value = m.loc;
  }
  mfLocInput();                                                      // 按位置设置编号必填态
  renderMfPhotos();                                                 // 渲染已有照片缩略图
  document.addEventListener('paste', mfPasteHandler);               // 支持 Ctrl+V 粘贴图片
}

/* 母分类改变时联动刷新子分类下拉（选"自定义…"时显示自定义输入框） */
function mfCatChanged() {
  var cat = $('#mf-cat').value;                                     // 当前母分类
  $('#mf-cat2').style.display = (cat === '自定义') ? 'block' : 'none';  // 自定义输入框显隐
  var subSel = $('#mf-sub');                                        // 子分类下拉框
  var html = '<option value="">-- 可不选 --</option>';              // 默认选项
  html += '<option value="自定义">自定义…</option>';                 // 子类也支持自定义
  for (var i = 0; i < CAT_TREE.length; i++) {                       // 遍历分类树
    if (CAT_TREE[i].name === cat) {                                 // 找到当前母分类
      var subs = CAT_TREE[i].subs;                                   // 子分类数组
      for (var j = 0; j < subs.length; j++) {                       // 逐个生成选项
        html += '<option value="' + escapeHtml(subs[j]) + '">' + escapeHtml(subs[j]) + '</option>';
      }
      break;                                                        // 找到即停
    }
  }
  subSel.innerHTML = html;                                          // 更新下拉框
}

/* 子分类选"自定义…"时显示自定义输入框 */
function mfSubCustom() {
  var v = $('#mf-sub').value;                                       // 当前子分类选择
  $('#mf-sub2').style.display = (v === '自定义') ? 'block' : 'none';  // 显隐输入框
}

/* 单位下拉选"自定义"时显示自定义输入框 */
function mfUnitCustom() {
  var v = $('#mf-unit').value;                                      // 当前单位选择
  $('#mf-unit2').style.display = (v === '自定义') ? 'block' : 'none';  // 显示/隐藏自定义输入框
}

/* ===== 存放位置组合框 ===== */
var MF_LOC_OPTS = ['货架', '货柜'];
/* 打开/关闭下拉菜单 */
function mfLocMenu(show) {
  var menu = $('#mf-loc-menu');
  if (!menu) return;
  if (show) {
    var html = '';
    for (var i = 0; i < MF_LOC_OPTS.length; i++) {
      html += '<div class="mf-loc-opt" onmousedown="mfLocPick(\'' + MF_LOC_OPTS[i] + '\')">' + MF_LOC_OPTS[i] + '</div>';
    }
    html += '<div class="mf-loc-opt" onmousedown="mfLocPick(\'\',true)"><i>自定义（直接在框里输入即可）</i></div>';
    menu.innerHTML = html;
    menu.style.display = 'block';
  } else {
    menu.style.display = 'none';
  }
}
/* 点 ▾ 按钮切换 */
function mfLocToggle(e) {
  e.preventDefault();
  var menu = $('#mf-loc-menu');
  mfLocMenu(!menu || menu.style.display === 'none');
}
/* 选中标准项 / 自定义 */
function mfLocPick(v, custom) {
  var inp = $('#mf-loc');
  if (custom) { inp.value = ''; }
  else { inp.value = v; }
  inp.focus();
  mfLocInput();
  mfLocMenu(false);
}
/* 输入变化：标准位置→编号必填；自定义→编号选填 */
function mfLocInput() {
  var v = ($('#mf-loc').value || '').trim();
  var isStd = MF_LOC_OPTS.indexOf(v) >= 0;
  var lab = $('#mf-locno-label');
  if (lab) {
    lab.innerHTML = '位置编号 ' + (isStd
      ? '<span class="req">*</span>'
      : '<span style="font-size:12px;font-weight:400;color:var(--text-sub)">（自定义位置可不填）</span>');
  }
  mfLocMenu(false);
}

/* 封装联想输入：打字显示相似项（百度风格，命中部分主题色高亮），点选后仍可修改 */
function mfPkgInput(v) {
  var sug = $('#mf-pkg-sug');                                       // 候选容器
  if (!sug) return;                                                 // 表单没开
  var q = String(v || '').trim().toLowerCase();                    // 关键词
  var list = [];                                                    // 候选数组
  if (q) {                                                          // 有输入才联想
    for (var i = 0; i < State.materials.length; i++) {             // 遍历物料
      var p = State.materials[i].pkg;                               // 封装值
      if (p && list.indexOf(p) < 0 && p.toLowerCase().indexOf(q) >= 0) list.push(p);  // 包含匹配并去重
    }
    list.sort(function (a, b) { return a.localeCompare(b); });      // 排序
    if (list.length > 8) list = list.slice(0, 8);                   // 最多 8 条
  }
  if (!q || list.length === 0) { sug.style.display = 'none'; return; }  // 无候选收起
  var html = '';                                                    // 候选 HTML
  for (var j = 0; j < list.length; j++) {                          // 生成候选
    var p2 = list[j];                                               // 候选值
    var low = p2.toLowerCase();                                    // 小写
    var pos = low.indexOf(q);                                      // 命中位置
    var hl = '';                                                    // 高亮片段
    if (pos >= 0) {                                                 // 有命中
      hl = escapeHtml(p2.slice(0, pos)) + '<span style="color:var(--primary);font-weight:600">' + escapeHtml(p2.slice(pos, pos + q.length)) + '</span>' + escapeHtml(p2.slice(pos + q.length));
    } else { hl = escapeHtml(p2); }
    html += '<div class="ps-item" onmousedown="mfPkgPick(\'' + escapeHtml(p2).replace(/'/g, '&#39;') + '\')">' + hl + '</div>';
  }
  sug.innerHTML = html;                                             // 输出候选
  sug.style.display = 'block';                                      // 显示
}

/* 选中封装候选：填入输入框（光标到末尾，仍可继续修改），收起列表 */
function mfPkgPick(v) {
  var inp = $('#mf-pkg');                                           // 封装输入框
  if (inp) { inp.value = v; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }  // 填入并定位末尾
  var sug = $('#mf-pkg-sug');                                       // 候选容器
  if (sug) sug.style.display = 'none';                             // 收起
}

/* ==================== 4.5 物料照片上传（暂存区） ==================== */

var mfPhotos = [];                                                   // 表单里待保存的照片（dataURL 数组，保存时写进物料）

/* 往表单里加照片：自动压缩后放进暂存区（兼容 input 元素 或 直接传 File） */
async function mfPhotoAdd(input, mode) {
  var files = [];
  if (input && input.files) { files = [].slice.call(input.files); }  // 元素：取文件列表
  else if (input) { files = [input]; }                               // 直接传 File（粘贴 / 拖拽）
  for (var i = 0; i < files.length; i++) {                           // 逐张处理
    await mfPhotoAddFile(files[i]);                                  // 单张入暂存区
  }
  if (input && input.files) input.value = '';                        // 清空控件（同一路径可重选）
  renderMfPhotos();                                                  // 刷新缩略图
}

/* 单张照片入暂存区（选图 / 拍照 / 粘贴 / 拖拽共用入口） */
async function mfPhotoAddFile(f) {
  if (!f || !f.type || f.type.indexOf('image') !== 0) { toast('请选择图片文件', 'warn'); return; }
  if (mfPhotos.length >= 3) { toast('最多上传 3 张照片', 'warn'); return; }  // 超出上限
  try {
    var dataUrl = await compressImage(f, 900);                       // 压缩成 900px 的 JPEG
    mfPhotos.push(dataUrl);                                          // 加入暂存区
    renderMfPhotos();                                                // 立即刷新缩略图（粘贴/拖拽/拍照都要走这里）
  } catch (err) {
    toast('图片处理失败：' + err.message, 'err');                     // 失败提示
  }
}

/* 物料表单打开期间 Ctrl+V 粘贴图片（落到实物照片） */
function mfPasteHandler(e) {
  if (!$('#mf-photos')) { document.removeEventListener('paste', mfPasteHandler); return; }  // 表单已关
  var items = e.clipboardData && e.clipboardData.items;               // 剪贴板内容
  if (!items) return;                                                 // 拿不到就不管
  for (var i = 0; i < items.length; i++) {                            // 逐项找图片
    if (items[i].type && items[i].type.indexOf('image') === 0) {      // 图片类型
      var f = items[i].getAsFile();                                   // 转成文件对象
      if (f) { mfPhotoAddFile(f); e.preventDefault(); }               // 加入实物照片并阻止默认
      break;                                                          // 只处理第一张
    }
  }
}

var MF_CAM_STREAM = null;                                            // 网页摄像头取景的媒体流
/* 拍照入口：手机→系统相机；电脑→网页摄像头取景（带超时保护，设备被占用时不卡死） */
function mfPhotoCamClick() {
  if (isMobileDevice()) { $('#mf-file-cam').click(); return; }      // 手机：系统相机
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('当前环境不支持调用摄像头，可改用选图', 'err'); return;
  }
  var area = $('#mf-cam-area');
  if (area) area.style.display = 'block';                            // 显示取景区
  var timedOut = false;
  var timer = setTimeout(function () {                               // 8 秒打不开就放弃，防止无限挂起
    timedOut = true;
    mfPhotoCamCancel();
    toast('摄像头打开超时（可能被其他程序占用），可改用选图', 'err');
  }, 8000);
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280, max: 1600 } }, audio: false })
    .then(function (stream) {
      clearTimeout(timer);
      if (timedOut) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      MF_CAM_STREAM = stream;                                        // 存流备用
      var v = $('#mf-cam-video');
      if (v) v.srcObject = stream;                                   // 喂入画面
    })
    .catch(function (err) {
      clearTimeout(timer);
      if (area) area.style.display = 'none';
      toast('无法打开摄像头：' + err.message + '，可改用选图', 'err');
    });
}
/* 取景中点"拍照"：截当前帧加入实物照片（限 1280 分辨率，整体兜错防闪退） */
function mfPhotoCamSnap() {
  try {
    var v = $('#mf-cam-video');
    if (!v || !v.videoWidth) { toast('摄像头还没就绪，请稍等', 'warn'); return; }
    var cw = v.videoWidth, ch = v.videoHeight;                      // 原始帧尺寸
    var sc = Math.min(1280 / cw, 1280 / ch, 1);                     // 最长边压到 1280
    var w = Math.round(cw * sc), h = Math.round(ch * sc);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(v, 0, 0, w, h);
    var blob = dataUrlToBlob(canvas.toDataURL('image/jpeg', 0.85)); // 截帧转 Blob
    mfPhotoCamCancel();                                             // 停流并收起取景区
    mfPhotoAddFile(blob);                                           // 走统一入暂存区（自动压缩）
    toast('已拍照，可继续添加或保存', 'ok');
  } catch (err) {
    mfPhotoCamCancel();                                             // 出错也收摊，不卡界面
    toast('拍照失败：' + err.message + '，可改用选图', 'err');
  }
}
/* 取消取景：停流收起 */
function mfPhotoCamCancel() {
  if (MF_CAM_STREAM) { MF_CAM_STREAM.getTracks().forEach(function (t) { t.stop(); }); MF_CAM_STREAM = null; }
  var area = $('#mf-cam-area');
  if (area) area.style.display = 'none';
  var v = $('#mf-cam-video');
  if (v) v.srcObject = null;
}
/* dataURL 转 Blob（摄像头截帧用） */
function dataUrlToBlob(d) {
  var parts = d.split(',');
  var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  var bin = atob(parts[1]);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* 删除暂存区里的某张照片 */
function mfPhotoRemove(idx) {
  mfPhotos.splice(idx, 1);                                           // 按下标移除
  renderMfPhotos();                                                  // 刷新缩略图
}

/* 渲染照片缩略图（小图 + 右上角删除按钮） */
function renderMfPhotos() {
  var box = $('#mf-photos');                                         // 容器
  if (!box) return;                                                  // 表单没打开
  var html = '';                                                     // 输出
  for (var i = 0; i < mfPhotos.length; i++) {                        // 逐张生成
    html += '<div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">' +
      '<img src="' + mfPhotos[i] + '" style="width:100%;height:100%;object-fit:cover" />' +          // 缩略图
      '<span onclick="mfPhotoRemove(' + i + ')" style="position:absolute;top:0;right:0;background:rgba(0,0,0,.55);color:#fff;font-size:11px;line-height:16px;width:16px;text-align:center;cursor:pointer;border-radius:0 0 0 6px">×</span>' +  // 删除角标
      '</div>';
  }
  box.innerHTML = html;                                              // 输出
}

/* 保存物料表单（新增或编辑共用） */
async function saveMaterialForm(e, id) {
  e.preventDefault();                                               // 阻止表单默认提交刷新页面
  var f = e.target;                                                 // 表单元素
  var fd = new FormData(f);                                         // 收集所有字段
  var unit = String(fd.get('unit') || '').trim() || '个';            // 单位（直接输入）
  var name = String(fd.get('name') || '').trim();                   // 物料名（必填）
  if (!name) { toast('请填写物料名称', 'err'); return; }             // 兜底校验
  /* 组装/更新物料对象 */
  var m;                                                            // 目标物料
  if (id) {                                                         // 编辑模式
    for (var i = 0; i < State.materials.length; i++) {              // 从缓存找
      if (State.materials[i].id === id) { m = State.materials[i]; break; }
    }
    if (!m) { toast('物料不存在', 'err'); return; }                  // 没找到
  } else {                                                          // 新增模式
    m = { id: uid('mat'), stock: parseInt(fd.get('stock') || 0, 10) || 0, createdAt: Date.now() };  // 初始库存只在创建时填
  }
  m.name = name;                                                    // 逐字段赋值
  m.model = String(fd.get('model') || '').trim();
  if (!m.model) { toast('请填写型号 / 规格', 'err'); return; }       // 型号必填
  m.cat = fd.get('cat') || '';                                      // 母分类
  if (m.cat === '自定义') {                                         // 选了"自定义…"就取输入框的值
    m.cat = String(fd.get('cat2') || '').trim();                    // 自定义分类名
    if (!m.cat) { toast('请填写自定义分类名', 'err'); return; }      // 没填就拦下
    ensureCustomCat(m.cat);                                         // 顺手存进分类树，下次下拉里直接有
  }
  m.sub = fd.get('sub') || '';                                      // 子分类
  if (m.sub === '自定义') {                                         // 子类同样支持自定义
    m.sub = String(fd.get('sub2') || '').trim();                    // 自定义子类名
    if (!m.sub) { toast('请填写自定义子类名', 'err'); return; }      // 没填就拦下
    ensureCustomCat(m.cat, m.sub);                                  // 存进分类树
  }
  if (!m.cat) { toast('请选择母分类', 'err'); return; }             // 分类必填
  m.unit = unit;                                                    // 单位
  m.price = parseFloat(fd.get('price') || 0) || 0;                  // 单价
  /* 预警线只有管理员能改：管理员以表单值为准；普通成员编辑时保持原值、新增给默认值 5 */
  if (isAdminNow()) {
    m.minStock = parseInt(fd.get('minStock') || 0, 10) || 0;           // 管理员：以表单填写为准（0 = 不预警）
  } else {
    m.minStock = id ? (m.minStock || 0) : 5;                           // 成员：编辑不动原值；新增用默认预警线 5
  }
  var locIn = String(fd.get('loc') || '').trim();                    // 存放位置（组合框直接输入）
  if (!locIn) { toast('请填写或选择存放位置', 'err'); return; }      // 位置必填
  m.loc = locIn;                                                     // 位置
  m.locNo = String(fd.get('locNo') || '').trim();                   // 位置编号
  /* 货架/货柜：位置编号必填；自定义位置：编号选填 */
  if (MF_LOC_OPTS.indexOf(m.loc) >= 0 && !m.locNo) {
    toast('选择了货架/货柜，请填写位置编号', 'err'); return;
  }
  m.pkg = String(fd.get('pkg') || '').trim();                       // 封装
  if (!m.pkg) { toast('请填写封装', 'err'); return; }                // 封装必填
  m.silk = String(fd.get('silk') || '').trim();                     // 丝印
  m.alias = String(fd.get('alias') || '').trim();                   // 别称
  m.supplier = String(fd.get('supplier') || '').trim();             // 供应商
  m.link = String(fd.get('link') || '').trim();                     // 购买链接
  m.datasheet = String(fd.get('datasheet') || '').trim();           // 数据手册链接
  m.desc = String(fd.get('desc') || '').trim();                     // 描述
  m.tags = String(fd.get('tags') || '').split(/[,，;；]/)           // 标签拆分（兼容中英文逗号分号）
    .map(function (t) { return t.trim(); })                         // 去首尾空格
    .filter(function (t) { return t.length > 0; });                  // 去空项
  if (!id) m.code = nextMaterialCode(m.cat);                         // 新增时自动生成编号
  m.photos = mfPhotos.slice(0, 3);                                   // 实物照片（最多 3 张，压缩后约几十 KB 一张）
  m.updatedAt = Date.now();                                          // 更新时间
  delete m._search;                                                  // 清掉内存索引再入库
  await DB.put('materials', m);                                      // 写库
  await Log.add(id ? '编辑物料' : '新增物料', name + '（' + m.code + '）');  // 日志
  await State.refreshMaterials();                                    // 刷新缓存与索引
  closeModal();                                                      // 关弹窗
  toast(id ? '物料已更新' : '物料已创建', 'ok');                       // 提示
  refreshCurrentPage();                                              // 刷新当前页（在列表页回列表，在详情页回详情）
}

/* 把表单里输入的自定义分类写进分类树并持久化（应用启动时会自动加载，"数据管理"页也能维护） */
async function ensureCustomCat(cat, sub) {
  var node = null;                                                   // 先找有没有同名母分类节点
  for (var i = 0; i < CAT_TREE.length; i++) {
    if (CAT_TREE[i].name === cat) { node = CAT_TREE[i]; break; }     // 找到
  }
  if (!node) {                                                       // 没有就新建一个
    CAT_TREE.push({ name: cat, subs: [] });                          // 追加到树尾
    node = CAT_TREE[CAT_TREE.length - 1];                            // 拿到新节点
  }
  if (sub && node.subs.indexOf(sub) < 0) node.subs.push(sub);        // 子类不存在就追加
  await DB.setSetting('categoryTree', CAT_TREE);                     // 持久化到设置表
}

/* ==================== 5. 物料详情页 ==================== */

async function pageMaterialDetail(id) {
  var m = null;                                                       // 目标物料
  for (var i = 0; i < State.materials.length; i++) {                  // 缓存中找
    if (State.materials[i].id === id) { m = State.materials[i]; break; }
  }
  if (!m) {                                                           // 没找到（可能被删）
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">' + ICONS.search + '</div>物料不存在或已删除<br><br><button class="btn btn-outline" onclick="gotoPage(\'materials\')">返回物料库</button></div>';
    return;                                                           // 结束
  }
  var records = await DB.all('records');                              // 全部记录
  var mine = [];                                                      // 本物料记录
  for (var r = 0; r < records.length; r++) {                          // 遍历
    if (records[r].materialId === id && !records[r].deleted) mine.push(records[r]);          // 收集本物料的
  }
  mine.sort(function (a, b) { return b.time - a.time; });              // 按时间倒序
  var recByIdM = {};                                                    // 记录 id 索引（跳转原记录时显示类型+日期）
  for (var m2 = 0; m2 < mine.length; m2++) { recByIdM[mine[m2].id] = mine[m2]; }

  /* 时间线 HTML */
  var tl = '';                                                         // 输出
  for (var t = 0; t < mine.length; t++) {                              // 遍历记录
    var rec = mine[t];                                                 // 当前记录
    var tp = RECORD_TYPES[rec.type] || { label: rec.type, badge: 'badge-gray' };  // 类型信息
    tl += '<div id="rec-row-' + rec.id + '" class="tl-item tl-' + rec.type + '"' + (rec.revoked ? ' style="opacity:.55"' : '') + '>' +  // 类型决定圆点颜色；已撤回整条变淡
      '<div class="tl-head">' +
        '<span class="badge ' + tp.badge + '">' + tp.label + '</span>' + (rec.revoked && rec.revokedByRecord
          ? ' <span class="badge badge-jump" style="color:var(--danger);background:rgba(220,38,38,.1)" title="点击跳转冲销记录" onclick="gotoRecord(\'' + rec.revokedByRecord + '\')">已撤回 ↗</span>'
          : (rec.revoked ? ' <span class="badge badge-gray">已撤回</span>' : '')) +
        '<b>' + (rec.type === 'adjust' ? '库存调整为 ' + rec.qty
          : rec.type === 'revoke' ? (isInType(rec.revokesType) ? '−' : isOutType(rec.revokesType) ? '+' : '→') + rec.qty + ' ' + escapeHtml(rec.unit || m.unit || '')
          : (tp.sign > 0 ? '+' : '−') + rec.qty + ' ' + escapeHtml(rec.unit || m.unit || '')) + '</b>' +
        '<span class="tl-time">' + fmtDate(rec.time) + '</span>' +
      '</div>' +
      '<div class="tl-body">' +
        '操作人：' + escapeHtml(rec.operator) +                        // 谁
        (rec.project ? ' · 项目：' + escapeHtml(rec.project) : '')      // 什么项目
        + (rec.type === 'revoke'
          ? ' · 原记录：<span class="badge badge-jump" style="color:' + (isInType(rec.revokesType) ? 'var(--success)' : isOutType(rec.revokesType) ? 'var(--info)' : 'var(--text-sub)') + ';background:' + (isInType(rec.revokesType) ? 'rgba(22,163,74,.12)' : isOutType(rec.revokesType) ? 'rgba(2,132,199,.12)' : 'var(--bg-hover)') + '" title="点击跳转原记录" onclick="gotoRecord(\'' + rec.revokesId + '\')">' + (RECORD_TYPES[rec.revokesType] || { label: rec.revokesType }).label + (recByIdM[rec.revokesId] ? '（' + fmtDateShort(recByIdM[rec.revokesId].time) + '）' : '') + ' ↙</span>'
          : (rec.remark ? ' · ' + escapeHtml(rec.remark) : ''))           // 备注
        + ' · 库存 ' + (rec.before !== undefined ? rec.before + ' → ' + rec.after : '') +  // 库存变化
        (canOperateRecord(rec)
          ? (rec.revoked
            ? '<br><button class="btn btn-sm" style="margin-top:6px;background:' + (isInType(rec.type) ? 'var(--success)' : isOutType(rec.type) ? 'var(--info)' : 'var(--text-sub)') + ';color:#fff" onclick="cancelRevokeRecord(\'' + rec.id + '\')">取消撤回</button>'
            : (rec.type === 'revoke' ? '' : '<br><button class="btn btn-sm btn-danger" style="margin-top:6px" onclick="revokeRecord(\'' + rec.id + '\')">撤回</button>'))
          : '') +
      '</div>' +
      '</div>';
  }
  if (mine.length === 0) tl = '<div class="empty">暂无出入库记录</div>';  // 空状态

  /* 库存状态徽章 */
  var stockHtml = m.minStock && m.stock <= m.minStock
    ? '<span class="badge badge-red">' + m.stock + ' ' + escapeHtml(m.unit || '') + ' · 低于警戒线</span>'
    : '<span class="badge badge-green">' + m.stock + ' ' + escapeHtml(m.unit || '') + '</span>';

  /* 输出详情页 */
  $('#page').innerHTML =
    '<div class="breadcrumb"><a onclick="gotoPage(\'materials\')">物料库</a><a onclick="gotoPage(\'materials\');filterByCat(\'' + escapeHtml(m.cat) + '\')">' + escapeHtml(m.cat) + '</a><span class="cur">' + escapeHtml(m.name) + '</span></div>' +
    '<div class="card">' +
      '<div class="detail-head">' +
        '<div class="d-info">' +
          '<div class="d-name">' + escapeHtml(m.name) + '</div>' +
          '<div style="margin-top:6px;color:var(--text-sub)">' +
            escapeHtml(m.model || '未填型号') + ' · ' + escapeHtml(m.cat) + (m.sub ? ' / ' + escapeHtml(m.sub) : '') +
            ' ' + (m.tags || []).map(function (t) { return '<span class="tag-chip" style="margin-left:4px">' + escapeHtml(t) + '</span>'; }).join(' ') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-success" onclick="openStockIOModal(\'' + m.id + '\',\'in\')">' + ICONS.plus + '入库</button>' +
          '<button class="btn btn-blue" onclick="openStockIOModal(\'' + m.id + '\',\'out\')">' + ICONS.out + '出库</button>' +
          (Auth.can('manage')
            ? '<button class="btn btn-outline" onclick="openMaterialForm(\'' + m.id + '\')">' + ICONS.edit + '编辑</button>' +
              '<button class="btn btn-outline" style="color:var(--danger)" onclick="deleteMaterial(\'' + m.id + '\')">' + ICONS.trash + '删除</button>'
            : '') +
          '<button class="btn btn-outline" onclick="detailBack()">' + ICONS.back + detailBackLabel() + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid-2">' +
      /* 左列：档案信息 + AI 介绍 */
      '<div>' +
      '<div class="card"><div class="card-title">档案信息</div><div class="kv-list">' +
        '<div class="kv"><span class="k">封装</span><span class="v">' + escapeHtml(m.pkg || '-') + '</span></div>' +
        '<div class="kv"><span class="k">丝印</span><span class="v">' + escapeHtml(m.silk || '-') + '</span></div>' +
        '<div class="kv"><span class="k">当前库存</span><span class="v">' + stockHtml + '</span></div>' +
        '<div class="kv"><span class="k">位置</span><span class="v">' + (canSeeLoc(m.id) ? locBadge(m.loc, m.locNo) : '<span style="color:var(--text-sub)">🔒 做有效出入库后可见</span>') + '</span></div>' +
        '<div class="kv"><span class="k">别称</span><span class="v">' + escapeHtml(m.alias || '-') + '</span></div>' +
        '<div class="kv"><span class="k">分类</span><span class="v">' + escapeHtml(m.cat || '-') + (m.sub ? ' · ' + escapeHtml(m.sub) : '') + '</span></div>' +
        '<div class="kv"><span class="k">标签</span><span class="v">' + ((m.tags || []).length ? m.tags.map(function (t) { return escapeHtml(t); }).join('、') : '-') + '</span></div>' +
        '<div class="kv"><span class="k">数据手册</span><span class="v">' + (m.datasheet ? '<a href="' + escapeHtml(m.datasheet) + '" target="_blank" rel="noopener">' + ICONS.link + ' 打开数据手册</a>' : '未填') + '</span></div>' +
        /* 单价涉及钱：仅管理员可见这一行 */
        '<div class="kv"><span class="k">单价</span><span class="v">' + fmtMoney(m.price) + '</span></div>' +
        '<div class="kv"><span class="k">供应商</span><span class="v">' + escapeHtml(m.supplier || '-') + '</span></div>' +
        '<div class="kv"><span class="k">购买链接</span><span class="v">' + (m.link ? '<a href="' + escapeHtml(m.link) + '" target="_blank" rel="noopener">' + ICONS.link + ' 打开链接</a>' : '未填') + '</span></div>' +
        '<div class="kv"><span class="k">库存预警线</span><span class="v">' + m.minStock + ' ' + escapeHtml(m.unit || '') + '</span></div>' +
        '<div class="kv"><span class="k">创建时间</span><span class="v">' + fmtDate(m.createdAt) + '</span></div>' +
      '</div></div>' +
      /* 实物照片卡（没传照片就不显示这块） */
      ((m.photos && m.photos.length)
        ? '<div class="card"><div class="card-title">实物照片（点击放大）</div><div style="display:flex;gap:10px;flex-wrap:wrap">' +
          m.photos.map(function (p, idx) {
            return '<img src="' + p + '" onclick="matPhotoView(\'' + m.id + '\',' + idx + ')" style="width:110px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--border);cursor:zoom-in" />';
          }).join(' ') +
          '</div></div>'
        : '') +
      '<div class="card"><div class="card-title">用途说明' +
        '<button class="btn btn-sm btn-outline" style="margin-left:auto" onclick="aiExplainMaterial(\'' + m.id + '\')">' + ICONS.ai + ' AI 生成介绍</button></div>' +
        '<div id="ai-intro" style="font-size:13.5px;line-height:1.8">' + (m.desc ? escapeHtml(String(m.desc).replace(/<br\s*\/?>/gi, '\n')).replace(/\n/g, '<br>') : '<span style="color:var(--text-sub)">点击"AI 生成介绍"自动写用途说明（需在设置中配置 AI；未配置时会提示）</span>') + '</div>' +
      '</div>' +
      '</div>' +
      /* 右列：时间线 */
      '<div class="card"><div class="card-title">历史追溯 · 全链路记录（共 ' + mine.length + ' 条）</div><div class="timeline">' + tl + '</div></div>' +
    '</div>';
}

/* ==================== 5.5 物料详情卡片（非物料库页面以卡片弹出） ==================== */
var MDMState = { id: '' };

/* 从配料/项目领料/统计/识别等页面点物料名：详情以卡片形式在原页面弹出，不跳转、不污染物料库"上次停留"
   若当前已有来源弹窗（配料/识别弹窗），先隐藏保留，详情卡片叠在上层，关闭后来源弹窗原样恢复 */
async function openMaterialDetailModal(id) {
  var m = null;
  for (var i = 0; i < State.materials.length; i++) {
    if (State.materials[i].id === id) { m = State.materials[i]; break; }
  }
  if (!m) m = await DB.get('materials', id);                        // 兜底：回收站软删除物料不在内存列表
  if (!m) { toast('物料不存在', 'err'); return; }
  MDMState.id = id;
  var records = await DB.all('records');
  var mine = [];
  for (var r = 0; r < records.length; r++) {
    if (records[r].materialId === id && !records[r].deleted) mine.push(records[r]);
  }
  mine.sort(function (a, b) { return b.time - a.time; });
  var recByIdM = {};
  for (var m2 = 0; m2 < mine.length; m2++) recByIdM[mine[m2].id] = mine[m2];
  /* 时间线（与详情页一致） */
  var tl = '';
  for (var t = 0; t < mine.length; t++) {
    var rec = mine[t];
    var tp = RECORD_TYPES[rec.type] || { label: rec.type, badge: 'badge-gray' };
    tl += '<div id="mdm-rec-' + rec.id + '" class="tl-item tl-' + rec.type + '"' + (rec.revoked ? ' style="opacity:.55"' : '') + '>' +
      '<div class="tl-head">' +
        '<span class="badge ' + tp.badge + '">' + tp.label + '</span>' + (rec.revoked && rec.revokedByRecord
          ? ' <span class="badge badge-jump" style="color:var(--danger);background:rgba(220,38,38,.1)" title="点击跳转冲销记录" onclick="gotoRecord(\'' + rec.revokedByRecord + '\')">已撤回 ↗</span>'
          : (rec.revoked ? ' <span class="badge badge-gray">已撤回</span>' : '')) +
        '<b>' + (rec.type === 'adjust' ? '库存调整为 ' + rec.qty
          : rec.type === 'revoke' ? (isInType(rec.revokesType) ? '−' : isOutType(rec.revokesType) ? '+' : '→') + rec.qty + ' ' + escapeHtml(rec.unit || m.unit || '')
          : (tp.sign > 0 ? '+' : '−') + rec.qty + ' ' + escapeHtml(rec.unit || m.unit || '')) + '</b>' +
        '<span class="tl-time">' + fmtDate(rec.time) + '</span>' +
      '</div>' +
      '<div class="tl-body">' +
        '操作人：' + escapeHtml(rec.operator) +
        (rec.project ? ' · 项目：' + escapeHtml(rec.project) : '')
        + (rec.type === 'revoke'
          ? ' · 原记录：<span class="badge badge-jump" style="color:' + (isInType(rec.revokesType) ? 'var(--success)' : isOutType(rec.revokesType) ? 'var(--info)' : 'var(--text-sub)') + ';background:' + (isInType(rec.revokesType) ? 'rgba(22,163,74,.12)' : isOutType(rec.revokesType) ? 'rgba(2,132,199,.12)' : 'var(--bg-hover)') + '" title="点击跳转原记录" onclick="gotoRecord(\'' + rec.revokesId + '\')">' + (RECORD_TYPES[rec.revokesType] || { label: rec.revokesType }).label + (recByIdM[rec.revokesId] ? '（' + fmtDateShort(recByIdM[rec.revokesId].time) + '）' : '') + ' ↙</span>'
          : (rec.remark ? ' · ' + escapeHtml(rec.remark) : ''))
        + ' · 库存 ' + (rec.before !== undefined ? rec.before + ' → ' + rec.after : '') +
        (canOperateRecord(rec)
          ? (rec.revoked
            ? '<br><button class="btn btn-sm" style="margin-top:6px;background:' + (isInType(rec.type) ? 'var(--success)' : isOutType(rec.type) ? 'var(--info)' : 'var(--text-sub)') + ';color:#fff" onclick="cancelRevokeRecord(\'' + rec.id + '\')">取消撤回</button>'
            : (rec.type === 'revoke' ? '' : '<br><button class="btn btn-sm btn-danger" style="margin-top:6px" onclick="revokeRecord(\'' + rec.id + '\')">撤回</button>'))
          : '') +
      '</div>' +
      '</div>';
  }
  if (mine.length === 0) tl = '<div class="empty">暂无出入库记录</div>';
  var stockHtml = m.minStock && m.stock <= m.minStock
    ? '<span class="badge badge-red">' + m.stock + ' ' + escapeHtml(m.unit || '') + ' · 低于警戒线</span>'
    : '<span class="badge badge-green">' + m.stock + ' ' + escapeHtml(m.unit || '') + '</span>';
  /* 头部卡 */
  var headCard = '<div class="card" style="margin-bottom:14px"><div class="detail-head"><div class="d-info">' +
      '<div class="d-name">' + escapeHtml(m.name) + '</div>' +
      '<div style="margin-top:6px;color:var(--text-sub)">' +
        escapeHtml(m.model || '未填型号') + ' · ' + escapeHtml(m.cat) + (m.sub ? ' / ' + escapeHtml(m.sub) : '') +
        ' ' + (m.tags || []).map(function (t) { return '<span class="tag-chip" style="margin-left:4px">' + escapeHtml(t) + '</span>'; }).join(' ') +
      '</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + stockHtml + '</div>' +
    '</div></div>';
  /* 主体 grid-2：左档案+照片+用途，右时间线 */
  var main = '<div class="grid-2">' +
      '<div>' +
      '<div class="card"><div class="card-title">档案信息</div><div class="kv-list">' +
        '<div class="kv"><span class="k">封装</span><span class="v">' + escapeHtml(m.pkg || '-') + '</span></div>' +
        '<div class="kv"><span class="k">丝印</span><span class="v">' + escapeHtml(m.silk || '-') + '</span></div>' +
        '<div class="kv"><span class="k">当前库存</span><span class="v">' + stockHtml + '</span></div>' +
        '<div class="kv"><span class="k">位置</span><span class="v">' + (canSeeLoc(m.id) ? locBadge(m.loc, m.locNo) : '<span style="color:var(--text-sub)">🔒 做有效出入库后可见</span>') + '</span></div>' +
        '<div class="kv"><span class="k">别称</span><span class="v">' + escapeHtml(m.alias || '-') + '</span></div>' +
        '<div class="kv"><span class="k">分类</span><span class="v">' + escapeHtml(m.cat || '-') + (m.sub ? ' · ' + escapeHtml(m.sub) : '') + '</span></div>' +
        '<div class="kv"><span class="k">标签</span><span class="v">' + ((m.tags || []).length ? m.tags.map(function (t) { return escapeHtml(t); }).join('、') : '-') + '</span></div>' +
        '<div class="kv"><span class="k">数据手册</span><span class="v">' + (m.datasheet ? '<a href="' + escapeHtml(m.datasheet) + '" target="_blank" rel="noopener">' + ICONS.link + ' 打开数据手册</a>' : '未填') + '</span></div>' +
        '<div class="kv"><span class="k">单价</span><span class="v">' + fmtMoney(m.price) + '</span></div>' +
        '<div class="kv"><span class="k">供应商</span><span class="v">' + escapeHtml(m.supplier || '-') + '</span></div>' +
        '<div class="kv"><span class="k">购买链接</span><span class="v">' + (m.link ? '<a href="' + escapeHtml(m.link) + '" target="_blank" rel="noopener">' + ICONS.link + ' 打开链接</a>' : '未填') + '</span></div>' +
        '<div class="kv"><span class="k">库存预警线</span><span class="v">' + m.minStock + ' ' + escapeHtml(m.unit || '') + '</span></div>' +
        '<div class="kv"><span class="k">创建时间</span><span class="v">' + fmtDate(m.createdAt) + '</span></div>' +
      '</div></div>' +
      ((m.photos && m.photos.length)
        ? '<div class="card"><div class="card-title">实物照片（点击放大）</div><div style="display:flex;gap:10px;flex-wrap:wrap">' +
          m.photos.map(function (p, idx) {
            return '<img src="' + p + '" onclick="matPhotoView(\'' + m.id + '\',' + idx + ')" style="width:110px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--border);cursor:zoom-in" />';
          }).join(' ') +
          '</div></div>'
        : '') +
      '<div class="card"><div class="card-title">用途说明' +
        '<button class="btn btn-sm btn-outline" style="margin-left:auto" onclick="aiExplainMaterial(\'' + m.id + '\')">' + ICONS.ai + ' AI 生成介绍</button></div>' +
        '<div id="ai-intro" style="font-size:13.5px;line-height:1.8">' + (m.desc ? escapeHtml(String(m.desc).replace(/<br\s*\/?>/gi, '\n')).replace(/\n/g, '<br>') : '<span style="color:var(--text-sub)">点击"AI 生成介绍"自动写用途说明（需在设置中配置 AI；未配置时会提示）</span>') + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="card"><div class="card-title">历史追溯 · 全链路记录（共 ' + mine.length + ' 条）</div><div class="timeline">' + tl + '</div></div>' +
    '</div>';
  /* 来源弹窗（配料/识别弹窗）先隐藏保留，详情卡片叠层打开 */
  var prevMask = $('#modal-mask');
  if (prevMask) prevMask.style.display = 'none';
  /* 底部不放任何按钮；右上角 × 改为"返回"（有来源弹窗则恢复来源弹窗，否则关闭卡片） */
  var mask = openModal(escapeHtml(m.name), headCard + main, '', true, true);
  var xBtn = mask.querySelector('.modal-head .icon-btn');
  if (xBtn) {
    xBtn.removeAttribute('onclick');
    xBtn.title = '返回';
    xBtn.innerHTML = ICONS.back;
    xBtn.onclick = mdmClose;
  }
}

/* 关闭详情卡片：移除本层，恢复隐藏的来源弹窗（配料/识别弹窗原样回来） */
function mdmClose() {
  var masks = document.querySelectorAll('.modal-mask');
  if (masks.length) masks[masks.length - 1].remove();
  var prev = masks.length >= 2 ? masks[masks.length - 2] : null;
  if (prev) prev.style.display = '';
}

/* 详情卡片继续出入库：移除全部弹窗（含来源弹窗），打开出入库弹窗 */
function mdmGo(t) {
  var id = MDMState.id;
  var masks = document.querySelectorAll('.modal-mask');
  for (var i = 0; i < masks.length; i++) masks[i].remove();
  ModalSnapshot = null;
  openStockIOModal(id, t);
}
function mdmGoEdit() {
  var id = MDMState.id;
  var masks = document.querySelectorAll('.modal-mask');
  for (var i = 0; i < masks.length; i++) masks[i].remove();
  ModalSnapshot = null;
  openMaterialForm(id);
}

/* 大图查看弹窗：点击详情页缩略图时打开 */
function matPhotoView(id, idx) {
  var m = null;                                                      // 找目标物料
  for (var i = 0; i < State.materials.length; i++) {
    if (State.materials[i].id === id) { m = State.materials[i]; break; }
  }
  if (!m || !m.photos || !m.photos[idx]) return;                     // 数据没了就不弹
  openModal(escapeHtml(m.name) + ' · 实物照片 ' + (idx + 1) + ' / ' + m.photos.length,
    '<img src="' + m.photos[idx] + '" style="width:100%;border-radius:10px" />',
    '<button class="btn" onclick="closeModal()">关闭</button>');
}

/* 删除物料（进回收站，可在数据管理页恢复） */
async function deleteMaterial(id) {
  if (!Auth.can('manage')) { toast('没有权限', 'warn'); return; }      // 权限
  var m = null;                                                        // 目标
  for (var i = 0; i < State.materials.length; i++) {                   // 查找
    if (State.materials[i].id === id) { m = State.materials[i]; break; }
  }
  if (!m) return;                                                       // 不存在
  var ok = await confirmBox('确定删除「' + m.name + '」吗？\n删除后进入回收站，出入库历史记录仍保留，可在"数据管理"页恢复。');  // 确认
  if (!ok) return;                                                      // 取消
  m.deleted = true;                                                     // 软删除标记
  m.deletedBy = (Auth.user || {}).username || '';                               // 记删除人（回收站恢复按操作人）
  m.updatedAt = Date.now();                                             // 更新时间
  delete m._search;                                                     // 清索引
  await DB.put('materials', m);                                        // 写库
  await Log.add('删除物料', m.name + '（移入回收站）');                  // 日志
  await State.refreshMaterials();                                       // 刷新
  toast('已移入回收站', 'ok');                                           // 提示
  PageCache = {};                                                       // 数据已变：作废所有页面缓存
  gotoPage('materials', true);                                          // 回列表（强制重渲染）
}

/* ==================== 6. 出入库登记页 ==================== */

/* 已选物料（表单用） */
var ioPicked = null;

async function pageStockIO() {
  var records = await State.loadRecords();                              // 全部记录
  var recent = records.slice().sort(function (a, b) { return b.time - a.time; }).slice(0, 15);  // 最新 15 条
  /* 历史项目列表（供下拉提示） */
  var projSet = {};                                                     // 去重集合
  for (var p = 0; p < records.length; p++) {                            // 遍历
    if (records[p].project) projSet[records[p].project] = 1;             // 收集项目名
  }
  var projOpts = '';                                                     // datalist 选项
  for (var pk in projSet) projOpts += '<option value="' + escapeHtml(pk) + '">';  // 生成

  /* 最近记录行 */
  var rows = '';                                                         // 行集合
  for (var r = 0; r < recent.length; r++) {                              // 遍历
    var rec = recent[r];                                                 // 当前记录
    var tp = RECORD_TYPES[rec.type] || { label: rec.type, badge: 'badge-gray' };  // 类型
    rows += '<tr>' +
      '<td style="white-space:nowrap">' + fmtDateShort(rec.time) + '</td>' +
      '<td><span class="t-link" onclick="gotoMaterial(\'' + rec.materialId + '\')">' + escapeHtml(rec.materialName) + '</span></td>' +
      '<td><span class="badge ' + tp.badge + '">' + tp.label + '</span></td>' +
      '<td class="num">' + (rec.type === 'adjust' ? '→ ' + rec.qty : (tp.sign > 0 ? '+' : '−') + rec.qty) + '</td>' +
      '<td style="white-space:nowrap">' + escapeHtml(rec.operator) + '</td>' +
      '<td style="font-size:12.5px">' + escapeHtml(rec.project || '-') + '</td>' +
      '<td><button class="btn btn-sm btn-outline" onclick="repeatRecord(\'' + rec.id + '\')" title="按这条记录快速再登记一次">再来一笔</button></td>' +
      '</tr>';
  }
  if (recent.length === 0) rows = '<tr><td colspan="7"><div class="empty">暂无记录，先在上方登记第一笔吧</div></td></tr>';  // 空状态

  /* 左侧表单（类型单选用胶囊按钮） */
  $('#page').innerHTML =
    '<div class="page-head"><div><div class="page-title">出入库登记</div><div class="page-desc">只有 入库 / 出库 / 库存调整 三种操作，领用、消耗、报废统一记"出库"，全部记录在案</div></div></div>' +
    /* 上：登记表单（通栏卡片，内容限宽，避免左右布局下方留白） */
    '<div class="card">' +
      '<div class="card-title">' + ICONS.swap + '登记一笔</div>' +
      '<div style="max-width:720px">' +
      '<div class="form-item"><label>选择物料 <span class="req">*</span></label>' +
        '<div class="sug-wrap">' +
          '<input class="input" id="io-search" placeholder="输入名称 / 拼音 / 型号搜索物料…" autocomplete="off" oninput="ioPickerSearch(this.value)" onfocus="ioPickerSearch(this.value)" />' +
          '<div id="io-sug"></div>' +
        '</div>' +
        '<div id="io-picked" style="margin-top:8px"></div>' +
      '</div>' +
      '<div class="form-item"><label>操作类型</label><div class="radio-group" id="io-types">' +
        '<span class="radio-chip" data-t="in" onclick="ioTypePick(this)">＋入库</span>' +
        '<span class="radio-chip" data-t="out" onclick="ioTypePick(this)">−出库</span>' +
        '<span class="radio-chip" data-t="adjust" onclick="ioTypePick(this)">✎库存调整</span>' +
      '</div><div class="form-hint" id="io-type-hint"></div></div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label id="io-qty-label">数量</label><input class="input" id="io-qty" type="number" min="1" step="1" value="1" /></div>' +
        /* 单价输入涉及钱：普通成员不显示（提交时自动按参考价折算），管理员可自行填写 */
        (isAdminNow() ? '<div class="form-item"><label id="io-price-label">实际单价（元）</label><input class="input" id="io-price" type="number" min="0" step="0.01" placeholder="留空按物料参考价" /></div>' : '<input type="hidden" id="io-price" value="" />') +
      '</div>' +
      '<div class="form-item"><label>关联项目（报账统计用）</label>' +
        '<input class="input" id="io-project" list="io-proj-list" placeholder="如：2026 循迹小车培训（可输入新项目）" />' +
        '<datalist id="io-proj-list">' + projOpts + '</datalist>' +
      '</div>' +
      '<div class="form-item"><label>备注</label><input class="input" id="io-remark" maxlength="100" placeholder="选填：用途 / 采购单号 / 用在哪个作品上…" /></div>' +
      '<button class="btn btn-primary btn-lg btn-block" onclick="submitStockForm()">提交登记</button>' +
      '</div>' +
    '</div>' +
    /* 下：最近记录（通栏） */
    '<div class="card">' +
      '<div class="card-title">最近 15 笔记录<span class="more"><a onclick="gotoPage(\'history\')" style="cursor:pointer">历史追溯 →</a></span></div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>日期</th><th>物料</th><th>类型</th><th>数量</th><th>操作人</th><th>项目</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';

  ioPicked = null;                                                        // 清空已选
  ioTypePick($('#io-types').children[0]);                                 // 默认选中"采购入库"
}

/* 类型胶囊选中处理 */
function ioTypePick(el) {
  var chips = $('#io-types').children;                                    // 所有类型胶囊
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on'); // 先全部取消
  el.classList.add('on');                                                 // 选中当前
  var t = el.getAttribute('data-t');                                      // 当前类型值
  var hints = {                                                           // 每种类型的提示语
    'in': '库存 +：采购到货 / 归还 / 收到捐赠都记这一种，可填实际单价用于经费统计',
    'out': '库存 −：领用、消耗、报废统一记出库，按单价折算成本',
    'adjust': '把库存直接改为输入值（盘点纠错用，数量填盘点后的实际库存）'
  };
  $('#io-type-hint').textContent = hints[t] || '';                        // 显示提示
  $('#io-qty-label').textContent = (t === 'adjust') ? '调整后的库存' : '数量';  // 数量标签切换
  var priceLabel = $('#io-price-label');                                     // 单价标签（成员视图没有这个元素）
  if (priceLabel) priceLabel.textContent = (t === 'in') ? '实际单价（元）' : '单价（默认按参考价折算）';  // 存在才更新，避免成员视图报错
  if (t === 'adjust') { $('#io-qty').min = 0; $('#io-qty-label').textContent = '调整后的库存值'; }  // 调整允许 0
  else { $('#io-qty').min = 1; }
}

/* 物料选择器：输入时显示搜索建议 */
function ioPickerSearch(val) {
  var box = $('#io-sug');                                                 // 建议容器
  if (!box) return;                                                       // 页面不存在
  if (!val || !val.trim()) { box.innerHTML = ''; return; }                // 空输入清空建议
  var list = Search.query(val).slice(0, 8);                               // 搜索前 8 条
  if (list.length === 0) {                                                // 没结果
    box.innerHTML = '<div class="sug-list"><div class="sug-item" style="color:var(--text-sub)">没找到物料，试试拼音或型号</div></div>';
    return;                                                                // 结束
  }
  var html = '<div class="sug-list">';                                    // 建议列表
  for (var i = 0; i < list.length; i++) {                                 // 逐条
    var m = list[i];                                                       // 物料
    html += '<div class="sug-item" onclick="ioPickerPick(\'' + m.id + '\')">' +
      '<div style="flex:1"><div class="s-name">' + escapeHtml(m.name) + '</div><div class="s-sub">' + escapeHtml(m.model || m.code) + ' · 库存 ' + m.stock + '</div></div>' +
      locBadge(m.loc, m.locNo, !canSeeLoc(m.id)) +
      '</div>';
  }
  box.innerHTML = html + '</div>';                                         // 输出
}

/* 选中某个物料 */
function ioPickerPick(id) {
  for (var i = 0; i < State.materials.length; i++) {                        // 查找
    if (State.materials[i].id === id) {                                    // 命中
      ioPicked = State.materials[i];                                       // 记住选择
      break;                                                               // 停止
    }
  }
  if (!ioPicked) return;                                                   // 没找到
  $('#io-sug').innerHTML = '';                                             // 关掉建议
  $('#io-search').value = ioPicked.name;                                   // 输入框显示名称
  /* 已选物料信息卡 */
  $('#io-picked').innerHTML = '<div style="display:flex;align-items:center;gap:10px;background:var(--primary-light);border-radius:10px;padding:10px 14px">' +
    '<div style="flex:1"><b>' + escapeHtml(ioPicked.name) + '</b><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(ioPicked.model || '') + ' · 当前库存 <b>' + ioPicked.stock + '</b> ' + escapeHtml(ioPicked.unit || '') + ' · ' + locBadge(ioPicked.loc, ioPicked.locNo, !canSeeLoc(ioPicked.id)) + '</div></div>' +
    '<button class="btn btn-sm btn-outline" onclick="ioClearPick()">换一个</button>' +
    '</div>';
}

/* 清除已选物料 */
function ioClearPick() {
  ioPicked = null;                                                          // 清空
  $('#io-picked').innerHTML = '';                                            // 清信息卡
  $('#io-search').value = '';                                                // 清输入
  $('#io-search').focus();                                                   // 聚焦输入
}

/* 提交出入库表单 */
async function submitStockForm() {
  if (!ioPicked) { toast('请先选择物料', 'err'); return; }                   // 未选物料
  var typeEl = $('#io-types .radio-chip.on');                                 // 当前选中的类型胶囊
  if (!typeEl) { toast('请选择操作类型', 'err'); return; }                     // 未选类型
  var type = typeEl.getAttribute('data-t');                                    // 类型值
  var qty = parseInt($('#io-qty').value, 10);                                   // 数量
  if (isNaN(qty) || qty < 0) { toast('数量不合法', 'err'); return; }            // 校验
  if (type !== 'adjust' && qty <= 0) { toast('数量必须大于 0', 'err'); return; }  // 非调整必须>0
  var priceInput = $('#io-price').value;                                        // 单价输入
  var price = priceInput === '' ? ioPicked.price : (parseFloat(priceInput) || 0);  // 留空用参考价
  await applyStockRecord(ioPicked.id, type, qty, {                              // 调用核心逻辑
    price: price,                                                               // 单价
    project: $('#io-project').value.trim(),                                     // 项目
    remark: $('#io-remark').value.trim()                                       // 备注
  });
  pageStockIO();                                                                // 刷新本页
}

/* ==================== 7. 出入库核心逻辑（全站共用） ==================== */
/**
 * 所有页面的出入库都走这里：
 * 1. 校验库存是否足够  2. 更新物料库存  3. 写入记录（含操作前后库存）  4. 记日志
 */
async function applyStockRecord(materialId, type, qty, opts) {
  opts = opts || {};                                                            // 可选项
  var m = null;                                                                  // 目标物料
  for (var i = 0; i < State.materials.length; i++) {                             // 查找
    if (State.materials[i].id === materialId) { m = State.materials[i]; break; } // 命中
  }
  if (!m) { toast('物料不存在', 'err'); return false; }                          // 没找到
  var tp = RECORD_TYPES[type];                                                    // 类型信息
  if (!tp) { toast('未知的操作类型', 'err'); return false; }                      // 类型非法
  var before = m.stock;                                                           // 操作前库存
  var after;                                                                       // 操作后库存
  if (tp.sign === 1) {                                                             // 入库类 +
    after = before + qty;
  } else if (tp.sign === -1) {                                                     // 出库类 −
    if (qty > before) {                                                            // 库存不足
      toast('「' + m.name + '」库存不足：当前 ' + before + ' ' + (m.unit || '') + '，本次需要 ' + qty, 'err');  // 报错
      return false;                                                                 // 中止
    }
    after = before - qty;
  } else {                                                                         // 调整：直接设置
    after = qty;
  }
  /* 更新库存 */
  m.stock = after;                                                                   // 写新库存
  m.updatedAt = Date.now();                                                          // 更新时间
  delete m._search;                                                                   // 清索引
  await DB.put('materials', m);                                                      // 写库
  /* 写入记录 */
  var price = (opts.price !== undefined) ? opts.price : (m.price || 0);               // 本笔单价
  await DB.put('records', {
    id: uid('rec'),                                                                   // 记录编号
    materialId: m.id,                                                                  // 物料 id
    materialName: m.name,                                                             // 冗余物料名（物料删除后仍可查）
    unit: m.unit || '',                                                               // 单位
    type: type,                                                                        // 类型
    qty: qty,                                                                          // 数量
    price: price,                                                                      // 单价
    operator: Auth.user ? Auth.user.username : '未知',                                  // 操作人
    project: opts.project || '',                                                       // 关联项目
    remark: opts.remark || '',                                                         // 备注
    before: before,                                                                    // 操作前库存
    after: after,                                                                      // 操作后库存
    time: Date.now(),                                                                  // 时间
    createdAt: Date.now(),                                                             // 创建时间（多设备同步用）
    updatedAt: Date.now()                                                              // 修改时间（多设备同步用）
  });
  await Log.add(tp.label, m.name + ' ×' + qty + '（' + before + '→' + after + '）' + (opts.project ? ' #' + opts.project : ''));  // 日志
  if (qty != 0 && !isAdminNow()) { try { var _u = Auth.user.username; localStorage.setItem('locUnlock_' + _u + '_' + materialId, String(Date.now())); } catch (e) {} }  // 只记录当前物料的独立解锁时间
  if (_locTipArmed && !isAdminNow() && canSeeLoc(m.id) && (m.loc || m.locNo)) showLocTip(m, tp.label);  // 仅图片识别流程：解锁后醒目提示本物料位置
  await State.refreshMaterials();                                                      // 刷新缓存
  toast(tp.label + '成功：' + m.name + ' 库存 ' + before + ' → ' + after, 'ok');         // 提示
  if (tp.sign === -1) autoTuneMinStock(materialId);                                     // 出库后：按用量自动微调警戒线（内部有 7 天节流，静默执行）
  return true;                                                                          // 成功
}

/* ==================== 8. 快捷出入库弹窗 ==================== */
/* 列表/详情页的"入 / 出"按钮打开的小弹窗 */

var quickPicked = null;                                                                  // 弹窗中选中的物料

/* 详情页"返回"按钮文字：按来源页显示（其余情况显示"返回"） */
function detailBackLabel() {
  if (LastFrom === 'ai') return '返回智能配料';
  if (LastFrom === 'stats') return '返回统计报表';
  if (LastFrom === 'project') return '返回项目领料';
  if (LastFrom === 'history') return '返回历史追溯';
  if (LastFrom === 'alerts') return '返回库存预警';
  if (LastFrom === 'stockio') return '返回出入库登记';
  if (LastFrom === 'dashboard') return '返回仪表盘';
  return '返回';
}

var _locTipArmed = false;                                                                       // 本次出入库是否来自图片识别流程（仅此时弹位置提示）
function openStockIOModal(materialId, defaultType) {
  var m = null;                                                                          // 目标
  for (var i = 0; i < State.materials.length; i++) {                                    // 查找
    if (State.materials[i].id === materialId) { m = State.materials[i]; break; }         // 命中
  }
  if (!m) { toast('物料不存在', 'err'); return; }                                         // 没有
  quickPicked = m;                                                                       // 记住
  /* 识别流程（查同款出库/入库）里打开出入库弹窗：先把识别弹窗快照存起来，提交/取消后返回识别结果 */
  if (PRState && (PRState.view === 'in' || PRState.view === 'out') && !PRState.savedRecogHtml) {
    var prM0 = $('#modal-mask');
    if (prM0) PRState.savedRecogHtml = prM0.outerHTML;                                    // 存快照（openModal 会替换掉识别弹窗）
  }
  _locTipArmed = !!(PRState && (PRState.view === 'in' || PRState.view === 'out'));          // 本次出入库来自图片识别才弹位置提示
  var typeChips = '';                                                                    // 类型胶囊组
  for (var key in RECORD_TYPES) {                                                        // 遍历类型
    var tp = RECORD_TYPES[key];                                                           // 类型信息
    typeChips += '<span class="radio-chip' + (key === defaultType ? ' on' : '') + '" data-t="' + key + '" onclick="qTypePick(this)">' + (tp.sign === 1 ? '＋' : tp.sign === -1 ? '−' : '✎') + tp.label + '</span>';  // 生成
  }
  openModal(escapeHtml(m.name) + ' · 当前库存 ' + m.stock + (m.unit ? ' ' + m.unit : ''), '' +
    '<div class="form-item"><label>操作类型</label><div class="radio-group" id="q-types">' + typeChips + '</div></div>' +
    '<div class="form-row">' +
      '<div class="form-item"><label id="q-qty-label">数量</label><input class="input" id="q-qty" type="number" min="1" step="1" value="1" /></div>' +
      /* 单价涉及钱：成员的弹窗里隐藏，提交时自动按参考价折算 */
      '<div class="form-item"><label>单价（元）</label>' + (isAdminNow()
        ? '<input class="input" id="q-price" type="number" min="0" step="0.01" value="' + (m.price || 0) + '" />'
        : '<input class="input" id="q-price" type="number" min="0" step="0.01" value="' + (m.price || 0) + '" readonly style="background:var(--bg-soft);cursor:not-allowed" />') + '</div>' +
    '</div>' +
    '<div class="form-item"><label>关联项目</label><input class="input" id="q-project" placeholder="选填：报账统计用" /></div>' +
    '<div class="form-item"><label>备注</label><input class="input" id="q-remark" maxlength="100" placeholder="选填" /></div>',
    '<button class="btn" onclick="qCloseBack()">取消</button>' +
    '<button class="btn ' + (isInType(defaultType) ? 'btn-success' : 'btn-blue') + '" id="q-submit-btn" onclick="submitQuickIO()">确认登记</button>');
}

/* 弹窗内切换类型 */
function qTypePick(el) {
  var chips = $('#q-types').children;                                                     // 全部胶囊
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');                // 取消所有
  el.classList.add('on');                                                                 // 选中
  var t = el.getAttribute('data-t');                                                       // 类型
  $('#q-qty-label').textContent = (t === 'adjust') ? '调整后的库存' : '数量';               // 标签
  $('#q-qty').min = (t === 'adjust') ? 0 : 1;                                              // 调整允许 0
  var sb = $('#q-submit-btn');                                                              // 确认按钮跟随类型变色（入绿/出蓝）
  if (sb) sb.className = 'btn ' + (isInType(t) ? 'btn-success' : (isOutType(t) ? 'btn-blue' : 'btn-primary'));
}

/* 出入库弹窗"取消"：关弹窗后，识别流程把识别弹窗恢复回来 */
function qCloseBack() {
  _locTipArmed = false;
  closeModal();
  restoreRecogModal();
}

/* 识别流程：把保存的识别弹窗快照重新插回（识别结果原样还在） */
function restoreRecogModal() {
  if (!PRState || !PRState.savedRecogHtml) return;
  var h = PRState.savedRecogHtml;
  PRState.savedRecogHtml = '';
  document.body.insertAdjacentHTML('beforeend', h);
  var masks = document.querySelectorAll('.modal-mask');
  var m2 = masks.length ? masks[masks.length - 1] : null;
  if (m2) m2.addEventListener('click', function (e) { if (e.target === m2) closeModal(); });
}

/* 弹窗提交 */
async function submitQuickIO() {
  var el = $('#q-types .radio-chip.on');                                                    // 选中类型
  if (!el) { toast('请选择类型', 'err'); return; }                                          // 没选
  var type = el.getAttribute('data-t');                                                      // 类型值
  var qty = parseInt($('#q-qty').value, 10);                                                  // 数量
  if (isNaN(qty) || qty < 0 || (type !== 'adjust' && qty <= 0)) { toast('数量不合法', 'err'); return; }  // 校验
  var ok = await applyStockRecord(quickPicked.id, type, qty, {                              // 核心逻辑
    price: ($('#q-price').value === '') ? quickPicked.price : (parseFloat($('#q-price').value) || 0),  // 成员视图留空时自动按参考价
    project: $('#q-project').value.trim(),
    remark: $('#q-remark').value.trim()
  });
  _locTipArmed = false;                                                                       // 出入库已处理，解除图片识别标记（避免后续误弹）
  if (ok) {                                                                                  // 成功
    var _sy = window.scrollY || document.documentElement.scrollTop || 0;                      // 记住滚动位置，刷新后恢复（避免跳回顶部）
    /* 识别入库钩子：识别照片补进该物料档案——已满 3 张就不存，不足 3 张就存（去重，不重复写入） */
    if (PRState && PRState.inWithPhoto && PRState.inWithPhoto.id === quickPicked.id) {
      var ph = (quickPicked.photos || []).slice();
      var dv = PRState.inWithPhoto.dataUrl;
      if (dv && ph.indexOf(dv) < 0 && ph.length < 3) {
        ph.push(dv);
        quickPicked.photos = ph;
        quickPicked.updatedAt = Date.now();
        delete quickPicked._search;
        await DB.put('materials', quickPicked);
        await State.refreshMaterials();          /* 内存同步：页面/档案立即显示新照片，而不是等下次重进 */
      }
      PRState.inWithPhoto = null;
    }
    closeModal();                                                                             // 关弹窗
    refreshCurrentPage();                                                                     // 刷新当前页（列表/详情/仪表盘都支持）
    if (PRState && PRState.savedRecogHtml) { PRState.savedRecogHtml = ''; prOpenRecogModal(); }  // 识别流程：重渲染识别弹窗（库存/位置即时更新，不再恢复旧快照）
    else { restoreRecogModal(); }                                                              // 非识别流程：恢复弹窗
    window.scrollTo(0, _sy);                                                                   // 恢复出入库前的滚动位置
  }
}

/* "再来一笔"：按历史记录快速预填 */
async function repeatRecord(recId) {
  var records = await State.loadRecords();                                                    // 全部记录
  var rec = null;                                                                              // 目标
  for (var i = 0; i < records.length; i++) {                                                  // 查找
    if (records[i].id === recId) { rec = records[i]; break; }                                   // 命中
  }
  if (!rec) return;                                                                            // 没有
  var mat = null;                                                                              // 对应物料
  for (var j = 0; j < State.materials.length; j++) {                                           // 查找物料
    if (State.materials[j].id === rec.materialId) { mat = State.materials[j]; break; }         // 命中
  }
  if (!mat) { toast('该物料已删除，无法重复登记', 'warn'); return; }                              // 物料没了
  openStockIOModal(mat.id, rec.type);                                                          // 打开弹窗（带上次类型）
  /* 预填上次的数量 / 项目 / 备注 */
  setTimeout(function () {                                                                      // 等弹窗渲染完
    var q = $('#q-qty'), p = $('#q-project'), r = $('#q-remark');                               // 三个输入框
    if (q) q.value = rec.qty;                                                                   // 数量
    if (p) p.value = rec.project || '';                                                         // 项目
    if (r) r.value = rec.remark || '';                                                          // 备注
  }, 60);                                                                                       // 60ms 足够
}

/* ==================== 9. 库存预警页 ==================== */

async function pageAlerts() {
  var alerts = State.alertList();                                                              // 预警列表
  var dangerCount = 0;                                                                          // 告急数
  for (var i = 0; i < alerts.length; i++) { if (alerts[i].level === 'danger') dangerCount++; } // 统计
  var rows = '';                                                                                 // 表格行
  for (var a = 0; a < alerts.length; a++) {                                                      // 遍历
    var al = alerts[a];                                                                           // 当前
    var m = al.m;                                                                                  // 物料
    rows += '<tr>' +
      '<td><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.code) + '</div></td>' +
      '<td style="white-space:nowrap">' + escapeHtml(m.cat) + '</td>' +
      '<td><span class="badge ' + (al.level === 'danger' ? 'badge-red' : 'badge-yellow') + '">' + (al.level === 'danger' ? '告急' : '偏低') + '</span></td>' +
      '<td class="num"><b style="color:' + (al.level === 'danger' ? 'var(--danger)' : 'var(--warning)') + '">' + m.stock + '</b> ' + escapeHtml(m.unit || '') + '</td>' +
      '<td class="num">' + m.minStock + '</td>' +
      /* 参考单价涉及钱：仅管理员可见 */
      '<td class="num">' + fmtMoney(m.price) + '</td>' +
      '<td style="white-space:nowrap">' + locBadge(m.loc, m.locNo, !canSeeLoc(m.id)) + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-success" onclick="openStockIOModal(\'' + m.id + '\',\'in\')">补货入库</button> ' +
        (isAdminNow() ? '<button class="btn btn-sm btn-outline" onclick="openEditMinModal(\'' + m.id + '\')">调警戒线</button>' : '') +
      '</td>' +
      '</tr>';
  }
  if (alerts.length === 0) rows = '<tr><td colspan="8"><div class="empty"><div class="e-ico">' + ICONS.check + '</div>所有库存都在安全线以上</div></td></tr>';

  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">库存预警</div><div class="page-desc">低于警戒线自动标红，方便及时补货</div></div>' +
      '<div style="display:flex;gap:8px">' +
        /* 补货清单带单价与预估金额，涉及钱：仅管理员显示该按钮 */
        (isAdminNow() ? '<button class="btn btn-outline" onclick="exportRestockList()">📋 导出补货清单</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(220,38,38,.1);color:var(--danger)">' + ICONS.alert + '</div><div><div class="s-val">' + dangerCount + '</div><div class="s-label">库存告急（≤警戒线）</div></div></div>' +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(245,158,11,.12);color:var(--warning)">' + ICONS.bell + '</div><div><div class="s-val">' + (alerts.length - dangerCount) + '</div><div class="s-label">库存偏低（≤1.5倍警戒线）</div></div></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>物料</th><th>类别</th><th>状态</th><th>当前库存</th><th>警戒线</th><th>参考单价</th><th>位置</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';
}

/* 快速修改警戒线弹窗（仅管理员可打开） */
function openEditMinModal(id) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以修改警戒线', 'err'); return; }  // 权限：仅管理员
  var m = null;                                                                                  // 目标
  for (var i = 0; i < State.materials.length; i++) {                                              // 查找
    if (State.materials[i].id === id) { m = State.materials[i]; break; }                          // 命中
  }
  if (!m) return;                                                                                  // 没有
  openModal('修改警戒线：' + escapeHtml(m.name), '' +
    '<div class="form-item"><label>警戒线数量（当前库存 ' + m.stock + ' ' + escapeHtml(m.unit || '') + '）</label>' +
    '<input class="input" id="em-val" type="number" min="0" step="1" value="' + (m.minStock || 0) + '" /></div>' +
    '<div class="form-hint">设为 0 表示不预警</div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="saveMinStock(\'' + m.id + '\')">保存</button>');
}

/* 保存警戒线（仅管理员可操作） */
async function saveMinStock(id) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以修改警戒线', 'err'); return; }  // 权限：仅管理员
  var v = parseInt($('#em-val').value, 10);                                                        // 新值
  if (isNaN(v) || v < 0) { toast('请输入 ≥ 0 的整数', 'err'); return; }                               // 校验
  for (var i = 0; i < State.materials.length; i++) {                                                 // 查找
    if (State.materials[i].id === id) {                                                              // 命中
      var m = State.materials[i];                                                                    // 物料
      m.minStock = v;                                                                                 // 改值
      m.updatedAt = Date.now();                                                                       // 时间
      delete m._search;                                                                                // 清索引
      await DB.put('materials', m);                                                                   // 写库
      await Log.add('修改警戒线', m.name + ' 警戒线改为 ' + v);                                        // 日志
      await State.refreshMaterials();                                                                 // 刷新
      closeModal();                                                                                    // 关弹窗
      toast('警戒线已更新', 'ok');                                                                       // 提示
      refreshCurrentPage();                                                                            // 刷新页面
      return;                                                                                          // 结束
    }
  }
}

/* ==================== 9.5 警戒线自动微调 ==================== */

/* 同一物料两次自动微调的最小间隔（7 天），避免警戒线频繁跳动 */
var MIN_TUNE_GAP = 7 * 86400000;

/* 根据近 90 天的实际出库用量，自动微调某个物料的警戒线（出库登记成功后触发，静默执行）
   推荐值 ≈ 平均每月消耗 × 1.5（约一个半月的用量）；近 90 天没有消耗就不动它 */
async function autoTuneMinStock(mid) {
  try {
    var m = null;                                                                                      // 目标物料
    for (var i = 0; i < State.materials.length; i++) {                                                 // 从缓存查找
      if (State.materials[i].id === mid) { m = State.materials[i]; break; }                            // 命中
    }
    if (!m) return;                                                                                    // 物料不存在
    var last = parseInt(localStorage.getItem('minTune_' + mid) || '0', 10);                            // 上次自动微调时间
    if (Date.now() - last < MIN_TUNE_GAP) return;                                                      // 7 天内调过：先不动
    var records = await State.loadRecords();                                                           // 全部出入库记录
    var day90 = Date.now() - 90 * 86400000;                                                            // 90 天前的时间戳
    var used = 0;                                                                                      // 近 90 天出库总量
    for (var r = 0; r < records.length; r++) {                                                         // 遍历统计
      var rc = records[r];                                                                             // 当前记录
      if (rc.revoked || rc.deleted) continue;                                                          // 已撤回 / 已删除的不算
      if (rc.materialId === mid && rc.time >= day90 && isOutType(rc.type)) used += rc.qty;             // 累加出库量（新旧类型都算）
    }
    if (used === 0) return;                                                                            // 近 90 天没消耗：没有依据，保持现状
    var monthAvg = used / 3;                                                                           // 平均每月消耗量
    var recMin = Math.max(1, Math.min(Math.ceil(monthAvg * 1.5), 999));                                 // 推荐警戒线 ≈ 45 天用量，限制在 1~999
    var cur = m.minStock || 0;                                                                         // 当前警戒线
    if (Math.abs(recMin - cur) < 2) return;                                                            // 和现值差距太小，不值得折腾
    if (cur > 0 && recMin > cur * 3) return;                                                           // 跳变超过 3 倍（可能是囤货等异常数据），不采信
    if (recMin < cur && recMin < cur / 3) recMin = Math.ceil(cur / 2);                                  // 下调一次最多砍一半，循序渐进
    m.minStock = recMin;                                                                               // 应用新值
    m.updatedAt = Date.now();                                                                          // 更新时间
    delete m._search;                                                                                  // 清搜索索引
    await DB.put('materials', m);                                                                      // 写库
    await Log.add('自动调整警戒线', m.name + ' 警戒线 ' + cur + ' → ' + recMin + '（按近90天用量自动微调）');  // 日志留痕，管理员可查
    await State.refreshMaterials();                                                                    // 刷新缓存
    localStorage.setItem('minTune_' + mid, String(Date.now()));                                        // 记录本次时间（节流用）
  } catch (err) { /* 静默失败：自动微调不允许影响正常的出入库主流程 */ }
}

/* 导出补货清单为 CSV（发给采购的同学，Excel/WPS 可直接打开） */
async function exportRestockList() {
  var alerts = State.alertList();                                                                      // 预警清单
  if (alerts.length === 0) { toast('库存都充足，无需补货', 'ok'); return; }                                // 空清单
  var rows = [['物料名称', '型号/规格', '现有库存', '库存预警线', '建议补货', '单位', '单价(元)', '预估金额(元)']];  // 表头
  var total = 0;                                                                                        // 预估总额
  for (var i = 0; i < alerts.length; i++) {                                                              // 逐条
    var m = alerts[i].m;                                                                                   // 物料
    var suggest = Math.max(m.minStock * 2 - m.stock, 1);                                                    // 建议补货量（补到警戒线两倍）
    var cost = suggest * (m.price || 0);                                                                     // 单行预估
    total += cost;                                                                                           // 累计
    rows.push([m.name, m.model || '', m.stock, m.minStock || 0, suggest, m.unit || '', m.price || 0, cost.toFixed(2)]);  // 行
  }
  rows.push(['', '', '', '', '', '', '预估总额', total.toFixed(2)]);                                        // 合计行
  var csv = rows.map(function (r) { return r.map(function (v) { var t = String(v); return '"' + t.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');  // CSV（含引号转义）
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });                            // 加 BOM 防止 Excel 中文乱码
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '补货清单-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  toast('补货清单已导出（' + alerts.length + ' 种物料，约 ' + fmtMoney(total) + '）', 'ok');                 // 成功
}

/* ==================== 8. 项目领料：按历史项目一键再来一份 ==================== */

/* 项目领料页：选一个以前的项目，把它上次领用的物料批量再出一份 */
async function pageProjectPick() {
  var records = await State.loadRecords();                              // 全部记录
  var projSet = {};                                                     // 历史项目去重
  for (var i = 0; i < records.length; i++) {
    if (records[i].project) projSet[records[i].project] = 1;
  }
  var opts = '<option value="">-- 请选择项目 --</option>';
  for (var p in projSet) opts += '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>';
  $('#page').innerHTML =
    '<div class="page-head"><div><div class="page-title">项目领料</div><div class="page-desc">选一个以前办过的项目，把它上次领用的物料一键再领一份（批量出库）</div></div></div>' +
    '<div class="card">' +
      '<div class="form-item" style="display:flex;flex-direction:row;align-items:center;gap:10px;margin-bottom:0"><label style="flex:none;margin:0">选择项目</label>' +
        '<select class="select" id="pp-proj" style="max-width:360px" onchange="ppLoad()">' + opts + '</select>' +
        '<div style="margin-left:auto;text-align:right">' +
          '<button class="btn btn-outline" onclick="$(\'#bom-file\').click()">' + ICONS.upload + '导入嘉立创 BOM</button>' +
          '<div style="font-size:12px;color:var(--text-sub);margin-top:6px">可把文件直接拖进页面导入</div>' +
        '</div>' +
        '<input type="file" id="bom-file" accept=".csv,.txt,.xlsx,.xls" style="display:none" onchange="bomImport(this)" />' +
      '</div>' +
      '<div id="pp-list" style="margin-top:14px"><div class="form-hint">选择项目后，这里会列出该项目上次领用的物料清单，数量可改，勾选后一键出库。</div></div>' +
    '</div>';
}

/* 载入所选项目的历史出库清单（按物料聚合，取每个物料最近一次出库数量） */
async function ppLoad() {
  var proj = $('#pp-proj').value;
  var box = $('#pp-list');
  if (!proj) { box.innerHTML = '<div class="form-hint">选择项目后显示清单</div>'; return; }
  var records = await State.loadRecords();
  var byMat = {};
  for (var i = records.length - 1; i >= 0; i--) {
    var r = records[i];
    if (r.project !== proj || r.type !== 'out') continue;
    if (byMat[r.materialId] !== undefined) continue;
    byMat[r.materialId] = r.qty;
  }
  var rows = '';
  var count = 0;
  for (var mid in byMat) {
    var m = null;
    for (var j = 0; j < State.materials.length; j++) {
      if (State.materials[j].id === mid) { m = State.materials[j]; break; }
    }
    if (!m) continue;
    count++;
    var low = (m.stock || 0) <= (m.minStock || 0);
    rows += '<tr>' +
      '<td style="width:36px"><input type="checkbox" class="pp-chk" checked data-mid="' + mid + '"></td>' +
      '<td><span class="t-link" onclick="gotoMaterial(\'' + mid + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + '</div></td>' +
      '<td style="white-space:nowrap">' + (canSeeLoc(m.id) ? locBadge(m.loc, m.locNo) : '<span style="color:var(--text-sub)">🔒 做有效出入库后可见</span>') + '</td>' +   // 项目领料表格统一 locBadge
      '<td style="white-space:nowrap">' + escapeHtml(m.unit || '') + '</td>' +
      '<td style="color:' + (low ? 'var(--danger)' : 'var(--text-sub)') + '">' + (m.stock || 0) + '</td>' +
      '<td style="width:90px"><input class="input pp-qty" type="number" min="1" step="1" value="' + byMat[mid] + '" oninput="ppRefreshTotals()" style="padding:6px 10px;width:80px"></td>' +
      '<td class="pp-total" style="width:84px;font-weight:600" data-total="' + byMat[mid] + '">' + byMat[mid] + '</td>' +
      '</tr>';
  }
  if (!count) rows = '<tr><td colspan="7"><div class="empty">这个项目还没有出库记录</div></td></tr>';
  box.innerHTML =
    '<div style="margin-top:6px" class="table-wrap"><table class="tbl">' +
      '<thead><tr><th></th><th>物料</th><th>位置</th><th>单位</th><th>当前库存</th><th>单份数量</th><th>合计出库</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
    /* 底部：左侧"本次要 N 份该项目物料"，右侧出库/导出按钮 */
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">' +
      '<span style="font-size:14px">本次要</span>' +
      '<input class="input" type="number" id="pp-copies" min="1" step="1" value="1" oninput="ppRefreshTotals()" style="width:66px;padding:6px 8px" />' +
      '<span style="font-size:14px">份该项目物料</span>' +
      '<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-primary" onclick="ppBatchOut()">出库勾选物料</button>' +
        '<button class="btn btn-outline" onclick="ppExport()">导出清单 CSV</button>' +
      '</div>' +
    '</div>';
}

/* 份数或单份数量变化：合计 = 单份数量 × 份数 */
function ppRefreshTotals() {
  var copiesEl = $('#pp-copies');
  var copies = copiesEl ? (parseInt(copiesEl.value, 10) || 1) : 1;
  if (copies < 1) copies = 1;
  var qtys = document.querySelectorAll('.pp-qty');
  for (var i = 0; i < qtys.length; i++) {
    var base = parseInt(qtys[i].value, 10) || 0;
    var total = base * copies;
    var cell = qtys[i].closest('tr').querySelector('.pp-total');
    cell.textContent = total;
    cell.setAttribute('data-total', total);
  }
}

/* 批量出库勾选物料 */
async function ppBatchOut() {
  var proj = $('#pp-proj').value;
  if (!proj) { toast('请先选择项目', 'warn'); return; }
  var chks = document.querySelectorAll('.pp-chk:checked');
  if (!chks.length) { toast('请至少勾选一种物料', 'warn'); return; }
  var done = 0, fail = 0;
  beginBatchLoc();                                                              // 批量：统一收集位置提示
  for (var i = 0; i < chks.length; i++) {
    var row = chks[i].closest('tr');
    var qty = parseInt(row.querySelector('.pp-total').getAttribute('data-total'), 10);
    if (!qty || qty < 1) { fail++; continue; }
    var ok = await applyStockRecord(chks[i].getAttribute('data-mid'), 'out', qty, { project: proj, remark: '项目领料：' + proj });
    if (ok) done++; else fail++;
  }
  toast('已出库 ' + done + ' 种物料' + (fail ? '，' + fail + ' 种失败（库存不足）' : ''), fail ? 'warn' : 'ok');
  endBatchLoc();                                                              // 批量结束：一次显示所有位置
  ppLoad();
}

/* 导出勾选清单 CSV */
function ppExport() {
  var proj = $('#pp-proj').value;
  if (!proj) { toast('请先选择项目', 'warn'); return; }
  var chks = document.querySelectorAll('.pp-chk:checked');
  if (!chks.length) { toast('请至少勾选一种物料', 'warn'); return; }
  var lines = ['物料名称,型号/规格,存放位置,单位,本次数量,备注'];
  var copiesEl = $('#pp-copies');
  var copies = copiesEl ? (parseInt(copiesEl.value, 10) || 1) : 1;
  for (var i = 0; i < chks.length; i++) {
    var row = chks[i].closest('tr');
    var firstLine = row.cells[1].innerText.split('\n')[0];
    var loc = row.cells[2].innerText.split('\n').join('/').trim();
    var unit = row.cells[3].innerText.trim();
    var qty = row.querySelector('.pp-total').getAttribute('data-total');
    lines.push('"' + firstLine.replace(/"/g, '""') + '",,"' + loc.replace(/"/g, '""') + '",' + unit + ',' + qty + ',（共 ' + copies + ' 份）');
  }
  var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = proj + '-物料清单.csv';
  a.click();
}

/* ==================== 9. 嘉立创 BOM 导入 ==================== */

var BOMState = null;

/* CSV 拆行（支持引号内逗号、双引号转义） */
function csvSplitLine(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function csvCell(s) { return String(s || '').replace(/^"|"$/g, '').trim(); }

/* 读取并解析 BOM 文件 */
async function bomImport(inputEl) {
  var file = inputEl && inputEl.files ? inputEl.files[0] : inputEl;   /* 兼容：传 input 元素 或 直接传 File（拖拽） */
  if (!file) return;
  if (inputEl && inputEl.files) inputEl.value = '';
  var lowName = file.name.toLowerCase();
  var grid = null;                                                    /* 统一成二维数组 */
  if (lowName.endsWith('.xlsx') || lowName.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') { toast('表格解析组件未加载，请改用 CSV', 'err'); return; }
    var buf = await file.arrayBuffer();
    var wb = XLSX.read(buf, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } else {
    var text = await file.text();
    var lines = text.split(/\r?\n/);
    grid = [];
    for (var li = 0; li < lines.length; li++) grid.push(csvSplitLine(lines[li]));
  }
  /* 单元格统一转字符串 */
  for (var g0 = 0; g0 < grid.length; g0++) {
    for (var g1 = 0; g1 < grid[g0].length; g1++) grid[g0][g1] = csvCell(String(grid[g0][g1]));
  }
  /* 找表头行：名称列认 名称/comment/Device/Name/型号/model；数量列认 个数/数量/Quantity */
  var headIdx = -1, cols = null;
  for (var i = 0; i < grid.length; i++) {
    var isName = grid[i].some(function (c) { return /名称|comment|^device$|^name$|^型号$|^model$/i.test(c); });
    var isQty = grid[i].some(function (c) { return /^(个数|数量|quantity|qty)$/i.test(c); });
    if (isName && isQty) { headIdx = i; cols = grid[i]; break; }
  }
  if (headIdx < 0) { toast('没识别出 BOM 表头（需含“型号/名称”和“数量”列）；表头对不上可用“手动映射”', 'err'); return; }
  var map = pmxAutoColMap(cols);                                    /* 大小写不敏感的列语义识别（Device/Name/Value/Footprint/数量…） */
  /* 数据行 → needs（主名 + Value/封装/立创编号；Device 里内嵌的 _C编号 拆出来） */
  var needs = [];
  for (var r = headIdx + 1; r < grid.length; r++) {
    var d = grid[r];
    var dev = map.iDev >= 0 ? String(d[map.iDev] || '').trim() : '';
    var nm = map.iName >= 0 ? String(d[map.iName] || '').trim() : '';
    var val = map.iVal >= 0 ? String(d[map.iVal] || '').trim() : '';
    var pkg = map.iPkg >= 0 ? String(d[map.iPkg] || '').trim() : '';
    var mfr = map.iMfr >= 0 ? String(d[map.iMfr] || '').trim() : '';
    var code = map.iCode >= 0 ? String(d[map.iCode] || '').trim() : '';
    var des = map.iDes >= 0 ? String(d[map.iDes] || '').trim() : '';
    var cmt = map.iCmt >= 0 ? String(d[map.iCmt] || '').trim() : '';  // Comment 列（型号/参数常见）
    var qty = map.iQty >= 0 ? (parseInt(String(d[map.iQty]).replace(/[^\d]/g, ''), 10) || 1) : 1;   // 数量清洗：只留数字
    if (!dev && !nm && !pkg && !code && !cmt) continue;                      // 空行跳过
    var catText = pmxRowCatText(d, cols);                                     // 原表分类列文字（Category / Primary Category / Secondary Category…）
    var desc = bomDescribe(dev, nm, val, pkg, mfr, code, des, cmt, catText);  // 类型感知人话描述（分类列优先覆盖封装前缀判断）
    var kws = [], seenK = {};
    [desc.name, dev, nm, val, desc.cleanPkg, mfr, code, cmt, catText].forEach(function (w) {  // 分类列文字也进关键词，与项目配料页保持一致
      w = String(w || '').trim();
      if (w && !seenK[w]) { seenK[w] = 1; kws.push(w); }
    });
    if (!kws.length) continue;
    needs.push({ kw: kws.join('|'), n: qty, why: desc.detail, name: desc.name, detail: desc.detail, dev: dev, nm: nm, mfr: mfr, code: code, cmt: cmt });
  }
  if (!needs.length) { toast('BOM 里没有数据行', 'err'); return; }
  var plan = buildPlanFromNeeds('', needs, '嘉立创 BOM', true);
  var defaultName = file.name.replace(/\.(csv|txt|xlsx|xls)$/i, '');
  BOMState = { plan: plan, name: defaultName, copies: 1, visibility: 'public', saved: false };
  bomRender();
}

/* BOM 结果弹窗 */
function bomRender() {
  var st = BOMState;
  var plan = st.plan;
  /* 库里有的（含替代） */
  var haveRows = '';
  for (var j = 0; j < plan.items.length; j++) {
    var it = plan.items[j];
    var m = it.material;
    var canOut = m.stock > 0;
    var stBadge = it.status === 'ok' ? '<span class="badge badge-green">库存充足</span>' : it.status === 'low' ? '<span class="badge badge-yellow">数量不足</span>' : '<span class="badge badge-red">库存为空</span>';
    var altTag = it.alt ? '<span class="badge badge-yellow">替代：' + escapeHtml(it.altKw) + '</span>' : '';
    haveRows += '<div class="ai-plan-item">' +
      '<input type="checkbox" class="bom-chk" data-mid="' + m.id + '"' + (canOut ? ' checked' : ' disabled') + ' />' +
      '<div class="p-name"><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + ' · ' + locBadge(m.loc, m.locNo, !canSeeLoc(m.id)) + '</div></div>' +
      altTag +
      '<span style="font-size:12.5px">单份 <b>' + it.needQty + '</b> · 合计 <b class="bom-line-total">' + (it.needQty * st.copies) + '</b> · 现有 ' + m.stock + '</span>' +
      stBadge + '</div>';
  }
  if (!plan.items.length) haveRows = '<div class="empty">BOM 物料在库里一个都没匹配到</div>';
  /* 库里没有的 */
  var missRows = '';
  for (var b = 0; b < plan.missing.length; b++) {
    var ms = plan.missing[b];
    var nm2 = ms.name || String(ms.kw || '').split('|')[0];
    missRows += '<div class="ai-plan-item" style="border-style:dashed"><div class="p-name"><b>' + escapeHtml(nm2) + '</b>' +
      (ms.detail ? '<div style="font-size:12px;color:var(--text-sub);margin-top:2px">' + escapeHtml(ms.detail) + '</div>' : '') + '</div>' +
      '<span style="font-size:12.5px">建议购 <b>' + (ms.n * st.copies) + '</b> 个</span></div>';
  }
  if (!plan.missing.length) missRows = '<div class="empty">BOM 物料全部能在库里找到</div>';

  var body =
    /* 项目名 + 份数 + 可见范围 */
    '<div class="form-item"><label>项目名称（出库记录和保存都用这个名字） <span class="req">*</span></label>' +
      '<input class="input" id="bom-name" maxlength="40" value="' + escapeHtml(st.name) + '" /></div>' +
    '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:12px">' +
      '<span style="font-size:13.5px">制作份数</span>' +
      '<input class="input" type="number" id="bom-copies" min="1" step="1" value="' + st.copies + '" style="width:70px;padding:6px 8px" oninput="bomRefreshTotals()" />' +
      '<span style="font-size:13.5px">可见范围</span>' +
      '<label style="font-size:13px"><input type="radio" name="bom-vis" value="public"' + (st.visibility === 'public' ? ' checked' : '') + ' onchange="BOMState.visibility=\'public\'" /> 公开</label>' +
      '<label style="font-size:13px"><input type="radio" name="bom-vis" value="private"' + (st.visibility === 'private' ? ' checked' : '') + ' onchange="BOMState.visibility=\'private\'" /> 私密</label>' +
    '</div>' +
    '<div class="card" style="margin-bottom:12px"><div class="card-title">库里有 / 可替代（' + plan.items.length + '）</div>' + haveRows + '</div>' +
    '<div class="card" style="margin-bottom:0"><div class="card-title">库里没有（' + plan.missing.length + '）</div>' + missRows +
    (plan.missing.length ? '<div style="margin-top:10px;text-align:right"><button class="btn btn-outline" onclick="aiFindReplace()">' + ICONS.ai + 'AI 查找替代元件</button></div>' : '') +
    '</div>';

  openModal('嘉立创 BOM 导入', body,
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-outline" onclick="bomExport()">导出取件清单</button>' +
    '<button class="btn btn-outline" onclick="bomSaveOnly()">仅保存项目</button>' +
    '<button class="btn btn-blue" onclick="bomClaim()">' + ICONS.out + '出库并保存项目</button>', true);
}

/* 份数变化：只更新合计，不重渲染（保留勾选） */
function bomRefreshTotals() {
  var st = BOMState;
  st.copies = parseInt($('#bom-copies').value, 10) || 1;
  var chks = document.querySelectorAll('.bom-chk');
  for (var i = 0; i < chks.length; i++) {
    var it = st.plan.items[i];
    var el = chks[i].closest('.ai-plan-item').querySelector('.bom-line-total');
    if (el) el.textContent = it.needQty * st.copies;
  }
  st.name = $('#bom-name').value.trim();
}

/* 组装项目对象 */
function bomBuildProject() {
  var st = BOMState;
  st.name = $('#bom-name').value.trim();
  if (!st.name) { toast('请填写项目名称', 'err'); return null; }
  return {
    id: uid('aip'), name: st.name, source: 'bom', need: '嘉立创 BOM：' + st.name,
    plans: [serializePlan(st.plan)], chat: [], visibility: st.visibility,
    operator: Auth.user.username, createdAt: Date.now(), updatedAt: Date.now()
  };
}

/* 出库并保存：勾选的物料按 单份×份数 出库，然后存项目 */
async function bomClaim() {
  var st = BOMState;
  var proj = bomBuildProject();
  if (!proj) return;
  var chks = document.querySelectorAll('.bom-chk:checked');
  if (!chks.length) { toast('没有勾选可出库的物料', 'warn'); return; }
  var done = 0, fail = 0;
  beginBatchLoc();                                                              // 批量：统一收集位置提示
  for (var i = 0; i < chks.length; i++) {
    var itemEl = chks[i].closest('.ai-plan-item');
    var mid = chks[i].getAttribute('data-mid');
    var qty = parseInt(itemEl.querySelector('.bom-line-total').textContent, 10);
    var ok = await applyStockRecord(mid, 'out', qty, { project: proj.name, remark: '嘉立创 BOM 导入：' + proj.name });
    if (ok) {
      done++;
      /* 加项目名标签 */
      var m = await DB.get('materials', mid);
      if (m) {
        m.tags = m.tags || [];
        if (m.tags.indexOf(proj.name) < 0) { m.tags.push(proj.name); delete m._search; await DB.put('materials', m); }
      }
    } else fail++;
  }
  await DB.put('ai_projects', proj);
  await State.refreshMaterials();
  closeModal();
  toast('已出库 ' + done + ' 种物料，项目「' + proj.name + '」已保存' + (fail ? '，' + fail + ' 种失败' : ''), fail ? 'warn' : 'ok');
  endBatchLoc();                                                              // 批量结束：一次显示所有位置
  PageCache = {};   // 数据已变
  refreshCurrentPage();
}

/* 仅保存项目（不出库） */
async function bomSaveOnly() {
  var proj = bomBuildProject();
  if (!proj) return;
  await DB.put('ai_projects', proj);
  closeModal();
  toast('项目「' + proj.name + '」已保存到历史记录', 'ok');
}

/* 导出 BOM 取件清单（勾选 + 缺失） */
function bomExport() {
  var st = BOMState;
  st.name = $('#bom-name').value.trim() || 'BOM项目';
  var lines = ['物料名称,型号/规格,位置,数量,状态,签收'];
  var chks = document.querySelectorAll('.bom-chk');
  for (var i = 0; i < chks.length; i++) {
    var itemEl = chks[i].closest('.ai-plan-item');
    var it = st.plan.items[i];
    var nm = itemEl.querySelector('.p-name b').textContent;
    var sub = itemEl.querySelector('.p-name div').textContent;
    var qty = itemEl.querySelector('.bom-line-total').textContent;
    lines.push('"' + nm + '","' + sub + '","' + escapeCsv(it.material.loc || '') + '",' + qty + ',库里有,');
  }
  for (var b = 0; b < st.plan.missing.length; b++) {
    var ms = st.plan.missing[b];
    lines.push('"' + ms.kw.replace(/"/g, '""') + '",,,' + (ms.n * st.copies) + ',需采购,');
  }
  var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = st.name + '-取件清单.csv';
  a.click();
}
function escapeCsv(s) { return String(s).replace(/"/g, '""'); }

/* ==================== AI 查找替代元件（BOM 导入用） ==================== */
var AISuggest = null;                                     /* 最近一次 AI 建议 {list:[{kw,altId,altName,reason}], mapping:[missingIdx]} */

/* AI 返回的关键词 与 本地缺失项关键词 做分段模糊匹配（AI 常只回简写） */
function aiKwHit(a, b) {
  var sa = String(a || '').toLowerCase(), sb = String(b || '').toLowerCase();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  var aa = sa.split('|'), ab = sb.split('|');
  for (var i = 0; i < aa.length; i++) {
    for (var j = 0; j < ab.length; j++) {
      if (!aa[i] || !ab[j]) continue;
      if (aa[i] === ab[j]) return true;
      if (aa[i].length >= 3 && ab[j].length >= 3 && (aa[i].indexOf(ab[j]) >= 0 || ab[j].indexOf(aa[i]) >= 0)) return true;
    }
  }
  return false;
}


/* 带 429 限流退避重试的 AI 调用（最多重试 2 次，等待 6s/12s） */
function aiCallRetry(messages, cfg) {
  var n = 0;   /* 429 限流重试次数 */
  var t = 0;   /* 超时重试次数 */
  function once() {
    return callLLM(messages, cfg).catch(function (err) {
      var m = String(err.message || '');
      if (/429/.test(m) && n < 3) {
        n++;
        return new Promise(function (res) { setTimeout(function () { res(once()); }, 10000 * n); });
      }
      if (/超时/.test(m) && t < 1) {
        t++;
        return new Promise(function (res) { setTimeout(function () { res(once()); }, 5000); });
      }
      throw err;
    });
  }
  return once();
}

async function aiFindReplace() {
  var st = BOMState;
  if (!st.plan.missing.length) { toast('没有缺失物料，不需要找替代', 'warn'); return; }
  var cfg = await pickAIConfig('pick');
  if (!cfg || !cfg.enabled || !cfg.url) { toast('请先在系统设置接入 AI，并给该配置勾选"项目领料"用途', 'warn'); return; }
  var mats = State.materials.filter(function (m) { return !m.deleted && m.stock > 0; });
  var libLines = mats.slice(0, 50).map(function (m) {
    return m.name + (m.model ? '/' + m.model : '') + '/库存' + m.stock;
  });
  var libTxt = libLines.join('\n') || '（仓库是空的）';
  var estMin = Math.ceil(Math.ceil(st.plan.missing.length / 10) * 2.5);  /* 串行每批约 2.5 分钟（实测），按批数估算 */
  openModal('AI 查找替代', '<div style="padding:20px;text-align:center;color:var(--text-sub)">正在让 AI 对照仓库找替代……<div style="margin-top:12px;font-size:13px;color:var(--text-sub)">共 ' + st.plan.missing.length + ' 种缺失，预计约 ' + estMin + ' 分钟（每批 10 条约 2-3 分钟），关闭弹窗可随时中止</div></div>', null);
  window._aiAbort = false;                                           /* 重置中止标志（须在 openModal 之后） */
  try {
    var all = [];                                /* 合并所有批次建议 */
    var BATCH = 10;                              /* 每批 10 条缺失：批数更少，串行总时间更短 */
    var CONC = 1;                                /* 串行：账户限并发，并发必触发 429，只能串行最稳 */
    var total = st.plan.missing.length;
    var batches = Math.ceil(total / BATCH);
    var done = 0;
    for (var b0 = 0; b0 < batches; b0 += CONC) {
      if (window._aiAbort) break;                                   /* 弹窗被关闭，中止 */
      var grp = [];
      for (var g = b0; g < Math.min(b0 + CONC, batches); g++) grp.push(g);
      var parts = await Promise.all(grp.map(function (bi) {
        var chunk = st.plan.missing.slice(bi * BATCH, (bi + 1) * BATCH);
        var missLines = chunk.map(function (ms, ix) {
          return '缺' + (bi * BATCH + ix + 1) + '：' + ms.kw + '（需 ' + ms.n + ' 个）';
        });
        var sys = '你是电子元件选型工程师，帮学生从仓库里找可替代元件。\n' +
          '仓库现有库存物料（名称/型号/库存）：\n' + libTxt + '\n\n' +
          'BOM 里缺的物料：\n' + missLines.join('\n') + '\n\n' +
          '要求：为每条缺失物料推荐 1 个仓库里最合适的替代品（优先同封装、同参数、同功能；找不到合适的 altId 就填空字符串）。' +
          '只返回 JSON 数组，格式：[{"kw":"缺失物料原关键词","n":缺失数量,"altId":"仓库物料id或空","altName":"替代品名称或空","reason":"15字内理由"}]，不要输出 JSON 以外的任何文字。';
        return aiCallRetry([{ role: 'user', content: sys }], cfg).then(function (reply) {
          return extractJSONArray(String(reply)) || [];
        });
      }));
      if (window._aiAbort) break;                                   /* 弹窗被关闭，中止 */
      for (var p = 0; p < parts.length; p++) all = all.concat(parts[p]);
      done += grp.length;
      $('.modal-body').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-sub)">正在让 AI 对照仓库找替代（已完成 ' + done + '/' + batches + ' 批，共 ' + total + ' 种）……<div style="margin-top:12px;font-size:13px;color:var(--text-sub)">关闭弹窗可随时中止</div></div>';
    }
    if (window._aiAbort) { toast('AI 查找替代已中止', 'warn'); return; }  /* 被中止，不应用结果 */
    if (!all.length) throw new Error('AI 没有返回可用的 JSON');
    AISuggest = { list: all, mapping: [] };
    var byId = {};
    for (var i = 0; i < mats.length; i++) byId[mats[i].id] = mats[i];
    var rows = '';
    for (var s = 0; s < all.length; s++) {
      var sug = all[s] || {};
      var mi = -1;
      for (var q = 0; q < st.plan.missing.length; q++) {
        if (aiKwHit(st.plan.missing[q].kw, sug.kw)) { mi = q; break; }
      }
      AISuggest.mapping.push(mi);
      var needN = mi >= 0 ? st.plan.missing[mi].n : (parseInt(sug.n, 10) || 0);
      var showKw = mi >= 0 ? String(st.plan.missing[mi].kw).split('|')[0] : (sug.kw || '?');
      var m2 = sug.altId ? byId[sug.altId] : null;
      rows += '<div class="ai-plan-item">' +
        '<div class="p-name"><b>' + escapeHtml(showKw) + '</b><div style="font-size:12px;color:var(--text-sub)">需 ' + (needN > 0 ? needN : '?') + ' 个</div></div>' +
        (m2
          ? '<span class="badge badge-green">替代：' + escapeHtml(sug.altName || m2.name) + '（库存 ' + m2.stock + '）</span>'
          : '<span class="badge badge-red">没有合适替代</span>') +
        (m2
          ? '<button class="btn btn-sm btn-primary" onclick="aiApplyAlt(' + s + ')">加入清单</button>'
          : '') +
        '</div>' +
        (sug.reason ? '<div style="font-size:12px;color:var(--text-sub);margin:-4px 0 8px 14px">' + escapeHtml(sug.reason) + '</div>' : '');
    }
    openModal('AI 查找替代', '<div style="font-size:13px;color:var(--text-sub);margin-bottom:10px">点"加入清单"后，该物料会转入上方"库里有"并自动按替代品出库。</div>' + rows,
      '<button class="btn" onclick="closeModal()">关闭</button>', true);
  } catch (err) {
    var em = /429/.test(String(err.message)) ? '请求太频繁被接口限流（HTTP 429）。已自动等待重试仍超限，请稍等 1-2 分钟再点一次' : err.message;
    openModal('AI 查找替代', '<div class="empty">AI 调用失败：' + escapeHtml(em) + '</div>',
      '<button class="btn" onclick="closeModal()">关闭</button>');
  }
}

/* 把第 i 条 AI 建议的替代物料加入 BOM 清单（missing → items） */
function aiApplyAlt(i) {
  if (!AISuggest) return;
  var sug = AISuggest.list[i];
  var mi = AISuggest.mapping[i];
  var st = BOMState;
  var m = null;
  for (var k = 0; k < State.materials.length; k++) {
    if (State.materials[k].id === sug.altId) { m = State.materials[k]; break; }
  }
  if (!m) { toast('该替代物料已不存在', 'err'); return; }
  if (mi < 0 || mi >= st.plan.missing.length) { toast('找不到对应的缺失物料', 'err'); return; }
  var ms = st.plan.missing[mi];
  st.plan.items.push({
    mid: m.id, material: m, needQty: ms.n, unit: m.unit || '', loc: m.loc || '', locNo: m.locNo || '',
    have: m.stock, status: m.stock >= ms.n ? 'ok' : (m.stock > 0 ? 'low' : 'none'),
    alt: true, altKw: ms.kw, why: 'AI 推荐替代'
  });
  st.plan.missing.splice(mi, 1);
  closeModal();
  bomRender();
}

/* ==================== 页面拖拽 BOM 文件上传 ==================== */
(function () {
  var zone = document.createElement('div');
  zone.id = 'drop-zone';
  zone.innerHTML = '<span>' + (typeof ICONS !== 'undefined' && ICONS.upload ? ICONS.upload : '') + ' 松开鼠标，导入文件</span>';
  zone.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:none;z-index:9999;' +
    'align-items:center;justify-content:center;font-size:20px;letter-spacing:1px;color:var(--primary);' +
    'background:rgba(79,70,229,.10);border:3px dashed var(--primary);pointer-events:none;';
  zone.style.display = 'none';
  document.body.appendChild(zone);
  var hide = function () { zone.style.display = 'none'; };
  window.__hideDropZone = hide;                              /* 暴露给弹窗内的 drop 处理调用，防止遮罩卡住 */
  var isFileDrag = function (e) {
    if (!e.dataTransfer) return false;
    var t = e.dataTransfer.types || [];
    for (var i = 0; i < t.length; i++) { if (String(t[i]).toLowerCase() === 'files') return true; }
    return false;
  };
  document.addEventListener('dragover', function (e) {
    if (isFileDrag(e)) { e.preventDefault();
      zone.style.left = document.body.classList.contains('sb-collapsed') ? '0' : 'var(--sidebar-w)'; /* 收起：全屏宽；展开：侧栏右侧主区宽 */
      zone.style.display = 'flex'; }
  });
  document.addEventListener('dragleave', function (e) {
    if (!e.relatedTarget) hide();
  });
  document.addEventListener('drop', function (e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    hide();
    var f = e.dataTransfer.files[0];
    if (!f) return;
    if ($('#pr-pick-box') && f.type && f.type.indexOf('image') === 0) {   /* 图片识别弹窗开着：图片进选图框 */
      prPickFromFile(f, 'pick');
      return;
    }
    if ($('#mf-photos') && f.type && f.type.indexOf('image') === 0) {      /* 物料表单开着：图片进实物照片 */
      mfPhotoAddFile(f);
      return;
    }
    var n = f.name.toLowerCase();
    if ($('#import-file') && /\.(csv|txt)$/.test(n)) {   /* 数据管理页：物料 CSV 导入 */
      importMaterialsCSV(f);
      return;
    }
    if ($('#restore-file') && /\.json$/.test(n)) {       /* 数据管理页：备份 JSON 恢复 */
      importFullBackup(f);
      return;
    }
    if (/\.(xlsx|xls|csv|txt)$/.test(n)) {
      bomImport(f);
    } else {
      toast('支持拖入图片、物料 CSV、备份 JSON 或 xlsx / csv / txt 的 BOM 文件', 'warn');
    }
  });
})();

