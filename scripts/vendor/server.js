/**
 * 飞书多维表格代理服务（多表架构版 v3）
 * 前端通过 /api/* 接口读写飞书数据，后端用飞书 OpenAPI（tenant_access_token）直连多维表格
 *
 * 表结构（9张表）：
 *   配置表：配置-科目、配置-等级、配置-XP规则、配置-能力模块
 *   记录表：记录-作业、记录-成绩、记录-XP获得、记录-财务流水、记录-期末评价
 *
 * 说明：作业类型已合并进"配置-XP规则"（作业·类型规则），不再单建配置-作业类型表；
 *       权益兑换状态（是否兑换/兑换时间）直接记录在"配置-等级"表对应行，不再使用记录-权益兑换表。
 *
 * 依赖环境变量：
 *   LARK_APP_ID      企业自建应用的 App ID
 *   LARK_APP_SECRET  企业自建应用的 App Secret
 *   LARK_BASE_TOKEN  多维表格 base token（可选，默认内置）
 *
 * 启动: node server.js
 * 端口: 8001
 */

const http = require("http");

const fs = require("fs");
const path = require("path");
const url = require("url");
// 飞书多维表格 OpenAPI 适配层（替代外部 lark-cli，可云端运行）
const feishu = require("./feishu-api");

const PORT = process.env.PORT || 8001;
// 飞书多维表格 base token：优先从环境变量读取，未设置时回退到默认值
const BASE_TOKEN = process.env.LARK_BASE_TOKEN || "EgnqbkrzcafOnrs1ESnc6jiDnkg";

// 孩子基本信息（唯一数据源是飞书配置-个人信息表，启动即从飞书加载覆盖）
// 此处仅作空默认值占位，避免硬编码真实个人信息；真实数据一律在 loadPersonalInfo() 中从飞书读取
const CHILD_INFO = {
  name: "",
  birthday: "",
  gender: "",
  grade: "",
  school: "",
  className: "",
  studentId: "",
  avatar: "",
  motto: "",
};

// 校历数据缓存（默认空，启动时从飞书配置-校历表加载）
let CALENDAR_DATA = [];

// 个人信息记录ID缓存（用于更新飞书配置-个人信息表）
let personalRecordId = null;

// ══════════════════════════════════════
// 读取缓存层（缓解"数据越多越慢"）
// 前端每次切页都会请求 /api/data 并全量重读飞书表。这里加一层内存缓存：
//   - 读请求在 TTL 内直接返回缓存（秒级返回），不再重复重读飞书；
//   - 任何写操作成功后立即失效缓存，保证下次读取拿到最新数据，与飞书一致。
// TTL 设 3 秒：纯浏览（连续切页）命中缓存更快；写操作即时失效；飞书表格外部改动最多 3 秒内可见。
const DASHBOARD_TTL_MS = 3000;
let dashboardCache = null;        // { data, ts }
let dashboardCachePromise = null; // 并发请求时只构建一次

function invalidateDashboardCache() {
  dashboardCache = null;
}

async function getDashboard() {
  const now = Date.now();
  if (dashboardCache && now - dashboardCache.ts < DASHBOARD_TTL_MS) {
    return dashboardCache.data;
  }
  // 并发合并：多个同时 miss 的请求只触发一次飞书全量读取
  if (dashboardCachePromise) return dashboardCachePromise;
  dashboardCachePromise = (async () => {
    await Promise.allSettled([loadPersonalInfo(), loadCalendarConfig()]);
    const data = await buildDashboard();
    dashboardCache = { data, ts: Date.now() };
    return data;
  })();
  try {
    return await dashboardCachePromise;
  } finally {
    dashboardCachePromise = null;
  }
}

// 表 ID 映射
const TABLES = {
  "config-subject": "tblqZHxnVEeKqs9I",    // 配置-科目
  "config-level": "tblT20qy329BcYsq",       // 配置-等级
  "config-xp-rule": "tblrFP0Jmiq8WDCT",     // 配置-XP规则
  "config-ability-module": "tblDSS5DrM9nUk7Y", // 配置-能力模块
  "config-personal": "tblxEk4eWeObbW3G",    // 配置-个人信息
  "config-calendar": "tblr5xFPgOFOaI7r",    // 配置-校历
  "record-homework": "tbl39gCCirCdSy43",    // 记录-作业
  "record-score": "tblnXJB8o0r2hrNO",       // 记录-成绩
  "record-xp": "tblDkfJ68JNp1S8w",          // 记录-XP获得
  "record-finance": "tblGWWf3IWjceBqG",     // 记录-财务流水
  "record-evaluation": "tbliX7Z2oMF9feMx",  // 记录-期末评价
};

// 中文数字 → 序号映射
const GRADE_CN = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };

// 学期标识解析工具：从"三年级(下)" 解析出 year, semester, semesterLabel
function parseSemesterLabel(label, dateVal) {
  const cnNums = ["一", "二", "三", "四", "五", "六"];
  let year = "", semester = "", semesterLabel = "";
  if (label) {
    semesterLabel = label;
    // 匹配 "三年级(下)学期" 或 "三年级(下)" 或 "三年级下学期"
    const match = String(label).match(/([一二三四五六七八九十]+)年级[（(]?([上下])[）)]?学期?/);
    if (match) {
      const gradeNum = cnNums.indexOf(match[1]) + 1;
      const birthYear = parseInt(CHILD_INFO.birthday.slice(0, 4));
      const firstGradeYear = birthYear + 7;
      const startYear = firstGradeYear + gradeNum - 1;
      year = startYear + "-" + (startYear + 1);
      semester = match[2] === "上" ? "第一学期" : "第二学期";
    }
  } else if (dateVal) {
    const d = new Date(dateVal);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (m >= 9) { year = y + "-" + (y + 1); semester = "第一学期"; }
    else { year = (y - 1) + "-" + y; semester = "第二学期"; }
  }
  return { year, semester, semesterLabel };
}

// 从学期标签获取排序值：{ gradeNum, term }
function semesterSortValue(label, semester) {
  const m = String(label).match(/([一二三四五六七八九十]+)年级[（(]?([上下]?)[）)]?/);
  const gradeNum = m ? (GRADE_CN[m[1]] || 0) : 0;
  let term = m && m[2] ? (m[2] === "下" ? 2 : 1) : 0;
  if (semester === "第二学期") term = 2;
  else if (semester === "第一学期") term = 1;
  return { gradeNum, term };
}

// 默认模块关键词映射
const MODULE_KEYWORDS = {
  "语文": {
    "拼音": ["拼音", "拼读", "音节"],
    "汉字": ["汉字", "生字", "写字", "练字"],
    "组词": ["组词", "造句", "词语"],
    "阅读": ["阅读", "朗读", "背诵", "默写"],
    "作文": ["作文", "写作", "日记", "小作文"],
  },
  "数学": {
    "概念": ["概念", "定义", "认识", "理解"],
    "公式定理": ["公式", "定理", "定律", "性质"],
    "计算": ["计算", "口算", "笔算", "竖式", "脱式"],
    "推理": ["推理", "应用题", "解决问题", "思考题"],
    "直觉": ["估算", "数感", "直觉", "巧算", "思维"],
  },
  "英语": {
    "听说": ["听", "说", "朗读", "跟读", "听力", "对话", "口语"],
    "单词": ["单词", "词汇", "默写", "听写", "拼写", "抄写"],
    "语感": ["语感", "句型", "语法", "时态", "句子"],
    "阅读": ["阅读", "短文", "绘本", "故事", "阅读理解"],
    "写作": ["写作", "作文", "写话", "句子", "小作文"],
  },
};

// 等级对应的徽章颜色
const LEVEL_BADGES = [
  { badgeClass: "bronze", themeColor: "#CD7F32" },
  { badgeClass: "silver", themeColor: "#C0C0C0" },
  { badgeClass: "gold", themeColor: "#FFD700" },
  { badgeClass: "platinum", themeColor: "#E5E4E2" },
  { badgeClass: "diamond", themeColor: "#B9F2FF" },
  { badgeClass: "master", themeColor: "#9966CC" },
  { badgeClass: "legendary", themeColor: "#FF6B6B" },
  { badgeClass: "mythic", themeColor: "#FFD700" },
  { badgeClass: "divine", themeColor: "#FFE4B5" },
];

// 作业类型 → 默认 XP（需与 xpSources.json 中"作业·XX"任务分值完全一致）
// 作业类型统一为4种：日常预习2 / 日常复习2 / 暑假作业2 / 特色作业4（家庭作业合并到特色作业）
const DEFAULT_HOMEWORK_XP = {
  "日常预习": 2,
  "日常复习": 2,
  "暑假作业": 2,
  "特色作业": 4,
};

// 配置-XP规则表 的 XP分类 单选字段合法选项（配置表不允许自定义选项）
const VALID_RULE_CATEGORIES = ["学习成长", "兴趣爱好", "身体成长", "能力成长"];
function sanitizeRuleCategory(cate) {
  return VALID_RULE_CATEGORIES.includes(cate) ? cate : "学习成长";
}

// 读取一张表的所有记录
// multiValueFields: 需要保留为数组的字段名列表（用于多选字段）
async function fetchTable(tableId, multiValueFields = []) {
  return feishu.fetchTable(tableId, multiValueFields);
}

// 创建记录
async function createRecord(tableId, fields) {
  return feishu.createRecord(tableId, fields);
}

// 更新记录
async function updateRecord(tableId, recordId, fields) {
  return feishu.updateRecord(tableId, recordId, fields);
}

// 将能力模块名称解析为关联记录 ID 数组
// 输入: subject="数学", moduleNames=["公式定理","计算"]
// 输出: [{id:"rec_xxx"}, {id:"rec_yyy"}]
async function resolveModuleNames(subject, moduleNames) {
  if (!moduleNames || moduleNames.length === 0) return [];
  const moduleList = await fetchTable(TABLES["config-ability-module"]);
  const result = [];
  for (const name of moduleNames) {
    // 如果带了科目前缀（如"数学-公式定理"），先去掉
    const cleanName = String(name).includes("-") ? String(name).split("-").pop() : name;
    const match = moduleList.find(r =>
      r["模块名称"] === cleanName &&
      (subject ? r["科目"] === subject : true)
    );
    if (match) {
      result.push({ id: match.record_id });
    }
  }
  return result;
}

// 将名称解析为关联记录 ID（通用函数）
// 输入: tableKey="config-subject", nameField="科目名称", value="语文"
// 输出: [{id:"rec_xxx"}] 或 []
async function resolveLinkRecordId(tableKey, nameField, value) {
  if (!value) return [];
  const list = await fetchTable(TABLES[tableKey]);
  const match = list.find(r => r[nameField] === value);
  return match ? [{ id: match.record_id }] : [];
}

// 从飞书配置-个人信息表加载孩子信息到内存（覆盖默认值）
async function loadPersonalInfo() {
  try {
    const rows = await fetchTable(TABLES["config-personal"]);
    const row = rows[0];
    if (!row) return;
    personalRecordId = row.record_id || null;
    if (row["姓名"]) CHILD_INFO.name = row["姓名"];
    if (row["出生日期"]) CHILD_INFO.birthday = row["出生日期"];
    if (row["性别"]) CHILD_INFO.gender = row["性别"];
    if (row["年级"]) CHILD_INFO.grade = row["年级"];
    if (row["学校"]) CHILD_INFO.school = row["学校"];
    if (row["班级"]) CHILD_INFO.className = row["班级"];
    if (row["学号"]) CHILD_INFO.studentId = row["学号"];
    if (row["格言"]) CHILD_INFO.motto = row["格言"];
  } catch (e) {
    console.error("加载个人信息失败:", e.message);
  }
}

// 从飞书配置-校历表加载校历数据到内存
async function loadCalendarConfig() {
  try {
    const rows = await fetchTable(TABLES["config-calendar"]);
    CALENDAR_DATA = rows.map(r => ({
      academicYear: r["学年"] || "",
      grade: r["年级"] || "",
      semester1: {
        name: "第一学期",
        shortName: "上",
        startDate: r["学期1开学"] || "",
        midTermStart: r["学期1期中"] || "",
        finalExamStart: r["学期1期末"] || "",
        winterBreakStart: r["寒假开始"] || "",
        teachingWeeks: Number(r["学期1周数"]) || 0,
      },
      semester2: {
        name: "第二学期",
        shortName: "下",
        startDate: r["学期2开学"] || "",
        midTermStart: r["学期2期中"] || "",
        finalExamStart: r["学期2期末"] || "",
        summerBreakStart: r["暑假开始"] || "",
        teachingWeeks: Number(r["学期2周数"]) || 0,
      }
    })).filter(y => y.academicYear);
  } catch (e) {
    console.error("加载校历配置失败:", e.message);
  }
}

// 将校历数据写回飞书配置-校历表（按学年匹配更新）
async function saveCalendarConfig(calendarData) {
  try {
    const rows = await fetchTable(TABLES["config-calendar"]);
    const rowByYear = {};
    for (const r of rows) rowByYear[r["学年"]] = r;
    for (const y of calendarData) {
      const existing = rowByYear[y.academicYear];
      const fields = {
        "学年": y.academicYear,
        "年级": y.grade || "",
        "学期1开学": y.semester1?.startDate || "",
        "学期1期中": y.semester1?.midTermStart || "",
        "学期1期末": y.semester1?.finalExamStart || "",
        "寒假开始": y.semester1?.winterBreakStart || "",
        "学期1周数": y.semester1?.teachingWeeks || 0,
        "学期2开学": y.semester2?.startDate || "",
        "学期2期中": y.semester2?.midTermStart || "",
        "学期2期末": y.semester2?.finalExamStart || "",
        "暑假开始": y.semester2?.summerBreakStart || "",
        "学期2周数": y.semester2?.teachingWeeks || 0,
      };
      if (existing) {
        await updateRecord(TABLES["config-calendar"], existing.record_id, fields);
      } else {
        await createRecord(TABLES["config-calendar"], fields);
      }
    }
  } catch (e) {
    console.error("保存校历配置失败:", e.message);
  }
}

// 作业完成后，按作业类型自动发放 XP（幂等：已发放过则跳过）
// 在 PUT /api/homework 标记"已完成"时调用
async function autoGrantHomeworkXp(recordId) {
  try {
    const rows = await fetchTable(TABLES["record-homework"]);
    const rec = rows.find(r => r.record_id === recordId);
    if (!rec) return;
    if (rec["作业状态"] !== "已完成") return;
    // 幂等：使用可写的"已发放XP"字段标记，避免重复发放（"获得XP"为只读 lookup，不能作为判断依据）
    if (rec["已发放XP"] === "已发放") return;

    // 学科是关联字段（[{id:"rec_xxx"}]），需反查为名称
    let subjectRows = [];
    try { subjectRows = await fetchTable(TABLES["config-subject"]); } catch (e) {}

    // 作业类型：已合并为纯文本字段（原关联字段兼容：取 text 或纯文本）
    const tRaw = rec["作业类型"];
    const tArr = Array.isArray(tRaw) ? tRaw : (tRaw ? [tRaw] : []);
    const tFirst = tArr[0];
    let hwType = "日常预习";
    if (tFirst && typeof tFirst === "object") hwType = tFirst.text || "日常预习";
    else if (tFirst) hwType = String(tFirst).trim() || "日常预习";

    let subject = "其他";
    const sRaw = rec["学科"] || rec["科目"];
    const sArr = Array.isArray(sRaw) ? sRaw : (sRaw ? [sRaw] : []);
    const sId = sArr[0] && sArr[0].id;
    const sMatch = sId && subjectRows.find(r => r.record_id === sId);
    subject = (sMatch && sMatch["科目名称"]) || (sArr[0] && sArr[0].text) || "其他";

    const title = rec["标题"] || "";
    const cleanTitle = String(title).replace(/^\d{2}-\d{2}[^：]*[：:]\s*/, "").trim() || title;
    // 优先级：XP 规则表"作业·类型" > 内置默认值（作业类型 XP 已统一在配置-XP规则表维护）
    const ruleRows = await fetchTable(TABLES["config-xp-rule"]);
    let xpValue = (DEFAULT_HOMEWORK_XP[hwType] || 5);
    for (const r of ruleRows) {
      if (r["规则名称"] === ("作业·" + hwType) && r["XP分值"] !== undefined && r["XP分值"] !== null && r["XP分值"] !== "") {
        xpValue = Number(r["XP分值"]) || xpValue;
        break;
      }
    }
    const xpFields = {};
    // XP任务 是关联字段，需关联到 XP规则表（作业·类型），XP分值由 lookup 自动计算
    const ruleName = "作业·" + hwType;
    const rule = ruleRows.find(r => r["规则名称"] === ruleName);
    const ruleRecordId = rule ? rule.record_id : null;
    if (!ruleRecordId) {
      const rf = { "规则名称": ruleName, "XP分类": "学习成长", "XP分值": xpValue, "计分方式": "按次", "说明": "完成作业自动发放" };
      await createRecord(TABLES["config-xp-rule"], rf);
      // 重新读取以拿到新规则的 record_id
      const freshRules = await fetchTable(TABLES["config-xp-rule"]);
      const freshRule = freshRules.find(r => r["规则名称"] === ruleName);
      if (freshRule) xpFields["XP任务"] = [{ id: freshRule.record_id }];
    } else {
      xpFields["XP任务"] = [{ id: rule.record_id }];
    }
    xpFields["说明"] = `完成${subject}作业（${hwType}）`;
    xpFields["XP分类"] = "学习成长";
    xpFields["获得时间"] = new Date().toISOString().slice(0, 19).replace("T", " ");
    // 审核状态设为"已通过"，使该记录计入能量（总 XP 只统计已通过的记录）
    xpFields["审核状态"] = "已通过";
    // 关联到作业记录（与财务"记录-财务"相同的关联模式，通过"记录-作业"字段）
    xpFields["记录-作业"] = [{ id: recordId }];
    await createRecord(TABLES["record-xp"], xpFields);
    // 回填作业的"已发放XP"标记，避免重复发放
    await updateRecord(TABLES["record-homework"], recordId, { "已发放XP": "已发放" });
  } catch (err) {
    console.error("autoGrantHomeworkXp failed:", err.message);
  }
}

// 财务分析记录添加后，自动发放"财务能力分析"XP（幂等：已有关联XP则跳过）
// 在 POST /api/finance 添加带"是否值得"的分析记录时调用
async function autoGrantFinanceXp(recordId) {
  try {
    const rows = await fetchTable(TABLES["record-finance"]);
    const rec = rows.find(r => r.record_id === recordId);
    if (!rec) return;
    // 仅"分析记录"发放：需填写了"是否值得"
    if (!rec["是否值得"]) return;
    // 幂等：检查已有 XP 记录是否已关联该财务记录（"记录-财务"为 link 字段）
    const xpRows = await fetchTable(TABLES["record-xp"]);
    const alreadyLinked = xpRows.some(r => {
      const link = r["记录-财务"];
      if (!link) return false;
      const arr = Array.isArray(link) ? link : [link];
      return arr.some(l => (l && (l.id === recordId || l.record_id === recordId)));
    });
    if (alreadyLinked) return;

    // 确保"财务能力分析"规则存在（不存在则创建，XP分值/分类由 lookup 自动计算）
    const ruleRows = await fetchTable(TABLES["config-xp-rule"]);
    let rule = ruleRows.find(r => r["规则名称"] === "财务能力分析");
    let ruleRecordId = rule ? rule.record_id : null;
    if (!ruleRecordId) {
      const rf = { "规则名称": "财务能力分析", "XP分类": "能力成长", "XP分值": 5, "计分方式": "按次", "说明": "完成一次财务对账与反思，培养财商思维" };
      ruleRecordId = await createRecord(TABLES["config-xp-rule"], rf);
    }
    const xpFields = {};
    if (ruleRecordId) xpFields["XP任务"] = [{ id: ruleRecordId }];
    xpFields["说明"] = "完成一次财务分析";
    xpFields["获得时间"] = (rec["日期"] ? String(rec["日期"]).slice(0, 10) : new Date().toISOString().slice(0, 10)) + " 12:00:00";
    xpFields["审核状态"] = "已通过";
    // 关联到财务记录（图3：XP记录的"记录-财务"字段）
    xpFields["记录-财务"] = [{ id: recordId }];
    await createRecord(TABLES["record-xp"], xpFields);
  } catch (err) {
    console.error("autoGrantFinanceXp failed:", err.message);
  }
}

// ══════════════════════════════════════════
// 数据聚合
// ══════════════════════════════════════════

async function buildDashboard() {
  const [
    homeworkList,
    scoreList,
    xpList,
    financeList,
    evaluationList,
    levelList,
    xpRuleList,
    subjectList,
    abilityModuleList,
  ] = await Promise.all([
    fetchTable(TABLES["record-homework"], ["能力模块"]),
    fetchTable(TABLES["record-score"], ["错误模块"]),
    fetchTable(TABLES["record-xp"]),
    fetchTable(TABLES["record-finance"]),
    fetchTable(TABLES["record-evaluation"]),
    fetchTable(TABLES["config-level"]),
    fetchTable(TABLES["config-xp-rule"]),
    fetchTable(TABLES["config-subject"]),
    fetchTable(TABLES["config-ability-module"]),
  ]);

  // 能力模块配置（按科目分组）
  const abilityModulesBySubject = {};
  // 关联记录反查映射：record_id → 名称
  const subjectIdToName = {};
  const moduleIdToName = {};
  for (const r of subjectList) {
    if (r.record_id && r["科目名称"]) subjectIdToName[r.record_id] = r["科目名称"];
  }
  for (const r of abilityModuleList) {
    if (r.record_id && r["能力模块"]) moduleIdToName[r.record_id] = r["能力模块"];
  }

  // 关联记录名称解析：兼容 关联记录 [{id:"rec_xxx"}]、[{id,text}]、纯文本字符串
  // linkVal 可能来自多选数组或单选字段，返回单个名称（单选）/首名称（多选）
  function resolveLinkName(linkVal, idToName) {
    if (linkVal === null || linkVal === undefined) return "";
    let arr = Array.isArray(linkVal) ? linkVal : [linkVal];
    for (const item of arr) {
      if (item === null || item === undefined) continue;
      if (typeof item === "object") {
        const name = (item.id && idToName[item.id]) || item.text || "";
        if (name) return name;
      } else {
        return String(item);
      }
    }
    return "";
  }
  // 关联记录多选字段 → 名称数组（兼容纯文本数组）
  function resolveLinkNamesArr(linkVal, idToName) {
    if (!linkVal) return [];
    const arr = Array.isArray(linkVal) ? linkVal : [linkVal];
    const names = [];
    for (const item of arr) {
      if (item === null || item === undefined) continue;
      if (typeof item === "object") {
        const name = (item.id && idToName[item.id]) || item.text || "";
        if (name) names.push(name);
      } else {
        const s = String(item);
        const idx = s.indexOf("-");
        names.push(idx > 0 ? s.slice(idx + 1) : s);
      }
    }
    return names.filter(Boolean);
  }
  for (const r of abilityModuleList) {
    // 科目是关联字段（[{id:"rec_xxx"}]），需反查为科目名称
    const subject = resolveLinkName(r["科目"], subjectIdToName);
    const moduleName = r["能力模块"] || "";
    if (!subject || !moduleName) continue;
    if (!abilityModulesBySubject[subject]) abilityModulesBySubject[subject] = [];
    abilityModulesBySubject[subject].push({
      id: r.record_id,        // 飞书记录 ID，用于关联记录写入
      name: moduleName,
      description: r["模块描述"] || "",
      order: Number(r["排序"]) || 0,
    });
  }
  // 按排序字段排序
  for (const subject of Object.keys(abilityModulesBySubject)) {
    abilityModulesBySubject[subject].sort((a, b) => a.order - b.order);
  }

  // XP 统计
  const verifiedXp = xpList.filter(r => r["审核状态"] === "已通过");
  const pendingXp = xpList.filter(r => r["审核状态"] === "待确认");
  const totalXP = verifiedXp.reduce((sum, r) => sum + (Number(r["XP分值"]) || 0), 0);

  // 等级配置（支持多权益）
  // 注意：配置-等级表可能存在多行同等级（每行一个权益明细），这里按等级号聚合，
  // 保证每个等级只出现一次，权益合并展示，避免"一个等级重复出现多次"。
  const levelRows = levelList
    .filter(r => r["等级类型"] === "XP等级" || !r["等级类型"])
    .sort((a, b) => {
      const la = Number(a["等级"]) || 0, lb = Number(b["等级"]) || 0;
      if (la !== lb) return la - lb;
      return (a["权益明细"] || "").localeCompare(b["权益明细"] || "");
    });
  const levelMap = new Map(); // key = 等级号
  for (const r of levelRows) {
    const lv = Number(r["等级"]);
    const key = isNaN(lv) ? "Lv." + (r["等级名称"] || "") : lv;
    let entry = levelMap.get(key);
    if (!entry) {
      entry = {
        name: r["等级名称"] || "",
        levelNum: "Lv." + (r["等级"]),
        level: lv,
        xp: Number(r["所需XP"]) || 0,
        description: r["权益说明"] || "",
        privRows: [],
      };
      levelMap.set(key, entry);
    }
    // 收集该等级所有行的权益明细，并携带该行的兑换状态（权益兑换已合并进等级表）
    const text = (r["权益明细"] || r["权益说明"] || "").trim();
    if (text) {
      const redeemedRaw = r["是否兑换"] ?? r["已兑换"] ?? "";
      const redeemed = ["已兑换", "是", "true", "1"].includes(String(redeemedRaw).trim());
      entry.privRows.push({
        text,
        redeemed,
        redeemedAt: r["兑换时间"] && redeemed ? String(r["兑换时间"]).slice(0, 16) : "",
        redeemedDate: r["兑换时间"] && redeemed ? String(r["兑换时间"]).slice(0, 10) : "",
      });
    }
  }
  const levels = [...levelMap.values()]
    .sort((a, b) => (a.level || 0) - (b.level || 0))
    .map((r, i) => {
      const badge = LEVEL_BADGES[i] || LEVEL_BADGES[LEVEL_BADGES.length - 1];
      const isUnlocked = totalXP >= (r.xp || 0);
      // 合并所有权益行，去重，并按其所在行的兑换状态标记
      const seen = new Set();
      const privileges = [];
      for (const row of r.privRows) {
        const parsed = parsePrivilegeDetails(row.text, isUnlocked);
        for (const p of parsed) {
          if (seen.has(p.name)) continue;
          seen.add(p.name);
          if (row.redeemed) {
            p.redeemed = true;
            p.redeemedAt = row.redeemedAt;
            p.redeemedDate = row.redeemedDate;
          }
          privileges.push(p);
        }
      }
      return {
        id: "level_" + i,
        name: r.name,
        levelNum: r.levelNum,
        level: r.level,
        xp: r.xp,
        badgeClass: badge.badgeClass,
        themeColor: badge.themeColor,
        privileges,
        privilegeCount: privileges.length,
        description: r.description,
      };
    });

  // 解析权益明细：支持 "名称|描述" 或 "图标|名称|描述" 格式，每行一个
  function parsePrivilegeDetails(text, unlocked) {
    if (!text) return [];
    const lines = text.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
    return lines.map((line, idx) => {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length >= 3) {
        return { icon: parts[0], name: parts[1], description: parts[2], unlocked, id: "priv_" + idx };
      } else if (parts.length === 2) {
        return { icon: "star", name: parts[0], description: parts[1], unlocked, id: "priv_" + idx };
      } else {
        return { icon: "gift", name: line, description: "", unlocked, id: "priv_" + idx };
      }
    });
  }

  // XP规则（按分类分组）
  // xpRulesByCategory: key = 分类名称，value = 规则列表
  const xpRulesByCategory = {};
  const xpRuleMap = {};  // key = 规则名称，value = 规则详情
  for (const r of xpRuleList) {
    const name = r["规则名称"] || "";
    const category = r["XP分类"] || "";
    if (!name) continue;
    const rule = {
      name,
      category,
      xp: Number(r["XP分值"]) || 0,
      method: r["计分方式"] || "按次",
      description: r["说明"] || "",
    };
    xpRuleMap[name] = rule;
    if (!xpRulesByCategory[category]) xpRulesByCategory[category] = [];
    xpRulesByCategory[category].push(rule);
  }
  // 兼容旧格式 xpSources
  const xpSources = Object.entries(xpRulesByCategory).map(([type, tasks]) => ({
    type, color: "lavender", icon: "star", tasks,
  }));

  // 作业记录（过滤掉完全空壳的记录：无标题、无学科、无说明）
  const allHomeworkRecords = homeworkList
    .filter(r => (r["标题"] || "").trim() || (r["学科"] || r["科目"]) || (r["说明"] || "").trim())
    .sort((a, b) => (b["截止日期"] || "").localeCompare(a["截止日期"] || ""));

  // 成绩记录（等级制，无分数）
  // 从 "科目-模块" 格式中提取纯模块名（去掉科目前缀）
  // 兼容旧格式（纯文本 "数学-公式定理"）和新格式（关联记录 [{text:"公式定理", link_record_id:"rec_xxx"}]）
  function extractModuleNames(value) {
    if (!value) return [];
    let arr;
    if (Array.isArray(value)) {
      arr = value;
    } else {
      arr = String(value).split(/[,，;；\n]+/).map(s => s.trim()).filter(Boolean);
    }
    return arr.map(v => {
      // 关联记录格式：{text: "公式定理", link_record_id: "rec_xxx"}
      if (typeof v === 'object' && v !== null && v.text) {
        return v.text;
      }
      // 旧文本格式："数学-公式定理" 或 "公式定理"
      const s = String(v);
      const idx = s.indexOf("-");
      return idx > 0 ? s.slice(idx + 1) : s;
    }).filter(Boolean);
  }

  function parseScoreRecord(r) {
    const subject = resolveLinkName(r["科目"], subjectIdToName) || "未知";
    const grade = r["等级"] || "";
    const dateVal = r["考试日期"] || "";
    const gradeSemester = r["年级"] || "";
    const examType = r["考试类型"] || "考试";

    // 从年级字段或日期推算学年学期（使用公共函数）
    const parsed = parseSemesterLabel(gradeSemester, dateVal);
    let { year, semester, semesterLabel } = parsed;

    // 错误模块：多选字段，值为数组，格式如 "语文-拼音"
    const errorModules = extractModuleNames(r["错误模块"]);

    return {
      id: r.record_id,
      subject,
      grade,
      examType,
      date: dateVal ? String(dateVal).slice(0, 10) : "",
      year,
      semester,
      semesterLabel: semesterLabel || gradeSemester,
      errorModule: errorModules.join("、"),  // 兼容旧格式：字符串
      errorModules,                          // 新格式：数组
      description: r["说明"] || "",
    };
  }

  const allScoreRecords = scoreList.map(parseScoreRecord).sort((a, b) => b.date.localeCompare(a.date));
  const examRecords = allScoreRecords.filter(r => r.examType === "期末");

  // 期末评价（无科目关联，按学期组织）
  const evaluationRecords = evaluationList
    .sort((a, b) => (b["评价日期"] || "").localeCompare(a["评价日期"] || ""))
    .map(r => {
      const dateVal = r["评价日期"] || "";
      const semesterText = r["学期"] || "";
      const parsed = parseSemesterLabel(semesterText, dateVal);
      let { year, semester, semesterLabel } = parsed;

      return {
        id: r.record_id,
        year,
        semester,
        semesterLabel,
        teacherComment: r["教师评语"] || "",
        parentComment: r["家长评语"] || "",
        date: dateVal ? String(dateVal).slice(0, 10) : "",
        title: semesterLabel || "学期评价",
      };
    });

  // 作业处理函数
  function cleanTitle(title, subject) {
    if (!title) return "";
    let t = String(title).replace(/^\d{2}-\d{2}[^：]*[：:]\s*/, "")
                 .replace(/^\d+[\.、．]\s*/, "")
                 .replace(/^第[一二三四五六七八九十]+[、．]\s*/, "")
                 .trim();
    if (subject) {
      t = t.replace(new RegExp("^" + subject + "[：:]\\s*"), "")
           .replace(new RegExp("^「" + subject + "」\\s*[：:]\\s*"), "")
           .trim();
    }
    return t;
  }

  function parseDetails(text) {
    if (!text) return [];
    const details = [];
    const m1 = text.match(/第[一二三四五六七八九十][、.,，\s]+[^第]+/g);
    if (m1 && m1.length >= 2) {
      const nums = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
      m1.forEach((part, i) => {
        const clean = part.replace(/^第[一二三四五六七八九十][、.,，\s]+/, "").trim();
        if (clean) details.push({ num: "第" + nums[i] + "项", text: clean });
      });
      return details;
    }
    const regex2 = /(?:^|\n)\s*(\d+)[\.、．)\s]+([^\n]+)/g;
    let match;
    while ((match = regex2.exec(text)) !== null) {
      details.push({ num: match[1], text: match[2].trim() });
    }
    return details;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  }

  function inferModule(subject, title, description) {
    if (!subject || !MODULE_KEYWORDS[subject]) return "";
    const text = ((title || "") + " " + (description || "")).toLowerCase();
    const keywords = MODULE_KEYWORDS[subject];
    for (const [moduleName, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (text.includes(word)) return moduleName;
      }
    }
    const defaults = { "语文": "阅读", "数学": "计算", "英语": "单词" };
    return defaults[subject] || "";
  }

  function buildHomeworkItem(r) {
    // 学科：作业表字段名为"学科"，存的是对配置-科目表的关联记录 [{id:"rec_xxx"}]
    // 兼容旧字段名"科目"和纯文本
    const subject = resolveLinkName(r["学科"], subjectIdToName) ||
                    resolveLinkName(r["科目"], subjectIdToName) || "其他";
    const title = r["标题"] || "";
    const clean = cleanTitle(title, subject);
    const details = parseDetails(r["说明"] || title);
    const dueDate = r["截止日期"] ? String(r["截止日期"]).slice(0, 10) : "";
    const days = daysUntil(dueDate);
    const status = r["作业状态"] === "已完成" ? "done" : "pending";
    const tags = [];
    if (status === "done") tags.push({ text: "已完成", type: "good" });
    if (days !== null && days >= 0 && days <= 3 && status !== "done") {
      tags.push({ text: "即将截止", type: "hot" });
    }

    // 能力模块：多选关联记录字段，值为数组 [{id:"rec_xxx"}]，反查为模块名称数组
    const modules = resolveLinkNamesArr(r["能力模块"], moduleIdToName);
    const primaryModule = modules.length > 0 ? modules[0] : inferModule(subject, title, r["说明"]);
    // 作业类型：已合并为纯文本字段（原关联字段兼容：取 text 或纯文本）
    let homeworkType = "日常预习";
    {
      const htRaw = r["作业类型"];
      const htArr = Array.isArray(htRaw) ? htRaw : (htRaw ? [htRaw] : []);
      const htFirst = htArr[0];
      if (htFirst && typeof htFirst === "object") homeworkType = htFirst.text || "日常预习";
      else if (htFirst) homeworkType = String(htFirst).trim() || "日常预习";
    }

    return {
      id: r.record_id,
      subject,
      title,
      cleanTitle: clean,
      shortTitle: clean.length > 40 ? clean.slice(0, 40) + "..." : clean,
      homeworkType,                   // 反查后的作业类型名称
      module: primaryModule,        // 兼容旧格式：主模块字符串
      modules,                       // 新格式：模块数组
      dueDate,
      deadline: dueDate,
      status,
      submitted: r["提交状态"] === "已提交",
      reviewStatus: r["作业状态"] === "已完成" ? "已通过" : "",
      returnReason: "",
      description: r["说明"] || "",
      details,
      tags,
      progress: status === "done" ? 100 : 0,
    };
  }

  function groupHomework(items) {
    const groups = {};
    for (const item of items) {
      const dateKey = item.dueDate || "未安排";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    }
    const result = [];
    for (const [date, list] of Object.entries(groups)) {
      const subOrder = { "语文": 1, "数学": 2, "英语": 3 };
      list.sort((a, b) => (subOrder[a.subject] || 9) - (subOrder[b.subject] || 9));
      result.push({ date, items: list });
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  const allItems = allHomeworkRecords.map(buildHomeworkItem);
  const allHomework = groupHomework(allItems);
  const latestGroup = allHomework.length > 0 ? allHomework[0] : null;
  const todayTotal = latestGroup ? latestGroup.items.length : 0;
  const todayDone = latestGroup ? latestGroup.items.filter(i => i.status === "done").length : 0;
  const totalDone = allHomeworkRecords.filter(r => r["作业状态"] === "已完成").length;

  // 成绩按科目分组（等级制）
  const scoreBySubject = {};
  for (const r of allScoreRecords) {
    const s = r.subject;
    if (!s) continue;
    if (!scoreBySubject[s]) scoreBySubject[s] = [];
    scoreBySubject[s].push(r);
  }

  // 等级排序权重
  const gradeWeight = { "A+": 12, "A": 11, "B+": 10, "B": 9, "C+": 8, "C": 7, "D+": 6, "D": 5 };

  const subjectScores = Object.entries(scoreBySubject).map(([name, list]) => {
    const sorted = list.sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    const previous = sorted[1];
    let trend = "stable";
    if (previous && latest.grade && previous.grade) {
      const lw = gradeWeight[latest.grade] || 0;
      const pw = gradeWeight[previous.grade] || 0;
      if (lw > pw) trend = "up";
      else if (lw < pw) trend = "down";
    }
    return {
      name,
      grade: latest.grade || "",
      examType: latest.examType || "考试",
      date: latest.date || "",
      trend,
      previousGrade: previous ? previous.grade : "",
      errorModules: latest.errorModules || [],
      history: sorted.map(r => ({
        date: r.date,
        grade: r.grade,
        examType: r.examType,
        errorModules: r.errorModules || [],
      })),
    };
  });

  // 学习优势分析（基于等级）
  // 注意：作业表的"学科/科目"和"能力模块"都是关联字段（[{id:"rec_xxx"}]），
  // 必须通过 subjectIdToName / moduleIdToName 反查为名称后再匹配，否则永远匹配不上 → 雷达空白。
  const strengthsAnalysis = {};
  for (const subject of ["语文", "数学", "英语"]) {
    const modules = (abilityModulesBySubject[subject] || []).map(m => m.name);
    const subjectHomework = allHomeworkRecords.filter(r => {
      const s = resolveLinkName(r["学科"], subjectIdToName) ||
                resolveLinkName(r["科目"], subjectIdToName) || "";
      return s === subject;
    });
    const subjectScore = scoreBySubject[subject] || [];
    const latestScore = subjectScore.sort((a, b) => b.date.localeCompare(a.date))[0];

    const moduleStats = modules.map(m => {
      const moduleHw = subjectHomework.filter(r => {
        // 能力模块关联字段 → 名称数组，与作业表用户已建立的关联一致
        const hwModules = resolveLinkNamesArr(r["能力模块"], moduleIdToName);
        if (hwModules.length > 0) return hwModules.includes(m);
        return inferModule(subject, r["标题"], r["说明"]) === m;
      });
      const total = moduleHw.length;
      const done = moduleHw.filter(r => r["作业状态"] === "已完成").length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

      let errorCount = 0;
      for (const r of subjectScore) {
        if ((r.errorModules || []).includes(m)) errorCount++;
      }

      return { module: m, practiceCount: total, doneCount: done, completionRate, errorCount };
    });

    const weakModules = moduleStats
      .filter(m => m.errorCount > 0 || (m.practiceCount > 0 && m.completionRate < 60))
      .sort((a, b) => (b.errorCount * 10 + (100 - b.completionRate)) - (a.errorCount * 10 + (100 - a.completionRate)));

    const strongModules = moduleStats
      .filter(m => m.practiceCount > 0 && m.completionRate >= 80 && m.errorCount === 0);

    const suggestions = generateSuggestions(subject, moduleStats, weakModules, latestScore);

    strengthsAnalysis[subject] = {
      subject,
      moduleStats,
      weakModules: weakModules.slice(0, 2),
      strongModules: strongModules.slice(0, 2),
      latestScore: latestScore ? { grade: latestScore.grade, examType: latestScore.examType, date: latestScore.date } : null,
      suggestions,
    };
  }

  function generateSuggestions(subject, moduleStats, weakModules, latestScore) {
    const suggestions = [];
    if (weakModules.length > 0) {
      const names = weakModules.map(m => m.module).join("、");
      suggestions.push(`${subject}的${names}模块需要加强，建议针对性练习。`);
    }
    const lowPractice = moduleStats.filter(m => m.practiceCount === 0);
    if (lowPractice.length > 0) {
      suggestions.push(`${lowPractice.map(m => m.module).join("、")}模块练习较少，可以适当安排。`);
    }
    if (latestScore && latestScore.grade) {
      const g = latestScore.grade;
      if (g === "A+" || g === "A") suggestions.push(`${subject}最近成绩优秀，继续保持。`);
      else if (g === "B+" || g === "B") suggestions.push(`${subject}成绩良好，注意查漏补缺。`);
      else suggestions.push(`${subject}最近成绩有提升空间，建议复习错题。`);
    }
    if (suggestions.length === 0) suggestions.push(`${subject}整体表现稳定，继续保持练习。`);
    return suggestions.slice(0, 3);
  }

  // 学期成长分析（等级制）
  function generateSemesterAnalysis(examRecs, evalRecs) {
    const bySem = {};
    examRecs.forEach(r => {
      if (!r.semesterLabel) return; // 必须有学期标识（如"三年级(下)"）
      // 用 year|semester 或 semesterLabel 作为分组键，均可正常分组
      const k = (r.year && r.semester) ? (r.year + "|" + r.semester) : r.semesterLabel;
      if (!bySem[k]) bySem[k] = {
        year: r.year, semester: r.semester, semesterLabel: r.semesterLabel,
        date: r.date, records: [], gradeMap: {},
      };
      bySem[k].records.push(r);
      bySem[k].gradeMap[r.subject] = r.grade;
      if (r.date > bySem[k].date) bySem[k].date = r.date;
    });

    // 从 semesterLabel 解析年级序号 + 学期，用于排序
    function semOrder(s) {
      return semesterSortValue(s.semesterLabel, s.semester);
    }

    const semList = Object.values(bySem).sort((a, b) => {
      const oa = semOrder(a), ob = semOrder(b);
      if (oa.gradeNum !== ob.gradeNum) return oa.gradeNum - ob.gradeNum;
      if (oa.term !== ob.term) return oa.term - ob.term;
      return String(a.semesterLabel).localeCompare(String(b.semesterLabel));
    });

    const analysis = semList.map((sem, idx) => {
      const prev = idx > 0 ? semList[idx - 1] : null;
      const counts = {};
      sem.records.forEach(r => { counts[r.grade] = (counts[r.grade] || 0) + 1; });
      const total = sem.records.length;

      const mainSubjects = ["语文", "数学", "英语", "科学"];
      const mainGrades = sem.records.filter(r => mainSubjects.includes(r.subject))
        .map(r => ({ subject: r.subject, grade: r.grade }));

      const avgScore = sem.records.reduce((s, r) => s + (gradeWeight[r.grade] || 0), 0) / total;

      let progress = [], regress = [], highlights = [];

      if (prev) {
        sem.records.forEach(r => {
          const prevGrade = prev.gradeMap[r.subject];
          if (!prevGrade) return;
          const diff = (gradeWeight[r.grade] || 0) - (gradeWeight[prevGrade] || 0);
          if (diff > 0) progress.push({ subject: r.subject, from: prevGrade, to: r.grade });
          else if (diff < 0) regress.push({ subject: r.subject, from: prevGrade, to: r.grade });
        });
      }

      const aPlusSubjects = sem.records.filter(r => r.grade === "A+").map(r => r.subject);
      if (aPlusSubjects.length > 0) {
        highlights.push(`${aPlusSubjects.join("、")} 获得 A+，表现突出`);
      }

      let encouragement = "";
      if (idx === 0) {
        encouragement = `一年级的第一个学期，你已经迈出了小学学习的第一步。${aPlusSubjects.length > 0 ? aPlusSubjects.join("、") + " 拿到了 A+，" : ""}这是很棒的起点！继续保持好奇心，每一步都算数。`;
      } else if (progress.length >= 3) {
        encouragement = `这个学期你进步了${progress.length}科！${progress.slice(0, 3).map(p => p.subject + "从" + p.from + "升到" + p.to).join("、")}。看到你的努力一点点开花结果，真为你高兴。继续加油，你比自己想象的更厉害！`;
      } else if (regress.length >= 2) {
        encouragement = `这个学期有些科目遇到了小挑战，别担心，这是成长路上的正常起伏。${regress.map(r => r.subject).join("、")} 暂时落后了一点，我们一起找找原因，慢慢来，下一次一定可以追上来的！`;
      } else if (aPlusSubjects.length >= 5) {
        encouragement = `太棒了！这个学期有${aPlusSubjects.length}科拿到 A+，你是怎么做到的？保持这份认真和专注，你会越来越棒的！`;
      } else {
        encouragement = `这学期你稳稳地往前走，${mainGrades.map(g => g.subject + g.grade).join("、")}。每一份努力都不会白费，继续加油哦！`;
      }

      const evaluation = evalRecs.find(e =>
        (e.semesterLabel && e.semesterLabel === sem.semesterLabel) ||
        (e.year === sem.year && e.semester === sem.semester)
      );

      return {
        semesterKey: sem.year + "|" + sem.semester,
        semesterLabel: sem.semesterLabel,
        year: sem.year,
        semester: sem.semester,
        date: sem.date,
        subjectCount: total,
        gradeDistribution: counts,
        mainSubjects: mainGrades,
        aPlusSubjects,
        progress,
        regress,
        highlights,
        encouragement,
        evaluation: evaluation || null,
        avgScore: Math.round(avgScore * 10) / 10,
      };
    });

    const latest = analysis[analysis.length - 1];
    let overallSummary = "";
    if (latest) {
      const aPlusCount = latest.aPlusSubjects.length;
      const totalSubj = latest.subjectCount;
      if (latest.progress.length > 0) {
        overallSummary = `相比上学期，${latest.progress.map(p => p.subject).join("、")} 有进步。`;
      }
      if (latest.regress.length > 0) {
        overallSummary += `${latest.regress.map(r => r.subject).join("、")} 需要多关注。`;
      }
      if (!overallSummary) {
        overallSummary = `本学期 ${aPlusCount}/${totalSubj} 科获得 A 及以上，整体表现稳定。`;
      }
    }

    return { semesters: analysis.reverse(), overallSummary };
  }

  const semesterAnalysis = generateSemesterAnalysis(examRecords, evaluationRecords);

  // 财务 - 新表结构（日期、存入/提取金额、说明、账户类型、是否值得、原因说明、消费建议）
  const financeRecords = financeList
    .sort((a, b) => (b["日期"] || "").localeCompare(a["日期"] || ""));

  // 分别计算两个账户的余额
  let wealthBalance = 0, freeBalance = 0;
  for (const r of financeRecords) {
    const amt = Number(r["存入/提取金额"]) || 0;
    const accountType = r["账户类型"] || "财富增值账户";
    if (accountType === "财富增值账户") {
      wealthBalance += amt;
    } else if (accountType === "自由基金账户") {
      freeBalance += amt;
    }
  }

  // 最近作业
  const recentAssignments = [];
  for (const group of allHomework.slice(0, 2)) {
    for (const item of group.items) recentAssignments.push(item);
  }

  // XP记录（关联XP规则表，从规则表匹配任务名获取XP分值、分类等）
  // 规则表索引：按 record_id 和 规则名称 各建一份
  const ruleById = {};
  for (const r of xpRuleList) {
    const rid = r.record_id;
    if (rid) ruleById[rid] = r;
  }
  const allXpRecords = xpList
    .sort((a, b) => (b["获得时间"] || "").localeCompare(a["获得时间"] || ""))
    .map(r => {
      // 解析 XP任务 关联字段（link 字段返回 [{id}] 或对象）
      let taskName = "";
      const xpTask = r["XP任务"];
      if (xpTask && typeof xpTask === "object") {
        const linkId = Array.isArray(xpTask) ? (xpTask[0]?.id || "") : (xpTask.id || "");
        if (linkId && ruleById[linkId]) taskName = ruleById[linkId]["规则名称"] || "";
      } else if (typeof xpTask === "string" && xpTask.trim()) {
        taskName = xpTask;
      }
      // 事项是自动编号（纯数字），仅在 XP任务 也无有效名称时作为兜底，且自动编号不计入显示
      const autoNumber = String(r["事项"] || "").trim();
      if (!taskName && autoNumber && !/^\d+$/.test(autoNumber)) {
        taskName = autoNumber;
      }
      const matchedRule = taskName ? xpRuleMap[taskName] : null;
      const taskCategory = matchedRule ? matchedRule.category : (r["XP分类"] || "");
      const xpValue = matchedRule ? matchedRule.xp : (Number(r["XP分值"]) || 0);
      // 无有效任务名的记录（如纯自动编号）标记为需要过滤
      const hasValidName = !!taskName && !/^\d+$/.test(taskName);
      return {
        id: r.record_id,
        domain: "XP",
        type: "XP获得",
        title: hasValidName ? taskName : "成长积分",
        taskName: hasValidName ? taskName : "",
        taskCategory: taskCategory,
        date: r["获得时间"] ? String(r["获得时间"]).slice(0, 10) : "",
        datetime: r["获得时间"] || "",
        xp: xpValue,
        xpCategory: taskCategory,
        reviewStatus: r["审核状态"] || "待确认",
        returnReason: r["退回原因"] || "",
        description: r["说明"] || "",
        _hasValidName: hasValidName,
      };
    });

  // 计算当前等级
  let currentLevelIndex = 0;
  let nextLevelXP = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (totalXP >= levels[i].xp) {
      currentLevelIndex = i;
      break;
    }
  }
  const currentLevel = levels[currentLevelIndex] || levels[0];
  const nextLevel = levels[currentLevelIndex + 1] || null;
  const xpToNextLevel = nextLevel ? nextLevel.xp - totalXP : 0;
  const levelProgress = nextLevel
    ? Math.min(100, Math.round(((totalXP - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100))
    : 100;

  return {
    child: CHILD_INFO,
    calendar: CALENDAR_DATA,
    currentXP: totalXP,
    pendingCount: allXpRecords.filter(r => r.reviewStatus === "待确认" && r._hasValidName).length,
    currentLevel: {
      name: currentLevel?.name || "",
      levelNum: currentLevel?.levelNum || "Lv.1",
      badgeClass: currentLevel?.badgeClass || "bronze",
      themeColor: currentLevel?.themeColor || "#CD7F32",
      xp: currentLevel?.xp || 0,
    },
    nextLevel: nextLevel ? {
      name: nextLevel.name,
      levelNum: nextLevel.levelNum,
      xp: nextLevel.xp,
      xpToNext: xpToNextLevel,
    } : null,
    levelProgress,
    levels,
    // 权益兑换状态已合并进等级表（levels[].privileges[].redeemed），此处保留空数组以向后兼容
    redeemRecords: [],
    xpSources,
    xpRecords: allXpRecords,
    recentRecords: allXpRecords.filter(r => r._hasValidName).map(r => ({
      id: r.id,
      title: r.title,
      value: "+" + r.xp + " XP",
      xp: r.xp,
      time: r.date,
      status: r.reviewStatus === "待确认" ? "pending" : r.reviewStatus === "已通过" ? "verified" : "returned",
      type: r.xpCategory,
      taskCategory: r.taskCategory,
      taskName: r.taskName,
      description: r.description,
      returnReason: r.returnReason,
    })),
    study: {
      subjects: subjectScores,
      homework: { total: allHomeworkRecords.length, done: totalDone, todayTotal, todayDone },
      recentAssignments: recentAssignments.slice(0, 5),
      allHomework,
      examRecords,
      evaluations: evaluationRecords,
      strengthsAnalysis,
      semesterAnalysis,
    },
    finance: {
      totalAssets: wealthBalance + freeBalance,
      accounts: [
        { key: "wealth", name: "财富增值账户", balance: wealthBalance, goal: null, goalTarget: null },
        { key: "free", name: "自由基金账户", balance: freeBalance, goal: null, goalTarget: null },
      ],
      recentTransactions: financeRecords.map(r => {
        const rawAmount = Number(r["存入/提取金额"]) || 0;
        const tx = {
          id: r.record_id,
          date: r["日期"] ? String(r["日期"]).slice(0, 10) : "",
          // 向后兼容：正数为收入，负数为支出
          type: rawAmount >= 0 ? "income" : "expense",
          amount: Math.abs(rawAmount),
          rawAmount: rawAmount,
          category: r["说明"] || "",
          account: r["账户类型"] === "自由基金账户" ? "free" : "wealth",
          accountType: r["账户类型"] || "财富增值账户",
          description: r["说明"] || "",
        };
        // 自由基金账户的流水包含是否值得、原因说明、消费建议字段
        if (r["账户类型"] === "自由基金账户") {
          tx.worthIt = r["是否值得"] || "";
          tx.reason = r["原因说明"] || "";
          tx.suggestion = r["消费建议"] || "";
        }
        return tx;
      }),
    },
    config: {
      subjects: subjectList.map(s => ({
        name: s["科目名称"] || "",
        category: s["科目类别"] || "",
        description: s["说明"] || "",
        color: s["颜色"] || "",
        icon: s["图标"] || "",
      })),
      xpRules: xpRulesByCategory,
      xpRuleList: xpRuleList.map(r => ({
        name: r["规则名称"] || "",
        category: r["XP分类"] || "",
        xp: Number(r["XP分值"]) || 0,
        method: r["计分方式"] || "",
        description: r["说明"] || "",
      })),
      abilityModules: abilityModulesBySubject,
    },
  };
}

// ══════════════════════════════════════════
// HTTP 服务
// ══════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.end(); return; }

  const parsed = url.parse(req.url, true);
  let pathname = parsed.pathname;
  // 解码 URL 编码的中文文件名（如 %E7%A4%BA%E6%84%8F-...）
  try { pathname = decodeURIComponent(pathname); } catch (e) { /* 保留原值 */ }

  // 静态文件：单页应用（所有板块都在 index.html 内）
  if (pathname === "/" || pathname === "/index.html" || pathname === "/spa.html") {
    serveStatic(res, "index.html", "text/html; charset=utf-8");
    return;
  }
  // 其他 .html 文件（如示意文件）
  if (pathname.endsWith(".html") && pathname !== "/index.html" && pathname !== "/spa.html") {
    const file = pathname.slice(1);
    serveStatic(res, file, "text/html; charset=utf-8");
    return;
  }
  // 数据文件（JSON 等静态数据）
  if (pathname.startsWith("/data/")) {
    const file = pathname.slice(1);
    const ext = path.extname(file);
    const mime = ext === ".json" ? "application/json; charset=utf-8" :
      "application/octet-stream";
    serveStatic(res, file, mime);
    return;
  }

  if (pathname.startsWith("/assets/")) {
    const file = pathname.slice(1);
    const ext = path.extname(file);
    const mime = ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      ext === ".js" ? "application/javascript; charset=utf-8" :
      "application/octet-stream";
    serveStatic(res, file, mime);
    return;
  }

  // API
  try {
    // 读取全部数据（命中缓存则秒级返回；写操作后缓存失效，自动重读飞书）
    if (pathname === "/api/data" && req.method === "GET") {
      const dashboard = await getDashboard();
      json(res, { ok: true, data: dashboard });
      return;
    }

    // 作业 CRUD
    if (pathname === "/api/homework" && req.method === "POST") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.subject) {
        const linkedSubject = await resolveLinkRecordId("config-subject", "科目名称", data.subject);
        if (linkedSubject.length > 0) fields["学科"] = linkedSubject;
      }
      if (data.title) fields["标题"] = data.title;
      if (data.homeworkType) fields["作业类型"] = data.homeworkType;
      // 能力模块：解析为关联记录 ID 格式 [{id:"rec_xxx"}]
      if (data.modules !== undefined) {
        const modNames = Array.isArray(data.modules) ? data.modules : (data.modules ? [data.modules] : []);
        const linkedIds = await resolveModuleNames(data.subject, modNames);
        if (linkedIds.length > 0) {
          fields["能力模块"] = linkedIds;
        }
      } else if (data.module !== undefined) {
        const modNames = data.module ? [data.module] : [];
        const linkedIds = await resolveModuleNames(data.subject, modNames);
        if (linkedIds.length > 0) {
          fields["能力模块"] = linkedIds;
        }
      }
      if (data.dueDate) fields["截止日期"] = data.dueDate.includes(" ") ? data.dueDate : data.dueDate + " 12:00:00";
      fields["作业状态"] = data.status === "done" ? "已完成" : "待完成";
      fields["提交状态"] = data.submitted ? "已提交" : "未提交";
      if (data.xp !== undefined) fields["获得XP"] = data.xp;
      if (data.description) fields["说明"] = data.description;

      const recordId = await createRecord(TABLES["record-homework"], fields);
      // 作业完成后自动发放 XP（按作业类型）
      if (data.status === "done") {
        await autoGrantHomeworkXp(recordId);
      }
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    if (pathname.startsWith("/api/homework/") && req.method === "PUT") {
      const recordId = pathname.slice("/api/homework/".length);
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.subject !== undefined) {
        const linkedSubject = await resolveLinkRecordId("config-subject", "科目名称", data.subject);
        if (linkedSubject.length > 0) fields["学科"] = linkedSubject;
      }
      if (data.title !== undefined) fields["标题"] = data.title;
        if (data.homeworkType !== undefined) fields["作业类型"] = data.homeworkType;
        // 能力模块：解析为关联记录 ID 格式 [{id:"rec_xxx"}]
        if (data.modules !== undefined) {
        const modNames = Array.isArray(data.modules) ? data.modules : (data.modules ? [data.modules] : []);
        const linkedIds = await resolveModuleNames(data.subject, modNames);
        fields["能力模块"] = linkedIds.length > 0 ? linkedIds : [];
      } else if (data.module !== undefined) {
        const modNames = data.module ? [data.module] : [];
        const linkedIds = await resolveModuleNames(data.subject, modNames);
        fields["能力模块"] = linkedIds.length > 0 ? linkedIds : [];
      }
      if (data.dueDate !== undefined) fields["截止日期"] = data.dueDate.includes(" ") ? data.dueDate : data.dueDate + " 12:00:00";
      if (data.status !== undefined) fields["作业状态"] = data.status === "done" ? "已完成" : "待完成";
      if (data.submitted !== undefined) fields["提交状态"] = data.submitted ? "已提交" : "未提交";
      if (data.xp !== undefined) fields["获得XP"] = data.xp;
      if (data.description !== undefined) fields["说明"] = data.description;

      await updateRecord(TABLES["record-homework"], recordId, fields);
      // 作业完成后自动发放 XP（按作业类型）
      if (data.status === "done") {
        await autoGrantHomeworkXp(recordId);
      }
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // XP CRUD
    // 新增XP获得记录
    // 参数: taskName (XP任务名称), description (备注说明), date (可选), newTask (可选，新增任务对象)
    if (pathname === "/api/xp" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const data = JSON.parse(body);

        // 支持新增XP任务
        let taskName = data.taskName || "";
        let taskXp = data.xp;
        let taskCategory = data.xpCategory || "";

        // 如果传了 newTask，解析其内容
        if (data.newTask && data.newTask.name) {
          const newRule = data.newTask;
          taskName = newRule.name;
          taskXp = Number(newRule.xp) || taskXp;
          taskCategory = newRule.category || taskCategory;
        }

        if (!taskName) {
          res.statusCode = 400;
          json(res, { ok: false, error: "taskName 不能为空" });
          return;
        }
        if (!data.description) {
          res.statusCode = 400;
          json(res, { ok: false, error: "description 备注说明不能为空" });
          return;
        }

        // XP任务 是关联字段，需指向配置-XP规则表中的记录；XP分值 是其只读 lookup 字段，会自动计算，不能直接写入
        const ruleRows = await fetchTable(TABLES["config-xp-rule"]);
        let rule = ruleRows.find(r => r["规则名称"] === taskName);
        let ruleRecordId = rule ? rule.record_id : null;
        if (!ruleRecordId) {
          const ruleFields = {};
          ruleFields["规则名称"] = taskName;
          ruleFields["XP分类"] = sanitizeRuleCategory(taskCategory);
          ruleFields["XP分值"] = Number(taskXp) || 0;
          ruleFields["计分方式"] = "按次";
          ruleFields["说明"] = data.description || "";
          ruleRecordId = await createRecord(TABLES["config-xp-rule"], ruleFields);
        }

        const fields = {};
        // 关联 XP任务（指向规则表记录），XP分值由 lookup 从规则自动计算
        if (ruleRecordId) fields["XP任务"] = [{ id: ruleRecordId }];
        // 说明：任务备注
        fields["说明"] = data.description;
        // XP分类：写入分类字段（单选），供按分类统计
        if (taskCategory) fields["XP分类"] = taskCategory;
        if (data.date) {
          fields["获得时间"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
        } else {
          fields["获得时间"] = new Date().toISOString().slice(0, 19).replace("T", " ");
        }
        fields["审核状态"] = data.reviewStatus || "待确认";
        if (data.returnReason) fields["退回原因"] = data.returnReason;
        // 可选关联：作业完成发放 XP 时，关联到对应的作业记录（"记录-作业"字段）
        if (data.homeworkId) fields["记录-作业"] = [{ id: data.homeworkId }];

        const recordId = await createRecord(TABLES["record-xp"], fields);
        invalidateDashboardCache();
        json(res, { ok: true, recordId });
      } catch (err) {
        console.error("XP提交失败:", err.message);
        const msg = err.message || "";
        let userMsg = "提交失败: " + msg;
        if (msg.includes("token_expired") || msg.includes("token expire")) {
          userMsg = "提交失败：飞书授权已过期，请在设置中重新授权后重试";
        } else if (msg.includes("超时")) {
          userMsg = "提交失败：请求超时，请稍后重试";
        }
        res.statusCode = 500;
        json(res, { ok: false, error: userMsg });
      }
      return;
    }

    if (pathname.startsWith("/api/xp/") && req.method === "PUT") {
      const recordId = pathname.slice("/api/xp/".length);
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.taskName !== undefined) {
        // XP任务 是关联字段，需解析为规则表记录并关联
        const ruleRows = await fetchTable(TABLES["config-xp-rule"]);
        const rule = ruleRows.find(r => r["规则名称"] === data.taskName);
        if (rule) fields["XP任务"] = [{ id: rule.record_id }];
      } else if (data.title !== undefined) {
        const ruleRows = await fetchTable(TABLES["config-xp-rule"]);
        const rule = ruleRows.find(r => r["规则名称"] === data.title);
        if (rule) fields["XP任务"] = [{ id: rule.record_id }];
      }
      if (data.xpCategory !== undefined) fields["XP分类"] = data.xpCategory;
      if (data.xp !== undefined) fields["XP分值"] = data.xp;
      if (data.date !== undefined) fields["获得时间"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      if (data.reviewStatus !== undefined) fields["审核状态"] = data.reviewStatus;
      if (data.returnReason !== undefined) fields["退回原因"] = data.returnReason;
      if (data.description !== undefined) fields["说明"] = data.description;

      // 防误触：只有处于「待确认」状态的记录才允许被审批（通过/退回），杜绝误改已处理记录
      if (data.reviewStatus !== undefined) {
        const all = await fetchTable(TABLES["record-xp"]);
        const target = all.find(r => r.record_id === recordId);
        const currentStatus = target ? (target["审核状态"] || "待确认") : "待确认";
        if (currentStatus !== "待确认") {
          res.statusCode = 409;
          json(res, { ok: false, error: "该记录已处理，不能重复审批" });
          return;
        }
      }

      await updateRecord(TABLES["record-xp"], recordId, fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 新增XP规则
    if (pathname === "/api/xp-rule" && req.method === "POST") {
      const body = await readBody(req);
      const data = JSON.parse(body);

      if (!data.name) {
        res.statusCode = 400;
        json(res, { ok: false, error: "name 规则名称不能为空" });
        return;
      }
      if (!data.category) {
        res.statusCode = 400;
        json(res, { ok: false, error: "category XP分类不能为空" });
        return;
      }
      if (data.xp === undefined || data.xp === null) {
        res.statusCode = 400;
        json(res, { ok: false, error: "xp XP分值不能为空" });
        return;
      }

      const fields = {};
      fields["规则名称"] = data.name;
      fields["XP分类"] = data.category;
      fields["XP分值"] = Number(data.xp) || 0;
      fields["计分方式"] = data.method || "按次";
      fields["说明"] = data.description || "";

      const recordId = await createRecord(TABLES["config-xp-rule"], fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 财务 CRUD - 新表结构（日期、存入/提取金额、说明、账户类型、是否值得、原因说明、消费建议）
    if (pathname === "/api/finance" && req.method === "POST") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      // 新字段：存入/提取金额（正数存入，负数提取）
      if (data.rawAmount !== undefined) {
        fields["存入/提取金额"] = Number(data.rawAmount) || 0;
      } else if (data.amount !== undefined) {
        // 兼容旧格式：type + amount -> 转换为带正负号的存入/提取金额
        if (data.type !== undefined) {
          const amt = Number(data.amount) || 0;
          fields["存入/提取金额"] = data.type === "income" ? Math.abs(amt) : -Math.abs(amt);
        } else {
          fields["存入/提取金额"] = Number(data.amount) || 0;
        }
      }
      // 账户类型：财富增值账户 / 自由基金账户
      if (data.accountType) {
        fields["账户类型"] = data.accountType;
      } else if (data.account) {
        // 兼容旧格式：account = "wealth" / "free"
        fields["账户类型"] = data.account === "free" ? "自由基金账户" : "财富增值账户";
      }
      if (data.date) fields["日期"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      if (data.description || data.category) fields["说明"] = data.description || data.category || "";
      // 新字段：是否值得、原因说明、消费建议（主要用于自由基金账户）
      if (data.worthIt !== undefined) fields["是否值得"] = data.worthIt || "";
      if (data.reason !== undefined) fields["原因说明"] = data.reason || "";
      if (data.suggestion !== undefined) fields["消费建议"] = data.suggestion || "";

      const recordId = await createRecord(TABLES["record-finance"], fields);
      // 财务分析记录自动发放"财务能力分析"XP（带"是否值得"的分析记录；记一笔复盘流程单独发+10复盘，跳过）
      if (data.skipAutoXp !== true && (fields["是否值得"] || "")) {
        await autoGrantFinanceXp(recordId);
      }
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    if (pathname.startsWith("/api/finance/") && req.method === "PUT") {
      const recordId = pathname.slice("/api/finance/".length);
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      // 存入/提取金额
      if (data.rawAmount !== undefined) {
        fields["存入/提取金额"] = Number(data.rawAmount) || 0;
      } else if (data.amount !== undefined) {
        if (data.type !== undefined) {
          const amt = Number(data.amount) || 0;
          fields["存入/提取金额"] = data.type === "income" ? Math.abs(amt) : -Math.abs(amt);
        } else {
          fields["存入/提取金额"] = Number(data.amount) || 0;
        }
      }
      // 账户类型
      if (data.accountType !== undefined) {
        fields["账户类型"] = data.accountType;
      } else if (data.account !== undefined) {
        fields["账户类型"] = data.account === "free" ? "自由基金账户" : "财富增值账户";
      }
      if (data.date !== undefined) fields["日期"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      if (data.description !== undefined || data.category !== undefined) {
        fields["说明"] = data.description !== undefined ? data.description : (data.category || "");
      }
      // 新字段：是否值得、原因说明、消费建议
      if (data.worthIt !== undefined) fields["是否值得"] = data.worthIt || "";
      if (data.reason !== undefined) fields["原因说明"] = data.reason || "";
      if (data.suggestion !== undefined) fields["消费建议"] = data.suggestion || "";

      await updateRecord(TABLES["record-finance"], recordId, fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 成绩 CRUD（等级制）
    if (pathname === "/api/score" && req.method === "POST") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.subject) fields["科目"] = data.subject;
      if (data.grade) fields["等级"] = data.grade;
      if (data.examType) fields["考试类型"] = data.examType;
      if (data.gradeLevel) fields["年级"] = data.gradeLevel;
      if (data.date) fields["考试日期"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      // 错误模块：支持数组（多选）或字符串（自动转数组）
      if (data.errorModules !== undefined) {
        fields["错误模块"] = Array.isArray(data.errorModules) ? data.errorModules : (data.errorModules ? [data.errorModules] : []);
      } else if (data.errorModule !== undefined) {
        fields["错误模块"] = data.errorModule ? [data.errorModule] : [];
      }
      if (data.description) fields["说明"] = data.description;

      const recordId = await createRecord(TABLES["record-score"], fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 权益兑换（已合并进配置-等级表）
    // 参数: privilegeName (权益名称), level (等级名称), date (可选)
    if (pathname === "/api/redeem" && req.method === "POST") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const name = data.privilegeName || data.name || "";
      if (!name) {
        res.statusCode = 400;
        json(res, { ok: false, error: "privilegeName 权益名称不能为空" });
        return;
      }
      const redeemDate = data.date
        ? (data.date.includes(" ") ? data.date : data.date + " 12:00:00")
        : new Date().toISOString().slice(0, 19).replace("T", " ");
      // 在配置-等级表中定位该权益所在行（匹配"权益说明"或"权益明细"），并标记兑换状态
      const levelRows = await fetchTable(TABLES["config-level"]);
      const target = levelRows.find(r =>
        (r["权益说明"] || "").trim() === name.trim() ||
        String(r["权益明细"] || "").includes(name.trim())
      );
      if (target) {
        await updateRecord(TABLES["config-level"], target.record_id, {
          "是否兑换": "已兑换",
          "兑换时间": redeemDate,
        });
        invalidateDashboardCache();
        json(res, { ok: true, recordId: target.record_id });
      } else {
        // 未找到对应权益行：无法标记，返回错误
        res.statusCode = 404;
        json(res, { ok: false, error: "未在等级表中找到权益：" + name });
      }
      return;
    }

    // 期末评语 CRUD
    if (pathname === "/api/evaluation" && req.method === "POST") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.semester) fields["学期"] = data.semester;
      if (data.teacherComment) fields["教师评语"] = data.teacherComment;
      if (data.parentComment) fields["家长评语"] = data.parentComment;
      if (data.date) fields["评价日期"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      const recordId = await createRecord(TABLES["record-evaluation"], fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 孩子基本信息更新
    if (pathname === "/api/child" && req.method === "PUT") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      // 更新内存中的孩子信息
      if (data.name !== undefined) CHILD_INFO.name = data.name;
      if (data.birthday !== undefined) CHILD_INFO.birthday = data.birthday;
      if (data.gender !== undefined) CHILD_INFO.gender = data.gender;
      if (data.grade !== undefined) CHILD_INFO.grade = data.grade;
      if (data.school !== undefined) CHILD_INFO.school = data.school;
      if (data.className !== undefined) CHILD_INFO.className = data.className;
      if (data.studentId !== undefined) CHILD_INFO.studentId = data.studentId;
      if (data.motto !== undefined) CHILD_INFO.motto = data.motto;
      // 写入飞书配置-个人信息表（持久化，老师可读）
      try {
        const fields = {
          "姓名": CHILD_INFO.name,
          "出生日期": CHILD_INFO.birthday,
          "性别": CHILD_INFO.gender,
          "年级": CHILD_INFO.grade,
          "学校": CHILD_INFO.school,
          "班级": CHILD_INFO.className,
          "学号": CHILD_INFO.studentId,
          "格言": CHILD_INFO.motto,
        };
        if (personalRecordId) {
          await updateRecord(TABLES["config-personal"], personalRecordId, fields);
        } else {
          personalRecordId = await createRecord(TABLES["config-personal"], fields);
        }
      } catch (e) {
        console.error("保存个人信息到飞书失败:", e.message);
      }
      invalidateDashboardCache();
      json(res, { ok: true });
      return;
    }

    // 校历配置更新（写入飞书配置-校历表）
    if (pathname === "/api/calendar" && req.method === "PUT") {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const calendarData = Array.isArray(data) ? data : (data.calendar || []);
      if (calendarData.length > 0) {
        CALENDAR_DATA = calendarData;
        await saveCalendarConfig(calendarData);
      }
      invalidateDashboardCache();
      json(res, { ok: true, calendar: CALENDAR_DATA });
      return;
    }

    // 成绩更新
    if (pathname.startsWith("/api/score/") && req.method === "PUT") {
      const recordId = pathname.slice("/api/score/".length);
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.subject !== undefined) fields["科目"] = data.subject;
      if (data.grade !== undefined) fields["等级"] = data.grade;
      if (data.examType !== undefined) fields["考试类型"] = data.examType;
      if (data.gradeLevel !== undefined) fields["年级"] = data.gradeLevel;
      if (data.date !== undefined) fields["考试日期"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      if (data.errorModules !== undefined) {
        fields["错误模块"] = Array.isArray(data.errorModules) ? data.errorModules : (data.errorModules ? [data.errorModules] : []);
      } else if (data.errorModule !== undefined) {
        fields["错误模块"] = data.errorModule ? [data.errorModule] : [];
      }
      if (data.description !== undefined) fields["说明"] = data.description;
      await updateRecord(TABLES["record-score"], recordId, fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // XP规则更新
    if (pathname.startsWith("/api/xp-rule/") && req.method === "PUT") {
      const recordId = pathname.slice("/api/xp-rule/".length);
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.name !== undefined) fields["规则名称"] = data.name;
      if (data.category !== undefined) fields["XP分类"] = sanitizeRuleCategory(data.category);
      if (data.xp !== undefined) fields["XP分值"] = Number(data.xp) || 0;
      if (data.method !== undefined) fields["计分方式"] = data.method;
      if (data.description !== undefined) fields["说明"] = data.description;
      await updateRecord(TABLES["config-xp-rule"], recordId, fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 期末评价更新
    if (pathname.startsWith("/api/evaluation/") && req.method === "PUT") {
      const recordId = pathname.slice("/api/evaluation/".length);
      const body = await readBody(req);
      const data = JSON.parse(body);
      const fields = {};
      if (data.semester !== undefined) fields["学期"] = data.semester;
      if (data.teacherComment !== undefined) fields["教师评语"] = data.teacherComment;
      if (data.parentComment !== undefined) fields["家长评语"] = data.parentComment;
      if (data.date !== undefined) fields["评价日期"] = data.date.includes(" ") ? data.date : data.date + " 12:00:00";
      await updateRecord(TABLES["record-evaluation"], recordId, fields);
      invalidateDashboardCache();
      json(res, { ok: true, recordId });
      return;
    }

    // 健康检查
    if (pathname === "/api/health" && req.method === "GET") {
      json(res, { ok: true, service: "growth-workstation-api", tables: Object.keys(TABLES).length, time: new Date().toISOString() });
      return;
    }

    res.statusCode = 404;
    json(res, { ok: false, error: "Not found: " + pathname });
  } catch (err) {
    console.error("API error:", err);
    res.statusCode = 500;
    json(res, { ok: false, error: err.message || String(err) });
  }
});

function serveStatic(res, file, mime) {
  // 从仓库根目录（scripts/vendor 上两级）解析静态文件
  const filePath = path.join(__dirname, "..", "..", file);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found: " + file);
      return;
    }
    res.setHeader("Content-Type", mime);
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function json(res, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

// 启动服务器（仅当直接运行 node server.js 时；被 require 时用于复用 getDashboard 生成快照）
if (require.main === module) {
  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`Growth workstation API running at http://0.0.0.0:${PORT}`);
    console.log(`Tables: ${Object.keys(TABLES).length} tables configured`);
    // 启动时从飞书加载个人信息与校历配置
    await Promise.all([loadPersonalInfo(), loadCalendarConfig()]);
    console.log(`已加载孩子信息: ${CHILD_INFO.name} (${CHILD_INFO.grade}), 校历年数: ${CALENDAR_DATA.length}`);
  });
}

// 供外部（如 GitHub Actions 同步脚本）复用的数据构建函数
module.exports = { getDashboard, TABLES, feishu };
