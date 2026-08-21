#!/usr/bin/env node
/**
 * generate-weekly-report.js — 每周成长周报自动生成器（GrowthAlgorithm × DeepSeek）
 *
 * 【双重结合】
 *  1. GrowthAlgorithm 视角：脚本内置成长算法作为"分析前置层"——先用规则对每周
 *     真实数据进行四维评估（认知/情绪/意志力/关系）与亮点归类，产出结构化洞察，
 *     再把"成长算法原则"作为系统约束注入到生成提示中。
 *  2. AI 分析数据：把整理后的每周真实数据（XP/日记/作业/财富/家庭约定/上周周报）
 *     交给 DeepSeek，由模型以"第二人称陪伴式"口吻把它写成孩子看得懂、想看的内容。
 *
 * 环境要求：
 *  - 需环境变量 DEEPSEEK_API_KEY（仓库外读取，不入库）。
 *  - 也可传 --key-file PATH 指定密钥文件。
 *
 * 用法：
 *   node scripts/generate-weekly-report.js --dry-run          # 只分析数据，不调用模型（无需key）
 *   node scripts/generate-weekly-report.js --week 2026-08-21  # 指定周内某天
 *   node scripts/generate-weekly-report.js                     # 本周默认，调用 DeepSeek 生成
 *
 * 输出：把新周报追加写入 data/aiWeeklyReports.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const MODEL = 'deepseek-chat';
const API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRY = 1;

/* ══════════════════ 1. 小工具 ══════════════════ */
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf-8'));
  } catch (e) {
    return null;
  }
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 从环境或文件读取 key（绝不硬编码入库）
function getApiKey(cliKeyFile) {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const candidates = [cliKeyFile, path.join(os.homedir(), '.deepseek-key')]
    .filter(Boolean);
  for (const f of candidates) {
    try {
      const k = fs.readFileSync(f, 'utf-8').trim();
      if (k) return k;
    } catch (e) { /* 忽略 */ }
  }
  return '';
}

/* ══════════════════ 2. 数据窗口 ══════════════════ */
// 本周：以指定(或今天)为结束日，窗口为 [end-6, end]；上周为再往前7天
function weekWindow(endDateISO) {
  const end = new Date(endDateISO + 'T00:00:00');
  const start = new Date(end); start.setDate(start.getDate() - 6);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6);
  const fmt = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  // 计算 ISO 周号
  const wk = d => {
    const t = new Date(d.getTime());
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const week1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  };
  return {
    start: fmt(start), end: fmt(end),
    prevStart: fmt(prevStart), prevEnd: fmt(prevEnd),
    weekNumber: wk(end), year: end.getFullYear()
  };
}

/* ══════════════════ 3. GrowthAlgorithm 分析前置层 ══════════════════ */
// 返回结构化"成长洞察"，供AI生成时作为权威依据，避免 AI 天马行空或空泛表扬
function growthAnalysis(ctx) {
  const { xpRecords, diaries, homework, week } = ctx;
  const inWin = (d, from, to) => d >= from && d <= to;

  // 3.1 能量/Xp 归类（习惯养成 / 能力成长 / 学习成长 / 兴趣爱好 / 身体成长）
  const catStat = {};
  const autoKeywords = ['财务能力分析', '作业·', '认真投入', '写日记', '自动'];
  let weekXp = 0;
  (xpRecords || []).forEach(r => {
    if (!inWin(r.date || r.datetime || '', week.start, week.end)) return;
    if (String(r.type || '') === 'XP获得') weekXp += (Number(r.xp) || 0);
    const cat = r.taskCategory || r.xpCategory || '其他';
    catStat[cat] = catStat[cat] || { count: 0, xp: 0 };
    catStat[cat].count += 1;
    catStat[cat].xp += (Number(r.xp) || 0);
  });

  // 3.2 亮点故事（四维成长行为：意志力/情绪/关系/认知，剔除消费流水）
  // 原则：只有真正属于成长维度的行为才配进「最棒的时刻」，消费记录不进。
  const effortStories = [];
  (xpRecords || []).forEach(r => {
    if (!inWin(r.date || r.datetime || '', week.start, week.end)) return;
    const name = String(r.title || r.taskName || '');
    const desc = String(r.description || '').trim();
    const cat = String(r.taskCategory || r.xpCategory || '');
    // 消费/财务流水、自动任务一律排除
    const isExpense = /财务能力分析|财务|值得|花|买|支出/.test(name + cat) &&
      /买|花|元|值得|支出/.test(name + desc);
    if (isExpense) return;
    // 只保留成长行为信号（坚持/主动/认真/作业完成/沟通/家务/阅读/助人等）
    if (/认真投入|主动|独立|坚持|自觉|完成|作业|阅读|家务|沟通|帮忙|助人|勇敢/.test(name) && desc.length >= 2) {
      effortStories.push({ name, date: r.date || '', desc });
    }
  });

  // 3.3 日记分析（四要素完整性 + 情绪）
  const weekDiaries = (diaries || []).filter(d => inWin(d.date || '', week.start, week.end));
  let moodDist = {};
  let bestDiary = null;
  weekDiaries.forEach(d => {
    const mood = d.mood || '🙂';
    moodDist[mood] = (moodDist[mood] || 0) + 1;
    const hits = (d.hits || []).length;
    if (!bestDiary || hits >= bestDiary.elements) {
      bestDiary = { date: d.date, content: d.content, mood: d.mood, elements: hits };
    }
  });

  // 3.4 作业进度（only 真实作业：过滤空壳/无日期的脏数据）
  const isRealHw = (h) => h && typeof h === 'object' && (h.submittedAt || h.dueDate || h.title || h.subject);
  const weekHw = (homework || []).filter(isRealHw).filter(h => {
    const st = String(h.submittedAt || h.dueDate || '');
    return st.slice(0, 10) >= week.start && st.slice(0, 10) <= week.end;
  });
  const hwDone = weekHw.filter(h => h.status === 'done' || h.submitted);
  // 抽出本周已交作业的真实科目（供前端显示，避免"未知"）
  const hwSubjects = hwDone
    .map(h => String(h.subject || '').trim())
    .filter(s => s.length > 0)
    .filter((v, i, a) => a.indexOf(v) === i); // 去重

  // 3.5 家庭约定（来自最近一次家庭会议）
  const fmList = ctx.familyMeetings || [];
  let currentCommitment = null;
  for (const fm of fmList) {
    if (fm.commitments && fm.commitments.length) { currentCommitment = fm; break; }
  }
  const commitmentSummary = currentCommitment
    ? currentCommitment.commitments.map(c => ({
        text: c.text || '', done: !!c.completed,
        // 真实单次 XP（家庭约定里配置的，挑战/建议里的 XP 必须以此为准）
        xp: Number(c.xp) || 0,
        category: c.category || ''
      }))
    : []
  // 补充：遵守家庭约定也是成长高光（关系维度）
  if (currentCommitment) {
    currentCommitment.commitments.forEach(c => {
      if (c.completed && c.text) {
        effortStories.push({ name: '家庭约定', date: week.end, desc: '遵守了约定：' + c.text });
      }
    });
  }

  // 3.6 GrowthAlgorithm 四维评估（认知/情绪/意志力/关系）——给孩子的"底层代码"归因
  const dimension = {};
  dimension.cognition = weekHw.length ? '本周有作业投入记录' : '本周尚未记录学习投入';
  dimension.emotion = (() => {
    if (!weekDiaries.length) return '本周日记较少，情绪表达需要更多窗口';
    const hasHappy = Object.keys(moodDist).some(m => /笑|😊|开心|棒/.test(String(m)));
    return hasHappy ? '情绪整体积极，愿意记录开心瞬间' : '情绪表达存在，可多引导分享';
  })();
  dimension.willpower = (() => {
    const autoTasks = (xpRecords || []).filter(r => inWin(r.date || '', week.start, week.end) &&
      /认真投入|坚持|自觉/.test(String(r.title || r.taskName || '')));
    return autoTasks.length ? '展现了自主坚持（' + autoTasks.length + ' 次）' : '自驱行为待观察';
  })();
  dimension.relation = (() => {
    const rel = (xpRecords || []).filter(r => inWin(r.date || '', week.start, week.end) &&
      /父母|沟通|家务|配合/.test(String(r.title || r.taskName || r.description || '')));
    return rel.length ? '在家庭协作/沟通上有积极表现' : '家庭协作是本周可开启的小目标';
  })();

  return {
    weekXp,
    categoryStat: Object.entries(catStat).map(([k, v]) => ({ category: k, ...v })),
    effortStories,
    weekDiaryCount: weekDiaries.length,
    moodDistribution: moodDist,
    bestDiary,
    hwDoneCount: hwDone.length,
    hwSubjects,
    hwTotalCount: weekHw.length,
    commitmentSummary,
    dimension
  };
}

/* ══════════════════ 4. 组装数据上下文 ══════════════════ */
function buildContext(week) {
  const child = readJSON('child.json') || {};
  const xpRecords = readJSON('xpRecords.json') || [];
  const diaries = readJSON('diaryEntries.json') || [];
  const finance = readJSON('finance.json') || {};
  const study = readJSON('study.json') || {};
  const familyMeetings = readJSON('familyMeetings.json') || [];
  const prevReports = readJSON('aiWeeklyReports.json') || [];

  const ctx = { xpRecords, diaries, finance, study, familyMeetings };
  const analysis = growthAnalysis({ ...ctx, homework: study.allHomework || [], week });

  // 上周周报（用于趋势，取最后一个）
  const lastReport = prevReports.length ? prevReports[prevReports.length - 1] : null;

  // 财富（本周交易）
  const weekTx = (finance.recentTransactions || []).filter(t => {
    const d = String(t.date || ''); return d >= week.start && d <= week.end;
  });
  const income = weekTx.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expense = weekTx.filter(t => t.type === 'expense').reduce((s, t) => s + (Math.abs(Number(t.amount)) || 0), 0);
  const worthIt = weekTx.filter(t => t.type === 'expense' && t.worthIt === '值得').length;
  const expenseCount = weekTx.filter(t => t.type === 'expense').length;
  const worthRate = expenseCount ? Math.round(worthIt / expenseCount * 100) : 100;

  return { child, analysis, financeTx: { weekTx, income, expense, worthRate, expenseCount }, lastReport };
}

/* ══════════════════ 5. GrowthAlgorithm 系统提示 ══════════════════ */
// 这部分是"成长算法视角"的权威约束，让AI生成既忠于数据，又符合儿童心理。
const GROWTH_SYSTEM = `
你是一名资深的家庭教育成长专家，正在为一个 9 岁四年级女孩（名字见数据）生成每周成长周报。
你的读者是孩子本人（不是家长），所有语言用第二人称「你」，像朋友聊天一样亲切自然。

## 三条底层原则（必须贯穿全文）
1. 关系优先：先让孩子感到被看见、被肯定，再谈可以做得更好的地方。
2. 循序渐进：肯定已经做到的，措辞是"你可以试试"，不是"你应该"。
3. 区分事实：只基于提供的数据事实说话，不空泛表扬、不做负面标签。

## 四维成长视角（GrowthAlgorithm）
用以下四个维度观察本周孩子的成长，四维要尽量均衡呈现，不要只突出认知和情绪：
- 认知（学到了什么、完成了什么作业）
- 情绪（心情如何、是否愿意记录和分享）
- 意志力（是否坚持、自觉、主动）——本周有"坚持每天阅读30分钟约定"，这是意志力高光，请单独作为一条"最棒的时刻"徽章，不要和认知混在一起
- 关系（与家人协作、沟通、承担家务）——本周"主动做家务"是唯一缺口，正是下周可开启的成长目标

"最棒的时刻"(behavior.effortStories) 必须只放真正出自四维的成长高光（坚持、主动、完成作业、遵守约定、助人），严禁放消费流水/买了什么值不值。

## 语气与表达要求
- 全程第二人称「你」，口语化，像大朋友。
- 先肯定后引导；表扬要落到具体行为（"你遵守了和爸爸妈妈的约定"）而非空话（"你真棒"）。
- 建议是邀约"你可以试试…"，不是命令。
- 支撑四维均衡：若孩子本周在意志力/关系上有表现，导语和"综合建议"应纳入；若某维缺失，用一句"下周可以试着…"轻轻补位，而不是回避。
- 挑战(suggestions.challenge)应呼应本周未达成的约定/弱维度：例如本周"主动做家务"未完成，挑战就建议主动做一件具体家务。
- **challenge 的 +XP 必须可验证**：只能使用上面数据里"家庭约定(commitments)"中该任务配置的真实单次 XP（如"主动做家务"=+5XP、"每天阅读30分钟"=+5XP）。若挑战设定连续 N 天，则总额 = 单次XP × 天数（例如每天做家务+5XP，坚持3天=+15XP），并在末尾明确写出"每天+5XP，坚持N天共+N*5XP"。严禁凭空编造+50XP这类与规则无关的数字。
- 用 1 个 emoji 点缀即可，不要堆砌。

## ⚠️ 严格禁止重复（最重要的一条规则）
**每个板块必须写不同的内容，严禁跨板块重复同一句话或同一个关键词组合。**
全篇读下来，孩子应该感觉每个板块都在说一件新的事情，而不是同一件事翻来覆去。

每个板块的"角色"区分如下：
- **summary**：一句话总览最高光，只提一个亮点，不列清单！不给具体行为描述。例如"这周你坚持做了阅读约定，能量积累了40点！" 而不是"你遵守了约定，坚持每天阅读30分钟，完成了语文作业……"
- **effortStories**：每个故事必须是一个**独立的不同场景**。如果两个故事说的是同一件事（如都是"坚持阅读"），只保留一个，删掉另一个。故事要写具体场景（如"你读了《逃离图书馆3》的第几章，还和妈妈一起讨论剧情"），不要空泛说"你遵守了约定"
- **keep**：不要写具体行为！用**抽象品质**总结，完全不提"阅读""作业""约定"。例如"你的自律让成长闪闪发光"、"你越来越有责任感了"
- **improve**：一个具体的改进方向，不要重复 summary 里已经提过的事
- **challenge**：一个具体的挑战任务，和 improve 方向一致

**检查方法**：写完所有字段后，从头到尾读一遍。如果发现"坚持每天阅读30分钟"或"遵守了约定"出现在超过 1 个板块中，删除重复的，改成全新的表达。

## 高亮标记
对关键数据（XP、天数）、表扬词（"说到做到""坚持""小达人"）、关键行为，用双星号 **包裹**。但注意：**不要为了高亮而重复写同一句话**。每个板块只需 1-2 处高亮，全文高亮位置不要超过 6 处。

## 输出格式（严格 JSON，不要 markdown 代码块，不要任何解释文字）
{
  "id": "wr_<8位随机小写字母数字>",
  "weekNumber": <数值>,
  "year": <数值>,
  "date": "<本周结束日期 YYYY-MM-DD>",
  "generatedAt": "<ISO时间戳>",
  "summary": "<1-2句第二人称摘要，只说最高光亮点，不列清单！如'这周你坚持做了阅读约定，能量积累了40点！' 不要写成'你遵守了约定，坚持每天阅读30分钟，完成了语文作业……'>",
  "stats": {
    "energy": { "value": <本周XP总数>, "trend": "up|down|stable", "diff": <与上周差值的绝对值> },
    "study": { "value": <本周完成作业数>, "trend": "up|down|stable", "diff": <差值>, "hasData": <bool> },
    "finance": { "value": <本周累计存入-支出金额绝对值>, "trend": "up|down|stable", "diff": <差值>, "hasData": <bool> },
    "diary": { "value": <本周日记篇数>, "trend": "up|down|stable", "diff": <差值> }
  },
  "academic": {
    "homework": { "subjects": ["<有作业的科目，必须用 analysis.hwSubjects 里的真实科目，如语文/数学/英语；若为空则给[]>"] },
    "trends": [],
    "weakModules": [],
    "hasData": <bool>,
    "emptyHint": "<无学习数据时，用鼓励口吻提示本周可开启的小目标，带1个emoji>"
  },
  "behavior": {
    "profile": [ { "category": "<成长分类>", "count": <次数>, "xp": <XP> } ],
    "effortStories": [ { "subject": "<成长行为>", "date": "<日期>", "story": "<孩子具体怎么做的>（每个故事必须是独立场景，互不相同。如果两个故事场景相似，只保留一个，删除另一个。严禁放消费流水/买了什么值不值）> } ],
    "badge": { "earned": false, "type": "", "days": 0, "name": "" }
  },
  "emotion": {
    "diaryTrend": "low|normal|high",
    "diaryCount": <本周日记篇数>,
    "moodDistribution": { "<表情>": <次数> },
    "bestDiary": { "snippet": "<本周最佳日记完整句子，不截断>", "date": "<日期>", "elements": <四要素命中数0-5> },
    "financeStatus": "good|watch|alert",
    "financeWorthIt": <值得率百分比>
  },
  "suggestions": {
    "keep": "成就达成：<抽象品质总结，不写具体行为！如'你的自律让成长闪闪发光'，完全不提阅读/作业/约定>",
    "improve": "试试看：<1条邀请式的小建议，呼应本周较弱的一个维度，不要重复summary已经说过的事>",
    "challenge": "趣味挑战：<一个有趣的本周挑战，和improve方向一致，末尾必须带 +XP>"
  },
  "growth": {
    "profileUpdate": { "highlights": ["<3-5个具体闪光点，用行为而非标签>"], "date": "<本周结束日期>" }
  }
}
`;
const RULES = `
本周数据与前置分析如下。请严格据此撰写，不要编造数据；趋势(diff/trend)要依据上周对比得出。
`;

/* ══════════════════ 6. 调用 DeepSeek ══════════════════ */
function callDeepSeek(apiKey, messages) {
  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      stream: false
    })
  });
}

/* ══════════════════ 7. 主流程 ══════════════════ */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let keyFile = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key-file') keyFile = args[i + 1] || '';
  }
  const weekArgIdx = args.findIndex(a => a === '--week');
  const weekArg = weekArgIdx >= 0 ? args[weekArgIdx + 1] : todayISO();
  const week = weekWindow(weekArg);

  const ctx = buildContext(week);
  const { child, analysis, financeTx, lastReport } = ctx;

  console.log('════ 周报生成器 · GrowthAlgorithm × DeepSeek ════');
  console.log(`周窗口: ${week.start} ~ ${week.end}  第${week.weekNumber}周(${week.year})  dry-run=${dryRun}`);

  // 前置分析的直观摘要
  console.log('\n[GrowthAlgorithm 前置分析]');
  console.log(`  能量: ${analysis.weekXp} XP`);
  console.log(`  分布: ${analysis.categoryStat.map(c => c.category + '×' + c.count).join(', ') || '(无)'}`);
  console.log(`  日记: ${analysis.weekDiaryCount} 篇  情绪${JSON.stringify(analysis.moodDistribution)}`);
  console.log(`  作业: ${analysis.hwDoneCount}/${analysis.hwTotalCount}`);
  console.log(`  四维: ${JSON.stringify(analysis.dimension)}`);
  console.log(`  约定: ${analysis.commitmentSummary.map(c => (c.done ? '✓' : '○') + c.text).join('  ') || '(无)'}`);

  // 组装消息
  const dataContext = {
    child: { name: child.name, grade: child.grade, motto: child.motto },
    week: { weekNumber: week.weekNumber, year: week.year, start: week.start, end: week.end },
    analysis,
    finance: {
      income: financeTx.income, expense: financeTx.expense,
      expenseCount: financeTx.expenseCount, worthRate: financeTx.worthRate
    },
    lastReport: lastReport ? { summary: lastReport.summary, stats: lastReport.stats } : null
  };

  let report;
  if (dryRun) {
    console.log('\n[dry-run] 未调用模型，以上为将交给 DeepSeek 的数据与分析。');
    console.log('数据上下文预览:');
    console.log(JSON.stringify(dataContext, null, 2));
    return 0;
  }

  const apiKey = getApiKey(keyFile);
  if (!apiKey) {
    console.error('\n✗ 未配置 DEEPSEEK_API_KEY 环境变量或 ~/.deepseek-key 文件。');
    console.error('  请设置后重试：export DEEPSEEK_API_KEY="sk-..."');
    return 1;
  }

  const messages = [
    { role: 'system', content: GROWTH_SYSTEM },
    { role: 'user', content: RULES + '\n' + JSON.stringify(dataContext, null, 2) }
  ];

  let ok = false;
  let attempt = 0;
  while (!ok && attempt <= MAX_RETRY) {
    attempt++;
    console.log(`\n[DeepSeek] 生成中（第 ${attempt} 次）...`);
    try {
      const resp = await callDeepSeek(apiKey, messages);
      if (!resp.ok) {
        const body = await resp.text();
        console.error(`✗ API 错误 ${resp.status}: ${body.slice(0, 400)}`);
        if (attempt <= MAX_RETRY) { console.log('  重试一次...'); continue; }
        return 1;
      }
      const data = await resp.json();
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) { console.error('✗ 模型返回为空'); return 1; }
      const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.id) parsed.id = 'wr_' + Math.random().toString(36).slice(2, 10);
      parsed.weekNumber = week.weekNumber;
      parsed.year = week.year;
      parsed.date = week.end;
      parsed.generatedAt = new Date().toISOString();
      // 覆写财务值得率（以真实数据为准，防模型算错）
      if (parsed.emotion) parsed.emotion.financeWorthIt = financeTx.worthRate;
      // 覆写作业科目（以真实数据为准，防"未知"）
      if (!parsed.academic) parsed.academic = {};
      if (!parsed.academic.homework) parsed.academic.homework = {};
      parsed.academic.homework.subjects = (analysis.hwSubjects || []).slice();
      // 严格校验：作业数务必与真实值一致
      if (parsed.stats && parsed.stats.study) {
        parsed.stats.study.value = analysis.hwDoneCount;
        parsed.stats.study.hasData = analysis.hwDoneCount > 0;
      }
      report = parsed;
      ok = true;
    } catch (e) {
      console.error('✗ 调用失败: ' + e.message);
      if (attempt <= MAX_RETRY) { continue; }
      return 1;
    }
  }

  if (!report) return 1;

  // 写回 aiWeeklyReports.json（按 weekNumber+year 覆盖，避免重复追加）
  const prev = readJSON('aiWeeklyReports.json') || [];
  const dupIdx = prev.findIndex(r => r.weekNumber === report.weekNumber && r.year === report.year);
  if (dupIdx >= 0) {
    prev[dupIdx] = report;
    console.log('\n↻ 已覆盖第 ' + week.weekNumber + ' 周原有周报（原 ' + report.generatedAt + ' → 新 ' + report.generatedAt + '）');
  } else {
    prev.push(report);
    console.log('\n✅ 已新增第 ' + week.weekNumber + ' 周周报');
  }
  fs.writeFileSync(path.join(DATA, 'aiWeeklyReports.json'), JSON.stringify(prev, null, 2), 'utf-8');
  console.log('   摘要: ' + (report.summary || '').slice(0, 80));
  return 0;
}

main().then(rc => process.exit(rc)).catch(e => { console.error(e); process.exit(1); });