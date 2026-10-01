/* ============================================================
   pages_admin.js —— 用户管理 / 系统设置
   ------------------------------------------------------------
   内容：
   1. pageUsers()     用户管理（管理员专属）
   2. pageSettings()  系统设置（多端同步 / AI 配置 / 主题 / 分类 / 关于）
   3. 同步设置函数    saveSyncConfig / testSyncServer / manualSyncNow
   ============================================================ */

/* ==================== 1. 用户管理 ==================== */

var DEFAULT_INIT_PWD = 'zknb';   /* 新成员初始密码 / 重置密码统一用这个，不用管理员输入；成员首次登录后自行修改 */

/* 用户列表的筛选状态：q=关键词（搜姓名或班级），cls=选定的班级 */
var UserFilter = { q: '', cls: '' };

async function pageUsers() {
  if (!Auth.user || !isAdminNow()) {                                     // 权限检查（管理员"成员视角预览"时同样看不到）
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">' + ICONS.lock + '</div>此页面仅管理员可见</div>';
    return;
  }
  var users = await DB.all('users');                                     // 全部用户
  var alive = [];                                                        // 有效用户（去掉已删除的墓碑）
  for (var k = 0; k < users.length; k++) { if (!users[k].deleted) alive.push(users[k]); }  // 过滤
  /* 按关键词（姓名/班级）与班级下拉筛选成员 */
  var q = (UserFilter.q || '').toLowerCase();                             // 关键词（小写化，忽略大小写）
  var shown = [];                                                        // 筛选后的列表
  for (var s = 0; s < alive.length; s++) {                                // 遍历筛选
    var su = alive[s];                                                    // 当前用户
    if (UserFilter.cls && (su.cls || '') !== UserFilter.cls) continue;    // 选了班级但该用户不匹配：跳过
    if (q && (su.username || '').toLowerCase().indexOf(q) < 0 && (su.cls || '').toLowerCase().indexOf(q) < 0) continue;  // 关键词要命中姓名或班级
    shown.push(su);                                                       // 通过筛选，保留
  }
  shown.sort(function (a, b) { return (b.lastLogin || 0) - (a.lastLogin || 0); });  // 最近使用在前
  /* 汇总所有出现过的班级（去重+排序），生成下拉选项 */
  var clsSet = {};                                                        // 班级去重集合
  for (var c = 0; c < alive.length; c++) { if (alive[c].cls) clsSet[alive[c].cls] = true; }  // 收集
  var clsOptions = '';                                                    // 下拉选项字符串
  var clsKeys = Object.keys(clsSet).sort();                                // 排序后逐个生成
  for (var c2 = 0; c2 < clsKeys.length; c2++) {
    clsOptions += '<option value="' + escapeHtml(clsKeys[c2]) + '"' + (UserFilter.cls === clsKeys[c2] ? ' selected' : '') + '>' + escapeHtml(clsKeys[c2]) + '</option>';
  }
  var rows = '';                                                          // 行
  for (var i = 0; i < shown.length; i++) {                                // 遍历
    var u = shown[i];                                                     // 当前用户
    var isSelf = u.id === Auth.user.id;                                    // 是不是自己
    var roleHtml = u.role === 'admin'
      ? '<span class="badge badge-purple">管理员</span>'                   // 管理员
      : '<span class="badge badge-blue">成员</span>';                      // 普通成员
    var manageHtml = u.role === 'admin'
      ? '<span style="color:var(--text-sub);font-size:12px">拥有全部权限</span>'  // 管理员不用开关
      : '<button class="btn btn-sm ' + (u.canManage ? 'btn-primary' : 'btn-outline') + '" onclick="toggleManage(\'' + u.id + '\')">' + (u.canManage ? '已授权' : '未授权') + '</button>';  // 临时管理权限开关
    rows += '<tr' + (isSelf ? ' style="background:var(--primary-light)"' : '') + '>' +  // 自己高亮
      '<td><div style="display:flex;align-items:center;gap:10px"><span class="user-avatar" style="width:30px;height:30px;font-size:13px;background:' + (u.role === 'admin' ? '#7c3aed' : 'var(--primary)') + '">' + escapeHtml(u.username.charAt(0).toUpperCase()) + '</span><b>' + escapeHtml(u.username) + (isSelf ? ' <span style="font-size:11px;color:var(--text-sub)">（我）</span>' : '') + '</b></div></td>' +
      '<td style="font-size:12.5px">' + (u.cls ? escapeHtml(u.cls) : '<span style="color:var(--text-sub)">未填</span>') + '</td>' +  // 班级列
      '<td>' + roleHtml + '</td>' +
      '<td>' + manageHtml + '</td>' +
      '<td style="font-size:12.5px">' + (u.lastLogin ? fmtDate(u.lastLogin) : '从未使用') + '</td>' +
      '<td>' + (u.active ? '<span class="badge badge-green">正常</span>' : '<span class="badge badge-red">已停用</span>') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-outline" onclick="editUserClass(\'' + u.id + '\')">改班级</button> ' +  // 新增：随时改班级
        '<button class="btn btn-sm btn-outline" onclick="resetUserPwd(\'' + u.id + '\')">重置密码</button> ' +
        (u.role === 'member' && u.active
          ? '<button class="btn btn-sm btn-outline" onclick="toggleRole(\'' + u.id + '\')">设为管理员</button> ' : '') +
        (u.role === 'admin' && !isSelf
          ? '<button class="btn btn-sm btn-outline" onclick="toggleRole(\'' + u.id + '\')">降为成员</button> ' : '') +
        (!isSelf ? (u.active
          ? '<button class="btn btn-sm btn-outline" onclick="toggleUserActive(\'' + u.id + '\')">停用</button> '
          : '<button class="btn btn-sm btn-outline" onclick="toggleUserActive(\'' + u.id + '\')">启用</button> ') +
          '<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="delUser(\'' + u.id + '\')">删除</button>' : '') +
      '</td>' +
      '</tr>';
  }
  $('#page').innerHTML =
    '<div class="page-head">' +
      '<div><div class="page-title">用户管理</div><div class="page-desc">管理员可以添加成员、临时授予物料管理权限</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        /* 修复按钮：早期版本的改角色/改权限没盖同步时间戳，改动只留在本机没上传，
           手机上登同一账号还是旧角色。点它可"以本机为准"重新上传全部账号。 */
        '<button class="btn btn-outline" onclick="repairUserSync()">' + ICONS.refresh + '修复账号同步</button>' +
        '<button class="btn btn-primary" onclick="addUserModal()">' + ICONS.plus + '添加成员</button>' +
      '</div>' +
    '</div>' +
    /* 权限说明卡 */
    '<div class="card" style="padding:14px 18px">' +
      '<div style="display:flex;gap:26px;flex-wrap:wrap;font-size:12.5px">' +
        '<div><span class="badge badge-purple">管理员</span> 全部权限：管理物料 / 用户 / 设置 / 数据</div>' +
        '<div><span class="badge badge-blue">成员</span> 可查询、出入库、智能配料、导出</div>' +
        '<div><span class="badge badge-green">成员+已授权</span> 额外可编辑物料档案与导入</div>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      /* 查找筛选栏：关键词输入（防抖 300ms）+ 班级下拉 */
      '<div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--line)">' +
        '<input class="input" style="width:220px" placeholder="搜姓名或班级…" value="' + escapeHtml(UserFilter.q || '') + '" oninput="UserFilter.q=this.value;clearTimeout(window._ufT);window._ufT=setTimeout(pageUsers,300)" />' +
        '<select class="select" style="width:150px" onchange="UserFilter.cls=this.value;pageUsers()">' +
          '<option value="">全部班级</option>' + clsOptions +
        '</select>' +
        ((UserFilter.q || UserFilter.cls) ? '<button class="btn btn-sm btn-outline" onclick="UserFilter.q=\'\';UserFilter.cls=\'\';pageUsers()">清除筛选</button>' : '') +
      '</div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th>用户</th><th>班级</th><th>角色</th><th>临时管理权限</th><th>最近使用</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + (shown.length === 0
          ? '<tr><td colspan="7"><div class="empty">没有找到匹配的成员，换个关键词试试</div></td></tr>'  // 筛选后为空的提示（共 7 列）
          : rows) + '</tbody>' +
      '</table></div>' +
    '</div>';
}

/* 修复账号同步：把本机当前的账号信息（角色 / 密码 / 班级 / 启用状态）重新盖上
   "刚刚修改"的时间戳，然后立刻上传到服务器。
   为什么需要它：早期版本的"改角色 / 改权限"忘记盖时间戳，改动只留在本机、
   没上传，于是手机上登同一个账号还是旧角色（显示是成员）。点一次这个按钮，
   以本机显示的信息为准重新覆盖服务器，其他设备随后会自动同步成一致。 */
async function repairUserSync() {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }   // 权限
  var ok = await confirmBox('将以【本机当前显示的账号信息】为准，重新上传到服务器。\n\n' +
    '请先确认本机用户列表里的角色、班级、启用状态都是正确的；\n' +
    '上传后其他设备会自动同步成一样的。\n\n确定继续吗？');                                  // 确认（避免在错误的那台设备上误点）
  if (!ok) return;                                                                        // 取消
  var me = (Auth.user || {}).id;                                                            // 当前登录账号的 id（不能被合并掉，否则把自己踢下线）

  /* 第一步：先把重复账号合并掉。
     早期版本每台设备第一次打开都会各自自动生成一个随机 id 的同名 admin，
     同步之后这些同名账号会汇总到服务器上，用户列表里就会堆出好几个 admin，
     而且它们既不是"删除"状态、内容又互相覆盖，怎么改都清不干净。
     规则：同名账号只保留"创建时间最早"的那一个（也就是协会真正在用的原始账号），
     其余的打墓碑删掉 —— 打墓碑才能把"删除"这个动作同步到其他设备。 */
  var all = await DB.all('users');                                                          // 全部账号（含墓碑）
  var keptByName = {};                                                                       // 每个用户名已保留的那一条
  for (var k = 0; k < all.length; k++) {                                                      // 逐个账号
    var cu = all[k];                                                                          // 当前账号
    if (cu.deleted) continue;                                                                  // 墓碑跳过
    var name = cu.username;                                                                     // 用户名
    if (!keptByName[name]) { keptByName[name] = cu; continue; }                                  // 这个名字第一次出现：先留着
    var kept = keptByName[name];                                                                // 已保留的那条
    var drop = ((cu.createdAt || 0) < (kept.createdAt || 0)) ? kept : cu;                        // 创建更晚的那个算重复
    var win = (drop === kept) ? cu : kept;                                                       // 另一个是要保留的
    if (drop.id === me) { var tmp = drop; drop = win; win = tmp; }                                // 要删的正好是自己 → 换一下，保住当前登录账号
    await softDelete('users', drop.id);                                                          // 给重复的那条打墓碑
    keptByName[name] = win;                                                                      // 更新"已保留"
  }

  /* 第二步：以本机为准，把所有有效账号重新盖时间戳上传 */
  var users = await DB.all('users');                                                         // 重新读一遍（合并结果已生效）
  var n = 0;                                                                                // 实际上传数量
  for (var i = 0; i < users.length; i++) {                                                   // 逐个账号
    if (users[i].deleted) continue;                                                           // 墓碑跳过
    stampSync(users[i]);                                                                       // 盖上最新时间戳 → 这次上传一定赢过服务器上的旧记录
    await DB.put('users', users[i]);                                                            // 写回本机
    n++;                                                                                         // 计数
  }
  await Log.add('修复账号同步', '重新上传 ' + n + ' 个账号');                                     // 日志
  toast('已重新上传 ' + n + ' 个账号，正在同步…', 'ok');                                           // 提示
  if (typeof Sync !== 'undefined' && Sync.syncNow) {                                              // 立刻推一轮
    try {
      var r = await Sync.syncNow();                                                                // 执行同步
      if (!r.busy) toast('同步完成：上传 ' + r.pushed + ' 条，下载 ' + r.pulled + ' 条', 'ok');      // 结果
    } catch (e) {
      toast('上传失败：' + e.message, 'err');                                                       // 失败提示
    }
  }
  pageUsers();                                                                                        // 刷新列表
}

/* 添加成员弹窗 */
function addUserModal() {
  openModal('添加成员', '' +
    '<div class="form-item"><label>用户名 <span class="req">*</span></label><input class="input" id="au-name" maxlength="20" placeholder="建议用真实姓名或学号" /></div>' +
    '<div class="form-hint">初始密码统一为 <b>zknb</b>，成员首次登录后请自行修改，无需管理员设置</div>' +
    '<div class="form-item"><label>班级（选填）</label><input class="input" id="au-class" maxlength="30" placeholder="例如：电气2401" /></div>' +
    '<div class="form-hint">新成员默认为普通成员（可查询/出入库/导出），需要更多权限再点"临时管理权限"授权</div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="addUserSubmit()">创建</button>');
}

/* 提交添加成员 */
async function addUserSubmit() {
  var name = $('#au-name').value.trim();                                   // 用户名
  var pwd = DEFAULT_INIT_PWD;                                              // 初始密码统一 zknb
  var cls = $('#au-class') ? $('#au-class').value.trim() : '';              // 班级（选填）
  if (!name) { toast('请填写用户名', 'err'); return; }                       // 校验
  var users = await DB.all('users');                                        // 查重
  for (var i = 0; i < users.length; i++) {                                   // 遍历
    if (!users[i].deleted && users[i].username === name) { toast('该用户名已存在', 'err'); return; }  // 重名（已删除的墓碑不拦截，可重新添加同名）
  }
  var salt = uid('salt');                                                    // 盐
  var hash = await hashPassword(pwd, salt);                                   // 哈希
  var newUser = {                                                             // 新账号对象
    id: uid('user'), username: name, passwordHash: hash, salt: salt,           // 账号
    role: 'member', canManage: false, active: true, pwdChanged: false,           // 默认普通成员，初始密码未改
    cls: cls,                                                                    // 班级（可为空）
    createdAt: Date.now(), lastLogin: null
  };
  stampSync(newUser);                                                          // 盖同步时间戳（否则新成员账号不会同步到其他设备）
  await DB.put('users', newUser);                                              // 写库
  await Log.add('添加成员', name);                                             // 日志
  closeModal();                                                                 // 关弹窗
  toast('成员已创建', 'ok');                                                      // 提示
  pageUsers();                                                                   // 刷新
}

/* 修改成员班级（管理员点击"改班级"按钮弹出） */
async function editUserClass(userId) {
  if (!isAdminNow()) { toast('只有管理员可以修改班级', 'err'); return; }       // 权限检查
  var target = await DB.get('users', userId);                                  // 找到目标成员
  if (!target) { toast('成员不存在', 'err'); return; }                          // 不存在提示
  openModal('修改班级 · ' + target.username, '' +                                // 弹窗标题带成员名
    '<div class="form-item"><label>班级</label><input class="input" id="uc-cls" maxlength="30" value="' + escapeHtml(target.cls || '') + '" placeholder="例如：电气2401，留空表示未填" /></div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="saveUserClass(\'' + userId + '\')">保存</button>');
  setTimeout(function () { var el = $('#uc-cls'); if (el) el.focus(); }, 60);     // 弹窗渲染后自动聚焦
}

/* 保存班级修改 */
async function saveUserClass(userId) {
  var target = await DB.get('users', userId);                                  // 目标成员
  if (!target) { toast('成员不存在', 'err'); return; }                          // 不存在提示
  var v = $('#uc-cls').value.trim();                                            // 新班级（可留空）
  target.cls = v;                                                               // 写入
  stampSync(target);                                                            // 盖时间戳（同步到其他设备）
  await DB.put('users', target);                                                // 保存
  await Log.add('修改班级', target.username + ' → ' + (v || '（已清空）'));      // 写日志
  closeModal();                                                                 // 关弹窗
  toast('班级已更新', 'ok');                                                     // 提示
  pageUsers();                                                                  // 刷新列表
}

/* 切换临时管理权限 */
async function toggleManage(userId) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }  // 权限
  var users = await DB.all('users');                                                  // 全部
  for (var i = 0; i < users.length; i++) {                                             // 遍历
    if (users[i].id === userId) {                                                       // 命中
      users[i].canManage = !users[i].canManage;                                          // 翻转
      stampSync(users[i]);                                                                // 盖同步时间戳（漏了它，这次改动就不会上传到其他设备）
      await DB.put('users', users[i]);                                                    // 写库
      await Log.add('修改权限', users[i].username + (users[i].canManage ? ' 获得管理权限' : ' 管理权限已收回'));  // 日志
      toast(users[i].username + (users[i].canManage ? ' 已获得物料管理权限' : ' 的管理权限已收回'), 'ok');  // 提示
      pageUsers();                                                                          // 刷新
      return;                                                                                 // 结束
    }
  }
}

/* 角色切换（成员<->管理员） */
async function toggleRole(userId) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }    // 权限
  var users = await DB.all('users');                                                        // 全部
  var target = null;                                                                         // 目标
  for (var i = 0; i < users.length; i++) { if (users[i].id === userId) { target = users[i]; break; } }  // 查找
  if (!target) return;                                                                        // 没有
  if (target.role === 'admin') {                                                               // 管理员降为成员
    var admins = 0;                                                                             // 管理员计数
    for (var a = 0; a < users.length; a++) { if (users[a].role === 'admin' && users[a].active) admins++; }  // 数
    if (admins <= 1) { toast('至少要保留一个管理员', 'err'); return; }                            // 不能全降
    var ok1 = await confirmBox('确定把 ' + target.username + ' 降为普通成员吗？');              // 确认
    if (!ok1) return;                                                                            // 取消
    target.role = 'member';                                                                       // 降级
  } else {                                                                                        // 成员升级
    var ok2 = await confirmBox('确定把 ' + target.username + ' 提升为管理员吗？（管理员拥有全部权限）');  // 确认
    if (!ok2) return;                                                                              // 取消
    target.role = 'admin';                                                                          // 升级
  }
  stampSync(target);                                                                                  // 盖同步时间戳（漏了它，角色改动就不会同步到其他设备）
  await DB.put('users', target);                                                                     // 写库
  await Log.add('修改角色', target.username + ' 角色改为' + (target.role === 'admin' ? '管理员' : '成员'));  // 日志
  toast('角色已更新', 'ok');                                                                          // 提示
  pageUsers();                                                                                        // 刷新
}

/* 停用 / 启用账号 */
async function toggleUserActive(userId) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }      // 权限
  var users = await DB.all('users');                                                         // 全部
  for (var i = 0; i < users.length; i++) {                                                    // 遍历
    if (users[i].id === userId) {                                                              // 命中
      if (users[i].role === 'admin' && users[i].active) {                                        // 是管理员要停用
        var admins = 0;                                                                            // 数量
        for (var a = 0; a < users.length; a++) { if (users[a].role === 'admin' && users[a].active) admins++; }  // 数
        if (admins <= 1) { toast('至少要保留一个启用的管理员', 'err'); return; }                     // 不许
      }
      users[i].active = !users[i].active;                                                           // 翻转状态
      stampSync(users[i]);                                                                            // 盖同步时间戳（漏了它，启用/停用不会同步到其他设备）
      await DB.put('users', users[i]);                                                               // 写库
      await Log.add(users[i].active ? '启用账号' : '停用账号', users[i].username);                     // 日志
      toast('已' + (users[i].active ? '启用' : '停用') + ' ' + users[i].username, 'ok');               // 提示
      pageUsers();                                                                                    // 刷新
      return;                                                                                          // 结束
    }
  }
}

/* 删除用户 */
async function delUser(userId) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }        // 权限
  if (userId === Auth.user.id) { toast('不能删除自己', 'err'); return; }                       // 自删
  var users = await DB.all('users');                                                            // 全部
  var target = null;                                                                              // 目标
  for (var i = 0; i < users.length; i++) { if (users[i].id === userId) { target = users[i]; break; } }  // 找
  if (!target) return;                                                                              // 没有
  var ok = await confirmBox('确定删除用户「' + target.username + '」吗？\n（历史记录里的操作人名字仍会保留，其他设备会同步删除）');  // 确认
  if (!ok) return;                                                                                    // 取消
  await softDelete('users', userId);                                                                    // 软删除（打墓碑标记，同步时其他设备也会删掉）
  await Log.add('删除用户', target.username);                                                            // 日志
  toast('用户已删除', 'ok');                                                                              // 提示
  pageUsers();                                                                                            // 刷新
}

/* 管理员重置密码 */
function resetUserPwd(userId) {
  openModal('重置密码', '' +
    '<div style="padding:10px 4px;line-height:1.9">将把该成员的密码重置为初始密码 <b>zknb</b>，重置后请提醒本人尽快登录修改。</div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="resetUserPwdSubmit(\'' + userId + '\')">重置为 zknb</button>');
}

async function resetUserPwdSubmit(userId) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }  // 权限
  var pwd = DEFAULT_INIT_PWD;                                                             // 统一重置为初始密码 zknb
  var users = await DB.all('users');                                                        // 全部
  for (var i = 0; i < users.length; i++) {                                                   // 遍历
    if (users[i].id === userId) {                                                              // 命中
      users[i].salt = uid('salt');                                                               // 换新盐
      users[i].passwordHash = await hashPassword(pwd, users[i].salt);                              // 新哈希
      stampSync(users[i]);                                                                          // 盖同步时间戳（漏了它，重置后的密码不会同步到其他设备）
      await DB.put('users', users[i]);                                                             // 写库
      await Log.add('重置密码', users[i].username);                                                  // 日志
      closeModal();                                                                                  // 关
      toast(users[i].username + ' 的密码已重置', 'ok');                                              // 提示
      return;                                                                                        // 结束
    }
  }
}

/* ==================== 2. 系统设置 ==================== */

async function pageSettings() {
  var aiData = await getAIConfigList();                                // AI 配置列表（支持多个）
  AIEdit = {                                                           // 编辑镜像
    enabled: aiData.enabled,                                          // 总开关
    active: aiData.active,                                            // 默认配置 id
    list: aiData.list.map(function (x) { return Object.assign({ _open: false }, x); })  // 深拷贝，已有配置默认折叠
  };
  var syncCfg = await DB.getSetting('syncConfig', {});                                                     // 本机保存的同步配置（从没配过是空对象）
  var syncOn = syncCfg.enabledSet ? !!syncCfg.enabled : !!SYNC_DEFAULT.enabled;                             // 实际开关：成员定过用他的，否则跟随协会默认
  var syncEffUrl = syncCfg.url || SYNC_DEFAULT.url || syncOwnOrigin();                                      // 实际使用的服务器地址（留空则自动取）
  var theme = localStorage.getItem('hwms_theme') || 'light';                                   // 主题
  /* 分类管理表格 */
  var catRows = '';                                                                              // 行
  for (var i = 0; i < CAT_TREE.length; i++) {                                                     // 遍历
    catRows += '<tr>' +
      '<td><input class="input" style="padding:6px 10px" value="' + escapeHtml(CAT_TREE[i].name) + '" onchange="CatEdit[' + i + '].name=this.value" /></td>' +
      '<td><input class="input" style="padding:6px 10px" value="' + escapeHtml(CAT_TREE[i].subs.join('，')) + '" onchange="CatEdit[' + i + '].subs=this.value" /></td>' +
      '<td><button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="CatEdit[' + i + ']._del=true;this.closest(\'tr\').style.opacity=0.4">删除</button></td>' +
      '</tr>';
  }
  $('#page').innerHTML =
    '<div class="page-head"><div><div class="page-title">系统设置</div><div class="page-desc">多端同步 / AI 接入 / 主题 / 分类管理</div></div></div>' +
    /* AI 配置（支持多个，由 aiEditHtml() 渲染编辑区） */
    aiEditHtml() +
    /* 多端同步（默认已按协会统一设置，成员通常不用改；想改也能自己改） */
    '<div class="card">' +
      '<div class="card-title">' + ICONS.cloud + '多端同步（手机 / 平板 / 电脑共用一份数据）</div>' +
      '<div class="ai-quote" style="margin-bottom:10px"><b>已按协会统一设置好，通常不用动</b><br>' +
      '系统默认就开启同步，服务器地址自动取<b>网页自己的地址</b>，所以成员打开网页就自动连上，不需要填任何东西。' +
      '只有想单独用别的服务器时，才在下面改。部署后端见 <b>开发文档.md → 十九、部署 B</b>。</div>' +
      '<div class="form-item"><label><input type="checkbox" id="sync-enabled"' + (syncOn ? ' checked' : '') + ' style="margin-right:6px" />启用多端同步</label>' +
      '<div class="form-hint">启用后：有网时自动与服务器同步，多人多设备实时共用同一份数据；断网时照常查询、登记，恢复网络后自动把离线操作补传上去。就算服务器重启丢了数据，各设备也会自动"补种"回去，不用担心。</div></div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>同步服务器地址（留空 = 自动用协会默认）</label><input class="input" id="sync-url" value="' + escapeHtml(syncCfg.url || '') + '" placeholder="' + (syncEffUrl ? '留空 = 自动使用 ' + escapeHtml(syncEffUrl) : '如 https://hwms.pages.dev') + '" /></div>' +
        '<div class="form-item"><label>本机设备名（方便认账，随便起）</label><input class="input" id="sync-device" value="' + escapeHtml(syncCfg.device || '') + '" placeholder="如 张三-手机" /></div>' +
      '</div>' +
      '<div class="form-hint">协会统一默认值写在 <code>js/sync.js</code> 顶部的 <code>SYNC_DEFAULT</code> 里（地址、是否默认开启）。改了那一处重新部署，全体成员就都跟着变；成员在这里填过就以自己填的为准。</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
        '<button class="btn btn-primary" onclick="saveSyncConfig()">保存同步设置</button>' +
        '<button class="btn btn-outline" onclick="testSyncServer()">测试服务器连接</button>' +
        '<button class="btn btn-outline" onclick="manualSyncNow()">立即同步一次</button>' +
      '</div>' +
      '<div class="ai-quote" id="sync-test-result" style="display:none"></div>' +
      /* 把"本机实际连的服务器地址"显示出来：多设备对不上号时，一眼就能看出哪台连的是哪个后端 */
      '<div style="font-size:12.5px;color:var(--text-sub);margin-top:8px">上次同步：<span id="sync-last-text">' + (syncCfg.lastSync ? fmtDate(syncCfg.lastSync) : '从未同步') + '</span><br>' +
      '本机实际使用的服务器：<b>' + escapeHtml(syncEffUrl || '（还没确定，无法同步）') + '</b></div>' +
    '</div>' +
    /* 主题 */
    '<div class="card">' +
      '<div class="card-title">' + ICONS.moon + '界面主题</div>' +
      '<div class="radio-group">' +
        '<span class="radio-chip' + (theme === 'light' ? ' on' : '') + '" onclick="setTheme(\'light\')">☀️ 浅色模式</span>' +
        '<span class="radio-chip' + (theme === 'dark' ? ' on' : '') + '" onclick="setTheme(\'dark\')">🌙 深色模式</span>' +
      '</div>' +
    '</div>' +
    /* 分类管理涉及系统设置：仅管理员可见（普通成员不显示这一整块） */
    (isAdminNow() ?
    '<div class="card">' +
      '<div class="card-title">分类管理（母分类 + 子分类）</div>' +
      '<div class="form-hint" style="margin-bottom:10px">子分类用中文逗号或顿号分隔。删除分类不影响已有物料，只影响下拉选项。</div>' +
      '<div class="table-wrap"><table class="tbl">' +
        '<thead><tr><th style="width:180px">母分类</th><th>子分类</th><th style="width:80px"></th></tr></thead>' +
        '<tbody id="cat-rows">' + catRows + '</tbody>' +
      '</table></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn btn-outline" onclick="catAddRow()">＋ 添加一行</button>' +
        '<button class="btn btn-primary" onclick="saveCatTree()">保存分类</button>' +
      '</div>' +
    '</div>' : '') +
    /* 关于 */
    '<div class="card">' +
      '<div class="card-title">关于本系统</div>' +
      '<div style="font-size:13px;line-height:2">' +
        '物料管家 v1.0 · 智能控制协会物料管理系统<br>' +
        '· 单机可用：数据保存在浏览器 IndexedDB 里，断网照样查、照样登记，免费无广告<br>' +
        '· 功能一览：物料档案与模糊搜索、出入库与库存调整、库存预警（警戒线自动微调）、项目配料（AI 配料 / 嘉立创 BOM 导入 / 识别更正 / 历史项目一键再领）、拍照识别、统计报表、历史追溯与撤回、数据导入导出与全库备份、回收站、用户与权限管理<br>' +
        '· 多端同步：网页由 Cloudflare Pages 托管；想共用一份数据，用它内置的 Pages Functions + D1 同步后端，或常开电脑跑 server 目录，断网自动补传（部署步骤见"开发文档.md"第二部分）<br>' +
        '· 可安装：浏览器菜单里"安装应用 / 添加到主屏幕"，之后像 App 一样从桌面图标打开<br>' +
        '· 转发给别人：把整个系统文件夹拷给对方（U 盘或压缩包都行），对方打开也能单机用，也可加入同步<br>' +
        '· 数据安全：导出备份在"数据管理"页，建议每月导出一份存档；删除的物料先进回收站，误删可恢复<br>' +
        '· 代码全开源带中文注释，会一点 HTML/JS 的同学就能自行修改样式和逻辑；实现细节与部署见"开发文档.md"' +
      '</div>' +
    '</div>';
  /* 分类编辑镜像数据（表格输入直接改这里，保存时统一写库） */
  CatEdit = CAT_TREE.map(function (c) { return { name: c.name, subs: c.subs.join('，'), _del: false }; });  // 深拷贝
}

/* 分类编辑的镜像数组 */
var CatEdit = [];

/* 添加一行分类 */
function catAddRow() {
  CatEdit.push({ name: '新分类', subs: '子分类1，子分类2', _del: false });    // 加数据
  var tr = document.createElement('tr');                                     // 加行
  var idx = CatEdit.length - 1;                                                // 行号
  tr.innerHTML = '' +
    '<td><input class="input" style="padding:6px 10px" value="新分类" onchange="CatEdit[' + idx + '].name=this.value" /></td>' +
    '<td><input class="input" style="padding:6px 10px" value="子分类1，子分类2" onchange="CatEdit[' + idx + '].subs=this.value" /></td>' +
    '<td><button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="CatEdit[' + idx + ']._del=true;this.closest(\'tr\').style.opacity=0.4">删除</button></td>';
  $('#cat-rows').appendChild(tr);                                              // 插入
}

/* 保存分类树 */
async function saveCatTree() {
  if (!Auth.can('manage')) { toast('没有权限', 'err'); return; }                  // 权限
  var tree = [];                                                                   // 新树
  for (var i = 0; i < CatEdit.length; i++) {                                        // 遍历镜像
    if (CatEdit[i]._del) continue;                                                  // 删除标记跳过
    var name = String(CatEdit[i].name || '').trim();                                 // 名称
    if (!name) continue;                                                              // 空名跳过
    var subs = String(CatEdit[i].subs || '')                                           // 子分类串
      .split(/[，,、]/)                                                                  // 中文英文分隔符都支持
      .map(function (s) { return s.trim(); })                                            // 去空格
      .filter(function (s) { return s.length > 0; });                                     // 去空项
    tree.push({ name: name, subs: subs });                                                 // 装入
  }
  CAT_TREE = tree;                                                                          // 更新全局
  await DB.setSetting('categoryTree', tree);                                                  // 写库
  await Log.add('修改分类', '共 ' + tree.length + ' 个母分类');                                 // 日志
  toast('分类已保存', 'ok');                                                                    // 提示
}

/* AI 配置编辑镜像（页面渲染时填充；输入框直接改这里，保存统一写库） */
var AIEdit = { enabled: false, active: '', list: [] };

/* 用途选项的中文映射 */
var AI_USES_MAP = { vision: '图片识别', explain: '用途说明', plan: '智能配料', pick: '项目领料' };

/* 用途勾选框（可多选） */
function aiUseCb(c, i, key, label) {
  var on = (c.uses || []).indexOf(key) >= 0;                                         // 是否已勾
  return '<label style="font-weight:normal;font-size:13.5px;display:flex;align-items:center;gap:5px;cursor:pointer">' +
    '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="aiToggleUse(' + i + ',\'' + key + '\',this.checked)" /> ' + label + '</label>';
}

/* 折叠头上的用途小标 */
function aiUsesMini(c) {
  var arr = (c.uses || []).map(function (k) { return AI_USES_MAP[k] || k; });
  return arr.length ? '<span style="font-size:11.5px;color:var(--text-sub);font-weight:400">' + arr.join(' / ') + '</span>' : '';
}

/* 渲染 AI 配置编辑卡片 */
function aiEditHtml() {
  var html = '' +
    '<div class="card" id="ai-cfg-card">' +
      '<div class="card-title">' + ICONS.ai + 'AI 接入（可选，支持多个）</div>' +
      '<div class="form-item"><label><input type="checkbox" id="ai-enabled"' + (AIEdit.enabled ? ' checked' : '') + ' onchange="AIEdit.enabled=this.checked" style="margin-right:6px" />启用 AI 功能</label>' +
      '<div class="form-hint">可同时接入多个接口，每个配置勾选它负责的用途（图片识别 / 用途说明 / 智能配料 / 项目领料），各页面会自动使用对应用途的配置；未启用时"智能配料"自动用内置本地引擎。</div></div>';
  for (var i = 0; i < AIEdit.list.length; i++) {                                // 逐个配置
    var c = AIEdit.list[i];
    var isActive = AIEdit.active === c.id;
    var open = c._open === true;                                                // 展开 / 折叠
    html += '<div style="border:1px solid ' + (isActive ? 'var(--primary)' : 'var(--border)') + ';border-radius:10px;margin-bottom:10px;overflow:hidden">';
    /* 折叠头（始终显示，点击展开 / 收起） */
    html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;background:' + (isActive ? 'var(--bg-soft)' : 'var(--bg)') + '" onclick="aiToggleOpen(\'' + c.id + '\')">' +
      '<span style="flex:1;font-weight:600">' + escapeHtml(c.name || '未命名配置') + '</span>' +
      aiUsesMini(c) +
      (isActive ? '<span class="tag-chip" style="background:rgba(99,102,241,.12);color:var(--primary)">默认</span>' : '') +
      '<span style="color:var(--text-sub);font-size:13px;font-weight:400">' + (open ? '收起 ▲' : '展开 ▼') + '</span>' +
    '</div>';
    if (open) {
      html += '<div style="padding:12px;border-top:1px solid var(--border)">' +
        '<div class="form-row">' +
          '<div class="form-item"><label>配置名称（自己起，好区分，如"智谱看图"）</label><input class="input" value="' + escapeHtml(c.name) + '" onchange="AIEdit.list[' + i + '].name=this.value" placeholder="如：智谱 / Ollama本地" /></div>' +
          '<div class="form-item"><label>模型名称（接口规定的模型 ID）</label><input class="input" value="' + escapeHtml(c.model) + '" onchange="AIEdit.list[' + i + '].model=this.value" placeholder="如 glm-4v-flash / qwen2.5vl" /></div>' +
        '</div>' +
        '<div class="form-item"><label>用途（这个配置用来干什么，可多选）</label>' +
          '<div style="display:flex;gap:14px;margin-top:4px;flex-wrap:wrap">' +
            aiUseCb(c, i, 'vision', '图片识别') +
            aiUseCb(c, i, 'explain', '用途说明') +
            aiUseCb(c, i, 'plan', '智能配料') +
            aiUseCb(c, i, 'pick', '项目领料') +
          '</div></div>' +
        '<div class="form-item"><label>接口地址（完整路径，结尾 /chat/completions）</label><input class="input" value="' + escapeHtml(c.url) + '" onchange="AIEdit.list[' + i + '].url=this.value" placeholder="https://open.bigmodel.cn/api/paas/v4/chat/completions" /></div>' +
        '<div class="form-hint" style="margin:2px 0 0">地址必须填<b>完整路径</b>（结尾是 /chat/completions），只填到 /v4 不能用：<br>' +
          '· 智谱 GLM：https://open.bigmodel.cn/api/paas/v4/chat/completions<br>' +
          '· DeepSeek：https://api.deepseek.com/v1/chat/completions<br>' +
          '· Ollama 本地：http://localhost:11434/v1/chat/completions<br>' +
          '不知道地址时，到对应平台的"API / 接口文档"里找 OpenAI 兼容地址。</div>' +
        '<div class="form-item" style="margin-top:8px"><label>API Key（接口密钥，Ollama 本地留空）</label><input class="input" type="password" value="' + escapeHtml(c.key) + '" onchange="AIEdit.list[' + i + '].key=this.value" placeholder="粘贴你申请的 Key（只存在本机）" /></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
          (isActive
            ? '<button class="btn btn-sm btn-primary" disabled>✓ 默认配置</button>'
            : '<button class="btn btn-sm btn-outline" onclick="aiSetActive(\'' + c.id + '\')">设为默认</button>') +
          '<button class="btn btn-sm btn-outline" onclick="aiTestOne(\'' + c.id + '\')">测试此配置</button>' +
          '<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="aiRemoveCfg(\'' + c.id + '\')">删除</button>' +
        '</div>' +
        '<div class="ai-quote" id="ai-test-one-' + c.id + '" style="display:none;margin-top:8px"></div>' +
      '</div>';
    }
    html += '</div>';
  }
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="aiAddCfg()">＋ 添加一个 AI 配置</button>' +
    '<button class="btn btn-primary" onclick="saveAIConfig()">保存 AI 配置</button>' +
  '</div>' +
  '<div class="form-hint" style="margin-top:10px">推荐：智谱（glm-4-flash 免费、glm-4v-flash 支持看图）、DeepSeek（便宜）、局域网 Ollama（看图先 ollama pull qwen2.5vl / llava）。点配置标题可折叠 / 展开。</div>' +
  '</div>';
  return html;
}

/* 局部重渲染 AI 编辑卡片 */
function aiRefreshEdit() {
  var old = $('#ai-cfg-card');
  if (old) old.outerHTML = aiEditHtml();
}

/* 添加一个空配置（展开；第一个自动成为默认） */
function aiAddCfg() {
  var item = { id: uid('ai'), name: '', url: '', model: '', key: '', uses: [], _open: true };
  AIEdit.list.push(item);
  if (!AIEdit.active) AIEdit.active = item.id;
  aiRefreshEdit();
}

/* 删除一个配置 */
function aiRemoveCfg(id) {
  AIEdit.list = AIEdit.list.filter(function (x) { return x.id !== id; });
  if (AIEdit.active === id) AIEdit.active = AIEdit.list[0] ? AIEdit.list[0].id : '';
  aiRefreshEdit();
}

/* 设为默认配置 */
function aiSetActive(id) {
  AIEdit.active = id;
  aiRefreshEdit();
}

/* 展开 / 收起一个配置块 */
function aiToggleOpen(id) {
  for (var i = 0; i < AIEdit.list.length; i++) {
    if (AIEdit.list[i].id === id) { AIEdit.list[i]._open = !(AIEdit.list[i]._open === true); aiRefreshEdit(); return; }
  }
}

/* 勾选 / 取消用途（不重渲染，保持勾选流畅） */
function aiToggleUse(i, key, checked) {
  var c = AIEdit.list[i];
  if (!c.uses) c.uses = [];
  var p = c.uses.indexOf(key);
  if (checked && p < 0) c.uses.push(key);
  if (!checked && p >= 0) c.uses.splice(p, 1);
}

/* 测试单个配置（结果显示在该配置块内） */
async function aiTestOne(id) {
  var c = null;
  for (var i = 0; i < AIEdit.list.length; i++) if (AIEdit.list[i].id === id) c = AIEdit.list[i];
  var box = $('#ai-test-one-' + id);
  if (!box) return;
  box.style.display = 'block';
  box.textContent = '正在连接……';
  if (!c.url) { box.innerHTML = '<span style="color:var(--danger)">请先填写完整接口地址</span>'; return; }
  var cfg = { enabled: true, url: String(c.url).trim(), model: String(c.model).trim(), key: String(c.key || '').trim() };
  try {
    var reply = await callLLM([{ role: 'user', content: '回复两个字：成功' }], cfg);
    box.innerHTML = '<span style="color:var(--success)">连接成功！回复：' + escapeHtml(String(reply).slice(0, 40)) + '</span>';
  } catch (err) {
    box.innerHTML = '<span style="color:var(--danger)">失败：' + escapeHtml(err.message) + '</span>';
  }
}

/* 保存 AI 配置（空配置跳过；默认失效自动指向第一个；保存后全部折叠） */
async function saveAIConfig() {
  var list = [];                                                                              // 有效配置
  for (var i = 0; i < AIEdit.list.length; i++) {
    var c = AIEdit.list[i];
    if (!c.url && !c.model) continue;                                                          // 空配置跳过
    list.push({
      id: c.id,
      name: String(c.name || '').trim() || ('配置' + (i + 1)),
      url: String(c.url || '').trim(),
      model: String(c.model || '').trim(),
      key: String(c.key || '').trim(),
      uses: c.uses || []
    });
  }
  var active = AIEdit.active;                                                                 // 默认 id
  if (list.length && list.filter(function (x) { return x.id === active; }).length === 0) active = list[0].id;  // 默认失效：指向第一个
  var cfg = { enabled: AIEdit.enabled, active: active, list: list };                          // 新结构
  if (cfg.enabled && !list.length) { toast('启用 AI 至少需要一个配置', 'err'); return; }          // 校验
  await DB.setSetting('aiConfig', cfg);                                                          // 写库
  await Log.add('修改AI配置', cfg.enabled ? '已启用，共 ' + list.length + ' 个配置' : '已停用');        // 日志
  toast('AI 配置已保存', 'ok');                                                                    // 提示
  AIEdit.list.forEach(function (x) { x._open = false; });                                        // 保存后折叠
  aiRefreshEdit();
}

/* ==================== 3. 多端同步设置 ==================== */

/* 保存同步配置（admin 修改后会同步到服务器，全体成员自动生效） */
async function saveSyncConfig() {
  var old = await DB.getSetting('syncConfig', {});                         // 旧配置（保留上次同步时间）
  var cfg = {                                                              // 收集表单
    enabledSet: true,                                                      // 标记：成员已手动定过开关，之后不再跟随协会默认
    enabled: $('#sync-enabled').checked,                                   // 开关
    url: $('#sync-url').value.trim().replace(/\/+$/, ''),                  // 成员自己填的地址（留空 = 用协会默认/网页自己的地址）
    device: $('#sync-device').value.trim() || '未命名设备',                 // 设备名
    lastSync: old.lastSync || 0                                            // 上次同步时间原样保留
  };
  /* 校验：启用同步时，必须能确定一个服务器地址（自己填的 或 协会默认 或 网页自己的地址） */
  var effUrl = cfg.url || SYNC_DEFAULT.url || syncOwnOrigin();             // 合成实际地址
  if (cfg.enabled && !effUrl) { toast('启用同步需要服务器地址；当前是本地文件打开，无法自动取网页地址，请手动填写', 'err'); return; }  // 校验

  /* admin 修改时，同时发送到服务器保存（全体成员自动同步） */
  var isAdmin = (typeof Auth !== 'undefined' && Auth.user && Auth.user.role === 'admin');
  var serverSaved = null;                                                  // 记录配置有没有真正写进服务器：null=没试，true=成功，false=失败
  if (isAdmin && effUrl) {
    try {
      var res = await fetch(effUrl + '/api/sync-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: cfg.enabled,
          url: cfg.url                                                     // 留空表示"用当前域名"
        })
      });
      serverSaved = res.ok;                                                // 必须看 HTTP 状态码，光"没报错"不代表服务器收下了
      if (!res.ok) console.log('同步配置写入服务器被拒绝，HTTP ' + res.status);
    } catch (e) {
      serverSaved = false;                                                 // 服务器没启动、没有这个接口（如 Cloudflare Pages）等
      console.log('同步配置到服务器失败（服务器未启动，或该后端没有 /api/sync-config 接口）:', e);
    }
  }

  await DB.setSetting('syncConfig', cfg);                                  // 写库
  if (typeof Sync !== 'undefined' && Sync.applyConfig) Sync.applyConfig(cfg);  // 通知同步引擎立即生效
  await Log.add('修改同步设置', cfg.enabled ? '启用，服务器 ' + effUrl : '停用');  // 日志
  /* 关键提醒：配置没写进服务器时，别的设备（手机等）不会自动拿到它，
     必须明确告诉 admin，否则他会以为"全协会都生效了"，其实只有本机在同步 */
  if (serverSaved === false) {
    toast('本机已保存，但配置没能写入服务器，其他设备不会自动生效：该后端没有 /api/sync-config 接口（纯静态托管就没有）。想全员统一，请把地址填进 js/sync.js 的 SYNC_DEFAULT.url 后重新部署', 'warn');
  } else {
    toast('同步设置已保存' + (cfg.enabled ? '，稍后自动开始同步' : ''), 'ok');  // 提示
  }
}

/* 测试同步服务器连通性（只测不改配置） */
async function testSyncServer() {
  var box = $('#sync-test-result');                                        // 结果框
  box.style.display = 'block';                                             // 显示
  box.textContent = '正在连接服务器……';                                     // 加载提示
  var url = $('#sync-url').value.trim().replace(/\/+$/, '');               // 取成员填的地址
  if (!url) url = SYNC_DEFAULT.url || syncOwnOrigin();                     // 没填就用协会默认/网页自己的地址
  if (!url) { box.innerHTML = '<span style="color:var(--danger)">请先填写服务器地址</span>'; return; }  // 校验
  try {                                                                    // 尝试探活
    var res = await fetch(url + '/api/ping', { method: 'GET' });           // 服务器提供 /api/ping
    var data = await res.json();                                           // 解析应答
    box.innerHTML = '<span style="color:var(--success)">连接成功！服务器版本 ' + escapeHtml(String(data.version || '1.0')) + '，可以正常同步</span>';  // 成功
  } catch (err) {                                                          // 失败
    box.innerHTML = '<span style="color:var(--danger)">连接失败：' + escapeHtml(err.message) + '<br>排查：① 检查地址拼写和端口是否写对；② 局域网的检查服务器电脑是否已双击运行"启动同步服务器.bat"、是否和本机在同一 WiFi。注意：Cloudflare Pages 之类的静态托管网址没有同步接口，不能当同步服务器填。</span>';  // 排查提示
  }
}

/* 手动立即同步一次（平时不用点，引擎会自动同步） */
async function manualSyncNow() {
  if (typeof Sync === 'undefined' || !Sync.syncNow) { toast('同步引擎未加载，请刷新页面后重试', 'err'); return; }  // 兜底
  toast('正在同步……', 'ok');                                               // 提示
  try {
    var r = await Sync.syncNow();                                          // 执行一轮同步
    /* busy = 后台那一轮还没跑完。以前这里会显示"同步完成：上传 0 条"，把真实的失败藏起来 */
    if (r.busy) { toast('后台正在同步中，请等这一轮结束（约几秒）后再点', 'warn'); return; }
    toast('同步完成：上传 ' + r.pushed + ' 条，下载 ' + r.pulled + ' 条', 'ok');  // 结果提示
    var t = $('#sync-last-text');                                          // 更新"上次同步"显示
    if (t) t.textContent = fmtDate(Date.now());
    routeTo();                                                             // 刷新当前页面数据
  } catch (err) {                                                          // 失败
    toast('同步失败：' + err.message, 'err');                               // 提示
  }
}

/* 主题切换（设置页和顶栏都会调用） */
function setTheme(t) {
  localStorage.setItem('hwms_theme', t);                                   // 保存偏好
  document.documentElement.setAttribute('data-theme', t);                   // 切换属性
  var btn = $('#theme-toggle-btn');                                          // 顶栏按钮（存在则换图标）
  if (btn) {
    btn.innerHTML = t === 'dark' ? ICONS.sun : ICONS.moon;                    // 图标
    btn.setAttribute('onclick', "setTheme('" + (t === 'dark' ? 'light' : 'dark') + "')");   // onclick 也要同步，否则只能切一次
  }
  if (location.hash.indexOf('settings') >= 0) pageSettings();                  // 在设置页则刷新
  toast('已切换到' + (t === 'dark' ? '深色' : '浅色') + '模式', 'ok');              // 提示
}

/* 普通成员修改自己的密码 */
function changeMyPwdModal() {
  var _ph = (Auth.user.role === 'admin') ? '当前密码' : (Auth.user.pwdChanged ? '当前密码' : '初始密码 zknb（第一次修改）');
  openModal('修改我的密码', '' +
    '<div class="form-item"><label>旧密码</label><input class="input" id="cp-old" type="password" placeholder="' + _ph + '" /></div>' +
    '<div class="form-item"><label>新密码（至少 4 位）</label><input class="input" id="cp-new" type="password" /></div>' +
    '<div class="form-item"><label>确认新密码</label><input class="input" id="cp-new2" type="password" /></div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="changeMyPwdSubmit()">修改</button>');
}

async function changeMyPwdSubmit() {
  var oldPwd = $('#cp-old').value;                                          // 旧密码
  var newPwd = $('#cp-new').value;                                           // 新密码
  var newPwd2 = $('#cp-new2').value;                                          // 确认
  if (newPwd !== newPwd2) { toast('两次输入的新密码不一致', 'err'); return; }   // 校验
  if (newPwd.length < 4) { toast('新密码至少 4 位', 'err'); return; }          // 校验
  var u = Auth.user;                                                           // 当前用户
  var oldHash = await hashPassword(oldPwd, u.salt);                            // 旧密码哈希
  if (oldHash !== u.passwordHash) { toast('旧密码不正确', 'err'); return; }     // 比对
  u.salt = uid('salt');                                                         // 新盐
  u.passwordHash = await hashPassword(newPwd, u.salt);                            // 新哈希
  u.pwdChanged = true;                                                           // 已修改初始密码
  stampSync(u);                                                                   // 盖同步时间戳（漏了它，自己改的密码不会同步到其他设备）
  await DB.put('users', u);                                                       // 写库
  await Log.add('修改密码', u.username + ' 修改了自己的密码');                       // 日志
  closeModal();                                                                     // 关
  toast('密码修改成功', 'ok');                                                        // 提示
}
