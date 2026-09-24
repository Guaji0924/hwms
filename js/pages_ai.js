/* ============================================================
   pages_ai.js —— 智能配料 + AI 接入
   ------------------------------------------------------------
   内容：
   1. callLLM()           调用 OpenAI 兼容接口（DeepSeek/智谱/Ollama...）
   2. pageAI()            智能配料页面
   3. localRecipeMatch()  本地配料引擎（断网也能用，内置常见项目模板）
   4. buildPlanFromNeeds() 把需求清单匹配到库存物料，区分充足/不足
   5. aiExplainMaterial() 物料详情页的 AI 用途介绍
   6. openPhotoRecog()    拍照识别：拍/选一张元件照片，AI 识别后一键带入新增物料表单
   ============================================================ */

/* ==================== 1. 通用 LLM 调用 ==================== */

/**
 * 调用 OpenAI 兼容的对话接口
 * messages: [{role, content}] 标准消息数组
 * cfgOverride: 临时配置（测试连接用），不传则读数据库里保存的配置
 * 返回：模型回复的文本；失败抛出 Error
 */
async function callLLM(messages, cfgOverride) {
  var cfg = cfgOverride;                                               // 优先用临时配置
  if (!cfg) {                                                          // 没传就读库
    cfg = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });  // 默认配置
  }
  if (!cfg.enabled || !cfg.url) throw new Error('AI 未启用或未配置接口地址');  // 检查
  var res = await fetch(cfg.url, {                                      // 发起请求
    method: 'POST',                                                     // POST 方法
    headers: {                                                           // 请求头
      'Content-Type': 'application/json',                                // JSON 格式
      'Authorization': 'Bearer ' + (cfg.key || '')                       // 鉴权（Key）
    },
    body: JSON.stringify({                                               // 请求体
      model: cfg.model || 'deepseek-chat',                                // 模型名
      messages: messages,                                                  // 消息列表
      temperature: 0.3                                                     // 低温度：结果稳定
    })
  });
  if (!res.ok) {                                                          // HTTP 出错
    var errText = '';                                                      // 错误详情
    try { errText = (await res.text()).slice(0, 200); } catch (e) {}        // 尽量取出文本
    throw new Error('HTTP ' + res.status + ' ' + errText);                  // 抛出
  }
  var data = await res.json();                                              // 解析 JSON
  if (data.choices && data.choices[0] && data.choices[0].message) {          // 标准返回
    return data.choices[0].message.content;                                   // 回复文本
  }
  throw new Error('接口返回格式异常');                                         // 格式不对
}

/* 从 AI 回复文本中提取 JSON 数组（容错：模型有时会在 JSON 外面加说明文字） */
function extractJSONArray(text) {
  var start = text.indexOf('[');                                            // 第一个 [
  var end = text.lastIndexOf(']');                                            // 最后一个 ]
  if (start < 0 || end <= start) return null;                                  // 没有 JSON
  try { return JSON.parse(text.slice(start, end + 1)); }                        // 解析
  catch (e) { return null; }                                                    // 失败返回空
}

/* 从 AI 回复文本中提取 JSON 对象（拍照识别用：模型返回的是一个 {...}） */
function extractJSONObject(text) {
  var start = text.indexOf('{');                                              // 第一个 {
  var end = text.lastIndexOf('}');                                              // 最后一个 }
  if (start < 0 || end <= start) return null;                                    // 没有 JSON
  try { return JSON.parse(text.slice(start, end + 1)); }                          // 解析
  catch (e) { return null; }                                                      // 失败返回空
}

/* ==================== 2. 智能配料页 ==================== */

/* 当前配料计划（领用时用） */
var PlanState = null;

async function pageAI() {
  var ai = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });  // 读 AI 配置
  var aiReady = ai.enabled && ai.url;                                                                // AI 是否可用
  /* 示例需求（点一下自动填入） */
  var examples = ['做一个循迹小车', '做蓝牙遥控小车', '温湿度监测站', '智能台灯', 'RFID 门禁系统', '电子时钟', '自动浇花装置', '超声波测距仪'];
  var exHtml = '';                                                                                    // 示例 HTML
  for (var i = 0; i < examples.length; i++) {                                                          // 遍历
    exHtml += '<span class="tag-chip" onclick="$(\'#ai-need\').value=\'' + examples[i] + '\'">' + examples[i] + '</span> ';  // 可点示例
  }
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">智能配料</div><div class="page-desc">一句话描述需求，自动匹配元件库、区分库存充足/不足、生成取件清单</div></div>' +
      '<button class="btn btn-outline" onclick="openPhotoRecog()">' + ICONS.camera + '拍照识别元件</button>' +  // 拍照识别入口
    '</div>' +
    '<div class="card">' +
      '<div class="form-item" style="margin-bottom:10px"><label>你想做什么？</label>' +
        '<div class="ai-input-wrap">' +
          '<input class="input" id="ai-need" placeholder="例如：做一个循迹小车 / 我要测室内温湿度并显示出来 / 帮我配一个蓝牙遥控的两轮车" onkeydown="if(event.key===\'Enter\')runLocalMatch()" />' +
          '<button class="btn btn-primary btn-lg" onclick="runLocalMatch()">' + ICONS.ai + '智能匹配</button>' +
          (aiReady ? '<button class="btn btn-outline btn-lg" onclick="runAIMatch()">' + ICONS.ai + 'AI 分析</button>' : '<span class="form-hint" style="align-self:center">AI 未启用，使用内置本地引擎（可在设置中接入 AI）</span>') +
        '</div>' +
      '</div>' +
      '<div class="chips-row">' + exHtml + '</div>' +
    '</div>' +
    /* 匹配结果区（初始隐藏提示） */
    '<div id="ai-result"><div class="card"><div class="empty"><div class="e-ico">🤖</div>输入需求后点"智能匹配"，系统自动从元件库配齐物料清单</div></div></div>';
}

/* --- 2.1 本地模板匹配 --- */

function runLocalMatch() {
  var text = $('#ai-need').value.trim();                                   // 用户需求
  if (!text) { toast('请先输入你想做什么', 'warn'); return; }                 // 校验
  var result = localRecipeMatch(text);                                       // 引擎跑起来
  if (result.note) toast(result.note, 'info');                                // 引擎提示
  renderPlan(result);                                                         // 渲染结果
}

/**
 * 本地智能配料引擎：
 * 1. 命中 RECIPES 模板关键词 → 用模板的清单
 * 2. 没命中模板 → 把整句话拆词，直接搜元件库
 */
function localRecipeMatch(text) {
  var t = text.toLowerCase();                                                  // 统一小写
  /* 第一步：模板匹配 */
  var hits = [];                                                                 // 命中的模板
  for (var i = 0; i < RECIPES.length; i++) {                                      // 遍历模板
    var recipe = RECIPES[i];                                                       // 当前模板
    var score = 0;                                                                  // 命中分
    for (var k = 0; k < recipe.keys.length; k++) {                                  // 遍历触发词
      if (t.indexOf(recipe.keys[k].toLowerCase()) >= 0) score++;                     // 命中计分
    }
    if (score > 0) hits.push({ recipe: recipe, score: score });                       // 收集
  }
  hits.sort(function (a, b) { return b.score - a.score; });                             // 高分在前
  var needs = [];                                                                        // 需求清单
  var note = '';                                                                          // 提示
  if (hits.length > 0) {                                                                  // 命中模板
    var topScore = hits[0].score;                                                            // 最高分
    for (var h = 0; h < hits.length; h++) {                                                   // 高分模板都合并（如"蓝牙循迹小车"）
      if (hits[h].score < topScore) break;                                                      // 低分的不要
      var ns = hits[h].recipe.needs;                                                            // 模板需求
      for (var n = 0; n < ns.length; n++) {                                                      // 遍历
        var exist = null;                                                                         // 是否已有同类需求
        for (var e = 0; e < needs.length; e++) { if (needs[e].kw === ns[n].kw) { exist = needs[e]; break; } }  // 查重
        if (exist) { exist.n = Math.max(exist.n, ns[n].n); continue; }                              // 已有取大
        needs.push({ kw: ns[n].kw, n: ns[n].n, why: ns[n].why + '（' + hits[h].recipe.name + '）' });  // 新增
      }
    }
    note = '已匹配项目模板：' + hits[0].recipe.name + (hits.length > 1 ? ' 等 ' + hits.length + ' 个' : '');  // 提示
  } else {                                                                                    // 没命中模板
    note = '没有完全匹配的项目模板，改为直接按关键词搜元件库';                                     // 提示
    var words = t.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(function (w) { return w.length >= 2; });  // 拆词
    var seen = {};                                                                            // 去重
    for (var w = 0; w < words.length; w++) {                                                    // 遍历词
      if (seen[words[w]]) continue;                                                              // 重复跳过
      seen[words[w]] = 1;                                                                         // 标记
      needs.push({ kw: words[w], n: 1, why: '根据你的描述' });                                       // 每词需求 1 个
    }
  }
  return buildPlanFromNeeds(text, needs, note);                                                   // 匹配库存
}

/* --- 2.2 AI 分析匹配 --- */

async function runAIMatch() {
  var text = $('#ai-need').value.trim();                                     // 需求
  if (!text) { toast('请先输入你想做什么', 'warn'); return; }                  // 校验
  $('#ai-result').innerHTML = '<div class="card"><div class="empty">AI 正在分析需求……（需要联网，约几秒钟）</div></div>';  // 加载中
  try {                                                                                             // 容错
    /* 收集库存类别信息帮助 AI 理解 */
    var catInfo = '';                                                                                  // 类别串
    for (var i = 0; i < CAT_TREE.length; i++) { catInfo += CAT_TREE[i].name + '（' + CAT_TREE[i].subs.join('/') + '）；'; }  // 拼
    var sysPrompt = '你是电子协会的物料管理员。用户会描述一个电子DIY项目需求，你需要列出所需的典型物料清单。' +  // 系统提示
      '协会库存的分类体系是：' + catInfo + '。' +
      '只输出 JSON 数组，不要任何多余文字，格式：[{"name":"物料名或类别","qty":数字,"why":"用途简述"}]。' +
      '数量合理即可（如 LED 8 个、开发板 1 个）。控制在 12 项以内。';                                        // 格式要求
    var reply = await callLLM([{ role: 'system', content: sysPrompt }, { role: 'user', content: text }]);  // 调 AI
    var arr = extractJSONArray(reply);                                                                  // 解析 JSON
    if (!arr || arr.length === 0) throw new Error('AI 返回的清单无法解析');                                 // 解析失败
    var needs = [];                                                                                       // 转需求清单
    for (var a = 0; a < arr.length; a++) {                                                                  // 遍历
      if (!arr[a].name) continue;                                                                             // 无名跳过
      needs.push({ kw: String(arr[a].name), n: parseInt(arr[a].qty, 10) || 1, why: String(arr[a].why || '') });  // 装入
    }
    var plan = buildPlanFromNeeds(text, needs, 'AI 已分析需求（模型：' + (await DB.getSetting('aiConfig', {})).model + '）');  // 匹配库存
    plan.aiNote = reply;                                                                                       // 保留 AI 原话
    renderPlan(plan);                                                                                           // 渲染
  } catch (err) {                                                                                                // 失败
    toast('AI 分析失败：' + err.message + '，已回退到本地引擎', 'warn');                                            // 提示
    runLocalMatch();                                                                                              // 本地兜底
  }
}

/* --- 2.3 需求清单 → 库存匹配 --- */
/**
 * 把需求列表逐一在元件库里找物料，生成完整配料计划
 * 返回：{text, note, aiNote, items: [{material, needQty, have, status, why}], missing: [{kw, n, why}]}
 */
function buildPlanFromNeeds(text, needs, note) {
  var items = [];                                                                                                   // 已匹配项
  var missing = [];                                                                                                   // 库存没有的
  var usedIds = {};                                                                                                    // 已用物料（去重）
  for (var i = 0; i < needs.length; i++) {                                                                               // 遍历需求
    var need = needs[i];                                                                                                 // 当前需求
    var keywords = String(need.kw).split('|').map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return s; });  // 按竖线拆多个关键词
    var best = null;                                                                                                      // 最佳匹配物料
    for (var kk = 0; kk < keywords.length && !best; kk++) {                                                                 // 逐个关键词找
      var found = Search.query(keywords[kk]);                                                                               // 搜元件库
      for (var f = 0; f < found.length; f++) {                                                                               // 遍历结果
        if (usedIds[found[f].id]) continue;                                                                                   // 已被用过跳过
        best = found[f];                                                                                                       // 取第一个
        break;                                                                                                                  // 停
      }
    }
    if (!best) {                                                                                                                // 元件库里没有
      missing.push({ kw: need.kw, n: need.n, why: need.why });                                                                     // 进购买清单
      continue;                                                                                                                    // 下一个
    }
    usedIds[best.id] = true;                                                                                                        // 标记已用
    var status = best.stock >= need.n ? 'ok' : (best.stock > 0 ? 'low' : 'none');                                                     // 充足/不足/缺货
    items.push({ material: best, needQty: need.n, have: best.stock, status: status, why: need.why || '' });                           // 装入
  }
  return { text: text, note: note || '', items: items, missing: missing };                                                             // 完整计划
}

/* --- 2.4 渲染配料结果 --- */

function renderPlan(plan) {
  PlanState = plan;                                                                                                                         // 全局保存（领用要用）
  /* 可直接领用部分 */
  var okRows = '';                                                                                                                            // 充足行
  for (var i = 0; i < plan.items.length; i++) {                                                                                                 // 遍历
    var it = plan.items[i];                                                                                                                       // 当前
    var m = it.material;                                                                                                                            // 物料
    var stBadge = it.status === 'ok' ? '<span class="badge badge-green">库存充足</span>' : it.status === 'low' ? '<span class="badge badge-yellow">数量不足</span>' : '<span class="badge badge-red">库存为空</span>';  // 状态徽章
    okRows += '<div class="ai-plan-item">' +
      '<div class="p-name"><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + (it.why ? ' · ' + escapeHtml(it.why) : '') + '</div></div>' +
      '<span class="badge badge-gray">' + ICONS.loc + ' ' + escapeHtml(m.loc || '位置未填') + '</span>' +
      '<span style="font-size:12.5px">需要 <b>' + it.needQty + '</b> ' + escapeHtml(m.unit || '') + ' · 现有 ' + it.have + '</span>' +
      stBadge +
      '</div>';
  }
  if (plan.items.length === 0) okRows = '<div class="empty">元件库里没有匹配到相关物料</div>';                                                       // 空状态
  /* 需要购买部分 */
  var buyRows = '';                                                                                                                                  // 购买行
  for (var b = 0; b < plan.missing.length; b++) {                                                                                                     // 遍历
    var ms = plan.missing[b];                                                                                                                          // 当前
    buyRows += '<div class="ai-plan-item" style="border-style:dashed">' +
      '<div class="p-name">' + escapeHtml(ms.kw) + '<div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(ms.why || '元件库中没有，需采购') + '</div></div>' +
      '<span style="font-size:12.5px">建议购买 <b>' + ms.n + '</b> 个</span>' +
      '</div>';
  }
  if (plan.missing.length === 0) buyRows = '<div class="empty">太棒了！所需物料全部有库存</div>';                                                     // 全齐
  /* 输出 */
  $('#ai-result').innerHTML =
    (plan.note ? '<div class="ai-quote" style="margin-bottom:14px">' + escapeHtml(plan.note) + '</div>' : '') +                                   // 引擎提示
    (plan.aiNote ? '<div class="ai-quote" style="margin-bottom:14px">AI 说：' + escapeHtml(String(plan.aiNote).slice(0, 400)) + '</div>' : '') +     // AI 原话
    '<div class="ai-result-grid">' +
      '<div class="card"><div class="card-title">可直接领用（' + plan.items.length + ' 项）' +
        '<span class="more"><button class="btn btn-sm btn-outline" onclick="printPickList()">打印取件单</button>' +
        ' <button class="btn btn-sm btn-primary" onclick="openClaimModal()">' + ICONS.out + '按清单领用</button></span></div>' + okRows + '</div>' +
      '<div class="card"><div class="card-title">需要购买（' + plan.missing.length + ' 项）' +
        '<span class="more"><button class="btn btn-sm btn-outline" onclick="copyBuyList()">复制购买清单</button></span></div>' + buyRows + '</div>' +
    '</div>';
}

/* 打印取件单（含存放位置，去货架找东西方便） */
function printPickList() {
  if (!PlanState) return;                                                                                                                               // 没计划
  var w = window.open('', '_blank');                                                                                                                      // 新窗口
  if (!w) { toast('浏览器拦截了弹窗，请允许弹窗后重试', 'err'); return; }                                                        // 拦截
  var rows = '';                                                                                                                                          // 行
  for (var i = 0; i < PlanState.items.length; i++) {                                                                                                         // 遍历
    var it = PlanState.items[i];                                                                                                                                // 当前
    rows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(it.material.name) + '</td><td>' + escapeHtml(it.material.model || '') + '</td><td><b>' + it.needQty + ' ' + escapeHtml(it.material.unit || '') + '</b></td><td>' + escapeHtml(it.material.loc || '') + '</td></tr>';  // 行
  }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>取件清单</title>' +                            // 页面头
    '<style>body{font-family:"Microsoft YaHei",sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;font-size:13px;margin-top:0}' +
    'table{width:100%;border-collapse:collapse;font-size:14px}td,th{border:1px solid #bbb;padding:8px 10px;text-align:left}' +
    'th{background:#eee}.loc{color:#4f46e5;font-weight:bold}@media print{.noprint{display:none}}</style></head><body>' +
    '<h2>取件清单</h2><p>需求：' + escapeHtml(PlanState.text) + ' · 打印时间：' + fmtDate(Date.now()) + ' · 打印人：' + escapeHtml(Auth.user ? Auth.user.username : '') + '</p>' +  // 头
    '<table><tr><th>#</th><th>名称</th><th>型号</th><th>数量</th><th>存放位置</th></tr>' + rows + '</table>' +            // 表
    '<p class="noprint" style="margin-top:20px"><button onclick="window.print()">点击打印</button></p>' +                  // 打印按钮
    '</body></html>');                                                                                                       // 页尾
  w.document.close();                                                                                                        // 完成
}

/* 复制购买清单 */
async function copyBuyList() {
  if (!PlanState || PlanState.missing.length === 0) { toast('没有需要购买的物料', 'ok'); return; }                            // 空清单
  var text = '【智能控制协会·采购清单】\n需求：' + PlanState.text + '\n时间：' + fmtDate(Date.now()) + '\n';                     // 文本头
  for (var i = 0; i < PlanState.missing.length; i++) {                                                                            // 遍历
    var ms = PlanState.missing[i];                                                                                                  // 当前
    text += (i + 1) + '. ' + ms.kw + ' × ' + ms.n + '（' + (ms.why || '元件库没有') + '）\n';                                          // 行
  }
  try {                                                                                                                               // 复制
    await navigator.clipboard.writeText(text);                                                                                          // API
    toast('采购清单已复制，可粘贴到群里发起拼单', 'ok');                                                                                    // 提示
  } catch (err) {                                                                                                                        // 旧浏览器
    openModal('采购清单（手动复制）', '<textarea class="textarea" style="min-height:220px">' + escapeHtml(text) + '</textarea>');              // 展示
  }
}

/* 打开批量领用确认弹窗 */
function openClaimModal() {
  if (!PlanState || PlanState.items.length === 0) { toast('没有可领用的物料', 'warn'); return; }                                 // 空计划
  var rows = '';                                                                                                                    // 领用行
  for (var i = 0; i < PlanState.items.length; i++) {                                                                                // 遍历
    var it = PlanState.items[i];                                                                                                      // 当前
    var defaultQty = Math.min(it.needQty, it.have);                                                                                     // 默认领 min(需要,现有)
    var disabled = it.have <= 0 ? 'disabled' : '';                                                                                       // 没库存禁用
    rows += '<div class="ai-plan-item" style="padding:8px 10px">' +
      '<div class="p-name" style="min-width:180px">' + escapeHtml(it.material.name) + '</div>' +
      '<span style="font-size:12px;color:var(--text-sub)">需要 ' + it.needQty + ' / 现有 ' + it.have + '</span>' +
      '<input class="input" type="number" min="0" max="' + it.have + '" value="' + defaultQty + '" data-mid="' + it.material.id + '" data-mname="' + escapeHtml(it.material.name) + '" style="width:84px;padding:6px 8px" ' + disabled + ' />' +
      '</div>';
  }
  openModal('按清单领用确认', '' +
    '<div class="form-hint" style="margin-bottom:10px">已按"需要量与库存取小"预填，可自行调整数量；填 0 表示跳过该项</div>' +
    rows +
    '<div class="form-item" style="margin-top:14px"><label>关联项目（报账统计用）</label><input class="input" id="claim-project" value="智能配料：' + escapeHtml(PlanState.text.slice(0, 30)) + '" /></div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="submitClaim()">' + ICONS.out + '确认领用并扣库存</button>', true);
}

/* 提交批量领用 */
async function submitClaim() {
  var inputs = $$('#modal-mask input[data-mid]');                                                                                     // 所有数量输入框
  var project = $('#claim-project').value.trim() || '智能配料领用';                                                                        // 项目名
  var successCount = 0;                                                                                                                   // 成功数
  var totalQty = 0;                                                                                                                        // 总数量
  for (var i = 0; i < inputs.length; i++) {                                                                                                  // 遍历
    var inp = inputs[i];                                                                                                                       // 当前框
    if (inp.disabled) continue;                                                                                                                  // 禁用的跳过
    var qty = parseInt(inp.value, 10);                                                                                                              // 数量
    if (isNaN(qty) || qty <= 0) continue;                                                                                                             // 0 或非法跳过
    var mid = inp.getAttribute('data-mid');                                                                                                            // 物料 id
    var ok = await applyStockRecord(mid, 'out', qty, {                                                                                                     // 扣库存+记录（统一用"出库"类型）
      project: project,                                                                                                                                     // 项目
      remark: '智能配料领用：' + (PlanState.text || '').slice(0, 40)                                                                                          // 备注
    });
    if (ok) { successCount++; totalQty += qty; }                                                                                                                // 计数
  }
  closeModal();                                                                                                                                                   // 关弹窗
  if (successCount > 0) {                                                                                                                                           // 有成功
    toast('领用完成：共领 ' + successCount + ' 种物料、' + totalQty + ' 件，记录已存档', 'ok');                                              // 提示
    var aiNeed = $('#ai-need');                                                                                                                                        // 输入框
    if (aiNeed && PlanState) {                                                                                                                                        // 还在本页
      $('#ai-result').innerHTML = '<div class="card"><div class="empty"><div class="e-ico">✅</div>本次已按清单领用 ' + successCount + ' 种物料<br>去"历史追溯"可以查到这笔领用记录，去"统计报表"可以看项目花费</div></div>';  // 结果
    }
    PlanState = null;                                                                                                                                                  // 清计划
  } else {                                                                                                                                                                // 全失败
    toast('没有领用任何物料（数量都是 0？）', 'warn');                                                                                                                        // 提示
  }
}

/* ==================== 3. 物料详情页的 AI 用途介绍 ==================== */

async function aiExplainMaterial(id) {
  var m = null;                                                                                                                                                           // 目标物料
  for (var i = 0; i < State.materials.length; i++) {                                                                                                                        // 查找
    if (State.materials[i].id === id) { m = State.materials[i]; break; }                                                                                                       // 命中
  }
  if (!m) return;                                                                                                                                                             // 没有
  var box = $('#ai-intro');                                                                                                                                                    // 介绍区域
  var ai = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });                                                                                       // AI 配置
  if (!ai.enabled || !ai.url) {                                                                                                                                                    // 没配 AI
    box.innerHTML = '<span style="color:var(--warning)">未配置 AI。可先手动在"编辑物料"里填写用途描述；或在"系统设置"中接入 AI 后一键生成。</span>';                                      // 提示
    return;                                                                                                                                                                            // 结束
  }
  box.innerHTML = 'AI 正在生成介绍……（需联网）';                                                                                                                                        // 加载中
  try {                                                                                                                                                                                    // 容错
    var prompt = '用中文介绍电子元件"'+ m.name + '"（型号' + (m.model || '未知') + '，分类' + m.cat + '/' + (m.sub || '') + '）。' +                                                           // 提示词
      '请分三段输出，每段不超过 60 字：1、它是什么；2、典型用途和适合的项目；3、新手使用注意事项。用 <br> 分段，直接输出内容。';                                                              // 要求
    var reply = await callLLM([{ role: 'user', content: prompt }]);                                                                                                                           // 调用
    box.innerHTML = escapeHtml(String(reply)).replace(/\n/g, '<br>');                                                                                                                        // 显示
    if (!m.desc) {                                                                                                                                                                              // 物料还没描述
      m.desc = String(reply).slice(0, 500);                                                                                                                                                       // 顺便存一份
      m.updatedAt = Date.now();                                                                                                                                                                     // 时间
      delete m._search;                                                                                                                                                                              // 清索引
      await DB.put('materials', m);                                                                                                                                                                  // 写库
      await State.refreshMaterials();                                                                                                                                                                 // 刷新
      toast('介绍已生成并保存到物料描述', 'ok');                                                                                                                                                        // 提示
    }
  } catch (err) {                                                                                                                                                                                          // 失败
    box.innerHTML = '<span style="color:var(--danger)">AI 生成失败：' + escapeHtml(err.message) + '</span><br>' + escapeHtml(m.desc || '');                                                                    // 错误+原描述
  }
}

/* ==================== 4. 拍照识别物料 ==================== */
/**
 * 流程：拍/选一张元件照片 → 压缩 → 发给支持"看图"的 AI 模型（多模态）
 *      → 模型返回 {名称/型号/分类/单位/描述/标签} → 一键带入"新增物料"表单
 * 注意：识别图片需要多模态模型，例如：
 *      Ollama 本地：qwen2.5vl / llava / minicpm-v（记得先 ollama pull）
 *      云端：智谱 GLM-4V 系列。纯文本模型（DeepSeek 等）不能看图。
 */

/* 拍照识别的临时状态：当前照片 + 最近一次识别结果 + 摄像头取景流 */
var PRState = { dataUrl: '', result: null, busy: false, camStream: null };

/* 打开拍照识别弹窗 */
function openPhotoRecog() {
  prStopCamera();                                                      // 先关掉可能残留的摄像头
  PRState.dataUrl = '';                                                // 清空旧照片
  PRState.result = null;                                               // 清空旧结果
  openModal('拍照 / 贴图识别物料', '' +
    '<div class="form-hint" style="margin-bottom:12px">三种方式放图：<b>点方框拍照/选图</b>（手机可选相机）、<b>调用电脑摄像头</b>取景、<b>Ctrl+V 直接粘贴截图</b>。识别后既能入库新增物料，也能在库存里查同款直接出库领用。<br>需要支持看图的模型：Ollama 本地拉取 <b>qwen2.5vl / llava</b>，或云端 <b>GLM-4V</b>（DeepSeek 等纯文本模型不支持）。</div>' +
    '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
      /* 左边：取景/预览大方块 + 摄像头按钮 */
      '<div style="flex-shrink:0">' +
        '<div id="pr-preview" onclick="prBoxClick()" style="width:150px;height:150px;border:1.5px dashed var(--border);border-radius:10px;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;cursor:pointer;background:var(--bg-soft);overflow:hidden"></div>' +
        '<button class="btn btn-outline btn-sm" style="width:150px;margin-top:8px" onclick="prOpenCamera()">📷 调用摄像头取景</button>' +
      '</div>' +
      /* 右边：隐藏选图框 + 模型选择 + 开始识别按钮 */
      '<div style="flex:1;min-width:200px">' +
        '<input type="file" id="pr-file" accept="image/*" style="display:none" onchange="prPick(this)" />' +  // 手机上会出现"拍照"选项
        '<div class="form-item"><label>识别模型（可选，留空用系统设置里的模型）</label>' +
          '<input class="input" id="pr-model" placeholder="如：qwen2.5vl / llava / glm-4v-flash" /></div>' +
        '<button class="btn btn-primary" id="pr-run-btn" onclick="prRun()">' + ICONS.ai + '开始识别</button>' +
        '<div class="form-hint" style="margin-top:8px">照片会自动压缩到 640px 再发送，省流量；也可以直接把截图 Ctrl+V 粘贴进来</div>' +
      '</div>' +
    '</div>' +
    '<div id="pr-result"></div>',                                        // 识别结果区（初始为空）
    '<button class="btn" onclick="prClose()">关闭</button>', false);
  renderPrPreview();                                                   // 渲染初始的拍照框
  document.addEventListener('paste', prPasteHandler);                   // 监听 Ctrl+V：可直接粘贴图片
}

/* 关闭识别弹窗：顺手停掉摄像头、解绑粘贴监听 */
function prClose() {
  prStopCamera();                                                      // 释放摄像头（熄灭指示灯）
  document.removeEventListener('paste', prPasteHandler);                // 解绑粘贴监听
  closeModal();                                                        // 关弹窗
}

/* 点击左侧大方框：摄像头取景中不响应，否则打开选图 */
function prBoxClick() {
  if (PRState.camStream) return;                                       // 正在取景，忽略点击
  var input = $('#pr-file');                                           // 隐藏的选图框
  if (input) input.click();                                            // 触发选图
}

/* 渲染拍照框：摄像头取景中显示实时画面，没照片时显示占位，有照片时显示预览图 */
function renderPrPreview() {
  var box = $('#pr-preview');                                          // 容器
  if (!box) return;                                                    // 弹窗已关闭
  if (PRState.camStream) {                                             // 取景中：显示实时画面 + 拍照按钮
    box.style.position = 'relative';                                   // 按钮条需要绝对定位
    box.innerHTML = '<video id="pr-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>' +
      '<div style="position:absolute;left:0;right:0;bottom:0;display:flex;gap:4px;padding:4px">' +
        '<button class="btn btn-primary btn-sm" style="flex:1" onclick="prSnap()">拍照</button>' +
        '<button class="btn btn-sm" onclick="prStopCamBtn()">取消</button>' +
      '</div>';
    var v = $('#pr-video');                                            // 视频元素
    if (v) v.srcObject = PRState.camStream;                             // 喂入摄像头画面
    return;
  }
  box.style.position = '';                                             // 恢复默认定位
  if (PRState.dataUrl) {                                               // 已有照片：显示预览
    box.innerHTML = '<img src="' + PRState.dataUrl + '" style="width:100%;height:100%;object-fit:cover" />';
  } else {                                                             // 还没照片：显示占位
    box.innerHTML = '<span style="font-size:32px">📷</span><span style="font-size:12px;color:var(--text-sub)">点击拍照 / 选图</span>';
  }
}

/* 用户选好了照片：压缩后放进预览框 */
async function prPick(input) {
  var f = input.files && input.files[0];                               // 选中的第一张图
  if (!f) return;                                                      // 没选
  await prPickFromFile(f);                                             // 统一走"按文件放图"
  input.value = '';                                                    // 清空控件（同一张图可重选）
}

/* 按文件对象放图（选图 / 粘贴 / 拍照共用入口） */
async function prPickFromFile(f) {
  try {
    PRState.dataUrl = await compressImage(f, 640);                     // 压缩到 640px（识别够用、流量小）
    PRState.result = null;                                             // 换了照片，旧结果作废
    renderPrPreview();                                                 // 刷新预览
    var res = $('#pr-result');                                         // 结果区
    if (res) res.innerHTML = '';                                       // 清空旧结果
    toast('图片已就绪，点"开始识别"即可', 'ok');                          // 提示
  } catch (err) {
    toast('图片处理失败：' + err.message, 'err');                        // 压缩失败提示
  }
}

/* Ctrl+V 粘贴截图 / 复制的图片（弹窗打开期间有效） */
function prPasteHandler(e) {
  if (!$('#pr-preview')) {                                             // 弹窗已关闭
    document.removeEventListener('paste', prPasteHandler);              // 自我解绑
    return;
  }
  var items = e.clipboardData && e.clipboardData.items;                 // 剪贴板内容
  if (!items) return;                                                  // 拿不到就不管
  for (var i = 0; i < items.length; i++) {                             // 逐项找图片
    if (items[i].type && items[i].type.indexOf('image') === 0) {        // 图片类型
      var f = items[i].getAsFile();                                    // 转成文件对象
      if (f) { prPickFromFile(f); e.preventDefault(); }                 // 放图并阻止默认粘贴行为
      break;                                                           // 只处理第一张
    }
  }
}

/* 调用电脑 / 手机摄像头进入取景 */
async function prOpenCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('当前环境不支持调用摄像头（请用 https 或本地打开），可改用上传图片', 'err');  // 环境不支持
    return;
  }
  if (PRState.camStream) { prStopCamBtn(); return; }                    // 已在取景：再点一次当"取消"
  try {
    PRState.camStream = await navigator.mediaDevices.getUserMedia({      // 请求摄像头（优先后置，电脑上给前置/默认摄像头）
      video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false
    });
    PRState.dataUrl = '';                                                // 进入取景，旧照片先放一边
    renderPrPreview();                                                   // 切到实时画面
  } catch (err) {
    toast('无法打开摄像头：' + err.message + '，可改用上传图片', 'err');    // 权限被拒 / 设备占用等
  }
}

/* 取景中点"取消"：只停摄像头，不关弹窗 */
function prStopCamBtn() {
  prStopCamera();                                                        // 停流
  renderPrPreview();                                                     // 回到占位 / 照片状态
}

/* 真正停止摄像头流并释放设备 */
function prStopCamera() {
  if (PRState.camStream) {                                               // 有流才需要停
    var tracks = PRState.camStream.getTracks();                          // 取所有轨道
    for (var i = 0; i < tracks.length; i++) tracks[i].stop();             // 逐个停止
    PRState.camStream = null;                                            // 清空
  }
}

/* 取景中点"拍照"：截取当前帧作为识别照片 */
function prSnap() {
  var v = $('#pr-video');                                                // 视频元素
  if (!v || !PRState.camStream) return;                                  // 没在取景就不管
  var w = v.videoWidth || 640, h = v.videoHeight || 480;                  // 实际画面尺寸
  var scale = Math.min(1, 640 / w);                                      // 目标宽 640px
  var canvas = document.createElement('canvas');                          // 离屏画布
  canvas.width = Math.round(w * scale);                                   // 缩放后宽
  canvas.height = Math.round(h * scale);                                  // 缩放后高
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height); // 截一帧画上去
  PRState.dataUrl = canvas.toDataURL('image/jpeg', 0.85);                 // 转 dataURL 存起来
  prStopCamera();                                                          // 拍完即停摄像头
  PRState.result = null;                                                    // 旧结果作废
  renderPrPreview();                                                         // 显示刚拍的照片
  var res = $('#pr-result');                                                  // 结果区
  if (res) res.innerHTML = '';                                                // 清空旧结果
  toast('已拍照，点"开始识别"即可', 'ok');                                      // 提示
}

/* 开始识别：把照片发给视觉模型 */
async function prRun() {
  if (PRState.busy) return;                                            // 正在识别中，防连点
  if (!PRState.dataUrl) { toast('请先点击左边方框拍照或选图', 'warn'); return; }  // 没照片
  var cfg = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });  // 读 AI 配置
  if (!cfg.enabled || !cfg.url) {                                        // 没接入 AI
    toast('请先到"系统设置"接入 AI（局域网 Ollama 或云端接口）', 'warn');      // 引导
    return;
  }
  var model = ($('#pr-model') && $('#pr-model').value.trim()) || cfg.visionModel || cfg.model || '';  // 识别用模型：弹窗输入 > 保存过的 > 系统默认
  /* 拼"可选分类列表"给模型参考，避免它瞎编分类名 */
  var catInfo = '';
  for (var i = 0; i < CAT_TREE.length; i++) {                          // 遍历分类树
    catInfo += CAT_TREE[i].name + '（子类：' + CAT_TREE[i].subs.join('/') + '）\n';  // 一行一个母分类
  }
  /* 识别提示词：严格要求只输出 JSON 对象 */
  var prompt = '你是电子元件识别专家。请识别照片中的电子元件/模块，严格只输出一个 JSON 对象（不要 markdown 代码块、不要任何多余文字），字段如下：\n' +
    '{"name":"中文名称","model":"型号或丝印（识别不出就填空字符串）","cat":"母分类（必须从下面的分类列表中选）","sub":"子分类（从对应母分类的子类中选，不合适就填空字符串）","unit":"数量单位（个/块/米/包/卷 之一）","desc":"一句话用途描述，40字以内","tags":"2~4个标签，用英文逗号分隔"}\n' +
    '分类列表：\n' + catInfo;
  PRState.busy = true;                                                 // 上锁
  $('#pr-run-btn').disabled = true;                                    // 按钮置灰
  $('#pr-result').innerHTML = '<div class="empty" style="padding:16px">AI 正在看图识别……（首次可能较慢，请稍等）</div>';  // 加载提示
  try {
    /* 视觉消息格式：content 是数组，文本 + 图片（OpenAI 兼容写法，Ollama 也认） */
    var reply = await callLLM([{
      role: 'user',
      content: [
        { type: 'text', text: prompt },                                  // 文字部分
        { type: 'image_url', image_url: { url: PRState.dataUrl } }       // 图片部分（dataURL 直接内嵌）
      ]
    }], { enabled: cfg.enabled, url: cfg.url, key: cfg.key, model: model });  // 用弹窗里指定的模型
    var obj = extractJSONObject(String(reply));                        // 抠出 JSON
    if (!obj || !obj.name) throw new Error('返回内容无法解析：' + String(reply).slice(0, 120));  // 解析失败
    PRState.result = obj;                                              // 保存结果
    /* 渲染识别结果 + 操作按钮 */
    var tagsHtml = '';                                                   // 标签小片
    if (obj.tags) {                                                      // 有标签
      var tagArr = String(obj.tags).split(/[,，;；、]/);                   // 拆开
      for (var t = 0; t < tagArr.length; t++) {                          // 逐个
        if (tagArr[t].trim()) tagsHtml += '<span class="tag-chip">' + escapeHtml(tagArr[t].trim()) + '</span> ';  // 生成
      }
    }
    $('#pr-result').innerHTML =
      '<div class="card" style="margin-top:14px;background:var(--bg-soft)">' +
        '<div class="card-title" style="margin-bottom:8px">' + ICONS.ai + '识别结果</div>' +
        '<div style="font-size:13.5px;line-height:1.9">' +
          '<b>名称：</b>' + escapeHtml(obj.name) + '<br>' +                 // 名称
          (obj.model ? '<b>型号：</b>' + escapeHtml(obj.model) + '<br>' : '') +  // 型号（有才显示）
          '<b>分类：</b>' + escapeHtml(obj.cat || '未识别') + (obj.sub ? ' / ' + escapeHtml(obj.sub) : '') + '<br>' +  // 分类
          (obj.unit ? '<b>单位：</b>' + escapeHtml(obj.unit) + '<br>' : '') +      // 单位
          (obj.desc ? '<b>用途：</b>' + escapeHtml(obj.desc) : '');                  // 描述
    /* 补上标签行和按钮（上面字符串拼接到这里收尾） */
    $('#pr-result').innerHTML +=
      '</div>' +
      (tagsHtml ? '<div class="chips-row" style="margin-top:6px">' + tagsHtml + '</div>' : '') +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-primary" onclick="prToForm()">' + ICONS.plus + '按识别结果新增物料（入库）</button>' +
        '<button class="btn btn-outline" onclick="prFindInStock()">在库存中找同款（出库用）</button>' +
        '<button class="btn btn-outline" onclick="prRun()">重新识别</button>' +
      '</div>' +
      '<div class="form-hint" style="margin-top:8px">入库：识别结果带入新增表单，照片一并作为实物照；出库：自动在库里找同款，找到就能直接领用</div>' +
    '</div>';
    toast('识别完成：可入库新增，也可查库出库', 'ok');                      // 成功提示
  } catch (err) {                                                        // 失败
    $('#pr-result').innerHTML = '<div class="form-hint" style="color:var(--danger)">识别失败：' + escapeHtml(err.message) + '<br>常见原因：模型不支持看图（换 qwen2.5vl / llava / GLM-4V）、服务没开、或网络不通。</div>';  // 错误 + 排查提示
  }
  PRState.busy = false;                                                  // 解锁
  var btn = $('#pr-run-btn');                                            // 找按钮
  if (btn) btn.disabled = false;                                         // 恢复可用
}

/* 把识别结果一键带入"新增物料"表单（照片也一起带过去） */
function prToForm() {
  var r = PRState.result;                                              // 识别结果
  if (!r) return;                                                      // 没结果
  if (!Auth.can('manage')) { toast('您没有管理物料的权限，请联系管理员', 'warn'); return; }  // 权限检查
  openMaterialForm('');                                                // 打开新增物料弹窗（会替换当前弹窗，内部自动清空照片暂存区）
  mfPhotos = PRState.dataUrl ? [PRState.dataUrl] : [];                 // 把识别照片塞进暂存区当第一张实物照
  renderMfPhotos();                                                    // 刷新表单里的照片缩略图
  /* 按识别结果填字段 */
  $('#mat-form').querySelector('[name="name"]').value = String(r.name || '');      // 名称
  $('#mat-form').querySelector('[name="model"]').value = String(r.model || '');    // 型号
  $('#mat-form').querySelector('[name="desc"]').value = String(r.desc || '');      // 用途描述
  if (r.tags) {                                                        // 标签：统一换成英文逗号再填
    $('#mat-form').querySelector('[name="tags"]').value = String(r.tags).replace(/[，;；、]/g, ',');
  }
  /* 母分类：在分类树里就直接选，不在就走"自定义…"输入框 */
  var cat = String(r.cat || '');
  if (cat) {
    var inTree = false;                                                  // 是否是标准分类
    for (var c = 0; c < CAT_TREE.length; c++) { if (CAT_TREE[c].name === cat) { inTree = true; break; } }  // 查一查
    if (inTree) $('#mf-cat').value = cat;                                // 标准分类：直接选中
    else { $('#mf-cat').value = '自定义'; $('#mf-cat2').value = cat; }    // 自定义：填进自定义框
  }
  mfCatChanged();                                                        // 触发子分类下拉联动刷新
  /* 子分类：下拉里有就选，没有就走"自定义"输入框 */
  var sub = String(r.sub || '');
  if (sub) {
    var sel = $('#mf-sub');                                              // 子分类下拉
    var has = false;                                                     // 是否有这个选项
    for (var s = 0; s < sel.options.length; s++) { if (sel.options[s].value === sub) { has = true; break; } }  // 查一查
    if (has) sel.value = sub;                                            // 有：直接选
    else { sel.value = '自定义'; $('#mf-sub2').value = sub; }             // 没有：走自定义
    mfSubCustom();                                                       // 刷新自定义框显隐
  }
  /* 注意：不要在这里 closeModal()——openMaterialForm 复用同一个弹窗遮罩，
     它已经把"拍照识别"弹窗顶掉了，再关一次会把新表单也关掉 */
  toast('已按识别结果填好表单，请补全库存数量和存放位置后保存', 'ok');        // 提醒用户补全
}

/* ==================== 出库查库：识别后在库存里找同款 ==================== */

/* 用识别结果在现有库存中搜索同款物料（可查库里还剩多少能不能用） */
function prFindInStock() {
  var r = PRState.result;                                              // 识别结果
  if (!r) return;                                                      // 没结果
  /* 组搜索关键词：型号最精确优先，名称兜底；太短的关键词（<2 字）不参与，避免误伤 */
  var kws = [];
  if (r.model && String(r.model).trim().length >= 2) kws.push(String(r.model).trim());   // 型号
  if (r.name && String(r.name).trim().length >= 2) kws.push(String(r.name).trim());      // 名称
  /* 逐个物料算匹配分：命中越多越靠前 */
  var hits = [];
  for (var i = 0; i < State.materials.length; i++) {
    var m = State.materials[i];                                        // 当前物料
    var text = [m.name, m.model || '', m.silk || '', m.alias || '', (m.tags || []).join(' ')].join(' ').toLowerCase();  // 拼索引文本
    var score = 0;                                                     // 匹配得分
    for (var k = 0; k < kws.length; k++) {                              // 逐关键词比对
      var key = kws[k].toLowerCase();                                  // 小写比较
      if (text.indexOf(key) >= 0) score += 2;                           // 库存信息里含关键词
      else if ((m.name || '').length >= 2 && key.indexOf(m.name.toLowerCase()) >= 0) score += 1;  // 关键词含物料名（如识别出"0805贴片电阻"，库里有"贴片电阻"）
    }
    if (score > 0) hits.push({ m: m, score: score });                   // 有分才收进候选
  }
  hits.sort(function (a, b) { return b.score - a.score; });             // 按得分从高到低
  /* 渲染候选列表 */
  var html = '<div class="card" style="margin-top:14px;background:var(--bg-soft)">' +
    '<div class="card-title" style="margin-bottom:8px">库中查找结果（' + hits.length + '）</div>';
  if (!hits.length) {                                                  // 一个都没找到
    html += '<div class="form-hint">库里没找到同款物料。如果确实没有库存，可以转为入库新增。</div>' +
      '<div style="margin-top:10px"><button class="btn btn-outline" onclick="prToForm()">' + ICONS.plus + '转为入库新增</button></div>';
  } else {
    for (var h = 0; h < hits.length && h < 8; h++) {                    // 最多展示 8 条
      var it = hits[h].m;                                              // 命中的物料
      var low = (it.stock || 0) <= (it.minStock || 0);                  // 是否已到警戒线
      html += '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">' +
        '<div style="flex:1;min-width:150px">' +
          '<b>' + escapeHtml(it.name) + '</b> <span style="color:var(--text-sub);font-size:12px">' + escapeHtml(it.code || '') + (it.model ? ' · ' + escapeHtml(it.model) : '') + '</span><br>' +
          '<span style="font-size:12.5px;color:' + (low ? 'var(--danger)' : 'var(--text-sub)') + '">库存 ' + (it.stock || 0) + ' ' + escapeHtml(it.unit || '') + (low ? '（已达警戒线）' : '') + (it.loc ? ' · 位置：' + escapeHtml(it.loc) : '') + '</span>' +
        '</div>' +
        '<input class="input" id="pr-out-qty-' + it.id + '" type="number" min="1" step="1" value="1" style="width:76px" title="出库数量" />' +
        '<button class="btn btn-sm btn-primary" onclick="prQuickOut(\'' + it.id + '\')">快速出库</button>' +
        (Auth.can('manage') ? '<button class="btn btn-sm" onclick="openStockIOModal(\'' + it.id + '\', \'out\')">完整出库</button>' : '') +
      '</div>';
    }
    if (hits.length > 8) html += '<div class="form-hint" style="margin-top:6px">仅显示前 8 条候选，可去物料列表页搜索更多</div>';
  }
  html += '</div>';
  $('#pr-result').innerHTML = html;                                    // 渲染结果
  toast(hits.length ? '找到 ' + hits.length + ' 条同款候选，核对后可直接出库' : '未找到同款', hits.length ? 'ok' : 'warn');  // 提示
}

/* 从识别结果候选里快速出库一条物料（成员也能用，走统一出入库校验） */
async function prQuickOut(mid) {
  var m = null;                                                        // 目标物料
  for (var i = 0; i < State.materials.length; i++) {                   // 查找
    if (State.materials[i].id === mid) { m = State.materials[i]; break; }  // 命中
  }
  if (!m) { toast('物料不存在', 'err'); return; }                       // 没了
  var qtyInput = $('#pr-out-qty-' + mid);                               // 数量输入框
  var qty = parseInt((qtyInput && qtyInput.value) || '1', 10);          // 读数量
  if (!qty || qty < 1) { toast('请填写正确的出库数量', 'warn'); return; }  // 数量非法
  var ok = await applyStockRecord(mid, 'out', qty, { remark: '拍照识别快速领用' });  // 走统一出入库（含库存校验、写记录、记日志）
  if (ok) prFindInStock();                                             // 成功后刷新候选列表（库存数已变化）
}
