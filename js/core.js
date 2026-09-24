/* ============================================================
   core.js —— 核心工具模块
   ------------------------------------------------------------
   内容：
   1. 通用小工具（选择器 / 格式化 / 编号生成 / 防抖 ...）
   2. CSV 解析与导出（Excel 可直接打开）
   3. 密码哈希（SHA-256，浏览器原生实现）
   4. DB：IndexedDB 本地数据库封装
   5. Auth：登录认证与权限控制
   6. State：全局数据缓存
   7. Search：模糊搜索引擎（中文 / 拼音 / 别称 / 丝印 / 描述）
   8. UI：轻提示 Toast / 弹窗 Modal / 确认框
   9. Log：系统操作日志
   ============================================================ */

/* ==================== 1. 通用小工具 ==================== */

/* 按选择器取第一个元素：$('#id') */
function $(sel) { return document.querySelector(sel); }

/* 按选择器取所有元素：$$('.cls') 返回数组 */
function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

/* HTML 转义：防止用户输入的内容破坏页面（安全必备） */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';         // 空值直接返回空串
  return String(str)                                        // 统一转字符串
    .replace(/&/g, '&amp;')                                 // & 必须最先替换
    .replace(/</g, '&lt;')                                  // < 转义
    .replace(/>/g, '&gt;')                                  // > 转义
    .replace(/"/g, '&quot;')                                // 双引号转义
    .replace(/'/g, '&#39;');                                // 单引号转义
}

/* 金额格式化：1234.5 -> ¥1,234.50 */
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '¥0.00';  // 非法数字兜底
  return '¥' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');  // 千分位 + 两位小数
}

/* 时间戳 -> "2026-09-23 14:05" */
function fmtDate(ts) {
  if (!ts) return '-';                                      // 空时间显示 -
  var d = new Date(ts);                                     // 转日期对象
  var p = function (x) { return (x < 10 ? '0' : '') + x; };  // 补零函数
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* 时间戳 -> "2026-09-23"（只显示日期） */
function fmtDateShort(ts) {
  if (!ts) return '-';                                      // 空值兜底
  var d = new Date(ts);                                     // 转日期对象
  var p = function (x) { return (x < 10 ? '0' : '') + x; };  // 补零
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 当前月份字符串："2026-09"（用于经费统计） */
function monthKey(ts) {
  var d = ts ? new Date(ts) : new Date();                   // 无参用当前时间
  var p = function (x) { return (x < 10 ? '0' : '') + x; }; // 补零
  return d.getFullYear() + '-' + p(d.getMonth() + 1);        // 年-月
}

/* 生成唯一编号（物料/记录/用户的 id 都用它） */
function uid(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);  // 时间+随机数
}

/* ==================== 1.5 出入库记录类型 ==================== */
/* 全系统只有三种操作：入库（+）/ 出库（−）/ 库存调整（盘点纠错，直接改为新值） */
/* sign：+1 库存增加 / -1 库存减少 / 0 直接设置新值 */
var RECORD_TYPES = {
  'in':     { label: '入库',     badge: 'badge-green', sign: 1 },   // 入库：采购 / 归还 / 收到赠品
  'out':    { label: '出库',     badge: 'badge-blue',  sign: -1 },  // 出库：领用 / 消耗 / 报废
  'adjust': { label: '库存调整', badge: 'badge-gray',  sign: 0 }    // 调整：盘点纠错，不增不减
};

/* 判断一条记录是否属于"出库"（统计消耗用；旧版本类型一并兼容） */
function isOutType(t) {
  return t === 'out' || t === 'out_use' || t === 'out_consume' || t === 'borrow';  // 借出也算库存减少
}

/* 判断一条记录是否属于"入库"（统计采购用；旧版本类型一并兼容） */
function isInType(t) {
  return t === 'in' || t === 'return';                                          // 归还也算库存增加
}

/* ==================== 1.6 图片压缩 ==================== */
/**
 * 把用户上传的照片压缩成适合入库的小图（JPEG dataURL，约 30~80KB）
 * file：input 里选中的文件（jpg/png/手机拍照都行）
 * maxSide：长边最大像素，默认 900（网页显示足够，又不占太多存储）
 * 返回 Promise，成功 resolve 压缩后的 dataURL 字符串
 */
function compressImage(file, maxSide) {
  maxSide = maxSide || 900;                                   // 默认长边 900px
  return new Promise(function (resolve, reject) {             // 包成 Promise 方便 await
    var reader = new FileReader();                            // 文件读取器
    reader.onload = function () {                             // 文件读完成
      var img = new Image();                                  // 建图片对象
      img.onload = function () {                              // 图片解码完成
        var scale = Math.min(maxSide / img.width, maxSide / img.height, 1);  // 缩放比例（小图不放大）
        var w = Math.round(img.width * scale);                // 目标宽
        var h = Math.round(img.height * scale);                // 目标高
        var cvs = document.createElement('canvas');            // 画布
        cvs.width = w; cvs.height = h;                         // 画布尺寸
        var ctx = cvs.getContext('2d');                        // 画笔
        ctx.fillStyle = '#fff';                                // 白底（透明 PNG 转 JPEG 不发黑）
        ctx.fillRect(0, 0, w, h);                              // 铺白底
        ctx.drawImage(img, 0, 0, w, h);                        // 画上缩放后的图片
        resolve(cvs.toDataURL('image/jpeg', 0.82));           // 转 JPEG（质量 82%）
      };
      img.onerror = function () { reject(new Error('图片文件无法解析')); };  // 解码失败
      img.src = reader.result;                                // 图片地址 = 文件内容
    };
    reader.onerror = function () { reject(new Error('读取文件失败')); };     // 读取失败
    reader.readAsDataURL(file);                               // 读成 dataURL
  });
}

/* ==================== 1.7 旧版本数据迁移 ==================== */
/**
 * 旧版出入库类型（领用/消耗/借出/归还）→ 简化成 入库/出库；
 * 老数据缺 updatedAt 字段的补上（同步功能需要它比较新旧）。
 * 注意：这里不再用"迁移过一次就跳过"的标记，而是每次启动都扫一遍
 * （数据规范时几乎是瞬间完成）。这样即使别的设备同步来一条旧类型
 * 记录，下次打开也会被自动修正 —— 彻底修复"出库显示 out_use"的问题。
 */

/* 单条记录的类型修正：是旧类型就换成新类型，返回 true 表示改过 */
function fixLegacyType(rec) {
  var map = {                                                   // 旧类型 → 新类型
    'out_use': 'out', 'out_consume': 'out', 'borrow': 'out',
    'return': 'in'
  };
  if (rec && map[rec.type]) {                                   // 命中旧类型
    if (!rec.oldType) rec.oldType = rec.type;                   // 原类型存进备注字段（想追溯还有据可查）
    rec.type = map[rec.type];                                   // 换成新类型
    return true;                                                // 告诉调用方"这条改过了"
  }
  return false;                                                 // 新类型不用改
}

async function migrateLegacyData() {
  var records = await DB.all('records');                         // 全部记录
  var toPut = [];                                               // 待更新集合
  for (var r = 0; r < records.length; r++) {                    // 逐条检查
    if (fixLegacyType(records[r])) {                            // 是旧类型就修
      toPut.push(records[r]);                                   // 收集
    }
  }
  if (toPut.length > 0) await DB.bulkPut('records', toPut);     // 批量写回
  var mats = await DB.all('materials');                         // 全部物料
  var fix = [];                                                 // 待修复集合
  for (var m = 0; m < mats.length; m++) {                       // 逐条检查
    if (!mats[m].updatedAt) {                                   // 缺更新时间
      mats[m].updatedAt = mats[m].createdAt || Date.now();      // 用创建时间补
      fix.push(mats[m]);                                        // 收集
    }
  }
  if (fix.length > 0) await DB.bulkPut('materials', fix);       // 批量写回
}

/* ==================== 1.8 同步辅助 ==================== */
/**
 * 给一条数据打上"最后修改时间"标记（多端同步的核心依据）
 * 规则：谁的时间戳新，谁的内容胜出（最后修改者优先）
 * 用法：DB.put('materials', stampSync(m))  —— 所有保存/修改操作都要经过它
 */
function stampSync(obj) {
  obj.updatedAt = Date.now();                                 // 记录最后修改时间（毫秒时间戳）
  return obj;                                                  // 原样返回，方便一行连写
}

/**
 * 软删除：不真正删除数据，只打上 deleted 标记（俗称"墓碑"）
 * 为什么要这样删？——多设备同步时，其他设备必须知道"这条数据被删了"，
 * 才能把本地的同一条也删掉。真删了就没痕迹可同步了。
 */
async function softDelete(store, id) {
  var obj = await DB.get(store, id);                           // 先取出原数据
  if (!obj) return;                                            // 不存在就直接返回
  obj.deleted = true;                                          // 打上删除标记
  stampSync(obj);                                              // 记录删除发生的时间
  await DB.put(store, obj);                                    // 写回数据库
}

/* 生成物料编号：按前缀 + 序号递增，如 KFB-0007 */
function nextMaterialCode(cat) {
  var prefixMap = {                                         // 母分类 -> 编号前缀（纯字母） */
    '开发板/主控': 'KFB', '传感器': 'CGQ', '电机/执行器': 'DJ', '显示模块': 'XS',
    '通信模块': 'TX', '电源管理': 'DY', '基础元件': 'JC', '集成电路IC': 'IC',
    '线材连接': 'XC', '工具': 'GJ', '耗材': 'HC', '结构件': 'JG', '其他': 'QT'
  };
  var prefix = prefixMap[cat] || 'WL';                      // 找不到映射就用通用前缀 WL
  var max = 0;                                               // 当前最大序号
  for (var i = 0; i < State.materials.length; i++) {         // 遍历已有物料
    var m = State.materials[i];                             // 单个物料
    if (m.code && m.code.indexOf(prefix + '-') === 0) {     // 编号前缀匹配
      var num = parseInt(m.code.split('-')[1], 10);         // 取出序号部分
      if (!isNaN(num) && num > max) max = num;               // 记录最大值
    }
  }
  return prefix + '-' + ('0000' + (max + 1)).slice(-4);      // 序号补零到 4 位
}

/* 防抖：输入框连续输入时只在停顿 250ms 后执行一次（搜索框用） */
function debounce(fn, wait) {
  var timer = null;                                          // 定时器句柄
  return function () {                                       // 返回包装后的函数
    var args = arguments;                                    // 保存参数
    var self = this;                                         // 保存 this
    clearTimeout(timer);                                     // 清掉上一次的定时器
    timer = setTimeout(function () { fn.apply(self, args); }, wait || 250);  // 停顿后执行
  };
}

/* 下载文本内容为文件（CSV/JSON 导出用） */
function downloadFile(content, filename, mime) {
  var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });  // 构造二进制对象
  var url = URL.createObjectURL(blob);                       // 生成临时下载地址
  var a = document.createElement('a');                      // 创建隐藏的 <a> 标签
  a.href = url;                                              // 指向下载地址
  a.download = filename;                                     // 下载文件名
  document.body.appendChild(a);                              // 必须先加入页面
  a.click();                                                 // 触发下载
  document.body.removeChild(a);                              // 用完移除
  URL.revokeObjectURL(url);                                  // 释放临时地址
}

/* ==================== 2. CSV 解析与导出 ==================== */

/* 把二维数组转成 CSV 文本（自动处理引号转义与中文 BOM） */
function toCSV(rows) {
  var out = '\uFEFF';                                       // BOM 头：让 Excel 正确识别中文
  for (var r = 0; r < rows.length; r++) {                   // 逐行处理
    var line = [];                                           // 本行的单元格
    for (var c = 0; c < rows[r].length; c++) {              // 逐格处理
      var cell = rows[r][c];                                // 单元格内容
      if (cell === null || cell === undefined) cell = '';  // 空值转空串
      cell = String(cell).replace(/"/g, '""');              // 内容里的双引号转义成两个
      if (/[",\n\r]/.test(cell)) cell = '"' + cell + '"';   // 含逗号/引号/换行的加引号包裹
      line.push(cell);                                       // 放入本行
    }
    out += line.join(',') + '\r\n';                          // 行内逗号连接，Windows 换行符
  }
  return out;                                                // 返回完整 CSV 文本
}

/* 解析 CSV 文本为二维数组（状态机写法，正确处理引号内逗号和换行） */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');  // 去 BOM、统一换行
  var rows = [];                                             // 结果：所有行
  var row = [];                                              // 当前行的单元格
  var cell = '';                                             // 当前单元格内容
  var inQuote = false;                                       // 是否处于引号包裹中
  for (var i = 0; i < text.length; i++) {                    // 逐字符扫描
    var ch = text[i];                                        // 当前字符
    if (inQuote) {                                           // 引号内的字符不特殊处理
      if (ch === '"') {                                      // 遇到引号
        if (text[i + 1] === '"') { cell += '"'; i++; }       // 两个引号 = 转义的单个引号
        else inQuote = false;                                // 单个引号 = 包裹结束
      } else { cell += ch; }                                 // 普通字符直接拼接
    } else {                                                 // 引号外的字符
      if (ch === '"') inQuote = true;                        // 进入引号包裹
      else if (ch === ',') { row.push(cell); cell = ''; }    // 逗号 = 单元格分隔
      else if (ch === '\n') {                                // 换行 = 行分隔
        row.push(cell); cell = '';                           // 收尾当前单元格
        rows.push(row); row = [];                           // 收尾当前行
      } else { cell += ch; }                                 // 普通字符拼接
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }  // 最后一行没有换行符，手动收尾
  /* 去掉完全空白的行 */
  var result = [];                                           // 过滤后的结果
  for (var r = 0; r < rows.length; r++) {                    // 遍历每一行
    var notEmpty = false;                                    // 本行是否非空
    for (var c = 0; c < rows[r].length; c++) {               // 遍历本行每格
      if (String(rows[r][c]).trim() !== '') { notEmpty = true; break; }  // 有内容就认为非空
    }
    if (notEmpty) result.push(rows[r]);                      // 保留非空行
  }
  return result;                                             // 返回二维数组
}

/* ==================== 3. 密码哈希 ==================== */

/**
 * 密码哈希：优先用浏览器原生的 SHA-256；个别不支持的环境用简易哈希兜底
 * 返回 Promise，resolve 哈希后的十六进制字符串
 */
function hashPassword(pwd, salt) {
  if (window.crypto && crypto.subtle) {                      // 现代浏览器走这里
    var data = new TextEncoder().encode(salt + pwd);         // 盐 + 密码 编码成字节
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {  // 计算摘要
      var arr = new Uint8Array(buf);                         // 结果字节数组
      var hex = '';                                          // 十六进制串
      for (var i = 0; i < arr.length; i++) hex += ('0' + arr[i].toString(16)).slice(-2);  // 字节转两位十六进制
      return hex;                                            // 返回
    });
  }
  /* 兜底：不支持 subtle 时用 DJB2 字符串哈希（强度低但保证可用） */
  var str = salt + pwd;                                      // 盐 + 密码
  var h = 5381;                                              // DJB2 初始值
  for (var i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff; }  // 经典算法
  return Promise.resolve('djb2_' + (h >>> 0).toString(16));  // 返回带前缀的哈希
}

/* ==================== 4. DB：IndexedDB 封装 ==================== */
/* 浏览器内置的本地数据库，数据保存在本机浏览器里，无需联网 */

var DB = {
  db: null,                                                   // 打开后的数据库连接
  NAME: 'hwms_db',                                            // 数据库名
  VERSION: 1,                                                 // 版本号
  STORES: ['materials', 'records', 'users', 'logs', 'settings'],  // 五张表：物料/记录/用户/日志/设置

  /* 打开数据库（应用启动时调用一次） */
  init: function () {
    var self = this;                                          // 保存 this 引用
    return new Promise(function (resolve, reject) {           // 包成 Promise 方便 await
      var req = indexedDB.open(self.NAME, self.VERSION);      // 打开（或新建）数据库
      req.onupgradeneeded = function (e) {                    // 新建或升级时建表
        var db = e.target.result;                             // 数据库对象
        for (var i = 0; i < self.STORES.length; i++) {        // 逐个建表
          if (!db.objectStoreNames.contains(self.STORES[i])) {  // 已存在的不重复建
            db.createObjectStore(self.STORES[i], { keyPath: 'id' });  // 主键为 id 字段
          }
        }
      };
      req.onsuccess = function (e) { self.db = e.target.result; resolve(self.db); };  // 成功：保存连接
      req.onerror = function (e) { reject(e.target.error); };  // 失败：抛出错误
    });
  },

  /* 新增或更新一条数据 */
  put: function (store, obj) {
    var self = this;                                          // this 引用
    return new Promise(function (resolve, reject) {           // Promise 封装
      var tx = self.db.transaction(store, 'readwrite');       // 开读写事务
      tx.objectStore(store).put(obj);                         // put：有则更新无则插入
      tx.oncomplete = function () { resolve(); };             // 事务完成
      tx.onerror = function (e) { reject(e.target.error); };  // 事务失败
    });
  },

  /* 批量写入（导入数据用） */
  bulkPut: function (store, arr) {
    var self = this;                                          // this 引用
    return new Promise(function (resolve, reject) {           // Promise 封装
      var tx = self.db.transaction(store, 'readwrite');       // 一次事务写完所有
      var os = tx.objectStore(store);                          // 表对象
      for (var i = 0; i < arr.length; i++) os.put(arr[i]);     // 逐条写入
      tx.oncomplete = function () { resolve(); };              // 全部完成
      tx.onerror = function (e) { reject(e.target.error); };   // 失败
    });
  },

  /* 按主键取一条 */
  get: function (store, id) {
    var self = this;                                          // this 引用
    return new Promise(function (resolve, reject) {           // Promise 封装
      var tx = self.db.transaction(store, 'readonly');        // 只读事务
      var req = tx.objectStore(store).get(id);                 // 按主键查询
      req.onsuccess = function (e) { resolve(e.target.result); };  // 返回结果（可能 undefined）
      req.onerror = function (e) { reject(e.target.error); };  // 失败
    });
  },

  /* 取表中全部数据 */
  all: function (store) {
    var self = this;                                          // this 引用
    return new Promise(function (resolve, reject) {           // Promise 封装
      var tx = self.db.transaction(store, 'readonly');        // 只读事务
      var req = tx.objectStore(store).getAll();                // 全量查询
      req.onsuccess = function (e) { resolve(e.target.result || []); };  // 返回数组
      req.onerror = function (e) { reject(e.target.error); };  // 失败
    });
  },

  /* 按主键删除一条 */
  del: function (store, id) {
    var self = this;                                          // this 引用
    return new Promise(function (resolve, reject) {           // Promise 封装
      var tx = self.db.transaction(store, 'readwrite');       // 读写事务
      tx.objectStore(store).delete(id);                       // 删除
      tx.oncomplete = function () { resolve(); };              // 完成
      tx.onerror = function (e) { reject(e.target.error); };  // 失败
    });
  },

  /* 清空整张表（危险操作，恢复备份用） */
  clear: function (store) {
    var self = this;                                          // this 引用
    return new Promise(function (resolve, reject) {           // Promise 封装
      var tx = self.db.transaction(store, 'readwrite');       // 读写事务
      tx.objectStore(store).clear();                          // 清空
      tx.oncomplete = function () { resolve(); };              // 完成
      tx.onerror = function (e) { reject(e.target.error); };  // 失败
    });
  },

  /* 读取设置项（settings 表存 {id: 键名, value: 值}） */
  getSetting: function (key, def) {
    return DB.get('settings', key).then(function (row) {      // 查设置表
      return row ? row.value : (def !== undefined ? def : null);  // 没有则返回默认值
    });
  },

  /* 保存设置项 */
  setSetting: function (key, value) {
    return DB.put('settings', { id: key, value: value });      // 写入键值对
  }
};

/* ==================== 5. Auth：登录与权限 ==================== */

var Auth = {
  user: null,                                                 // 当前登录的用户（内存中）

  /* 应用启动时调用：保证至少有一个管理员账号 */
  ensureAdmin: async function () {
    var users = await DB.all('users');                        // 取全部用户
    var aliveCount = 0;                                       // 有效用户计数
    for (var k = 0; k < users.length; k++) { if (!users[k].deleted) aliveCount++; }  // 墓碑不算
    if (aliveCount === 0) {                                   // 一个有效用户都没有（首次运行）
      var salt = uid('salt');                                 // 随机盐
      var hash = await hashPassword('admin123', salt);        // 默认密码 admin123 的哈希
      await DB.put('users', {                                 // 创建默认管理员
        id: uid('user'), username: 'admin', passwordHash: hash, salt: salt,   // 账号信息
        role: 'admin',                                        // 角色：管理员
        active: true,                                         // 启用状态
        createdAt: Date.now(),                                 // 创建时间
        lastLogin: null                                       // 最近登录
      });
    }
  },

  /* 尝试自动恢复登录状态（刷新页面后不掉线） */
  restore: async function () {
    var uidSaved = localStorage.getItem('hwms_remember') || sessionStorage.getItem('hwms_session');  // 优先找"记住我"
    if (!uidSaved) return null;                               // 没有保存过会话
    var u = await DB.get('users', uidSaved);                   // 按保存的用户 id 查询
    if (u && u.active) { this.user = u; return u; }           // 用户存在且启用：恢复登录
    return null;                                              // 否则未登录
  },

  /* 登录：成功返回 true 并把会话写入本地存储 */
  login: async function (username, pwd, remember) {
    var users = await DB.all('users');                        // 取全部用户
    var u = null;                                             // 找到的用户
    for (var i = 0; i < users.length; i++) {                  // 遍历比对
      if (users[i].deleted) continue;                         // 已删除（墓碑）的账号不能登录
      if (users[i].username === username) { u = users[i]; break; }  // 用户名匹配
    }
    if (!u) return { ok: false, msg: '用户不存在' };          // 没找到
    if (!u.active) return { ok: false, msg: '账号已被停用，请联系管理员' };  // 被禁用
    var hash = await hashPassword(pwd, u.salt);                // 计算输入密码的哈希
    if (hash !== u.passwordHash) return { ok: false, msg: '密码错误' };  // 比对失败
    var isFirstLogin = !u.lastLogin;                           // 之前从没登录过 → 本次是该账号第一次登录
    u.lastLogin = Date.now();                                 // 更新最近登录时间
    await DB.put('users', u);                                 // 保存
    this.user = u;                                             // 内存中记住当前用户
    if (remember) { localStorage.setItem('hwms_remember', u.id); sessionStorage.removeItem('hwms_session'); }  // 记住我：长期保存
    else { sessionStorage.setItem('hwms_session', u.id); localStorage.removeItem('hwms_remember'); }  // 会话级保存
    return { ok: true, first: isFirstLogin };                   // 登录成功（first=是否首次登录，用于弹新手手册提示）
  },

  /* 退出登录 */
  logout: function () {
    this.user = null;                                          // 清空内存
    localStorage.removeItem('hwms_remember');                   // 清长期保存
    sessionStorage.removeItem('hwms_session');                  // 清会话保存
  },

  /**
   * 权限判断：Auth.can('manage')
   * view=查询 / stock=出入库 / export=导出 / ai=智能配料 / stats=统计
   * manage=管理物料档案（管理员或被临时授权的成员）
   * users=用户管理 / settings=系统设置 / dangerous=危险数据操作（仅管理员）
   */
  can: function (action) {
    if (!this.user) return false;                              // 未登录一律拒绝
    if (this.user.role === 'admin') return true;               // 管理员全部放行
    var memberPerms = ['view', 'stock', 'export', 'ai', 'stats', 'history'];  // 普通成员的权限
    if (memberPerms.indexOf(action) >= 0) return true;         // 成员基础权限
    if (action === 'manage' && this.user.canManage) return true;  // 被临时授权的成员可管理物料
    return false;                                              // 其他一律拒绝
  }
};

/* ==================== 6. State：全局数据缓存 ==================== */
/* 把常用数据放在内存里，避免每次渲染都查一遍数据库 */

var State = {
  materials: [],                                               // 全部有效物料（不含回收站）

  /* 重新加载物料列表（增删改后调用） */
  refreshMaterials: async function () {
    var all = await DB.all('materials');                       // 查全部物料
    var list = [];                                              // 有效物料
    for (var i = 0; i < all.length; i++) {
      if (all[i].deleted) continue;                            // 回收站里的跳过
      list.push(all[i]);                                        // 加入列表
    }
    list.sort(function (a, b) { return (a.code || '').localeCompare(b.code || ''); });  // 按编号排序
    this.materials = list;                                      // 更新缓存
    for (var j = 0; j < list.length; j++) Search.buildIndex(list[j]);  // 顺便重建搜索索引
    return list;                                                // 返回列表
  },

  /* 全量加载记录（统计/历史页面用） */
  loadRecords: function () { return DB.all('records'); },

  /* 计算库存预警物料列表：低于预警线的在前 */
  alertList: function () {
    var arr = [];                                               // 预警列表
    for (var i = 0; i < this.materials.length; i++) {           // 遍历物料
      var m = this.materials[i];                               // 单个物料
      if (!m.minStock || m.minStock <= 0) continue;            // 没设预警线的不算
      if (m.stock <= m.minStock) arr.push({ m: m, level: 'danger' });   // 低于线：红色告急
      else if (m.stock <= m.minStock * 1.5) arr.push({ m: m, level: 'warn' });  // 1.5 倍以内：黄色提醒
    }
    arr.sort(function (a, b) { return (a.m.stock / a.m.minStock) - (b.m.stock / b.m.minStock); });  // 越接近耗尽排越前
    return arr;                                                 // 返回
  }
};

/* ==================== 7. Search：模糊搜索引擎 ==================== */
/* 支持中文名/拼音全拼/拼音首字母/型号/丝印/别称/标签/描述/位置 全字段搜索 */

var Search = {
  /* 给单个物料构建搜索索引（拼接所有可搜索字段 + 拼音） */
  buildIndex: function (m) {
    var zh = [m.name, m.model, m.cat, m.sub, (m.tags || []).join(' '), m.silk, m.alias, m.desc, m.loc, m.code].join('|');  // 所有中文字段拼一起
    m._search = {                                               // 挂在内存字段 _search 上（下划线开头表示不入库）
      low: ('|' + zh + '|').toLowerCase(),                      // 全部转小写方便比对
      pinyinFull: toPinyinText(zh, 'full'),                     // 全拼
      pinyinFirst: toPinyinText(zh, 'first')                    // 拼音首字母
    };
  },

  /**
   * 搜索：query 支持空格分隔多个关键词（都要命中）
   * 返回按相关度排序的物料数组
   */
  query: function (q, materials) {
    var list = materials || State.materials;                    // 默认搜全部物料
    var words = String(q || '').trim().toLowerCase().split(/\s+/).filter(function (w) { return w.length > 0; });  // 拆词并去空
    if (words.length === 0) return list.slice();                // 空搜索返回全部
    var results = [];                                            // 结果集
    for (var i = 0; i < list.length; i++) {                      // 遍历物料
      var m = list[i];                                          // 单个物料
      if (!m._search) this.buildIndex(m);                        // 没索引就现建
      var score = 0;                                            // 相关度得分
      var allHit = true;                                        // 是否所有关键词都命中
      for (var w = 0; w < words.length; w++) {                  // 逐个关键词检查
        var word = words[w];                                    // 当前关键词
        var s = this.scoreWord(m, word);                        // 计算这个词的得分
        if (s <= 0) { allHit = false; break; }                  // 有词没命中：直接淘汰
        score += s;                                             // 累加得分
      }
      if (allHit) results.push({ m: m, score: score });         // 全命中：加入结果
    }
    results.sort(function (a, b) { return b.score - a.score; });  // 得分高的排前面
    var out = [];                                               // 提取物料本体
    for (var r = 0; r < results.length; r++) out.push(results[r].m);  // 转成纯物料数组
    return out;                                                  // 返回
  },

  /* 单个关键词在单个物料上的得分（0 表示没命中） */
  scoreWord: function (m, word) {
    var idx = m._search;                                        // 索引
    var pinyinW = toPinyinText(word, 'full');                   // 关键词转全拼
    var pinyinF = toPinyinText(word, 'first');                  // 关键词转首字母
    var score = 0;                                               // 总分
    /* 名称命中权重最高 */
    var name = (m.name || '').toLowerCase();                     // 小写名称
    if (name.indexOf(word) >= 0) score += 100;                   // 直接包含
    /* 别称 / 丝印 / 型号 */
    var alias = (m.alias || '').toLowerCase();                   // 小写别称
    if (alias.indexOf(word) >= 0) score += 60;                   // 别称命中
    var silk = (m.silk || '').toLowerCase();                     // 小写丝印
    if (silk.indexOf(word) >= 0) score += 50;                    // 丝印命中
    var model = (m.model || '').toLowerCase();                   // 小写型号
    if (model.indexOf(word) >= 0) score += 40;                  // 型号命中
    /* 编号 */
    if ((m.code || '').toLowerCase().indexOf(word) >= 0) score += 35;  // 编号命中
    /* 标签 / 类别 / 位置 / 描述 */
    var tags = (m.tags || []).join(',').toLowerCase();           // 小写标签串
    if (tags.indexOf(word) >= 0) score += 30;                    // 标签命中
    var cat = ((m.cat || '') + '/' + (m.sub || '')).toLowerCase();  // 小写类别
    if (cat.indexOf(word) >= 0) score += 20;                     // 类别命中
    var loc = (m.loc || '').toLowerCase();                       // 小写位置
    if (loc.indexOf(word) >= 0) score += 15;                     // 位置命中
    var desc = (m.desc || '').toLowerCase();                     // 小写描述
    if (desc.indexOf(word) >= 0) score += 10;                    // 描述命中（权重低）
    /* 拼音匹配：输入 dianzu 或 dz 都能找到"电阻" */
    if (pinyinW && pinyinW.length >= 2) {                        // 关键词能转成拼音才比较
      if (idx.pinyinFull.indexOf(pinyinW) >= 0) score += 45;     // 全拼命中
      if (idx.pinyinFirst.indexOf(pinyinF) >= 0 && pinyinF.length >= 2) score += 25;  // 首字母命中（至少两个字母）
    }
    /* 全局兜底：任何字段的小写串里包含关键词 */
    if (score === 0 && idx.low.indexOf(word) >= 0) score += 8;   // 低权重兜底命中
    return score;                                                // 返回得分
  }
};

/* ==================== 8. UI：轻提示 / 弹窗 / 确认框 ==================== */

/* 右上角轻提示：toast('保存成功', 'ok')  type: ok / err / warn */
function toast(msg, type) {
  var wrap = $('#toast-wrap');                                   // 提示容器（首次使用时创建）
  if (!wrap) {                                                   // 容器不存在
    wrap = document.createElement('div');                        // 创建容器
    wrap.id = 'toast-wrap';                                      // 设置 id
    wrap.className = 'toast-wrap';                               // 应用样式
    document.body.appendChild(wrap);                             // 加入页面
  }
  var t = document.createElement('div');                         // 单条提示
  t.className = 'toast' + (type === 'ok' ? ' t-ok' : type === 'err' ? ' t-err' : type === 'warn' ? ' t-warn' : '');  // 类型样式
  t.textContent = msg;                                           // 提示文字（用 textContent 防注入）
  wrap.appendChild(t);                                           // 显示
  setTimeout(function () {                                       // 3 秒后自动消失
    t.style.opacity = '0';                                       // 渐隐
    t.style.transition = 'opacity .3s';                          // 过渡动画
    setTimeout(function () { t.remove(); }, 320);                // 完全移除
  }, 3000);
}

/* 打开弹窗：openModal(标题, 内容HTML, 底部HTML, 是否宽弹窗) */
function openModal(title, bodyHtml, footHtml, wide) {
  closeModal();                                                   // 先关掉旧弹窗（保持单例）
  var mask = document.createElement('div');                      // 遮罩层
  mask.id = 'modal-mask';                                         // 设置 id
  mask.className = 'modal-mask';                                  // 应用样式
  mask.innerHTML = '' +
    '<div class="modal' + (wide ? ' wide' : '') + '">' +          // 弹窗主体（可加宽）
      '<div class="modal-head">' +                                // 标题栏
        '<span>' + title + '</span>' +                            // 标题文字
        '<button class="icon-btn" onclick="closeModal()" title="关闭">' + ICONS.close + '</button>' +  // 关闭按钮
      '</div>' +
      '<div class="modal-body">' + bodyHtml + '</div>' +          // 内容区
      (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +  // 底部按钮（可选）
    '</div>';
  mask.addEventListener('click', function (e) {                    // 点遮罩空白处关闭
    if (e.target === mask) closeModal();                          // 只有直接点到遮罩才关
  });
  document.body.appendChild(mask);                                // 显示弹窗
  return mask;                                                    // 返回 DOM 方便后续操作
}

/* 关闭弹窗 */
function closeModal() {
  var mask = $('#modal-mask');                                    // 找到遮罩
  if (mask) mask.remove();                                        // 移除
}

/**
 * 确认框：await confirmBox('确定删除吗？')
 * 返回 Promise，点确定 resolve(true)，点取消 resolve(false)
 */
function confirmBox(msg, okText) {
  return new Promise(function (resolve) {                         // 包成 Promise
    openModal('请确认', '' +
      '<div style="font-size:14px;padding:6px 2px 14px;">' + escapeHtml(msg) + '</div>' +  // 提示文字
      '<div class="modal-foot" style="padding:0 0 6px;">' +
        '<button class="btn" id="cf-no">取消</button>' +           // 取消按钮
        '<button class="btn btn-danger" id="cf-yes">' + (okText || '确定') + '</button>' +  // 确定按钮
      '</div>');
    $('#cf-yes').onclick = function () { closeModal(); resolve(true); };   // 确定：关闭并返回 true
    $('#cf-no').onclick = function () { closeModal(); resolve(false); };  // 取消：关闭并返回 false
  });
}

/* ==================== 9. Log：系统操作日志 ==================== */
/* 管理员可查看谁做过什么，出问题方便追溯 */

var Log = {
  /* 写一条日志：Log.add('删除物料', '删除了 OLED 屏') */
  add: async function (action, detail) {
    await DB.put('logs', {                                       // 写入日志表
      id: uid('log'),                                            // 唯一编号
      user: Auth.user ? Auth.user.username : '系统',              // 操作人（未登录记"系统"）
      action: action,                                            // 动作
      detail: detail || '',                                      // 详情
      time: Date.now()                                           // 时间
    });
  }
};

/* ==================== 10. SVG 图标库 ==================== */
/* 内联 SVG 图标：不依赖任何在线图标库，断网可用 */

var ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-4H3zM13 7h8V3h-8z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v6h6"/><path d="M3.5 13a9 9 0 102.1-7.4L3 9"/><path d="M12 7v5l4 2"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a4 4 0 014 4c2.5.5 4 2.5 4 5a5 5 0 01-4 4.9V19a2 2 0 01-2 2h-4a2 2 0 01-2-2v-3.1A5 5 0 014 11c0-2.5 1.5-4.5 4-5a4 4 0 014-4z"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12.2 19"/></svg>',
  loc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>'
};

/* ==================== 11. 通用图表（纯 SVG，无外部依赖） ==================== */

/**
 * 横向条形排行图：barChart([{label, value, text}], {max})
 * 返回 HTML 字符串
 */
function barChart(items) {
  if (!items || items.length === 0) return '<div class="empty">暂无数据</div>';  // 空数据
  var max = 0;                                                   // 最大值（用于算比例）
  for (var i = 0; i < items.length; i++) { if (items[i].value > max) max = items[i].value; }  // 找最大
  if (max <= 0) max = 1;                                         // 防除零
  var html = '';                                                 // 输出
  for (var j = 0; j < items.length; j++) {                        // 逐条画
    var it = items[j];                                            // 当前条目
    var pct = Math.round(it.value / max * 100);                  // 百分比宽度
    html += '<div class="bar-row">' +
      '<div class="b-label" title="' + escapeHtml(it.label) + '">' + escapeHtml(it.label) + '</div>' +  // 标签
      '<div class="b-track"><div class="b-fill" style="width:' + pct + '%"></div></div>' +              // 条形
      '<div class="b-val">' + escapeHtml(it.text || it.value) + '</div>' +                              // 数值
      '</div>';
  }
  return html;                                                    // 返回 HTML
}

/**
 * 折线图（SVG）：lineChart(labels, values)
 * 用于月度趋势
 */
function lineChart(labels, values, unit) {
  if (!labels || labels.length === 0) return '<div class="empty">暂无数据</div>';  // 空数据
  var W = 640, H = 220, P = 40;                                   // 画布宽高与内边距
  var max = 0;                                                    // 最大值
  for (var i = 0; i < values.length; i++) { if (values[i] > max) max = values[i]; }  // 找最大
  if (max <= 0) max = 1;                                          // 防除零
  var stepX = (W - P * 2) / Math.max(labels.length - 1, 1);       // X 轴步长
  var pts = '';                                                   // 折线坐标点串
  var dots = '';                                                  // 数据圆点串
  for (var k = 0; k < values.length; k++) {                       // 逐点计算
    var x = P + stepX * k;                                        // x 坐标
    var y = H - P - (values[k] / max) * (H - P * 2);              // y 坐标（值越大越靠上）
    pts += (k === 0 ? 'M' : 'L') + x + ',' + y;                   // 拼路径命令
    dots += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="var(--primary)"/>' +  // 数据点
      '<text x="' + x + '" y="' + (y - 10) + '" font-size="11" text-anchor="middle" fill="currentColor">' + values[k] + '</text>' +  // 数值标注
      '<text x="' + x + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="currentColor" opacity="0.6">' + escapeHtml(labels[k]) + '</text>';  // 横轴标签
  }
  return '<div class="chart-box"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto">' +  // SVG 容器
    '<path d="' + pts + '" stroke="var(--primary)" stroke-width="2.5" fill="none" stroke-linejoin="round"/>' +  // 折线
    dots + '</svg></div>';                                        // 输出
}

/* 环形图数据注册表：把每张图的数据存起来，悬停/点击时按编号取回成分 */
var DONUT_REG = {};                                              // {编号: {items, total}}
var donutSeq = 0;                                                // 自增编号，保证每张图唯一

/**
 * 环形占比图：donutChart([{label, value}], opts)
 * opts.size        图表显示宽度（像素，默认 150）
 * opts.legendBelow true = 成分图例放在图下面（适合卡片较窄时竖着排）
 * 颜色自动从调色板循环取；鼠标悬停/点击某一段时，圆心显示该成分名称与占比
 */
function donutChart(items, opts) {
  var colors = ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316', '#14b8a6', '#64748b'];  // 调色板
  if (!items || items.length === 0) return '<div class="empty">暂无数据</div>';   // 空数据
  var total = 0;                                                   // 总量
  for (var i = 0; i < items.length; i++) total += items[i].value;  // 求和
  if (total <= 0) return '<div class="empty">暂无数据</div>';     // 全 0
  var o = opts || {};                                              // 可选配置（不传也不报错）
  var size = o.size || 150;                                        // 图表宽度
  var below = !!o.legendBelow;                                     // 成分是否放图下
  var uid = 'd' + (++donutSeq);                                    // 本张图的唯一编号
  DONUT_REG[uid] = { items: items, total: total };                 // 存数据供事件处理用
  var cx = 60, cy = 60, r = 52, sw = 16;                           // 圆心/半径/环宽
  var angle = -Math.PI / 2;                                       // 从 12 点方向开始
  var segs = '';                                                   // 各段环
  var legend = '';                                                 // 图例
  for (var k = 0; k < items.length; k++) {                         // 逐段绘制
    var frac = items[k].value / total;                             // 占比
    var a2 = angle + frac * Math.PI * 2 - 0.02;                    // 结束角（留一点缝）
    var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);    // 起点
    var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);           // 终点
    var large = frac > 0.5 ? 1 : 0;                                // 是否大弧
    var col = colors[k % colors.length];                           // 本段颜色
    /* 悬停与点击事件：桌面鼠标移上去生效，手机点一下也生效 */
    var ev = ' onmouseenter="donutSegShow(\'' + uid + '\',' + k + ')" onmouseout="donutSegReset(\'' + uid + '\')" onclick="donutSegShow(\'' + uid + '\',' + k + ')"';
    if (frac > 0.999) {                                            // 占满 100% 的特殊处理（单类别）
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"' + ev + ' style="cursor:pointer"/>';
    } else {
      segs += '<path d="M' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"' + ev + ' style="cursor:pointer"/>';
    }
    angle = a2 + 0.02;                                             // 下一段起始角
    legend += '<span class="badge badge-gray" style="margin:2px;background:' + col + '1a;color:' + col + '">' +  // 图例条目
      escapeHtml(items[k].label) + ' ' + Math.round(frac * 100) + '%</span> ';  // 名称+占比
  }
  /* 圆心文字：默认显示"总计 + 总量"，悬停/点击时换成"成分 + 数量占比" */
  var center = '<text id="dnt-l-' + uid + '" x="60" y="56" font-size="10" text-anchor="middle" fill="var(--text-sub)">总计</text>' +
    '<text id="dnt-v-' + uid + '" x="60" y="73" font-size="13" font-weight="bold" text-anchor="middle" fill="var(--primary)">' + (Math.round(total * 10) / 10) + '</text>';
  var svg = '<svg viewBox="0 0 120 120" style="width:' + size + 'px;max-width:100%;' + (below ? 'margin:0 auto;display:block' : 'flex:none') + '">' + segs + center + '</svg>';  // 环形本体（含圆心文字）
  if (below) {                                                     // 竖排：图在上、成分在下
    return '<div>' + svg + '<div class="chips-row" style="justify-content:center;margin-top:10px">' + legend + '</div></div>';
  }
  return '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">' +  // 横排（老样式）：图在左、成分在右
    svg + '<div class="chips-row" style="flex:1;min-width:180px">' + legend + '</div></div>';
}

/* 悬停/点击环形的某一段：圆心切换显示该成分名称 + 数量 + 占比 */
function donutSegShow(uid, k) {
  var d = DONUT_REG[uid];                                          // 取本图数据
  var le = document.getElementById('dnt-l-' + uid);                // 圆心名称行
  var ve = document.getElementById('dnt-v-' + uid);                // 圆心数值行
  if (!d || !le || !ve) return;                                    // 图已不在页面上就忽略
  var it = d.items[k];                                             // 当前成分
  var pct = Math.round(it.value / d.total * 1000) / 10;            // 占比（保留 1 位小数）
  le.textContent = it.label;                                       // 名称
  ve.textContent = (Math.round(it.value * 10) / 10) + ' · ' + pct + '%';  // 数量与占比
}

/* 鼠标移开：圆心恢复"总计"显示 */
function donutSegReset(uid) {
  var d = DONUT_REG[uid];                                          // 取本图数据
  var le = document.getElementById('dnt-l-' + uid);
  var ve = document.getElementById('dnt-v-' + uid);
  if (!d || !le || !ve) return;                                    // 图已不在页面上就忽略
  le.textContent = '总计';                                          // 恢复标题
  ve.textContent = Math.round(d.total * 10) / 10;                  // 恢复总量
}
