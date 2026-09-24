/* ============================================================
   main.js —— 应用入口（路由 / 侧边栏 / 顶栏 / 登录页 / 初始化）
   ------------------------------------------------------------
   启动流程：
   1. 打开本地数据库 -> 2. 保证有管理员账号 -> 3. 应用主题
   4. 加载自定义分类 -> 5. 恢复登录状态 -> 6. 渲染登录页或主界面
   ============================================================ */

/* 分类树全局变量（init 时从数据库读，读不到用 data.js 里的默认值） */
var CAT_TREE = CATEGORY_TREE;

/* 视角预览状态：管理员可以临时切换到"普通成员视角"看界面效果（只影响显示，不改变真实权限） */
var ViewAs = { member: false };

/* 当前生效的管理员身份：真实管理员 且 没有在预览成员视角时才算 */
function isAdminNow() {
  return !!(Auth.user && Auth.user.role === 'admin' && !ViewAs.member);
}

/* ==================== 1. 路由表 ==================== */
/* 每个页面：标题 / 副标题 / 渲染函数 */
var ROUTES = {
  dashboard: { title: '仪表盘',     sub: '库存与经费一览',   render: function () { return pageDashboard(); } },
  materials: { title: '物料库',     sub: '全部物料档案',     render: function () { return pageMaterials(); } },
  material:  { title: '物料详情',   sub: '档案与全链路记录', render: function (id) { return pageMaterialDetail(id); } },
  stockio:   { title: '出入库登记', sub: '入库 / 出库 / 库存调整', render: function () { return pageStockIO(); } },
  ai:        { title: '智能配料',   sub: '一句话配齐物料',   render: function () { return pageAI(); } },
  alerts:    { title: '库存预警',   sub: '低于警戒线提醒',   render: function () { return pageAlerts(); } },
  stats:     { title: '统计报表',   sub: '消耗与经费',       render: function () { return pageStats(); } },
  history:   { title: '历史追溯',   sub: '全链路记录查询',   render: function () { return pageHistory(); } },
  data:      { title: '数据管理',   sub: '导入导出与备份',   render: function () { return pageData(); } },
  users:     { title: '用户管理',   sub: '成员与权限',       render: function () { return pageUsers(); } },
  settings:  { title: '系统设置',   sub: 'AI / 主题 / 分类',  render: function () { return pageSettings(); } },
  manual:    { title: '使用手册',   sub: '新手必看 · 三分钟上手', render: function () { return pageManual(); } }
};

/* 侧边栏菜单（group 分组标题 + items 菜单项；adminOnly 标记仅管理员可见） */
var MENUS = [
  { group: '总览',
    items: [{ key: 'dashboard', label: '仪表盘', icon: 'dashboard' }] },
  { group: '日常操作',
    items: [
      { key: 'materials', label: '物料库', icon: 'box' },
      { key: 'stockio',   label: '出入库登记', icon: 'swap' },
      { key: 'ai',        label: '智能配料', icon: 'ai' },
      { key: 'alerts',    label: '库存预警', icon: 'alert' },
      { key: 'manual',    label: '使用手册', icon: 'book' }
    ] },
  { group: '数据与统计',
    items: [
      { key: 'stats',   label: '统计报表', icon: 'chart' },
      { key: 'history', label: '历史追溯', icon: 'history' },
      { key: 'data',    label: '数据管理', icon: 'database' }
    ] },
  { group: '管理',
    items: [
      { key: 'users',    label: '用户管理', icon: 'users', adminOnly: true },
      { key: 'settings', label: '系统设置', icon: 'settings' }
    ] }
];

/* ==================== 2. 导航辅助函数 ==================== */

/* 跳转到某个页面：gotoPage('materials', true 强制刷新) */
function gotoPage(name, force) {
  var target = '#/' + name;                                            // 目标 hash
  if (location.hash === target && force) {                              // 已在该页且要求强制刷新
    routeTo();                                                          // 直接重渲染
    return;                                                             // 结束
  }
  location.hash = target;                                               // 改 hash 触发路由
}

/* 跳转到物料详情页 */
function gotoMaterial(id) {
  location.hash = '#/material/' + id;                                   // hash 带物料 id
}

/* 刷新当前页（出入库后调用） */
function refreshCurrentPage() {
  routeTo();                                                            // 重新执行当前路由
}

/* ==================== 3. 登录页 ==================== */

function renderLogin() {
  $('#app').innerHTML = '' +
    '<div class="login-page">' +
      '<div class="login-card">' +
        '<div class="lg-ico" style="background:none"><img src="assets/logo.png" alt="协会会徽" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display=\'none\'" /></div>' +
        '<h1>物料管家</h1>' +
        '<div class="lg-sub">智能控制协会 · 电子物料管理系统</div>' +
        /* 首次运行提示条 */
        '<div class="login-tip">首次使用请用默认管理员账号 <b>admin / admin123</b> 登录，登录后请尽快在"用户管理"修改密码</div>' +
        '<div class="login-err" id="login-err"></div>' +
        '<div class="form-item"><label>用户名</label><input class="input" id="lg-user" placeholder="admin" autocomplete="username" /></div>' +
        '<div class="form-item"><label>密码</label><input class="input" id="lg-pwd" type="password" placeholder="admin123" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')doLogin()" /></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
          '<input type="checkbox" id="lg-remember" checked /><label for="lg-remember" style="margin:0;font-weight:400;cursor:pointer">记住我（7 天内免登录）</label>' +
        '</div>' +
        '<button class="btn btn-primary btn-lg btn-block" onclick="doLogin()">登 录</button>' +
        '<div class="login-foot">数据保存在本机浏览器 · 断网可用 · 免费开源</div>' +
      '</div>' +
    '</div>';
  $('#lg-user').focus();                                                 // 用户名框自动聚焦
}

/* 执行登录 */
async function doLogin() {
  var name = $('#lg-user').value.trim();                                  // 用户名
  var pwd = $('#lg-pwd').value;                                            // 密码
  var remember = $('#lg-remember').checked;                                 // 记住我
  var errBox = $('#login-err');                                              // 错误提示框
  errBox.style.display = 'none';                                              // 先隐藏
  if (!name || !pwd) { errBox.textContent = '请输入用户名和密码'; errBox.style.display = 'block'; return; }  // 校验
  var result = await Auth.login(name, pwd, remember);                          // 调用登录
  if (!result.ok) { errBox.textContent = result.msg; errBox.style.display = 'block'; return; }  // 失败提示
  /* 登录成功 */
  var isFirstLogin = !!result.first;                                             // 是否该账号第一次登录（新注册成员标记）
  await State.refreshMaterials();                                             // 加载物料到内存
  renderShell();                                                               // 渲染主界面
  if (location.hash === '#/dashboard') {                                        // hash 已是仪表盘
    routeTo();                                                                  // 手动渲染（改相同 hash 不触发事件）
  } else {
    location.hash = '#/dashboard';                                              // 改 hash 会自动触发路由
  }
  toast('欢迎回来，' + Auth.user.username + '！', 'ok');                            // 欢迎
  await maybeShowWelcome();                                                       // 首次运行欢迎弹窗
  /* 新注册成员第一次登录：弹窗引导去看「使用手册」（管理员走上面的欢迎引导，不重复打扰） */
  if (isFirstLogin && Auth.user && Auth.user.role !== 'admin') {
    setTimeout(showManualHint, 800);                                                // 等主界面渲染稳定后再弹提示
  }
}

/* 首次登录的欢迎引导 */
async function maybeShowWelcome() {
  var shown = await DB.getSetting('welcomeShown', false);                          // 读标记
  if (shown) {                                                                     // 已看过
    /* 但仍提示库存预警 */
    var alerts = State.alertList();                                                   // 预警
    if (alerts.length > 0) toast('注意：有 ' + alerts.length + ' 种物料库存告急，记得补货', 'warn');  // 提醒
    return;                                                                            // 结束
  }
  await DB.setSetting('welcomeShown', true);                                             // 写标记
  openModal('欢迎使用物料管家 🎉', '' +
    '<div style="font-size:13.5px;line-height:1.9">' +
      '<b>三步开始使用：</b><br>' +
      '1、去「数据管理」载入示例数据体验全部功能（之后可一键清空）；<br>' +
      '2、或在「物料库」手动录入 / Excel 批量导入你们的真实元件；<br>' +
      '3、在「用户管理」添加协会成员账号，开始日常出入库登记。<br><br>' +
      '<b>安全提示：</b>默认管理员账号是 admin/admin123，请立即修改密码！<br>' +
      '<b>新手引导：</b>左侧菜单有「使用手册」，新成员看完就能上手日常领料归还。<br><br>' +
      '<b>换电脑 / 多设备：</b>数据存在本机浏览器里。换设备前先在「数据管理」导出全库备份，' +
      '在新设备导入即可；局域网内把整个 hwms 文件夹放到一台常开的电脑（或树莓派）上，' +
      '其他同学手机浏览器输入那台电脑的地址（如 http://192.168.1.5:8080）也能用。' +
    '</div>',
    '<button class="btn btn-primary" onclick="closeModal();toast(\'先去改密码吧！\',\'ok\')">开始使用</button>');
  /* 同时提示预警 */
  var alerts2 = State.alertList();                                                          // 预警
  if (alerts2.length > 0) toast('有 ' + alerts2.length + ' 种物料库存告急', 'warn');            // 提醒
}

/* ==================== 4. 主界面框架 ==================== */

function renderShell() {
  var u = Auth.user;                                                                     // 当前用户
  var isAdmin = isAdminNow();                                                             // 生效管理员（预览成员视角时按成员显示）
  /* 生成菜单 HTML */
  var navHtml = '';                                                                         // 菜单
  for (var g = 0; g < MENUS.length; g++) {                                                    // 遍历分组
    var group = MENUS[g];                                                                       // 当前组
    var items = group.items.filter(function (it) {                                               // 过滤权限
      return !it.adminOnly || isAdmin;                                                             // adminOnly 仅管理员
    });
    if (items.length === 0) continue;                                                              // 整组隐藏
    navHtml += '<div class="nav-group-title">' + group.group + '</div>';                            // 组标题
    for (var i = 0; i < items.length; i++) {                                                        // 遍历菜单项
      var it = items[i];                                                                              // 当前项
      navHtml += '<button class="nav-item" data-key="' + it.key + '" onclick="gotoPage(\'' + it.key + '\')">' + ICONS[it.icon] + '<span>' + it.label + '</span></button>';  // 菜单按钮
    }
  }
  /* 侧栏底部用户卡片：头像 + 姓名 + 一排带文字的小按钮（退出登录一眼可见） */
  var userCard = '' +
    '<div class="sidebar-user">' +
      '<div class="su-top">' +
        '<span class="user-avatar">' + escapeHtml(u.username.charAt(0).toUpperCase()) + '</span>' +
        '<span class="user-meta"><span class="u-name">' + escapeHtml(u.username) + '</span><span class="u-role">' + (isAdmin ? '管理员' : (u.canManage ? '成员 · 已授权' : '成员')) + '</span></span>' +
      '</div>' +
      '<div class="su-actions">' +
        '<button class="su-btn" title="修改我的密码" onclick="changeMyPwdModal()">' + ICONS.settings + '<span>修改密码</span></button>' +
        (Auth.user.role === 'admin'
          ? '<button class="su-btn" title="预览普通成员看到的界面" onclick="toggleViewAs()">' + ICONS.eye + '<span>' + (ViewAs.member ? '退出预览' : '成员视角') + '</span></button>'
          : '') +
        '<button class="su-btn" title="退出当前账号，可换账号重新登录" onclick="logoutNow()">' + ICONS.out + '<span>退出登录</span></button>' +
      '</div>' +
    '</div>';
  /* 整体布局 */
  $('#app').innerHTML = '' +
    '<div class="shell">' +
      /* 侧栏 */
      '<aside class="sidebar" id="sidebar">' +
        '<div class="sidebar-logo"><span class="logo-ico" style="background:#fff;padding:2px;box-sizing:border-box"><img src="assets/logo.png" alt="会徽" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display=\'none\'" /></span><span>物料管家<span class="logo-sub">智能控制协会</span></span></div>' +
        '<nav class="sidebar-nav">' + navHtml + '</nav>' +
        userCard +
        /* 隐蔽角落：版本与开发者署名（低调小字，不影响使用） */
        '<div class="sidebar-dev" title="物料管家 · 智能控制协会">v2.1 · 由 李光进 开发</div>' +
      '</aside>' +
      /* 小屏遮罩 */
      '<div class="drawer-mask" id="drawer-mask" onclick="toggleSidebar(false)"></div>' +
      /* 主区 */
      '<div class="main-area">' +
        '<header class="topbar">' +
          '<button class="icon-btn hamburger" onclick="toggleSidebar()">' + ICONS.menu + '</button>' +
          '<div><div class="tb-title" id="tb-title">仪表盘</div><div class="tb-sub" id="tb-sub"></div></div>' +
          '<div class="tb-right">' +
            '<span id="net-state" class="net-state" title="网络状态"></span>' +
            '<button class="icon-btn bell-wrap" title="库存预警" onclick="gotoPage(\'alerts\')">' + ICONS.bell + '<span class="bell-badge" id="bell-badge" style="display:none">0</span></button>' +
            '<button class="icon-btn" id="theme-toggle-btn" title="切换主题" onclick="setTheme(\'' + (document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') + '\')">' + (document.documentElement.getAttribute('data-theme') === 'dark' ? ICONS.sun : ICONS.moon) + '</button>' +
          '</div>' +
        '</header>' +
        /* 成员视角预览提示条 */
        (ViewAs.member
          ? '<div class="viewas-banner">' + ICONS.eye + '正在以<b>普通成员视角</b>预览界面（仅影响菜单与按钮显示）<button class="btn btn-sm btn-outline" onclick="toggleViewAs()">退出预览</button></div>'
          : '') +
        '<main class="page-wrap"><div id="page"></div></main>' +
      '</div>' +
    '</div>';
  updateBell();                                                                              // 更新预警角标
  if (typeof updateNetState === 'function') updateNetState();                                 // 更新网络状态指示（sync.js 加载后生效）
}

/* 切换"普通成员视角"预览（仅管理员可用） */
function toggleViewAs() {
  if (!Auth.user || Auth.user.role !== 'admin') return;                   // 只有真管理员能切换
  ViewAs.member = !ViewAs.member;                                          // 翻转预览状态
  renderShell();                                                            // 重渲染框架（菜单按成员权限过滤）
  routeTo();                                                                // 重渲染当前页
  toast(ViewAs.member ? '已进入成员视角预览，菜单已按普通成员显示' : '已退出预览，恢复管理员视角', 'ok');
}

/* 更新顶栏预警铃铛角标 */
function updateBell() {
  var badge = $('#bell-badge');                                                               // 角标
  if (!badge) return;                                                                          // 不存在（登录页）
  var count = State.alertList().length;                                                          // 预警数
  if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'flex'; }  // 显示
  else { badge.style.display = 'none'; }                                                          // 隐藏
}

/* 小屏侧栏抽屉开关 */
function toggleSidebar(force) {
  var sb = $('#sidebar');                                                                        // 侧栏
  var mask = $('#drawer-mask');                                                                    // 遮罩
  if (!sb) return;                                                                                  // 没有
  var isOpen = sb.classList.contains('open');                                                        // 当前状态
  var willOpen = (force === undefined) ? !isOpen : force;                                             // 目标状态
  sb.classList.toggle('open', willOpen);                                                              // 切换
  if (mask) mask.classList.toggle('show', willOpen);                                                     // 遮罩
}

/* 退出登录 */
async function logoutNow() {
  var ok = await confirmBox('确定退出登录吗？');                                                          // 确认
  if (!ok) return;                                                                                        // 取消
  await Log.add('退出登录', Auth.user.username);                                                         // 日志
  Auth.logout();                                                                                           // 清会话
  renderLogin();                                                                                            // 回登录页
}

/* ==================== 5. 路由执行 ==================== */

/* 解析当前 hash 并渲染对应页面 */
async function routeTo() {
  if (!Auth.user) { renderLogin(); return; }                                                     // 未登录直接回登录页
  var hash = location.hash || '#/dashboard';                                                      // 当前 hash
  var parts = hash.replace(/^#\//, '').split('/');                                                  // 拆：'material/mat-123' -> ['material','mat-123']
  var pageKey = parts[0] || 'dashboard';                                                             // 页面名
  var param = parts[1] || '';                                                                          // 参数（物料 id）
  var route = ROUTES[pageKey];                                                                          // 查路由表
  if (!route) { location.hash = '#/dashboard'; return; }                                                // 未知路由回首页
  /* 权限检查 */
  if (pageKey === 'users' && !isAdminNow()) {                                                             // 用户管理仅管理员（预览成员视角时同样屏蔽）
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">🔒</div>此页面仅管理员可见</div>';
    $('#tb-title').textContent = '用户管理';
    return;
  }
  /* 更新顶栏标题 */
  $('#tb-title').textContent = route.title;                                                             // 标题
  $('#tb-sub').textContent = route.sub || '';                                                            // 副标题
  /* 更新侧栏选中态 */
  var navBtns = $$('.nav-item');                                                                          // 所有菜单按钮
  var activeKey = (pageKey === 'material') ? 'materials' : pageKey;                                          // 详情页高亮"物料库"
  for (var i = 0; i < navBtns.length; i++) {                                                                    // 遍历
    var on = navBtns[i].getAttribute('data-key') === activeKey;                                                 // 是否命中
    navBtns[i].classList.toggle('active', on);                                                                    // 切换样式
  }
  toggleSidebar(false);                                                                                             // 小屏自动收起抽屉
  /* 渲染页面 */
  try {                                                                                                              // 容错
    window.scrollTo(0, 0);                                                                                             // 回到顶部
    await route.render(param);                                                                                          // 执行渲染
    updateBell();                                                                                                         // 顺带更新预警角标
  } catch (err) {                                                                                                           // 出错
    console.error('页面渲染出错：', err);                                                                                     // 打印
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">😵</div>页面出错了：' + escapeHtml(err.message) + '<br><button class="btn btn-outline" style="margin-top:10px" onclick="location.reload()">刷新页面</button></div>';  // 提示
  }
}

/* ==================== 6. 应用初始化 ==================== */

document.addEventListener('DOMContentLoaded', async function () {
  try {                                                                                                          // 整体容错
    /* 1. 打开本地数据库 */
    await DB.init();
    /* 1.5 修正历史遗留数据：把旧类型（out_use / out_consume / borrow / return）统一成新类型，
           并补齐缺失的时间戳；每次启动都跑一遍，防止同步下来的旧数据再漏网 */
    await migrateLegacyData();
    /* 2. 保证有默认管理员 */
    await Auth.ensureAdmin();
    /* 3. 应用保存过的主题 */
    var savedTheme = localStorage.getItem('hwms_theme');                                                             // 读偏好
    document.documentElement.setAttribute('data-theme', savedTheme || 'light');                                       // 应用
    /* 4. 加载自定义分类树（没改过就用默认） */
    var savedTree = await DB.getSetting('categoryTree', null);                                                          // 读设置
    if (savedTree && savedTree.length > 0) CAT_TREE = savedTree;                                                          // 有自定义就用
    /* 5. 恢复登录状态 */
    var user = await Auth.restore();                                                                                        // 尝试恢复
    if (user) {                                                                                                               // 已登录
      await State.refreshMaterials();                                                                                          // 预载物料
      renderShell();                                                                                                              // 主界面
      if (!location.hash) location.hash = '#/dashboard';                                                                            // 默认页
      routeTo();                                                                                                                    // 渲染
      var alerts = State.alertList();                                                                                                 // 预警
      if (alerts.length > 0) toast('注意：有 ' + alerts.length + ' 种物料库存告急，记得补货', 'warn');                                  // 提醒
    } else {                                                                                                                            // 未登录
      renderLogin();                                                                                                                     // 登录页
    }
  } catch (err) {                                                                                                                          // 初始化失败
    console.error(err);                                                                                                                      // 打印
    document.body.innerHTML = '<div style="padding:60px 20px;text-align:center;font-family:sans-serif">' +
      '<h2>初始化失败 :(</h2><p style="color:#666">' + escapeHtml(err.message) + '</p>' +
      '<p style="color:#999;font-size:13px">请确认浏览器允许使用本地存储（不要用隐身模式打开本系统）</p></div>';                            // 提示
  }
});

/* hash 变化时自动路由（点浏览器前进后退也生效） */
window.addEventListener('hashchange', function () {
  if (Auth.user) routeTo();                                                                                                                  // 登录了才路由
});
