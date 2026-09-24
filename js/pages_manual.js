/* ============================================================
   pages_manual.js —— 使用手册（新手必看）
   ------------------------------------------------------------
   内容：
   1. pageManual()      手册页面（所有角色可见，左侧菜单"使用手册"进入）
   2. showManualHint()  新成员第一次登录的提示弹窗（doLogin 登录成功后触发）
   ============================================================ */

/* ==================== 1. 使用手册页面 ==================== */

function pageManual() {
  $('#page').innerHTML = '' +
    '<div class="page-head">' +
      '<div><div class="page-title">使用手册</div><div class="page-desc">第一次用？三分钟看完就能上手</div></div>' +
    '</div>' +

    /* 顶部欢迎卡：会徽 + 一句话介绍 */
    '<div class="card" style="display:flex;gap:16px;align-items:center">' +
      '<img src="assets/logo.png" alt="协会会徽" style="width:64px;height:64px;object-fit:contain;flex:none" />' +
      '<div style="font-size:13px;line-height:1.9">' +
        '<b>智能控制协会 · 物料管家</b><br>' +
        '协会的电子元件都登记在这里：查库存、借元件、还元件、查历史。<b>手机电脑都能用，断网也不影响登记</b>，联网自动同步。' +
      '</div>' +
    '</div>' +

    /* 快速上手四步 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">🚀 三分钟上手</div>' +
      '<div style="font-size:13px;line-height:2.1">' +
        '<b>第 1 步 · 改密码：</b>管理员给你开了账号，先点左下角 <b>"修改密码"</b> 改成自己的密码。<br>' +
        '<b>第 2 步 · 查库存：</b>左侧菜单点 <b>「物料库」</b>，搜索框输入元件名（比如 "0805 电阻"），能看到数量、型号、放在哪；点名称进详情页看每一笔来龙去脉。<br>' +
        '<b>第 3 步 · 领元件：</b>点 <b>「出入库登记」</b> → 选 <b>"出库"</b> → 填物料、数量、用途项目 → 提交，系统自动扣减库存。<br>' +
        '<b>第 4 步 · 还元件：</b>用不完的退回来 → 同一页面选 <b>"入库"</b>，备注写"退回"即可。' +
      '</div>' +
    '</div>' +

    /* 每个页面是干嘛的 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">📖 每个页面是干嘛的</div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th style="width:130px">页面</th><th>作用</th></tr></thead>' +
        '<tbody>' +
          '<tr><td><b>仪表盘</b></td><td>总览：物料种类、库存预警、本月出库、消耗排行、最近动态</td></tr>' +
          '<tr><td><b>物料库</b></td><td>查询和搜索全部元件，点开看详情、位置和实物照</td></tr>' +
          '<tr><td><b>出入库登记</b></td><td>入库（进货 / 退回）、出库（领用）、库存调整（盘盈盘亏）</td></tr>' +
          '<tr><td><b>智能配料</b></td><td>一句话说出需求（如"做一个循迹小车"），AI 自动列物料清单</td></tr>' +
          '<tr><td><b>库存预警</b></td><td>低于警戒线的元件在这里提醒，方便申请补货</td></tr>' +
          '<tr><td><b>统计报表</b></td><td>消耗排行、分类占比等统计图</td></tr>' +
          '<tr><td><b>历史追溯</b></td><td>每一笔出入库都可查、可筛选、可导出表格</td></tr>' +
          '<tr><td><b>数据管理</b></td><td>导出 Excel 备份（建议每月一次存协会网盘）</td></tr>' +
        '</tbody>' +
      '</table></div>' +
    '</div>' +

    /* 常见问题 */
    '<div class="card">' +
      '<div class="page-title" style="font-size:15px;margin-bottom:10px">❓ 常见问题</div>' +
      '<div style="font-size:13px;line-height:2.1">' +
        '<b>· 忘记密码？</b>找管理员在「用户管理」里重置。<br>' +
        '<b>· 手机上数据没更新？</b>联网状态下约 8 秒自动同步；着急就到「系统设置 → 多端同步」点"立即同步"。<br>' +
        '<b>· 断网了还能用吗？</b>能。照常查询和登记，数据先存手机本地，恢复网络后自动补传，不会丢。<br>' +
        '<b>· 找不到想要的元件？</b>先换个关键词搜；确实没有就联系管理员录入（带"已授权"标记的成员可自己新增）。<br>' +
        '<b>· 登记错了怎么办？</b>告诉管理员，可在「历史追溯」里<b>撤回</b>那一笔，库存自动退回，不用手工改。<br>' +
        '<b>· 能看到价格吗？</b>单价与经费只有管理员可见，普通成员看数量和种类就够了。' +
      '</div>' +
    '</div>' +

    /* 管理员补充（只有管理员看得到这张卡） */
    (Auth.can('users')
      ? '<div class="card">' +
          '<div class="page-title" style="font-size:15px;margin-bottom:10px">🛠 管理员补充</div>' +
          '<div style="font-size:13px;line-height:2.1">' +
            '· 想要"像网站一样"的在线系统和手机流量访问：看系统文件夹里的 <b>《云端部署指南.md》</b>，免费托管约 15 分钟搞定；<br>' +
            '· 成员账号、班级、权限在「用户管理」维护；元件分类体系在「系统设置 → 分类管理」调整；<br>' +
            '· 首次部署、导入示例数据、AI 接入等更多说明见 <b>README.md</b>。' +
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
        '· 日常主要用两个页面：「物料库」查、「出入库登记」借 / 还<br>' +
        '· 请先点左下角 <b>「修改密码」</b> 改成自己的密码<br>' +
        '· 忘记密码找管理员重置；登记错了管理员可以在历史里撤回' +
      '</span>' +
    '</div>',
    '<button class="btn" onclick="closeModal()">我先逛逛</button>' +
    '<button class="btn btn-primary" onclick="closeModal();gotoPage(\'manual\')">看使用手册</button>');
}
