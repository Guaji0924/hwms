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
    if (records[r].revoked) continue;                          // 已撤回的记录不算
    if (monthKey(records[r].time) === monthNow && isOutType(records[r].type)) monthOutCount++;  // 出库（新旧类型都算）
  }
  /* ---- 消耗排行（近 90 天出库数量 Top8） ---- */
  var day90 = Date.now() - 90 * 86400000;                      // 90 天前的时间戳
  var useMap = {};                                             // 物料名 -> 出库量
  for (var u = 0; u < records.length; u++) {                   // 遍历记录
    var rec = records[u];                                      // 当前记录
    if (rec.revoked) continue;                                  // 已撤回的记录不算
    if (rec.time >= day90 && isOutType(rec.type)) {             // 近 90 天出库（新旧类型都算）
      useMap[rec.materialName] = (useMap[rec.materialName] || 0) + rec.qty;            // 累加数量
    }
  }
  var rankArr = [];                                            // 转数组
  for (var k in useMap) rankArr.push({ label: k, value: useMap[k] });  // 装入
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
      if (records[b].revoked) continue;                        // 已撤回的记录不算
      if (monthKey(records[b].time) !== mk) continue;          // 不在本月跳过
      if (isInType(records[b].type)) buyVals[buyVals.length - 1] += (records[b].qty * (records[b].price || 0));  // 入库金额（旧"归还"也算）
      if (isOutType(records[b].type)) useVals[useVals.length - 1] += (records[b].qty * (records[b].price || 0));  // 出库成本（新旧类型都算）
    }
  }
  var buyValsInt = buyVals.map(function (v) { return Math.round(v); });  // 取整显示
  var useValsInt = useVals.map(function (v) { return Math.round(v); });
  /* ---- 最近动态（最新 8 条，已撤回的旧账不再展示） ---- */
  var activeRecs = [];                                            // 有效记录集合
  for (var ar = 0; ar < records.length; ar++) {                   // 过滤掉已撤回的
    if (!records[ar].revoked) activeRecs.push(records[ar]);
  }
  var sorted = activeRecs.sort(function (a, b) { return b.time - a.time; });  // 按时间倒序
  var recent = sorted.slice(0, 8);                             // 取前 8
  var recentHtml = '';                                         // 动态 HTML
  for (var q = 0; q < recent.length; q++) {                    // 逐条渲染
    var rc = recent[q];                                        // 当前记录
    var tp = RECORD_TYPES[rc.type] || { label: rc.type, badge: 'badge-gray' };  // 类型信息
    recentHtml += '<div class="act-item">' +
      '<span class="badge ' + tp.badge + '" style="flex:none">' + tp.label + '</span>' +
      '<span style="flex:1;cursor:pointer" onclick="gotoMaterial(\'' + rc.materialId + '\')">' + escapeHtml(rc.materialName) + ' <b>×' + rc.qty + '</b></span>' +
      '<span style="flex:none;font-size:12px;color:var(--text-sub)">' + escapeHtml(rc.operator) + ' · ' + fmtDateShort(rc.time) + '</span>' +
      '</div>';
  }
  if (recent.length === 0) recentHtml = '<div class="empty">还没有出入库记录，去"出入库登记"记一笔吧</div>';  // 空状态
  /* ---- 预警前 5 ---- */
  var alertHtml = '';                                          // 预警列表 HTML
  var alertTop = alerts.slice(0, 5);                           // 前 5 条
  for (var a = 0; a < alertTop.length; a++) {                   // 逐条渲染
    var al = alertTop[a];                                      // 当前预警
    alertHtml += '<div class="act-item">' +
      '<span class="badge ' + (al.level === 'danger' ? 'badge-red' : 'badge-yellow') + '">' + (al.level === 'danger' ? '告急' : '偏低') + '</span>' +
      '<span style="flex:1;cursor:pointer" onclick="gotoMaterial(\'' + al.m.id + '\')">' + escapeHtml(al.m.name) + '</span>' +
      '<span style="flex:none;font-size:12px;color:var(--text-sub)">剩 ' + al.m.stock + ' / 警戒 ' + al.m.minStock + '</span>' +
      '</div>';
  }
  if (alertTop.length === 0) alertHtml = '<div class="empty">库存都很充足，棒棒的</div>';  // 空状态

  /* ---- 输出页面 ---- */
  $('#page').innerHTML = '' +
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
      '<div class="card"><div class="card-title">入库支出趋势（近 6 个月 / 元）</div>' + lineChart(labels, buyValsInt) + '</div>' +
      '<div class="card"><div class="card-title">出库成本趋势（近 6 个月 / 元）</div>' + lineChart(labels, useValsInt) + '</div>' +
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
var MatState = { q: '', cat: '', sub: '', tag: '', sort: 'code', page: 1, pageSize: 15 };

async function pageMaterials() {
  var admin = isAdminNow();                                     // 管理员视角才显示"单价"列（涉钱信息）
  /* 按筛选条件搜索 */
  var list = Search.query(MatState.q);                          // 先按关键词模糊搜索
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
    if (s === 'stockAsc') return (a.stock || 0) - (b.stock || 0);                   // 库存升序
    if (s === 'stockDesc') return (b.stock || 0) - (a.stock || 0);                 // 库存降序
    if (s === 'priceDesc') return (b.price || 0) - (a.price || 0);                 // 单价降序
    if (s === 'timeDesc') return (b.updatedAt || 0) - (a.updatedAt || 0);          // 最近更新
    return (a.code || '').localeCompare(b.code || '');                              // 默认按编号
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
      '<td style="white-space:nowrap;color:var(--text-sub)">' + escapeHtml(m.code || '') + '</td>' +
      '<td><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + '</div></td>' +
      '<td style="white-space:nowrap">' + escapeHtml(m.cat || '') + '<div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.sub || '') + '</div></td>' +
      '<td>' + tagsHtml + '</td>' +
      '<td>' + stockBadge + '</td>' +
      (admin ? '<td class="num">' + fmtMoney(m.price) + '</td>' : '') +  // 单价涉钱：成员不显示这一格
      '<td style="white-space:nowrap;font-size:12.5px">' + escapeHtml(m.loc || '') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-outline" onclick="openStockIOModal(\'' + m.id + '\',\'in\')" title="入库">入</button> ' +
        '<button class="btn btn-sm btn-outline" onclick="openStockIOModal(\'' + m.id + '\',\'out\')" title="出库">出</button> ' +
        (Auth.can('manage') ? '<button class="btn btn-sm btn-outline" onclick="openMaterialForm(\'' + m.id + '\')" title="编辑">' + ICONS.edit + '</button> ' : '') +
      '</td>' +
      '</tr>';
  }
  if (pageItems.length === 0) {                                  // 没数据
    rows = '<tr><td colspan="' + (admin ? 8 : 7) + '"><div class="empty"><div class="e-ico">📦</div>没有找到物料<br><span style="font-size:12px">试试换个关键词，或点击"新增物料"</span></div></td></tr>';  // 成员少了单价列，跨列数跟着变
  }

  /* 母分类下拉选项 */
  var catOpts = '<option value="">全部分类</option>';            // 默认项
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
  var tagChips = '';                                              // 标签栏 HTML
  for (var key in tagSet) {                                       // 遍历去重结果
    var on = MatState.tag === key ? ' style="outline:2px solid var(--primary)"' : '';  // 选中态
    tagChips += '<span class="tag-chip" ' + on + 'onclick="filterByTag(\'' + escapeHtml(key) + '\')">' + escapeHtml(key) + '</span> ';  // 可点筛选
  }

  /* 面包屑 */
  var crumb = '<div class="breadcrumb"><a onclick="gotoPage(\'materials\')">物料库</a>';  // 首页
  if (MatState.cat) crumb += ' › <a onclick="filterByCat(\'' + escapeHtml(MatState.cat) + '\')">' + escapeHtml(MatState.cat) + '</a>';  // 母分类
  if (MatState.sub) crumb += ' › <span class="cur">' + escapeHtml(MatState.sub) + '</span>';  // 子分类（当前）
  crumb += '</div>';

  /* 输出页面 */
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">物料库</div><div class="page-desc">支持中文 / 拼音 / 型号 / 丝印 / 别称 / 用途描述模糊搜索</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-outline" onclick="openPhotoRecog()">' + ICONS.camera + '拍照识别</button>' +  // 拍照识别：AI 看图自动填登记表
        '<button class="btn btn-outline" onclick="exportMaterialsCSV()">' + ICONS.database + '导出 Excel</button>' +
        (Auth.can('manage') ? '<button class="btn btn-primary" onclick="openMaterialForm(\'\')">' + ICONS.plus + '新增物料</button>' : '') +
      '</div>' +
    '</div>' +
    crumb +
    '<div class="card">' +
      /* 搜索与筛选工具栏 */
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        '<div style="flex:1;min-width:220px;position:relative">' +
          '<input class="input" id="mat-q" placeholder="搜索：名称 / dianzu / HC-SR04 / 丝印 / 用途…" value="' + escapeHtml(MatState.q) + '" oninput="onMatSearch(this.value)" />' +
        '</div>' +
        '<select class="select" style="width:150px" id="mat-cat" onchange="filterByCat(this.value)">' + catOpts + '</select>' +
        '<select class="select" style="width:140px" id="mat-sub" onchange="filterBySub(this.value)">' + subOpts + '</select>' +
        '<select class="select" style="width:140px" onchange="MatState.sort=this.value;MatState.page=1;pageMaterials()">' +
          '<option value="code"' + (MatState.sort === 'code' ? ' selected' : '') + '>按编号排序</option>' +
          '<option value="name"' + (MatState.sort === 'name' ? ' selected' : '') + '>按名称排序</option>' +
          '<option value="stockAsc"' + (MatState.sort === 'stockAsc' ? ' selected' : '') + '>库存从少到多</option>' +
          '<option value="stockDesc"' + (MatState.sort === 'stockDesc' ? ' selected' : '') + '>库存从多到少</option>' +
          (admin ? '<option value="priceDesc"' + (MatState.sort === 'priceDesc' ? ' selected' : '') + '>单价从高到低</option>' : '') +  // 单价排序涉钱：成员不给这个选项
          '<option value="timeDesc"' + (MatState.sort === 'timeDesc' ? ' selected' : '') + '>最近更新</option>' +
        '</select>' +
      '</div>' +
      /* 标签栏 */
      (tagChips ? '<div style="margin-bottom:12px"><span style="font-size:12px;color:var(--text-sub);margin-right:8px">按标签筛选：</span>' + tagChips + '</div>' : '') +
      /* 表格 */
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>编号</th><th>名称 / 型号</th><th>类别</th><th>标签</th><th>库存</th>' + (admin ? '<th>单价</th>' : '') + '<th>位置</th><th>操作</th></tr></thead>' +  // 单价列仅管理员可见
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
  if (m) mfPhotos = (m.photos || []).slice();                      // 编辑时把已有照片装进暂存区
  else mfPhotos = [];                                              // 新增时清空
  /* 单位下拉选项 */
  var unitOpts = '';
  var selUnit = m ? (m.unit || '个') : '个';                        // 默认"个"
  for (var u = 0; u < UNIT_OPTIONS.length; u++) {
    unitOpts += '<option value="' + escapeHtml(UNIT_OPTIONS[u]) + '"' + (selUnit === UNIT_OPTIONS[u] ? ' selected' : '') + '>' + escapeHtml(UNIT_OPTIONS[u]) + '</option>';
  }
  unitOpts += '<option value="自定义"' + (UNIT_OPTIONS.indexOf(selUnit) < 0 && selUnit ? ' selected' : '') + '>自定义…</option>';  // 自定义单位选项

  openModal(m ? '编辑物料：' + escapeHtml(m.name) : '新增物料', '' +
    '<form id="mat-form" onsubmit="saveMaterialForm(event, \'' + (id || '') + '\')">' +
      '<div class="form-row">' +
        '<div class="form-item"><label>名称 <span class="req">*</span></label><input class="input" name="name" required maxlength="60" value="' + escapeHtml(m ? m.name : '') + '" placeholder="如：超声波测距模块" /></div>' +
        '<div class="form-item"><label>型号 / 规格</label><input class="input" name="model" maxlength="60" value="' + escapeHtml(m ? (m.model || '') : '') + '" placeholder="如：HC-SR04" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>母分类 <span class="req">*</span></label><select class="select" name="cat" id="mf-cat" required onchange="mfCatChanged()">' + catOpts + '</select>' +
          '<input class="input" name="cat2" id="mf-cat2" maxlength="20" placeholder="输入自定义分类名，如：传感器模块" style="display:none;margin-top:8px" /></div>' +
        '<div class="form-item"><label>子分类</label><select class="select" name="sub" id="mf-sub" onchange="mfSubCustom()"><option value="">-- 可不选 --</option></select>' +
          '<input class="input" name="sub2" id="mf-sub2" maxlength="20" placeholder="输入自定义子类名" style="display:none;margin-top:8px" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>单位</label><select class="select" name="unit" id="mf-unit" onchange="mfUnitCustom()">' + unitOpts + '</select><input class="input" name="unit2" id="mf-unit2" placeholder="自定义单位" style="display:none;margin-top:8px" /></div>' +
        '<div class="form-item"><label>单价（元）</label><input class="input" name="price" type="number" step="0.01" min="0" value="' + (m ? (m.price || 0) : 0) + '" placeholder="0.00" /></div>' +
      '</div>' +
      (m ? '' : '<div class="form-item"><label>初始库存（以后只能通过出入库修改库存）</label><input class="input" name="stock" type="number" min="0" step="1" value="0" /></div>') +  // 新增才允许直接填库存
      '<div class="form-row">' +
        /* 预警线只有管理员能改：管理员显示输入框（新增默认 5，之后系统还会按用量自动微调）；普通成员只读提示 */
        (isAdminNow() ?
          '<div class="form-item"><label>库存预警线（低于此数标红提醒）</label><input class="input" name="minStock" type="number" min="0" step="1" value="' + (m ? (m.minStock || 0) : 5) + '" /><div class="form-hint">新增默认 5，之后系统会按实际用量自动微调</div></div>' :
          '<div class="form-item"><label>库存预警线</label><div class="form-hint" style="margin-top:6px">' + (m ? ('当前 ' + (m.minStock || 0) + '，') : '新增默认 5，') + '仅管理员可修改</div></div>') +
        '<div class="form-item"><label>存放位置</label><input class="input" name="loc" maxlength="40" value="' + escapeHtml(m ? (m.loc || '') : '') + '" placeholder="如：A架-2层-03盒" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>丝印（元件上印的字）</label><input class="input" name="silk" maxlength="60" value="' + escapeHtml(m ? (m.silk || '') : '') + '" placeholder="如：HC-SR04 / 102" /></div>' +
        '<div class="form-item"><label>别称（搜索用，分号分隔）</label><input class="input" name="alias" maxlength="200" value="' + escapeHtml(m ? (m.alias || '') : '') + '" placeholder="如：超声波;超声;ultrasonic" /></div>' +
      '</div>' +
      '<div class="form-item"><label>标签（逗号分隔）</label><input class="input" name="tags" maxlength="120" value="' + escapeHtml(m ? ((m.tags || []).join(',')) : '') + '" placeholder="如：常用,小车必备,比赛" /></div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>参考购买链接</label><input class="input" name="link" maxlength="300" value="' + escapeHtml(m ? (m.link || '') : '') + '" placeholder="https://... （可粘贴淘宝/立创商城链接）" /></div>' +
        '<div class="form-item"><label>供应商</label><input class="input" name="supplier" maxlength="60" value="' + escapeHtml(m ? (m.supplier || '') : '') + '" placeholder="如：立创商城 / 淘宝xx店" /></div>' +
      '</div>' +
      '<div class="form-item"><label>实物照片（最多 3 张，拍了方便大家认物，也能给 AI 识别当参考）</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<div id="mf-photos" style="display:flex;gap:8px;flex-wrap:wrap"></div>' +
          '<label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0">' + ICONS.camera + ' 拍照 / 选图' +
            '<input type="file" accept="image/*" multiple style="display:none" onchange="mfPhotoAdd(this)" /></label>' +
        '</div>' +
        '<div class="form-hint">手机上会直接调起相机；照片会自动压缩存储，不占空间</div>' +
      '</div>' +
      '<div class="form-item"><label>用途描述（会被搜索到，也方便 AI 理解）</label><textarea class="textarea" name="desc" maxlength="500" placeholder="这个元件是干什么用的、用在什么项目上…">' + escapeHtml(m ? (m.desc || '') : '') + '</textarea></div>' +
      '<div class="form-hint">带 <span class="req">*</span> 为必填；别称和描述填得越全，模糊搜索越容易找到（支持拼音搜索）</div>' +
    '</form>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="$(\'#mat-form\').requestSubmit()">' + (m ? '保存修改' : '创建物料') + '</button>');

  /* 表单打开后：填充子分类下拉（编辑时要回显） */
  mfCatChanged();                                                   // 触发一次子分类联动
  if (m && m.sub) $('#mf-sub').value = m.sub;                       // 编辑时回显子分类
  renderMfPhotos();                                                 // 渲染已有照片缩略图
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

/* ==================== 4.5 物料照片上传（暂存区） ==================== */

var mfPhotos = [];                                                   // 表单里待保存的照片（dataURL 数组，保存时写进物料）

/* 往表单里加照片：自动压缩后放进暂存区 */
async function mfPhotoAdd(input) {
  var files = input.files;                                           // 选中的文件列表
  if (!files || files.length === 0) return;                          // 没选文件
  for (var i = 0; i < files.length; i++) {                           // 逐张处理
    if (mfPhotos.length >= 3) { toast('最多上传 3 张照片', 'warn'); break; }  // 超出上限
    try {
      var dataUrl = await compressImage(files[i], 900);              // 压缩成 900px 的 JPEG
      mfPhotos.push(dataUrl);                                        // 加入暂存区
    } catch (err) {
      toast('第 ' + (i + 1) + ' 张图片处理失败：' + err.message, 'err');  // 失败提示
    }
  }
  input.value = '';                                                  // 清空 file 控件（同一路径可重选）
  renderMfPhotos();                                                  // 刷新缩略图
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
  var unit = fd.get('unit');                                        // 下拉单位
  if (unit === '自定义') unit = fd.get('unit2') || '个';             // 用自定义输入的
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
  m.loc = String(fd.get('loc') || '').trim();                       // 位置
  m.silk = String(fd.get('silk') || '').trim();                     // 丝印
  m.alias = String(fd.get('alias') || '').trim();                   // 别称
  m.supplier = String(fd.get('supplier') || '').trim();             // 供应商
  m.link = String(fd.get('link') || '').trim();                     // 购买链接
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
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">🔍</div>物料不存在或已删除<br><br><button class="btn btn-outline" onclick="gotoPage(\'materials\')">返回物料库</button></div>';
    return;                                                           // 结束
  }
  var records = await DB.all('records');                              // 全部记录
  var mine = [];                                                      // 本物料记录
  for (var r = 0; r < records.length; r++) {                          // 遍历
    if (records[r].materialId === id) mine.push(records[r]);          // 收集本物料的
  }
  mine.sort(function (a, b) { return b.time - a.time; });              // 按时间倒序

  /* 时间线 HTML */
  var tl = '';                                                         // 输出
  for (var t = 0; t < mine.length; t++) {                              // 遍历记录
    var rec = mine[t];                                                 // 当前记录
    var tp = RECORD_TYPES[rec.type] || { label: rec.type, badge: 'badge-gray' };  // 类型信息
    tl += '<div class="tl-item tl-' + rec.type + '">' +                 // 类型决定圆点颜色
      '<div class="tl-head">' +
        '<span class="badge ' + tp.badge + '">' + tp.label + '</span>' +
        '<b>' + (rec.type === 'adjust' ? '库存调整为 ' + rec.qty : (tp.sign > 0 ? '+' : '−') + rec.qty + ' ' + escapeHtml(rec.unit || m.unit || '')) + '</b>' +
        '<span class="tl-time">' + fmtDate(rec.time) + '</span>' +
      '</div>' +
      '<div class="tl-body">' +
        '操作人：' + escapeHtml(rec.operator) +                        // 谁
        (rec.project ? ' · 项目：' + escapeHtml(rec.project) : '')      // 什么项目
        + (rec.remark ? ' · ' + escapeHtml(rec.remark) : '')           // 备注
        + ' · 库存 ' + (rec.before !== undefined ? rec.before + ' → ' + rec.after : '') +  // 库存变化
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
          '<div class="d-name">' + escapeHtml(m.name) + ' <span class="badge badge-gray">' + escapeHtml(m.code || '') + '</span></div>' +
          '<div style="margin-top:6px;color:var(--text-sub)">' +
            escapeHtml(m.model || '未填型号') + ' · ' + escapeHtml(m.cat) + (m.sub ? ' / ' + escapeHtml(m.sub) : '') +
            ' ' + (m.tags || []).map(function (t) { return '<span class="tag-chip" style="margin-left:4px">' + escapeHtml(t) + '</span>'; }).join(' ') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-success" onclick="openStockIOModal(\'' + m.id + '\',\'in\')">' + ICONS.plus + '入库</button>' +
          '<button class="btn btn-primary" onclick="openStockIOModal(\'' + m.id + '\',\'out\')">' + ICONS.out + '出库</button>' +
          (Auth.can('manage')
            ? '<button class="btn btn-outline" onclick="openMaterialForm(\'' + m.id + '\')">' + ICONS.edit + '编辑</button>' +
              '<button class="btn btn-outline" style="color:var(--danger)" onclick="deleteMaterial(\'' + m.id + '\')">' + ICONS.trash + '删除</button>'
            : '') +
          '<button class="btn btn-outline" onclick="gotoPage(\'materials\', true)">' + ICONS.close + '返回</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid-2">' +
      /* 左列：档案信息 + AI 介绍 */
      '<div>' +
      '<div class="card"><div class="card-title">档案信息</div><div class="kv-list">' +
        '<div class="kv"><span class="k">当前库存</span><span class="v">' + stockHtml + '</span></div>' +
        '<div class="kv"><span class="k">警戒线</span><span class="v">' + m.minStock + ' ' + escapeHtml(m.unit || '') + '</span></div>' +
        /* 单价涉及钱：仅管理员可见这一行 */
        (isAdminNow() ? '<div class="kv"><span class="k">单价</span><span class="v">' + fmtMoney(m.price) + '</span></div>' : '') +
        '<div class="kv"><span class="k">存放位置</span><span class="v"><b style="color:var(--primary)">' + escapeHtml(m.loc || '未填') + '</b></span></div>' +
        '<div class="kv"><span class="k">单位</span><span class="v">' + escapeHtml(m.unit || '-') + '</span></div>' +
        '<div class="kv"><span class="k">丝印</span><span class="v">' + escapeHtml(m.silk || '-') + '</span></div>' +
        '<div class="kv"><span class="k">别称</span><span class="v">' + escapeHtml(m.alias || '-') + '</span></div>' +
        '<div class="kv"><span class="k">供应商</span><span class="v">' + escapeHtml(m.supplier || '-') + '</span></div>' +
        '<div class="kv"><span class="k">购买链接</span><span class="v">' + (m.link ? '<a href="' + escapeHtml(m.link) + '" target="_blank" rel="noopener">' + ICONS.link + ' 打开链接</a>' : '未填') + '</span></div>' +
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
        '<div id="ai-intro" style="font-size:13.5px;line-height:1.8">' + (m.desc ? escapeHtml(m.desc) : '<span style="color:var(--text-sub)">点击"AI 生成介绍"自动写用途说明（需在设置中配置 AI；未配置时会提示）</span>') + '</div>' +
      '</div>' +
      '</div>' +
      /* 右列：时间线 */
      '<div class="card"><div class="card-title">历史追溯 · 全链路记录（共 ' + mine.length + ' 条）</div><div class="timeline">' + tl + '</div></div>' +
    '</div>';
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
  m.updatedAt = Date.now();                                             // 更新时间
  delete m._search;                                                     // 清索引
  await DB.put('materials', m);                                        // 写库
  await Log.add('删除物料', m.name + '（移入回收站）');                  // 日志
  await State.refreshMaterials();                                       // 刷新
  toast('已移入回收站', 'ok');                                           // 提示
  gotoPage('materials', true);                                          // 回列表
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
      '<span class="badge badge-gray">' + escapeHtml(m.loc || '') + '</span>' +
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
    '<div style="flex:1"><b>' + escapeHtml(ioPicked.name) + '</b><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(ioPicked.model || '') + ' · 当前库存 <b>' + ioPicked.stock + '</b> ' + escapeHtml(ioPicked.unit || '') + ' · ' + escapeHtml(ioPicked.loc || '位置未填') + '</div></div>' +
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
  await State.refreshMaterials();                                                      // 刷新缓存
  toast(tp.label + '成功：' + m.name + ' 库存 ' + before + ' → ' + after, 'ok');         // 提示
  if (tp.sign === -1) autoTuneMinStock(materialId);                                     // 出库后：按用量自动微调警戒线（内部有 7 天节流，静默执行）
  return true;                                                                          // 成功
}

/* ==================== 8. 快捷出入库弹窗 ==================== */
/* 列表/详情页的"入 / 出"按钮打开的小弹窗 */

var quickPicked = null;                                                                  // 弹窗中选中的物料

function openStockIOModal(materialId, defaultType) {
  var m = null;                                                                          // 目标
  for (var i = 0; i < State.materials.length; i++) {                                    // 查找
    if (State.materials[i].id === materialId) { m = State.materials[i]; break; }         // 命中
  }
  if (!m) { toast('物料不存在', 'err'); return; }                                         // 没有
  quickPicked = m;                                                                       // 记住
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
      (isAdminNow() ? '<div class="form-item"><label>单价（元）</label><input class="input" id="q-price" type="number" min="0" step="0.01" value="' + (m.price || 0) + '" /></div>' : '<input type="hidden" id="q-price" value="" />') +
    '</div>' +
    '<div class="form-item"><label>关联项目</label><input class="input" id="q-project" placeholder="选填：报账统计用" /></div>' +
    '<div class="form-item"><label>备注</label><input class="input" id="q-remark" maxlength="100" placeholder="选填" /></div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="submitQuickIO()">确认登记</button>');
}

/* 弹窗内切换类型 */
function qTypePick(el) {
  var chips = $('#q-types').children;                                                     // 全部胶囊
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');                // 取消所有
  el.classList.add('on');                                                                 // 选中
  var t = el.getAttribute('data-t');                                                       // 类型
  $('#q-qty-label').textContent = (t === 'adjust') ? '调整后的库存' : '数量';               // 标签
  $('#q-qty').min = (t === 'adjust') ? 0 : 1;                                              // 调整允许 0
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
  if (ok) {                                                                                  // 成功
    closeModal();                                                                             // 关弹窗
    refreshCurrentPage();                                                                     // 刷新当前页（列表/详情/仪表盘都支持）
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
      (isAdminNow() ? '<td class="num">' + fmtMoney(m.price) + '</td>' : '') +
      '<td style="white-space:nowrap;font-size:12.5px">' + escapeHtml(m.loc || '') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-success" onclick="openStockIOModal(\'' + m.id + '\',\'in\')">补货入库</button> ' +
        (isAdminNow() ? '<button class="btn btn-sm btn-outline" onclick="openEditMinModal(\'' + m.id + '\')">调警戒线</button>' : '') +
      '</td>' +
      '</tr>';
  }
  if (alerts.length === 0) rows = '<tr><td colspan="' + (isAdminNow() ? 8 : 7) + '"><div class="empty"><div class="e-ico">✅</div>所有库存都在安全线以上</div></td></tr>';  // 空状态（成员少一列"参考单价"）

  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">库存预警</div><div class="page-desc">低于警戒线自动标红，方便及时补货</div></div>' +
      '<div style="display:flex;gap:8px">' +
        /* 补货清单带单价与预估金额，涉及钱：仅管理员显示该按钮 */
        (isAdminNow() ? '<button class="btn btn-outline" onclick="copyRestockList()">📋 复制补货清单</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(220,38,38,.1);color:var(--danger)">' + ICONS.alert + '</div><div><div class="s-val">' + dangerCount + '</div><div class="s-label">库存告急（≤警戒线）</div></div></div>' +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(245,158,11,.12);color:var(--warning)">' + ICONS.bell + '</div><div><div class="s-val">' + (alerts.length - dangerCount) + '</div><div class="s-label">库存偏低（≤1.5倍警戒线）</div></div></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>物料</th><th>类别</th><th>状态</th><th>当前库存</th><th>警戒线</th>' + (isAdminNow() ? '<th>参考单价</th>' : '') + '<th>位置</th><th>操作</th></tr></thead>' +
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
      if (rc.revoked) continue;                                                                        // 已撤回的不算
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

/* 复制补货清单到剪贴板（发给采购的同学很方便） */
async function copyRestockList() {
  var alerts = State.alertList();                                                                      // 预警清单
  if (alerts.length === 0) { toast('库存都充足，无需补货', 'ok'); return; }                                // 空清单
  var text = '【智能控制协会·补货清单】\n生成时间：' + fmtDate(Date.now()) + '\n';                        // 文本头
  var total = 0;                                                                                        // 预估总额
  for (var i = 0; i < alerts.length; i++) {                                                              // 逐条
    var m = alerts[i].m;                                                                                   // 物料
    var suggest = Math.max(m.minStock * 2 - m.stock, 1);                                                    // 建议补货量（补到警戒线两倍）
    var cost = suggest * (m.price || 0);                                                                     // 单行预估
    total += cost;                                                                                           // 累计
    text += (i + 1) + '. ' + m.name + (m.model ? '（' + m.model + '）' : '') + '  现有' + m.stock + ' 建议补 ' + suggest + ' ' + (m.unit || '') + '  约' + fmtMoney(cost) + '\n';  // 行文本
  }
  text += '预估总额：' + fmtMoney(total);                                                                     // 合计
  try {                                                                                                       // 复制到剪贴板
    await navigator.clipboard.writeText(text);                                                                 // 新版 API
    toast('补货清单已复制，可直接粘贴到群里', 'ok');                                                              // 成功
  } catch (err) {                                                                                              // 旧浏览器
    openModal('补货清单（手动复制）', '<textarea class="textarea" style="min-height:260px">' + escapeHtml(text) + '</textarea>');  // 弹窗展示
  }
}
