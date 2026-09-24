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
/* 首次使用可以在"数据管理"页一键导入，体验全部功能；也可清空重来 */
var DEMO_MATERIALS = [
  /* --- 开发板 / 主控 --- */
  { code: 'KFB-001', name: 'Arduino UNO R3 开发板', model: 'UNO R3 (ATmega328P)', cat: '开发板/主控', sub: 'Arduino', tags: ['入门', '比赛常用'], unit: '块', loc: 'A架-1层-01盒', price: 45,   stock: 6,   minStock: 2, link: '', silk: 'UNO',            alias: 'arduino uno;uno r3;阿杜伊诺', desc: '经典入门开发板，配套教程和开源例程最多，新手培训首选。' },
  { code: 'KFB-002', name: 'ESP32 开发板',          model: 'ESP32-WROOM-32 (38Pin)', cat: '开发板/主控', sub: 'ESP32', tags: ['WiFi', '蓝牙', '物联网'], unit: '块', loc: 'A架-1层-02盒', price: 25, stock: 8, minStock: 2, link: '', silk: 'ESP32-WROOM-32', alias: 'esp32 wroom;乐鑫', desc: '自带 WiFi+蓝牙的双核主控，适合物联网/无线遥控项目。' },
  { code: 'KFB-003', name: 'STM32F103 最小系统板',  model: 'STM32F103C8T6 (BluePill)', cat: '开发板/主控', sub: 'STM32', tags: ['比赛常用', '32位'], unit: '块', loc: 'A架-1层-02盒', price: 15, stock: 4, minStock: 2, link: '', silk: 'C8T6', alias: 'bluepill;蓝丸;c8t6', desc: '电赛常用 32 位主控，性能强、资料多，需要 ST-Link 下载。' },
  { code: 'KFB-004', name: '51 单片机开发板',        model: 'STC89C52RC 最小系统', cat: '开发板/主控', sub: '51单片机', tags: ['入门', '课程'], unit: '块', loc: 'A架-1层-03盒', price: 18, stock: 5, minStock: 2, link: '', silk: 'STC89C52RC', alias: '51;stc89c52;c52', desc: '大一单片机课程配套板，串口下载，入门教学用。' },
  { code: 'KFB-005', name: '树莓派 4B',              model: 'Raspberry Pi 4B 4GB', cat: '开发板/主控', sub: '树莓派', tags: ['高值', '需登记借用'], unit: '台', loc: 'A架-1层-04盒', price: 380, stock: 2, minStock: 0, link: '', silk: 'Raspberry Pi 4B', alias: 'raspberry pi;树莓派4;派4', desc: '协会贵重物品，仅限项目申请借用，用完务必归还并检查配件。' },
  /* --- 传感器 --- */
  { code: 'CGQ-001', name: '超声波测距模块',        model: 'HC-SR04', cat: '传感器', sub: '距离', tags: ['避障', '测距', '常用'], unit: '个', loc: 'A架-2层-01盒', price: 3.5, stock: 12, minStock: 4, link: '', silk: 'HC-SR04', alias: 'hc-sr04;超声;ultrasonic;测距模块', desc: '2cm~400cm 非接触测距，避障小车/测距仪标配。' },
  { code: 'CGQ-002', name: '温湿度传感器模块',      model: 'DHT11', cat: '传感器', sub: '温度/湿度', tags: ['常用', '环境监测'], unit: '个', loc: 'A架-2层-01盒', price: 6, stock: 9, minStock: 3, link: '', silk: 'DHT11', alias: 'dht11;温湿度;湿度传感器', desc: '测量 0~50°C 温度与 20%~90% 湿度，环境监测项目常用。' },
  { code: 'CGQ-003', name: '温湿度传感器（高精度）', model: 'DHT22 / AM2302', cat: '传感器', sub: '温度/湿度', tags: ['高精度'], unit: '个', loc: 'A架-2层-01盒', price: 18, stock: 3, minStock: 1, link: '', silk: 'DHT22', alias: 'dht22;am2302', desc: '精度比 DHT11 高，用于对数据要求严格的监测项目。' },
  { code: 'CGQ-004', name: '红外循迹传感器',        model: 'TCRT5000 单路', cat: '传感器', sub: '光/颜色', tags: ['循迹', '小车必备'], unit: '个', loc: 'A架-2层-02盒', price: 2, stock: 18, minStock: 8, link: '', silk: 'TCRT5000', alias: 'tcrt5000;循迹模块;红外对管;黑线检测', desc: '检测黑线/白底反射差异，循迹小车每车用 2~3 路。' },
  { code: 'CGQ-005', name: '光敏电阻传感器模块',    model: 'GL5528 光敏模块', cat: '传感器', sub: '光/颜色', tags: ['感光', '台灯'], unit: '个', loc: 'A架-2层-02盒', price: 2.5, stock: 10, minStock: 3, link: '', silk: 'GL5528', alias: '光敏;光电阻;photoresistor;laser?', desc: '输出环境光照强度模拟量，智能台灯/光控开关用。' },
  { code: 'CGQ-006', name: '六轴姿态传感器模块',    model: 'MPU6050 (GY-521)', cat: '传感器', sub: '运动/姿态', tags: ['平衡车', '姿态'], unit: '个', loc: 'A架-2层-03盒', price: 8, stock: 5, minStock: 2, link: '', silk: 'GY-521', alias: 'mpu6050;gy521;陀螺仪;加速度', desc: '三轴陀螺仪+三轴加速度计，平衡车/云台必备。' },
  { code: 'CGQ-007', name: '人体红外感应模块',      model: 'HC-SR501 (PIR)', cat: '传感器', sub: '运动/姿态', tags: ['人体感应', '报警器'], unit: '个', loc: 'A架-2层-03盒', price: 4, stock: 6, minStock: 2, link: '', silk: 'HC-SR501', alias: 'pir;hc-sr501;人体感应', desc: '检测人体移动发出的红外线，感应灯/防盗报警用。' },
  { code: 'CGQ-008', name: '烟雾气体传感器模块',    model: 'MQ-2', cat: '传感器', sub: '气体', tags: ['安防'], unit: '个', loc: 'A架-2层-04盒', price: 7, stock: 3, minStock: 1, link: '', silk: 'MQ-2', alias: 'mq2;烟雾;可燃气体', desc: '检测烟雾/可燃气体浓度，报警类项目使用。' },
  { code: 'CGQ-009', name: '声音传感器模块',        model: 'MAX9814 麦克风模块', cat: '传感器', sub: '声音', tags: ['声控'], unit: '个', loc: 'A架-2层-04盒', price: 3, stock: 7, minStock: 2, link: '', silk: 'MAX9814', alias: '声音;麦克风;mic;声控', desc: '检测环境声音强度，声控灯/声控开关用。' },
  { code: 'CGQ-010', name: '土壤湿度传感器',        model: 'YL-69 探针+模块', cat: '传感器', sub: '湿度', tags: ['浇花', '农业'], unit: '个', loc: 'A架-2层-05盒', price: 4, stock: 4, minStock: 1, link: '', silk: 'YL-69', alias: '土壤;soil;浇花传感器', desc: '插土里测土壤湿度，自动浇花项目用。' },
  /* --- 电机 / 执行器 --- */
  { code: 'DJ-001', name: '9g 微型舵机',            model: 'SG90', cat: '电机/执行器', sub: '舵机', tags: ['常用', '云台', '机械臂'], unit: '个', loc: 'B架-1层-01盒', price: 8, stock: 14, minStock: 4, link: '', silk: 'SG90', alias: 'sg90;舵机;servo', desc: '180° 角度控制，云台/机械臂/转向常用，注意别堵转过热。' },
  { code: 'DJ-002', name: '金属齿轮舵机',            model: 'MG996R (555 金属齿)', cat: '电机/执行器', sub: '舵机', tags: ['大力矩'], unit: '个', loc: 'B架-1层-01盒', price: 22, stock: 4, minStock: 1, link: '', silk: 'MG996R', alias: 'mg996;大舵机', desc: '大扭矩金属齿舵机，用于需要力量的机械结构。' },
  { code: 'DJ-003', name: 'TT 直流减速电机',         model: '130 减速电机 1:48', cat: '电机/执行器', sub: '直流电机', tags: ['小车动力', '常用'], unit: '个', loc: 'B架-1层-02盒', price: 5, stock: 16, minStock: 6, link: '', silk: 'TT motor', alias: 'tt马达;黄电机;减速电机;130电机', desc: '3~6V 供电，小车动力标配，每车两个。' },
  { code: 'DJ-004', name: 'N20 微型减速电机',       model: 'N20 6V 200RPM', cat: '电机/执行器', sub: '直流电机', tags: ['微型'], unit: '个', loc: 'B架-1层-02盒', price: 9, stock: 4, minStock: 0, link: '', silk: 'N20', alias: 'n20;微型电机', desc: '超小体积减速电机，微型项目/仿生机器人用。' },
  { code: 'DJ-005', name: '步进电机套装',           model: '28BYJ-48 + ULN2003 驱动板', cat: '电机/执行器', sub: '步进电机', tags: ['精确定位'], unit: '套', loc: 'B架-1层-03盒', price: 12, stock: 5, minStock: 1, link: '', silk: '28BYJ-48', alias: '步进;28byj;uln2003', desc: '含驱动板的 4 相步进电机，适合缓慢精确定位机构。' },
  { code: 'DJ-006', name: '双路电机驱动模块',       model: 'L298N', cat: '电机/执行器', sub: '电机驱动', tags: ['小车必备', '常用'], unit: '个', loc: 'B架-1层-04盒', price: 9, stock: 8, minStock: 3, link: '', silk: 'L298N', alias: 'l298;电机驱动;l298d', desc: '驱动 2 路直流电机（可正反转调速），小车标配。' },
  { code: 'DJ-007', name: '电机驱动板',             model: 'TB6612FNG', cat: '电机/执行器', sub: '电机驱动', tags: ['高效'], unit: '个', loc: 'B架-1层-04盒', price: 12, stock: 3, minStock: 1, link: '', silk: 'TB6612', alias: 'tb6612;驱动板', desc: '比 L298N 效率更高的 MOS 驱动，体积小，比赛推荐。' },
  { code: 'DJ-008', name: '微型直流潜水泵',         model: '3~5V 迷你水泵', cat: '电机/执行器', sub: '泵/阀', tags: ['浇花'], unit: '个', loc: 'B架-1层-05盒', price: 9, stock: 3, minStock: 1, link: '', silk: 'mini pump', alias: '水泵;抽水泵;潜水泵', desc: '配合继电器做自动浇花/饮料机项目。' },
  { code: 'DJ-009', name: '继电器模块',             model: '5V 单路继电器', cat: '电机/执行器', sub: '继电器', tags: ['控大电流', '常用'], unit: '个', loc: 'B架-1层-05盒', price: 4, stock: 10, minStock: 3, link: '', silk: 'SRD-05VDC', alias: '继电器;relay', desc: '小电流控制大电流电器（水泵/风扇/灯带）的开关。' },
  /* --- 显示模块 --- */
  { code: 'XS-001', name: '0.96 寸 OLED 屏',        model: 'SSD1306 I2C 128x64', cat: '显示模块', sub: 'OLED/LCD', tags: ['常用', '必备'], unit: '块', loc: 'B架-2层-01盒', price: 12, stock: 9, minStock: 3, link: '', silk: 'SSD1306', alias: 'oled;0.96屏;显示屏', desc: 'I2C 通信小白屏，显示数据/图形首选，几乎所有项目都用得上。' },
  { code: 'XS-002', name: 'LCD1602 液晶屏（带转接板）', model: '1602 + I2C 转接', cat: '显示模块', sub: 'OLED/LCD', tags: ['经典'], unit: '块', loc: 'B架-2层-01盒', price: 12, stock: 4, minStock: 1, link: '', silk: 'LCD1602', alias: 'lcd1602;1602;液晶', desc: '经典 16x2 字符屏，焊好转接板后 I2C 通信。' },
  { code: 'XS-003', name: '四位数码管模块',         model: 'TM1637', cat: '显示模块', sub: '数码管', tags: ['时钟'], unit: '个', loc: 'B架-2层-02盒', price: 7, stock: 6, minStock: 2, link: '', silk: 'TM1637', alias: 'tm1637;数码管', desc: '4 位共阳数码管带驱动，时钟/计分器显示数字用。' },
  { code: 'XS-004', name: '8x8 LED 点阵模块',       model: 'MAX7219', cat: '显示模块', sub: 'LED点阵', tags: ['灯效'], unit: '个', loc: 'B架-2层-02盒', price: 15, stock: 3, minStock: 1, link: '', silk: 'MAX7219', alias: '点阵;max7219;led matrix', desc: '可级联的 LED 点阵，做滚动字幕/表情显示。' },
  /* --- 通信模块 --- */
  { code: 'TX-001', name: '蓝牙串口模块',          model: 'HC-05', cat: '通信模块', sub: '蓝牙', tags: ['遥控', '常用'], unit: '个', loc: 'B架-3层-01盒', price: 13, stock: 6, minStock: 2, link: '', silk: 'HC-05', alias: 'hc05;蓝牙;bluetooth;从机', desc: '与手机配对后串口透传，手机遥控小车的核心。' },
  { code: 'TX-002', name: '2.4G 无线模块',          model: 'nRF24L01+', cat: '通信模块', sub: '无线电', tags: ['远距离'], unit: '个', loc: 'B架-3层-02盒', price: 8, stock: 6, minStock: 2, link: '', silk: 'nRF24L01+', alias: 'nrf24l01;2.4g;无线', desc: '板对板 2.4G 无线通信，遥控器/数据链路用。' },
  { code: 'TX-003', name: 'RFID 读卡模块',          model: 'RC522', cat: '通信模块', sub: 'RFID/NFC', tags: ['门禁'], unit: '个', loc: 'B架-3层-02盒', price: 12, stock: 3, minStock: 1, link: '', silk: 'RC522', alias: 'rfid;rc522;刷卡;nfc', desc: '读 IC 卡 UID，门禁/储值系统项目核心。' },
  { code: 'TX-004', name: 'USB 转 TTL 模块',         model: 'CH340G', cat: '通信模块', sub: '有线转接', tags: ['下载必备'], unit: '个', loc: 'B架-3层-03盒', price: 8, stock: 7, minStock: 3, link: '', silk: 'CH340', alias: 'ch340;串口;usb转串口;ttl', desc: '给 51/STM32 下载程序和串口调试必备，请勿拿走不还。' },
  /* --- 电源管理 --- */
  { code: 'DY-001', name: '18650 电池',             model: '三星 2600mAh 平头', cat: '电源管理', sub: '电池/电池盒', tags: ['小车供电', '常用'], unit: '个', loc: 'C架-1层-01盒', price: 10, stock: 8, minStock: 4, link: '', silk: '18650 2600mAh', alias: '18650;锂电池;锂电', desc: '可充电锂电池，小车/便携设备供电主力。充电请用配套充电模块！' },
  { code: 'DY-002', name: '18650 双节电池盒（带开关）', model: '2 节串联带引线', cat: '电源管理', sub: '电池/电池盒', tags: ['小车供电'], unit: '个', loc: 'C架-1层-01盒', price: 4, stock: 6, minStock: 2, link: '', silk: 'battery holder', alias: '电池盒;18650盒', desc: '装两节 18650 输出约 7.4V，小车供电标配。' },
  { code: 'DY-003', name: '锂电池充电模块',        model: 'TP4056 带保护', cat: '电源管理', sub: '充电模块', tags: ['充电'], unit: '个', loc: 'C架-1层-02盒', price: 1.5, stock: 10, minStock: 3, link: '', silk: 'TP4056', alias: 'tp4056;充电模块;charger', desc: 'Micro USB 给 18650 充电，带过充过放保护。' },
  { code: 'DY-004', name: '稳压模块',               model: 'AMS1117 5V/3.3V 双输出', cat: '电源管理', sub: '稳压模块', tags: ['供电'], unit: '个', loc: 'C架-1层-02盒', price: 2, stock: 8, minStock: 3, link: '', silk: 'AMS1117', alias: 'ams1117;稳压;lDO', desc: '电源降压稳压输出 5V/3.3V，给不同电压的模块供电。' },
  { code: 'DY-005', name: '电源适配器',             model: '5V 2A USB 输出', cat: '电源管理', sub: '电源适配器', tags: ['调试供电'], unit: '个', loc: 'C架-1层-03盒', price: 12, stock: 4, minStock: 1, link: '', silk: '5V2A', alias: '适配器;电源;充电头', desc: '桌面调试供电用，输出稳定。' },
  /* --- 基础元件 --- */
  { code: 'JC-001', name: '1kΩ 电阻',               model: '1/4W 直插 ±1%', cat: '基础元件', sub: '电阻', tags: ['常用', '限流'], unit: '个', loc: 'D架-1层-01盒', price: 0.05, stock: 380, minStock: 50, link: '', silk: '102 / 棕黑红金', alias: '电阻;resistor;1k;1千欧;102', desc: '最常用限流/上拉电阻，LED 限流标配。' },
  { code: 'JC-002', name: '10kΩ 电阻',              model: '1/4W 直插 ±1%', cat: '基础元件', sub: '电阻', tags: ['常用', '上拉'], unit: '个', loc: 'D架-1层-01盒', price: 0.05, stock: 320, minStock: 50, link: '', silk: '103 / 棕黑橙金', alias: '电阻;10k;103', desc: '上拉/下拉标配电阻。' },
  { code: 'JC-003', name: '220Ω 电阻',              model: '1/4W 直插 ±5%', cat: '基础元件', sub: '电阻', tags: ['LED限流'], unit: '个', loc: 'D架-1层-01盒', price: 0.05, stock: 240, minStock: 50, link: '', silk: '红红棕金', alias: '电阻;220r;红红棕', desc: '5V 供电下 LED 点亮的常用限流值。' },
  { code: 'JC-004', name: 'LED 灯珠（红）',          model: '5mm 直插 红', cat: '基础元件', sub: '指示灯', tags: ['常用', '指示'], unit: '个', loc: 'D架-1层-02盒', price: 0.1, stock: 150, minStock: 30, link: '', silk: '无字标', alias: 'led;发光二极管;灯珠;灯泡;指示灯', desc: '5mm 直插红色 LED，实验/指示灯用，注意长脚为正。' },
  { code: 'JC-005', name: 'LED 灯珠（绿）',          model: '5mm 直插 绿', cat: '基础元件', sub: '指示灯', tags: ['常用', '指示'], unit: '个', loc: 'D架-1层-02盒', price: 0.1, stock: 120, minStock: 30, link: '', silk: '无字标', alias: 'led;绿灯;发光二极管', desc: '5mm 直插绿色 LED。' },
  { code: 'JC-006', name: 'LED 灯珠（蓝）',          model: '5mm 直插 蓝', cat: '基础元件', sub: '指示灯', tags: ['装饰'], unit: '个', loc: 'D架-1层-02盒', price: 0.15, stock: 80, minStock: 30, link: '', silk: '无字标', alias: 'led;蓝灯', desc: '5mm 直插蓝色 LED，灯效装饰用。' },
  { code: 'JC-007', name: '整流二极管',              model: '1N4007', cat: '基础元件', sub: '二极管', tags: ['防反接'], unit: '个', loc: 'D架-1层-03盒', price: 0.1, stock: 90, minStock: 20, link: '', silk: '1N4007', alias: '4007;二极管;diode', desc: '1A 1000V 整流/防反接二极管，电源输入防接反。' },
  { code: 'JC-008', name: 'NPN 三极管',             model: 'S8050', cat: '基础元件', sub: '三极管', tags: ['驱动', '开关'], unit: '个', loc: 'D架-1层-03盒', price: 0.15, stock: 70, minStock: 20, link: '', silk: 'S8050', alias: '8050;三极管;transistor', desc: '小电流控制大电流的开关三极管，驱动蜂鸣器/风扇。' },
  { code: 'JC-009', name: '定时器芯片',              model: 'NE555P', cat: '基础元件', sub: '集成芯片', tags: ['经典', '模电'], unit: '个', loc: 'D架-1层-04盒', price: 0.8, stock: 25, minStock: 8, link: '', silk: 'NE555P', alias: '555;ne555;定时器', desc: '经典 555 定时器，PWM/振荡电路教学经典。' },
  { code: 'JC-010', name: '运算放大器',              model: 'LM358', cat: '基础元件', sub: '集成芯片', tags: ['信号放大'], unit: '个', loc: 'D架-1层-04盒', price: 1, stock: 15, minStock: 5, link: '', silk: 'LM358', alias: '358;运放;opamp', desc: '双运放，传感器信号放大/比较器实验用。' },
  { code: 'JC-011', name: '微动开关按键',            model: '6x6x5 直插四脚', cat: '基础元件', sub: '开关/按键', tags: ['常用'], unit: '个', loc: 'D架-1层-05盒', price: 0.15, stock: 110, minStock: 30, link: '', silk: '无字标', alias: '按键;轻触开关;button;开关', desc: '6x6 微动按键，抢答器/菜单确认用。' },
  { code: 'JC-012', name: '自锁开关',                model: '8x8 自锁', cat: '基础元件', sub: '开关/按键', tags: ['电源开关'], unit: '个', loc: 'D架-1层-05盒', price: 0.5, stock: 20, minStock: 5, link: '', silk: '无字标', alias: '自锁;带锁开关', desc: '按一下导通再按断开，设备总开关。' },
  { code: 'JC-013', name: '有源蜂鸣器',              model: '5V 有源', cat: '基础元件', sub: '蜂鸣器', tags: ['提示音', '报警'], unit: '个', loc: 'D架-1层-06盒', price: 1, stock: 18, minStock: 5, link: '', silk: '无字标', alias: '蜂鸣器;buzzer;喇叭;报警器', desc: '通电就响，报警/提示音用（无源的要给方波信号）。' },
  { code: 'JC-014', name: '10kΩ 电位器',             model: '3386 卧式', cat: '基础元件', sub: '电位器', tags: ['调压'], unit: '个', loc: 'D架-1层-06盒', price: 1.2, stock: 12, minStock: 4, link: '', silk: '3386 103', alias: '电位器;旋钮;可调电阻;103', desc: '旋转调节阻值/分压，调光/调速/对比度调节。' },
  { code: 'JC-015', name: '排针（公针）',            model: '2.54mm 单排 40P', cat: '基础元件', sub: '排针/排母', tags: ['连接'], unit: '条', loc: 'D架-1层-07盒', price: 1.5, stock: 15, minStock: 5, link: '', silk: '无字标', alias: '排针;针座;header', desc: '模块焊接/转接用排针。' },
  { code: 'JC-016', name: '面包板',                  model: '830 孔标准', cat: '基础元件', sub: '其他元件', tags: ['免焊', '常用'], unit: '块', loc: 'D架-1层-08盒', price: 6, stock: 8, minStock: 3, link: '', silk: '无字标', alias: '面包板;breadboard;万用板', desc: '免焊接搭电路，培训/原型验证必备。' },
  { code: 'JC-017', name: '电解电容套装',            model: '0.1uF~1000uF 常用值', cat: '基础元件', sub: '电容', tags: ['滤波'], unit: '包', loc: 'D架-1层-09盒', price: 12, stock: 3, minStock: 1, link: '', silk: '无字标', alias: '电容;capacitor;电解', desc: '常用容量电解电容混装，电源滤波用。' },
  /* --- 线材连接 --- */
  { code: 'XC-001', name: '杜邦线（公对母）',       model: '20cm 40 根装', cat: '线材连接', sub: '杜邦线', tags: ['常用', '必备'], unit: '排', loc: 'E架-1层-01盒', price: 3, stock: 24, minStock: 10, link: '', silk: '无字标', alias: '杜邦线;面包线;跳线;彩排线;公对母', desc: '连接模块与开发板的排线，用完请扎好放回。' },
  { code: 'XC-002', name: '杜邦线（公对公）',       model: '20cm 40 根装', cat: '线材连接', sub: '杜邦线', tags: ['常用', '必备'], unit: '排', loc: 'E架-1层-01盒', price: 3, stock: 20, minStock: 10, link: '', silk: '无字标', alias: '杜邦线;跳线;公对公', desc: '面包板电路连接用。' },
  { code: 'XC-003', name: 'USB Type-C 数据线',      model: '1m 充电+传数据', cat: '线材连接', sub: 'USB线', tags: ['常用'], unit: '根', loc: 'E架-1层-02盒', price: 6, stock: 5, minStock: 2, link: '', silk: '无字标', alias: 'typec;数据线;充电线;usb-c', desc: '给开发板供电/下载程序。' },
  { code: 'XC-004', name: '鳄鱼夹线',                model: '双头鳄鱼夹 50cm', cat: '线材连接', sub: '鳄鱼夹线', tags: ['临时连接'], unit: '根', loc: 'E架-1层-02盒', price: 1.5, stock: 10, minStock: 3, link: '', silk: '无字标', alias: '鳄鱼夹;测试线;夹子线', desc: '临时夹接测试用线，万用表测量配。' },
  /* --- 工具 --- */
  { code: 'GJ-001', name: '电烙铁',                  model: '60W 可调温', cat: '工具', sub: '焊接工具', tags: ['共用工具'], unit: '把', loc: 'C架-2层-01格', price: 35, stock: 3, minStock: 0, link: '', silk: '60W', alias: '烙铁;soldering iron;焊台', desc: '共用工具，使用后放回烙铁架并断电！' },
  { code: 'GJ-002', name: '万用表',                  model: '胜利 VC890D', cat: '工具', sub: '测量仪器', tags: ['共用工具', '必备'], unit: '台', loc: 'C架-2层-02格', price: 55, stock: 2, minStock: 1, link: '', silk: 'VC890D', alias: '万用表;multimeter;测电压', desc: '测量电压/电流/电阻/通断，调试必备。用完请归位。' },
  { code: 'GJ-003', name: '螺丝刀套装',              model: '十字+一字+内六角 24 合1', cat: '工具', sub: '螺丝刀', tags: ['共用工具'], unit: '套', loc: 'C架-2层-03格', price: 20, stock: 2, minStock: 0, link: '', silk: '24in1', alias: '螺丝刀;批头;起子', desc: '拆装设备/结构件用。' },
  { code: 'GJ-004', name: '防静电镊子',              model: '直头 ES-10', cat: '工具', sub: '镊子', tags: ['贴片'], unit: '把', loc: 'C架-2层-03格', price: 6, stock: 4, minStock: 1, link: '', silk: 'ES-10', alias: '镊子;tweezer', desc: '夹取小元件/贴片焊接辅助。' },
  { code: 'GJ-005', name: '斜口钳',                  model: '6寸', cat: '工具', sub: '钳/刀', tags: ['剪线'], unit: '把', loc: 'C架-2层-04格', price: 15, stock: 2, minStock: 0, link: '', silk: '无字标', alias: '斜口钳;剪线钳', desc: '剪断元件引脚/导线。' },
  /* --- 耗材 --- */
  { code: 'HC-001', name: '焊锡丝',                  model: '0.8mm 含铅 100g', cat: '耗材', sub: '焊锡/助焊', tags: ['焊接', '易耗'], unit: '卷', loc: 'C架-3层-01盒', price: 18, stock: 3, minStock: 1, link: '', silk: '0.8mm', alias: '焊锡;锡丝;solder', desc: '焊接耗材，0.8mm 粗细适合新手。' },
  { code: 'HC-002', name: '松香助焊膏',              model: '盒装 20g', cat: '耗材', sub: '焊锡/助焊', tags: ['焊接', '易耗'], unit: '盒', loc: 'C架-3层-01盒', price: 5, stock: 4, minStock: 1, link: '', silk: '无字标', alias: '松香;助焊剂;flux', desc: '辅助上锡，防止虚焊。' },
  { code: 'HC-003', name: '热缩管套装',              model: '1~10mm 混装 1 米×6', cat: '耗材', sub: '热缩管', tags: ['绝缘'], unit: '套', loc: 'C架-3层-02盒', price: 10, stock: 3, minStock: 1, link: '', silk: '无字标', alias: '热缩管;heat shrink', desc: '焊点/接头绝缘保护，加热收缩固定。' },
  { code: 'HC-004', name: '扎带',                    model: '3x100 尼龙 100 根', cat: '耗材', sub: '扎带', tags: ['理线'], unit: '包', loc: 'C架-3层-02盒', price: 4, stock: 5, minStock: 1, link: '', silk: '无字标', alias: '扎带;束线带;cable tie', desc: '理线/固定结构件。' },
  { code: 'HC-005', name: '热熔胶棒',                model: '7mm 透明 20 根', cat: '耗材', sub: '胶类', tags: ['固定'], unit: '包', loc: 'C架-3层-03盒', price: 5, stock: 4, minStock: 1, link: '', silk: '无字标', alias: '胶棒;热熔胶;hot glue', desc: '配合胶枪快速固定元件/结构。' },
  { code: 'HC-006', name: 'M3 螺丝螺母套装',         model: 'M3×6/8/12 + 螺母混装', cat: '耗材', sub: '螺丝螺母', tags: ['结构件'], unit: '盒', loc: 'C架-3层-04盒', price: 10, stock: 3, minStock: 1, link: '', silk: 'M3', alias: 'm3;螺丝;螺钉;screw', desc: '底盘/支架安装标配螺丝。' },
  /* --- 结构件 --- */
  { code: 'JG-001', name: '两轮小车底盘',            model: '亚克力 2WD 带电机孔位', cat: '结构件', sub: '小车底盘', tags: ['小车', '比赛'], unit: '套', loc: 'E架-2层-01格', price: 12, stock: 5, minStock: 2, link: '', silk: '无字标', alias: '底盘;车架;chassis', desc: '两轮差速底盘，循迹/避障小车车身。' },
  { code: 'JG-002', name: '小车车轮',                model: '65mm 橡胶轮 内孔 3mm', cat: '结构件', sub: '车轮', tags: ['小车'], unit: '个', loc: 'E架-2层-01格', price: 3, stock: 14, minStock: 6, link: '', silk: '65mm', alias: '车轮;轮子;wheel;胎', desc: '配合 TT 马达（需对应联轴）使用。' },
  { code: 'JG-003', name: 'M3 铜柱套装',             model: '单头/双头 M3 混装', cat: '结构件', sub: '支架', tags: ['支撑'], unit: '包', loc: 'E架-2层-02格', price: 8, stock: 4, minStock: 1, link: '', silk: 'M3', alias: '铜柱;尼龙柱; standoff', desc: '层叠固定开发板与传感器板。' },
  { code: 'JG-004', name: '舵机云台支架',            model: 'SG90 舵机 2 自由度', cat: '结构件', sub: '支架', tags: ['云台'], unit: '套', loc: 'E架-2层-02格', price: 8, stock: 3, minStock: 1, link: '', silk: '无字标', alias: '云台;支架;gimbal', desc: '两个舵机组成上下左右云台，装超声波/摄像头。' },
  { code: 'JG-005', name: '亚克力板',                 model: '10x10cm 厚 3mm', cat: '结构件', sub: '板材', tags: ['结构'], unit: '块', loc: 'E架-2层-03格', price: 3, stock: 10, minStock: 2, link: '', silk: '无字标', alias: '亚克力;有机玻璃;acrylic;板子料', desc: '自制结构切割用板。' }
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
