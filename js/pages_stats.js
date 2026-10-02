/* ============================================================
   pages_stats.js —— 统计报表 / 历史追溯 / 数据管理
   ------------------------------------------------------------
   内容：
   1. pageStats()      统计报表（消耗排行 / 经费统计 / 库存结构）
   2. pageHistory()    历史追溯（全链路记录查询与导出）
   3. pageData()       数据管理（Excel 导入导出 / 备份恢复 / 示例数据 / 回收站 / 日志）
   ============================================================ */

/* ==================== 1. 统计报表 ==================== */

/* 统计页状态：当前页签 / 时间范围（天数，'custom'=自定义区间） / 自定义起止日期 / 经费口径与维度 */
var StatsState = { tab: 'rank', range: 90, rangeFrom: '', rangeTo: '', costKind: 'buy', costDim: 'time', costGran: 'auto', usType: 'all', usField: 'count', usDir: 'desc' };

/* 计算时间范围的起止时间戳：range 为天数（0=全部），'custom' 时用 rangeFrom/rangeTo（yyyy-mm-dd 文本）
   返回 { from: 起始时间戳, to: 结束时间戳 }，所有统计页共用这一套口径 */
function statsRange(state) {
  if (state.range === 'custom') {                                              // 自定义日期区间
    var from = state.rangeFrom ? new Date(state.rangeFrom + 'T00:00:00').getTime() : 0;       // 开始日 0 点
    var to = state.rangeTo ? new Date(state.rangeTo + 'T23:59:59').getTime() : Date.now();    // 结束日当天结束
    return { from: from, to: to };
  }
  var days = state.range || 0;                                                  // 天数（0 = 全部）
  return { from: days ? Date.now() - days * 86400000 : 0, to: Date.now() };     // 近 N 天 → 现在
}

/* 生成"时间范围"筛选条 HTML（stateName 为 'StatsState' 或 'HistState'，reload 为刷新语句）
   选择"自定义区间"后会显示两个日期选择框，可精确到指定日期范围 */
function statsRangeBar(stateName, reload, showLabel) {
  var st = window[stateName];                                                   // 取状态对象
  var ranges = [                                                                // 时间范围选项
    { v: 1,   l: '近 1 日' },
    { v: 7,   l: '近 7 天' },
    { v: 30,  l: '近 30 天' },
    { v: 90,  l: '近 90 天' },
    { v: 180, l: '近半年' },
    { v: 365, l: '近 1 年' },
    { v: 'custom', l: '自定义区间' },
    { v: 0,   l: '全部时间' }
  ];
  var opts = '';                                                                 // 选项 HTML
  for (var i = 0; i < ranges.length; i++) {                                      // 遍历生成选项
    opts += '<option value="' + ranges[i].v + '"' + (String(st.range) === String(ranges[i].v) ? ' selected' : '') + '>' + ranges[i].l + '</option>';
  }
  /* 下拉框：选自定义时 range 存 'custom'，否则存天数数字 */
  var html = (showLabel === false ? '' : '<span style="font-size:13px">时间范围：</span>') +
    '<select class="select" style="width:130px" onchange="' + stateName + '.range=this.value===\'custom\'?\'custom\':parseInt(this.value);' + reload + '()">' + opts + '</select>';
  if (st.range === 'custom') {                                                    // 自定义区间：显示起止日期框
    html +=
      '<input type="date" class="input" style="width:150px" value="' + (st.rangeFrom || '') + '" onchange="' + stateName + '.rangeFrom=this.value;' + reload + '()" />' +
      '<span style="font-size:13px;color:var(--text-sub)">至</span>' +
      '<input type="date" class="input" style="width:150px" value="' + (st.rangeTo || '') + '" onchange="' + stateName + '.rangeTo=this.value;' + reload + '()" />';
  }
  return html;                                                                    // 返回内联元素（由调用方包外层容器）
}

async function pageStats() {
  var records = await State.loadRecords();                       // 全部记录
  /* 页签标题：经费统计整个页签都涉及钱，仅管理员可见 */
  var tabs = [
    { id: 'rank',  label: '消耗排行' }
  ];
  if (isAdminNow()) {                                              // 仅管理员追加涉钱/成员页签
    tabs.push({ id: 'cost', label: '经费统计' });
    tabs.push({ id: 'users', label: '成员统计' });
  }
  tabs.push({ id: 'struct', label: '库存结构' });                   // 库存结构所有人可见
  var tabsHtml = '';                                              // 页签 HTML
  for (var i = 0; i < tabs.length; i++) {                         // 遍历
    tabsHtml += '<button class="tab' + (StatsState.tab === tabs[i].id ? ' on' : '') + '" onclick="StatsState.tab=\'' + tabs[i].id + '\';pageStats()">' + tabs[i].label + '</button>';
  }
  /* 根据页签渲染主体 */
  var body = '';                                                  // 主体内容
  if (StatsState.tab === 'rank') body = renderStatsRank(records);         // 排行
  else if (StatsState.tab === 'cost' && isAdminNow()) body = renderStatsCost(records);  // 经费（仅管理员）
  else if (StatsState.tab === 'users' && isAdminNow()) body = renderStatsUsers(records);  // 成员出入库统计（仅管理员）
  else body = renderStatsStruct();                                        // 结构（成员误选涉钱页签时兜底到这里）
  /* 排行 / 经费页签顶部放统一的"时间范围"筛选条（库存结构是当前快照，不需要时间筛选） */
  var rangeBar = StatsState.tab === 'struct' ? '' :
    '<div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + statsRangeBar('StatsState', 'pageStats') + '</div>';
  /* 输出页面 */
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">统计报表</div><div class="page-desc">哪些物料消耗快、钱花在哪里，一目了然</div></div>' +
      '<button class="btn btn-outline" onclick="exportStatsCSV()">' + ICONS.database + '导出当前报表</button>' +
    '</div>' +
    '<div class="tabs">' + tabsHtml + '</div>' +
    rangeBar +
    body;
}

/* --- 1.1 消耗排行 --- */

function renderStatsRank(records) {
  var rng = statsRange(StatsState);                                 // 时间范围起止（共用口径）
  /* 聚合：物料 -> 消耗数量 / 次数 / 折算成本 */
  var agg = {};                                                     // 聚合表
  for (var r = 0; r < records.length; r++) {                        // 遍历记录
    var rec = records[r];                                            // 当前
    if (rec.deleted) continue;                                        // 已删除（取消撤回时删掉的冲销记录）不计入
    if (rec.type === 'revoke') {                                      // 撤回冲销：把原出库的量从消耗统计里减回
      if (rec.revoked || !isOutType(rec.revokesType)) continue;       // 只处理"冲销出库"的记录
      if (rec.time < rng.from || rec.time > rng.to) continue;        // 不在所选时间范围内
      var keyR = rec.materialId || rec.materialName;                  // 聚合键（优先 id）
      if (!agg[keyR]) agg[keyR] = { mid: rec.materialId || '', name: rec.materialName, qty: 0, count: 0, cost: 0, unit: rec.unit || '' };  // 初始化
      agg[keyR].qty -= rec.qty;                                       // 冲减数量
      agg[keyR].count -= 1;                                           // 冲减次数
      agg[keyR].cost -= rec.qty * (rec.price || 0);                   // 冲减成本
      continue;
    }
    if (!isOutType(rec.type)) continue;                              // 只看出库（兼容旧类型数据）
    if (rec.revoked) continue;                                        // 已撤回的记录不计入统计
    if (rec.time < rng.from || rec.time > rng.to) continue;          // 不在所选时间范围内
    var key = rec.materialId || rec.materialName;                     // 聚合键（优先 id）
    if (!agg[key]) agg[key] = { mid: rec.materialId || '', name: rec.materialName, qty: 0, count: 0, cost: 0, unit: rec.unit || '' };  // 初始化（mid：供点物料名弹详情卡片）
    agg[key].qty += rec.qty;                                          // 累加数量
    agg[key].count += 1;                                               // 累加次数
    agg[key].cost += rec.qty * (rec.price || 0);                       // 累加成本
  }
  var arr = [];                                                       // 转数组
  for (var k in agg) arr.push(agg[k]);                                 // 装入
  arr.sort(function (a, b) { return b.qty - a.qty; });                  // 按消耗量降序
  var top = arr.slice(0, 15);                                           // 前 15 名
  /* 表格行 */
  var rows = '';                                                        // 行
  for (var t = 0; t < top.length; t++) {                                // 遍历
    var it = top[t];                                                     // 当前
    var medal = t < 3 ? ['🥇', '🥈', '🥉'][t] : (t + 1);                 // 前三名奖牌
    rows += '<tr>' +
      '<td style="text-align:center">' + medal + '</td>' +
      '<td>' + (it.mid ? '<span class="t-link" onclick="gotoMaterial(\'' + it.mid + '\')">' + escapeHtml(it.name) + '</span>' : '<b>' + escapeHtml(it.name) + '</b>') + '</td>' +
      '<td class="num">' + it.qty + ' ' + escapeHtml(it.unit) + '</td>' +
      '<td class="num">' + it.count + ' 次</td>' +
      /* 折算成本涉及钱：仅管理员可见 */
      (isAdminNow() ? '<td class="num">' + fmtMoney(it.cost) + '</td>' : '') +
      '<td style="font-size:12.5px;color:var(--text-sub)">建议常备 ≥ ' + Math.max(Math.ceil(it.qty / 3), 1) + ' ' + escapeHtml(it.unit) + '</td>' +
      '</tr>';
  }
  if (top.length === 0) rows = '<tr><td colspan="' + (isAdminNow() ? 6 : 5) + '"><div class="empty">该时间段内还没有出库记录</div></td></tr>';  // 空状态（成员少一列"折算成本"）
  /* 条形图数据 */
  var chartItems = top.slice(0, 8).map(function (x) {                    // 前 8 画图
    return { id: x.mid || '', label: x.name, value: x.qty, text: x.qty + ' ' + x.unit };   // 映射（id：条形可点弹详情）
  });
  return '' +
    '<div class="grid-2">' +
      '<div class="card cons-rank-card"><div class="card-title">消耗最快 Top15</div><div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th style="width:50px">名次</th><th>物料</th><th>消耗量</th><th>出库次数</th>' + (isAdminNow() ? '<th>折算成本</th>' : '') + '<th>囤货建议</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div></div>' +
      '<div class="card cons-rank-card"><div class="card-title">消耗量条形图（前 8）</div><div class="bar-list">' + barChart(chartItems) + '</div></div>' +
    '</div>';
}

/* --- 1.2 经费统计 --- */

/* 经费统计：根据时间范围跨度自动选择合适的粒度（短选日、中选周、长选月）
   rng 为 statsRange() 返回的 { from, to } 时间戳区间 */
function costAutoGran(rng) {
  var span = Math.max(0, rng.to - rng.from);                               // 区间总跨度（毫秒）
  if (span <= 8 * 86400000) return 'day';                                  // ≤ 8 天 → 按日
  if (span <= 100 * 86400000) return 'week';                               // ≤ 100 天 → 按周
  return 'month';                                                          // 更长 → 按月
}

/* 经费统计：把一条记录的时间戳按所选粒度归入"时间桶"
   返回 { key: 排序聚合用的键, label: 表格/图表展示用的文字 } */
function costTimeBucket(time, gran) {
  var d = new Date(time);                                                  // 时间戳转日期对象
  var y = d.getFullYear();                                                 // 年
  var m = d.getMonth() + 1;                                                // 月（从 0 数起，要 +1）
  var day = d.getDate();                                                   // 日
  if (gran === 'day') {                                                    // 按日：yyyy-mm-dd
    var kd = y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
    return { key: kd, label: kd };
  }
  if (gran === 'week') {                                                   // 按周：以周一为一周起点
    var monday = new Date(y, m - 1, day - ((d.getDay() + 6) % 7));         // 这条记录所在周的周一
    var my = monday.getFullYear();                                         // 用"周一的年份"做键，避免跨年同一周被拆开
    var mm = monday.getMonth() + 1;                                        // 周一的月
    var md = monday.getDate();                                             // 周一的日
    var kw = my + '-W' + (mm < 10 ? '0' + mm : mm) + (md < 10 ? '0' + md : md);  // 键：周一日期（天然按时间排序）
    var lb = my + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (md < 10 ? '0' + md : md) + ' 起';  // 展示：这周从哪天开始
    return { key: kw, label: lb };
  }
  return { key: monthKey(time), label: monthKey(time) };                   // 按月：复用现成的 monthKey（yyyy-mm）
}

function renderStatsCost(records) {
  /* 口径与维度说明 */
  var kindBuy = StatsState.costKind === 'buy';                             // 是否采购口径
  var rng = statsRange(StatsState);                                         // 时间范围起止（共用口径）
  var granSel = StatsState.costGran || 'auto';                              // 粒度选择（自动/日/周/月）
  var gran = granSel === 'auto' ? costAutoGran(rng) : granSel;               // 解析出的实际粒度
  /* 聚合容器 */
  var byTime = {};                                                          // 按时间 {键: {label, amount, count}}
  var byProject = {};                                                       // 按项目 {项目: {amount, count}}
  for (var r = 0; r < records.length; r++) {                               // 遍历记录
    var rec = records[r];                                                   // 当前
    if (rec.deleted) continue;                                              // 已删除（取消撤回时删掉的冲销记录）不计入
    if (rec.type === 'revoke') {                                            // 撤回冲销：金额按原记录方向减回
      if (rec.revoked) continue;                                           // 冲销记录本身被撤回（正常流程不出现）
      var negAmount = 0;                                                    // 应冲减的金额
      if (kindBuy && isInType(rec.revokesType)) negAmount = rec.qty * (rec.price || 0);   // 采购口径：冲减原入库
      if (!kindBuy && isOutType(rec.revokesType)) negAmount = rec.qty * (rec.price || 0);  // 消耗口径：冲减原出库
      if (negAmount === 0) continue;                                        // 无关记录跳过
      if (rec.time < rng.from || rec.time > rng.to) continue;               // 不在所选时间范围内
      var bkR = costTimeBucket(rec.time, gran);                             // 所在时间桶
      if (!byTime[bkR.key]) byTime[bkR.key] = { label: bkR.label, amount: 0, count: 0 };  // 初始化
      byTime[bkR.key].amount -= negAmount;                                  // 冲减金额
      byTime[bkR.key].count -= 1;                                          // 冲减笔数
      var pkR = rec.project || '（未关联项目）';                             // 项目键
      if (!byProject[pkR]) byProject[pkR] = { amount: 0, count: 0 };         // 初始化
      byProject[pkR].amount -= negAmount;                                   // 冲减
      byProject[pkR].count -= 1;
      continue;
    }
    if (rec.revoked) continue;                                              // 已撤回的记录不计入经费统计
    var amount = 0;                                                         // 本笔金额
    var isBuy = isInType(rec.type);                                        // 是否入库（采购，兼容旧类型）
    var isUse = isOutType(rec.type);                                       // 是否出库（消耗，兼容旧类型）
    if (kindBuy && isBuy) amount = rec.qty * (rec.price || 0);              // 采购口径只算入库
    if (!kindBuy && isUse) amount = rec.qty * (rec.price || 0);             // 消耗口径只算出库
    if (amount === 0) continue;                                             // 无关记录跳过
    if (rec.time < rng.from || rec.time > rng.to) continue;                 // 不在所选时间范围内
    var bk = costTimeBucket(rec.time, gran);                                 // 所在时间桶（粒度可为日/周/月）
    if (!byTime[bk.key]) byTime[bk.key] = { label: bk.label, amount: 0, count: 0 };  // 初始化
    byTime[bk.key].amount += amount;                                        // 累计金额
    byTime[bk.key].count += 1;                                              // 累计笔数
    var pk = rec.project || '（未关联项目）';                                 // 项目键（空归未关联）
    if (!byProject[pk]) byProject[pk] = { amount: 0, count: 0 };              // 初始化
    byProject[pk].amount += amount;                                            // 累计
    byProject[pk].count += 1;
  }
  /* 总金额 */
  var total = 0;                                                             // 合计
  var totalRecords = 0;                                                       // 总笔数
  for (var tk0 in byTime) { total += byTime[tk0].amount; totalRecords += byTime[tk0].count; }  // 汇总
  /* 当前维度渲染 */
  var isTimeDim = StatsState.costDim !== 'project';                           // 是否按时间维度（默认按时间）
  var granName = gran === 'day' ? '按日' : (gran === 'week' ? '按周' : '按月');  // 粒度中文名（表头用）
  var rows = '';                                                               // 表格行
  var chartHtml = '';                                                          // 图表
  if (isTimeDim) {                                                            // 按时间（粒度可选 日/周/月）
    var tKeys = [];                                                            // 时间键集合
    for (var tk in byTime) tKeys.push(tk);                                     // 收集
    tKeys.sort();                                                              // 键含日期，字符串排序即时间序
    var cum = 0;                                                               // 累计金额
    for (var i = 0; i < tKeys.length; i++) {                                   // 逐桶
      var tv = byTime[tKeys[i]];                                               // 当前桶数据
      cum += tv.amount;                                                       // 累计
      rows += '<tr><td><b>' + escapeHtml(tv.label) + '</b></td><td class="num">' + tv.count + '</td><td class="num">' + fmtMoney(tv.amount) + '</td><td class="num">' + (total ? Math.round(tv.amount / total * 100) : 0) + '%</td><td class="num">' + fmtMoney(cum) + '</td></tr>';  // 行
    }
    if (tKeys.length === 0) rows = '<tr><td colspan="5"><div class="empty">暂无数据</div></td></tr>';  // 空状态
    var labels = [], vals = [];                                                 // 折线图数据
    for (var j = 0; j < tKeys.length; j++) { labels.push(byTime[tKeys[j]].label); vals.push(Math.round(byTime[tKeys[j]].amount)); }  // 映射
    chartHtml = lineChart(labels, vals, null, null, 28, 320, true, true);     // 画折线（撑满 240 框 + 横向滑动；pad28：数字标注与底部标签都留足空间）
  } else {                                                                     // 按项目
    var pArr = [];                                                              // 项目数组
    for (var pk2 in byProject) pArr.push({ name: pk2, v: byProject[pk2] });      // 收集
    pArr.sort(function (a, b) { return b.v.amount - a.v.amount; });               // 金额降序
    for (var q = 0; q < pArr.length; q++) {                                       // 逐项目
      rows += '<tr><td><b>' + escapeHtml(pArr[q].name) + '</b></td><td class="num">' + pArr[q].v.count + '</td><td class="num">' + fmtMoney(pArr[q].v.amount) + '</td><td class="num">' + (total ? Math.round(pArr[q].v.amount / total * 100) : 0) + '%</td></tr>';  // 行
    }
    if (pArr.length === 0) rows = '<tr><td colspan="4"><div class="empty">暂无数据</div></td></tr>';  // 空状态
    chartHtml = barChart(pArr.slice(0, 10).map(function (x) { return { label: x.name, value: x.v.amount, text: fmtMoney(x.v.amount) }; }));  // 条形图
  }
  return '' +
    /* 口径与维度切换 */
    '<div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<span style="font-size:13px">统计口径：</span>' +
      '<select class="select" style="width:170px" onchange="StatsState.costKind=this.value;pageStats()">' +
        '<option value="buy"' + (kindBuy ? ' selected' : '') + '>入库花费（采购支出）</option>' +
        '<option value="use"' + (!kindBuy ? ' selected' : '') + '>出库消耗（折算成本）</option>' +
      '</select>' +
      '<span style="font-size:13px;margin-left:10px">统计维度：</span>' +
      '<select class="select" style="width:120px" onchange="StatsState.costDim=this.value;pageStats()">' +
        '<option value="time"' + (isTimeDim ? ' selected' : '') + '>按时间</option>' +
        '<option value="project"' + (!isTimeDim ? ' selected' : '') + '>按项目</option>' +
      '</select>' +
      (isTimeDim ? '<span style="font-size:13px;margin-left:10px">时间粒度：</span>' +                // 按时间维度时才显示粒度选择
      '<select class="select" style="width:130px" onchange="StatsState.costGran=this.value;pageStats()">' +
        '<option value="auto"' + (granSel === 'auto' ? ' selected' : '') + '>自动（当前' + (gran === 'day' ? '日' : gran === 'week' ? '周' : '月') + '）</option>' +
        '<option value="day"' + (granSel === 'day' ? ' selected' : '') + '>按日</option>' +
        '<option value="week"' + (granSel === 'week' ? ' selected' : '') + '>按周</option>' +
        '<option value="month"' + (granSel === 'month' ? ' selected' : '') + '>按月</option>' +
      '</select>' : '') +
    '</div>' +
    /* 汇总卡 */
    '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-ico" style="background:var(--primary-light);color:var(--primary)">' + ICONS.chart + '</div><div><div class="s-val">' + fmtMoney(total) + '</div><div class="s-label">' + (kindBuy ? '入库总花费' : '出库总成本') + '</div></div></div>' +
      '<div class="stat-card"><div class="stat-ico" style="background:rgba(2,132,199,.1);color:var(--info)">' + ICONS.history + '</div><div><div class="s-val">' + totalRecords + '</div><div class="s-label">相关记录笔数</div></div></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="card"><div class="card-title">' + (isTimeDim ? granName + '明细（可直接导出给协会报账）' : '各项目花费明细') + '</div><div class="table-wrap" style="height:240px;overflow-y:auto"><table class="tbl">' +
        (isTimeDim
          ? '<thead><tr><th>时间</th><th>笔数</th><th>金额</th><th>占比</th><th>累计</th></tr></thead>'
          : '<thead><tr><th>项目</th><th>笔数</th><th>金额</th><th>占比</th></tr></thead>') +
        '<tbody>' + rows + '</tbody>' +
      '</table></div></div>' +
      '<div class="card"><div class="card-title">' + (isTimeDim ? granName + '趋势（元）' : '项目花费排行（元）') + '</div><div style="height:240px;max-width:100%">' + chartHtml + '</div></div>' +
    '</div>';
}

/* --- 1.4 成员出入库统计（仅管理员）---
   按操作人统计"有效出入库"：已撤回的记录、冲销记录、库存调整都不算；可筛出库/入库，按次数/数量/金额升降序 */
function renderStatsUsers(records) {
  var rng = statsRange(StatsState);                                   // 时间范围起止（共用口径）
  var agg = {};                                                       // 按操作人聚合
  for (var r = 0; r < records.length; r++) {                         // 遍历
    var rec = records[r];                                              // 当前
    if (rec.deleted) continue;                                        // 已删除不计
    if (rec.revoked) continue;                                        // 已撤回的不算
    if (rec.type === 'revoke') continue;                              // 冲销记录本身不是出入库
    if (rec.time < rng.from || rec.time > rng.to) continue;           // 时间范围
    var op = rec.operator || '（未知）';                                // 操作人
    if (!agg[op]) agg[op] = { outC: 0, outQ: 0, outA: 0, inC: 0, inQ: 0, inA: 0 };  // 初始化
    var amt = rec.qty * (rec.price || 0);                             // 本笔金额
    if (isOutType(rec.type)) {                                        // 出库
      agg[op].outC++; agg[op].outQ += rec.qty; agg[op].outA += amt;
    } else if (isInType(rec.type)) {                                  // 入库
      agg[op].inC++; agg[op].inQ += rec.qty; agg[op].inA += amt;
    }
    /* adjust 等其它类型不计 */
  }
  var arr = [];                                                       // 数组化
  for (var k in agg) arr.push({ op: k, v: agg[k] });                   // 装入
  var usT = StatsState.usType;                                        // 筛选：all/out/in
  var usF = StatsState.usField;                                       // 排序字段：count/qty/amount
  function usVal(it) {                                                // 排序基准值（全部=出库+入库合计）
    if (usT === 'out') return usF === 'count' ? it.v.outC : (usF === 'qty' ? it.v.outQ : it.v.outA);
    if (usT === 'in') return usF === 'count' ? it.v.inC : (usF === 'qty' ? it.v.inQ : it.v.inA);
    return usF === 'count' ? it.v.outC + it.v.inC : (usF === 'qty' ? it.v.outQ + it.v.inQ : it.v.outA + it.v.inA);
  }
  arr.sort(function (a, b) { var d = usVal(b) - usVal(a); return StatsState.usDir === 'asc' ? -d : d; });  // 排序
  var tot = { outC: 0, outQ: 0, outA: 0, inC: 0, inQ: 0, inA: 0 };     // 合计
  for (var t = 0; t < arr.length; t++) { for (var f2 in tot) tot[f2] += arr[t].v[f2]; }  // 汇总
  /* 表头 */
  var th = '<th>操作人</th>';
  if (usT === 'out') th += '<th>出库次数</th><th>出库数量</th><th>出库金额</th>';
  else if (usT === 'in') th += '<th>入库次数</th><th>入库数量</th><th>入库金额</th>';
  else th += '<th>出库次数</th><th>出库数量</th><th>出库金额</th><th>入库次数</th><th>入库数量</th><th>入库金额</th>';
  /* 行 */
  var rows = '';                                                       // 行集合
  for (var i = 0; i < arr.length; i++) {                              // 遍历
    var it = arr[i];                                                    // 当前
    rows += '<tr><td><b>' + escapeHtml(it.op) + '</b></td>';
    if (usT === 'out') rows += '<td class="num">' + it.v.outC + '</td><td class="num">' + it.v.outQ + '</td><td class="num">' + fmtMoney(it.v.outA) + '</td>';
    else if (usT === 'in') rows += '<td class="num">' + it.v.inC + '</td><td class="num">' + it.v.inQ + '</td><td class="num">' + fmtMoney(it.v.inA) + '</td>';
    else rows += '<td class="num">' + it.v.outC + '</td><td class="num">' + it.v.outQ + '</td><td class="num">' + fmtMoney(it.v.outA) + '</td><td class="num">' + it.v.inC + '</td><td class="num">' + it.v.inQ + '</td><td class="num">' + fmtMoney(it.v.inA) + '</td>';
    rows += '</tr>';
  }
  if (arr.length === 0) rows = '<tr><td colspan="' + (usT === 'all' ? 7 : 4) + '"><div class="empty">该时间段内没有有效出入库记录</div></td></tr>';
  /* 合计行 */
  var totRow = '<tr style="background:var(--bg-soft)"><td><b>合计</b></td>';
  if (usT === 'out') totRow += '<td class="num">' + tot.outC + '</td><td class="num">' + tot.outQ + '</td><td class="num">' + fmtMoney(tot.outA) + '</td>';
  else if (usT === 'in') totRow += '<td class="num">' + tot.inC + '</td><td class="num">' + tot.inQ + '</td><td class="num">' + fmtMoney(tot.inA) + '</td>';
  else totRow += '<td class="num">' + tot.outC + '</td><td class="num">' + tot.outQ + '</td><td class="num">' + fmtMoney(tot.outA) + '</td><td class="num">' + tot.inC + '</td><td class="num">' + tot.inQ + '</td><td class="num">' + fmtMoney(tot.inA) + '</td>';
  totRow += '</tr>';
  /* 筛选排序控件 */
  var ctrl = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="font-size:13px">统计口径：</span>' +
    '<select class="select" style="width:100px" onchange="StatsState.usType=this.value;pageStats()">' +
      '<option value="all"' + (StatsState.usType === 'all' ? ' selected' : '') + '>全部</option>' +
      '<option value="out"' + (StatsState.usType === 'out' ? ' selected' : '') + '>出库</option>' +
      '<option value="in"' + (StatsState.usType === 'in' ? ' selected' : '') + '>入库</option>' +
    '</select>' +
    '<span style="font-size:13px">排序：</span>' +
    '<select class="select" style="width:90px" onchange="StatsState.usField=this.value;pageStats()">' +
      '<option value="count"' + (StatsState.usField === 'count' ? ' selected' : '') + '>次数</option>' +
      '<option value="qty"' + (StatsState.usField === 'qty' ? ' selected' : '') + '>数量</option>' +
      '<option value="amount"' + (StatsState.usField === 'amount' ? ' selected' : '') + '>金额</option>' +
    '</select>' +
    '<button class="btn btn-primary" style="padding:0 14px;height:36px;font-size:13px;font-weight:600;white-space:nowrap" onclick="StatsState.usDir=StatsState.usDir===\'asc\'?\'desc\':\'asc\';pageStats()">' + (StatsState.usDir === 'desc' ? '降序 ↓' : '升序 ↑') + '</button>' +
    '<span style="font-size:12px;color:var(--text-sub)">已撤回的记录不参与统计；"全部"按出库+入库合计排序</span>' +
  '</div>';
  return ctrl + '<div class="card"><div class="card-title">成员有效出入库统计</div><div class="table-wrap"><table class="tbl">' +
    '<thead><tr>' + th + '</tr></thead><tbody>' + rows + totRow + '</tbody></table></div>';
}

/* --- 1.3 库存结构 --- */

function renderStatsStruct() {
  var mats = State.materials;                                                 // 全部物料
  var byCat = {};                                                             // 类别聚合
  for (var i = 0; i < mats.length; i++) {                                      // 遍历
    var m = mats[i];                                                          // 当前
    var c = m.cat || '未分类';                                                  // 类别
    if (!byCat[c]) byCat[c] = { value: 0, kinds: 0, qty: 0 };                   // 初始化
    byCat[c].value += (m.price || 0) * (m.stock || 0);                          // 价值累计
    byCat[c].kinds += 1;                                                        // 种类数
    byCat[c].qty += (m.stock || 0);                                             // 数量累计
  }
  var arr = [];                                                                // 转数组
  for (var k in byCat) arr.push({ label: k, v: byCat[k] });                     // 装入
  arr.sort(function (a, b) { return b.v.value - a.v.value; });                  // 价值降序
  var rows = '';                                                                // 表格行
  for (var j = 0; j < arr.length; j++) {                                        // 遍历
    /* 库存价值涉及钱：仅管理员可见（成员只看种类与数量） */
    rows += '<tr><td><b>' + escapeHtml(arr[j].label) + '</b></td><td class="num">' + arr[j].v.kinds + ' 种</td><td class="num">' + arr[j].v.qty + '</td>' + (isAdminNow() ? '<td class="num">' + fmtMoney(arr[j].v.value) + '</td>' : '') + '</tr>';
  }
  if (arr.length === 0) rows = '<tr><td colspan="' + (isAdminNow() ? 4 : 3) + '"><div class="empty">暂无物料</div></td></tr>';  // 空状态（成员少一列"库存价值"）
  /* 环形图：管理员按库存价值占比，成员按库存数量占比（避免暴露金额）
     大图（230px）+ 悬停/点击显示成分，成分图例放图下面，填满卡片高度不留白 */
  var donut = donutChart(arr.map(function (x) { return { label: x.label, value: isAdminNow() ? x.v.value : x.v.qty }; }), { size: 230, legendBelow: true });
  return '<div class="grid-2">' +
    '<div class="card"><div class="card-title">' + (isAdminNow() ? '各类别库存价值占比' : '各类别库存数量占比') + '</div>' + donut + '</div>' +
    '<div class="card"><div class="card-title">类别明细</div><div class="table-wrap"><table class="tbl">' +
      '<thead><tr><th>母分类</th><th>物料种类</th><th>库存总数量</th>' + (isAdminNow() ? '<th>库存价值</th>' : '') + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div></div>' +
    '</div>';
}

/* 导出当前统计报表 CSV */
async function exportStatsCSV() {
  var records = await State.loadRecords();                                     // 全部记录
  var head = ['项目/月份', '笔数', '金额'];                                      // 表头
  var rows = [head];                                                            // 行集合
  if (StatsState.tab === 'users' && isAdminNow()) {                             // 成员出入库统计页签（仅管理员可导出）
    var rngU = statsRange(StatsState);                                          // 时间范围起止（与页面一致）
    var aggU = {};                                                              // 按操作人聚合
    for (var u = 0; u < records.length; u++) {                                  // 遍历
      var rcu = records[u];                                                       // 当前
      if (rcu.deleted || rcu.revoked || rcu.type === 'revoke') continue;          // 只算有效出入库
      if (rcu.time < rngU.from || rcu.time > rngU.to) continue;                   // 范围过滤
      var opU = rcu.operator || '（未知）';                                         // 操作人
      if (!aggU[opU]) aggU[opU] = { outC: 0, outQ: 0, outA: 0, inC: 0, inQ: 0, inA: 0 };  // 初始化
      var amtU = rcu.qty * (rcu.price || 0);                                       // 本笔金额
      if (isOutType(rcu.type)) { aggU[opU].outC++; aggU[opU].outQ += rcu.qty; aggU[opU].outA += amtU; }
      else if (isInType(rcu.type)) { aggU[opU].inC++; aggU[opU].inQ += rcu.qty; aggU[opU].inA += amtU; }
    }
    var arrU = [];                                                               // 数组化
    for (var kU in aggU) arrU.push({ op: kU, v: aggU[kU] });                       // 装入
    var usTU = StatsState.usType, usFU = StatsState.usField;                      // 当前筛选与排序口径
    function usValU(it) {                                                        // 排序基准值
      if (usTU === 'out') return usFU === 'count' ? it.v.outC : (usFU === 'qty' ? it.v.outQ : it.v.outA);
      if (usTU === 'in') return usFU === 'count' ? it.v.inC : (usFU === 'qty' ? it.v.inQ : it.v.inA);
      return usFU === 'count' ? it.v.outC + it.v.inC : (usFU === 'qty' ? it.v.outQ + it.v.inQ : it.v.outA + it.v.inA);
    }
    arrU.sort(function (a, b) { var d = usValU(b) - usValU(a); return StatsState.usDir === 'asc' ? -d : d; });  // 排序
    var headU = ['操作人'];                                                       // 表头
    if (usTU === 'out') headU.push('出库次数', '出库数量', '出库金额');
    else if (usTU === 'in') headU.push('入库次数', '入库数量', '入库金额');
    else headU.push('出库次数', '出库数量', '出库金额', '入库次数', '入库数量', '入库金额');
    var rowsU = [headU];                                                          // 行集合
    for (var jU = 0; jU < arrU.length; jU++) {                                    // 遍历
      var itU = arrU[jU], vU = itU.v;                                             // 当前
      if (usTU === 'out') rowsU.push([itU.op, vU.outC, vU.outQ, vU.outA.toFixed(2)]);
      else if (usTU === 'in') rowsU.push([itU.op, vU.inC, vU.inQ, vU.inA.toFixed(2)]);
      else rowsU.push([itU.op, vU.outC, vU.outQ, vU.outA.toFixed(2), vU.inC, vU.inQ, vU.inA.toFixed(2)]);
    }
    downloadFile(toCSV(rowsU), '成员出入库统计_' + fmtDateShort(Date.now()) + '.csv', 'text/csv');  // 下载
    toast('成员出入库统计已导出', 'ok');                                              // 提示
    return;                                                                           // 结束
  }
  if (StatsState.tab === 'rank') {                                              // 消耗排行页签
    head.length = 0;                                                            // 先清空表头
    if (isAdminNow()) head.push('物料', '消耗量', '出库次数', '折算成本');        // 管理员：含折算成本
    else head.push('物料', '消耗量', '出库次数');                                  // 成员：不含金额列
    rows = [head];                                                              // 重置
    var rng = statsRange(StatsState);                                            // 时间范围起止（与页面一致）
    var agg = {};                                                                // 聚合
    for (var r = 0; r < records.length; r++) {                                    // 遍历
      var rec = records[r];                                                       // 当前
      if (!isOutType(rec.type)) continue;                                          // 只出库（兼容旧类型）
      if (rec.time < rng.from || rec.time > rng.to) continue;                      // 范围过滤
      if (!agg[rec.materialName]) agg[rec.materialName] = { qty: 0, count: 0, cost: 0 };  // 初始化
      agg[rec.materialName].qty += rec.qty;                                         // 累计
      agg[rec.materialName].count += 1;
      agg[rec.materialName].cost += rec.qty * (rec.price || 0);
    }
    var arr = [];                                                                   // 数组化
    for (var k in agg) arr.push({ n: k, v: agg[k] });                                // 装入
    arr.sort(function (a, b) { return b.v.qty - a.v.qty; });                          // 降序
    for (var i = 0; i < arr.length; i++) {                                            // 输出行
      /* 成员导出不含金额列 */
      if (isAdminNow()) rows.push([arr[i].n, arr[i].v.qty, arr[i].v.count, arr[i].v.cost.toFixed(2)]);
      else rows.push([arr[i].n, arr[i].v.qty, arr[i].v.count]);
    }
    downloadFile(toCSV(rows), '消耗排行_' + fmtDateShort(Date.now()) + '.csv', 'text/csv'); // 下载
    toast('排行已导出', 'ok');                                                          // 提示
    return;                                                                             // 结束
  }
  if (StatsState.tab === 'cost' && isAdminNow()) {                                     // 经费页签（仅管理员可导出）
    var kindBuy = StatsState.costKind === 'buy';                                       // 口径
    var rng2 = statsRange(StatsState);                                                  // 时间范围起止（与页面一致）
    var group = {};                                                                     // 聚合容器
    for (var b = 0; b < records.length; b++) {                                           // 遍历
      var rec2 = records[b];                                                             // 当前
      var amount = 0;                                                                    // 金额
      if (kindBuy && isInType(rec2.type)) amount = rec2.qty * (rec2.price || 0);         // 入库花费（兼容旧类型）
      if (!kindBuy && isOutType(rec2.type)) amount = rec2.qty * (rec2.price || 0);       // 出库消耗（兼容旧类型）
      if (amount === 0) continue;                                                         // 无关
      if (rec2.time < rng2.from || rec2.time > rng2.to) continue;                         // 不在所选时间范围内
      var isTimeDim2 = StatsState.costDim !== 'project';                                  // 是否按时间维度（与页面口径一致）
      var granE = (StatsState.costGran === 'day' || StatsState.costGran === 'week' || StatsState.costGran === 'month') ? StatsState.costGran : costAutoGran(rng2);  // 导出粒度：手动选了就用，否则自动
      var key = isTimeDim2 ? costTimeBucket(rec2.time, granE).key : (rec2.project || '未关联项目');  // 维度键（时间桶键或项目名）
      if (!group[key]) group[key] = { amount: 0, count: 0 };                               // 初始化
      group[key].amount += amount;                                                         // 累计
      group[key].count += 1;
    }
    var keys = [];                                                                          // 键集合
    for (var g in group) keys.push(g);                                                      // 收集
    keys.sort();                                                                             // 排序
    for (var q = 0; q < keys.length; q++) {                                                   // 输出行
      rows.push([keys[q], group[keys[q]].count, group[keys[q]].amount.toFixed(2)]);           // 行
    }
    var name = kindBuy ? '入库花费' : '出库消耗';                                              // 文件名
    downloadFile(toCSV(rows), '经费统计_' + name + '_' + fmtDateShort(Date.now()) + '.csv', 'text/csv');  // 下载
    toast('经费报表已导出，可直接交给协会', 'ok');                                              // 提示
    return;                                                                                   // 结束
  }
  /* 库存结构页签 */
  head.length = 0;                                                              // 先清空表头
  if (isAdminNow()) head.push('母分类', '物料种类', '库存总数量', '库存价值');     // 管理员：含库存价值
  else head.push('母分类', '物料种类', '库存总数量');                              // 成员：不含金额列
  rows = [head];                                                                                // 重置
  var byCat = {};                                                                               // 聚合
  for (var m2 = 0; m2 < State.materials.length; m2++) {                                         // 遍历物料
    var mt = State.materials[m2];                                                                // 当前
    var c = mt.cat || '未分类';                                                                   // 类别
    if (!byCat[c]) byCat[c] = { value: 0, kinds: 0, qty: 0 };                                      // 初始化
    byCat[c].value += (mt.price || 0) * (mt.stock || 0);
    byCat[c].kinds += 1;
    byCat[c].qty += (mt.stock || 0);
  }
  var cArr = [];                                                                                  // 数组化
  for (var ck in byCat) cArr.push({ n: ck, v: byCat[ck] });                                        // 装入
  cArr.sort(function (a, b) { return b.v.value - a.v.value; });                                      // 降序
  for (var z = 0; z < cArr.length; z++) {                                                          // 输出
    /* 成员导出不含金额列 */
    if (isAdminNow()) rows.push([cArr[z].n, cArr[z].v.kinds, cArr[z].v.qty, cArr[z].v.value.toFixed(2)]);
    else rows.push([cArr[z].n, cArr[z].v.kinds, cArr[z].v.qty]);
  }
  downloadFile(toCSV(rows), '库存结构_' + fmtDateShort(Date.now()) + '.csv', 'text/csv');              // 下载
  toast('库存结构已导出', 'ok');                                                                       // 提示
}

/* ==================== 2. 历史追溯页 ==================== */

/* 历史筛选状态：range 含义与统计页一致（天数 / 'custom' 自定义区间） */
var HistState = { q: '', op: '', type: '', proj: '', revoked: '', range: 0, rangeFrom: '', rangeTo: '', page: 1, pageSize: 20 };

/* 清除历史追溯所有筛选条件 */
function resetHistFilter() {
  HistState.q = ''; HistState.type = ''; HistState.proj = ''; HistState.revoked = '';
  HistState.range = 0; HistState.rangeFrom = ''; HistState.rangeTo = ''; HistState.page = 1;
  pageHistory();
}

/* 跳转到某条记录并高亮：当前页面已渲染该行则就地滚动+高亮；
   否则切到历史页、重置筛选、定位到所在页再滚动+高亮（历史页跨页跳转用） */
async function gotoRecord(rid) {
  if (document.getElementById('rec-row-' + rid)) { flashRecordRow(rid); return; }   // 已渲染：就地滚动+高亮
  if (location.hash !== '#/history') location.hash = '#/history';                   // 不在历史页：先切过去
  /* 重置筛选，确保目标记录一定可见 */
  HistState.q = ''; HistState.type = ''; HistState.proj = ''; HistState.revoked = '';
  HistState.range = 0; HistState.rangeFrom = ''; HistState.rangeTo = '';
  var records = await State.loadRecords();                                          // 全部记录
  var list = [];                                                                     // 有效记录
  for (var i = 0; i < records.length; i++) { if (!records[i].deleted) list.push(records[i]); }
  list.sort(function (a, b) { return b.time - a.time; });                            // 时间倒序
  var idx = -1;                                                                      // 目标下标
  for (var k = 0; k < list.length; k++) { if (list[k].id === rid) { idx = k; break; } }
  if (idx < 0) { toast('目标记录不在历史中，可能已被删除', 'err'); return; }
  HistState.page = Math.floor(idx / HistState.pageSize) + 1;                         // 定位页码
  await pageHistory();                                                               // 重新渲染
  flashRecordRow(rid);                                                               // 高亮
}

/* 就地滚动并高亮某条记录（短暂黄色闪烁） */
function flashRecordRow(rid) {
  var el = document.getElementById('rec-row-' + rid);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('rec-flash');
  setTimeout(function () { el.classList.remove('rec-flash'); }, 2600);
}

async function pageHistory() {
  var records = await State.loadRecords();                             // 全部记录
  /* 项目下拉选项（从记录里聚合） */
  var projSet = {};                                                     // 项目集合
  for (var i = 0; i < records.length; i++) {                            // 遍历
    if (records[i].project) projSet[records[i].project] = 1;           // 收集项目
  }
  var recById = {};                                                     // 记录 id 索引（跳转原记录时显示类型+日期）
  for (var i2 = 0; i2 < records.length; i2++) { recById[records[i2].id] = records[i2]; }
  /* 应用筛选条件 */
  var rng = statsRange(HistState);                                        // 时间范围起止（共用口径）
  var list = [];                                                        // 结果
  for (var r = 0; r < records.length; r++) {                            // 遍历
    var rec = records[r];                                               // 当前
    if (rec.deleted) continue;                                          // 已删除（取消撤回时删掉的冲销记录）不显示
    if (HistState.q) {                                                   // 关键词搜索：物料名 / 操作人
      var qLower = HistState.q.toLowerCase();                            // 关键词转小写
      var hitQ = rec.materialName.toLowerCase().indexOf(qLower) >= 0     // 命中物料名
        || (rec.operator && rec.operator.toLowerCase().indexOf(qLower) >= 0);  // 或命中操作人
      if (!hitQ) continue;                                                // 都没命中则跳过
    }
    if (HistState.type && rec.type !== HistState.type) continue;        // 类型过滤
    if (HistState.proj && rec.project !== HistState.proj) continue;      // 项目过滤
    if (HistState.revoked === 'no' && rec.revoked) continue;             // 只要有效记录（排除已撤回）
    if (HistState.revoked === 'yes' && !rec.revoked) continue;           // 只看已撤回
    if (rec.time < rng.from || rec.time > rng.to) continue;              // 时间过滤（含自定义区间）
    list.push(rec);                                                       // 收集
  }
  list.sort(function (a, b) { return b.time - a.time; });                 // 时间倒序
  /* 分页 */
  var total = list.length;                                                 // 总数
  var totalPages = Math.max(Math.ceil(total / HistState.pageSize), 1);     // 页数
  if (HistState.page > totalPages) HistState.page = totalPages;             // 纠正
  var start = (HistState.page - 1) * HistState.pageSize;                    // 起点
  var pageItems = list.slice(start, start + HistState.pageSize);            // 本页
  /* 表格行 */
  var rows = '';                                                            // 行
  for (var p = 0; p < pageItems.length; p++) {                              // 遍历
    var rc = pageItems[p];                                                    // 当前
    var tp = RECORD_TYPES[rc.type] || { label: rc.type, badge: 'badge-gray' };  // 类型
    /* 已撤回的记录整行变淡，类型旁加"已撤回"标记（记录保留可追溯，但不计入任何统计） */
    rows += '<tr id="rec-row-' + rc.id + '"' + (rc.revoked ? ' style="opacity:.55"' : '') + '>' +
      '<td style="white-space:nowrap">' + fmtDate(rc.time) + '</td>' +
      '<td><span class="t-link" onclick="gotoMaterial(\'' + rc.materialId + '\')">' + escapeHtml(rc.materialName) + '</span></td>' +
      '<td><span class="badge ' + tp.badge + '">' + tp.label + '</span>' + (rc.revoked && rc.revokedByRecord
        ? ' <span class="badge badge-jump" style="color:var(--danger);background:rgba(220,38,38,.1)" title="点击跳转冲销记录" onclick="gotoRecord(\'' + rc.revokedByRecord + '\')">已撤回 ↗</span>'
        : (rc.revoked ? ' <span class="badge badge-gray" title="由 ' + escapeHtml(rc.revokedBy || '未知') + ' 撤回">已撤回</span>' : '')) + '</td>' +
      '<td class="num">' + (rc.type === 'revoke' ? (isInType(rc.revokesType) ? '−' : isOutType(rc.revokesType) ? '+' : '→') : (tp.sign === 1 ? '+' : tp.sign === -1 ? '−' : '→')) + rc.qty + ' ' + escapeHtml(rc.unit || '') + '</td>' +
      /* 金额涉及钱：仅管理员可见 */
      (isAdminNow() ? '<td class="num">' + (rc.qty * (rc.price || 0) > 0 ? fmtMoney(rc.qty * rc.price) : '-') + '</td>' : '') +
      '<td style="white-space:nowrap">' + escapeHtml(rc.operator) + '</td>' +
      '<td style="font-size:12.5px">' + escapeHtml(rc.project || '-') + '</td>' +
      '<td style="font-size:12.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(rc.remark || '') + '">' + (rc.type === 'revoke'
        ? '<span class="badge badge-jump" style="color:' + (isInType(rc.revokesType) ? 'var(--success)' : isOutType(rc.revokesType) ? 'var(--info)' : 'var(--text-sub)') + ';background:' + (isInType(rc.revokesType) ? 'rgba(22,163,74,.12)' : isOutType(rc.revokesType) ? 'rgba(2,132,199,.12)' : 'var(--bg-hover)') + '" title="点击跳转原记录" onclick="gotoRecord(\'' + rc.revokesId + '\')">' + (RECORD_TYPES[rc.revokesType] || { label: rc.revokesType }).label + (recById[rc.revokesId] ? '（' + fmtDateShort(recById[rc.revokesId].time) + '）' : '') + ' ↙</span>'
        : escapeHtml(rc.remark || '-')) + '</td>' +
      '<td class="num" style="font-size:12.5px">' + (rc.before !== undefined ? rc.before + '→' + rc.after : '-') + '</td>' +
      /* 撤回/取消撤回：仅管理员可见；取消撤回按钮颜色跟随原记录类型（入库绿 / 出库蓝 / 调整灰） */
      '<td style="white-space:nowrap">' + (rc.revoked
        ? (canOperateRecord(rc) ? '<button class="btn btn-sm" style="background:' + (isInType(rc.type) ? 'var(--success)' : isOutType(rc.type) ? 'var(--info)' : 'var(--text-sub)') + ';color:#fff" onclick="cancelRevokeRecord(\'' + rc.id + '\')">取消撤回</button>' : '')
        : (rc.type === 'revoke' ? '<span style="font-size:12px;color:var(--text-sub)">冲销记录</span>' : (canOperateRecord(rc) ? '<button class="btn btn-sm btn-danger" onclick="revokeRecord(\'' + rc.id + '\')">撤回</button>' : ''))) + '</td>' +
      '</tr>';
  }
  if (pageItems.length === 0) rows = '<tr><td colspan="' + (isAdminNow() ? 10 : 9) + '"><div class="empty">没有符合条件的记录</div></td></tr>';  // 空状态（管理员多"金额"一列；操作列所有人可见）
  /* 下拉选项生成 */
  var projOpts = '<option value="">全部项目</option>';                        // 项目
  for (var pj in projSet) projOpts += '<option value="' + escapeHtml(pj) + '"' + (HistState.proj === pj ? ' selected' : '') + '>' + escapeHtml(pj) + '</option>';
  var typeOpts = '<option value="">全部类型</option>';                         // 类型
  for (var ty in RECORD_TYPES) typeOpts += '<option value="' + ty + '"' + (HistState.type === ty ? ' selected' : '') + '>' + RECORD_TYPES[ty].label + '</option>';
  /* 时间范围筛选条：与统计页共用（近1日/近7天/.../自定义区间/全部） */
  var rangeBar = statsRangeBar('HistState', 'HistState.page=1;pageHistory', false); // 时间范围下拉（不带文字标签）
  /* 输出页面 */
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">历史追溯</div><div class="page-desc">每颗芯片谁领过、什么时候买的，全链路可查</div></div>' +
      '<button class="btn btn-outline" onclick="exportHistoryCSV()">' + ICONS.database + '导出查询结果</button>' +
    '</div>' +
    '<div class="card">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        '<input class="input" style="flex:1;min-width:180px" placeholder="按物料名 / 操作人搜索…" value="' + escapeHtml(HistState.q) + '" onchange="HistState.q=this.value;HistState.page=1;pageHistory()" />' +
        rangeBar +
        '<select class="select" style="width:120px" onchange="HistState.type=this.value;HistState.page=1;pageHistory()">' + typeOpts + '</select>' +
        '<select class="select" style="width:150px" onchange="HistState.proj=this.value;HistState.page=1;pageHistory()">' + projOpts + '</select>' +
        '<select class="select" style="width:120px" onchange="HistState.revoked=this.value;HistState.page=1;pageHistory()">' +
          '<option value="">全部状态</option>' +
          '<option value="no"' + (HistState.revoked === 'no' ? ' selected' : '') + '>仅有效记录</option>' +
          '<option value="yes"' + (HistState.revoked === 'yes' ? ' selected' : '') + '>仅已撤回</option>' +
        '</select>' +
        '<button class="btn btn-sm btn-outline" onclick="resetHistFilter()">清除筛选</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>时间</th><th>物料</th><th>类型</th><th>数量</th>' + (isAdminNow() ? '<th>金额</th>' : '') + '<th>操作人</th><th>项目</th><th>备注</th><th>库存变化</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<div class="pager">' +
        '<span class="p-info">共 ' + total + ' 条 · 第 ' + HistState.page + ' / ' + totalPages + ' 页</span>' +
        '<div class="p-btns">' +
          '<button class="btn btn-sm" ' + (HistState.page <= 1 ? 'disabled' : '') + ' onclick="HistState.page--;pageHistory()">上一页</button>' +
          '<button class="btn btn-sm" ' + (HistState.page >= totalPages ? 'disabled' : '') + ' onclick="HistState.page++;pageHistory()">下一页</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

/* 撤回一条出入库记录（仅管理员）：
   不改动原记录，而是新开一条"撤回冲销"记录（库存通过新记录冲回，审计链完整）：
   1. 原记录保留并标记"已撤回"，记录冲销记录编号（可追溯谁撤回的）
   2. 新增 type='revoke' 的冲销记录，库存变化与原记录相反，带完整 before/after 快照
   3. 之后所有统计（消耗排行 / 经费统计 / 仪表盘）都不再计入原记录 */
async function revokeRecord(recId) {
  var rec = await DB.get('records', recId);                                     // 找到这条记录
  if (!rec) { toast('记录不存在，可能已被删除', 'err'); return; }               // 没找到
  if (!canOperateRecord(rec)) { toast('只有管理员或该记录的操作人可以撤回', 'err'); return; }  // 权限校验
  if (rec.deleted) { toast('记录已删除，不能撤回', 'err'); return; }            // 已删除
  if (rec.revoked) { toast('这条记录已经撤回过了', 'err'); return; }            // 防止重复撤回
  /* 计算这笔记录当初让库存变化了多少（delta 为正=当初加了库存，为负=当初减了库存） */
  var delta = 0;                                                                  // 库存变化量
  if (rec.before !== undefined && rec.after !== undefined) {
    delta = rec.after - rec.before;                                               // 有操作前后快照：直接用差值，最准确
  } else {
    var tpInfo = RECORD_TYPES[rec.type];                                          // 旧记录没有快照时按类型估算
    if (tpInfo && tpInfo.sign === 1) delta = rec.qty;                             // 入库：当初加了 qty
    else if (tpInfo && tpInfo.sign === -1) delta = -rec.qty;                      // 出库：当初减了 qty
    else { toast('这条旧记录缺少库存快照，无法自动撤回，请用"库存调整"手工修正库存', 'err'); return; } // 调整类旧数据撤不了
  }
  /* 二次确认：说明撤回的影响（新开冲销记录） */
  var ok = await confirmBox(
    '确定撤回这条记录吗？\n' +
    '「' + rec.materialName + '」' + (RECORD_TYPES[rec.type] || { label: rec.type }).label + ' ×' + rec.qty + '\n' +
    '将新开一条"撤回冲销"记录，库存冲回 ' + (delta >= 0 ? '-' : '+') + Math.abs(delta) + '；原记录保留并标记"已撤回"，统计不再计入。'
  );                                                                              // 确认弹窗
  if (!ok) return;                                                                // 取消
  /* 1. 库存通过冲销记录冲回（物料即使进了回收站也照常冲回，恢复后数字才是对的） */
  var m = await DB.get('materials', rec.materialId);                              // 找物料（含回收站里的）
  var beforeNow = m ? (m.stock || 0) : 0;                                         // 冲销前库存
  var afterNow = Math.max(beforeNow - delta, 0);                                   // 冲销后库存，最低为 0
  if (m) {
    m.stock = afterNow;                                                           // 写新库存
    m.updatedAt = Date.now();                                                     // 更新时间（多设备同步用）
    delete m._search;                                                             // 清搜索索引缓存
    await DB.put('materials', m);                                                 // 写库
  }
  /* 2. 新增"撤回冲销"记录（库存方向与原记录相反，带完整快照） */
  var revId = uid('rec');                                                         // 冲销记录编号
  await DB.put('records', {
    id: revId,                                                                    // 记录编号
    materialId: rec.materialId,                                                  // 物料 id
    materialName: rec.materialName,                                              // 冗余物料名（物料删除后仍可查）
    unit: rec.unit || '',                                                        // 单位
    type: 'revoke',                                                              // 类型：撤回冲销
    revokesId: rec.id,                                                           // 冲销的是哪条原记录
    revokesType: rec.type,                                                       // 原记录类型（统计反向计入用）
    qty: rec.qty,                                                                // 数量（与原记录一致）
    price: rec.price || 0,                                                       // 单价（金额反向计入用）
    operator: Auth.user ? Auth.user.username : '未知',                             // 操作人（谁撤回的）
    project: rec.project || '',                                                  // 关联项目
    remark: '撤回冲销：' + (RECORD_TYPES[rec.type] || { label: rec.type }).label + '（' + fmtDateShort(rec.time) + '）',  // 备注说明
    before: beforeNow,                                                           // 冲销前库存
    after: afterNow,                                                             // 冲销后库存
    time: Date.now(),                                                            // 时间
    createdAt: Date.now(),                                                       // 创建时间（多设备同步用）
    updatedAt: Date.now()                                                        // 修改时间（多设备同步用）
  });
  /* 3. 原记录标记"已撤回"，并记录冲销记录编号（不删除原记录，保留追溯线索） */
  rec.revoked = true;                                                             // 已撤回标记
  rec.revokedBy = Auth.user ? Auth.user.username : '未知';                        // 谁撤回的
  rec.revokedAt = Date.now();                                                     // 撤回时间
  rec.revokedByRecord = revId;                                                    // 冲销记录编号
  stampSync(rec);                                                                 // 盖同步时间戳
  await DB.put('records', rec);                                                   // 写库
  await Log.add('撤回记录', (RECORD_TYPES[rec.type] || { label: rec.type }).label + ' ' + rec.materialName + ' ×' + rec.qty + '（新开冲销记录，库存已冲回）');  // 日志
  await State.refreshMaterials();                                                 // 刷新物料缓存
  toast('已撤回：' + rec.materialName + '，已新开冲销记录', 'ok');                // 提示
  refreshCurrentPage();                                                           // 重新渲染当前页
}

/* 取消撤回一条记录（管理员或该记录操作人）：
   1. 删除冲销记录（打 deleted 墓碑，同步到其他设备）
   2. 库存恢复为冲销前水平；若冲销之后还有后续操作，自动把后续记录的库存快照整体平移，链条保持衔接
   3. 清除原记录的"已撤回"标记，原记录重新计入统计 */
async function cancelRevokeRecord(recId) {
  var rec = await DB.get('records', recId);                                    // 找到原记录
  if (!rec) { toast('记录不存在，可能已被删除', 'err'); return; }              // 没找到
  if (!canOperateRecord(rec)) { toast('只有管理员或该记录的操作人可以操作', 'err'); return; }  // 权限校验
  if (!rec.revoked) { toast('这条记录没有被撤回，无需取消', 'err'); return; } // 未被撤回
  var rev = rec.revokedByRecord ? await DB.get('records', rec.revokedByRecord) : null;  // 当时的冲销记录
  if (!rev || rev.deleted) { toast('冲销记录不存在或已删除', 'err'); return; } // 找不到 / 已删
  /* 冲销之后可能有后续操作：把后续记录的库存快照整体平移，链条保持衔接、库存数字连续 */
  var allRecs = await DB.all('records');                                        // 全部记录
  var shift = rev.before - rev.after;                                           // 需平移的库存差（冲销恢复量）
  var later = [];                                                               // 后续有效记录
  for (var i = 0; i < allRecs.length; i++) {
    var x = allRecs[i];                                                         // 当前
    if (!x.deleted && x.materialId === rec.materialId && x.time > rev.time) later.push(x);  // 冲销之后的记录
  }
  later.sort(function (a, b) { return a.time - b.time; });                      // 按时间升序
  /* 二次确认：说明取消撤回的影响 */
  var ok = await confirmBox(
    '确定取消撤回这条记录吗？\n' +
    '「' + rec.materialName + '」' + (RECORD_TYPES[rec.type] || { label: rec.type }).label + ' ×' + rec.qty + '\n' +
    '冲销记录将被删除，库存自动恢复为冲销前水平' + (later.length ? '，后续 ' + later.length + ' 笔记录的库存快照自动衔接平移' : '') + '，原记录回到"有效"状态并重新计入统计。'
  );                                                                               // 确认弹窗
  if (!ok) return;                                                                 // 取消
  /* 1. 删除冲销记录（打墓碑，同步到其他设备） */
  await softDelete('records', rev.id);
  /* 2. 库存恢复（叠加后续记录的变化）+ 后续记录快照平移 */
  var m = await DB.get('materials', rec.materialId);                              // 找物料（含回收站里的）
  if (m) {
    m.stock = Math.max((m.stock || 0) + shift, 0);                                // 恢复为冲销前库存水平（含后续变化）
    m.updatedAt = Date.now();                                                     // 更新时间（多设备同步用）
    delete m._search;                                                             // 清搜索索引缓存
    await DB.put('materials', m);                                                 // 写库
  }
  for (var j = 0; j < later.length; j++) {                                        // 逐条平移后续记录快照
    var lr = later[j];                                                            // 当前后续记录
    if (lr.before !== undefined) lr.before = lr.before + shift;                   // 操作前库存平移
    if (lr.after !== undefined) lr.after = lr.after + shift;                      // 操作后库存平移
    stampSync(lr);                                                                // 盖同步时间戳
    await DB.put('records', lr);                                                  // 写库
  }
  /* 3. 清除原记录的撤回标记（重新计入统计） */
  rec.revoked = false;                                                            // 清除撤回标记
  rec.revokedBy = '';                                                             // 清除撤回人
  rec.revokedAt = '';                                                             // 清除撤回时间
  rec.revokedByRecord = '';                                                       // 清除冲销记录编号
  stampSync(rec);                                                                 // 盖同步时间戳
  await DB.put('records', rec);                                                   // 写库
  await Log.add('取消撤回', (RECORD_TYPES[rec.type] || { label: rec.type }).label + ' ' + rec.materialName + ' ×' + rec.qty + '（冲销记录已删除）');  // 日志
  await State.refreshMaterials();                                                 // 刷新物料缓存
  toast('已取消撤回：' + rec.materialName + ' 恢复有效', 'ok');                   // 提示
  refreshCurrentPage();                                                           // 重新渲染当前页
}

/* 导出当前筛选的历史记录 */
async function exportHistoryCSV() {
  var records = await State.loadRecords();                              // 全部
  var rng = statsRange(HistState);                                       // 时间范围起止（与页面一致）
  /* 表头：单价与金额涉及钱，成员导出的版本不含这两列 */
  var rows = [isAdminNow()
    ? ['时间', '物料', '类型', '数量', '单位', '单价', '金额', '操作人', '项目', '备注', '操作前库存', '操作后库存', '状态']
    : ['时间', '物料', '类型', '数量', '单位', '操作人', '项目', '备注', '操作前库存', '操作后库存', '状态']];
  var list = [];                                                         // 筛选结果
  for (var r = 0; r < records.length; r++) {                              // 遍历
    var rec = records[r];                                                  // 当前
    if (rec.deleted) continue;                                             // 已删除不导出
    if (HistState.q) {                                                       // 关键词搜索：物料名 / 操作人
      var qLower = HistState.q.toLowerCase();                                // 关键词转小写
      var hitQ = rec.materialName.toLowerCase().indexOf(qLower) >= 0         // 命中物料名
        || (rec.operator && rec.operator.toLowerCase().indexOf(qLower) >= 0);  // 或命中操作人
      if (!hitQ) continue;                                                    // 都没命中则跳过
    }
    if (HistState.type && rec.type !== HistState.type) continue;            // 类
    if (HistState.proj && rec.project !== HistState.proj) continue;         // 项目
    if (rec.time < rng.from || rec.time > rng.to) continue;                // 时（含自定义区间）
    list.push(rec);                                                         // 收集
  }
  list.sort(function (a, b) { return b.time - a.time; });                    // 倒序
  for (var i = 0; i < list.length; i++) {                                    // 遍历
    var rc = list[i];                                                         // 当前
    /* 成员导出不含单价 / 金额两列 */
    if (isAdminNow()) {
      rows.push([                                                             // 管理员：完整列
        fmtDate(rc.time), rc.materialName, (RECORD_TYPES[rc.type] || { label: rc.type }).label, rc.qty,
        rc.unit || '', rc.price || 0, (rc.qty * (rc.price || 0)).toFixed(2),
        rc.operator, rc.project || '', rc.remark || '', rc.before !== undefined ? rc.before : '', rc.after !== undefined ? rc.after : '', rc.revoked ? '已撤回' : '有效'
      ]);
    } else {
      rows.push([                                                             // 成员：去掉单价 / 金额
        fmtDate(rc.time), rc.materialName, (RECORD_TYPES[rc.type] || { label: rc.type }).label, rc.qty,
        rc.unit || '', rc.operator, rc.project || '', rc.remark || '', rc.before !== undefined ? rc.before : '', rc.after !== undefined ? rc.after : '', rc.revoked ? '已撤回' : '有效'
      ]);
    }
  }
  downloadFile(toCSV(rows), '历史记录_' + fmtDateShort(Date.now()) + '.csv', 'text/csv');  // 下载
  toast('已导出 ' + list.length + ' 条记录', 'ok');                              // 提示
}

/* ==================== 3. 数据管理页 ==================== */

async function pageData() {
  var all = await DB.all('materials');                                     // 全部物料（含回收站）
  var recycled = [];                                                        // 回收站物料
  for (var i = 0; i < all.length; i++) {                                    // 遍历
    if (all[i].deleted) recycled.push(all[i]);                              // 收集
  }
  recycled.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });   // 最新删除排在最上
  if (!isAdminNow()) recycled = recycled.filter(function (m) { return m.deletedBy === (Auth.user || {}).username; });   // 普通成员只看自己删除的，管理员看全部
  var logs = await DB.all('logs');                                           // 全部日志
  logs.sort(function (a, b) { return b.time - a.time; });                    // 倒序
  var logsTop = logs.slice(0, 100);                                          // 前 100（日志改为通栏后放长显示）
  var logRows = '';                                                          // 日志行
  for (var g = 0; g < logsTop.length; g++) {                                 // 遍历
    var lg = logsTop[g];                                                      // 当前
    logRows += '<div class="act-item">' +
      '<span style="flex:none;font-size:12px;color:var(--text-sub);width:130px">' + fmtDate(lg.time) + '</span>' +
      '<span style="flex:none;width:90px"><b>' + escapeHtml(lg.user) + '</b></span>' +
      '<span style="flex:none;width:100px;color:var(--primary)">' + escapeHtml(lg.action) + '</span>' +
      '<span style="flex:1;font-size:12.5px;color:var(--text-sub)">' + escapeHtml(lg.detail || '') + '</span>' +
      '</div>';
  }
  if (logsTop.length === 0) logRows = '<div class="empty">暂无日志</div>';    // 空状态
  /* 回收站行 */
  var recRows = '';                                                           // 行
  for (var t = 0; t < recycled.length; t++) {                                  // 遍历
    var m = recycled[t];                                                        // 当前
    var canRestore = isAdminNow() || (m.deletedBy && m.deletedBy === (Auth.user || {}).username);   // 删除人自己或管理员可恢复
    recRows += '<div class="act-item">' +
      '<span style="flex:1"><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><span style="color:var(--text-sub);font-size:12px">・' + fmtDateShort(m.updatedAt) + (m.deletedBy ? '・由 ' + escapeHtml(m.deletedBy) + ' 删除' : '') + '</span></span>' +
      (canRestore ? '<button class="btn btn-sm btn-outline" onclick="restoreMaterial(\'' + m.id + '\')">恢复</button> ' : '') +
      (isAdminNow() ? '<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="purgeMaterial(\'' + m.id + '\')">彻底删除</button>' : '') +
      '</div>';
  }
  if (recycled.length === 0) recRows = '<div class="empty" style="padding:26px">回收站是空的</div>';  // 空状态
  /* 示例数据状态：统计本机（已同步）还活着的示例物料数量。
     载入后所有设备同步拿到这些物料，按钮就变成"撤回示例数据"，
     所以不管是哪台设备、哪个用户，看到的按钮状态都一致。 */
  var demoCount = 0;                                                          // 示例物料数量
  for (var dc = 0; dc < all.length; dc++) {                                    // 遍历全部物料
    if (all[dc].source === 'demo' && !all[dc].deleted) demoCount++;            // 只数没被撤回的示例物料
  }
  /* 上次备份时间 */
  var lastBackup = await DB.getSetting('lastBackupAt', 0);                    // 读取
  var backupTip = lastBackup
    ? '上次备份：' + fmtDate(lastBackup) + (Date.now() - lastBackup > 30 * 86400000 ? ' <span class="badge badge-red">超过一个月了，建议立即备份！</span>' : '')  // 超期提醒
    : '<span class="badge badge-yellow">还没有备份过，建议现在就导出一份全库备份</span>';                     // 未备份
  /* 输出页面 */
  $('#page').innerHTML =
    '<div class="page-head"><div><div class="page-title">数据管理</div><div class="page-desc">Excel 批量导入导出 / 备份恢复 / 回收站 / 操作日志</div></div></div>' +
    '<div class="grid-2">' +
    /* 左：导入导出 + 全库备份 + 回收站 + 示例数据（仅管理员）；纵向 flex，末尾卡片撑满列高实现左右等长 */
    '<div id="data-left" style="display:flex;flex-direction:column">' +
      '<div class="card"><div class="card-title">' + ICONS.database + '批量导入 / 导出</div>' +
        '<div style="font-size:13px;color:var(--text-sub);margin-bottom:14px">Excel 表格用"另存为 CSV（UTF-8）"格式即可导入；所有导出文件都能用 Excel/WPS 直接打开</div>' +
        '<div class="form-item"><label>导出</label><div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-outline" onclick="exportMaterialsCSV()">导出物料表 CSV</button>' +
          '<button class="btn btn-outline" onclick="exportAllRecordsCSV()">导出全部记录 CSV</button>' +
        '</div></div>' +
        (Auth.can('manage') ? '<div class="form-item"><label>物料 CSV 导入</label>' +
          '<input class="input" type="file" id="import-file" accept=".csv,text/csv" onchange="importMaterialsCSV(this)" />' +
          '<div class="form-hint">第一行为表头。编号已存在 → 更新该物料档案；编号留空 → 新增物料。导入后库存差异会自动记"库存调整"记录，全程可追溯。<br>也可把 CSV 文件拖到页面任意位置直接导入。</div>' +
          '<button class="btn btn-sm" style="margin-top:8px" onclick="downloadImportTemplate()">下载导入模板（含示例行）</button>' +
        '</div>' : '') +
      '</div>' +
      '<div class="card"><div class="card-title">全库备份与恢复</div>' +
        '<div class="ai-quote" style="margin:0 0 12px">' + backupTip + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-primary" onclick="exportFullBackup()">' + ICONS.database + '导出全库备份（JSON）</button>' +
          (isAdminNow() ? '<button class="btn btn-outline" onclick="$(\'#restore-file\').click()">导入备份恢复</button>' +
          '<input class="input" type="file" id="restore-file" accept=".json" style="display:none" onchange="importFullBackup(this)" />' : '') +
        '</div>' +
        (isAdminNow() ? '<div class="form-hint">恢复会覆盖当前全部数据（含账号），恢复后需要重新登录。建议每学期期末导出一次备份存档。<br>也可把 JSON 备份文件拖到页面任意位置直接恢复。</div>' +
        '<button class="btn btn-outline" style="color:var(--danger);margin-top:12px" onclick="factoryReset()">所有数据初始化（恢复出厂状态）</button>' : '<div class="form-hint">建议每学期期末导出一次备份存档，重要数据常备无患。</div>') +
      '</div>' +
      '<div class="card" style="margin-bottom:0"><div class="card-title">回收站（' + recycled.length + '）</div>' +
        '<div style="height:76px;overflow:auto">' + recRows + '</div></div>' +
      /* 示例数据：整块卡片仅管理员可见，普通成员不出现这个框 */
      (isAdminNow() ? '<div class="card" style="margin-top:16px;margin-bottom:0"><div class="card-title">示例数据</div>' +
        '<div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">' + (demoCount > 0
          ? '当前已载入 <b>' + demoCount + '</b> 种示例物料（含模拟出入库记录）。示例数据只用于体验功能，正式使用前记得撤回。'
          : '首次使用可以一键导入 ' + DEMO_MATERIALS.length + ' 种协会常用元件和 5 个月的模拟记录，体验完整功能后再撤回。') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          /* 双态按钮：没载入 → "载入示例数据"；已载入 → "撤回示例数据"，避免重复载入造成数据叠加 */
          (demoCount > 0
            ? '<button class="btn btn-outline" style="color:var(--danger)" onclick="withdrawDemoData()">撤回示例数据</button>'
            : '<button class="btn btn-outline" onclick="seedDemoData()">载入示例数据</button>') +
        '</div></div>' : '') +
    '</div>' +
    /* 右：操作日志（独占整列；卡片撑满列高、列表内部滚动，与左列精确等长） */
    '<div id="data-right" style="display:flex;flex-direction:column;min-height:0;overflow:hidden">' +
      '<div class="card" style="flex:1;min-height:0;display:flex;flex-direction:column;margin-bottom:0"><div class="card-title">操作日志（最近 100 条）</div><div class="dash-activity" style="flex:1;overflow:auto;min-height:0">' + logRows + '</div></div>' +
    '</div>' +
    '</div>';
  setTimeout(alignDataCols, 0);
}

/* 数据管理：右列日志高度对齐左列（回收站高度固定 → 左列总高恒定）；窄屏单列时不限制 */
function alignDataCols() {
  var L = document.getElementById('data-left');
  var R = document.getElementById('data-right');
  if (!L || !R) return;
  if (window.innerWidth < 768) { R.style.height = ''; return; }
  R.style.height = '1px';                 /* 先收起右列，逼 grid 行高只由左列自然内容决定 */
  void L.offsetHeight;                    /* 强制同步布局，确保读到的是左列真实高度 */
  R.style.height = L.offsetHeight + 'px';
}
window.addEventListener('resize', function () { if (typeof alignDataCols === 'function') alignDataCols(); });

/* --- 3.1 物料 CSV 导出 --- */

async function exportMaterialsCSV() {
  var mats = State.materials;                                              // 有效物料
  var rows = [['编号', '名称', '型号/规格', '封装', '位置编号', '母分类', '子分类', '标签', '单位', '存放位置', '单价', '库存', '预警线', '丝印', '别称', '购买链接', '供应商', '数据手册', '用途描述']];  // 表头（列顺序与物料表单一致）
  for (var i = 0; i < mats.length; i++) {                                    // 遍历
    var m = mats[i];                                                          // 当前
    rows.push([m.code || '', m.name, m.model || '', m.pkg || '', m.locNo || '', m.cat || '', m.sub || '',    // 基本信息
      (m.tags || []).join('；'), m.unit || '', m.loc || '', m.price || 0, m.stock || 0,  // 库存信息
      m.minStock || 0, m.silk || '', m.alias || '', m.link || '', m.supplier || '', m.datasheet || '', m.desc || '']);  // 其他
  }
  downloadFile(toCSV(rows), '物料清单_' + fmtDateShort(Date.now()) + '.csv', 'text/csv');  // 下载
  await DB.setSetting('lastExportAt', Date.now());                             // 记时间
  toast('已导出 ' + mats.length + ' 条物料', 'ok');                             // 提示
}

/* 全部记录导出（不限筛选） */
async function exportAllRecordsCSV() {
  var records = await State.loadRecords();                                      // 全部
  records.sort(function (a, b) { return b.time - a.time; });                     // 倒序
  var rows = [['时间', '物料', '类型', '数量', '单位', '单价', '金额', '操作人', '项目', '备注', '操作前库存', '操作后库存']];  // 表头
  for (var i = 0; i < records.length; i++) {                                      // 遍历
    var r = records[i];                                                            // 当前
    if (r.deleted) continue;                                                       // 已删除不导出
    rows.push([fmtDate(r.time), r.materialName, (RECORD_TYPES[r.type] || { label: r.type }).label, r.qty,  // 行数据
      r.unit || '', r.price || 0, (r.qty * (r.price || 0)).toFixed(2),
      r.operator, r.project || '', r.remark || '', r.before !== undefined ? r.before : '', r.after !== undefined ? r.after : '']);
  }
  downloadFile(toCSV(rows), '出入库全量记录_' + fmtDateShort(Date.now()) + '.csv', 'text/csv');  // 下载
  toast('已导出全部记录', 'ok');                                                       // 提示
}

/* 下载导入模板 */
function downloadImportTemplate() {
  var rows = [
    ['编号', '名称', '型号/规格', '封装', '位置编号', '母分类', '子分类', '标签', '单位', '存放位置', '单价', '库存', '预警线', '丝印', '别称', '购买链接', '供应商', '数据手册', '用途描述'],
    ['', '示例：光敏电阻传感器', 'GL5528 模块', '模块', 'A-2-02', '传感器', '光/颜色', '常用；感光', '个', 'A架-2层-02盒', '2.5', '10', '3', 'GL5528', '光敏；光电阻', '', '立创商城', '', '检测环境光照强度，智能台灯/光控开关用'],
    ['', '示例：1kΩ 电阻', '1/4W 直插', '0805', 'D-1-01', '基础元件', '电阻', '常用', '个', 'D架-1层-01盒', '0.05', '300', '50', '102', '电阻；1k', '', '', '', '最常用限流电阻']
  ];                                                                              // 模板+两行示例
  downloadFile(toCSV(rows), '物料导入模板.csv', 'text/csv');                         // 下载
  toast('模板已下载，用 Excel/WPS 填好后导入', 'ok');                                  // 提示
}

/* --- 3.2 物料 CSV 导入 --- */

async function importMaterialsCSV(input) {
  if (!Auth.can('manage')) { toast('没有管理物料的权限，请联系管理员', 'err'); return; }
  var file = input && input.files ? input.files[0] : input;                         /* 兼容：input 元素 或 直接传 File（拖拽） */
  if (!file) return;                                                                 // 没选
  var reader = new FileReader();                                                     // 文件读取器
  reader.onload = async function () {                                                 // 读完
    try {                                                                             // 容错
      var rows = parseCSV(reader.result);                                              // 解析 CSV
      if (rows.length < 2) { toast('文件里没有数据行', 'err'); return; }                 // 只有表头
      var head = rows[0];                                                              // 表头行
      /* 定位列号：优先按表头文字匹配。
         只有"表头里一个列名都没认出来"时才退回按固定位置 —— 否则像加"数据手册"列之前导出的老 CSV，
         按位置猜会把这列指到"用途描述"上，等于把用途描述写进数据手册。 */
      var col = {};                                                                     // 列名->下标
      var names = ['编号', '名称', '型号', '封装', '位置编号', '母分类', '子分类', '标签', '单位', '存放位置', '单价', '库存', '预警线', '丝印', '别称', '购买链接', '供应商', '数据手册', '用途描述'];  // 期望列
      var hasHeader = false;                                                             // 表头里认出了至少一个列名
      for (var h0 = 0; h0 < head.length && !hasHeader; h0++) {                             // 先扫一遍表头
        for (var n0 = 0; n0 < names.length; n0++) {                                        // 逐个比列名
          if (head[h0] && String(head[h0]).indexOf(names[n0]) >= 0) { hasHeader = true; break; }   // 认出来了
        }
      }
      for (var i = 0; i < names.length; i++) {                                          // 遍历期望列
        col[names[i]] = hasHeader ? -1 : i;                                              // 有表头：先当"这列不存在"；无表头：按位置
        if (hasHeader) {                                                                  // 有表头就按文字找
          for (var h = 0; h < head.length; h++) {                                          // 扫表头
            if (head[h] && String(head[h]).indexOf(names[i]) >= 0) { col[names[i]] = h; break; }   // 匹配到就用
          }
        }
      }
      /* 建一个编号->物料的索引，方便判断"更新还是新增" */
      var byCode = {};                                                                    // 索引
      var allMats = await DB.all('materials');                                            // 全部物料（含回收站）
      for (var a = 0; a < allMats.length; a++) {                                           // 遍历
        if (allMats[a].code) byCode[allMats[a].code] = allMats[a];                         // 编号索引
      }
      var addCount = 0, updCount = 0, adjustCount = 0;                                       // 统计
      var toPut = [];                                                                        // 待写入物料
      var toRec = [];                                                                        // 待写入调整记录
      for (var r = 1; r < rows.length; r++) {                                                // 数据行
        var cells = rows[r];                                                                  // 当前行
        var g = function (name) { var ci = col[name]; return (ci >= 0 && cells[ci] !== undefined) ? String(cells[ci]).trim() : ''; };  // 取列值（这列不存在就返回空串）
        var name = g('名称');                                                                 // 名称
        if (!name) continue;                                                                  // 空行跳过
        var code = g('编号');                                                                   // 编号
        var catName = g('母分类');                                                              // 母分类
        if (!catName) catName = '其他';                                                         // 没填归"其他"
        var exist = code ? byCode[code] : null;                                                 // 已有物料
        var newStock = parseInt(g('库存') || '0', 10) || 0;                                      // 表格里的库存
        if (exist) {                                                                            // 编号已存在 → 更新
          exist.name = name;                                                                     // 更新字段
          exist.model = g('型号');
          exist.cat = catName;
          exist.sub = g('子分类');
          exist.tags = g('标签') ? g('标签').split(/[;；,，、]/).map(function (t) { return t.trim(); }).filter(function (t) { return t; }) : [];
          exist.unit = g('单位') || '个';
          exist.loc = g('存放位置');
          exist.locNo = g('位置编号');
          exist.pkg = g('封装');
          exist.price = parseFloat(g('单价') || '0') || 0;
          exist.minStock = parseInt(g('预警线') || '0', 10) || 0;
          exist.silk = g('丝印');
          exist.alias = g('别称');
          exist.link = g('购买链接');
          exist.supplier = g('供应商');
          if (col['数据手册'] >= 0) exist.datasheet = g('数据手册');                                  // 老版本导出的 CSV 没这一列，读不到就保持原值，别清空
          exist.desc = g('用途描述');
          exist.deleted = false;                                                                  // 导入视为恢复
          exist.updatedAt = Date.now();
          if (exist.stock !== newStock) {                                                          // 库存有变化 → 记调整
            toRec.push({
              id: uid('rec'), materialId: exist.id, materialName: exist.name, unit: exist.unit,
              type: 'adjust', qty: newStock, price: exist.price,
              operator: Auth.user.username, project: '', remark: 'Excel 导入：库存由 ' + exist.stock + ' 调整为 ' + newStock,
              before: exist.stock, after: newStock, time: Date.now()
            });
            exist.stock = newStock;                                                                 // 改库存
            adjustCount++;                                                                           // 计数
          }
          updCount++;                                                                                 // 计数
          toPut.push(exist);
        } else {                                                                                       // 编号不存在 → 新增
          var nm = {                                                                                    // 新物料
            id: uid('mat'), code: code || nextMaterialCode(catName), name: name, model: g('型号'),
            cat: catName, sub: g('子分类'),
            tags: g('标签') ? g('标签').split(/[;；,，、]/).map(function (t) { return t.trim(); }).filter(function (t) { return t; }) : [],
            unit: g('单位') || '个', loc: g('存放位置'), locNo: g('位置编号'), pkg: g('封装'),
            price: parseFloat(g('单价') || '0') || 0, stock: newStock,
            minStock: parseInt(g('预警线') || '0', 10) || 0,
            silk: g('丝印'), alias: g('别称'), link: g('购买链接'), supplier: g('供应商'),
            datasheet: g('数据手册'), desc: g('用途描述'),
            createdAt: Date.now(), updatedAt: Date.now()
          };
          byCode[nm.code] = nm;                                                                         // 索引（防止表内重复编号）
          addCount++;                                                                                    // 计数
          toPut.push(nm);
        }
      }
      /* 确认弹窗 */
      var ok = await confirmBox('解析完成：新增 ' + addCount + ' 条，更新 ' + updCount + ' 条，库存调整 ' + adjustCount + ' 条。\n确定执行导入吗？', '导入');  // 确认
      if (!ok) { input.value = ''; return; }                                                              // 取消
      await DB.bulkPut('materials', toPut);                                                                // 批量写物料
      if (toRec.length > 0) await DB.bulkPut('records', toRec);                                            // 批量写调整记录
      await Log.add('导入物料CSV', '新增' + addCount + ' 更新' + updCount);                                  // 日志
      await State.refreshMaterials();                                                                       // 刷新
      toast('导入完成', 'ok');                                                                               // 提示
      input.value = '';                                                                                      // 清空选择
      pageData();                                                                                             // 刷新页面
    } catch (err) {                                                                                           // 出错
      console.error(err);                                                                                     // 打印
      toast('导入失败：' + err.message, 'err');                                                                 // 提示
    }
  };
  reader.readAsText(file, 'utf-8');                                                                            // 以 UTF-8 读文件
}

/* --- 3.3 全库备份 / 恢复 --- */

async function exportFullBackup() {
  var backup = {                                                                                  // 备份对象
    app: 'hwms', version: 1, exportTime: Date.now(),                                               // 标识
    materials: await DB.all('materials'),                                                          // 物料（含回收站）
    records: await DB.all('records'),                                                               // 记录
    users: await DB.all('users'),                                                                   // 用户
    logs: await DB.all('logs'),                                                                     // 日志
    settings: await DB.all('settings')                                                               // 设置
  };
  downloadFile(JSON.stringify(backup, null, 2), '物料管家全库备份_' + fmtDateShort(Date.now()) + '.json', 'application/json');  // 下载
  await DB.setSetting('lastBackupAt', Date.now());                                                    // 记录备份时间
  await Log.add('全库备份', '导出了 ' + (backup.materials.length + backup.records.length) + ' 条数据');  // 日志
  toast('备份文件已下载，请妥善保存', 'ok');                                                            // 提示
}

async function importFullBackup(input) {
  var file = input && input.files ? input.files[0] : input;                                          /* 兼容：input 元素 或 直接传 File（拖拽） */
  if (!file) return;                                                                                  // 没选
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以恢复备份', 'err'); return; }        // 权限
  var ok = await confirmBox('恢复备份将覆盖当前全部数据（包括账号和记录），且无法撤销。\n确定继续吗？', '覆盖恢复');  // 双重确认
  if (!ok) { if (input && input.files) input.value = ''; return; }                                        // 取消
  var reader = new FileReader();                                                                       // 读取器
  reader.onload = async function () {                                                                   // 读完
    try {                                                                                                // 容错
      var data = JSON.parse(reader.result);                                                               // 解析 JSON
      if (!data.materials || !data.records || !data.users) { toast('文件格式不对，不是本系统的备份', 'err'); return; }  // 校验

      /* 1) 先给本机现有的行打墓碑，而不是直接清表。
         直接清表不留痕迹，"覆盖恢复"这个动作就同步不出去，其他设备上还是旧数据。 */
      var stores = ['materials', 'records', 'users', 'logs'];                                                 // 参与同步的四张表
      for (var s = 0; s < stores.length; s++) {                                                               // 逐张表处理
        var oldRows = await DB.all(stores[s]);                                                                // 取出本机现有的行（含墓碑）
        for (var oi = 0; oi < oldRows.length; oi++) {                                                         // 逐条
          if (!oldRows[oi].deleted) await softDelete(stores[s], oldRows[oi].id);                               // 还没删的才打墓碑
        }
      }

      /* 2) 写入备份内容，并给每条盖上新的时间戳。
         备份里的 updatedAt 是"导出那一刻"的旧值，不刷新的话服务器会认为它没有
         服务器上现有的记录新而拒收（冲突规则是时间戳旧的输），恢复就等于白恢复。 */
      var now = Date.now();                                                                                   // 本次恢复的统一时间
      function stampRestored(rows) {                                                                          // 给一批数据盖时间戳
        var list = rows || [];                                                                                // 容错：备份里可能没有这张表
        for (var ri = 0; ri < list.length; ri++) {                                                            // 逐条
          list[ri].createdAt = list[ri].createdAt || list[ri].time || now;                                    // 补创建时间（老日志只有 time 字段）
          list[ri].updatedAt = now;                                                                           // 刷新修改时间 → 这次上传一定赢过服务器
        }
        return list;                                                                                          // 原样返回
      }
      await DB.bulkPut('materials', stampRestored(data.materials));                                            // 写回物料
      await DB.bulkPut('records', stampRestored(data.records));                                                // 写回记录
      /* 账号要额外盖 permAt（权限修改时间）：服务器对"启用状态/角色/密码"这些权限字段
         是按 permAt 判新旧的，只盖 updatedAt 会被当成"这次没改权限"，服务器上旧的权限
         就会被保留下来，恢复备份等于没恢复。 */
      var restoredUsers = stampRestored(data.users);                                                           // 写回账号（先盖通用时间戳）
      for (var ru = 0; ru < restoredUsers.length; ru++) restoredUsers[ru].permAt = now;                          // 再盖权限时间
      await DB.bulkPut('users', restoredUsers);                                                                 // 写入账号表
      await DB.bulkPut('logs', stampRestored(data.logs));                                                      // 写回日志

      /* 3) 设置表：恢复备份内容，但要保住同步进度（syncConfig 里的 lastSync），
         否则下次同步会从零全量拉一遍，把服务器上的历史垃圾数据又拉回本机。 */
      var keepSync = await DB.getSetting('syncConfig', null);                                                  // 先存下同步进度
      await DB.clear('settings');                                                                              // 清空设置
      await DB.bulkPut('settings', data.settings || []);                                                        // 写回备份里的设置
      if (keepSync) await DB.setSetting('syncConfig', keepSync);                                                // 再把同步进度写回去

      Auth.logout();                                                                                            // 强制重新登录
      location.hash = '#/login';                                                                                  // 去登录页
      location.reload();                                                                                           // 整页刷新最稳妥
    } catch (err) {                                                                                                 // 出错
      toast('恢复失败：' + err.message, 'err');                                                                      // 提示
    }
  };
  reader.readAsText(file, 'utf-8');                                                                                   // 读文件
}

/* --- 3.4 回收站恢复 / 彻底删除 --- */

async function restoreMaterial(id) {
  var all = await DB.all('materials');                                                                             // 全部
  for (var i = 0; i < all.length; i++) {                                                                            // 遍历
    if (all[i].id === id) {                                                                                          // 命中
      if (!isAdminNow() && !(all[i].deletedBy && all[i].deletedBy === (Auth.user || {}).username)) {
        toast('只有删除该物料的操作人或管理员可以恢复', 'err'); return;
      }
      all[i].deleted = false;                                                                                         // 取消删除标记
      all[i].updatedAt = Date.now();                                                                                   // 时间
      await DB.put('materials', all[i]);                                                                              // 写库
      await Log.add('恢复物料', all[i].name + '（从回收站恢复）');                                                      // 日志
      await State.refreshMaterials();                                                                                   // 刷新
      toast('已恢复', 'ok');                                                                                              // 提示
      pageData();                                                                                                          // 刷新页
      return;                                                                                                               // 结束
    }
  }
}

async function purgeMaterial(id) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以彻底删除', 'err'); return; }                            // 权限
  var ok = await confirmBox('彻底删除后无法恢复（历史出入库记录仍保留），确定吗？', '彻底删除');                              // 确认
  if (!ok) return;                                                                                                             // 取消
  var all = await DB.all('materials');                                                                                          // 全部
  for (var i = 0; i < all.length; i++) {                                                                                        // 遍历
    if (all[i].id === id) {                                                                                                      // 命中
      await DB.del('materials', id);                                                                                             // 真删
      await Log.add('彻底删除物料', all[i].name);                                                                                  // 日志
      await State.refreshMaterials();                                                                                              // 刷新
      toast('已彻底删除', 'ok');                                                                                                    // 提示
      pageData();                                                                                                                    // 刷新页
      return;                                                                                                                        // 结束
    }
  }
}

/* --- 3.5 示例数据（载入 / 撤回，双态按钮切换） --- */

async function seedDemoData() {
  if (!isAdminNow()) { toast('没有权限', 'err'); return; }
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以载入示例数据', 'err'); return; }              // 权限：仅管理员
  /* 防重复：只要库里还有活着的示例物料，就不允许再载入一次（按钮这时也已经是"撤回示例数据"）。
     多设备同步后各端状态一致，所以这条拦截在每台设备上都会生效。 */
  var existed = await DB.all('materials');                                                                          // 全部物料
  var aliveDemo = 0;                                                                                                 // 还活着的示例物料数
  for (var e = 0; e < existed.length; e++) { if (existed[e].source === 'demo' && !existed[e].deleted) aliveDemo++; }   // 统计
  if (aliveDemo > 0) { toast('已经载入过示例数据了，请先点"撤回示例数据"再重新载入', 'err'); pageData(); return; }        // 拦截重复载入
  var ok = await confirmBox('将导入 ' + DEMO_MATERIALS.length + ' 种协会常用元件 + 5 个月模拟出入库记录。\n载入后按钮会变成"撤回示例数据"，随时可以一键撤回。确定载入吗？', '载入');  // 确认
  if (!ok) return;                                                                                                                       // 取消
  var all = await DB.all('materials');                                                                                                     // 现有物料
  var byCode = {};                                                                                                                          // 编号索引
  for (var i = 0; i < all.length; i++) { if (all[i].code) byCode[all[i].code] = true; }                                                       // 收集
  var toAdd = [];                                                                                                                            // 待新增
  for (var d = 0; d < DEMO_MATERIALS.length; d++) {                                                                                           // 遍历示例
    var src = DEMO_MATERIALS[d];                                                                                                               // 当前
    if (byCode[src.code]) continue;                                                                                                            // 已存在跳过
    toAdd.push({                                                                                                                                // 复制并生成新对象（不修改原数组）
      id: uid('mat'), code: src.code, name: src.name, model: src.model, pkg: src.pkg || '', locNo: src.locNo || '',                               // 基本字段（含封装、位置编号）
      cat: src.cat, sub: src.sub, tags: src.tags, unit: src.unit, loc: src.loc, price: src.price, stock: src.stock, minStock: src.minStock,      // 分类与库存
      link: src.link, silk: src.silk, alias: src.alias, desc: src.desc,                                                                          // 其他
      supplier: src.supplier || '', datasheet: src.datasheet || '',                                                                              // 供应商、数据手册
      source: 'demo', createdAt: Date.now(), updatedAt: Date.now()                                                                               // 标记来源 + 时间戳（同步用）
    });
  }
  await DB.bulkPut('materials', toAdd);                                                                                                          // 写入物料
  var demoAdmin = Auth.user ? Auth.user.username : 'admin';                                                                                      // 操作人名
  var recs = genDemoRecords(toAdd, demoAdmin);                                                                                                    // 生成记录
  for (var rc = 0; rc < recs.length; rc++) {                                                                                                      // 补字段
    recs[rc].id = uid('rec');                                                                                                                      // 记录编号
    recs[rc].before = 0; recs[rc].after = 0;                                                                                                        // 示例数据没有前后库存，填 0 不显示
    recs[rc].source = 'demo';                                                                                                                       // 标记示例，便于只清示例
  }
  await DB.bulkPut('records', recs);                                                                                                                  // 写入记录
  await Log.add('载入示例数据', '物料 ' + toAdd.length + ' 种，记录 ' + recs.length + ' 条');                                                           // 日志
  await State.refreshMaterials();                                                                                                                      // 刷新
  toast('示例数据已载入，去各页面看看吧', 'ok');                                                                                                         // 提示
  pageData();                                                                                                                                            // 刷新页
}

async function withdrawDemoData() {
  if (!isAdminNow()) { toast('没有权限', 'err'); return; }
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以撤回', 'err'); return; }                      // 权限
  var ok = await confirmBox('将只撤回【示例数据】（载入的示例元件和模拟记录），你自己创建的物料和记录会保留。确定吗？', '撤回示例');  // 确认
  if (!ok) return;                                                                                                      // 取消
  /* 注意：这里必须用 softDelete（打删除墓碑），不能直接 DB.del 真删。
     真删不会留下任何痕迹，同步引擎就没东西可上传 —— 别的设备根本不知道
     "这些数据被删了"，于是手机上示例数据永远清不掉；等你再载入一次示例，
     新数据又会带着新的 id 推上去，和手机上的旧的叠在一起，越滚越多。 */
  var mats = await DB.all('materials');                                                                                  // 找示例物料
  var delM = 0;
  for (var i = 0; i < mats.length; i++) { if (mats[i].source === 'demo' && !mats[i].deleted) { await softDelete('materials', mats[i].id); delM++; } }
  var recs = await DB.all('records');                                                                                   // 找示例记录
  var delR = 0;
  for (var j = 0; j < recs.length; j++) { if (recs[j].source === 'demo' && !recs[j].deleted) { await softDelete('records', recs[j].id); delR++; } }
  await Log.add('撤回示例数据', '删除示例物料 ' + delM + ' 种、记录 ' + delR + ' 条');                                       // 日志
  await State.refreshMaterials();                                                                                           // 刷新
  toast('已撤回示例数据（物料 ' + delM + '，记录 ' + delR + '）', 'ok');                                                       // 提示
  PageCache = {};                                                                                                         // 作废缓存
  pageData();                                                                                                                // 刷新页
}

/* 所有数据初始化（恢复出厂：清空全部业务数据/设置/账号，重置默认 admin/DEFAULT_ADMIN_PWD） */
async function factoryReset() {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('只有管理员可以初始化', 'err'); return; }
  /* 默认密码只在用兜底账号 admin 登录时才显示 —— 和欢迎弹窗一个口径。
     否则别的管理员点一次"初始化"就又把它看去了。 */
  var isBootstrapAdmin = !!(Auth.user && Auth.user.username === 'admin');        // 是不是那个兜底管理员账号
  var ok = await confirmBox('将清空【全部数据】并恢复到系统刚安装的初始状态：\n· 所有物料、出入库记录、操作日志、配料/BOM 项目全部删除\n· AI 配置等所有设置清空\n· 账号重置为默认管理员 admin' + (isBootstrapAdmin ? ' / ' + DEFAULT_ADMIN_PWD : '（默认密码）') + '\n\n⚠ 重置后【你现在用的这个账号也会被删除】，需要用 admin + 默认密码重新登录。不知道默认密码的话，请先向设置它的人确认，否则会进不去。\n\n⚠ 已开启多端同步时，此操作会连同云端和其他设备上的数据一起清空。\n\n此操作不可撤销，建议先到上面导出全库备份！确定继续吗？', '初始化');
  if (!ok) return;

  /* 1) 业务数据：逐条打"删除墓碑"，而不是直接清表。
     直接清表（DB.clear）不留痕迹，同步引擎没东西可传，别的设备就完全不知道
     "这些数据被删了"，会一直显示旧数据，还会和之后新建的数据叠成重复。
     打墓碑之后，"删除"这个动作本身才能同步出去，各端才会一起清干净。 */
  var stores = ['materials', 'records', 'logs'];                 // 需要同步出去的三张业务表
  for (var s = 0; s < stores.length; s++) {                      // 逐张表处理
    var rows = await DB.all(stores[s]);                          // 取出全部（含已有墓碑）
    for (var i = 0; i < rows.length; i++) {                      // 逐条
      if (!rows[i].deleted) await softDelete(stores[s], rows[i].id);  // 还没删的才打墓碑（避免重复盖时间戳）
    }
  }

  /* 2) 账号：除"兜底管理员"外全部打墓碑，兜底管理员重置为默认密码和角色。
     为什么单独留这一条：它的 id 是写死的（user_bootstrap_admin），各台设备都指向同一条记录。
     早期版本每台设备第一次打开都会各自生成一个随机 id 的同名 admin，同步之后
     服务器上就堆出好几个 admin，怎么删都删不干净 —— 保留固定 id 才能根治。 */
  var users = await DB.all('users');                             // 全部账号
  for (var u = 0; u < users.length; u++) {                       // 逐条
    if (users[u].id === 'user_bootstrap_admin') continue;         // 兜底管理员留到最后统一重置
    if (!users[u].deleted) await softDelete('users', users[u].id);  // 其余打墓碑
  }
  var salt = uid('salt');                                        // 新的随机盐
  var hash = await hashPassword(DEFAULT_ADMIN_PWD, salt);        // 默认密码的哈希
  await DB.put('users', {                                        // 写回兜底管理员（重置为默认状态）
    id: 'user_bootstrap_admin', username: 'admin', passwordHash: hash, salt: salt,
    role: 'admin', active: true, createdAt: Date.now(), updatedAt: Date.now(), lastLogin: null
  });

  /* 3) 本机专用数据：AI 配置、配料项目、界面偏好等本来就不参与同步，直接清掉即可。
     但同步进度（syncConfig 里的 lastSync）必须留着 —— 连它一起清掉的话，
     下次同步会"从零全量拉一遍"，把服务器上的历史垃圾数据又拉回本机。 */
  var keepSync = await DB.getSetting('syncConfig', null);         // 先把同步进度存下来
  await DB.clear('ai_projects');                                  // 配料/BOM 项目（不同步）
  await DB.clear('settings');                                     // 全部设置
  if (keepSync) await DB.setSetting('syncConfig', keepSync);       // 把同步进度写回去

  /* 4) 让服务器以本机为"完整快照"，把本机没有的行也一并打成墓碑。
     只清本机是不够的：服务器和其他设备上还留着一些"只在那儿存在过"的历史残留，
     本机根本没有它们的记录，传不出删除动作。必须由服务器按快照比对才能清掉。 */
  if (typeof Sync !== 'undefined' && Sync.pushFullSnapshot) {
    try {
      await Sync.pushFullSnapshot();                                // 通知服务器按本机快照清理
    } catch (e) {
      /* 没联网 / 没开同步时跳过：本机初始化照样完成，只是云端清不掉 */
      toast('本机已初始化，但云端数据未清理：' + e.message, 'err');
    }
  }

  PageCache = {}; LastPath = '';                                  // 作废页面缓存
  location.reload();                                              // 刷新页面，回到干净的初始状态
}
