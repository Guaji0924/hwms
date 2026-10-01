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

/* 读取当前生效的 AI 配置（展平为 {enabled,url,model,key,name}；兼容旧的单配置结构） */
async function getAIConfig() {
  var raw = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });  // 原始配置
  if (raw && raw.list) {                                               // 新结构：多配置
    var item = null;                                                   // 选中的配置项
    for (var i = 0; i < raw.list.length; i++) {
      if (raw.list[i].id === raw.active) { item = raw.list[i]; break; }  // 找默认项
    }
    if (!item) item = raw.list[0] || null;                             // 默认项缺失：用第一个
    if (!item) return { enabled: false, url: '', model: '', key: '' };  // 一个都没有
    return { enabled: raw.enabled !== false, url: item.url, model: item.model, key: item.key, name: item.name };  // 展平返回
  }
  return raw;                                                          // 旧结构直接返回
}

/* 读取全部 AI 配置（返回 {enabled,active,list}；旧单配置自动包装成一条） */
async function getAIConfigList() {
  var raw = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });  // 原始配置
  if (raw && raw.list) {                                               // 新结构
    return { enabled: raw.enabled !== false, active: raw.active, list: raw.list };  // 直接返回
  }
  var has = (raw.url || raw.model);                                    // 旧配置是否填了内容
  var item = { id: 'default', name: '默认配置', url: raw.url || '', model: raw.model || '', key: raw.key || '' };  // 包装成一条
  return { enabled: !!raw.enabled, active: 'default', list: has ? [item] : [] };
}

/* 按用途选 AI 配置：优先 uses 勾了该用途的；没有就回退默认项 / 第一个 */
async function pickAIConfig(use) {
  var data = await getAIConfigList();                                      // 全部配置
  if (!data.list.length) return null;
  var hit = null;
  for (var i = 0; i < data.list.length; i++) {                             // 先找用途匹配的
    if ((data.list[i].uses || []).indexOf(use) >= 0) { hit = data.list[i]; break; }
  }
  if (!hit) {                                                              // 没有标用途的：用默认项
    for (var j = 0; j < data.list.length; j++) {
      if (data.list[j].id === data.active) { hit = data.list[j]; break; }
    }
    if (!hit) hit = data.list[0];
  }
  return { enabled: data.enabled, url: hit.url, model: hit.model, key: hit.key, name: hit.name };
}

/**
 * 调用 OpenAI 兼容的对话接口
 * messages: [{role, content}] 标准消息数组
 * cfgOverride: 临时配置（测试连接用），不传则读数据库里保存的配置
 * 返回：模型回复的文本；失败抛出 Error
 */
async function callLLM(messages, cfgOverride) {
  var cfg = cfgOverride;                                               // 优先用临时配置
  if (!cfg) {                                                          // 没传就读库
    cfg = await getAIConfig();                                          // 默认配置（自动取多配置中的默认项）
  }
  if (!cfg.enabled || !cfg.url) throw new Error('AI 未启用或未配置接口地址');  // 检查
  var ctrl = new AbortController();                                      // 超时中断器
  var timer = setTimeout(function () { ctrl.abort(); }, 180000);         // 180 秒无响应则中止
  var res;
  try {
    res = await fetch(cfg.url, {                                      // 发起请求
      method: 'POST',                                                     // POST 方法
      headers: {                                                           // 请求头
        'Content-Type': 'application/json',                                // JSON 格式
        'Authorization': 'Bearer ' + (cfg.key || '')                       // 鉴权（Key）
      },
      body: JSON.stringify({                                               // 请求体
        model: cfg.model || 'deepseek-chat',                                // 模型名
        messages: messages,                                                  // 消息列表
        temperature: 0.3                                                     // 低温度：结果稳定
      }),
      signal: ctrl.signal
    });
  } catch (fe) {
    clearTimeout(timer);
    if (fe.name === 'AbortError') throw new Error('请求超时（180 秒无响应，请检查接口地址和网络）');
    throw fe;
  }
  clearTimeout(timer);
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
  var ai = await getAIConfig();                                        // 读当前 AI 配置
  var aiReady = ai.enabled && ai.url;                                                                // AI 是否可用
  /* 示例需求（点一下自动填入） */
  var examples = ['做一个循迹小车', '做蓝牙遥控小车', '温湿度监测站', '智能台灯', 'RFID 门禁系统', '电子时钟', '自动浇花装置', '超声波测距仪'];
  var exHtml = '';                                                                                    // 示例 HTML
  for (var i = 0; i < examples.length; i++) {                                                          // 遍历
    exHtml += '<span class="tag-chip" onclick="$(\'#ai-need\').value=\'' + examples[i] + '\'">' + examples[i] + '</span> ';  // 可点示例
  }
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">智能配料</div><div class="page-desc">一句话描述需求，AI 给出多种实现方案与物料清单，再自动匹配库存或替代品</div></div>' +
      '<button class="btn btn-outline" onclick="openAIHistory()">' + ICONS.history + '历史记录</button>' +
    '</div>' +
    '<div class="card">' +
      '<div class="form-item" style="margin-bottom:10px"><label>你想做什么？</label>' +
        '<div class="ai-input-wrap">' +
          '<input class="input" id="ai-need" placeholder="例如：做一个流水灯 / 做循迹小车 / 我要测室内温湿度并显示出来" onkeydown="if(event.key===\'Enter\')runLocalMatch()" />' +
          (aiReady ? '<button class="btn btn-primary btn-lg" onclick="runAIMatch()">' + ICONS.ai + 'AI 分析</button>' : '<span class="form-hint" style="align-self:center">AI 未启用，使用内置本地引擎（可在设置中接入 AI）</span>') +
          '<button class="btn btn-outline btn-lg" onclick="runLocalMatch()">智能匹配</button>' +
        '</div>' +
      '</div>' +
      '<div class="chips-row">' + exHtml + '</div>' +
    '</div>' +
    /* 匹配结果区（初始隐藏提示） */
    '<div id="ai-result"><div class="card"><div class="empty"><div class="e-ico">' + ICONS.robot + '</div>输入需求后点"智能匹配"，系统自动从元件库配齐物料清单</div></div></div>';
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
  window._aiAbort = false;                                                  // 重置中止标志（每次分析前清零）
  $('#ai-result').innerHTML = '<div class="card"><div class="empty" id="ai-loading-txt">AI 正在分析需求并设计方案……（需要联网，约几秒钟）</div><div style="text-align:center;margin-top:8px"><button class="btn btn-outline" onclick="aiStop(this)">停止</button></div></div>';  // 加载中（带停止按钮）
  try {                                                                                             // 容错
    /* 收集库存类别信息帮助 AI 理解 */
    var catInfo = '';                                                                                  // 类别串
    for (var i = 0; i < CAT_TREE.length; i++) { catInfo += CAT_TREE[i].name + '（' + CAT_TREE[i].subs.join('/') + '）；'; }  // 拼
    /* 新 prompt：严格围绕需求 + 多方案 + 每项带可替代关键词 */
    var sysPrompt =
      '你是电子协会的物料管理员，帮学生规划电子 DIY 项目的物料清单。\n' +
      '【必须遵守】\n' +
      '1. 严格围绕用户明确描述的功能列物料，禁止脑补用户没要求的东西：例如用户要做流水灯，就绝不能列电机、传感器、显示屏、蓝牙、蜂鸣器等无关物料。\n' +
      '2. 先想清楚实现该功能需要哪些功能模块，再为每个模块选物料，只列必需的。\n' +
      '3. 给出 2 个不同思路的方案：方案一用最常见、最适合新手的做法；方案二换一种实现思路（例如换一种主控、或纯硬件不用编程）。\n' +
      '4. 每项物料的 name 必须用竖线依次列出"主物料名|常见别名|类别关键词"，方便在库存里找同款或替代品，例如"LED灯珠|发光二极管|LED"、"Arduino Uno|UNO开发板|Arduino"。\n' +
      '协会库存的分类体系是：' + catInfo + '\n' +
      '只输出 JSON 数组，不要任何多余文字，格式：\n' +
      '[{"planName":"方案名（括号里写思路或适合人群）","items":[{"name":"主名|别名|类别","qty":数字,"why":"它在项目里起什么作用"}]}]\n' +
      '每个方案控制在 12 项以内。';
    var planCfg = await pickAIConfig('plan');                                   // 按用途选"智能配料"配置
    var reply = await callLLM([{ role: 'system', content: sysPrompt }, { role: 'user', content: text }], planCfg || undefined);  // 调 AI
    if (window._aiAbort) { $('#ai-result').innerHTML = '<div class="card"><div class="empty">已停止 AI 分析</div></div>'; toast('AI 分析已停止', 'warn'); return; }  // 用户已点停止：丢弃结果
    var arr = extractJSONArray(reply);                                                                  // 解析多方案 JSON
    if (!arr || arr.length === 0) throw new Error('AI 返回的清单无法解析');                                 // 解析失败
    MultiPlans = [];                                                                                     // 收集方案
    for (var a = 0; a < arr.length; a++) {
      var rawItems = arr[a].items || [];
      var needs = [];
      for (var x = 0; x < rawItems.length; x++) {
        if (!rawItems[x].name) continue;
        needs.push({ kw: String(rawItems[x].name), n: parseInt(rawItems[x].qty, 10) || 1, why: String(rawItems[x].why || '') });
      }
      var plan = buildPlanFromNeeds(text, needs, String(arr[a].planName || ('方案 ' + (a + 1))));           // 每个方案独立匹配库存
      plan.aiNote = reply;
      MultiPlans.push(plan);
    }
    if (!MultiPlans.length) throw new Error('AI 没有给出任何方案');
    renderMultiPlans(0);                                                                                  // 默认显示第一个方案
  } catch (err) {                                                                                                // 失败
    if (window._aiAbort) { $('#ai-result').innerHTML = '<div class="card"><div class="empty">已停止 AI 分析</div></div>'; return; }  // 用户已点停止：不回退本地引擎
    toast('AI 分析失败：' + err.message + '，已回退到本地引擎', 'warn');                                            // 提示
    runLocalMatch();                                                                                              // 本地兜底
  }
}

/* --- 2.3 需求清单 → 库存匹配 --- */
/**
 * 把需求列表逐一在元件库里找物料，生成完整配料计划
 * 返回：{text, note, aiNote, items: [{material, needQty, have, status, why}], missing: [{kw, n, why}]}
 */
/* 型号归一化：去空格/连字符/下划线并小写，用于 BOM 与档案的严格比对 */
function normS(s) { return String(s || '').trim().toLowerCase().replace(/[\s_\-]/g, ''); }

function buildPlanFromNeeds(text, needs, note, strict) {
  var items = [];                                                                                                   // 已匹配项
  var missing = [];                                                                                                   // 库存没有的
  var usedIds = {};                                                                                                    // 已用物料（去重）
  for (var i = 0; i < needs.length; i++) {                                                                               // 遍历需求
    var need = needs[i];                                                                                                 // 当前需求
    /* BOM 严格模式：型号/名称必须与库里档案精确一致才算"库里有"；相似可代替一律交给 AI 查找替代 */
    if (strict) {
      var devKw = String(need.dev || ''), nmKw = String(need.nm || ''), mfrKw = String(need.mfr || ''), codeKw = String(need.code || '');
      var exacts = [];                                                                                                      // 精确命中候选
      for (var e0 = 0; e0 < State.materials.length; e0++) {
        var em = State.materials[e0];                                                                                          // 候选档案
        if (em.deleted || usedIds[em.id]) continue;                                                                             // 已删/已用跳过
        var hitDev = devKw && (normS(em.model) === normS(devKw) || normS(em.name) === normS(devKw) || normS(em.code) === normS(devKw));  // 型号精确一致
        var hitNm = nmKw && (normS(em.model) === normS(nmKw) || normS(em.name) === normS(nmKw) || normS(em.code) === normS(nmKw));        // 名称精确一致
        var hitMfr = mfrKw && (normS(em.model) === normS(mfrKw) || normS(em.name) === normS(mfrKw) || normS(em.code) === normS(mfrKw));  // 厂家完整型号（很多 BOM 的完整型号在 Manufacturer Part 列）
        var hitCode = codeKw && normS(em.code) === normS(codeKw);                                                               // 立创编号精确一致
        if (hitDev || hitNm || hitMfr || hitCode) exacts.push(em);                                                              // 命中
      }
      exacts.sort(function (a, b) { return (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0); });                                     // 有库存优先
      var eb = exacts.length ? exacts[0] : null;
      if (!eb) {                                                                                                                    // 没有精确同款
        missing.push({ kw: need.kw, n: need.n, why: need.why || '', name: need.name || String(need.kw).split('|')[0], detail: need.detail || '', _nIdx: i, _f: need._f || null });   // 进购买清单（保留 BOM 人话名/详情）
        continue;                                                                                                                    // 下一个
      }
      if (eb.stock <= 0) {                                                                                                         // 有档案但库存为 0：归入"库里没有"，挂上档案
        missing.push({ kw: need.kw, n: need.n, why: need.why || '', name: need.name || eb.name, detail: need.detail || '', _nIdx: i, _f: need._f || null, _lib: eb });       // 进购买清单（优先 BOM 原始信息）
        continue;                                                                                                                    // 下一个
      }
      usedIds[eb.id] = true;                                                                                                        // 标记已用
      items.push({ material: eb, needQty: need.n, have: eb.stock, status: eb.stock >= need.n ? 'ok' : 'low', why: need.why || '', alt: false, _nIdx: i, _f: need._f || null, rowIdx: need.rowIdx });  // 充足/不足（保留原 BOM 行关联）
      continue;                                                                                                                    // 下一个
    }
    var keywords = String(need.kw).split('|').map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return s; });  // 按竖线拆多个关键词
    /* 收集所有关键词的命中物料，优先选有库存的，其次按关键词顺序（主名优先） */
    var cands = [];                                                                                                       // 候选 {m, k}
    for (var kk = 0; kk < keywords.length; kk++) {
      var found = Search.query(keywords[kk]);                                                                               // 搜元件库
      for (var f = 0; f < found.length; f++) {
        if (usedIds[found[f].id]) continue;                                                                                   // 已被用过跳过
        cands.push({ m: found[f], k: kk });
      }
    }
    cands.sort(function (a, b) {                                                                                            // 有库存优先，其次主名关键词
      var aHas = a.m.stock > 0 ? 1 : 0, bHas = b.m.stock > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return a.k - b.k;
    });
    var best = cands.length ? cands[0].m : null;
    if (!best) {                                                                                                                // 元件库里没有：再按类别/全字段宽匹配一次，能挂上档案就挂（库存为 0 也算有档案）
      var _lib = null;
      for (var _lb = 0; _lb < keywords.length; _lb++) { var _r2 = Search.query(keywords[_lb]); if (_r2.length) { _lib = _r2[0]; break; } }
      missing.push({ kw: need.kw, n: need.n, why: need.why || '', name: need.name || (_lib ? _lib.name : String(need.kw).split('|')[0]), detail: need.detail || '', _nIdx: i, _f: need._f || null, _lib: _lib });   // 进购买清单（保留 BOM 人话名/详情）
      continue;                                                                                                                    // 下一个
    }
    if (best.stock <= 0) {                                                                                                         // 有档案但库存为 0：不算"库里有"，挂上档案（供清单/界面显示完整信息）
      missing.push({ kw: need.kw, n: need.n, why: need.why || '', name: need.name || best.name, detail: need.detail || '', _nIdx: i, _f: need._f || null, _lib: best });       // 进购买清单（优先 BOM 原始信息）
      continue;                                                                                                                    // 下一个
    }
    usedIds[best.id] = true;                                                                                                        // 标记已用
    var status = best.stock >= need.n ? 'ok' : (best.stock > 0 ? 'low' : 'none');                                                     // 充足/不足/缺货
    items.push({ material: best, needQty: need.n, have: best.stock, status: status, why: need.why || '', alt: false, _nIdx: i, _f: need._f || null, rowIdx: need.rowIdx });              // 相似可代替一律交给 AI 查找替代，不自动标代替
  }
  return { text: text, note: note || '', items: items, missing: missing };                                                             // 完整计划
}

/* --- 2.4 渲染配料结果 --- */

/* 单个方案的主体 HTML（可直接领用 + 需要购买） */
function planBodyHtml(plan) {
  /* 可直接领用部分 */
  var okRows = '';                                                                                                                            // 充足行
  for (var i = 0; i < plan.items.length; i++) {                                                                                                 // 遍历
    var it = plan.items[i];                                                                                                                       // 当前
    var m = it.material;                                                                                                                            // 物料
    okRows += '<div class="ai-plan-item">' +
      '<div class="p-name"><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + (it.why ? ' · ' + escapeHtml(it.why) : '') + '</div></div>' +
      locBadge(m.loc, m.locNo, !canSeeLoc(m.id)) +
      '<span style="font-size:12.5px">需要 <b>' + it.needQty + '</b> ' + escapeHtml(m.unit || '') + ' · 现有 ' + it.have + '</span>' +
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
  return '<div class="ai-result-grid">' +
      '<div class="card"><div class="card-title">可直接领用（' + plan.items.length + ' 项）' +
        '<span class="more"><button class="btn btn-sm btn-outline" onclick="printPickList()">打印取件单</button>' +
        ' <button class="btn btn-sm btn-blue" onclick="openClaimModal()">' + ICONS.out + '按清单领用</button></span></div>' + okRows + '</div>' +
      '<div class="card"><div class="card-title">需要购买（' + plan.missing.length + ' 项）' +
        '<span class="more"><button class="btn btn-sm btn-outline" onclick="copyBuyList()">复制购买清单</button></span></div>' + buyRows + '</div>' +
    '</div>';
}

function renderPlan(plan) {
  PlanState = plan;                                                                                                                         // 全局保存（领用要用）
  $('#ai-result').innerHTML =
    (plan.note ? '<div class="ai-quote" style="margin-bottom:14px">' + escapeHtml(plan.note) + '</div>' : '') +                                   // 引擎提示
    (plan.aiNote ? '<div class="ai-quote" style="margin-bottom:14px">AI 说：' + escapeHtml(String(plan.aiNote).slice(0, 400)) + '</div>' : '') +     // AI 原话
    planBodyHtml(plan);
}

/* AI 多方案结果：方案切换按钮 + 当前方案内容 */
var MultiPlans = [];
function renderMultiPlans(idx) {
  PlanState = MultiPlans[idx];                                                                                                              // 当前方案（领用/打印都用它）
  var tabs = '';
  for (var i = 0; i < MultiPlans.length; i++) {
    var cls = (i === idx) ? 'btn btn-primary' : 'btn btn-outline';
    tabs += '<button class="' + cls + '" onclick="renderMultiPlans(' + i + ')">' + escapeHtml(MultiPlans[i].note || ('方案 ' + (i + 1))) + '</button>';
  }
  $('#ai-result').innerHTML =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">' + tabs +
      '<button class="btn btn-outline" style="margin-left:auto" onclick="saveAsAIProject()">保存为项目</button></div>' +
    planBodyHtml(MultiPlans[idx]);
}

/* 打印取件单（含存放位置，去货架找东西方便） */
function printPickList() {
  if (!PlanState) return;                                                                                                                               // 没计划
  var w = window.open('', '_blank');                                                                                                                      // 新窗口
  if (!w) { toast('浏览器拦截了弹窗，请允许弹窗后重试', 'err'); return; }                                                        // 拦截
  var rows = '';                                                                                                                                          // 行
  for (var i = 0; i < PlanState.items.length; i++) {                                                                                                         // 遍历
    var it = PlanState.items[i];                                                                                                                                // 当前
    rows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(it.material.name) + '</td><td>' + escapeHtml(it.material.model || '') + '</td><td><b>' + it.needQty + ' ' + escapeHtml(it.material.unit || '') + '</b></td><td>' + (canSeeLoc(it.material.id) ? '<span style="color:#FF7F27;font-weight:600">' + escapeHtml(it.material.loc || '') + '</span>' : '🔒') + '</td></tr>';  // 行
  }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>取件清单</title>' +                            // 页面头
    '<style>body{font-family:"Microsoft YaHei",sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;font-size:13px;margin-top:0}' +
    'table{width:100%;border-collapse:collapse;font-size:14px}td,th{border:1px solid #bbb;padding:8px 10px;text-align:left}' +
    'th{background:#eee}.loc{color:#FF7F27;font-weight:bold}@media print{.noprint{display:none}}</style></head><body>' +
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
    '<button class="btn btn-blue" onclick="submitClaim()">' + ICONS.out + '确认领用并扣库存</button>', true);
}

/* 提交批量领用 */
async function submitClaim() {
  beginBatchLoc();                                                                                                                       // 批量：统一收集位置提示
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
  endBatchLoc();                                                                                                                                                    // 批量领用结束：一次显示所有物料位置
  if (successCount > 0) {                                                                                                                                           // 有成功
    toast('领用完成：共领 ' + successCount + ' 种物料、' + totalQty + ' 件，记录已存档', 'ok');                                              // 提示
    var aiNeed = $('#ai-need');                                                                                                                                        // 输入框
    if (aiNeed && PlanState) {                                                                                                                                        // 还在本页：保留清单并刷新库存，不整体清空
      for (var k = 0; k < PlanState.items.length; k++) {                                                                                                                 // 逐个物料刷新当前库存
        var itk = PlanState.items[k], curk = null;                                                                                                                         // 当前项
        for (var q = 0; q < State.materials.length; q++) { if (State.materials[q].id === itk.material.id) { curk = State.materials[q]; break; } }                          // 查最新库存
        if (curk) itk.have = curk.stock;                                                                                                                                   // 更新快照库存
      }
      $('#ai-result').innerHTML = '<div class="ai-quote" style="margin:0 0 12px;display:flex;align-items:center;gap:8px">✅ 本次已按清单领用 <b>' + successCount + ' 种物料</b>（共 ' + totalQty + ' 件），库存已更新，清单保留如下</div>' + planBodyHtml(PlanState);  // 顶部醒目提示 + 重渲染清单
    }
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
  var ai = await getAIConfig();                                                                                                       // AI 配置
  if (!ai.enabled || !ai.url) {                                                                                                                                                    // 没配 AI
    box.innerHTML = '<span style="color:var(--warning)">未配置 AI。可先手动在"编辑物料"里填写用途描述；或在"系统设置"中接入 AI 后一键生成。</span>';                                      // 提示
    return;                                                                                                                                                                            // 结束
  }
  box.innerHTML = 'AI 正在生成介绍……（需联网）';                                                                                                                                        // 加载中
  try {                                                                                                                                                                                    // 容错
    var prompt = '用中文介绍电子元件"'+ m.name + '"（型号' + (m.model || '未知') + '，分类' + m.cat + '/' + (m.sub || '') + '）。' +                                                           // 提示词
      '请分三段输出，每段不超过 60 字：1、它是什么；2、典型用途和适合的项目；3、新手使用注意事项。用 <br> 分段，直接输出内容。';                                                              // 要求
    var exCfg = await pickAIConfig('explain');                                                                                                                // 按用途选"用途说明"配置
    var reply = await callLLM([{ role: 'user', content: prompt }], exCfg || undefined);                                                                       // 调用
    var aiTxt = String(reply).replace(/<br\s*\/?>/gi, '\n').replace(/\r/g, '');                                                                                                               // 字面 <br> 归一为换行
    box.innerHTML = escapeHtml(aiTxt).replace(/\n/g, '<br>');                                                                                                                               // 显示
    if (!m.desc) {                                                                                                                                                                              // 物料还没描述
      m.desc = aiTxt.slice(0, 500);                                                                                                                                                             // 顺便存一份
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

/* 拍照识别的临时状态：照片 + 来源框 + 结果 + 忙碌 + 桌面摄像头流 + 当前视图（result/out/in） */
var PRState = { dataUrl: '', source: '', result: null, busy: false, camStream: null, view: '' };

/* 是否移动设备（手机 / 平板）：决定拍照框走系统相机还是网页摄像头 */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');
}

/* 打开拍照识别弹窗（全新开始） */
function openPhotoRecog() {
  PRState.dataUrl = '';                                                // 清空旧照片
  PRState.source = '';                                                 // 清空来源
  PRState.result = null;                                               // 清空旧结果
  PRState.view = '';                                                   // 清空视图标记
  prOpenRecogModal();                                                  // 搭出弹窗
}

/* 真正搭出识别弹窗（首次打开 / 从新增表单返回共用；返回时按 PRState.view 恢复视图） */
function prOpenRecogModal() {
  openModal('图片识别物料', '' +
    '<div class="form-hint" style="margin-bottom:12px;line-height:2">' +
      '<b>手机：</b>点方框选图 / 拍照<br>' +
      '<b>电脑：</b>点方框选图 / 拍照，或 Ctrl+V 直接粘贴，或拖拽图片到选图框<br>' +
      '识别后既能在库存里查同款直接出库领用，也能入库加库存；新增物料仅管理员或被临时授权的成员可操作。</div>' +
    '<div style="text-align:right;margin-bottom:10px"><button class="btn btn-sm btn-outline" onclick="prShowHistory()">' + ICONS.history + '识别历史（近 24 小时）</button></div>' +
    /* 两个等大的方框：左选图、右拍照 */
    '<div style="display:flex;gap:12px">' +
      '<div style="flex:1;min-width:0">' +
        '<div id="pr-pick-box" onclick="$(\'#pr-file-pick\').click()" style="aspect-ratio:1;border:1.5px dashed var(--border);border-radius:10px;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;cursor:pointer;background:var(--bg-soft);overflow:hidden"></div>' +
        '<div style="text-align:center;font-size:12.5px;color:var(--text-sub);margin-top:6px">点击选图 / 拖拽图片到此（Ctrl+V 粘贴也在这里）</div>' +
      '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div id="pr-cam-box" onclick="prCamBoxClick()" style="aspect-ratio:1;border:1.5px dashed var(--border);border-radius:10px;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;cursor:pointer;background:var(--bg-soft);overflow:hidden"></div>' +
        '<div style="text-align:center;font-size:12.5px;color:var(--text-sub);margin-top:6px">点击拍照（手机开系统相机 / 电脑调摄像头）</div>' +
      '</div>' +
    '</div>' +
    /* 两个隐藏文件框：选图框无 capture；拍照框带 capture，手机直接调系统后置相机 */
    '<input type="file" id="pr-file-pick" accept="image/*" style="display:none" onchange="prPick(this,\'pick\')" />' +
    '<input type="file" id="pr-file-cam" accept="image/*" capture="environment" style="display:none" onchange="prPick(this,\'cam\')" />' +
    '<button class="btn btn-primary" id="pr-run-btn" style="margin-top:10px;width:100%" onclick="prRun()">' + ICONS.ai + '开始识别</button>' +
    '<div class="form-hint" style="margin-top:8px">照片自动压缩到 640px 再发送，省流量；默认使用系统设置里的默认 AI 配置</div>' +
    '<div id="pr-result"></div>',                                        // 识别结果区
    '<button class="btn" onclick="prClose()">关闭</button>', false);
  renderPrBoxes();                                                     // 渲染两个方框
  document.addEventListener('paste', prPasteHandler);                   // 监听 Ctrl+V
  /* 选图框支持拖拽图片上传 */
  var pb = $('#pr-pick-box');
  if (pb) {
    pb.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
        e.preventDefault(); e.stopPropagation(); pb.style.borderColor = 'var(--primary)';
      }
    });
    pb.addEventListener('dragleave', function () { pb.style.borderColor = ''; });
    pb.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); pb.style.borderColor = '';
      if (window.__hideDropZone) window.__hideDropZone();        /* 通知全局遮罩收起，避免卡住 */
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type && f.type.indexOf('image') === 0) { prPickFromFile(f, 'pick'); }
      else { toast('请拖入图片文件', 'warn'); }
    });
  }
  /* 从新增表单返回：恢复之前的视图 */
  if (PRState.view === 'result') prRenderResult();
  else if (PRState.view === 'out') prFindInStock();
  else if (PRState.view === 'in') prInChoose();
}

/* 拍照框点击：手机→系统相机；电脑→网页摄像头取景；取景中再点=拍照 */
function prCamBoxClick() {
  if (PRState.camStream) { prSnapDesktop(); return; }                  // 取景中：直接拍
  if (isMobileDevice()) { $('#pr-file-cam').click(); }                 // 手机：系统相机
  else { prDesktopCamera(); }                                          // 电脑：网页摄像头
}

/* 关闭识别弹窗：停掉摄像头、解绑粘贴监听 */
function prClose() {
  prStopDesktopCam();                                                  // 释放摄像头
  document.removeEventListener('paste', prPasteHandler);                // 解绑粘贴监听
  closeModal();                                                        // 关弹窗
}

/* 渲染两个方框：有照片的来源框显示图片；桌面摄像头取景时拍照框显示实时画面 */
function renderPrBoxes() {
  var pickBox = $('#pr-pick-box');                                     // 选图框
  var camBox = $('#pr-cam-box');                                       // 拍照框
  if (!pickBox || !camBox) return;                                     // 弹窗已关闭
  pickBox.innerHTML = (PRState.dataUrl && PRState.source === 'pick')   // 选图框内容
    ? '<img src="' + PRState.dataUrl + '" style="width:100%;height:100%;object-fit:cover" />'
    : '<span style="width:34px;height:34px">' + ICONS.image + '</span><span style="font-size:13px;color:var(--text-sub)">点击选图</span>';
  if (PRState.camStream) {                                             // 桌面取景中：拍照框显示画面 + 拍照/取消
    camBox.style.position = 'relative';                                // 按钮条绝对定位
    camBox.innerHTML = '<video id="pr-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>' +
      '<div style="position:absolute;left:0;right:0;bottom:0;display:flex;gap:4px;padding:4px">' +
        '<button class="btn btn-primary btn-sm" style="flex:1" onclick="prSnapDesktop()">拍照</button>' +
        '<button class="btn btn-sm" onclick="prStopDesktopCam();renderPrBoxes()">取消</button>' +
      '</div>';
    var v = $('#pr-video');                                            // 视频元素
    if (v) v.srcObject = PRState.camStream;                            // 喂入画面
    return;
  }
  camBox.style.position = '';                                          // 恢复默认定位
  camBox.innerHTML = (PRState.dataUrl && PRState.source === 'cam')     // 拍照框内容
    ? '<img src="' + PRState.dataUrl + '" style="width:100%;height:100%;object-fit:cover" />'
    : '<span style="width:34px;height:34px">' + ICONS.camera + '</span><span style="font-size:13px;color:var(--text-sub)">点击拍照</span>';
}

/* 用户选好 / 拍好照片：标记来源，压缩后放进对应方框 */
async function prPick(input, source) {
  var f = input.files && input.files[0];                               // 选中的第一张图
  if (!f) return;                                                      // 没选
  await prPickFromFile(f, source);                                     // 统一走"按文件放图"
  input.value = '';                                                    // 清空控件（同一张图可重选）
}

/* 按文件对象放图（选图 / 拍照 / 粘贴共用入口） */
async function prPickFromFile(f, source) {
  try {
    PRState.dataUrl = await compressImage(f, 640);                     // 压缩到 640px（识别够用、流量小）
    PRState.source = source || 'pick';                                 // 记录来源框（粘贴落到选图框）
    PRState.result = null;                                             // 换了照片，旧结果作废
    renderPrBoxes();                                                   // 刷新两个方框
    var res = $('#pr-result');                                         // 结果区
    if (res) res.innerHTML = '';                                       // 清空旧结果
    toast('图片已就绪，点"开始识别"即可', 'ok');                          // 提示
  } catch (err) {
    toast('图片处理失败：' + err.message, 'err');                        // 压缩失败提示
  }
}

/* Ctrl+V 粘贴截图 / 复制的图片（弹窗打开期间有效，落到选图框） */
function prPasteHandler(e) {
  if (!$('#pr-pick-box')) {                                            // 弹窗已关闭
    document.removeEventListener('paste', prPasteHandler);              // 自我解绑
    return;
  }
  var items = e.clipboardData && e.clipboardData.items;                 // 剪贴板内容
  if (!items) return;                                                  // 拿不到就不管
  for (var i = 0; i < items.length; i++) {                             // 逐项找图片
    if (items[i].type && items[i].type.indexOf('image') === 0) {        // 图片类型
      var f = items[i].getAsFile();                                    // 转成文件对象
      if (f) { prPickFromFile(f, 'pick'); e.preventDefault(); }         // 粘贴进选图框并阻止默认行为
      break;                                                           // 只处理第一张
    }
  }
}

/* 电脑端：调用网页摄像头，在拍照框内取景（手机走系统相机，不用这个） */
async function prDesktopCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('当前环境不支持调用摄像头，可改用选图', 'err');
    return;
  }
  try {
    PRState.camStream = await navigator.mediaDevices.getUserMedia({    // 请求摄像头（优先后置）
      video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false
    });
    PRState.dataUrl = '';                                             // 进入取景，旧照片先放一边
    renderPrBoxes();                                                  // 显示实时画面
  } catch (err) {
    toast('无法打开摄像头：' + err.message + '，可改用选图', 'err');
  }
}

/* 桌面取景中点"拍照"：截取当前帧作为识别照片 */
function prSnapDesktop() {
  var v = $('#pr-video');                                             // 视频元素
  if (!v || !PRState.camStream) return;                               // 没在取景
  var w = v.videoWidth || 640, h = v.videoHeight || 480;              // 画面尺寸
  var scale = Math.min(1, 640 / w);                                   // 目标宽 640
  var canvas = document.createElement('canvas');                       // 离屏画布
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);  // 截帧
  PRState.dataUrl = canvas.toDataURL('image/jpeg', 0.85);             // 存照片
  PRState.source = 'cam';                                             // 来源拍照框
  prStopDesktopCam();                                                 // 拍完即停
  PRState.result = null;                                              // 旧结果作废
  PRState.view = '';                                                  // 视图重置
  renderPrBoxes();                                                    // 显示照片
  var res = $('#pr-result');
  if (res) res.innerHTML = '';
  toast('已拍照，点"开始识别"即可', 'ok');
}

/* 停止桌面摄像头流并释放设备 */
function prStopDesktopCam() {
  if (PRState.camStream) {
    var tracks = PRState.camStream.getTracks();
    for (var i = 0; i < tracks.length; i++) tracks[i].stop();
    PRState.camStream = null;
  }
}

/* 开始识别：把照片发给视觉模型 */
async function prRun() {
  if (PRState.busy) return;                                            // 正在识别中，防连点
  if (!PRState.dataUrl) { toast('请先点方框选图或拍照', 'warn'); return; }  // 没照片
  var chosen = await pickAIConfig('vision');                           // 按用途自动选"图片识别"配置
  if (!chosen || !chosen.url) {                                        // 没配置
    toast('请先到"系统设置"接入支持看图的 AI（用途勾"图片识别"）', 'warn');  // 引导
    return;
  }
  /* 拼"可选分类列表"给模型参考，避免它瞎编分类名 */
  var catInfo = '';
  for (var k = 0; k < CAT_TREE.length; k++) {                          // 遍历分类树
    catInfo += CAT_TREE[k].name + '（子类：' + CAT_TREE[k].subs.join('/') + '）\n';  // 一行一个母分类
  }
  /* 识别提示词：严格要求只输出 JSON 对象 */
  var prompt = '你是电子元件识别专家。请识别照片中的电子元件/模块，严格只输出一个 JSON 对象（不要 markdown 代码块、不要任何多余文字），字段如下：\n' +
    '{"name":"中文名称","model":"型号或丝印（识别不出就填空字符串）","cat":"母分类（必须从下面的分类列表中选）","sub":"子分类（从对应母分类的子类中选，不合适就填空字符串）","unit":"数量单位（个/块/米/包/卷 之一）","desc":"一句话用途描述，40字以内","tags":"2~4个标签，用英文逗号分隔"}\n' +
    '分类列表：\n' + catInfo;
  PRState.busy = true;                                                 // 上锁
  $('#pr-run-btn').disabled = true;                                    // 按钮置灰
  $('#pr-result').innerHTML = '<div class="empty" style="padding:16px">AI 正在看图识别……（首次可能较慢，请稍等）<br><span style="font-size:12px">关闭弹窗可随时中止</span></div>';  // 加载提示
  window._aiAbort = false;                                             // 重置中止标志
  try {
    /* 视觉消息格式：content 是数组，文本 + 图片（OpenAI 兼容写法，Ollama 也认） */
    var reply = await callLLM([{
      role: 'user',
      content: [
        { type: 'text', text: prompt },                                  // 文字部分
        { type: 'image_url', image_url: { url: PRState.dataUrl } }       // 图片部分（dataURL 直接内嵌）
      ]
    }], { enabled: true, url: chosen.url, key: chosen.key, model: chosen.model || '' });  // 用选中的配置
    if (window._aiAbort) { PRState.busy = false; return; }            // 弹窗已关闭，丢弃结果
    var obj = extractJSONObject(String(reply));                        // 抠出 JSON
    if (!obj || !obj.name) throw new Error('返回内容无法解析：' + String(reply).slice(0, 120));  // 解析失败
    PRState.result = obj;                                              // 保存结果
    PRState.view = 'result';                                          // 记录视图：方便返回
    prSaveHistory(obj);                                               // 写入识别历史（保留一天）
    prRenderResult();                                                  // 渲染识别结果卡片
    toast('识别完成：可出库，也可入库', 'ok');                            // 成功提示
  } catch (err) {                                                        // 失败
    if (window._aiAbort) { PRState.busy = false; return; }            // 弹窗已关闭，不显示错误
    var _er = $('#pr-result');
    if (_er) _er.innerHTML = '<div class="form-hint" style="color:var(--danger)">识别失败：' + escapeHtml(err.message) + '<br>常见原因：模型不支持看图（换 qwen2.5vl / llava / GLM-4V）、服务没开、或网络不通。</div>';  // 错误 + 排查提示
  }
  PRState.busy = false;                                                  // 解锁
  var btn = $('#pr-run-btn');                                            // 找按钮
  if (btn) btn.disabled = false;                                         // 恢复可用
}

/* 保存一条识别历史（图片+结果+时间+操作人，打开历史时清理超过 24 小时的） */
async function prSaveHistory(result) {
  try {
    await DB.put('pr_history', { id: uid('prh'), at: Date.now(), operator: (Auth.user ? Auth.user.username : '') || '', dataUrl: PRState.dataUrl, result: result });
  } catch (e) { /* 历史不影响主流程 */ }
}

/* 显示近 24 小时识别历史；顺手清掉过期记录 */
async function prShowHistory() {
  var all = await DB.all('pr_history');
  var cutoff = Date.now() - 24 * 3600 * 1000;
  var keep = [], oldIds = [];
  for (var i = 0; i < all.length; i++) {
    if ((all[i].at || 0) >= cutoff) keep.push(all[i]); else oldIds.push(all[i].id);
  }
  for (var d = 0; d < oldIds.length; d++) { await DB.del('pr_history', oldIds[d]); }
  keep.sort(function (a, b) { return b.at - a.at; });
  var html = '<div class="card" style="margin-top:14px;background:var(--bg-soft)">' +
    '<div class="card-title" style="margin-bottom:8px">' + ICONS.history + '识别历史（近 24 小时，' + keep.length + ' 条）</div>';
  if (!keep.length) {
    html += '<div style="padding:14px 2px;color:var(--text-sub);font-size:13px">近 24 小时还没有识别记录</div>';
  } else {
    for (var k = 0; k < keep.length; k++) {
      var r = keep[k];
      var dt = new Date(r.at);
      var dtStr = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0') + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      html += '<div class="ai-plan-item" style="display:flex;gap:10px;align-items:center">' +
        '<img src="' + r.dataUrl + '" style="width:50px;height:50px;object-fit:cover;border-radius:6px;flex:0 0 auto" />' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600;font-size:13.5px">' + escapeHtml((r.result && r.result.name) || '未命名') + '</div>' +
          '<div style="font-size:12px;color:var(--text-sub)">' + dtStr + ' · ' + escapeHtml(r.operator || '') + '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-outline" onclick="prReopenHistory(\'' + r.id + '\')">查看</button>' +
      '</div>';
    }
  }
  html += '</div>';
  $('#pr-result').innerHTML = html;
}

/* 从历史恢复一条识别结果 */
async function prReopenHistory(id) {
  var rec = await DB.get('pr_history', id);
  if (!rec) { toast('记录不存在或已过期', 'warn'); return; }
  PRState.dataUrl = rec.dataUrl;
  PRState.source = 'pick';
  PRState.result = rec.result;
  PRState.view = 'result';
  renderPrBoxes();
  prRenderResult();
}

/* 渲染识别结果卡片（识别成功后、出库查找返回时共用） */
function prRenderResult() {
  var obj = PRState.result;                                            // 识别结果
  if (!obj) return;                                                    // 没结果
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
        (obj.desc ? '<b>用途：</b>' + escapeHtml(obj.desc) : '') +                  // 描述
      '</div>' +
      (tagsHtml ? '<div class="chips-row" style="margin-top:6px">' + tagsHtml + '</div>' : '') +
      /* 按钮：出库为主（紫色），入库第二（白色），可重新识别 */
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-blue" onclick="prFindInStock()">' + ICONS.out + '出库</button>' +
        '<button class="btn btn-success" onclick="prInChoose()">' + ICONS.plus + '入库</button>' +
        '<button class="btn btn-outline" onclick="prRun()">重新识别</button>' +
      '</div>' +
      '<div class="form-hint" style="margin-top:8px">出库：库里找同款走完整出库；入库：库里有就加库存（库里没有时，管理员或被授权成员可新增）</div>' +
    '</div>';
}

/* 入库：先看库里有没有同款——有就加库存，都不是再新增 */
function prInChoose() {
  PRState.view = 'in';                                                 // 记录视图
  var hits = prMatchHits();                                            // 匹配库中物料
  var html = '<div class="card" style="margin-top:14px;background:var(--bg-soft)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
      '<div class="card-title" style="margin:0">' + ICONS.ai + '入库：库里已有这些（' + hits.length + '）</div>' +
      '<button class="btn btn-sm btn-outline" onclick="prRenderResult()">← 返回识别结果</button>' +
    '</div>';
  var canManage = Auth.can('manage');                                  // 新增物料需管理员或被临时授权的成员（未授权成员隐藏该入口）
  if (!hits.length) {                                                  // 库里没有
    html += '<div class="form-hint">库里没有同款物料。' + (canManage
      ? '直接新增即可。'
      : '新增物料需要管理员或被临时授权的成员操作，请联系管理员录入。') + '</div>' +
      (canManage
        ? '<div style="margin-top:10px"><button class="btn btn-primary" onclick="prToFormNew()">' + ICONS.plus + '新增物料</button></div>'
        : '');                                                          // 未授权成员：不显示"新增物料"按钮，只给提示
  } else {
    html += '<div class="form-hint" style="margin-bottom:6px">点"入库"直接给已有物料加库存（走完整入库）' + (canManage ? '；都不是就点底部新增。' : '。') + '</div>';
    for (var h = 0; h < hits.length && h < 8; h++) {
      var it = hits[h].m;
      html += '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">' +
        '<div style="flex:1;min-width:150px">' +
          '<span class="t-link" onclick="gotoMaterial(\'' + it.id + '\')">' + escapeHtml(it.name) + '</span> <span style="color:var(--text-sub);font-size:12px">' + escapeHtml(it.model || '') + '</span><br>' +
          '<span style="font-size:12.5px;color:var(--text-sub)">库存 ' + (it.stock || 0) + ' ' + escapeHtml(it.unit || '') + (it.loc && canSeeLoc(it.id) ? ' · <span style="color:#FF7F27;font-weight:600">' + escapeHtml(it.loc) + '</span>' : '') + '</span>' +
        '</div>' +
        '<button class="btn btn-sm btn-success" onclick="prInStockWithPhoto(\'' + it.id + '\')">入库</button>' +
      '</div>';
    }
    if (canManage) html += '<div style="margin-top:10px"><button class="btn btn-outline" onclick="prToFormNew()">' + ICONS.plus + '都不是，新增物料</button></div>';  // 未授权成员隐藏
  }
  html += '</div>';
  $('#pr-result').innerHTML = html;
  toast(hits.length ? '已有 ' + hits.length + ' 条可直接加库存' : '未找到，可新增', hits.length ? 'ok' : 'warn');
}

/* 识别后给已有物料入库：记下识别照片，提交成功后补进该物料档案 */
function prInStockWithPhoto(id) {
  PRState.inWithPhoto = { id: id, dataUrl: PRState.dataUrl || '' };   // 标记待补照片
  openStockIOModal(id, 'in');                                          // 打开入库弹窗
}

/* 真正新增：把识别结果带入"新增物料"表单（照片也一起带过去） */
function prToFormNew() {
  var r = PRState.result;                                              // 识别结果
  if (!r) return;
  if (!Auth.can('manage')) { toast('您没有管理物料的权限，请联系管理员', 'warn'); return; }
  openMaterialForm('');                                                // 打开新增表单（替换当前弹窗）
  mfPhotos = PRState.dataUrl ? [PRState.dataUrl] : [];                 // 识别照片作为第一张实物照
  renderMfPhotos();
  $('#mat-form').querySelector('[name="name"]').value = String(r.name || '');
  $('#mat-form').querySelector('[name="model"]').value = String(r.model || '');
  $('#mat-form').querySelector('[name="desc"]').value = String(r.desc || '');
  if (r.tags) {
    $('#mat-form').querySelector('[name="tags"]').value = String(r.tags).replace(/[，;；、]/g, ',');
  }
  var cat = String(r.cat || '');
  if (cat) {
    var inTree = false;
    for (var c = 0; c < CAT_TREE.length; c++) { if (CAT_TREE[c].name === cat) { inTree = true; break; } }
    if (inTree) $('#mf-cat').value = cat;
    else { $('#mf-cat').value = '自定义'; $('#mf-cat2').value = cat; }
  }
  mfCatChanged();
  var sub = String(r.sub || '');
  if (sub) {
    var sel = $('#mf-sub');
    var has = false;
    for (var s = 0; s < sel.options.length; s++) { if (sel.options[s].value === sub) { has = true; break; } }
    if (has) sel.value = sub;
    else { sel.value = '自定义'; $('#mf-sub2').value = sub; }
    mfSubCustom();
  }
  prFormBackBtn();                                                     // 把表单"取消"改成"返回识别"
  toast('已填好表单，补全存放位置后保存', 'ok');
}

/* 把新增表单的"取消"改成"← 返回识别"（保留已识别图片和结果，不用重新识别） */
function prFormBackBtn() {
  var foot = document.querySelector('.modal-foot');                    // 弹窗底部
  if (!foot) return;
  var btn = foot.querySelector('.btn');                                // 第一个按钮=取消
  if (btn) {
    btn.textContent = '← 返回识别';
    btn.onclick = function () { prOpenRecogModal(); };  // 按当前 view 回到对应步骤（识别结果 / 出库查库 / 入库已有）
  }
}

/* ==================== 出库查库：识别后在库存里找同款 ==================== */

/* 按识别结果匹配库中物料，返回候选列表（出库 / 入库共用） */
function prMatchHits() {
  var r = PRState.result;                                              // 识别结果
  var kws = [];                                                        // 关键词：型号精确优先，名称兜底
  if (r.model && String(r.model).trim().length >= 2) kws.push(String(r.model).trim());
  if (r.name && String(r.name).trim().length >= 2) kws.push(String(r.name).trim());
  var hits = [];
  for (var i = 0; i < State.materials.length; i++) {
    var m = State.materials[i];
    var text = [m.name, m.model || '', m.silk || '', m.alias || '', m.pkg || '', (m.tags || []).join(' ')].join(' ').toLowerCase();
    var score = 0;
    for (var k = 0; k < kws.length; k++) {
      var key = kws[k].toLowerCase();
      if (text.indexOf(key) >= 0) score += 2;                          // 直接命中
      else if ((m.name || '').length >= 2 && key.indexOf(m.name.toLowerCase()) >= 0) score += 1;  // 关键词含物料名
    }
    if (score > 0) hits.push({ m: m, score: score });
  }
  hits.sort(function (a, b) { return b.score - a.score; });
  return hits;
}

/* 出库：库里找同款，每条一个"出库"按钮，走完整出库弹窗（数量/项目/备注在弹窗里填） */
function prFindInStock() {
  PRState.view = 'out';                                                // 记录视图
  var hits = prMatchHits();
  var html = '<div class="card" style="margin-top:14px;background:var(--bg-soft)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
      '<div class="card-title" style="margin:0">' + ICONS.ai + '库中查找结果（' + hits.length + '）</div>' +
      '<button class="btn btn-sm btn-outline" onclick="prRenderResult()">← 返回识别结果</button>' +
    '</div>';
  if (!hits.length) {
    html += '<div class="form-hint">库里没找到同款物料，可以转为入库。</div>' +
      '<div style="margin-top:10px"><button class="btn btn-success" onclick="prInChoose()">' + ICONS.plus + '转为入库</button></div>';
  } else {
    for (var h = 0; h < hits.length && h < 8; h++) {
      var it = hits[h].m;
      var low = (it.stock || 0) <= (it.minStock || 0);
      html += '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">' +
        '<div style="flex:1;min-width:150px">' +
          '<span class="t-link" onclick="gotoMaterial(\'' + it.id + '\')">' + escapeHtml(it.name) + '</span> <span style="color:var(--text-sub);font-size:12px">' + escapeHtml(it.model || '') + '</span><br>' +
          '<span style="font-size:12.5px;color:' + (low ? 'var(--danger)' : 'var(--text-sub)') + '">库存 ' + (it.stock || 0) + ' ' + escapeHtml(it.unit || '') + (low ? '（已达警戒线）' : '') + (it.loc && canSeeLoc(it.id) ? ' · 位置：<span style="color:#FF7F27;font-weight:600">' + escapeHtml(it.loc) + '</span>' : '') + '</span>' +
        '</div>' +
        '<button class="btn btn-sm btn-blue" onclick="openStockIOModal(\'' + it.id + '\', \'out\')">出库</button>' +
      '</div>';
    }
    if (hits.length > 8) html += '<div class="form-hint" style="margin-top:6px">仅显示前 8 条，可去物料列表页搜索更多</div>';
  }
  html += '</div>';
  $('#pr-result').innerHTML = html;
  toast(hits.length ? '找到 ' + hits.length + ' 条同款，点"出库"领用' : '未找到同款', hits.length ? 'ok' : 'warn');
}

/* ==================== 5. 配料项目历史 + AI 问答 ==================== */

/* 把方案里的物料引用转成可存储快照 */
function serializePlan(plan) {
  var items = plan.items.map(function (it) {
    return {
      mid: it.material.id, name: it.material.name, model: it.material.model || '',
      unit: it.material.unit || '', loc: it.material.loc || '', locNo: it.material.locNo || '',
      needQty: it.needQty, have: it.have, status: it.status, why: it.why || '',
      alt: !!it.alt, altKw: it.altKw || '', missIdx: it.missIdx !== undefined ? it.missIdx : -1
    };
  });
  return { note: plan.note || '', items: items, missing: plan.missing };
}

/* 保存当前配料结果为项目（弹窗填名称 + 公开/私密） */
function saveAsAIProject() {
  if (!MultiPlans.length) { toast('还没有配料结果', 'warn'); return; }
  var need = ($('#ai-need').value || '').trim();
  openModal('保存为项目', '' +
    '<div class="form-item"><label>项目名称</label><input class="input" id="aip-name" maxlength="40" value="' + escapeHtml(need.slice(0, 20)) + '" /></div>' +
    '<div class="form-item"><label>可见范围</label><div class="radio-group" id="aip-vis">' +
      '<span class="radio-chip on" data-v="public" onclick="aipVisPick(this)">公开（所有人可见）</span>' +
      '<span class="radio-chip" data-v="private" onclick="aipVisPick(this)">私密（仅自己可见）</span>' +
    '</div></div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="doSaveAIProject()">保存</button>');
}
function aipVisPick(el) {
  var chips = $('#aip-vis').children;
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
  el.classList.add('on');
}
async function doSaveAIProject() {
  var name = $('#aip-name').value.trim();
  if (!name) { toast('请填写项目名称', 'err'); return; }
  var visEl = $('#aip-vis .radio-chip.on');
  var vis = visEl ? visEl.getAttribute('data-v') : 'public';
  var proj = {
    id: uid('aip'), name: name, source: 'ai', need: ($('#ai-need').value || '').trim(),
    plans: MultiPlans.map(serializePlan), chat: [], visibility: vis,
    operator: Auth.user.username, createdAt: Date.now(), updatedAt: Date.now()
  };
  await DB.put('ai_projects', proj);
  closeModal();
  toast('已保存到历史记录', 'ok');
}

/* 历史记录列表（公开的 + 自己的私密） */
async function openAIHistory() {
  var all = await DB.all('ai_projects');
  all.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  var me = Auth.user.username;
  var visible = all.filter(function (p) { return p.visibility === 'public' || p.operator === me; });
  var rows = '';
  for (var i = 0; i < visible.length; i++) {
    var p = visible[i];
    var canDel = p.operator === me || isAdminNow();
    rows += '<div class="ai-plan-item">' +
      '<div class="p-name"><b>' + escapeHtml(p.name) + '</b><div style="font-size:12px;color:var(--text-sub)">' +
        (p.source === 'bom' ? 'BOM 导入' : '智能配料') + ' · ' + escapeHtml(p.operator) + ' · ' + fmtDateShort(p.createdAt) +
        (p.visibility === 'private' ? ' · 私密' : '') + '</div></div>' +
      '<button class="btn btn-sm btn-primary" onclick="openAIProject(\'' + p.id + '\')">打开</button>' +
      (canDel ? '<button class="btn btn-sm btn-outline" onclick="editAIProject(\'' + p.id + '\')">编辑</button>' : '') +
      (canDel ? '<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="deleteAIProject(\'' + p.id + '\')">删除</button>' : '') +
      '</div>';
  }
  if (!visible.length) rows = '<div class="empty">还没有保存过项目，配料结果出来后点右上角"保存为项目"</div>';
  openModal('项目历史记录', '<div>' + rows + '</div>', '<button class="btn btn-primary" onclick="closeModal()">关闭</button>', 'mid');
}
async function deleteAIProject(id) {
  var ok = await confirmBox('确定删除这个项目记录吗？（不影响已经出库的库存记录）');
  if (!ok) return;
  await DB.delete('ai_projects', id);
  openAIHistory();
}

/* 项目详情弹窗：方案切换 + 物料/缺失 + 一键出库 + AI 问答 */
var AIPView = { proj: null, planIdx: 0, copies: 1 };
async function openAIProject(id) {
  var proj = await DB.get('ai_projects', id);
  if (!proj) { toast('项目不存在', 'err'); return; }
  AIPView.proj = proj; AIPView.planIdx = 0; AIPView.copies = 1;
  aipRender();
}
function aipRender() {
  var proj = AIPView.proj;
  var plan = proj.plans[AIPView.planIdx];
  /* 方案 tabs */
  var tabs = '';
  for (var i = 0; i < proj.plans.length; i++) {
    var cls = i === AIPView.planIdx ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
    tabs += '<button class="' + cls + '" onclick="AIPView.planIdx=' + i + ';aipRender()">' + escapeHtml(proj.plans[i].note || ('方案 ' + (i + 1))) + '</button>';
  }
  /* 有库存物料 */
  var haveRows = '';
  for (var j = 0; j < plan.items.length; j++) {
    var it = plan.items[j];
    haveRows += '<div class="ai-plan-item">' +
      '<div class="p-name"><span class="t-link" onclick="gotoMaterial(\'' + it.mid + '\')">' + escapeHtml(it.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(it.model || '') + ' · ' + locBadge(it.loc, it.locNo, !canSeeLoc(it.mid)) + '</div></div>' +
      '<span style="font-size:12.5px">需要 <b>' + it.needQty + '</b> ' + escapeHtml(it.unit) + ' · 现有 ' + it.have + '</span>' +
      '</div>';
  }
  if (!plan.items.length) haveRows = '<div class="empty">本方案没有匹配到库存物料</div>';
  /* 缺失 */
  var missRows = '';
  for (var b = 0; b < plan.missing.length; b++) {
    var ms = plan.missing[b];
    missRows += '<div class="ai-plan-item" style="border-style:dashed"><div class="p-name">' + escapeHtml(ms.kw) + '<div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(ms.why || '库里没有，需采购') + '</div></div><span style="font-size:12.5px">建议购 <b>' + ms.n + '</b></span></div>';
  }
  if (!plan.missing.length) missRows = '<div class="empty">所需物料全部有库存</div>';
  /* 问答区 */
  var chatHtml = '';
  for (var c = 0; c < proj.chat.length; c++) {
    var cm = proj.chat[c];
    chatHtml += cm.role === 'user'
      ? '<div class="aip-bubble me">' + escapeHtml(cm.content) + '</div>'
      : '<div class="aip-bubble ai">' + escapeHtml(cm.content).replace(/\n/g, '<br>') + '</div>';
  }
  if (!proj.chat.length) chatHtml = '<div style="color:var(--text-sub);font-size:13px;padding:8px 2px">可以追问：怎么接线 / 代码怎么写 / 原理是什么……</div>';

  var body =
    '<div style="font-size:13px;color:var(--text-sub);margin-bottom:10px">' +
      (proj.source === 'bom' ? '嘉立创 BOM 导入' : '智能配料') + ' · 需求：' + escapeHtml(proj.need || '-') + ' · 创建人 ' + escapeHtml(proj.operator) + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">' + tabs +
      '<span style="margin-left:auto;font-size:13px">做</span>' +
      '<input class="input" type="number" id="aip-copies" min="1" step="1" value="' + AIPView.copies + '" style="width:64px;padding:6px 8px" oninput="AIPView.copies=parseInt(this.value,10)||1" />' +
      '<span style="font-size:13px">份</span></div>' +
    '<div class="card" style="margin-bottom:12px"><div class="card-title">库里有（' + plan.items.length + '）</div>' + haveRows + '</div>' +
    '<div class="card" style="margin-bottom:12px"><div class="card-title">库里没有（' + plan.missing.length + '）</div>' + missRows + '</div>' +
    '<div class="card" style="margin-bottom:0"><div class="card-title">' + ICONS.chat + ' AI 问答</div>' +
      '<div id="aip-chat-box" style="max-height:260px;overflow:auto;margin-bottom:10px">' + chatHtml + '</div>' +
      '<div class="ai-input-wrap"><input class="input" id="aip-chat-input" placeholder="追问这个项目怎么做……" onkeydown="if(event.key===\'Enter\')aipSendChat()" />' +
      '<button class="btn btn-primary" onclick="aipSendChat()">' + ICONS.ai + '发送</button></div>' +
    '</div>';

  openModal('项目：' + escapeHtml(proj.name), body,
    '<button class="btn" onclick="closeModal()">关闭</button>' +
    '<button class="btn btn-outline" onclick="aipPrint()">打印取件单</button>' +
    '<button class="btn btn-blue" onclick="aipClaim()">' + ICONS.out + '按本方案一键出库</button>', true);

  var box2 = $('#aip-chat-box');
  if (box2) box2.scrollTop = box2.scrollHeight;
}

/* 一键出库：按当前方案 + 份数，库存够才出；出库后给物料加项目名标签 */
async function aipClaim() {
  var proj = AIPView.proj;
  var plan = proj.plans[AIPView.planIdx];
  var copies = AIPView.copies || 1;
  var done = 0, fail = 0;
  beginBatchLoc();                                                                               // 批量：统一收集位置提示
  for (var i = 0; i < plan.items.length; i++) {
    var it = plan.items[i];
    var m = await DB.get('materials', it.mid);
    if (!m || m.deleted) { fail++; continue; }
    var qty = it.needQty * copies;
    var ok = await applyStockRecord(it.mid, 'out', qty, { project: proj.name, remark: '项目历史再来一笔：' + proj.name });
    if (ok) {
      done++;
      /* 给物料加项目名标签（已有就不重复加） */
      m.tags = m.tags || [];
      if (m.tags.indexOf(proj.name) < 0) {
        m.tags.push(proj.name);
        delete m._search;
        await DB.put('materials', m);
      }
    } else fail++;
  }
  toast('已出库 ' + done + ' 种物料' + (fail ? '，' + fail + ' 种失败（库存不足）' : ''), fail ? 'warn' : 'ok');
  endBatchLoc();                                                                                // 批量结束：一次显示所有位置
  /* 更新项目快照后重开弹窗 */
  for (var p = 0; p < proj.plans.length; p++) {
    for (var k = 0; k < proj.plans[p].items.length; k++) {
      var it2 = proj.plans[p].items[k];
      var m2 = await DB.get('materials', it2.mid);
      if (m2) {
        it2.have = m2.stock;
        it2.status = m2.stock >= it2.needQty ? 'ok' : (m2.stock > 0 ? 'low' : 'none');
      }
    }
  }
  proj.updatedAt = Date.now();
  await DB.put('ai_projects', proj);
  await State.refreshMaterials();
  aipRender();
}

/* AI 问答发送（带项目上下文 + 历史对话） */
async function aipSendChat() {
  var inp = $('#aip-chat-input');
  var text = inp.value.trim();
  if (!text) return;
  var proj = AIPView.proj;
  proj.chat.push({ role: 'user', content: text, time: Date.now() });
  inp.value = '';
  aipRender();                                                          /* 立即显示自己的消息 */
  /* 追加“思考中”气泡 */
  var box = $('#aip-chat-box');
  if (box) {
    var t = document.createElement('div');
    t.className = 'aip-bubble ai';
    t.style.color = 'var(--text-sub)';
    t.textContent = '正在思考…';
    box.appendChild(t);
    box.scrollTop = box.scrollHeight;
  }
  var cfg = await pickAIConfig('plan');
  var sys = '你在帮电子协会的学生完成 DIY 项目「' + proj.name + '」。原始需求：' + (proj.need || '见物料清单') + '。' +
    '学生可能问怎么做、接线方法、示例代码、工作原理、故障排查等。请用简洁中文回答，分步骤、给关键代码，控制在 450 字以内。';
  var msgs = [{ role: 'system', content: sys }];
  for (var i = 0; i < proj.chat.length; i++) {
    msgs.push({ role: proj.chat[i].role, content: proj.chat[i].content });
  }
  try {
    var reply = await callLLM(msgs, cfg || undefined);
    proj.chat.push({ role: 'assistant', content: String(reply), time: Date.now() });
  } catch (err) {
    proj.chat.push({ role: 'assistant', content: '（AI 调用失败：' + err.message + '）', time: Date.now() });
  }
  proj.updatedAt = Date.now();
  await DB.put('ai_projects', proj);
  aipRender();
}

/* 打印当前方案取件单 */
function aipPrint() {
  var proj = AIPView.proj;
  var plan = proj.plans[AIPView.planIdx];
  var copies = AIPView.copies || 1;
  var w = window.open('', '_blank');
  if (!w) { toast('弹窗被拦截', 'err'); return; }
  var rows = '';
  for (var i = 0; i < plan.items.length; i++) {
    var it = plan.items[i];
    rows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(it.name) + '</td><td>' + escapeHtml(it.model || '') + '</td><td><b>' + (it.needQty * copies) + '</b></td><td>' + (canSeeLoc(it.mid || it.id) ? '<span style="color:#FF7F27;font-weight:600">' + escapeHtml(it.loc || '') + '</span>' : '🔒') + '</td><td style="width:40px"></td></tr>';
  }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>取件清单</title>' +
    '<style>body{font-family:"Microsoft YaHei",sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{border:1px solid #bbb;padding:8px}th{background:#eee}@media print{.noprint{display:none}}</style></head><body>' +
    '<h2>' + escapeHtml(proj.name) + ' · 取件清单（' + copies + ' 份）</h2>' +
    '<table><tr><th>#</th><th>物料</th><th>型号</th><th>数量</th><th>位置</th><th>签收</th></tr>' + rows + '</table>' +
    '<p class="noprint" style="margin-top:20px"><button onclick="window.print()">点击打印</button></p></body></html>');
  w.document.close();
}

/* ==================== 编辑已保存项目（改名 + 公开/私密） ==================== */
async function editAIProject(id) {
  var proj = await DB.get('ai_projects', id);
  if (!proj) { toast('项目不存在', 'err'); return; }
  var body =
    '<div class="form-item"><label>项目名称</label>' +
      '<input class="input" id="aip-edit-name" maxlength="40" value="' + escapeHtml(proj.name) + '" /></div>' +
    '<div class="form-item" style="margin-bottom:0"><label>可见范围</label>' +
      '<label style="font-size:13.5px;margin-right:18px"><input type="radio" name="aip-edit-vis" value="public"' + (proj.visibility === 'public' ? ' checked' : '') + ' /> 公开（所有人可见）</label>' +
      '<label style="font-size:13.5px"><input type="radio" name="aip-edit-vis" value="private"' + (proj.visibility === 'private' ? ' checked' : '') + ' /> 私密（仅创建人和管理员）</label></div>';
  openModal('编辑项目', body,
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="doEditAIProject(\'' + id + '\')">保存</button>');
}
async function doEditAIProject(id) {
  var proj = await DB.get('ai_projects', id);
  if (!proj) return;
  var nm = $('#aip-edit-name').value.trim();
  if (nm) proj.name = nm;
  var vis = document.querySelector('input[name="aip-edit-vis"]:checked');
  if (vis) proj.visibility = vis.value;
  proj.updatedAt = Date.now();
  await DB.put('ai_projects', proj);
  closeModal();
  toast('已保存修改', 'ok');
  openAIHistory();
}

