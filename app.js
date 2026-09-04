

/* ===== Script block 1 (original lines 14-16) ===== */



/* ===== Script block 2 (original lines 16-19) ===== */

window.__SEED_DATA__ = null;
// GitHub 版：数据从仓库 data/*.json 读取，无需内嵌种子数据
  


/* ===== Script block 3 (original lines 19-1294) ===== */

/**
 * Yara 成长工作台 - 数据层（GitHub 版）
 * 
 * 数据存储在 GitHub 仓库的 data/*.json 文件中：
 *   - child.json: 个人信息
 *   - calendar.json: 校历
 *   - levels.json: 等级配置
 *   - xpRecords.json: XP 获得记录
 *   - finance.json: 财务数据
 *   - study.json: 学习数据
 *   - config.json: 配置数据
 *   - xpSources.json: XP 来源
 *   - redeemRecords.json: 兑换记录
 * 
 * 读取：从 raw.githubusercontent.com 直接拉取 JSON（无需 Token）
 * 写入：通过 GitHub REST API + Personal Token 写回
 * 
 * Token 存储：localStorage['github_token']
 * 保持与飞书版完全一致的 window.DataStore 接口
 */

const GITHUB_OWNER = 'meramei';
const GITHUB_REPO = 'Yara';
const GITHUB_BRANCH = 'main';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data`;
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data`;

const CACHE_KEY = "yara_growth_data_v13";
const CHILD_CACHE_KEY = "yara_child_profile";
const CALENDAR_CACHE_KEY = "yara_calendar_data";

// ── 缓存清理：删除所有旧版本缓存，确保加载最新数据 ──
(function clearOldCaches() {
  try {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("yara_growth_data_v") === 0 && k !== CACHE_KEY) keys.push(k);
    }
    keys.forEach(function (k) { localStorage.removeItem(k); });
    if (keys.length) console.log("已清理旧缓存:", keys.join(", "));
  } catch (e) { /* ignore */ }
})();

let cachedData = null;
let loadPromise = null;

// ── GitHub 工具函数 ──

function getGithubToken() {
  try { return localStorage.getItem('github_token') || ''; }
  catch (e) { return ''; }
}

function hasGithubToken() {
  return !!getGithubToken();
}

function setGithubToken(token) {
  try { localStorage.setItem('github_token', token); } catch (e) {}
}

// 从 GitHub raw 读取 JSON 文件
function fetchRawJSON(filename, opts) {
  // 优先从 data/ 目录读取（GitHub Pages 上 data/ 也在仓库中，同域访问更快）
  // 失败时回退到 raw.githubusercontent.com
  // opts 支持: { cache: 'no-store' } 强制跳过缓存（增删改后必须这么做）
  const options = opts || {};
  return fetch(`data/${filename}`, options)
    .then(resp => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} for data/${filename}`);
      return resp.json();
    })
    .catch(() => {
      const url = `${GITHUB_RAW_BASE}/${filename}`;
      return fetch(url, options).then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
        return resp.json();
      });
    });
}

// 获取文件 SHA（用于更新）——为兼容保留，但写入统一走 DR
function getFileSHA(path) {
  const token = getGithubToken();
  if (!token) return Promise.resolve(null);
  return fetch(`${GITHUB_API_BASE}/${path}`, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github.v3+json',
    },
  })
    .then(resp => {
      if (!resp.ok) {
        if (resp.status === 404) return null;
        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      }
      return resp.json();
    })
    .then(data => data && data.sha ? data.sha : null);
}

// ── 本地模式探测（本地测试服务器 /api/ping，结果缓存）──
let _localModeChecked = false;
let _localMode = false;
function isLocalMode() {
  if (_localModeChecked) return Promise.resolve(_localMode);
  return fetch('/api/ping', { method: 'GET' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { _localMode = !!(d && d.ok); _localModeChecked = true; return _localMode; })
    .catch(() => { _localMode = false; _localModeChecked = true; return false; });
}

// 统一写入出口：委托 data-relations.js 的 DR.writeDataFile（本地优先，回退 GitHub），消除重复实现
function writeGithubFile(path, content, message) {
  if (typeof window.DataRelations === 'object' && window.DataRelations.writeDataFile) {
    return window.DataRelations.writeDataFile(path, content, message);
  }
  // 兜底：DR 未加载时复用本地/远程写入
  return isLocalMode().then(local => {
    if (local) {
      return fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content, message: message || ('更新数据: ' + path) }),
      }).then(resp => {
        if (!resp.ok) throw new Error('本地写入失败: ' + resp.status);
        return resp.json();
      });
    }
    return writeGithubFileRemote(path, content, message);
  });
}

// 远程写入（GitHub REST API，需 Token）
function writeGithubFileRemote(path, content, message) {
  const token = getGithubToken();
  if (!token) {
    return Promise.reject(new Error('请先设置 GitHub Token'));
  }
  return getFileSHA(path).then(sha => {
    const body = {
      message: message || ('更新数据: ' + path),
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      branch: GITHUB_BRANCH,
    };
    if (sha) body.sha = sha;

    return fetch(`${GITHUB_API_BASE}/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  })
    .then(resp => {
      if (!resp.ok) {
        return resp.json().then(err => {
          throw new Error(err.message || 'GitHub API 错误: ' + resp.status);
        });
      }
      return resp.json();
    });
}

// ── 数据加载 ──

// 数据版本号计数器：每次写入操作递增，后台刷新据此判断数据是否已被写入更新
let _dataGen = 0;

// 加载完整 dashboard 数据
async function loadData() {
  if (cachedData) return cachedData;

  // 优先返回 localStorage 缓存，避免每次都要等网络请求
  if (!loadPromise) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.child) {
          cachedData = parsed;
          // 后台刷新数据（不阻塞渲染）
          setTimeout(() => {
            _refreshDataInBackground().catch(() => {});
          }, 0);
          return cachedData;
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // 并行加载所有数据文件（fetchRawJSON 优先本地 data/，失败回退 GitHub）
      const data = await _fetchAllData();
      if (data) {
        cachedData = data;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData)); } catch (e) {}
        return cachedData;
      }
      throw new Error('_fetchAllData 返回空');
    } catch (err) {
      console.warn('数据加载失败，尝试 localStorage 缓存:', err.message);
      // 回退到 localStorage 缓存
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          cachedData = JSON.parse(raw);
          const savedChild = loadChildData();
          if (savedChild && cachedData.child) {
            cachedData.child = mergeChildData(cachedData.child, savedChild);
          }
          console.log('✓ 使用 localStorage 缓存数据');
          return cachedData;
        }
      } catch (e) { /* ignore */ }
      // 最后回退：空数据
      console.warn('⚠ 无可用数据源，使用空数据');
      cachedData = getEmptyData();
      return cachedData;
    }
  })();

  return loadPromise;
}

// 纯网络加载：绕过缓存，1 个请求加载 all.json（比 12 个并行请求更快，避免浏览器连接限制）
async function _fetchAllData() {
  // 优先加载合并后的 all.json（1个请求代替12个，避免浏览器6连接限制导致的排队）
  try {
    const resp = await fetch('data/all.json?_=' + Date.now());
    if (resp.ok) {
      const all = await resp.json();
      // ⚠️ all.json 是上传时生成的合并快照；任务规则若在运行中用 settings 面板新增/编辑/删除，
      //   只写进了权威的 config.json，all.json 不会实时更新。
      //   因此这里用 config.json 覆盖 all.json 中的 config 片段，保证打卡弹窗/能量星球读到最新任务规则。
      try {
        const cfgResp = await fetch('data/config.json?_=' + Date.now(), { cache: 'no-store' });
        if (cfgResp.ok) {
          const cfgData = await cfgResp.json();
          if (cfgData && typeof cfgData === 'object' && cfgData.xpRules !== undefined) {
            all.config = cfgData;
          }
        }
      } catch (e) { /* 覆盖失败则沿用 all.json 的 config，不影响主流程 */ }
      // ⚠️ 同理：运行期新增/通过 XP 记录、录入成绩/期末评价，都只写入权威的
      //   xpRecords.json / study.json，all.json 快照不会实时更新。
      //   因此这里也用权威文件覆盖 all.json 中对应片段，保证成绩/期末成绩/最新待通过记录实时可见。
      try {
        const [stResp, xpResp] = await Promise.all([
          fetch('data/study.json?_=' + Date.now(), { cache: 'no-store' }),
          fetch('data/xpRecords.json?_=' + Date.now(), { cache: 'no-store' })
        ]);
        if (stResp.ok) {
          const studyData = await stResp.json();
          if (studyData && typeof studyData === 'object') all.study = studyData;
        }
        if (xpResp.ok) {
          const xpData = await xpResp.json();
          if (Array.isArray(xpData)) all.xpRecords = xpData;
        }
      } catch (e) { /* 覆盖失败则沿用 all.json 的快照，不影响主流程 */ }
      const dashboard = buildDashboard(
        all.child || {}, all.calendar || [], all.levels || [],
        all.xpRecords || [], all.finance || null, all.study || null,
        all.config || null, all.xpSources || [], all.redeemRecords || [], all.diaryEntries || [],
        all.aiWeeklyReports || [], all.familyMeetings || []
      );
      return dashboard;
    }
  } catch (e) { /* fallback to individual files */ }

  const [child, calendar, levels, xpRecords, finance, study, config, xpSources, redeemRecords, diaryEntries, aiWeeklyReports, familyMeetings] =
    await Promise.all([
      fetchRawJSON('child.json').catch(() => null),
      fetchRawJSON('calendar.json').catch(() => []),
      fetchRawJSON('levels.json').catch(() => []),
      fetchRawJSON('xpRecords.json').catch(() => []),
      fetchRawJSON('finance.json').catch(() => null),
      fetchRawJSON('study.json').catch(() => null),
      fetchRawJSON('config.json').catch(() => null),
      fetchRawJSON('xpSources.json').catch(() => []),
      fetchRawJSON('redeemRecords.json').catch(() => []),
      fetchRawJSON('diaryEntries.json').catch(() => []),
      fetchRawJSON('aiWeeklyReports.json').catch(() => []),
      fetchRawJSON('familyMeetings.json').catch(() => []),
    ]);

  const dashboard = buildDashboard(
    child || {}, calendar || [], levels || [],
    xpRecords || [], finance || null, study || null,
    config || null, xpSources || [], redeemRecords || [], diaryEntries || [],
    aiWeeklyReports || [], familyMeetings || []
  );
  return dashboard;
}

// 后台静默刷新：从 GitHub 拉取最新数据，不阻塞 UI
async function _backgroundRefresh() {
  // 简化版：直接复用 loadData 的缓存
  if (window.__dataCache) {
    Object.assign(window.__dataCache, await loadData());
  } else {
    window.__dataCache = await loadData();
  }
  // 数据刷新完成后，通知 boot() 注册的监听器重渲染当前视图
  window.dispatchEvent(new CustomEvent("yara-data-refreshed"));
}

// 后台静默刷新（缓存已返回后）：强制执行网络请求，更新缓存并触发重绘
async function _refreshDataInBackground() {
  try {
    // 如果本地缓存是最近写入的（如刚提交作业），说明本地数据比 GitHub 更新，
    // 跳过刷新，避免用 CDN 旧数据覆盖本地新数据。
    // 后台刷新只用于"冷启动时拉取最新数据"，不应用来覆盖用户刚操作完的缓存。
    if (cachedData && cachedData._cachedAt && Date.now() - cachedData._cachedAt < 60000) {
      console.log('后台刷新跳过：本地缓存数据较新 (_cachedAt=' + new Date(cachedData._cachedAt).toISOString() + ')');
      return;
    }
    const data = await _fetchAllData();
    if (data) {
      // 保留本地缓存的 _cachedAt（如果存在），用于后续判断
      if (cachedData && cachedData._cachedAt) {
        data._cachedAt = cachedData._cachedAt;
      }
      // 合并：对于同时存在于本地缓存和 GitHub 的数据，以本地缓存为准（因为本地缓存是用户操作后的最新状态）
      if (cachedData && cachedData.study && cachedData.study.allHomework) {
        _mergeHomeworkData(data, cachedData);
      }
      cachedData = data;
      _persistCache();
      window.dispatchEvent(new CustomEvent("yara-data-refreshed"));
    }
  } catch (e) {
    console.warn('后台刷新失败，保留缓存数据:', e.message);
  }
}

// 合并作业数据：以本地缓存为准，将 GitHub 上不存在的作业记录补充进来
function _mergeHomeworkData(target, source) {
  try {
    const localHw = source.study?.allHomework || [];
    const targetHw = target.study?.allHomework || [];
    if (!target.study) target.study = {};
    if (!target.study.allHomework) target.study.allHomework = [];

    for (let gi = 0; gi < localHw.length; gi++) {
      const localGroup = localHw[gi];
      if (!localGroup || !Array.isArray(localGroup.items)) continue;
      for (let ii = 0; ii < localGroup.items.length; ii++) {
        const localItem = localGroup.items[ii];
        if (!localItem || !localItem.id) continue;
        // 在目标中查找同 id 的作业
        let foundInTarget = false;
        for (const targetGroup of targetHw) {
          if (targetGroup && Array.isArray(targetGroup.items)) {
            const targetIdx = targetGroup.items.findIndex(r => r && r.id === localItem.id);
            if (targetIdx >= 0) {
              // 以本地缓存为准（本地是用户操作后的最新状态）
              Object.assign(targetGroup.items[targetIdx], localItem);
              foundInTarget = true;
              break;
            }
          }
        }
        // 如果目标中不存在，追加到第一个分组
        if (!foundInTarget && targetHw.length > 0 && Array.isArray(targetHw[0].items)) {
          targetHw[0].items.push(localItem);
        }
      }
    }
  } catch (e) {
    console.warn('后台刷新-合并作业数据失败:', e.message);
  }
}

// 数据版本号，用于视图缓存：每次数据刷新时递增，渲染函数凭此判断是否需要重绘
let __dataVersion = 0;
// 记录每个视图最后渲染时的数据版本号
const __viewRendered = {};
function refreshData(localOnly) {
  __dataVersion++;
  if (localOnly && cachedData) {
    // 写操作已更新本地缓存，无需重新从 GitHub 拉取
    _persistCache();
    return Promise.resolve(cachedData);
  }
  cachedData = null;
  loadPromise = null;
  // 清除 localStorage 缓存，使下次 loadData 强制走网络加载 _fetchAllData
  //（_fetchAllData 中会用权威 config.json 覆盖 all.json 快照，保证打卡弹窗读到最新任务规则）
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  return loadData();
}

// ── 构建 dashboard 数据结构（与 server.js 的 buildDashboard 对应） ──

function buildDashboard(child, calendar, levels, xpRecords, finance, study, config, xpSources, redeemRecords, diaryEntries, aiWeeklyReports, familyMeetings) {
  // 计算总 XP
  const verifiedXp = xpRecords.filter(r => r.reviewStatus === '已通过');
  const totalXP = verifiedXp.reduce((sum, r) => sum + (Number(r.xp) || 0), 0);
  const pendingCount = xpRecords.filter(r => r.reviewStatus === '待确认' && r._hasValidName !== false).length;

  // 等级处理
  const processedLevels = processLevels(levels, totalXP);

  // 计算当前等级
  let currentLevelIndex = 0;
  for (let i = processedLevels.length - 1; i >= 0; i--) {
    if (totalXP >= processedLevels[i].xp) {
      currentLevelIndex = i;
      break;
    }
  }
  const currentLevel = processedLevels[currentLevelIndex] || processedLevels[0] || {
    name: '萌新', levelNum: 'Lv.1', badgeClass: 'bronze', themeColor: '#CD7F32', xp: 0
  };
  const nextLevel = processedLevels[currentLevelIndex + 1] || null;
  const xpToNextLevel = nextLevel ? nextLevel.xp - totalXP : 0;
  const levelProgress = nextLevel
    ? Math.min(100, Math.round(((totalXP - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100))
    : 100;

  // 学习数据
  const processedStudy = processStudy(study, child);

  // 财务数据
  const processedFinance = processFinance(finance);

  // 配置数据
  const processedConfig = processConfig(config);

  return {
    child: child || {},
    calendar: calendar || [],
    currentXP: totalXP,
    pendingCount: pendingCount,
    currentLevel: {
      name: currentLevel.name || '',
      levelNum: currentLevel.levelNum || 'Lv.1',
      badgeClass: currentLevel.badgeClass || 'bronze',
      themeColor: currentLevel.themeColor || '#CD7F32',
      xp: currentLevel.xp || 0,
    },
    nextLevel: nextLevel ? {
      name: nextLevel.name,
      levelNum: nextLevel.levelNum,
      xp: nextLevel.xp,
      xpToNext: xpToNextLevel,
    } : null,
    levelProgress: levelProgress,
    levels: processedLevels,
    redeemRecords: redeemRecords || [],
    xpSources: xpSources || [],
    xpRecords: xpRecords || [],
    recentRecords: (xpRecords || []).filter(r => r._hasValidName !== false).map(r => ({
      id: r.id,
      title: r.title,
      value: '+' + r.xp + ' XP',
      xp: r.xp,
      time: r.date,
      status: r.reviewStatus === '待确认' ? 'pending' : r.reviewStatus === '已通过' ? 'verified' : 'returned',
      type: r.xpCategory,
      taskCategory: r.taskCategory,
      taskName: r.taskName,
      description: r.description,
      returnReason: r.returnReason,
      commitmentBonus: !!r.commitmentBonus,
    })),
    study: processedStudy,
    finance: processedFinance,
    config: processedConfig,
    diaryEntries: diaryEntries || [],
    aiWeeklyReports: aiWeeklyReports || [],
    familyMeetings: familyMeetings || [],
  };
}

function processLevels(levels, totalXP) {
  if (!levels || !Array.isArray(levels)) return [];
  const LEVEL_BADGES = [
    { badgeClass: 'bronze', themeColor: '#CD7F32' },
    { badgeClass: 'silver', themeColor: '#C0C0C0' },
    { badgeClass: 'gold', themeColor: '#FFD700' },
    { badgeClass: 'platinum', themeColor: '#E5E4E2' },
    { badgeClass: 'diamond', themeColor: '#B9F2FF' },
    { badgeClass: 'master', themeColor: '#9966CC' },
    { badgeClass: 'legendary', themeColor: '#FF6B6B' },
    { badgeClass: 'mythic', themeColor: '#FFD700' },
    { badgeClass: 'divine', themeColor: '#FFE4B5' },
  ];
  return levels.map((r, i) => {
    const badge = LEVEL_BADGES[i] || LEVEL_BADGES[LEVEL_BADGES.length - 1];
    const isUnlocked = totalXP >= (r.xp || 0);
    const privs = (r.privileges || []).map(p => ({
      icon: p.icon || 'gift',
      name: p.name || '',
      description: p.description || '',
      unlocked: isUnlocked,
      id: p.id || 'priv_' + (Math.random() * 10000 | 0),
      redeemed: !!p.redeemed,
      redeemedAt: p.redeemedAt || '',
      redeemedDate: p.redeemedDate || '',
    }));
    return {
      id: r.id || 'level_' + i,
      name: r.name || '',
      levelNum: r.levelNum || 'Lv.' + (i + 1),
      level: r.level || (i + 1),
      xp: r.xp || 0,
      badgeClass: r.badgeClass || badge.badgeClass,
      themeColor: r.themeColor || badge.themeColor,
      privileges: privs,
      privilegeCount: privs.length,
      description: r.description || '',
    };
  });
}

function processStudy(study, child) {
  if (!study) {
    return {
      subjects: [],
      homework: { total: 0, done: 0, todayTotal: 0, todayDone: 0 },
      recentAssignments: [],
      allHomework: [],
      examRecords: [],
      evaluations: [],
      strengthsAnalysis: {},
      semesterAnalysis: { semesters: [], overallSummary: '' },
    };
  }
  return {
    subjects: study.subjects || [],
    homework: study.homework || { total: 0, done: 0, todayTotal: 0, todayDone: 0 },
    recentAssignments: study.recentAssignments || [],
    allHomework: study.allHomework || [],
    examRecords: study.examRecords || [],
    evaluations: study.evaluations || [],
    strengthsAnalysis: study.strengthsAnalysis || {},
    semesterAnalysis: study.semesterAnalysis || { semesters: [], overallSummary: '' },
  };
}

function processFinance(finance) {
  if (!finance) {
    return {
      totalAssets: 0,
      accounts: [
        { key: 'wealth', name: '财富增值账户', balance: 0, goal: null, goalTarget: null },
        { key: 'free', name: '自由基金账户', balance: 0, goal: null, goalTarget: null },
      ],
      recentTransactions: [],
    };
  }
  return {
    totalAssets: finance.totalAssets || 0,
    accounts: finance.accounts || [
      { key: 'wealth', name: '财富增值账户', balance: 0, goal: null, goalTarget: null },
      { key: 'free', name: '自由基金账户', balance: 0, goal: null, goalTarget: null },
    ],
    recentTransactions: (finance.recentTransactions || []).map(tx => ({
      id: tx.id || '',
      date: tx.date || '',
      type: tx.type || (tx.rawAmount >= 0 ? 'income' : 'expense'),
      amount: Math.abs(tx.amount || tx.rawAmount || 0),
      rawAmount: tx.rawAmount || tx.amount || 0,
      category: tx.category || tx.description || '',
      account: tx.account || (tx.accountType === '自由基金账户' ? 'free' : 'wealth'),
      accountType: tx.accountType || '财富增值账户',
      description: tx.description || '',
      worthIt: tx.worthIt || '',
      reason: tx.reason || '',
      suggestion: tx.suggestion || '',
      paymentMethod: tx.paymentMethod || '',
    })),
  };
}

function processConfig(config) {
  if (!config) {
    return {
      subjects: [],
      xpRules: {},
      xpRuleList: [],
      abilityModules: {},
    };
  }
  return {
    subjects: config.subjects || [],
    xpRules: config.xpRules || {},
    xpRuleList: config.xpRuleList || [],
    abilityModules: config.abilityModules || {},
  };
}

// ── 工具函数 ──

function mergeChildData(base, override) {
  const merged = { ...base };
  if (override && typeof override === 'object') {
    for (const k of Object.keys(override)) {
      const v = override[k];
      if (v !== undefined && v !== null && v !== '') {
        merged[k] = v;
      }
    }
  }
  return merged;
}

// 判断一个 XP 任务是否为"自动/系统"类型，不应出现在主动打卡入口
function isAutoTask(t) {
  const d = String(t.description || "");
  const n = String(t.name || "");
  const m = String(t.method || "");
  // 自动发放（作业完成自动加分、财务自动积分）不在此展示
  // 认真投入绑定到作业完成确认，不单独展示；财务能力分析自动按支出记录生成，不展示
  // 写日记有独立的日记弹窗入口，不在打卡列表展示
  return m.indexOf("自动") >= 0 || d.indexOf("自动发放") >= 0 || n.indexOf("作业·") === 0
    || n.indexOf("认真投入") >= 0 || n === "财务能力分析" || n === "财务能力分析（复盘）" || n.indexOf("写日记") >= 0;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// 把 Date 对象格式化为 YYYY-MM-DD 字符串（用于日期比较）
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function generateId(prefix) {
  return (prefix || 'rec_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getEmptyData() {
  return {
    child: { name: '', birthday: '', gender: '', grade: '', school: '', className: '', studentId: '', avatar: '', motto: '' },
    currentXP: 0,
    pendingCount: 0,
    currentLevel: { name: '萌新', levelNum: 'Lv.1', badgeClass: 'bronze', themeColor: '#CD7F32', xp: 0 },
    nextLevel: { name: '青铜', levelNum: 'Lv.2', xp: 800, xpToNext: 800 },
    levelProgress: 0,
    levels: [],
    redeemRecords: [],
    xpSources: [],
    xpRecords: [],
    recentRecords: [],
    study: {
      subjects: [],
      homework: { total: 0, done: 0, todayTotal: 0, todayDone: 0 },
      recentAssignments: [],
      allHomework: [],
      examRecords: [],
      evaluations: [],
      strengthsAnalysis: {},
      semesterAnalysis: { semesters: [], overallSummary: '' },
    },
    finance: {
      totalAssets: 0,
      accounts: [
        { key: 'wealth', name: '财富增值账户', balance: 0 },
        { key: 'free', name: '自由基金账户', balance: 0 },
      ],
      recentTransactions: [],
    },
    config: {
      subjects: [],
      xpRules: {},
      xpRuleList: [],
      abilityModules: {},
    },
    diaryEntries: [],
  };
}

// ── 个人信息存取 ──

function saveChildData(child) {
  try {
    localStorage.setItem(CHILD_CACHE_KEY, JSON.stringify(child));
    if (cachedData) {
      cachedData.child = { ...cachedData.child, ...child };
    }
  } catch (e) {
    console.error('保存 child 缓存失败:', e);
  }
  // 同步写入 GitHub
  writeGithubFile('child.json', { ...(cachedData?.child || {}), ...child }, '更新个人信息')
    .catch(err => console.error('同步个人信息到 GitHub 失败:', err));
  return true;
}

function loadChildData() {
  if (cachedData && cachedData.child) {
    return cachedData.child;
  }
  try {
    const raw = localStorage.getItem(CHILD_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function updateChildData(child) {
  _dataGen++;
  const updated = { ...(cachedData?.child || {}), ...child };
  await writeGithubFile('child.json', updated, '更新个人信息');
  saveChildData(child);
  if (cachedData && cachedData.child) {
    Object.assign(cachedData.child, child);
  }
}

// ── 校历数据存取 ──

function getDefaultCalendarData() {
  return [
    {
      academicYear: "2026-2027", grade: "四年级",
      semester1: { name: "第一学期", shortName: "上", startDate: "2026-09-01", midTermStart: "2026-11-02", finalExamStart: "2027-01-25", winterBreakStart: "2027-01-31", teachingWeeks: 22 },
      semester2: { name: "第二学期", shortName: "下", startDate: "2027-03-01", midTermStart: "2027-05-03", finalExamStart: "2027-07-05", summerBreakStart: "2027-07-12", teachingWeeks: 19 },
    },
  ];
}


function loadCalendarData() {
  if (cachedData && Array.isArray(cachedData.calendar) && cachedData.calendar.length > 0) {
    return cachedData.calendar;
  }
  try {
    const raw = localStorage.getItem(CALENDAR_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) { console.warn('读取校历缓存失败:', e); }
  return getDefaultCalendarData();
}

// ── 写入操作（通过 GitHub API） ──

// 并发安全的 XP 记录合并写：以线上最新为基准，按 id 去重插入新记录。
// 优先走 data-relations.js 的 writeMerged（读-改-写 merge-on-conflict），
// 未加载时回退到旧的整文件覆盖写（仅极端兜底，不保证并发安全）。
function writeXpMerged(newRecord) {
  return writeXpMergedBase(function (latest) {
    // latest 为线上最新 xpRecords 数组（可能为 null/非数组）
    var base = Array.isArray(latest) ? latest.slice() : [];
    // 若同 id 已存在（理论上极难发生，id 为时间戳+随机数），用新记录替换
    var idx = base.findIndex(function (r) { return r && r.id === newRecord.id; });
    if (idx >= 0) base.splice(idx, 1);
    return [newRecord].concat(base);
  }, '新增 XP 记录');
}

// 并发安全的 XP 记录单条更新：以线上最新为基准，只修改指定 id 的记录，避免整包覆盖丢失他人新增。
function writeXpMergedRecord(recordId, updateData) {
  return writeXpMergedBase(function (latest) {
    var base = Array.isArray(latest) ? latest.slice() : [];
    var idx = base.findIndex(function (r) { return r && r.id === recordId; });
    if (idx >= 0) base[idx] = Object.assign({}, base[idx], updateData);
    return base; // 未找到则原样返回，不做无谓写入
  }, '更新 XP 记录');
}

// 共用 DR.writeMerged 入口（本地模式 / 串行队列由 DR 内部处理）
function writeXpMergedBase(mergeFn, msg) {
  if (typeof window !== 'undefined' && window.DataRelations && typeof window.DataRelations.writeMerged === 'function') {
    return window.DataRelations.writeMerged('xpRecords.json', msg, mergeFn);
  }
  // 兜底：DR 未加载时回退到覆盖写（以当前缓存为基准）
  const currentRecords = Array.isArray(cachedData && cachedData.xpRecords) ? cachedData.xpRecords : [];
  return writeGithubFile('xpRecords.json', mergeFn(currentRecords), msg);
}

// 新增 XP 获得记录
async function addXpRecord(record) {
  _dataGen++;
  const recordId = generateId('xp_');
  const newRecord = {
    id: recordId,
    domain: 'XP',
    type: 'XP获得',
    title: record.taskName || record.title || '',
    taskName: record.taskName || record.title || '',
    taskCategory: record.xpCategory || record.type || '',
    date: record.date || todayStr(),
    datetime: new Date().toISOString().slice(0, 19).replace('T', ' '),
    xp: Number(record.xp) || 0,
    baseXp: Number(record.baseXp) || 0,
    commitmentBonus: !!record.commitmentBonus,
    xpCategory: record.xpCategory || record.type || '',
    reviewStatus: record.status === 'verified' ? '已通过' : record.status === 'returned' ? '已退回' : '待确认',
    returnReason: record.returnReason || '',
    description: record.description || '',
    _hasValidName: true,
  };
  // ★ 并发安全写入：以「线上最新」为基准，按 id 去重把新记录合并进去。
  //   避免整文件覆盖导致多端并发时互相覆盖 / GitHub SHA does not match。
  await writeXpMerged(newRecord);
  // 增量更新缓存
  _addToCache('xpRecords', newRecord);
  _addToCache('recentRecords', {
    id: recordId,
    title: newRecord.title,
    value: '+' + newRecord.xp + ' XP',
    xp: newRecord.xp,
    time: newRecord.date,
    status: newRecord.reviewStatus === '已通过' ? 'verified' : newRecord.reviewStatus === '已退回' ? 'returned' : 'pending',
    type: newRecord.xpCategory,
    taskCategory: newRecord.taskCategory,
    taskName: newRecord.taskName,
    description: newRecord.description,
    returnReason: newRecord.returnReason,
  });
  _persistCache();
  // ★ 如果是支出且填写了"值得/不值得/一般"，每笔自动生成独立的财务能力分析 XP 记录
  if (record.type === 'expense' && record.worthIt) {
    const _financeRule = (cachedData?.config?.xpRuleList || []).find(function(r){return (r.name||"").indexOf("财务能力分析")>=0});
    const _perRecXp = (_financeRule && Number(_financeRule.xp)) ? Number(_financeRule.xp) : 5;
    await addXpRecord({
      taskName: "财务能力分析",
      description: `财务分析：${record.description || ''}（${record.worthIt}）`,
      date: record.date || todayStr(),
      status: "verified",
      xp: _perRecXp,
      xpCategory: "能力成长",
    });
  }
  return recordId;
}

// ── 日记本数据存取（第 10 个数据文件 diaryEntries.json，只存 GitHub，不接飞书同步） ──

// 读取日记列表（优先缓存，但缓存为空时从 GitHub 重新拉取，避免后台刷新误覆盖导致数据丢失）
async function loadDiaryEntries() {
  if (cachedData && Array.isArray(cachedData.diaryEntries) && cachedData.diaryEntries.length > 0) {
    return cachedData.diaryEntries;
  }
  // 缓存为空时直接从 GitHub 拉取，不信任缓存中的空数组
  const raw = await fetchRawJSON('diaryEntries.json').catch(() => []);
  if (cachedData && Array.isArray(raw) && raw.length > 0) {
    cachedData.diaryEntries = raw;
  }
  return raw;
}

// 写入整份日记列表
async function saveDiaryEntries(entries) {
  _dataGen++;
  const list = Array.isArray(entries) ? entries : [];
  await writeGithubFile('diaryEntries.json', list, '更新日记本');
  if (cachedData) cachedData.diaryEntries = list;
  _persistCache();
  return list;
}

// 新增/覆盖一篇日记：同一天重复写则覆盖当天那一篇（不新增）
// entry: { date, mood, content, completeFour, completeFeel, hits, xp }
async function addDiaryEntry(entry) {
  _dataGen++;
  const date = entry.date || todayStr();
  const current = await loadDiaryEntries();
  const list = Array.isArray(current) ? current.slice() : [];
  const idx = list.findIndex(d => d.date === date);
  const saved = {
    id: entry.id || generateId('diary_'),
    date,
    mood: entry.mood || '',
    content: entry.content || '',
    completeFour: !!entry.completeFour,
    completeFeel: !!entry.completeFeel,
    hits: entry.hits || [],
    xp: entry.xp || 0,
    createdAt: entry.createdAt || new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = saved; else list.unshift(saved);
  await saveDiaryEntries(list);
  return saved;
}

// ── 家庭会议记录存取 ──

// 读取家庭会议列表（优先缓存，缓存为空时从 GitHub 拉取）
/* ═══════════ 本周约定统一口径 ═══════════
   本周 = 今天所在的 ISO 周号（与 scripts/generate-weekly-report.js 的 weekNumber 同源）。
   约定只认"周号 == 本周"的那次家庭会议；不是本周的一律不算"本周约定"。 */
function isoWeekNumber(dateStr) {
  var t = new Date(dateStr + 'T00:00:00');
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  var w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
function currentWeekNumber() {
  var now = new Date();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return isoWeekNumber(now.getFullYear() + '-' + m + '-' + d);
}
function meetingByWeek(fmList, wn) {
  var list = fmList || [];
  for (var i = 0; i < list.length; i++) {
    var mt = list[i];
    if (mt.weekNumber === wn && mt.commitments && mt.commitments.length) return mt;
  }
  return null;
}
// 本周约定会议：严格取"周号==本周"的会议，否则返回 null（展示"去定一个约定"）
function currentWeekMeeting(fmList) { return meetingByWeek(fmList, currentWeekNumber()); }
// 上周约定会议：周号 == 本周-1（用于周会"上周约定"回顾）
function prevWeekMeeting(fmList) { return meetingByWeek(fmList, currentWeekNumber() - 1); }

async function loadFamilyMeetings() {
  if (cachedData && Array.isArray(cachedData.familyMeetings) && cachedData.familyMeetings.length > 0) {
    return cachedData.familyMeetings;
  }
  const raw = await fetchRawJSON('familyMeetings.json').catch(() => []);
  if (cachedData && Array.isArray(raw) && raw.length > 0) {
    cachedData.familyMeetings = raw;
  }
  return raw;
}

// 写入整份家庭会议列表
async function saveFamilyMeetings(meetings) {
  _dataGen++;
  const list = Array.isArray(meetings) ? meetings : [];
  await writeGithubFile('familyMeetings.json', list, '更新家庭会议记录');
  if (cachedData) cachedData.familyMeetings = list;
  _persistCache();
  return list;
}

// 追加一条家庭会议记录
async function addFamilyMeeting(meeting) {
  _dataGen++;
  const current = await loadFamilyMeetings();
  const list = Array.isArray(current) ? current.slice() : [];
  const saved = {
    id: meeting.id || generateId('fm_'),
    weekNumber: meeting.weekNumber || 0,
    year: meeting.year || new Date().getFullYear(),
    date: meeting.date || todayStr(),
    summary: meeting.summary || '',
    discussion: meeting.discussion || '',
    goal: meeting.goal || '',
    goalCompleted: !!meeting.goalCompleted,
    previousGoal: meeting.previousGoal || '',
    previousGoalCompleted: !!meeting.previousGoalCompleted,
    commitments: meeting.commitments || [],
    previousCommitments: meeting.previousCommitments || [],
    createdAt: meeting.createdAt || new Date().toISOString(),
  };
  list.unshift(saved);
  await saveFamilyMeetings(list);
  return saved;
}

// ── AI 式智能分析：从自由正文判断是否自然写出时间/地点/人物/事件/感受 ──
const DIARY_TIME_WORDS = ["今天","昨天","前天","早上","早晨","清晨","上午","中午","下午","傍晚","晚上","夜里","白天","放学后","下课","午休","睡前","回家后","周末","星期","假期","暑假","寒假","刚才","时候","然后","后来","之后","现在","刚刚","一会儿","每天","有一天","有一次","首先","接着","最后","那时","这时候","那几天","每天"];
const DIARY_PLACE_WORDS = ["在","公园","操场","教室","学校","家里","家","超市","商场","广场","图书馆","医院","房间","阳台","厨房","外面","楼下","小区","车上","公交","地铁","饭店","餐厅","书店","游乐园","动物园","海边","山里","老家","奶奶家","外婆家","园","场","站"];
const DIARY_PEOPLE_WORDS = ["爸爸","妈妈","爷爷","奶奶","外公","外婆","同学","朋友","好朋友","老师","弟弟","妹妹","哥哥","姐姐","舅舅","姑姑","叔叔","阿姨","我们","他","她","他们","大家","小伙伴","一起"];
const DIARY_EVENT_WORDS = ["玩","去","做","写","看","吃","跑","跳","游戏","作业","练字","比赛","学","踢","画","唱","读","逛","读书","运动","跑步","骑车","游泳","爬山","野餐","做饭","手工","棋","拼图","乐高","散步","跳绳","打球","上课","参观","旅游","旅行","放风筝","钓鱼","看电影","看电视","玩手机"];
const DIARY_FEEL_WORDS = ["开心","高兴","快乐","难过","伤心","生气","兴奋","紧张","幸福","喜欢","讨厌","棒","累","辛苦","好玩","有趣","舒服","满足","感动","温暖","骄傲","期待","担心","害怕","无聊","失望","舍不得","爱","哭","笑","愉快","惊喜","太好了","真开心","开心极了","棒极了"];

// 分析正文，返回每个要素是否自然出现
function analyzeDiaryElements(content) {
  const empty = { time:false, place:false, people:false, event:false, feel:false, hits:[] };
  const text = (content || "").trim();
  if (!text) return empty;
  const has = (arr) => arr.some(w => text.includes(w));
  const time = has(DIARY_TIME_WORDS);
  const place = has(DIARY_PLACE_WORDS);
  const people = has(DIARY_PEOPLE_WORDS);
  const event = has(DIARY_EVENT_WORDS);
  const feel = has(DIARY_FEEL_WORDS);
  const elementCount = [time, place, people, event].filter(Boolean).length;
  const hits = [];
  if (time) hits.push("时间");
  if (place) hits.push("地点");
  if (people) hits.push("人物");
  if (event) hits.push("事件");
  if (feel) hits.push("感受");
  return { time, place, people, event, feel, hits, completeFour: elementCount >= 3, completeFeel: feel, elementCount };
}

// ── 日记本 UI 渲染与交互 ──

let _diaryMood = "";
let _xpModalPreSelectTask = null;
let _xpModalIsCommit = false; // 标记当前打卡是否由"家庭约定"卡片进入

// 从家庭约定卡点击进入打卡弹窗，预选关联任务
function openXpModalWithTask(taskName) {
  _xpModalPreSelectTask = taskName;
  _xpModalIsCommit = true;
  if (typeof openXpModal === "function") {
    openXpModal();
  } else {
    // openXpModal 可能是嵌套函数，通过事件触发
    var btn = document.querySelector('[onclick*="openXpModal"]');
    if (btn) btn.click();
  }
}

function openDiaryModal() {
  _diaryMood = "";
  const content = document.getElementById("diaryContent");
  if (content) content.value = "";
  document.querySelectorAll("#diaryMoods button").forEach(b => b.classList.remove("sel"));
  const otherWrap = document.querySelector(".diary-mood-other");
  if (otherWrap) otherWrap.classList.remove("show");
  const otherInput = document.getElementById("diaryMoodOther");
  if (otherInput) otherInput.value = "";
  // 动态读取日记任务XP值，更新提示文案
  const cfg = window.__lastCfg || {};
  const diaryTask = ((cfg.config && cfg.config.xpRules && cfg.config.xpRules["能力成长"]) || []).find(t => t.name === "写日记：写作四要素+感受");
  const diaryXp = diaryTask ? (Number(diaryTask.xp) || 8) : 8;
  const tipEl = document.getElementById("diaryTip");
  if (tipEl) tipEl.textContent = "写完提交后，我会看看你有没有把时间、地点、人物、事件和感受都写出来，写全了 +" + diaryXp + " XP ✨";
  const m = document.getElementById("diaryModalPage");
  if (m) m.classList.add("active");
}

function closeDiaryModal() {
  const m = document.getElementById("diaryModalPage");
  if (m) m.classList.remove("active");
}

function pickDiaryMood(btn) {
  const val = btn.getAttribute("data-mood") || "";
  document.querySelectorAll("#diaryMoods button").forEach(b => b.classList.remove("sel"));
  btn.classList.add("sel");
  const otherWrap = document.querySelector(".diary-mood-other");
  const otherInput = document.getElementById("diaryMoodOther");
  if (val === "other") {
    if (otherWrap) otherWrap.classList.add("show");
    if (otherInput) otherInput.focus();
  } else {
    if (otherWrap) otherWrap.classList.remove("show");
    if (otherInput) otherInput.value = "";
  }
  _diaryMood = val;
}

async function submitDiary() {
  const content = (document.getElementById("diaryContent").value || "").trim();
  // 若选择了"其他"，将自定义文字作为心情（emoji 用 ✏️ 兜底）
  let mood = _diaryMood;
  if (_diaryMood === "other") {
    const otherVal = (document.getElementById("diaryMoodOther").value || "").trim();
    if (!otherVal) { showToast("填一下你的心情吧 ✍️", false); return; }
    mood = "✏️ " + otherVal;
  }
  // 1. 心情必选：未选（含"其他"未填）禁止提交
  if (!mood) { showToast("先选一个今天的心情吧 😊", false); return; }
  // 2. 正文至少 30 字，不足禁止提交
  const contentLen = content.replace(/\s/g, "").length;
  if (contentLen < 30) {
    showToast(`再写点吧，至少 30 个字（现在还差 ${30 - contentLen} 字）✏️`, false);
    return;
  }
  // 智能分析正文，看看有没有自然写出四要素 + 感受
  const analysis = analyzeDiaryElements(content);
  const completeFour = analysis.completeFour;
  const completeFeel = !!mood || analysis.completeFeel;
  const btn = document.querySelector("#diaryModalPage .btn-confirm");
  const original = btn.textContent;
  btn.textContent = "保存中..."; btn.disabled = true;
  try {
    // 1. 保存日记（同日覆盖当天那一篇）
    await DataStore.addDiaryEntry({
      date: todayStr(),
      mood,
      content,
      completeFour,
      completeFeel,
      hits: analysis.hits,
    });
    // 2. 发放 XP（同日去重：当天已有"写日记"记录则不重复发放）
    const cfg = await DataStore.loadData();
    // 读取系统配置的日记 XP 值（config.json 中"写日记：写作四要素+感受"的 xp），不再硬编码
    const diaryTask = ((cfg.config && cfg.config.xpRules && cfg.config.xpRules["能力成长"]) || []).find(t => t.name === "写日记：写作四要素+感受");
    const xp = diaryTask ? (Number(diaryTask.xp) || 8) : 8;
    const already = (cfg.xpRecords || []).find(r =>
      r.taskName === "写日记：写作四要素+感受" && getDateStr(r) === todayStr());
    let awardedXp = 0;
    if (!already) {
      await DataStore.addXpRecord({
        taskName: "写日记：写作四要素+感受",
        xp,
        xpCategory: "能力成长",
        description: (completeFour && completeFeel)
          ? `能量记录（写到了${analysis.hits.join("、")}）`
          : `能量记录（只写到了${(analysis.hits.length ? analysis.hits.join("、") : "很少要素")}）`,
        status: "pending",
        date: todayStr(),
      });
      awardedXp = xp;
    } else {
      // 今天已记过，不再重复加分
      awardedXp = 0;
    }
    await DataStore.refreshData(true);
    closeDiaryModal();
    const all5 = ["时间", "地点", "人物", "事件", "感受"];
    const missing = all5.filter(k => !analysis.hits.includes(k));
    // 阶梯式评分的提示语
    let hint = "";
    if (analysis.hits.length >= 5) hint = "五要素齐全，拿满分！🎉";
    else if (analysis.hits.length >= 4) hint = `就差${missing.join("、")}了，下次写出来拿更高 XP！`;
    else if (missing.length) hint = `下次把${missing.join("、")}也写出来拿更多 XP 哦 ✍️`;
    // 3. 提交成功后明确提示：积分 + 保存成功状态
    if (awardedXp > 0) {
      showToast(`✅ 保存成功！本次 +${awardedXp} XP${hint ? "，" + hint : ""}`, true);
    } else {
      showToast(`✅ 保存成功！今天已记过能量，本次不再加分${hint ? "，" + hint : ""}`, true);
    }
    await renderDiary();
    await renderXp();
    refreshIcons(50);
  } catch (e) {
    console.error("保存能量记录失败:", e);
    const errMsg = (e && e.message) || "";
    // 4. 提交失败明确提示：区分 Token 缺失与其它错误
    if (errMsg.indexOf("Token") >= 0 || errMsg.indexOf("token") >= 0) {
      showTokenRequiredToast();
    } else {
      showToast("✖ 保存失败，请重试", false);
      handleWriteError(e, null);
    }
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
}

// 渲染日记本：统计 + 本周打卡条 + 最近日记卡片 + 查看全部
async function renderDiary() {
  const moduleEl = document.getElementById("diaryModule");
  if (!moduleEl) return;
  let entries = await DataStore.loadDiaryEntries().catch(() => []);
  if (!Array.isArray(entries) || entries.length === 0) {
    const cfg = await DataStore.loadData();
    entries = (cfg.diaryEntries || []).slice();
  }
  entries = entries.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  // 保存主页最近记录数据，供详情弹窗索引
  _diaryHomeEntries = entries;
  const totalCount = entries.length;
  const streak = calcDiaryStreak(entries);
  const bestStreak = calcDiaryBestStreak(entries);
  const totalDiaryXp = entries.reduce((sum, d) => sum + (Number(d.xp) || ((d.completeFour && d.completeFeel) ? 10 : 6)), 0);
  setText("diaryStats", `已写 ${totalCount} 篇 · 连续 ${streak} 天 · 累计 ${totalDiaryXp} XP`);
  setText("dStatCount", totalCount);
  setText("dStatStreak", streak);
  setText("dStatXp", totalDiaryXp);
  setText("dStatBest", bestStreak);
  renderDiaryStrip(entries);

  const tl = document.getElementById("diaryTimeline");
  if (!tl) return;

  if (entries.length === 0) {
    tl.innerHTML = `<div class="diary-empty">
      <div class="diary-empty-icon">📖</div>
      <div class="diary-empty-text">还没有记录，记下第一笔吧 ✨</div>
      <div class="diary-empty-sub">写日记能锻炼写作能力，还能拿 XP 哦</div>
    </div>`;
    const moreBtn = document.getElementById("diaryViewAllBtn");
    if (moreBtn) moreBtn.style.display = "none";
    return;
  }

  // 主页默认显示最近 4 篇，点击"查看全部"打开完整日记墙
  const PREVIEW_COUNT = 4;
  const previewEntries = entries.slice(0, PREVIEW_COUNT);
  const hasMore = entries.length > PREVIEW_COUNT;

  tl.innerHTML = previewEntries.map((d, idx) => renderDiaryCard(d, idx)).join("");

  const moreBtn = document.getElementById("diaryViewAllBtn");
  if (moreBtn) {
    if (hasMore) {
      moreBtn.style.display = "";
      moreBtn.innerHTML = `<i data-lucide="book-open"></i> 查看全部 ${totalCount} 篇日记 →`;
      moreBtn.onclick = () => openDiaryWallModal(entries);
    } else {
      moreBtn.style.display = "none";
    }
  }
  refreshIcons(0);
}

function renderDiaryCard(d, idx) {
  const hits = d.hits || [];
  const fourCount = hits.filter(h => h !== "感受").length;
  const metaFour = d.completeFour
    ? `<span class="dl-tag ok">${fourCount}/4 要素 ✓</span>`
    : `<span class="dl-tag no">${fourCount}/4 要素</span>`;
  const metaFeel = d.completeFeel
    ? `<span class="dl-tag ok">感受 ✓</span>`
    : `<span class="dl-tag no">感受缺</span>`;
  const xp = Number(d.xp) || ((d.completeFour && d.completeFeel) ? 10 : 6);
  const hitsTxt = hits.length ? `<div class="dl-hits">写到：${hits.join(" · ")}</div>` : "";
  const content = d.content || "";
  const isLong = content.length > 60;
  const displayContent = isLong ? content.slice(0, 60) + "…" : content;
  return `<div class="dl-item" data-idx="${idx}" onclick="openDiaryDetailModal(${idx})">
    <div class="dl-head">
      <span class="dl-date">${formatDiaryDate(d.date)}</span>
      <span class="dl-mood" title="${d.moodLabel || d.mood || ''}">${d.mood || "📝"}</span>
    </div>
    ${hitsTxt}
    ${content ? `<div class="dl-text">${escapeHtmlReason(displayContent)}</div>` : ""}
    <div class="dl-foot">
      <div class="dl-tags">${metaFour} ${metaFeel}</div>
      <div class="dl-xp">+${xp} XP</div>
    </div>
  </div>`;
}

// ════════ 日记墙弹窗：查看全部日记，按月分组时间线 ════════
let _diaryWallEntries = [];
let _diaryHomeEntries = [];
function openDiaryWallModal(entries) {
  _diaryWallEntries = entries || [];
  const modal = document.getElementById("diaryWallModal");
  const listEl = document.getElementById("diaryWallList");
  if (!modal || !listEl) return;

  // 按月分组
  const groups = {};
  _diaryWallEntries.forEach(d => {
    const monthKey = (d.date || "").slice(0, 7); // YYYY-MM
    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(d);
  });

  const months = Object.keys(groups).sort().reverse();
  let html = "";
  months.forEach(monthKey => {
    const monthEntries = groups[monthKey];
    const [y, m] = monthKey.split("-");
    const monthXp = monthEntries.reduce((s, d) => s + (Number(d.xp) || ((d.completeFour && d.completeFeel) ? 10 : 6)), 0);
    html += `<div class="dw-month">
      <div class="dw-month-head">
        <span class="dw-month-title">${y}年${parseInt(m,10)}月</span>
        <span class="dw-month-meta">${monthEntries.length} 篇 · +${monthXp} XP</span>
      </div>
      <div class="dw-timeline">
        ${monthEntries.map(d => {
          const day = (d.date || "").slice(8, 10);
          const hits = d.hits || [];
          const fourCount = hits.filter(h => h !== "感受").length;
          const xp = Number(d.xp) || ((d.completeFour && d.completeFeel) ? 10 : 6);
          const content = d.content || "";
          return `<div class="dw-item">
            <div class="dw-dot"></div>
            <div class="dw-day">${parseInt(day,10)}</div>
            <div class="dw-card" onclick="openDiaryDetailModal(${_diaryWallEntries.indexOf(d)})">
              <div class="dw-card-head">
                <span class="dw-mood">${d.mood || "📝"}</span>
                <span class="dw-xp">+${xp} XP</span>
              </div>
              ${content ? `<div class="dw-text">${escapeHtmlReason(content)}</div>` : ""}
              ${hits.length ? `<div class="dw-hits">写到：${hits.join(" · ")}</div>` : ""}
              <div class="dw-tags">
                <span class="dl-tag ${d.completeFour ? 'ok' : 'no'}">${fourCount}/4 要素${d.completeFour ? ' ✓' : ''}</span>
                <span class="dl-tag ${d.completeFeel ? 'ok' : 'no'}">感受${d.completeFeel ? ' ✓' : '缺'}</span>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  });

  listEl.innerHTML = html || `<div class="diary-empty">还没有日记记录</div>`;
  modal.classList.add("active");
  refreshIcons(0);
}

function closeDiaryWallModal() {
  const modal = document.getElementById("diaryWallModal");
  if (modal) modal.classList.remove("active");
}

// ════════ 日记详情弹窗：查看单篇完整内容 ════════
let _diaryDetailEntries = [];
function openDiaryDetailModal(idx) {
  const modal = document.getElementById("diaryDetailModal");
  const body = document.getElementById("diaryDetailBody");
  if (!modal || !body) return;
  // 优先用日记墙数据，否则从主页最近记录取
  let entries = _diaryWallEntries.length ? _diaryWallEntries : _diaryHomeEntries;
  const d = entries[idx];
  if (!d) return;
  const hits = d.hits || [];
  const fourCount = hits.filter(h => h !== "感受").length;
  const xp = Number(d.xp) || ((d.completeFour && d.completeFeel) ? 10 : 6);
  const hitsTxt = hits.length ? `<div class="dd-hits">写到：${hits.map(h => `<span class="dd-hit">${h}</span>`).join("")}</div>` : "";
  const mood = d.mood || "📝";
  // 只有存在文字版心情描述（且与表情不同）时才显示，避免出现两个相同表情
  const moodLabel = d.moodLabel || "";
  const moodLabelHtml = (moodLabel && moodLabel !== mood)
    ? `<span class="dd-mood-label">${escapeHtmlReason(moodLabel)}</span>`
    : "";
  body.innerHTML = `
    <div class="dd-head">
      <div class="dd-date">${formatDiaryDate(d.date)}</div>
      <div class="dd-mood">${mood} ${moodLabelHtml}</div>
    </div>
    ${hitsTxt}
    <div class="dd-content">${escapeHtmlReason(d.content || "（这篇日记没有写内容）")}</div>
    <div class="dd-tags">
      <span class="dl-tag ${d.completeFour ? 'ok' : 'no'}">${fourCount}/4 要素${d.completeFour ? ' ✓' : ''}</span>
      <span class="dl-tag ${d.completeFeel ? 'ok' : 'no'}">感受${d.completeFeel ? ' ✓' : '缺'}</span>
      <span class="dl-tag ok">+${xp} XP</span>
    </div>`;
  modal.classList.add("active");
  refreshIcons(0);
}

function closeDiaryDetailModal() {
  const modal = document.getElementById("diaryDetailModal");
  if (modal) modal.classList.remove("active");
}

// 渲染最近 7 天打卡条（今天倒推 6 天，共 7 个圆点）
function renderDiaryStrip(entries) {
  const strip = document.getElementById("diaryStrip");
  if (!strip) return;
  const doneSet = new Set((entries || []).map(d => d.date));
  const pad = (n) => String(n).padStart(2, "0");
  const todayKey = todayStr();
  let cells = "";
  for (let back = 6; back >= 0; back--) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isDone = doneSet.has(key);
    const isToday = key === todayKey;
    cells += `<span class="d-dot${isDone ? " on" : ""}${isToday ? " today" : ""}">${d.getDate()}</span>`;
  }
  strip.innerHTML = cells;
}

// 计算连续写日记天数（从今天往前数连续有日记的天数）
function calcDiaryStreak(entries) {
  if (!entries || entries.length === 0) return 0;
  const set = new Set(entries.map(d => d.date));
  let streak = 0;
  const d = new Date();
  // 今天没写则从昨天开始数（允许今天还没写时保住连续天数）
  if (!set.has(todayStr())) d.setDate(d.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  while (streak < 90) {
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!set.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// 计算历史最长连续天数
function calcDiaryBestStreak(entries) {
  if (!entries || entries.length === 0) return 0;
  const dates = [...new Set(entries.map(d => d.date))].sort();
  if (dates.length === 0) return 0;
  let best = 1, current = 1;
  const pad = (n) => String(n).padStart(2, "0");
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i-1]);
    const cur = new Date(dates[i]);
    const diff = Math.round((cur - prev) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

// 格式化日记日期：YYYY-MM-DD → 今天/昨天/M月D日
function formatDiaryDate(date) {
  if (!date) return "";
  const today = todayStr();
  if (date === today) return `${date.slice(5).replace("-", "月")}日 · 今天`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  const yest = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  if (date === yest) return `${date.slice(5).replace("-", "月")}日 · 昨天`;
  return `${date.slice(5).replace("-", "月")}日`;
}

// 新增 XP 规则
async function addXpRule(rule) {
  _dataGen++;
  const recordId = generateId('xpr_');
  const newRule = {
    id: recordId,
    name: rule.name,
    category: rule.category || '学习成长',
    xp: Number(rule.xp) || 0,
    method: rule.method || '按次',
    description: rule.description || '',
    _manual: true, // 标记为手动新增，打卡时单独分组展示
  };
  const config = await fetchRawJSON('config.json').catch(() => ({ xpRuleList: [], xpRules: {} }));
  if (!config.xpRuleList) config.xpRuleList = [];
  config.xpRuleList.push(newRule);
  if (!config.xpRules) config.xpRules = {};
  if (!config.xpRules[newRule.category]) config.xpRules[newRule.category] = [];
  config.xpRules[newRule.category].push(newRule);
  await writeGithubFile('config.json', config, '新增 XP 规则');
  _addToCache('config.xpRuleList', newRule);
  _persistCache();
  return recordId;
}

// 新增学习/作业记录
// 优先使用本地内存缓存中的 study（含用户刚录入的数据）：
// 1）省去每次保存前的额外网络读取（保存更快）；2）避免 CDN raw 旧缓存把新数据覆盖。
// 内存缓存不可用时才回退到网络读取。
async function _readStudyBase() {
  if (cachedData && cachedData.study) {
    try { return JSON.parse(JSON.stringify(cachedData.study)); } catch (e) {}
  }
  return fetchRawJSON('study.json', { cache: 'no-store' }).catch(() => ({ allHomework: [], recentAssignments: [], homework: { total: 0, done: 0, todayTotal: 0, todayDone: 0 } }));
}

async function addStudyRecord(record) {
  _dataGen++;
  const recordId = generateId('hw_');
  const entryDate = record.date || todayStr();
  const dueDate = record.dueDate || entryDate;
  const isDone = record.status === 'done';
  const newRecord = {
    id: recordId,
    subject: record.subject,
    title: record.title || record.description || '',
    cleanTitle: record.title || record.description || '',
    shortTitle: record.title || record.description || '',
    description: record.description || record.title || '',
    homeworkType: record.homeworkType || '假期作业',
    module: record.module || '',
    modules: (Array.isArray(record.modules) ? record.modules : (record.modules ? [record.modules] : [])).slice(),
    status: record.status || 'pending',
    submitted: !!record.submitted,
    dueDate: dueDate,
    deadline: dueDate,
    reviewStatus: isDone ? '已通过' : '',
    returnReason: '',
    details: [],
    tags: isDone ? [{ text: '已完成', type: 'good' }] : [],
    progress: isDone ? 100 : 0,
    xp: record.xp || 0,
    errorModule: record.errorModule || '',
    errorModules: record.errorModules || [],
  };
  const study = await _readStudyBase();
  if (!study.allHomework) study.allHomework = [];
  // 按“录入日期”分组写入（与 data-store.js 的 addStudyRecord 保持一致），新作业才能在列表中正常显示
  let group = null;
  for (let gi = 0; gi < study.allHomework.length; gi++) {
    if (study.allHomework[gi] && study.allHomework[gi].date === entryDate) { group = study.allHomework[gi]; break; }
  }
  if (!group) {
    group = { date: entryDate, items: [] };
    study.allHomework.unshift(group);
  }
  group.items = (group.items || []).slice();
  group.items.push(newRecord);
  if (!study.recentAssignments) study.recentAssignments = [];
  study.recentAssignments.unshift(newRecord);
  // 更新作业统计
  if (!study.homework) study.homework = { total: 0, done: 0, todayTotal: 0, todayDone: 0 };
  study.homework.total = (study.homework.total || 0) + 1;
  if (isDone) study.homework.done = (study.homework.done || 0) + 1;
  const today = todayStr();
  if (dueDate && dueDate.startsWith(today.slice(0, 10))) {
    study.homework.todayTotal = (study.homework.todayTotal || 0) + 1;
    if (isDone) study.homework.todayDone = (study.homework.todayDone || 0) + 1;
  }
  await writeGithubFile('study.json', study, '新增作业记录');
  _addToCache('study.allHomework', newRecord);
  _addToCache('study.recentAssignments', newRecord);
  _persistCache();
  return recordId;
}

// 批量新增作业（一次读取→批量追加→单次写回）。避免逐条 fetch+write 导致本地/远端
// 第二次读到旧文件而互相覆盖（修复“拆分多条只录入1条”）。
async function addStudyRecords(records) {
  _dataGen++;
  if (!Array.isArray(records) || records.length === 0) return [];
  const entryDate = records[0].date || todayStr();
  const newRecords = [];
  for (const record of records) {
    const recordId = generateId('hw_');
    const dueDate = record.dueDate || entryDate;
    const isDone = record.status === 'done';
    newRecords.push({
      id: recordId,
      subject: record.subject,
      title: record.title || record.description || '',
      cleanTitle: record.title || record.description || '',
      shortTitle: record.title || record.description || '',
      description: record.description || record.title || '',
      homeworkType: record.homeworkType || '假期作业',
      module: record.module || '',
      modules: (Array.isArray(record.modules) ? record.modules : (record.modules ? [record.modules] : [])).slice(),
      status: record.status || 'pending',
      submitted: !!record.submitted,
      dueDate: dueDate,
      deadline: dueDate,
      reviewStatus: isDone ? '已通过' : '',
      returnReason: '',
      details: [],
      tags: isDone ? [{ text: '已完成', type: 'good' }] : [],
      progress: isDone ? 100 : 0,
      xp: record.xp || 0,
      errorModule: record.errorModule || '',
      errorModules: record.errorModules || [],
    });
  }
  const study = await _readStudyBase();
  if (!study.allHomework) study.allHomework = [];
  // 按“录入日期”分组写入
  let group = null;
  for (let gi = 0; gi < study.allHomework.length; gi++) {
    if (study.allHomework[gi] && study.allHomework[gi].date === entryDate) { group = study.allHomework[gi]; break; }
  }
  if (!group) {
    group = { date: entryDate, items: [] };
    study.allHomework.unshift(group);
  }
  group.items = (group.items || []).slice();
  newRecords.forEach(r => group.items.push(r));
  if (!study.recentAssignments) study.recentAssignments = [];
  newRecords.forEach(r => study.recentAssignments.unshift(r));
  // 更新作业统计
  if (!study.homework) study.homework = { total: 0, done: 0, todayTotal: 0, todayDone: 0 };
  study.homework.total = (study.homework.total || 0) + newRecords.length;
  const doneCount = newRecords.filter(r => r.status === 'done').length;
  if (doneCount > 0) study.homework.done = (study.homework.done || 0) + doneCount;
  const today = todayStr();
  const todayAdded = newRecords.filter(r => (r.dueDate || '').startsWith(today.slice(0, 10))).length;
  if (todayAdded > 0) study.homework.todayTotal = (study.homework.todayTotal || 0) + todayAdded;
  const todayDoneAdded = newRecords.filter(r => r.status === 'done' && (r.dueDate || '').startsWith(today.slice(0, 10))).length;
  if (todayDoneAdded > 0) study.homework.todayDone = (study.homework.todayDone || 0) + todayDoneAdded;
  await writeGithubFile('study.json', study, '批量新增作业记录');
  newRecords.forEach(r => {
    _addToCache('study.allHomework', r);
    _addToCache('study.recentAssignments', r);
  });
  _persistCache();
  return newRecords.map(r => r.id);
}

// 新增成绩记录
async function addScoreRecord(record) {
  _dataGen++;
  const recordId = generateId('score_');
  const newRecord = {
    id: recordId,
    subject: record.subject,
    grade: record.grade || '',
    examType: record.examType || '日常测验',
    errorModule: record.errorModule || '',
    date: record.date || todayStr(),
    description: record.description || '',
    score: record.score != null ? record.score : null,
    semesterLabel: record.semesterLabel || '',
    errorModules: record.errorModules || [],
    // ★ 记分：共几题/对了几题（日常成绩按题数显示正确率），此前被遗漏导致录了不显示
    totalQuestions: record.totalQuestions != null ? (Number(record.totalQuestions) || null) : null,
    correctQuestions: record.correctQuestions != null ? (Number(record.correctQuestions) || null) : null,
    title: record.title || '',
    category: record.category || '',
  };
  const study = await _readStudyBase();
  if (!study.examRecords) study.examRecords = [];
  study.examRecords.unshift(newRecord);
  await writeGithubFile('study.json', study, '新增成绩记录');
  _addToCache('study.examRecords', newRecord);
  _persistCache();
  return recordId;
}

// 新增财务记录
async function addFinanceRecord(record) {
  _dataGen++;
  const recordId = generateId('fin_');
  const amount = Number(record.amount) || 0;
  const isIncome = record.type === 'income';
  const newRecord = {
    id: recordId,
    date: record.date || todayStr(),
    type: isIncome ? 'income' : 'expense',
    amount: Math.abs(amount),
    rawAmount: isIncome ? Math.abs(amount) : -Math.abs(amount),
    category: record.category || record.description || '',
    account: record.account || 'wealth',
    accountType: record.account === 'free' ? '自由基金账户' : '财富增值账户',
    description: record.description || record.title || '',
    worthIt: record.worthIt || '',
    reason: record.reason || '',
    suggestion: record.suggestion || '',
    reviewStatus: '已通过',
  };
  // 优先使用本地缓存数据（避免 CDN raw.githubusercontent.com 缓存延迟导致数据丢失）
  let fromCache = false;
  let finance;
  if (cachedData && cachedData.finance) {
    finance = JSON.parse(JSON.stringify(cachedData.finance));
    fromCache = true;
  } else {
    finance = await fetchRawJSON('finance.json').catch(() => ({
      totalAssets: 0, accounts: [
        { key: 'wealth', name: '财富增值账户', balance: 0 },
        { key: 'free', name: '自由基金账户', balance: 0 },
      ], recentTransactions: []
    }));
  }
  if (!finance.recentTransactions) finance.recentTransactions = [];
  finance.recentTransactions.unshift(newRecord);
  // 更新账户余额
  if (!finance.accounts) finance.accounts = [];
  const account = finance.accounts.find(a => a.key === newRecord.account);
  if (account) {
    account.balance = Number(account.balance || 0) + (isIncome ? newRecord.amount : -newRecord.amount);
  }
  // 更新总资产
  finance.totalAssets = finance.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  await writeGithubFile('finance.json', finance, '新增财务记录');
  // 同步更新内存缓存（deep copy 后需手动更新，不能直接用 _addToCache 避免重复添加）
  if (fromCache && cachedData && cachedData.finance) {
    cachedData.finance.recentTransactions.unshift(newRecord);
    if (cachedData.finance.accounts) {
      const cacheAcc = cachedData.finance.accounts.find(a => a.key === newRecord.account);
      if (cacheAcc) cacheAcc.balance = Number(account ? account.balance : 0);
    }
    cachedData.finance.totalAssets = finance.totalAssets;
  } else {
    _addToCache('finance.recentTransactions', newRecord);
  }
  _persistCache();
  // ★ 如果是支出且填写了"值得/不值得/一般"，每笔自动生成独立的财务能力分析 XP 记录
  if (record.type === 'expense' && record.worthIt) {
    const _financeRule = (cachedData?.config?.xpRuleList || []).find(function(r){return (r.name||"").indexOf("财务能力分析")>=0});
    const _perRecXp = (_financeRule && Number(_financeRule.xp)) ? Number(_financeRule.xp) : 5;
    await addXpRecord({
      taskName: "财务能力分析",
      description: `财务分析：${record.description || ''}（${record.worthIt}）`,
      date: record.date || todayStr(),
      status: "verified",
      xp: _perRecXp,
      xpCategory: "能力成长",
    });
  }
  return recordId;
}

// 新增期末评价记录
async function addEvaluationRecord(record) {
  _dataGen++;
  const recordId = generateId('eval_');
  const newRecord = {
    id: recordId,
    semester: record.semester || '',
    teacherComment: record.teacherComment || '',
    parentComment: record.parentComment || '',
    date: record.date || todayStr(),
  };
  const study = await fetchRawJSON('study.json').catch(() => ({ evaluations: [] }));
  if (!study.evaluations) study.evaluations = [];
  study.evaluations.unshift(newRecord);
  await writeGithubFile('study.json', study, '新增期末评价');
  _addToCache('study.evaluations', newRecord);
  _persistCache();
  return recordId;
}

// 兑换权益
async function redeemPrivilege(record) {
  _dataGen++;
  const recordId = generateId('redeem_');
  const levels = await fetchRawJSON('levels.json').catch(() => []);
  const privilegeName = record.name || record.privilegeName || '';
  const levelName = record.level || '';
  const date = record.date || todayStr();
  // 找到对应等级和权益，标记已兑换
  for (const lv of levels) {
    if (lv.name === levelName && lv.privileges) {
      for (const p of lv.privileges) {
        if (p.name === privilegeName) {
          p.redeemed = true;
          p.redeemedAt = date;
          p.redeemedDate = date.slice(0, 10);
        }
      }
    }
  }
  await writeGithubFile('levels.json', levels, `兑换权益: ${privilegeName}`);
  // 更新缓存
  if (cachedData && cachedData.levels) {
    for (const lv of cachedData.levels) {
      if (lv.name === levelName && lv.privileges) {
        for (const p of lv.privileges) {
          if (p.name === privilegeName) {
            p.redeemed = true;
            p.redeemedAt = date;
            p.redeemedDate = date.slice(0, 10);
          }
        }
      }
    }
    _persistCache();
  }
  return recordId;
}

// ── 更新操作 ──

async function updateStudyRecord(recordId, fields) {
  _dataGen++;
  const study = (cachedData && cachedData.study) ? cachedData.study : await fetchRawJSON('study.json').catch(() => ({ allHomework: [] }));
  const groups = study.allHomework || [];
  let found = false;
  // 兼容分组记录与平铺记录两种结构
  for (const group of groups) {
    if (group && Array.isArray(group.items)) {
      const items = group.items;
      const idx = items.findIndex(r => r && r.id === recordId);
      if (idx >= 0) {
        Object.assign(items[idx], fields);
        found = true;
        break;
      }
    } else if (group && group.id === recordId) {
      Object.assign(group, fields);
      found = true;
      break;
    }
  }
  if (found) {
    await writeGithubFile('study.json', study, '更新作业记录');
    _updateCacheRecord('study.allHomework', recordId, fields);
    _persistCache();
  }
  if (!found) {
    throw new Error('未找到作业记录: ' + recordId);
  }
}

// 从缓存或 CDN 获取原始数据（优先缓存，避免 CDN 延迟导致数据不一致）
function _getCachedRaw(key) {
  if (cachedData && cachedData[key] !== undefined) return cachedData[key];
  // 缓存中无此数据，可能是首次加载不完整，尝试从 CDN 读取
  return null; // 调用方自行 fallback
}


async function updateXpRecord(recordId, fields) {
  _dataGen++;
  const updateData = { ...fields };
  if (fields.status) {
    updateData.reviewStatus = fields.status === 'verified' ? '已通过' : fields.status === 'returned' ? '已退回' : '待确认';
  }
  // ★ 并发安全更新：以线上最新为基准，只 merge 这一条，避免覆盖他人并发新增的记录。
  await writeXpMergedRecord(recordId, updateData);
  _updateCacheRecord('xpRecords', recordId, updateData);
  _updateCacheRecord('recentRecords', recordId, { ...fields, status: fields.status, reviewStatus: updateData.reviewStatus });
  _persistCache();
}

async function updateFinanceRecord(recordId, fields) {
  _dataGen++;
  const finance = (cachedData && cachedData.finance) ? cachedData.finance : await fetchRawJSON('finance.json').catch(() => ({ recentTransactions: [] }));
  const idx = (finance.recentTransactions || []).findIndex(r => r.id === recordId);
  if (idx >= 0) {
    Object.assign(finance.recentTransactions[idx], fields);
    await writeGithubFile('finance.json', finance, '更新财务记录');
    _updateCacheRecord('finance.recentTransactions', recordId, fields);
    _persistCache();
  }
}

// 保存作业后只刷新「作业列表」区块，避免整页全量重绘（renderStudy）造成的卡顿。
// 复算数据 → 更新顶部完成率 / 统计卡 / 作业列表，保持当前筛选与展开状态。
async function refreshHomeworkSection() {
  const cfg = await loadAppData();
  const study = cfg.study || {};
  const allGroups = study.allHomework || [];
  const allAssignments = collectAssignments(allGroups);
  const isArchived = (a) => !!(a && a.term && String(a.term).trim());
  const currentTermAssignments = allAssignments.filter(a => !isArchived(a));
  const archivedAssignments = allAssignments.filter(isArchived);
  const pendingList = currentTermAssignments.filter(a => a.status !== "done" && a.status !== "expired");
  const doneList = currentTermAssignments.filter(a => a.status === "done");
  const expiredList = currentTermAssignments.filter(a => a.status === "expired");
  const total = currentTermAssignments.length;
  const donePct = pct(doneList.length, total);

  window.__studyHW = window.__studyHW || {};
  window.__studyHW.pendingList = pendingList;
  window.__studyHW.doneList = doneList;
  window.__studyHW.expiredList = expiredList;
  window.__studyHW.archivedList = archivedAssignments;
  const currentFilter = (typeof window.__studyHW.filter === "string") ? window.__studyHW.filter : "pending";
  const expanded = window.__studyHW.expanded === true;

  // 顶部完成率
  const pctEl = document.getElementById("studyHeroPct");
  if (pctEl) pctEl.textContent = `作业完成率：${donePct.toFixed(2)}%`;
  const fillEl = document.getElementById("studyHeroFill");
  if (fillEl) fillEl.style.width = `${donePct}%`;

  // 作业统计卡
  const hwStatsEl = document.getElementById("hwStatsRow");
  if (hwStatsEl) {
    const doneXpTotal = doneList.reduce(function(sum, a) {
      const xp = getHwXpLocal(cfg, a);
      return sum + (xp != null ? xp : 0);
    }, 0);
    hwStatsEl.innerHTML = `
      <div class="hw-stat-item todo">
        <div class="hsi-label">待完成</div>
        <div class="hsi-value">${pendingList.length}</div>
        <div class="hsi-sub">待完成中</div>
      </div>
      <div class="hw-stat-item done">
        <div class="hsi-label">已完成</div>
        <div class="hsi-value">${doneList.length}</div>
        <div class="hsi-sub">${doneXpTotal > 0 ? '共获得 +' + doneXpTotal + ' XP' : '真棒，继续保持'}</div>
      </div>
      <div class="hw-stat-item rate">
        <div class="hsi-label">完成率</div>
        <div class="hsi-value">${donePct}%</div>
        <div class="hsi-sub">共 ${total} 项作业</div>
      </div>
      <div class="hw-stat-item total">
        <div class="hsi-label">已到期</div>
        <div class="hsi-value">${expiredList.length}</div>
        <div class="hsi-sub">项已到期末完成</div>
      </div>
    `;
  }

  // 重新绑定筛选 Tab 到独立渲染（保持当前筛选激活态）
  initTabGroup("#hwFilterTabs .hw-filter-btn", "filter", function(f) {
    window.__studyHW.filter = f;
    renderHomeworkListSection(cfg, window.__studyHW);
  }, "pending");

  // 作业列表
  renderHomeworkListSection(cfg, window.__studyHW);

  return { pendingList, doneList, expiredList, archivedAssignments, total };
}

function getHwXpLocal(cfg, item) {
  // 已不再区分作业类型：作业完成统一 +1 XP
  return item ? 1 : null;
}

// 渲染作业列表区块（独立于 renderStudy，供保存后局部刷新）
function renderHomeworkListSection(cfg, hwState) {
  const listEl = document.getElementById("assignmentList");
  if (!listEl) return;
  const showMoreBtn = document.getElementById("showMoreAssignments");
  const filter = (hwState && typeof hwState.filter === "string") ? hwState.filter : "pending";
  const expanded = (hwState && hwState.expanded === true);
  const getList = (hwState && typeof hwState.getFilteredList === "function") ? hwState.getFilteredList : fallbackFilteredList;

  const list = (typeof getList === "function") ? getList(filter) : fallbackFilteredList(filter);
  listEl.innerHTML = "";

  if (!list || list.length === 0) {
    let emptyIcon = "inbox";
    let emptyText = "暂无作业";
    if (filter === "pending") { emptyIcon = "party-popper"; emptyText = "太棒了，当前没有待办作业！"; }
    else if (filter === "finished" || filter === "done") { emptyIcon = "list-checks"; emptyText = "还没有已完结的作业记录"; }
    listEl.innerHTML = `<div class="hw-empty">${emptyStateHTML(emptyIcon, emptyText)}</div>`;
    if (showMoreBtn) showMoreBtn.style.display = "none";
    refreshIcons(0);
    return;
  }

  const visibleCount = 6;
  const visible = list.slice(0, visibleCount);
  const hidden = list.slice(visibleCount);
  let html = visible.map((a, i) => renderHwRow(a, false, "a-" + i, getHwXpLocal(cfg, a))).join("");
  html += hidden.map((a, i) => renderHwRow(a, !expanded, "a-" + (i + visibleCount), getHwXpLocal(cfg, a))).join("");
  listEl.innerHTML = html;
  if (hidden.length > 0) {
    if (showMoreBtn) {
      showMoreBtn.style.display = "block";
      showMoreBtn.textContent = expanded ? "收回" : `展开更多（还有 ${hidden.length} 条）`;
      showMoreBtn.onclick = function() {
        hwState.expanded = !hwState.expanded;
        renderHomeworkListSection(cfg, hwState);
      };
    }
  } else if (showMoreBtn) {
    showMoreBtn.style.display = "none";
  }
  refreshIcons(0);
}

function fallbackFilteredList(filter) {
  const hw = window.__studyHW || {};
  const asc = (a, b) => (a.dueDate || "").localeCompare(b.dueDate || "");
  const desc = (a, b) => (b.dueDate || "").localeCompare(a.dueDate || "");
  const pend = hw.pendingList || [];
  const done = hw.doneList || [];
  const exp = hw.expiredList || [];
  const arch = hw.archivedList || [];
  if (filter === "pending") return [...pend].sort(asc);
  if (filter === "finished" || filter === "done") return [...done].sort(desc).concat([...exp].sort(asc), [...arch].sort(desc));
  return [...pend].sort(asc).concat([...exp].sort(asc), [...done].sort(desc), [...arch].sort(desc));
}

async function updateScoreRecord(recordId, fields) {
  _dataGen++;
  const study = (cachedData && cachedData.study) ? cachedData.study : await fetchRawJSON('study.json').catch(() => ({ examRecords: [] }));
  const idx = (study.examRecords || []).findIndex(r => r.id === recordId);
  if (idx >= 0) {
    Object.assign(study.examRecords[idx], fields);
    await writeGithubFile('study.json', study, '更新成绩记录');
    _updateCacheRecord('study.examRecords', recordId, fields);
    _persistCache();
    return true;
  }
  return false;
}

// 删除成绩记录（同步清理内存缓存，避免删除后旧数据还在列表里）
async function deleteScoreRecord(recordId) {
  _dataGen++;
  const study = (cachedData && cachedData.study) ? cachedData.study : await fetchRawJSON('study.json').catch(() => ({ examRecords: [] }));
  const list = study.examRecords || [];
  const idx = list.findIndex(r => r.id === recordId);
  if (idx < 0) return false;
  list.splice(idx, 1);
  study.examRecords = list;
  await writeGithubFile('study.json', study, '删除成绩记录');
  if (cachedData && cachedData.study && Array.isArray(cachedData.study.examRecords)) {
    cachedData.study.examRecords = cachedData.study.examRecords.filter(r => r.id !== recordId);
  }
  _persistCache();
  return true;
}

async function updateXpRule(recordId, fields) {
  _dataGen++;
  const config = (cachedData && cachedData.config) ? cachedData.config : await fetchRawJSON('config.json').catch(() => ({ xpRuleList: [] }));
  const idx = (config.xpRuleList || []).findIndex(r => r.id === recordId);
  if (idx >= 0) {
    Object.assign(config.xpRuleList[idx], fields);
    await writeGithubFile('config.json', config, '更新 XP 规则');
    _updateCacheRecord('config.xpRuleList', recordId, fields);
    _persistCache();
  }
}

async function updateEvaluationRecord(recordId, fields) {
  _dataGen++;
  const study = (cachedData && cachedData.study) ? cachedData.study : await fetchRawJSON('study.json').catch(() => ({ evaluations: [] }));
  const idx = (study.evaluations || []).findIndex(r => r.id === recordId);
  if (idx >= 0) {
    Object.assign(study.evaluations[idx], fields);
    await writeGithubFile('study.json', study, '更新期末评价');
    _updateCacheRecord('study.evaluations', recordId, fields);
    _persistCache();
  }
}

// ── 缓存辅助函数 ──

function _persistCache() {
  if (!cachedData) return;
  // 记录缓存的写入时间戳，用于防止 _backgroundRefresh 用 CDN 旧数据覆盖
  cachedData._cachedAt = Date.now();
  // 每次持久化前重新计算 totalXP 和等级数据，确保缓存一致性
  if (cachedData.xpRecords && cachedData.levels) {
    const verifiedXp = cachedData.xpRecords.filter(function(r) { return r.reviewStatus === '已通过'; });
    const totalXP = verifiedXp.reduce(function(sum, r) { return sum + (Number(r.xp) || 0); }, 0);
    cachedData.currentXP = totalXP;

    // 同步重新计算等级数据
    if (typeof processLevels === 'function') {
      var processedLevels = processLevels(cachedData.levels, totalXP);
      var currentLevelIndex = 0;
      for (var i = processedLevels.length - 1; i >= 0; i--) {
        if (totalXP >= processedLevels[i].xp) { currentLevelIndex = i; break; }
      }
      cachedData.currentLevel = processedLevels[currentLevelIndex] || processedLevels[0] || { name: '萌新', levelNum: 'Lv.1', badgeClass: 'bronze', themeColor: '#CD7F32', xp: 0 };
      cachedData.nextLevel = processedLevels[currentLevelIndex + 1] || null;
      cachedData.levelProgress = cachedData.nextLevel
        ? Math.min(100, Math.round(((totalXP - cachedData.currentLevel.xp) / (cachedData.nextLevel.xp - cachedData.currentLevel.xp)) * 100))
        : 100;
    }
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData)); } catch (e) {}
}

function _addToCache(path, item) {
  if (!cachedData) return false;
  let current = cachedData;
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i++) {
    if (current == null) { cachedData = null; loadPromise = null; return false; }
    current = current[parts[i]];
  }
  if (Array.isArray(current)) {
    current.unshift(item);
    return true;
  }
  cachedData = null;
  loadPromise = null;
  return false;
}

function _updateCacheRecord(path, recordId, fields) {
  if (!cachedData) return;
  let arr = cachedData;
  const parts = path.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (!arr[parts[i]]) return;
    arr = arr[parts[i]];
  }
  arr = arr[parts[parts.length - 1]];
  if (!Array.isArray(arr)) return;
  let idx = arr.findIndex(r => r.id === recordId);
  if (idx >= 0) {
    Object.assign(arr[idx], fields);
    return;
  }
  for (const group of arr) {
    if (group && Array.isArray(group.items)) {
      const itemIdx = group.items.findIndex(r => r.id === recordId);
      if (itemIdx >= 0) {
        Object.assign(group.items[itemIdx], fields);
        return;
      }
    }
  }
}

// ── 导出 ──

if (typeof window !== 'undefined') {
  window.DataStore = {
    loadData,
    refreshData,
    saveChildData,
    loadChildData,
    saveCalendarData,
    loadCalendarData,
    updateChildData,
    addXpRecord,
    addXpRule,
    addStudyRecord,
    addStudyRecords,
    addScoreRecord,
    addFinanceRecord,
    addEvaluationRecord,
    redeemPrivilege,
    updateStudyRecord,
    updateXpRecord,
    updateFinanceRecord,
    updateScoreRecord,
    deleteScoreRecord,
    updateXpRule,
    updateEvaluationRecord,
    todayStr,
    // 日记本
    loadDiaryEntries,
    saveDiaryEntries,
    addDiaryEntry,
    // 家庭会议
    loadFamilyMeetings,
    saveFamilyMeetings,
    addFamilyMeeting,
    // GitHub 专属
    getGithubToken,
    hasGithubToken,
    setGithubToken,
  };
}

  


/* ===== Script block 4 (original lines 2786-3072) ===== */


// ═══════════════════════════════════════════════════════════════
// semester-calendar.js — 校历数据模块
// 提供学年学期数据、周次计算、进度追踪等功能
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CALENDAR_DATA = [
  // 2024-2025学年（二年级）
  {
    academicYear: "2024-2025",
    grade: "二年级",
    semester1: {
      name: "第一学期",
      shortName: "上",
      startDate: "2024-09-02",
      midTermStart: "2024-11-04",
      finalExamStart: "2025-01-13",
      winterBreakStart: "2025-01-16",
      teachingWeeks: 19
    },
    semester2: {
      name: "第二学期",
      shortName: "下",
      startDate: "2025-02-13",
      midTermStart: "2025-04-28",
      finalExamStart: "2025-07-07",
      summerBreakStart: "2025-07-14",
      teachingWeeks: 22
    }
  },
  // 2025-2026学年（三年级）
  {
    academicYear: "2025-2026",
    grade: "三年级",
    semester1: {
      name: "第一学期",
      shortName: "上",
      startDate: "2025-09-01",
      midTermStart: "2025-11-03",
      finalExamStart: "2026-01-25",
      winterBreakStart: "2026-01-31",
      teachingWeeks: 22
    },
    semester2: {
      name: "第二学期",
      shortName: "下",
      startDate: "2026-03-02",
      midTermStart: "2026-05-04",
      finalExamStart: "2026-07-06",
      summerBreakStart: "2026-07-13",
      teachingWeeks: 19
    }
  },
  // 2026-2027学年（四年级）
  {
    academicYear: "2026-2027",
    grade: "四年级",
    semester1: {
      name: "第一学期",
      shortName: "上",
      startDate: "2026-09-01",
      midTermStart: "2026-11-02",
      finalExamStart: "2027-01-25",
      winterBreakStart: "2027-01-31",
      teachingWeeks: 22
    },
    semester2: {
      name: "第二学期",
      shortName: "下",
      startDate: "2027-03-01",
      midTermStart: "2027-05-03",
      finalExamStart: "2027-07-05",
      summerBreakStart: "2027-07-12",
      teachingWeeks: 19
    }
  }
];

// ── 工具：日期差（天数）──
function _daysBetween(date1, date2) {
  const d1 = new Date(date1 + "T00:00:00");
  const d2 = new Date(date2 + "T00:00:00");
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// ── 获取校历数据（从 localStorage 读，没有就用默认内置）──
function getCalendarData() {
  // 优先从 DataStore 读取
  try {
    if (window.DataStore && window.DataStore.loadCalendarData) {
      const data = window.DataStore.loadCalendarData();
      if (data && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.warn("从 DataStore 读取校历失败，尝试 localStorage:", e);
  }
  // 回退：直接从 localStorage 读取
  try {
    const raw = localStorage.getItem("yara_calendar_data");
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.warn("从 localStorage 读取校历失败，使用默认数据:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CALENDAR_DATA));
}

// ── 保存校历数据 ──
function saveCalendarData(data) {
  try {
    if (window.DataStore && window.DataStore.saveCalendarData) {
      return window.DataStore.saveCalendarData(data);
    }
  } catch (e) {
    console.warn("通过 DataStore 保存校历失败:", e);
  }
  try {
    localStorage.setItem("yara_calendar_data", JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("保存校历数据失败:", e);
    return false;
  }
}

// ── 根据日期获取当前学年/学期/周次信息 ──
// 返回: { academicYear, grade, semester, semesterName, weekNum,
//         isBreak, breakType, daysUntilStart, daysUntilMidTerm,
//         daysUntilFinal, progressPercent }
function getCurrentSemesterInfo(date) {
  const targetDate = date || new Date();
  const dateStr = typeof targetDate === "string"
    ? targetDate
    : `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

  const calendarData = getCalendarData();

  for (let i = 0; i < calendarData.length; i++) {
    const yearData = calendarData[i];
    const s1 = yearData.semester1;
    const s2 = yearData.semester2;

    // 检查第一学期
    if (dateStr >= s1.startDate && dateStr < s1.winterBreakStart) {
      const daysPassed = _daysBetween(s1.startDate, dateStr);
      const weekNum = Math.floor(daysPassed / 7) + 1;
      const totalDays = s1.teachingWeeks * 7;
      const progressPercent = Math.min(100, Math.round((daysPassed / totalDays) * 100));
      const daysUntilMidTerm = _daysBetween(dateStr, s1.midTermStart);
      const daysUntilFinal = _daysBetween(dateStr, s1.finalExamStart);

      return {
        academicYear: yearData.academicYear,
        grade: yearData.grade,
        semester: 1,
        semesterName: s1.name,
        semesterShortName: s1.shortName,
        weekNum: weekNum,
        dayInWeek: (daysPassed % 7) + 1,
        isBreak: false,
        breakType: null,
        breakStart: null,
        startDate: s1.startDate,
        semesterStart: s1.startDate,
        semesterEnd: s1.winterBreakStart,
        midTermStart: s1.midTermStart,
        finalExamStart: s1.finalExamStart,
        daysUntilStart: 0,
        daysUntilMidTerm: daysUntilMidTerm > 0 ? daysUntilMidTerm : 0,
        daysUntilFinal: daysUntilFinal > 0 ? daysUntilFinal : 0,
        progressPercent: progressPercent,
        teachingWeeks: s1.teachingWeeks,
      };
    }

    // 检查寒假
    if (dateStr >= s1.winterBreakStart && dateStr < s2.startDate) {
      const daysUntilStart = _daysBetween(dateStr, s2.startDate);
      const breakStart = s1.winterBreakStart;
      const breakTotal = Math.max(1, _daysBetween(breakStart, s2.startDate));
      const breakElapsed = Math.max(0, _daysBetween(breakStart, dateStr));
      return {
        academicYear: yearData.academicYear,
        grade: yearData.grade,
        semester: 2,
        semesterName: s2.name,
        semesterShortName: s2.shortName,
        weekNum: 0,
        isBreak: true,
        breakType: "winter",
        breakName: "寒假",
        breakStart: breakStart,
        breakTotalDays: breakTotal,
        breakElapsedDays: breakElapsed,
        daysUntilStart: daysUntilStart,
        daysUntilMidTerm: _daysBetween(s2.startDate, s2.midTermStart) + daysUntilStart,
        daysUntilFinal: _daysBetween(s2.startDate, s2.finalExamStart) + daysUntilStart,
        progressPercent: 0,
        teachingWeeks: s2.teachingWeeks,
      };
    }

    // 检查第二学期
    if (dateStr >= s2.startDate && dateStr < s2.summerBreakStart) {
      const daysPassed = _daysBetween(s2.startDate, dateStr);
      const weekNum = Math.floor(daysPassed / 7) + 1;
      const totalDays = s2.teachingWeeks * 7;
      const progressPercent = Math.min(100, Math.round((daysPassed / totalDays) * 100));
      const daysUntilMidTerm = _daysBetween(dateStr, s2.midTermStart);
      const daysUntilFinal = _daysBetween(dateStr, s2.finalExamStart);

      return {
        academicYear: yearData.academicYear,
        grade: yearData.grade,
        semester: 2,
        semesterName: s2.name,
        semesterShortName: s2.shortName,
        weekNum: weekNum,
        dayInWeek: (daysPassed % 7) + 1,
        isBreak: false,
        breakType: null,
        breakStart: null,
        startDate: s2.startDate,
        semesterStart: s2.startDate,
        semesterEnd: s2.summerBreakStart,
        midTermStart: s2.midTermStart,
        finalExamStart: s2.finalExamStart,
        daysUntilStart: 0,
        daysUntilMidTerm: daysUntilMidTerm > 0 ? daysUntilMidTerm : 0,
        daysUntilFinal: daysUntilFinal > 0 ? daysUntilFinal : 0,
        progressPercent: progressPercent,
        teachingWeeks: s2.teachingWeeks,
      };
    }

    // 检查暑假（到下一个学年开始前）
    if (dateStr >= s2.summerBreakStart) {
      const nextYear = calendarData[i + 1];
      if (nextYear && dateStr < nextYear.semester1.startDate) {
        const daysUntilStart = _daysBetween(dateStr, nextYear.semester1.startDate);
        const breakStart = s2.summerBreakStart;
        const breakTotal = Math.max(1, _daysBetween(breakStart, nextYear.semester1.startDate));
        const breakElapsed = Math.max(0, _daysBetween(breakStart, dateStr));
        return {
          academicYear: nextYear.academicYear,
          grade: nextYear.grade,
          semester: 1,
          semesterName: nextYear.semester1.name,
          semesterShortName: nextYear.semester1.shortName,
          weekNum: 0,
          isBreak: true,
          breakType: "summer",
          breakName: "暑假",
          breakStart: breakStart,
          breakTotalDays: breakTotal,
          breakElapsedDays: breakElapsed,
          daysUntilStart: daysUntilStart,
          daysUntilMidTerm: _daysBetween(nextYear.semester1.startDate, nextYear.semester1.midTermStart) + daysUntilStart,
          daysUntilFinal: _daysBetween(nextYear.semester1.startDate, nextYear.semester1.finalExamStart) + daysUntilStart,
          progressPercent: 0,
          teachingWeeks: nextYear.semester1.teachingWeeks,
        };
      }
    }
  }

  // 如果所有学年都匹配不上，返回最后一个学年的数据
  const lastYear = calendarData[calendarData.length - 1];
  const lastSemester = lastYear.semester2;
  return {
    academicYear: lastYear.academicYear,
    grade: lastYear.grade,
    semester: 2,
    semesterName: lastSemester.name,
    semesterShortName: lastSemester.shortName,
    weekNum: lastSemester.teachingWeeks,
    isBreak: true,
    breakType: "summer",
    breakName: "暑假",
    daysUntilStart: 0,
    daysUntilMidTerm: 0,
    daysUntilFinal: 0,
    progressPercent: 100,
    teachingWeeks: lastSemester.teachingWeeks,
  };
}

// ── 获取学期键值（格式: "2026-2027|1"）──
function getSemesterKey(semesterInfo) {
  return `${semesterInfo.academicYear}|${semesterInfo.semester}`;
}

// ── 获取所有学年列表 ──
function getAllAcademicYears() {
  const data = getCalendarData();
  return data.map(item => ({
    academicYear: item.academicYear,
    grade: item.grade,
  }));
}

// ── 渲染学期状态条 ──
function renderSemesterBar() {
  const info = getCurrentSemesterInfo();
  const titleEl = document.getElementById("semBarTitle");
  const weekEl = document.getElementById("semBarWeek");
  const dateEl = document.getElementById("semBarDate");
  const midEl = document.getElementById("semBarMid");
  const fillEl = document.getElementById("semBarFill");
  const trackEl = document.querySelector(".sem-bar-track");

  // 进度条轨道必须始终可见
  if (trackEl) trackEl.style.display = "";

  // 框1：学期：几年级·（上/下），与成绩分析学期口径保持一致
  // （原用"秋季/春季"季节叫法，现统一为"上/下"制）
  let season = "";
  if (info.isBreak) {
    season = info.breakName || (info.breakType === "winter" ? "寒假" : "暑假");
  } else {
    // 优先使用校历短名（上/下），回退到数字映射
    season = (info.semesterShortName === "上" || info.semesterShortName === "下")
      ? info.semesterShortName
      : (info.semester === 1 ? "上" : "下");
  }
  if (titleEl) {
    // 标题显示学期+起止日期，例如：学期：四年级·上（2026.09.01 - 2027.01.31）
    let dateRange = "";
    if (!info.isBreak && info.semesterStart && info.semesterEnd) {
      const s = info.semesterStart.slice(0, 10).replace(/-/g, ".");
      const e = info.semesterEnd.slice(0, 10).replace(/-/g, ".");
      dateRange = `（${s} - ${e}）`;
    }
    titleEl.innerHTML = `学期：${info.grade}·${season}${dateRange}`;
  }

  // 框2：第几周第几天
  let weekText = "";
  if (info.isBreak) {
    const elapsed = info.breakElapsedDays != null ? info.breakElapsedDays : 0;
    const breakWeek = Math.floor(elapsed / 7) + 1;
    const breakDay = (elapsed % 7) + 1;
    weekText = `假期第${breakWeek}周第${breakDay}天`;
  } else {
    weekText = `第${info.weekNum}周第${info.dayInWeek || 1}天`;
  }
  if (weekEl) weekEl.textContent = weekText;

  // 框：中间是期中还有几天 / 右侧是期末还有几天
  let midText = "";
  let finText = "";
  let fillPercent = 0;

  if (info.isBreak) {
    // 假期中：进度条显示假期进度
    const total = info.breakTotalDays || (info.daysUntilStart + 1);
    const elapsed = info.breakElapsedDays != null ? info.breakElapsedDays : 0;
    fillPercent = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
    const startDays = Number(info.daysUntilStart) || 0;
    if (midEl) midEl.style.display = "none";
    if (startDays > 0) {
      finText = `距开学还有 <strong>${startDays}</strong> 天`;
    } else {
      finText = "开学中";
    }
  } else {
    // 学期中：进度条按教学进度填充
    fillPercent = info.progressPercent;
    const mid = Number(info.daysUntilMidTerm) || 0;
    const fin = Number(info.daysUntilFinal) || 0;
    // 始终显示：中间=期中还有几天，右边=期末还有几天（站在正向，同时展示两个节点）
    // 期中还没到：显示还有几天；期中已过：显示"已进行"（比"已过期"更正向）
    if (mid > 0) {
      midText = `还有<strong>${mid}</strong>天就期中啦`;
    } else {
      midText = `期中已进行中`;
    }
    // 期末同理，永远在右侧显示（正向）
    if (fin > 0) {
      finText = `还有<strong>${fin}</strong>天就期末啦`;
    } else if (fin === 0) {
      finText = `期末进行中`;
    } else {
      finText = `学期已结束`;
    }
    // 始终显示两个时间节点
    if (midEl) midEl.style.display = "";
  }

  if (midEl && !info.isBreak) midEl.innerHTML = midText;
  if (dateEl) dateEl.innerHTML = finText;
  if (fillEl) fillEl.style.width = fillPercent + "%";

  // 刷新沙漏图标
  if (typeof refreshIcons === "function") refreshIcons(0);
}

// 日期 "YYYY-MM-DD" → "X月X日"
function _fmtMD(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

// ── 设置面板相关 ──

// 设置入口统一跳到系统设置视图（SPA 内切换，避免整页跳变）
function openSettingsDrawer() {
  if (typeof switchView === "function") switchView("settings");
  else window.location.href = "index.html?view=settings";
}

function closeSettingsDrawer() { /* 兼容占位：抽屉已移除，配置页无需关闭 */ }

// ── 导出 ──
if (typeof window !== "undefined") {
  window.SemesterCalendar = {
    getCalendarData,
    saveCalendarData,
    getCurrentSemesterInfo,
    getSemesterKey,
    getAllAcademicYears,
    renderSemesterBar,
    openSettingsDrawer,
    closeSettingsDrawer,
  };
}


  


/* ===== Script block 5 (original lines 3072-3298) ===== */


    async function populateXpTaskSelectPage() {
      const cfg = await loadAppData();
      const xpRules = (cfg.config && cfg.config.xpRules) ? cfg.config.xpRules : {};
      const categories = ["学习成长", "能力成长", "身体成长", "兴趣爱好"];
      // 获取本周约定（严格取"周号==本周"的会议，而不是最新会议）
      const meeting = currentWeekMeeting(cfg.familyMeetings);
      const activeCommitments = meeting ? meeting.commitments.filter(function(c) { return !c.completed; }) : [];
      // 分类：关联任务池的约定（linked） vs 自由填写（非linked）
      const linkedCommitments = activeCommitments.filter(c => c.linked);
      const freeCommitments = activeCommitments.filter(c => !c.linked);
      // 关联任务池的约定按分类分组
      const linkedByCat = {};
      linkedCommitments.forEach(c => {
        const cat = c.category || "能力成长";
        if (!linkedByCat[cat]) linkedByCat[cat] = [];
        linkedByCat[cat].push(c);
      });
      // ── 本周约定分组：只放自由填写的约定（📝） ──
      const commitmentGroup = document.getElementById("xpGroupPage-本周约定");
      if (commitmentGroup) {
        if (freeCommitments.length > 0) {
          commitmentGroup.innerHTML = freeCommitments.map(c => {
            const cat = c.category || "能力成长";
            const xp = c.xp || 5;
            return `<option value="${c.text}" data-xp="${xp}" data-category="${cat}" data-commitment="1" data-linked="0" data-taskname="${c.text}">📝 ${c.text} (+${xp}XP)</option>`;
          }).join("");
        } else {
          commitmentGroup.innerHTML = `<option value="" disabled>${linkedCommitments.length > 0 ? '🎉 本周约定全部完成！' : '还没有约定，去家庭会议定一个'}</option>`;
        }
      }
      // ── 每个分类：只渲染任务池任务（约定不在此置顶，避免脏数据把普通任务带偏成"约定"） ──
      categories.forEach(cat => {
        const groupEl = document.getElementById("xpGroupPage-" + cat);
        if (!groupEl) return;
        // 任务池任务：排除自动发放、排除手动新增（单独分组）
        const tasks = (xpRules[cat] || []).filter(t =>
          !isAutoTask(t) && !t._manual
        );
        const otherHtml = tasks.map(t =>
          `<option value="${t.name}" data-xp="${t.xp}" data-category="${cat}">${t.name} (+${t.xp}XP)</option>`
        ).join("");
        groupEl.innerHTML = otherHtml || `<option value="" disabled>还没有该分类的任务</option>`;
      });
      // ── 手动新增分组：所有手动新增的任务单独放一起 ──
      const manualGroup = document.getElementById("xpGroupPage-手动新增");
      if (manualGroup) {
        const manualTasks = [];
        categories.forEach(cat => {
          (xpRules[cat] || []).forEach(t => {
            if (t._manual) manualTasks.push({ name: t.name, xp: t.xp, category: cat });
          });
        });
        if (manualTasks.length > 0) {
          manualGroup.innerHTML = manualTasks.map(t =>
            `<option value="${t.name}" data-xp="${t.xp}" data-category="${t.category}">${t.name} (+${t.xp}XP)</option>`
          ).join("");
        } else {
          manualGroup.innerHTML = `<option value="" disabled>还没有手动新增的任务</option>`;
        }
      }
    }

    function onXpTaskChangePage() {
      const select = document.getElementById("xpTaskSelectPage");
      const opt = select.options[select.selectedIndex];
      document.getElementById("xpValuePage").value = opt?.dataset?.xp || "";
      document.getElementById("xpCategoryPage").value = opt?.dataset?.category || "";
    }

    function onCommitmentCheckChange() {
      var hint = document.getElementById("xpCommitmentHint");
      var checked = document.getElementById("xpCommitmentCheck").checked;
      if (!checked) { hint.style.display = "none"; return; }
      // 从家庭会议中获取本周约定
      var cfg = window.__lastCfg || {};
      var meeting = currentWeekMeeting(cfg.familyMeetings);
      if (meeting) {
        var texts = meeting.commitments.map(function(c) { return c.text; });
        var linkedTexts = meeting.commitments.filter(function(c) { return c.linked; }).map(function(c) { return c.text; });
        var extra = linkedTexts.length > 0
          ? '<br><span style="font-size:11px;color:var(--colourful-success-500)">💡 任务池关联的约定（' + linkedTexts.join("、") + '）打卡即自动完成，无需勾选此框</span>'
          : '';
        hint.innerHTML = '📋 <b>本周约定参考</b><br>' + texts.map(function(t) { return '· ' + t; }).join('<br>') + extra + '<br><span style="font-size:11px;color:var(--colourful-success-500)">💡 如果正在完成自由填写的约定，勾选此框，通过后按约定奖励 XP</span>';
        hint.style.display = "";
      } else {
        hint.innerHTML = '💡 还没有本周约定？<a href="javascript:void(0)" onclick="closeXpModal();openFamilyMeeting()" style="color:var(--colourful-success-600);text-decoration:underline">去家庭会议定一个</a>';
        hint.style.display = "";
      }
    }

    function openXpModal() {
      populateXpTaskSelectPage().then(() => {
        // 进入"能量打卡/新增"前，彻底重置为新增语义：标题、按钮、清空编辑态与表单残留
        // 防止上次点卡片编辑后，标题停留在"修改记录"、备注残留上一张卡的内容
        const titleEl = document.querySelector("#addXpModalPage .modal-title");
        if (titleEl) titleEl.innerHTML = '<i data-lucide="sparkles"></i>获得 XP';
        const btn = document.querySelector("#addXpModalPage .btn-confirm");
        if (btn) { btn.textContent = "添加 XP"; btn.disabled = false; }
        document.getElementById("addXpModalPage").classList.add("active");
        // 清除编辑态，恢复任务下拉为可改
        window.closeXpEdit && window.closeXpEdit();
        // 重置承诺复选框
        document.getElementById("xpCommitmentCheck").checked = false;
        document.getElementById("xpCommitmentHint").style.display = "none";
        // 清空表单字段残留
        document.getElementById("xpTaskSelectPage").value = "";
        document.getElementById("xpValuePage").value = "";
        document.getElementById("xpCategoryPage").value = "";
        document.getElementById("xpDescPage").value = "";
        // 如果有预选任务（从家庭约定卡点击进入），自动选中该任务
        if (_xpModalPreSelectTask) {
          var sel = document.getElementById("xpTaskSelectPage");
          if (sel) {
            for (var i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === _xpModalPreSelectTask) {
                sel.selectedIndex = i;
                break;
              }
            }
          }
          _xpModalPreSelectTask = null; // 用完清空
        }
        // 填充默认选中任务的分值/分类（否则默认分值为空，提交时按 0+2 计算）
        onXpTaskChangePage();
        // 从"家庭约定"卡片进入时，提示这是要去兑现的承诺，而非随手记录
        if (_xpModalIsCommit) {
          var commitHintEl = document.getElementById("xpCommitmentHint");
          if (commitHintEl) {
            commitHintEl.innerHTML = "🤝 这是你在家庭会议上和爸爸妈妈说好的<b>约定</b>，达成它就能攒到对应的能量～";
            commitHintEl.style.display = "";
          }
          _xpModalIsCommit = false;
        }
        refreshIcons(50);
      });
    }
    function closeXpModal() {
      document.getElementById("addXpModalPage").classList.remove("active");
      // 关闭弹窗时清掉编辑态，恢复任务下拉为可改
      window.closeXpEdit && window.closeXpEdit();
      // 关闭弹窗时同样恢复"获得 XP"标题，避免下次从卡片进入编辑后标题残留
      const titleEl = document.querySelector("#addXpModalPage .modal-title");
      if (titleEl) titleEl.innerHTML = '<i data-lucide="sparkles"></i>获得 XP';
    }

    // ════════ 我的挑战（孩子自己选每周目标） ════════
    let _challengeSelected = [];

    async function openChallengeModal() {
      const cfg = await loadAppData();
      const xpRules = (cfg.config && cfg.config.xpRules) ? cfg.config.xpRules : {};
      const categories = ["学习成长", "能力成长", "身体成长", "兴趣爱好"];
      // 当前已选（来自 child.weeklyGoals）
      const weeklyGoals = (cfg.child && cfg.child.weeklyGoals) || [];
      _challengeSelected = weeklyGoals.map(g => g.name);
      const listEl = document.getElementById("challengeList");
      if (!listEl) return;
      let html = "";
      categories.forEach(cat => {
        const tasks = (xpRules[cat] || []).filter(t => !isAutoTask(t));
        if (tasks.length === 0) return;
        html += `<div style="font-size:11px;font-weight:800;color:var(--neutral-500,#8a8178);margin:10px 2px 6px">${cat}</div>`;
        tasks.forEach(t => {
          const sel = _challengeSelected.includes(t.name) ? " sel" : "";
          html += `<div class="challenge-item${sel}" data-name="${t.name}" data-cat="${cat}" data-xp="${t.xp}" onclick="toggleChallengeItem(this)">
            <span class="ch-check">✓</span>
            <span class="ch-cat">${cat}</span>
            <span class="ch-name">${t.name}</span>
            <span class="ch-xp">+${t.xp} XP</span>
          </div>`;
        });
      });
      listEl.innerHTML = html;
      document.getElementById("challengeModal").classList.add("active");
      refreshIcons(50);
    }

    function toggleChallengeItem(el) {
      const name = el.getAttribute("data-name");
      if (el.classList.contains("sel")) {
        el.classList.remove("sel");
        _challengeSelected = _challengeSelected.filter(n => n !== name);
      } else {
        if (_challengeSelected.length >= 3) { showToast("最多选 3 个挑战哦，先完成再换新的 💪", false); return; }
        el.classList.add("sel");
        _challengeSelected.push(name);
      }
    }

    function closeChallengeModal() {
      document.getElementById("challengeModal").classList.remove("active");
    }

    async function saveChallengeGoals() {
      if (_challengeSelected.length === 0) { showToast("选 1-3 个你想挑战的事吧 ✨", false); return; }
      const cfg = await loadAppData();
      const xpRules = (cfg.config && cfg.config.xpRules) ? cfg.config.xpRules : {};
      const goals = _challengeSelected.map(name => {
        for (const cat of Object.keys(xpRules)) {
          const found = (xpRules[cat] || []).find(t => t.name === name);
          if (found) return { name: found.name, category: found.category || cat, xp: Number(found.xp) || 0 };
        }
        return { name, category: "", xp: 0 };
      });
      const child = Object.assign({}, cfg.child || {});
      child.weeklyGoals = goals;
      try {
        await window.DataStore.updateChildData(child);
        await window.DataStore.refreshData(true);
        closeChallengeModal();
        showToast("🎯 挑战定好啦！去首页看看你的目标吧", true);
        if (window.__viewRendered && window.__viewRendered.home) { window.__viewRendered.home = false; }
        renderHome();
      } catch (e) {
        console.error("保存挑战失败:", e);
        showToast("❌ 保存失败: " + (e.message || "未知错误"), false);
      }
    }
    function openNewTaskModalPage() {
      document.getElementById("newTaskNamePage").value = "";
      setRadioValue("newTaskCategoryGroup", "学习成长");
      document.getElementById("newTaskXpPage").value = "";
      setRadioValue("newTaskMethodGroup", "按次");
      document.getElementById("newTaskDescPage").value = "";
      closeXpModal();
      document.getElementById("addXpRuleModalPage").classList.add("active");
      refreshIcons(50);
    }
    function closeNewTaskModalPage() {
      document.getElementById("addXpRuleModalPage").classList.remove("active");
    }

    function submitNewTaskPage() {
      const name = document.getElementById("newTaskNamePage").value.trim();
      const category = getRadioValue("newTaskCategoryGroup");
      const xp = document.getElementById("newTaskXpPage").value;
      const method = getRadioValue("newTaskMethodGroup");
      const description = document.getElementById("newTaskDescPage").value.trim();
      if (!name) { alert("请输入任务名称"); return; }
      if (!xp || parseInt(xp, 10) <= 0) { alert("请输入有效的 XP 分值"); return; }
      DataStore.addXpRule({ name, category, xp: parseInt(xp, 10), method, description })
        .then(() => DataStore.refreshData(true))
        .then(() => populateXpTaskSelectPage())
        .then(() => {
          closeNewTaskModalPage();
          const select = document.getElementById("xpTaskSelectPage");
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === name) {
              select.selectedIndex = i;
              onXpTaskChangePage();
              break;
            }
          }
          document.getElementById("addXpModalPage").classList.add("active");
          showToast(`✅ 任务「${name}」创建成功，已可选用`, true);
        })
        .catch(e => {
          console.error("新增XP任务失败:", e);
          alert("新增失败: " + (e.message || "未知错误"));
        });
    }

    async function submitAddXpPage() {
      const editId = window.__xpEditRecordId || null;
      if (editId) {
        await submitEditXpPage();
        return;
      }
      const selectEl = document.getElementById("xpTaskSelectPage");
      const taskName = selectEl.value;
      const selectedOpt = selectEl.options[selectEl.selectedIndex];
      const description = document.getElementById("xpDescPage").value.trim();
      // 基础分值：优先手填 → data-xp → 从 config.xpRules / xpRuleList 按任务名查，三层兜底
      const cfgData = await loadAppData();
      const cfgXp = parseInt(selectedOpt?.dataset?.xp || "", 10);
      const manualXp = parseInt(document.getElementById("xpValuePage").value, 10) || 0;
      let xpValue = 0;
      if (manualXp > 0) {
        xpValue = manualXp;
      } else if (cfgXp > 0) {
        xpValue = cfgXp;
      } else {
        // 最后兜底：从配置中按任务名查找 XP（兼容 xpRules 分类结构和 xpRuleList 扁平结构）
        const xpRulesMap = (cfgData.config && cfgData.config.xpRules) || {};
        const xpRuleList = (cfgData.config && cfgData.config.xpRuleList) || [];
        for (const cat of Object.keys(xpRulesMap)) {
          const found = (xpRulesMap[cat] || []).find(function(r) { return r.name === taskName; });
          if (found && found.xp) { xpValue = Number(found.xp) || 0; break; }
        }
        if (xpValue <= 0) {
          const found = xpRuleList.find(function(r) { return r.name === taskName; });
          if (found && found.xp) xpValue = Number(found.xp) || 0;
        }
      }
      const isCommitmentCheck = document.getElementById("xpCommitmentCheck").checked;
      const isCommitmentTask = selectedOpt && selectedOpt.dataset?.commitment === "1";
      if (!taskName) { alert("请选择 XP 任务"); return; }
      if (!description) { alert("请填写备注说明"); return; }

      const btn = document.querySelector("#addXpModalPage .btn-confirm");
      const originalText = btn.textContent;
      btn.textContent = "提交中...";
      btn.disabled = true;

      // 如果选的是本周约定任务，自动启用承诺加成 +2 XP
      const isCommitment = isCommitmentCheck || isCommitmentTask;
      const bonusXp = isCommitment ? 2 : 0;
      const totalXp = xpValue + bonusXp;

      DataStore.addXpRecord({
        taskName,
        xp: totalXp,
        baseXp: xpValue,
        commitmentBonus: isCommitment,
        description: isCommitment ? description + " [承诺兑现]" : description,
        status: "pending",
        // 带上选中任务的分类（onXpTaskChangePage 已填入 xpCategoryPage，优先取它）
        xpCategory: selectedOpt?.dataset?.category || (document.getElementById("xpCategoryPage")?.value || ""),
        type: selectedOpt?.dataset?.category || (document.getElementById("xpCategoryPage")?.value || ""),
      }).then(async () => {
        // 打卡即完成约定：如果该任务是本周约定，自动标记完成
        // 1. 关联任务池的约定：通过 taskName 匹配
        // 2. 自由填写的约定：通过 text 匹配（从本周约定选的）
        try {
          const cfgNow = window.__lastCfg || {};
          const linkedTaskName = selectedOpt?.dataset?.taskname || taskName;
          const meeting = currentWeekMeeting(cfgNow.familyMeetings);
          if (meeting) {
            let changed = false;
            meeting.commitments.forEach(c => {
              if (c.completed) return;
              if (c.linked && c.taskName === linkedTaskName) { c.completed = true; changed = true; }
              else if (isCommitmentTask && !c.linked && c.text === taskName) { c.completed = true; changed = true; }
            });
            if (changed) {
              await window.DataStore.saveFamilyMeetings(cachedData && cachedData.familyMeetings || []);
              showToast("🎯 完成了一项约定！继续加油", true);
            }
          }
        } catch (e) {
          console.error("自动标记约定完成失败:", e);
        }
        await DataStore.refreshData(true);
        const cfg = await DataStore.loadData();
        const pending = cfg.pendingCount || (cfg.recentRecords || []).filter(r => r.status === "pending").length;
        closeXpModal();
        document.getElementById("xpTaskSelectPage").value = "";
        document.getElementById("xpValuePage").value = "";
        document.getElementById("xpCategoryPage").value = "";
        document.getElementById("xpDescPage").value = "";
        document.getElementById("xpCommitmentCheck").checked = false;
        document.getElementById("xpCommitmentHint").style.display = "none";
        const msg = isCommitment ? `✅ 已提交承诺任务，待确认 ${pending} 条（含承诺加成 +2 XP）` : `✅ 已提交，待确认 ${pending} 条`;
        showToast(msg, true);
        return renderXp();
      }).then(() => {
        refreshIcons(50);
      }).catch(e => {
        console.error("添加XP失败:", e);
        btn.textContent = originalText;
        btn.disabled = false;
        handleWriteError(e, "添加失败: " + (e.message || "未知错误"));
      });
    }
  
  


/* ===== Script block 6 (original lines 3298-3780) ===== */


  // ════════ 财务分析（复盘即财务分析：多笔拆分 + 自动算差额 + 每笔 +5 XP，每笔独立记录） ════════

  // 全局变量：当前自由基金余额
  let currentFreeBalance = 0;
  // 已拆分明细状态：{type, amount, content, worthIt, reason, suggestion}
  let recEntries = [];
  // 差额总金额（正=存入，负=支出）
  let recTotalDiff = 0;
  // 复盘模式：'balance' 余额计算 | 'item' 逐笔记录
  let recMode = 'balance';

  // 格式化金额
  function fmtMoney(value) {
    if (value === null || value === undefined || value === "") return "¥0.0";
    return "¥" + Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  // 获取值得的样式类

  // 打开新增弹窗
  function openReconcileModal() {
    document.getElementById("reconcileModalTitle").textContent = "财务分析";
    document.getElementById("submitBtn").textContent = "确认记录";
    document.getElementById("reconcileForm").reset();
    setRecMode('item');

    // 默认日期为今天
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("recDate").value = today;

    // 获取当前自由基金余额，初始化一条明细
    loadAppData().then(cfg => {
      const freeAcc = (cfg.finance?.accounts || []).find(a => a.key === "free");
      currentFreeBalance = freeAcc?.balance || 0;
      recEntries = [newEntry()];
      updateBalancePreview();
      renderRecEntries();
    });

    document.getElementById("reconcileModal").classList.add("active");
    if (window.lucide) refreshIcons(30);
  }

  // 切换复盘模式：逐笔记录 / 余额计算
  function setRecMode(mode) {
    recMode = mode;
    const btns = document.querySelectorAll(".rec-mode-btn");
    btns.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    const balanceSec = document.getElementById("recBalanceSection");
    if (balanceSec) balanceSec.style.display = mode === "balance" ? "" : "none";
    // 当前余额框在余额模式下才必填
    const curBal = document.getElementById("recCurrentBalance");
    if (curBal) curBal.required = mode === "balance";
    if (recEntries.length === 0) recEntries = [newEntry()];
    renderRecEntries();
    if (window.lucide) refreshIcons(20);
  }

  // 关闭弹窗
  function closeReconcileModal() {
    document.getElementById("reconcileModal").classList.remove("active");
  }

  // ════════ 财务进账（仅记录动作，不关联 XP） ════════
  let _finAccount = "wealth";
  function openFinanceEntryModal() {
    _finAccount = "wealth";
    document.getElementById("financeEntryForm").reset();
    document.getElementById("financeDate").value = new Date().toISOString().slice(0, 10);
    // 重置选中态
    document.querySelectorAll("#financeAccountGroup .pill").forEach(b => b.classList.toggle("active", b.dataset.finAccount === "wealth"));
    document.getElementById("financeEntryModal").classList.add("active");
    if (window.lucide) refreshIcons(30);
  }
  function closeFinanceEntryModal() {
    document.getElementById("financeEntryModal").classList.remove("active");
  }
  function setFinanceAccount(btn, account) {
    _finAccount = account;
    document.querySelectorAll("#financeAccountGroup .pill").forEach(b => b.classList.toggle("active", b === btn));
  }
  async function submitFinanceEntry(e) {
    if (e) e.preventDefault();
    const amount = Number(document.getElementById("financeAmount").value);
    if (!amount || amount <= 0) { alert("请输入有效金额"); return; }
    const source = document.getElementById("financeSource").value.trim();
    if (!source) { alert("请输入进账来源"); return; }
    const date = document.getElementById("financeDate").value || new Date().toISOString().slice(0, 10);
    const btn = document.getElementById("submitFinanceEntry");
    btn.disabled = true; btn.textContent = "记录中…";
    try {
      await window.DataStore.addFinanceRecord({
        type: "income",
        amount,
        account: _finAccount,
        category: source,
        description: source,
        date,
      });
      // 财务进账（仅记录动作，不关联 XP）
      closeFinanceEntryModal();
      // 不调用 refreshData()：DataStore.addFinanceRecord 已更新 cachedData，
      // 直接重渲染即可，避免重新加载 CDN 数据导致缓存覆盖
      await renderMoney();
      if (window.lucide) refreshIcons(50);
      alert(`✅ 已记录进账 ¥${amount} 到${_finAccount === "free" ? "自由基金" : "财富基金"}`);
    } catch (err) {
      console.error("财务进账失败:", err);
      handleWriteError(err, "提交失败，请稍后重试");
    } finally {
      btn.disabled = false;
      btn.textContent = "确认记录";
    }
  }

  // 新建一条空明细
  function newEntry() {
    return { type: "spend", amount: "", content: "", worthIt: "", reason: "", suggestion: "" };
  }

  // 计算剩余未记金额（所有条目手动填写，返回还剩多少没记完）
  function remainingDiff() {
    const filled = recEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return Math.abs(recTotalDiff) - filled;
  }

  // 更新余额预览 + 重算差额 + 重渲明细
  function updateBalancePreview() {
    const nowBalanceInput = document.getElementById("recCurrentBalance");
    const nowBalance = Number(nowBalanceInput.value) || 0;
    const hintEl = document.getElementById("previewHint");
    const diffEl = document.getElementById("previewExpense");

    // 还没填余额时，不显示差额
    if (!nowBalanceInput.value || nowBalanceInput.value === "") {
      document.getElementById("previewBegin").textContent = fmtMoney(currentFreeBalance);
      diffEl.textContent = "--";
      diffEl.style.color = "var(--neutral-400)";
      document.getElementById("previewEnd").textContent = "--";
      if (hintEl) hintEl.textContent = "请输入现在钱包里的余额";
      recTotalDiff = 0;
      renderRecEntries();
      return;
    }

    // 差额 = 现在余额 - 期初余额；负数=花出去（支出），正数=存入（收入）
    recTotalDiff = nowBalance - currentFreeBalance;

    document.getElementById("previewBegin").textContent = fmtMoney(currentFreeBalance);

    if (recTotalDiff < 0) {
      // 花出去了：显示负数
      diffEl.textContent = "-" + fmtMoney(Math.abs(recTotalDiff));
      diffEl.style.color = "var(--pink-600)";
      if (hintEl) {
        hintEl.textContent = `你花出去了 ${fmtMoney(Math.abs(recTotalDiff))}，请逐笔记录每一笔花在哪了`;
        hintEl.style.color = "var(--pink-600)";
      }
    } else if (recTotalDiff > 0) {
      // 余额增加了（非支出，复盘仅针对支出）
      diffEl.textContent = "+" + fmtMoney(recTotalDiff);
      diffEl.style.color = "var(--mint-600)";
      if (hintEl) {
        hintEl.textContent = `余额比上次多了 ${fmtMoney(recTotalDiff)}，复盘仅针对支出，无需逐笔记录存入`;
        hintEl.style.color = "var(--mint-600)";
      }
    } else {
      // 余额没变化
      diffEl.textContent = "¥0.00";
      diffEl.style.color = "var(--neutral-500)";
      if (hintEl) { hintEl.textContent = "余额没有变化，无需拆分"; hintEl.style.color = "var(--neutral-400)"; }
    }

    document.getElementById("previewEnd").textContent = fmtMoney(nowBalance);
    renderRecEntries();
  }

  // 渲染全部明细（所有条目手动填写，显示剩余差额进度）
  function renderRecEntries() {
    const list = document.getElementById("recEntryList");
    if (!list) return;
    if (recEntries.length === 0) recEntries = [newEntry()];

    const totalAbs = Math.abs(recTotalDiff);
    const filledSoFar = recEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const remaining = totalAbs - filledSoFar;
    const allDone = totalAbs <= 0 || remaining <= 0.009;

    list.innerHTML = recEntries.map((e, idx) => {
      const inputVal = e.amount === "" ? "" : Math.abs(Number(e.amount) || "");
      return `
        <div class="rec-entry" data-idx="${idx}">
          <div class="rec-entry-head">
            <span class="rec-entry-index">${idx + 1}</span>
            <span class="rec-entry-title">这笔花了什么</span>
            ${recEntries.length > 1 ? `<button type="button" class="rec-entry-del" onclick="removeRecEntry(${idx})"><i data-lucide="x" style="width:13px;height:13px"></i></button>` : ""}
          </div>

          <div class="rec-entry-amount-row">
            <div class="rec-entry-amount-box">
              <span class="cur">¥</span>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value="${inputVal}"
                onblur="onRecAmountChange(${idx}, this.value)" />
            </div>
          </div>

          <input class="rec-entry-content" placeholder="买了什么 / 花了什么？" value="${(e.content || "").replace(/"/g, "&quot;")}"
            oninput="onRecContentChange(${idx}, this.value)" />

          <div class="rec-entry-worth-row">
            ${["值得", "一般", "不值得"].map((w, wi) => `
              <div class="rec-entry-worth-opt ${wi === 0 ? "good" : wi === 1 ? "mid" : "bad"} ${e.worthIt === w ? "selected" : ""}" onclick="onRecWorthChange(${idx}, '${w}')">${wi === 0 ? "✨" : wi === 1 ? "🤔" : "💸"} ${w}</div>
            `).join("")}
          </div>

          <textarea class="rec-entry-reason" placeholder="原因说明：为什么买这个？当时怎么想的？" oninput="onRecReasonChange(${idx}, this.value)">${(e.reason || "").replace(/</g, "&lt;")}</textarea>
        </div>`;
    }).join("");

    // 剩余差额进度条（余额计算模式） / 支出汇总（逐笔记录模式）
    if (recMode === "item") {
      const spendSum = recEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      list.innerHTML += `
        <div class="rec-item-summary">
          <span>总支出 <b class="spend">${fmtMoney(spendSum)}</b></span>
        </div>`;
    } else {
      const pct = totalAbs > 0 ? Math.min(100, Math.round(filledSoFar / totalAbs * 100)) : 0;
      const remainingStr = totalAbs <= 0 ? "请先输入现在余额" : (!allDone ? `还差 ${fmtMoney(remaining)} 没记完` : "全部记完 ✓");
      list.innerHTML += `
        <div class="rec-entry-progress">
          <div class="rec-entry-progress-bar">
            <div class="rec-entry-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="rec-entry-progress-text" style="color:${totalAbs <= 0 ? 'var(--neutral-400)' : allDone ? 'var(--mint-600)' : 'var(--coral-600)'}">
            已记 ${fmtMoney(filledSoFar)} / ${fmtMoney(totalAbs)} · ${remainingStr}
          </div>
        </div>`;
    }
    if (window.lucide) refreshIcons(20);
  }

  // 添加一笔（插入到最前面，最新记录显示在最上方）
  function addRecEntry() {
    recEntries.unshift(newEntry());
    renderRecEntries();
  }

  // 删除一笔
  function removeRecEntry(idx) {
    if (recEntries.length <= 1) return;
    recEntries.splice(idx, 1);
    renderRecEntries();
  }

  // 明细金额变化
  function onRecAmountChange(idx, val) {
    const num = Math.max(0, Number(val) || 0);
    recEntries[idx].amount = num > 0 ? num : "";
    renderRecEntries();
  }

  // 明细说明变化
  function onRecContentChange(idx, val) {
    recEntries[idx].content = val;
  }

  // 是否值得变化
  function onRecWorthChange(idx, val) {
    recEntries[idx].worthIt = val;
    renderRecEntries();
  }

  // 原因说明变化
  function onRecReasonChange(idx, val) {
    recEntries[idx].reason = val;
  }

  // 提交对账（财务复盘：逐笔写入自由基金流水 + 本次复盘 +10 XP）
  async function submitReconciliation(event) {
    event.preventDefault();

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";

    const date = document.getElementById("recDate").value;
    const remaining = remainingDiff();

    // 校验：余额计算模式必须完整覆盖差额；逐笔记录模式不要求余额
    if (recMode === "balance" && remaining > 0.009) {
      submitBtn.disabled = false;
      submitBtn.textContent = "确认记录";
      alert(`还有 ${fmtMoney(remaining)} 没记完，请继续添加明细或修改金额。`);
      return;
    }
    // 余额计算模式下，余额增加（收入）不需要复盘，直接阻断提交
    if (recMode === "balance" && recTotalDiff > 0) {
      submitBtn.disabled = false;
      submitBtn.textContent = "确认记录";
      alert("当前余额比上次多了，复盘仅针对支出，余额增加无需记录。如需存入请使用「财务进账」功能。");
      return;
    }
    // 校验：每条明细必须有金额 + 说明 + 是否值得
    const entries = recEntries.map((e) => {
      return { ...e, amount: Number(e.amount) || 0 };
    });
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.amount || e.amount <= 0) {
        submitBtn.disabled = false;
        submitBtn.textContent = "确认记录";
        alert(`第 ${i + 1} 笔还没填金额`);
        return;
      }
      if (!e.content || !e.content.trim()) {
        submitBtn.disabled = false;
        submitBtn.textContent = "确认记录";
        alert(`第 ${i + 1} 笔还没填说明`);
        return;
      }
      if (!e.worthIt) {
        submitBtn.disabled = false;
        submitBtn.textContent = "确认记录";
        alert(`第 ${i + 1} 笔还没选「是否值得」`);
        return;
      }
      if (!e.reason || !e.reason.trim()) {
        submitBtn.disabled = false;
        submitBtn.textContent = "确认记录";
        alert(`第 ${i + 1} 笔还没填原因，请说明为什么买这个`);
        return;
      }
    }

    try {
      // 逐笔写入财务流水（复盘仅针对支出，全部记为支出）
      for (const e of entries) {
        const signedAmt = -Math.abs(e.amount);
        await window.DataStore.addFinanceRecord({
          date,
          type: 'expense',
          amount: Math.abs(e.amount),
          rawAmount: signedAmt,
          account: "free",
          accountType: "自由基金账户",
          description: e.content.trim(),
          category: e.content.trim(),
          worthIt: e.worthIt,
          reason: (e.reason || "").trim(),
          suggestion: "",
        });
      }

      // 本次财务分析（复盘即财务分析）：每笔复盘记录 → addFinanceRecord 已自动生成 XP，无需再重复生成
      closeReconcileModal();
      // 不调用 refreshData()：addFinanceRecord 和 addXpRecord 已更新 cachedData，
      // 直接重渲染即可，避免重新加载 CDN 数据导致缓存覆盖
      await renderMoney();
      if (window.lucide) refreshIcons(50);
      if (entries.length > 0) {
        const _financeRule = (cachedData?.config?.xpRuleList || []).find(function(r){return (r.name||"").indexOf("财务能力分析")>=0});
        const _perRecXp = (_financeRule && Number(_financeRule.xp)) ? Number(_financeRule.xp) : 5;
        const _totalXp = entries.length * _perRecXp;
        alert(`已记录 ${entries.length} 笔财务流水，完成财务分析，共 +${_totalXp} XP（每笔 +${_perRecXp} XP）🎉`);
      }
    } catch (e) {
      console.error("提交失败:", e);
      handleWriteError(e, "提交失败，请稍后重试");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "确认记录";
    }
  }

  
  


/* ===== Script block 7 (original lines 3780-8485) ===== */


/**
 * Yara 成长工作台 - 主脚本
 * 说明：本项目为单体 JS，所有渲染、交互、事件逻辑集中在此文件。
 * 历史遗留的 assets/modules/ 模块源已废弃删除，此文件为唯一真相源，请直接编辑。
 */

// ═══════════════════════════════════════════════════════════
// MODULE: constants.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// constants.js — 全局常量
// ═══════════════════════════════════════════════════════════════

const statusText = { pending: "待确认", verified: "已通过", returned: "已退回" };

// 等级色系映射
const LEVEL_THEME = {
  "萌新":   { card: "journey-card-mint",     profile: "level-mint" },
  "青铜":   { card: "journey-card-sky",      profile: "level-sky" },
  "白银":   { card: "journey-card-lavender", profile: "level-lavender" },
  "黄金":   { card: "journey-card-butter",   profile: "level-butter" },
  "铂金":   { card: "journey-card-candy",    profile: "level-candy" },
  "钻石":   { card: "journey-card-deeplav",  profile: "level-deeplav" },
  "星耀":   { card: "journey-card-coral",    profile: "level-coral" },
  "王者":   { card: "journey-card-lime",     profile: "level-lime" },
  "大师":   { card: "journey-card-deepblue", profile: "level-deepblue" },
  "至尊":   { card: "journey-card-rainbow",  profile: "level-rainbow" },
};

// 科目配置
const SUBJECT_CONFIG = {
  "语文": { cls: "cn", icon: "book-open", order: 1, modules: ["拼音", "汉字", "组词", "阅读", "作文"] },
  "数学": { cls: "math", icon: "calculator", order: 2, modules: ["概念", "公式定理", "计算", "推理", "直觉"] },
  "英语": { cls: "en", icon: "languages", order: 3, modules: ["听说", "单词", "语感", "阅读", "写作"] },
};

// XP 分类配色
const CAT_COLORS = {
  "学习成长": "#82d632",
  "兴趣爱好": "#f96024",
  "身体成长": "#36b98b",
  "能力成长": "#fdd832",
};

const WCPALETTE = {
  "学习成长": { color: "#508e1c", bg: "#eefdd9", dot: "#82d632" },
  "兴趣爱好": { color: "#b93a13", bg: "#fff7f2", dot: "#f96024" },
  "身体成长": { color: "#21755b", bg: "#e0faf0", dot: "#36b98b" },
  "能力成长": { color: "#9a7b00", bg: "#fffde5", dot: "#fdd832" },
};

// 三大板块 ←→ XP分类 映射：整个系统分能量/知识/财务三个板块，各板块操作都积累能量（XP）
const MODULE_XP_TAG = {
  energy:   { label: "能量板块", cats: ["身体成长", "兴趣爱好"] },
  knowledge:{ label: "知识板块", cats: ["学习成长"] },
  finance:  { label: "财务板块", cats: ["能力成长"] },
};

// 汇总各板块累计能量（XP）
function buildModuleEnergy(verifiedXpRecords) {
  const result = [
    { key: "energy",   label: "能量板块", xp: 0 },
    { key: "knowledge",label: "知识板块", xp: 0 },
    { key: "finance",  label: "财务板块", xp: 0 },
  ];
  (verifiedXpRecords || []).forEach(r => {
    const cat = r.xpCategory || r.taskCategory || "其他";
    for (const m of result) {
      if (MODULE_XP_TAG[m.key].cats.includes(cat)) { m.xp += (Number(r.xp) || 0); break; }
    }
  });
  return result;
}

// 渲染"能量获取细节"：三大板块能量来源（按各功能指定配色）+ 激励文案

// 成绩等级配置
const GRADE_CONFIG = {
  "A+": { cls: "grade-a-plus", color: "#10b981", order: 0 },
  "A":  { cls: "grade-a", color: "#6366f1", order: 1 },
  "B+": { cls: "grade-b-plus", color: "#f59e0b", order: 2 },
  "B":  { cls: "grade-b", color: "#ef4444", order: 3 },
};

const GRADE_ORDER = ["A+", "A", "B+", "B"];

// ═══════════════════════════════════════════════════════════
// MODULE: utils.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// utils.js — 通用工具函数
// ═══════════════════════════════════════════════════════════════

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "暂无数据";
  return "¥" + Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// ── DOM 安全操作工具 ──

// 按 id 设置 textContent（元素不存在时静默跳过）
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// 对已获取的元素设置 textContent（为 null/undefined 时跳过）
function setElText(el, text) {
  if (el) el.textContent = text;
}

// ── 数学/计算工具 ──

// 安全计算百分比，total 为 0 时返回 0
function pct(part, total, decimals) {
  if (!total || total === 0) return 0;
  const d = decimals != null ? decimals : 0;
  const factor = Math.pow(10, d);
  return Math.round((part / total) * 100 * factor) / factor;
}

// ── 日期工具 ──

// 从记录中统一提取日期字符串（兼容 date / datetime / time 字段）
function getDateStr(record) {
  return (record.date || record.datetime || record.time || "").slice(0, 10);
}

// ── UI 刷新工具 ──

// 统一刷新 lucide 图标
// 防抖 + requestAnimationFrame 双保险：同一帧内多次调用只执行一次，避免重复扫描 DOM
let __iconRefreshTimer = null;
// 全局图标刷新去重：同一帧内多次调用只执行一次，避免 44 次冗余扫描
let __iconRefreshQueued = false;
function refreshIcons(delay) {
  if (!window.lucide) return;
  if (__iconRefreshQueued) return;
  __iconRefreshQueued = true;
  const doRefresh = () => {
    lucide.createIcons();
    __iconRefreshQueued = false;
  };
  if (delay != null && delay > 0) {
    __iconRefreshTimer = setTimeout(() => requestAnimationFrame(doRefresh), delay);
  } else {
    requestAnimationFrame(doRefresh);
  }
}

// ── 交互工具 ──

/**
 * 初始化 Tab 切换组
 * @param {string} selector - Tab 按钮选择器
 * @param {string} dataAttr - 取值的 data 属性名（如 "range" / "k" / "view"）
 * @param {Function} onChange - 切换回调，参数为 (value, activeTabEl)
 * @param {string} [defaultValue] - 默认激活的值，不传则用第一个
 */
function initTabGroup(selector, dataAttr, onChange, defaultValue) {
  const tabs = document.querySelectorAll(selector);
  if (tabs.length === 0) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const value = tab.dataset[dataAttr];
      if (onChange) onChange(value, tab);
    });
  });

  // 设置默认激活
  if (defaultValue != null) {
    const defaultTab = Array.from(tabs).find(t => t.dataset[dataAttr] === defaultValue);
    if (defaultTab) {
      tabs.forEach(t => t.classList.remove("active"));
      defaultTab.classList.add("active");
    }
  }
}

// ── 数据聚合工具 ──

/**
 * 按 key 将数组分组到子数组
 * @param {Array} arr - 源数组
 * @param {Function|string} keyFn - 分组 key 函数或字段名
 * @returns {Object} { key1: [item1, item2], key2: [...] }
 */
function groupBy(arr, keyFn) {
  const result = {};
  const getKey = typeof keyFn === "function" ? keyFn : (item => item[keyFn]);
  (arr || []).forEach(item => {
    const key = getKey(item);
    if (!key && key !== 0) return; // 跳过 null/undefined/空字符串（0 是有效 key）
    if (!result[key]) result[key] = [];
    result[key].push(item);
  });
  return result;
}

/**
 * 按 key 分组求和
 * @param {Array} arr - 源数组
 * @param {Function|string} keyFn - 分组 key 函数或字段名
 * @param {Function|string} valueFn - 取值函数或字段名，默认 1（计数）
 * @returns {Object} { key1: sum1, key2: sum2 }
 */
function groupSum(arr, keyFn, valueFn) {
  const result = {};
  const getKey = typeof keyFn === "function" ? keyFn : (item => item[keyFn]);
  const getVal = valueFn != null
    ? (typeof valueFn === "function" ? valueFn : (item => Number(item[valueFn]) || 0))
    : () => 1;
  (arr || []).forEach(item => {
    const key = getKey(item);
    if (!key && key !== 0) return; // 跳过 null/undefined/空字符串（0 是有效 key）
    result[key] = (result[key] || 0) + getVal(item);
  });
  return result;
}

// ── 空状态模板 ──

/**
 * 生成 empty-state 空状态 HTML（带可选 lucide 图标）
 * @param {string} icon - lucide 图标名称（可选）
 * @param {string} text - 提示文字
 * @returns {string} HTML 字符串
 */
function emptyStateHTML(icon, text) {
  if (icon) {
    return `<div class="empty-state"><i data-lucide="${icon}"></i><div>${text}</div></div>`;
  }
  return `<div class="empty-state">${text}</div>`;
}

// 将十六进制颜色转为 RGB 数组
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6 && h.length !== 3) return null;
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 将颜色变浅（mix 比例 0~1，越接近 1 越接近白色）
function lightenColor(hex, mix = 0.5) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#f3f4f6";
  const out = rgb.map(c => Math.round(c + (255 - c) * mix));
  return "#" + out.map(c => c.toString(16).padStart(2, "0")).join("");
}

// 获取科目的展示配置（颜色/图标），优先用配置表，回退到内置映射
function getSubjectVisual(sub, configSubjects) {
  const base = {
    color: "",
    icon: "",
  };
  if (configSubjects) {
    const found = configSubjects.find(s => s.name === sub);
    if (found) {
      base.color = found.color || "";
      base.icon = found.icon || "";
    }
  }
  return base;
}

function weekdayText(date) {
  return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][date.getDay()];
}

function formatAge(birthday) {
  if (!birthday) return "";
  const birth = new Date(birthday + "T00:00:00");
  if (isNaN(birth.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  let days = today.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years}岁${months}个月${days}天`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  if (diffDays === 0) return `今天（${md} ${wd}）`;
  if (diffDays === -1) return `昨天（${md} ${wd}）`;
  if (diffDays === 1) return `明天（${md} ${wd}）`;
  return `${md} ${wd}`;
}

function escapeHtmlReason(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * renderHighlighted — 安全HTML转义后，将 **关键词** 转为高亮 span，
 * 并将数字/百分比/XP值等关键数据自动标记为金色高亮。
 * 两步处理：先转义避免XSS，再替换标记和数字。
 */
function renderHighlighted(text) {
  if (!text) return "";
  // 1. 安全转义
  const div = document.createElement("div");
  div.textContent = text;
  var safe = div.innerHTML;
  // 2. 用占位符保护 AI 已有的 **标记**，防止兜底时重复包裹
  var hlPlaceholders = [];
  safe = safe.replace(/\*\*([^*]+)\*\*/g, function(m, inner) {
    var idx = hlPlaceholders.length;
    hlPlaceholders.push(inner);
    return '\x00HL' + idx + '\x00';
  });
  // 3. 兜底：在剩余纯文本中把表扬关键词也包上 **标记**（不会破坏已有占位符）
  var praiseWords = ["说到做到", "小达人", "小书虫", "遵守约定", "遵守了约定", "好习惯", "真了不起", "为你骄傲", "闪闪发光", "自律", "真棒", "了不起", "超棒", "负责任", "有责任感", "兑现了承诺", "好孩子"];
  for (var pi = 0, pw; pi < praiseWords.length; pi++) {
    pw = praiseWords[pi];
    safe = safe.replace(new RegExp(pw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '**' + pw + '**');
  }
  // 4. 恢复占位符 → <span class="hl">，同时把兜底新增的 **标记** 也转成 <span class="hl">
  safe = safe.replace(/\x00HL(\d+)\x00/g, function(m, idx) {
    return '<span class="hl">' + hlPlaceholders[parseInt(idx)] + '</span>';
  });
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<span class="hl">$1</span>');
  return safe;
}

// ── DOM 选择工具 ──

function getModuleOptions(subject) {
  // 优先使用从 API 动态加载的模块（存在且已加载时）
  if (typeof DE_LOADED_MODULES !== "undefined" && DE_LOADED_MODULES && DE_LOADED_MODULES[subject]) {
    return DE_LOADED_MODULES[subject];
  }
  return SUBJECT_CONFIG[subject]?.modules || [];
}

function updateModuleCheckboxes(subject, selectedModules) {
  const group = document.getElementById("editModuleGroup");
  if (!group) return;
  const options = getModuleOptions(subject);
  const selSet = new Set(selectedModules || []);
  group.innerHTML = options.map(m => `
    <label class="choice-pill ${selSet.has(m) ? "checked" : ""}">
      <input type="checkbox" name="editModule" value="${m}" ${selSet.has(m) ? "checked" : ""}>${m}
    </label>
  `).join("");
  group.querySelectorAll(".choice-pill").forEach(pill => {
    pill.addEventListener("click", function(e) {
      const cb = this.querySelector("input");
      cb.checked = !cb.checked;
      this.classList.toggle("checked", cb.checked);
      e.preventDefault();
    });
  });
}

function getCheckedEditModules() {
  return Array.from(document.querySelectorAll("#editModuleGroup input:checked")).map(cb => cb.value);
}

function getRadioValue(groupId) {
  const checked = document.querySelector(`#${groupId} input:checked`);
  return checked ? checked.value : "";
}

function setRadioValue(groupId, value) {
  const input = document.querySelector(`#${groupId} input[value="${value}"]`);
  if (input) {
    input.checked = true;
    const group = document.getElementById(groupId);
    if (group) {
      group.querySelectorAll(".choice-pill").forEach(p => p.classList.remove("checked"));
      const pill = input.closest(".choice-pill");
      if (pill) pill.classList.add("checked");
    }
  }
}

function initChoicePills(root = document) {
  root.querySelectorAll(".choice-pill").forEach(pill => {
    if (pill.dataset.choiceInit) return;
    pill.dataset.choiceInit = "1";
    pill.addEventListener("click", function(e) {
      const input = this.querySelector("input");
      if (!input) return;
      if (input.type === "radio") {
        const group = this.closest(".choice-group");
        if (group) {
          group.querySelectorAll(".choice-pill").forEach(p => p.classList.remove("checked"));
          group.querySelectorAll("input").forEach(inp => inp.checked = false);
        }
        input.checked = true;
        this.classList.add("checked");
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (input.type === "checkbox") {
        input.checked = !input.checked;
        this.classList.toggle("checked", input.checked);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      e.preventDefault();
    });
  });
}

// ═══════════════════════════════════════════════════════════
// MODULE: data.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// data.js — 数据加载与计算函数
// ═══════════════════════════════════════════════════════════════

// 安全加载数据：优先从 DataStore 加载，失败则回退到内嵌配置
async function loadAppData() {
  let data;
  try {
    if (window.DataStore && typeof window.DataStore.loadData === "function") {
      data = await window.DataStore.loadData();
    } else {
      data = window.GROWTH_CONFIG || {};
    }
  } catch (e) {
    console.warn("数据加载失败，使用空数据:", e);
    data = {};
  }

  // 确保各字段有默认空值（防止渲染时报错）
  if (!data) data = {};
  if (!data.study) data.study = {};
  if (!data.study.allHomework) data.study.allHomework = [];
  if (!data.study.evaluations) data.study.evaluations = [];
  if (!data.study.strengthsAnalysis) data.study.strengthsAnalysis = {};
  if (!data.study.subjects) data.study.subjects = [];
  if (!data.study.homework) data.study.homework = {};
  if (!data.study.recentAssignments) data.study.recentAssignments = [];
  if (!data.finance) data.finance = {};
  if (!data.finance.accounts) data.finance.accounts = [];
  if (!data.finance.recentTransactions) data.finance.recentTransactions = [];
  if (!data.recentRecords) data.recentRecords = [];
  if (!data.levels) data.levels = [];
  if (!data.xpSources) data.xpSources = [];
  if (!data.config) data.config = {};
  if (!data.config.xpRules) data.config.xpRules = {};
  if (!data.config.xpRuleList) data.config.xpRuleList = [];

  // 缓存到全局，供设置面板等需要同步访问 child 数据的地方使用
  window.__lastData = data;
  return data;
}

function getLevelProgress(cfg) {
  const current = cfg.currentXP || 0;
  
  // P2 优化：优先使用服务端计算好的等级数据（服务端返回了 currentLevel/nextLevel/levelProgress）
  if (cfg.currentLevel && cfg.nextLevel && cfg.levelProgress !== undefined) {
    return {
      current,
      currentLevel: cfg.currentLevel,
      nextLevel: cfg.nextLevel,
      progress: cfg.levelProgress
    };
  }
  
  // fallback：前端自己计算（当数据来自 localStorage/seed 等非服务端来源时）
  const levels = cfg.levels || [];
  const currentLevel = [...levels].reverse().find(level => current >= level.xp) || levels[0];
  // 满级时 nextLevel 为 null，进度直接为 100%
  const nextLevel = levels.find(level => level.xp > current) || null;
  const previousXp = currentLevel?.xp || 0;
  const nextXp = nextLevel?.xp || previousXp || 1;
  const progress = nextLevel
    ? Math.min(100, Math.round(Math.max(0, ((current - previousXp) / (nextXp - previousXp || 1)) * 100)))
    : 100;
  return { current, currentLevel, nextLevel, progress };
}

// 归一化作业数组：兼容“按日期分组 {date,items}”与“平铺 {id,...}”两种结构，
// 统一返回带 dueDate 的作业对象数组（平铺记录也会被纳入，避免被列表静默跳过）
function collectAssignments(allHomework) {
  const out = [];
  (Array.isArray(allHomework) ? allHomework : []).forEach(g => {
    if (!g) return;
    if (Array.isArray(g.items)) {
      g.items.forEach(a => out.push(Object.assign({}, a, { dueDate: a.dueDate || g.date || '' })));
    } else if (g && g.id) {
      out.push(Object.assign({}, g, { dueDate: g.dueDate || '' }));
    }
  });
  return out;
}

function getAllAssignments(cfg) {
  const study = cfg.study || {};
  return collectAssignments(study.allHomework);
}

// 本地更新作业数据（API 不可用时的回退方案）
// 注意：此函数是写入链路的最后防线，必须同时更新缓存和写文件，否则刷新后数据丢失
async function updateHomeworkLocally(homeworkId, fields) {
  _dataGen++;
  const data = await loadAppData();
  const groups = data.study?.allHomework || [];
  let found = false;
  // 兼容分组记录与平铺记录两种结构
  for (const group of groups) {
    if (group && Array.isArray(group.items)) {
      const items = group.items;
      for (const item of items) {
        if (item && item.id === homeworkId) {
          Object.assign(item, fields);
          found = true;
          break;
        }
      }
    } else if (group && group.id === homeworkId) {
      Object.assign(group, fields);
      found = true;
    }
    if (found) break;
  }
  if (found) {
    // 写入文件（复用 writeGithubFile 的本地优先/远程双模式）
    try {
      await writeGithubFile('study.json', data.study, '本地更新作业: ' + homeworkId);
    } catch (e) {
      console.warn('updateHomeworkLocally 写文件失败:', e.message);
      // 即使写文件失败，也要确保缓存持久化，刷新时至少 localStorage 还有数据
    }
    _persistCache();
  }
}

// ═══════════════════════════════════════════════════════════
// MODULE: charts.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// charts.js — 图表渲染函数
// ═══════════════════════════════════════════════════════════════

// ════════ 环形占比图（Donut Chart） ════════
function renderDonutChart(items, size, strokeWidth, centerValue, centerLabel) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  const total = items.reduce((s, item) => s + (item.value || 0), 0);
  if (total === 0) {
    return `
      <svg viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--neutral-100)" stroke-width="${strokeWidth}"/>
      </svg>`;
  }

  let offset = 0;
  const segments = items.map((item, idx) => {
    const value = item.value || 0;
    const portion = value / total;
    const dashLength = portion * circumference;
    const gapLength = circumference - dashLength;
    const color = item.color || '#36b98b';
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${dashLength} ${gapLength}" stroke-dashoffset="${-offset}" stroke-linecap="butt"
      style="transition: stroke-dasharray .8s ease, stroke-dashoffset .8s ease"/>`;
    offset += dashLength;
    return seg;
  }).join("");

  const centerHtml = `
    <div class="donut-center-inner" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <span style="font:800 ${Math.round(size * 0.2)}px/1 var(--font-display);color:var(--neutral-900);letter-spacing:-.02em">${centerValue !== undefined ? centerValue : total}</span>
      <span style="font-size:${Math.round(size * 0.08)}px;font-weight:700;color:var(--neutral-500);margin-top:2px;letter-spacing:.04em">${centerLabel || 'TOTAL'}</span>
    </div>`;

  return { svg: `<svg viewBox="0 0 ${size} ${size}">${segments}</svg>`, center: centerHtml };
}

// ════════ 雷达图（Radar Chart） ════════
function renderRadarChart(modNames, values, colors, size = 160) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const levels = 4;
  const n = modNames.length;

  function getPoint(angle, radius) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function polygonPoints(radius, startAngle = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const angle = startAngle + (360 / n) * i;
      const p = getPoint(angle, radius);
      pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return pts.join(" ");
  }

  let gridPolygons = "";
  for (let l = 1; l <= levels; l++) {
    const r = (maxR / levels) * l;
    const opacity = l === levels ? 0.12 : 0.06;
    gridPolygons += `<polygon points="${polygonPoints(r)}" fill="${colors.main}" fill-opacity="${opacity}" stroke="${colors.main}" stroke-opacity="0.15" stroke-width="1"/>`;
  }

  let axisLines = "";
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i;
    const p = getPoint(angle, maxR);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${colors.main}" stroke-opacity="0.12" stroke-width="1"/>`;
  }

  const maxVal = Math.max(...values, 1);
  const dataPoints = [];
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i;
    const val = values[i] / maxVal;
    const r = maxR * val;
    const p = getPoint(angle, r);
    dataPoints.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  const dataPolygon = `<polygon points="${dataPoints.join(" ")}" fill="${colors.main}" fill-opacity="0.25" stroke="${colors.stroke}" stroke-width="2" stroke-linejoin="round"/>`;

  let dataDots = "";
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i;
    const val = values[i] / maxVal;
    const r = maxR * val;
    const p = getPoint(angle, r);
    dataDots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${colors.stroke}" stroke="#fff" stroke-width="1.5"/>`;
  }

  let labels = "";
  const labelR = maxR + 18;
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i;
    const p = getPoint(angle, labelR);
    const textAnchor = Math.abs(p.x - cx) < 5 ? "middle" : (p.x > cx ? "start" : "end");
    labels += `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${textAnchor}" dominant-baseline="middle" font-size="11" font-weight="600" fill="#6b7280">${modNames[i]}</text>`;
  }

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="radar-svg">
    ${gridPolygons}
    ${axisLines}
    ${dataPolygon}
    ${dataDots}
    ${labels}
  </svg>`;
}

// ════════ 横向条形图（Bar Rows） ════════
/**
 * 通用横向条形图组件，用于频次/分值等排行展示
 * @param {Array} items - 数据项，每项 { name, value, color, icon }
 * @param {Object} options - 配置项
 * @param {string} options.emptyText - 空状态文案
 * @param {string} options.unit - 值的单位后缀（如 " 次"、" XP"）
 * @param {boolean} options.showPercent - 是否在右侧显示占总量百分比
 * @param {boolean} options.gradient - 进度条是否使用渐变色
 * @param {boolean} options.sort - 是否按 value 降序排序
 * @returns {string} HTML 字符串
 */
function renderBarRows(items, options) {
  const opts = options || {};
  const emptyText = opts.emptyText || "暂无数据";
  const unit = opts.unit || "";
  const showPercent = opts.showPercent !== false;
  const gradient = opts.gradient === true;
  const doSort = opts.sort !== false;

  if (!items || items.length === 0) {
    return `<div style="font-size:12px;color:var(--neutral-400);text-align:center;padding:30px 0">${emptyText}</div>`;
  }

  const list = doSort ? [...items].sort((a, b) => (b.value || 0) - (a.value || 0)) : items;
  const total = list.reduce((s, d) => s + (d.value || 0), 0);
  const maxVal = Math.max(...list.map(d => d.value || 0), 1);

  return list.map(d => {
    const val = d.value || 0;
    const pctVal = showPercent ? pct(val, total) : 0;
    const barPct = pct(val, maxVal);
    const barColor = gradient
      ? `linear-gradient(90deg, ${d.color}, ${d.color}dd)`
      : d.color;

    return `
      <div class="bar-row">
        <div class="bar-row-head">
          <span class="bar-row-name">
            <span class="bar-row-dot" style="background:${d.color}"></span>
            ${d.icon ? d.icon + " " : ""}${d.name}
          </span>
          <span class="bar-row-meta"><b>${val}</b>${unit}${showPercent ? ` · ${pctVal}%` : ""}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${barPct}%;background:${barColor}"></div>
        </div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// MODULE: render-home.js
// ═══════════════════════════════════════════════════════════

// 首页渲染缓存：只在数据版本变化时重新计算
let _lastHomeDataVersion = -1;
let _lastHomeCfgHash = '';

// ═══════════════════════════════════════════════════════════════
// render-home.js — 首页渲染
// ═══════════════════════════════════════════════════════════════

// ════════ 页面名言（每次进入随机切换一条，贴合各板块主题） ════════
// 能量 → 自律 / 自我提升 / 正能量
const XP_INTROS = [
  "“征服自己的一切弱点，正是一个人伟大的起始。” —— 沈从文",
  "“志之难也，不在胜人，在自胜。” —— 《韩非子》",
  "“习惯是一种顽强而巨大的力量，它可以主宰人生。” —— 培根",
  "“种下一种行为，收获一种习惯；种下一种习惯，收获一种性格；种下一种性格，收获一种命运。” —— 威廉·詹姆斯",
  "“胜人者有力，自胜者强。” —— 老子",
  "“天行健，君子以自强不息。” —— 《周易》",
  "“不积跬步，无以至千里；不积小流，无以成江海。” —— 荀子",
  "“锲而不舍，金石可镂。” —— 荀子",
  "“三军可夺帅也，匹夫不可夺志也。” —— 孔子",
  "“宝剑锋从磨砺出，梅花香自苦寒来。” —— 《警世贤文》",
  "“少壮不努力，老大徒伤悲。” —— 《长歌行》",
  "“吾日三省吾身。” —— 曾子",
  "“有志者，事竟成。” —— 《后汉书》",
  "“业精于勤，荒于嬉；行成于思，毁于随。” —— 韩愈",
  "“我未曾见过一个早起、勤奋、谨慎、诚实的人抱怨命运不好。” —— 本杰明·富兰克林"
];
// 知识 → 学习 / 求知 / 沉淀
const STUDY_INTROS = [
  "“学而不思则罔，思而不学则殆。” —— 孔子",
  "“知识就是力量。” —— 培根",
  "“书籍是人类进步的阶梯。” —— 高尔基",
  "“博观而约取，厚积而薄发。” —— 苏轼",
  "“书山有路勤为径，学海无涯苦作舟。” —— 韩愈",
  "“温故而知新，可以为师矣。” —— 孔子",
  "“知之者不如好之者，好之者不如乐之者。” —— 孔子",
  "“敏而好学，不耻下问。” —— 孔子",
  "“三人行，必有我师焉。” —— 孔子",
  "“吾生也有涯，而知也无涯。” —— 庄子",
  "“读万卷书，行万里路。” —— 董其昌",
  "“为中华之崛起而读书。” —— 周恩来",
  "“玉不琢，不成器；人不学，不知义。” —— 《三字经》",
  "“凡有所学，皆成性格。” —— 培根",
  "“不读书的人，思想就会停止。” —— 狄德罗"
];
// 财富 → 金钱财富观念
const MONEY_INTROS = [
  "“君子爱财，取之有道。” —— 《增广贤文》",
  "“如果你懂得使用，金钱是一个好奴仆；如果你不懂得使用，它就变成你的主人。” —— 马克·吐温",
  "“开始存钱并及早投资，这是最值得养成的好习惯。” —— 巴菲特",
  "“不要把所有的鸡蛋放在同一个篮子里。” —— 西方投资格言",
  "“由俭入奢易，由奢入俭难。” —— 司马光",
  "“历览前贤国与家，成由勤俭破由奢。” —— 李商隐",
  "“滴水成河，粒米成箩。” —— 民间谚语",
  "“财富不是朋友，朋友却是财富。” —— 谚语",
  "“钱能买到的东西，往往不需要多少钱。” —— 培根",
  "“我不以穷为耻，但我更不以此为荣。” —— 富兰克林",
  "“节约就是最大的财富。” —— 谚语",
  "“财富就像海水，喝得越多越口渴。” —— 叔本华",
  "“省下一分钱，就是赚到一分钱。” —— 富兰克林",
  "“储钱是未雨绸缪，花钱是量入为出。” —— 理财格言",
  "“知足者富，强行者有志。” —— 老子"
];

// 名言选择：每个板块维护"最近 2 周使用记录"，优先挑 2 周内没用过的句子；
// 若全部都在 2 周内用过，则重置一轮（选距今最久没用的，并清空历史）。
function pickQuote(key, arr) {
  const STORE = "quoteHistory_" + key;
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { hist = []; }
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000; // 2 周
  const recent = new Set(hist.filter(h => h.ts > cutoff).map(h => h.i));
  let idx;
  const freshPool = arr.map((_, i) => i).filter(i => !recent.has(i));
  if (freshPool.length === 0) {
    // 全部在 2 周内用过：取距今最久的一条，并重置历史，开始新的一轮
    const oldest = hist.slice().sort((a, b) => a.ts - b.ts)[0];
    idx = oldest ? oldest.i : Math.floor(Math.random() * arr.length);
    hist = [];
  } else {
    idx = freshPool[Math.floor(Math.random() * freshPool.length)];
  }
  hist.push({ i: idx, ts: Date.now() });
  hist = hist.filter(h => h.ts > cutoff);
  try { localStorage.setItem(STORE, JSON.stringify(hist)); } catch (e) { /* ignore */ }
  return arr[idx];
}

// 连续活跃天数：从今天(或昨天)起往前数，有任意已通过 XP 记录即算一天，遇断档即停
function getCheckInStreak(cfg) {
  const set = new Set();
  (cfg.xpRecords || []).forEach(r => {
    if (r.reviewStatus === "已通过" || r.status === "verified") {
      set.add(getDateStr(r));
    }
  });
  const tmp = new Date();
  if (!set.has(tmp.toISOString().slice(0, 10))) tmp.setDate(tmp.getDate() - 1);
  let streak = 0;
  while (set.has(tmp.toISOString().slice(0, 10))) { streak++; tmp.setDate(tmp.getDate() - 1); }
  return streak;
}

// 本周已点亮的知识星星（本周完成的作业数）
function getWeekStars(cfg) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const mondayStr = monday.toISOString().slice(0, 10);
  const groups = (cfg.study && cfg.study.allHomework) || [];
  let count = 0;
  groups.forEach(g => {
    const gd = (g.date || "").slice(0, 10);
    if (gd && gd >= mondayStr) {
      (g.items || []).forEach(a => { if (a.status === "done") count++; });
    }
  });
  return count;
}

// 距离下次零花钱发放还差几天（按每周五发放）
function getDaysToAllowance() {
  const day = new Date().getDay(); // 周日=0, 周一=1, ..., 周五=5, 周六=6
  return day === 5 ? 0 : (5 - day + 7) % 7;
}

// 三大板块积分归类：从 XP 获得记录关联（作业→已完成作业、财务→财务流水、其余→主动打卡）
// 依据 XP 记录的任务名归属：以"作业·"开头或"成绩录入"＝知识板块；含"财务/花销"＝财务板块；其余＝能量板块
function getPlanetXp(verifiedXpRecords) {
  const result = { energy: 0, knowledge: 0, finance: 0 };
  (verifiedXpRecords || []).forEach(r => {
    const name = String(r.taskName || r.title || "");
    const desc = String(r.description || "");
    const xp = Number(r.xp) || 0;
    // 知识板块：taskName 包含"作业"/"成绩录入"，或 description 以"完成"结尾（兼容手动录入的作业完成记录）
    if (name.indexOf("作业") >= 0 || name.indexOf("成绩录入") >= 0 || /完成$/.test(desc)) {
      result.knowledge += xp;
    } else if (name === "财务能力分析") {
      // 财务板块：只计"财务能力分析"（财务复盘），不包"财务进账"和"花销复盘"
      result.finance += xp;
    } else if (name.indexOf("财务") >= 0 || name.indexOf("花销") >= 0) {
      // 财务进账（2 XP）、花销复盘等不计入任何板块，避免串到能量板块
      // skip
    } else {
      result.energy += xp;
    }
  });
  return result;
}

async function renderHome() {
  // 首页渲染缓存：如果数据版本未变且配置哈希未变，跳过重渲染
  const cfg = await loadAppData();
  if (_lastHomeDataVersion === __dataVersion && _lastHomeCfgHash === (cfg.config?.xpRuleList?.length || '') + '-' + (cfg.xpRecords?.length || '') + '-' + (cfg.study?.allHomework?.length || '')) {
    return; // 数据没变，跳过重渲染
  }
  _lastHomeDataVersion = __dataVersion;
  _lastHomeCfgHash = (cfg.config?.xpRuleList?.length || '') + '-' + (cfg.xpRecords?.length || '') + '-' + (cfg.study?.allHomework?.length || '');
  window.__lastCfg = cfg;
  const xp = getLevelProgress(cfg);
  const homework = cfg.study?.homework || {};
  const pendingCount = cfg.pendingCount || (cfg.recentRecords || []).filter(r => r.status === "pending").length;
  const pendingXp = (cfg.recentRecords || []).find(r => r.status === "pending");
  const pendingHomework = (cfg.study?.recentAssignments || []).find(a => a.status !== "done" || !a.submitted);
  const nextGap = Math.max(0, (xp.nextLevel?.xp || xp.current) - xp.current);

  // 三大板块积分（从 XP 获得记录关联：作业→已完成作业、财务→财务流水、其余→主动打卡）
  const verifiedXp = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
  const planetXp = getPlanetXp(verifiedXp);
  const totalXpAll = verifiedXp.reduce((s, r) => s + (Number(r.xp) || 0), 0);
  const sharePct = (v) => totalXpAll > 0 ? Math.round((v / totalXpAll) * 100) : 0;

  // ═══ 成长之路时间轴：上一级 · 当前级 · 下一级 ═══
  const levels = cfg.levels || [];
  const currentLevelIdx = xp.currentLevel && levels.length ? levels.findIndex(l => l.name === (xp.currentLevel.name || "")) : -1;
  setText("levelJourneyCount", `共 ${levels.length} 级`);
  const journeyEl = document.getElementById("lmJourney");
  if (journeyEl && levels.length > 0) {
    const startIdx = currentLevelIdx >= 0 ? Math.max(0, currentLevelIdx - 1) : 0;
    const windowLevels = levels.slice(startIdx, startIdx + 3);
    if (windowLevels.length === 0) windowLevels.push(levels[levels.length - 1]);
    const ins = windowLevels.map((lv, i) => {
      const idx = levels.indexOf(lv);
      const isCur = idx === currentLevelIdx;
      const isPast = idx < currentLevelIdx;
      const cls = isCur ? "cur" : (isPast ? "done" : "fut");
      const dotTxt = isPast ? "✓" : (idx + 1);
      const lvTxt = isCur ? "当前" : (isPast ? "" : "下一级");
      const line = i < windowLevels.length - 1 ? `<div class="lm-jn-line ${isCur || isPast ? "on" : ""}"></div>` : "";
      const scoreHtml = isCur ? `<div class="lm-jn-score">${xp.current}<span class="unit">分</span></div>` : "";
      const nameHtml = isCur ? ((xp.currentLevel?.levelNum || "") + " " + lv.name) : lv.name;
      return `<div class="lm-jn-wrap ${cls}"><div class="lm-jn-dot ${cls}">${dotTxt}</div><div class="lm-jn-name ${cls}">${nameHtml}</div><div class="lm-jn-tag ${cls}">${lvTxt}</div>${scoreHtml}</div>${line}`;
    }).join("");
    journeyEl.innerHTML = ins;
  }

  // ═══ 本等级进度（使用 getLevelProgress 计算的统一进度值） ═══
  const prevLevelXp = currentLevelIdx > 0 ? (levels[currentLevelIdx].xp || 0) : 0;
  const nextLevelXp = levels[currentLevelIdx + 1] ? (levels[currentLevelIdx + 1].xp || 0) : (xp.nextLevel?.xp || xp.current);
  const earnedInLevel = Math.max(0, xp.current - prevLevelXp);
  const targetInLevel = nextLevelXp - prevLevelXp;
  setText("lmProgressEarned", earnedInLevel);
  setText("lmProgressTarget", targetInLevel);
  const fillEl = document.getElementById("lmProgressFill");
  if (fillEl) fillEl.style.width = xp.progress + "%";

  // ═══ 能量星球右侧 ═══
  setText("homeXp", planetXp.energy);
  const _monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const _lastMonday = (() => { const d = new Date(_monday); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
  // 能量板块本周/上周获得：仅统计能量页自身操作（日记 + 手动打分），排除知识"作业·/成绩录入"与财务"财务/花销"
  const _isHomeEnergyTask = (r) => {
    const n = String(r.taskName || r.title || "");
    return n.indexOf("作业") < 0 && n.indexOf("成绩录入") < 0 && n.indexOf("财务") < 0 && n.indexOf("花销") < 0;
  };
  const verifiedXpAll = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
  const weekXP = verifiedXpAll.filter(r => getDateStr(r) >= _monday && _isHomeEnergyTask(r)).reduce((s, r) => s + (Number(r.xp) || 0), 0);
  const lastWeekXP = verifiedXpAll.filter(r => getDateStr(r) >= _lastMonday && getDateStr(r) < _monday && _isHomeEnergyTask(r)).reduce((s, r) => s + (Number(r.xp) || 0), 0);
  setText("homeWeekXp", "本周 +" + weekXP);
  const changePct = lastWeekXP > 0 ? Math.round((weekXP - lastWeekXP) / lastWeekXP * 100) : 0;
  const trendEl = document.getElementById("homeXpTrend");
  if (trendEl) {
    trendEl.textContent = (changePct >= 0 ? "▲" : "▼") + Math.abs(changePct) + "%";
    trendEl.style.color = changePct >= 0 ? "var(--mint-600,#4a9b7b)" : "var(--coral-600,#e04a15)";
  }
  const xpNoteEl = document.getElementById("homeXpNote");
  if (xpNoteEl) {
    xpNoteEl.textContent = `占总积分 ${sharePct(planetXp.energy)}%`;
  }
  document.getElementById("homeXpProgress").style.width = `${sharePct(planetXp.energy)}%`;

  // ═══ 知识星球右侧 ═══
  setText("homeStudy", planetXp.knowledge);
  // 本周作业所得积分
  const weekStudyXp = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过" && (String(r.taskName || r.title || "").indexOf("作业") >= 0 || /完成$/.test(String(r.description || ""))) && getDateStr(r) >= _monday).reduce((s, r) => s + (Number(r.xp) || 0), 0);
  setText("homeWeekStudyXp", "本周 +" + weekStudyXp);
  const studyProgressEl = document.getElementById("homeStudyProgress");
  if (studyProgressEl) studyProgressEl.style.width = sharePct(planetXp.knowledge) + "%";
  const studyNoteEl = document.getElementById("homeStudyNote");
  if (studyNoteEl) {
    studyNoteEl.textContent = `占总积分 ${sharePct(planetXp.knowledge)}%`;
  }

  // ═══ 财富板块 ═══
  const totalMoney = cfg.finance?.totalAssets || 0;
  setText("homeMoney", planetXp.finance);
  const moneyProgressEl = document.getElementById("homeMoneyProgress");
  if (moneyProgressEl) moneyProgressEl.style.width = sharePct(planetXp.finance) + "%";
  const moneyNoteEl = document.getElementById("homeMoneyNote");
  if (moneyNoteEl) {
    moneyNoteEl.textContent = `占总积分 ${sharePct(planetXp.finance)}%`;
  }

  // ═══ 能量获取细节已并入三大星球（移除独立冗余卡片） ═══

  refreshIcons(0);

  // ═══ 角色面板 + 今日状态 ═══
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}月${today.getDate()}日`;
  const hour = today.getHours();

  // 今日 XP
  const todayStr = today.toISOString().slice(0, 10);
  const todayXpRecords = (cfg.xpRecords || []).filter(r => {
    return getDateStr(r) === todayStr && r.reviewStatus === "已通过";
  });
  const todayXp = todayXpRecords.reduce((s, r) => s + (Number(r.xp) || 0), 0);

  // ── 角色面板 ──
  const child = cfg.child || {};
  setText("idName", child.name || "小探索家");
  setText("idGender", child.gender === "女生" ? "♀" : "♂");
  setText("idAge", child.birthday ? formatAge(child.birthday) : "");
  const schoolPart = child.school || "";
  const classPart = child.className || "";
  // 年级与学期卡统一：跟随当前学年（放假时指向下一学年），避免身份卡与学期卡年级不一致
  const semInfo = typeof getCurrentSemesterInfo === "function" ? getCurrentSemesterInfo() : null;
  const gradeNow = (semInfo && semInfo.grade) || child.grade || "";
  // className 可能已含"班"字，避免重复拼接
  const classShow = classPart ? (classPart.endsWith("班") ? classPart : classPart + "班") : "";
  setText("idGrade", [schoolPart, gradeNow, classShow].filter(Boolean).join(" · "));
  // 个性签名（个人信息）
  setText("idSign", (child.motto || "").trim() ? child.motto : "每天进步一点点");
  // 角色面板：等级进度由成长之路时间轴展示

  // ── 当前等级权益行（三态：已兑换/立即兑换/未解锁） ──
  const privRowEl = document.getElementById("idPrivRow");
  if (privRowEl && levels.length > 0) {
    // 从 levels 数组中找到当前等级的实际对象（含 privileges），避免使用 xp.currentLevel 摘要对象
    const curLevelName = xp.currentLevel && xp.currentLevel.name;
    const curLv = levels.find(l => l.name === curLevelName) || levels[0];
    const privs = (curLv.privileges || []).slice(0, 4);
    const hasMore = (curLv.privileges || []).length > 4;
    const privHtml = privs.map(p => {
      const isObj = typeof p === "object" && p !== null;
      const pName = isObj ? p.name : (typeof p === "string" ? p : p.text);
      const pIcon = isObj ? (p.icon || "gift") : "gift";
      const pRedeemed = isObj ? !!p.redeemed : false;
      const isDefaultRedeemed = pName === "自由享受每周零花钱";
      const showRedeemed = pRedeemed || (isDefaultRedeemed && curLv.xp <= (xp.current || 0));
      if (showRedeemed) {
        return `<div class="priv redeemed"><div class="p-ic"><i data-lucide="check" style="width:16px;height:16px"></i></div><div class="p-nm">${pName}</div><div class="p-st">已兑换</div></div>`;
      }
      return `<div class="priv open" onclick="openRedeemConfirm('${encodeURIComponent(pName)}', '${curLv.name}')"><div class="p-ic"><i data-lucide="${pIcon}" style="width:16px;height:16px"></i></div><div class="p-nm">${pName}</div><div class="p-st">立即兑换</div></div>`;
    }).join("");
    privRowEl.innerHTML = privHtml + (hasMore ? `<div class="priv more" onclick="switchView('level')">…</div>` : "");
    refreshIcons(50);
  }

  // ── 升级进度头部 · 本学期升了几级（按学期起止日期过滤已验证能量 + 等级阈值） ──
  const idXpSemEl = document.getElementById("idXpSem");
  if (idXpSemEl) {
    try {
      const semInfo = typeof getCurrentSemesterInfo === "function" ? getCurrentSemesterInfo() : null;
      let semStart = null;
      if (semInfo && typeof getCalendarData === "function") {
        const cal = getCalendarData() || [];
        const yr = cal.find(y => y.academicYear === semInfo.academicYear);
        if (yr) {
          const s = semInfo.semester === 1 ? yr.semester1 : yr.semester2;
          semStart = s && s.startDate;
        }
      }
      const verified = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过" && Number(r.xp));
      const semRecords = semStart ? verified.filter(r => (getDateStr(r) || "") >= semStart) : verified;
      const startXp = semStart ? verified.filter(r => (getDateStr(r) || "") < semStart).reduce((s, r) => s + Number(r.xp), 0) : 0;
      const endXp = startXp + semRecords.reduce((s, r) => s + Number(r.xp), 0);
      const lvlAt = (xpVal) => {
        let lv = levels[0] || null;
        (levels || []).forEach(l => { if (xpVal >= (l.xp || 0)) lv = l; });
        return lv;
      };
      const startLv = lvlAt(startXp);
      const endLv = lvlAt(endXp);
      const idxOf = (lv) => lv ? levels.findIndex(l => l.name === lv.name) : -1;
      const up = Math.max(0, idxOf(endLv) - idxOf(startLv));
      idXpSemEl.textContent = "📈 本学期升 " + up + " 级";
    } catch (e) {
      idXpSemEl.textContent = "📈 本学期持续成长";
    }
  }

  // ── 今日要做的事（图3式布局：进度卡 + 行为卡片列表） ──
  setText("todayStatusDate", dateStr + " · " + weekdayText(today));
  const ttCardsEl = document.getElementById("ttCards");
  const ttGoalTextEl = document.getElementById("ttGoalText");
  const ttGoalFillEl = document.getElementById("ttGoalFill");
  const ttGoalDoneEl = document.getElementById("ttGoalDone");
  const ttGoalHintEl = document.getElementById("ttGoalHint");
  const ttGoalBarEl = document.getElementById("ttGoalBar");

  const allHw = collectAssignments(cfg.study?.allHomework);
  // 今日待办/逾期只统计当前学期作业（暑假归档作业不再出现在首页）
   const curHw = allHw.filter(a => !(a && a.term && String(a.term).trim()));
  const todayDue = curHw.filter(a => (a.dueDate || "") === todayStr);
  const overdueHw = curHw.filter(a => (a.dueDate || "") !== "" && a.dueDate < todayStr && !(a.status === "done") && a.status !== "expired" && !a.submitted);
  const hwDone = todayDue.filter(a => (a.status === "done") || !!a.submitted).length;
  const hwTotal = todayDue.length;
  const overdueTotal = overdueHw.length;

  // ═══ ① 行为卡片列表（图3：挑战 / 记录 / 日记 / 约定 / 作业统计） ═══
  const cards = [];

  // 本周挑战：取"周号==本周"的家庭会议，展示本周约定的完成状态
  var lastFm = currentWeekMeeting(cfg.familyMeetings);
  if (lastFm) {
    var commDone = lastFm.commitments.filter(function(c) { return c.completed; });
    var commUndone = lastFm.commitments.filter(function(c) { return !c.completed; });
    if (commUndone.length > 0) {
      var c0 = commUndone[0];
      var hasTn = c0.taskName && c0.taskName.length > 0;
      cards.push({
        type: "challenge",
        icon: "🎯",
        name: "本周约定：" + (c0.text || c0.taskName || ""),
        sub: "和爸爸妈妈在例会上说好的 · 还差 " + commUndone.length + " 件 · 完成 +" + (c0.xp || 0) + " 能量",
        tag: hasTn ? "去兑现" : "去打卡",
        onclick: hasTn
          ? "openXpModalWithTask('" + c0.taskName.replace(/'/g, "\\'") + "')"
          : "openFamilyMeeting()"
      });
    } else {
      cards.push({
        type: "challenge",
        icon: "🏆",
        name: "本周约定全部做到！",
        sub: "你和爸爸妈妈说好的 " + lastFm.commitments.length + " 件事都做到了",
        tag: "太棒了",
        onclick: "openFamilyMeeting()"
      });
    }
  } else {
    cards.push({
      type: "challenge",
      icon: "🎯",
      name: "和爸爸妈妈定个本周约定",
      sub: "开一次家庭庆祝会，一起说清楚这周要做的事",
      tag: "去例会",
      onclick: "openFamilyMeeting()"
    });
  }

  // 2. 能量打卡
  var todayXpCount = (cfg.xpRecords || []).filter(r => getDateStr(r) === todayStr).length;
  if (todayXpCount === 0) {
    cards.push({
      type: "xp",
      icon: "⚡",
      name: "能量打卡",
      sub: "记录一件今天做的事",
      tag: "去打卡",
      onclick: "openXpModal()"
    });
  } else {
    cards.push({
      type: "xp",
      icon: "⚡",
      name: "能量打卡",
      sub: "今天已点亮 " + todayXpCount + " 次",
      tag: "继续打卡",
      onclick: "openXpModal()"
    });
  }

  // 3. 写一篇能量日记
  var todayDiary = (cfg.diaries || []).filter(d => (d.date || "").indexOf(todayStr) === 0);
  if (todayDiary.length === 0) {
    cards.push({
      type: "diary",
      icon: "✏️",
      name: "能量日记",
      sub: "今天心情怎么样？写几句吧",
      tag: "去记录",
      onclick: "openDiaryModal()"
    });
  } else {
    cards.push({
      type: "diary",
      icon: "✏️",
      name: "今天的日记已写",
      sub: "写得很棒，继续保持",
      tag: "已完成",
      onclick: "openDiaryModal()"
    });
  }

  // 4. 作业进度卡（未完成 / 逾期 / 今日）
  const hwNotDone = allHw.filter(a => !(a.status === "done") && a.status !== "expired" && !a.submitted).length;
  cards.push({
    type: "hw",
    icon: "📚",
    name: "管理我的作业",
    sub: "作业进度：未完成作业 " + hwNotDone + " 个，逾期作业 " + overdueTotal + " 个 / 今日作业 " + hwTotal + " 个",
    tag: "去管理",
    onclick: "switchView('study')"
  });

  // 渲染卡片：挑战单卡 + [打卡|日记] 双列 + 作业卡
  if (ttCardsEl) {
    var challengeCard = cards[0]; // 挑战
    var xpCard = cards[1];        // 记录打卡
    var diaryCard = cards[2];     // 日记
    var hwCard = cards.length > 3 ? cards[3] : null; // 作业（约定已删）

    var cardHtml = function(c) {
      return '<div class="tt-action-card ' + c.type + '" onclick="' + c.onclick + '">' +
        '<div class="tt-action-icon">' + c.icon + '</div>' +
        '<div class="tt-action-main"><div class="tt-action-name">' + c.name + '</div>' +
        (c.sub ? '<div class="tt-action-sub">' + c.sub + '</div>' : '') + '</div>' +
        '<span class="tt-action-tag">' + c.tag + '</span>' +
        '</div>';
    };

    var html = '';
    if (challengeCard) html += cardHtml(challengeCard);
    html += '<div class="tt-row2">';
    if (xpCard) html += cardHtml(xpCard);
    if (diaryCard) html += cardHtml(diaryCard);
    html += '</div>';
    if (hwCard) html += cardHtml(hwCard);
    ttCardsEl.innerHTML = html;
    refreshIcons(0);
  }

  // ═══ ② 进度卡：统计当前可办的事 ═══
  const allTodo = allHw.filter(a => !(a.status === "done") && a.status !== "expired" && !a.submitted);
  const totalCount = todayDue.length + overdueTotal + (pendingCount > 0 ? 1 : 0);
  const doneCount = hwDone;
  const todoCount = totalCount - doneCount;
  const totalXpT = allTodo.reduce((s, a) => s + (Number(a.xp) || 0), 0);
  const pctV = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  if (ttGoalTextEl) ttGoalTextEl.innerHTML = totalCount > 0
    ? `今天完成 <b>${doneCount}</b> / <b>${totalCount}</b> 件事，点亮 <b>${totalXpT}</b> 能量 ✨`
    : "今天没有待做的事，点下面的卡片记点能量吧 ✨";
  if (ttGoalFillEl) ttGoalFillEl.style.width = pctV + "%";
  if (ttGoalBarEl) ttGoalBarEl.classList.toggle("empty", totalCount === 0);
  if (ttGoalDoneEl) ttGoalDoneEl.textContent = `已完成 ${doneCount} / ${totalCount}`;
  if (ttGoalHintEl) {
    let hint = "先把重要的事做完";
    if (totalCount === 0) hint = "今天没有待做的事";
    else if (todoCount === 0) hint = "全部完成，太棒了 🎉";
    else if (overdueTotal > 0) hint = "有 " + overdueTotal + " 件作业逾期了，先补上";
    else hint = "还差 " + todoCount + " 件 · 一件一件来";
    ttGoalHintEl.textContent = hint;
  }

  // ═══ 3. 我的信息卡 ═══
  function setVal(el, val, emptyText) {
    if (!el) return;
    if (!val || val === "-" || val === "暂无" || val === emptyText) {
      el.textContent = emptyText || "暂无";
      el.classList.add("is-empty");
    } else {
      el.textContent = val;
      el.classList.remove("is-empty");
    }
  }
  setVal(document.getElementById("infoBirthday"), child.birthday, "未设置");
  setVal(document.getElementById("infoSchool"), child.school, "暂无");
  setVal(document.getElementById("infoClass"), child.className, "暂无");

  const mottoEl = document.getElementById("mottoLine");
  if (mottoEl && child.motto) {
    mottoEl.textContent = '"' + child.motto + '"';
    mottoEl.style.display = "block";
  } else if (mottoEl) {
    mottoEl.style.display = "none";
  }

  const interestEl = document.getElementById("interestTags");
  if (interestEl) {
    if (child.interests && child.interests.length > 0) {
      interestEl.classList.remove("is-empty");
      interestEl.innerHTML = child.interests.map(i => `<span class="interest-tag">${i}</span>`).join("");
    } else {
      interestEl.classList.add("is-empty");
      interestEl.innerHTML = "还没有添加兴趣爱好";
    }
  }

  // ═══ 4. 成长数据面板 ═══
  const dataXpEl = document.getElementById("dataXp");
  if (dataXpEl) { dataXpEl.textContent = xp.current; dataXpEl.classList.remove("is-empty"); }
  const dataLevelEl = document.getElementById("dataLevel");
  if (dataLevelEl) { dataLevelEl.textContent = xp.currentLevel?.levelNum || "Lv.1"; dataLevelEl.classList.remove("is-empty"); }

  const dataNextEl = document.getElementById("dataNextLevel");
  if (dataNextEl) {
    if (xp.nextLevel) {
      dataNextEl.textContent = nextGap + " XP";
      dataNextEl.classList.remove("is-empty");
    } else {
      dataNextEl.textContent = "已满级";
      dataNextEl.classList.add("is-empty");
    }
  }

  const homeworkDone = homework.done || 0;
  const homeworkTotal = homework.total || 0;
  const dataHwEl = document.getElementById("dataHomework");
  if (dataHwEl) { dataHwEl.textContent = homeworkDone; dataHwEl.classList.remove("is-empty"); }

  const dataFinEl = document.getElementById("dataFinance");
  if (dataFinEl) { dataFinEl.textContent = formatMoney(cfg.finance?.totalAssets || 0); dataFinEl.classList.remove("is-empty"); }

  const dataRateEl = document.getElementById("dataCompleteRate");
  if (dataRateEl) {
    if (homeworkTotal > 0) {
      const rate = pct(homeworkDone, homeworkTotal);
      dataRateEl.textContent = rate + "%";
      dataRateEl.classList.remove("is-empty");
    } else {
      dataRateEl.textContent = "-";
      dataRateEl.classList.add("is-empty");
    }
  }

  // ═══ 今日关注已移除（与今日要做的事 + 三大星球重复） ═══

  // ═══ 首页 · 系统总积分增长趋势 ═══
  const homeTrendArea = document.getElementById("homeTrendChartArea");
  if (homeTrendArea) {
    renderTrendChart(verifiedXp, homeTrendRange, homeTrendArea);
    bindHomeTrendTabs();
  }

  // 渲染学期状态条（避免首次加载显示 "--"）
  if (window.SemesterCalendar && window.SemesterCalendar.renderSemesterBar) {
    window.SemesterCalendar.renderSemesterBar();
  }

  // ═══ AI 成长周报 ═══
  renderAiWeeklyReport(cfg);

  // ═══ 能量日记 ═══
  await renderDiary();
}

// ═══════════════════════════════════════════════════════════════
// AI 成长周报渲染
// ═══════════════════════════════════════════════════════════════
function setDateRange(report) {
  var el = document.getElementById("wrDateRange");
  if (!el) return;
  if (!report) { el.textContent = ""; return; }
  var date = report.date || report.generatedAt || "";
  var d = date ? new Date(date) : null;
  var range = "";
  if (d && !isNaN(d.getTime())) {
    var start = new Date(d); start.setDate(start.getDate() - 6);
    var fmt = function (x) { return (x.getMonth() + 1) + "." + x.getDate(); };
    range = fmt(start) + " - " + fmt(d) + " · " + (report.year || "") + "年";
  } else {
    range = date ? String(date).slice(0, 10) : "";
  }
  el.textContent = "📅 " + range;
}

function buildWrStatsHtml(stats) {
  var trendMeta = {
    up: { t: "↑", c: "var(--colourful-mint-green-500)", l: "较上周" },
    down: { t: "↓", c: "var(--colourful-sunny-coral-400)", l: "较上周" },
    stable: { t: "→", c: "var(--neutral-400)", l: "持平" }
  };
  var statMeta = [
    { key: "energy", label: "能量值", unit: "XP", cls: "energy", icon: "⚡" },
    { key: "study", label: "学习记录", unit: "项", cls: "study", icon: "📚" },
    { key: "finance", label: "花销", unit: "元", cls: "finance", icon: "💰" },
    { key: "diary", label: "日记", unit: "篇", cls: "diary", icon: "✏️" }
  ];
  return statMeta.map(function (item) {
    var s = stats[item.key] || {};
    var val = s.value || 0;
    var trend = s.trend || "stable";
    var diff = s.diff || 0;
    var tm = trendMeta[trend] || trendMeta.stable;
    var trendTxt = trend === "stable" ? "持平" : (tm.t + " " + (diff > 0 ? "+" : "") + diff);
    var valHtml;
    if (s.hasData === false) {
      valHtml = '<span style="font-size:12px;color:var(--neutral-400);font-weight:400">--</span>';
      trendTxt = "";
    } else {
      valHtml = val + '<span style="font-size:11px;color:var(--neutral-400);font-weight:400;margin-left:2px">' + item.unit + '</span>';
    }
    return '<div class="wr-stat wr-stat-' + item.cls + '"><div class="wr-stat-top"><span class="wr-stat-icon">' + item.icon + '</span><span class="wr-stat-trend" style="color:' + tm.c + '">' + trendTxt + '</span></div><div class="wr-stat-val">' + valHtml + '</div><div class="wr-stat-label">' + item.label + '</div></div>';
  }).join("");
}

// 实时计算"游戏时间攒点"（与 scripts/generate-weekly-report.js 的 computeGameTime 同规则）
// 只算周一~周五的真实成长打卡（剔除自动/消费流水），每天+12分钟，周封顶60，结转可用封顶120。
function buildRealtimeGameTime(recs, fromISO, toISO, carryMin) {
  var growthCats = ["学习成长", "能力成长", "身体成长", "兴趣爱好"];
  var earnPerDay = 12, capWeek = 60, balanceCap = 120;
  function isAutoOrSpend(r) {
    var n = String(r.title || r.taskName || ""), d = String(r.description || ""), cat = String(r.taskCategory || r.xpCategory || "");
    var isSpend = /财务能力分析|财务|值得/.test(n + cat) && /买|花|元|值得|支出/.test(n + d);
    var isAuto = /作业·/.test(n) || /认真投入/.test(n) || n.indexOf("财务能力分析") >= 0 || /写日记/.test(n) || /自动发放/.test(d);
    return isAuto || isSpend;
  }
  function isWeekday(iso) { var day = new Date(iso + "T00:00:00").getDay(); return day >= 1 && day <= 5; }
  var daySet = {};
  (recs || []).forEach(function(r) {
    var d = getDateStr(r).slice(0, 10);
    if (!(d >= fromISO && d <= toISO)) return;
    if (isAutoOrSpend(r)) return;
    if (!isWeekday(d)) return;
    var cat = String(r.taskCategory || r.xpCategory || "");
    if (growthCats.indexOf(cat) < 0) return;
    daySet[d] = 1;
  });
  var days = Object.keys(daySet).length;
  var earned = Math.min(days * earnPerDay, capWeek);
  var carry = Math.min(Number(carryMin || 0), balanceCap);
  var balance = Math.min(carry + earned, balanceCap);
  return { checkedDays: days, earnedMin: earned, capWeek: capWeek, balance: balance, balanceCap: balanceCap, carryMin: carry };
}

function renderAiWeeklyReport(cfg) {
  const section = document.getElementById("weeklyReportSection");
  if (!section) return;
  const reports = cfg.aiWeeklyReports || [];
  const currentReport = reports.length > 0 ? reports[reports.length - 1] : null;
  if (!currentReport) {
    section.style.display = "";
    window.__wrCurrentIndex = undefined;
    document.getElementById("wrEmpty").style.display = "";
    document.getElementById("wrTitle").textContent = "第 -- 周成长周报";
    document.getElementById("wrDateRange").textContent = "";
    document.getElementById("wrHero").innerHTML = "";
    document.getElementById("wrData").innerHTML = "";
    document.getElementById("wrQuest").innerHTML = "";
    document.getElementById("wrFooter").style.display = "none";
    populateWeekSelect(reports);
    return;
  }
  section.style.display = "";
  window.__wrCurrentIndex = reports.length - 1;
  document.getElementById("wrEmpty").style.display = "none";
  document.getElementById("wrFooter").style.display = "";
  document.getElementById("wrTitle").textContent = "第 " + currentReport.weekNumber + " 周成长周报";
  setDateRange(currentReport);

  // ── 只展示【每周定时生成】的周报存档，不做实时重算 ──
  // 周报 = 每周审核生成的一份"定格"记录；打卡后的即时变化不计入，避免把别的周/后续记录混进本周。
  // 因此直接使用生成好的存档（AI 文案 + 该周真实数字），与历史周 displayWeeklyReport 口径完全一致。
  var childName = (cfg.child && cfg.child.name) || "Yara";
  document.getElementById("wrHero").innerHTML = renderWrHero(currentReport, childName);
  document.getElementById("wrData").innerHTML = renderWrData(currentReport);
  document.getElementById("wrQuest").innerHTML = renderWrQuest(currentReport, cfg.familyMeetings);
  populateWeekSelect(reports);
  if (window.lucide) refreshIcons(20);
}

// ── 第 1 幕：闪光时刻 Hero ──
function renderWrHero(report, childName) {
  var html = "";
  // 摘要：第三人称→第二人称
  var summary = (report.summary || "").replace(new RegExp(childName, "g"), "你");
  if (summary) {
    html += '<div class="wr-hero-summary">' + renderHighlighted(summary) + '</div>';
  }
  // 闪光点 → 成就徽章卡片
  var pu = (report.growth || {}).profileUpdate || {};
  var highlights = pu.highlights || [];
  if (highlights.length > 0) {
    html += '<div class="wr-hero-badges">';
    highlights.forEach(function(h) {
      var icon = wrHighlightIcon(h);
      html += '<div class="wr-badge-card"><div class="wr-badge-icon">' + icon + '</div><div class="wr-badge-text">' + escapeHtmlReason(h) + '</div></div>';
    });
    html += '</div>';
  }
  // 最佳日记 → 情感中心
  var best = (report.emotion || {}).bestDiary || {};
  if (best.snippet) {
    html += '<div class="wr-hero-diary">';
    html += '<div class="wr-diary-mark">&ldquo;</div>';
    html += '<div class="wr-diary-text">' + renderHighlighted(best.snippet) + '</div>';
    html += '<div class="wr-diary-meta">· ' + (best.date || '') + ' · 写作四要素 ' + (best.elements || 0) + '/5</div>';
    html += '</div>';
  }
  if (!html) html = '<div style="color:var(--muted-foreground);font-size:13px;padding:20px 0;text-align:center">本周还没有记录，快去打卡吧</div>';
  return html;
}

function wrHighlightIcon(text) {
  if (!text) return "⭐";
  if (text.indexOf("说到") >= 0 || text.indexOf("约定") >= 0 || text.indexOf("遵守") >= 0) return "🤝";
  if (text.indexOf("财务") >= 0 || text.indexOf("花") >= 0 || text.indexOf("钱") >= 0) return "💰";
  if (text.indexOf("日记") >= 0 || text.indexOf("写") >= 0) return "✏️";
  if (text.indexOf("习惯") >= 0) return "🎯";
  if (text.indexOf("能力") >= 0) return "💪";
  if (text.indexOf("学习") >= 0) return "📚";
  return "⭐";
}

// ── 第 2 幕：成长数据 ──
function renderWrData(report) {
  var html = "";
  var beh = report.behavior || {};
  var profile = beh.profile || [];
  var stats = report.stats || {};

  // ═══ 板块 A：你这周攒了多少能量 ═══
  var totalXp = 0;
  profile.forEach(function(p) { totalXp += (p.xp || 0); });
  if (!totalXp) { var es = stats.energy || {}; totalXp = (es.value || 0); }

  if (totalXp > 0 || profile.length > 0) {
    html += '<div class="wr-data-section wr-section-energy">';
    html += '<div class="wr-data-label-v2">⚡ 你这周攒了多少能量</div>';

    // 能量总数 + 趋势
    var eStat = stats.energy || {};
    var eTrend = eStat.trend || "stable";
    var eDiff = eStat.diff || 0;
    var trendIcon = eTrend === "up" ? "📈" : eTrend === "down" ? "📉" : "→";
    var trendTxt = eTrend === "stable" ? "和上周差不多" : (eTrend === "up" ? "比上周多 " + eDiff : "比上周少 " + eDiff);
    html += '<div class="wr-energy-headline"><span class="wr-eh-num">' + totalXp + '</span><span class="wr-eh-unit">点能量</span><span class="wr-eh-trend">' + trendIcon + " " + trendTxt + '</span></div>';

    // 能量条
    if (profile.length > 0) {
      var maxXp = 1;
      profile.forEach(function(p) { if (p.xp > maxXp) maxXp = p.xp; });
      var palette = ["#82d632", "#fdd832", "#36b98b", "#f96024", "#7bb8f7", "#f28daf"];
      var icons = ["🌟", "💪", "🎨", "🏃", "🔥", "⭐"];
      html += '<div class="wr-energy-bars">';
      profile.forEach(function(p, i) {
        var w = Math.max(15, Math.round((p.xp / maxXp) * 100));
        // 颜色优先按分类取系统定义色；分类未知时再回落中性灰，杜绝"未定义紫"
        var defined = WCPALETTE[p.category] ? WCPALETTE[p.category].dot : "";
        var c = defined || palette[i % palette.length];
        html += '<div class="wr-energy-row"><span class="wr-energy-name">' + icons[i % icons.length] + p.category + '</span><span class="wr-energy-track"><span class="wr-energy-fill" style="width:' + w + '%;background:' + c + '"></span></span><span class="wr-energy-meta">+' + p.xp + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // ═══ 板块 B：这周你做了什么 ═══
  var aca = report.academic || {};
  var hw = aca.homework || {};
  var subjects = hw.subjects || [];
  var emo = report.emotion || {};
  var moodDist = emo.moodDistribution || {};
  var moodKeys = Object.keys(moodDist);
  var finStat = stats.finance || {};
  var diaryStat = stats.diary || {};
  var studyStat = stats.study || {};
  var trends = aca.trends || [];

  var hasActivity = (studyStat.hasData !== false && studyStat.value > 0) || diaryStat.value > 0 || (finStat.hasData !== false && finStat.value !== undefined) || trends.length > 0;

  if (hasActivity) {
    html += '<div class="wr-data-section wr-section-activity">';
    html += '<div class="wr-data-label-v2">📋 这周你做了什么</div>';
    html += '<div class="wr-act-list">';

    // 学习行
    if (studyStat.hasData !== false && studyStat.value > 0) {
      var subjNames = subjects.map(function(s) { return typeof s === "string" ? s : (s.name || s.subject || ""); }).filter(Boolean);
      var subjText = subjNames.length > 0 ? "（" + subjNames.join("、") + "）" : "";
      html += '<div class="wr-act-row"><span class="wr-act-icon">📚</span><span class="wr-act-text">完成了 <b>' + studyStat.value + '</b> 项作业' + subjText + '</span></div>';
    } else {
      var hint = aca.emptyHint || "这周还没记录学习，下周完成作业每项+5XP哦";
      html += '<div class="wr-act-row wr-act-hint-row"><span class="wr-act-icon">📚</span><span class="wr-act-text">' + renderHighlighted(hint) + '</span></div>';
    }

    // 日记 + 心情行
    var diaryVal = diaryStat.value || 0;
    var moodText = moodKeys.length > 0 ? moodKeys.map(function(k) { return k + moodDist[k] + "次"; }).join("、") : "";
    if (diaryVal > 0) {
      html += '<div class="wr-act-row"><span class="wr-act-icon">✏️</span><span class="wr-act-text">写了 <b>' + diaryVal + '</b> 篇日记' + (moodText ? ' · 心情：' + moodText : "") + '</span></div>';
    } else {
      html += '<div class="wr-act-row wr-act-hint-row"><span class="wr-act-icon">✏️</span><span class="wr-act-text">这周还没写日记，写一篇+8XP哦</span></div>';
    }

    // 花钱行
    if (finStat.hasData !== false && finStat.value !== undefined) {
      var worthRate = emo.financeWorthIt || 0;
      var finText = "花了 <b>" + finStat.value + "</b> 元";
      if (worthRate > 0) finText += " · " + worthRate + "% 觉得值得";
      html += '<div class="wr-act-row"><span class="wr-act-icon">💰</span><span class="wr-act-text">' + finText + '</span></div>';
    }

    // 成绩趋势行（如有）
    if (trends.length > 0) {
      var tArrow = { up: "↑", down: "↓", stable: "→", wave: "🔀" };
      var tSummary = trends.map(function(t) { return t.subject + (tArrow[t.trend] || "") + (t.lastGrade || ""); }).join("、");
      html += '<div class="wr-act-row"><span class="wr-act-icon">📊</span><span class="wr-act-text">成绩：' + escapeHtmlReason(tSummary) + '</span></div>';
    }

    html += '</div>';
    html += '</div>';
  }

  // ═══ 板块 C：你最棒的时刻 ═══
  var stories = beh.effortStories || [];
  if (stories.length > 0) {
    html += '<div class="wr-data-section wr-section-stories">';
    html += '<div class="wr-data-label-v2">⭐ 你最棒的时刻</div>';
    stories.slice(0, 3).forEach(function(s) {
      html += '<div class="wr-story"><div class="wr-story-head">📅 ' + (s.date || "") + '</div><div class="wr-story-body">' + renderHighlighted(s.story || "") + '</div></div>';
    });
    if (stories.length > 3) html += '<div class="wr-story-more">还有 ' + (stories.length - 3) + " 个精彩瞬间</div>";
    html += '</div>';
  }

  // 徽章
  var badge = beh.badge || {};
  if (badge.earned) {
    var badgeText = badge.type === "small_perseverance" ? "🏅 小坚持" : "🏆 大毅力";
    html += '<div class="wr-badge-row"><span class="wr-badge">' + badgeText + ' · 连续 ' + badge.days + ' 天</span></div>';
  }

  // ═══ 板块 D：游戏时间攒点 ═══
  var gt = report.gameTime || {};
  var gtEarned = gt.earnedMin || 0;
  var gtBalance = gt.balance || 0;
  if (gtEarned > 0 || gtBalance > 0) {
    html += '<div class="wr-data-section">';
    html += '<div class="wr-data-label-v2">🎮 你的游戏时间</div>';
    html += '<div class="wr-act-list">';
    html += '<div class="wr-act-row"><span class="wr-act-icon">✅</span><span class="wr-act-text">本周靠工作日踏实打卡，攒下 <b>' + gtEarned + '</b> 分钟</span></div>';
    html += '<div class="wr-act-row"><span class="wr-act-icon">⏳</span><span class="wr-act-text">现在能玩的累计余额 <b>' + gtBalance + '</b> 分钟</span></div>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--neutral-400);margin-top:8px;line-height:1.6">游戏时间是用来放松的，玩完按时放下就好～</div>';
    html += '</div>';
  }

  // ═══ 板块 E：四维成长视角（GrowthAlgorithm：认知/情绪/意志力/关系，纯数据归因，不编造成就）═══
  // 数据全部取自该周报告存档的真实字段；任一位无数据则如实显示"等待记录"，不臆造。
  (function () {
    var dims = [];
    // 认知 · 学业投入
    var studyOn = studyStat && studyStat.hasData !== false && studyStat.value > 0;
    dims.push({ key: "cog", name: "认知", icon: "🧠", tone: "lav", ok: !!studyOn,
      txt: studyOn ? "完成了 <b>" + studyStat.value + "</b> 项作业" : "这周还没记录学习" });
    // 情绪 · 表达与分享
    var moodN = Object.keys(moodDist || {}).length;
    var diaryOn = (diaryStat && diaryStat.value > 0) || moodN > 0;
    dims.push({ key: "emo", name: "情绪", icon: "💗", tone: "candy", ok: !!diaryOn,
      txt: diaryOn ? "写了 <b>" + (diaryStat.value || 0) + "</b> 篇日记" : "心情还没被记下来" });
    // 意志力 · 坚持打卡
    var willDays = (report.gameTime && report.gameTime.checkedDays) || (profile.length ? 1 : 0);
    var willOn = willDays > 0;
    dims.push({ key: "wil", name: "意志力", icon: "🔥", tone: "butter", ok: !!willOn,
      txt: willOn ? "坚持打卡 <b>" + willDays + "</b> 天" : "等待重新出发" });
    // 关系 · 家庭协作/沟通（仅基于真实关系类记录：沟通/家务/助人/整理/家人互动，
    // 不再用游戏时间打卡天数或自律类故事推断，避免“阅读即关系”的误归因）
    var relKs = ["家务","沟通","帮忙","帮助","助人","收拾","整理","合作","协作","陪伴","照顾","父母","家人","分享给"];
    var relStory = (stories || []).filter(function (s) {
      var t = (s.subject || "") + (s.story || "");
      return relKs.some(function (k) { return t.indexOf(k) >= 0; });
    });
    var relOn = relStory.length > 0;
    dims.push({ key: "rel", name: "关系", icon: "🤝", tone: "mint", ok: relOn,
      txt: relOn ? "有 <b>" + relStory.length + "</b> 次家庭协作" : "可试着和家人开启协作" });

    var grid = dims.map(function (d) {
      var st = d.ok ? " on" : "";
      return '<div class="wr-dim wr-dim-' + d.tone + st + '"><span class="wr-dim-ico">' + d.icon + '</span><span class="wr-dim-name">' + d.name + '</span><span class="wr-dim-txt">' + d.txt + '</span></div>';
    }).join("");
    html += '<div class="wr-data-section"><div class="wr-data-label-v2">🌱 四维成长视角</div><div class="wr-dim-grid">' + grid + '</div></div>';
  })();

  if (!html) html = '<div class="wr-empty-hint">还没有记录，快去打卡吧</div>';
  return html;
}

// ── 第 3 幕：冒险任务 ──
function renderWrQuest(report, familyMeetings) {
  var sug = report.suggestions || {};
  var html = "";

  // 主挑战卡
  if (sug.challenge) {
    html += '<div class="wr-quest-main">';
    html += '<div class="wr-quest-header"><span class="wr-quest-icon">🎯</span><span class="wr-quest-label">下周冒险任务</span></div>';
    html += '<div class="wr-quest-body">' + renderHighlighted(sug.challenge.replace(/^趣味挑战[：:]/, "")) + '</div>';
    // 提取 +XP 奖励
    var xpMatch = (sug.challenge || "").match(/\+(\d+)\s*XP/);
    if (xpMatch) {
      html += '<div class="wr-quest-reward">⭐ +' + xpMatch[1] + ' XP</div>';
    }
    html += '</div>';
  }

  // 一句话鼓励（合并 keep + improve）
  var encTxt = "";
  if (sug.keep) encTxt += sug.keep.replace(/^成就达成[：:]/, "");
  if (sug.improve) {
    if (encTxt) encTxt += "  ";
    encTxt += sug.improve.replace(/^试试看[：:]/, "");
  }
  if (encTxt) {
    html += '<div class="wr-quest-encourage"><span class="qe-icon">🌟</span><span class="qe-text">' + renderHighlighted(encTxt) + '</span></div>';
  }

  // 每周约定
  var meetings = (familyMeetings || []).filter(function(m) { return m.commitments && m.commitments.length > 0; });
  if (meetings.length > 0) {
    var currentWeek = report.weekNumber;
    var matched = meetings.filter(function(m) { return m.weekNumber === currentWeek; });
    var meeting = matched.length > 0 ? matched[0] : meetings[0];
    if (meeting && meeting.commitments && meeting.commitments.length > 0) {
      var done = meeting.commitments.filter(function(c) { return c.completed; }).length;
      var total = meeting.commitments.length;
      var pct = total > 0 ? Math.round((done / total) * 100) : 0;
      html += '<div class="wr-quest-commit">';
      html += '<div class="qc-title">🤝 每周约定 · ' + done + '/' + total + ' 已完成</div>';
      // 进度条
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="wr-quest-bar-track"><span class="wr-quest-bar-fill" style="width:' + pct + '%"></span></span><span style="font-size:11px;font-weight:600;color:var(--neutral-400)">' + pct + '%</span></div>';
      meeting.commitments.forEach(function(c) {
        var statusIcon = c.completed ? '✅' : '⏳';
        var statusStyle = c.completed ? 'color:var(--colourful-mint-green-600)' : 'color:var(--neutral-500)';
        var xpTag = c.completed ? ((c.xp > 0) ? '<span class="qc-xp">已兑现 +' + c.xp + 'XP</span>' : '<span class="qc-xp">已兑现</span>') : '';
        html += '<div class="qc-item" style="' + statusStyle + '"><span class="qc-status">' + statusIcon + '</span><span class="qc-text">' + escapeHtmlReason(c.text) + '</span>' + xpTag + '</div>';
      });
      html += '<div class="qc-hint">约定奖励由家庭会议商定 · 下次回顾</div>';
      html += '</div>';
    }
  }

  if (!html) html = '<div style="color:var(--muted-foreground);font-size:13px;padding:20px 0;text-align:center">暂无建议</div>';
  return html;
}

function renderChapter(id, title, content) {
  var container = document.getElementById("wrChapters");
  if (!container) return;
  var existing = document.getElementById(id);
  if (existing) existing.remove();
  var div = document.createElement("div");
  div.className = "wr-chapter";
  div.id = id;
  var dotMap = { chapterAcademic: "#7bb8f7", chapterBehavior: "#7cd4b0", chapterEmotion: "#f28daf", chapterSuggestions: "#d4a843" };
  var dot = dotMap[id] || "#8c8c8c";
  // 默认全部展开（不再加 collapsed）
  div.innerHTML = '<div class="wr-chapter-head" onclick="toggleChapter(this)"><span><span class="ch-dot" style="background:' + dot + '"></span>' + title + '</span><span class="ch-arrow">▼</span></div><div class="wr-chapter-body">' + content + '</div>';
  container.appendChild(div);
}

function toggleChapter(head) {
  var body = head.nextElementSibling;
  if (body) body.classList.toggle("collapsed");
  head.classList.toggle("collapsed");
}

function renderAcademicContent(report) {
  var aca = report.academic || {};
  var hw = aca.homework || {};
  var subjects = hw.subjects || [];
  var html = "";
  var subjColor = { "数学": "#7bb8f7", "语文": "#f28daf", "英语": "#b88af5" };
  if (subjects.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#7bb8f7"></span>作业完成率</div>';
    subjects.forEach(function (s) {
      var pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
      var color = subjColor[s.name] || (s.alert === "low" ? "var(--colourful-sunny-coral-500)" : "var(--colourful-mint-green-500)");
      html += '<div class="wr-progress-row"><div class="wr-progress-head"><span class="wr-p-name">' + s.name + '</span><span class="wr-p-val" style="color:' + color + '">' + s.completed + '/' + s.total + ' · ' + pct + '%</span></div><div class="wr-progress-track"><div class="wr-progress-fill" style="width:' + pct + '%;background:linear-gradient(90deg,' + color + ',' + color + 'cc)"></div></div></div>';
    });
  }
  var trends = aca.trends || [];
  if (trends.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#7cd4b0"></span>成绩趋势</div><div class="wr-trends">';
    var trendText = { up: "📈 上升", down: "📉 下降", stable: "➡️ 稳定", wave: "🔀 波动" };
    var trendColor = { up: "var(--colourful-mint-green-500)", down: "var(--colourful-sunny-coral-400)", stable: "var(--neutral-400)", wave: "var(--colourful-butter-yellow-500)" };
    trends.forEach(function (t) {
      html += '<span class="wr-trend-chip"><span class="wr-t-arrow" style="color:' + (trendColor[t.trend] || "var(--neutral-500)") + '">' + (trendText[t.trend] || t.trend) + '</span><span style="color:var(--neutral-400);font-weight:600">' + t.subject + ' · ' + t.lastGrade + '</span></span>';
    });
    html += '</div>';
  }
  var weakMods = aca.weakModules || [];
  if (weakMods.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#fba07a"></span>需要关注</div><div class="wr-trends">';
    weakMods.forEach(function (m) {
      html += '<span class="wr-alert-chip">⚠️ ' + m.subject + '·' + m.module + ' 未完成 ' + m.incomplete + ' 项</span>';
    });
    html += '</div>';
  }
  // 孩子友好空状态：用 data 里的 emptyHint
  if (!html) {
    var hint = aca.emptyHint || '这周还没记录学习呢～下周记得完成作业，每完成一项就+5XP哦💪';
    html = '<div style="padding:20px 0;text-align:center"><div style="font-size:40px;margin-bottom:10px">📚</div><div style="font-size:15px;font-weight:700;color:var(--neutral-600);line-height:1.6">' + hint + '</div></div>';
  }
  return html;
}

function renderBehaviorContent(report) {
  var beh = report.behavior || {};
  var profile = beh.profile || [];
  var html = "";
  var maxXp = 1;
  profile.forEach(function (p) { if (p.xp > maxXp) maxXp = p.xp; });
  var palette = ["#82d632", "#fdd832", "#36b98b", "#f96024", "#7bb8f7", "#f28daf"];
  if (profile.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#82d632"></span>本周能量条</div>';
    profile.forEach(function (p, i) {
      var w = Math.max(15, Math.round((p.xp / maxXp) * 100));
      // 颜色优先按分类取系统定义色；分类未知时再回落中性灰，杜绝"未定义紫"
      var defined = WCPALETTE[p.category] ? WCPALETTE[p.category].dot : "";
      var c = defined || palette[i % palette.length];
      var icons = ["🌟", "💪", "🎨", "🏃", "🔥", "⭐"];
      html += '<div class="wr-beh-row"><span class="wr-beh-name">' + icons[i % icons.length] + p.category + '</span><span class="wr-beh-track"><span class="wr-beh-fill" style="width:' + w + '%;background:' + c + '"></span></span><span class="wr-beh-meta">+' + p.xp + 'XP</span></div>';
    });
  }
  var stories = beh.effortStories || [];
  if (stories.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#fee680"></span>认真投入亮点</div>';
    stories.slice(0, 3).forEach(function (s) {
      html += '<div class="wr-story"><div class="wr-story-head">📅 ' + (s.subject || "") + ' · ' + (s.date || "") + '</div><div>' + (s.story || "") + '</div>' + (s.reviewerComment ? '<div class="parent-msg">💬 ' + s.reviewerComment + "</div>" : "") + "</div>";
    });
    if (stories.length > 3) html += '<div style="font-size:12px;color:var(--muted-foreground);margin-top:6px">还有 ' + (stories.length - 3) + " 条精彩瞬间</div>";
  }
  var badge = beh.badge || {};
  if (badge.earned) {
    var badgeText = badge.type === "small_perseverance" ? "🏅 小坚持" : "🏆 大毅力";
    html += '<div style="margin-top:12px"><span class="wr-badge">' + badgeText + ' · 连续 ' + badge.days + ' 天</span></div>';
  }
  if (!html) html = '<div style="padding:20px 0;text-align:center"><div style="font-size:36px;margin-bottom:8px">🎯</div><div style="font-size:14px;font-weight:700;color:var(--neutral-500)">还没有行为记录，快去打卡吧</div></div>';
  return html;
}

function renderEmotionContent(report) {
  var emo = report.emotion || {};
  var html = "";
  html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#f28daf"></span>日记活跃度</div>';
  var diaryMap = { active: "🔥 活跃", normal: "✅ 正常", low: "💤 减少" };
  html += '<div class="wr-fin-chip" style="background:rgba(242,141,175,.08);border-color:rgba(242,141,175,.12);color:var(--colourful-candy-pink-400)">' + (diaryMap[emo.diaryTrend] || "✅ 正常") + ' · 本周 ' + (emo.diaryCount || 0) + ' 篇</div>';
  var moods = emo.moodDistribution || {};
  var moodKeys = Object.keys(moods);
  if (moodKeys.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#fee680"></span>心情晴雨表</div><div class="wr-moods">';
    moodKeys.forEach(function (k) {
      var emoji = k === "开心" ? "😊" : k === "难过" ? "😢" : k === "生气" ? "😡" : k === "兴奋" ? "😄" : k === "平静" ? "😌" : k === "惊喜" ? "🤩" : "😐";
      html += '<span class="wr-mood-chip"><span class="wr-m-emoji">' + emoji + '</span>' + k + '<span class="wr-m-count">' + moods[k] + '次</span></span>';
    });
    html += '</div>';
  }
  var best = emo.bestDiary || {};
  if (best.snippet) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#f28daf"></span>本周最佳日记</div>';
    html += '<div class="wr-quote">"' + best.snippet + '"<div class="wr-quote-meta">· ' + (best.date || "") + ' · 四要素 ' + (best.elements || 0) + '/5</div></div>';
  }
  if (emo.financeStatus) {
    var finMap = { good: "🟢 理性消费", watch: "🟡 需要关注", alert: "🔴 冲动消费" };
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#7cd4b0"></span>财商习惯</div>';
    html += '<div class="wr-fin-chip">' + (finMap[emo.financeStatus] || "🟢 理性消费") + ' · 值得率 ' + (emo.financeWorthIt || 0) + '%</div>';
  }
  if (!html) html = '<div style="color:var(--muted-foreground);font-size:13px">暂无数据</div>';
  return html;
}

function renderSuggestionContent(report, familyMeetings) {
  var sug = report.suggestions || {};
  var html = "";
  if (sug.keep) html += '<div class="wr-suggestion is-keep"><span class="wr-s-ico">🏆</span><div><div class="wr-s-title">成就达成</div>' + sug.keep + '</div></div>';
  if (sug.improve) html += '<div class="wr-suggestion is-improve"><span class="wr-s-ico">🎯</span><div><div class="wr-s-title">试试看</div>' + sug.improve + '</div></div>';
  if (sug.challenge) html += '<div class="wr-suggestion is-challenge"><span class="wr-s-ico">🎮</span><div><div class="wr-s-title">趣味挑战</div>' + sug.challenge + '</div></div>';
  // 每周约定：从家庭会议中获取
  var meetings = (familyMeetings || []).filter(function(m) { return m.commitments && m.commitments.length > 0; });
  if (meetings.length > 0) {
    // 找到与当前周报同周或最近一周的会议
    var currentWeek = report.weekNumber;
    var matched = meetings.filter(function(m) { return m.weekNumber === currentWeek; });
    var meeting = matched.length > 0 ? matched[0] : meetings[0];
    if (meeting && meeting.commitments && meeting.commitments.length > 0) {
      var done = meeting.commitments.filter(function(c) { return c.completed; }).length;
      var total = meeting.commitments.length;
      html += '<div class="wr-section-divider"></div>';
      html += '<div class="wr-suggestion is-commitment"><span class="wr-s-ico">🤝</span><div><div class="wr-s-title">📝 每周约定</div>';
      meeting.commitments.forEach(function(c, i) {
        var statusIcon = c.completed ? '✅' : '⏳';
        var statusStyle = c.completed ? 'color:var(--colourful-mint-green-600)' : 'color:var(--neutral-500)';
        var xpTag = '';
        if (c.completed) {
          xpTag = (c.xp > 0) ? '<span style="font-size:11px;color:var(--colourful-mint-green-500)">已兑现 +' + c.xp + 'XP</span>' : '<span style="font-size:11px;color:var(--colourful-mint-green-500)">已兑现</span>';
        }
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;' + statusStyle + ';font-size:13px"><span>' + statusIcon + '</span><span style="flex:1">' + c.text + '</span>' + xpTag + '</div>';
      });
      html += '<div style="margin-top:6px;font-size:12px;color:var(--neutral-400);border-top:1px dashed var(--neutral-200);padding-top:6px">约定奖励由家庭会议时商定 · 下次家庭会议回顾</div>';
      html += '</div></div>';
    }
  }
  if (!html) html = '<div style="color:var(--muted-foreground);font-size:13px">暂无建议</div>';
  return html;
}

// 成长档案（孩子友好：只展示本周亮点，不放家长向的负面诊断）
function renderGrowthContent(report) {
  var g = report.growth || {};
  var html = "";
  var pu = g.profileUpdate || {};
  if (pu.highlights && pu.highlights.length > 0) {
    html += '<div class="wr-sub"><span class="wr-sub-dot" style="background:#fee680"></span>本周闪光点</div>';
    pu.highlights.forEach(function(h) {
      html += '<div style="font-size:13px;color:var(--neutral-600);padding:3px 0;display:flex;align-items:center;gap:6px"><span style="color:var(--colourful-butter-yellow-500)">⭐</span>' + h + '</div>';
    });
  }
  if (!html) html = '<div style="color:var(--muted-foreground);font-size:13px">本周还没有记录，快去打卡吧</div>';
  return html;
}

function populateWeekSelect(reports) {
  var sel = document.getElementById("wrWeekSelect");
  if (!sel) return;
  // 周报只展示每周已生成存档：不提供"本周"入口，仅列已生成的各周
  var currentHtml = "";
  if (reports && reports.length > 0) {
    for (var i = reports.length - 1; i >= 0; i--) {
      var r = reports[i];
      currentHtml += '<option value="' + i + '">第 ' + r.weekNumber + ' 周周报</option>';
    }
  } else {
    currentHtml = '<option value="">暂无周报</option>';
  }
  sel.innerHTML = currentHtml;
  // 渲染历史周报 - 横向胶囊选择器（融入主卡内）
  var list = document.getElementById("wrHistoryList");
  if (!list) return;
  if (!reports || reports.length === 0) {
    list.innerHTML = '<div class="wr-history-item" style="cursor:default">暂无历史周报</div>';
    return;
  }
  var cur = (window.__wrCurrentIndex === undefined || window.__wrCurrentIndex === null) ? (reports.length - 1) : window.__wrCurrentIndex;
  var html = "";
  for (var j = reports.length - 1; j >= 0; j--) {
    var r2 = reports[j];
    var active = (j === cur) ? " active" : "";
    var dateStr = (r2.generatedAt || r2.date) ? String(r2.generatedAt || r2.date).slice(0, 10) : "";
    html += '<div class="wr-history-item' + active + '" onclick="selectHistoryWeek(' + j + ')"><span class="wr-h-week">第 ' + r2.weekNumber + ' 周</span><span class="wr-h-date">' + dateStr + '</span></div>';
  }
  list.innerHTML = html;
}

function selectHistoryWeek(index) {
  if (index === -1) {
    window.__wrCurrentIndex = undefined;
    renderAiWeeklyReport(window.__lastCfg || {});
    return;
  }
  window.__wrCurrentIndex = index;
  var reports = ((window.__lastCfg || {}).aiWeeklyReports || []);
  var report = reports[index];
  if (report) {
    displayWeeklyReport(report, reports, index);
    var sel = document.getElementById("wrWeekSelect");
    if (sel) sel.value = String(index);
  }
}

function switchWeeklyReport(index) {
  if (!index) {
    window.__wrCurrentIndex = undefined;
    renderAiWeeklyReport(window.__lastCfg || {});
    return;
  }
  var idx = parseInt(index, 10);
  var reports = ((window.__lastCfg || {}).aiWeeklyReports || []);
  var report = reports[idx];
  if (report) displayWeeklyReport(report, reports, idx);
}

function displayWeeklyReport(report, allReports, index) {
  if (!report) return;
  if (index !== undefined && index !== null) window.__wrCurrentIndex = index;
  document.getElementById("wrEmpty").style.display = "none";
  document.getElementById("wrFooter").style.display = "";
  document.getElementById("wrTitle").textContent = "第 " + report.weekNumber + " 周成长周报";
  setDateRange(report);
  var cfg = window.__lastCfg || {};
  var childName = (cfg.child && cfg.child.name) || "Yara";
  document.getElementById("wrHero").innerHTML = renderWrHero(report, childName);
  document.getElementById("wrData").innerHTML = renderWrData(report);
  document.getElementById("wrQuest").innerHTML = renderWrQuest(report, cfg.familyMeetings);
  populateWeekSelect(allReports || []);
  if (window.lucide) refreshIcons(20);
}

// ═══════════════════════════════════════════════════════════════
// 家庭会议 — 承诺行增删
// 两种模式：linked（从任务池选，打卡即完成）/ free（自由填写，不关联打卡）
function addCommitmentRow(value, linked) {
  var list = document.getElementById("fmCommitmentList");
  if (!list) return;
  var existing = list.querySelectorAll(".fm-commitment-row").length;
  if (existing >= 10) { showToast("最多设置 10 条约定", false); return; }
  var div = document.createElement("div");
  div.className = "fm-commitment-row";
  div.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center";
  if (linked) {
    // 从任务池选：下拉选择任务，选中后自动带出分类和 XP
    var cfg = window.__lastCfg || {};
    var xpRules = (cfg.config && cfg.config.xpRules) ? cfg.config.xpRules : {};
    var categories = ["学习成长", "能力成长", "身体成长", "兴趣爱好"];
    var opts = ['<option value="">-- 从任务池选一条 --</option>'];
    categories.forEach(function(cat) {
      var tasks = (xpRules[cat] || []).filter(function(t) { return !isAutoTask(t); });
      if (tasks.length === 0) return;
      opts.push('<optgroup label="' + cat + '">');
      tasks.forEach(function(t) {
        opts.push('<option value="' + t.name + '" data-cat="' + cat + '" data-xp="' + (t.xp || 0) + '">' + t.name + '（+' + (t.xp || 0) + ' XP）</option>');
      });
      opts.push('</optgroup>');
    });
    div.innerHTML = '<select class="form-input fm-commitment-select" style="flex:1;font-size:13px;padding:8px 10px">' + opts.join("") + '</select><button type="button" class="btn ghost mini" onclick="removeCommitmentRow(this)" style="color:var(--colourful-error-500);flex-shrink:0">✕</button>';
  } else {
    div.innerHTML = '<input type="text" class="form-input fm-free-input" style="flex:1;font-size:13px" placeholder="例如：每天阅读30分钟" value="' + (value || "") + '" /><input type="number" class="form-input fm-free-xp" min="0" max="20" placeholder="奖励XP" title="奖励积分（可选，不填则不给积分）" style="width:80px;font-size:13px;text-align:center;flex-shrink:0" /><button type="button" class="btn ghost mini" onclick="removeCommitmentRow(this)" style="color:var(--colourful-error-500);flex-shrink:0">✕</button>';
  }
  list.appendChild(div);
  if (window.lucide) refreshIcons(20);
}
function addFreeCommitmentRow() {
  addCommitmentRow("", false);
}
function removeCommitmentRow(btn) {
  var row = btn.closest(".fm-commitment-row");
  if (row) row.remove();
}

// 家庭会议
function openFamilyMeeting() {
  var cfg = window.__lastCfg || {};
  var reports = cfg.aiWeeklyReports || [];
  var currentReport = reports.length > 0 ? reports[reports.length - 1] : null;
  if (!currentReport) { showToast("还没有成长周报，请先等待周报生成", false); return; }
  document.getElementById("fmWeekNumber").textContent = currentWeekNumber();
  var previewEl = document.getElementById("fmPreviewContent");
  if (previewEl) previewEl.textContent = currentReport.summary || "暂无";
  // 检查上周承诺（严格取"周号==本周-1"的会议）
  var lastMeeting = prevWeekMeeting(cfg.familyMeetings);
  var hintEl = document.getElementById("fmPreviousGoalHint");
  if (hintEl) {
    if (lastMeeting && lastMeeting.commitments && lastMeeting.commitments.length > 0) {
      var done = lastMeeting.commitments.filter(function(c) { return c.completed; }).length;
      var total = lastMeeting.commitments.length;
      hintEl.innerHTML = '上周约定：' + done + '/' + total + ' 完成 · <span style="color:' + (done === total ? 'var(--colourful-mint-green-600)' : 'var(--colourful-sunny-coral-600)') + '">' + (done === total ? "✅ 全部完成！" : "⏳ 继续加油") + '</span><br><span style="font-size:12px;color:#6b7280">上次约定：' + lastMeeting.commitments.map(function(c) { return c.text; }).join("、") + '</span>';
    } else {
      hintEl.textContent = '引导语："这周你想给自己定什么小约定？"';
    }
  }
  // 重置表单
  document.getElementById("fmSummary").value = "";
  document.getElementById("fmDiscussion").value = "";
  document.getElementById("fmCommitmentList").innerHTML = "";
  // 默认给 1 条任务池选择 + 1 条自由填写
  addCommitmentRow("", true);
  addCommitmentRow("", false);
  document.getElementById("familyMeetingModal").classList.add("active");
  refreshIcons(50);
}

function closeFamilyMeeting() {
  document.getElementById("familyMeetingModal").classList.remove("active");
}

async function submitFamilyMeeting() {
  var cfg = window.__lastCfg || {};
  var reports = cfg.aiWeeklyReports || [];
  var currentReport = reports.length > 0 ? reports[reports.length - 1] : null;
  if (!currentReport) return;
  var summary = document.getElementById("fmSummary").value.trim();
  var discussion = document.getElementById("fmDiscussion").value.trim();
  // 收集承诺列表（区分 linked 任务池约定 / free 自由填写）
  var rows = document.querySelectorAll("#fmCommitmentList .fm-commitment-row");
  var commitments = [];
  rows.forEach(function(row) {
    var select = row.querySelector(".fm-commitment-select");
    if (select) {
      // 任务池关联模式
      var opt = select.options[select.selectedIndex];
      var name = opt && opt.value ? opt.value : "";
      if (!name) return;
      var cat = opt.getAttribute("data-cat") || "";
      var xp = parseInt(opt.getAttribute("data-xp") || "0", 10) || 0;
      commitments.push({ text: name, taskName: name, category: cat, xp: xp, completed: false, linked: true });
    } else {
      // 自由填写模式：积分可选，不填则无积分
      var inp = row.querySelector(".fm-free-input");
      var val = inp ? inp.value.trim() : "";
      if (val) {
        var xpInp = row.querySelector(".fm-free-xp");
        var xpVal = xpInp ? parseInt(xpInp.value, 10) : 0;
        if (isNaN(xpVal) || xpVal < 0) xpVal = 0;
        commitments.push({ text: val, completed: false, linked: false, xp: xpVal });
      }
    }
  });
  var lastMeeting = prevWeekMeeting(cfg.familyMeetings);
  var btn = document.querySelector("#familyMeetingModal .btn-confirm");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    await window.DataStore.addFamilyMeeting({
      weekNumber: currentWeekNumber(),
      year: currentReport.year || new Date().getFullYear(),
      date: new Date().toISOString().slice(0, 10),
      summary: summary,
      discussion: discussion,
      commitments: commitments,
      previousCommitments: lastMeeting ? lastMeeting.commitments : [],
    });
    await window.DataStore.refreshData(true);
    closeFamilyMeeting();
    showToast("🎉 庆祝会记录已保存！" + (commitments.length > 0 ? " 已约定 " + commitments.length + " 件事" : ""), true);
  } catch (e) {
    console.error("保存家庭会议失败:", e);
    showToast("❌ 保存失败: " + (e.message || "未知错误"), false);
  } finally {
    btn.disabled = false;
    btn.textContent = "🎉 完成庆祝会";
  }
}

// ═══════════════════════════════════════════════════════════════
// MODULE: render-xp.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// render-xp.js — XP/能量星球页面渲染（分析看板版）
// ═══════════════════════════════════════════════════════════════

let pendingRedeemPriv = null;
let homeTrendRange = 7;

async function renderXp() {
  const cfg = await loadAppData();
  const xp = getLevelProgress(cfg);
  const levels = cfg.levels || [];
  const pending = cfg.pendingCount || (cfg.recentRecords || []).filter(item => item.status === "pending").length;

  // ════════ 顶部简介（随机切换）+ 实时数据行 ════════
  setText("xpIntro", pickQuote("xp", XP_INTROS));
  const streak = getCheckInStreak(cfg);
  const xpLiveEl = document.getElementById("xpLiveText");
  if (xpLiveEl) xpLiveEl.innerHTML = `你已经连续浇水 <strong>${streak}</strong> 天，小树苗长高了！`;

  // 等级计算
  const currentLevel = xp.currentLevel;
  // 当前等级下标：服务端返回的 currentLevel 与 levels 数组元素是不同对象引用，
  // 不能直接用 indexOf（会返回 -1），需按名称或 XP 阈值匹配，否则会误落到上一等级。
  const currentLevelIdx = currentLevel
    ? levels.findIndex(l => (currentLevel.name && l.name === currentLevel.name) || (l.xp === currentLevel.xp))
    : -1;

  // ════════ 顶部统计 ════════
  // 能量板块自身的任务（不含"作业·"知识任务、不含"财务"财富任务），保证各模块数值互不串扰
  const _xpAll = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
  const todayStr = new Date().toISOString().slice(0, 10);
  const _m = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const _isEnergyTask = (r) => {
    const n = String(r.taskName || r.title || "");
    // 仅统计能量页自身操作（日记 + 手动打分任务），排除知识页"作业·/成绩录入"与财务页"财务/花销"
    return n.indexOf("作业") < 0 && n.indexOf("成绩录入") < 0 && n.indexOf("财务") < 0 && n.indexOf("花销") < 0;
  };
  const todayXpH = _xpAll.filter(r => getDateStr(r) === todayStr && _isEnergyTask(r))
    .reduce((sum, r) => sum + (Number(r.xp) || 0), 0);
  const heroStatToday = document.getElementById("heroStatToday");
  if (heroStatToday) {
    heroStatToday.textContent = todayXpH > 0 ? `+${todayXpH}` : "0";
    heroStatToday.style.color = todayXpH > 0 ? "" : "var(--neutral-400)";
  }
  // 本周获得能量（本周一至今，能量板块自身任务）
  const heroStatEl = document.getElementById("heroStatWeek");
  if (heroStatEl) {
    const weekXpH = _xpAll.filter(r => getDateStr(r) >= _m && _isEnergyTask(r))
      .reduce((sum, r) => sum + (Number(r.xp) || 0), 0);
    heroStatEl.textContent = weekXpH > 0 ? `+${weekXpH}` : "0";
    heroStatEl.style.color = weekXpH > 0 ? "" : "var(--neutral-400)";
  }

  // ════════ 分类数据聚合（仅统计能量页自身操作的日记与任务，排除知识/财务页自动积分） ════════
  const xpRecordsAll = cfg.xpRecords || [];
  const verifiedXp = xpRecordsAll.filter(r => r.reviewStatus === "已通过" && _isEnergyTask(r));
  const catAgg = {};
  verifiedXp.forEach(r => {
    const cat = r.xpCategory || r.taskCategory || "其他";
    if (!catAgg[cat]) catAgg[cat] = { xp: 0, count: 0 };
    catAgg[cat].xp += (Number(r.xp) || 0);
    catAgg[cat].count += 1;
  });

  // 四维数据（确保四个分类都存在）
  const allCats = ["学习成长", "能力成长", "身体成长", "兴趣爱好"];
  const CAT_ICONS = { "学习成长": "📚", "能力成长": "🧠", "身体成长": "🏃", "兴趣爱好": "🎨" };
  const dims = allCats.map(cat => ({
    name: cat,
    count: catAgg[cat]?.count || 0,
    xp: catAgg[cat]?.xp || 0,
    color: CAT_COLORS[cat] || "#8c8c8c",
    icon: CAT_ICONS[cat] || "📚",
  }));

  // ════════ 频次分析（每个能力锻炼了多少次，展示本页操作的活跃记录） ════════
  const freqEl = document.getElementById("freqAnalysis");
  if (freqEl) {
    const totalCount = dims.reduce((s, d) => s + d.count, 0);
    freqEl.innerHTML = `
      <div class="freq-head">
        <span class="freq-title"><i data-lucide="bar-chart-2"></i>频次分析</span>
        <span class="freq-sub">每个能力锻炼了多少次</span>
      </div>
      <div class="freq-list">
        ${dims.map(d => {
          const pct = totalCount > 0 ? Math.round((d.count / totalCount) * 100) : 0;
          return `
          <div class="freq-row">
            <div class="freq-row-top">
              <span class="freq-row-name"><span class="dot" style="background:${d.color}"></span>${d.name}</span>
              <span class="freq-row-val" style="color:${d.color}">${d.count}次 · ${pct}%</span>
            </div>
            <div class="freq-track"><div class="freq-fill" style="width:${pct}%;background:${d.color}"></div></div>
          </div>`;
        }).join("")}
      </div>`;
    refreshIcons(0);
  }

  const statusMap = {
    pending: { text: "待确认", cls: "pending", icon: "clock" },
    verified: { text: "已通过", cls: "verified", icon: "sparkle" },
    returned: { text: "已退回", cls: "returned", icon: "rotate-ccw" },
  };
  // reviewStatus 中文 → 卡片状态样式/图标 的兼容映射（兼容旧数据只有 reviewStatus 无 status 的情况）
  function statusClsOfReview(v) {
    const t = String(v || "");
    if (t.indexOf("已通过") >= 0) return "verified";
    if (t.indexOf("已退回") >= 0) return "returned";
    return "pending";
  }
  function statusIconOfReview(v) {
    const t = String(v || "");
    if (t.indexOf("已通过") >= 0) return "sparkle";
    if (t.indexOf("已退回") >= 0) return "rotate-ccw";
    return "clock";
  }
  // 能量页只展示本页操作的记录（日记 + 手动打分任务），排除知识页"作业·"自动积分与财务页"财务/花销"自动积分
  const allRecords = (cfg.recentRecords || []).filter(r => _isEnergyTask(r));
  // 按时间倒序（最新在前），审批/退回后卡片停留原位、只变状态，不会跳走
  const sortedRecords = [...allRecords].sort((a, b) => {
    const timeCmp = (b.time || "").localeCompare(a.time || "");
    if (timeCmp !== 0) return timeCmp;
    // 时间相同时，待确认优先
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    return pa - pb;
  });
  const stripEl = document.getElementById("xpRecordsStrip");
  // 按任务名在任务池反查分类，兜底历史/新增时未存分类的记录（taskCategory/xpCategory 为空时使用）
  const xpRulesCfgMap = (cfg && cfg.config && cfg.config.xpRules) || {};
  const taskCategoryLookup = (() => {
    const map = {};
    Object.keys(xpRulesCfgMap).forEach(function (cat) {
      (xpRulesCfgMap[cat] || []).forEach(function (t) {
        if (t && t.name && !map[t.name]) map[t.name] = cat;
      });
    });
    return map;
  })();
  const resolveEnergyCategory = (record) => {
    const direct = (record.xpCategory || record.taskCategory || "");
    if (direct) return direct;
    const taskName = record.taskName || record.title;
    if (taskName && taskCategoryLookup[taskName]) return taskCategoryLookup[taskName];
    return (record.type && record.type !== "XP获得") ? record.type : "";
  };
  const recExpand = window.__xpRecordsExpanded || false;
  if (stripEl) {
    if (allRecords.length === 0) {
      stripEl.innerHTML = `<div style="padding:24px;color:var(--neutral-400);font-size:13px;font-weight:600">暂无记录</div>`;
    } else {
      // 默认铺满 3 行（列数随视口自适应：PC 3列 / 平板 2列 / 移动 1列），待确认的始终展示在前并完整显示
      const COLS = window.innerWidth > 900 ? 3 : (window.innerWidth > 560 ? 2 : 1);
      const ROWS = 3;
      const DEFAULT_CNT = COLS * ROWS;
      const pendingRecords = sortedRecords.filter(r => r.status === "pending");
      const others = sortedRecords.filter(r => r.status !== "pending");
      let visibleRecords;
      if (recExpand) {
        visibleRecords = sortedRecords;
      } else {
        const pendingCount = pendingRecords.length;
        const slots = Math.max(0, DEFAULT_CNT - pendingCount);
        visibleRecords = pendingRecords.concat(others.slice(0, slots));
      }
      const hasMore = allRecords.length > visibleRecords.length;
      const cardHtml = (record) => {
        // 状态取值兼容两套字段：优先 status（pending/verified/returned），否则退回 reviewStatus 中文，
        // 再兜底为"待确认"，杜绝显示 undefined。
        const status = statusMap[record.status]
          || (record.reviewStatus ? { text: record.reviewStatus, cls: statusClsOfReview(record.reviewStatus), icon: statusIconOfReview(record.reviewStatus) } : null)
          || { text: "待确认", cls: "pending", icon: "clock" };
        // 分类取值：优先存于 xpCategory/taskCategory；缺失时按任务名反查任务池；
        // 兜底才用非"XP获得"的 type。杜绝标签丢失、颜色回落默认紫。
        const category = resolveEnergyCategory(record);
        const catColor = CAT_COLORS[category] || WCPALETTE[category]?.dot || "#8c8c8c";
        const dateShort = record.time ? record.time.replace(/^\d{4}-/, "").replace(/-/g, "/") : "";
        // 待确认判断兼容两套字段：status==="pending" 或 reviewStatus==="待确认"，
        // 否则历史数据只有 reviewStatus 时会被当成已处理，不渲染 通过/退回 按钮。
        const isPending = record.status === "pending" || record.reviewStatus === "待确认";
        const isCommitment = !!record.commitmentBonus;
        return `
        <div class="recent-card${isPending ? " pending-card" : ""}" data-record-id="${record.id}" style="--cat-color:${catColor}" onclick="openXpEditModal('${record.id}', this)" title="点击修改这条记录">
          <div class="rc-top">
            <div class="rc-icon" style="background:${catColor}18;color:${catColor}">
              <i data-lucide="${status.icon}"></i>
            </div>
            <div class="rc-title" title="${record.title}">${record.title}</div>
          </div>
          <div class="rc-meta">
            ${category ? `<span class="rc-cat" style="background:${catColor}18;color:${catColor}">${category}</span>` : ""}
            ${isCommitment ? `<span class="rc-cat rc-cat-commit" style="background:#e8f5e9;color:#2e7d32">🤝 承诺</span>` : ""}
            <span>${dateShort}</span>
          </div>
          ${record.description ? `<div class="rc-desc">${escapeHtmlReason(record.description)}</div>` : ""}
          ${record.returnReason ? `<div class="rc-desc rc-desc-return">退回原因：${escapeHtmlReason(record.returnReason)}</div>` : ""}
          <div class="rc-bottom">
            <span class="rc-xp" style="color:${catColor}">${record.value}</span>
            ${isPending ? `
            <span class="rc-actions">
              <button class="rc-approve-btn" onclick="event.stopPropagation();approveXpRecord(this,'${record.id}')" title="通过这条记录"><i data-lucide="check"></i><span>通过</span></button>
              <button class="rc-reject-btn" onclick="event.stopPropagation();openRejectXpModal('${record.id}')" title="退回这条记录"><i data-lucide="x"></i><span>退回</span></button>
            </span>` : `
            <span class="rc-status ${status.cls}">${status.text}</span>`}
          </div>
        </div>`;
      };
      stripEl.innerHTML = cardHtml(visibleRecords[0]) + (visibleRecords.length > 1 ? visibleRecords.slice(1).map(cardHtml).join("") : "");
      // 展示更多 / 收起按钮
      const toggleBtn = document.getElementById("xpRecordsToggle");
      if (toggleBtn) {
        if (recExpand || hasMore) {
          toggleBtn.style.display = "block";
          toggleBtn.textContent = recExpand ? "收起" : `展示更多（${allRecords.length - visibleRecords.length} 条）`;
        } else {
          toggleBtn.style.display = "none";
        }
      }
    }
  }

  // 能量记录：展开 / 收起
  window.toggleXpRecords = function () {
    window.__xpRecordsExpanded = !window.__xpRecordsExpanded;
    renderXp();
  };

  // ════════ 等级权益（全部等级 + 横向滑动） ════════
  const journeyEl = document.getElementById("levelJourney");
  setText("levelJourneyCount", `共 ${levels.length} 级`);
  if (journeyEl) {
    journeyEl.innerHTML = levels.map((lv, idx) => {
      const isCurrent = idx === currentLevelIdx;
      const unlocked = xp.current >= lv.xp;
      const isPrev = idx < currentLevelIdx;
      const isNext = idx > currentLevelIdx;
      const gap = lv.xp - xp.current;
      const theme = LEVEL_THEME[lv.name] || LEVEL_THEME["萌新"];

      let tagText = "";
      if (isCurrent) tagText = "当前等级";
      else if (unlocked) tagText = "已达成";
      else tagText = `还需 ${gap} XP`;

      // 三态类：current | past(已达成非当前) | future(未解锁)
      let stateCls = "";
      if (isCurrent) stateCls = " current";
      else if (unlocked) stateCls = " past";
      else stateCls = " future";

      // 进度占比：当前等级显示"距下一级"的真实进度，已达成=100%，未解锁=0
      let pct = 0;
      if (isCurrent) {
        const nextLv = levels[idx + 1];
        const nextXp = nextLv ? (nextLv.xp || lv.xp) : lv.xp;
        const range = Math.max(1, nextXp - lv.xp);
        pct = Math.max(0, Math.min(1, (xp.current - lv.xp) / range));
      } else if (unlocked) {
        pct = 1;
      }
      const pctPx = Math.round(pct * 100);

      const privs = (lv.privileges || []).slice(0, 4);
      const privHtml = privs.map(p => {
        const isObj = typeof p === "object" && p !== null;
        const pName = isObj ? p.name : (typeof p === "string" ? p : p.text);
        const pIcon = isObj ? (p.icon || "gift") : "gift";
        const pRedeemed = isObj ? !!p.redeemed : false;
        const isDefaultRedeemed = pName === "自由享受每周零花钱";
        const showRedeemed = pRedeemed || (isDefaultRedeemed && unlocked);

        if (!unlocked) {
          return `<div class="js-priv locked"><i data-lucide="lock"></i>${pName}</div>`;
        }
        if (showRedeemed) {
          return `<div class="js-priv redeemed" title="已兑换"><i data-lucide="check"></i>${pName}</div>`;
        }
        return `<div class="js-priv" onclick="openRedeemConfirm('${encodeURIComponent(pName)}', '${lv.name}')" title="点击兑换">
          <i data-lucide="gift"></i>${pName}
        </div>`;
      }).join("");

      return `
        <div class="journey-strip-card ${theme.card}${stateCls}" data-idx="${idx}">
          <span class="js-badge">${lv.levelNum}</span>
          <span class="js-tag">${tagText}</span>
          <div class="js-name">${lv.name}</div>
          <div class="js-xp">${lv.xp} XP 解锁</div>
          <div class="journey-progress"><i style="width:${pctPx}%"></i></div>
          <div class="js-priv-list">${privHtml}</div>
        </div>`;
    }).join("");

    // 滚动到当前等级
    requestAnimationFrame(() => {
      const currentCard = journeyEl.querySelector('.journey-strip-card.current');
      if (currentCard) {
        const containerWidth = journeyEl.clientWidth;
        const cardLeft = currentCard.offsetLeft;
        const cardWidth = currentCard.offsetWidth;
        journeyEl.scrollLeft = cardLeft - (containerWidth - cardWidth) / 2;
      }
    });
  }

  // ════════ 如何积累XP ════════
  const xpRulesEl = document.getElementById("xpRules");
  const earnXpTotalEl = document.getElementById("earnXpTotal");
  const xpRulesCfg = cfg.config && cfg.config.xpRules ? cfg.config.xpRules : {};
  let totalAvailableTasks = 0;

  if (xpRulesEl) {
    // 按版块（分类）渲染卡片，展示：频次 · 单次默认XP · 已获得XP，每版块默认展示 5 条
    // 过滤掉自动/系统类型任务（统一使用全局 isAutoTask 函数）
    const LIMIT = 5;
    const cards = allCats.map(cat => {
      const tasks = (xpRulesCfg[cat] || []).filter(t => !isAutoTask(t));
      const earned = catAgg[cat] ? catAgg[cat].xp : 0;
      const p = WCPALETTE[cat] || WCPALETTE["学习成长"];
      totalAvailableTasks += tasks.length;
      // 默认展示前 5 条，超出部分通过"展开更多"查看
      const visible = tasks.slice(0, LIMIT);
      const hidden = tasks.slice(LIMIT);
      const itemHtml = (t) => `
        <div class="exc-task">
          <span class="exc-task-name">${t.name}</span>
          <span class="exc-task-xp" style="color:${p.color};background:${p.bg}">+${t.xp} XP</span>
        </div>`;
      return `
        <div class="earn-xp-card" data-cat="${cat}" style="--cat-color:${p.dot}">
          <div class="exc-head">
            <span class="exc-title">
              <span class="exc-dot" style="background:${p.dot}"></span>${cat}
            </span>
            <span class="exc-earned">
              <span class="exc-earned-label">已获得</span>
              <b style="color:${p.color}">+${earned}</b>
              <span class="exc-earned-unit">XP</span>
            </span>
          </div>
          ${tasks.length === 0 ? `<div style="font-size:12px;color:var(--neutral-400);padding:8px 0">暂无可用任务</div>` : `
          <div class="exc-tasks">
            ${visible.map(itemHtml).join("")}
            ${hidden.length ? `<div class="exc-tasks-more" style="display:none">${hidden.map(itemHtml).join("")}</div>` : ""}
          </div>
          ${hidden.length ? `<button type="button" class="expand-btn" data-cat="${cat}" onclick="toggleXpRules('${cat}')"><span>展开更多（${hidden.length} 条）</span></button>` : ""}`}
        </div>`;
    }).join("");
    xpRulesEl.innerHTML = cards;
  }
  setText("earnXpTotal", `${totalAvailableTasks} 个可用任务`);

  // 展开/收起 XP 任务列表（超出 5 条的部分）
  window.toggleXpRules = function (cat) {
    const card = document.querySelector('.earn-xp-card[data-cat="' + cat + '"]');
    if (!card) return;
    const more = card.querySelector(".exc-tasks-more");
    const btn = card.querySelector(".expand-btn");
    if (!more || !btn) return;
    const isHidden = more.style.display === "none" || !more.style.display;
    more.style.display = isHidden ? "block" : "none";
    const count = more.querySelectorAll(".exc-task").length;
    btn.querySelector("span").textContent = isHidden ? "收起" : `展开更多（${count} 条）`;
  };

  // ════════ 我的日记本 ════════
  await renderDiary();
}

// ══════════════════════════════════════
// 趋势图渲染
// ══════════════════════════════════════
function renderTrendChart(records, range, areaEl) {
  const area = areaEl || document.getElementById("trendChartArea");
  if (!area) return;

  // 按日期聚合 XP
  const byDate = groupSum(records, r => getDateStr(r), r => Number(r.xp) || 0);

  // 生成日期序列
  const dates = [];
  const today = new Date();
  let startDate;

  if (range === "all") {
    const allDates = Object.keys(byDate).sort();
    startDate = allDates.length > 0 ? new Date(allDates[0]) : new Date(today.getTime() - 6 * 86400000);
  } else {
    const days = parseInt(range);
    startDate = new Date(today.getTime() - (days - 1) * 86400000);
  }

  const startStr = startDate.toISOString().slice(0, 10);
  let cur = new Date(startDate);
  while (cur <= today) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  // 计算累计 XP（累加曲线）
  let cumulative = 0;
  const data = dates.map(d => {
    cumulative += byDate[d] || 0;
    return { date: d, xp: byDate[d] || 0, cumulative };
  });

  const totalPoints = data.length;
  const maxCum = Math.max(...data.map(d => d.cumulative), 10);

  // SVG 尺寸
  const W = area.clientWidth || 600;
  const H = 200;
  const padL = 40, padR = 16, padT = 16, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // 生成折线路径
  const points = data.map((d, i) => {
    const x = totalPoints <= 1 ? padL + chartW / 2 : padL + (i / (totalPoints - 1)) * chartW;
    const y = padT + chartH - (d.cumulative / maxCum) * chartH;
    return { x, y, ...d };
  });

  // 面积路径
  const areaPath = points.map((p, i) => {
    if (i === 0) return `M ${p.x} ${padT + chartH} L ${p.x} ${p.y}`;
    return `L ${p.x} ${p.y}`;
  }).join(" ") + ` L ${points[points.length - 1].x} ${padT + chartH} Z`;

  // 折线
  const linePath = points.map((p, i) => {
    return `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`;
  }).join(" ");

  // X轴标签（最多显示 5 个）
  const labelStep = Math.max(1, Math.ceil(totalPoints / 5));
  const xLabels = data.map((d, i) => {
    if (i % labelStep !== 0 && i !== totalPoints - 1) return null;
    const x = totalPoints <= 1 ? padL + chartW / 2 : padL + (i / (totalPoints - 1)) * chartW;
    const label = d.date.slice(5).replace("-", "/");
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="var(--neutral-300)" font-size="10">${label}</text>`;
  }).filter(Boolean).join("");

  // Y轴标签（3 个刻度）
  const yTicks = [0, Math.round(maxCum / 2), maxCum];
  const yLabels = yTicks.map(v => {
    const y = padT + chartH - (v / maxCum) * chartH;
    return `
      <line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="var(--neutral-50)" stroke-dasharray="3,3"/>
      <text x="${padL - 6}" y="${y + 3}" text-anchor="end" fill="var(--neutral-300)" font-size="10">${v}</text>
    `;
  }).join("");

  // 终点圆点
  const last = points[points.length - 1];
  const endDot = totalPoints > 0 ? `
    <circle cx="${last.x}" cy="${last.y}" r="5" fill="var(--colourful-mint-green-500)" opacity="0.2"/>
    <circle cx="${last.x}" cy="${last.y}" r="3" fill="var(--colourful-mint-green-500)"/>
  ` : "";

  area.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--colourful-mint-green-500)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--colourful-mint-green-500)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${yLabels}
      ${xLabels}
      <path d="${areaPath}" fill="url(#trendAreaGrad)"/>
      <path d="${linePath}" fill="none" stroke="var(--colourful-mint-green-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${endDot}
    </svg>
  `;
}

function bindTrendTabs() {
  initTabGroup(".trend-tab", "range", range => {
    currentTrendRange = range;
    loadAppData().then(cfg => {
      const verifiedXp = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
      renderTrendChart(verifiedXp, currentTrendRange);
    });
  });
}

// 首页趋势图标签切换（独立于能量页，作用域限定在首页容器内）
function bindHomeTrendTabs() {
  const wrap = document.getElementById("homeTrendTabs");
  if (!wrap) return;
  const buttons = wrap.querySelectorAll(".trend-tab");
  buttons.forEach(btn => {
    btn.onclick = () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      homeTrendRange = btn.getAttribute("data-range");
      loadAppData().then(cfg => {
        const verifiedXp = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
        renderTrendChart(verifiedXp, homeTrendRange, document.getElementById("homeTrendChartArea"));
      });
    };
  });
}

// ══════════════════════════════════════
// XP 审批 & 操作
// ══════════════════════════════════════
window.approveXpRecord = async function(btn, recordId, recordEl) {
  // 检查是否为认真投入任务
  const card = recordEl || (btn ? btn.closest('.recent-card') : null);
  const titleEl = card ? card.querySelector('.rc-title') : null;
  const title = titleEl ? titleEl.textContent : '';
  const isEffort = title.indexOf('认真投入') >= 0;
  // 如果待批准的是认真投入，打开带留言的审批弹窗
  if (isEffort) {
    openApproveWithComment(btn, recordId);
    return;
  }
  // 二次确认，防止误触导致多条记录被处理
  if (!confirm("确认「通过」这一条记录？此操作只对该条生效，不会影响其他记录。")) return;
  if (btn) { btn.disabled = true; btn.classList.add("busy"); }
  // 记录当前横向滚动位置与目标卡片位置，审批后保持原位不跳走
  const strip = document.getElementById("xpRecordsStrip");
  const prevScroll = strip ? strip.scrollLeft : 0;
  try {
    // 检查是否为承诺兑现记录，如果是则同步标记家庭会议约定完成
    const record = (cachedData && cachedData.xpRecords || []).find(r => r.id === recordId);
    if (record && record.commitmentBonus) {
      const meeting = currentWeekMeeting(cachedData && cachedData.familyMeetings);
      if (meeting && meeting.commitments) {
        const targetText = record.description ? record.description.replace(" [承诺兑现]", "").trim() : "";
        if (targetText) {
          for (var ci = 0; ci < meeting.commitments.length; ci++) {
            if (!meeting.commitments[ci].completed && meeting.commitments[ci].text === targetText) {
              meeting.commitments[ci].completed = true;
              break;
            }
          }
          await window.DataStore.saveFamilyMeetings(cachedData && cachedData.familyMeetings || []);
        }
      }
    }
    await window.DataStore.updateXpRecord(recordId, { status: "verified" });
    await window.DataStore.refreshData(true);
    await renderXp();
    // 恢复并定位到刚审批的那张卡，让它留在用户眼前
    const stripAfter = document.getElementById("xpRecordsStrip");
    if (stripAfter && prevScroll) stripAfter.scrollLeft = prevScroll;
    const card = stripAfter ? stripAfter.querySelector('.recent-card[data-record-id="' + recordId + '"]') : null;
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    refreshIcons(50);
    showToast("✅ 已通过该条记录，能量已到账", true);
  } catch (e) {
    console.error("审批失败:", e);
    const msg = e.message || "";
    if (msg.indexOf("GitHub Token") >= 0 || msg.indexOf("Token") >= 0) {
      showTokenRequiredToast();
    } else {
      showToast("❌ 审批失败: " + msg, false);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("busy"); }
  }
};

let _rejectXpId = null;
window.openRejectXpModal = function(recordId) {
  _rejectXpId = recordId;
  const reasonEl = document.getElementById("rejectXpReason");
  if (reasonEl) reasonEl.value = "";
  const m = document.getElementById("rejectXpModal");
  if (m) m.classList.add("active");
  refreshIcons(50);
};
window.closeRejectXpModal = function() {
  _rejectXpId = null;
  const m = document.getElementById("rejectXpModal");
  if (m) m.classList.remove("active");
};
window.confirmRejectXp = async function() {
  const id = _rejectXpId;
  if (!id) return;
  const reasonEl = document.getElementById("rejectXpReason");
  const reason = (reasonEl && reasonEl.value.trim()) || "";
  window.closeRejectXpModal();
  await window.rejectXpRecord(null, id, reason);
};

window.rejectXpRecord = async function(btn, recordId, reason) {
  if (btn) { btn.disabled = true; btn.classList.add("busy"); }
  const strip = document.getElementById("xpRecordsStrip");
  const prevScroll = strip ? strip.scrollLeft : 0;
  try {
    await window.DataStore.updateXpRecord(recordId, { status: "returned", returnReason: reason || "" });
    await window.DataStore.refreshData(true);
    await renderXp();
    const stripAfter = document.getElementById("xpRecordsStrip");
    if (stripAfter && prevScroll) stripAfter.scrollLeft = prevScroll;
    const card = stripAfter ? stripAfter.querySelector('.recent-card[data-record-id="' + recordId + '"]') : null;
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    refreshIcons(50);
    showToast("已退回该条记录", false);
  } catch (e) {
    console.error("退回失败:", e);
    const msg = (e && e.message) || (typeof e === "string" ? e : "");
    if (msg.indexOf("GitHub Token") >= 0 || msg.indexOf("Token") >= 0) {
      showTokenRequiredToast();
    } else {
      showToast("❌ 退回失败: " + (msg || "网络异常，请检查网络后重试"), false);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("busy"); }
  }
};

// 事后补勾 / 解除「我承诺的事」：允许对已提交（含已审批通过）的记录修正承诺标记，
// 避免"提交后再也改不了"。与新增时的承诺语义保持一致（+2 XP 加成、描述带 [承诺兑现]）。
// 编辑状态的记录 ID（点击卡片打开录入弹窗进行修改时使用；null 表示全新录入）
window.__xpEditRecordId = null;

// 打开「修改记录」弹窗：复用录入弹窗，预填已可编辑字段，锁定不可改字段。
// 从设置（config.xpRules 分类结构 / config.xpRuleList 扁平结构）中按任务名查基础分；未配置返回 null
function lookupBaseXpFromConfig(cfg, taskName) {
  if (!cfg || !taskName) return null;
  const xpRules = (cfg.config && cfg.config.xpRules) || {};
  for (const cat of Object.keys(xpRules)) {
    const f = (xpRules[cat] || []).find(function(r) { return r && r.name === taskName && r.xp != null; });
    if (f) return Number(f.xp) || null;
  }
  const list = (cfg.config && cfg.config.xpRuleList) || [];
  const f2 = list.find(function(r) { return r && r.name === taskName && r.xp != null; });
  if (f2) return Number(f2.xp) || null;
  return null;
}

// 编辑态打开：锁定基础分（并回填设置中该任务的值），只允许改「备注/承诺」
window.openXpEditModal = async function(recordId, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (ev && ev.preventDefault) ev.preventDefault();
  // 防线：若点击来源是 通过/退回 等操作按钮或其容器（偶发的 stopPropagation 竞态/点到按钮边缘空白），
  // 一律不打开"修改记录"弹窗，交给各自的审批流程处理，避免出现"点通过却弹出编辑"。
  if (ev && ev.target && ev.target.closest) {
    if (ev.target.closest('.rc-approve-btn, .rc-reject-btn, .rc-actions')) return;
  }
  // 用最新数据查找到该记录
  const cfg = (typeof loadAppData === "function") ? await loadAppData() : (window.__lastCfg || {});
  const record = (cfg.familyMeetings ? (cfg.recentRecords || cfg.xpRecords || []) : (cfg.recentRecords || cfg.xpRecords || []))
    .find(r => r.id === recordId)
    || (cfg.xpRecords || cfg.recentRecords || []).find(r => r.id === recordId);
  if (!record) { showToast("⚠️ 未找到这条记录", false); return; }

  window.__xpEditRecordId = recordId;

  // 打开弹窗并预填
  await populateXpTaskSelectPage();
  const modal = document.getElementById("addXpModalPage");
  modal.classList.add("active");

  // 标题与按钮切换为「编辑」语义
  const titleEl = modal.querySelector(".modal-title");
  if (titleEl) titleEl.innerHTML = '<i data-lucide="pencil"></i>修改记录';
  const btn = modal.querySelector(".btn-confirm");
  if (btn) { btn.textContent = "保存修改"; btn.disabled = false; }
  const cancelBtn = modal.querySelector(".btn-cancel");
  if (cancelBtn) cancelBtn.textContent = "取消";

  // 预填备注
  let showDesc = (record.description || "").replace(/\s*\[承诺兑现\]\s*$/g, "").trim();
  const descEl = document.getElementById("xpDescPage");
  if (descEl) descEl.value = showDesc;

  // 预填任务（选中对应项），并锁定任务/分值/分类为只读
  const taskSel = document.getElementById("xpTaskSelectPage");
  const taskName = record.taskName || record.title || "";
  if (taskSel) {
    let idx = -1;
    for (let i = 0; i < taskSel.options.length; i++) {
      if (taskSel.options[i].value === taskName) { idx = i; break; }
    }
    if (idx >= 0) {
      taskSel.selectedIndex = idx;
      // 编辑态：任务不可改，但保留从任务池推导出的分类/分值（无匹配时不触发，避免污染）
      onXpTaskChangePage();
    }
    // 编辑态：任务不可改（只保留当前项的展示效果）
    taskSel.disabled = true;
  }
  // 分值：锁定不可改，统一从设置（xpRules/xpRuleList）按任务名取值；设置里没有才回退到记录原基础分
  const _cfgTaskName = record.taskName || record.title || "";
  const _cfgTaskBase = lookupBaseXpFromConfig(cfg, _cfgTaskName);
  const baseToShow = (_cfgTaskBase != null && _cfgTaskBase > 0)
    ? _cfgTaskBase
    : (record.baseXp != null ? record.baseXp : (Number(record.xp) || 0) - (record.commitmentBonus ? 2 : 0));
  const valEl = document.getElementById("xpValuePage");
  if (valEl) {
    valEl.readOnly = true;
    valEl.value = baseToShow;
  }
  // 分类回填：优先用记录里已存的分类字段（排除非分类的"XP获得"），若缺则保留 onXpTaskChangePage 推导出的分类
  const catEl = document.getElementById("xpCategoryPage");
  const recCat = (record.taskCategory || record.xpCategory || "")
    || (record.type && record.type !== "XP获得" ? record.type : "")
    || "";
  if (catEl && recCat) catEl.value = recCat;

  // 预填承诺勾选
  const chk = document.getElementById("xpCommitmentCheck");
  if (chk) {
    chk.checked = !!record.commitmentBonus;
    chk.disabled = false;
  }
  const hint = document.getElementById("xpCommitmentHint");
  if (hint) hint.style.display = "none";

  refreshIcons(50);
};

// 关闭编辑状态
window.closeXpEdit = function() {
  window.__xpEditRecordId = null;
  const taskSel = document.getElementById("xpTaskSelectPage");
  if (taskSel) taskSel.disabled = false;
  const valEl = document.getElementById("xpValuePage");
  if (valEl) valEl.readOnly = true;
};

// 编辑态保存：任务名锁定不变，备注/承诺/分值可改；自动通过并加（或减）XP；走并发安全合并写。
window.submitEditXpPage = async function() {
  const editId = window.__xpEditRecordId;
  if (!editId) return;

  const cfg = (typeof loadAppData === "function") ? await loadAppData() : (window.__lastCfg || {});
  const allRecs = (cfg.recentRecords || cfg.xpRecords || []);
  const record = allRecs.find(r => r.id === editId);
  if (!record) { showToast("⚠️ 未找到这条记录", false); return; }

  // 收集可编辑字段
  const descEl = document.getElementById("xpDescPage");
  const desc = descEl ? descEl.value.trim() : (record.description || "");
  const chk = document.getElementById("xpCommitmentCheck");
  const willCommit = chk ? chk.checked : !!record.commitmentBonus;

  // 校验备注非空（与新增一致）
  if (!desc) { alert("请填写备注说明"); return; }

  // 任务名锁定不可改；基础分一律从设置取值（改设置分值才会变），保存后自动通过并按设置值结算
  const taskName = record.taskName || record.title || "";
  const settingsBase = lookupBaseXpFromConfig(cfg, taskName);
  const recFallback = (record.baseXp != null && Number(record.baseXp) > 0)
    ? Number(record.baseXp)
    : Math.max(0, (Number(record.xp) || 0) - (record.commitmentBonus ? 2 : 0));
  const baseXp = (settingsBase != null && settingsBase > 0) ? settingsBase : recFallback;
  // 新总分 = 设置基础分 + 承诺加成（勾承诺 +2，未勾不加）
  // 设置分值上调→总能量加，下调→总能量减；取消承诺→自动 -2。加/减都按实际新值结算。
  const newXp = baseXp + (willCommit ? 2 : 0);
  const wasCommit = !!record.commitmentBonus;
  const xpDelta = newXp - (Number(record.xp) || 0);

  const btn = document.querySelector("#addXpModalPage .btn-confirm");
  const originalText = btn.textContent;
  btn.textContent = "保存中...";
  btn.disabled = true;

  try {
    let newDesc = desc;
    if (willCommit) {
      if (newDesc.indexOf("[承诺兑现]") < 0) newDesc = (newDesc ? newDesc + " " : "") + "[承诺兑现]";
    } else {
      newDesc = newDesc.replace(/\s*\[承诺兑现\]\s*$/g, "").trim();
    }

    await window.DataStore.updateXpRecord(editId, {
      description: newDesc,
      commitmentBonus: willCommit,
      xp: newXp,
      baseXp: baseXp,
      // 编辑保存即自动通过并加 XP，避免停留在待确认状态
      status: "verified",
    });

    // 补勾承诺时，同步标记本周同名约定完成
    if (willCommit && !wasCommit) {
      try {
        const meeting = currentWeekMeeting(cfg.familyMeetings);
        if (meeting && meeting.commitments) {
          const taskName = record.taskName || record.title || desc.replace("[承诺兑现]", "").trim();
          let changed = false;
          meeting.commitments.forEach(c => {
            if (c.completed) return;
            if ((c.taskName && c.taskName === taskName) || (c.text && c.text === taskName)) { c.completed = true; changed = true; }
          });
          if (changed) await window.DataStore.saveFamilyMeetings(cfg.familyMeetings || []);
        }
      } catch (e) { console.error("编辑同步约定完成失败:", e); }
    }

    await window.DataStore.refreshData(true);
    closeXpModal();
    window.closeXpEdit();
    // 复用新增保存后的字段清理
    const resetIds = ["xpDescPage", "xpValuePage", "xpCategoryPage"];
    resetIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.getElementById("xpCommitmentCheck").checked = false;
    const hint = document.getElementById("xpCommitmentHint");
    if (hint) hint.style.display = "none";
    await renderXp();
    refreshIcons(50);
    // 保存后按差值提示能量是加还是减，交给用户核对
    let _toastMsg = "✅ 已保存修改";
    if (xpDelta > 0) _toastMsg += `（能量 +${xpDelta}）`;
    else if (xpDelta < 0) _toastMsg += `（能量 ${xpDelta}）`;
    showToast(_toastMsg, true);
  } catch (e) {
    console.error("保存编辑失败:", e);
    btn.textContent = originalText;
    btn.disabled = false;
    handleWriteError(e, "保存失败: " + ((e && e.message) || "未知错误"));
  }
};

// ═══════════════════════════════════════════════════════════════
// 认真投入审批 + 家长留言
// ═══════════════════════════════════════════════════════════════
let _approveRecordId = null;
let _approveBtn = null;

function openApproveWithComment(btn, recordId) {
  _approveRecordId = recordId;
  _approveBtn = btn;
  document.getElementById("approveCommentText").value = "";
  document.getElementById("approveCommentModal").classList.add("active");
  refreshIcons(50);
}

function closeApproveCommentModal() {
  _approveRecordId = null;
  _approveBtn = null;
  document.getElementById("approveCommentModal").classList.remove("active");
}

async function confirmApproveWithComment() {
  const id = _approveRecordId;
  const btn = _approveBtn;
  const comment = document.getElementById("approveCommentText").value.trim();
  if (!id) return;
  closeApproveCommentModal();
  // 审批通过
  if (btn) { btn.disabled = true; btn.classList.add("busy"); }
  const strip = document.getElementById("xpRecordsStrip");
  const prevScroll = strip ? strip.scrollLeft : 0;
  try {
    // 检查是否为承诺兑现记录，如果是则同步标记家庭会议约定完成
    // 注意：linked（任务池关联）约定在打卡提交时已自动标记完成，这里只处理 free（自由填写）约定
    const record = (cachedData && cachedData.xpRecords || []).find(r => r.id === id);
    if (record && record.commitmentBonus) {
      const meeting = currentWeekMeeting(cachedData && cachedData.familyMeetings);
      if (meeting && meeting.commitments) {
        const targetText = record.description ? record.description.replace(" [承诺兑现]", "").trim() : "";
        if (targetText) {
          for (var ci = 0; ci < meeting.commitments.length; ci++) {
            const c = meeting.commitments[ci];
            if (!c.completed && !c.linked && c.text === targetText) {
              c.completed = true;
              break;
            }
          }
          await window.DataStore.saveFamilyMeetings(cachedData && cachedData.familyMeetings || []);
        }
      }
    }
    var updateData = { status: "verified" };
    // 如果家长写了留言，存入
    if (comment) updateData.reviewerComment = comment;
    await window.DataStore.updateXpRecord(id, updateData);
    await window.DataStore.refreshData(true);
    await renderXp();
    const stripAfter = document.getElementById("xpRecordsStrip");
    if (stripAfter && prevScroll) stripAfter.scrollLeft = prevScroll;
    const card = stripAfter ? stripAfter.querySelector('.recent-card[data-record-id="' + id + '"]') : null;
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    refreshIcons(50);
    if (comment) {
      showToast("✅ 已通过，你的留言已同步到记录中 ❤️", true);
    } else {
      showToast("✅ 已通过该条记录，能量已到账", true);
    }
  } catch (e) {
    console.error("审批失败:", e);
    const msg = e.message || "";
    if (msg.indexOf("GitHub Token") >= 0 || msg.indexOf("Token") >= 0) {
      showTokenRequiredToast();
    } else {
      showToast("❌ 审批失败: " + msg, false);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("busy"); }
  }
}

// 权益兑换弹窗
window.openRedeemConfirm = function(encodedName, levelName) {
  const name = decodeURIComponent(encodedName);
  const cfg = window.__LAST_XP_DATA__ || {};
  const levels = cfg.levels || [];
  const xp = getLevelProgress(cfg);
  const achievedLevels = levels.filter(l => xp.current >= l.xp);
  const allPrivileges = achievedLevels.flatMap(l =>
    (l.privileges || []).map(p => {
      const isObj = typeof p === "object" && p !== null;
      return {
        name: isObj ? p.name : (typeof p === "string" ? p : p.text),
        redeemed: isObj ? !!p.redeemed : false,
      };
    })
  );
  const p = allPrivileges.find(x => x.name === name);
  if (!p || p.redeemed) {
    showToast("该权益已兑换，无需重复兑换", false);
    return;
  }
  if (name === "自由享受每周零花钱") {
    showToast("该权益已默认生效，无需手动兑换", false);
    return;
  }
  pendingRedeemPriv = { name, level: levelName };
  document.getElementById("redeemConfirmTitle").textContent = `兑换「${name}」`;
  document.getElementById("redeemConfirmDesc").textContent = `确定要兑换「${name}」吗？兑换后将记录在案，不可撤回。`;
  document.getElementById("redeemConfirmModal").classList.add("show");
};

window.closeRedeemConfirm = function() {
  pendingRedeemPriv = null;
  document.getElementById("redeemConfirmModal").classList.remove("show");
};

window.confirmRedeem = async function() {
  if (!pendingRedeemPriv) return;
  const { name, level } = pendingRedeemPriv;
  try {
    await window.DataStore.redeemPrivilege({ name, level });
    pendingRedeemPriv = null;
    document.getElementById("redeemConfirmModal").classList.remove("show");
    await refreshXpPage();
    refreshIcons(50);
    showToast(`🎁 兑换成功：「${name}」已生效`, true);
  } catch (err) {
    alert("兑换失败：" + err.message);
  }
};




// ═══════════════════════════════════════════════════════════
// MODULE: render-study.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// render-study.js — 学习/知识星球页面渲染
// ═══════════════════════════════════════════════════════════════

// ── 能力雷达图配置（仅作兜底，优先使用飞书配置表的颜色/图标） ──
const RADAR_COLORS = {
  "语文": { main: "#F95D9F", light: "#fde8f0", stroke: "#d63068" },
  "数学": { main: "#4A9EFF", light: "#e6f2ff", stroke: "#2b75e0" },
  "英语": { main: "#9255F5", light: "#efe9ff", stroke: "#6d28d9" },
};
const RADAR_SUBJ_ICON = { "语文": "book-open", "数学": "calculator", "英语": "languages" };

// 绘制单个雷达图 SVG
// 从配置中获取指定学科的所有能力模块（严格模式）
function getSubjectModules(sub, configModules, subDone) {
  const cfgMods = configModules && configModules[sub];
  if (cfgMods && cfgMods.length > 0) {
    return cfgMods.map(m => typeof m === "object" ? m.name : m);
  }
  // 从已完成作业中提取实际出现的模块（无配置时兜底）
  const modSet = new Set();
  subDone.filter(a => a.subject === sub).forEach(a => {
    const modList = Array.isArray(a.modules) && a.modules.length > 0
      ? a.modules
      : (a.module ? [a.module] : []);
    modList.forEach(m => { if (m) modSet.add(m); });
  });
  return [...modSet];
}

// 渲染能力雷达图（支持增量更新）
// 维度与科目严格从配置加载：遍历 configModules 的科目，颜色/图标优先取配置表
function renderAbilityRadar(doneList, subjIcon, configModules, configSubjects) {
  const abilityGrid = document.getElementById("abilityGrid");
  if (!abilityGrid) return;

  // 科目列表：优先用配置了能力模块的科目；无配置时回退到内置三科
  const subjects = configModules && Object.keys(configModules).length > 0
    ? Object.keys(configModules)
    : ["语文", "数学", "英语"];
  const subDone = doneList.filter(a => a.subject);

  abilityGrid.innerHTML = subjects.map(sub => {
    const mods = getSubjectModules(sub, configModules, subDone);
    const modCounts = {};
    mods.forEach(m => { modCounts[m] = 0; });
    subDone.filter(a => a.subject === sub).forEach(a => {
      // 同时统计 module（单模块）和 modules（多模块数组）
      const modList = Array.isArray(a.modules) && a.modules.length > 0
        ? a.modules
        : (a.module ? [a.module] : []);
      modList.forEach(m => {
        if (modCounts.hasOwnProperty(m)) modCounts[m]++;
      });
    });
    const values = mods.map(m => modCounts[m]);
    const total = values.reduce((s, v) => s + v, 0);
    // 颜色/图标优先用配置表，回退到内置映射
    const visual = getSubjectVisual(sub, configSubjects);
    const main = visual.color || (RADAR_COLORS[sub] ? RADAR_COLORS[sub].main : "#9ca3af");
    const colors = {
      main,
      light: lightenColor(main, 0.85),
      stroke: main,
    };
    const icon = visual.icon || (subjIcon ? subjIcon[sub] : "") || RADAR_SUBJ_ICON[sub] || "circle";

    return `
      <div class="radar-card">
        <div class="radar-head">
          <span class="radar-subj"><i data-lucide="${icon}" style="color:${colors.main};"></i>${sub}能力雷达</span>
          <span class="radar-total">共 ${total} 次练习</span>
        </div>
        <div class="radar-chart-wrap">
          ${renderRadarChart(mods, values, colors, 180)}
        </div>
        <div class="radar-legend">
          ${mods.map((m, i) => `
            <div class="radar-legend-item">
              <span class="legend-dot" style="background:${colors.main};opacity:${0.3 + (values[i] / Math.max(...values, 1)) * 0.7};"></span>
              <span class="legend-name">${m}</span>
              <span class="legend-val">${values[i]}次</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  refreshIcons(30);
}

// ── 作业行渲染（新设计：可点击切换状态） ──
function renderHwRow(a, hidden, index, earnedXp) {
  // 科目样式：内置三科用专门配色类，新增科目回退通用类
  const KNOWN = { "语文": "cn", "数学": "math", "英语": "en" };
  const subjClass = KNOWN[a.subject] || "other";
  const isDone = a.status === "done";
  const isExpired = a.status === "expired";
  const isSubmitted = a.submitted === true;
  const showSubmitted = isDone || isSubmitted;
  const hiddenClass = hidden ? " hw-hidden" : "";
  let title = a.title || a.shortTitle || a.name || "";
  title = title.replace(/^\d{2}-\d{2}[^：]*[：:]\s*/, "").trim();
  const shortSubj = ["语文", "数学", "英语"].includes(a.subject)
    ? { "语文": "语", "数学": "数", "英语": "英" }[a.subject]
    : (a.subject || "").slice(0, 1) || "科";
  const itemId = a.id || "";
  const safeTitle = typeof escapeHtmlReason === "function" ? escapeHtmlReason(title) : title;
  // 已完成作业：显示获得的 XP（从配置中查找）
  const xpBadge = isDone && earnedXp != null
    ? `<span class="hw-xp-badge">+${earnedXp} XP</span>`
    : "";

  const modList = Array.isArray(a.modules) && a.modules.length > 0
    ? a.modules
    : (a.module ? [a.module] : []);
  let modTag = "";
  if (modList.length > 0) {
    const MAX_SHOW = 3;
    const shown = modList.slice(0, MAX_SHOW);
    const extra = modList.length - MAX_SHOW;
    modTag = shown.map(m => `<span class="hw-mod-tag">${m}</span>`).join("")
      + (extra > 0 ? `<span class="hw-mod-tag hw-mod-more">+${extra}</span>` : "");
  }

  // 完成用时标签（有记录才展示）
  const durTag = a.duration ? `<span class="hw-dur-tag"><i data-lucide="timer"></i>${a.duration}</span>` : "";

  // 截止状态
  let dueClass = "";
  let dueIcon = "calendar";
  let dueText = a.dueDate ? `截止 ${a.dueDate}` : "";
  if (isExpired) {
    dueClass = " hw-due-expired"; dueIcon = "calendar-x"; dueText = "已到期";
  } else if (!showSubmitted && a.dueDate) {
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(a.dueDate); due.setHours(0,0,0,0);
    const daysLeft = Math.ceil((due - today) / (1000*60*60*24));
    if (daysLeft < 0) { dueClass = " hw-due-overdue"; dueIcon = "alert-circle"; dueText = `已逾期 ${Math.abs(daysLeft)} 天`; }
    else if (daysLeft === 0) { dueClass = " hw-due-today"; dueText = "今天截止"; }
    else if (daysLeft <= 2) { dueClass = " hw-due-soon"; dueText = `还剩 ${daysLeft} 天`; }
  } else if (showSubmitted && a.dueDate) {
    dueClass = " hw-due-done"; dueText = "";
  }

  const metaBit = dueText ? `<span class="hw-meta${dueClass}"><i data-lucide="${dueIcon}"></i>${dueText}</span>` : "";

  // 右侧操作：提交 + 编辑（始终垂直居中）
  // 已完成状态自动显示"已提交"，保持UI一致；已到期保留"改回完成 + 编辑"，方便之后重新启用
  // 注：标记过"未完成"（expired）的作业，改回完成时不会自动获得默认积分（wasIncomplete 防重复奖励）
  const actions = `
    <div class="hw-actions">
      ${isExpired
        ? `<span class="hw-expired-tag"><i data-lucide="circle-x"></i>未完成</span>`
        : `${!showSubmitted
             ? `<button class="hw-btn-soft" data-mark-incomplete="${itemId}" title="标记为未完成（将归入已完结）">
                  <i data-lucide="minus-circle"></i>未完成
                </button>`
             : ""}
           <button class="hw-submit-btn${showSubmitted ? " submitted" : ""}" data-toggle-submit="${itemId}" title="${showSubmitted ? "已提交" : "提交作业"}">
             <i data-lucide="${showSubmitted ? "check" : "send"}"></i>${showSubmitted ? "已提交" : "提交"}
           </button>`}
      <button class="hw-edit-btn" data-edit="${itemId}" title="编辑作业">
        <i data-lucide="pencil"></i>编辑
      </button>
    </div>`;

  const rowStateCls = isDone ? " hw-done" : (isExpired ? " hw-expired" : "");
  return `<div class="hw-row${subjClass === "cn" ? " cn" : ""}${subjClass === "math" ? " math" : ""}${subjClass === "en" ? " en" : ""}${hiddenClass}${rowStateCls}" data-idx="${index != null ? index : ""}" data-id="${itemId}">
    <div class="hw-check-col">
      ${isExpired
        ? `<button class="hw-check-btn closed" data-toggle-status="${itemId}" title="标记为已完成"><i data-lucide="circle"></i></button>`
        : `<button class="hw-check-btn${showSubmitted ? " checked" : ""}" data-toggle-status="${itemId}" title="${showSubmitted ? "标记为待完成" : "标记为已完成"}">
             <i data-lucide="${showSubmitted ? "check-circle-2" : "circle"}"></i>
           </button>`}
    </div>
    <div class="hw-subj ${subjClass}">${shortSubj}</div>
    <div class="hw-content">
      <div class="hw-title">${safeTitle}${xpBadge}</div>
      <div class="hw-subline">
        <span class="hw-chips">${modTag ? `<span class="hw-mod-group">${modTag}</span>` : ""}${durTag}</span>
        ${metaBit}
      </div>
    </div>
    ${actions}
  </div>`;
}

// 增量更新学习统计数字（P5优化：避免全量重渲）
function updateStudyStatsDisplay(cfg) {
  const statsRow = document.getElementById("hwStatsRow");
  if (!statsRow) return;
  const valEls = statsRow.querySelectorAll(".hsi-value");
  if (valEls.length < 4) return;
  // 统一基于"当前学期作业"计算（暑假等归档作业不参与新学期完成率）
  let list = [];
  if (cfg && cfg.study) {
    const asm = getAllAssignments(cfg);
    list = asm.filter(a => !(a && a.term && String(a.term).trim()));
  }
  const doneCount = list.filter(a => a.status === "done").length;
  const pendingCount = list.filter(a => a.status !== "done" && a.status !== "expired").length;
  const expired = list.filter(a => a.status === "expired").length;
  const donePct = pct(doneCount, list.length);
  valEls[0].textContent = pendingCount;   // 待完成
  valEls[1].textContent = doneCount;      // 已完成
  valEls[2].textContent = donePct + "%";  // 完成率
  valEls[3].textContent = expired;        // 已到期
  const subEls = statsRow.querySelectorAll(".hsi-sub");
  if (subEls.length >= 2) {
    subEls[1].textContent = pendingCount > 0 ? "需尽快完成" : "全部完成";
  }
}

async function renderStudy() {
  const cfg = await loadAppData();
  const study = cfg.study || {};

  // ════════ 顶部简介（随机切换）+ 实时数据行 ════════
  setText("studyIntro", pickQuote("study", STUDY_INTROS));
  const stars = getWeekStars(cfg);
  const studyLiveEl = document.getElementById("studyLiveText");
  if (studyLiveEl) studyLiveEl.innerHTML = `本周你已点亮 <strong>${stars}</strong> 颗知识星星 🌟`;

  // 知识板块 本周/今日 获得能量（以"作业·"开头的已通过 XP 记录）
  const verifiedXp = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
  const isKnowledge = (r) => String(r.taskName || r.title || "").indexOf("作业") >= 0 || /完成$/.test(String(r.description || ""));
  const stoday = new Date();
  const sMonday = new Date(stoday);
  sMonday.setDate(stoday.getDate() - ((stoday.getDay() + 6) % 7));
  const sMondayStr = sMonday.toISOString().slice(0, 10);
  const sTodayStr = stoday.toISOString().slice(0, 10);
  let sWeekK = 0, sTodayK = 0;
  verifiedXp.forEach(r => {
    if (!isKnowledge(r)) return;
    const xp = Number(r.xp) || 0;
    const d = getDateStr(r);
    if (d >= sMondayStr) sWeekK += xp;
    if (d === sTodayStr) sTodayK += xp;
  });
  const sWeekEl = document.getElementById("studyStatWeek");
  if (sWeekEl) { sWeekEl.textContent = sWeekK > 0 ? `+${sWeekK}` : "0"; sWeekEl.style.color = sWeekK > 0 ? "" : "var(--neutral-400)"; }
  const sTodayEl = document.getElementById("studyStatToday");
  if (sTodayEl) { sTodayEl.textContent = sTodayK > 0 ? `+${sTodayK}` : "0"; sTodayEl.style.color = sTodayK > 0 ? "" : "var(--neutral-400)"; }

  const subjBarClass = { "语文": "cn", "数学": "math", "英语": "en" };
  const subjIcon = { "语文": "book-open", "数学": "calculator", "英语": "languages" };
  const cfgSubjects = cfg.config?.subjects || [];
  const cfgSubjectNames = cfgSubjects.map(s => s.name).filter(Boolean);

  // ════════ 1. 数据准备 ════════
  const todayStr = new Date().toISOString().slice(0, 10);
  // 统一声明考试记录，供成绩分析和期末成绩模块共用
  let examRecords = (study.examRecords || []).filter(r =>
    r.subject !== "未知" && r.grade && (r.semesterLabel || (r.year && r.semester))
  );
  const allGroups = study.allHomework || [];
  const allAssignments = collectAssignments(allGroups);
  // ════════ 学期归档：暑假等历史作业单独归档，不参与新学期完成率 ════════
  // 当前学期 = 无 term 字段的作业（新学期正式录入，如四年级上）；
  // 归档 = 带 term 的历史作业（如"夏季假期"），单独归入"已完结"，不计入新学期完成率。
  const isArchived = (a) => !!(a && a.term && String(a.term).trim());
  const currentTermAssignments = allAssignments.filter(a => !isArchived(a));
  const archivedAssignments = allAssignments.filter(isArchived);
  const total = currentTermAssignments.length;
  const pendingList = currentTermAssignments.filter(a => a.status !== "done" && a.status !== "expired");
  const doneList = currentTermAssignments.filter(a => a.status === "done");
  const expiredList = currentTermAssignments.filter(a => a.status === "expired");
  const donePct = pct(doneList.length, total);
  // 同步作业列表数据到全局，供保存后的局部刷新（refreshHomeworkSection）重算作业区块
  if (window.__studyHW) {
    window.__studyHW.pendingList = pendingList;
    window.__studyHW.doneList = doneList;
    window.__studyHW.expiredList = expiredList;
    window.__studyHW.archivedList = archivedAssignments;
  }

  // ════════ 2. 学习总览（科目完成率雷达 + 最新成绩） ════════
  const subjRadarEl = document.getElementById("subjectRadarContainer");
  const latestExamEl = document.getElementById("latestExamList");

  // 有作业的科目（用于雷达图）— 只统计当前学期
  const actualSubs = [...new Set(currentTermAssignments.map(a => a.subject).filter(Boolean))];
  const subjStats = actualSubs.map(sub => {
    const subAll = currentTermAssignments.filter(a => a.subject === sub);
    const subDone = subAll.filter(a => a.status === "done");
    return { name: sub, pct: subAll.length > 0 ? Math.round((subDone.length / subAll.length) * 100) : 0 };
  }).sort((a, b) => a.name.localeCompare(b.name, "zh"));

  // 右侧状态卡：学习进度
  setText("studyHeroPct", `作业完成率：${donePct.toFixed(2)}%`);     // 完成率
  const studyHeroFill = document.getElementById("studyHeroFill");
  if (studyHeroFill) studyHeroFill.style.width = `${donePct}%`;

  if (subjRadarEl && subjStats.length >= 3) {
    // 知识模块主色（天蓝）：科目完成率雷达统一使用该色，保持版块配色一致
    const main = "#3e94f5";
    const colors = { main, light: lightenColor(main, 0.85), stroke: main };
    const mods = subjStats.map(s => s.name);
    const values = subjStats.map(s => s.pct);
    subjRadarEl.innerHTML = renderRadarChart(mods, values, colors, 200);
  } else if (subjRadarEl) {
    subjRadarEl.innerHTML = emptyStateHTML("radar", "科目数据不足");
  }

  // 最新成绩（只看语数英，每科最新一条，最多3条）
  if (latestExamEl) {
    if (examRecords.length === 0) {
      latestExamEl.innerHTML = emptyStateHTML("graduation-cap", "暂无成绩记录", 100);
    } else {
      // 只看语数英
      const mainSubjects = ["语文", "数学", "英语"];
      const mainRecords = examRecords.filter(r => mainSubjects.includes(r.subject));

      if (mainRecords.length === 0) {
        latestExamEl.innerHTML = emptyStateHTML("graduation-cap", "暂无语数英成绩", 100);
      } else {
        // 按考试日期排序，取每科最新（日期最晚的）
        const bySubj = groupBy(mainRecords, "subject");
        const latestBySubj = {};
        Object.entries(bySubj).forEach(([subj, records]) => {
          const sorted = [...records].sort((a, b) => {
            // 优先按 date 降序（最新的在前）
            const da = a.date || "", db = b.date || "";
            if (da && db) return db.localeCompare(da);
            // 没有 date 时按学期排序
            const la = a.semesterLabel || "", lb = b.semesterLabel || "";
            return _semesterOrder(lb) - _semesterOrder(la);
          });
          latestBySubj[subj] = sorted[0];
        });

        // 按语数英顺序排列，最多3条
        const showSubs = mainSubjects.filter(s => latestBySubj[s]).slice(0, 3);

        function getScoreLevel(grade) {
          if (grade === "A+" || grade === "A") return "good";
          if (grade === "B" || grade === "B-") return "warn";
          return "good";
        }

        let html = showSubs.map(subj => {
          const r = latestBySubj[subj];
          const scoreClass = getScoreLevel(r.grade);
          const semLabel = r.semesterLabel || (r.year ? r.year + (r.semester === "第二学期" ? "下" : "上") : "");
          return `
            <div class="exam-score-row">
              <span class="es-subj">${subj}</span>
              <span class="es-score ${scoreClass}">${r.grade}</span>
              <span class="es-meta">${semLabel}${r.score ? " · " + r.score + "分" : ""}</span>
            </div>
          `;
        }).join("");

        latestExamEl.innerHTML = html;
      }
    }
  }

  // ════════ 3. 作业列表（整合版 + 筛选） ════════
  const listEl = document.getElementById("assignmentList");
  const showMoreBtn = document.getElementById("showMoreAssignments");
  // 筛选/展开状态存到全局，供保存后的局部刷新（refreshHomeworkSection）保持一致
  window.__studyHW = window.__studyHW || {};
  let currentHwFilter = (typeof window.__studyHW.filter === "string") ? window.__studyHW.filter : "pending";
  let hwExpanded = window.__studyHW.expanded === true;
  window.__studyHW.getFilteredList = function(f) {
    const asc2 = (a, b) => (a.dueDate || "").localeCompare(b.dueDate || "");
    const desc2 = (a, b) => (b.dueDate || "").localeCompare(a.dueDate || "");
    const pend = window.__studyHW.pendingList || [];
    const done = window.__studyHW.doneList || [];
    const exp = window.__studyHW.expiredList || [];
    const arch = window.__studyHW.archivedList || [];
    if (f === "pending") return [...pend].sort(asc2);
    if (f === "finished" || f === "done") return [...done].sort(desc2).concat([...exp].sort(asc2), [...arch].sort(desc2));
    return [...pend].sort(asc2).concat([...exp].sort(asc2), [...done].sort(desc2), [...arch].sort(desc2));
  };
  window.__studyHW.setState = function(filter, expanded) {
    window.__studyHW.filter = filter;
    window.__studyHW.expanded = expanded === true;
  };

  function getFilteredList(filter) {
    const asc = (a, b) => (a.dueDate || "").localeCompare(b.dueDate || "");
    const desc = (a, b) => (b.dueDate || "").localeCompare(a.dueDate || "");
    if (filter === "pending") return [...pendingList].sort(asc);
    // 已完结 = 当前学期已完成 + 已到期 + 全部归档历史作业（含"夏季假期"）
    if (filter === "finished" || filter === "done") {
      return [...doneList].sort(desc)
        .concat([...expiredList].sort(asc))
        .concat([...archivedAssignments].sort(desc));
    }
    // all：待完成在前（正序），已到期其次（正序），已完成与归档在后（倒序）
    return [...pendingList].sort(asc)
      .concat([...expiredList].sort(asc), [...doneList].sort(desc), [...archivedAssignments].sort(desc));
  }

  function getHwXp(item) {
    // 已不再区分作业类型：作业完成统一 +1 XP
    return item ? 1 : null;
  }

  function renderAssignmentList(filter) {
    if (!listEl) return;
    const list = getFilteredList(filter);

    if (list.length === 0) {
      let emptyIcon = "inbox";
      let emptyText = "暂无作业";
      if (filter === "pending") { emptyIcon = "party-popper"; emptyText = "太棒了，当前没有待办作业！"; }
      else if (filter === "finished" || filter === "done") { emptyIcon = "list-checks"; emptyText = "还没有已完结的作业记录"; }
      listEl.innerHTML = `<div class="hw-empty">${emptyStateHTML(emptyIcon, emptyText)}</div>`;
      if (showMoreBtn) showMoreBtn.style.display = "none";
      // 隐藏统计行中的无效提示
      return;
    }

    const visibleCount = 6;
    const visible = list.slice(0, visibleCount);
    const hidden = list.slice(visibleCount);
    let html = visible.map((a, i) => renderHwRow(a, false, "a-" + i, getHwXp(a))).join("");
    html += hidden.map((a, i) => renderHwRow(a, !hwExpanded, "a-" + (i + visibleCount), getHwXp(a))).join("");
    listEl.innerHTML = html;
    if (hidden.length > 0) {
      if (showMoreBtn) {
        showMoreBtn.style.display = "block";
        showMoreBtn.textContent = hwExpanded ? "收回" : `展开更多（还有 ${hidden.length} 条）`;
        showMoreBtn.onclick = function() {
          hwExpanded = !hwExpanded;
          if (window.__studyHW && window.__studyHW.setState) window.__studyHW.setState(currentHwFilter, hwExpanded);
          renderAssignmentList(filter);
        };
      }
    } else if (showMoreBtn) {
      showMoreBtn.style.display = "none";
    }
    refreshIcons(0);
  }

  // 绑定筛选 Tab
  initTabGroup("#hwFilterTabs .hw-filter-btn", "filter", filter => {
    currentHwFilter = filter;
    if (window.__studyHW && window.__studyHW.setState) window.__studyHW.setState(filter, hwExpanded);
    renderAssignmentList(filter);
  }, "pending");
  if (window.__studyHW && window.__studyHW.setState) window.__studyHW.setState(currentHwFilter, hwExpanded);
  renderAssignmentList(currentHwFilter);

  // ════════ 4. 作业统计卡片 ════════
  const hwStatsEl = document.getElementById("hwStatsRow");
  if (hwStatsEl) {
    const total = currentTermAssignments.length;
    const done = doneList.length;
    const pending = pendingList.length;
    const expired = expiredList.length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    // 计算已完成作业获得的总 XP
    const doneXpTotal = doneList.reduce(function(sum, a) {
      const xp = getHwXp(a);
      return sum + (xp != null ? xp : 0);
    }, 0);

    hwStatsEl.innerHTML = `
      <div class="hw-stat-item todo">
        <div class="hsi-label">待完成</div>
        <div class="hsi-value">${pending}</div>
        <div class="hsi-sub">待完成中</div>
      </div>
      <div class="hw-stat-item done">
        <div class="hsi-label">已完成</div>
        <div class="hsi-value">${done}</div>
        <div class="hsi-sub">${doneXpTotal > 0 ? '共获得 +' + doneXpTotal + ' XP' : '真棒，继续保持'}</div>
      </div>
      <div class="hw-stat-item rate">
        <div class="hsi-label">完成率</div>
        <div class="hsi-value">${rate}%</div>
        <div class="hsi-sub">共 ${total} 项作业</div>
      </div>
      <div class="hw-stat-item total">
        <div class="hsi-label">已到期</div>
        <div class="hsi-value">${expired}</div>
        <div class="hsi-sub">项已到期末完成</div>
      </div>
    `;
  }

  // ════════ 5. 学习能力雷达图 ════════
  const abilityGrid = document.getElementById("abilityGrid");
  if (abilityGrid) {
    const cfgModules = cfg.config?.abilityModules || null;
    const cfgSubjects = cfg.config?.subjects || null;
    renderAbilityRadar(doneList, subjIcon, cfgModules, cfgSubjects);
  }

  // ════════ 7.5 成绩分析渲染函数 ════════
  let currentScoreSubject = "语文";
  let currentScoreSemester = "";

  // 科目配置与等级样式（外层作用域，供平时成绩列表/汇总与学期末视图共用）
  const scoreSubjConfig = {
    "语文": { cls: "cn", order: 1 },
    "数学": { cls: "math", order: 2 },
    "英语": { cls: "en", order: 3 },
    "科学": { cls: "sci", order: 4 },
    "道法": { cls: "other", order: 5 },
    "道德与法治": { cls: "other", order: 5 },
    "音乐": { cls: "other", order: 6 },
    "体育": { cls: "other", order: 7 },
    "美术": { cls: "other", order: 8 },
    "劳动": { cls: "other", order: 9 },
    "综合实践": { cls: "other", order: 10 },
    "综合实践活动": { cls: "other", order: 10 },
    "心理": { cls: "other", order: 11 },
    "心理健康": { cls: "other", order: 11 },
    "信息技术": { cls: "other", order: 12 },
    "信息科技": { cls: "other", order: 12 },
    "书法": { cls: "other", order: 13 },
  };
  function getSubjCfg(name) { return scoreSubjConfig[name] || { cls: "other", order: 99 }; }
  function getGradeCls(g) {
    if (g === "A+") return "grade-a-plus";
    if (g === "A") return "grade-a";
    if (g === "B+") return "grade-b-plus";
    if (g === "B") return "grade-b";
    return "grade-a";
  }

  // 学期标签排序辅助函数：返回学期的"顺序值"（越大越新）
  function _semesterOrder(label) {
    const gradeCn = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };
    const m = String(label).match(/([一二三四五六七八九十]+)年级[（(]?([上下]?)[）)]?/);
    if (!m) return 0;
    const grade = gradeCn[m[1]] || 0;
    const term = m[2] === "下" ? 2 : 1;
    return grade * 10 + term;
  }

  function getSemesterLabelList() {
    // 从考试记录中提取所有学期标签，按时间从早到晚排序
    const labels = [...new Set(examRecords.map(r => r.semesterLabel).filter(Boolean))];
    labels.sort((a, b) => _semesterOrder(a) - _semesterOrder(b));
    return labels;
  }

  // 获取默认学期：优先用校历的当前学期（如果有成绩数据），否则用最新考试所在的学期
  function getDefaultSemester() {
    const labels = getSemesterLabelList();
    if (labels.length === 0) return "";
    // 尝试用校历当前学期
    if (window.SemesterCalendar && window.SemesterCalendar.getCurrentSemesterInfo) {
      try {
        const info = window.SemesterCalendar.getCurrentSemesterInfo();
        const currentLabel = info.grade + "(" + info.semesterShortName + ")";
        if (labels.includes(currentLabel)) return currentLabel;
      } catch (e) { /* ignore */ }
    }
    // 回退：用最新考试记录所在的学期（按考试日期排序）
    const sorted = [...examRecords].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const latestExam = sorted[0];
    if (latestExam && latestExam.semesterLabel && labels.includes(latestExam.semesterLabel)) {
      return latestExam.semesterLabel;
    }
    // 最终回退：用排序后的最后一个（最高年级）
    return labels[labels.length - 1];
  }

  function renderScoreTrendChart(subject, semesterLabel) {
    const chartEl = document.getElementById("scoreTrendChart");
    const emptyEl = document.getElementById("scoreTrendEmpty");
    if (!chartEl) return;

    // 筛选当前学期+当前科目的考试记录
    const records = examRecords.filter(r =>
      r.subject === subject &&
      r.semesterLabel === semesterLabel
    ).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // 如果只有期末成绩（或没有平时成绩），显示空状态
    const regularExams = records.filter(r => isDailyScoreType(r.examType));
    if (regularExams.length === 0 && records.length <= 1) {
      chartEl.style.display = "none";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    chartEl.style.display = "block";
    if (emptyEl) emptyEl.style.display = "none";

    // 考试类型标记形状
    const examTypeShapes = {
      "单元测试": "circle",
      "月考": "square",
      "期中": "triangle",
      "期末": "diamond",
      "日常测验": "circle",
    };

    // 计算图表尺寸
    const width = 600;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 36, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 判断是否有分数
    const hasScores = records.some(r => r.score != null && r.score !== "");

    let points = [];
    let yLabels = [];
    const subjectColor = { "语文": "#F95D9F", "数学": "#4A9EFF", "英语": "#9255F5" }[subject] || "#6366f1";

    if (hasScores) {
      // 有分数：用分数绘制折线图
      const scores = records.map(r => Number(r.score) || 0);
      const maxScore = Math.max(...scores, 100);
      const minScore = Math.min(...scores, 0);
      const yRange = maxScore - minScore || 100;
      const yMin = Math.max(0, Math.floor(minScore / 10) * 10 - 10);
      const yMax = Math.min(100, Math.ceil(maxScore / 10) * 10 + 10);
      const yStep = (yMax - yMin) / 4;

      for (let i = 0; i <= 4; i++) {
        yLabels.push(Math.round(yMin + yStep * i));
      }

      const xStep = records.length > 1 ? chartW / (records.length - 1) : 0;
      points = records.map((r, i) => {
        const score = Number(r.score) || 0;
        const x = padding.left + (records.length > 1 ? xStep * i : chartW / 2);
        const y = padding.top + chartH - ((score - yMin) / (yMax - yMin)) * chartH;
        return { x, y, score, record: r };
      });
    } else {
      // 没有分数：按等级排列，底部显示等级标签
      const gradeOrder = { "D": 1, "D+": 2, "C": 3, "C+": 4, "B": 5, "B+": 6, "A": 7, "A+": 8 };
      const grades = records.map(r => gradeOrder[r.grade] || 4);
      const yMin = 1;
      const yMax = 8;
      yLabels = ["D", "C", "B", "A", "A+"];
      const yLabelVals = [1, 3, 5, 7, 8];

      const xStep = records.length > 1 ? chartW / (records.length - 1) : 0;
      points = records.map((r, i) => {
        const gVal = gradeOrder[r.grade] || 4;
        const x = padding.left + (records.length > 1 ? xStep * i : chartW / 2);
        const y = padding.top + chartH - ((gVal - yMin) / (yMax - yMin)) * chartH;
        return { x, y, score: r.grade, record: r };
      });
    }

    // 生成 SVG
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;

    // 网格线
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const y = padding.top + (chartH / gridCount) * i;
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3,3"/>`;
      if (yLabels[i] != null) {
        svg += `<text x="${padding.left - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9ca3af" font-weight="500">${yLabels[i]}</text>`;
      }
    }

    // 折线
    if (points.length > 1) {
      const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      svg += `<path d="${pathD}" fill="none" stroke="${subjectColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      // 渐变填充
      const areaD = pathD + ` L ${points[points.length-1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;
      svg += `<path d="${areaD}" fill="${subjectColor}" fill-opacity="0.1"/>`;
    }

    // 数据点标记
    points.forEach(p => {
      const shape = examTypeShapes[p.record.examType] || "circle";
      const size = p.record.examType === "期末" ? 7 : 5;
      if (shape === "circle") {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="${size}" fill="#fff" stroke="${subjectColor}" stroke-width="2"/>`;
      } else if (shape === "square") {
        svg += `<rect x="${p.x - size}" y="${p.y - size}" width="${size * 2}" height="${size * 2}" fill="#fff" stroke="${subjectColor}" stroke-width="2" rx="1"/>`;
      } else if (shape === "triangle") {
        svg += `<polygon points="${p.x},${p.y - size - 1} ${p.x - size - 1},${p.y + size - 1} ${p.x + size + 1},${p.y + size - 1}" fill="#fff" stroke="${subjectColor}" stroke-width="2"/>`;
      } else if (shape === "diamond") {
        svg += `<polygon points="${p.x},${p.y - size - 1} ${p.x + size + 1},${p.y} ${p.x},${p.y + size + 1} ${p.x - size - 1},${p.y}" fill="#fff" stroke="${subjectColor}" stroke-width="2"/>`;
      }
      // X 轴标签
      const xLabel = p.record.examType || "考试";
      svg += `<text x="${p.x}" y="${height - padding.bottom + 16}" text-anchor="middle" font-size="10" fill="#6b7280" font-weight="500">${xLabel}</text>`;
      // 分数/等级标签
      if (points.length <= 6) {
        svg += `<text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="11" fill="#374151" font-weight="700">${p.score}${hasScores ? '' : ''}</text>`;
      }
    });

    svg += `</svg>`;
    chartEl.innerHTML = svg;
  }

  function renderErrorModules(subject) {
    const listEl = document.getElementById("errorModulesList");
    const emptyEl = document.getElementById("errorModulesEmpty");
    if (!listEl) return;

    // ═══ 数据来源1：作业练习数据（当前学期） ═══
    const semesterLabel = currentScoreSemester || "";
    const hwModules = {}; // { moduleName: { practiceCount, doneCount, wrongCount } }

    // 遍历所有作业，按模块统计
    allAssignments.forEach(a => {
      if (a.subject !== subject) return;
      // 提取模块列表
      const modList = Array.isArray(a.modules) && a.modules.length > 0
        ? a.modules
        : (a.module ? a.module.split(/[、,，]/).filter(Boolean) : []);
      if (modList.length === 0) return;
      modList.forEach(mod => {
        const m = mod.trim();
        if (!m) return;
        if (!hwModules[m]) hwModules[m] = { practiceCount: 0, doneCount: 0, wrongCount: 0 };
        hwModules[m].practiceCount++;
        if (a.status === "done") hwModules[m].doneCount++;
        // 错题数：仅计入已完成作业的错题事实（不发能量，仅用于评估）
        const wc = Number(a.wrongCount);
        if (a.status === "done" && !isNaN(wc) && wc > 0) hwModules[m].wrongCount += wc;
      });
    });

    // ═══ 数据来源2：考试失分数据（当前学期+当前科目） ═══
    const examModules = {}; // { moduleName: errorCount }
    const currentExams = examRecords.filter(r =>
      r.subject === subject && r.semesterLabel === semesterLabel
    );
    currentExams.forEach(r => {
      const errMods = r.errorModules || [];
      errMods.forEach(m => {
        if (!examModules[m]) examModules[m] = 0;
        examModules[m]++;
      });
    });

    // ═══ 数据来源3：能力配置模块列表（作为补充） ═══
    const configModules = cfg.config?.abilityModules?.[subject] || [];
    const configModNames = configModules.map(m => typeof m === "object" ? m.name : m).filter(Boolean);

    // ═══ 合并所有模块，综合计算 ═══
    const allModNames = new Set([
      ...Object.keys(hwModules),
      ...Object.keys(examModules),
      ...configModNames,
    ]);

    if (allModNames.size === 0) {
      listEl.style.display = "none";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    // 计算每个模块的综合指标
    const moduleStats = [];
    allModNames.forEach(modName => {
      const hw = hwModules[modName] || { practiceCount: 0, doneCount: 0, wrongCount: 0 };
      const errCount = examModules[modName] || 0;
      const completionRate = hw.practiceCount > 0
        ? Math.round((hw.doneCount / hw.practiceCount) * 100)
        : 0;

      // 综合"薄弱指数"：失分次数权重高，错题事实 + 练习少 + 完成率低也扣分
      // 公式：失分*30 + 错题*15 + 练习不足扣分 + 完成率低扣分
      let weakScore = errCount * 30 + hw.wrongCount * 15;
      if (hw.practiceCount < 2) weakScore += 25; // 练习太少
      else if (hw.practiceCount < 5) weakScore += 10;
      if (completionRate < 40) weakScore += 20;
      else if (completionRate < 70) weakScore += 10;

      // 等级判定
      let level = "good";
      let levelText = "掌握良好";
      if (errCount > 0 || hw.wrongCount > 0 || (hw.practiceCount > 0 && completionRate < 40)) {
        level = "weak";
        levelText = "薄弱";
      } else if (hw.practiceCount === 0 || completionRate < 70 || hw.practiceCount < 3) {
        level = "improve";
        levelText = "需加强";
      }

      moduleStats.push({
        module: modName,
        practiceCount: hw.practiceCount,
        doneCount: hw.doneCount,
        completionRate,
        errorCount: errCount,
        wrongCount: hw.wrongCount,
        level,
        levelText,
        weakScore,
      });
    });

    // 按薄弱程度排序
    moduleStats.sort((a, b) => b.weakScore - a.weakScore);

    // 只展示非"掌握良好"的模块（最多5个）
    const displayModules = moduleStats.filter(m => m.level !== "good").slice(0, 5);

    if (displayModules.length === 0) {
      listEl.style.display = "none";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    listEl.style.display = "flex";
    if (emptyEl) emptyEl.style.display = "none";

    // 进度条宽度：用 weakScore 的相对比例
    const maxWeak = Math.max(...displayModules.map(m => m.weakScore), 1);

    listEl.innerHTML = displayModules.map(m => {
      const barWidth = Math.max(15, Math.min(100, (m.weakScore / maxWeak) * 100));
      return `
        <div class="error-module-item">
          <div class="error-module-head">
            <span class="error-module-name">${m.module}</span>
            <span class="error-module-level ${m.level}">${m.levelText}</span>
          </div>
          <div class="error-module-bar">
            <div class="error-module-bar-fill ${m.level}" style="width:${barWidth}%"></div>
          </div>
          <div class="error-module-meta">
            <span>练习 <strong>${m.practiceCount}</strong> 次</span>
            <span>完成率 <strong>${m.completionRate}%</strong></span>
            <span>失分 <strong>${m.errorCount}</strong> 次</span>
            ${m.wrongCount > 0 ? `<span>错题 <strong>${m.wrongCount}</strong> 题</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPracticeSuggestions(subject) {
    const listEl = document.getElementById("practiceSuggestionList");
    if (!listEl) return;

    const cards = [];

    // ═══ 从作业中统计当前科目的模块数据 ═══
    const hwModules = {};
    const pendingHwByModule = {}; // 每个模块的待完成作业
    allAssignments.forEach(a => {
      if (a.subject !== subject) return;
      const modList = Array.isArray(a.modules) && a.modules.length > 0
        ? a.modules
        : (a.module ? a.module.split(/[、,，]/).filter(Boolean) : []);
      if (modList.length === 0) return;
      modList.forEach(mod => {
        const m = mod.trim();
        if (!m) return;
        if (!hwModules[m]) hwModules[m] = { practiceCount: 0, doneCount: 0, pending: [] };
        hwModules[m].practiceCount++;
        if (a.status === "done") hwModules[m].doneCount++;
        else hwModules[m].pending.push(a);
      });
    });

    // 计算每个模块的状态
    const modStatusList = Object.entries(hwModules).map(([mod, data]) => {
      const completionRate = data.practiceCount > 0
        ? Math.round((data.doneCount / data.practiceCount) * 100)
        : 0;
      return { module: mod, ...data, completionRate };
    });

    // ═══ 生成建议卡片 ═══

    // 类型1：有未完成作业的模块 → 提醒先完成
    const pendingMods = modStatusList.filter(m => m.pending.length > 0)
      .sort((a, b) => b.pending.length - a.pending.length);
    if (pendingMods.length > 0) {
      const topMod = pendingMods[0];
      const otherCount = pendingMods.length - 1;
      const title = otherCount > 0
        ? `${topMod.module} 等 ${pendingMods.length} 个模块有待完成作业`
        : `${topMod.module} 有待完成作业`;
      cards.push({
        type: "warn",
        icon: "clipboard-list",
        title: title,
        desc: `共 ${pendingMods.reduce((s, m) => s + m.pending.length, 0)} 项作业待完成，建议先完成作业再进行针对性练习。`,
      });
    }

    // 类型2：练习少的模块 → 建议增加练习
    const lowPracticeMods = modStatusList.filter(m => m.practiceCount < 3)
      .sort((a, b) => a.practiceCount - b.practiceCount);
    if (lowPracticeMods.length > 0 && cards.length < 3) {
      const names = lowPracticeMods.slice(0, 3).map(m => m.module).join("、");
      cards.push({
        type: "info",
        icon: "trending-up",
        title: `${names} 练习量不足`,
        desc: `这些模块练习较少，建议每周安排 2-3 次专项练习，逐步提高掌握度。`,
      });
    }

    // 类型3：完成率低的模块 → 建议重点攻克
    const lowRateMods = modStatusList.filter(m => m.practiceCount >= 2 && m.completionRate < 60)
      .sort((a, b) => a.completionRate - b.completionRate);
    if (lowRateMods.length > 0 && cards.length < 3) {
      const names = lowRateMods.slice(0, 2).map(m => m.module).join("、");
      cards.push({
        type: "warn",
        icon: "alert-circle",
        title: `${names} 需重点攻克`,
        desc: `完成率较低，建议认真分析错题原因，必要时寻求老师或同学帮助。`,
      });
    }

    // 类型4：掌握良好的模块 → 鼓励保持
    const goodMods = modStatusList.filter(m => m.completionRate >= 80 && m.practiceCount >= 3);
    if (goodMods.length > 0 && cards.length < 3) {
      const names = goodMods.slice(0, 3).map(m => m.module).join("、");
      cards.push({
        type: "good",
        icon: "thumbs-up",
        title: `${names} 表现优秀`,
        desc: `这些模块掌握得很好，继续保持练习频率，可以适当挑战更高难度。`,
      });
    }

    // 兜底：如果数据太少，给通用建议
    if (cards.length === 0) {
      const strengths = study.strengthsAnalysis?.[subject];
      const suggestions = strengths?.suggestions || [];
      if (suggestions.length > 0) {
        suggestions.slice(0, 3).forEach((s, i) => {
          cards.push({
            type: i === 0 ? "info" : "good",
            icon: i === 0 ? "target" : "sparkles",
            title: s,
            desc: "",
          });
        });
      } else {
        cards.push({
          type: "info",
          icon: "book-open",
          title: `${subject} 学习建议`,
          desc: "坚持每天练习，及时复习错题，定期总结规律，成绩会稳步提升。",
        });
      }
    }

    // 最多显示 3 条
    const displayCards = cards.slice(0, 3);

    listEl.innerHTML = displayCards.map(c => `
      <div class="suggestion-card">
        <div class="suggestion-icon ${c.type}"><i data-lucide="${c.icon}"></i></div>
        <div class="suggestion-content">
          <div class="suggestion-title">${c.title}</div>
          ${c.desc ? `<div class="suggestion-desc">${c.desc}</div>` : ""}
        </div>
      </div>
    `).join("");

    refreshIcons(0);
  }

  function renderScoreAnalysis() {
    const panel = document.getElementById("scoreAnalysisPanel");
    if (!panel) return;

    const semesterSelect = document.getElementById("scoreSemesterSelect");
    if (semesterSelect) {
      const semLabels = getSemesterLabelList();
      semesterSelect.innerHTML = semLabels.map(label =>
        `<option value="${label}">${label}</option>`
      ).join("");
      if (semLabels.length > 0) {
        currentScoreSemester = getDefaultSemester();
        semesterSelect.value = currentScoreSemester;
      }
      semesterSelect.addEventListener("change", (e) => {
        currentScoreSemester = e.target.value;
        renderScoreSummary(currentScoreSemester);
        renderScoreSubjectBlocks(currentScoreSemester);
      });
    }

    // 初始渲染：汇总 + 各科分析（失分/优势）
    renderScoreSummary(currentScoreSemester);
    renderScoreSubjectBlocks(currentScoreSemester);
  }

  // ════════ 7.5.1 成绩汇总（本学期 · 顶部概览，全部科目） ════════
  function renderScoreSummary(semesterLabel) {
    const panel = document.getElementById("scoreSummaryPanel");
    if (!panel) return;

    // 平时成绩视图：只统计"日常/平时"记录（听写、默写、小测等），期末归学期末汇总视图
    const records = examRecords.filter(r => r.semesterLabel === semesterLabel && isDailyScoreType(r.examType));
    if (records.length === 0) {
      panel.innerHTML = emptyStateHTML("pie-chart", "本学期暂无平时成绩，去录入听写/默写/小测吧", 90);
      return;
    }

    const daily = records.filter(r => isDailyScoreType(r.examType));
    const exams = records.filter(r => !isDailyScoreType(r.examType));

    // 平均正确率（日常：对题 / 共题）
    const ratioList = daily
      .filter(r => r.totalQuestions && r.correctQuestions != null)
      .map(r => r.correctQuestions / r.totalQuestions);
    const avgRatio = ratioList.length ? Math.round((ratioList.reduce((s, x) => s + x, 0) / ratioList.length) * 100) : null;
    // 优良率（考试：A+ / A）
    const gradeList = exams.map(r => r.grade).filter(Boolean);
    const goodN = gradeList.filter(g => g === "A+" || g === "A").length;
    const goodRate = gradeList.length ? Math.round((goodN / gradeList.length) * 100) : null;
    // 平均分（考试）
    const scoredExams = exams.filter(r => r.score != null);
    const avgScore = scoredExams.length ? Math.round(scoredExams.reduce((s, r) => s + Number(r.score), 0) / scoredExams.length) : null;

    const stat = (num, lab) => `<div class="ss-stat"><div class="ss-num">${num == null ? "—" : num}</div><div class="ss-label">${lab}</div></div>`;
    panel.innerHTML = `
      <div class="ss-grid">
        ${stat(daily.length, "日常记录")}
        ${stat(exams.length, "考试记录")}
        ${stat(avgRatio != null ? avgRatio + "%" : null, ratioList.length > 1 ? "平均正确率" : "本次正确率")}
        ${stat(goodRate != null ? goodRate + "%" : null, "考试优良率")}
        ${avgScore != null ? stat(avgScore, "考试均分") : ""}
      </div>`;
  }

  // ════════ 7.5.2 各科分析（按科目：失分模块排行 + 优势模块 + 记录列表） ════════
  function renderScoreSubjectBlocks(semesterLabel) {
    const panel = document.getElementById("scoreSubjectBlocks");
    if (!panel) return;

    // 平时成绩视图：只展示"日常/平时"记录（听写、默写、小测等），期末归学期末汇总视图
    const records = examRecords.filter(r => r.semesterLabel === semesterLabel && isDailyScoreType(r.examType));
    if (records.length === 0) {
      panel.innerHTML = emptyStateHTML("clipboard-list", "本学期暂无平时成绩，去录入听写/默写/小测吧", 90);
      return;
    }

    const subjOrder = { "语文": 1, "数学": 2, "英语": 3, "科学": 4 };
    const bySubj = groupBy(records, "subject");
    const subjects = Object.keys(bySubj).sort((a, b) => (subjOrder[a] || 99) - (subjOrder[b] || 99));

    panel.innerHTML = subjects.map(sub => {
      const subjRecords = bySubj[sub];
      const cfg = getSubjCfg(sub);

      // 失分模块统计（日常"错题类型" + 考试"失分模块" 统一口径）
      const errCount = {};
      let recWithErr = 0;
      subjRecords.forEach(r => {
        const errs = Array.isArray(r.errorModules) ? r.errorModules
          : (r.errorModule ? String(r.errorModule).split(/[、,，]/).map(s => s.trim()).filter(Boolean) : []);
        if (errs.length) recWithErr++;
        errs.forEach(m => { if (m) errCount[m] = (errCount[m] || 0) + 1; });
      });
      const errRank = Object.entries(errCount).sort((a, b) => b[1] - a[1]);
      const maxErr = errRank.length ? errRank[0][1] : 0;

      // 优势（诚实口径）：只基于已录入的日常记录；样本太少时明确"待观察"，
      // 绝不做"科目默认模块表减去失分模块"的减法推定（那会把没测过的东西说成优势）
      const MIN_STR_SAMPLES = 2;
      const obsCount = subjRecords.length;
      const undetected = getModuleOptions(sub).filter(m => !errCount[m]);

      // 平均正确率（日常）
      const daily = subjRecords.filter(r => isDailyScoreType(r.examType));
      const ratioList = daily.filter(r => r.totalQuestions && r.correctQuestions != null).map(r => r.correctQuestions / r.totalQuestions);
      const avgRatio = ratioList.length ? Math.round((ratioList.reduce((s, x) => s + x, 0) / ratioList.length) * 100) : null;

      // 失分展示（符合成长算法：不贴标签、只记事实）
      // 样本 < WEAK_FACT_THRESHOLD 时，只作"本次/近N条记录"的事实陈述，不定性成"薄弱点"；
      // 样本达标后才用统计框架呈现频次趋势。
      const WEAK_FACT_THRESHOLD = 3;
      const hasTrend = subjRecords.length >= WEAK_FACT_THRESHOLD;
      const errHtml = errRank.length
        ? (hasTrend
            ? `<div class="sa-weak-list">` + errRank.slice(0, 5).map(([m, c]) => `
            <div class="sa-weak-row">
              <span class="sa-weak-name">${m}</span>
              <div class="sa-weak-bar"><div class="sa-weak-fill" style="width:${maxErr ? Math.round(c / maxErr * 100) : 0}%"></div></div>
              <span class="sa-weak-count">${c}次</span>
            </div>`).join("") + `</div>
          <div class="sa-weak-base">近 ${subjRecords.length} 条记录中，这些类型出现失分频率（持续积累再谈规律）</div>`
            : `<div class="sa-weak-facts">` + errRank.map(([m, c]) => `
            <div class="sa-fact-row">
              <span class="sa-fact-name">${m}</span>
              <span class="sa-fact-count">×${c}</span>
            </div>`).join("") + `</div>
          <div class="sa-weak-base">仅本次记录的事实（不足 ${WEAK_FACT_THRESHOLD} 条，暂不评判薄弱点）</div>`)
        : `<div class="sa-clear-tip"><i data-lucide="check-circle"></i>近 ${subjRecords.length} 条记录均未失分</div>`;

      const strengthHtml = obsCount < MIN_STR_SAMPLES
        ? `<span class="sa-dim">记录太少（${obsCount}条），暂不评判优势</span>`
        : (undetected.length
            ? `<div class="sa-strong-chips" title="基于近${obsCount}条记录：这些类型未出现失分">` + undetected.map(m => `<span class="sa-strong-chip">${m}</span>`).join("") + `</div>`
            : `<span class="sa-dim">各类型均有失分，暂无明显未失分项</span>`);

      // 记录列表（按日期倒序）
      const rows = [...subjRecords].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(r => {
        const shortDate = (r.date || "").slice(5);
        const isDailyRec = isDailyScoreType(r.examType);
        const scoreText = isDailyRec && r.totalQuestions && r.correctQuestions != null
          ? `${r.correctQuestions}/${r.totalQuestions}题`
          : (r.score != null && r.score !== "" ? `${r.score}分` : "");
        // 日常记录不再自动给字母等级：只展示可核实的"对/总题数"，避免单次日常被定性
        const gradeTag = isDailyRec ? "" : `<span class="sa-rec-grade ${getGradeCls(r.grade)}">${r.grade || ""}</span>`;
        const errTxt = (Array.isArray(r.errorModules) ? r.errorModules : (r.errorModule ? String(r.errorModule).split(/[、,，]/).filter(Boolean) : [])).join("、");
        return `
        <div class="sa-rec-row" data-score-id="${r.id}" title="点击修改或删除">
          <span class="sa-rec-date">${shortDate || ""}</span>
          <span class="sa-rec-type">${r.examType || ""}</span>
          <span class="sa-rec-score">${scoreText}${gradeTag}</span>
          ${errTxt ? `<span class="sa-rec-err">${errTxt}</span>` : ""}
          <button class="sl-del" data-del-score="${r.id}" title="删除"><i data-lucide="trash-2"></i></button>
        </div>`;
      }).join("");

      return `
        <div class="sa-block">
          <div class="sa-head">
            <span class="subj-dot ${cfg.cls}"></span>
            <span class="sa-name">${sub}</span>
            <span class="sa-meta">${subjRecords.length} 条记录${recWithErr ? ` · ${recWithErr} 条有失分` : ""}${avgRatio != null ? ` · ${ratioList.length > 1 ? "平均正确率" : "本次正确率"} ${avgRatio}%` : ""}</span>
          </div>
          <div class="sa-cols">
            <div class="sa-col sa-col-weak">
              <div class="sa-col-title"><i data-lucide="cloud-lightning"></i>失分在哪</div>
              ${errHtml}
            </div>
            <div class="sa-col sa-col-strong">
              <div class="sa-col-title"><i data-lucide="sparkles"></i>优势在哪</div>
              ${strengthHtml}
            </div>
          </div>
          <div class="sa-records">${rows}</div>
        </div>`;
    }).join("") + `
      <div class="sa-hint"><i data-lucide="mouse-pointer-click"></i>点击某条成绩可修改，右侧垃圾桶可删除</div>`;
    refreshIcons(0);
  }

  // ════════ 8. 期末成绩 ════════
  const examPanel = document.getElementById("examPanel");
  const scoreAnalysisPanel = document.getElementById("scoreAnalysisPanel");
  if (examPanel) {
    const evaluations = study.evaluations || [];

    if (examRecords.length === 0) {
      const subjContent = document.getElementById("examSubjectContent");
      if (subjContent) subjContent.innerHTML = emptyStateHTML("bar-chart-2", "暂无期末成绩数据");
      const semContent = document.getElementById("examSemesterContent");
      if (semContent) semContent.innerHTML = emptyStateHTML("bar-chart-2", "暂无期末成绩数据");
      if (scoreAnalysisPanel) {
        scoreAnalysisPanel.innerHTML = emptyStateHTML("bar-chart-2", "暂无成绩数据");
      }
    } else {
      const semOrder = { "第一学期": 1, "第二学期": 2 };
      const gradeCn = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };
      function semesterOrder(r) {
        const label = r.semesterLabel || (r.year ? r.year + (r.semester === "第二学期" ? "下" : "上") : "");
        const m = String(label).match(/([一二三四五六七八九十]+)年级[（(]?([上下]?)[）)]?/);
        const gradeNum = m ? (gradeCn[m[1]] || 0) : 0;
        const term = m && m[2] ? (m[2] === "下" ? 2 : 1) : (semOrder[r.semester] || 0);
        return { gradeNum, term };
      }
      function sortSems(arr) {
        return arr.sort((a, b) => {
          const oa = semesterOrder(a), ob = semesterOrder(b);
          if (oa.gradeNum !== ob.gradeNum) return ob.gradeNum - oa.gradeNum;
          return ob.term - oa.term;
        });
      }

      // 期末成绩视图：只统计"考试类"记录（期末/期中/月考/单元测试）。
      // 日常听写、默写、小测等一律不混入期末成绩序列，避免小测被当成期末。
      const examOnly = examRecords.filter(r => isExamType(r.examType));
      const bySubj = groupBy(examOnly, "subject");

      const bySem = {};
      examOnly.forEach(r => {
        const k = r.semesterLabel || (r.year ? r.year + "_" + r.semester : "") || "未知学期";
        if (!bySem[k]) bySem[k] = { year: r.year, semester: r.semester, semesterLabel: r.semesterLabel || k, records: [] };
        bySem[k].records.push(r);
      });

      function renderSubjectView() {
        const names = Object.keys(bySubj).sort((a, b) => getSubjCfg(a).order - getSubjCfg(b).order);
        const mainSubjects = ["语文", "数学", "英语", "科学"];
        const mainNames = names.filter(n => mainSubjects.includes(n));
        const otherNames = names.filter(n => !mainSubjects.includes(n));

        let html = `<div class="exam-subject-view">`;
        html += `<div class="es-main-grid">`;
        mainNames.forEach(name => {
          const cfg = getSubjCfg(name);
          const records = sortSems([...bySubj[name]]);
          const latest = records[0];
          const badgesHtml = records.map(r =>
            `<span class="es-mini-badge ${getGradeCls(r.grade)}" title="${r.year} ${r.semesterLabel || r.semester}">${r.grade}</span>`
          ).join("");
          html += `
            <div class="es-main-card">
              <div class="es-main-head">
                <div class="es-main-subj">
                  <span class="subj-dot ${cfg.cls}"></span>
                  <span class="es-main-name">${name}</span>
                </div>
                <div class="es-main-latest">
                  <span class="grade-badge ${getGradeCls(latest.grade)} es-grade-lg">${latest.grade}</span>
                </div>
              </div>
              <div class="es-main-meta">
                <span>${records.length} 个学期记录</span>
                <span>最新 · ${latest.semesterLabel || latest.semester}</span>
              </div>
              <div class="es-grade-history">${badgesHtml}</div>
            </div>`;
        });
        html += `</div>`;

        if (otherNames.length > 0) {
          html += `<div class="es-other-section">
            <div class="es-other-title">其他科目</div>
            <div class="es-other-grid">`;
          otherNames.forEach(name => {
            const cfg = getSubjCfg(name);
            const records = sortSems([...bySubj[name]]);
            const latest = records[0];
            const badgesHtml = records.slice(0, 6).map(r =>
              `<span class="es-mini-badge ${getGradeCls(r.grade)}" title="${r.year} ${r.semesterLabel || r.semester}">${r.grade}</span>`
            ).join("");
            html += `
              <div class="es-other-card">
                <div class="es-other-head">
                  <span class="subj-dot ${cfg.cls}"></span>
                  <span class="es-other-name">${name}</span>
                  <span class="grade-badge ${getGradeCls(latest.grade)}">${latest.grade}</span>
                </div>
                <div class="es-other-badges">${badgesHtml}</div>
              </div>`;
          });
          html += `</div></div>`;
        }

        html += `</div>`;
        const contentEl = document.getElementById("examSubjectContent");
        if (contentEl) contentEl.innerHTML = html;
        refreshIcons(0);
      }

      function renderSemesterView() {
        const keys = Object.keys(bySem).sort((a, b) => {
          const oa = semesterOrder(bySem[a]), ob = semesterOrder(bySem[b]);
          if (oa.gradeNum !== ob.gradeNum) return ob.gradeNum - oa.gradeNum;
          return ob.term - oa.term;
        });

        const evalMap = {};
        evaluations.forEach(e => {
          if (e.year && e.semester) evalMap[e.year + "|" + e.semester] = e;
          if (e.semesterLabel) evalMap[e.semesterLabel] = e;
        });

        const semAnalysis = study.semesterAnalysis || { semesters: [] };
        const growthMap = {};
        semAnalysis.semesters.forEach(s => {
          if (s.year && s.semester) growthMap[s.year + "|" + s.semester] = s;
          if (s.semesterLabel) growthMap[s.semesterLabel] = s;
        });

        const gradeColors = { "A+": "#10b981", "A": "#6366f1", "B+": "#f59e0b", "B": "#ef4444" };
        const gradeOrderArr = ["A+", "A", "B+", "B"];

        let html = `<div class="exam-semester-list">`;
        keys.forEach((key, idx) => {
          const sm = bySem[key];
          const records = [...sm.records].sort((a, b) => getSubjCfg(a.subject).order - getSubjCfg(b.subject).order);
          const subjOnce = {};
          records.forEach(r => { if (r.subject) subjOnce[r.subject] = r; });
          const uniqueRecords = Object.values(subjOnce);
          const gCounts = {};
          uniqueRecords.forEach(r => { if (r.grade) gCounts[r.grade] = (gCounts[r.grade] || 0) + 1; });

          const evalData = evalMap[key];
          const growth = growthMap[key];
          const isLatest = idx === 0;

          html += `<div class="esm-card-merged" data-sem="${key}">
            <div class="esm-head">
              <div class="esm-head-left">
                <span class="esm-year">${sm.semesterLabel ? (sm.semesterLabel.split(/[（(]/)[0]) : (sm.year || "")}</span>
                <span class="esm-sem">${sm.semesterLabel ? (sm.semesterLabel.match(/[（(]([^)）]*)[)）]/) ? sm.semesterLabel : "") : (sm.semester || "")}</span>
                ${isLatest ? '<span class="esm-latest-badge">最新</span>' : ''}
              </div>
              <div class="esm-stats-row">
                <div class="esm-stat-box">
                  <div class="esm-stat-num">${records.length}</div>
                  <div class="esm-stat-label">科目</div>
                </div>
                <div class="esm-stat-box">
                  <div class="esm-stat-num">${gCounts["A+"] || 0}</div>
                  <div class="esm-stat-label">A+</div>
                </div>
                <div class="esm-stat-box">
                  <div class="esm-stat-num" style="color:${growth && growth.progress.length > 0 ? '#10b981' : growth && growth.regress.length > 0 ? '#f59e0b' : '#94a3b8'}">
                    ${growth ? (growth.progress.length > 0 ? '+' + growth.progress.length : growth.regress.length > 0 ? '-' + growth.regress.length : '0') : (idx === keys.length - 1 ? '首次' : '0')}
                  </div>
                  <div class="esm-stat-label">变化</div>
                </div>
              </div>
            </div>

            <div class="esm-grade-dist">
              ${gradeOrderArr.filter(g => gCounts[g]).map(g =>
                `<div class="esm-dist-item">
                  <span class="esm-dist-dot" style="background:${gradeColors[g]}"></span>
                  <span class="esm-dist-text">${g} · ${gCounts[g]}科</span>
                </div>`
              ).join('')}
            </div>

            <div class="esm-subjects">`;
          const seenSubj = {};
          records.forEach(r => { seenSubj[r.subject] = r; });
          Object.values(seenSubj).sort((a, b) => getSubjCfg(a.subject).order - getSubjCfg(b.subject).order).forEach(r => {
            html += `<span class="esm-subj-chip">
              <span class="subj-dot ${getSubjCfg(r.subject).cls}"></span>
              ${r.subject}
              <span class="chip-grade ${getGradeCls(r.grade)}">${r.grade}</span>
            </span>`;
          });
          html += `</div>`;

          if (growth) {
            if (growth.progress.length > 0 || growth.regress.length > 0) {
              html += `<div class="esm-progress-row">`;
              if (growth.progress.length > 0) {
                html += `
                  <div class="esm-progress-col">
                    <div class="esm-progress-label up"><i data-lucide="trending-up" style="width:13px;height:13px"></i> 进步科目</div>
                    <div class="esm-progress-chips">
                      ${growth.progress.map(p =>
                        `<span class="esm-p-chip up">${p.subject} ${p.from}→${p.to}</span>`
                      ).join('')}
                    </div>
                  </div>`;
              }
              if (growth.regress.length > 0) {
                html += `
                  <div class="esm-progress-col">
                    <div class="esm-progress-label down"><i data-lucide="trending-down" style="width:13px;height:13px"></i> 需关注</div>
                    <div class="esm-progress-chips">
                      ${growth.regress.map(r =>
                        `<span class="esm-p-chip down">${r.subject} ${r.from}→${r.to}</span>`
                      ).join('')}
                    </div>
                  </div>`;
              }
              html += `</div>`;
            }
          }

          if (evalData && (evalData.teacherComment || evalData.parentComment)) {
            const teacherC = (evalData.teacherComment || "").replace(/\n/g, "<br>");
            const parentC = (evalData.parentComment || "").replace(/\n/g, "<br>");
            html += `
              <div class="esm-evaluation">
                <div class="esm-eval-head">
                  <div class="esm-eval-title"><i data-lucide="message-square-quote"></i>期末评语</div>
                  <div class="esm-eval-meta">
                    <span class="esm-eval-date">${evalData.date || ""}</span>
                  </div>
                </div>
                ${teacherC ? `<div class="esm-eval-label">老师评语</div><div class="esm-eval-text">${teacherC}</div>` : ""}
                ${parentC ? `<div class="esm-eval-label">家长评语</div><div class="esm-eval-text">${parentC}</div>` : ""}
              </div>`;
          }

          if (growth && growth.encouragement) {
            html += `
              <div class="esm-ai-encourage">
                <div class="esm-ai-head">
                  <i data-lucide="sparkles"></i>
                  <span>给雅曦的话</span>
                </div>
                <div class="esm-ai-text">${growth.encouragement}</div>
              </div>`;
          }

          html += `</div>`;
      });
      html += `</div>`;
      const contentEl = document.getElementById("examSemesterContent");
      if (contentEl) contentEl.innerHTML = html;
      refreshIcons(0);
    }

      renderSubjectView();
      renderSemesterView();
      renderScoreAnalysis();
    }

    // 双视图切换：平时成绩 / 学期末汇总（无论是否有数据均可用）
    function switchExamView(view) {
      const analysisPanel = document.getElementById("scoreAnalysisPanel");
      const examP = document.getElementById("examPanel");
      if (view === "analysis") {
        if (analysisPanel) analysisPanel.style.display = "block";
        if (examP) examP.style.display = "none";
      } else {
        if (analysisPanel) analysisPanel.style.display = "none";
        if (examP) examP.style.display = "block";
        if (typeof renderSubjectView === "function") renderSubjectView();
        if (typeof renderSemesterView === "function") renderSemesterView();
      }
    }

    initTabGroup("#examViewToggle button", "view", view => {
      switchExamView(view);
    }, "analysis");

    // 初始显示平时成绩视图
    switchExamView("analysis");
  }
}

// ═══════════════════════════════════════════════════════════
// MODULE: render-money.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// render-money.js — 财富/理财页面渲染
// ═══════════════════════════════════════════════════════════════

// 展开/折叠 对账分析
function toggleTxAnalysis(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.style.display === "block";
  el.style.display = isOpen ? "none" : "block";
  btn.innerHTML = (!isOpen ? "收起分析 <i data-lucide=\"chevron-up\" style=\"width:12px;height:12px\"></i>" : "对账分析 <i data-lucide=\"chevron-down\" style=\"width:12px;height:12px\"></i>");
  refreshIcons(20);
}

async function renderMoney() {
  const cfg = await loadAppData();
  const finance = cfg.finance || { totalAssets: null, accounts: [], recentTransactions: [] };
  const accounts = finance.accounts || [];
  const transactions = finance.recentTransactions || [];
  const txData = transactions.map(t => ({ ...t, type: t.type || "in" }));

  function getAccount(key) {
    return accounts.find(a => a.key === key) || { key, name: key === "wealth" ? "财富账户" : "自由账户", balance: null };
  }
  const freeAcc = getAccount("free");
  const wealthAcc = getAccount("wealth");

  // ════════ 顶部简介（随机切换）+ 实时数据行 ════════
  setText("moneyIntro", pickQuote("money", MONEY_INTROS));
  const daysToAllow = getDaysToAllowance();
  const moneyLiveEl = document.getElementById("moneyLiveText");
  if (moneyLiveEl) moneyLiveEl.innerHTML =
    `距离下次零花钱发放还有 <strong>${daysToAllow}</strong> 天，本周也要好好规划储蓄计划哟`;

  // ════════ 2. 自由基金主卡（余额 + 支付方式拆分 + 最近交易预览） ════════
  setText("freeFundAmount", formatMoney(freeAcc.balance));
  const _freeTx = txData.filter(t => !t.account || t.account === "free");

  // 支付方式拆分：支付宝 vs 纸币
  const _freeAlipay = _freeTx.filter(t => t.paymentMethod !== "cash");
  const _freeCash = _freeTx.filter(t => t.paymentMethod === "cash");
  // 支付宝余额 = 所有支付宝收入 - 支付宝支出
  const _alipayIncome = _freeAlipay.filter(t => t.type === "in" || t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const _alipayExpense = _freeAlipay.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const _alipayBalance = _alipayIncome - _alipayExpense;
  // 纸币余额 = 所有纸币收入 - 纸币支出
  const _cashIncome = _freeCash.filter(t => t.type === "in" || t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const _cashExpense = _freeCash.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const _cashBalance = _cashIncome - _cashExpense;
  setText("freeFundAlipay", formatMoney(_alipayBalance));
  setText("freeFundCash", formatMoney(_cashBalance));

  // 最近交易预览（倒序取前3条）
  const _recentFree = [..._freeTx].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);
  const recentEl = document.getElementById("freeFundRecent");
  if (recentEl) {
    recentEl.innerHTML = _recentFree.map(tx => {
      const isIncome = tx.type === "in" || tx.type === "income";
      const sign = isIncome ? "+" : "−";
      const amt = "¥" + Number(tx.amount).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const payIcon = tx.paymentMethod === "cash" ? "💰" : "📱";
      const payLabel = tx.paymentMethod === "cash" ? "纸币" : "支付宝";
      const title = tx.description || tx.category || "未命名";
      const dateStr = (tx.date || "").slice(5); // MM-DD
      return `<div class="ffc-recent-item">
        <span class="ffc-recent-date">${dateStr}</span>
        <span class="ffc-recent-title">${title}</span>
        <span class="ffc-recent-pay">${payIcon}${payLabel}</span>
        <span class="ffc-recent-amt ${isIncome ? 'income' : 'expense'}">${sign}${amt}</span>
      </div>`;
    }).join("");
  }

  // 财富板块自身的任务（含"财务"或"花销"），本周/今日获得能量互不串扰其他版块
  // 筛选依据改为 datetime（记录创建时间），而非 date（记录的业务日期），
  // 确保今天录入的复盘/进账积分（即使日期选了其他日期）也能正确计入今日/本周获得
  const _mTx = (cfg.xpRecords || []).filter(r => r.reviewStatus === "已通过");
  const _mtoday = new Date().toISOString().slice(0, 10);
  const _mm = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const _getActionDate = (r) => (r.datetime || r.date || "").slice(0, 10);
  const _isMoneyTask = (r) => { const n = String(r.taskName || r.title || ""); return n === "财务能力分析"; };
  const _mweekXp = _mTx.filter(r => _getActionDate(r) >= _mm && _isMoneyTask(r)).reduce((s, r) => s + (Number(r.xp) || 0), 0);
  const _mtodayXp = _mTx.filter(r => _getActionDate(r) === _mtoday && _isMoneyTask(r)).reduce((s, r) => s + (Number(r.xp) || 0), 0);
  const moneyWeekEl = document.getElementById("moneyStatWeek");
  if (moneyWeekEl) { moneyWeekEl.textContent = _mweekXp > 0 ? `+${_mweekXp}` : "0"; moneyWeekEl.style.color = _mweekXp > 0 ? "" : "var(--neutral-400)"; }
  const moneyTodayEl = document.getElementById("moneyStatToday");
  if (moneyTodayEl) { moneyTodayEl.textContent = _mtodayXp > 0 ? `+${_mtodayXp}` : "0"; moneyTodayEl.style.color = _mtodayXp > 0 ? "" : "var(--neutral-400)"; }

  // ════════ 3. 花销分析（环形图 · 仅自由账户） ════════
  const spendDonutEl = document.getElementById("spendDonutChart");
  const spendLegendEl = document.getElementById("spendLegend");
  // 只统计自由账户的支出
  const freeExpenses = txData.filter(t => t.type === "expense" && (!t.account || t.account === "free"));

  setText("spendTotalHint", `共 ${freeExpenses.length} 笔`);

  if (spendDonutEl) {
    if (freeExpenses.length === 0) {
      spendDonutEl.innerHTML = "";
      if (spendLegendEl) {
        spendLegendEl.innerHTML = `<div style="padding:20px 0;text-align:center;color:var(--neutral-400);font-size:12px;">暂无支出数据</div>`;
      }
    } else {
      const totalSpend = freeExpenses.reduce((s, t) => s + Number(t.amount || 0), 0);
      const fmt1 = v => "¥" + Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      // 按值得程度聚合：值得 / 一般 / 不值得（金额 + 笔数）
      const worthMap = { "值得": 0, "一般": 0, "不值得": 0 };
      const worthCountMap = { "值得": 0, "一般": 0, "不值得": 0 };
      freeExpenses.forEach(t => {
        const w = t.worthIt || t.worth || "一般";
        if (worthMap[w] != null) {
          worthMap[w] += Number(t.amount || 0);
          worthCountMap[w] += 1;
        }
      });
      const worthAgg = Object.entries(worthMap).filter(([, v]) => v > 0);
      const worthColors = { "值得": "var(--colourful-lime-pop-500)", "一般": "var(--colourful-butter-yellow-300)", "不值得": "var(--colourful-sunny-coral-500)" };
      const donutItems = worthAgg.map(([name, value]) => ({
        name, value, color: worthColors[name] || "#ccc"
      }));
      const donut = renderDonutChart(donutItems, 140, 16, fmt1(totalSpend), "总支出");
      spendDonutEl.innerHTML = donut.svg + donut.center;

      if (spendLegendEl) {
        spendLegendEl.innerHTML = worthAgg.map(([name, value]) => {
          const pctVal = Math.round((value / totalSpend) * 100);
          const count = worthCountMap[name] || 0;
          const icon = name === "值得" ? "✅" : name === "不值得" ? "❌" : "🤔";
          return `
            <div class="spend-legend-item">
              <span class="sl-dot" style="background:${worthColors[name] || "#ccc"}"></span>
              <span class="sl-name">${icon} ${name}</span>
              <span class="sl-val">${fmt1(value)} <span class="sl-count">/ ${count}笔</span></span>
            </div>
          `;
        }).join("");
      }

      // 值得率
      const worthCount = { "值得": 0, "一般": 0, "不值得": 0 };
      freeExpenses.forEach(t => {
        const w = t.worthIt || t.worth || "一般";
        if (worthCount[w] != null) worthCount[w]++;
      });
      const worthRate = freeExpenses.length > 0 ? Math.round((worthCount["值得"] / freeExpenses.length) * 100) : 0;
      const fillEl = document.getElementById("worthRateFill");
      if (fillEl) fillEl.style.width = worthRate + "%";
      setText("worthRateValue", worthRate + "%");
    }
  }

  // ════════ 4. 收支记录（重点展示，支持账户/类型筛选） ════════
  const freeTxListEl = document.getElementById("txList");
  const showMoreFreeTxBtn = document.getElementById("showMoreTx");
  let currentTxFilter = "all";
  let currentTxAccount = "free";
  let freeTxExpanded = false;

  // 账户交易数据
  const freeTxData = txData.filter(t => !t.account || t.account === "free");
  const wealthTxData = txData.filter(t => t.account === "wealth");

  function getFilteredTx(filter, account) {
    const base = account === "wealth" ? wealthTxData : freeTxData;
    if (filter === "expense") return base.filter(t => t.type === "expense");
    if (filter === "income") return base.filter(t => t.type === "in" || t.type === "income");
    return [...base];
  }

  // 格式化日期显示（紧凑单行：今天/昨天/8月7日）
  function formatDateLabel(dateStr) {
    if (!dateStr) return { label: "--", isToday: false };
    const d = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return { label: "今天", isToday: true };
    if (diffDays === 1) return { label: "昨天", isToday: false };
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return { label: `${month}月${day}日`, isToday: false };
  }

  function renderFreeTxList(filter, account) {
    if (!freeTxListEl) return;
    filter = filter || currentTxFilter;
    account = account || currentTxAccount;
    const list = getFilteredTx(filter, account).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (list.length === 0) {
      let emptyText = "暂无记录";
      if (filter === "expense") emptyText = "暂无支出记录";
      else if (filter === "income") emptyText = "暂无收入记录";
      freeTxListEl.innerHTML = `<div class="tx-empty">
        <div class="tx-empty-icon"><i data-lucide="receipt" style="width:22px;height:22px"></i></div>
        <p class="tx-empty-title">${emptyText}</p>
      </div>`;
      if (showMoreFreeTxBtn) showMoreFreeTxBtn.style.display = "none";
      return;
    }

    const visibleCount = 5;
    const visible = list.slice(0, visibleCount);
    const hidden = list.slice(visibleCount);

    const renderRow = (tx, idx, isHidden) => {
      const isIncome = tx.type === "in" || tx.type === "income";
      const sign = isIncome ? "+" : "−";
      const amountStr = sign + "¥" + Number(tx.amount).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const dateInfo = formatDateLabel(tx.date);
      const titleText = tx.name || tx.description || "未命名";
      // 备注仅在与标题不同时展示，避免信息重复
      const note = tx.reason || (tx.description && tx.description !== titleText ? tx.description : "") || "";
      const worthIt = !isIncome ? (tx.worthIt || tx.worth || "") : "";
      // 支付方式标识
      const payMethod = tx.paymentMethod === "cash" ? "cash" : "alipay";
      const payLabel = tx.paymentMethod === "cash" ? "纸币" : "支付宝";

      return `
        <div class="tx-item ${isHidden ? 'hw-hidden' : ''}">
          <div class="tx-col tx-col-date">
            <div class="tx-date-label ${dateInfo.isToday ? 'today' : ''}">${dateInfo.label}</div>
          </div>
          <div class="tx-col tx-col-icon ${isIncome ? 'income' : 'expense'}">${sign}</div>
          <div class="tx-col tx-col-desc">
            <div class="tx-title">
              ${titleText}
              ${worthIt ? `<span class="tx-cat worth-${worthIt === '值得' ? 'good' : worthIt === '不值得' ? 'bad' : 'mid'}">${worthIt}</span>` : ""}
            </div>
            ${note ? `<div class="tx-note">${note}</div>` : ""}
          </div>
          <div class="tx-col tx-col-worth" style="display:none"></div>
          <div class="tx-col tx-col-pay">
            <span class="tx-pay-method ${payMethod}">${payLabel}</span>
          </div>
          <div class="tx-col tx-col-amount ${isIncome ? 'income' : 'expense'}">${amountStr}</div>
        </div>`;
    };

    let html = visible.map((tx, i) => renderRow(tx, i, false)).join("");
    if (hidden.length > 0) {
      html += hidden.map((tx, i) => renderRow(tx, i + visibleCount, !freeTxExpanded)).join("");
      if (showMoreFreeTxBtn) {
        showMoreFreeTxBtn.style.display = "block";
        showMoreFreeTxBtn.textContent = freeTxExpanded ? "收回" : `展开更多（+${hidden.length} 条）`;
        showMoreFreeTxBtn.onclick = function() {
          freeTxExpanded = !freeTxExpanded;
          renderFreeTxList(currentTxFilter, currentTxAccount);
        };
      }
    } else if (showMoreFreeTxBtn) {
      showMoreFreeTxBtn.style.display = "none";
    }
    freeTxListEl.innerHTML = html;
    refreshIcons(0);
  }

  // 类型筛选（全部/支出/收入）
  initTabGroup("#txFilterTabs .tx-filter-btn", "filter", f => {
    currentTxFilter = f;
    renderFreeTxList(f, currentTxAccount);
  }, "all");
  // 账户切换（自由账户/财富账户）
  initTabGroup("#txAccountTabs .tx-acc-btn", "account", acc => {
    currentTxAccount = acc;
    renderFreeTxList(currentTxFilter, acc);
  }, "free");
  renderFreeTxList("all", "free");

  // ════════ 5. 成长基金（财富增值 · 弱化展示） ════════
  setText("wealthFundAmount", formatMoney(wealthAcc.balance));
  const wealthIncomes = txData.filter(t => (t.type === "in" || t.type === "income") && t.account === "wealth");
  setText("wealthSourceHint", `共 ${wealthIncomes.length} 笔存入`);
}

// ── 能力模块：优先从 API 加载配置表，加载前用硬编码兜底 ──
let DE_LOADED_MODULES = null; // 缓存 api 加载的模块数据

const DE_SUBJECT_MODULES = {
  "语文": ["拼音", "汉字", "组词", "阅读", "作文"],
  "数学": ["概念", "公式定理", "计算", "推理", "直觉"],
  "英语": ["听说", "单词", "语感", "阅读", "写作"],
  "科学": ["观察", "实验", "思维", "表达", "探究"],
};

// ⭐ 系统科目表（与 config.json 的 subjects 保持一致，作为绝对权威兜底源）。
//    成绩/作业/编辑等所有"科目"下拉/单选都必须以此为完整集合，
//    任何情况下都不得退化为只显示语数英三门主科。
const DE_FALLBACK_SUBJECTS = [
  "语文", "数学", "英语",
  "科学", "道德与法治", "信息科技",
  "体育", "音乐", "美术", "书法",
  "心理健康", "综合实践活动", "劳动"
];

// 加载配置：能力模块表 + 权威科目表（优先直接读 config.json，保证科目选择器展示完整配置科目）
async function deLoadAbilityModules() {
  let cfg = null;
  try {
    cfg = await fetchRawJSON("config.json").catch(() => null);
  } catch (e) { cfg = null; }
  if (!cfg && window.DataStore && typeof window.DataStore.loadData === "function") {
    try {
      const data = await window.DataStore.loadData();
      cfg = (data && data.config) ? data.config : null;
    } catch (e) { cfg = null; }
  }
  if (cfg && cfg.abilityModules && Object.keys(cfg.abilityModules).length > 0) {
    DE_LOADED_MODULES = {};
    for (const [sub, mods] of Object.entries(cfg.abilityModules)) {
      DE_LOADED_MODULES[sub] = (mods || []).map(m => (m && m.name) || m);
    }
    console.log("✓ 能力模块已从配置加载:", Object.keys(DE_LOADED_MODULES));
  } else if (DE_LOADED_MODULES === null) {
    DE_LOADED_MODULES = null;
  }
  const subjectsFromConfig = (cfg && Array.isArray(cfg.subjects) && cfg.subjects.length)
    ? cfg.subjects.map(s => (s && s.name) || s)
    : null;
  // 科目选择器统一渲染：以「系统科目表(config.subjects)」为唯一权威来源。
  // 科目只认系统科目表；即使配置里的 subjects 暂未读到，也直接用内置完整科目表，
  // 绝不以"能力模块键"或"少数主科"代替科目列表（那会退化成只剩语数英）。
  const subjectList = (subjectsFromConfig && subjectsFromConfig.length)
    ? subjectsFromConfig
    : DE_FALLBACK_SUBJECTS.slice();
  deRenderSubjectGroups(subjectList);
}

// 用配置中的科目列表动态渲染三个科目选择器（学习/成绩/编辑）
function deRenderSubjectGroups(subjects) {
  if (!subjects || subjects.length === 0) return;
  const groups = [
    { id: "studySubjectGroup", name: "studySubject" },
    { id: "scoreSubjectGroup", name: "scoreSubject" },
    { id: "editSubjectGroup", name: "editSubject" },
  ];
  groups.forEach(({ id, name }) => {
    const group = document.getElementById(id);
    if (!group) return;
    const current = group.querySelector("input:checked")?.value || "";
    group.innerHTML = subjects.map(sub => {
      const checked = sub === current ? " checked" : (sub === "语文" && !current ? " checked" : "");
      return `<label class="choice-pill${checked}"><input type="radio" name="${name}" value="${sub}"${checked ? " checked" : ""}>${sub}</label>`;
    }).join("");
    initChoicePills(group);
    // 重新绑定科目切换 → 更新模块复选框
    group.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("change", (e) => {
        if (id === "studySubjectGroup") updateHomeworkModules(e.target.value);
        if (id === "scoreSubjectGroup") updateErrorModules(e.target.value);
        // 编辑弹窗：切科目 → 同时刷新能力模块 + 关联单元（单元目录随科目切换）
        if (id === "editSubjectGroup") {
          updateModuleCheckboxes(e.target.value, []);
          reloadEditUnitGroup(e.target.value);
        }
      });
    });
  });
}

// 获取指定科目的能力模块列表（优先已加载的数据）
function deGetSubjectModules(subject) {
  if (DE_LOADED_MODULES && DE_LOADED_MODULES[subject]) {
    return DE_LOADED_MODULES[subject];
  }
  return DE_SUBJECT_MODULES[subject] || [];
}

const DE_MODULE_KEYWORDS = {
  "语文": {
    "拼音": ["拼音", "拼读", "音节", "声母", "韵母", "声调"],
    "汉字": ["汉字", "生字", "写字", "练字", "笔画", "偏旁", "部首", "描红", "抄写"],
    "组词": ["组词", "造句", "词语", "成语", "近义词", "反义词", "词汇"],
    "阅读": ["阅读", "朗读", "背诵", "默写", "课文", "古诗", "诗词", "文言文"],
    "作文": ["作文", "写作", "日记", "小作文", "看图写话", "周记"],
  },
  "数学": {
    "概念": ["概念", "定义", "认识", "理解", "什么是"],
    "公式定理": ["公式", "定理", "定律", "性质", "规律"],
    "计算": ["计算", "口算", "笔算", "竖式", "脱式", "算术", "加减", "乘除", "混合运算", "P"],
    "推理": ["推理", "应用题", "解决问题", "思考题", "奥数", "思维"],
    "直觉": ["估算", "数感", "直觉", "巧算", "速算", "找规律"],
  },
  "英语": {
    "听说": ["听", "说", "朗读", "跟读", "听力", "对话", "口语"],
    "单词": ["单词", "词汇", "默写", "听写", "拼写", "抄写"],
    "语感": ["语感", "句型", "语法", "时态", "句子"],
    "阅读": ["阅读", "短文", "绘本", "故事", "阅读理解"],
    "写作": ["写作", "作文", "写话", "句子", "小作文"],
  },
};

// ── 工具函数 ──

function inferModule(subject, title, desc) {
  if (!subject || !DE_MODULE_KEYWORDS[subject]) return "";
  const text = ((title || "") + " " + (desc || "")).toLowerCase();
  const keywords = DE_MODULE_KEYWORDS[subject];
  for (const [moduleName, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (text.includes(word.toLowerCase())) return moduleName;
    }
  }
  const defaults = { "语文": "阅读", "数学": "计算", "英语": "单词" };
  return defaults[subject] || "";
}

function deShowToast(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "toast show " + (ok ? "ok" : "err");
  setTimeout(() => { el.className = "toast"; }, 3000);
}

function deSetLoading(id, loading, text) {
  const btn = document.getElementById(id);
  if (loading) {
    btn.dataset.original = btn.textContent;
    btn.textContent = text || "保存中…";
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.original || btn.textContent;
    btn.disabled = false;
  }
}

// ── 学习模块多选 ──

function updateHomeworkModules(subject) {
  const box = document.getElementById("homeworkModuleCheckboxes");
  if (!box) return;
  const modules = deGetSubjectModules(subject);
  box.innerHTML = modules.map(m => `
    <label style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:10px;background:var(--neutral-50);border:1px solid var(--neutral-200);font-size:13px;cursor:pointer;">
      <input type="checkbox" value="${m}" class="hw-module-cb" style="accent-color:var(--lav-600);" /> ${m}
    </label>
  `).join("");
}

function getCheckedHomeworkModules() {
  return Array.from(document.querySelectorAll(".hw-module-cb:checked")).map(cb => cb.value);
}

function updateErrorModules(subject) {
  // 统一走 renderErrorModulesFor，保证成绩弹窗内错题类型/失分模块样式一致
  if (typeof renderErrorModulesFor === "function") renderErrorModulesFor(subject);
}

// ── XP 任务选择 ──

async function loadXpRules() {
  const sel = document.getElementById("xpTaskSelect");
  if (!sel) return;
  try {
    const data = await DataStore.loadData();
    const rules = data.config?.xpRuleList || [];
    sel.innerHTML = '<option value="">—— 手动输入新任务 ——</option>' + rules.map(r =>
      `<option value="${(r.name || "").replace(/"/g, "&quot;")}" data-xp="${r.xp}" data-cat="${(r.category || "").replace(/"/g, "&quot;")}">${r.name}（+${r.xp} XP）</option>`
    ).join("");
  } catch (e) { /* 加载失败时保留手动输入 */ }
}

function ensureXpOption(val) {
  if (!val) return;
  const group = document.getElementById("xpValueGroup");
  const exists = group.querySelector(`input[value="${val}"]`);
  if (!exists) {
    const label = document.createElement("label");
    label.className = "choice-pill";
    label.innerHTML = `<input type="radio" name="xpValue" value="${val}">+${val} XP`;
    group.appendChild(label);
    initChoicePills(group);
  }
  setRadioValue("xpValueGroup", String(val));
}

// ── 最近记录刷新 ──

async function refreshXpRecent() {
  const data = await DataStore.loadData();
  document.getElementById("xpRecent").innerHTML = (data.recentRecords || []).slice(0, 5).map(r => `
    <div class="row">
      <div class="dot"><i data-lucide="sparkle"></i></div>
      <div>
        <div class="row-title">${r.title}</div>
        <div class="row-meta">${r.time} · ${r.status === "pending" ? "待确认" : r.status === "verified" ? "已通过" : "已退回"}${r.returnReason ? " · " + r.returnReason : ""}</div>
      </div>
      <div class="value">${r.value}</div>
    </div>
  `).join("");
  refreshIcons(0);
}

async function refreshStudyRecent() {
  const data = await DataStore.loadData();
  document.getElementById("studyRecent").innerHTML = (data.study?.recentAssignments || []).slice(0, 5).map(a => `
    <div class="row">
      <div class="dot"><i data-lucide="book-open"></i></div>
      <div>
        <div class="row-title">${a.subject} · ${a.title}</div>
        <div class="row-meta">${a.date} · ${a.status === "done" ? "已完成" : "待完成"} · ${a.submitted ? "已提交" : "未提交"}</div>
      </div>
    </div>
  `).join("");
  refreshIcons(0);
}

async function refreshReviewList() {
  const data = await DataStore.loadData();
  const pending = (data.study?.recentAssignments || []).filter(a => a.submitted && a.status !== "done");
  const listEl = document.getElementById("reviewList");
  if (!listEl) return;
  if (pending.length === 0) {
    listEl.innerHTML = emptyStateHTML(null, "暂无待审核作业");
    return;
  }
  listEl.innerHTML = pending.map(a => `
    <div style="padding:14px;background:var(--neutral-50);border-radius:14px;border:1px solid var(--neutral-200);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div>
          <span class="hw-subject ${a.subject === "语文" ? "hw-sub-cn" : a.subject === "数学" ? "hw-sub-math" : a.subject === "英语" ? "hw-sub-en" : ""}" style="font-size:11px;padding:3px 8px;">${a.subject}</span>
          <span style="font-weight:900;font-size:14px;color:var(--neutral-900);margin-left:8px;">${a.title}</span>
        </div>
        <span style="font-size:12px;color:var(--neutral-500);">${a.date || ""}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" style="font-size:12px;padding:6px 14px;" onclick="reviewPass('${a.id || a.title}')">全对通过</button>
        <button class="btn ghost" style="font-size:12px;padding:6px 14px;" onclick="reviewFix('${a.id || a.title}')">需订正</button>
      </div>
    </div>
  `).join("");
}

window.reviewPass = async function(id) {
  try {
    await DataStore.updateStudyRecord(id, { status: "done" });
    deShowToast("scoreToast", "已标记通过", true);
    refreshReviewList();
  } catch (err) {
    deShowToast("scoreToast", "操作失败：" + err.message, false);
  }
};

window.reviewFix = async function(id) {
  try {
    await DataStore.updateStudyRecord(id, { status: "pending" });
    deShowToast("scoreToast", "已标记需订正", true);
    refreshReviewList();
  } catch (err) {
    deShowToast("scoreToast", "操作失败：" + err.message, false);
  }
};

async function refreshMoneyRecent() {
  const data = await DataStore.loadData();
  document.getElementById("moneyRecent").innerHTML = (data.finance?.recentTransactions || []).slice(0, 5).map(t => `
    <div class="row">
      <div class="dot"><i data-lucide="${t.type === "income" ? "arrow-down-left" : "arrow-up-right"}"></i></div>
      <div>
        <div class="row-title">${t.description}</div>
        <div class="row-meta">${t.date} · ${t.category} · ${t.account === "wealth" ? "财富增值" : "自由基金"}</div>
      </div>
      <div class="value" style="color:${t.type === "income" ? "var(--mint-700)" : "var(--pink-650)"}">${t.type === "income" ? "+" : "-"}¥${(t.amount || 0).toFixed(2)}</div>
    </div>
  `).join("");
  refreshIcons(0);
}

// ── 作业智能拆分 ──

// 根据作业内容判定作业类型：日常预习 / 日常复习 / 假期作业 / 特色作业
function inferHomeworkType(text) {
  if (!text) return "";
  const t = String(text);
  // 特色作业：动手/实践/展示类
  if (/手抄报|手工作品|手工|画画|绘画|观察|实践|实验|日记|阅读打卡|打卡|书法|书法练习|演讲|朗诵|口才|小报|手绘|制作|剪贴|贴画|泥塑|折纸|种植|养|社会实践|研学/.test(t)) return "特色作业";
  // 预习
  if (/预习/.test(t)) return "日常预习";
  // 复习
  if (/复习|背诵|默写|整理笔记|错题|复盘/.test(t)) return "日常复习";
  // 其余不再默认为"假期作业"，留空让用户明确选择
  return "";
}

// 兼容查询作业分值规则：作业类型为「假期作业/特色作业」，
// 系统配置为「作业·日常预习/日常复习/假期作业/特色作业」四类。
// 优先精确名「作业·类型」，找不到时回退到任一「作业·」规则，保证发分不失效。
function resolveHomeworkRule(xpRules, hwType) {
  const exactName = "作业·" + (hwType || "");
  const all = [];
  for (const cat of Object.keys(xpRules || {})) {
    (xpRules[cat] || []).forEach(r => all.push(r));
  }
  const exact = all.find(r => r.name === exactName);
  if (exact) return exact;
  return all.find(r => r && typeof r.name === "string" && r.name.indexOf("作业·") === 0) || null;
}

function parseHomeworkText(text) {
  const items = [];
  const subjectKeywords = {
    "语文": ["语文", "语"],
    "数学": ["数学", "数"],
    "英语": ["英语", "英"],
    "科学": ["科学"],
  };
  let currentSubject = "";
  const lines = text.split(/\n+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let foundSubject = "";
    for (const [sub, kws] of Object.entries(subjectKeywords)) {
      const patterns = [
         new RegExp("^(?:" + kws.join("|") + ")\\s*[：:]"),
         new RegExp("^[【「\\[](?:" + kws.join("|") + ")[】」\\]]"),
         new RegExp("^(?:" + kws.join("|") + ")\\s*$"),
       ];
      if (patterns.some(p => p.test(trimmed))) {
        foundSubject = sub;
        break;
      }
    }
    if (foundSubject) {
      currentSubject = foundSubject;
      const rest = trimmed.replace(/^[语数英科][文学语]?\s*[：:]\s*/, "")
                         .replace(/^[【「\[][语数英科][文学语]?[】」\]]\s*/, "")
                         .trim();
      if (rest && rest.length > 2) {
        const mod = inferModule(currentSubject, rest, "");
        items.push({ subject: currentSubject, text: rest, module: mod, type: inferHomeworkType(rest) });
      }
      continue;
    }

    const numMatch = trimmed.match(/^(?:第[一二三四五六七八九十]+[、．\.]\s*|\d+[\.、．)\s]\s*|[①②③④⑤⑥⑦⑧⑨⑩][、.,，\s]*|[一二三四五六七八九十]+[、．]\s*)(.+)$/);
    if (numMatch) {
      // 支持“同一行内多条编号”的写法：先按编号标记把整行切成多片
      // 例：“1.熟读背诵3-4自然段 2.预习第一课 3.读希腊童话…” → 拆成三条
      const segments = trimmed
        .split(/(?:第[一二三四五六七八九十]+[、．\.]\s*|\d+[\.、．)\s]\s*|[①②③④⑤⑥⑦⑧⑨⑩][、.,，\s]*|[一二三四五六七八九十]+[、．]\s*)/)
        .map(s => s.replace(/(?:^[。．,，、;；]+|[。．,，、;；]+$)/g, "").trim())
        .filter(s => s.length > 0);
      const pieces = segments.length > 0
        ? segments
        : [numMatch[1] ? numMatch[1].trim() : trimmed];
      for (const p of pieces) {
        const mod = inferModule(currentSubject, p, "");
        items.push({ subject: currentSubject || "未识别", text: p, module: mod, type: inferHomeworkType(p) });
      }
      continue;
    }

    if (trimmed.length > 2) {
      const mod = inferModule(currentSubject, trimmed, "");
      items.push({ subject: currentSubject || "未识别", text: trimmed, module: mod, type: inferHomeworkType(trimmed) });
    }
  }

  if (items.length > 0 && items.every(it => it.subject === "未识别")) {
    const fullText = text.toLowerCase();
    if (fullText.includes("语文") || fullText.includes("拼音") || fullText.includes("汉字") || fullText.includes("生字") || fullText.includes("组词") || fullText.includes("作文") || fullText.includes("背诵") || fullText.includes("默写")) {
      items.forEach(it => { it.subject = "语文"; it.module = inferModule("语文", it.text, ""); });
    } else if (fullText.includes("数学") || fullText.includes("计算") || fullText.includes("口算") || fullText.includes("应用题") || fullText.includes("竖式")) {
      items.forEach(it => { it.subject = "数学"; it.module = inferModule("数学", it.text, ""); });
    } else if (fullText.includes("英语") || fullText.includes("单词") || fullText.includes("听力") || fullText.includes("语法") || fullText.includes("english")) {
      items.forEach(it => { it.subject = "英语"; it.module = inferModule("英语", it.text, ""); });
    }
  }

  return items;
}

// ── 初始化 ──

function initDataEntry() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("xpDate").value = today;
  document.getElementById("studyDate").value = today;
  document.getElementById("scoreDate").value = today;
  document.getElementById("moneyDate").value = today;

  // 填充成绩录入的学期下拉框
  function populateScoreSemester() {
    const sel = document.getElementById("scoreSemester");
    if (!sel) return;
    let options = [];
    // 优先从校历获取
    if (window.SemesterCalendar && window.SemesterCalendar.getCalendarData) {
      const calData = window.SemesterCalendar.getCalendarData();
      calData.forEach(y => {
        const grade = y.grade || "";
        if (y.semester1) {
          options.push({ value: grade + "(上)", label: grade + "上学期" });
        }
        if (y.semester2) {
          options.push({ value: grade + "(下)", label: grade + "下学期" });
        }
      });
    }
    // 兜底选项
    if (options.length === 0) {
      ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"].forEach(g => {
        options.push({ value: g + "(上)", label: g + "上学期" });
        options.push({ value: g + "(下)", label: g + "下学期" });
      });
    }
    sel.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
    // 默认选当前学期
    if (window.SemesterCalendar && window.SemesterCalendar.getCurrentSemesterInfo) {
      const info = window.SemesterCalendar.getCurrentSemesterInfo();
      const currentVal = info.grade + "(" + info.semesterShortName + ")";
      if (options.some(o => o.value === currentVal)) {
        sel.value = currentVal;
      }
    }
  }
  populateScoreSemester();

  // 异步加载能力模块配置（从 API 读取配置-能力模块表）
  deLoadAbilityModules().then(() => {
    // 加载完成后刷新当前选中科目的模块复选框
    const curSubj = document.querySelector("#studySubjectGroup input:checked")?.value || "语文";
    updateHomeworkModules(curSubj);
    const curScoreSubj = document.querySelector("#scoreSubjectGroup input:checked")?.value || "语文";
    updateErrorModules(curScoreSubj);
  });

  // 日期初始值
  const evalDate = document.getElementById("evalDate");
  if (evalDate) evalDate.value = today;

  // ── 学习子 tab 切换 ──
  document.querySelectorAll(".sub-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sub-tab").forEach(b => {
        b.style.background = "var(--neutral-100)";
        b.style.color = "var(--neutral-600)";
        b.classList.remove("active");
      });
      btn.style.background = "var(--lav-100)";
      btn.style.color = "var(--lav-700)";
      btn.classList.add("active");
      const tab = btn.dataset.studyTab;
      document.querySelectorAll(".study-sub-panel").forEach(p => p.style.display = "none");
      document.getElementById("study-sub-" + tab).style.display = "block";
      if (tab === "review") refreshReviewList();
    });
  });

  // ── 学习科目切换 → 更新模块复选框 ──
  document.querySelectorAll("#studySubjectGroup input").forEach(inp => {
    inp.addEventListener("change", (e) => { updateHomeworkModules(e.target.value); });
  });
  updateHomeworkModules("语文");

  // ── 成绩科目切换 → 更新扣分模块 ──
  document.querySelectorAll("#scoreSubjectGroup input").forEach(inp => {
    inp.addEventListener("change", (e) => { updateErrorModules(e.target.value); });
  });
  updateErrorModules("语文");

  // ── Tab 切换 ──
  document.querySelectorAll(".tab-bar button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-bar button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".form-panel").forEach(p => p.style.display = "none");
      document.getElementById("panel-" + tab).style.display = "block";
      if (tab === "xp") refreshXpRecent();
      if (tab === "study") refreshStudyRecent();
      if (tab === "money") refreshMoneyRecent();
    });
  });

  // ── XP 状态切换 → 显示/隐藏退回原因 ──
  document.querySelectorAll("#xpStatusGroup input").forEach(inp => {
    inp.addEventListener("change", (e) => {
      document.getElementById("xpReasonField").style.display = e.target.value === "returned" ? "" : "none";
    });
  });

  // ── XP 录入 ──
  document.getElementById("submitXp")?.addEventListener("click", async () => {
    const title = document.getElementById("xpTitle").value.trim();
    const note = document.getElementById("xpNote").value.trim();
    if (!title) { deShowToast("xpToast", "请输入做了什么", false); return; }
    if (!note) { deShowToast("xpToast", "请输入备注说明", false); return; }
    deSetLoading("submitXp", true, "录入中…");
    try {
      await DataStore.addXpRecord({
        taskName: title,
        description: note,
        xp: Number(getRadioValue("xpValueGroup")),
        xpCategory: getRadioValue("xpTypeGroup"),
        date: document.getElementById("xpDate").value,
        status: getRadioValue("xpStatusGroup"),
        returnReason: document.getElementById("xpReason").value,
      });
      deShowToast("xpToast", "已录入 " + title, true);
      document.getElementById("xpTitle").value = "";
      document.getElementById("xpNote").value = "";
      document.getElementById("xpReason").value = "";
      document.getElementById("xpTaskSelect").value = "";
      await DataStore.refreshData(true);
      await refreshXpRecent();
    } catch (err) {
      deShowToast("xpToast", "录入失败：" + err.message, false);
    } finally {
      deSetLoading("submitXp", false);
    }
  });

  // ── XP 任务选择 ──
  document.getElementById("xpTaskSelect")?.addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt || !opt.value) return;
    document.getElementById("xpTitle").value = opt.value;
    if (opt.dataset.xp) ensureXpOption(opt.dataset.xp);
    if (opt.dataset.cat) setRadioValue("xpTypeGroup", opt.dataset.cat);
  });

  // ── 作业智能拆分 ──
  document.getElementById("parseHomeworkBtn")?.addEventListener("click", () => {
    const raw = document.getElementById("homeworkRaw").value.trim();
    if (!raw) { deShowToast("studyToast", "请先粘贴作业原文", false); return; }

    const items = parseHomeworkText(raw);
    if (items.length === 0) {
      deShowToast("studyToast", "未能识别作业内容，请检查格式", false);
      return;
    }

    const container = document.getElementById("parsedList");
    document.getElementById("parsedHomework").style.display = "block";
    const subColor = (s) => {
      if (s === "语文") return "hw-sub-cn";
      if (s === "数学") return "hw-sub-math";
      if (s === "英语") return "hw-sub-en";
      return "";
    };
    container.innerHTML = items.map((it, i) => `
      <div class="parsed-item" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--neutral-50);border-radius:12px;border:1px solid var(--neutral-200);">
        <input type="checkbox" checked class="parse-check" data-idx="${i}" style="accent-color:var(--lav-600);flex-shrink:0;" />
        <span class="hw-subject ${subColor(it.subject)}" style="font-size:11px;padding:3px 8px;flex-shrink:0;">${it.subject || "未识别"}</span>
        ${it.module ? `<span style="font-size:10px;padding:2px 7px;border-radius:6px;background:var(--mint-100);color:var(--mint-700);flex-shrink:0;font-weight:700;">${it.module}</span>` : ""}
        <span style="flex:1;font-size:13px;color:var(--neutral-700);">${it.text}</span>
      </div>
    `).join("");

    if (items.length > 0) {
      const first = items[0];
      if (first.subject) setRadioValue("studySubjectGroup", first.subject);
      document.getElementById("studyTitle").value = first.text;
      document.getElementById("studyDesc").value = raw;
      if (first.module) {
        const cb = document.querySelector(`.hw-module-cb[value="${first.module}"]`);
        if (cb) cb.checked = true;
      }
      updateHomeworkModules(first.subject || "语文");
    }

    deShowToast("studyToast", `识别出 ${items.length} 条作业（${items.filter(i => i.subject !== "未识别").length} 条已识别科目）`, true);
  });

  // ── 批量录入 ──
  document.getElementById("batchSubmitStudy")?.addEventListener("click", async () => {
    const checks = document.querySelectorAll(".parse-check:checked");
    if (checks.length === 0) { deShowToast("studyToast", "请至少勾选一条作业", false); return; }

    const raw = document.getElementById("homeworkRaw").value.trim();
    const items = parseHomeworkText(raw);
    const date = document.getElementById("studyDate").value || today;
    const hwType = getRadioValue("homeworkTypeGroup");
    const status = getRadioValue("studyStatusGroup");
    const submitted = getRadioValue("studySubmittedGroup") === "1";

    const selected = [];
    checks.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      if (idx >= 0 && idx < items.length) selected.push(items[idx]);
    });

    deSetLoading("batchSubmitStudy", true, `录入 ${selected.length} 条…`);
    let ok = 0, fail = 0;
    for (const it of selected) {
      try {
        const due = ADD_HW_DUE_TYPES.has(hwType) ? (document.getElementById("studyDueDate") ? document.getElementById("studyDueDate").value : date) : date;
        await DataStore.addStudyRecord({
          subject: it.subject !== "未识别" ? it.subject : getRadioValue("studySubjectGroup"),
          title: it.text,
          description: it.text,
          homeworkType: hwType,
          modules: getCheckedHomeworkModules(),
          status: status,
          submitted: submitted,
          date: date,
          dueDate: due,
        });
        ok++;
      } catch (err) {
        fail++;
        console.error("录入失败:", it.text, err);
      }
    }

    if (fail === 0) {
      deShowToast("studyToast", `成功录入 ${ok} 条作业`, true);
      document.getElementById("homeworkRaw").value = "";
      document.getElementById("parsedHomework").style.display = "none";
      document.getElementById("studyTitle").value = "";
      document.getElementById("studyDesc").value = "";
      await DataStore.refreshData(true);
      await refreshStudyRecent();
    } else {
      deShowToast("studyToast", `录入 ${ok} 条，${fail} 条失败`, false);
    }
    deSetLoading("batchSubmitStudy", false);
  });

  // ── 学习录入（作业） ──
  document.getElementById("submitStudy")?.addEventListener("click", async () => {
    const title = document.getElementById("studyTitle").value.trim();
    if (!title) { deShowToast("studyToast", "请输入作业标题", false); return; }
    deSetLoading("submitStudy", true, "录入中…");
    try {
      const hwTypeS = getRadioValue("homeworkTypeGroup");
      const dateS = document.getElementById("studyDate").value;
      const dueS = ADD_HW_DUE_TYPES.has(hwTypeS) ? (document.getElementById("studyDueDate") ? document.getElementById("studyDueDate").value : dateS) : dateS;
      await DataStore.addStudyRecord({
        subject: getRadioValue("studySubjectGroup"),
        title,
        description: document.getElementById("studyDesc").value,
        homeworkType: hwTypeS,
        modules: getCheckedHomeworkModules(),
        status: getRadioValue("studyStatusGroup"),
        submitted: getRadioValue("studySubmittedGroup") === "1",
        date: dateS,
        dueDate: dueS,
      });
      deShowToast("studyToast", "已录入 " + title, true);
      document.getElementById("studyTitle").value = "";
      document.getElementById("studyDesc").value = "";
      document.getElementById("homeworkRaw").value = "";
      document.getElementById("parsedHomework").style.display = "none";
      document.querySelectorAll(".hw-module-cb").forEach(cb => cb.checked = false);
      await DataStore.refreshData(true);
      await refreshStudyRecent();
    } catch (err) {
      deShowToast("studyToast", "录入失败：" + err.message, false);
    } finally {
      deSetLoading("submitStudy", false);
    }
  });

  // ── 期末评语录入 ──
  document.getElementById("submitEvaluation")?.addEventListener("click", async () => {
    const teacher = document.getElementById("evalTeacherComment").value.trim();
    const parent = document.getElementById("evalParentComment").value.trim();
    if (!teacher && !parent) { deShowToast("evalToast", "请至少填写老师或家长评语", false); return; }
    deSetLoading("submitEvaluation", true, "录入中…");
    try {
      await DataStore.addEvaluationRecord({
        semester: document.getElementById("evalSemester").value,
        teacherComment: teacher,
        parentComment: parent,
        date: document.getElementById("evalDate").value,
      });
      deShowToast("evalToast", "期末评语已录入", true);
      document.getElementById("evalTeacherComment").value = "";
      document.getElementById("evalParentComment").value = "";
      document.getElementById("evalDate").value = "";
      await DataStore.refreshData(true);
    } catch (err) {
      deShowToast("evalToast", "录入失败：" + err.message, false);
    } finally {
      deSetLoading("submitEvaluation", false);
    }
  });

  // ── 财务录入 ──
  document.getElementById("submitMoney")?.addEventListener("click", async () => {
    const amount = Number(document.getElementById("moneyAmount").value);
    if (!amount || amount <= 0) { deShowToast("moneyToast", "请输入有效金额", false); return; }
    const desc = document.getElementById("moneyDesc").value.trim();
    if (!desc) { deShowToast("moneyToast", "请输入描述", false); return; }
    deSetLoading("submitMoney", true, "录入中…");
    try {
      await DataStore.addFinanceRecord({
        type: getRadioValue("moneyTypeGroup"),
        amount,
        account: getRadioValue("moneyAccountGroup"),
        category: document.getElementById("moneyCategory").value || "其他",
        description: desc,
        date: document.getElementById("moneyDate").value,
        worthIt: getRadioValue("moneyWorthGroup"),
        reason: document.getElementById("moneyReason").value,
        suggestion: document.getElementById("moneySuggestion").value,
      });
      deShowToast("moneyToast", "已录入 " + desc, true);
      document.getElementById("moneyAmount").value = "";
      document.getElementById("moneyDesc").value = "";
      document.getElementById("moneyCategory").value = "";
      document.getElementById("moneyReason").value = "";
      document.getElementById("moneySuggestion").value = "";
      setRadioValue("moneyWorthGroup", "");
      await DataStore.refreshData(true);
      await refreshMoneyRecent();
    } catch (err) {
      deShowToast("moneyToast", "录入失败：" + err.message, false);
    } finally {
      deSetLoading("submitMoney", false);
    }
  });

  // 初始加载
  refreshXpRecent();
  loadXpRules();
  initChoicePills();
}

// ═══════════════════════════════════════════════════════════
// MODULE: render-profile.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// render-profile.js — 星卡/个人信息页面
// ═══════════════════════════════════════════════════════════════

let currentInterests = [];

async function loadProfile() {
  try {
    const data = await DataStore.loadData();
    const child = data.child || {};

    document.getElementById("editName").value = child.name || "";
    document.getElementById("editBirthday").value = child.birthday || "";
    document.getElementById("editGender").value = child.gender || "";
    document.getElementById("editGrade").value = child.grade || "";
    document.getElementById("editSchool").value = child.school || "";
    document.getElementById("editClass").value = child.className || "";
    document.getElementById("editMotto").value = child.motto || "";
  } catch (err) {
    console.error("加载个人信息失败:", err);
  }
}

window.saveProfile = async function() {
  const child = {
    name: document.getElementById("editName").value.trim() || "Yara",
    birthday: document.getElementById("editBirthday").value,
    gender: document.getElementById("editGender").value,
    grade: document.getElementById("editGrade").value,
    school: document.getElementById("editSchool").value.trim(),
    className: document.getElementById("editClass").value.trim(),
    motto: document.getElementById("editMotto").value.trim()
  };

  try {
    const localSuccess = DataStore.saveChildData(child);
    try {
      await DataStore.updateChildData(child);
    } catch (feishuErr) {
      console.warn("飞书同步失败，已保存到本地:", feishuErr);
    }
    if (localSuccess) {
      await DataStore.refreshData(true);
      showToast("保存成功！");
    } else {
      showToast("保存失败，请重试");
    }
  } catch (err) {
    console.error("保存失败:", err);
    showToast("保存失败，请重试");
  }
};

function showToast(msg, ok) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = "toast show " + (ok ? "ok" : "err");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = "toast"; }, 2600);
}

// 统一写库错误处理：Token 缺失时引导去设置，其余错误给出明确定位
function handleWriteError(err, fallbackMsg) {
  const msg = (err && err.message) || "";
  if (msg.indexOf("Token") >= 0 || msg.indexOf("token") >= 0) {
    showTokenRequiredToast();
    return;
  }
  if (fallbackMsg) {
    alert(fallbackMsg || "操作失败，请稍后重试");
  }
}

function showTokenRequiredToast() {
  // 创建一个友好的弹窗引导用户去设置 Token
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px";
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px 24px 20px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.15);text-align:center">
      <div style="font-size:40px;margin-bottom:12px">🔑</div>
      <h3 style="font-size:17px;font-weight:700;color:#1a1a1a;margin:0 0 6px">需要 GitHub Token</h3>
      <p style="font-size:13px;color:#666;margin:0 0 20px;line-height:1.5">审批通过、记账等写入操作需要 GitHub Token 认证。请先在设置中配置。</p>
      <div style="display:flex;gap:10px">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex:1;padding:10px;border-radius:12px;border:1px solid #e5e5e5;background:white;font-size:14px;font-weight:600;color:#666;cursor:pointer">取消</button>
        <button onclick="this.closest('.modal-overlay').remove();openSettingsDrawer()" style="flex:1;padding:10px;border-radius:12px;border:none;background:var(--colourful-mint-green-500,#36b98b);color:white;font-size:14px;font-weight:600;cursor:pointer">去设置</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

function initProfile() {
  refreshIcons(0);
  loadProfile();
}

// ═══════════════════════════════════════════════════════════
// MODULE: render-record.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// render-record.js — 记录汇总页面（作业、成绩、成长、财务）
// ═══════════════════════════════════════════════════════════════

async function renderRecords(kind) {
  const el = document.getElementById("recList");
  const data = await DataStore.loadData();
  const items = [];

  const hw = (data.study?.allHomework || []).map(r => ({
    kind: "study", icon: "book-open", color: "var(--blue-500)",
    title: (r.subject || "") + " · " + (r.title || ""),
    meta: (r.date || "") + " · " + (r.submitted ? "已提交" : "未提交") + " · " + (r.status === "done" ? "已完成" : "待完成"),
    val: r.xp ? "+" + r.xp + " XP" : "", sub: r.homeworkType || "",
  }));
  const sc = (data.study?.examRecords || []).map(r => ({
    kind: "score", icon: "target", color: "var(--lav-500)",
    title: (r.subject || "") + " · " + (r.title || r.examType || "考试"),
    meta: (r.date || "") + " · " + (r.examType || ""),
    val: r.grade || "—", sub: r.semesterLabel || "",
  }));
  const xp = (data.recentRecords || data.xpRecords || []).map(r => {
    // 分类优先取记录的已存字段；缺失时按任务名反查任务池，杜绝回落到未定义的紫色
    const _rulesMap = (data.config && data.config.xpRules) || {};
    let xc = r.xpCategory || r.taskCategory || "";
    const xcTaskName = r.taskName || r.title || "";
    if (!xc && xcTaskName) {
      Object.keys(_rulesMap).some(function (cat) {
        const hit = (_rulesMap[cat] || []).some(function (t) { return t && t.name === xcTaskName; });
        if (hit) { xc = cat; return true; }
        return false;
      });
    }
    if (!xc && r.type && r.type !== "XP获得") xc = r.type;
    const xcc = CAT_COLORS[xc] || WCPALETTE[xc]?.dot || "#8c8c8c";
    return {
      kind: "xp", icon: "sparkles", color: xcc, valColor: xcc,
      title: r.taskName || r.title || "XP 记录",
      meta: (r.time || r.date || "") + " · " + (r.status === "verified" ? "已通过" : r.status === "returned" ? "已退回" : "待确认"),
      val: (r.value || (r.xp ? "+" + r.xp + " XP" : "")), sub: r.xpCategory || "",
    };
  });
  const fn = (data.finance?.recentTransactions || []).map(r => ({
    kind: "money", icon: "wallet", color: "var(--coral-500)",
    title: r.description || r.title || "财务流水",
    meta: (r.date || "") + " · " + (r.account || ""),
    val: (r.amount > 0 ? "+" : "") + formatMoney(r.amount), sub: r.type || "",
    neg: r.amount < 0,
  }));

  items.push(...hw, ...sc, ...xp, ...fn);
  items.sort((a, b) => String(b.meta || "").localeCompare(String(a.meta || "")));

  const filtered = kind === "all" ? items : items.filter(i => i.kind === kind);
  if (filtered.length === 0) {
    el.innerHTML = emptyStateHTML(null, "暂无记录");
  } else {
    el.innerHTML = filtered.slice(0, 60).map(i => `
      <div class="rec-item">
        <div class="rec-icon" style="background:${i.color}"><i data-lucide="${i.icon}"></i></div>
        <div class="rec-body">
          <div class="rec-title">${i.title}</div>
          <div class="rec-meta">${i.meta}</div>
        </div>
        <div class="rec-side">
          <div class="rec-val" style="color:${i.valColor ? i.valColor : (i.neg ? "var(--coral-500)" : "var(--neutral-900)")}">${i.val}</div>
          <div class="rec-sub">${i.sub}</div>
        </div>
      </div>`).join("");
  }
  refreshIcons(0);
}

function initRecords() {
  initTabGroup(".rec-tab", "k", renderRecords, "all");
  renderRecords("all");
}

// ═══════════════════════════════════════════════════════════
// MODULE: boot.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// boot.js — 启动、侧边栏、编辑弹窗、事件委托
// ═══════════════════════════════════════════════════════════════

let currentEditItem = null;

function layoutShell(active) {
  const pages = [
    ["home", "小宇宙中心", "home.html", "🌌"],
    ["xp", "能量星球", "xp-growth.html", "⚡"],
    ["study", "知识星球", "study.html", "🌍"],
    ["money", "财富星球", "money.html", "💰"],
  ];

  let childName = "";
  let childBirthday = "";
  try {
    const saved = window.DataStore && window.DataStore.loadChildData ? window.DataStore.loadChildData() : null;
    if (saved) {
      childName = saved.name || childName;
      childBirthday = saved.birthday || childBirthday;
    }
  } catch (e) { /* ignore */ }

  const sidebar = document.querySelector("[data-sidebar]");
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="profile">
      <div class="cat"><img src="assets/cat-avatar.jpg" alt="" class="cat-img"></div>
      <div>
        <strong>${childName}</strong>
        <small>${formatAge(childBirthday)} <span style="color:var(--pink-500)">♀</span></small>
      </div>
    </div>
    <div class="nav-label">菜单</div>
    <nav class="nav">
      ${pages.map(([key, label, href, icon]) => `
        <a class="${active === key ? "active" : ""}" href="javascript:void(0)" data-page="${key}" onclick="switchView(\'${key}\')" style="cursor:pointer" role="link" tabindex="0"><i>${icon}</i>${label}</a>
      `).join("")}
    </nav>
    <nav class="nav-foot">
      <a href="javascript:void(0)" data-page="settings" onclick="switchView('settings')" style="cursor:pointer" role="link" tabindex="0"><i>⚙️</i>系统设置</a>
    </nav>
  `;
}

// ── 编辑弹窗 ──

async function openEditModal(item) {
  currentEditItem = { ...item };
  const modal = document.getElementById("editModal");
  document.getElementById("editTitle").value = item.title || "";
  setRadioValue("editSubjectGroup", item.subject || "语文");
  document.getElementById("editDueDate").value = item.dueDate || "";

  // 详情字段：能力模块/关联单元
  const subject = item.subject || "语文";
  populateChoiceGroup("editModuleGroup", getModuleOptions(subject), item.modules || []);

  const units = await getTeachingUnits(subject);
  const unitHint = document.getElementById("editUnitHint");
  let selIndex = (item.unitIndex !== undefined && item.unitIndex !== null && Number(item.unitIndex) >= 0) ? Number(item.unitIndex) : -1;
  if (units.length > 0) {
    if (selIndex >= 0 && units[selIndex]) {
      if (unitHint) unitHint.textContent = "已关联：" + units[selIndex].name;
    } else {
      const guessed = guessUnitFromTitle(subject, item.title, units);
      if (guessed >= 0) {
        selIndex = guessed;
        if (unitHint) unitHint.textContent = "✅ 已自动匹配到：" + units[guessed].name;
      } else {
        if (unitHint) unitHint.textContent = "未自动匹配到单元，特色作业等请选【其他】";
      }
    }
  }
  populateUnitGroup("editUnitGroup", units, selIndex, unitHint);

  // 随堂测验已合并到【录入成绩】，编辑不再处理测验
  modal.classList.add("show");
  refreshIcons(0);
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal) modal.classList.remove("show");
  currentEditItem = null;
}

/* ════════ 添加作业 ════════ */
// 作业类型 XP 从 config.json xpRules 中读取，不再硬编码
// 哪些作业类型需要独立截止日期
const ADD_HW_DUE_TYPES = new Set(["假期作业", "特色作业"]);

function getTodayVal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function syncAddHomeworkDue() {
  // 添加作业时截止日期总是默认今天，类型在提交时选
  // 但仍保留可填功能，供假期作业等长周期作业使用
  const wrap = document.getElementById("addDueFieldWrap");
  const input = document.getElementById("addHomeworkDueDate");
  const hint = document.getElementById("addDueHint");
  if (!wrap || !input) return;
  // 默认总是显示，让用户可以手动调整截止日期
  wrap.style.display = "";
  if (!input.value) input.value = getTodayVal();
}

// 添加作业弹窗的拆分状态（一次粘贴多条 → 拆分结果）
const addParsedItems = { current: [] };

function openAddHomeworkModal() {
  const modal = document.getElementById("addHomeworkModal");
  if (!modal) return;
  // 重置表单（添加作业：科目 + 作业类型 + 内容 + 截止日期）
  document.getElementById("addHomeworkTitle").value = "";
  document.getElementById("addHomeworkDueDate").value = getTodayVal();
  setRadioValue("addSubjectGroup", "语文");
  syncAddHomeworkDue();
  // 重置拆分状态
  const parsedWrap = document.getElementById("addParsedWrap");
  if (parsedWrap) parsedWrap.style.display = "none";
  const parsedList = document.getElementById("addParsedList");
  if (parsedList) parsedList.innerHTML = "";
  addParsedItems.current = [];
  modal.classList.add("show");
  refreshIcons(0);
  setTimeout(() => {
    const t = document.getElementById("addHomeworkTitle");
    if (t) t.focus();
  }, 120);
}

function closeAddHomeworkModal() {
  const modal = document.getElementById("addHomeworkModal");
  if (modal) modal.classList.remove("show");
}

async function saveAddHomework() {
  const title = document.getElementById("addHomeworkTitle").value.trim();
  const subject = getRadioValue("addSubjectGroup") || "语文";
  const today = getTodayVal();
  const dueDate = document.getElementById("addHomeworkDueDate").value || today;

  const btn = document.getElementById("saveAddHomework");
  const original = btn.textContent;
  btn.textContent = "保存中..."; btn.disabled = true;
  try {
    // ── 场景一：已拆分多条 → 批量保存勾选项 ──
    const parsedList = document.getElementById("addParsedList");
    const hasParsed = parsedList && parsedList.children.length > 0;
    if (hasParsed) {
      const items = addParsedItems.current || [];
      const checks = parsedList.querySelectorAll(".add-parse-check:checked");
      if (checks.length === 0) {
        btn.textContent = original; btn.disabled = false;
        showToast("请至少勾选一条要保存的作业", false);
        return;
      }
      const selected = [];
      checks.forEach(cb => {
        const idx = parseInt(cb.dataset.idx, 10);
        if (isNaN(idx) || !items[idx]) return;
        selected.push({ src: items[idx] });
      });
      // 批量录入：一次读取→批量追加→单次写回，避免逐条 fetch+write 互相覆盖
      const batchRecords = selected.map(el => ({
        // 科目一律以弹窗中选择的科目为准，避免解析器误判覆盖用户的选择
        subject: subject,
        title: el.src.text || el.src.title,
        description: el.src.text || el.src.title,
        // 已不再区分作业类型，统一置空（历史记录保留原值仅供展示/统计）
        homeworkType: "",
        modules: el.src.module ? [el.src.module] : [],
        module: el.src.module || "",
        status: "pending",
        submitted: false,
        date: today,
        dueDate: dueDate,
        unitIndex: -1,
        hasTest: false,
        testScope: null,
        isFullScore: null,
        wrongCount: 0,
        errorModules: [],
      }));
      if (batchRecords.length === 0) {
        btn.textContent = original; btn.disabled = false;
        showToast("未找到要保存的作业", false);
        return;
      }
      let okCount = 0, failCount = 0;
      try {
        const inserted = await DataStore.addStudyRecords(batchRecords);
        okCount = (inserted && inserted.length) || 0;
      } catch (e) { failCount = batchRecords.length; }
      if (failCount > 0 || okCount < batchRecords.length) {
        showToast(`成功 ${okCount} 条，失败 ${failCount} 条`, false);
      } else {
        showToast(`✅ 已录入 ${okCount} 条作业，提交后可补充详细信息`, true);
      }
      closeAddHomeworkModal();
      await DataStore.refreshData(true);
      // 保存后只刷新作业列表区块，避免整页全量重绘造成的卡顿
      if (typeof refreshHomeworkSection === "function") await refreshHomeworkSection();
      refreshIcons(50);
      return;
    }

    // ── 场景二：单条录入 ──
    if (!title) { showToast("先写一下作业内容吧 ✏️", false); return; }
    const hwTypeNow = "";
    await DataStore.addStudyRecord({
      subject,
      title,
      description: title,
      // 已不再区分作业类型，统一置空
      homeworkType: hwTypeNow,
      modules: [], // 能力模块在提交时填写
      module: "",
      status: "pending",
      submitted: false,
      date: today,
      dueDate: dueDate,
      unitIndex: -1, // 关联单元索引（-1表示未关联）
      hasTest: false, // 是否有随堂测验
      testScope: null, // 测验范围：today/past
      isFullScore: null, // 是否全对
      wrongCount: 0, // 错题数
      errorModules: [], // 错题模块
    });
    closeAddHomeworkModal();
    await DataStore.refreshData(true);
    // 保存后只刷新作业列表区块，避免整页全量重绘造成的卡顿
    if (typeof refreshHomeworkSection === "function") await refreshHomeworkSection();
    refreshIcons(50);
    showToast("✅ 作业已添加，提交后可补充详细信息", true);
  } catch (e) {
    console.error("添加作业失败:", e);
    const errMsg = (e && e.message) || "";
    if (errMsg.indexOf("Token") >= 0 || errMsg.indexOf("token") >= 0) {
      showTokenRequiredToast();
    } else {
      showToast("✖ 保存失败，请重试", false);
    }
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
}

function initAddHomeworkModal() {
  const closeBtn = document.getElementById("closeAddHomeworkModal");
  if (closeBtn) closeBtn.addEventListener("click", closeAddHomeworkModal);
  const cancelBtn = document.getElementById("cancelAddHomework");
  if (cancelBtn) cancelBtn.addEventListener("click", closeAddHomeworkModal);
  const saveBtn = document.getElementById("saveAddHomework");
  if (saveBtn) saveBtn.addEventListener("click", saveAddHomework);
  const overlay = document.getElementById("addHomeworkModal");
  if (overlay) overlay.addEventListener("click", function(e) {
    if (e.target === overlay) closeAddHomeworkModal();
  });
  // 智能拆分：一次粘贴多条 → 自动拆分成多条
  const splitBtn = document.getElementById("addSplitBtn");
  if (splitBtn) splitBtn.addEventListener("click", () => {
    const raw = document.getElementById("addHomeworkTitle").value.trim();
    if (!raw) { showToast("先粘贴作业内容再拆分 ✍️", false); return; }
    const items = parseHomeworkText(raw);
    if (items.length === 0) { showToast("未能识别作业内容，请检查格式", false); return; }
    addParsedItems.current = items;
    // 批量添加以弹窗中选择的科目为准（解析器识别仅作显示提示，不覆盖用户选择）
    const mbSubj = getRadioValue("addSubjectGroup") || "语文";
    const wrap = document.getElementById("addParsedWrap");
    const list = document.getElementById("addParsedList");
    if (wrap) wrap.style.display = "block";
    if (list) {
      list.innerHTML = items.map((it, i) => `
        <div class="parse-card" style="display:flex;flex-direction:column;gap:6px;padding:9px 10px;background:var(--neutral-50);border:1px solid var(--neutral-200);border-radius:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" checked class="add-parse-check" data-idx="${i}" style="accent-color:var(--lav-600);flex-shrink:0;" />
            <span class="hw-subject ${mbSubj === "语文" ? "hw-sub-cn" : mbSubj === "数学" ? "hw-sub-math" : mbSubj === "英语" ? "hw-sub-en" : ""}" style="font-size:10px;padding:2px 7px;flex-shrink:0;">${mbSubj}</span>
            ${it.module ? `<span style="font-size:10px;padding:2px 7px;border-radius:6px;background:var(--mint-100);color:var(--mint-700);flex-shrink:0;font-weight:700;">${it.module}</span>` : ""}
          </div>
          <span style="font-size:12px;color:var(--neutral-700);line-height:1.4;">${it.text}</span>
        </div>
      `).join("");
    }
    refreshIcons(0);
    showToast(`识别出 ${items.length} 条作业，勾选后点保存批量录入 ✅`, true);
  });
  // 科目切换无需重置模块（模块在提交时选）
}

/* ════════ 补充信息弹窗（类型/模块/单元/测验） ════════ */

// 中文字符 → 数字（支持"一"到"十"及阿拉伯数字）
function cnToNum(s) {
  if (s == null) return -1;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const cnMap = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };
  if (cnMap[s] !== undefined) return cnMap[s];
  return -1;
}

// 读取教学配置中的单元目录（从 config.json 的 teaching.subjects 读取）
let __teachingUnitsCache = null;
async function getTeachingUnits(subject) {
  try {
    // 优先从内存缓存读取
    if (__teachingUnitsCache && __teachingUnitsCache[subject]) {
      return __teachingUnitsCache[subject];
    }
    let cfgJson = null;
    // 尝试从 DataStore 缓存读取
    if (window.DataStore && window.DataStore._config && window.DataStore._config.teaching) {
      cfgJson = window.DataStore._config;
    } else {
      // 与其他数据文件一致，统一走 fetchRawJSON（优先本地 data/，失败回退 GitHub）
      cfgJson = await fetchRawJSON("config.json").catch(() => null);
    }
    if (!cfgJson || !cfgJson.teaching || !cfgJson.teaching.subjects) return [];
    const subjects = cfgJson.teaching.subjects;
    __teachingUnitsCache = __teachingUnitsCache || {};
    for (const key of Object.keys(subjects)) {
      __teachingUnitsCache[key] = (subjects[key] && subjects[key].units) || [];
    }
    return __teachingUnitsCache[subject] || [];
  } catch (err) {
    console.warn("读取教学配置失败:", err.message);
    return [];
  }
}

// 根据作业内容自动判断属于哪个单元：返回单元索引，找不到返回 -1
function guessUnitFromTitle(subject, title, units) {
  if (!title || !units || units.length === 0) return -1;
  const t = String(title) || "";
  // 1) 优先匹配"第X课"里的课目录
  const lessonMatch = t.match(/第\s*([一二三四五六七八九十\d]+)\s*课/);
  if (lessonMatch) {
    const lessonNum = cnToNum(lessonMatch[1]);
    for (let i = 0; i < units.length; i++) {
      const items = String(units[i].items || "").split(/、|，|,|;/).map(s => s.trim()).filter(Boolean);
      for (const it of items) {
        const m = it.match(/^(?:第\s*)?([一二三四五六七八九十\d]+)\s*[课Unit课]/i);
        if (m && cnToNum(m[1]) === lessonNum) return i;
      }
    }
  }
  // 2) 匹配课文名（如"观潮""盘古开天地"）
  for (let i = 0; i < units.length; i++) {
    const items = String(units[i].items || "").split(/、|，|,|;/).map(s => s.trim()).filter(Boolean);
    for (const it of items) {
      const clean = it.replace(/^(?:第\s*)?[一二三四五六七八九十\d]+\s*[课Unit课]\s*/i, "");
      if (clean && clean.length >= 2 && t.indexOf(clean) >= 0) return i;
    }
  }
  // 3) 匹配"第X单元"
  const unitMatch = t.match(/第\s*([一二三四五六七八九十\d]+)\s*单元/);
  if (unitMatch) {
    const un = cnToNum(unitMatch[1]);
    for (let i = 0; i < units.length; i++) {
      const m = String(units[i].name || "").match(/第\s*([一二三四五六七八九十\d]+)\s*单元/);
      if (m && cnToNum(m[1]) === un) return i;
    }
  }
  return -1;
}

// 填充"关联单元"选项组（胶囊按钮，固定追加"其他"选项）
// selectedIndex: >=0 选中该单元；<0 时默认选中"其他"（特色作业等无单元归属的作业）
function populateUnitGroup(groupId, units, selectedIndex, hintEl) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const uList = units || [];
  if (uList.length === 0) {
    group.innerHTML = `<label class="choice-pill warning checked"><input type="radio" name="${groupId}" value="other" checked>其他</label>`;
    if (hintEl) hintEl.textContent = "未配置单元目录，默认归为其他";
    return;
  }
  const names = uList.map((u, i) =>
    (u && u.name) ? u.name : ("单元" + (i + 1))
  );
  const pills = names.map((n, i) =>
    `<label class="choice-pill"><input type="radio" name="${groupId}" value="${i}">${typeof escapeHtmlReason === "function" ? escapeHtmlReason(n) : n}</label>`
  ).join("");
  // 固定追加"其他"
  group.innerHTML = pills + `<label class="choice-pill warning"><input type="radio" name="${groupId}" value="other">其他</label>`;
  if (typeof initChoicePills === "function") initChoicePills(group);
  const sel = (selectedIndex !== undefined && selectedIndex !== null && Number(selectedIndex) >= 0 && uList[Number(selectedIndex)])
    ? String(Number(selectedIndex)) : "other";
  setRadioValue(groupId, sel);
}

// 编辑弹窗：切换科目后按新科目重载"关联单元"目录与提示（不保留旧科目的单元）
async function reloadEditUnitGroup(subject) {
  const hintEl = document.getElementById("editUnitHint");
  const titleEl = document.getElementById("editTitle");
  const units = await getTeachingUnits(subject);
  let selIndex = -1;
  if (hintEl) hintEl.textContent = "";
  if (units.length > 0 && titleEl && titleEl.value) {
    const guessed = guessUnitFromTitle(subject, titleEl.value, units);
    if (guessed >= 0) { selIndex = guessed; if (hintEl) hintEl.textContent = "✅ 已自动匹配到：" + units[guessed].name; }
  }
  if (hintEl && !hintEl.textContent && units.length) {
    hintEl.textContent = "已切换到「" + subject + "」的单元目录，请重新选择";
  }
  populateUnitGroup("editUnitGroup", units, selIndex, hintEl);
}

// 填充能力模块复选框
function populateChoiceGroup(groupId, options, selected) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const selSet = new Set(selected || []);
  group.innerHTML = options.map(m => `
    <label class="choice-pill ${selSet.has(m) ? "checked" : ""}">
      <input type="checkbox" value="${m}" ${selSet.has(m) ? "checked" : ""}>${m}
    </label>
  `).join("");
  group.querySelectorAll(".choice-pill").forEach(pill => {
    pill.addEventListener("click", function(e) {
      const cb = this.querySelector("input");
      cb.checked = !cb.checked;
      this.classList.toggle("checked", cb.checked);
      e.preventDefault();
    });
  });
}

function getCheckedOfGroup(groupId) {
  return Array.from(document.querySelectorAll("#" + groupId + " input:checked")).map(cb => cb.value);
}

// 打开补充信息弹窗
let __shmCurrentItem = null; // 当前补充信息的作业
let __shmSubject = "语文";
async function openSubmitHomeworkModal(item) {
  if (!item) return;
  __shmCurrentItem = item;
  __shmSubject = item.subject || "语文";

  const modal = document.getElementById("submitHomeworkModal");
  if (!modal) return;

  // 科目行
  const subjLine = document.getElementById("shmSubjectLine");
  const subjColor = (SUBJECT_CONFIG[__shmSubject] && SUBJECT_CONFIG[__shmSubject].cls) === "en" ? "#9255F5" :
    (SUBJECT_CONFIG[__shmSubject] && SUBJECT_CONFIG[__shmSubject].cls) === "math" ? "#4A9EFF" : "#F95D9F";
  if (subjLine) {
    subjLine.innerHTML = `<span class="shm-subj-tag" style="background:${subjColor}">${__shmSubject}</span>
      <span>${typeof escapeHtmlReason === "function" ? escapeHtmlReason(item.title || "") : (item.title || "")}</span>`;
  }

  // 完成用时（预填已有值）
  setRadioValue("shmDurationGroup", item.duration || "");

  // 错题数（预填已有值）
  setRadioValue("shmWrongGroup", item.wrongCount != null ? String(item.wrongCount) : "");

  // 能力模块
  populateChoiceGroup("shmModuleGroup", getModuleOptions(__shmSubject), item.modules || []);

  // 单元目录 + 自动判断（胶囊按钮组，含"其他"）
  const units = await getTeachingUnits(__shmSubject);
  const unitHint = document.getElementById("shmUnitHint");
  let selIndex = -1;
  if (units.length > 0) {
    // 自动判断
    const guessed = guessUnitFromTitle(__shmSubject, item.title, units);
    if (guessed >= 0) {
      selIndex = guessed;
      if (unitHint) unitHint.textContent = "✅ 已自动匹配到：" + units[guessed].name;
    } else {
      if (unitHint) unitHint.textContent = "未自动匹配到单元，特色作业等请选【其他】";
    }
  }
  populateUnitGroup("shmUnitGroup", units, selIndex, unitHint);

  // 随堂测验已合并到【录入成绩】，此处不再填写
  modal.classList.add("show");
  refreshIcons(0);
}

// 随堂测验已合并到【录入成绩】，删除原联动函数

function closeSubmitHomeworkModal() {
  const modal = document.getElementById("submitHomeworkModal");
  if (modal) modal.classList.remove("show");
  __shmCurrentItem = null;
}

// 保存补充信息
async function saveSubmitHomework() {
  if (!__shmCurrentItem || !__shmCurrentItem.id) { showToast("未找到作业，请重试", false); return; }
  // 已不再区分作业类型，提交时补充的作业类型统一置空
  const hwType = "";
  const duration = getRadioValue("shmDurationGroup") || "";
  const wrongCount = getRadioValue("shmWrongGroup") || "";
  const modules = getCheckedOfGroup("shmModuleGroup");
  const module = modules[0] || "";
  const unitVal = getRadioValue("shmUnitGroup") || "other";
  const unitIndex = (unitVal !== "other" && unitVal !== "") ? Number(unitVal) : -1;
  const units = await getTeachingUnits(__shmSubject);
  const unitName = (unitIndex >= 0 && units[unitIndex]) ? units[unitIndex].name : null;

  // 随堂测验已合并到【录入成绩】，此处不再保存
  const payload = {
    homeworkType: hwType,
    duration,
    wrongCount: wrongCount !== "" ? Number(wrongCount) : null,
    modules,
    module,
    unitIndex,
    unitName,
  };

  const btn = document.getElementById("saveSubmitHomework");
  const original = btn.textContent;
  btn.textContent = "保存中..."; btn.disabled = true;
  const wasDone = __shmCurrentItem.status === "done" || !!__shmCurrentItem.submitted;
  // ★ 提速：单次写入作业记录。新提交时一次写入"已完成+完整补充信息"；已是完成态只写补充信息。
  //   不再"先写 payload 再写 done"对同一 study.json 写两次（这是保存慢的主因之一，省一整次远程 PUT）。
  const finalPayload = wasDone
    ? payload
    : Object.assign({ status: "done", submitted: true, submittedAt: new Date().toISOString() }, payload);
  try {
    // ── 作业记录写入（GitHub Pages 走单次 PUT）──
    let saved = false;
    const writePromise = (async () => {
      try {
        // 仅本地开发(带 /api 后端)才尝试 API；GitHub Pages 无后端，直接统一写入
        if (await isLocalMode()) {
          const resp = await fetch(`/api/homework/${__shmCurrentItem.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(finalPayload),
          });
          const result = await resp.json();
          if (result.ok) saved = true;
        } else if (window.DataStore && window.DataStore.updateStudyRecord) {
          await window.DataStore.updateStudyRecord(__shmCurrentItem.id, finalPayload);
          saved = true;
        }
      } catch (apiErr) {
        console.warn("补充信息保存 API 失败，使用本地回退:", apiErr.message);
      }
      if (!saved && window.DataStore && window.DataStore.updateStudyRecord) {
        try {
          await window.DataStore.updateStudyRecord(__shmCurrentItem.id, finalPayload);
          saved = true;
        } catch (dsErr) { console.warn("补充信息保存 DataStore 失败:", dsErr.message); }
      }
      if (!saved) {
        await updateHomeworkLocally(__shmCurrentItem.id, finalPayload);
      }
    })();

    // ── XP 发放（仅新提交时）──与作业写入并行：不同数据文件、互不干扰，减少串行等待 ──
    // 用户点「提交作业」即视为完成：只有未完成时才置 done 并发放一次 XP，避免重复提交重复加分。
    // 已不再区分作业类型：每次作业完成统一 +1 XP（taskName 沿用"作业·X"，历史追溯也统一按 1 处理）
    let baseXp = 1;
    let xpPromise = Promise.resolve();
    if (!wasDone) {
      const subjectName = __shmCurrentItem.subject || "";
      const hwTaskName = "作业·" + (__shmCurrentItem.homeworkType || "假期作业");
      xpPromise = window.DataStore.addXpRecord({
        taskName: hwTaskName,
        title: __shmCurrentItem.title || __shmCurrentItem.cleanTitle || "作业",
        xpCategory: "学习成长",
        type: "作业完成",
        xp: 1,
        baseXp: 1,
        status: "verified",
        description: (subjectName ? subjectName + "作业完成" : "作业完成"),
      }).catch(err => console.warn("提交作业-加分失败:", err.message));
    }
    await Promise.all([writePromise, xpPromise]);

    if (!wasDone) {
      showToast(`✅ 作业已提交，+${baseXp} XP`, true);
    } else {
      showToast("✅ 补充信息已保存", true);
    }

    // 随堂测验的能量发放已合并到【录入成绩】，此处移除
    closeSubmitHomeworkModal();
    if (window.DataStore && window.DataStore.refreshData) {
      // refreshData(true)=仅本地缓存刷新(写操作已更新内存缓存)，不走网络，避免卡顿
      await window.DataStore.refreshData(true).catch(() => {});
    }
    // 保存后只刷新作业列表区块，避免整页全量重绘造成的卡顿
    if (typeof refreshHomeworkSection === "function") await refreshHomeworkSection();
    refreshIcons(50);
  } catch (e) {
    console.error("补充信息保存失败:", e);
    const errMsg = (e && e.message) || "";
    if (errMsg.indexOf("Token") >= 0 || errMsg.indexOf("token") >= 0) {
      showTokenRequiredToast();
    } else {
      showToast("✖ 保存失败，请重试", false);
    }
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
}

function initSubmitHomeworkModal() {
  const modal = document.getElementById("submitHomeworkModal");
  if (!modal) return;
  const closeBtn = document.getElementById("closeSubmitHomeworkModal");
  if (closeBtn) closeBtn.addEventListener("click", closeSubmitHomeworkModal);
  const cancelBtn = document.getElementById("cancelSubmitHomework");
  if (cancelBtn) cancelBtn.addEventListener("click", closeSubmitHomeworkModal);
  const saveBtn = document.getElementById("saveSubmitHomework");
  if (saveBtn) saveBtn.addEventListener("click", saveSubmitHomework);
  if (modal) modal.addEventListener("click", function(e) {
    if (e.target === modal) closeSubmitHomeworkModal();
  });
  // 初始化选择胶囊（作业类型/完成用时/错题数等静态选项），否则选项无法点击
  if (typeof initChoicePills === "function") initChoicePills();
}

/* ════════ 录入成绩弹窗 ════════ */
function populateScoreSemesterOptions(sel) {
  if (!sel) return;
  const opts = [];
  if (window.SemesterCalendar && window.SemesterCalendar.getCalendarData) {
    try {
      const calData = window.SemesterCalendar.getCalendarData();
      (calData || []).forEach(y => {
        const grade = y.grade || "";
        if (y.semester1) opts.push({ value: grade + "(上)", label: grade + "上学期" });
        if (y.semester2) opts.push({ value: grade + "(下)", label: grade + "下学期" });
      });
    } catch (e) { /* ignore */ }
  }
  if (opts.length === 0) {
    ["一年级","二年级","三年级","四年级","五年级","六年级"].forEach(g => {
      opts.push({ value: g + "(上)", label: g + "上学期" });
      opts.push({ value: g + "(下)", label: g + "下学期" });
    });
  }
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
  // 默认选当前学期
  if (window.SemesterCalendar && window.SemesterCalendar.getCurrentSemesterInfo) {
    try {
      const info = window.SemesterCalendar.getCurrentSemesterInfo();
      const cur = info.grade + "(" + info.semesterShortName + ")";
      if (opts.some(o => o.value === cur)) sel.value = cur;
    } catch (e) { /* ignore */ }
  }
}

// ════════ 成绩类型辅助（日常巩固类 vs 考试类 · 两级结构） ════════
const EXAM_TYPE_LIST = ["单元测试", "月考", "期中考试", "期末考试"];
function isExamType(t) {
  // 按关键词识别"考试类"，兼容历史记录里的旧类型名（如"期末"而非"期末考试"）。
  // 避免期末/期中/月考/单元测试被误判成"日常"而混进平时成绩视图。
  if (!t) return false;
  return /期末|期中|月考|单元/.test(String(t));
}
function isDailyScoreType(t) { return !isExamType(t); }
function categoryOfType(t) { return isExamType(t) ? "exam" : "daily"; }
function getScoreCategoryValue() { return getRadioValue("scoreCatGroup") || "daily"; }
function getScoreType() { return getRadioValue("scoreSubTypeGroup") || ""; }
// 按 科目+大类 返回具体类型清单（科目影响细分类）
function getScoreTypeList(subject, category) {
  const dailyBySubj = {
    "语文": ["听写", "默写", "背诵", "小测", "课文朗读"],
    "数学": ["口算", "竖式计算", "应用题", "小测"],
    "英语": ["听写", "朗读", "小测"],
  };
  const defDaily = ["小测", "听写", "默写", "口算", "背诵"];
  if (category === "exam") return EXAM_TYPE_LIST.slice();
  return dailyBySubj[subject] || defDaily;
}
function normalizeScoreType(t) {
  if (!t) return "小测";
  const legacy = { "日常测验": "小测", "期中": "期中考试", "期末": "期末考试" };
  return legacy[t] || t;
}
// 按"对了几题 / 共几题"换算等级（供日常记录显示，口径与分数换算一致）
function deriveGradeFromRatio(ratio) {
  if (ratio == null || isNaN(ratio)) return "";
  const p = ratio * 100;
  if (p >= 95) return "A+"; if (p >= 90) return "A"; if (p >= 85) return "B+";
  if (p >= 80) return "B"; if (p >= 75) return "C+"; if (p >= 70) return "C";
  if (p >= 60) return "D+"; return "D";
}
// 从日期自动推导学期标签（如 "四年级(上)"）
function semesterLabelFromDate(dateStr) {
  try {
    const info = getCurrentSemesterInfo(dateStr || getTodayVal());
    if (!info || !info.grade || !info.semester) return "";
    const season = (info.semesterShortName === "上" || info.semesterShortName === "下")
      ? info.semesterShortName
      : (info.semester === 1 ? "上" : "下");
    return `${info.grade}(${season})`;
  } catch (e) { return ""; }
}
// 渲染大类下方的细分类单选组
function renderScoreSubTypeGroup(subject, category) {
  const group = document.getElementById("scoreSubTypeGroup");
  if (!group) return;
  const list = getScoreTypeList(subject, category);
  group.innerHTML = list.map((t, i) =>
    `<label class="choice-pill kn${i === 0 ? " checked" : ""}"><input type="radio" name="scoreSubType" value="${t}"${i === 0 ? " checked" : ""}>${t}</label>`
  ).join("");
  initChoicePills(group);
}
// 录入表单随类型切换：日常→"共几题/对几题"，考试→"分数/等级"
function applyScoreTypeUI(type) {
  const isDaily = isDailyScoreType(type);
  const taskRow = document.getElementById("scoreTaskScoringRow");
  const examRow = document.getElementById("scoreExamScoringRow");
  if (taskRow) taskRow.style.display = isDaily ? "" : "none";
  if (examRow) examRow.style.display = isDaily ? "none" : "";
  // 大类高亮跟随所选的细分类
  setRadioValue("scoreCatGroup", categoryOfType(type));
  syncErrorField();
}
// 错题/失分模块：仅当确有失分时才出现（错题类型：对了几题 < 共几题）
function syncErrorField() {
  const field = document.getElementById("scoreErrorField");
  if (!field) return;
  const tip = document.getElementById("scoreErrorTip");
  const boxes = document.getElementById("errorModuleCheckboxes");
  const type = getScoreType();
  const isDaily = !isExamType(type);
  const tQ = Number((document.getElementById("scoreTotalQuestions") || {}).value || 0) || 0;
  const cQ = Number((document.getElementById("scoreCorrectQuestions") || {}).value || 0) || 0;
  if (isDaily) {
    const showBoxes = tQ > 0 && cQ < tQ; // 有做错才可标错题类型
    if (boxes) boxes.style.display = showBoxes ? "" : "none";
    if (tip) {
      tip.style.display = showBoxes ? "none" : "";
      tip.innerHTML = tQ > 0 && cQ === tQ
        ? '<i data-lucide="check-circle"></i>全部正确，无错题'
        : '<i data-lucide="info"></i>填写「共几题/对了几题」，有做错时才会出现错题类型';
      refreshIcons(0);
    }
  } else {
    if (boxes) boxes.style.display = "";
    if (tip) tip.style.display = "none";
  }
}
// 设定科目+大类后，选中对应细分类并联动
function setScoreTypeSelection(subject, type) {
  const cat = categoryOfType(type);
  setRadioValue("scoreCatGroup", cat);
  renderScoreSubTypeGroup(subject, cat);
  if (!document.querySelector(`#scoreSubTypeGroup input[value="${type}"]`)) {
    type = getScoreTypeList(subject, cat)[0] || "小测";
  }
  setRadioValue("scoreSubTypeGroup", type);
  initChoicePills(document.getElementById("scoreSubTypeGroup"));
  applyScoreTypeUI(type);
  return type;
}

function renderErrorModulesFor(subject) {
  const box = document.getElementById("errorModuleCheckboxes");
  if (!box) return;
  const options = getModuleOptions(subject);
  box.innerHTML = options.map(m => `
    <label class="choice-pill kn">
      <input type="checkbox" name="errModule" value="${m}">${m}
    </label>
  `).join("");
  box.querySelectorAll(".choice-pill").forEach(pill => {
    pill.addEventListener("click", function(e) {
      const cb = this.querySelector("input");
      cb.checked = !cb.checked;
      this.classList.toggle("checked", cb.checked);
      e.preventDefault();
    });
  });
}

// 当前正在修改的成绩 id；null 表示"新增"模式
let __editScoreId = null;

function getScoreRecordById(id) {
  const data = cachedData && cachedData.study ? cachedData.study : null;
  const list = (data && Array.isArray(data.examRecords)) ? data.examRecords : [];
  return list.find(r => r.id === id) || null;
}

function setScoreModalEditMode(editing) {
  const modal = document.getElementById("addScoreModal");
  if (modal) {
    const titleEl = modal.querySelector(".edit-modal-title");
    if (titleEl) {
      titleEl.innerHTML = editing
        ? '<i data-lucide="award" style="width:18px;height:18px"></i>修改成绩'
        : '<i data-lucide="award" style="width:18px;height:18px"></i>录入成绩';
    }
    const xpHint = modal.querySelector(".xp-hint");
    if (xpHint) xpHint.style.display = editing ? "none" : "";
  }
  const delBtn = document.getElementById("scoreDelBtn");
  if (delBtn) delBtn.style.display = editing && __editScoreId ? "inline-flex" : "none";
  refreshIcons(0);
}

function openAddScoreModal() {
  const modal = document.getElementById("addScoreModal");
  if (!modal) return;
  __editScoreId = null;
  setRadioValue("scoreSubjectGroup", "语文");
  setScoreTypeSelection("语文", "小测"); // 默认日常-小测，联动大类+细分类+记分行
  document.getElementById("scoreGrade").value = "A";
  if (document.getElementById("scoreNumber")) document.getElementById("scoreNumber").value = "";
  const stq = document.getElementById("scoreTotalQuestions"); if (stq) stq.value = "";
  const scq = document.getElementById("scoreCorrectQuestions"); if (scq) scq.value = "";
  if (document.getElementById("scoreTitle")) document.getElementById("scoreTitle").value = "";
  document.getElementById("scoreDate").value = getTodayVal();
  // 学期由日期自动推导，不再手动选择
  renderErrorModulesFor("语文");
  syncErrorField();
  setScoreModalEditMode(false);
  modal.classList.add("show");
  refreshIcons(0);
}

// 打开成绩修改：预填原记录 + 删除按钮
function openScoreEditModal(id) {
  const rec = getScoreRecordById(id);
  if (!rec) { showToast("未找到这条成绩记录", false); return; }
  __editScoreId = id;
  const modal = document.getElementById("addScoreModal");
  if (!modal) return;

  const subj = rec.subject || "语文";
  const type = normalizeScoreType(rec.examType || "小测");
  setRadioValue("scoreSubjectGroup", subj);
  const finalType = setScoreTypeSelection(subj, type); // 设大类+细分类+联动
  const sg = document.getElementById("scoreGrade"); if (sg) sg.value = rec.grade || "A";
  const sn = document.getElementById("scoreNumber"); if (sn) sn.value = (rec.score != null && rec.score !== "" ? rec.score : "");
  const stq = document.getElementById("scoreTotalQuestions"); if (stq) stq.value = (rec.totalQuestions != null ? rec.totalQuestions : "");
  const scq = document.getElementById("scoreCorrectQuestions"); if (scq) scq.value = (rec.correctQuestions != null ? rec.correctQuestions : "");
  const st = document.getElementById("scoreTitle"); if (st) st.value = rec.title || "";
  const sd = document.getElementById("scoreDate"); if (sd) sd.value = rec.date || getTodayVal();
  // 学期由日期自动推导，不手动回填

  // 失分/错题模块按科目渲染 + 回填已选
  renderErrorModulesFor(subj);
  const em = Array.isArray(rec.errorModules) ? rec.errorModules
    : (rec.errorModule ? String(rec.errorModule).split(/[、,，]/).map(s => s.trim()).filter(Boolean) : []);
  em.forEach(m => {
    const cb = document.querySelector('#errorModuleCheckboxes input[value="' + (window.CSS && CSS.escape ? CSS.escape(m) : m) + '"]');
    if (cb) { cb.checked = true; const pill = cb.closest(".choice-pill"); if (pill) pill.classList.add("checked"); }
  });

  // 依据是否确有失分，决定错题/失分模块是否可见
  if (document.getElementById("scoreTotalQuestions")) {
    if (stq) stq.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    syncErrorField();
  }
  const _isDaily = !isExamType(finalType);
  if (!_isDaily) { if (document.getElementById("errorModuleCheckboxes")) document.getElementById("errorModuleCheckboxes").style.display = ""; }

  setScoreModalEditMode(true);
  modal.classList.add("show");
  refreshIcons(0);
}

// 应用内自定义确认弹层（替代原生 confirm，避免受控/预览浏览器拦截原生对话框导致"删除没反应/失败"）
function confirmAsync(opts) {
  const o = opts || {};
  return new Promise(function (resolve) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;width:320px;max-width:86vw;box-shadow:0 24px 60px rgba(0,0,0,.25);text-align:center;font-family:inherit';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:17px;font-weight:800;color:#0f172a;margin-bottom:8px';
    title.textContent = o.title || '确认操作';
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:13px;color:#64748b;line-height:1.6;margin-bottom:18px;white-space:pre-line';
    desc.textContent = o.desc || '';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.style.cssText = 'flex:1;padding:10px 0;border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#475569;font-weight:700;cursor:pointer';
    cancel.textContent = o.cancelText || '取消';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.style.cssText = 'flex:1;padding:10px 0;border:none;border-radius:12px;color:#fff;font-weight:800;cursor:pointer;background:' + (o.danger ? '#ef4444' : '#6366f1');
    ok.textContent = o.okText || '确定';
    btns.appendChild(cancel);
    btns.appendChild(ok);
    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(btns);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    const done = function (v) { try { wrap.remove(); } catch (e) { /* noop */ } resolve(v); };
    cancel.onclick = function () { done(false); };
    ok.onclick = function () { done(true); };
    wrap.addEventListener('click', function (e) { if (e.target === wrap) done(false); });
    const esc = function (e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done(false); } };
    document.addEventListener('keydown', esc);
    const oklucide = ok.querySelector('.lucide,svg'); if (globalThis.refreshIcons) globalThis.refreshIcons(0);
  });
}

// 删除成绩（带二次确认）
async function scoreDelete(id) {
  const rec = getScoreRecordById(id);
  if (!rec) return;
  const label = (rec.subject || "") + (rec.grade ? " " + rec.grade : "");
  const confirmed = await confirmAsync({
    title: "删除这条成绩？",
    desc: (label ? "（" + label + "）\n" : "") + "删除后不可恢复。",
    okText: "删除",
    cancelText: "取消",
    danger: true,
  });
  if (!confirmed) return;
  const btn = document.getElementById("scoreDelBtn");
  try {
    if (btn) { btn.disabled = true; btn.textContent = ""; btn.innerHTML = '<i data-lucide="loader-2">删除中…</i>'; }
    await DataStore.deleteScoreRecord(id);
    closeAddScoreModal();
    if (__editScoreId === id) __editScoreId = null;
    await DataStore.refreshData(true);
    if (typeof renderStudy === "function") await renderStudy();
    if (typeof renderScoreAnalysis === "function") await renderScoreAnalysis();
    refreshIcons(50);
    showToast("✅ 已删除该成绩", true);
  } catch (e) {
    console.error("删除成绩失败:", e);
    showToast("✖ 删除失败，请重试", false);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="trash-2"></i>删除'; }
  }
}

function closeAddScoreModal() {
  const modal = document.getElementById("addScoreModal");
  if (modal) modal.classList.remove("show");
  if (__editScoreId) setScoreModalEditMode(true);
}

function openAddEvalModal() {
  const modal = document.getElementById("addEvalModal");
  if (!modal) return;
  document.getElementById("evalTeacherComment").value = "";
  document.getElementById("evalParentComment").value = "";
  document.getElementById("evalDate").value = getTodayVal();
  populateScoreSemesterOptions(document.getElementById("evalSemester"));
  modal.classList.add("active");
  refreshIcons(0);
}

function closeAddEvalModal() {
  const modal = document.getElementById("addEvalModal");
  if (modal) modal.classList.remove("active");
}

async function submitScore() {
  const subject = getRadioValue("scoreSubjectGroup") || "语文";
  const examType = getScoreType() || "小测";
  const isDaily = isDailyScoreType(examType);
  const errorModules = Array.from(document.querySelectorAll("#errorModuleCheckboxes input:checked:not(:disabled)")).map(cb => cb.value);
  const title = document.getElementById("scoreTitle") ? document.getElementById("scoreTitle").value.trim() : "";
  const date = document.getElementById("scoreDate").value || getTodayVal();

  // 记分：日常巩固类按 共几题/对几题 并自动换算等级；考试类用 分数+等级
  let grade, score = null, totalQuestions = null, correctQuestions = null;
  if (isDaily) {
    totalQuestions = document.getElementById("scoreTotalQuestions") ? Number(document.getElementById("scoreTotalQuestions").value) || null : null;
    correctQuestions = document.getElementById("scoreCorrectQuestions") ? Number(document.getElementById("scoreCorrectQuestions").value) || null : null;
    grade = (totalQuestions && correctQuestions != null)
      ? deriveGradeFromRatio(correctQuestions / totalQuestions)
      : (document.getElementById("scoreGrade") ? document.getElementById("scoreGrade").value : "");
  } else {
    grade = document.getElementById("scoreGrade") ? document.getElementById("scoreGrade").value : "";
    const scoreVal = document.getElementById("scoreNumber") ? document.getElementById("scoreNumber").value : "";
    score = scoreVal ? Number(scoreVal) : null;
  }
  if (!grade) { showToast("请完善记分信息", false); return; }

  // 学期由日期自动推导；记录大类以便分析统一口径
  const semesterLabel = semesterLabelFromDate(date);
  const category = categoryOfType(examType);

  const btn = document.getElementById("submitScore");
  const original = btn.textContent;
  btn.textContent = "保存中…"; btn.disabled = true;
  const isEdit = !!__editScoreId;
  const payload = {
    subject,
    grade,
    examType,
    category,
    title,
    date,
    errorModules,
    errorModule: errorModules.join("、"),
    score,
    totalQuestions,
    correctQuestions,
    semesterLabel,
  };
  try {
    if (isEdit) {
      await DataStore.updateScoreRecord(__editScoreId, payload);
      showToast(`✅ 已更新${subject}${grade}成绩`, true);
    } else {
      await DataStore.addScoreRecord(payload);
      showToast(`✅ 已录入${subject}${grade}成绩`, true);
    }
    closeAddScoreModal();
    __editScoreId = null;
    await DataStore.refreshData(true);
    if (typeof renderStudy === "function") await renderStudy();
    if (typeof renderScoreAnalysis === "function") await renderScoreAnalysis();
    refreshIcons(50);
  } catch (e) {
    console.error("保存成绩失败:", e);
    const errMsg = (e && e.message) || "";
    if (errMsg.indexOf("Token") >= 0 || errMsg.indexOf("token") >= 0) showTokenRequiredToast();
    else showToast("✖ 保存失败，请重试", false);
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
}

async function submitEvaluation() {
  const teacher = document.getElementById("evalTeacherComment").value.trim();
  const parent = document.getElementById("evalParentComment").value.trim();
  if (!teacher && !parent) { showToast("请至少填写老师或家长评语", false); return; }
  const semester = document.getElementById("evalSemester") ? document.getElementById("evalSemester").value : "";
  const date = document.getElementById("evalDate").value || getTodayVal();
  const btn = document.getElementById("submitEvaluation");
  const original = btn.textContent;
  btn.textContent = "保存中…"; btn.disabled = true;
  try {
    await DataStore.addEvaluationRecord({
      semester,
      teacherComment: teacher,
      parentComment: parent,
      date,
    });
    closeAddEvalModal();
    await DataStore.refreshData(true);
    refreshIcons(50);
    showToast("✅ 期末评价已录入", true);
  } catch (e) {
    console.error("录入期末评价失败:", e);
    const errMsg = (e && e.message) || "";
    if (errMsg.indexOf("Token") >= 0 || errMsg.indexOf("token") >= 0) showTokenRequiredToast();
    else showToast("✖ 保存失败，请重试", false);
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
}

function initScoreEvalModals() {
  // 成绩弹窗
  const sModal = document.getElementById("addScoreModal");
  if (sModal) sModal.addEventListener("click", function(e) { if (e.target === sModal) closeAddScoreModal(); });
  const sSave = document.getElementById("submitScore");
  if (sSave) sSave.addEventListener("click", submitScore);
  document.querySelectorAll("#scoreSubjectGroup input").forEach(radio => {
    radio.addEventListener("change", function() { renderErrorModulesFor(this.value); });
  });
  // 大类切换（日常/考试）→ 按其渲染细分类 + 联动记分行
  document.querySelectorAll("#scoreCatGroup input").forEach(radio => {
    radio.addEventListener("change", function() {
      const subj = getRadioValue("scoreSubjectGroup") || "语文";
      renderScoreSubTypeGroup(subj, this.value);
      const type = getScoreType() || (this.value === "exam" ? "单元测试" : "小测");
      applyScoreTypeUI(type);
    });
  });
  // 细分类切换 → 联动记分行 + 错题模块可见性
  document.querySelectorAll("#scoreSubTypeGroup input").forEach(radio => {
    radio.addEventListener("change", function() { applyScoreTypeUI(this.value); });
  });
  // 共几题/对了几题 变化 → 实时控制错题模块是否出现
  ["scoreTotalQuestions", "scoreCorrectQuestions"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", syncErrorField);
  });
  // 各科成绩分析：点击记录行 → 修改；点删除 → 删除
  const sbPanel = document.getElementById("scoreSubjectBlocks");
  if (sbPanel && !sbPanel.__scoreDelegated) {
    sbPanel.__scoreDelegated = true;
    sbPanel.addEventListener("click", function(e) {
      const delBtn = e.target.closest("[data-del-score]");
      if (delBtn) {
        e.stopPropagation();
        scoreDelete(delBtn.dataset.delScore);
        return;
      }
      const row = e.target.closest("[data-score-id]");
      if (row) openScoreEditModal(row.dataset.scoreId);
    });
  }
  // 期末评价弹窗
  const eModal = document.getElementById("addEvalModal");
  if (eModal) eModal.addEventListener("click", function(e) { if (e.target === eModal) closeAddEvalModal(); });
  const eSave = document.getElementById("submitEvaluation");
  if (eSave) eSave.addEventListener("click", submitEvaluation);
  const eSel = document.getElementById("evalSemester");
  if (eSel) populateScoreSemesterOptions(eSel);
  // 学期末录入弹窗（成绩 + 评价合并）
  const smModal = document.getElementById("addSemesterModal");
  if (smModal) smModal.addEventListener("click", function(e) { if (e.target === smModal) closeAddSemesterModal(); });
  const smSave = document.getElementById("submitSemesterEval");
  if (smSave) smSave.addEventListener("click", submitSemesterEval);
  const smSel = document.getElementById("semesterEvalSemester");
  if (smSel) populateScoreSemesterOptions(smSel);
}

// ════════ 学期末录入（期末成绩 + 期末评价 合并） ════════
const SEMESTER_SUBJECTS = ["语文", "数学", "英语", "科学", "道德与法治", "音乐", "体育", "美术", "劳动", "综合实践活动", "信息科技", "书法", "心理健康"];
const SEMESTER_GRADES = ["A+", "A", "B+", "B", "C+", "C", "D+", "D"];

function semesterSubjectOptions(selected) {
  return SEMESTER_SUBJECTS.map(s =>
    `<option value="${s}" ${s === selected ? "selected" : ""}>${s}</option>`
  ).join("");
}
function semesterGradeOptions(selected) {
  return SEMESTER_GRADES.map(g =>
    `<option value="${g}" ${g === selected ? "selected" : ""}>${g}</option>`
  ).join("");
}

function addSemesterScoreRow(subject, grade) {
  const box = document.getElementById("semesterScoreRows");
  if (!box) return;
  const row = document.createElement("div");
  row.className = "semester-score-row";
  row.innerHTML = `
    <select class="semester-select sem-subject">${semesterSubjectOptions(subject)}</select>
    <select class="semester-select sem-grade">${semesterGradeOptions(grade)}</select>
    <input type="number" class="sem-score" placeholder="分数" min="0" max="100" />
    <button type="button" class="sem-row-del" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>
  `;
  box.appendChild(row);
  refreshIcons(0);
}

function openAddSemesterModal() {
  const modal = document.getElementById("addSemesterModal");
  if (!modal) return;
  document.getElementById("semesterTeacherComment").value = "";
  document.getElementById("semesterParentComment").value = "";
  document.getElementById("semesterEvalDate").value = getTodayVal();
  populateScoreSemesterOptions(document.getElementById("semesterEvalSemester"));
  const box = document.getElementById("semesterScoreRows");
  if (box) box.innerHTML = "";
  // 默认预置语数英三行
  addSemesterScoreRow("语文");
  addSemesterScoreRow("数学");
  addSemesterScoreRow("英语");
  modal.classList.add("active");
  refreshIcons(0);
}

function closeAddSemesterModal() {
  const modal = document.getElementById("addSemesterModal");
  if (modal) modal.classList.remove("active");
}

async function submitSemesterEval() {
  const semester = document.getElementById("semesterEvalSemester") ? document.getElementById("semesterEvalSemester").value : "";
  const date = document.getElementById("semesterEvalDate").value || getTodayVal();
  const teacher = document.getElementById("semesterTeacherComment").value.trim();
  const parent = document.getElementById("semesterParentComment").value.trim();
  const rows = Array.from(document.querySelectorAll("#semesterScoreRows .semester-score-row"));

  // 收集有效的成绩行（科目 + 等级）
  const scores = rows.map(row => ({
    subject: row.querySelector(".sem-subject").value,
    grade: row.querySelector(".sem-grade").value,
    score: row.querySelector(".sem-score").value,
  })).filter(r => r.subject && r.grade);

  if (scores.length === 0 && !teacher && !parent) {
    showToast("请至少填写一门期末成绩或评语", false);
    return;
  }

  const btn = document.getElementById("submitSemesterEval");
  const original = btn.textContent;
  btn.textContent = "保存中…"; btn.disabled = true;
  try {
    // 1) 逐科写入期末成绩
    for (const s of scores) {
      await DataStore.addScoreRecord({
        subject: s.subject,
        grade: s.grade,
        examType: "期末",
        title: "期末",
        date,
        errorModules: [],
        errorModule: "",
        score: s.score ? Number(s.score) : null,
        semesterLabel: semester,
      });
    }
    // 2) 写入期末评价（若有评语）
    if (teacher || parent) {
      await DataStore.addEvaluationRecord({
        semester,
        teacherComment: teacher,
        parentComment: parent,
        date,
      });
    }
    closeAddSemesterModal();
    await DataStore.refreshData(true);
    if (typeof renderStudy === "function") await renderStudy();
    if (typeof renderScoreAnalysis === "function") await renderScoreAnalysis();
    refreshIcons(50);
    const n = scores.length;
    showToast(`✅ 已录入${n ? n + "科期末成绩" : "期末评价"}${teacher || parent ? " + 评语" : ""}`, true);
  } catch (e) {
    console.error("学期末录入失败:", e);
    const errMsg = (e && e.message) || "";
    if (errMsg.indexOf("Token") >= 0 || errMsg.indexOf("token") >= 0) showTokenRequiredToast();
    else showToast("✖ 保存失败，请重试", false);
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
}

async function saveEdit() {
  if (!currentEditItem || !currentEditItem.id) return;

  const newTitle = document.getElementById("editTitle").value;
  const newSubject = getRadioValue("editSubjectGroup");
  const newDueDate = document.getElementById("editDueDate").value;

  // 详情字段：能力模块/关联单元
  const modules = getCheckedOfGroup("editModuleGroup");
  const module = modules[0] || "";
  const unitVal = getRadioValue("editUnitGroup") || "other";
  const unitIndex = (unitVal !== "other" && unitVal !== "") ? Number(unitVal) : -1;
  const units = await getTeachingUnits(newSubject);
  const unitName = (unitIndex >= 0 && units[unitIndex]) ? units[unitIndex].name : null;
  // 随堂测验已合并到【录入成绩】，编辑不再处理测验

  const payload = {
    title: newTitle,
    subject: newSubject,
    dueDate: newDueDate,
    // 已不再区分作业类型，编辑时统一置空
    homeworkType: "",
    modules,
    module,
    unitIndex,
    unitName,
  };

  let saved = false;
  try {
    // 仅本地开发(带 /api 后端)才尝试 API；GitHub Pages 无后端，直接走统一写入，
    // 省去每次保存白打的失败 API 请求（编辑慢的主因，与提交作业同源）
    if (await isLocalMode()) {
      const resp = await fetch(`/api/homework/${currentEditItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await resp.json();
      if (result.ok) { saved = true; }
      else { throw new Error(result.error || "保存失败"); }
    } else if (window.DataStore && window.DataStore.updateStudyRecord) {
      await window.DataStore.updateStudyRecord(currentEditItem.id, payload);
      saved = true;
    }
  } catch (apiErr) {
    console.warn("API 保存失败，尝试本地更新:", apiErr.message);
    if (!saved && window.DataStore && window.DataStore.updateStudyRecord) {
      try {
        await window.DataStore.updateStudyRecord(currentEditItem.id, payload);
        saved = true;
      } catch (dsErr) {
        console.warn("DataStore 更新失败，使用本地回退:", dsErr.message);
      }
    }
    if (!saved) {
      await updateHomeworkLocally(currentEditItem.id, payload);
      saved = true;
    }
  }

  if (!saved) {
    alert("保存失败，请重试");
    return;
  }

  closeEditModal();
  window.DataStore && window.DataStore.refreshData(true);
  // 保存后只刷新作业列表区块，避免整页全量重绘造成的卡顿
  if (typeof refreshHomeworkSection === "function") await refreshHomeworkSection();
  refreshIcons(50);
  showToast("✅ 作业已更新", true);
}

function initEditModal() {
  const closeBtn = document.getElementById("closeEditModal");
  if (closeBtn) closeBtn.addEventListener("click", closeEditModal);
  const cancelBtn = document.getElementById("cancelEdit");
  if (cancelBtn) cancelBtn.addEventListener("click", closeEditModal);

  const saveBtn = document.getElementById("saveEdit");
  if (saveBtn) saveBtn.addEventListener("click", saveEdit);

  const overlay = document.getElementById("editModal");
  if (overlay) {
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) closeEditModal();
    });
  }

  // 编辑弹窗：科目变更 → 刷新能力模块
  document.querySelectorAll("#editSubjectGroup input").forEach(r => {
    r.addEventListener("change", function() {
      const subj = getRadioValue("editSubjectGroup");
      if (subj) populateChoiceGroup("editModuleGroup", getModuleOptions(subj), []);
    });
  });

  // 按作业唯一 id 查找，避免索引/前缀/排序错位导致打开错误条目
  async function getAssignmentById(id) {
    const cfg = await loadAppData();
    const allAssignments = getAllAssignments(cfg);
    const item = allAssignments.find(a => a.id === id) || null;
    return { item, cfg };
  }

  // 作业完成能量累加（客户端兜底，防止 API 瞬时不可用导致能量丢失）
  async function grantHomeworkCompletionXp(item, cfg) {
    // 已不再区分作业类型：作业完成统一 +1 XP
    const subject = item.subject || "其他";
    try {
      await window.DataStore.addXpRecord({
        taskName: "作业·" + (item.homeworkType || "假期作业"),
        description: `完成${subject}作业`,
        date: todayStr(),
        status: "verified",
        xp: 1,
        xpCategory: "学习成长",
        homeworkId: item.id,
      });
      return 1;
    } catch (err) {
      console.warn("作业能量发放失败:", err.message);
      return 0;
    }
  }

  // 委托点击编辑按钮 / 切换状态 / 切换提交（P5 增量DOM更新）
  document.addEventListener("click", async function(e) {
    // 切换完成状态
    const toggleBtn = e.target.closest("[data-toggle-status]");
    if (toggleBtn) {
      e.stopPropagation();
      const { item, cfg } = await getAssignmentById(toggleBtn.getAttribute("data-toggle-status"));
      if (!item || !item.id) return;

      // 状态机：
      //   pending(待完成) ──点勾──► done(已完成)         [发积分]  → wasIncomplete 保持
      //   done(已完成)    ──点勾──► pending(待完成)      [不发]
      //   expired(未完成完结) ──点圈──► done(已完成)      [不发积分，因 wasIncomplete=true]
      const wasExpired = item.status === "expired";
      const newDone = item.status !== "done";
      const newStatus = newDone ? "done" : "pending";
      // 同步更新 submitted 字段，确保勾选与提交状态一致
      const newSubmitted = newDone;
      // 标记过"未完成"的作业：改回完成时打上 wasIncomplete，后续不再自动奖励
      const payloadStatus = { status: newStatus, submitted: newSubmitted };
      if (newDone) payloadStatus.wasIncomplete = wasExpired || item.wasIncomplete === true ? true : false;
      let toggled = false;
      try {
        if (await isLocalMode()) {
          // 设置超时，避免 API 响应缓慢/卡住时界面无响应
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const resp = await fetch(`/api/homework/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadStatus),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          const result = await resp.json();
          if (result.ok) toggled = true;
        } else if (window.DataStore && window.DataStore.updateStudyRecord) {
          await window.DataStore.updateStudyRecord(item.id, payloadStatus);
          toggled = true;
        }
      } catch (apiErr) {
        console.warn("切换状态 API 失败，使用本地回退:", apiErr.message);
      }
      if (!toggled && window.DataStore && window.DataStore.updateStudyRecord) {
        try {
          await window.DataStore.updateStudyRecord(item.id, payloadStatus);
          toggled = true;
        } catch (dsErr) {
          console.warn("切换状态 DataStore 失败:", dsErr.message);
        }
      }
      if (!toggled) {
        await updateHomeworkLocally(item.id, payloadStatus);
      } else {
        if (window.DataStore && window.DataStore.updateStudyRecord) {
          await window.DataStore.updateStudyRecord(item.id, payloadStatus).catch(() => {});
        }
      }
      // ═══ 作业完成能量累加 ═══
      // 服务端可用时由 autoGrantHomeworkXp 发放；仅当本地回退（服务端未发放）时客户端兜底发放
      // 已标记过"未完成"(wasIncomplete 或曾 expired)的作业，改回完成时不再自动加默认积分
      if (newDone && !toggled && !payloadStatus.wasIncomplete) {
        await grantHomeworkCompletionXp(item, cfg);
      }
      // 刷新数据，让能量累加立即反映到首页/能量星球
      if (newDone && window.DataStore && window.DataStore.refreshData) {
        window.DataStore.refreshData(true).catch(() => {});
      }
      // 增量 DOM 更新（P5）— 同步更新提交按钮
      const rowEl = document.querySelector(`.hw-row[data-id="${item.id}"]`);
      if (rowEl) {
        rowEl.classList.toggle("hw-done", newDone);
        const checkBtn = rowEl.querySelector("[data-toggle-status]");
        if (checkBtn) {
          checkBtn.classList.toggle("checked", newDone);
          checkBtn.title = newDone ? "标记为待完成" : "标记为已完成";
        }
        // ★ 同步更新提交按钮：文字、图标、类名
        const submitBtn = rowEl.querySelector("[data-toggle-submit]");
        if (submitBtn) {
          submitBtn.classList.toggle("submitted", newDone);
          submitBtn.title = newDone ? "已提交" : "提交作业";
          // 更新文字节点（<i>图标</i>文字）
          const childNodes = submitBtn.childNodes;
          for (let i = childNodes.length - 1; i >= 0; i--) {
            if (childNodes[i].nodeType === Node.TEXT_NODE) {
              childNodes[i].textContent = newDone ? "已提交" : "提交";
              break;
            }
          }
          // 更新图标 data-lucide 属性（refreshIcons 会重新渲染 SVG）
          const icon = submitBtn.querySelector("i");
          if (icon) icon.setAttribute("data-lucide", newDone ? "check" : "send");
        }
      }
      updateStudyStatsDisplay(cfg);
      // 重新渲染能力雷达图（作业状态变化后数据同步更新）
      if (typeof renderAbilityRadar === "function") {
        const allAsm = getAllAssignments(cfg);
        const doneAsm = allAsm.filter(a => a.status === "done");
        const cfgModules = cfg.config?.abilityModules || null;
        const cfgSubjects = cfg.config?.subjects || null;
        renderAbilityRadar(doneAsm, undefined, cfgModules, cfgSubjects);
      }
      refreshIcons(50);
      showToast(newDone ? "✅ 已标记为完成" : "已改回待完成", newDone);
      return;
    }

    // 标记"未完成"：把待完成作业置为 expired(未完成完结)，wasIncomplete=true
    // 之后改回"已完成"都不会再自动发放默认积分
    const incompleteBtn = e.target.closest("[data-mark-incomplete]");
    if (incompleteBtn) {
      e.stopPropagation();
      const { item, cfg } = await getAssignmentById(incompleteBtn.getAttribute("data-mark-incomplete"));
      if (!item || !item.id) return;
      if (item.status === "done" || item.status === "expired") return;
      const payload = { status: "expired", submitted: false, wasIncomplete: true };
      let marked = false;
      try {
        if (await isLocalMode()) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const resp = await fetch(`/api/homework/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          const result = await resp.json();
          if (result.ok) marked = true;
        } else if (window.DataStore && window.DataStore.updateStudyRecord) {
          await window.DataStore.updateStudyRecord(item.id, payload);
          marked = true;
        }
      } catch (apiErr) {
        console.warn("标记未完成 API 失败，使用本地回退:", apiErr.message);
      }
      if (!marked && window.DataStore && window.DataStore.updateStudyRecord) {
        try { await window.DataStore.updateStudyRecord(item.id, payload); marked = true; }
        catch (dsErr) { console.warn("标记未完成 DataStore 失败:", dsErr.message); }
      }
      if (!marked) await updateHomeworkLocally(item.id, payload);
      else if (window.DataStore && window.DataStore.updateStudyRecord)
        await window.DataStore.updateStudyRecord(item.id, payload).catch(() => {});
      renderStudy();
      refreshIcons(50);
      showToast("已标记为未完成 · 归入已完结", true);
      return;
    }

    // 提交按钮 → 打开提交确认弹窗（在弹窗里选类型/模块/单元/测验后确认）
    const submitBtn = e.target.closest("[data-toggle-submit]");
    if (submitBtn) {
      e.stopPropagation();
      const { item } = await getAssignmentById(submitBtn.getAttribute("data-toggle-submit"));
      if (item && item.id && typeof openSubmitHomeworkModal === "function") {
        openSubmitHomeworkModal(item);
      }
      return;
    }

    // 编辑按钮 → 只改基础信息（内容/科目/截止日期）
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const { item } = await getAssignmentById(editBtn.getAttribute("data-edit"));
      if (item) openEditModal(item);
    }
  });
}

// ── 移动端侧边栏切换 (汉堡菜单) ──

function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  if (!sidebar) return;
  sidebar.classList.toggle("show");
  if (overlay) {
    overlay.classList.toggle("show");
  }
}

function closeSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  if (sidebar) sidebar.classList.remove("show");
  if (overlay) overlay.classList.remove("show");
}

function initSidebarToggle() {
  const hamburger = document.querySelector(".hamburger-btn");
  const overlay = document.querySelector(".sidebar-overlay");
  if (hamburger) {
    hamburger.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleSidebar();
    });
  }
  if (overlay) {
    overlay.addEventListener("click", closeSidebar);
  }
  // 点击侧边栏内的导航链接后自动关闭 (移动端)
  document.addEventListener("click", function(e) {
    const navLink = e.target.closest(".sidebar .nav a");
    if (navLink && window.innerWidth <= 920) {
      closeSidebar();
    }
  });
  // 屏幕尺寸变化到桌面端时关闭侧边栏展开状态（带防抖，避免高频触发）
  let __resizeTimer = null;
  window.addEventListener("resize", function() {
    if (__resizeTimer) clearTimeout(__resizeTimer);
    __resizeTimer = setTimeout(function() {
      if (window.innerWidth > 920) closeSidebar();
    }, 100);
  });
}

// ════════ 启动入口 ════════

async function boot(page) {
  window.__currentView = page;
  // ★ 自动版本检测：若线上有新版本代码，自动刷新加载最新版，避免用户一直用旧缓存。
  //   一屏一个页面，只做一次检查；本地模式(localhost)跳过，避免误触发。
  try {
    const isLocalHost = /^https?:/.test(location.href) && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
    if (!isLocalHost && !sessionStorage.getItem("__yaraVersionReloaded")) {
      const cur = window.__APP_VERSION__ || "";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await global.fetch("app-version.txt?ts=" + Date.now(), { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timer);
      if (res && res.ok) {
        const remote = (await res.text() || "").trim();
        if (remote && remote !== cur) {
          sessionStorage.setItem("__yaraVersionReloaded", "1");
          location.reload();
          return;
        }
      }
    }
  } catch (e) {
    // 版本探测失败不阻断启动（CDN 暂不可达等场景）
    console.warn("版本检测跳过:", e.message);
  }
  // 自动重连成功后，用最新数据重渲染当前视图
  if (!window.__dataRefreshBound) {
    window.__dataRefreshBound = true;
    // 统一数据变更监听：后台刷新完成后，直接用 cachedData 重绘当前视图
    // 注意：不在这里调用 refreshData()，避免触发新的 _backgroundRefresh() 导致无限循环
    window.addEventListener("yara-data-refreshed", async () => {
      // 如果用户正在切换页面，跳过重渲染避免卡顿
      if (window.__switchingView) return;
      const p = window.__currentView || "home";
      // 仅更新当前视图内容，不重建整个 sidebar（避免闪现）
      if (p === "home") { if (typeof renderHome === "function") await renderHome(); if (typeof renderSemesterBar === "function") renderSemesterBar(); }
      else if (p === "xp" && typeof renderXp === "function") await renderXp();
      else if (p === "study" && typeof renderStudy === "function") await renderStudy();
      else if (p === "money" && typeof renderMoney === "function") await renderMoney();
      // 更新视图缓存版本号，确保后续 switchView 不会重复渲染
      __viewRendered[p] = __dataVersion;
      refreshIcons(20);
    });
  }
  layoutShell(page);
  initSidebarToggle();
  // 设置当前视图高亮
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const vt = document.getElementById("view-" + page);
  if (vt) vt.classList.add("active");
  document.querySelectorAll(".bottom-tab-item").forEach(t => t.classList.toggle("active", t.dataset.page === page));
  document.body.setAttribute("data-view", page);
  try {
    if (page === "home") { await renderHome(); if (typeof renderSemesterBar === "function") renderSemesterBar(); }
    if (page === "xp") await renderXp();
    if (page === "study") await renderStudy();
    if (page === "money") await renderMoney();
    if (page === "settings") { if (typeof renderSettingsView === "function") renderSettingsView(); }
    __viewRendered[page] = __dataVersion;
  } catch (e) {
    console.error("渲染失败:", e);
  }
  // 数据加载完成后，刷新侧边栏（确保姓名/年龄显示正确）
  // 合并到第一次 layoutShell 调用（上面已调用），不再重复执行
  if (!window.__editModalInit) {
    window.__editModalInit = true;
    initEditModal();
    initAddHomeworkModal();
    if (typeof initSubmitHomeworkModal === "function") initSubmitHomeworkModal();
    if (typeof initScoreEvalModals === "function") initScoreEvalModals();
    // ★ 科目初始化：把「系统科目表」渲染进成绩/作业/编辑的科目选择器。
    //   必须主动调用（不依赖 initDataEntry），否则成绩弹窗科目永远停在内置默认1门。
    if (typeof deLoadAbilityModules === "function") deLoadAbilityModules();
  }
  // 每周五自动发放零花钱（+18 到自由基金），启动时检查一次
  checkAndAddWeeklyAllowance();
  // ★ 预热写入 SHA 缓存：后台把常用待写文件的 blob SHA 取好缓存，
  //   让用户第一次保存作业等也直接走 1 次 PUT 快速路径（不再多等一次 GET 往返）
  warmWriteShaCache();
  if (window.lucide) refreshIcons(20);
  // 隐藏启动加载动画
  const loader = document.getElementById("bootLoader");
  if (loader) loader.classList.add("hidden");
  // 首次加载完成后，后台静默拉取 GitHub 最新数据（只执行一次）
  setTimeout(() => _backgroundRefresh(), 300);
}



  


/* ===== Script block 8 (original lines 8485-8485) ===== */

// 预热常用待写文件的 blob SHA 到 DR 的缓存，让首次保存也直连 1 次 PUT（后台执行，不阻塞界面）
function warmWriteShaCache() {
  try {
    const dataRelations = window.DataRelations || null;
    if (!dataRelations || typeof dataRelations.prefetchWritePath !== "function") return;
    // 家里各模块常写的文件；并行预热，任一失败静默忽略
    const writable = ["study.json", "xpRecords.json", "finance.json", "diaryEntries.json", "familyMeetings.json", "levels.json"];
    writable.forEach(function (f) {
      try { dataRelations.prefetchWritePath(f).catch(function () {}); } catch (e) {}
    });
  } catch (e) {}
}

/* ════════ 单页应用：视图切换 (SPA) ════════ */

// ── 等级详情页 · 成长阶梯渲染 ──
// 根据权益名称为其分配一个直观的 emoji 图标
function privEmoji(name) {
  const s = String(name || "");
  if (s.includes("零花钱") || s.includes("基金") || s.includes("财富")) return "💰";
  if (s.includes("时间")) return "⏰";
  if (s.includes("猫")) return "🐱";
  if (s.includes("礼包") || s.includes("大礼包") || s.includes("文具")) return "🎁";
  if (s.includes("愿望")) return "🎂";
  if (s.includes("零食")) return "🍬";
  if (s.includes("待定")) return "🔜";
  return "🎖️";
}
async function renderLevelLadder() {
  const cfg = await loadAppData();
  const xp = getLevelProgress(cfg);
  const levels = cfg.levels || [];
  const currentIdx = levels.findIndex(l => l.name === xp.currentLevel?.name) || 0;
  const totalLevels = levels.length;

  // 标题
  setText("levelSubtitle", `${xp.currentLevel?.name || "--"} · 第 ${currentIdx + 1} 级 / 共 ${totalLevels} 级`);

  // 顶部英雄区
  const child = cfg.child || {};
  setText("levelHmName", `${child.name || "Yara"} · ${xp.currentLevel?.name || "萌新"}`);
  const nextGap = Math.max(0, (xp.nextLevel?.xp || xp.current) - xp.current);
  setText("levelHmMeta", `本学期 +${xp.current} XP · 距${xp.nextLevel?.name || "下一级"}还差 ${nextGap} XP`);
  setText("levelProgressLabel", `本等级进度 ${Math.round(xp.progress)}%`);
  setText("levelXpCount", `${xp.current} / ${xp.nextLevel?.xp || xp.current}`);
  const fillEl = document.getElementById("levelXpFill");
  if (fillEl) fillEl.style.width = xp.progress + "%";

  // 当前等级标签（levelNum 可能已含 "Lv." 前缀，避免重复）
  const curLvNum = String(xp.currentLevel?.levelNum || (currentIdx + 1)).replace(/^Lv\.?\s*/i, "");
  setText("levelCurrentLabel", `当前 ${xp.currentLevel?.name || "--"} · Lv.${curLvNum}`);

  // 成长阶梯
  const ladderEl = document.getElementById("levelLadder");
  if (!ladderEl) return;
  const showCount = Math.min(totalLevels, 7);
  const ladderHtml = [];
  for (let i = 0; i < showCount; i++) {
    const lv = levels[i];
    if (!lv) continue;
    const isDone = i < currentIdx;
    const isCur = i === currentIdx;
    const isNext = i === currentIdx + 1;
    const isFut = i > currentIdx + 1;
    const cls = isDone ? "lad-done" : isCur ? "lad-cur" : isNext ? "lad-next" : "lad-fut";
    const tagText = isDone ? "已达成" : isCur ? `当前 · ${Math.round(xp.progress)}%` : isNext ? "下一级" : `🔒 还差 ${Math.max(0, lv.xp - xp.current)} XP`;
    // 具体权益列表（图标 + 名称），让用户直接看到每级能享受什么
    const privs = lv.privileges || [];
    let privHtml = "";
    if (privs.length > 0) {
      privHtml = privs.map(p => {
        const isObj = typeof p === "object" && p !== null;
        const pName = isObj ? (p.name || "") : String(p);
        if (!pName) return "";
        return `<div class="lp-item ${isFut ? "lp-lock" : ""}"><span class="lp-emoji">${privEmoji(pName)}</span><span class="lp-txt">${pName}</span></div>`;
      }).join("");
    } else {
      privHtml = isDone
        ? `<div class="lp-item"><span class="lp-txt lp-empty">✔ 基础功能已开启</span></div>`
        : `<div class="lp-item"><span class="lp-txt lp-empty">暂无权益</span></div>`;
    }
    const barHtml = isCur ? `<div class="lad-bar"><i style="width:${xp.progress}%"></i></div>` : "";
    ladderHtml.push(`<div class="lad ${cls}">
      <div class="lad-no">${isDone ? "✓" : (i + 1)}</div>
      <div class="lad-main">
        <div class="lad-title"><span class="lad-name">${lv.name || "等级" + (i + 1)}</span><span class="lad-xp">Lv.${i + 1} · ${lv.xp || 0} XP 解锁</span></div>
        ${barHtml}
        <div class="lad-privs">${privHtml}</div>
      </div>
      <span class="lad-tag">${tagText}</span>
    </div>`);
  }
  if (totalLevels > showCount) {
    ladderHtml.push(`<div class="lad-more">··· 共 ${totalLevels} 级 · 往后的 ${totalLevels - showCount} 级等解锁后浮现</div>`);
  }
  ladderEl.innerHTML = ladderHtml.join("");
  refreshIcons();
}

async function switchView(page) {
  // 上次切换仍在进行中则记录最后一次点击，切换完成后自动跳转，避免丢失点击
  if (window.__switchingView) {
    window.__pendingView = page;
    return;
  }
  window.__switchingView = true;
  window.__pendingView = null;
  try {
    // 0. 每次切换先回到页面顶部，避免停留在上一页的滚动位置
    window.scrollTo({ top: 0, behavior: "auto" });
    const scroller = document.querySelector(".main") || document.querySelector(".wrap");
    if (scroller) scroller.scrollTop = 0;
    // 1. 隐藏所有视图，显示目标视图
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById("view-" + page);
    if (target) target.classList.add("active");
    // 2. 更新侧边栏菜单 active 高亮（含 nav-foot 的系统设置）
    document.querySelectorAll("[data-sidebar] .nav a, [data-sidebar] .nav-foot a").forEach(a => a.classList.toggle("active", a.getAttribute("data-page") === page));
    // 3. 更新底部 tab 栏 active 高亮
    document.querySelectorAll(".bottom-tab-item").forEach(t => t.classList.toggle("active", t.getAttribute("data-page") === page));
    document.body.setAttribute("data-view", page);
    // 4. 视图缓存：只有数据版本有变化时才重新渲染，避免重复全量渲染
    if (__viewRendered[page] !== __dataVersion) {
      if (page === "home") { await renderHome(); if (typeof renderSemesterBar === "function") renderSemesterBar(); }
      else if (page === "xp") await renderXp();
      else if (page === "study") await renderStudy();
      else if (page === "money") await renderMoney();
      else if (page === "level") { renderLevelLadder(); }
      else if (page === "settings") { if (typeof renderSettingsView === "function") renderSettingsView(); }
      __viewRendered[page] = __dataVersion;
    }
    // 5. 移动端关闭侧边栏
    closeSidebar();
    // 6. 刷新 lucide 图标（延迟短一点，感受更跟手）
    if (window.lucide) refreshIcons(20);
  } finally {
    window.__switchingView = false;
    // 切换完成后，如果有排队请求，立即跳转
    if (window.__pendingView) {
      const p = window.__pendingView;
      window.__pendingView = null;
      switchView(p);
    }
  }
}

// 每周五自动发放零花钱 +18（存入财富基金）：系统自动加进去，当天仅一次
async function checkAndAddWeeklyAllowance() {
  try {
    const today = new Date();
    if (today.getDay() !== 5) return; // 仅每周五
    const dateStr = todayStr();
    const cfg = window.__lastData || (cachedData || await loadAppData());
    const finance = cfg.finance || { recentTransactions: [] };
    const already = (finance.recentTransactions || []).some(t =>
      t.type === "income" && t.description === "每周零花钱" && getDateStr(t) === dateStr
    );
    if (already) return; // 当天已发放，避免重复
    await addFinanceRecord({
      date: dateStr, type: "income", amount: 18, account: "free",
      category: "零花钱", description: "每周零花钱", worthIt: "值得",
      reason: "系统每周五自动发放零花钱",
    });
    // 财务进账（仅记录动作，不关联 XP）
  } catch (e) {
    console.warn("零花钱自动发放失败:", e);
  }
}

// 启动：渲染首页（支持 ?view=xxx 从其他页面指定进入某个星球）
// 禁用浏览器滚动恢复，确保每次进入都从顶部开始
if (history && history.scrollRestoration) {
  history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);
const __urlView = new URLSearchParams(location.search).get("view");
boot(["home", "xp", "study", "money", "settings"].includes(__urlView) ? __urlView : "home");
  
