/* ============================================================
   pages_manual.js —— 使用手册（新手必看）
   ------------------------------------------------------------
   内容：
   1. pageManual()      手册页面（所有角色可见，左侧菜单"使用手册"进入）
                       根据当前登录角色动态显示：普通成员、授权成员、管理员看到的内容不同，
                       高权限功能会标注（授权成员+管理员）或（仅管理员）
   2. showManualHint()  新成员第一次登录的提示弹窗（doLogin 登录成功后触发）
   说明：本页文字是对当前版本功能的说明，功能有变动时记得同步更新这里。
   ============================================================ */

/* ==================== 1. 使用手册页面 ==================== */

function pageManual() {
  var isAdmin  = isAdminNow();                                    // 是否管理员
  var canMng   = Auth.can('manage');                               // 是否有管理物料权限（管理员或被临时授权的成员）
  var roleTag  = isAdmin ? '<span class="badge badge-purple">管理员</span>'
                        : (canMng  ? '<span class="badge" style="background:#FF7F27;color:#fff">授权成员</span>'
                                   : '<span class="badge" style="background:#999;color:#fff">普通成员</span>');  // 顶部角色标识
  var am       = '（授权成员+管理员）';                             // 授权成员和管理员都有的功能标注
  var ao       = '（仅管理员）';                                    // 仅管理员有的功能标注

  $('#page').innerHTML = '' +
    '<div class="page-head">' +
      '<div><div class="page-title">使用手册 ' + roleTag + '</div><div class="page-desc">第一次用？三分钟看完就能上手；功能有更新，建议老成员也翻一眼</div></div>' +
    '</div>' +

    /* 顶部欢迎卡：会徽 + 一句话介绍 */
    '<div class="card" style="display:flex;gap:16px;align-items:center">' +
      '<img src="assets/logo.png" alt="协会会徽" style="width:64px;height:64px;object-fit:contain;flex:none" />' +
      '<div style="font-size:13px;line-height:1.9">' +
        '<b>智能控制协会 · 物料管家</b><br>' +
        '协会的电子元件都登记在这里：查库存、借元件、还元件、查历史、按项目一键配齐物料。<b>手机电脑都能用，断网也不影响登记</b>，联网自动同步。' +
      '</div>' +
    '</div>' +

    /* 快速上手 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">🚀 三分钟上手</div>' +
      '<div style="font-size:13px;line-height:2.1">' +
        '<b>第 1 步 · 改密码：</b>' + (isAdmin ? '首次登录请' : '管理员给你开了账号，先') + '点左下角 <b>"修改密码"</b> 改成自己的密码。<br>' +
        '<b>第 2 步 · 查库存：</b>左侧菜单点 <b>「物料库」</b>，搜索框输入元件名、型号、丝印甚至拼音首字母（比如 "0805 电阻" 或 "dz"），能看到数量、型号、放在哪；点名称进详情页看每一笔来龙去脉。<br>' +
        '<b>第 3 步 · 领元件：</b>在 <b>「物料库」</b>找到要领的元件 → 点行尾的 <b>"出"</b> 按钮（或点名称进详情页点"出库"）→ 弹窗里填数量、用途项目 → 提交，系统自动扣减库存，并弹出存放位置提示方便你去取。<br>' +
        '<b>第 4 步 · 还元件：</b>用不完的退回来 → 同样找到该元件，点 <b>"入"</b>（入库），备注写"退回"即可。<br>' +
        '<b>第 5 步 · 做项目：</b>要做整机就去 <b>「项目配料」</b>，一句话说需求让 AI 列清单，或导入嘉立创 BOM 一键配齐。' +
        (canMng ? '<br>' +
        '<b>第 6 步 · 录物料：</b>有新元件进库，在「物料库」点 <b>"新增物料"</b> 填档案' + (isAdmin ? '；批量录入可用数据管理里的 CSV 导入' : '') + '。' : '') +
      '</div>' +
    '</div>' +

    /* 每个页面是干嘛的 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">📖 每个页面是干嘛的</div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th style="width:130px">页面</th><th>作用</th></tr></thead>' +
        '<tbody>' +
          '<tr><td><b>仪表盘</b></td><td>总览：物料种类、库存预警、本月出库、消耗排行' + (isAdmin ? '、库存价值' : '') + '、最近动态</td></tr>' +
          '<tr><td><b>物料库</b></td><td>查询搜索全部元件，支持按封装 / 存放位置 / 分类 / 标签筛选，可按编号、库存、单价、更新时间排序；<b>每行行尾的"入 / 出"按钮就是日常出入库入口</b>（入库＝采购 / 退回 / 捐赠，出库＝领用 / 消耗 / 报废' + (isAdmin ? '，还能做库存调整' : '') + '）' + (canMng ? '；<b>新增 / 编辑物料</b>' + am + '；右上角"图片识别"拍图后也可新增物料' : '；右上角"图片识别"对着元件拍一张图，AI 自动认物后出库或入库') + '</td></tr>' +
          '<tr><td><b>项目配料</b></td><td>把"智能配料"和"项目领料"合在一起：① 一句话说需求（如"做一个流水灯"），AI 给方案和物料清单并匹配库存；② 导入嘉立创 BOM 表（csv / txt / xlsx / xls，也可直接把文件拖进页面）一键配齐；③ 右上角"历史项目"可重新打开、一键再领、导出取件清单</td></tr>' +
          '<tr><td><b>库存预警</b></td><td>库存 ≤ 警戒线标红"告急"、≤ 1.5 倍警戒线标黄"偏低"，方便申请补货' + (isAdmin ? '；可调警戒线、导出补货清单' + ao : '') + '</td></tr>' +
          '<tr><td><b>统计报表</b></td><td>消耗排行、库存结构（都能选时间范围并导出 CSV）' + (isAdmin ? '；经费统计、成员统计' + ao : '') + '</td></tr>' +
          '<tr><td><b>历史追溯</b></td><td>每一笔出入库都可查，可按关键词 / 类型 / 项目 / 状态 / 时间筛选、可导出；录错了自己的记录可以撤回，撤回后还能取消撤回</td></tr>' +
          '<tr><td><b>数据管理</b></td><td>回收站（自己删的能恢复）、操作日志' + (canMng ? '；物料 CSV 导入导出' + am : '') + (isAdmin ? '；全库备份恢复、彻底删除、示例数据、初始化' + ao : '') + '</td></tr>' +
          (isAdmin
            ? '<tr><td><b>用户管理</b><span class="badge badge-purple">管理员</span></td><td>添加成员、改班级、授权、升降管理员、停用启用、重置密码' + ao + '</td></tr>'
            : '') +
          '<tr><td><b>系统设置</b></td><td>多端同步、AI 接入、界面主题' + (isAdmin ? '；分类管理' + ao : '') + '</td></tr>' +
        '</tbody>' +
      '</table></div>' +
    '</div>' +

    /* 值得一用的特色功能 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">✨ 这些功能值得一试</div>' +
      '<div style="font-size:13px;line-height:2.1">' +
        '<b>· 出入库不用找页面：</b>系统没有单独的"出入库登记"页——「物料库」每行行尾有 <b>"入 / 出"</b> 快捷按钮，详情页、库存预警（补货入库）、项目配料（一键出库）、拍照识别结果里也都能直接登记，在哪看到物料就在哪登记。登记成功后还会弹出存放位置提示，照着去取就行。<br>' +
        '<b>· 拍照识别元件：</b>「物料库」右上角"图片识别"，可点选图片、手机调用相机拍、电脑用摄像头取景，也支持 Ctrl+V 粘贴或把图片拖进来。AI 认出来后可直接入库或出库，照片会自动存进物料档案当实物照' + (canMng ? '；库里没有同款时可直接 <b>"新增物料"</b>' + am : '；库里没有同款时请联系管理员或被授权成员录入') + '。<br>' +
        '<b>· BOM 一键配齐：</b>「项目配料」导入嘉立创 BOM，系统自动分出"库里有"和"库里没有"两堆；库里有的一键出库，没有的可让 AI 从库存里找替代；要做 N 份就填"本次要 N 份"，数量自动乘倍。表头对不上还能"手动映射列"。<br>' +
        '<b>· 识别不准可以更正：</b>BOM 导入后若某行认错了，点 <b>"手动/AI 更正"</b>，每一行有三个独立的更正槽——<b>AI 更正</b>（勾选后让 AI 批量重认）、<b>手动输入更正</b>（自己填名称/类别/型号等）、<b>手动查找库更正</b>（直接从物料库里挑一个）。三个槽各留一条、可随时切换生效或撤销，更正结果会随项目一起保存。<br>' +
        '<b>· 历史项目一键再领：</b>以前办过的项目在「项目配料 → 历史项目」里，打开即可按当前库存重算，再领一份；还能导出取件清单、导出购买清单、改名、设为公开或私密。<br>' +
        (isAdmin
          ? '<b>· 位置保护：</b>管理员可看所有物料位置；普通成员只能看到自己经手过（有过有效出入库）的物料位置，10 分钟内有效。<br>'
          : '<b>· 位置保护：</b>普通成员只能看到自己经手过（有过有效出入库）的物料存放位置，查看后 10 分钟内有效，避免位置信息被无关人员翻看。<br>') +
        '<b>· 警戒线会自己微调：</b>每次出库后，系统按近 90 天平均月消耗自动微调该物料的警戒线（有限幅和 7 天节流，不会乱跳），让预警更贴近实际用量。' +
      '</div>' +
    '</div>' +

    /* 权限一览（仅管理员可见） */
    (isAdmin
      ? '<div class="card">' +
          '<div class="page-title" style="font-size:15px;margin-bottom:10px">🔑 权限一览</div>' +
          '<div class="table-wrap"><table class="tbl">' +
            '<thead><tr><th style="width:230px">功能</th><th style="width:80px">普通成员</th><th style="width:80px">授权成员</th><th style="width:80px">管理员</th></tr></thead>' +
            '<tbody>' +
              '<tr><td>查询 / 出入库 / AI 问答 / 撤回自己的记录</td><td>✅</td><td>✅</td><td>✅</td></tr>' +
              '<tr><td>导出物料表 / 取件清单</td><td>✅<span style="font-size:11px;color:var(--text-sub)"> 取件需出库后</span></td><td>✅</td><td>✅</td></tr>' +
              '<tr><td>查看物料位置（自己经手过的，10 分钟有效）</td><td>✅</td><td>✅</td><td>✅ 恒可见</td></tr>' +
              '<tr><td>新增 / 编辑物料档案 ' + am + '</td><td>❌</td><td>✅</td><td>✅</td></tr>' +
              '<tr><td>图片识别中"新增物料" ' + am + '</td><td>❌</td><td>✅</td><td>✅</td></tr>' +
              '<tr><td>物料 CSV 导入导出 ' + am + '</td><td>❌</td><td>✅</td><td>✅</td></tr>' +
              '<tr><td>调警戒线 / 导出补货清单 ' + ao + '</td><td>❌</td><td>❌</td><td>✅</td></tr>' +
              '<tr><td>经费统计 / 成员统计 / 库存价值 ' + ao + '</td><td>❌</td><td>❌</td><td>✅</td></tr>' +
              '<tr><td>回收站：恢复全部物料 ' + ao + '</td><td>自己的</td><td>自己的</td><td>✅</td></tr>' +
              '<tr><td>彻底删除 / 全库恢复 / 初始化 ' + ao + '</td><td>❌</td><td>❌</td><td>✅</td></tr>' +
              '<tr><td>用户管理 ' + ao + '</td><td>❌</td><td>❌</td><td>✅</td></tr>' +
              '<tr><td>分类管理 ' + ao + '</td><td>❌</td><td>❌</td><td>✅</td></tr>' +
            '</tbody>' +
          '</table></div>' +
          '<div class="form-hint" style="margin-top:10px">可在「用户管理」里给某个成员临时勾选管理权限（"已授权 / 未授权"按钮），让他帮忙录入物料档案。</div>' +
        '</div>'
      : '') +

    /* 常见问题 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">❓ 常见问题</div>' +
      '<div style="font-size:13px;line-height:2.1">' +
        '<b>· 忘记密码？</b>找管理员在「用户管理」里重置（会重置为初始密码，登录后请尽快改）。<br>' +
        '<b>· 手机上数据没更新？</b>联网状态下约 8 秒自动同步；着急就到「系统设置 → 多端同步」点"立即同步"。<br>' +
        '<b>· 断网了还能用吗？</b>能。照常查询和登记，数据先存手机本地，恢复网络后自动补传，不会丢。<br>' +
        '<b>· 找不到想要的元件？</b>先换个关键词搜（支持拼音首字母）；也可以在「物料库」点"图片识别"拍一张图让 AI 认' + (canMng ? '；确实没有就自己新增' : '；确实没有就联系管理员录入') + '。<br>' +
        '<b>· 做一个新项目怎么领料？</b>到「项目配料」导入嘉立创导出的 BOM 表，勾好物料一键出库；要做一批 N 份就填"本次要 N 份"。<br>' +
        '<b>· 图片 / 文件怎么传？</b>除了点按钮选文件，还支持 Ctrl+V 直接粘贴图片、把文件直接拖进页面（BOM、CSV、备份 JSON 都能拖）。<br>' +
        '<b>· 登记错了怎么办？</b>自己经手的出入库可以在「历史追溯」里<b>撤回</b>（撤回后还能"取消撤回"），库存自动退回，不用手工改。<br>' +
        '<b>· 物料删错了？</b>删除只是进「数据管理 → 回收站」，自己删的自己能恢复' + (isAdmin ? '，管理员还能恢复别人删的、彻底删除' : '') + '。<br>' +
        '<b>· 能看到单价吗？</b>能，在物料详情、出入库弹窗和导出的表格里都能看到' + (isAdmin ? '' : '；经费相关的汇总只有管理员看得到') + '。' +
      '</div>' +
    '</div>' +

    /* 管理员补充（只有管理员看得到这张卡） */
    (isAdmin
      ? '<div class="card">' +
          '<div class="page-title" style="font-size:15px;margin-bottom:10px">🛠 管理员补充</div>' +
          '<div style="font-size:13px;line-height:2.1">' +
            '· 想要"像网站一样"的在线系统和手机流量访问：看系统文件夹里的 <b>《开发文档.md》→「十八、部署 A」</b>，免费托管约 15 分钟搞定；<br>' +
            '· 想让多台设备共用一份数据：看 <b>《开发文档.md》→「十九、部署 B」</b>，推荐"Cloudflare Pages Functions + D1"方案（免绑卡、免费、不休眠，后端代码已内置在 functions 目录）；<br>' +
            '· 成员账号、班级、权限在「用户管理」维护；元件分类体系在「系统设置 → 分类管理」调整；<br>' +
            '· 想改代码、了解系统怎么实现的：看 <b>《开发文档.md》</b>；日常使用说明看 <b>README.md</b>。' +
          '</div>' +
        '</div>'
      : '') +
    '<div style="text-align:center;font-size:11.5px;color:var(--text-sub);padding:4px 0 20px">物料管家 · 智能控制协会</div>';
}

/* ==================== 2. 新成员首次登录提示 ==================== */

/* 账号第一次登录成功后弹出（见 main.js 的 doLogin / maybeShowWelcome） */
function showManualHint() {
  openModal('📖 欢迎加入物料管家', '' +
    '<div style="font-size:13.5px;line-height:2.1">' +
      '你的账号已就绪！建议先花 <b>3 分钟</b>看一下使用手册，马上学会查库存、领元件：<br>' +
      '<span style="color:var(--text-sub);font-size:12.5px">' +
        '· 日常主要用两个页面：「物料库」查库存（行尾"入 / 出"按钮直接借还）、「项目配料」做项目配齐物料<br>' +
        '· 请先点左下角 <b>「修改密码」</b> 改成自己的密码<br>' +
        '· 忘记密码找管理员重置；登记错了可以在「历史追溯」里撤回自己的记录' +
      '</span>' +
    '</div>',
    '<button class="btn" onclick="closeModal()">我先逛逛</button>' +
    '<button class="btn btn-outline" onclick="closeModal();changeMyPwdModal()">修改密码</button>' +
    '<button class="btn btn-primary" onclick="closeModal();gotoPage(\'manual\')">看使用手册</button>');
}
