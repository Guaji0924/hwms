/* ============================================================
   pages_admin.js —— 用户管理 / 系统设置
   ------------------------------------------------------------
   内容：
   1. pageUsers()     用户管理（管理员专属）
   2. pageSettings()  系统设置（多端同步 / AI 配置 / 主题 / 分类 / 关于）
   3. 同步设置函数    saveSyncConfig / testSyncServer / manualSyncNow
   ============================================================ */

/* ==================== 1. 用户管理 ==================== */

/* 用户列表的筛选状态：q=关键词（搜姓名或班级），cls=选定的班级 */
var UserFilter = { q: '', cls: '' };

async function pageUsers() {
  if (!Auth.user || !isAdminNow()) {                                     // 权限检查（管理员"成员视角预览"时同样看不到）
    $('#page').innerHTML = '<div class="empty"><div class="e-ico">🔒</div>此页面仅管理员可见</div>';
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
  shown.sort(function (a, b) { return (b.lastLogin || 0) - (a.lastLogin || 0); });  // 最近登录在前
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
      '<td style="font-size:12.5px">' + (u.lastLogin ? fmtDate(u.lastLogin) : '从未登录') + '</td>' +
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
      '<button class="btn btn-primary" onclick="addUserModal()">' + ICONS.plus + '添加成员</button>' +
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
        '<thead><tr><th>用户</th><th>班级</th><th>角色</th><th>临时管理权限</th><th>最近登录</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + (shown.length === 0
          ? '<tr><td colspan="7"><div class="empty">没有找到匹配的成员，换个关键词试试</div></td></tr>'  // 筛选后为空的提示（共 7 列）
          : rows) + '</tbody>' +
      '</table></div>' +
    '</div>';
}

/* 添加成员弹窗 */
function addUserModal() {
  openModal('添加成员', '' +
    '<div class="form-item"><label>用户名 <span class="req">*</span></label><input class="input" id="au-name" maxlength="20" placeholder="建议用真实姓名或学号" /></div>' +
    '<div class="form-item"><label>初始密码 <span class="req">*</span></label><input class="input" id="au-pwd" placeholder="至少 4 位，成员首次登录后可自行修改" /></div>' +
    '<div class="form-item"><label>班级（选填）</label><input class="input" id="au-class" maxlength="30" placeholder="例如：电气2401" /></div>' +
    '<div class="form-hint">新成员默认为普通成员（可查询/出入库/导出），需要更多权限再点"临时管理权限"授权</div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="addUserSubmit()">创建</button>');
}

/* 提交添加成员 */
async function addUserSubmit() {
  var name = $('#au-name').value.trim();                                   // 用户名
  var pwd = $('#au-pwd').value;                                            // 密码
  var cls = $('#au-class') ? $('#au-class').value.trim() : '';              // 班级（选填）
  if (!name) { toast('请填写用户名', 'err'); return; }                       // 校验
  if (pwd.length < 4) { toast('密码至少 4 位', 'err'); return; }             // 校验
  var users = await DB.all('users');                                        // 查重
  for (var i = 0; i < users.length; i++) {                                   // 遍历
    if (users[i].username === name) { toast('该用户名已存在', 'err'); return; }  // 重名
  }
  var salt = uid('salt');                                                    // 盐
  var hash = await hashPassword(pwd, salt);                                   // 哈希
  await DB.put('users', {                                                     // 写库
    id: uid('user'), username: name, passwordHash: hash, salt: salt,           // 账号
    role: 'member', canManage: false, active: true,                             // 默认普通成员
    cls: cls,                                                                    // 班级（可为空）
    createdAt: Date.now(), lastLogin: null
  });
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
    '<div class="form-item"><label>新密码 <span class="req">*</span></label><input class="input" id="rp-pwd" placeholder="至少 4 位" /></div>' +
    '<div class="form-hint">重置后请把新密码告诉本人，建议其登录后自行再改</div>',
    '<button class="btn" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="resetUserPwdSubmit(\'' + userId + '\')">重置</button>');
}

async function resetUserPwdSubmit(userId) {
  if (!Auth.user || Auth.user.role !== 'admin') { toast('没有权限', 'err'); return; }  // 权限
  var pwd = $('#rp-pwd').value;                                                          // 新密码
  if (pwd.length < 4) { toast('密码至少 4 位', 'err'); return; }                           // 校验
  var users = await DB.all('users');                                                        // 全部
  for (var i = 0; i < users.length; i++) {                                                   // 遍历
    if (users[i].id === userId) {                                                              // 命中
      users[i].salt = uid('salt');                                                               // 换新盐
      users[i].passwordHash = await hashPassword(pwd, users[i].salt);                              // 新哈希
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
  var ai = await DB.getSetting('aiConfig', { enabled: false, url: '', model: '', key: '' });  // AI 配置
  var syncCfg = await DB.getSetting('syncConfig', { enabled: false, url: '', device: '', lastSync: 0 });  // 同步配置（每台设备各自一份）
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
    /* AI 配置 */
    '<div class="card">' +
      '<div class="card-title">' + ICONS.ai + 'AI 接入（可选功能）</div>' +
      '<div class="form-item"><label><input type="checkbox" id="ai-enabled"' + (ai.enabled ? ' checked' : '') + ' style="margin-right:6px" />启用 AI 功能</label>' +
      '<div class="form-hint">未启用或断网时，"智能配料"会自动使用内置的本地配料引擎（同样好用）；AI 元件介绍需要联网调用接口</div></div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>接口地址（OpenAI 兼容格式）</label><input class="input" id="ai-url" value="' + escapeHtml(ai.url) + '" placeholder="如 https://api.deepseek.com/v1/chat/completions" /></div>' +
        '<div class="form-item"><label>模型名称</label><input class="input" id="ai-model" value="' + escapeHtml(ai.model) + '" placeholder="如 deepseek-chat / glm-4-flash" /></div>' +
      '</div>' +
      '<div class="form-item"><label>API Key</label><input class="input" id="ai-key" type="password" value="' + escapeHtml(ai.key) + '" placeholder="粘贴你申请的 Key（只存在本机浏览器里）" /></div>' +
      '<div class="form-hint">推荐免费/低价方案：智谱 BigModel（glm-4-flash 免费）、DeepSeek（很便宜）、或局域网内 Ollama（http://localhost:11434/v1/chat/completions，无需 Key）</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
        '<button class="btn btn-primary" onclick="saveAIConfig()">保存 AI 配置</button>' +
        '<button class="btn btn-outline" onclick="testAIConfig()">测试连接</button>' +
      '</div>' +
      '<div class="ai-quote" id="ai-test-result" style="display:none"></div>' +
    '</div>' +
    /* 多端同步（每台设备都要各自配置一次，指向同一台服务器） */
    '<div class="card">' +
      '<div class="card-title">' + ICONS.cloud + '多端同步（手机 / 平板 / 电脑共用一份数据）</div>' +
      '<div class="ai-quote" style="margin-bottom:10px"><b>推荐：部署到免费云主机（协会不用常开电脑）</b><br>' +
      '把本系统免费托管到 Render 云平台，得到一个永久的 https:// 网址——像正经网站一样把链接发给社员就能用，手机流量也能同步。<br>' +
      '图文教程看系统文件夹里的 <b>云端部署指南.md</b>（约 15 分钟，全程免费）；部署完成后把网址填到下面即可。</div>' +
      '<div class="form-item"><label><input type="checkbox" id="sync-enabled"' + (syncCfg.enabled ? ' checked' : '') + ' style="margin-right:6px" />启用多端同步</label>' +
      '<div class="form-hint">启用后：有网时自动与服务器同步，多人多设备实时共用同一份数据；断网时照常查询、登记，恢复网络后自动把离线操作补传上去。云端主机就算重启丢了数据，各设备也会自动"补种"回去，不用担心。</div></div>' +
      '<div class="form-row">' +
        '<div class="form-item"><label>同步服务器地址</label><input class="input" id="sync-url" value="' + escapeHtml(syncCfg.url) + '" placeholder="云端 https://xxx.onrender.com；局域网 http://192.168.1.100:8787" /></div>' +
        '<div class="form-item"><label>本机设备名（方便认账，随便起）</label><input class="input" id="sync-device" value="' + escapeHtml(syncCfg.device) + '" placeholder="如 张三-手机" /></div>' +
      '</div>' +
      '<div class="form-item"><label>同步密钥（云端部署时在 Render 后台设置的 SYNC_KEY，两端一致才能同步；局域网自用可留空）</label><input class="input" id="sync-key" type="password" value="' + escapeHtml(syncCfg.key || '') + '" placeholder="服务器没设密钥就留空" /></div>' +
      '<div class="form-hint">不想用云主机也可以：找一台常开的电脑跑 server 目录（双击"启动同步服务器.bat"），地址填那台电脑的局域网 IP。但协会没有常开电脑的话，推荐上面的云端部署。</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
        '<button class="btn btn-primary" onclick="saveSyncConfig()">保存同步设置</button>' +
        '<button class="btn btn-outline" onclick="testSyncServer()">测试服务器连接</button>' +
        '<button class="btn btn-outline" onclick="manualSyncNow()">立即同步一次</button>' +
      '</div>' +
      '<div class="ai-quote" id="sync-test-result" style="display:none"></div>' +
      '<div style="font-size:12.5px;color:var(--text-sub);margin-top:8px">上次同步：<span id="sync-last-text">' + (syncCfg.lastSync ? fmtDate(syncCfg.lastSync) : '从未同步') + '</span></div>' +
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
        '物料管家 v2.0 · 智能控制协会物料管理系统<br>' +
        '· 单机可用：数据保存在浏览器 IndexedDB 里，断网照样查、照样登记，免费无广告<br>' +
        '· 多端同步：推荐部署到免费云主机（见"云端部署指南.md"），得到永久 https:// 网址，任何网络随时同步；也支持局域网电脑当服务器，断网自动补传<br>' +
        '· 可安装：浏览器菜单里"安装应用 / 添加到主屏幕"，之后像 App 一样从桌面图标打开<br>' +
        '· 转发给别人：把整个系统文件夹拷给对方（U 盘或压缩包都行），对方打开也能单机用，也可加入同步<br>' +
        '· 数据安全：导出备份在"数据管理"页，建议每月导出一份存档<br>' +
        '· 代码全开源带中文注释，会一点 HTML/JS 的同学就能自行修改样式和逻辑' +
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

/* 保存 AI 配置 */
async function saveAIConfig() {
  var cfg = {                                                                                  // 收集
    enabled: $('#ai-enabled').checked,                                                          // 开关
    url: $('#ai-url').value.trim(),                                                              // 地址
    model: $('#ai-model').value.trim(),                                                            // 模型
    key: $('#ai-key').value.trim()                                                                  // Key
  };
  if (cfg.enabled && !cfg.url) { toast('启用 AI 需要填写接口地址', 'err'); return; }                // 校验
  await DB.setSetting('aiConfig', cfg);                                                              // 写库
  await Log.add('修改AI配置', cfg.enabled ? '已启用 ' + cfg.model : '已停用');                          // 日志
  toast('AI 配置已保存', 'ok');                                                                          // 提示
}

/* 测试 AI 连接 */
async function testAIConfig() {
  var result = $('#ai-test-result');                                                                    // 结果框
  result.style.display = 'block';                                                                       // 显示
  result.textContent = '正在连接……';                                                                     // 加载中
  var cfg = {                                                                                            // 临时配置（先不保存，直接测）
    enabled: true,
    url: $('#ai-url').value.trim(),
    model: $('#ai-model').value.trim(),
    key: $('#ai-key').value.trim()
  };
  if (!cfg.url) { result.innerHTML = '<span style="color:var(--danger)">请先填写接口地址</span>'; return; }   // 校验
  try {                                                                                                     // 尝试调用
    var reply = await callLLM([{ role: 'user', content: '回复两个字：成功' }], cfg);                         // 测试消息
    result.innerHTML = '<span style="color:var(--success)">连接成功！模型回复：' + escapeHtml(String(reply).slice(0, 60)) + '</span>';  // 成功
  } catch (err) {                                                                                             // 失败
    result.innerHTML = '<span style="color:var(--danger)">连接失败：' + escapeHtml(err.message) + '<br>常见原因：Key 无效 / 地址写错 / 未联网 / 接口不允许本地文件调用（可把系统挂到内网服务器后重试）</span>';  // 提示
  }
}

/* ==================== 3. 多端同步设置 ==================== */

/* 保存同步配置（每台设备各自保存一份，指向同一台服务器） */
async function saveSyncConfig() {
  var old = await DB.getSetting('syncConfig', {});                         // 旧配置（保留上次同步时间）
  var cfg = {                                                              // 收集表单
    enabled: $('#sync-enabled').checked,                                   // 开关
    url: $('#sync-url').value.trim().replace(/\/+$/, ''),                  // 服务器地址（去掉末尾斜杠）
    key: $('#sync-key') ? $('#sync-key').value.trim() : '',                // 同步密钥（云端部署用）
    device: $('#sync-device').value.trim() || '未命名设备',                 // 设备名
    lastSync: old.lastSync || 0                                            // 上次同步时间原样保留
  };
  if (cfg.enabled && !cfg.url) { toast('启用同步需要填写服务器地址', 'err'); return; }  // 校验
  await DB.setSetting('syncConfig', cfg);                                  // 写库
  if (typeof Sync !== 'undefined' && Sync.applyConfig) Sync.applyConfig(cfg);  // 通知同步引擎立即生效
  await Log.add('修改同步设置', cfg.enabled ? '启用，服务器 ' + cfg.url : '停用');  // 日志
  toast('同步设置已保存' + (cfg.enabled ? '，稍后自动开始同步' : ''), 'ok');  // 提示
}

/* 测试同步服务器连通性（只测不改配置） */
async function testSyncServer() {
  var box = $('#sync-test-result');                                        // 结果框
  box.style.display = 'block';                                             // 显示
  box.textContent = '正在连接服务器……';                                     // 加载提示
  var url = $('#sync-url').value.trim().replace(/\/+$/, '');               // 取地址
  if (!url) { box.innerHTML = '<span style="color:var(--danger)">请先填写服务器地址</span>'; return; }  // 校验
  try {                                                                    // 尝试探活
    var res = await fetch(url + '/api/ping', { method: 'GET' });           // 服务器提供 /api/ping
    var data = await res.json();                                           // 解析应答
    var keyTip = data.needKey ? '<br>该服务器已开启密钥，请确认下方"同步密钥"与服务器端一致' : '<br>该服务器未设密钥（局域网自用正常；云端部署建议设置 SYNC_KEY）';  // 按服务器情况提示密钥
    box.innerHTML = '<span style="color:var(--success)">连接成功！服务器版本 ' + escapeHtml(String(data.version || '1.0')) + '，可以正常同步' + keyTip + '</span>';  // 成功
  } catch (err) {                                                          // 失败
    box.innerHTML = '<span style="color:var(--danger)">连接失败：' + escapeHtml(err.message) + '<br>排查：① 云端部署的检查网址拼写（如 https://xxx.onrender.com），免费版休眠时首次打开要等约 1 分钟预热再试；② 局域网的检查服务器电脑是否已双击运行"启动同步服务器.bat"、地址端口是否写对、是否和本机在同一 WiFi；③ 服务器设置了 SYNC_KEY 的，"同步密钥"要填一致。</span>';  // 排查提示
  }
}

/* 手动立即同步一次（平时不用点，引擎会自动同步） */
async function manualSyncNow() {
  if (typeof Sync === 'undefined' || !Sync.syncNow) { toast('同步引擎未加载，请刷新页面后重试', 'err'); return; }  // 兜底
  toast('正在同步……', 'ok');                                               // 提示
  try {
    var r = await Sync.syncNow();                                          // 执行一轮同步
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
  if (btn) btn.innerHTML = t === 'dark' ? ICONS.sun : ICONS.moon;              // 图标
  if (location.hash.indexOf('settings') >= 0) pageSettings();                  // 在设置页则刷新
  toast('已切换到' + (t === 'dark' ? '深色' : '浅色') + '模式', 'ok');              // 提示
}

/* 普通成员修改自己的密码 */
function changeMyPwdModal() {
  openModal('修改我的密码', '' +
    '<div class="form-item"><label>旧密码</label><input class="input" id="cp-old" type="password" /></div>' +
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
  await DB.put('users', u);                                                       // 写库
  await Log.add('修改密码', u.username + ' 修改了自己的密码');                       // 日志
  closeModal();                                                                     // 关
  toast('密码修改成功', 'ok');                                                        // 提示
}
