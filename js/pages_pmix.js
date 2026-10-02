/* ============================================================
 * pages_pmix.js  项目配料（项目领料 + 智能配料 合并模块）
 *   三视图：home（你想做什么 + 导入BOM） / plan（配料结果，页面内） / history（历史记录，页面内）
 * 复用：buildPlanFromNeeds / localRecipeMatch / applyStockRecord / callLLM / pickAIConfig / Search / DB / State
 * ============================================================ */

/* 模块状态 */
var PMX = {
  view: 'home',          // home | plan | history
  plans: [],             // AI 多方案
  planIdx: 0,
  plan: null,            // 当前方案 {text,note,aiNote,items,missing}
  copies: 1,             // 份数
  name: '',              // 项目名
  visibility: 'public',  // public | private
  projId: '',            // 已保存项目 id
  operator: '',          // 项目创建人
  source: 'ai',          // ai | bom
  need: '',              // 原始需求
  chat: [],              // AI 问答
  claimed: false,        // 普通成员本次/历史是否已出库（只决定"导出取件清单"是否开放；AI 问答对所有成员开放）
  returnTo: 'home'       // plan 视图返回目标 home | history
};

/* 入口（路由调用） */
async function pageProjectMix() {
  PMX.view = 'home';
  PMX.plans = []; PMX.plan = null; PMX.planIdx = 0; PMX.copies = 1;
  PMX.chat = []; PMX.claimed = false; PMX.projId = ''; PMX.altSuggest = null;
  await pmxRenderHome();
}

/* ---------- 视图 1：主页（输入区） ---------- */
async function pmxRenderHome() {
  var ai = await getAIConfig();
  var aiReady = ai.enabled && ai.url;
  var examples = ['做一个循迹小车', '做蓝牙遥控小车', '流水灯', '温湿度监测站', '智能台灯', 'RFID 门禁系统', '电子时钟', '超声波测距仪'];
  var exHtml = '';
  for (var i = 0; i < examples.length; i++) {
    exHtml += '<span class="tag-chip" onclick="pmxFillExample(\'' + examples[i] + '\')">' + examples[i] + '</span> ';
  }
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">项目配料</div><div class="page-desc">一句话描述需求，AI 给出方案与物料清单并匹配库存；也可导入嘉立创 BOM 一键配齐；历史项目可一键再领 / 导出</div></div>' +
      '<button class="btn btn-outline" onclick="pmxOpenHistory()">' + ICONS.history + '历史项目</button>' +
    '</div>' +
    '<div class="card">' +
      '<div class="form-item" style="margin-bottom:0"><label>你想做什么？</label>' +
        '<div class="ai-input-wrap">' +
          '<input class="input" id="pmx-need" placeholder="例如：做一个流水灯 / 做循迹小车 / 我要测室内温湿度并显示出来" onkeydown="if(event.key===\'Enter\')pmxRunLocal()" />' +
          (aiReady ? '<button class="btn btn-primary" onclick="pmxRunAI()">' + ICONS.ai + 'AI 分析</button>' : '<span class="form-hint" style="align-self:center">AI 未启用，按回车用本地引擎匹配</span>') +
          '<div style="display:flex;flex-direction:column;gap:5px">' +
            '<button class="btn btn-outline" onclick="$(\'#pmx-bom-file\').click()">' + ICONS.upload + '导入嘉立创 BOM</button>' +
            '<div style="font-size:12px;color:var(--text-sub);text-align:center;display:flex;flex-direction:column;gap:4px"><span>可把文件直接拖进页面导入</span><span style="cursor:pointer;text-decoration:underline" onclick="pmxBomMapModal()">表头对不上？手动映射列</span></div>' +
          '</div>' +
        '</div>' +
        '<input type="file" id="pmx-bom-file" accept=".csv,.txt,.xlsx,.xls" style="display:none" onchange="pmxImportBom(this)" />' +
      '</div>' +
      '<div class="chips-row" style="margin-top:14px">' + exHtml + '</div>' +
    '</div>';
}

function pmxFillExample(t) { var el = $('#pmx-need'); if (el) el.value = t; }

/* ---------- 触发：本地 / AI / BOM ---------- */
function pmxRunLocal() {
  var el = $('#pmx-need');
  var text = el ? el.value.trim() : '';
  if (!text) { toast('请先输入你想做什么', 'warn'); return; }
  var result = localRecipeMatch(text);
  if (result.note) toast(result.note, 'info');
  PMX.source = 'ai'; PMX.need = text; PMX.name = text.slice(0, 20);
  PMX.plans = []; PMX.planIdx = 0; PMX.plan = result; PMX.chat = []; PMX.claimed = false; PMX.projId = '';
  pmxRenderPlan();
}

async function pmxRunAI() {
  var el = $('#pmx-need');
  var text = el ? el.value.trim() : '';
  if (!text) { toast('请先输入你想做什么', 'warn'); return; }
  window._aiAbort = false;                                          // 重置中止标志（每次分析前清零）
  $('#page').insertAdjacentHTML('beforeend', '<div id="pmx-ai-loading" class="card"><div class="empty" id="pmx-ai-loading-txt">AI 正在分析需求并设计方案……（需要联网，约几分钟，请耐心等待）</div><div style="text-align:center;margin-top:8px"><button class="btn btn-outline" onclick="aiStop(this)">停止</button></div></div>');
  try {
    /* 完整物料库数据（给 AI 挑选，不出现在界面问答里） */
    var libTxt = State.materials.filter(function (m) { return !m.deleted; }).map(function (m) {
      var _ps = [];
      if (m.model) _ps.push('型号 ' + m.model);
      if (m.pkg) _ps.push('封装 ' + m.pkg);
      return '· ' + m.name + (_ps.length ? '（' + _ps.join('，') + '）' : '') +
        '，类别 ' + [m.cat, m.sub].filter(function (x) { return x; }).join('/') +
        '，库存 ' + (m.stock || 0) + (m.unit || '') +
        (m.loc ? '，位置 ' + (m.loc || '') + (m.locNo || '') : '');
    }).join('\n');
    var sysPrompt =
      '你是电子协会的项目指导老师兼物料管理员。学生想做一个电子项目，你要基于协会物料库的现有物料，给出多个确实能做出来的方案，并讲清楚实现方法。\n\n' +
      '【协会物料库（只能从中选物料；库存数量已标注）】\n' + (libTxt || '（物料库为空）') + '\n\n' +
      '【任务】\n' +
      '1. 给出 2~4 个不同的、可实现的方案：方案数量不限定，思路也不限定（可以是单片机编程、纯硬件、换不同主控等），只要确实能用所选物料把项目做出来即可。\n' +
      '2. 每个方案的 items 必须明确选用物料库里的哪些物料：name 用"主名|别名|类别"竖线格式，qty 为单份所需数量，why 写它在项目里的作用。库里数量不够、或库里没有需采购的物料也照列（系统会自动归到"库里不够/库里没有"），但该有的物料一个都不能漏。\n' +
      '3. 每个方案必须给出 guide：基于所选物料的完整实现方法，具体到——电路怎么连接（哪个引脚接哪个）、需要的代码（如有，给出完整可直接烧录的代码）、制作与调试步骤。\n' +
      '4. 严格围绕用户明确描述的需求，禁止脑补用户没要求的东西（用户要流水灯就别列电机、传感器、显示屏、蓝牙、蜂鸣器等）。\n\n' +
      '只输出 JSON 数组，不要任何多余文字，格式：\n' +
      '[{"planName":"方案名（括号里写思路）","items":[{"name":"主名|别名|类别","qty":数字,"why":"作用"}],"guide":"完整实现方法：电路连接 + 代码 + 调试步骤"}]\n' +
      '每个方案 items 控制在 15 项以内。';
    var cfg = await pickAIConfig('plan');
    var reply = await callLLM([{ role: 'system', content: sysPrompt }, { role: 'user', content: text }], cfg || undefined);
    if (window._aiAbort) { var _ld0 = $('#pmx-ai-loading'); if (_ld0) _ld0.remove(); toast('AI 分析已停止', 'warn'); return; }  // 用户已点停止：丢弃结果
    var arr = extractJSONArray(reply);
    if (!arr || arr.length === 0) throw new Error('AI 返回的清单无法解析');
    PMX.plans = [];
    for (var a = 0; a < arr.length; a++) {
      var rawItems = arr[a].items || [];
      var needs = [];
      for (var x = 0; x < rawItems.length; x++) {
        if (!rawItems[x].name) continue;
        needs.push({ kw: String(rawItems[x].name), n: parseInt(rawItems[x].qty, 10) || 1, why: String(rawItems[x].why || '') });
      }
      var p = buildPlanFromNeeds(text, needs, String(arr[a].planName || ('方案 ' + (a + 1))));
      p.aiNote = reply;
      p.guide = String(arr[a].guide || '');                                   // 实现方法讲解（电路/代码）
      PMX.plans.push(p);
    }
    if (!PMX.plans.length) throw new Error('AI 没有给出任何方案');
    PMX.source = 'ai'; PMX.need = text; PMX.name = text.slice(0, 20);
    PMX.planIdx = 0; PMX.plan = PMX.plans[0]; PMX.claimed = false; PMX.projId = '';
    /* 首轮问答：结果卡片一打开就有（用户初始问题 + AI 各方案物料与实现讲解），后续追问在此基础上带记忆 */
    var initQ = '我想做一个项目：' + text + '。你看看以物料库里面的物料能怎么选来做，多给几个方案，告诉我选物料库里面哪些物料，并以这些物料具体讲一下这个项目怎么实现，包括电路连接、代码编写。';
    var initA = PMX.plans.map(function (pl) {
      var _L = [];
      (pl.items || []).forEach(function (it) {
        var m = it.material || {};
        var _st = it.status === 'low' ? '（库里不够，现有 ' + (m.stock || 0) + '）' : '';
        _L.push('· ' + (m.name || '') + (m.model ? '（' + m.model + '）' : '') + ' ×' + it.needQty + _st + (it.why ? ' — ' + it.why : ''));
      });
      (pl.missing || []).forEach(function (ms) {
        _L.push('· [缺] ' + (ms.name || '') + ' ×' + ms.n + (ms.why ? ' — ' + ms.why : ''));
      });
      return '【' + (pl.note || '方案') + '】\n选用物料：\n' + (_L.length ? _L.join('\n') : '（无）') +
        '\n\n实现方法：\n' + (pl.guide || '（AI 未提供实现讲解）');
    }).join('\n\n————\n\n');
    PMX.chat = [{ role: 'user', content: initQ }, { role: 'assistant', content: initA }];
    pmxRenderPlan();
  } catch (err) {
    var ld = $('#pmx-ai-loading'); if (ld) ld.remove();
    if (window._aiAbort) { toast('AI 分析已停止', 'warn'); return; }   // 用户已点停止：不回退本地引擎
    toast('AI 分析失败：' + err.message + '，已回退本地引擎', 'warn');
    pmxRunLocal();
  }
}

/* 方案 tabs：仅 AI 多方案时显示（BOM 单方案不显示） */
function pmxPlanTabs() {
  if (PMX.plans.length <= 1) return '';
  var tabs = '';
  for (var i = 0; i < PMX.plans.length; i++) {
    var cls = i === PMX.planIdx ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
    tabs += '<button class="' + cls + '" onclick="pmxPickPlan(' + i + ')">' + escapeHtml(PMX.plans[i].note || ('方案 ' + (i + 1))) + '</button>';
  }
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">' + tabs + '</div>';
}
function pmxPickPlan(i) { PMX.planIdx = i; PMX.plan = PMX.plans[i]; pmxRenderPlan(); }

/* 位置 badge（明显样式） */
function pmxLocBadge(mid, loc, locNo) {
  return locBadge(loc, locNo, !canSeeLoc(mid));
}

async function pmxRenderPlan() {
  var plan = PMX.plan;
  /* 普通成员：历史项目需检查是否已有出库记录；当前会话用 PMX.claimed */
  if (!isAdminNow() && !PMX.claimed && PMX.projId) PMX.claimed = await pmxCheckClaimed(PMX.name);
  var canSeeExtra = isAdminNow() || PMX.claimed;     // 导出取件清单：成员出库后才出现（AI 问答已对普通成员开放，不走这里）
  var isSaved = !!PMX.projId;                        // 是否已保存的历史项目
  var canOp = isAdminNow() || (PMX.operator && PMX.operator === Auth.user.username); // 可改项目信息

  /* 根据当前份数重新计算每个物料的充足状态（需要 × 份数后与库存比较） */
  for (var i00 = 0; i00 < plan.items.length; i00++) {
    var _e = plan.items[i00];
    var _m = _e.material;
    if (_e.alt) { /* 已采用替代的保持 alt 分类，不重新判断 */ continue; }
    var actualNeed = (_e.needQty || 0) * PMX.copies;
    _e.status = _m.stock >= actualNeed ? 'ok' : (_m.stock > 0 ? 'low' : 'none');
  }

  /* items 拆：库里有（充足）/ 库里不够（数量不足）/ 已采用替代（充足） */
  var okIt = [], lowIt = [], altIt = [];
  for (var i0 = 0; i0 < plan.items.length; i0++) {
    var _it = plan.items[i0];
    if (_it.status === 'low' || _it.status === 'none') lowIt.push(_it);
    else if (_it.alt) altIt.push(_it);
    else okIt.push(_it);
  }

  /* 统一行布局：左(checkbox+名称+位置) | 右(代替标签内容宽 + 单份合计现有 + 出库按钮) */
  function pmxRowHtml(it, rowId, showChk) {
    var m = it.material;
    var canOut = m.stock > 0;
    var altTag = it.alt && it.missIdx >= 0
      ? '<span class="badge badge-gray" style="cursor:pointer;max-width:100%" title="跳到原物料" onclick="pmxFlashById(\'pmx-miss-' + it.missIdx + '\')">代替：' + escapeHtml(it.altKw) + ' ↗</span>'
      : '';
    /* 更正方式标签：该物料被更正过时右上角显示更正来源 */
    var corrBadge = '';
    if (it.rowIdx != null && PMX.corr) {
      var _corrLabels = { ai: 'AI更正', min: '手动输入更正', mlib: '手动查找库更正' };
      for (var _ci = 0; _ci < PMX.corr.length; _ci++) {
        if (PMX.corr[_ci].rowIdx === it.rowIdx && PMX.corr[_ci].active) {
          corrBadge = '<span class="badge badge-blue" style="position:absolute;top:6px;right:8px;font-size:11px">' + _corrLabels[PMX.corr[_ci].active] + '</span>';
          break;
        }
      }
    }
    /* 普通成员：不可见"库里不够"行的入库按钮（管理员仍保留完整操作权） */
    var picked = PMX.pickMarks && PMX.pickMarks[m.id];
    var inBtn = (isAdminNow() && (it.status === 'low' || it.status === 'none'))
      ? (picked ? '<span class="badge badge-green" style="font-size:12px">已入取件清单</span>'
          : '<button class="btn btn-sm btn-success" onclick="pmxPickIn(\'' + m.id + '\')">入库</button>')
      : '';
    return '<div class="ai-plan-item" style="position:relative"' + (rowId ? ' id="' + rowId + '"' : '') + '>' + corrBadge +
      (showChk ? '<input type="checkbox" class="pmx-chk" data-mid="' + m.id + '"' + (canOut ? ' checked' : ' disabled') + ' />' : '') +
      '<div class="p-name" style="flex:1;min-width:0"><span class="t-link" onclick="gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span>' +
        (m.model || m.pkg ? '<div style="margin-top:2px;font-size:12px;color:var(--text-sub)">' + escapeHtml([m.model, m.pkg].filter(function (x) { return x; }).join(' · ')) + '</div>' : '') +
        '<div style="margin-top:3px">' + pmxLocBadge(m.id, m.loc, m.locNo) + '</div></div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">' +
        altTag +
        inBtn +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12.5px;white-space:nowrap">单份 <b>' + it.needQty + '</b> · 合计 <b class="pmx-line-total" data-q="' + it.needQty + '">' + (it.needQty * PMX.copies) + '</b> · 现有 ' + m.stock + '</span></div>' +
      '</div>' +
      '</div>';
  }
  function itemRow(it, rowId) { return pmxRowHtml(it, rowId, true); }
  /* 库里不够行：行前勾选（右上角批量出库） */
  function lowRow(it, rowId) { return pmxRowHtml(it, rowId, true); }

  /* 左列：库里有（充足） */
  var haveRows = '';
  for (var j = 0; j < okIt.length; j++) haveRows += itemRow(okIt[j]);
  if (!okIt.length) haveRows = '<div class="empty">库里没有匹配到相关物料</div>';

  /* 左列：库里不够（始终显示，数量不足的都在这里，含替代后仍不够的） */
  var lowRows = '';
  for (var l0 = 0; l0 < lowIt.length; l0++) {
    var li = -1;
    for (var lf = 0; lf < plan.items.length; lf++) { if (plan.items[lf] === lowIt[l0]) { li = lf; break; } }
    lowRows += lowRow(lowIt[l0], li >= 0 ? 'pmx-alt-' + li : '');
  }
  if (!lowIt.length) lowRows = '<div class="empty">还没有数量不足的物料</div>';
  var lowZone = '<div class="card pmx-col-card" style="margin:16px 0 0"><div class="card-title">库里不够（' + lowIt.length + '）' +
          '<div class="pmx-head-btns"><button class="btn btn-sm btn-blue" onclick="pmxClaim()">' + ICONS.out + '出库</button></div></div>' +
        '<div class="pmx-scroll pmx-scroll-have" style="height:320px;flex:none">' + lowRows + '</div></div>';

  /* 左列下方：已采用替代（充足，一直显示，N=0 给空提示） */
  var altRows = '';
  for (var a2 = 0; a2 < altIt.length; a2++) {
    var ai2 = -1;
    for (var fi = 0; fi < plan.items.length; fi++) { if (plan.items[fi] === altIt[a2]) { ai2 = fi; break; } }
    altRows += itemRow(altIt[a2], 'pmx-alt-' + ai2);
  }
  if (!altIt.length) altRows = '<div class="empty">还没有采用替代物料</div>';
  var altZone = '<div class="card pmx-col-card" style="margin:16px 0 0"><div class="card-title">已采用替代（' + altIt.length + '）' +
          '<div class="pmx-head-btns"><button class="btn btn-sm btn-blue" onclick="pmxClaim()">' + ICONS.out + '出库</button></div></div>' +
        '<div class="pmx-scroll pmx-scroll-alt" style="height:320px;flex:none">' + altRows + '</div></div>';

  /* 右列：库里没有（被代替的置顶，不消失） */
  function missRow(ms, idx) {
    var cls = ' style="border-style:dashed"';
    var extra = '';
    if (ms.adopted) {
      cls = ' style="border-style:dashed;border-color:var(--success);background:rgba(22,163,74,.06)"';
      if (ms.altItemIdx !== undefined && PMX.plan.items[ms.altItemIdx]) {
        var altMx = PMX.plan.items[ms.altItemIdx].material;
        extra = '<span class="badge badge-purple" style="cursor:pointer;max-width:100%" title="跳到替代物料" onclick="pmxFlashById(\'pmx-alt-' + ms.altItemIdx + '\')">被代替：' + escapeHtml(altMx.name) + ' ↙</span>';
      }
    }
    var tt = pmxMissText(ms._f);
    return '<div class="ai-plan-item"' + cls + ' id="pmx-miss-' + idx + '"><div class="p-name">' +
      '<div class="pmx-miss-main">' + escapeHtml(tt.main) + '</div>' +
      (tt.sub ? '<div class="pmx-miss-sub">' + tt.sub + '</div>' : '') + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">' +
        extra +
        '<span style="font-size:12.5px">建议购 <b>' + (ms.n * PMX.copies) + '</b> 个</span>' +
      '</div></div>';
  }
  var adoptedMiss = [], leftMiss = [];
  for (var b = 0; b < plan.missing.length; b++) { (plan.missing[b].adopted ? adoptedMiss : leftMiss).push(plan.missing[b]); }
  var missRows = '';
  for (var b2 = 0; b2 < adoptedMiss.length; b2++) missRows += missRow(adoptedMiss[b2], plan.missing.indexOf(adoptedMiss[b2]));
  for (var b3 = 0; b3 < leftMiss.length; b3++) missRows += missRow(leftMiss[b3], plan.missing.indexOf(leftMiss[b3]));
  if (!plan.missing.length) missRows = '<div class="empty">太棒了！所需物料全部有库存</div>';

  $('#page').innerHTML =
    /* 顶部：标题 + 返回（右上角） */
    '<div class="page-head">' +
      '<div><div class="page-title" style="font-size:18px">配料结果</div>' +
      '<div class="page-desc">' + (PMX.source === 'bom' ? '嘉立创BOM：' : 'AI分析：') + escapeHtml(PMX.need || PMX.name || '') + '</div></div>' +
      '<button class="btn btn-outline" onclick="pmxGoBack()">' + ICONS.back + '返回</button>' +
    '</div>' +
    /* 控制卡片：左列(项目名称 / 可见范围+保存) | 分割线 | 右列(制作份数 / 导出领取蓝+导出购买绿分两行) */
    '<div class="card" style="margin-bottom:14px;padding:14px 16px">' +
      '<div style="display:flex;gap:22px">' +
        '<div style="flex:1;display:flex;flex-direction:column;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">' +
            '<label style="flex:none;white-space:nowrap;margin:0">项目名称 <span class="req" style="color:var(--danger)">*</span></label>' +
            (PMX.source === 'bom'
              ? '<div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex:none">'
                + '<span style="font-size:12.5px;color:var(--text-sub);white-space:nowrap">物料识别不准？试试→</span>'
                + '<button class="btn btn-sm btn-outline" onclick="pmxCorrOpen()">手动/AI 更正</button>'
                + '</div>'
              : '') +
          '</div>' +
          '<div style="margin-top:8px"><input class="input" id="pmx-name" maxlength="40" style="width:100%" value="' + escapeHtml(PMX.name) + '" oninput="PMX.name=this.value" /></div>' +
          '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-top:auto;padding-top:12px">' +
            '<div style="display:flex;align-items:center;gap:12px"><label style="font-size:13px;color:var(--text-sub);margin:0">可见范围</label><div class="radio-group">' +
            '<span class="radio-chip' + (PMX.visibility === 'public' ? ' on' : '') + '" data-v="public" onclick="pmxVisPick(this)">公开</span>' +
            '<span class="radio-chip' + (PMX.visibility === 'private' ? ' on' : '') + '" data-v="private" onclick="pmxVisPick(this)">私密</span>' +
            '</div></div>' +
          (canOp ? '<button class="btn btn-primary" style="margin-left:auto" onclick="pmxSave()">保存</button>' : '') +
          '</div>' +
        '</div>' +
        '<div style="width:2px;background:#b8b8b8;flex-shrink:0"></div>' +
        '<div style="width:280px;display:flex;flex-direction:column;gap:8px;flex-shrink:0">' +
          '<div class="form-item" style="margin-bottom:0;max-width:130px"><label>制作份数</label><input class="input" id="pmx-copies" type="number" min="1" step="1" value="' + PMX.copies + '" onchange="pmxCopiesChange()" /></div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            (canSeeExtra ? '<button class="btn btn-blue" onclick="pmxExportPick()">导出取件清单</button>' : '') +
            '<button class="btn btn-success" onclick="pmxExportBuy()">导出购买清单</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (!canSeeExtra ? '<div class="form-hint" style="margin-top:6px">普通成员出库后即可导出取件清单（AI 问答对所有成员开放）</div>' : '') +
    '</div>' +
    pmxPlanTabs() +
    /* 两列 */
    '<div class="ai-result-grid">' +
      '<div style="display:flex;flex-direction:column">' +
        '<div class="card pmx-col-card" style="margin-bottom:0"><div class="card-title">库里有（' + okIt.length + '）' +
          '<div class="pmx-head-btns">' +
            '<button class="btn btn-sm btn-blue" onclick="pmxClaim()">' + ICONS.out + '出库</button>' +
          '</div></div>' +
          '<div class="pmx-scroll pmx-scroll-have" style="height:320px;flex:none">' + haveRows + '</div></div>' +
        lowZone +
      '</div>' +
      '<div style="display:flex;flex-direction:column">' +
        '<div class="card pmx-col-card" style="margin-bottom:0"><div class="card-title">库里没有（' + plan.missing.length + '）' +
          '<div class="pmx-head-btns">' +
            (plan.missing.length ? '<button class="btn btn-sm btn-outline" onclick="pmxFindAlt()">' + ICONS.ai + 'AI 查找替代</button>' : '') +
            (PMX.source === 'bom' ? '<button class="btn btn-sm btn-outline" onclick="pmixAltShowHistory()">' + ICONS.history + '查找历史</button>' : '') +
          '</div></div>' +
          '<div class="pmx-scroll pmx-scroll-miss" style="height:320px;flex:none">' + missRows + '</div></div>' +
          altZone +
        '</div>' +
      '</div>' +
    /* AI 问答：对所有成员开放（不再要求先出库） */
    pmxChatCard();
  window.scrollTo(0, 0);
}

/* 跳转到指定行并高亮（整条记录闪烁） */
function pmxFlashById(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('rec-flash');
  void el.offsetWidth;
  el.classList.add('rec-flash');
  setTimeout(function () { el.classList.remove('rec-flash'); }, 2700);
}

/* 对话气泡列表（每条带删除按钮，可单独删除某条信息） */
/* 轻量 markdown：代码块 / 行内代码 / 换行（代码块内换行保留，不被 <br> 破坏） */
function pmxRenderMd(t) {
  t = String(t == null ? '' : t);
  var codes = [];
  t = t.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, function (_, code) { codes.push(code); return '\u0000' + (codes.length - 1) + '\u0000'; });
  var h = escapeHtml(t);
  h = h.replace(/`([^`\n]+)`/g, '<code class="pmx-icode">$1</code>');
  h = h.replace(/\n/g, '<br>');
  h = h.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<pre class="pmx-code">' + escapeHtml(codes[parseInt(i, 10)]) + '</pre>'; });
  return h;
}
function pmxChatBubbles() {
  var bubbles = '';
  for (var i = 0; i < PMX.chat.length; i++) {
    var cm = PMX.chat[i];
    bubbles += '<div style="position:relative">' +
      (cm.role === 'user'
        ? '<div class="aip-bubble me">' + escapeHtml(cm.content) + '</div>'
        : '<div class="aip-bubble ai">' + pmxRenderMd(cm.content) + '</div>') +
      '<button class="pmx-chat-del" onclick="pmxChatDel(' + i + ')" title="删除这条">×</button></div>';
  }
  if (!PMX.chat.length) bubbles = '<div style="color:var(--text-sub);font-size:13px;padding:8px 2px">可以追问：怎么接线 / 代码怎么写 / 原理是什么……</div>';
  return bubbles;
}
function pmxChatCard() {
  return '<div class="card" style="margin-top:14px"><div class="card-title">' + ICONS.chat + ' AI 问答</div>' +
    '<div id="pmx-chat-box" style="max-height:280px;overflow:auto;margin-bottom:10px">' + pmxChatBubbles() + '</div>' +
    '<div class="ai-input-wrap"><input class="input" id="pmx-chat-input" placeholder="追问这个项目怎么做……" onkeydown="if(event.key===\'Enter\')pmxSendChat()" />' +
    '<button class="btn btn-primary" onclick="pmxSendChat()">' + ICONS.ai + '发送</button></div></div>';
}
/* 删除对话中的某一条 */
function pmxChatDel(i) {
  if (i < 0 || i >= PMX.chat.length) return;
  PMX.chat.splice(i, 1);
  var box = $('#pmx-chat-box');
  if (box) box.innerHTML = pmxChatBubbles();
}

function pmxVisPick(el) {
  var chips = el.parentNode.children;
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
  el.classList.add('on');
  PMX.visibility = el.getAttribute('data-v');
}
function pmxCopiesChange() {
  PMX.copies = parseInt($('#pmx-copies').value, 10) || 1;
  if (PMX.copies < 1) PMX.copies = 1;
  pmxRenderPlan();  // 重新渲染配料结果，更新"库里有"/"库里不够"状态
}
function pmxGoBack() {
  if (PMX.returnTo === 'history') { PMX.returnTo = 'home'; pmxOpenHistory(); }
  else pmxRenderHome();
}
async function pmxCheckClaimed(name) {
  var recs = await State.loadRecords();
  return recs.some(function (r) { return r.project === name && r.type === 'out' && r.qty > 0; });
}

/* ============================================================
 * 库里没有每条的内容分层（用户要求）：
 *   黑字 main = 主要信息 / 元件身份（类别 + 标称值或型号）
 *   灰字 sub  = 次要信息 / 补充（封装 · 厂家型号 · 立创编号 · 位号）
 *   两者不重复。各类常见元件的主要信息口径：
 *     电阻/电容/电感/晶振 → 标称值（频率）为主
 *     二极管/芯片/单片机/电机驱动/三极管/MOS/开关/保险丝/传感器/蓝牙/陀螺 → 型号为主
 *     LED → 颜色 + 尺寸；蜂鸣器 → 型号 + 频率
 *     排针排母针座母座端子 → 针数 + 间距（name 已含）
 * ============================================================ */
function pmxMissText(f) {
  f = f || {};
  var cls = String(f.cls || ''), name = String(f.name || cls || '元件');
  var v = String(f.v || '').trim(), model = String(f.model || '').trim(), nm = String(f.nm || '').trim(), mfr = String(f.mfr || '').trim();
  var param = '';
  if (/排针|排母|针座|母座|端子|连接器/.test(cls)) {
    param = '';                                                                     // 连接器 name 已含针数间距
  } else if (/LED/.test(cls)) {
    var ledM = [model, nm, v].join(' ');
    var colM = ledM.match(/红|绿|蓝|黄|白|橙|紫|青|粉|red|green|blue|yellow|white|orange/i);
    var szM = ledM.match(/0805|0603|0402|1206|1210|2512|3mm|5mm/i);
    param = [colM ? colM[0] : '', szM ? szM[0] : ''].filter(Boolean).join(' ');     // LED：颜色 + 尺寸
  } else if (/蜂鸣/.test(cls)) {
    param = [model, v].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' ');
  } else if (/晶振/.test(cls)) {
    param = v || (model.match(/\d+(?:\.\d+)?\s*(?:mhz|khz)/i) || [''])[0] || model;
  } else if (/电阻|电容|电感/.test(cls)) {
    param = v;                                                                      // 标称值优先
    if (f.pkg && /^(01005|0201|0402|0603|0805|1005|1206|1210|1812|2010|2512)$/i.test(f.pkg)) param = (param ? param + ' ' : '') + f.pkg;   // 贴片阻容：封装尺寸进黑字
  } else {
    param = [model || mfr, v, nm].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' ');   // 型号优先（Device 列为空时用厂家型号列，USB-C/Type-C 等能带上来）
  }
  /* param 去重：去掉已在 name 中的 token（大小写不敏感） */
  if (param) {
    var nameLow = name.toLowerCase();
    var toks = param.split(/\s+/).filter(function (x) { return x && nameLow.indexOf(x.toLowerCase()) < 0; });
    param = toks.join(' ');
  }
  var main = (param && name.toLowerCase().indexOf(param.toLowerCase()) < 0) ? name + ' ' + param : name;
  /* 灰字：位号（最重要） → 封装 → 厂家型号 → 名称；每项单独一行（长项不截断），立创编号/供应商信息不要 */
  var subs = [], subsLow = [], mainLow = main.toLowerCase();
  [f.des, f.pkg, f.mfr, f.nm].forEach(function (x) {
    x = String(x || '').trim();
    var xl = x.toLowerCase();
    if (x && mainLow.indexOf(xl) < 0 && subsLow.indexOf(xl) < 0) { subs.push(x); subsLow.push(xl); }
  });
  return { main: main, sub: subs.map(function (x) { return '<div class="pmx-miss-sub-line">' + escapeHtml(x) + '</div>'; }).join('') };
}

/* ============================================================
 * BOM 解析导入（页面内，结尾进 plan 视图）
 * 说明：嘉立创 BOM 常见列——Device/Name/型号=名称型号，Value=标称值，
 *       Footprint=封装（前缀字母 C电容/R电阻/L电感/SW开关/F保险丝/
 *       J·P·CN·H排针针座/X晶振/D二极管/Q三极管/U芯片…，去掉字母才是真封装如 C0805→0805），
 *       Quantity=数量，Manufacturer Part=厂家型号，Supplier Part=立创编号。
 * ============================================================ */

/* 原表"分类"列文字 → 标准类别名（Category / Primary Category / Secondary Category 常直接写明类别，最可靠） */
function pmxClsFromCategory(txt) {
  var s = String(txt || '');
  if (!s) return '';
  if (/蜂鸣|buzzer|buzz/i.test(s)) return '蜂鸣器';
  if (/晶振|crystal|振荡器|谐振器|oscillator/i.test(s)) return '晶振';
  if (/数码管|segment/i.test(s)) return '数码管';
  if (/显示屏|液晶|oled|lcd|display/i.test(s)) return 'OLED 显示屏';
  if (/发光二极管|\bled\b|light\s*emitting/i.test(s)) return 'LED';   // 必须早于"二极管"，否则"发光二极管"会被当普通二极管
  if (/电机驱动|马达驱动|motor\s*driver/i.test(s)) return '电机驱动芯片';
  if (/陀螺|imu|gyro|accel/i.test(s)) return '陀螺仪';
  if (/蓝牙|bluetooth/i.test(s)) return '蓝牙模块';
  if (/红外|infrared/i.test(s)) return '红外传感器';
  if (/单片机|微控制器|mcu/i.test(s)) return '芯片';
  if (/集成电路|芯片|\bic\b/i.test(s)) return '芯片';
  if (/场效应|mosfet|\bmos\b/i.test(s)) return 'MOS管';
  if (/三极管|晶体管|transistor/i.test(s)) return '三极管';
  if (/二极管|diode/i.test(s)) return '二极管';
  if (/电解/i.test(s)) return '电解电容';
  if (/钽/i.test(s)) return '钽电容';
  if (/电容|capacitor/i.test(s)) return '电容';
  if (/可调电阻|电位器|potentiometer/i.test(s)) return '可调电阻';
  if (/电阻|resistor/i.test(s)) return '电阻';
  if (/磁珠|ferrite|bead/i.test(s)) return '磁珠';
  if (/电感|inductor/i.test(s)) return '电感';
  if (/保险丝|熔断|fuse/i.test(s)) return '保险丝';
  if (/开关|按键|switch|button/i.test(s)) return '开关';
  if (/传感器|sensor/i.test(s)) return '传感器';
  if (/天线|antenna/i.test(s)) return '天线';
  if (/连接器|接插件|排针|排母|针座|母座|端子|connector|header/i.test(s)) return '连接器';
  return '';
}

/* 元件类型感知：把 BOM 的 型号/名称/标称值/封装 组合成人话描述 */
function bomDescribe(dev, nm, val, pkg, mfr, code, des, cmt, extra) {
  var D = String(dev || '').trim(), N = String(nm || '').trim(), V = String(val || '').trim(), P = String(pkg || '').trim();
  var C = String(cmt || '').trim();                                       // Comment 列（型号/参数常在这里）
  var X = String(extra || '').trim();                                     // 原表"分类"类列文字（Category / Primary Category / Secondary Category / 分类…）
  var DS = String(des || '').trim();                                      // 位号（如 BUZZER1、CN1,CN4，也是可靠线索）
  var low = (D + ' ' + N + ' ' + V + ' ' + P + ' ' + mfr + ' ' + C + ' ' + X + ' ' + DS).toLowerCase();   // 含厂家型号/ Comment / 分类列 / 位号，里面常有真型号（如 NE555DR）
  var main = N || D || V || '';
  var dPre = String(des || '').trim().match(/^(SW|U|IC|DC|X|D|Q|CONN|CN|J|P|H|F|L|C|R)\d+/i);  // 位号前缀（SW1/SW2/DC1/IC1…）
  var cls = '';
  var locked = false;   // 型号特征明确锁定：AI 分析不得覆盖类别
  /* 1) 封装字母前缀 → 大类（长前缀优先：CONN/CAP-TH/LED/BUZ/RES/USB/CRYSTAL/KEY/DC/LQFP/LGA 必须先于单字母 C/R/L/U/D/F；前缀后必须跟分隔符或字符串结尾） */
  var mP = P.match(/^(CONN|CAP-TH|LED|BUZ|RES-ADJ|RES|SW|USB|CRYSTAL|KEY|LQFP|LGA|DC|CN|J|P|H|X|Q|U|C|R|L|D|F)(?:[-_].*|$)/i);
  var pre = mP ? mP[1].toUpperCase() : '';
  var cleanPkg = (mP && mP[2]) ? String(mP[2]).trim() : P;
  /* LL-34/LL-41 等是玻璃封装二极管（如 ZMM 系列稳压管），不是电感，需要排除 */
  if (pre === 'L' && /^LL[-_]?/i.test(P)) { pre = ''; cleanPkg = P; }
  if (pre === 'CRYSTAL') cls = '晶振';
  else if (pre === 'KEY') cls = '开关';
  else if (pre === 'RES-ADJ') cls = '可调电阻';
  else if (pre === 'C' || pre === 'CAP-TH') cls = (/bd\d/i.test(P) && /-fd/i.test(P)) ? '贴片极性电容' : '电容';
  else if (pre === 'R' || pre === 'RES') cls = '电阻';
  else if (pre === 'LQFP') cls = '芯片';                    // LQFP-64 等贴片芯片（避免被 L 误判电感）
  else if (pre === 'LGA') cls = /lsm|mpu|icm|陀螺|accel|imu/i.test(low) ? '陀螺仪' : '传感器';   // LGA 封装多为 IMU 传感器（LSM6DS3 等）
  else if (pre === 'DC') cls = '连接器';                     // DC 电源插座（优先于 D 二极管）
  else if (pre === 'L') cls = '电感';
  else if (pre === 'SW') cls = '开关';
  else if (pre === 'F') cls = '保险丝';
  else if (pre === 'X') cls = '晶振';
  else if (pre === 'D') cls = '二极管';
  else if (pre === 'Q') cls = '三极管';
  else if (pre === 'U') cls = '芯片';
  else if (pre === 'LED') cls = (/seg/i.test(low) ? '数码管' : 'LED');
  else if (pre === 'BUZ') cls = '蜂鸣器';
  else if (pre === 'USB' || pre === 'CONN' || pre === 'CN' || pre === 'J' || pre === 'P' || pre === 'H') cls = '连接器';
  /* 1.5) 封装前缀判断后：先用原表"分类"列（Category / Primary Category / Secondary Category）校正，
         再用关键词修正（防止封装前缀误判，如 XTAL 封装其实是蜂鸣器） */
  if (X) {
    var xc = pmxClsFromCategory(X);
    if (xc) cls = xc;
  }
  if (cls) {
    if (/buzz|蜂鸣|蜂鸣器/i.test(low)) cls = '蜂鸣器';
    else if (/crystal|xtal|晶振|谐振|振荡/i.test(low)) cls = '晶振';
  }
  /* 2) 无封装前缀时：先按位号（SW→开关等，位号最可靠），再按封装特征与标称值/关键词 */
  if (!cls && dPre) {
    var dC = dPre[1].toUpperCase();
    if (dC === 'SW') cls = '开关'; else if (dC === 'U' || dC === 'IC') cls = '芯片'; else if (dC === 'DC') cls = '连接器';
    else if (dC === 'X') cls = '晶振'; else if (dC === 'D') cls = '二极管'; else if (dC === 'Q') cls = '三极管';
    else if (dC === 'CONN' || dC === 'CN' || dC === 'J' || dC === 'P' || dC === 'H') cls = '连接器';
    else if (dC === 'F') cls = '保险丝'; else if (dC === 'L') cls = '电感';
    else if (dC === 'C') cls = '电容'; else if (dC === 'R') cls = '电阻';
  }
  if (!cls) {
    if (/^mc[-_]?\d/i.test(D) || /^mc[-_]?\d/i.test(N) || /usb/i.test(low)) cls = '连接器';        // MC-110LD 等 USB 座
    else if (/^sod|^sma|^smb/i.test(P) || /二极管|diode/i.test(low)) cls = '二极管';
    else if (/^sot/i.test(P) || /三极管|transistor/i.test(low)) cls = (/mos|(^|[-_\s])ao|irf/i.test(low) ? 'MOS管' : '三极管');
    else if (/^(sop|soic|qfn|dip|tssop|ssop|lqfp|msop|hsop|htssop|wson|son|dfn)/i.test(P) || /ic|芯片|单片机|mcu|soc|tmc\d{3,}|drv\d{3,}/i.test(low)) cls = '芯片';
    else if (/(?:μ|u|n|p|m)?f\b/i.test(V) || /电容/.test(low)) cls = '电容';
    else if (/[kKmM]?Ω|ohm/i.test(V) || /电阻/.test(low)) cls = '电阻';
    else if (/(?:μ|u|m|n)h\b/i.test(V) || /电感/.test(low)) cls = '电感';
    else if (/(?:\d[\d.]*\s*)?(?:mhz|khz)\b/i.test(low)) cls = /磁珠|ferrite|bead/i.test(low) ? '磁珠' : '晶振';   // 带频率：晶振或磁珠
    else if (/led|发光/i.test(low)) cls = (/seg/i.test(low) ? '数码管' : 'LED');
    else if (/buzz|蜂鸣/i.test(low)) cls = '蜂鸣器';
  }
  /* 2.5) 名称/型号特征最终覆盖（比封装前缀/位号可靠：ITR9909 位号 U 但红外传感器、JDY-23 蓝牙、DRV8870 电机驱动、OLED 屏、8MHz 晶振）
          命中即 locked=true，AI 分析不得覆盖；焊盘/测试点在此排除，不按位号判芯片 */
  if (/焊盘|testpoint|测试点|(?:^|[-_ ])pad(?:[-_ ]|$)/i.test(low)) { cls = '其他'; locked = true; }
  else if (/^mc[-_]?\d/i.test(D) || /^mc[-_]?\d/i.test(N) || /usb/i.test(low)) { cls = '连接器'; locked = true; }
  else if (/oled/i.test(low)) { cls = 'OLED 显示屏'; locked = true; }
  else if (/^itr\d|^tr\d{3,}|红外/i.test(low) || /反射式|光电传感器/i.test(low)) { cls = '红外传感器'; locked = true; }
  else if (/^jdy[-_]?\d|蓝牙|bluetooth/i.test(low)) { cls = '蓝牙模块'; locked = true; }
  else if (/drv\d{3,}|tmc\d{3,}|电机驱动|马达驱动/i.test(low) || /^l298|^l293/i.test(low)) { cls = '电机驱动芯片'; locked = true; }
  else if (/^lsm|^mpu\d|^icm|陀螺|accel|imu/i.test(low)) { cls = '陀螺仪'; locked = true; }
  else if (/crystal|xtal|晶振/i.test(low) || /^x50/i.test(P)) { cls = '晶振'; locked = true; }
  else if (/(?:^|[-_ ])ne?555(?:dr|d|p)?\b|定时器芯片/i.test(low)) { cls = '芯片'; locked = true; }   // NE555 定时器（Device 可能被写成频率）
  else if (/^(?:sop|soic|tssop|msop|hsop|htssop|qfn|qfp|dfn|son|wson)/i.test(P) && (mfr || /^u/i.test(String(des)))) { cls = '芯片'; locked = true; }   // 标准 IC 封装 + 厂家型号/位号 U：芯片（优先于频率兜底）
  else if (/\d+(?:\.\d+)?\s*(?:mhz|khz)\b/i.test(D + ' ' + N + ' ' + V) && !/磁珠|ferrite|bead/i.test(low) && !/^(?:sop|soic|tssop|msop|hsop|qfn)/i.test(P) && !/buzz|蜂鸣|蜂鸣器/i.test(low) && !/^buz/i.test(P)) { cls = '晶振'; locked = true; }   // 剩余带明确频率（有源晶振）：晶振
  else if (/^esp32|^stm32|^atmega|^at89|^nrf\d|^esp\d|单片机|mcu|soc/i.test(low)) { cls = '芯片'; locked = true; }
  /* 3) 细分类型与参数（针数/间距/电容类型/二极管类型） */
  var t = cls;
  if (cls === '电容') {
    t = /电解|铝/.test(low) ? '电解电容' : (/钽/.test(low) ? '钽电容' : (/bd\d/i.test(P) ? '贴片极性电容' : (/贴片|^cl2|^gr|^cc\d/.test(low) || /^(0805|0603|0402|1206|1210|2512)$/i.test(cleanPkg) ? '贴片电容' : '电容')));
  } else if (cls === '电阻' || cls === '可调电阻') {
    t = (cls === '可调电阻' ? (/贴片/.test(low) ? '贴片可调电阻' : '可调电阻') : (/贴片/.test(low) || /^(0805|0603|0402|1206|1210|2512)$/i.test(cleanPkg) ? '贴片电阻' : '电阻'));
  } else if (cls === '连接器') {
    if (/usb/i.test(low) || /^mc[-_]?\d/i.test(D) || /^mc[-_]?\d/i.test(N)) {
      t = 'USB 连接器';
    } else if (/dc[-_ ]?pwr|dc[-_ ]?jack|dc[-_ ]?socket|dc[-_ ]?插座|dc[-_ ]?电源/i.test(low) || /^dc[-_ ]?.*\d+/i.test(P)) {
      t = 'DC 电源插座';
    } else {
      /* 提取间距（从 Device、Footprint 或 Comment 中找 mm 或 P2.54） */
      var pitch = (String(D).match(/(\d+(?:\.\d+)?)\s*mm/i) || P.match(/[pP](\d+(?:\.\d+)?)(?![a-z])/i) || String(C).match(/(\d+(?:\.\d+)?)\s*mm/i) || [])[1] || '';
      /* 检查双排格式（如 2x16P、2×16P、2*16P、2-16P）— 需捕获两排数值，如 2*-16P → ["2-16P", "2", "16"] */
      var dualRe = /(2)[-x×*](\d+)[pP]/i;
      var dualMatch = P.match(dualRe) || String(C).match(dualRe);
      if (dualMatch) {
        var pinsRaw = dualMatch[1] + 'x' + dualMatch[2] + 'P';  // 生成 2x16P 格式
        var subParts = [pinsRaw];
        if (pitch) subParts.push(pitch + 'mm');
        t = '双排连接器' + (subParts.length ? '（' + subParts.join(' ') + '）' : '');
      } else {
        /* 非双排格式：提取针数（优先 Device，再 Footprint） */
        var pins = (String(D).match(/(\d+)\s*[pP]\b/) || String(D).match(/(\d+)\s*pin/i) || P.match(/(\d+)[pP]\b/i) || [])[1] || '';
        var sub = [pins ? pins + 'P' : '', pitch ? pitch + 'mm' : ''].filter(Boolean).join(' ');
        t = '连接器' + (sub ? '（' + sub + '）' : '');   // 不本地细分排针/排母，统一进弹窗让用户手选
      }
    }
  } else if (cls === '其他') {
    t = /焊盘|(?:^|[-_ ])pad(?:[-_ ]|$)|testpoint|测试点/i.test(low) ? '焊盘/测试点' : '其他';
  } else if (cls === '二极管') {
    t = /tvs|smbj|smaj|smf\d/i.test(low) ? 'TVS 二极管' : (/^m[1-9]\b|整流/i.test(low) ? '整流二极管' : (/cus|bat5|ss\d|肖特基/i.test(low) ? '肖特基二极管' : (/1n4148|1n914|开关/i.test(low) ? '开关二极管' : '二极管')));
  }
  /* 4) 结构化返回：name=类别名（黑字主信息用），v/model/nm/pkgShort/mfr/code/des 供渲染分层，不拼 detail */
  var name = t || main || '元件';
  var Dc = String(D).replace(/_C\d+$/i, '');                                                                          // 去掉嘉立创内部编号后缀（如 M7_C95872 → M7）
  if (/^\d+(?:\.\d+)?\s*(?:khz|mhz)\s*$/i.test(Dc) && mfr) Dc = String(mfr).trim();   // Device 是应用频率（如"100kHz"）、真型号在厂家型号列（NE555DR）
  if (!Dc && C) Dc = C;                                                                        // Device 列为空：型号在 Comment 列（开关/部分芯片常见）
  function pkgShort(pp, c) {
    if (!pp) return '';
    var bd = String(pp).match(/bd(\d+(?:\.\d+)?)/i);
    if (bd) return (c === '贴片极性电容' ? bd[1] + 'mm 圆柱有座' : bd[1] + 'mm 直插');
    var sz = String(pp).match(/(0805|0603|0402|1206|1210|2512|dip\d+|sop\d+|qfn\d+|tssop\d+|to-?\d+)/i);
    if (sz) return sz[1];
    if (c === 'LED') return '';
    /* 常见封装没匹配上：把完整封装放上来，AI 找替代/采购更准（如 RES-ADJ-TH_3P-L9.5-W9.5-P2.50-L_3386P） */
    var pTrim = String(pp || '').trim();
    if (pTrim && pTrim.length < 70 && /[a-z0-9]/i.test(pTrim)) return pTrim;
    return '';
  }
  var ps = pkgShort(P, cls);  // 连接器也保存 Footprint，供历史项目恢复双排信息
  return { name: name, cls: cls || '', v: V, model: Dc, nm: N, pkgShort: ps, mfr: mfr || '', code: code || '', des: String(des || '').trim(), cleanPkg: cleanPkg, locked: locked, mount: pmxMountType(P), cmt: C };
}

/* 读取 BOM 文件 → 二维表（统一 csvCell 清洗） */
async function pmxReadGrid(file) {
  var lowName = file.name.toLowerCase();
  var grid = null;
  if (lowName.endsWith('.xlsx') || lowName.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') { toast('表格解析组件未加载，请改用 CSV', 'err'); return null; }
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
  for (var g0 = 0; g0 < grid.length; g0++) {
    for (var g1 = 0; g1 < grid[g0].length; g1++) grid[g0][g1] = csvCell(String(grid[g0][g1]));
  }
  return grid;
}

/* 按表头自动定位各列（大小写不敏感，兼容英文/中文表头） */
function pmxAutoColMap(cols) {
  function colIdx(re) { for (var k = 0; k < cols.length; k++) { if (re.test(String(cols[k]).trim())) return k; } return -1; }
  var iDev = colIdx(/^device$/i);
  if (iDev < 0) iDev = colIdx(/^型号$|^model$/i);
  var iName = colIdx(/^name$/i);
  if (iName < 0) iName = colIdx(/名称/i);
  var iVal = colIdx(/^value$/i);
  if (iVal < 0) iVal = colIdx(/标称|规格/i);
  var iPkg = colIdx(/封装|footprint/i);
  var iQty = colIdx(/^个数$|^数量$|^quantity$|^qty/i);
  var iMfr = colIdx(/manufacturer\s*part/i);
  var iCode = colIdx(/supplier\s*part|物料编码|^lcsc|立创编号|jlcpcb/i);
  var iDes = colIdx(/designator|位号|refdes|^ref$/i);
  var iCmt = colIdx(/^comment$|^备注$/i);                              // Comment 列：很多 BOM 的型号/参数放在这里（开关、芯片等）
  return { iDev: iDev, iName: iName, iVal: iVal, iPkg: iPkg, iQty: iQty, iMfr: iMfr, iCode: iCode, iDes: iDes, iCmt: iCmt };
}
/* 列映射补全：旧项目保存的快照 / 手动映射结果里缺的新列（如 Comment），按表头名补上；已有映射（含手动指定的 -1）不覆盖 */
function pmxMapFill(map, headRow) {
  var auto = pmxAutoColMap(headRow || []);
  var out = {};
  for (var k in auto) {
    var sv = map ? map[k] : undefined;
    out[k] = (sv == null) ? auto[k] : sv;
  }
  return out;
}

/* 从一行 BOM 里取出"分类"类列的文字（Category / Primary Category / Secondary Category / 分类 / 类别 / 类型…），拼成一段文字用于识别 */
function pmxRowCatText(row, head) {
  var out = [];
  for (var j = 0; j < row.length; j++) {
    var hk = String((head || [])[j] || '').trim();
    if (!/categor|^type$|^class$|分类|类别|类型|品类/i.test(hk)) continue;   // 只挑分类性质的列
    var v = String(row[j] || '').trim();
    if (v && out.indexOf(v) < 0) out.push(v);
  }
  return out.join(' ');
}
/* 由表 + 表头行 + 列映射 → 配料计划并渲染（自动识别与手动映射共用） */
function pmxBuildPlanFromGrid(grid, headIdx, map, fileName) {
  map = pmxMapFill(map, grid[headIdx]);                              // 补齐新增列（如 Comment）
  var head = grid[headIdx] || [];                                    // 表头行（用于识别 Category 等分类列）
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
    var cmt = map.iCmt >= 0 ? String(d[map.iCmt] || '').trim() : '';  // Comment 列（嘉立创 BOM 常用）
    var qty = map.iQty >= 0 ? (parseInt(String(d[map.iQty]).replace(/[^\d]/g, ''), 10) || 1) : 1;   // 数量清洗：只留数字
    if (!dev && !nm && !pkg && !code && !cmt) continue;                                                // 空行跳过（允许 Comment 列独立承载信息）
    var catText = pmxRowCatText(d, head);                                                             // 原表分类列文字（Category / Primary Category / Secondary Category…）
    var desc = bomDescribe(dev, nm, val, pkg, mfr, code, des, cmt, catText);
    var kws = [], seenK = {};
    [desc.name, dev, nm, val, desc.cleanPkg, mfr, code, cmt, catText].forEach(function (w) {  // Comment 与分类列也进关键词
      w = String(w || '').trim();
      if (w && !seenK[w]) { seenK[w] = 1; kws.push(w); }
    });
    if (!kws.length) continue;
    needs.push({ kw: kws.join('|'), n: qty, why: '', name: desc.name, detail: '', dev: dev, nm: nm, mfr: mfr, code: code, cmt: cmt, rowIdx: r, cat: catText,
      _f: { name: desc.name, cls: desc.cls, v: val, model: desc.model, nm: nm, pkg: desc.pkgShort, mfr: mfr, code: code, des: desc.des, locked: desc.locked, mount: desc.mount, cmt: cmt, cat: catText } });
  }
  if (!needs.length) { toast('BOM 里没有数据行', 'err'); return; }
  var plan = buildPlanFromNeeds('', needs, '嘉立创 BOM', true);
  var defaultName = String(fileName || '').replace(/\.(csv|txt|xlsx|xls)$/i, '') || '嘉立创项目';
  PMX.source = 'bom'; PMX.need = defaultName; PMX.name = defaultName;
  PMX.plans = []; PMX.planIdx = 0; PMX.plan = plan; PMX.copies = 1;
  PMX.chat = []; PMX.claimed = false; PMX.projId = ''; PMX.visibility = 'public';
  PMX.operator = Auth.user ? Auth.user.username : '';  // 记录创建者（BOM 导入时为当前登录用户）
  PMX.corr = [];    // 手动/AI 更正记录（随项目保存）
  PMX._bomGrid = grid; PMX._bomHead = headIdx; PMX._bomMap = map; PMX._bomNeeds = needs;   // 存 BOM 原表，供"AI 分析一遍"用
  pmxRenderPlan();
  /* 连接器类型确认：未细分的"连接器"（不确定排母/排针/针座/母座）弹窗让用户选 */
  var connIdx = [];
  for (var ci = 0; ci < plan.missing.length; ci++) {
    var nmC = String(plan.missing[ci].name || '');
    if (/连接器|排针|排母|针座|母座|接线端子/.test(nmC) && !/USB/.test(nmC)) connIdx.push(ci);   // 所有连接器都弹窗手选（USB 明确除外）
  }
  if (connIdx.length) {
    PMX._connSel = connIdx;
    openModal('选择连接器类型', pmxConnSelHtml(), '<button class="btn btn-primary" onclick="pmxConnSelDone()">完成</button>');
  }
  /* 无连接器：不再弹窗问 AI 分析，用户可在控制卡片右上角自行点"AI 分析" */
}

/* ============ 连接器类型选择（导入后弹窗） ============ */
function pmxConnInfer(name) {                                   // 按名称推断默认选中（统一连接器后一般为空，纯兜底）
  name = String(name || '');
  if (/排母/.test(name)) return '排母';
  if (/排针/.test(name)) return '排针';
  if (/针座/.test(name)) return '针座';
  if (/母座/.test(name)) return '母座';
  if (/接线端子|端子/.test(name)) return '接线端子';
  return '';
}
function pmxConnSelHtml() {
  var idxs = PMX._connSel || [];
  var html = '<div class="form-hint" style="margin-bottom:8px">这些物料不确定是哪种连接器，下面给出 BOM 原表完整信息，请据此选类型（不确定选"保持连接器"）：</div>';
  var needsAll = PMX._bomNeeds || [], g = PMX._bomGrid || [], h = PMX._bomHead || 0;
  var head = (g[h] || []).map(function (x) { return String(x || '').trim(); });
  for (var i = 0; i < idxs.length; i++) {
    var ms = PMX.plan.missing[idxs[i]];
    var nm = ms.name || '';
    var need = needsAll[ms._nIdx] || null;
    var raw = '';
    if (need && need.rowIdx != null && g[need.rowIdx]) {                              // 动态遍历所有表头，只要该列有内容就显示（支持任意自定义列）
      var row = g[need.rowIdx];
      var fmap = {};
      for (var j = 0; j < row.length; j++) {
        var v = String(row[j] || '').trim();
        if (!v) continue;
        var hk = String(head[j] || '').trim();   // 原始表头文字（不转小写，保留原样）
        if (!hk) continue;
        /* 标准化一些常见表头名 */
        var hkNorm = hk.toLowerCase();
        var keyMap = {
          'designator': '位号', 'name': '名称', 'device': '型号', 'comment': '注释',
          'footprint': '封装', 'quantity': '数量', 'category': '分类', 'refdes': '位号',
          'primary category': '一级分类', 'secondary category': '二级分类',
          'manufacturer part number': '厂家型号', 'mpn': 'MPN', 'mnpartno': '厂家型号',
          'mfr': '制造商', 'mfn': '制造商', 'manufacturer': '制造商',
          'dc': '货期', 'date code': '日期代码'
        };
        var displayKey = keyMap[hkNorm] || hk;   // 优先用中文名，没有就用原始表头
        fmap[displayKey] = v;
      }
      var lines = [];
      Object.keys(fmap).forEach(function (fk) {
        lines.push('<div class="cr-row"><span class="cr-k">' + escapeHtml(fk) + '</span><span class="cr-v">' + escapeHtml(fmap[fk]) + '</span></div>');
      });
      raw = lines.length ? '<div class="conn-raw">' + lines.join('') + '</div>' : '';
    }
    var curConn = ms._conn || pmxConnInfer(ms.name);
    var chips = ['排针', '排母', '针座', '母座', '接线端子', '保持连接器'].map(function (opt, oi) {
      return '<span class="radio-chip' + (curConn === opt ? ' on' : '') + (oi >= 4 ? ' cr-full' : '') + '" data-c="' + opt + '" onclick="pmxConnPick(' + idxs[i] + ',\'' + opt + '\')">' + opt + '</span>';
    }).join('');
    html += '<div class="ai-plan-item conn-item" style="margin-bottom:8px"><div class="conn-info"><div class="p-name">' + escapeHtml(nm) + '</div>' +
      (raw ? raw : '') + '</div>' +
      '<div class="conn-divider"></div>' +
      '<div class="conn-opts">' + chips + '</div></div>';
  }
  return html;
}
function pmxConnPick(idx, opt) {
  PMX.plan.missing[idx]._conn = opt;
  var mb = $('.modal-body');
  if (mb) mb.innerHTML = pmxConnSelHtml();
}
function pmxConnSelDone() {
  var idxs = PMX._connSel || [];
  for (var i = 0; i < idxs.length; i++) {
    var ms = PMX.plan.missing[idxs[i]];
    var opt = ms._conn;
    if (!opt || opt === '保持连接器') continue;
    var sub = String(ms.name || '').match(/（.*）/);
    ms.name = opt + (sub ? sub[0] : '');
    var kws = String(ms.kw || '').split('|');
    if (kws.indexOf(opt) < 0) kws.push(opt);
    ms.kw = kws.join('|');
    if (ms._f) { ms._f.name = ms.name; ms._f.cls = opt; ms._f.locked = true; }   // 同步结构化字段
  }
  closeModal();
  pmxRenderPlan();   // 关键：选择结果同步到列表
}
/* ============ 导入后问：是否 AI 分析一遍（识别更准） ============ */
function pmxAskAiAnalyze() {
  openModal('AI 分析一遍？', 'BOM 已导入。是否让 AI 再分析一遍，把每行元件的名称 / 型号 / 封装识别得更准？<div style="margin-top:8px;color:var(--text-sub);font-size:12.5px">需要已接入 AI 并在设置里勾选"项目领料"用途；分析后会更新"库里没有"列表的描述。</div>',
    '<button class="btn" onclick="closeModal()">暂不</button><button class="btn btn-primary" onclick="closeModal();pmxAiAnalyzeBom()">' + ICONS.ai + 'AI 分析</button>');
}
/* ============================================================
 * BOM AI 识别（物料识别不准时，勾选若干行让 AI 重新识别，可替换）
 * ============================================================ */
/* 收集所有 BOM 行（带原表全部信息） */
function pmxBomRowsAll() {
  var grid = PMX._bomGrid || [], headIdx = PMX._bomHead || 0, map = PMX._bomMap || {};
  var head = (grid[headIdx] || []).map(function (x) { return String(x || '').trim(); });   // 表头行
  var rows = [];
  for (var r = headIdx + 1; r < grid.length; r++) {
    var d = grid[r];
    var get = function (ix) { return ix >= 0 ? String(d[ix] || '').trim() : ''; };
    var dev = get(map.iDev), nm = get(map.iName), val = get(map.iVal), pkg = get(map.iPkg),
        mfr = get(map.iMfr), code = get(map.iCode), des = get(map.iDes), cmt = get(map.iCmt);
    var qty = map.iQty >= 0 ? (parseInt(String(d[map.iQty]).replace(/[^\d]/g, ''), 10) || 1) : 1;
    if (!dev && !nm && !pkg && !code && !cmt) continue;                                   // 空行跳过
    /* 原表所有列（动态）：只要有值就收集，弹窗里完整展示，不限于固定那几列 */
    var all = [];
    for (var j = 0; j < d.length; j++) {
      var v = String(d[j] || '').trim();
      if (!v) continue;
      all.push({ k: head[j] || ('列' + (j + 1)), v: v });
    }
    rows.push({ rowIdx: r, dev: dev, nm: nm, val: val, pkg: pkg, mfr: mfr, code: code, des: des, cmt: cmt, qty: qty, all: all });
  }
  return rows;
}
/* ============ 手动 / AI 更正（BOM 识别不准：AI 批量更正 / 手动输入 / 手动查找库；三槽分开、各保留一条、重复覆盖；撤销留痕；随项目保存） ============ */
var PMX_SLOT_KEYS = { 1: 'ai', 2: 'min', 3: 'mlib' };
function pmxCorrGet(rowIdx, create) {
  var c = null;
  (PMX.corr || []).forEach(function (x) { if (x.rowIdx === rowIdx) c = x; });
  if (!c && create) {
    c = { rowIdx: rowIdx, raw: null, ai: null, min: null, mlib: null, active: null, open: false };
    PMX.corr = PMX.corr || []; PMX.corr.push(c);
  }
  return c;
}
/* 保存时只保留做过任一更正（或当前生效）的行，去掉空占位 */
function pmxCorrSerious() {
  return (PMX.corr || []).filter(function (c) { return c.ai || c.min || c.mlib || c.active; });
}
/* 入口弹窗：列出全部 BOM 行（勾选用于 AI 批量更正，AI 按钮在弹窗右上角） */
function pmxCorrOpen() {
  var rows = pmxBomRowsAll();
  if (!rows.length) { toast('没有可更正的 BOM 行', 'warn'); return; }
  rows.forEach(function (rw) {
    var c = pmxCorrGet(rw.rowIdx, true);
    c.raw = { dev: rw.dev, nm: rw.nm, val: rw.val, pkg: rw.pkg, mfr: rw.mfr, code: rw.code, des: rw.des, cmt: rw.cmt, qty: rw.qty };
  });
  openModal('手动 / AI 更正', pmxCorrBody(), '<button class="btn btn-primary" onclick="closeModal()">完成</button>', true);
}
function pmxCorrBody() {
  var rows = pmxBomRowsAll();
  var list = rows.map(pmxCorrRow).join('');
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-sm btn-outline" onclick="pmxCorrSelAll(true)">全选</button>' +
        '<button class="btn btn-sm btn-outline" onclick="pmxCorrSelAll(false)">全不选</button>' +
      '</div>' +
      '<button class="btn btn-sm btn-primary" onclick="pmxCorrRunAI()">' + ICONS.ai + 'AI 更正（勾选行）</button>' +
    '</div>' +
    '<div style="max-height:440px;overflow:auto;border:1px solid var(--border);border-radius:8px">' + list + '</div>';
}
function pmxCorrSelAll(v) {
  document.querySelectorAll('.pmx-corr-chk').forEach(function (b) { b.checked = v; });
}
/* 刷新弹窗（保留勾选与滚动位置） */
function pmxCorrRefresh() {
  var chk = {}, top = 0, mb0 = document.querySelector('.modal-body');
  if (mb0 && mb0.lastElementChild) top = mb0.lastElementChild.scrollTop;
  document.querySelectorAll('.pmx-corr-chk').forEach(function (b) { chk[b.getAttribute('data-row')] = b.checked; });
  if (!mb0) return;
  mb0.innerHTML = pmxCorrBody();
  document.querySelectorAll('.pmx-corr-chk').forEach(function (b) { b.checked = chk[b.getAttribute('data-row')]; });
  if (mb0.lastElementChild) mb0.lastElementChild.scrollTop = top;
}
/* 单行：折叠头（勾选 + 位号 + 简述 + 手动两按钮） / 展开体 */
function pmxCorrRow(rw) {
  var c = pmxCorrGet(rw.rowIdx, true);
  var t = [rw.nm, rw.dev, rw.val, rw.pkg, rw.cmt].filter(function (x) { return x; }).join(' · ');
  var head = '<div class="pmx-corr-head" onclick="pmxCorrToggle(' + rw.rowIdx + ')">' +
    '<span class="pmx-corr-caret">' + (c.open ? '▾' : '▸') + '</span>' +
    '<input type="checkbox" class="pmx-corr-chk" data-row="' + rw.rowIdx + '" onclick="event.stopPropagation()" />' +
    '<b style="flex:none;margin-left:4px">' + escapeHtml(rw.des || ('行' + rw.rowIdx)) + '</b>' +
    '<span style="flex:1;min-width:0;color:var(--text-sub);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:8px">' + escapeHtml(t) + '</span>' +
    '<span style="flex:none;display:flex;gap:6px;margin-left:8px" onclick="event.stopPropagation()">' +
      '<button class="btn btn-sm btn-outline" onclick="pmxCorrMinOpen(' + rw.rowIdx + ')">手动输入更正</button>' +
      '<button class="btn btn-sm btn-outline" onclick="pmxCorrMlibOpen(' + rw.rowIdx + ')">手动查找库更正</button>' +
    '</span>' +
  '</div>';
  var body = c.open ? '<div class="pmx-corr-body">' + pmxCorrDetail(rw, c) + '</div>' : '';
  return '<div class="pmx-corr-row' + (c.open ? ' open' : '') + '">' + head + body + '</div>';
}
function pmxCorrToggle(rowIdx) {
  var c = pmxCorrGet(rowIdx);
  if (!c) return;
  c.open = !c.open;
  pmxCorrRefresh();
}
/* 展开体：原 BOM 识别 + 三槽结果（每槽右上角双态按钮） */
function pmxCorrDetail(rw, c) {
  var need = null;
  (PMX._bomNeeds || []).forEach(function (n) { if (n.rowIdx === rw.rowIdx) need = n; });
  var f = need && need._f;
  var t = [rw.nm, rw.dev, rw.val, rw.pkg].filter(function (x) { return x; }).join(' · ');
  var orig;
  if (f) {
    var mt = pmxMissText(f);
    orig = '<div class="pmx-corr-orig"><div class="pmx-corr-tag">原 BOM 识别</div>' +
      '<div class="pmx-corr-main"><b>' + escapeHtml(mt.main) + '</b></div>' + mt.sub + '</div>';
  } else {
    orig = '<div class="pmx-corr-orig"><div class="pmx-corr-tag">原 BOM 识别</div><div class="pmx-corr-main">' + escapeHtml(t) + '</div></div>';
  }
  return orig + pmxCorrSlot(c, 1) + pmxCorrSlot(c, 2) + pmxCorrSlot(c, 3);
}
/* 槽块：slotNum 1=ai / 2=min / 3=mlib */
function pmxCorrSlot(c, slotNum) {
  var key = PMX_SLOT_KEYS[slotNum];
  var labels = { ai: 'AI 更正', min: '手动输入更正', mlib: '手动查找库更正' };
  var label = labels[key], s = c[key];
  if (!s) {
    return '<div class="pmx-corr-slot pmx-slot-' + key + '"><span class="pmx-corr-tag">' + label + '</span>' +
      '<span style="color:var(--text-sub);font-size:12.5px">未进行</span></div>';
  }
  var d = s.data || {};
  var main = d.name || d.cls || '?';
  var sub = [d.v, d.model, d.pkg].filter(function (x) { return x; }).join(' · ');
  var btn = c.active === key
    ? '<button class="btn btn-sm pmx-btn-revoke" onclick="pmxCorrRevoke(' + c.rowIdx + ')">撤销 ' + label + '</button>'
    : '<button class="btn btn-sm btn-outline" onclick="pmxCorrSelect(' + c.rowIdx + ',' + slotNum + ')">选择 ' + label + '</button>';
  return '<div class="pmx-corr-slot pmx-slot-' + key + (c.active === key ? ' active' : '') + '">' +
      '<div style="flex:1;min-width:0"><div class="pmx-corr-slot-main"><b>' + escapeHtml(main) + '</b>' +
        (d.cls ? '<span class="badge badge-purple" style="margin-left:6px">' + escapeHtml(d.cls) + '</span>' : '') + '</div>' +
      (sub ? '<div style="font-size:12.5px;color:var(--text-sub);margin-top:2px">' + escapeHtml(sub) + '</div>' : '') + '</div>' +
      btn +
    '</div>';
}
/* 选择某槽生效 / 撤销生效（结果保留不清除） */
async function pmxCorrSelect(rowIdx, slotNum) {
  var c = pmxCorrGet(rowIdx), key = PMX_SLOT_KEYS[slotNum];
  if (!c || !c[key]) return;
  c.active = key;
  await pmxCorrApply();
  toast('已选择该更正', 'ok');
}
async function pmxCorrRevoke(rowIdx) {
  var c = pmxCorrGet(rowIdx);
  if (!c || !c.active) return;
  c.active = null;
  await pmxCorrApply();
  toast('已撤销，更正记录保留', 'ok');
}
async function pmxCorrApply() {
  pmxRebuildPlanFromBom();
  await pmxUpsert();
  if (document.querySelector('.modal-mask')) pmxCorrRefresh();
}
/* AI 批量更正：勾选行分批发原 BOM 全字段，结果写 ai 槽（覆盖）并生效 */
async function pmxCorrRunAI() {
  var cfg = await pickAIConfig('pick');
  if (!cfg || !cfg.enabled || !cfg.url) { toast('请先在系统设置接入 AI 并勾选"项目领料"用途', 'warn'); return; }
  var all = pmxBomRowsAll(), byRow = {};
  all.forEach(function (rw) { byRow[rw.rowIdx] = rw; });
  var sel = [];
  document.querySelectorAll('.pmx-corr-chk').forEach(function (b) {
    if (b.checked) { var rw = byRow[b.getAttribute('data-row')]; if (rw) sel.push(rw); }
  });
  if (!sel.length) { toast('请勾选要 AI 更正的物料', 'warn'); return; }
  window._aiAbort = false;                                         // 重置中止标志
  var mb = document.querySelector('.modal-body');
  if (mb) mb.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-sub)">正在让 AI 更正 ' + sel.length + ' 种物料……<div style="margin-top:10px;font-size:13px">关闭弹窗可随时中止</div></div>';
  var out = [], BATCH = 10, batches = Math.ceil(sel.length / BATCH);
  for (var b = 0; b < batches; b++) {
    if (window._aiAbort) break;                                   // 弹窗被关闭，中止
    var chunk = sel.slice(b * BATCH, (b + 1) * BATCH);
    var lns = chunk.map(function (rw, ix) {
      return (b * BATCH + ix + 1) + '|位号:' + rw.des + '|Device:' + rw.dev + '|Name:' + rw.nm + '|Value:' + rw.val + '|Footprint:' + rw.pkg + '|厂家型号:' + rw.mfr + '|立创编号:' + rw.code + '|Comment:' + rw.cmt + '|数量:' + rw.qty;
    });
    var sys = '你是资深电子元件识别工程师。下面是嘉立创 BOM 中元件的完整原始信息（编号|位号|Device|Name|标称值Value|封装Footprint|厂家型号|立创编号|Comment|数量），请综合所有信息准确判断每个元件是什么。\n' +
      '识别要点：电阻电容电感看标称值(带单位)与封装；芯片/单片机/驱动/二极管/三极管/MOS/传感器/模块看完整型号；位号前缀可参考(U芯片/D二极管/Q三极管/X晶振/SW开关/F保险丝/L电感/C电容/R电阻/CN·J连接器)但不要只看位号(如位号 U 的也可能是传感器/模块)；贴片阻容标称值与封装一致即可认为同款；无法确定封装就保留原始型号与封装原文，不要瞎猜。\n' +
      '类别用：电容/贴片电容/电解电容/钽电容/贴片极性电容/电阻/贴片电阻/可调电阻/电感/磁珠/二极管/LED/数码管/OLED显示屏/晶振/开关/保险丝/排针/排母/针座/母座/接线端子/USB连接器/其他连接器/芯片/单片机/电机驱动芯片/三极管/MOS管/蜂鸣器/红外传感器/蓝牙模块/陀螺仪/传感器/电机/其他。\n' +
      '只返回 JSON 数组，不要任何其他文字：[{"row":编号,"name":"准确物料名称","cls":"类别","model":"型号(没有留空)","pkg":"封装(没有留空)","v":"标称值(没有留空)}]\n' + lns.join('\n');
    try {
      var reply = await aiCallRetry([{ role: 'user', content: sys }], cfg);
      out = out.concat(extractJSONArray(String(reply)) || []);
    } catch (e) { /* 单批失败继续 */ }
    if (window._aiAbort) break;                                   // 弹窗被关闭，中止
    if (mb) mb.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-sub)">AI 更正中……（' + Math.min((b + 1) * BATCH, sel.length) + '/' + sel.length + ' 种）<div style="margin-top:10px;font-size:13px">关闭弹窗可随时中止</div></div>';
  }
  if (window._aiAbort) { toast('AI 更正已中止', 'warn'); return; }  // 被中止，不应用结果
  if (!out.length) { pmxCorrOpen(); toast('AI 没有返回可用结果', 'warn'); return; }
  var at = Date.now(), added = 0;
  out.forEach(function (o) {
    var rw = sel[(parseInt(o.row, 10) || 1) - 1];
    if (!rw) return;
    var c = pmxCorrGet(rw.rowIdx, true);
    c.ai = { data: { name: String(o.name || '').trim(), cls: String(o.cls || '').trim(), model: String(o.model || '').trim(), pkg: String(o.pkg || '').trim(), v: String(o.v || '').trim() }, at: at };
    c.active = 'ai';
    added++;
  });
  pmxRebuildPlanFromBom();
  await pmxUpsert();
  pmxCorrOpen();
  toast('AI 更正完成，共 ' + added + ' 种并已生效', 'ok');
}

/* 按当前生效更正（PMX.corr 的 active 槽）重建 BOM plan，并恢复已采用替代（按原 BOM 行 rowIdx 对齐） */
function pmxRebuildPlanFromBom() {
  var needs0 = PMX._bomNeeds || [];
  var altSnap = [];
  (PMX.plan.items || []).forEach(function (it) {
    if (!it.alt || it.missIdx < 0) return;
    var ms0 = PMX.plan.missing[it.missIdx];
    if (!ms0 || ms0._nIdx == null) return;
    if (needs0[ms0._nIdx]) altSnap.push({ rowIdx: needs0[ms0._nIdx].rowIdx, altMid: it.material.id });
  });
  var needs = needs0.map(function (nd) {
    var n2 = JSON.parse(JSON.stringify(nd));
    var c = null;
    (PMX.corr || []).forEach(function (x) { if (x.active && x.rowIdx === nd.rowIdx) c = x; });
    if (c) {
      var d = (c[c.active] && c[c.active].data) || {};
      var nm = d.name || d.cls || nd.name;
      var kws = [nm, d.model, d.v, d.pkg, nd.dev, nd.nm, nd.mfr, nd.code, nd.cmt].filter(function (w, i, a) { return w && a.indexOf(w) === i; });
      n2.name = nm; n2.kw = kws.join('|');
      n2.nm = nm; n2.dev = d.model || nm; n2.mfr = ''; n2.code = d.code || ''; n2.cmt = nd.cmt || '';
      n2._f = { name: nm, cls: d.cls || (nd._f && nd._f.cls), v: d.v || (nd._f && nd._f.v), model: d.model || (nd._f && nd._f.model),
        nm: (nd._f && nd._f.nm), pkg: d.pkg || (nd._f && nd._f.pkg), mfr: (nd._f && nd._f.mfr), code: (nd._f && nd._f.code),
        des: (nd._f && nd._f.des), locked: true, mount: (nd._f && nd._f.mount), cmt: (nd._f && nd._f.cmt) };
    }
    return n2;
  });
  var plan = buildPlanFromNeeds('', needs, '嘉立创 BOM', true);
  PMX.plan = plan;
  PMX._bomNeeds = needs;   // 更新全局 bomNeeds，供连接器选择弹窗使用
  if (PMX.plans && PMX.plans.length) PMX.plans[PMX.planIdx] = plan;
  altSnap.forEach(function (a) {
    var missIdx = -1;
    plan.missing.forEach(function (ms, i) {
      if (ms._nIdx == null) return;
      if (needs[ms._nIdx] && needs[ms._nIdx].rowIdx === a.rowIdx) missIdx = i;
    });
    if (missIdx < 0) return;
    var altM = null;
    State.materials.forEach(function (m) { if (m.id === a.altMid) altM = m; });
    if (!altM) return;
    var ms = plan.missing[missIdx];
    var it = { material: altM, needQty: ms.n, have: altM.stock, status: altM.stock >= ms.n ? 'ok' : (altM.stock > 0 ? 'low' : 'none'),
      why: '替代 ' + ms.kw, alt: true, altKw: String(ms.kw).split('|')[0], missIdx: missIdx };
    plan.items.push(it);
    ms.adopted = true; ms.altItemIdx = plan.items.length - 1;
  });
  pmxRenderPlan();
}

/* ============ 手动输入更正 / 手动查找库更正 ============ */
/* 从手动流程返回更正弹窗（恢复该行展开） */
function pmxCorrBack(rowIdx) {
  pmxCorrOpen();
  var c = pmxCorrGet(rowIdx);
  if (c) { c.open = true; pmxCorrRefresh(); }
}
/* ---- 手动输入更正：左边填字段（即拿去匹配的全部信息，可反复改），右边原 BOM 信息可复制对照 ---- */
function pmxCorrMinOpen(rowIdx) {
  var rw = null;
  pmxBomRowsAll().forEach(function (x) { if (x.rowIdx === rowIdx) rw = x; });
  if (!rw) return;
  /* 原 BOM 信息：优先展示原表"所有列"（含 Category / Primary Category / Secondary Category 等），无快照时退回固定字段 */
  var rawLines = (rw.all && rw.all.length)
    ? rw.all.map(function (col) { return col.k + '：' + col.v; })
    : ['位号：' + rw.des, 'Device：' + rw.dev, 'Name：' + rw.nm, '标称值 Value：' + rw.val, '封装 Footprint：' + rw.pkg, '厂家型号：' + rw.mfr, '立创编号：' + rw.code, 'Comment：' + rw.cmt, '数量：' + rw.qty]
        .filter(function (l) { var i = l.indexOf('：'); return l.slice(i + 1); });
  var c = pmxCorrGet(rowIdx), old = (c && c.min && c.min.data) || {};
  function fld(id, label, val) {
    return '<div class="form-item"><label>' + label + '</label><input class="input" id="' + id + '" value="' + escapeHtml(val || '') + '" /></div>';
  }
  var body = '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:260px">' +
        fld('cmin-name', '名称 <span class="req">*', old.name || rw.nm || rw.dev) +
        fld('cmin-cls', '类别（如 贴片电容 / 芯片）', old.cls) +
        fld('cmin-model', '型号', old.model || rw.dev) +
        fld('cmin-v', '标称值', old.v || rw.val) +
        fld('cmin-pkg', '封装', old.pkg || rw.pkg) +
        '<div class="form-hint">以上字段即为拿去匹配物料库的完整信息，点“更正”前都可修改。</div>' +
      '</div>' +
      '<div style="width:280px;flex-shrink:0"><label style="font-size:12.5px;color:var(--text-sub)">原 BOM 信息（原表全部列，可选中复制 / 对照）</label>' +
        '<textarea class="input" style="height:280px;font-size:12.5px;resize:vertical" readonly>' + escapeHtml(rawLines.join('\n')) + '</textarea></div>' +
    '</div>';
  openModal('手动输入更正', body,
    '<button class="btn" onclick="pmxCorrBack(' + rowIdx + ')">返回</button><button class="btn btn-primary" onclick="pmxCorrMinDo(' + rowIdx + ')">更正</button>', true);
}
async function pmxCorrMinDo(rowIdx) {
  var name = ($('#cmin-name').value || '').trim();
  if (!name) { toast('请填写名称', 'warn'); return; }
  var data = { name: name, cls: ($('#cmin-cls').value || '').trim(), model: ($('#cmin-model').value || '').trim(),
    v: ($('#cmin-v').value || '').trim(), pkg: ($('#cmin-pkg').value || '').trim() };
  var c = pmxCorrGet(rowIdx, true);
  c.min = { data: data, at: Date.now() }; c.active = 'min';
  closeModal();
  pmxRebuildPlanFromBom();
  await pmxUpsert();
  pmxCorrOpen(); c.open = true; pmxCorrRefresh();
  toast('已手动输入更正并生效', 'ok');
}
/* ---- 手动查找库更正：裁剪版物料库（顶部醒目原 BOM 框 + 模糊搜索 + 点选，只留更正） ---- */
function pmxCorrMlibOpen(rowIdx) {
  PMX._mlibRow = rowIdx; PMX._mlibPick = null; PMX._mlibQ = '';
  openModal('手动查找库更正', pmxCorrMlibBody(),
    '<button class="btn" onclick="pmxCorrBack(' + rowIdx + ')">返回</button><button class="btn btn-primary" onclick="pmxCorrMlibDo(' + rowIdx + ')">更正</button>', true);
}
function pmxCorrMlibBody() {
  var rowIdx = PMX._mlibRow, rw = null;
  pmxBomRowsAll().forEach(function (x) { if (x.rowIdx === rowIdx) rw = x; });
  /* 原 BOM：优先展示原表"所有列"（含 Category / Primary Category / Secondary Category 等） */
  var rawBits = (rw.all && rw.all.length)
    ? rw.all.map(function (col) { return col.k + ' ' + col.v; })
    : ['位号 ' + rw.des, 'Device ' + rw.dev, 'Name ' + rw.nm, 'Value ' + rw.val, 'Footprint ' + rw.pkg, '厂家型号 ' + rw.mfr, '立创编号 ' + rw.code, 'Comment ' + rw.cmt, '数量 ' + rw.qty]
        .filter(function (x) { var i = x.indexOf(' '); return x.slice(i + 1); });
  var rawBox = '<div style="background:#FFEEDD;border:1px solid #FFC097;border-radius:8px;padding:8px 10px;font-size:12.5px;color:#c75b12;margin-bottom:10px;max-height:170px;overflow:auto"><b>原 BOM：</b>' + escapeHtml(rawBits.join(' · ')) + '</div>';
  var search = '<input class="input" placeholder="模糊搜索名称 / 型号 / 封装 / 类别…" oninput="pmxCorrMlibSearch(this.value)" />';
  return rawBox + search + '<div id="cmlib-list" style="max-height:360px;overflow:auto;margin-top:10px">' + pmxCorrMlibList() + '</div>';
}
function pmxCorrMlibList() {
  var q = (PMX._mlibQ || '').toLowerCase(), pick = PMX._mlibPick;
  var mats = State.materials.filter(function (m) { return !m.deleted; });
  if (q) mats = mats.filter(function (m) {
    return [m.name, m.model, m.pkg, m.cat, m.sub, m.silk, m.alias].filter(Boolean).join(' ').toLowerCase().indexOf(q) >= 0;
  });
  if (!mats.length) return '<div class="empty" style="padding:20px">没有匹配物料</div>';
  return mats.slice(0, 100).map(function (m) {
    var sel = pick === m.id;
    return '<div class="pmx-cmlib-item' + (sel ? ' sel' : '') + '" onclick="pmxCorrMlibPick(\'' + m.id + '\')">' +
      '<span style="flex:1;min-width:0"><span class="t-link" onclick="event.stopPropagation();gotoMaterial(\'' + m.id + '\')">' + escapeHtml(m.name) + '</span><div style="font-size:12px;color:var(--text-sub)">' + escapeHtml(m.model || '') + '</div></span>' +
      '<span style="flex:none;font-size:12.5px;margin-left:10px">' + escapeHtml(m.pkg || '-') + '</span>' +
      '<span style="flex:none;margin-left:12px;font-size:12.5px">库存 ' + (m.stock || 0) + '</span>' +
      '<span class="pmx-cmlib-radio">' + (sel ? '●' : '○') + '</span></div>';
  }).join('');
}
var pmxCorrMlibSearch = debounce(function (v) {
  PMX._mlibQ = v;
  var l = document.querySelector('#cmlib-list');
  if (l) l.innerHTML = pmxCorrMlibList();
}, 200);
function pmxCorrMlibPick(mid) {
  PMX._mlibPick = mid;
  var l = document.querySelector('#cmlib-list');
  if (l) l.innerHTML = pmxCorrMlibList();
}
async function pmxCorrMlibDo(rowIdx) {
  var mid = PMX._mlibPick;
  if (!mid) { toast('请先在列表中点选一个物料', 'warn'); return; }
  var m = null;
  State.materials.forEach(function (x) { if (x.id === mid) m = x; });
  if (!m) return;
  var data = { name: m.name, cls: [m.cat, m.sub].filter(Boolean).join('/'), model: m.model || '', pkg: m.pkg || '',
    v: '', code: m.code || '', mid: mid };
  var c = pmxCorrGet(rowIdx, true);
  c.mlib = { data: data, at: Date.now() }; c.active = 'mlib';
  closeModal();
  pmxRebuildPlanFromBom();
  await pmxUpsert();
  pmxCorrOpen(); c.open = true; pmxCorrRefresh();
  toast('已用库内物料更正并生效', 'ok');
}

/* AI 分析 BOM：每行全字段给 AI，返回名称/类别/完整描述，更新"库里没有"的显示 */
async function pmxAiAnalyzeBom() {
  var cfg = await pickAIConfig('pick');
  if (!cfg || !cfg.enabled || !cfg.url) { toast('请先在系统设置接入 AI 并勾选"项目领料"用途', 'warn'); return; }
  var grid = PMX._bomGrid || [], headIdx = PMX._bomHead || 0, map = PMX._bomMap || {};
  var rows = [];
  for (var r = headIdx + 1; r < grid.length; r++) {
    var d = grid[r];
    var dev = map.iDev >= 0 ? String(d[map.iDev] || '').trim() : '';
    var nm = map.iName >= 0 ? String(d[map.iName] || '').trim() : '';
    var val = map.iVal >= 0 ? String(d[map.iVal] || '').trim() : '';
    var pkg = map.iPkg >= 0 ? String(d[map.iPkg] || '').trim() : '';
    var mfr = map.iMfr >= 0 ? String(d[map.iMfr] || '').trim() : '';
    var code = map.iCode >= 0 ? String(d[map.iCode] || '').trim() : '';
    var des = map.iDes >= 0 ? String(d[map.iDes] || '').trim() : '';
    var cmt = map.iCmt >= 0 ? String(d[map.iCmt] || '').trim() : '';
    if (!dev && !nm && !pkg && !code && !cmt) continue;
    rows.push({ dev: dev, nm: nm, val: val, pkg: pkg, mfr: mfr, code: code, des: des, cmt: cmt });
  }
  if (!rows.length) { toast('没有可分析的 BOM 行', 'warn'); return; }
  PMX._preAiMissing = JSON.parse(JSON.stringify(PMX.plan.missing));    // 分析前快照（撤回用）
  openModal('AI 分析中', '<div style="padding:20px;text-align:center;color:var(--text-sub)">正在让 AI 分析 ' + rows.length + ' 行元件……<div style="margin-top:10px;font-size:13px">关闭弹窗可随时中止</div></div>', null);
  window._aiAbort = false;                                         // 重置中止标志（须在 openModal 之后，因为 openModal 内部会 closeModal）
  var out = [];
  var BATCH = 10;
  var batches = Math.ceil(rows.length / BATCH);
  for (var b = 0; b < batches; b++) {
    if (window._aiAbort) break;                                   // 弹窗被关闭，中止
    var chunk = rows.slice(b * BATCH, (b + 1) * BATCH);
    var lines = chunk.map(function (rw, ix) {
      return (b * BATCH + ix + 1) + '|' + rw.dev + '|' + rw.nm + '|' + rw.val + '|' + rw.pkg + '|' + rw.mfr + '|' + rw.code + '|' + rw.des + '|' + rw.cmt;
    });
    var sys = '你是电子元件分类工程师。下面是嘉立创 BOM 的元件行（编号|Device|Name|标称值Value|封装Footprint|厂家型号|立创编号|位号|Comment），请识别每个元件。\n类别用这些之一：电容/贴片电容/电解电容/钽电容/贴片极性电容/电阻/贴片电阻/可调电阻/电感/二极管/整流二极管/肖特基二极管/TVS二极管/LED/数码管/OLED 显示屏/晶振/开关/保险丝/排针/排母/针座/母座/接线端子/USB 连接器/其他连接器/芯片/单片机/电机驱动芯片/三极管/MOS管/蜂鸣器/红外传感器/蓝牙模块/陀螺仪/磁珠/传感器/其他。\n只返回 JSON 数组：[{"row":行号,"cls":"类别","param":"主要参数，仅当从型号看不出标称值时填一个简短词，如电阻电容填标称值10kΩ/4.7uF，其他填型号"}]，不要任何其他文字。\n' + lines.join('\n');
    try {
      var reply = await aiCallRetry([{ role: 'user', content: sys }], cfg);
      var arr = extractJSONArray(String(reply)) || [];
      out = out.concat(arr);
    } catch (e) { /* 单批失败继续下一批 */ }
    if (window._aiAbort) break;                                   // 弹窗被关闭，中止
    var mb = $('.modal-body');
    if (mb) mb.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-sub)">AI 分析中……（' + Math.min((b + 1) * BATCH, rows.length) + '/' + rows.length + ' 行）<div style="margin-top:10px;font-size:13px">关闭弹窗可随时中止</div></div>';
  }
  if (window._aiAbort) { toast('AI 分析已中止', 'warn'); return; }  // 被中止，不应用结果
  /* 应用结果：locked（本地型号特征明确）的不覆盖；AI 只修正类别，param 仅在本地缺标称值/型号时补 */
  closeModal();
  var applied = pmxApplyAiOut(out);
  if (!out.length) { toast('AI 没有返回可用结果', 'warn'); return; }
  PMX._aiOut = out; PMX.aiState = 'done';
  pmxRenderPlan();
  toast('AI 分析完成，已修正 ' + applied + ' 条识别', 'ok');
}
/* AI 结果应用（撤回后"恢复"复用）：返回实际改动条数 */
function pmxApplyAiOut(out) {
  var missing = PMX.plan.missing, needsAll = PMX._bomNeeds || [], headIdx = PMX._bomHead || 0;
  var gRowMap = {};
  for (var nk = 0; nk < needsAll.length; nk++) { if (needsAll[nk] && needsAll[nk].rowIdx != null) gRowMap[needsAll[nk].rowIdx] = nk; }
  var applied = 0;
  for (var i = 0; i < out.length; i++) {
    var o = out[i];
    var gRow = (parseInt(o.row, 10) || 1) + headIdx;
    var nIdx = gRowMap[gRow];
    if (nIdx == null) continue;
    var miss = null;
    for (var mi = 0; mi < missing.length; mi++) { if (missing[mi]._nIdx === nIdx) { miss = missing[mi]; break; } }
    if (!miss) continue;
    if (miss._f && miss._f.locked) continue;                                          // 本地特征锁定：AI 不得覆盖
    var cls = o.cls ? String(o.cls).replace(/\s+/g, '').trim() : '';
    if (cls && /电容|电阻|电感|晶振|二极管|LED|数码管|OLED|开关|保险丝|排针|排母|针座|母座|端子|连接器|芯片|单片机|电机驱动|三极管|MOS|蜂鸣|传感器|蓝牙|陀螺|磁珠|其他/.test(cls)) {
      miss.name = cls;
      if (miss._f) { miss._f.cls = cls; miss._f.name = cls; }
    }
    var param = o.param ? String(o.param).trim() : '';
    if (param && miss._f) {
      var valFirst = /电阻|电容|电感|晶振/.test(miss._f.cls);
      if (valFirst && !miss._f.v) miss._f.v = param;
      else if (!valFirst && !miss._f.model) miss._f.model = param;
    }
    miss.kw = [miss.name, param].filter(Boolean).join('|');
    applied++;
  }
  return applied;
}
/* 撤回 AI 分析：恢复分析前快照（BOM 原始识别） */
function pmxWithdrawAi() {
  if (!PMX._preAiMissing) { toast('没有可撤回的 AI 分析', 'warn'); return; }
  PMX.plan.missing = JSON.parse(JSON.stringify(PMX._preAiMissing));
  PMX.aiState = 'revoked';
  pmxRenderPlan();
  toast('已撤回 AI 分析，恢复 BOM 原始识别结果', 'ok');
}
/* 恢复 AI 分析：重新应用保存的 AI 结果 */
function pmxRestoreAi() {
  if (!PMX._aiOut) { toast('没有可恢复的 AI 分析', 'warn'); return; }
  pmxApplyAiOut(PMX._aiOut);
  PMX.aiState = 'done';
  pmxRenderPlan();
  toast('已恢复 AI 分析结果', 'ok');
}

async function pmxImportBom(inputEl) {
  var file = inputEl && inputEl.files ? inputEl.files[0] : inputEl;
  if (!file) return;
  if (inputEl && inputEl.files) inputEl.value = '';
  var grid = await pmxReadGrid(file);
  if (!grid) return;
  var headIdx = -1, cols = null;
  for (var i = 0; i < grid.length; i++) {
    var isName = grid[i].some(function (c) { return /名称|comment|^device$|^name$|^型号$|^model$/i.test(c); });
    var isQty = grid[i].some(function (c) { return /^(个数|数量|quantity|qty)$/i.test(c); });
    if (isName && isQty) { headIdx = i; cols = grid[i]; break; }
  }
  if (headIdx < 0) { toast('没识别出 BOM 表头（需含“型号/名称”和“数量”列）；表头对不上可用“手动映射”', 'err'); return; }
  pmxBuildPlanFromGrid(grid, headIdx, pmxAutoColMap(cols), file.name);
}

/* ---- 手动映射表头（自动识别不准时的兜底） ---- */
var _pmxMap = { grid: null, headIdx: -1, cols: null };
function pmxBomMapModal() {
  _pmxMap = { grid: null, headIdx: -1, cols: null };
  openModal('手动映射 BOM 表头', '' +
    '<div class="form-item"><label>选择 BOM 文件（xlsx / csv）</label><input class="input" type="file" id="pmx-map-file" accept=".csv,.txt,.xlsx,.xls" onchange="pmxBomMapLoad(this)" /></div>' +
    '<div id="pmx-map-body" style="color:var(--text-sub);font-size:13px;min-height:60px;padding:6px 2px;line-height:1.8">选择文件后，指定各列代表什么，再点“按映射解析”。<br>常用列：名称/型号（Device、Name、型号）、数量（Quantity、个数）、标称值（Value）、封装（Footprint、封装）、厂家型号（Manufacturer Part）、立创编号（Supplier Part、LCSC）</div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="pmxBomMapApply()">按映射解析</button>');
}
async function pmxBomMapLoad(inputEl) {
  var file = inputEl.files && inputEl.files[0];
  if (!file) return;
  inputEl.value = '';
  var grid = await pmxReadGrid(file);
  if (!grid) return;
  var headIdx = -1, cols = null;
  for (var i = 0; i < Math.min(grid.length, 30); i++) {
    var known = 0;
    for (var c = 0; c < grid[i].length; c++) {
      if (/名称|comment|device|name|型号|model|数量|quantity|qty|个数|封装|footprint|value|标称|位号|designator|manufacturer|supplier|序号/i.test(String(grid[i][c]))) known++;
    }
    if (known >= 2) { headIdx = i; cols = grid[i]; break; }
  }
  if (headIdx < 0) { toast('找不到表头行，请确认文件格式', 'err'); return; }
  _pmxMap.grid = grid; _pmxMap.headIdx = headIdx; _pmxMap.cols = cols;
  function mkSel(id, label) {
    var o = '', sel = -1;
    var reL = label === '数量列' ? /数量|quantity|qty|个数/i : label === '名称/型号列' ? /^device$|^name$|^型号$|^model$|名称/i : label === '标称值列' ? /^value$|标称|规格/i : label === '封装列' ? /封装|footprint/i : label === '厂家型号列' ? /manufacturer\s*part/i : /supplier\s*part|物料编码|lcsc|立创编号/i;
    for (var q2 = 0; q2 < cols.length; q2++) { if (reL.test(String(cols[q2]))) { sel = q2; break; } }
    for (var k = 0; k < cols.length; k++) {
      var v = String(cols[k] || '');
      o += '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + escapeHtml(v || '（空列）') + '</option>';
    }
    return '<div class="form-item" style="margin-bottom:6px"><label style="font-size:12.5px">' + label + '</label><select class="select" id="pmx-map-' + id + '" style="font-size:12.5px">' + o + '</select></div>';
  }
  $('#pmx-map-body').innerHTML =
    '<div class="form-hint" style="margin-bottom:8px">已识别表头行：' + cols.map(function (c) { return escapeHtml(String(c || '（空）')); }).join(' | ') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">' +
      mkSel('qty', '数量列') + mkSel('name', '名称/型号列') + mkSel('val', '标称值列') + mkSel('pkg', '封装列') + mkSel('mfr', '厂家型号列') + mkSel('code', '立创编号列') +
    '</div>';
}
function pmxBomMapApply() {
  if (!_pmxMap.grid) { toast('请先选择文件', 'warn'); return; }
  var map = {
    iQty: parseInt($('#pmx-map-qty').value, 10),
    iName: parseInt($('#pmx-map-name').value, 10),
    iVal: parseInt($('#pmx-map-val').value, 10),
    iPkg: parseInt($('#pmx-map-pkg').value, 10),
    iMfr: parseInt($('#pmx-map-mfr').value, 10),
    iCode: parseInt($('#pmx-map-code').value, 10),
    iDev: -1
  };
  closeModal();
  pmxBuildPlanFromGrid(_pmxMap.grid, _pmxMap.headIdx, map, '嘉立创 BOM 手动映射');
}

/* 替代物料简要信息：型号/规格 · 封装 · 库存 · 位置（贴片电阻电容也能看出是哪个） */
function pmxMatBrief(m) {
  if (!m) return '';
  var s = [];
  if (m.model) s.push(escapeHtml(m.model));
  if (m.pkg) s.push(escapeHtml(m.pkg));
  var txt = s.join(' · ');
  var loc = '';
  try { loc = pmxLocBadge(m.id, m.loc, m.locNo); } catch (e) {}
  return (txt ? txt + ' · ' : '') + '库存 ' + m.stock + (m.unit ? escapeHtml(m.unit) : '') + (loc ? ' · ' + loc : '');
}

/* ============================================================
 * 安装类型（贴片/插件）：替代必须能焊上板子——贴片只能替贴片、插件只能替插件
 * ============================================================ */
function pmxMountType(pkg) {
  pkg = String(pkg || '').trim().toUpperCase();
  if (!pkg) return '';
  var pn = pkg.replace(/^(?:C|R|RES|CAP|LED|SMD)+[_-]*/i, '');                       // 剥掉 CC/GR/C 等前缀，如 CC0805→0805、LED-0805→0805
  if (/^(?:01005|0201|0402|0603|0805|1005|1206|1210|1812|2010|2512)\b/.test(pn) ||
      /^(?:SOP|SOIC|QFN|QFP|LQFP|TSSOP|MSOP|HSOP|SOT|SMA|SMB|SOD|DFN|SON|WSON|LGA|BGA)/.test(pkg) ||
      /SMD|贴片/.test(pkg)) return '贴片';
  if (/THT|_TH\b|-TH_|^DIP|^BD\d|^TO-?92|^TO-?220|插件|直插|\d+(?:\.\d+)?MM\b|KF\d/.test(pkg)) return '插件';
  return '';
}
/* 安装类型是否兼容：任一未知（空）不拦，明确且不同 → false */
function pmxMountOk(want, got) { return !want || !got || want === got; }

/* ============================================================
 * AI 查找替代元件（弹窗内显示进度与建议；已采用替代的跳过）
 * ============================================================ */
async function pmxFindAlt() {
  var plan = PMX.plan;
  /* 只对还没采用替代的缺失物料查找；保留原始索引映射 */
  var pending = [], pendingIdx = [];
  for (var pp = 0; pp < plan.missing.length; pp++) {
    if (!plan.missing[pp].adopted) { pending.push(plan.missing[pp]); pendingIdx.push(pp); }
  }
  if (!pending.length) { toast('缺失物料都已采用替代', 'warn'); return; }
  var cfg = await pickAIConfig('pick');
  if (!cfg || !cfg.enabled || !cfg.url) { toast('请先在系统设置接入 AI，并勾选"项目领料"用途', 'warn'); return; }
  var mats = State.materials.filter(function (m) { return !m.deleted && m.stock > 0; });
  var libTxt = mats.slice(0, 50).map(function (m) { return m.id + '|' + m.name + (m.model ? '/' + m.model : '') + '/安装' + (pmxMountType(m.pkg) || '未知') + '/库存' + m.stock; }).join('\n') || '（仓库是空的）';
  var BATCH = 10;
  var estMin = Math.ceil(Math.ceil(pending.length / BATCH) * 2.5);   /* 串行每批约 2.5 分钟（实测），按批数估算 */
  openModal('AI 查找替代', '<div style="padding:20px;text-align:center;color:var(--text-sub)">正在让 AI 对照仓库找替代……<div style="margin-top:12px;font-size:13px;color:var(--text-sub)">共 ' + pending.length + ' 种缺失，预计约 ' + estMin + ' 分钟（每批 10 条约 2-3 分钟），关闭弹窗可随时中止</div></div>', null);
  window._aiAbort = false;                                         // 重置中止标志（须在 openModal 之后）
  var batches = Math.ceil(pending.length / BATCH), done = 0, all = [];
  for (var b0 = 0; b0 < batches; b0++) {
    if (window._aiAbort) break;                                   // 弹窗被关闭，中止
    var mb = $('.modal-body');
    if (mb) mb.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-sub)">正在让 AI 对照仓库找替代（已完成 ' + done + '/' + batches + ' 批，共 ' + pending.length + ' 种）……<div style="margin-top:12px;font-size:13px;color:var(--text-sub)">关闭弹窗可随时中止</div></div>';
    var chunk = pending.slice(b0 * BATCH, (b0 + 1) * BATCH);
    var missLines = chunk.map(function (ms, ix) {
      var nmL = ms.name || String(ms.kw || '').split('|')[0];
      var mnt = (ms._f && ms._f.mount) || '';
      return '缺' + (b0 * BATCH + ix + 1) + '：' + nmL + (ms.detail ? '（' + ms.detail + '，' : '（') + '需 ' + ms.n + ' 个，安装类型 ' + (mnt || '未知') + '）';
    });
    var sys = '你是电子元件选型工程师，帮学生从仓库里找可替代元件。\n仓库现有库存（名称/型号/安装类型/库存）：\n' + libTxt + '\n\nBOM 缺的物料：\n' + missLines.join('\n') + '\n\n' +
      '要求：为每条缺失推荐 1 个仓库里最合适的替代品（优先同封装、同参数、同功能）。重要约束：只能推荐同类别同功能的元件（电阻只能替代电阻、电容只能替代电容、开关只能替代开关、LED 只能替代 LED 等），严禁跨类别替代；并且安装类型必须相同——贴片只能替贴片、插件（直插）只能替插件，安装类型不同会焊不上板子，绝不可互替。找不到就返回 altId 为空字符串。altId 必须是上面仓库清单里竖线|之前的 id 原样返回，绝不可编造。只返回 JSON：[{"kw":"缺失原词","n":数量,"altId":"仓库物料id或空","altName":"替代品名称或空","reason":"15字内理由"}]，不要其他文字。';
    try {
      var reply = await aiCallRetry([{ role: 'user', content: sys }], cfg);
      var arr = extractJSONArray(String(reply)) || [];
      all = all.concat(arr);
    } catch (e) { /* 单批失败不阻断 */ }
    if (window._aiAbort) break;                                   // 弹窗被关闭，中止
    done++;
  }
  if (window._aiAbort) { toast('AI 查找替代已中止', 'warn'); return; }  // 被中止，不应用结果
  if (!all.length) {
    var mbn = $('.modal-body');
    if (mbn) mbn.innerHTML = '<div class="empty">AI 没有返回可用建议</div>';
    return;
  }
  PMX._lastAltSugs = all;                     // 记住本次建议，供历史里"返回建议"用
  await pmixAltSaveHistory(pending, all);   // 写入查找历史（保留一天）
  /* 渲染建议列表（弹窗内） */
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">' +
    '<div style="font-size:12.5px;color:var(--text-sub)">共 ' + all.length + ' 条建议，点"采用"后加入左侧"已采用替代"区域</div>' +
    '<button class="btn btn-sm btn-outline" onclick="pmixAltShowHistory()">' + ICONS.history + '查找历史（近 24 小时）</button></div>';
  for (var s = 0; s < all.length; s++) {
    var sug = all[s] || {};
    var mi = -1;
    for (var q = 0; q < pending.length; q++) { if (aiKwHit(pending[q].kw, sug.kw)) { mi = q; break; } }
    var realIdx = mi >= 0 ? pendingIdx[mi] : -1;
    var showKw = mi >= 0 ? String(pending[mi].kw).split('|')[0] : (sug.kw || '?');
    var altId = sug.altId && mats.some(function (x) { return x.id === sug.altId; }) ? sug.altId : fuzzyFindAlt(mats, sug.altName, showKw, (mi >= 0 && pending[mi]._f) ? pending[mi]._f.mount : '');
    if (altId) {                                                                   // AI 直接给 id 也过类别+安装类型校验（电容不能被 LED 替代、贴片不能替插件）
      var _am = null;
      for (var _ai = 0; _ai < mats.length; _ai++) { if (mats[_ai].id === altId) { _am = mats[_ai]; break; } }
      if (!_am || !altClsOk(showKw, _am)) altId = '';
      if (altId) {
        var wantM = (mi >= 0 && pending[mi]._f) ? pending[mi]._f.mount : '';
        if (!pmxMountOk(wantM, pmxMountType(_am.pkg))) altId = '';
      }
    }
    var canAdopt = !!altId;
    var _am2 = null;
    for (var _ai2 = 0; _ai2 < mats.length; _ai2++) { if (mats[_ai2].id === altId) { _am2 = mats[_ai2]; break; } }
    var nmTxt = canAdopt ? '<span class="t-link" onclick="openMaterialDetailModal(\'' + altId + '\')">' + escapeHtml(_am2 ? _am2.name : (sug.altName || '替代物料')) + '</span>' : escapeHtml(sug.altName || '无合适替代');
    var briefTxt = canAdopt && _am2 ? '<div style="font-size:12px;color:var(--text-sub);margin-top:1px">' + pmxMatBrief(_am2) + '</div>' : '';
    var adoptedNow = realIdx >= 0 && plan.missing[realIdx] && plan.missing[realIdx].adopted;
    var btns = canAdopt ? pmxAltBtns(realIdx, altId, adoptedNow) : '<span class="badge badge-gray">无库存替代</span>';
    html += '<div class="ai-plan-item" id="pmx-alt-sug-' + s + '" style="padding:8px 10px"><div class="p-name"><b>' + escapeHtml(showKw) + '</b>' +
      '<div style="font-size:12.5px;color:var(--text-sub);margin-top:2px">→ ' + nmTxt + '（' + escapeHtml(sug.reason || '') + '）' + briefTxt + '</div></div>' +
      btns +
      '</div>';
  }
  var mf = $('.modal-foot');
  if (mf) mf.innerHTML = '<button class="btn btn-primary" onclick="closeModal()">完成</button>';
  var mb2 = $('.modal-body');
  if (mb2) mb2.innerHTML = html;
}

/* 类别词表：kw 里的类别词与候选物料类别冲突时禁止匹配（电容不能被 LED 替代） */
var PMX_CLS_KW = { '电容': ['电容', 'cap'], '电阻': ['电阻', 'res'], '可调电阻': ['可调', '电位器'], '电感': ['电感'], '二极管': ['二极管', 'diode'], 'LED': ['led', '灯珠', '发光'], '晶振': ['晶振', '晶体'], '开关': ['开关', '按键'], '保险丝': ['保险', 'fuse'], '排针': ['排针'], '排母': ['排母'], '针座': ['针座'], '母座': ['母座'], '连接器': ['连接器', '排针', '排母', '针座', '母座', 'header', '端子'], '芯片': ['芯片', 'ic', '单片机', 'mcu', '驱动'], '三极管': ['三极管', 'mos'], '蜂鸣器': ['蜂鸣', 'buzz'], '传感器': ['传感器', 'sensor'], '蓝牙': ['蓝牙'], '陀螺仪': ['陀螺'], '磁珠': ['磁珠'], '显示屏': ['屏', 'oled'] };
/* 缺失词 kw 与候选物料 m 类别是否一致：kw 含类别词且 m 不含同类词 → false（跨类别拒绝） */
function altClsOk(kw, m) {
  if (!kw) return true;
  var kt = String(kw).toLowerCase();
  var hitKw = null;
  for (var k in PMX_CLS_KW) { if (kt.indexOf(k.toLowerCase()) >= 0) { hitKw = k; break; } }
  if (!hitKw) return true;                                   // kw 无明确类别词：不限制
  var mCat = ((m.cat || '') + ' ' + (m.sub || '') + ' ' + (m.name || '') + ' ' + (m.tags || []).join(' ')).toLowerCase();
  var ws = PMX_CLS_KW[hitKw];
  for (var w = 0; w < ws.length; w++) { if (mCat.indexOf(ws[w]) >= 0) return true; }
  /* 无库存替代提示用：LED 名称里含"直插"不算类别，只有真正同类词才算 */
  return false;
}
/* AI 只给了替代名时，按名称在仓库里模糊找物料（去括号/空格/大小写后互相包含，或公共词命中） */
function fuzzyFindAlt(mats, altName, kw, mount) {
  if (!altName || !mats) return '';
  var t = String(altName).replace(/[\/\-_\s·()（）]/g, '').toLowerCase();
  if (!t || t.length < 2) return '';
  var rcT = /电阻|电容|resistor|capacitor/i.test(t);   // 电阻电容：标称值+封装一致即可直接替代
  var best = '', bestScore = 0;
  for (var i = 0; i < mats.length; i++) {
    var m = mats[i];
    if (!altClsOk(kw, m)) continue;                        // 跨类别（电容配 LED 等）直接跳过
    if (!pmxMountOk(mount, pmxMountType(m.pkg))) continue; // 安装类型不同（贴片焊插件）跳过
    var mt = (m.name + (m.model || '') + (m.pkg || '') + (m.tags || []).join('')).replace(/[\/\-_\s·()（）]/g, '').toLowerCase();
    if (!mt) continue;
    var sc = 0;
    if (mt.indexOf(t) >= 0 || t.indexOf(mt) >= 0) sc = 10;
    else {
      /* 中文段按 2 字滑窗切分（如"排针公针可裁剪为"→排针/针公/公针/…），字母数字段整段算一个词 */
      var cnSegs = t.match(/[\u4e00-\u9fa5]+/g) || [], enToks = t.match(/[a-z0-9]{2,}/g) || [], grams = [];
      for (var g0 = 0; g0 < cnSegs.length; g0++) { var seg = cnSegs[g0]; for (var g1 = 0; g1 < seg.length - 1; g1++) grams.push(seg.substr(g1, 2)); }
      for (var g2 = 0; g2 < enToks.length; g2++) grams.push(enToks[g2]);
      for (var k = 0; k < grams.length; k++) if (mt.indexOf(grams[k]) >= 0) sc++;
      /* 中文单字 + 字母数字 token 命中补充（"M3螺丝" ↔ "螺丝M3 沉头" 顺序不同、公共词不足也能对上；"LED灯珠(红)" ↔ "红色LED" 同理） */
      var tCnC = t.match(/[\u4e00-\u9fa5]/g) || [];
      var mCnC = mt.match(/[\u4e00-\u9fa5]/g) || [];
      var sameCn = 0;
      for (var c0 = 0; c0 < tCnC.length; c0++) if (mCnC.indexOf(tCnC[c0]) >= 0) sameCn++;
      if (tCnC.length && mCnC.length && sameCn >= Math.min(2, tCnC.length) && sameCn >= Math.min(2, mCnC.length)) sc += sameCn;
      var tEnT = t.match(/[a-z0-9]+/g) || [];
      var mEnT = mt.match(/[a-z0-9]+/g) || [];
      var sameEn = 0;
      for (var e0 = 0; e0 < tEnT.length; e0++) if (mEnT.indexOf(tEnT[e0]) >= 0) sameEn++;
      if (sameEn) sc += sameEn * 2;
    }
    if (rcT && /电阻|电容|resistor|capacitor/i.test(mt)) {
      var tRc = rcTokens(t), mRc = rcTokens(mt);
      var vHit = !!(tRc.v && tRc.v === mRc.v);         // 标称值一致
      var pHit = !!(tRc.p && tRc.p === mRc.p);         // 封装一致
      if (vHit || pHit) { sc += 5; if (vHit) sc += 5; }
      else sc = 0;                                      // 电阻电容：标称/封装必须至少对上一样，否则不算
    }
    if (sc > bestScore) { bestScore = sc; best = m.id; }
  }
  if (bestScore >= 10) return best;
  if (bestScore >= 2 && t.length >= 4) return best;   // 至少两个公共词才算数
  return '';
}
/* 提取标称值（数值+单位）与封装号，供电阻电容匹配 */
function rcTokens(x) {
  var out = { v: '', p: '' };
  var vm = x.match(/(\d+(?:\.\d+)?)(k|m|u|n|p)?(Ω|ω|ohm|uf|nf|pf|f|r)/i);   // 单位必填：防 y1 这种型号首字符数字干扰
  if (vm && vm[3]) out.v = vm[1] + (vm[2] ? vm[2].toLowerCase() : '') + vm[3].toLowerCase().replace('ω', 'Ω');
  var pm = x.match(/0402|0603|0805|1206|1210|2512|2010/g);
  if (pm) out.p = pm[0];
  return out;
}

/* ============================================================
 * AI 查找替代历史（近 24 小时，仿图片识别历史）
 * ============================================================ */
/* 保存一条查找历史（当时缺失项 + AI 建议 + 时间 + 操作人） */
async function pmixAltSaveHistory(missing, sugs) {
  try {
    await DB.put('pmix_alt_history', {
      id: uid('pah'), at: Date.now(),
      operator: (Auth.user ? Auth.user.username : '') || '',
      project: PMX.name || '',
      need: PMX.name || PMX.need || '',
      missing: missing.map(function (ms) { return { kw: ms.kw, name: ms.name, detail: ms.detail, n: ms.n, adopted: !!ms.adopted }; }),
      sugs: sugs || []
    });
  } catch (e) { /* 历史不影响主流程 */ }
}
/* 历史列表（顺手清掉超过 24 小时的） */
async function pmixAltShowHistory() {
  if (!$('.modal-mask')) openModal('查找历史', '<div class="empty">加载中…</div>', '<button class="btn btn-primary" onclick="closeModal()">关闭</button>');  // 没有弹窗时自己开一个
  var all = await DB.all('pmix_alt_history');
  all = all.filter(function (r) { return r.kind !== 'recog'; });                    // 识别历史独立、永久，不在此显示/清理
  var proj = PMX.name || '';
  if (proj) all = all.filter(function (r) { return (r.project || '') === proj; });   // 只显示当前项目的历史
  var cutoff = Date.now() - 24 * 3600 * 1000;
  var keep = [], oldIds = [];
  for (var i = 0; i < all.length; i++) {
    if ((all[i].at || 0) >= cutoff) keep.push(all[i]); else oldIds.push(all[i].id);
  }
  for (var d = 0; d < oldIds.length; d++) { await DB.del('pmix_alt_history', oldIds[d]); }
  keep.sort(function (a, b) { return b.at - a.at; });
  var html = '<div style="margin-bottom:10px"><b>' + ICONS.history + ' 查找历史（近 24 小时，' + keep.length + ' 条）</b></div>';
  if (!keep.length) html += '<div class="empty">近 24 小时还没有查找记录</div>';
  else {
    for (var k = 0; k < keep.length; k++) {
      var r = keep[k];
      var dt = pmixFmtTime(r.at);
      html += '<div class="ai-plan-item" style="display:flex;gap:10px;align-items:center;padding:8px 10px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600;font-size:13.5px">' + escapeHtml(r.need || '未命名') + '</div>' +
          '<div style="font-size:12px;color:var(--text-sub)">' + dt + ' · ' + escapeHtml(r.operator || '') + ' · 缺失 ' + (r.missing || []).length + ' 种 · 建议 ' + (r.sugs || []).length + ' 条</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-outline" onclick="pmixAltShowDetail(\'' + r.id + '\')">查看</button>' +
      '</div>';
    }
  }
  var mb = $('.modal-body');
  if (mb) mb.innerHTML = html;
}
/* 某条历史明细：建议 + 当前是否可再采用 */
async function pmixAltShowDetail(id) {
  var rec = await DB.get('pmix_alt_history', id);
  if (!rec) { toast('记录不存在或已过期', 'warn'); return; }
  var plan = PMX.plan || { items: [], missing: [] };   // 未配料时也能看历史
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">' +
    '<b>' + ICONS.history + ' ' + escapeHtml(rec.need || '') + '</b>' +
    '<button class="btn btn-sm btn-outline" onclick="pmixAltShowHistory()">返回历史</button></div>' +
    '<div style="font-size:12.5px;color:var(--text-sub);margin-bottom:8px">' + pmixFmtTime(rec.at) + ' · ' + escapeHtml(rec.operator || '') + '</div>';
  var sugs = rec.sugs || [];
  for (var s = 0; s < sugs.length; s++) {
    var sg = sugs[s] || {};
    var mi = -1;
    for (var q = 0; q < plan.missing.length; q++) { if (aiKwHit(plan.missing[q].kw, sg.kw)) { mi = q; break; } }
    var adopted = mi >= 0 ? !!plan.missing[mi].adopted : false;
    var altOk = sg.altId && State.materials.some(function (x) { return x.id === sg.altId; });
    var btn = '';
    if (mi >= 0 && !adopted && altOk) btn = '<button class="btn btn-sm btn-primary" onclick="pmxAdoptAlt(' + mi + ',\'' + sg.altId + '\');pmixAltShowDetail(\'' + id + '\')">采用</button>';
    else if (adopted) btn = '<button class="btn btn-sm btn-unadopt" onclick="pmxAltUnadoptHist(' + mi + ',\'' + id + '\')">不采用</button>';
    else if (mi < 0) btn = '<span class="badge badge-gray">不在当前方案</span>';
    else btn = '<span class="badge badge-gray">已无库存</span>';
    html += '<div class="ai-plan-item" style="padding:8px 10px"><div class="p-name"><b>' + escapeHtml(String(sg.kw || '').split('|')[0]) + '</b>' +
      '<div style="font-size:12.5px;color:var(--text-sub);margin-top:2px">→ ' + (altOk ? '<span class="t-link" onclick="openMaterialDetailModal(\'' + sg.altId + '\')">' + escapeHtml(sg.altName || '替代物料') + '</span>' : escapeHtml(sg.altName || '无合适替代')) + '（' + escapeHtml(sg.reason || '') + '）</div></div>' + btn + '</div>';
  }
  var mb = $('.modal-body');
  if (mb) mb.innerHTML = html;
}
/* 返回 AI 查找替代的建议列表视图（历史里返回按钮用） */
function pmixAltShowList() {
  var el = $('.modal-body');
  if (!el) return;
  var sug = PMX._lastAltSugs || [];
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">' +
    '<div style="font-size:12.5px;color:var(--text-sub)">共 ' + sug.length + ' 条建议，点"采用"后加入左侧"已采用替代"区域</div>' +
    '<button class="btn btn-sm btn-outline" onclick="pmixAltShowHistory()">' + ICONS.history + '查找历史（近 24 小时）</button></div>';
  var plan2 = PMX.plan || { items: [], missing: [] };
  for (var s = 0; s < sug.length; s++) {
    var sg = sug[s] || {};
    var mi = -1;
    for (var q = 0; q < plan2.missing.length; q++) { if (aiKwHit(plan2.missing[q].kw, sg.kw)) { mi = q; break; } }
    var realIdx = mi >= 0 ? mi : -1;
    var showKw = mi >= 0 ? String(plan2.missing[mi].kw).split('|')[0] : (sg.kw || '?');
    var altId = sg.altId && State.materials.some(function (x) { return x.id === sg.altId; }) ? sg.altId : fuzzyFindAlt(State.materials.filter(function (x) { return x.stock > 0; }), sg.altName);
    var ms2x = realIdx >= 0 ? plan2.missing[realIdx] : null;
    var adoptedNow2 = !!(ms2x && ms2x.adopted);
    var useAltId = altId || (adoptedNow2 && ms2x.altItemIdx != null && plan2.items[ms2x.altItemIdx] ? plan2.items[ms2x.altItemIdx].material.id : '');
    var btns2 = useAltId ? pmxAltBtns(realIdx, useAltId, adoptedNow2) : '<span class="badge badge-gray">无库存替代</span>';
    html += '<div class="ai-plan-item" style="padding:8px 10px"><div class="p-name"><b>' + escapeHtml(showKw) + '</b>' +
      '<div style="font-size:12.5px;color:var(--text-sub);margin-top:2px">→ ' + (useAltId ? '<span class="t-link" onclick="openMaterialDetailModal(\'' + useAltId + '\')">' + escapeHtml(sg.altName || '替代物料') + '</span>' : escapeHtml(sg.altName || '无合适替代')) + '（' + escapeHtml(sg.reason || '') + '）</div></div>' +
      btns2 +
      '</div>';
  }
  el.innerHTML = html;
}
/* 时间格式化（本地） */
function pmixFmtTime(t) {
  var d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* 采用替代：缺失项标记 adopted（不从右列消失、置顶），替代物料进入左列"已采用替代"区 */
function pmxAdoptAlt(missIdx, altId, sugIdx) {
  var plan = PMX.plan;
  var ms = plan.missing[missIdx];
  var altM = null;
  for (var i = 0; i < State.materials.length; i++) { if (State.materials[i].id === altId) { altM = State.materials[i]; break; } }
  if (!ms || !altM || ms.adopted) return;
  var it = { material: altM, needQty: ms.n, have: altM.stock, status: altM.stock >= ms.n ? 'ok' : (altM.stock > 0 ? 'low' : 'none'), why: '替代 ' + ms.kw, alt: true, altKw: String(ms.kw).split('|')[0], missIdx: missIdx };
  plan.items.push(it);
  ms.adopted = true;
  ms.altItemIdx = plan.items.length - 1;
  if (sugIdx !== undefined) {                                  // 弹窗保持打开，可继续采用其它建议
    var el = document.getElementById('pmx-alt-sug-' + sugIdx);
    if (el) el.innerHTML = '<div style="font-size:13px;color:var(--success);font-weight:600">✓ 已采用 ' + escapeHtml(altM.name) + '</div>';
  }
  pmxRenderPlan();
}

/* 撤回替代：从"已采用替代"移除该替代项，原物料回到"库里没有"，可重新查找/采用 */
function pmxUnadoptAlt(itemIdx) {
  var plan = PMX.plan;
  var it = plan.items[itemIdx];
  if (!it || !it.alt) return;
  var ms = plan.missing[it.missIdx];
  plan.items.splice(itemIdx, 1);
  if (ms) { ms.adopted = false; ms.altItemIdx = undefined; }
  for (var i = 0; i < plan.items.length; i++) {                      // splice 后索引变化，重映射其余 altItemIdx
    var _it2 = plan.items[i];
    if (_it2.alt && _it2.missIdx >= 0) {
      var _ms2 = plan.missing[_it2.missIdx];
      if (_ms2) _ms2.altItemIdx = i;
    }
  }
  pmxRenderPlan();
}

/* 采用 / 不采用 双态按钮（建议弹窗与返回建议共用） */
function pmxAltBtns(missIdx, altId, adopted) {
  return '<span class="pmx-alt-btns" style="flex-shrink:0;display:flex;align-items:center">' +
    '<button class="btn btn-sm btn-primary pmx-btn-adopt" style="' + (adopted ? 'display:none' : '') + '" onclick="pmxAltToggle(' + missIdx + ',\'' + altId + '\',this,1)">采用</button>' +
    '<button class="btn btn-sm btn-unadopt pmx-btn-unadopt" style="' + (adopted ? '' : 'display:none') + '" onclick="pmxAltToggle(' + missIdx + ',\'\',this,0)">不采用</button>' +
  '</span>';
}
/* 切换采用状态：采用=push alt 项；不采用=splice；随后只切换这两个按钮，不重建整条 */
async function pmxAltToggle(missIdx, altId, btnEl, adopt) {
  var plan = PMX.plan, ms = plan.missing[missIdx];
  if (!ms) return;
  if (adopt) {
    var altM = null;
    State.materials.forEach(function (m) { if (m.id === altId) altM = m; });
    if (!altM || ms.adopted) return;
    var it = { material: altM, needQty: ms.n, have: altM.stock, status: altM.stock >= ms.n ? 'ok' : (altM.stock > 0 ? 'low' : 'none'), why: '替代 ' + ms.kw, alt: true, altKw: String(ms.kw).split('|')[0], missIdx: missIdx };
    plan.items.push(it);
    ms.adopted = true; ms.altItemIdx = plan.items.length - 1;
  } else {
    if (ms.altItemIdx == null || !plan.items[ms.altItemIdx]) return;
    plan.items.splice(ms.altItemIdx, 1);
    ms.adopted = false; ms.altItemIdx = undefined;
    plan.items.forEach(function (it2, i) { if (it2.alt && it2.missIdx >= 0) { var m2 = plan.missing[it2.missIdx]; if (m2) m2.altItemIdx = i; } });
  }
  var wrap = btnEl.parentNode;
  var a = wrap.querySelector('.pmx-btn-adopt'), u = wrap.querySelector('.pmx-btn-unadopt');
  if (a) a.style.display = adopt ? 'none' : '';
  if (u) u.style.display = adopt ? '' : 'none';
  pmxRenderPlan();
}
/* 查找历史明细里撤回替代，撤回后刷新该明细 */
async function pmxAltUnadoptHist(mi, histId) {
  var plan = PMX.plan, ms = plan.missing[mi];
  if (ms && ms.altItemIdx != null && plan.items[ms.altItemIdx]) {
    plan.items.splice(ms.altItemIdx, 1);
    ms.adopted = false; ms.altItemIdx = undefined;
    plan.items.forEach(function (it2, i) { if (it2.alt && it2.missIdx >= 0) { var m2 = plan.missing[it2.missIdx]; if (m2) m2.altItemIdx = i; } });
  }
  pmxRenderPlan();
  pmixAltShowDetail(histId);
}

/* ============================================================
 * AI 问答
 * ============================================================ */
async function pmxSendChat() {
  var inp = $('#pmx-chat-input');
  var text = inp ? inp.value.trim() : '';
  if (!text) return;
  PMX.chat.push({ role: 'user', content: text });
  inp.value = '';
  var box = $('#pmx-chat-box');
  if (box) box.insertAdjacentHTML('beforeend', '<div class="aip-bubble me">' + escapeHtml(text) + '</div><div id="pmx-chat-wait" style="color:var(--text-sub);font-size:13px;padding:6px 2px">AI 思考中……</div>');
  if (box) box.scrollTop = box.scrollHeight;
  try {
    var cfg = await pickAIConfig('plan');
    var _planTxt = '';
    if (PMX.plan && PMX.plan.items) {
      /* 库里有：名称（型号，封装，位置）需 N 个，现有 M */
      var _okL = PMX.plan.items.filter(function (x) { return !x.alt; }).map(function (x) {
        var _m = x.material || {};
        var _ps = [];
        if (_m.model) _ps.push(_m.model);
        if (_m.pkg) _ps.push(_m.pkg);
        if (_m.loc || _m.locNo) _ps.push((_m.loc || '') + (_m.locNo || ''));
        return '· ' + (_m.name || '') + (_ps.length ? '（' + _ps.join('，') + '）' : '') + '：需 ' + x.needQty + ' 个，现有 ' + (_m.stock !== undefined ? _m.stock : 0);
      });
      /* 已采用替代：用 X（型号，封装）替代 Y */
      var _altL = PMX.plan.items.filter(function (x) { return x.alt; }).map(function (x) {
        var _m = x.material || {};
        var _ps = [];
        if (_m.model) _ps.push(_m.model);
        if (_m.pkg) _ps.push(_m.pkg);
        return '· 用 ' + (_m.name || '') + (_ps.length ? '（' + _ps.join('，') + '）' : '') + ' 替代 ' + (x.altKw || '');
      });
      /* 库里没有：有档案（库存 0）与无档案分开；有档案显示型号/封装/类别/位置；无档案显示 BOM 位号等或别名/类别/用途 */
      var _miss0 = [], _missN = [];
      (PMX.plan.missing || []).forEach(function (x) { (x._lib ? _miss0 : _missN).push(x); });
      function _missLine(x, hasLib) {
        var _f = x._f || {}, _ps = [];
        if (hasLib) {
          var _lb = x._lib;
          if (_lb.model) _ps.push('型号 ' + _lb.model);
          if (_lb.pkg) _ps.push('封装 ' + _lb.pkg);
          if (_lb.cat) _ps.push('类别 ' + _lb.cat);
          if (_lb.loc || _lb.locNo) _ps.push('位置 ' + (_lb.loc || '') + (_lb.locNo || ''));
          _ps.push('现有 0');
        } else {
          if (_f.v) _ps.push(_f.v);
          if (_f.pkg) _ps.push(_f.pkg);
          if (_f.model) _ps.push(_f.model);
          if (_f.mfr) _ps.push(_f.mfr);
          if (_f.des) _ps.push('位号 ' + _f.des);
          var _kwParts = String(x.kw || '').split('|');
          if (!_ps.length) {
            if (_kwParts.length > 1 && _kwParts[1]) _ps.push('别名 ' + _kwParts[1]);
            if (_kwParts.length > 2 && _kwParts[2]) _ps.push('类别 ' + _kwParts[2]);
          }
        }
        var _n = x.name || (hasLib ? x._lib.name : String(x.kw || '').split('|')[0]) || '';
        return '· ' + _n + (_ps.length ? '（' + _ps.join('，') + '）' : '') + '：需 ' + x.n + ' 个' + (x.adopted ? '（已采用替代）' : '') + (x.why ? '（用途：' + x.why + '）' : '');
      }
      var _miss0L = _miss0.map(function (x) { return _missLine(x, true); });
      var _missNL = _missN.map(function (x) { return _missLine(x, false); });
      /* 对话统一带完整清单（含缺料）：AI 必须知道它选的物料、方案以及缺什么 */
      _planTxt = '当前物料清单：\n【库里有】\n' + (_okL.length ? _okL.join('\n') : '（无）') +
        (_altL.length ? '\n【已采用替代】\n' + _altL.join('\n') : '') +
        (_miss0L.length ? '\n【库存为 0（库里有档案，需补货）】\n' + _miss0L.join('\n') : '') +
        (_missNL.length ? '\n【库里没有（待采购）】\n' + _missNL.join('\n') : '');
    }
    var msgs = [{ role: 'system', content: '你是电子项目指导老师，结合项目"' + PMX.name + '"（需求：' + PMX.need + '）和下方当前物料清单回答学生追问，简洁、可操作；物料有缺时给出补买建议或可替代方案。\n\n' + _planTxt }];
    for (var i = 0; i < PMX.chat.length; i++) {
      var cm = PMX.chat[i];
      msgs.push({ role: cm.role === 'user' ? 'user' : 'assistant', content: cm.content });
    }
    var reply = await callLLM(msgs, cfg);
    PMX.chat.push({ role: 'assistant', content: reply });
  } catch (err) {
    PMX.chat.push({ role: 'assistant', content: '调用失败：' + err.message });
  }
  pmxRenderPlan();
  var nb = $('#pmx-chat-box');
  if (nb) nb.scrollTop = nb.scrollHeight;
}

/* ============================================================
 * 保存 / 出库
 * ============================================================ */
/* 新增或更新当前项目（含缺失物料 missing 一并保存），返回 project */
async function pmxUpsert() {
  var name = ($('#pmx-name') ? $('#pmx-name').value : PMX.name) || '';
  name = name.trim();
  if (!name) { toast('请填写项目名称', 'err'); return null; }
  PMX.name = name;
  var proj = PMX.projId ? await DB.get('ai_projects', PMX.projId) : null;
  var serPlans;
  if (PMX.plans.length) {
    serPlans = PMX.plans.map(serializePlan);
    serPlans[PMX.planIdx] = serializePlan(PMX.plan);
  } else {
    serPlans = [serializePlan(PMX.plan)];
  }
  var bomSnap = { grid: PMX._bomGrid || null, head: PMX._bomHead || 0, map: PMX._bomMap || null, needs: PMX._bomNeeds || null };  // BOM 原表快照（供更正功能恢复）
  if (proj) {
    proj.name = name; proj.visibility = PMX.visibility; proj.chat = PMX.chat;
    proj.plans = serPlans; proj.corr = pmxCorrSerious(); proj.bom = bomSnap; proj.updatedAt = Date.now();
  } else {
    proj = {
      id: uid('aip'), name: name, source: PMX.source, need: PMX.need,
      plans: serPlans, chat: PMX.chat, corr: pmxCorrSerious(), bom: bomSnap, visibility: PMX.visibility,
      operator: Auth.user.username, createdAt: Date.now(), updatedAt: Date.now()
    };
    PMX.projId = proj.id; PMX.operator = proj.operator;
  }
  await DB.put('ai_projects', proj);
  return proj;
}
async function pmxSave() { var p = await pmxUpsert(); if (p) toast(PMX.projId ? '已保存修改' : '已保存项目', 'ok'); }

/* 出库后：用最新库存刷新当前方案快照，保证重渲染显示的是新库存 */
function pmxRefreshStocks() {
  var plan = PMX.plan;
  for (var i = 0; i < plan.items.length; i++) {
    var it = plan.items[i];
    for (var j = 0; j < State.materials.length; j++) {
      if (State.materials[j].id === it.material.id) {
        it.material = State.materials[j];
        it.have = State.materials[j].stock;
        it.status = it.have >= it.needQty ? 'ok' : (it.have > 0 ? 'low' : 'none');
        break;
      }
    }
  }
}

/* 出库并保存项目 */
async function pmxClaim() {
  var name = ($('#pmx-name') ? $('#pmx-name').value : PMX.name) || '';
  name = name.trim();
  if (!name) { toast('请填写项目名称', 'err'); return; }
  PMX.name = name;
  var chks = document.querySelectorAll('.pmx-chk');
  var list = [];
  for (var i = 0; i < chks.length; i++) {
    if (!chks[i].checked) continue;
    var mid = chks[i].getAttribute('data-mid');
    var it = null;
    for (var j = 0; j < PMX.plan.items.length; j++) { if (PMX.plan.items[j].material.id === mid) { it = PMX.plan.items[j]; break; } }
    if (it) list.push({ it: it, qty: it.needQty * PMX.copies });
  }
  if (!list.length) { toast('请勾选要出库的物料', 'warn'); return; }
  var done = 0;
  for (var k = 0; k < list.length; k++) {
    var it2 = list[k].it, m2 = it2.material;
    var okRec = await applyStockRecord(m2.id, 'out', list[k].qty, { project: name, note: (it2.alt ? '替代领用：' + it2.altKw : it2.why || '项目配料') });
    if (!okRec) continue;                                                                                     // 单个物料出库失败（如库存不足）：跳过继续，不中断整批
    done++;
    if (!PMX.pickMarks) PMX.pickMarks = {};
    PMX.pickMarks[m2.id] = true;                                                                               // 点过出库的物料进取件清单（普通成员导出用）
    /* 把项目名打进物料标签：必须改库里的真实对象，不能用旧库存快照覆盖已更新的库存（tags 是数组，不是逗号字符串） */
    var mReal = null;
    for (var ri = 0; ri < State.materials.length; ri++) { if (State.materials[ri].id === m2.id) { mReal = State.materials[ri]; break; } }
    if (mReal) {
      var tags = (mReal.tags && mReal.tags.length) ? mReal.tags.slice() : [];
      if (tags.indexOf(name) < 0) { tags.push(name); mReal.tags = tags; await DB.put('materials', mReal); }
    }
  }
  if (!done) { toast('没有物料出库成功（请检查库存是否充足）', 'warn'); return; }
  await State.refreshMaterials();
  pmxRefreshStocks();                                                                                        // 用最新库存刷新方案快照，重渲染才能显示新库存
  /* 出库成功后弹窗询问是否保存项目（保存=紫底白字，不保存=浅色） */
  PMX.claimed = true;
  var cnt = done;
  openModal('出库完成', '<div style="padding:22px;text-align:center;line-height:1.9">已出库 <b>' + cnt + '</b> 种物料。<br>是否把该项目保存到历史项目？</div>',
    '<button class="btn btn-outline" onclick="pmxClaimNoSave()">不保存</button><button class="btn btn-primary" onclick="pmxClaimSave()">保存</button>');
  pmxRenderPlan();
}
function pmxClaimSave() {
  closeModal();
  pmxUpsert().then(function (p) { toast(p ? '已出库并保存项目' : '已出库', 'ok'); });
}
function pmxClaimNoSave() { closeModal(); toast('已出库（未保存项目）', 'ok'); }

/* ============================================================
 * 导出取件清单 / 购买清单（CSV 下载）
 * ============================================================ */
/* 库里不够的物料（数量不足，含已采用替代后仍不够的） */
function pmxLowItems() {
  return PMX.plan.items.filter(function (it) { return it.status === 'low' || it.status === 'none'; });
}
/* 普通成员：点"入库"看位置（不标记清单）；点"出库"的物料进取件清单 */
function pmxPickIn(id) {
  pmxRenderPlan();
  openStockIOModal(id, 'in');
}
/* 点"出库"即视为要领用，标记进取件清单（普通成员导出取件清单按此） */
function pmxPickOut(id) {
  if (!PMX.pickMarks) PMX.pickMarks = {};
  PMX.pickMarks[id] = true;
  pmxRenderPlan();
  openStockIOModal(id, 'out');
}
/* 导出取件清单：普通成员默认直接导出点过"出库"的（弹窗提示）；其他人默认导出库里有+已采用代替，弹卡询问是否加库里不够 */
function pmxExportPick() {
  if (!isAdminNow()) {
    var marks = PMX.pickMarks || {};
    var mk = Object.keys(marks);
    if (!mk.length) { toast('还没有点过出库的物料：在行的"出库"按钮点一下即加入取件清单', 'warn'); return; }
    pmxExportPickDo(true, true);
    openModal('导出取件清单', '已默认导出你点过出库的 <b>' + mk.length + '</b> 种物料。<br>未点过出库的不会导出。',
      '<button class="btn btn-primary" onclick="closeModal()">好的</button>');
    return;
  }
  var lows = pmxLowItems();
  if (lows.length) {
    openModal('加入取件清单？', '默认导出库里有的和已采用代替的物料。<br>还有 <b>' + lows.length + '</b> 种库存不足（库里不够），是否把它们也加进取件清单？',
      '<button class="btn" onclick="closeModal();pmxExportPickDo(false,false)">不加</button><button class="btn btn-primary" onclick="closeModal();pmxExportPickDo(true,false)">加入</button>');
    return;
  }
  pmxExportPickDo(false, false);
}
function pmxExportPickDo(addLow, onlyMarked) {
  var name = PMX.name || '项目';
  var lines = ['物料名称,型号/规格,位置,数量,状态,签收'];
  var plan = PMX.plan;
  var marks = onlyMarked ? (PMX.pickMarks || {}) : null;
  var grpHave = [], grpAlt = [], grpLow = [];                    // 库里有 / 已采用代替 / 库里不够，分组标注+组间空行
  for (var i = 0; i < plan.items.length; i++) {
    var it = plan.items[i], m = it.material;
    if (marks && !marks[m.id]) continue;                                               // 普通成员：只导出点过出库的
    var isLow = it.status === 'low' || it.status === 'none';
    if (isLow && !addLow) continue;                                                   // 不加：库里不够的跳过
    var loc = canSeeLoc(m.id) ? (m.loc || '') + (m.locNo || '') : '未解锁';
    var st = isLow ? '库里不够' : (it.alt ? '已采用代替' : '库里有');
    var row = '"' + escapeCsv(m.name) + '","' + escapeCsv(m.model || '') + '","' + escapeCsv(loc) + '",' + (it.needQty * PMX.copies) + ',' + st + ',';
    if (isLow) grpLow.push(row); else if (it.alt) grpAlt.push(row); else grpHave.push(row);
  }
  var out = [lines[0]];
  var groups = [grpHave, grpAlt, grpLow];
  var first = true;
  for (var g = 0; g < groups.length; g++) {
    if (!groups[g].length) continue;
    if (!first) out.push('');
    first = false;
    for (var r = 0; r < groups[g].length; r++) out.push(groups[g][r]);
  }
  if (out.length === 1) out.push('（无可导出的物料）');
  var blob = new Blob(['\ufeff' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '-取件清单.csv'; a.click();
}
/* 导出购买清单：所有人弹卡给两个勾选（库里不够 / 被代替），默认导出库里没有 */
function pmxExportBuy() {
  openModal('导出购买清单',
    '默认导出库里没有的物料，可勾选追加其他情况。<div style="margin-top:10px;line-height:2.2">' +
    '<label style="display:block"><input type="checkbox" id="buy-add-low" /> 将库里不够的物料也加入购买清单</label>' +
    '<label style="display:block"><input type="checkbox" id="buy-add-rep" /> 将被代替的物料也加入购买清单</label></div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="pmxExportBuyDo(!!(document.getElementById(\'buy-add-low\')&&document.getElementById(\'buy-add-low\').checked), !!(document.getElementById(\'buy-add-rep\')&&document.getElementById(\'buy-add-rep\').checked));closeModal()">导出</button>');
}
function pmxExportBuyDo(addLow, addReplaced) {
  var name = PMX.name || '项目';
  var lines = ['物料名称,建议数量,备注'];
  var plan = PMX.plan;
  var groups = [];
  /* 1) 库里没有（未采用替代的缺料） */
  var grpMiss = [];
  for (var i = 0; i < plan.missing.length; i++) {
    var ms = plan.missing[i];
    if (ms.adopted) continue;
    var nmB = (ms.detail && ms.detail !== ms.name) ? ms.detail : (ms.name || String(ms.kw || '').split('|')[0]);   // detail 已含名称，避免重复
    grpMiss.push('"' + escapeCsv(nmB.replace(/"/g, '""')) + '",' + (ms.n * PMX.copies) + ',"库里没有"');
  }
  if (grpMiss.length) groups.push(grpMiss);
  /* 2) 被代替（勾选才加） */
  if (addReplaced) {
    var grpRep = [];
    for (var r2 = 0; r2 < plan.missing.length; r2++) {
      var ms2 = plan.missing[r2];
      if (!ms2.adopted) continue;
      var nmR = (ms2.detail && ms2.detail !== ms2.name) ? ms2.detail : (ms2.name || String(ms2.kw || '').split('|')[0]);
      var repName = '？';
      if (ms2.altItemIdx !== undefined && plan.items[ms2.altItemIdx]) repName = plan.items[ms2.altItemIdx].material.name;
      grpRep.push('"' + escapeCsv(nmR.replace(/"/g, '""')) + '",' + (ms2.n * PMX.copies) + ',"被代替（用 ' + escapeCsv(repName) + ' 代替）"');
    }
    if (grpRep.length) groups.push(grpRep);
  }
  /* 3) 库里不够（勾选才加） */
  if (addLow) {
    var grpLow = [];
    var lows = pmxLowItems();
    for (var l2 = 0; l2 < lows.length; l2++) {
      var it = lows[l2], m = it.material;
      var nmL = (m.name || '') + (m.model ? ' ' + m.model : '');
      var needT = (it.needQty * PMX.copies) - m.stock;
      if (needT < 1) needT = 1;
      grpLow.push('"' + escapeCsv(nmL.replace(/"/g, '""')) + '",' + needT + ',"库里不够（现有 ' + m.stock + '）"');
    }
    if (grpLow.length) groups.push(grpLow);
  }
  var out = [lines[0]];
  for (var g = 0; g < groups.length; g++) { if (g) out.push(''); for (var rr = 0; rr < groups[g].length; rr++) out.push(groups[g][rr]); }
  if (out.length === 1) out.push('（无待购买物料）');
  var blob = new Blob(['\ufeff' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '-购买清单.csv'; a.click();
}

/* ============================================================
 * 视图 3：历史项目（页面内，支持搜索）
 * ============================================================ */
async function pmxOpenHistory() {
  PMX.view = 'history';
  var all = await DB.all('ai_projects');
  all.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  var me = Auth.user.username;
  var visible = all.filter(function (p) { return p.visibility === 'public' || p.operator === me; });
  PMX._hisAll = visible;
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title" style="font-size:18px">历史项目</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="sug-wrap" style="width:230px"><input class="input" id="pmx-his-search" placeholder="搜索项目 / 创建人…" oninput="pmxHistoryFilter()" /></div>' +
        '<button class="btn btn-outline" onclick="pmxRenderHome()">' + ICONS.back + '返回</button>' +
      '</div>' +
    '</div>' +
    '<div class="card" id="pmx-his-list"></div>';
  pmxHistoryFilter();
  window.scrollTo(0, 0);
}
function pmxHistoryFilter() {
  var q = ($('#pmx-his-search') ? $('#pmx-his-search').value : '').trim().toLowerCase();
  var list = PMX._hisAll || [];
  if (q) list = list.filter(function (p) { return (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.operator || '').toLowerCase().indexOf(q) >= 0; });
  var me = Auth.user.username;
  var rows = '';
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    var canOp = p.operator === me || isAdminNow();
    rows += '<div class="ai-plan-item">' +
      '<div class="p-name"><span class="t-link" onclick="pmxOpenProject(\'' + p.id + '\')">' + escapeHtml(p.name) + '</span><div style="font-size:12px;color:var(--text-sub);margin-top:2px">' +
        (p.source === 'bom' ? 'BOM 导入' : '智能配料') + ' · ' + escapeHtml(p.operator) + ' · ' + fmtDateShort(p.createdAt) +
        (p.visibility === 'private' ? ' · 私密' : '') + '</div></div>' +
      (canOp ? '<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="pmxDeleteProject(\'' + p.id + '\')">删除</button>' : '') +
      '</div>';
  }
  if (!rows) rows = '<div class="empty">' + (q ? '没有匹配的项目' : '还没有保存过项目，配料结果出来后点"保存"') + '</div>';
  $('#pmx-his-list').innerHTML = rows;
}

/* 反序列化：serialized plan → 带 material 对象的 plan（库存/状态按当前库重算，避免旧快照误报） */
function pmxHydrate(sp) {
  var items = [], missing = (sp.missing || []).slice();
  (sp.items || []).forEach(function (si) {
    var m = null;
    for (var i = 0; i < State.materials.length; i++) { if (State.materials[i].id === si.mid) { m = State.materials[i]; break; } }
    if (!m) m = { id: si.mid, name: si.name, model: si.model, unit: si.unit, loc: si.loc, locNo: si.locNo, stock: si.have };
    var have = (m.stock !== undefined && m.stock !== null) ? m.stock : (si.have || 0);
    if (have <= 0) { missing.push({ kw: m.name || si.name, n: si.needQty, why: si.why || '', name: m.name || si.name, detail: si.why || '' }); return; }   // 库存为 0 不算"库里有"
    var status = have >= si.needQty ? 'ok' : 'low';
    items.push({ material: m, needQty: si.needQty, have: have, status: status, why: si.why || '', alt: !!si.alt, altKw: si.altKw || '', missIdx: si.missIdx !== undefined ? si.missIdx : -1 });
  });
  /* 重建后重映射：替代项 ↔ 原物料的 adopted / altItemIdx（items 索引已变化） */
  for (var i2 = 0; i2 < items.length; i2++) {
    if (items[i2].alt && items[i2].missIdx >= 0 && items[i2].missIdx < missing.length) {
      missing[items[i2].missIdx].adopted = true;
      missing[items[i2].missIdx].altItemIdx = i2;
    }
  }
  return { text: sp.note || '', note: sp.note || '', items: items, missing: missing };
}

async function pmxOpenProject(id) {
  var proj = await DB.get('ai_projects', id);
  if (!proj) { toast('项目不存在', 'err'); return; }
  PMX.projId = proj.id; PMX.name = proj.name; PMX.source = proj.source; PMX.need = proj.need || '';
  PMX.operator = proj.operator; PMX.visibility = proj.visibility; PMX.chat = proj.chat || [];
  PMX.corr = proj.corr || [];
  var bom = proj.bom || {};  // 恢复 BOM 原表快照（供手动/AI更正功能使用）
  PMX._bomGrid = bom.grid || null; PMX._bomHead = bom.head || 0; PMX._bomMap = bom.map || null; PMX._bomNeeds = bom.needs || null;
  if (PMX._bomGrid && PMX._bomMap) PMX._bomMap = pmxMapFill(PMX._bomMap, PMX._bomGrid[PMX._bomHead]);  // 旧项目补全新增列（如 Comment / iCmt）
  PMX.copies = 1; PMX.claimed = false; PMX.planIdx = 0; PMX.returnTo = 'history';
  PMX.plans = (proj.plans || []).map(pmxHydrate);
  PMX.plan = PMX.plans[0] || { items: [], missing: [] };
  /* 历史项目向后兼容①：用保存的 BOM 快照按"最新识别规则"重跑一遍（旧版规则有误判，如 BUZ 封装被当成晶振、TMC2209 被当成保险丝）
     已人工更正的行走更正结果、已手选过连接器类型的行不覆盖 */
  if (PMX._bomGrid && PMX._bomMap) {
    var _hg = PMX._bomGrid, _hm = PMX._bomMap, _hh = PMX._bomHead || 0;
    var _hHead = _hg[_hh] || [];
    var _pnAll = PMX._bomNeeds || [];
    var _corrRows = {};
    (PMX.corr || []).forEach(function (c) { if (c.active) _corrRows[c.rowIdx] = 1; });
    PMX.plan.missing.forEach(function (m) {
      if (m._conn) return;                       // 已手选连接器类型：保留用户选择
      if (m._f && /^(排针|排母|针座|母座|接线端子)/.test(String(m._f.cls || ''))) return;   // 旧项目里手选过连接器类型的行也不覆盖
      var need = null;
      if (m._nIdx != null && _pnAll[m._nIdx]) need = _pnAll[m._nIdx];
      if (!need && m.kw) { for (var _i = 0; _i < _pnAll.length; _i++) { if (_pnAll[_i] && _pnAll[_i].kw === m.kw) { need = _pnAll[_i]; break; } } }
      if (!need || need.rowIdx == null || !_hg[need.rowIdx]) return;
      if (_corrRows[need.rowIdx]) return;        // 已人工更正：不覆盖
      var _row = _hg[need.rowIdx];
      var _g2 = function (ix) { return ix >= 0 ? String(_row[ix] || '').trim() : ''; };
      var _cat = pmxRowCatText(_row, _hHead);
      var _d2 = bomDescribe(_g2(_hm.iDev), _g2(_hm.iName), _g2(_hm.iVal), _g2(_hm.iPkg), _g2(_hm.iMfr), _g2(_hm.iCode), _g2(_hm.iDes), _g2(_hm.iCmt), _cat);
      if (!_d2.name) return;
      m.name = _d2.name;
      m._f = { name: _d2.name, cls: _d2.cls, v: _g2(_hm.iVal), model: _d2.model, nm: _g2(_hm.iName), pkg: _d2.pkgShort, mfr: _g2(_hm.iMfr), code: _g2(_hm.iCode), des: _d2.des, locked: _d2.locked, mount: _d2.mount, cmt: _g2(_hm.iCmt), cat: _cat };
    });
  }
  /* 历史项目向后兼容②：用保存的 BOM 快照修补双排连接器名称（旧版 bomDescribe 未检查 Comment 列的双排格式如 2*16P） */
  if (PMX._bomGrid && PMX._bomMap) {
    var _pg = PMX._bomGrid, _pm = PMX._bomMap, _pn = PMX._bomNeeds || [];
    var _dualRe = /2[-x×*](\d+)[pP]/i;  // 支持 -、x、×、* 四种分隔符
    PMX.plan.missing.forEach(function (m) {
      var f = m._f || {};
      var cls = String(f.cls || '');
      if (!/连接器|排针|排母|针座|母座|端子/.test(cls)) return;
      if (/^双排连接器/.test(String(m.name || ''))) return;  // 已经是新格式，跳过
      /* 从 BOM 快照取原始行的 Footprint 和 Comment */
      var P = '', Cm = '';
      var need = null;
      if (m._nIdx != null && _pn[m._nIdx]) need = _pn[m._nIdx];
      if (!need && m.kw) {  // _nIdx 不随序列化保存，用 kw 反查
        for (var _ni = 0; _ni < _pn.length; _ni++) { if (_pn[_ni] && _pn[_ni].kw === m.kw) { need = _pn[_ni]; break; } }
      }
      if (need && need.rowIdx != null && _pg[need.rowIdx]) {
        if (_pm.iPkg >= 0) P = String(_pg[need.rowIdx][_pm.iPkg] || '').trim();
        if (_pm.iCmt >= 0) Cm = String(_pg[need.rowIdx][_pm.iCmt] || '').trim();
      }
      if (!P && f.pkg) P = f.pkg;
      if (!Cm && f.cmt) Cm = f.cmt;
      if (!P && !Cm) return;
      /* 同时查 Footprint 和 Comment 的双排格式（与 bomDescribe 一致） */
      var dualMatch = P.match(_dualRe) || Cm.match(_dualRe);
      if (dualMatch) {
        var pitch = (P.match(/[pP](\d+(?:\.\d+)?)(?![a-z])/i) || Cm.match(/(\d+(?:\.\d+)?)\s*mm/i) || [])[1] || '';
        var pinsRaw = dualMatch[1] + 'x' + dualMatch[2] + 'P';
        var subParts = [pinsRaw];
        if (pitch) subParts.push(pitch + 'mm');
        var newName = '双排连接器' + (subParts.length ? '（' + subParts.join(' ') + '）' : '');
        m.name = newName;
        if (!m._f) m._f = {};
        m._f.name = newName;
        if (!m._f.pkg) m._f.pkg = P;
      }
    });
  }
  pmxRenderPlan();
}

async function pmxDeleteProject(id) {
  var ok = await confirmBox('确定删除这个项目吗？（不影响已经出库的库存记录）');
  if (!ok) return;
  await DB.del('ai_projects', id);
  pmxOpenHistory();
}

/* 编辑项目（改名 / 公开私密） */
async function pmxEditProject(id) {
  var proj = await DB.get('ai_projects', id);
  if (!proj) return;
  openModal('编辑项目',
    '<div class="form-item"><label>项目名称</label><input class="input" id="pmx-edit-name" maxlength="40" value="' + escapeHtml(proj.name) + '" /></div>' +
    '<div class="form-item"><label>可见范围</label><div class="radio-group" id="pmx-edit-vis">' +
      '<span class="radio-chip' + (proj.visibility === 'public' ? ' on' : '') + '" data-v="public" onclick="pmxEditVisPick(this)">公开（所有人可见）</span>' +
      '<span class="radio-chip' + (proj.visibility === 'private' ? ' on' : '') + '" data-v="private" onclick="pmxEditVisPick(this)">私密（仅自己可见）</span>' +
    '</div></div>',
    '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="pmxDoEdit(\'' + id + '\')">保存</button>');
}
function pmxEditVisPick(el) {
  var chips = el.parentNode.children;
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
  el.classList.add('on');
}
async function pmxDoEdit(id) {
  var name = $('#pmx-edit-name').value.trim();
  if (!name) { toast('请填写项目名称', 'err'); return; }
  var visEl = $('#pmx-edit-vis .radio-chip.on');
  var vis = visEl ? visEl.getAttribute('data-v') : 'public';
  var proj = await DB.get('ai_projects', id);
  if (!proj) return;
  proj.name = name; proj.visibility = vis; proj.updatedAt = Date.now();
  await DB.put('ai_projects', proj);
  closeModal(); toast('已更新', 'ok'); pmxOpenHistory();
}
