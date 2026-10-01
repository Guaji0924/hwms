/* ============================================================
   main.js —— 应用入口（路由 / 侧边栏 / 顶栏 / 登录页 / 初始化）
   ------------------------------------------------------------
   启动流程：
   1. 打开本地数据库 -> 2. 保证有管理员账号 -> 3. 应用主题
   4. 加载自定义分类 -> 5. 恢复登录状态 -> 6. 渲染登录页或主界面
   ============================================================ */

/* 分类树全局变量（init 时从数据库读，读不到用 data.js 里的默认值） */
var CAT_TREE = CATEGORY_TREE;

/* 当前生效的管理员身份 */
function isAdminNow() {
  return !!(Auth.user && Auth.user.role === 'admin');
}

/* ==================== 1. 路由表 ==================== */
/* 每个页面：标题 / 副标题 / 渲染函数 */
var ROUTES = {
  dashboard: { title: '仪表盘',     sub: '库存与经费一览',   render: function () { return pageDashboard(); } },
  materials: { title: '物料库',     sub: '全部物料档案',     render: function () { return pageMaterials(); } },
  material:  { title: '物料详情',   sub: '档案与全链路记录', render: function (id) { return pageMaterialDetail(id); } },
  stockio:   { title: '出入库登记', sub: '入库 / 出库 / 库存调整', render: function () { return pageStockIO(); } },
  pmix:      { title: '项目配料',   sub: 'AI 配料 / BOM 导入 / 历史项目一键再领', render: function () { return pageProjectMix(); } },
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
      { key: 'pmix',      label: '项目配料', icon: 'robot' },
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
  if (name === 'materials') {                                           // 物料库：默认回到上次停留处
    if (force) { LastMatId = ''; }                                      // 强制回列表（详情页"返回"）：清详情记忆
    else if (ModalSnapshot && ModalSnapshot.page === 'materials') {     // 物料库有挂起的弹窗：先回列表把弹窗恢复回来
      target = '#/materials';
    }
    else if (LastMatId && PageCache['material/' + LastMatId]) {         // 最近在看详情且详情缓存还在
      target = '#/material/' + LastMatId;                               // 回到那个详情页
    }
  }
  if (location.hash === target && force) {                              // 已在该页且要求强制刷新
    routeTo();                                                          // 直接重渲染
    return;                                                             // 结束
  }
  location.hash = target;                                               // 改 hash 触发路由
}

/* 跳转到物料详情页 */
function gotoMaterial(id) {
  var mk = document.getElementById('modal-mask');
  var inVisibleModal = mk && mk.style.display !== 'none';                  // 点击发生在可见弹窗内（如物料库页打开的识别/BOM 弹窗）
  if (!inVisibleModal && (LastPath === 'materials' || LastPath.indexOf('material/') === 0)) {  // 物料库页面内（非弹窗）：路由跳详情页（原行为）
    LastMatId = id;                                                        // 记下详情 id：切走后再点"物料库"回到这里
    LastFrom = LastPath;                                                   // 记下来源页：详情页"返回"回到这里
    location.hash = '#/material/' + id;                                   // hash 带物料 id
  } else {
    openMaterialDetailModal(id);                                          // 其他页面/任何弹窗内：详情以卡片形式弹出，不跳转、不打断流程
  }
}

/* 详情页"返回"：回到进入详情前的页面（识别结果、统计报表、项目领料等原样恢复） */
function detailBack() {
  var from = LastFrom;                                                   // 来源页
  if (!from || from.indexOf('/') >= 0 || from === 'material') from = 'materials';  // 兜底：回物料库
  gotoPage(from, from === 'materials');                                 // 物料库回列表强制刷新；其他来源走页面缓存（弹窗也会自动恢复）
}

/* 刷新当前页（出入库/保存等写操作后调用）：全部页面缓存作废，当前页强制重渲染 */
function refreshCurrentPage() {
  PageCache = {};                                                       // 数据已变：缓存全部作废
  RouteForce = true;                                                    // 当前页强制重新渲染
  routeTo();
}

/* ==================== 3. 登录页 ==================== */

function renderLogin() {
  $('#app').innerHTML = '' +
    '<div class="login-page">' +
      '<div class="login-card">' +
        '<div class="login-left">' +
          '<div class="lg-ico" style="background:none"><img src="assets/logo.png" alt="协会会徽" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display=\'none\'" /></div>' +
          '<h1>物料管家</h1>' +
          '<div class="lg-sub">智能控制协会 · 电子物料管理系统</div>' +
          '<ul class="lg-feats">' +
            '<li><span class="fi">' + ICONS.database + '</span>数据存本机浏览器，断网照常使用</li>' +
            '<li><span class="fi">' + ICONS.refresh + '</span>多端实时同步，断网自动补传</li>' +
            '<li><span class="fi">' + ICONS.robot + '</span>AI 配料 / 拍照识别 / BOM 一键导入</li>' +
          '</ul>' +
        '</div>' +
        '<div class="login-right">' +
          '<div class="login-err" id="login-err"></div>' +
          '<div class="form-item"><label>用户名</label><input class="input" id="lg-user" placeholder="真实姓名" autocomplete="username" /></div>' +
          '<div class="form-item"><label>密码</label><input class="input" id="lg-pwd" type="password" placeholder="初始密码zknb" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')doLogin()" /></div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
            '<input type="checkbox" id="lg-remember" checked /><label for="lg-remember" style="margin:0;font-weight:400;cursor:pointer">记住我（7 天内免登录）</label>' +
          '</div>' +
          '<button class="btn btn-primary btn-lg btn-block" onclick="doLogin()">登 录</button>' +
          /* 同步状态提示条：新设备第一次打开时，成员账号要靠同步从服务器拉下来，
             这里必须让用户看得见进度，否则会以为"非得先登 admin 才能同步" */
          '<div class="login-sync" id="login-sync">正在检查多端同步状态…</div>' +
          '<div class="login-foot">数据保存在本机浏览器 · 断网可用 · 免费开源</div>' +
        '</div>' +
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
      '<b>安全提示：</b>默认管理员账号是 admin/202306ZNKZXH.2026admin-lgj，请立即修改密码！<br>' +
      '<b>新手引导：</b>左侧菜单有「使用手册」，新成员看完就能上手日常领料归还。<br><br>' +
      '<b>换电脑 / 多设备：</b>数据存在本机浏览器里。换设备前先在「数据管理」导出全库备份，' +
      '在新设备导入即可；局域网内把整个 hwms 文件夹放到一台常开的电脑（或树莓派）上，' +
      '其他同学手机浏览器输入那台电脑的地址（如 http://192.168.1.5:8080）也能用。' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal();changeMyPwdModal()">修改密码</button>' +
    '<button class="btn btn-primary" onclick="closeModal()">开始使用</button>');
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
        '<span class="su-actions">' +
          '<button class="su-btn" title="修改我的密码" onclick="changeMyPwdModal()">' + ICONS.settings + '<span>修改密码</span></button>' +
          '<button class="su-btn" title="退出当前账号，可换账号重新登录" onclick="logoutNow()">' + ICONS.out + '<span>退出登录</span></button>' +
        '</span>' +
    '</div>';
  /* 整体布局 */
  $('#app').innerHTML = '' +
    '<div class="shell">' +
      /* 侧栏 */
      '<aside class="sidebar" id="sidebar">' +
        '<div class="sidebar-logo"><span class="logo-ico" style="background:#fff;padding:2px;box-sizing:border-box"><img src="assets/logo.png" alt="会徽" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display=\'none\'" /></span><span class="logo-text">物料管家<span class="logo-sub">智能控制协会</span></span></div>' +
        '<nav class="sidebar-nav">' + navHtml + '</nav>' +
        userCard +
        /* 隐蔽角落：版本与开发者署名（低调小字，不影响使用） */
        '<div class="sidebar-dev" title="物料管家 · 智能控制协会">v1.0 · 由 李光进 开发</div>' +
      '</aside>' +
      /* 悬停顶栏展开图标时滑出的菜单小面板（浮层） */
      '<div class="sb-hover-panel" id="sb-hover-panel"></div>' +
      /* 小屏遮罩 */
      '<div class="drawer-mask" id="drawer-mask" onclick="toggleSidebar(false)"></div>' +
      /* 主区 */
      '<div class="main-area">' +
        '<header class="topbar">' +
          '<button class="icon-btn sb-top-btn" title="收起/展开侧边栏" onclick="toggleSbCollapse()"><span class="ico-fold">' + ICONS.fold + '</span><span class="ico-unfold">' + ICONS.unfold + '</span></button>' +
          '<button class="icon-btn hamburger" onclick="toggleSidebar()">' + ICONS.menu + '</button>' +
          '<span class="tb-brand"><span class="logo-ico"><img src="assets/logo.png" alt="会徽" onerror="this.style.display=\'none\'" /></span>物料管家</span>' +
          '<div class="tb-right">' +
            '<span id="net-state" class="net-state" title="网络状态"></span>' +
            '<button class="icon-btn bell-wrap" title="库存预警" onclick="gotoPage(\'alerts\')">' + ICONS.bell + '<span class="bell-badge" id="bell-badge" style="display:none">0</span></button>' +
            '<button class="icon-btn" id="theme-toggle-btn" title="切换主题" onclick="setTheme(\'' + (document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') + '\')">' + (document.documentElement.getAttribute('data-theme') === 'dark' ? ICONS.sun : ICONS.moon) + '</button>' +
          '</div>' +
        '</header>' +
        '<main class="page-wrap"><div id="page"></div></main>' +
      '</div>' +
    '</div>';
  try { if (localStorage.getItem('sbCollapsed') === '1') { var sh0 = document.querySelector('.shell'); if (sh0) { sh0.classList.add('sb-collapsed'); document.body.classList.add('sb-collapsed'); } } } catch (e) {} // 恢复侧栏收起状态（shell + body）
  /* 悬停顶栏展开图标：从图标下方滑出菜单小面板（浮层，仅收起态；不改状态、不展开侧栏、主内容不位移、无遮罩） */
  var hpEl = document.querySelector('#sb-hover-panel');
  if (hpEl) hpEl.innerHTML = navHtml;                                 /* 面板复用当前可见菜单 */
  var topBtnEl = document.querySelector('.sb-top-btn');
  if (topBtnEl && hpEl) {
    topBtnEl.addEventListener('mouseenter', function () {
      if (!document.body.classList.contains('sb-collapsed')) return;  /* 仅收起态 */
      var br = topBtnEl.getBoundingClientRect();
      hpEl.style.left = Math.round(br.left - 8) + 'px';               /* 图标下方 */
      hpEl.style.top = Math.round(br.bottom + 6) + 'px';
      hpEl.classList.add('show');
    });
    topBtnEl.addEventListener('mouseleave', function () {
      setTimeout(function () { if (!hpEl.matches(':hover')) hpEl.classList.remove('show'); }, 150);
    });
    hpEl.addEventListener('mouseleave', function () { hpEl.classList.remove('show'); });
    hpEl.addEventListener('click', function (e) { if (e.target.closest('.nav-item')) hpEl.classList.remove('show'); }); /* 点菜单后收起面板 */
  }
  updateBell();                                                                              // 更新预警角标
  if (typeof updateNetState === 'function') updateNetState();                                 // 更新网络状态指示（sync.js 加载后生效）
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

/* 电脑端侧边栏收起/展开（豆包样式：收窄为图标条；小屏抽屉不受影响，状态存 localStorage） */
function toggleSbCollapse() {
  var shell = document.querySelector('.shell');                                                  // 布局容器
  if (!shell) return;                                                                             // 没有
  var collapsed = !shell.classList.contains('sb-collapsed');                                      // 目标状态
  shell.classList.toggle('sb-collapsed', collapsed);                                              // 切换 class（shell）
  document.body.classList.toggle('sb-collapsed', collapsed);                                     // 同步 body class（弹窗遮罩挂在 body 下）
  try { localStorage.setItem('sbCollapsed', collapsed ? '1' : '0'); } catch (e) {}                // 记住状态
}

/* 退出登录 */
async function logoutNow() {
  var ok = await confirmBox('确定退出登录吗？');                                                          // 确认
  if (!ok) return;                                                                                        // 取消
  await Log.add('退出登录', Auth.user.username);                                                         // 日志
  PageCache = {}; LastPath = ''; ModalSnapshot = null; LastMatId = ''; LastFrom = '';                         // 换账号：清空页面缓存与弹窗挂起
  Auth.logout();                                                                                           // 清会话
  renderLogin();                                                                                            // 回登录页
}

/* ==================== 5. 路由执行 ==================== */

/* 页面 DOM 缓存：离开时把整个页面（输入到一半的表单、展开的内容、滚动位置）原样存起来，回来直接恢复；
   一旦发生写操作（refreshCurrentPage），所有缓存作废重新渲染，保证看到的是最新数据 */
var PageCache = {};
var LastPath = '';
var RouteForce = false;
var LastMatId = '';          // 最近看过的物料详情 id（侧边栏"物料库"回到上次停留处）
var LastFrom = '';             // 最近一次进入详情页的来源页（详情页"返回"回到这里）
var ModalSnapshot = null;    // 切页时挂起的弹窗快照 {html, page}

/* 解析当前 hash 并渲染对应页面 */
async function routeTo() {
  if (!Auth.user) { renderLogin(); return; }                                                     // 未登录直接回登录页
  var hash = location.hash || '#/dashboard';                                                      // 当前 hash
  var parts = hash.replace(/^#\//, '').split('/');                                                  // 拆：'material/mat-123' -> ['material','mat-123']
  var pageKey = parts[0] || 'dashboard';                                                             // 页面名
  var param = parts[1] || '';                                                                          // 参数（物料 id）
  var targetPath = param ? (pageKey + '/' + param) : pageKey;                                          // 完整缓存键
  var route = ROUTES[pageKey];                                                                          // 查路由表
  if (!route) { location.hash = '#/dashboard'; return; }                                                // 未知路由回首页
  /* 离开旧页：把它的完整 DOM 和滚动位置存进缓存 */
  if (LastPath && LastPath !== targetPath && $('#page').innerHTML) {
    PageCache[LastPath] = { html: $('#page').innerHTML, y: window.scrollY };
  }
  /* 切页：把当前"正在显示"的弹窗挂起（保留 DOM 原样隐藏），回到所属页面时恢复——输入内容不丢 */
  var curMask = $('#modal-mask');
  if (curMask && curMask.style.display !== 'none') {               /* 已挂起隐藏的弹窗不再重复挂起，避免覆盖原始位置 */
    ModalSnapshot = { dom: curMask, page: LastPath };
    curMask.style.display = 'none';                               /* 隐藏而非移除：输入值、事件绑定都保留 */
  }
  /* 权限检查 */
  if (pageKey === 'users' && !isAdminNow()) {                                                             // 用户管理仅管理员（预览成员视角时同样屏蔽）
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">' + ICONS.lock + '</div>此页面仅管理员可见</div>';
    LastPath = targetPath;
    return;
  }
  /* 更新侧栏选中态 */
  var navBtns = $$('.nav-item');                                                                          // 所有菜单按钮
  var activeKey = (pageKey === 'material') ? 'materials' : pageKey;                                          // 详情页高亮"物料库"
  for (var i = 0; i < navBtns.length; i++) {                                                                    // 遍历
    var on = navBtns[i].getAttribute('data-key') === activeKey;                                                 // 是否命中
    navBtns[i].classList.toggle('active', on);                                                                    // 切换样式
  }
  toggleSidebar(false);                                                                                             // 小屏自动收起抽屉
  /* 渲染页面：有缓存就原样恢复，否则重新渲染 */
  var cached = !RouteForce ? PageCache[targetPath] : null;
  try {
    if (cached) {
      $('#page').innerHTML = cached.html;                                                                                // 原样恢复 DOM
      if (cached.y) setTimeout(function () { window.scrollTo(0, cached.y); }, 30);                                       // 恢复滚动位置
      else window.scrollTo(0, 0);
    } else {
      delete PageCache[targetPath];
      window.scrollTo(0, 0);
      await route.render(param);                                                                                          // 执行渲染
      updateBell();                                                                                                         // 更新预警角标
      PageCache[targetPath] = { html: $('#page').innerHTML, y: 0 };                                                       // 渲染完存入缓存
    }
  } catch (err) {                                                                                                           // 出错
    console.error('页面渲染出错：', err);                                                                                     // 打印
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">' + ICONS.alert + '</div>页面出错了：' + escapeHtml(err.message) + '<br><button class="btn btn-outline" style="margin-top:10px" onclick="location.reload()">刷新页面</button></div>';  // 提示
  }
  if (typeof alignDataCols === 'function') setTimeout(alignDataCols, 0);
  var pgEl = $('#page');                                          /* 页面切换入场动效：重触发动画类 */
  if (pgEl) { pgEl.classList.remove('page-in'); void pgEl.offsetWidth; pgEl.classList.add('page-in'); }
  /* 回到弹窗所属页面：把挂起的弹窗恢复回来（输入内容原样保留） */
  if (ModalSnapshot && ModalSnapshot.page === targetPath) {
    var saved = ModalSnapshot;
    ModalSnapshot = null;
    if (saved.dom && saved.dom.style) {
      saved.dom.style.display = '';                               /* 显示回原弹窗：内容、滚动、事件全保留 */
    } else if (saved.html) {                                      /* 兼容旧字符串快照（如有） */
      document.body.insertAdjacentHTML('beforeend', saved.html);
      var m2 = $('#modal-mask');
      if (m2) m2.addEventListener('click', function (e) { if (e.target === m2) closeModal(); });
    }
  }
  LastPath = targetPath;
  RouteForce = false;
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
    /* 6. 启动多端同步引擎：恢复同步配置、注册"断网恢复/切回页面"即时同步、启动 8 秒定时同步 */
    if (typeof Sync !== 'undefined' && Sync.init) {                                                                                        // 同步引擎已加载
      try { await Sync.init(); }                                                                                                           // 启动（内部会按配置决定是否真正联网同步）
      catch (e) { console.warn('同步引擎启动失败，不影响本机使用', e); }                                                                      // 失败不阻断应用启动
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
