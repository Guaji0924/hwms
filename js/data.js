/* ============================================================
   data.js —— 静态数据文件
   ------------------------------------------------------------
   内容：
   1. PINYIN_MAP  汉字拼音表（用于拼音模糊搜索，如搜 dianzu 找到"电阻"）
   2. toPinyinText() 把中文文本转成拼音（全拼 / 首字母）
   3. CATEGORY_TREE 默认分类树（母分类 + 子分类）
   4. ALIAS_MAP 常见元器件别称表（如 灯珠 -> LED）
   5. RECIPES 智能配料模板库（本地规则引擎用，断网也能智能配料）
   6. UNIT_OPTIONS 物料单位选项
   7. DEMO_MATERIALS 示例物料数据（首次使用可一键导入体验）
   8. genDemoRecords() 生成示例出入库记录
   ============================================================ */

/* ============ 1. 汉字拼音映射表 ============ */
/* 键为单个汉字，值为小写拼音（不含声调）；多音字用空格分隔多个读音 */
var PINYIN_MAP = {
  /* 数字与量词 */
  "一": "yi", "二": "er", "两": "liang", "三": "san", "四": "si", "五": "wu",
  "六": "liu", "七": "qi", "八": "ba", "九": "jiu", "十": "shi", "百": "bai",
  "千": "qian", "万": "wan", "亿": "yi", "零": "ling",
  "个": "ge", "只": "zhi", "支": "zhi", "条": "tiao", "根": "gen", "包": "bao",
  "盒": "he", "卷": "juan", "米": "mi", "颗": "ke", "片": "pian", "对": "dui",
  "套": "tao", "把": "ba", "块": "kuai", "层": "ceng", "台": "tai", "位": "wei",
  "孔": "kong", "点": "dian", "次": "ci", "回": "hui", "种": "zhong", "份": "fen",
  /* 元件基础 */
  "电": "dian", "阻": "zu", "容": "rong", "感": "gan", "器": "qi", "极": "ji",
  "管": "guan", "晶": "jing", "振": "zhen", "开": "kai", "关": "guan",
  "继": "ji", "蜂": "feng", "鸣": "ming", "传": "chuan", "芯": "xin", "排": "pai",
  "针": "zhen", "焊": "han", "锡": "xi", "烙": "lao", "铁": "tie",
  "头": "tou", "吸": "xi", "镊": "nie", "子": "zi", "钳": "qian", "刀": "dao",
  "剪": "jian", "螺": "luo luo", "丝": "si luo si", "钉": "ding", "母": "mu",
  "垫": "dian", "柱": "zhu", "轴": "zhou", "承": "cheng", "齿": "chi", "轮": "lun lun",
  "皮": "pi", "带": "dai dai", "链": "lian", "杆": "gan", "轨": "gui",
  /* 器件类型 */
  "模": "mo", "屏": "ping", "数": "shu", "码": "ma", "阵": "zhen", "灯": "deng",
  "键": "jian", "摇": "yao", "杆": "gan", "编": "bian", "舵": "duo",
  "步": "bu", "进": "jin", "伺": "si", "服": "fu", "直": "zhi", "流": "liu",
  "交": "jiao", "马": "ma", "达": "da", "底": "di", "盘": "pan", "架": "jia",
  "板": "ban", "亚": "ya", "克": "ke", "力": "li", "铝": "lv", "铜": "tong",
  "钢": "gang", "合": "he", "金": "jin", "属": "shu", "塑": "su", "胶": "jiao",
  /* 功能与属性 */
  "发": "fa", "红": "hong", "绿": "lv", "蓝": "lan", "白": "bai", "黄": "huang",
  "彩": "cai", "颜": "yan", "色": "se", "亮": "liang", "闪": "shan",
  "外": "wai", "超": "chao", "声": "sheng", "陀": "tuo", "螺": "luo",
  "仪": "yi", "姿": "zi", "态": "tai", "角": "jiao", "倾": "qing", "斜": "xie",
  "烟": "yan", "雾": "wu", "火": "huo", "焰": "yan", "雨": "yu", "温": "wen",
  "度": "du", "湿": "shi", "光": "guang", "敏": "min", "磁": "ci", "压": "ya",
  "强": "qiang", "速": "su", "加": "jia", "距": "ju", "离": "li", "测": "ce",
  "循": "xun", "迹": "ji", "巡": "xun", "灰": "hui", "避": "bi", "障": "zhang",
  "识": "shi", "别": "bie", "触": "chu", "摸": "mo", "滑": "hua", "动": "dong",
  "自": "zi", "手": "shou", "机": "ji", "遥": "yao", "控": "kong", "车": "che",
  /* 板卡与芯片 */
  "单": "dan", "片": "pian", "开": "kai", "发": "fa", "最": "zui", "小": "xiao",
  "系": "xi", "统": "tong", "主": "zhu", "控": "kong", "核": "he", "心": "xin",
  "树": "shu", "莓": "mei", "派": "pai", "内": "nei", "存": "cun", "储": "chu",
  "卡": "ka", "读": "du", "逻": "luo", "辑": "ji", "门": "men",
  /* 电源 */
  "稳": "wen", "升": "sheng", "降": "jiang", "充": "chong", "池": "chi",
  "锂": "li", "离": "li", "蓄": "xu", "适": "shi", "配": "pei", "插": "cha",
  "座": "zuo", "接": "jie", "口": "kou", "转": "zhuan", "扩": "kuo",
  "坞": "wu", "公": "gong", "母": "mu", "伏": "fu", "安": "an", "瓦": "wa",
  /* 通信 */
  "蓝": "lan", "牙": "ya", "无": "wu", "线": "xian", "射": "she", "频": "pin",
  "率": "lv", "标": "biao", "签": "qian", "输": "shu", "串": "chuan",
  "并": "bing", "行": "xing hang", "协": "xie", "议": "yi", "太": "tai",
  "网": "wang", "连": "lian", "通": "tong", "信": "xin",
  /* 线材与耗材 */
  "杜": "du", "邦": "bang", "面": "mian", "包": "bao", "跳": "tiao",
  "鳄": "e", "鱼": "yu", "夹": "jia", "松": "song", "助": "zhu", "剂": "ji",
  "热": "re", "缩": "suo", "扎": "za", "双": "shuang", "绝": "jue", "缘": "yuan",
  "漆": "qi", "箔": "bo", "洗": "xi", "带": "dai", "纸": "zhi", "布": "bu",
  "海": "hai", "绵": "mian", "棉": "mian",
  /* 动作与流程 */
  "买": "mai", "入": "ru", "出": "chu", "库": "ku", "领": "ling", "用": "yong",
  "借": "jie", "还": "huan", "消": "xiao", "耗": "hao", "损": "sun",
  "赠": "zeng", "送": "song", "废": "fei", "回": "hui", "收": "shou",
  "归": "gui", "登": "deng", "记": "ji", "添": "tian", "加": "jia", "删": "shan",
  "改": "gai", "修": "xiu", "补": "bu", "购": "gou", "售": "shou", "卖": "mai",
  /* 界面与系统 */
  "名": "ming", "称": "cheng", "型": "xing", "号": "hao", "规": "gui",
  "格": "ge", "类": "lei", "别": "bie", "单": "dan", "位": "wei", "置": "zhi",
  "价": "jia", "链": "lian", "接": "jie", "参": "can", "考": "kao", "供": "gong",
  "商": "shang", "库": "ku", "存": "cun", "警": "jing", "线": "xian",
  "剩": "sheng", "余": "yu", "缺": "que", "充": "chong", "足": "zu", "够": "gou",
  "建": "jian", "议": "yi", "需": "xu", "要": "yao", "数": "shu", "量": "liang",
  "备": "bei", "注": "zhu", "描": "miao", "述": "shu", "途": "tu", "说": "shuo",
  "明": "ming", "维": "wei", "护": "hu", "金": "jin", "额": "e", "统": "tong",
  "计": "ji", "排": "pai", "行": "xing hang", "项": "xiang", "目": "mu",
  "协": "xie", "会": "hui", "员": "yuan", "临": "lin", "时": "shi",
  "权": "quan", "限": "xian", "管": "guan", "理": "li", "账": "zhang",
  "密": "mi", "登": "deng", "录": "lu", "密": "mi", "码": "ma",
  /* 时间与其他 */
  "年": "nian", "月": "yue", "日": "ri", "时": "shi", "秒": "miao",
  "周": "zhou", "季": "ji", "今": "jin", "天": "tian", "昨": "zuo",
  "最": "zui", "近": "jin", "上": "shang", "下": "xia", "新": "xin",
  "旧": "jiu", "高": "gao", "低": "di", "大": "da", "中": "zhong", "多": "duo",
  "少": "shao", "长": "chang zhang", "短": "duan", "宽": "kuan", "厚": "hou",
  "薄": "bao", "重": "zhong chong", "轻": "qing", "好": "hao", "坏": "huai",
  "常": "chang", "备": "bei", "灵": "ling", "敏": "min", "通": "tong",
  "断": "duan", "源": "yuan", "备": "bei", "份": "fen", "恢": "hui", "复": "fu",
  "成": "cheng", "本": "ben", "花": "hua", "费": "fei", "钱": "qian", "值": "zhi",
  "总": "zong", "共": "gong", "平": "ping", "均": "jun", "约": "yue",
  "太": "tai", "各": "ge", "每": "mei", "全": "quan", "部": "bu", "半": "ban",
  "第": "di", "甲": "jia", "乙": "yi", "丙": "bing", "丁": "ding",
  "北": "bei", "南": "nan", "东": "dong", "西": "xi",
  "工": "gong", "具": "ju", "物": "wu", "料": "liao", "品": "pin", "货": "huo",
  "用": "yong", "途": "tu", "装": "zhuang", "置": "zhi", "盒": "he", "箱": "xiang",
  "柜": "gui", "抽": "chou", "屉": "ti", "摸": "mo", "选": "xuan", "择": "ze",
  "搜": "sou", "索": "suo", "查": "cha", "找": "zhao", "筛": "shai",
  "选": "xuan", "导": "dao", "进": "jin", "增": "zeng", "减": "jian",
  "超": "chao", "级": "ji", "特": "te", "专": "zhuan", "普": "pu",
  "通": "tong", "员": "yuan", "组": "zu", "队": "dui", "批": "pi",
  "次": "ci", "枚": "mei", "张": "zhang", "本": "ben", "册": "ce", "页": "ye",
  "表": "biao", "单": "dan", "据": "ju", "文": "wen", "字": "zi", "图": "tu",
  "片": "pian", "标": "biao", "打": "da", "印": "yin", "扫": "sao",
  "贴": "tie", "固": "gu", "定": "ding", "旋": "xuan", "拧": "ning",
  "紧": "jin", "松": "song", "弹": "tan", "簧": "huang", "扇": "shan",
  "泵": "beng", "阀": "fa", "喷": "pen", "嘴": "zui", "管": "guan",
  "道": "dao", "槽": "cao", "轮": "lun", "滑": "hua", "轨": "gui", "梁": "liang",
  "臂": "bi", "手": "shou", "爪": "zhua", "夹": "jia", "持": "chi",
  "升": "sheng", "托": "tuo", "底": "di", "脚": "jiao", "支": "zhi",
  "撑": "cheng", "固": "gu", "锁": "suo", "扣": "kou", "钩": "gou",
  "挂": "gua", "吊": "diao", "绳": "sheng", "索": "suo", "链": "lian",
  "调": "tiao diao", "校": "jiao xiao", "准": "zhun", "试": "shi",
  "验": "yan", "测": "ce", "检": "jian", "监": "jian", "听": "ting",
  "看": "kan", "观": "guan", "察": "cha", "显": "xian", "示": "shi",
  "播": "bo", "放": "fang", "录": "lu", "音": "yin", "频": "pin", "像": "xiang",
  "相": "xiang", "摄": "she", "镜": "jing", "变": "bian", "调": "tiao diao",
  "节": "jie", "省": "sheng", "电": "dian", "能": "neng", "耗": "hao",
  "压": "ya", "流": "liu", "阻": "zu", "抗": "kang", "干": "gan",
  "扰": "rao", "噪": "zao", "信": "xin", "噪": "zao", "比": "bi",
  "精": "jing", "确": "que", "误": "wu", "差": "cha chai",
  "率": "lv", "周": "zhou", "期": "qi", "脉": "mai", "宽": "kuan",
  "占": "zhan", "空": "kong", "比": "bi"
};

/**
 * 把一段中文文本转成拼音
 * mode = 'full' 返回全拼连写（如 电阻 -> dianzu）
 * mode = 'first' 返回首字母（如 电阻 -> dz）
 * 英文与数字原样保留；多音字的第一个读音参与全拼、全部读音参与匹配
 */
function toPinyinText(text, mode) {
  var result = '';                                             // 存放拼好的结果
  for (var i = 0; i < text.length; i++) {                      // 逐个字符处理
    var ch = text[i];                                          // 当前字符
    var py = PINYIN_MAP[ch];                                   // 查拼音表
    if (py) {                                                  // 如果是已知汉字
      var parts = py.split(' ');                               // 拆出读音（可能多个）
      if (mode === 'first') {                                  // 首字母模式
        for (var p = 0; p < parts.length; p++) {               // 多音字每个读音的首字母都拼上（提高命中率）
          result += parts[p].charAt(0);                        // 取读音首字母
        }
      } else {                                                 // 全拼模式取第一个读音
        result += parts[0];                                    // 拼接全拼
      }
    } else if (/[a-zA-Z0-9]/.test(ch)) {                       // 字母数字原样保留
      result += ch.toLowerCase();                              // 统一小写
    }                                                          // 其他符号忽略
  }
  return result;                                               // 返回拼音串
}

/**
 * 只提取文本里的"连续汉字段"转成拼音，汉字段之间用 | 分隔；字母、数字、符号一律忽略。
 * 用途：构建拼音搜索索引。这样索引里不会出现"汉字拼音 + 相邻英文"拼成的假词
 * （例如别称"全彩led"不会产生 "cl"，搜"车轮 cl"就不会误命中）。
 * mode = 'full' 全拼（电阻 -> dianzu）；mode = 'first' 首字母（电阻 -> dz）
 */
function toPinyinRuns(text, mode) {
  var runs = [];                                               // 存放各汉字段的拼音
  var buf = '';                                                // 当前汉字段的拼音缓冲
  for (var i = 0; i < text.length; i++) {                      // 逐字符扫描
    var py = PINYIN_MAP[text[i]];                              // 查拼音表
    if (py) {                                                  // 命中：是已知汉字
      var parts = py.split(' ');                               // 多音字拆成多个读音
      if (mode === 'first') {                                  // 首字母模式：每个读音的首字母都拼上
        for (var p = 0; p < parts.length; p++) buf += parts[p].charAt(0);
      } else {                                                 // 全拼模式：取第一个读音
        buf += parts[0];
      }
    } else if (buf) {                                          // 遇到非汉字：当前汉字段结束，收尾
      runs.push(buf); buf = '';
    }
  }
  if (buf) runs.push(buf);                                     // 最后一段收尾
  return runs.join('|');                                       // 段与段用 | 隔开（隔离，防止跨段拼接）
}

/* ============ 2. 默认分类树（参考嘉立创商城分类体系，可在设置中自由增删改） ============ */
/* 分类分两级：name 是母分类，subs 是子分类列表 */
/* 管理员可以在「系统设置 → 物料分类」里添加自定义母分类/子分类，改完保存在本机并自动同步 */
var CATEGORY_TREE = [
  { name: '开发板/主控',  subs: ['51单片机', 'STM32', 'ESP32', 'Arduino', '树莓派', 'FPGA/CPLD', '其他主控'] },
  { name: '集成电路IC',   subs: ['电源管理IC', '运放/比较器', '逻辑芯片', '存储芯片', '时钟芯片', '驱动芯片', '通信接口IC', '音频芯片', '其他IC'] },
  { name: '基础元件',     subs: ['电阻', '电容', '电感/磁珠', '二极管', '三极管/MOS管', '集成芯片', '晶振', '保险丝', '开关/按键', '电位器', '蜂鸣器', '排针/排母', '其他元件'] },
  { name: '显示模块',     subs: ['OLED/LCD', 'LCD/TFT', '数码管', 'LED点阵', '指示灯', '电子纸', '其他显示'] },
  { name: '传感器',       subs: ['温度/湿度', '湿度', '距离', '光/颜色', '运动/姿态', '气体', '声音', '人体/红外', '压力/称重', '图像/摄像头', '其他传感器'] },
  { name: '电机/执行器',  subs: ['直流电机', '步进电机', '舵机', '电机驱动', '继电器', '泵/阀', '风扇', '其他执行器'] },
  { name: '通信模块',     subs: ['WiFi', '蓝牙', '无线电', 'NB-IoT/4G', 'RS485/CAN', 'RFID/NFC', 'GPS', '有线转接', '天线', '其他通信'] },
  { name: '电源管理',     subs: ['电池/电池盒', '充电模块', '稳压模块', 'DC-DC', 'LDO', '电源适配器', '太阳能', '其他电源'] },
  { name: '线材连接',     subs: ['杜邦线', 'USB线', '排线', '电源线', '鳄鱼夹线', '端子/接插件', 'PCB/洞洞板', '其他线材'] },
  { name: '工具',         subs: ['焊接工具', '测量仪器', '开发调试', '钳/刀', '螺丝刀', '镊子', '其他工具'] },
  { name: '耗材',         subs: ['焊锡/助焊', '热缩管', '胶类', '扎带', '螺丝螺母', '铜柱', '其他耗材'] },
  { name: '结构件',       subs: ['小车底盘', '车轮', '板材', '支架', '传动件', '3D打印件', '轴承', '其他结构件'] },
  { name: '其他',         subs: ['杂物', '待分类'] }
];

/* ============ 3. 常见元器件别称表 ============ */
/* 用于智能配料时把口语词映射到标准名称（如 用户说"灯珠" 实际是 LED） */
var ALIAS_MAP = {
  '灯珠': 'LED', '发光管': 'LED', '灯泡': 'LED',
  '马达': '电机', '电机': '电机', '电机构': '电机',
  '屏幕': 'OLED', '显示屏': 'OLED', '屏': 'OLED',
  '超声波': '超声波测距', '超声': '超声波测距',
  '循迹': '循迹传感器', '灰度': '灰度传感器',
  '蓝牙': '蓝牙模块', 'wifi': 'WiFi模块', 'WI-FI': 'WiFi模块',
  '电池': '18650', '电池盒': '电池盒',
  '线': '杜邦线', '跳线': '杜邦线', '面包线': '杜邦线',
  '板子': '开发板', '单片机': '开发板', '主控': '开发板',
  '烙铁': '电烙铁', '万用表': '万用表',
  '螺母': '螺母', '螺丝': '螺丝',
  '驱动': '电机驱动', '电机驱动': '电机驱动',
  '小舵机': '舵机', '舵盘': '舵机',
  '锂电': '18650', '充电模块': '充电模块',
  '测温': '温度传感器', '测距': '超声波测距'
};

/* ============ 4. 智能配料模板库（本地规则引擎） ============ */
/* 每个模板：keys 是触发关键词；needs 是所需物料（kw 用于匹配物料库） */
var RECIPES = [
  {
    name: '循迹小车',
    keys: ['循迹', '巡线', '轨迹', '线小车', '走线'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '电机驱动', n: 1,  why: '驱动两个电机' },
      { kw: '循迹|红外', n: 2, why: '检测黑线（左右各一）' },
      { kw: '直流',     n: 2,  why: '左右动力轮' },
      { kw: '车轮',     n: 2,  why: '驱动轮' },
      { kw: '底盘',     n: 1,  why: '车身' },
      { kw: '电池',     n: 1,  why: '供电' },
      { kw: '杜邦线',   n: 20, why: '连接电路' }
    ]
  },
  {
    name: '避障小车',
    keys: ['避障', '超声波小车', '躲避'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '电机驱动', n: 1,  why: '驱动电机' },
      { kw: '超声波',   n: 1,  why: '前方测距避障' },
      { kw: '舵机',     n: 1,  why: '转向扫描（可选）' },
      { kw: '直流',     n: 2,  why: '动力' },
      { kw: '车轮',     n: 2,  why: '驱动轮' },
      { kw: '底盘',     n: 1,  why: '车身' },
      { kw: '电池',     n: 1,  why: '供电' },
      { kw: '杜邦线',   n: 15, why: '连接电路' }
    ]
  },
  {
    name: '蓝牙遥控车',
    keys: ['遥控', '蓝牙车', '手机控制', '蓝牙遥控'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '电机驱动', n: 1,  why: '驱动电机' },
      { kw: '蓝牙',     n: 1,  why: '接收手机指令' },
      { kw: '直流',     n: 2,  why: '动力' },
      { kw: '车轮',     n: 2,  why: '驱动轮' },
      { kw: '底盘',     n: 1,  why: '车身' },
      { kw: '电池',     n: 1,  why: '供电' },
      { kw: '杜邦线',   n: 15, why: '连接电路' }
    ]
  },
  {
    name: '温湿度监测站',
    keys: ['温湿度', '温度监测', '环境监测', '气象站', '温度站'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '温湿度|DHT', n: 1, why: '采集温湿度' },
      { kw: 'OLED',    n: 1,  why: '显示数据' },
      { kw: '面包板',   n: 1,  why: '搭建电路（可选）' },
      { kw: '杜邦线',   n: 10, why: '连接电路' }
    ]
  },
  {
    name: '智能台灯',
    keys: ['台灯', '夜灯', '调光灯', '自动灯'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: 'LED',     n: 3,  why: '光源' },
      { kw: '光敏',     n: 1,  why: '检测环境光' },
      { kw: '按键',     n: 1,  why: '手动开关/调光' },
      { kw: '电阻',     n: 3,  why: '限流' },
      { kw: '杜邦线',   n: 10, why: '连接电路' }
    ]
  },
  {
    name: 'RFID 门禁',
    keys: ['门禁', '刷卡', 'rfid', 'RFID', 'IC卡'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: 'RFID',     n: 1,  why: '读取卡片' },
      { kw: '舵机|继电器', n: 1, why: '开锁执行器' },
      { kw: '蜂鸣器',   n: 1,  why: '提示音' },
      { kw: '杜邦线',   n: 12, why: '连接电路' }
    ]
  },
  {
    name: '电子时钟',
    keys: ['时钟', '闹钟', '计时器', '时间显示'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: 'OLED|数码管|LCD', n: 1, why: '显示时间' },
      { kw: 'DS1302|DS3231|时钟', n: 1, why: '走时芯片（可选）' },
      { kw: '按键',     n: 2,  why: '调时' },
      { kw: '蜂鸣器',   n: 1,  why: '闹铃' },
      { kw: '杜邦线',   n: 10, why: '连接电路' }
    ]
  },
  {
    name: '流水灯 / 灯效',
    keys: ['流水灯', '跑马灯', '彩灯', '灯效', '呼吸灯'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: 'LED',     n: 8,  why: '灯珠' },
      { kw: '电阻',     n: 8,  why: '限流' },
      { kw: '杜邦线',   n: 16, why: '连接电路' },
      { kw: '面包板',   n: 1,  why: '搭建电路（可选）' }
    ]
  },
  {
    name: '抢答器',
    keys: ['抢答', '竞赛答题'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '按键',     n: 4,  why: '抢答按钮' },
      { kw: 'LED',     n: 4,  why: '指示灯' },
      { kw: '蜂鸣器',   n: 1,  why: '提示音' },
      { kw: '电阻',     n: 4,  why: '限流' },
      { kw: '杜邦线',   n: 20, why: '连接电路' }
    ]
  },
  {
    name: '机械臂',
    keys: ['机械臂', '机械手', '云台', '舵机臂'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '舵机',     n: 3,  why: '关节转动' },
      { kw: '支架',     n: 1,  why: '臂身结构' },
      { kw: '电池',     n: 1,  why: '舵机需要独立供电' },
      { kw: '杜邦线',   n: 15, why: '连接电路' }
    ]
  },
  {
    name: '自动浇花装置',
    keys: ['浇花', '浇灌', '土壤', '自动浇水'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '土壤|湿度', n: 1, why: '检测土壤湿度' },
      { kw: '水泵',     n: 1,  why: '抽水' },
      { kw: '继电器',   n: 1,  why: '控制水泵' },
      { kw: '杜邦线',   n: 10, why: '连接电路' }
    ]
  },
  {
    name: '智能风扇',
    keys: ['风扇', '降温', '温控风扇'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '风扇',     n: 1,  why: '执行器' },
      { kw: '温度|温湿度', n: 1, why: '检测室温' },
      { kw: '三极管|继电器|驱动', n: 1, why: '驱动风扇' },
      { kw: '杜邦线',   n: 8,  why: '连接电路' }
    ]
  },
  {
    name: '超声波测距仪',
    keys: ['测距', '距离', '电子尺'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '超声波',   n: 1,  why: '测距传感器' },
      { kw: 'OLED|数码管', n: 1, why: '显示距离' },
      { kw: '杜邦线',   n: 8,  why: '连接电路' }
    ]
  },
  {
    name: '两轮平衡车',
    keys: ['平衡车', '自平衡', '两轮平衡'],
    needs: [
      { kw: '开发板',   n: 1,  why: '主控' },
      { kw: '陀螺仪|MPU', n: 1, why: '姿态检测' },
      { kw: '电机驱动', n: 1,  why: '驱动电机' },
      { kw: '直流',     n: 2,  why: '动力' },
      { kw: '车轮',     n: 2,  why: '驱动轮' },
      { kw: '电池',     n: 1,  why: '供电' },
      { kw: '杜邦线',   n: 15, why: '连接电路' }
    ]
  }
];

/* ============ 5. 物料单位选项 ============ */
var UNIT_OPTIONS = ['个', '只', '根', '条', '片', '颗', '对', '套', '包', '盒', '卷', '米', '把', '块', '台'];

/* ============ 6. 示例物料数据 ============ */
/* 取自协会真实台账，共 115 种常用件，分两批：
   ① 货柜件（A/B/C/D 架，编号 KFB/IC/JC/XS/CGQ/DJ/DY/XC）—— 主控、IC、模块、传感器等；
   ② 货架件（贴片料区，编号 HJ-xxx）—— 0805/0603 电阻电容、磁珠、LED、二极管、MOS、晶振等。
   名称/型号/封装/存放位置均取自真实台账，供应商与数据手册链接留空（台账没有就不编）。
   注意：真实库房里没有 OLED / 蓝牙 / 温湿度 / 舵机 / 车轮 / 底盘 / 面包板等模块，
   所以"智能配料"的部分模板会把这些件显示为"待采购"，这是正常现象。
   "数据管理"页一键载入，载入后按钮变成"撤回示例数据"，随时可一键撤回
   （只清 source='demo' 的示例数据，用户自己新增的物料和记录不受影响）。 */
var DEMO_MATERIALS = [
  /* --- 开发板 / 主控（全库就这一件主控模块） --- */
  { code: 'KFB-001', name: 'ESP32-WROOM-32 WiFi 模块', model: 'ESP32-WROOM-32', pkg: 'SMD38 18×25.5×3.1mm', locNo: 'A37', cat: '开发板/主控', sub: 'ESP32', tags: ['WiFi', '蓝牙', '物联网', '主控'], unit: '块', loc: '货柜', price: 22, stock: 6, minStock: 2, link: '', silk: 'ESP32-WROOM-32', alias: 'esp32;esp32wroom;乐鑫;wifi模块;无线模块', supplier: '', datasheet: '', desc: '自带 WiFi+蓝牙的双核模块，协会做无线/物联网项目的主控。' },
  /* --- 集成电路IC --- */
  { code: 'IC-001', name: 'NE555 定时器芯片', model: 'NE555DR', pkg: 'SOP-8', locNo: 'A40', cat: '集成电路IC', sub: '其他IC', tags: ['定时', '振荡', '经典'], unit: '个', loc: '货柜', price: 0.5, stock: 30, minStock: 10, link: '', silk: 'NE555', alias: '555;ne555;定时器;振荡器', supplier: '', datasheet: '', desc: '经典 555 定时器，做 PWM、振荡、延时电路必备。' },
  { code: 'IC-002', name: 'LM358 双运算放大器', model: 'LM358DR', pkg: 'SOP-8', locNo: 'A16', cat: '集成电路IC', sub: '运放/比较器', tags: ['运放', '常用'], unit: '个', loc: '货柜', price: 0.6, stock: 25, minStock: 8, link: '', silk: 'LM358', alias: '358;lm358;运放;双运放', supplier: '', datasheet: '', desc: '双路通用运放，信号放大、比较电路最常用。' },
  { code: 'IC-003', name: 'LM324 四运算放大器', model: 'LM324DR', pkg: 'SOIC-14', locNo: 'A37', cat: '集成电路IC', sub: '运放/比较器', tags: ['运放'], unit: '个', loc: '货柜', price: 0.8, stock: 15, minStock: 5, link: '', silk: 'LM324', alias: '324;lm324;四运放', supplier: '', datasheet: '', desc: '四路通用运放，单电源供电，传感器信号调理常用。' },
  { code: 'IC-004', name: 'LM339 四电压比较器', model: 'LM339DR', pkg: 'SOIC-14', locNo: 'A23', cat: '集成电路IC', sub: '运放/比较器', tags: ['比较器'], unit: '个', loc: '货柜', price: 0.7, stock: 12, minStock: 5, link: '', silk: 'LM339', alias: '339;lm339;比较器', supplier: '', datasheet: '', desc: '四路电压比较器，做阈值检测、波形整形。' },
  { code: 'IC-005', name: 'NE5532 音频运算放大器', model: 'NE5532DR', pkg: 'SOIC-8', locNo: 'A14', cat: '集成电路IC', sub: '音频芯片', tags: ['运放', '音频', '低噪声'], unit: '个', loc: '货柜', price: 1.2, stock: 15, minStock: 5, link: '', silk: 'NE5532', alias: '5532;ne5532;音频运放', supplier: '', datasheet: '', desc: '低噪声双运放，音频前级、功放前级用。' },
  { code: 'IC-006', name: 'TL431 可调精密基准源', model: 'TL431', pkg: 'TO-92', locNo: 'D32', cat: '集成电路IC', sub: '电源管理IC', tags: ['基准源', '稳压'], unit: '个', loc: '货柜', price: 0.3, stock: 30, minStock: 10, link: '', silk: 'TL431', alias: '431;tl431;基准源;稳压', supplier: '', datasheet: '', desc: '可调并联稳压基准，电源反馈、基准电压用。' },
  { code: 'IC-007', name: '74HC595 移位寄存器', model: '74HC595N', pkg: 'DIP-16', locNo: 'A57', cat: '集成电路IC', sub: '逻辑芯片', tags: ['IO扩展', '常用'], unit: '个', loc: '货柜', price: 0.8, stock: 25, minStock: 8, link: '', silk: '74HC595N', alias: '595;74hc595;移位寄存器;io扩展', supplier: '', datasheet: '', desc: '8 位串入并出移位寄存器，可级联扩展 IO 驱动数码管/LED。' },
  { code: 'IC-008', name: '74HC138 3-8线译码器', model: '74HC138D', pkg: 'SOIC-16', locNo: 'A20', cat: '集成电路IC', sub: '逻辑芯片', tags: ['译码'], unit: '个', loc: '货柜', price: 0.6, stock: 20, minStock: 5, link: '', silk: '74HC138', alias: '138;74hc138;译码器;解码器', supplier: '', datasheet: '', desc: '3 到 8 线译码器，做片选、地址译码。' },
  { code: 'IC-009', name: '74HC245 总线收发器', model: '74HC245KA', pkg: 'TSSOP-20', locNo: 'A46', cat: '集成电路IC', sub: '逻辑芯片', tags: ['缓冲', '总线'], unit: '个', loc: '货柜', price: 0.7, stock: 20, minStock: 5, link: '', silk: '74HC245', alias: '245;74hc245;总线收发;缓冲', supplier: '', datasheet: '', desc: '八路双向总线收发器，做 IO 缓冲、电平驱动。' },
  { code: 'IC-010', name: 'CD4017 十进制计数器', model: 'CD4017BM', pkg: 'SOP-16', locNo: 'A25', cat: '集成电路IC', sub: '逻辑芯片', tags: ['计数', '经典'], unit: '个', loc: '货柜', price: 0.8, stock: 20, minStock: 5, link: '', silk: 'CD4017', alias: '4017;cd4017;计数器', supplier: '', datasheet: '', desc: '十进制计数/脉冲分配器，流水灯、跑马灯经典用法。' },
  { code: 'IC-011', name: 'CD4069 六反相器', model: 'CD4069UBM96', pkg: 'SOP-14', locNo: 'A51', cat: '集成电路IC', sub: '逻辑芯片', tags: ['反相器', '非门'], unit: '个', loc: '货柜', price: 0.5, stock: 20, minStock: 5, link: '', silk: 'CD4069', alias: '4069;cd4069;反相器;非门', supplier: '', datasheet: '', desc: '六路 CMOS 反相器，做振荡、整形、驱动。' },
  { code: 'IC-012', name: 'CD4051 模拟多路复用器', model: 'CD4051BE', pkg: 'DIP-16', locNo: 'A49', cat: '集成电路IC', sub: '逻辑芯片', tags: ['模拟开关', '多路复用'], unit: '个', loc: '货柜', price: 1, stock: 12, minStock: 4, link: '', silk: 'CD4051', alias: '4051;cd4051;模拟开关;多路复用器', supplier: '', datasheet: '', desc: '8 选 1 模拟多路复用/解复用，多路信号切换。' },
  { code: 'IC-013', name: 'L9110S 双路电机驱动芯片', model: 'L9110S', pkg: 'SOP-8', locNo: 'B28', cat: '集成电路IC', sub: '驱动芯片', tags: ['电机驱动', '常用'], unit: '个', loc: '货柜', price: 0.8, stock: 30, minStock: 10, link: '', silk: 'L9110S', alias: 'l9110;电机驱动;马达驱动', supplier: '', datasheet: '', desc: '双通道 H 桥驱动，可驱动两个小直流电机正反转。' },
  { code: 'IC-014', name: 'TB6612FNG 电机驱动芯片', model: 'TB6612FNG', pkg: 'SSOP-24', locNo: 'C57', cat: '集成电路IC', sub: '驱动芯片', tags: ['电机驱动', '高效'], unit: '个', loc: '货柜', price: 3.5, stock: 10, minStock: 3, link: '', silk: 'TB6612', alias: 'tb6612;驱动板;电机驱动', supplier: '', datasheet: '', desc: 'MOS 双路电机驱动，效率高发热小。' },
  { code: 'IC-015', name: 'L7805 5V 稳压芯片', model: 'L7805CDT-TR', pkg: 'TO-252', locNo: 'C57', cat: '集成电路IC', sub: '电源管理IC', tags: ['稳压', '5V'], unit: '个', loc: '货柜', price: 0.8, stock: 25, minStock: 8, link: '', silk: 'L7805', alias: '7805;l7805;稳压;5v', supplier: '', datasheet: '', desc: '经典三端 5V 稳压，输入 7~35V，注意加散热片。' },
  { code: 'IC-016', name: 'LM317 可调稳压芯片', model: 'LM317T', pkg: 'TO-220', locNo: 'D31', cat: '集成电路IC', sub: '电源管理IC', tags: ['可调', '稳压'], unit: '个', loc: '货柜', price: 1, stock: 15, minStock: 5, link: '', silk: 'LM317T', alias: '317;lm317;可调稳压', supplier: '', datasheet: '', desc: '三端可调线性稳压，输出 1.25V 起连续可调。' },
  { code: 'IC-017', name: 'XC6206P332MR 3.3V LDO', model: 'XC6206P332MR', pkg: 'SOT-23', locNo: 'A04', cat: '集成电路IC', sub: '电源管理IC', tags: ['LDO', '3.3V'], unit: '个', loc: '货柜', price: 0.25, stock: 50, minStock: 15, link: '', silk: 'XC6206', alias: 'xc6206;662k;ldo;3.3v稳压', supplier: '', datasheet: '', desc: '3.3V 小电流 LDO，静态电流低，给主控/传感器供电。' },
  { code: 'IC-018', name: 'LM2596S-5.0 降压稳压芯片', model: 'LM2596S-5.0', pkg: 'TO-263-5', locNo: 'A15', cat: '集成电路IC', sub: '电源管理IC', tags: ['DC-DC', '降压'], unit: '个', loc: '货柜', price: 2.5, stock: 12, minStock: 4, link: '', silk: 'LM2596S-5.0', alias: 'lm2596;降压;dcdc', supplier: '', datasheet: '', desc: '3A 降压 DC-DC，固定 5V 输出，需外接电感和二极管。' },
  { code: 'IC-019', name: 'TP4057 锂电池充电管理芯片', model: 'TP4057', pkg: 'SOT-23-6', locNo: 'A20', cat: '集成电路IC', sub: '电源管理IC', tags: ['充电', '锂电'], unit: '个', loc: '货柜', price: 0.5, stock: 25, minStock: 8, link: '', silk: 'TP4057', alias: 'tp4057;充电;锂电充电', supplier: '', datasheet: '', desc: '单节锂电池线性充电管理，涓流/恒流/恒压三段充电。' },
  { code: 'IC-020', name: 'CP2102 USB 转串口芯片', model: 'CP2102-GMR', pkg: 'QFN-28', locNo: 'A41', cat: '集成电路IC', sub: '通信接口IC', tags: ['USB', '串口', '下载'], unit: '个', loc: '货柜', price: 3, stock: 15, minStock: 5, link: '', silk: 'CP2102', alias: 'cp2102;usb转串口;串口下载', supplier: '', datasheet: '', desc: 'USB 转 UART 桥接芯片，给主控下载程序、串口调试。' },
  { code: 'IC-021', name: 'SP485EEN RS485 收发器', model: 'SP485EEN-L/TR', pkg: 'SOIC-8', locNo: 'A30', cat: '集成电路IC', sub: '通信接口IC', tags: ['RS485', '总线'], unit: '个', loc: '货柜', price: 1.5, stock: 15, minStock: 5, link: '', silk: 'SP485E', alias: '485;sp485;rs485', supplier: '', datasheet: '', desc: 'RS485 半双工收发器，长距离多点通信、工业总线用。' },
  { code: 'IC-022', name: 'MFRC522 射频卡读卡芯片', model: 'MFRC52202HN1', pkg: 'QFN-32', locNo: 'A28', cat: '集成电路IC', sub: '通信接口IC', tags: ['RFID', '刷卡', 'NFC'], unit: '个', loc: '货柜', price: 2.5, stock: 12, minStock: 4, link: '', silk: 'MFRC522', alias: 'rc522;mfrc522;rfid;刷卡;nfc;门禁', supplier: '', datasheet: '', desc: '13.56MHz 非接触读卡芯片，门禁/刷卡项目核心。' },
  /* --- 基础元件：电阻 --- */
  { code: 'JC-001', name: '贴片电阻 10KΩ 0805', model: '10KΩ ±1% 1/8W', pkg: '0805', locNo: 'B54', cat: '基础元件', sub: '电阻', tags: ['常用', '上拉', '限流'], unit: '个', loc: '货柜', price: 0.01, stock: 800, minStock: 200, link: '', silk: '1003', alias: '电阻;10k;1003;贴片电阻', supplier: '', datasheet: '', desc: '上拉/下拉最常用阻值。' },
  { code: 'JC-002', name: '贴片电阻 1KΩ 0805', model: '1KΩ ±1% 1/8W', pkg: '0805', locNo: 'B52', cat: '基础元件', sub: '电阻', tags: ['常用', '限流'], unit: '个', loc: '货柜', price: 0.01, stock: 800, minStock: 200, link: '', silk: '1001', alias: '电阻;1k;1001;贴片电阻', supplier: '', datasheet: '', desc: '限流/分压最常用阻值。' },
  { code: 'JC-003', name: '贴片电阻 4.7KΩ 0603', model: '4.7KΩ ±1% 1/10W', pkg: '0603', locNo: 'B06', cat: '基础元件', sub: '电阻', tags: ['常用'], unit: '个', loc: '货柜', price: 0.01, stock: 500, minStock: 150, link: '', silk: '4701', alias: '电阻;4.7k;4701', supplier: '', datasheet: '', desc: 'I2C 上拉常用阻值。' },
  { code: 'JC-004', name: '贴片电阻 100Ω 0805', model: '100Ω ±1% 1/8W', pkg: '0805', locNo: 'B52', cat: '基础元件', sub: '电阻', tags: ['限流'], unit: '个', loc: '货柜', price: 0.01, stock: 500, minStock: 150, link: '', silk: '1000', alias: '电阻;100r;1000', supplier: '', datasheet: '', desc: 'LED 限流、驱动电阻常用值。' },
  { code: 'JC-005', name: '插件电阻 10Ω 色环', model: '10Ω ±5% 1/4W', pkg: 'DIP', locNo: 'B11', cat: '基础元件', sub: '电阻', tags: ['色环', '插件'], unit: '个', loc: '货柜', price: 0.03, stock: 300, minStock: 100, link: '', silk: '棕黑黑金', alias: '电阻;10r;色环电阻', supplier: '', datasheet: '', desc: '直插色环电阻，实验面包板常用。' },
  { code: 'JC-006', name: '贴片排阻 1KΩ', model: '1KΩ ×8 SIP-9', pkg: 'SIP-9', locNo: 'D37', cat: '基础元件', sub: '电阻', tags: ['排阻'], unit: '个', loc: '货柜', price: 0.3, stock: 30, minStock: 10, link: '', silk: '102', alias: '排阻;1k排阻', supplier: '', datasheet: '', desc: '8 路 1KΩ 排阻，整排限流/上拉，配数码管、按键阵列。' },
  { code: 'JC-007', name: '多圈可调电阻 B10K', model: 'B10K 多圈', pkg: 'DIP', locNo: 'B55', cat: '基础元件', sub: '电位器', tags: ['可调', '分压'], unit: '个', loc: '货柜', price: 1.5, stock: 20, minStock: 5, link: '', silk: 'B103', alias: '电位器;可调电阻;旋钮;10k', supplier: '', datasheet: '', desc: '多圈精密可调电阻，调分压、调基准用。' },
  /* --- 基础元件：电容 --- */
  { code: 'JC-008', name: '贴片电容 100nF 0603', model: '100nF 50V X7R', pkg: '0603', locNo: 'B20', cat: '基础元件', sub: '电容', tags: ['常用', '去耦'], unit: '个', loc: '货柜', price: 0.01, stock: 800, minStock: 200, link: '', silk: '104', alias: '电容;104;100nf;去耦', supplier: '', datasheet: '', desc: '最常用去耦/滤波电容，每颗芯片电源脚配一颗。' },
  { code: 'JC-009', name: '贴片电容 10μF 0805', model: '10μF 25V X5R', pkg: '0805', locNo: 'B41', cat: '基础元件', sub: '电容', tags: ['滤波'], unit: '个', loc: '货柜', price: 0.05, stock: 400, minStock: 100, link: '', silk: '106', alias: '电容;10uf;106', supplier: '', datasheet: '', desc: '电源滤波常用电容。' },
  { code: 'JC-010', name: '瓷片电容 104（100nF）', model: '104 50V', pkg: 'DIP', locNo: 'B53', cat: '基础元件', sub: '电容', tags: ['插件', '高频'], unit: '个', loc: '货柜', price: 0.03, stock: 400, minStock: 100, link: '', silk: '104', alias: '瓷片电容;104;100nf', supplier: '', datasheet: '', desc: '直插瓷片电容，高频去耦、旁路用。' },
  { code: 'JC-011', name: '直插电解电容 100μF', model: '100μF 25V', pkg: 'DIP 5×11mm', locNo: 'B43', cat: '基础元件', sub: '电容', tags: ['滤波', '储能'], unit: '个', loc: '货柜', price: 0.1, stock: 200, minStock: 50, link: '', silk: '100μF', alias: '电解电容;100uf', supplier: '', datasheet: '', desc: '电源滤波/储能常用，注意正负极。' },
  { code: 'JC-012', name: '贴片铝电解电容 220μF', model: '220μF 16V', pkg: 'SMD 6.3×5.4mm', locNo: 'B04', cat: '基础元件', sub: '电容', tags: ['滤波', '贴片'], unit: '个', loc: '货柜', price: 0.3, stock: 100, minStock: 30, link: '', silk: '220μF', alias: '贴片电解;220uf', supplier: '', datasheet: '', desc: '贴片铝电解，板级电源滤波。' },
  { code: 'JC-013', name: '钽电容 100μF 6.3V', model: '100μF 6.3V', pkg: 'SMD', locNo: 'B19', cat: '基础元件', sub: '电容', tags: ['滤波', '低ESR'], unit: '个', loc: '货柜', price: 0.8, stock: 60, minStock: 20, link: '', silk: '107', alias: '钽电容;tantalum', supplier: '', datasheet: '', desc: '低 ESR 钽电容，电源滤波，注意耐压余量。' },
  /* --- 基础元件：电感 / 磁珠 --- */
  { code: 'JC-014', name: '贴片电感 10μH', model: '10μH', pkg: '0402', locNo: 'B15', cat: '基础元件', sub: '电感/磁珠', tags: ['电感'], unit: '个', loc: '货柜', price: 0.1, stock: 100, minStock: 30, link: '', silk: '100', alias: '电感;10uh', supplier: '', datasheet: '', desc: '小体积贴片电感，滤波/储能。' },
  { code: 'JC-015', name: '功率电感 CDRH127-33μH', model: 'CDRH127 33μH', pkg: 'SMD 12.5×12.5×8mm', locNo: 'B38', cat: '基础元件', sub: '电感/磁珠', tags: ['电感', '功率'], unit: '个', loc: '货柜', price: 0.8, stock: 40, minStock: 10, link: '', silk: '330', alias: '电感;33uh;cdrh127', supplier: '', datasheet: '', desc: '功率电感，配合 LM2596 等 DC-DC 降压电路使用。' },
  /* --- 基础元件：二极管 --- */
  { code: 'JC-016', name: '1N4007 整流二极管', model: '1N4007', pkg: 'DO-41', locNo: 'B37', cat: '基础元件', sub: '二极管', tags: ['整流', '防反接', '常用'], unit: '个', loc: '货柜', price: 0.05, stock: 300, minStock: 100, link: '', silk: '1N4007', alias: '4007;1n4007;二极管;diode', supplier: '', datasheet: '', desc: '1A 1000V 整流/防反接二极管。' },
  { code: 'JC-017', name: '1N4148 开关二极管', model: '1N4148', pkg: 'DO-35', locNo: 'D28', cat: '基础元件', sub: '二极管', tags: ['开关', '常用'], unit: '个', loc: '货柜', price: 0.03, stock: 300, minStock: 100, link: '', silk: '1N4148', alias: '4148;1n4148;开关二极管', supplier: '', datasheet: '', desc: '高速开关二极管，信号、续流用。' },
  { code: 'JC-018', name: '1N5819 肖特基二极管', model: '1N5819', pkg: 'DO-41', locNo: 'D29', cat: '基础元件', sub: '二极管', tags: ['肖特基', '低压降'], unit: '个', loc: '货柜', price: 0.1, stock: 200, minStock: 50, link: '', silk: '1N5819', alias: '5819;1n5819;肖特基', supplier: '', datasheet: '', desc: '1A 40V 肖特基，低压降整流、续流。' },
  { code: 'JC-019', name: 'SS54 肖特基二极管', model: 'SS54', pkg: 'DO-214', locNo: 'C59', cat: '基础元件', sub: '二极管', tags: ['肖特基', '大电流'], unit: '个', loc: '货柜', price: 0.3, stock: 80, minStock: 20, link: '', silk: 'SS54', alias: 'ss54;肖特基', supplier: '', datasheet: '', desc: '5A 40V 肖特基，大电流整流/续流。' },
  { code: 'JC-020', name: '1N4733A 稳压二极管 5V1', model: '1N4733A', pkg: 'DO-41', locNo: 'D28', cat: '基础元件', sub: '二极管', tags: ['稳压', '5.1V'], unit: '个', loc: '货柜', price: 0.1, stock: 150, minStock: 50, link: '', silk: '1N4733A', alias: '4733;稳压二极管;5v1', supplier: '', datasheet: '', desc: '5.1V 稳压二极管，做基准、限压保护。' },
  /* --- 基础元件：三极管 / MOS 管 --- */
  { code: 'JC-021', name: 'S8050 NPN 三极管', model: 'S8050', pkg: 'TO-92', locNo: 'D32', cat: '基础元件', sub: '三极管/MOS管', tags: ['驱动', '开关', '常用'], unit: '个', loc: '货柜', price: 0.08, stock: 300, minStock: 100, link: '', silk: 'S8050', alias: '8050;s8050;三极管;npn', supplier: '', datasheet: '', desc: 'NPN 小功率三极管，驱动蜂鸣器/继电器。' },
  { code: 'JC-022', name: 'S9013 NPN 三极管', model: 'S9013', pkg: 'TO-92', locNo: 'D32', cat: '基础元件', sub: '三极管/MOS管', tags: ['驱动', '常用'], unit: '个', loc: '货柜', price: 0.08, stock: 300, minStock: 100, link: '', silk: 'S9013', alias: '9013;s9013;三极管;npn', supplier: '', datasheet: '', desc: 'NPN 小功率三极管，放大、开关用。' },
  { code: 'JC-023', name: 'AO3400 N 沟道 MOS 管', model: 'AO3400', pkg: 'SOT-23', locNo: 'C57', cat: '基础元件', sub: '三极管/MOS管', tags: ['MOS', '常用'], unit: '个', loc: '货柜', price: 0.15, stock: 200, minStock: 50, link: '', silk: 'AO3400', alias: 'ao3400;nmos;mos管', supplier: '', datasheet: '', desc: 'N 沟道 MOS，导通电阻低，做开关/驱动。' },
  { code: 'JC-024', name: 'IRF630N N 沟道 MOS 管', model: 'IRF630N', pkg: 'TO-220', locNo: 'D31', cat: '基础元件', sub: '三极管/MOS管', tags: ['MOS', '大功率'], unit: '个', loc: '货柜', price: 1.5, stock: 30, minStock: 10, link: '', silk: 'IRF630N', alias: 'irf630;mos管;场效应管', supplier: '', datasheet: '', desc: '9A 200V 功率 MOS，驱动电机/大电流负载。' },
  /* --- 基础元件：晶振 / 开关 / 蜂鸣器 / 排针 / 保险丝 --- */
  { code: 'JC-025', name: '8MHz 无源晶振', model: '8MHz HC-49SMD', pkg: 'HC-49SMD', locNo: 'B37', cat: '基础元件', sub: '晶振', tags: ['时钟', '常用'], unit: '个', loc: '货柜', price: 0.3, stock: 60, minStock: 20, link: '', silk: '8.000', alias: '晶振;8m;crystal;时钟', supplier: '', datasheet: '', desc: '8MHz 无源晶振，主控主时钟常用。' },
  { code: 'JC-026', name: '贴片轻触开关', model: '3×6×5 两脚', pkg: 'SMD', locNo: 'C74', cat: '基础元件', sub: '开关/按键', tags: ['按键', '常用'], unit: '个', loc: '货柜', price: 0.05, stock: 200, minStock: 50, link: '', silk: '无字标', alias: '轻触开关;按键;button;开关', supplier: '', datasheet: '', desc: '贴片轻触按键，复位、功能键用。' },
  { code: 'JC-027', name: '有源蜂鸣器 5V', model: '5V 有源 9.5mm', pkg: 'DIP 9.5mm', locNo: 'C43', cat: '基础元件', sub: '蜂鸣器', tags: ['提示音', '报警', '常用'], unit: '个', loc: '货柜', price: 0.5, stock: 60, minStock: 20, link: '', silk: '无字标', alias: '蜂鸣器;buzzer;报警', supplier: '', datasheet: '', desc: '通电即响的有源蜂鸣器，报警/提示音用。' },
  { code: 'JC-028', name: '单排排针 2.54mm 40P', model: '2.54mm 单排 40P', pkg: 'DIP', locNo: 'C07', cat: '基础元件', sub: '排针/排母', tags: ['常用', '连接'], unit: '条', loc: '货柜', price: 0.3, stock: 100, minStock: 30, link: '', silk: '无字标', alias: '排针;header;针座', supplier: '', datasheet: '', desc: '2.54mm 单排直针，模块/板卡转接用。' },
  { code: 'JC-029', name: '单排母座 2.54mm 20P', model: '2.54mm 单排 20P', pkg: 'DIP', locNo: 'C15', cat: '基础元件', sub: '排针/排母', tags: ['连接'], unit: '条', loc: '货柜', price: 0.4, stock: 80, minStock: 20, link: '', silk: '无字标', alias: '排母;母座;插座', supplier: '', datasheet: '', desc: '2.54mm 单排母座，配排针/模块插接。' },
  { code: 'JC-030', name: '贴片自恢复保险丝 1210', model: '1210', pkg: '1210', locNo: 'A01', cat: '基础元件', sub: '保险丝', tags: ['过流保护'], unit: '个', loc: '货柜', price: 0.3, stock: 100, minStock: 30, link: '', silk: '1210', alias: '保险丝;自恢复保险;ptc', supplier: '', datasheet: '', desc: '贴片自恢复保险丝，过流保护，跳闸后可自恢复。' },
  /* --- 显示模块 --- */
  { code: 'XS-001', name: '数码管 共阳 0.56寸', model: '共阳 1 位 0.56寸', pkg: 'DIP', locNo: 'D40', cat: '显示模块', sub: '数码管', tags: ['显示', '时钟'], unit: '个', loc: '货柜', price: 0.5, stock: 60, minStock: 20, link: '', silk: '无字标', alias: '数码管;led数码管', supplier: '', datasheet: '', desc: '单位共阳数码管，时钟/计分显示，可配 74HC595 驱动。' },
  { code: 'XS-002', name: 'LED 灯珠 5mm 红发红', model: '5mm 直插 红', pkg: 'DIP 5mm', locNo: 'D27', cat: '显示模块', sub: '指示灯', tags: ['常用', '指示'], unit: '个', loc: '货柜', price: 0.05, stock: 300, minStock: 100, link: '', silk: '无字标', alias: 'led;红灯;发光二极管;灯珠', supplier: '', datasheet: '', desc: '5mm 直插红色 LED，实验/指示灯用，长脚为正。' },
  { code: 'XS-003', name: '5mm 全彩共阳 LED', model: '5mm 四脚 RGB 共阳', pkg: 'DIP 5mm', locNo: 'C41', cat: '显示模块', sub: '指示灯', tags: ['RGB', '灯效'], unit: '个', loc: '货柜', price: 0.3, stock: 100, minStock: 30, link: '', silk: '无字标', alias: 'rgb;全彩led;三色led', supplier: '', datasheet: '', desc: '红绿蓝三色共阳 LED，混色灯效用。' },
  /* --- 传感器 --- */
  { code: 'CGQ-001', name: 'BH1750 光照强度传感器', model: 'BH1750FVI-TR', pkg: 'WSOF-6', locNo: 'A42', cat: '传感器', sub: '光/颜色', tags: ['光照', 'I2C'], unit: '个', loc: '货柜', price: 2.5, stock: 15, minStock: 5, link: '', silk: 'BH1750', alias: 'bh1750;光敏;光照强度;lux', supplier: '', datasheet: '', desc: 'I2C 数字光强传感器，直接读 lux 值，光控/智能台灯用。' },
  { code: 'CGQ-002', name: 'LSM6DS3 六轴姿态传感器', model: 'LSM6DS3TR-C', pkg: 'LGA-14', locNo: 'A30', cat: '传感器', sub: '运动/姿态', tags: ['陀螺仪', '加速度', '姿态'], unit: '个', loc: '货柜', price: 6, stock: 10, minStock: 3, link: '', silk: 'LSM6DS3', alias: 'lsm6ds3;陀螺仪;加速度;姿态;mpu', supplier: '', datasheet: '', desc: '六轴姿态传感器（3 轴陀螺仪+3 轴加速度），平衡车/云台用。' },
  { code: 'CGQ-003', name: 'HX711 称重传感器模块', model: 'HX711', pkg: '模块', locNo: 'C57', cat: '传感器', sub: '压力/称重', tags: ['称重', '电子秤'], unit: '个', loc: '货柜', price: 3, stock: 8, minStock: 3, link: '', silk: 'HX711', alias: 'hx711;称重;电子秤;压力', supplier: '', datasheet: '', desc: '24 位称重 ADC，配应变片做电子秤。' },
  { code: 'CGQ-004', name: '红外对管（循迹/避障）', model: '红外发射+接收对管', pkg: 'DIP 3mm', locNo: 'C76', cat: '传感器', sub: '人体/红外', tags: ['循迹', '红外', '避障'], unit: '对', loc: '货柜', price: 0.5, stock: 80, minStock: 20, link: '', silk: '无字标', alias: '红外对管;红外线传感器;循迹', supplier: '', datasheet: '', desc: '红外发射+接收对管，循迹小车检测黑线、避障用。' },
  { code: 'CGQ-005', name: '光敏接收管 3mm', model: '3mm 光敏接收管', pkg: 'DIP 3mm', locNo: 'D27', cat: '传感器', sub: '光/颜色', tags: ['感光', '光控'], unit: '个', loc: '货柜', price: 0.2, stock: 100, minStock: 30, link: '', silk: '无字标', alias: '光敏管;光敏;光电接收管', supplier: '', datasheet: '', desc: '光敏接收管，检测环境光，配运放做光控开关。' },
  { code: 'CGQ-006', name: 'A44E 霍尔开关', model: 'A44E', pkg: 'TO-92', locNo: 'D32', cat: '传感器', sub: '其他传感器', tags: ['霍尔', '磁性', '测速'], unit: '个', loc: '货柜', price: 0.8, stock: 40, minStock: 10, link: '', silk: 'A44E', alias: 'a44e;霍尔;磁感应;测速', supplier: '', datasheet: '', desc: '单极霍尔开关，测转速、位置检测、磁控开关。' },
  { code: 'CGQ-007', name: '超声波测距芯片', model: 'CX20206A', pkg: 'SOP-16', locNo: 'A39', cat: '传感器', sub: '距离', tags: ['超声波', '测距', '避障'], unit: '个', loc: '货柜', price: 2, stock: 10, minStock: 3, link: '', silk: 'CX20206A', alias: '超声波;超声;测距;避障', supplier: '', datasheet: '', desc: '超声波接收/测距芯片，配超声探头做测距避障。' },
  /* --- 电机 / 执行器 --- */
  { code: 'DJ-001', name: 'R300C 直流减速电机', model: 'R300C', pkg: 'DIP', locNo: 'D38', cat: '电机/执行器', sub: '直流电机', tags: ['直流', '小车动力'], unit: '个', loc: '货柜', price: 6, stock: 20, minStock: 6, link: '', silk: 'R300C', alias: '电机;马达;直流电机;r300', supplier: '', datasheet: '', desc: '3~6V 直流减速电机，小车/机构动力用。' },
  { code: 'DJ-002', name: 'PG-130SH 直流减速电机', model: 'PG-130SH', pkg: 'DIP', locNo: 'D38', cat: '电机/执行器', sub: '直流电机', tags: ['直流', '减速'], unit: '个', loc: '货柜', price: 9, stock: 12, minStock: 4, link: '', silk: 'PG-130SH', alias: '电机;减速电机;130电机', supplier: '', datasheet: '', desc: '带减速箱的小型直流电机，小车动力。' },
  { code: 'DJ-003', name: '5V 继电器', model: '5V 电磁继电器', pkg: 'DIP', locNo: 'C78', cat: '电机/执行器', sub: '继电器', tags: ['控大电流', '常用'], unit: '个', loc: '货柜', price: 2, stock: 30, minStock: 10, link: '', silk: 'SRD-05VDC', alias: '继电器;relay', supplier: '', datasheet: '', desc: '小电流控制大电流电器（水泵/风扇/灯带）的开关。' },
  /* --- 电源管理 --- */
  { code: 'DY-001', name: '聚合物锂电池 402030', model: '402030 3.7V 250mAh', pkg: 'SMD', locNo: 'C66', cat: '电源管理', sub: '电池/电池盒', tags: ['锂电', '供电'], unit: '个', loc: '货柜', price: 8, stock: 20, minStock: 5, link: '', silk: '402030', alias: '锂电池;锂电;电池;聚合物电池', supplier: '', datasheet: '', desc: '3.7V 聚合物锂电池，小型便携设备供电，配 TP4057 充电。' },
  /* --- 线材连接 --- */
  { code: 'XC-001', name: '杜邦线（公对母）', model: '20cm 40 根装', pkg: '排线', locNo: 'D25', cat: '线材连接', sub: '杜邦线', tags: ['常用', '必备'], unit: '排', loc: '货柜', price: 3, stock: 24, minStock: 10, link: '', silk: '无字标', alias: '杜邦线;面包线;跳线;公对母', supplier: '', datasheet: '', desc: '连接模块与开发板的排线，用完请扎好放回。' },
  { code: 'XC-002', name: '杜邦线（母对母）', model: '20cm 40 根装', pkg: '排线', locNo: 'D24', cat: '线材连接', sub: '杜邦线', tags: ['常用', '必备'], unit: '排', loc: '货柜', price: 3, stock: 20, minStock: 10, link: '', silk: '无字标', alias: '杜邦线;跳线;母对母', supplier: '', datasheet: '', desc: '模块对模块连接用。' },
  { code: 'XC-003', name: '红白排线 XH2.54 3P', model: 'XH2.54 3P 20cm', pkg: '排线', locNo: 'D07', cat: '线材连接', sub: '排线', tags: ['排线'], unit: '根', loc: '货柜', price: 0.8, stock: 60, minStock: 20, link: '', silk: '无字标', alias: '红白排线;排线;xh2.54', supplier: '', datasheet: '', desc: '3 芯红白排线，传感器/模块连接用。' },

  /* ============ 货架（贴片料区，取自《2026.3.17 货架统计》） ============
     位置写法：存放位置 loc = "货架"，位置编号 locNo = 原编号，显示时直接拼成"货架2-1-24"。
     货柜物料同理：loc = "货柜"，locNo = 原编号（如 A37），显示为"货柜A37"。
     分区：2-1-xx = 0805 电阻，3-1-xx = 0805 电容，2-0-xx = 0603 电阻，
     1-0-xx = 0603 大阻值电阻，1-1-xx = 磁珠/LED/二极管/MOS/晶振/钽电容，
     4-xx = 混合区（电解电容/接插件/按键/电位器/继电器）。 */
  /* --- 货架 2-1 区：0805 贴片电阻 --- */
  { code: 'HJ-001', name: '贴片电阻 0Ω 0805', model: '0Ω 1/8W', pkg: '0805', locNo: '2-1-00', cat: '基础元件', sub: '电阻', tags: ['跳线', '常用'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;0r;0欧;零欧;跳线电阻', supplier: '', datasheet: '', desc: '0Ω 电阻，可当跳线/短接用，也常作预留位。' },
  { code: 'HJ-002', name: '贴片电阻 220Ω 0805', model: '220Ω 1/8W', pkg: '0805', locNo: '2-1-04', cat: '基础元件', sub: '电阻', tags: ['限流'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;220r;221', supplier: '', datasheet: '', desc: 'LED 限流常用阻值。' },
  { code: 'HJ-003', name: '贴片电阻 1.5KΩ 0805', model: '1.5KΩ 1/8W', pkg: '0805', locNo: '2-1-09', cat: '基础元件', sub: '电阻', tags: ['分压'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;1.5k;152', supplier: '', datasheet: '', desc: '分压/上拉常用阻值。' },
  { code: 'HJ-004', name: '贴片电阻 3.3KΩ 0805', model: '3.3KΩ 1/8W', pkg: '0805', locNo: '2-1-13', cat: '基础元件', sub: '电阻', tags: ['分压'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;3.3k;332', supplier: '', datasheet: '', desc: '分压/上拉常用阻值。' },
  { code: 'HJ-005', name: '贴片电阻 5.1KΩ 0805', model: '5.1KΩ 1/8W', pkg: '0805', locNo: '2-1-17', cat: '基础元件', sub: '电阻', tags: ['上拉'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;5.1k;512', supplier: '', datasheet: '', desc: 'USB CC 下拉、信号上拉常用阻值。' },
  { code: 'HJ-006', name: '贴片电阻 33KΩ 0805', model: '33KΩ 1/8W', pkg: '0805', locNo: '2-1-22', cat: '基础元件', sub: '电阻', tags: ['分压'], unit: '个', loc: '货架', price: 0.01, stock: 400, minStock: 120, link: '', silk: '', alias: '电阻;33k;333', supplier: '', datasheet: '', desc: '分压/采样常用阻值。' },
  { code: 'HJ-007', name: '贴片电阻 100KΩ 0805', model: '100KΩ 1/8W', pkg: '0805', locNo: '2-1-24', cat: '基础元件', sub: '电阻', tags: ['分压', '下拉'], unit: '个', loc: '货架', price: 0.01, stock: 400, minStock: 120, link: '', silk: '', alias: '电阻;100k;104电阻', supplier: '', datasheet: '', desc: '分压/下拉常用大阻值。' },
  { code: 'HJ-008', name: '贴片电阻 10MΩ 0805', model: '10MΩ 1/8W', pkg: '0805', locNo: '2-1-29', cat: '基础元件', sub: '电阻', tags: ['高阻'], unit: '个', loc: '货架', price: 0.02, stock: 200, minStock: 60, link: '', silk: '', alias: '电阻;10m;106电阻', supplier: '', datasheet: '', desc: '高阻值，做泄放、偏置用。' },
  /* --- 货架 3-1 区：0805 贴片电容 --- */
  { code: 'HJ-009', name: '贴片电容 20pF 0805', model: '20pF 50V NPO', pkg: '0805', locNo: '3-1-00', cat: '基础元件', sub: '电容', tags: ['晶振', '高频'], unit: '个', loc: '货架', price: 0.01, stock: 400, minStock: 120, link: '', silk: '', alias: '电容;20pf;200', supplier: '', datasheet: '', desc: '晶振负载电容常用值，配 8MHz 晶振。' },
  { code: 'HJ-010', name: '贴片电容 22pF 0805', model: '22pF 50V NPO', pkg: '0805', locNo: '3-1-01', cat: '基础元件', sub: '电容', tags: ['晶振', '高频'], unit: '个', loc: '货架', price: 0.01, stock: 400, minStock: 120, link: '', silk: '', alias: '电容;22pf;220', supplier: '', datasheet: '', desc: '晶振负载电容常用值。' },
  { code: 'HJ-011', name: '贴片电容 10nF 0805', model: '10nF 50V X7R', pkg: '0805', locNo: '3-1-04', cat: '基础元件', sub: '电容', tags: ['滤波', '去耦'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电容;10nf;103', supplier: '', datasheet: '', desc: '高频去耦/滤波常用，丝印 103。' },
  { code: 'HJ-012', name: '贴片电容 330nF 0805', model: '330nF 50V X7R', pkg: '0805', locNo: '3-1-07', cat: '基础元件', sub: '电容', tags: ['滤波'], unit: '个', loc: '货架', price: 0.02, stock: 300, minStock: 100, link: '', silk: '', alias: '电容;330nf;334', supplier: '', datasheet: '', desc: '滤波/储能电容，丝印 334。' },
  { code: 'HJ-013', name: '贴片电容 1μF 0805', model: '1μF 25V X7R', pkg: '0805', locNo: '3-1-09', cat: '基础元件', sub: '电容', tags: ['滤波', '常用'], unit: '个', loc: '货架', price: 0.03, stock: 400, minStock: 120, link: '', silk: '', alias: '电容;1uf;105', supplier: '', datasheet: '', desc: '电源滤波常用，丝印 105。' },
  { code: 'HJ-014', name: '贴片电容 22μF 0805', model: '22μF 16V X5R', pkg: '0805', locNo: '3-1-17', cat: '基础元件', sub: '电容', tags: ['滤波', '储能'], unit: '个', loc: '货架', price: 0.1, stock: 300, minStock: 100, link: '', silk: '', alias: '电容;22uf;226', supplier: '', datasheet: '', desc: '大容量贴片电容，电源滤波/储能。' },
  /* --- 货架 2-0 区：0603 贴片电阻 --- */
  { code: 'HJ-015', name: '贴片电阻 0Ω 0603', model: '0Ω 1/10W', pkg: '0603', locNo: '2-0-01', cat: '基础元件', sub: '电阻', tags: ['跳线'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;0r;0欧;跳线', supplier: '', datasheet: '', desc: '0Ω 电阻，当跳线/短接用。' },
  { code: 'HJ-016', name: '贴片电阻 10Ω 0603', model: '10Ω 1/10W', pkg: '0603', locNo: '2-0-05', cat: '基础元件', sub: '电阻', tags: ['限流'], unit: '个', loc: '货架', price: 0.01, stock: 400, minStock: 120, link: '', silk: '', alias: '电阻;10r;100', supplier: '', datasheet: '', desc: '小阻值，采样/限流用。' },
  { code: 'HJ-017', name: '贴片电阻 100Ω 0603', model: '100Ω 1/10W', pkg: '0603', locNo: '2-0-12', cat: '基础元件', sub: '电阻', tags: ['限流', '常用'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;100r;101', supplier: '', datasheet: '', desc: 'LED 限流、信号串阻常用。' },
  { code: 'HJ-018', name: '贴片电阻 10KΩ 0603', model: '10KΩ 1/10W', pkg: '0603', locNo: '2-0-40', cat: '基础元件', sub: '电阻', tags: ['上拉', '下拉', '常用'], unit: '个', loc: '货架', price: 0.01, stock: 500, minStock: 150, link: '', silk: '', alias: '电阻;10k;103电阻', supplier: '', datasheet: '', desc: '上拉/下拉最常用阻值。' },
  /* --- 货架 1-0 区：0603 大阻值电阻 --- */
  { code: 'HJ-019', name: '贴片电阻 13KΩ 0603', model: '13KΩ 1/10W', pkg: '0603', locNo: '1-0-05', cat: '基础元件', sub: '电阻', tags: ['分压'], unit: '个', loc: '货架', price: 0.01, stock: 300, minStock: 100, link: '', silk: '', alias: '电阻;13k;133', supplier: '', datasheet: '', desc: '分压/采样阻值。' },
  { code: 'HJ-020', name: '贴片电阻 47KΩ 0603', model: '47KΩ 1/10W', pkg: '0603', locNo: '1-0-12', cat: '基础元件', sub: '电阻', tags: ['分压'], unit: '个', loc: '货架', price: 0.01, stock: 300, minStock: 100, link: '', silk: '', alias: '电阻;47k;473', supplier: '', datasheet: '', desc: '分压/上拉阻值。' },
  { code: 'HJ-021', name: '贴片电阻 100KΩ 0603', model: '100KΩ 1/10W', pkg: '0603', locNo: '1-0-16', cat: '基础元件', sub: '电阻', tags: ['下拉'], unit: '个', loc: '货架', price: 0.01, stock: 300, minStock: 100, link: '', silk: '', alias: '电阻;100k;104电阻', supplier: '', datasheet: '', desc: '下拉/分压阻值。' },
  { code: 'HJ-022', name: '贴片电阻 1MΩ 0603', model: '1MΩ 1/10W', pkg: '0603', locNo: '1-0-23', cat: '基础元件', sub: '电阻', tags: ['高阻'], unit: '个', loc: '货架', price: 0.02, stock: 200, minStock: 60, link: '', silk: '', alias: '电阻;1m;105电阻', supplier: '', datasheet: '', desc: '高阻值，做偏置/泄放。' },
  /* --- 货架 1-1 区：磁珠 / 排阻 / LED --- */
  { code: 'HJ-023', name: '贴片磁珠 0Ω 0603', model: '0Ω 磁珠', pkg: '0603', locNo: '1-1-08', cat: '基础元件', sub: '电感/磁珠', tags: ['磁珠', '滤波'], unit: '个', loc: '货架', price: 0.02, stock: 300, minStock: 100, link: '', silk: '', alias: '磁珠;0r磁珠;bead', supplier: '', datasheet: '', desc: '0Ω 磁珠，电源/信号线高频滤波。' },
  { code: 'HJ-024', name: '贴片磁珠 120Ω 0603', model: '120Ω 磁珠', pkg: '0603', locNo: '1-1-09', cat: '基础元件', sub: '电感/磁珠', tags: ['磁珠', '滤波'], unit: '个', loc: '货架', price: 0.02, stock: 300, minStock: 100, link: '', silk: '', alias: '磁珠;120r磁珠;bead', supplier: '', datasheet: '', desc: '120Ω 磁珠，抑制高频噪声。' },
  { code: 'HJ-025', name: '贴片排阻 100Ω 0603', model: '100Ω ×4', pkg: '0603', locNo: '1-1-11', cat: '基础元件', sub: '电阻', tags: ['排阻'], unit: '个', loc: '货架', price: 0.1, stock: 100, minStock: 30, link: '', silk: '', alias: '排阻;100r排阻', supplier: '', datasheet: '', desc: '4 路 100Ω 排阻，信号串阻、限流。' },
  { code: 'HJ-026', name: '贴片LED 白色 0805', model: 'CGL 白灯', pkg: '0805', locNo: '1-1-14', cat: '显示模块', sub: '指示灯', tags: ['LED', '指示'], unit: '个', loc: '货架', price: 0.05, stock: 300, minStock: 100, link: '', silk: '', alias: 'led;白灯;白色led;发光二极管', supplier: '', datasheet: '', desc: '0805 白色贴片 LED，指示灯/背光用。' },
  { code: 'HJ-027', name: '贴片LED 蓝色 0805', model: 'CGL 蓝灯', pkg: '0805', locNo: '1-1-15', cat: '显示模块', sub: '指示灯', tags: ['LED', '指示'], unit: '个', loc: '货架', price: 0.05, stock: 300, minStock: 100, link: '', silk: '', alias: 'led;蓝灯;蓝色led', supplier: '', datasheet: '', desc: '0805 蓝色贴片 LED，工作电压略高，注意限流。' },
  { code: 'HJ-028', name: '贴片LED 翠绿色 0805', model: 'CGL 翠绿灯', pkg: '0805', locNo: '1-1-16', cat: '显示模块', sub: '指示灯', tags: ['LED', '指示'], unit: '个', loc: '货架', price: 0.05, stock: 300, minStock: 100, link: '', silk: '', alias: 'led;绿灯;翠绿;绿色led', supplier: '', datasheet: '', desc: '0805 翠绿色贴片 LED。' },
  { code: 'HJ-029', name: '贴片LED 红色 0805', model: 'CGL 红灯', pkg: '0805', locNo: '1-1-18', cat: '显示模块', sub: '指示灯', tags: ['LED', '指示', '常用'], unit: '个', loc: '货架', price: 0.05, stock: 400, minStock: 120, link: '', silk: '', alias: 'led;红灯;红色led;发光二极管', supplier: '', datasheet: '', desc: '0805 红色贴片 LED，最常用指示灯。' },
  { code: 'HJ-030', name: '贴片RGB LED 共阳 雾状', model: 'RGB 雾状 共阳', pkg: '0805', locNo: '1-1-30', cat: '显示模块', sub: '指示灯', tags: ['RGB', '灯效'], unit: '个', loc: '货架', price: 0.2, stock: 100, minStock: 30, link: '', silk: '', alias: 'rgb;全彩led;三色led;共阳', supplier: '', datasheet: '', desc: '0805 共阳 RGB LED，雾状散光，混色灯效用。' },
  /* --- 货架 1-1 区：二极管 / MOS / 晶振 / 钽电容 --- */
  { code: 'HJ-031', name: 'M7 贴片整流二极管', model: 'M7', pkg: 'SMA', locNo: '1-1-31', cat: '基础元件', sub: '二极管', tags: ['整流', '防反接'], unit: '个', loc: '货架', price: 0.05, stock: 300, minStock: 100, link: '', silk: 'M7', alias: 'm7;整流二极管;贴片4007', supplier: '', datasheet: '', desc: '贴片版 1N4007（1A 1000V），整流/防反接用。' },
  { code: 'HJ-032', name: '稳压二极管 ZMM3V0', model: 'ZMM3V0', pkg: 'LL-34', locNo: '1-1-32', cat: '基础元件', sub: '二极管', tags: ['稳压', '3V'], unit: '个', loc: '货架', price: 0.05, stock: 200, minStock: 60, link: '', silk: 'ZMM3V0', alias: '稳压二极管;3v稳压;zmm3v0', supplier: '', datasheet: '', desc: '3.0V 贴片稳压二极管，限压/基准用。' },
  { code: 'HJ-033', name: '开关二极管 1N4148W', model: '1N4148W', pkg: 'SOD-123', locNo: '1-1-33', cat: '基础元件', sub: '二极管', tags: ['开关', '贴片'], unit: '个', loc: '货架', price: 0.03, stock: 300, minStock: 100, link: '', silk: '1N4148W', alias: '4148;1n4148w;开关二极管;贴片4148', supplier: '', datasheet: '', desc: '贴片高速开关二极管，信号/续流用。' },
  { code: 'HJ-034', name: 'AO3401A P沟道MOS管', model: 'AO3401A', pkg: 'SOT-23', locNo: '1-1-35', cat: '基础元件', sub: '三极管/MOS管', tags: ['MOS', 'P沟道'], unit: '个', loc: '货架', price: 0.15, stock: 200, minStock: 60, link: '', silk: 'AO3401A', alias: 'ao3401;pmos;p沟道;mos管', supplier: '', datasheet: '', desc: 'P 沟道 MOS，常用于电源高边开关。' },
  { code: 'HJ-035', name: 'AO3400A N沟道MOS管', model: 'AO3400A', pkg: 'SOT-23', locNo: '1-1-36', cat: '基础元件', sub: '三极管/MOS管', tags: ['MOS', 'N沟道', '常用'], unit: '个', loc: '货架', price: 0.15, stock: 300, minStock: 100, link: '', silk: 'AO3400A', alias: 'ao3400;nmos;n沟道;mos管', supplier: '', datasheet: '', desc: 'N 沟道 MOS，低边开关/驱动，导通电阻低。' },
  { code: 'HJ-036', name: '8MHz 贴片晶振', model: 'XL201-111-8M', pkg: 'XL201', locNo: '1-1-37', cat: '基础元件', sub: '晶振', tags: ['时钟', '常用'], unit: '个', loc: '货架', price: 0.4, stock: 100, minStock: 30, link: '', silk: '8.000', alias: '晶振;8m;crystal;贴片晶振', supplier: '', datasheet: '', desc: '8MHz 贴片无源晶振，配 20pF 负载电容。' },
  { code: 'HJ-037', name: '贴片钽电容 10μF', model: '10μF 16V', pkg: 'CASE-B 3528', locNo: '1-1-38', cat: '基础元件', sub: '电容', tags: ['滤波', '低ESR'], unit: '个', loc: '货架', price: 0.5, stock: 100, minStock: 30, link: '', silk: '', alias: '钽电容;10uf钽;tantalum', supplier: '', datasheet: '', desc: '10μF 贴片钽电容，低 ESR，电源滤波，注意极性。' },
  /* --- 货架 4 区：混合区（电解电容 / 接插件 / 按键 / 电位器 / 继电器） --- */
  { code: 'HJ-038', name: '贴片四脚轻触按键', model: 'DTSL-61N-V-T/R', pkg: 'SMD 四脚', locNo: '4-03', cat: '基础元件', sub: '开关/按键', tags: ['按键', '贴片'], unit: '个', loc: '货架', price: 0.1, stock: 200, minStock: 60, link: '', silk: 'DTSL-61N', alias: '轻触开关;按键;button;贴片按键', supplier: '', datasheet: '', desc: '贴片四脚轻触按键，复位/功能键用。' },
  { code: 'HJ-039', name: '电解电容 220μF 16V', model: '220μF 16V', pkg: 'DIP', locNo: '4-04', cat: '基础元件', sub: '电容', tags: ['滤波', '储能'], unit: '个', loc: '货架', price: 0.15, stock: 150, minStock: 50, link: '', silk: '', alias: '电解电容;220uf', supplier: '', datasheet: '', desc: '直插电解电容，电源滤波/储能，注意正负极。' },
  { code: 'HJ-040', name: '电解电容 100μF 16V', model: '100μF 16V', pkg: 'DIP 6.3×5mm', locNo: '4-05', cat: '基础元件', sub: '电容', tags: ['滤波', '储能'], unit: '个', loc: '货架', price: 0.1, stock: 200, minStock: 60, link: '', silk: '', alias: '电解电容;100uf', supplier: '', datasheet: '', desc: '直插电解电容，电源滤波，注意正负极。' },
  { code: 'HJ-041', name: 'Type-C 母座 16P', model: 'Type-C 16P', pkg: 'SMD', locNo: '4-06', cat: '线材连接', sub: '端子/接插件', tags: ['Type-C', '供电', '下载'], unit: '个', loc: '货架', price: 0.5, stock: 100, minStock: 30, link: '', silk: 'Type-C', alias: 'typec;type-c;usb;母座', supplier: '', datasheet: '', desc: '16P 贴片 Type-C 母座，供电/数据接口。' },
  { code: 'HJ-042', name: '贴片硅胶按键 6×6×5', model: '6×6×5', pkg: 'SMD', locNo: '4-07', cat: '基础元件', sub: '开关/按键', tags: ['按键', '静音'], unit: '个', loc: '货架', price: 0.1, stock: 150, minStock: 50, link: '', silk: '', alias: '硅胶按键;无声开关;按键', supplier: '', datasheet: '', desc: '无声硅胶按键，手感轻，适合面板按键。' },
  { code: 'HJ-043', name: '电位器 20K', model: '20K', pkg: 'DIP', locNo: '4-13', cat: '基础元件', sub: '电位器', tags: ['可调', '分压'], unit: '个', loc: '货架', price: 1, stock: 30, minStock: 10, link: '', silk: '', alias: '电位器;可调电阻;20k;旋钮', supplier: '', datasheet: '', desc: '20K 可调电位器，调分压/调参数用。' },
  { code: 'HJ-044', name: '电位器 1K', model: '1K', pkg: 'DIP', locNo: '4-14', cat: '基础元件', sub: '电位器', tags: ['可调', '分压'], unit: '个', loc: '货架', price: 1, stock: 30, minStock: 10, link: '', silk: '', alias: '电位器;可调电阻;1k;旋钮', supplier: '', datasheet: '', desc: '1K 可调电位器，调分压/调参数用。' },
  { code: 'HJ-045', name: '信号继电器 HFD4-5', model: 'HFD4-5', pkg: 'DIP', locNo: '4-15', cat: '电机/执行器', sub: '继电器', tags: ['继电器', '5V'], unit: '个', loc: '货架', price: 1.5, stock: 30, minStock: 10, link: '', silk: 'HFD4-5', alias: '继电器;relay;hfd4;信号继电器', supplier: '', datasheet: '', desc: '5V 信号继电器，小信号切换/控制用。' }
];

/* ============ 7. 示例项目（用于统计页面演示） ============ */
var DEMO_PROJECTS = ['2026 新生循迹小车培训', '迎新晚会灯光装置', '日常维修与补件', '电赛集训备件', '51 单片机课程实验'];

/**
 * 生成示例出入库记录：从今天往前推 5 个月，每个月生成若干条
 * 返回记录数组（不直接写库，由调用方负责保存）
 */
function genDemoRecords(materials, adminName) {
  var records = [];                                            // 结果数组
  var now = new Date();                                        // 当前时间
  var projects = DEMO_PROJECTS;                                 // 项目名单
  var seed = 12345;                                            // 固定随机种子（每次生成的示例数据一致）
  /* 简单的伪随机数生成器（不需要真随机，只要数据看起来自然） */
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  /* 按物料名快速找物料，方便后面写记录 */
  var byName = {};                                             // 名称 -> 物料对象
  for (var i = 0; i < materials.length; i++) byName[materials[i].name] = materials[i];

  /* 每个月生成 4~6 条记录，共 5 个月 */
  for (var m = 5; m >= 0; m--) {
    var count = 3 + Math.floor(rnd() * 3);                     // 本月记录条数 3~5
    for (var k = 0; k < count; k++) {
      var mat = materials[Math.floor(rnd() * materials.length)]; // 随机选一个物料
      var dayAgo = m * 30 + Math.floor(rnd() * 28);            // 距今天数
      var d = new Date(now.getTime() - dayAgo * 86400000);     // 计算记录时间
      d.setHours(9 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0); // 工作时间内的随机时分
      var isBuy = rnd() < 0.35;                                // 35% 概率是采购入库
      var qty;                                                 // 数量
      if (mat.price >= 20) { qty = 1 + Math.floor(rnd() * 2); }  // 贵重物品 1~2 个
      else if (mat.price >= 5) { qty = 1 + Math.floor(rnd() * 3); } // 中等 1~3
      else { qty = 2 + Math.floor(rnd() * 8); }                // 便宜的多领一些
      var type = isBuy ? 'in' : 'out';                          // 入库 或 出库（新版只有这两种+调整）
      var project = projects[Math.floor(rnd() * projects.length)]; // 关联项目
      var rid = uid('rec');                                      // 记录唯一编号（多端同步需要固定 id）
      records.push({
        id: rid,                                                 // 记录编号
        materialId: mat.id,                                    // 关联物料编号
        materialName: mat.name,                                // 冗余存物料名（防物料删除后记录失联）
        unit: mat.unit,                                        // 单位
        type: type,                                            // 记录类型（in=入库 / out=出库）
        qty: qty,                                               // 数量
        price: mat.price,                                      // 单价（入库=实际花费，出库=折算成本）
        operator: adminName,                                   // 操作人（示例数据全部记为管理员）
        project: isBuy ? '日常采购' : project,                  // 项目（采购统一记"日常采购"）
        remark: isBuy ? '按学期计划补货' : ('用于《' + project + '》项目'), // 备注
        time: d.getTime(),                                      // 时间戳
        createdAt: d.getTime(),                                 // 创建时间（同步用）
        updatedAt: d.getTime()                                  // 最后修改时间（同步用）
      });
    }
  }
  return records;                                              // 返回生成的记录
}
