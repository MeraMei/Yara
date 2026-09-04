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

// 以【周五】为周期节点：返回“<= iso 的最近一个周五”。
// 让周期始终固定为 周六~周五，无论哪天运行都不跳周号（防止补跑时周期错乱）。
function anchorToFriday(iso) {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay();          // 0=周日 5=周五
  const back = (day - 5 + 7) % 7;  // 距上个周五回退的天数
  d.setDate(d.getDate() - back);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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

  // 3.5 家庭约定（本周=本周报 weekNumber 对应的那一次家庭会议；不是"最新会议"）
  const fmList = ctx.familyMeetings || [];
  let currentCommitment = null;
  for (const fm of fmList) {
    if (fm.weekNumber === week.weekNumber && fm.commitments && fm.commitments.length) { currentCommitment = fm; break; }
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

/* ══════════════════ 3.7 游戏时间攒点（延迟满足 · 自由时间奖励） ══════════════════ */
// GrowthAlgorithm 约束：
//   - 只算【周一到周五】的真实成长打卡（当天完成 ≥1 项手动成长任务），周六日不攒
//     （攒在工作日、花在周末，天然区隔，避免"游戏时间"与"上学日"冲突周二到四受影响）。
//   - 每个打卡日 +12 分钟；每周新增封顶 +60 分钟（避免无限膨胀，保持稀缺感）。
//   - 未用余额可结转，但总可用封顶 120 分钟（防积压成不可控的"游戏额度"）。
//   - 定位是"自由时间奖励"，不是"把学习变成交易"；由家长在周末温和执行、按时回收。
function computeGameTime(xpRecords, week, lastGameTime) {
  const growthCats = ['学习成长', '能力成长', '身体成长', '兴趣爱好'];
  const earnPerDay = 12;   // 分钟/打卡日
  const capWeek = 60;      // 每周新增封顶（分钟）
  const balanceCap = 120;  // 结转可用封顶（分钟）

  function isAutoOrSpend(r) {
    const n = String(r.title || r.taskName || '');
    const d = String(r.description || '');
    const cat = String(r.taskCategory || r.xpCategory || '');
    const isSpend = /财务能力分析|财务|值得/.test(n + cat) && /买|花|元|值得|支出/.test(n + d);
    const isAuto = /作业·/.test(n) || /认真投入/.test(n)
      || n.indexOf('财务能力分析') >= 0 || /写日记/.test(n) || /自动发放/.test(d);
    return isAuto || isSpend;
  }

  // 工作日判定：周一..周五
  function isWeekday(iso) {
    const day = new Date(iso + 'T00:00:00').getDay(); // 0=周日
    return day >= 1 && day <= 5;
  }

  const daySet = new Set();
  (xpRecords || []).forEach(r => {
    const d = String(r.date || r.datetime || '').slice(0, 10);
    if (!(d >= week.start && d <= week.end)) return;
    if (isAutoOrSpend(r)) return;
    if (!isWeekday(d)) return;
    const cat = String(r.taskCategory || r.xpCategory || '');
    if (growthCats.indexOf(cat) < 0) return;   // 只认真实成长分类里的手动打卡
    daySet.add(d);
  });

  const checkedDays = daySet.size;
  const earnedMin = Math.min(checkedDays * earnPerDay, capWeek);
  const carryMin = Math.min(Number((lastGameTime && lastGameTime.balance) || 0), balanceCap);
  const balance = Math.min(carryMin + earnedMin, balanceCap);

  return { checkedDays, earnedMin, capWeek, balance, balanceCap, carryMin };
}

/* ══════════════════ 3.8 历史成长画像（GrowthAlgorithm 全面分析） ══════════════════ */
// 基于所有历史 XP 记录，生成孩子的全面成长画像
// 用于周报中提供"你一直以来的成长轨迹"视角，而不仅仅是本周
function historicalPortrait(xpRecords, diaries, familyMeetings) {
  if (!xpRecords || xpRecords.length === 0) {
    return { hasData: false, totalXp: 0, activeDays: 0, categoryRank: [], topTasks: [], consistency: {}, familyMeetingEverHeld: false };
  }

  // 总 XP 和活跃天数
  const daySet = new Set();
  const catStat = {};
  const taskStat = {};
  let totalXp = 0;

  xpRecords.forEach(r => {
    const d = String(r.date || r.datetime || '').slice(0, 10);
    if (d) daySet.add(d);
    const xp = Number(r.xp) || 0;
    totalXp += xp;
    // 分类统计
    const cat = r.taskCategory || r.xpCategory || '其他';
    if (!catStat[cat]) catStat[cat] = { count: 0, xp: 0 };
    catStat[cat].count++;
    catStat[cat].xp += xp;
    // 任务统计
    const task = r.taskName || r.title || '';
    if (task && !/财务能力分析|财务进账/.test(task)) {
      if (!taskStat[task]) taskStat[task] = { count: 0, xp: 0 };
      taskStat[task].count++;
      taskStat[task].xp += xp;
    }
  });

  // 分类排名（按 XP 降序）
  const categoryRank = Object.entries(catStat)
    .map(([k, v]) => ({ category: k, ...v }))
    .sort((a, b) => b.xp - a.xp);

  // 任务 TOP5
  const topTasks = Object.entries(taskStat)
    .map(([k, v]) => ({ task: k, ...v }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5);

  // 连续性分析：最长连续打卡天数
  const sortedDays = Array.from(daySet).sort();
  let maxStreak = 1, curStreak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1] + 'T00:00:00');
    const curr = new Date(sortedDays[i] + 'T00:00:00');
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else { curStreak = 1; }
  }

  // 四维评估（基于历史全量数据）
  const fourDimensions = {
    cognition: { label: '认知', xp: (catStat['学习成长'] || {}).xp || 0, desc: '' },
    emotion: { label: '情绪', xp: (catStat['能力成长'] || {}).xp || 0, desc: '' },
    willpower: { label: '意志力', xp: 0, desc: '' },
    relation: { label: '关系', xp: 0, desc: '' }
  };
  // 意志力：阅读坚持、自主打卡
  const readingCount = xpRecords.filter(r => /阅读/.test(r.taskName || r.title || '')).length;
  fourDimensions.willpower.xp = readingCount * 5;
  // 关系：沟通、家务
  const relationTasks = xpRecords.filter(r => /沟通|家务|收拾|帮忙/.test(r.taskName || r.title || ''));
  fourDimensions.relation.xp = relationTasks.reduce((s, r) => s + (r.xp || 0), 0);

  // 填充描述
  fourDimensions.cognition.desc = fourDimensions.cognition.xp > 30 ? '学习投入较多，作业完成有记录' :
    fourDimensions.cognition.xp > 0 ? '有学习投入，但可以更持续' : '尚未记录学习投入';
  fourDimensions.emotion.desc = diaries && diaries.length > 0 ? `写过${diaries.length}篇日记，愿意表达和记录` : '还没有写过日记，情绪表达需要更多窗口';
  fourDimensions.willpower.desc = readingCount > 3 ? `阅读打卡${readingCount}次，展现了坚持的苗头` :
    readingCount > 0 ? '有阅读记录，但频率还不稳定' : '还没有自主坚持的记录';
  fourDimensions.relation.desc = relationTasks.length > 0 ? `有${relationTasks.length}次沟通/家务/整理记录` : '还没有主动承担家务或沟通的记录';

  // 家庭会议是否开过
  const familyMeetingEverHeld = familyMeetings && familyMeetings.length > 0;

  // 最强能力标签（基于分类数据）
  const strengthLabels = [];
  if (categoryRank.length > 0) {
    const top = categoryRank[0];
    const topMap = { '能力成长': '独立小能手', '学习成长': '学习小达人', '身体成长': '运动小健将', '兴趣爱好': '创意小艺术家' };
    if (topMap[top.category]) strengthLabels.push(topMap[top.category]);
  }
  if (readingCount >= 3) strengthLabels.push('阅读坚持者');
  if (relationTasks.length >= 2) strengthLabels.push('家庭好帮手');
  if (diaries && diaries.length >= 2) strengthLabels.push('日记记录者');

  return {
    hasData: true,
    totalXp,
    activeDays: daySet.size,
    dateRange: sortedDays.length ? { first: sortedDays[0], last: sortedDays[sortedDays.length - 1] } : null,
    categoryRank,
    topTasks,
    maxStreak,
    fourDimensions,
    familyMeetingEverHeld,
    strengthLabels,
    diaryCount: diaries ? diaries.length : 0,
    avgWeeklyXp: calcAvgWeeklyXp(xpRecords)
  };
}

// 计算历史平均每周 XP（用于判断"低数据周"）
function calcAvgWeeklyXp(xpRecords) {
  if (!xpRecords || xpRecords.length === 0) return 0;
  const weekMap = {};
  xpRecords.forEach(r => {
    const d = String(r.date || r.datetime || '').slice(0, 10);
    if (!d) return;
    const dt = new Date(d + 'T00:00:00');
    const wk = getISOWeekKey(dt);
    weekMap[wk] = (weekMap[wk] || 0) + (Number(r.xp) || 0);
  });
  const weeks = Object.values(weekMap);
  if (weeks.length === 0) return 0;
  return Math.round(weeks.reduce((s, v) => s + v, 0) / weeks.length);
}

function getISOWeekKey(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return date.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
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

  // 游戏时间攒点（延迟满足 · 自由时间奖励；结转自上期周报，防无限累积）
  const lastGameTime = (prevReports.length ? prevReports[prevReports.length - 1].gameTime : null);
  analysis.gameTime = computeGameTime(xpRecords, week, lastGameTime);

  // 历史成长画像（GrowthAlgorithm 全面分析）
  analysis.portrait = historicalPortrait(xpRecords, diaries, familyMeetings);

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
3. 区分事实：只基于提供的数据事实说话，不空泛表扬、不做负面标签。**严禁编造数据中不存在的成就、约定或行为。**

## 四维成长视角（GrowthAlgorithm）
用以下四个维度观察本周孩子的成长，四维要尽量均衡呈现，不要只突出认知和情绪：
- 认知（学到了什么、完成了什么作业）
- 情绪（心情如何、是否愿意记录和分享）
- 意志力（是否坚持、自觉、主动）
- 关系（与家人协作、沟通、承担家务）

"最棒的时刻"(behavior.effortStories) 必须只放真正出自四维的成长高光（坚持、主动、完成作业、遵守约定、助人），严禁放消费流水/买了什么值不值。**若本周 XP=0 且无真实 effortStories 数据，该字段必须为空数组 []，严禁编造。**

## 空数据周的特殊引导（当 analysis.weekXp=0 时触发）
当本周没有任何打卡记录时，这是最重要的引导时刻——不能批评、不能编造、不能假装什么都没发生：
1. **诚实承认**：summary 直接说"这周还没有打卡记录"，不粉饰
2. **回溯历史力量**：引用 analysis.portrait 中的历史数据，提醒孩子"你之前做到过"（如"你之前连续5天完成作业，说明你有这个能力"）
3. **低门槛重启**：improve 和 challenge 给一个极低门槛的重新开始建议（如"明天试着做一件小事就好"）
4. **不表扬不存在的成就**：suggestions.keep 不能写"你的坚持和自律"，应改为鼓励重新出发
5. **growth.highlights**：不能出现"遵守约定""坚持自律"等虚假亮点，应写"等待新的一周开启成长之旅"

## 低数据周的加强引导（当 analysis.weekXp > 0 但明显低于 analysis.portrait.avgWeeklyXp 时触发）
当本周有打卡但明显低于历史平均水平（weekXp < avgWeeklyXp * 0.5）时，同样需要加强引导：
1. **先肯定已做到的**：哪怕只有 1 次打卡，也要具体表扬那一次（如"你虽然这周只打了1次卡，但你完成了XX，说明你心里一直记着"）
2. **温和指出落差**：用对比方式让孩子自己意识到差距（如"你平时一周能攒30多XP，这周只有10XP，是不是有什么事耽误了？"）
3. **回溯历史高光**：引用 portrait 中的强项数据，提醒孩子"你之前做到过XX，那才是真正的你"
4. **improve 要更有针对性**：不是泛泛的"多努力"，而是具体指出哪个维度下降了（如"你之前能力成长最强，这周完全没动，下周可以试试主动做一件家务"）
5. **challenge 要有恢复感**：不是从零开始，而是"回到你之前的节奏"（如"试试恢复到之前连续3天打卡的状态"）

## 家庭会议引导（当 analysis.portrait.familyMeetingEverHeld=false 时触发）
如果数据中显示从未开过家庭会议，这是需要温柔但明确引导的重要信号：
- 在 improve 或 challenge 中自然带一句："你和爸爸妈妈还没有一起坐下来聊过成长目标呢，下周可以试试开一个小小的家庭会议，一起定一个你觉得有趣的小目标"
- 不要把家庭会议说成"任务"，要让孩子觉得是"和爸爸妈妈一起商量一件好玩的事"
- 家庭会议的意义：帮你找到真正想做的事，而不是别人要你做的事

## 历史成长画像（analysis.portrait 的使用）
数据中提供了孩子的全面成长画像，包括：
- portrait.totalXp：历史总 XP
- portrait.activeDays：历史活跃天数
- portrait.categoryRank：各分类 XP 排名（能力成长/学习成长/身体成长/兴趣爱好）
- portrait.topTasks：历史 TOP5 任务
- portrait.maxStreak：最长连续打卡天数
- portrait.fourDimensions：四维历史评估（认知/情绪/意志力/关系）
- portrait.strengthLabels：能力标签（如"独立小能手""阅读坚持者"）
- portrait.familyMeetingEverHeld：是否开过家庭会议

**使用方式**：
- 本周有数据时：画像作为背景，在 keep 或 summary 中轻轻提及（如"你一直是**独立小能手**，这周又自己完成了XX"）
- 本周无数据时：画像是核心引导素材，用"你之前做到过XX"来唤醒孩子的自信心
- 不要每次都堆砌画像数据，挑最相关的 1-2 个点自然融入

## 游戏时间攒点（若 analysis.gameTime 提供，必须自然带一句）
- 数据字段：gameTime.checkedDays(本周打卡天数)、earnedMin(本周攒下分钟)、balance(当前累计可用分钟)、capWeek(每周封顶=60)、balanceCap(结转封顶=120)。
- 只在 earnedMin>0 时提它；把它定位成"你用工作日踏实打卡，攒来的周末自由时间"，体现"延迟满足"的意志力高光，可以在 summary 或 improve 里轻轻带一句。**严禁**做成"做了某事=换游戏时间"的交易感。
- 同步提醒一句："游戏时间是用来放松的，玩完按时放下就好"，语气温和不训诫。

## 语气与表达要求
- 全程第二人称「你」，口语化，像大朋友。
- 先肯定后引导；表扬要落到具体行为而非空话。
- 建议是邀约"你可以试试…"，不是命令。
- 支撑四维均衡：若某维缺失，用一句"下周可以试着…"轻轻补位。
- **challenge 的 +XP 必须可验证**：只能使用数据中"家庭约定(commitments)"里配置的真实 XP。若没有家庭约定数据，challenge 的 XP 统一用 +5XP/次，并写明"完成一次+5XP"。严禁凭空编造+50XP这类数字。
- 用 1 个 emoji 点缀即可，不要堆砌。

## 高亮标记（硬要求：每个文字字段必须包含至少一处 ** 标记）
对关键数据、表扬关键词、关键行为，**必须用双星号 **包裹**。每条字段至少包含 1-2 处 ** 高亮。

## 严格禁止重复内容（每个板块写不同的事）
- **summary**：一句话总览最高光，只说一个亮点
- **effortStories**：每篇故事是不同的独立场景
- **keep**：抽象品质总结，不用具体行为
- **improve**：改进方向，不重复 summary 提过的事
- **challenge**：具体挑战任务，和 improve 方向一致

## 输出格式（严格 JSON，不要 markdown 代码块，不要任何解释文字）
{
  "id": "wr_<8位随机小写字母数字>",
  "weekNumber": <数值>,
  "year": <数值>,
  "date": "<本周结束日期 YYYY-MM-DD>",
  "generatedAt": "<ISO时间戳>",
  "summary": "<1-2句第二人称摘要。本周XP>0时说最高光亮点；XP=0时诚实说'这周还没有打卡记录'并引用历史力量鼓励。必须包含 ** 高亮。">,
  "stats": {
    "energy": { "value": <本周XP总数>, "trend": "up|down|stable", "diff": <与上周差值的绝对值> },
    "study": { "value": <本周完成作业数>, "trend": "up|down|stable", "diff": <差值>, "hasData": <bool> },
    "finance": { "value": <本周累计存入-支出金额绝对值>, "trend": "up|down|stable", "diff": <差值>, "hasData": <bool> },
    "diary": { "value": <本周日记篇数>, "trend": "up|down|stable", "diff": <差值> }
  },
  "academic": {
    "homework": { "subjects": ["<真实科目，无则[]>"] },
    "trends": [],
    "weakModules": [],
    "hasData": <bool>,
    "emptyHint": "<无学习数据时的鼓励，带1个emoji>"
  },
  "behavior": {
    "profile": [ { "category": "<分类>", "count": <次数>, "xp": <XP> } ],
    "effortStories": [ { "subject": "<成长行为>", "date": "<日期>", "story": "<具体行为，含**高亮。XP=0时必须为空数组>" } ],
    "badge": { "earned": false, "type": "", "days": 0, "name": "" }
  },
  "emotion": {
    "diaryTrend": "low|normal|high",
    "diaryCount": <本周日记篇数>,
    "moodDistribution": { "<表情>": <次数> },
    "bestDiary": { "snippet": "<最佳日记句子>", "date": "<日期>", "elements": <命中数0-5> },
    "financeStatus": "good|watch|alert",
    "financeWorthIt": <值得率百分比>
  },
  "suggestions": {
    "keep": "成就达成：<抽象品质总结，XP=0时写鼓励重新出发，含**高亮>",
    "improve": "试试看：<1条小建议，XP=0时引用历史力量+低门槛重启；从未开家庭会议时温柔引导，含**高亮>",
    "challenge": "趣味挑战：<具体挑战，含**高亮，末尾带+XP>"
  },
  "growth": {
    "profileUpdate": { "highlights": ["<3-5个闪光点，XP=0时写等待重新出发>"], "date": "<本周结束日期>" }
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
  const weekArg = weekArgIdx >= 0 ? args[weekArgIdx + 1] : anchorToFriday(todayISO());
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
  // 历史成长画像摘要
  if (analysis.portrait && analysis.portrait.hasData) {
    console.log(`\n[历史成长画像]`);
    console.log(`  总XP: ${analysis.portrait.totalXp}  活跃天数: ${analysis.portrait.activeDays}  最长连续: ${analysis.portrait.maxStreak}天`);
    console.log(`  分类TOP: ${analysis.portrait.categoryRank.slice(0, 3).map(c => c.category + '(' + c.xp + 'XP)').join(', ')}`);
    console.log(`  能力标签: ${analysis.portrait.strengthLabels.join('、') || '(无)'}`);
    console.log(`  家庭会议: ${analysis.portrait.familyMeetingEverHeld ? '已开过' : '从未开过 ← 需要引导'}`);
    console.log(`  平均周XP: ${analysis.portrait.avgWeeklyXp}  本周XP: ${analysis.weekXp}`);
    // 数据水平判断
    const level = analysis.weekXp === 0 ? '空数据' :
      analysis.weekXp < analysis.portrait.avgWeeklyXp * 0.5 ? '低数据' :
      analysis.weekXp < analysis.portrait.avgWeeklyXp * 0.8 ? '偏低' : '正常';
    console.log(`  数据水平: ${level}${level === '空数据' || level === '低数据' ? ' ← 需要加强引导' : ''}`);
    console.log(`  四维: ${Object.values(analysis.portrait.fourDimensions).map(d => d.label + '=' + d.desc.slice(0, 15)).join(' | ')}`);
  }

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
    console.error(`  【保护生效】本次对应周期: 第${week.weekNumber}周 (${week.start} ~ ${week.end})，未生成任何周报，未改动数据文件。`);
    console.error('  说明：为避免“静默跳周导致周期错乱”，Key 缺失时会明确失败并终止，绝不写入空/错位周报。');
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
      // 覆写财务：以真实流水为准（收入=存款/零花钱，支出=实际花销），
      // 杜绝把"每周零花钱"这类收入误判成"花了X元"。
      if (parsed.stats && parsed.stats.finance) {
        parsed.stats.finance.value = financeTx.expense;      // 只呈现真实支出
        parsed.stats.finance.income = financeTx.income;      // 进账单独存（供界面展示）
        parsed.stats.finance.hasData = financeTx.expense > 0; // 本周没花钱则不显示"花了"
      }
      // 覆写作业科目（以真实数据为准，防"未知"）
      if (!parsed.academic) parsed.academic = {};
      if (!parsed.academic.homework) parsed.academic.homework = {};
      parsed.academic.homework.subjects = (analysis.hwSubjects || []).slice();
      // 覆写游戏时间攒点（以本次真实打卡计算为准，防模型编造）
      parsed.gameTime = analysis.gameTime || { checkedDays: 0, earnedMin: 0, capWeek: 60, balance: 0, balanceCap: 120, carryMin: 0 };
      // 严格校验：作业数务必与真实值一致
      if (parsed.stats && parsed.stats.study) {
        parsed.stats.study.value = analysis.hwDoneCount;
        parsed.stats.study.hasData = analysis.hwDoneCount > 0;
      }
      // ═══ 数据真实性校验：防止 AI 编造不存在的数据 ═══
      const hasAnyXp = analysis.weekXp > 0;
      const hasEffortFromData = analysis.effortStories.length > 0;
      const hasCommitments = analysis.commitmentSummary.length > 0;
      const hasCompletedCommitments = analysis.commitmentSummary.some(c => c.done);
      const hasDiaries = analysis.weekDiaryCount > 0;

      // 1. effortStories 校验：无真实数据支撑的故事必须清除
      if (parsed.behavior && parsed.behavior.effortStories) {
        parsed.behavior.effortStories = parsed.behavior.effortStories.filter(story => {
          const text = (story.story || '') + (story.subject || '');
          // 提到"约定/承诺/遵守"但没有真实约定数据 → 编造
          if (/约定|承诺|遵守|兑现/.test(text) && !hasCompletedCommitments) return false;
          // 提到具体成长行为但本周 XP=0 且无真实 effortStories → 编造
          if (!hasAnyXp && !hasEffortFromData) return false;
          return true;
        });
      }

      // 2. summary 校验：XP=0 时不能出现"坚持了""完成了"等虚假成就
      if (!hasAnyXp && parsed.summary) {
        if (/坚持了|完成了|遵守了|兑现了|积累了.*\*\*\d+.*点/.test(parsed.summary)) {
          // 用诚实的默认值替换
          parsed.summary = '这周还没有打卡记录，不过没关系，新的一周随时可以开始！';
        }
      }

      // 3. growth.highlights 校验：不能出现数据中不存在的成就
      if (parsed.growth && parsed.growth.profileUpdate && parsed.growth.profileUpdate.highlights) {
        parsed.growth.profileUpdate.highlights = parsed.growth.profileUpdate.highlights.filter(h => {
          if (/约定|承诺|遵守|阅读.*分钟/.test(h) && !hasCompletedCommitments) return false;
          if (/坚持|自律|打卡/.test(h) && !hasAnyXp) return false;
          return true;
        });
        // 如果过滤后为空，给诚实的默认
        if (parsed.growth.profileUpdate.highlights.length === 0) {
          parsed.growth.profileUpdate.highlights = ['等待新的一周开启成长之旅'];
        }
      }

      // 4. suggestions.keep 校验：XP=0 时不能表扬"本周"不存在的成就，
      //    但保留"一直/曾经"等回溯历史的真实表扬（符合空数据周引导）
      if (!hasAnyXp && parsed.suggestions && parsed.suggestions.keep) {
        if (/这周|本周|坚持了|完成了|兑现了|遵守了/.test(parsed.suggestions.keep)) {
          parsed.suggestions.keep = '成就达成：新的一周即将开始，你已经准备好了！';
        }
      }

      // 5. behavior.profile 校验：XP=0 时清空
      if (!hasAnyXp && parsed.behavior) {
        parsed.behavior.profile = [];
      }

      console.log('\n[数据校验] XP=' + analysis.weekXp + ', 真实effortStories=' + analysis.effortStories.length + ', 约定=' + analysis.commitmentSummary.length);
      console.log('  AI 生成 effortStories 保留: ' + (parsed.behavior.effortStories || []).length + ' 条');

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