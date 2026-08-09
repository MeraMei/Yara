/**
 * data-store.js — Yara 成长工作台 · GitHub 数据存储层
 *
 * 从 GitHub 仓库读取 JSON 数据文件，处理后返回与 server.js buildDashboard()
 * 完全一致的 dashboard 对象。可通过 GitHub REST API 写回数据。
 *
 * 仓库: meramei/Yara
 * 数据文件路径: data/*.json
 * Token 存储: localStorage['github_token']
 *
 * 用法:
 *   const store = new DataStore();
 *   await store.load();         // 加载所有数据
 *   const data = store.data;    // 获取 dashboard 数据
 *   await store.saveXpRecords(newRecords); // 写回 XP 记录
 */

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // 常量（与 server.js 完全一致）
  // ═══════════════════════════════════════════════════════════════

  var GITHUB_OWNER = 'meramei';
  var GITHUB_REPO = 'Yara';
  var GITHUB_BRANCH = 'main';
  var GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' + GITHUB_BRANCH;
  var GITHUB_API_BASE = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO;

  // 等级对应的徽章颜色
  var LEVEL_BADGES = [
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

  // 默认模块关键词映射
  var MODULE_KEYWORDS = {
    '语文': {
      '拼音': ['拼音', '拼读', '音节'],
      '汉字': ['汉字', '生字', '写字', '练字'],
      '组词': ['组词', '造句', '词语'],
      '阅读': ['阅读', '朗读', '背诵', '默写'],
      '作文': ['作文', '写作', '日记', '小作文'],
    },
    '数学': {
      '概念': ['概念', '定义', '认识', '理解'],
      '公式定理': ['公式', '定理', '定律', '性质'],
      '计算': ['计算', '口算', '笔算', '竖式', '脱式'],
      '推理': ['推理', '应用题', '解决问题', '思考题'],
      '直觉': ['估算', '数感', '直觉', '巧算', '思维'],
    },
    '英语': {
      '听说': ['听', '说', '朗读', '跟读', '听力', '对话', '口语'],
      '单词': ['单词', '词汇', '默写', '听写', '拼写', '抄写'],
      '语感': ['语感', '句型', '语法', '时态', '句子'],
      '阅读': ['阅读', '短文', '绘本', '故事', '阅读理解'],
      '写作': ['写作', '作文', '写话', '句子', '小作文'],
    },
  };

  // 中文数字 -> 序号映射
  var GRADE_CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

  // 等级排序权重
  var GRADE_WEIGHT = { 'A+': 12, 'A': 11, 'B+': 10, 'B': 9, 'C+': 8, 'C': 7, 'D+': 6, 'D': 5 };

  // 作业类型 -> 默认 XP
  var DEFAULT_HOMEWORK_XP = {
    '日常作业': 5, '暑假作业': 10, '假期作业': 10, '家庭作业': 5, '阅读作业': 5, '练习作业': 5,
  };

  // ═══════════════════════════════════════════════════════════════
  // Helper 函数（与 server.js 完全一致）
  // ═══════════════════════════════════════════════════════════════

  // 关联记录名称解析：兼容 关联记录 [{id:"rec_xxx"}]、[{id,text}]、纯文本字符串
  // linkVal 可能来自多选数组或单选字段，返回单个名称（单选）/首名称（多选）
  function resolveLinkName(linkVal, idToName) {
    if (linkVal === null || linkVal === undefined) return '';
    var arr = Array.isArray(linkVal) ? linkVal : [linkVal];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (item === null || item === undefined) continue;
      if (typeof item === 'object') {
        var name = (item.id && idToName[item.id]) || item.text || '';
        if (name) return name;
      } else {
        return String(item);
      }
    }
    return '';
  }

  // 关联记录多选字段 -> 名称数组（兼容纯文本数组）
  function resolveLinkNamesArr(linkVal, idToName) {
    if (!linkVal) return [];
    var arr = Array.isArray(linkVal) ? linkVal : [linkVal];
    var names = [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (item === null || item === undefined) continue;
      if (typeof item === 'object') {
        var name = (item.id && idToName[item.id]) || item.text || '';
        if (name) names.push(name);
      } else {
        var s = String(item);
        var idx = s.indexOf('-');
        names.push(idx > 0 ? s.slice(idx + 1) : s);
      }
    }
    return names.filter(Boolean);
  }

  // 解析权益明细：支持 "名称|描述" 或 "图标|名称|描述" 格式，每行一个
  function parsePrivilegeDetails(text, unlocked) {
    if (!text) return [];
    var lines = text.split(/[\n\r]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return lines.map(function (line, idx) {
      var parts = line.split('|').map(function (s) { return s.trim(); });
      if (parts.length >= 3) {
        return { icon: parts[0], name: parts[1], description: parts[2], unlocked: unlocked, id: 'priv_' + idx };
      } else if (parts.length === 2) {
        return { icon: 'star', name: parts[0], description: parts[1], unlocked: unlocked, id: 'priv_' + idx };
      } else {
        return { icon: 'gift', name: line, description: '', unlocked: unlocked, id: 'priv_' + idx };
      }
    });
  }

  // 从 "科目-模块" 格式中提取纯模块名（去掉科目前缀）
  function extractModuleNames(value) {
    if (!value) return [];
    var arr;
    if (Array.isArray(value)) {
      arr = value;
    } else {
      arr = String(value).split(/[,，;；\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return arr.map(function (v) {
      if (typeof v === 'object' && v !== null && v.text) {
        return v.text;
      }
      var s = String(v);
      var idx = s.indexOf('-');
      return idx > 0 ? s.slice(idx + 1) : s;
    }).filter(Boolean);
  }

  // 解析成绩记录
  function parseScoreRecord(r, subjectIdToName) {
    var subject = resolveLinkName(r['科目'], subjectIdToName) || '未知';
    var grade = r['等级'] || '';
    var dateVal = r['考试日期'] || '';
    var gradeSemester = r['年级'] || '';
    var examType = r['考试类型'] || '考试';

    var parsed = parseSemesterLabel(gradeSemester, dateVal);
    var year = parsed.year, semester = parsed.semester, semesterLabel = parsed.semesterLabel;

    var errorModules = extractModuleNames(r['错误模块']);

    return {
      id: r.record_id,
      subject: subject,
      grade: grade,
      examType: examType,
      date: dateVal ? String(dateVal).slice(0, 10) : '',
      year: year,
      semester: semester,
      semesterLabel: semesterLabel || gradeSemester,
      errorModule: errorModules.join('、'),
      errorModules: errorModules,
      description: r['说明'] || '',
    };
  }

  // 学期标识解析工具：从 "三年级(下)" 解析出 year, semester, semesterLabel
  function parseSemesterLabel(label, dateVal, childBirthday) {
    var cnNums = ['一', '二', '三', '四', '五', '六'];
    var year = '', semester = '', semesterLabel = '';
    if (label) {
      semesterLabel = label;
      var match = String(label).match(/([一二三四五六七八九十]+)年级[（(]?([上下])[）)]?学期?/);
      if (match) {
        var gradeNum = cnNums.indexOf(match[1]) + 1;
        var birthYear = childBirthday ? parseInt(childBirthday.slice(0, 4)) : 2016;
        var firstGradeYear = birthYear + 7;
        var startYear = firstGradeYear + gradeNum - 1;
        year = startYear + '-' + (startYear + 1);
        semester = match[2] === '上' ? '第一学期' : '第二学期';
      }
    } else if (dateVal) {
      var d = new Date(dateVal);
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      if (m >= 9) { year = y + '-' + (y + 1); semester = '第一学期'; }
      else { year = (y - 1) + '-' + y; semester = '第二学期'; }
    }
    return { year: year, semester: semester, semesterLabel: semesterLabel };
  }

  // 从学期标签获取排序值
  function semesterSortValue(label, semester) {
    var m = String(label).match(/([一二三四五六七八九十]+)年级[（(]?([上下]?)[）)]?/);
    var gradeNum = m ? (GRADE_CN[m[1]] || 0) : 0;
    var term = m && m[2] ? (m[2] === '下' ? 2 : 1) : 0;
    if (semester === '第二学期') term = 2;
    else if (semester === '第一学期') term = 1;
    return { gradeNum: gradeNum, term: term };
  }

  // 清洗标题
  function cleanTitle(title, subject) {
    if (!title) return '';
    var t = String(title).replace(/^\d{2}-\d{2}[^：]*[：:]\s*/, '')
      .replace(/^\d+[\.、．]\s*/, '')
      .replace(/^第[一二三四五六七八九十]+[、．]\s*/, '')
      .trim();
    if (subject) {
      t = t.replace(new RegExp('^' + subject + '[：:]\\s*'), '')
        .replace(new RegExp('^「' + subject + '」\\s*[：:]\\s*'), '')
        .trim();
    }
    return t;
  }

  // 解析详情
  function parseDetails(text) {
    if (!text) return [];
    var details = [];
    var m1 = text.match(/第[一二三四五六七八九十][、.,，\s]+[^第]+/g);
    if (m1 && m1.length >= 2) {
      var nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      m1.forEach(function (part, i) {
        var clean = part.replace(/^第[一二三四五六七八九十][、.,，\s]+/, '').trim();
        if (clean) details.push({ num: '第' + nums[i] + '项', text: clean });
      });
      return details;
    }
    var regex2 = /(?:^|\n)\s*(\d+)[\.、．)\s]+([^\n]+)/g;
    var match;
    while ((match = regex2.exec(text)) !== null) {
      details.push({ num: match[1], text: match[2].trim() });
    }
    return details;
  }

  // 计算距离天数
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  }

  // 推断模块
  function inferModule(subject, title, description) {
    if (!subject || !MODULE_KEYWORDS[subject]) return '';
    var text = ((title || '') + ' ' + (description || '')).toLowerCase();
    var keywords = MODULE_KEYWORDS[subject];
    for (var moduleName in keywords) {
      if (Object.prototype.hasOwnProperty.call(keywords, moduleName)) {
        var words = keywords[moduleName];
        for (var w = 0; w < words.length; w++) {
          if (text.indexOf(words[w]) >= 0) return moduleName;
        }
      }
    }
    var defaults = { '语文': '阅读', '数学': '计算', '英语': '单词' };
    return defaults[subject] || '';
  }

  // 生成学习建议
  function generateSuggestions(subject, moduleStats, weakModules, latestScore) {
    var suggestions = [];
    if (weakModules.length > 0) {
      var names = weakModules.map(function (m) { return m.module; }).join('、');
      suggestions.push(subject + '的' + names + '模块需要加强，建议针对性练习。');
    }
    var lowPractice = moduleStats.filter(function (m) { return m.practiceCount === 0; });
    if (lowPractice.length > 0) {
      suggestions.push(lowPractice.map(function (m) { return m.module; }).join('、') + '模块练习较少，可以适当安排。');
    }
    if (latestScore && latestScore.grade) {
      var g = latestScore.grade;
      if (g === 'A+' || g === 'A') suggestions.push(subject + '最近成绩优秀，继续保持。');
      else if (g === 'B+' || g === 'B') suggestions.push(subject + '成绩良好，注意查漏补缺。');
      else suggestions.push(subject + '最近成绩有提升空间，建议复习错题。');
    }
    if (suggestions.length === 0) suggestions.push(subject + '整体表现稳定，继续保持练习。');
    return suggestions.slice(0, 3);
  }

  // ═══════════════════════════════════════════════════════════════
  // DataStore 类
  // ═══════════════════════════════════════════════════════════════

  function DataStore() {
    this.data = null;
    this._rawData = {};
    this._loadPromise = null;
  }

  // ── GitHub API 层 ──

  DataStore.prototype._getToken = function () {
    try {
      return localStorage.getItem('github_token') || '';
    } catch (e) {
      return '';
    }
  };

  DataStore.prototype._hasToken = function () {
    return !!this._getToken();
  };

  // 从 GitHub raw 读取 JSON 文件
  DataStore.prototype._fetchRawJSON = function (filename) {
    var url = GITHUB_RAW_BASE + '/data/' + filename;
    return fetch(url, { cache: 'no-cache' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText + ' for ' + url);
        return resp.json();
      });
  };

  // 通过 GitHub REST API 获取文件的 SHA（用于更新）
  DataStore.prototype._getFileSHA = function (path) {
    var token = this._getToken();
    return fetch(GITHUB_API_BASE + '/contents/' + path, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
      },
    })
      .then(function (resp) {
        if (!resp.ok) {
          if (resp.status === 404) return null;
          throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        }
        return resp.json();
      })
      .then(function (data) {
        return data && data.sha ? data.sha : null;
      });
  };

  // 通过 GitHub REST API 写入 JSON 文件
  DataStore.prototype._writeFile = function (path, content, message) {
    var token = this._getToken();
    if (!token) {
      return Promise.reject(new Error('请先设置 GitHub Token'));
    }
    var self = this;
    return self._getFileSHA(path).then(function (sha) {
      var body = {
        message: message || '更新数据: ' + path,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        branch: GITHUB_BRANCH,
      };
      if (sha) body.sha = sha;

      return fetch(GITHUB_API_BASE + '/contents/' + path, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.json().then(function (err) {
            throw new Error(err.message || 'GitHub API 错误: ' + resp.status);
          });
        }
        return resp.json();
      });
  };

  // ── 数据加载 ──

  // 加载所有数据文件，返回完整的 dashboard 数据结构
  DataStore.prototype.load = function () {
    var self = this;
    if (self._loadPromise) return self._loadPromise;
    if (self.data) return Promise.resolve(self.data);

    self._loadPromise = self._loadAll().then(function (dashboardData) {
      self.data = dashboardData;
      self._loadPromise = null;
      return dashboardData;
    }).catch(function (err) {
      self._loadPromise = null;
      throw err;
    });

    return self._loadPromise;
  };

  DataStore.prototype._loadAll = function () {
    var self = this;

    // 并行加载所有数据文件
    return Promise.all([
      self._fetchRawJSON('child.json').catch(function () { return null; }),
      self._fetchRawJSON('calendar.json').catch(function () { return []; }),
      self._fetchRawJSON('levels.json').catch(function () { return []; }),
      self._fetchRawJSON('xpRecords.json').catch(function () { return []; }),
      self._fetchRawJSON('finance.json').catch(function () { return null; }),
      self._fetchRawJSON('study.json').catch(function () { return null; }),
      self._fetchRawJSON('config.json').catch(function () { return null; }),
      self._fetchRawJSON('xpSources.json').catch(function () { return []; }),
      self._fetchRawJSON('redeemRecords.json').catch(function () { return []; }),
    ]).then(function (results) {
      var child = results[0] || {};
      var calendar = results[1] || [];
      var levels = results[2] || [];
      var xpRecords = results[3] || [];
      var finance = results[4] || null;
      var study = results[5] || null;
      var config = results[6] || null;
      var xpSources = results[7] || [];
      var redeemRecords = results[8] || [];

      // 保存原始数据
      self._rawData = {
        child: child,
        calendar: calendar,
        levels: levels,
        xpRecords: xpRecords,
        finance: finance,
        study: study,
        config: config,
        xpSources: xpSources,
        redeemRecords: redeemRecords,
      };

      return self._buildDashboard(
        child, calendar, levels, xpRecords, finance, study, config, xpSources, redeemRecords
      );
    });
  };

  // ── buildDashboard — 完整的数据聚合逻辑（与 server.js buildDashboard 一致） ──

  DataStore.prototype._buildDashboard = function (
    child, calendar, levels, xpRecords, finance, study, config, xpSources, redeemRecords
  ) {
    var self = this;

    // 计算总 XP（使用已通过记录的 XP 分值）
    var verifiedXp = xpRecords.filter(function (r) { return r.reviewStatus === '已通过'; });
    var totalXP = verifiedXp.reduce(function (sum, r) { return sum + (Number(r.xp) || 0); }, 0);
    var pendingCount = xpRecords.filter(function (r) { return r.reviewStatus === '待确认' && r._hasValidName !== false; }).length;

    // 等级处理
    var processedLevels = self._processLevels(levels, totalXP, xpSources);

    // 计算当前等级
    var currentLevelIndex = 0;
    for (var i = processedLevels.length - 1; i >= 0; i--) {
      if (totalXP >= processedLevels[i].xp) {
        currentLevelIndex = i;
        break;
      }
    }
    var currentLevel = processedLevels[currentLevelIndex] || processedLevels[0];
    var nextLevel = processedLevels[currentLevelIndex + 1] || null;
    var xpToNextLevel = nextLevel ? nextLevel.xp - totalXP : 0;
    var levelProgress = nextLevel
      ? Math.min(100, Math.round(((totalXP - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100))
      : 100;

    // 处理 xp 记录
    var processedXpRecords = self._processXpRecords(xpRecords);

    // 处理学习数据
    var processedStudy = self._processStudy(study, child);

    // 处理财务数据
    var processedFinance = self._processFinance(finance);

    // 处理配置数据
    var processedConfig = self._processConfig(config);

    // 处理 xpSources
    var processedXpSources = self._processXpSources(xpSources);

    return {
      child: child,
      calendar: calendar,
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
      xpSources: processedXpSources,
      xpRecords: processedXpRecords,
      recentRecords: processedXpRecords.filter(function (r) { return r._hasValidName !== false; }).map(function (r) {
        return {
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
        };
      }),
      study: processedStudy,
      finance: processedFinance,
      config: processedConfig,
    };
  };

  DataStore.prototype._processLevels = function (levels, totalXP, xpSources) {
    if (!levels || !Array.isArray(levels)) return [];

    return levels.map(function (r, i) {
      var badge = LEVEL_BADGES[i] || LEVEL_BADGES[LEVEL_BADGES.length - 1];
      var isUnlocked = totalXP >= (r.xp || 0);
      var privs = (r.privileges || []).map(function (p) {
        return {
          icon: p.icon || 'gift',
          name: p.name || '',
          description: p.description || '',
          unlocked: isUnlocked,
          id: p.id || 'priv_' + (Math.random() * 10000 | 0),
          redeemed: !!p.redeemed,
          redeemedAt: p.redeemedAt || '',
          redeemedDate: p.redeemedDate || '',
        };
      });
      return {
        id: r.id || 'level_' + i,
        name: r.name || '',
        levelNum: r.levelNum || 'Lv.' + (i + 1),
        level: r.level || (i + 1),
        xp: r.xp || 0,
        badgeClass: badge.badgeClass,
        themeColor: badge.themeColor,
        privileges: privs,
        privilegeCount: privs.length,
        description: r.description || '',
      };
    });
  };

  DataStore.prototype._processXpRecords = function (xpRecords) {
    if (!xpRecords || !Array.isArray(xpRecords)) return [];
    return xpRecords.map(function (r) {
      return {
        id: r.id || r.record_id || '',
        domain: 'XP',
        type: 'XP获得',
        title: r.title || '成长积分',
        taskName: r.taskName || '',
        taskCategory: r.taskCategory || '',
        date: r.date || '',
        datetime: r.datetime || r.date || '',
        xp: Number(r.xp) || 0,
        xpCategory: r.xpCategory || r.taskCategory || '',
        reviewStatus: r.reviewStatus || '待确认',
        returnReason: r.returnReason || '',
        description: r.description || '',
        _hasValidName: r._hasValidName !== false,
      };
    });
  };

  DataStore.prototype._processStudy = function (study, child) {
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

    var subjects = study.subjects || [];
    var homework = study.homework || { total: 0, done: 0, todayTotal: 0, todayDone: 0 };
    var recentAssignments = study.recentAssignments || [];
    var allHomework = study.allHomework || [];
    var examRecords = study.examRecords || [];
    var evaluations = study.evaluations || [];
    var strengthsAnalysis = study.strengthsAnalysis || {};
    var semesterAnalysis = study.semesterAnalysis || { semesters: [], overallSummary: '' };

    // 如果 examRecords 为空，从 subjects 中提取期末记录
    if (examRecords.length === 0) {
      for (var si = 0; si < subjects.length; si++) {
        var subj = subjects[si];
        if (subj.examType === '期末' || !subj.examType) {
          examRecords.push({
            id: subj.name + '_latest',
            subject: subj.name,
            grade: subj.grade,
            examType: subj.examType || '期末',
            date: subj.date,
            year: '',
            semester: '',
            semesterLabel: '',
            errorModule: (subj.errorModules || []).join('、'),
            errorModules: subj.errorModules || [],
            description: '',
          });
        }
      }
    }

    // 如果 semesterAnalysis 为空，尝试生成
    if (!semesterAnalysis.semesters || semesterAnalysis.semesters.length === 0) {
      semesterAnalysis = this._generateSemesterAnalysis(examRecords, evaluations, child);
    }

    return {
      subjects: subjects,
      homework: homework,
      recentAssignments: recentAssignments,
      allHomework: allHomework,
      examRecords: examRecords,
      evaluations: evaluations,
      strengthsAnalysis: strengthsAnalysis,
      semesterAnalysis: semesterAnalysis,
    };
  };

  DataStore.prototype._generateSemesterAnalysis = function (examRecs, evalRecs, child) {
    var bySem = {};
    var self = this;

    examRecs.forEach(function (r) {
      if (!r.semesterLabel) return;
      var k = (r.year && r.semester) ? (r.year + '|' + r.semester) : r.semesterLabel;
      if (!bySem[k]) {
        bySem[k] = {
          year: r.year, semester: r.semester, semesterLabel: r.semesterLabel,
          date: r.date, records: [], gradeMap: {},
        };
      }
      bySem[k].records.push(r);
      bySem[k].gradeMap[r.subject] = r.grade;
      if (r.date > bySem[k].date) bySem[k].date = r.date;
    });

    var semList = Object.keys(bySem).map(function (k) { return bySem[k]; }).sort(function (a, b) {
      var oa = semesterSortValue(a.semesterLabel, a.semester);
      var ob = semesterSortValue(b.semesterLabel, b.semester);
      if (oa.gradeNum !== ob.gradeNum) return oa.gradeNum - ob.gradeNum;
      if (oa.term !== ob.term) return oa.term - ob.term;
      return String(a.semesterLabel).localeCompare(String(b.semesterLabel));
    });

    var analysis = semList.map(function (sem, idx) {
      var prev = idx > 0 ? semList[idx - 1] : null;
      var counts = {};
      sem.records.forEach(function (r) { counts[r.grade] = (counts[r.grade] || 0) + 1; });
      var total = sem.records.length;

      var mainSubjects = ['语文', '数学', '英语', '科学'];
      var mainGrades = sem.records.filter(function (r) { return mainSubjects.indexOf(r.subject) >= 0; })
        .map(function (r) { return { subject: r.subject, grade: r.grade }; });

      var avgScore = sem.records.reduce(function (s, r) { return s + (GRADE_WEIGHT[r.grade] || 0); }, 0) / (total || 1);

      var progress = [], regress = [], highlights = [];

      if (prev) {
        sem.records.forEach(function (r) {
          var prevGrade = prev.gradeMap[r.subject];
          if (!prevGrade) return;
          var diff = (GRADE_WEIGHT[r.grade] || 0) - (GRADE_WEIGHT[prevGrade] || 0);
          if (diff > 0) progress.push({ subject: r.subject, from: prevGrade, to: r.grade });
          else if (diff < 0) regress.push({ subject: r.subject, from: prevGrade, to: r.grade });
        });
      }

      var aPlusSubjects = sem.records.filter(function (r) { return r.grade === 'A+'; }).map(function (r) { return r.subject; });
      if (aPlusSubjects.length > 0) {
        highlights.push(aPlusSubjects.join('、') + ' 获得 A+，表现突出');
      }

      var encouragement = '';
      if (idx === 0) {
        encouragement = '一年级的第一个学期，你已经迈出了小学学习的第一步。' + (aPlusSubjects.length > 0 ? aPlusSubjects.join('、') + ' 拿到了 A+，' : '') + '这是很棒的起点！继续保持好奇心，每一步都算数。';
      } else if (progress.length >= 3) {
        encouragement = '这个学期你进步了' + progress.length + '科！' + progress.slice(0, 3).map(function (p) { return p.subject + '从' + p.from + '升到' + p.to; }).join('、') + '。看到你的努力一点点开花结果，真为你高兴。继续加油，你比自己想象的更厉害！';
      } else if (regress.length >= 2) {
        encouragement = '这个学期有些科目遇到了小挑战，别担心，这是成长路上的正常起伏。' + regress.map(function (r) { return r.subject; }).join('、') + ' 暂时落后了一点，我们一起找找原因，慢慢来，下一次一定可以追上来的！';
      } else if (aPlusSubjects.length >= 5) {
        encouragement = '太棒了！这个学期有' + aPlusSubjects.length + '科拿到 A+，你是怎么做到的？保持这份认真和专注，你会越来越棒的！';
      } else {
        encouragement = '这学期你稳稳地往前走，' + mainGrades.map(function (g) { return g.subject + g.grade; }).join('、') + '。每一份努力都不会白费，继续加油哦！';
      }

      var evaluation = evalRecs.find(function (e) {
        return (e.semesterLabel && e.semesterLabel === sem.semesterLabel) ||
          (e.year === sem.year && e.semester === sem.semester);
      });

      return {
        semesterKey: sem.year + '|' + sem.semester,
        semesterLabel: sem.semesterLabel,
        year: sem.year,
        semester: sem.semester,
        date: sem.date,
        subjectCount: total,
        gradeDistribution: counts,
        mainSubjects: mainGrades,
        aPlusSubjects: aPlusSubjects,
        progress: progress,
        regress: regress,
        highlights: highlights,
        encouragement: encouragement,
        evaluation: evaluation || null,
        avgScore: Math.round(avgScore * 10) / 10,
      };
    });

    var latest = analysis[analysis.length - 1];
    var overallSummary = '';
    if (latest) {
      if (latest.progress.length > 0) {
        overallSummary = '相比上学期，' + latest.progress.map(function (p) { return p.subject; }).join('、') + ' 有进步。';
      }
      if (latest.regress.length > 0) {
        overallSummary += latest.regress.map(function (r) { return r.subject; }).join('、') + ' 需要多关注。';
      }
      if (!overallSummary) {
        overallSummary = '本学期 ' + latest.aPlusSubjects.length + '/' + latest.subjectCount + ' 科获得 A 及以上，整体表现稳定。';
      }
    }

    return { semesters: analysis.reverse(), overallSummary: overallSummary };
  };

  DataStore.prototype._processFinance = function (finance) {
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
      recentTransactions: (finance.recentTransactions || []).map(function (tx) {
        return {
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
        };
      }),
    };
  };

  DataStore.prototype._processConfig = function (config) {
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
  };

  DataStore.prototype._processXpSources = function (xpSources) {
    if (!xpSources || !Array.isArray(xpSources)) return [];
    return xpSources;
  };

  // ── 刷新数据 ──

  DataStore.prototype.refresh = function () {
    this.data = null;
    this._rawData = {};
    this._loadPromise = null;
    return this.load();
  };

  // ── 写入操作 ──

  // 写入 XP 记录
  DataStore.prototype.saveXpRecords = function (records) {
    var self = this;
    return self._writeFile('data/xpRecords.json', records, '更新 XP 记录').then(function () {
      self._rawData.xpRecords = records;
      // 重新构建 dashboard
      return self._rebuildDashboard();
    });
  };

  // 追加一条 XP 记录
  DataStore.prototype.addXpRecord = function (record) {
    var records = (this._rawData.xpRecords || []).slice();
    records.unshift(record);
    return this.saveXpRecords(records);
  };

  // 写入财务数据
  DataStore.prototype.saveFinance = function (financeData) {
    var self = this;
    return self._writeFile('data/finance.json', financeData, '更新财务数据').then(function () {
      self._rawData.finance = financeData;
      return self._rebuildDashboard();
    });
  };

  // 追加一条财务流水（对账/零花钱/花销等），并同步更新对应账户余额与总资产
  DataStore.prototype.addFinanceRecord = function (record) {
    var self = this;
    var finance = self._rawData.finance || {
      totalAssets: 0,
      accounts: [
        { key: 'wealth', name: '财富增值账户', balance: 0, goal: null, goalTarget: null },
        { key: 'free', name: '自由基金账户', balance: 0, goal: null, goalTarget: null },
      ],
      recentTransactions: [],
    };

    // 生成与现有流水一致的 id（recv 开头）
    var txId = 'recv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var rawAmount = Number(record.rawAmount);
    if (isNaN(rawAmount)) {
      rawAmount = record.type === 'expense' ? -Math.abs(Number(record.amount) || 0) : Math.abs(Number(record.amount) || 0);
    }

    // 追加流水
    var tx = {
      id: record.id || txId,
      date: record.date || '',
      type: record.type || (rawAmount >= 0 ? 'income' : 'expense'),
      amount: Math.abs(Number(record.amount) || rawAmount || 0),
      rawAmount: rawAmount,
      category: record.category || record.description || '',
      account: record.account || (record.accountType === '自由基金账户' ? 'free' : 'wealth'),
      accountType: record.accountType || '财富增值账户',
      description: record.description || '',
      worthIt: record.worthIt || '',
      reason: record.reason || '',
      suggestion: record.suggestion || '',
    };
    var transactions = (finance.recentTransactions || []).slice();
    transactions.unshift(tx);

    // 更新对应账户余额
    var accounts = (finance.accounts || []).map(function (acc) {
      if (acc.key === tx.account) {
        var bal = Number(acc.balance) || 0;
        bal = Math.round((bal + rawAmount) * 100) / 100;
        return Object.assign({}, acc, { balance: bal });
      }
      return acc;
    });

    // 重算总资产
    var totalAssets = accounts.reduce(function (sum, acc) { return sum + (Number(acc.balance) || 0); }, 0);
    totalAssets = Math.round(totalAssets * 100) / 100;

    var newFinance = {
      totalAssets: totalAssets,
      accounts: accounts,
      recentTransactions: transactions,
    };

    return self.saveFinance(newFinance);
  };

  // 保存个人信息（兼容页面调用的 saveChildData）
  DataStore.prototype.saveChildData = function (childData) {
    return this.saveChild(childData);
  };

  // 保存校历数据（数组结构）
  DataStore.prototype.saveCalendarData = function (calendarData) {
    var self = this;
    return self._writeFile('data/calendar.json', calendarData, '更新校历数据').then(function () {
      self._rawData.calendar = calendarData;
      return self._rebuildDashboard();
    });
  };

  // 新增一条 XP 规则（写入 config.json 的 xpRuleList 和 xpRules）
  DataStore.prototype.addXpRule = function (rule) {
    var self = this;
    var config = self._rawData.config || { subjects: [], xpRules: {}, xpRuleList: [], abilityModules: {} };
    var newRule = {
      name: rule.name || '',
      category: rule.category || '学习成长',
      xp: Number(rule.xp) || 0,
      method: rule.method || '按次',
      description: rule.description || '',
    };
    var list = (config.xpRuleList || []).slice();
    list.push(newRule);
    var rules = Object.assign({}, config.xpRules || {});
    rules[newRule.category] = (rules[newRule.category] || []).concat([newRule]);
    return self.saveConfig(Object.assign({}, config, { xpRuleList: list, xpRules: rules }));
  };

  // 新增一条学习（作业）记录：写入 allHomework（按日期分组）与 recentAssignments
  DataStore.prototype.addStudyRecord = function (rec) {
    var self = this;
    var study = self._rawData.study || { subjects: [], homework: {}, recentAssignments: [], allHomework: [], examRecords: [], evaluations: [] };
    var id = 'rec' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var title = rec.title || rec.description || '';
    var modules = Array.isArray(rec.modules) ? (rec.modules || []).slice() : (rec.modules ? [rec.modules] : []);
    var module = modules[0] || rec.module || '';
    var status = rec.status || 'pending';
    var item = {
      id: id,
      subject: rec.subject || '',
      title: title,
      cleanTitle: title,
      shortTitle: title,
      homeworkType: rec.homeworkType || '作业·日常作业',
      module: module,
      modules: modules,
      dueDate: rec.date || '',
      deadline: rec.date || '',
      status: status,
      submitted: !!rec.submitted,
      reviewStatus: status === 'done' ? '已通过' : '',
      returnReason: '',
      description: rec.description || title,
      details: [],
      tags: status === 'done' ? [{ text: '已完成', type: 'good' }] : [],
      progress: status === 'done' ? 100 : 0,
    };
    var allHomework = (study.allHomework || []).slice();
    var date = rec.date || '';
    var group = null;
    for (var gi = 0; gi < allHomework.length; gi++) {
      if (allHomework[gi].date === date) { group = allHomework[gi]; break; }
    }
    if (!group) {
      group = { date: date, items: [] };
      allHomework.push(group);
    }
    group.items = (group.items || []).slice();
    group.items.push(item);
    var recent = (study.recentAssignments || []).slice();
    recent.unshift(item);
    return self.saveStudy(Object.assign({}, study, {
      allHomework: allHomework,
      recentAssignments: recent.slice(0, 10),
    }));
  };

  // 新增一条考试成绩记录：写入 examRecords 并更新 subjects 对应学科
  DataStore.prototype.addScoreRecord = function (rec) {
    var self = this;
    var study = self._rawData.study || { subjects: [], examRecords: [] };
    var id = 'rec' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var errorModules = rec.errorModule
      ? String(rec.errorModule).split(/[、,，;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean)
      : [];
    var examRec = {
      id: id,
      subject: rec.subject || '',
      grade: rec.grade || '',
      examType: rec.examType || '考试',
      date: rec.date || '',
      year: '',
      semester: '',
      semesterLabel: rec.semesterLabel || '',
      errorModule: rec.errorModule || '',
      errorModules: errorModules,
      description: (rec.title || '') + (rec.grade ? ' 等级：' + rec.grade : ''),
    };
    var examRecords = (study.examRecords || []).slice();
    examRecords.unshift(examRec);

    var order = { 'A+': 12, 'A': 11, 'B+': 10, 'B': 9, 'C+': 8, 'C': 7, 'D+': 6, 'D': 5, 'E': 4, 'F': 3 };
    var curW = order[rec.grade || ''] || 0;
    var subjects = (study.subjects || []).slice().map(function (s) {
      if (s.name !== rec.subject) return s;
      var prevGrade = s.grade || '';
      var prevW = order[prevGrade] || 0;
      var trend = curW > prevW ? 'up' : (curW < prevW ? 'down' : (s.trend || 'stable'));
      var history = (s.history || []).slice();
      history.unshift({ date: rec.date || '', grade: rec.grade || '', examType: rec.examType || '', errorModules: errorModules });
      return Object.assign({}, s, {
        grade: rec.grade || s.grade,
        date: rec.date || s.date,
        examType: rec.examType || s.examType,
        previousGrade: prevGrade,
        trend: trend,
        errorModules: errorModules,
        history: history,
      });
    });
    return self.saveStudy(Object.assign({}, study, { examRecords: examRecords, subjects: subjects }));
  };

  // 新增一条期末评语记录：写入 study.evaluations
  DataStore.prototype.addEvaluationRecord = function (rec) {
    var self = this;
    var study = self._rawData.study || { evaluations: [] };
    var id = 'rec' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var semesterLabel = rec.semester || '';
    var evalRec = {
      id: id,
      year: '',
      semester: '',
      semesterLabel: semesterLabel,
      teacherComment: rec.teacherComment || '',
      parentComment: rec.parentComment || '',
      date: rec.date || '',
      title: semesterLabel,
    };
    var evaluations = (study.evaluations || []).slice();
    evaluations.unshift(evalRec);
    return self.saveStudy(Object.assign({}, study, { evaluations: evaluations }));
  };

  // 写入等级数据
  DataStore.prototype.saveLevels = function (levels) {
    var self = this;
    return self._writeFile('data/levels.json', levels, '更新等级配置').then(function () {
      self._rawData.levels = levels;
      return self._rebuildDashboard();
    });
  };

  // 写入学习数据
  DataStore.prototype.saveStudy = function (studyData) {
    var self = this;
    return self._writeFile('data/study.json', studyData, '更新学习数据').then(function () {
      self._rawData.study = studyData;
      return self._rebuildDashboard();
    });
  };

  // 写入配置数据
  DataStore.prototype.saveConfig = function (configData) {
    var self = this;
    return self._writeFile('data/config.json', configData, '更新配置数据').then(function () {
      self._rawData.config = configData;
      return self._rebuildDashboard();
    });
  };

  // 写入个人信息
  DataStore.prototype.saveChild = function (childData) {
    var self = this;
    return self._writeFile('data/child.json', childData, '更新个人信息').then(function () {
      self._rawData.child = childData;
      return self._rebuildDashboard();
    });
  };

  // 写入校历数据
  DataStore.prototype.saveCalendar = function (calendarData) {
    var self = this;
    return self._writeFile('data/calendar.json', calendarData, '更新校历数据').then(function () {
      self._rawData.calendar = calendarData;
      return self._rebuildDashboard();
    });
  };

  // 写入 XP 来源
  DataStore.prototype.saveXpSources = function (xpSources) {
    var self = this;
    return self._writeFile('data/xpSources.json', xpSources, '更新 XP 来源').then(function () {
      self._rawData.xpSources = xpSources;
      return self._rebuildDashboard();
    });
  };

  // 重新构建 dashboard
  DataStore.prototype._rebuildDashboard = function () {
    var self = this;
    var raw = self._rawData;
    self.data = self._buildDashboard(
      raw.child, raw.calendar, raw.levels, raw.xpRecords,
      raw.finance, raw.study, raw.config, raw.xpSources, raw.redeemRecords
    );
    return self.data;
  };

  // 获取 Token 状态
  DataStore.prototype.hasToken = function () {
    return this._hasToken();
  };

  DataStore.prototype.getToken = function () {
    return this._getToken();
  };

  DataStore.prototype.setToken = function (token) {
    try {
      localStorage.setItem('github_token', token);
    } catch (e) {
      // ignore
    }
  };

  DataStore.prototype.clearToken = function () {
    try {
      localStorage.removeItem('github_token');
    } catch (e) {
      // ignore
    }
  };

  // 获取原始数据（用于修改后写回）
  DataStore.prototype.getRawData = function () {
    return this._rawData;
  };

  // ═══════════════════════════════════════════════════════════════
  // 导出
  // ═══════════════════════════════════════════════════════════════

  global.DataStore = DataStore;

  // 同时导出工具函数（供前端使用）
  global.resolveLinkName = resolveLinkName;
  global.resolveLinkNamesArr = resolveLinkNamesArr;
  global.parsePrivilegeDetails = parsePrivilegeDetails;
  global.extractModuleNames = extractModuleNames;
  global.parseScoreRecord = parseScoreRecord;
  global.parseSemesterLabel = parseSemesterLabel;
  global.semesterSortValue = semesterSortValue;
  global.cleanTitle = cleanTitle;
  global.parseDetails = parseDetails;
  global.daysUntil = daysUntil;
  global.inferModule = inferModule;
  global.generateSuggestions = generateSuggestions;

})(typeof window !== 'undefined' ? window : global);