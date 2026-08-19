/*!
 * data-relations.js — Yara 成长工作台 · 统一数据关联层
 *
 * 目标：把系统里所有"改一条记录，关联数据要同步改"的级联关系，
 * 集中成 一张关系注册表 + 一个级联引擎，保证各记录类型之间数据一致。
 *
 * 解决的问题（用户核心诉求）：
 *   例如把任务打卡改一下/分值改了，关联的积分、等级、余额、承诺状态等
 *   都要一起更新。本模块提供统一入口：DataRelations.apply()。
 *
 * ── 关系注册表（RELATIONS）说明 ──
 *   每条关系定义：
 *     from    : 触发方记录类型
 *     via     : 关联方式（key 直接关联 / 数值派生 / 状态同步）
 *     files   : 需要重新写入的数据文件
 *     derive  : 重算派生数据的函数（从源数据重建目标数据）
 *
 * ── 用法 ──
 *   await DataRelations.load();                    // 加载所有数据文件到内存
 *   await DataRelations.apply(type, action, rec);  // 统一操作：新增/修改/删除, 自动级联
 *   await DataRelations.recomputeAll();            // 一键重算所有关联的派生数据
 *   DataRelations.getRelations(type, rec);         // 查看某条记录的所有关联（调试/管理页）
 */
(function (global) {
  'use strict';

  /* ═══════════ 0. 基础工具 ═══════════ */

  var API_BASE = 'https://api.github.com/repos/meramei/Yara';
  var BRANCH = 'main';
  var TOKEN_KEY = 'github_token';

  function getToken() { return global.localStorage ? global.localStorage.getItem(TOKEN_KEY) : ''; }

  // 本地模式探测（本地测试服务器 /api/ping，结果缓存）——与 app.js 保持一致
  var _localModeChecked = false;
  var _localMode = false;
  function isLocalMode() {
    if (_localModeChecked) return Promise.resolve(_localMode);
    return new Promise(function (resolve, reject) {
      global.fetch('/api/ping', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { _localMode = !!(d && d.ok); _localModeChecked = true; resolve(_localMode); })
        .catch(function () { _localMode = false; _localModeChecked = true; resolve(false); });
    });
  }

  // 读数据文件：优先本地 data/xxx.json，GitHub Token 存在时读远端，保证最新
  function fetchRaw(file) {
    return global.fetch('data/' + file)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () {
        return global.fetch(API_BASE + '/contents/' + 'data/' + file + '?ref=' + BRANCH, {
          headers: { 'Authorization': 'Bearer ' + getToken(), 'Accept': 'application/vnd.github.raw+json' },
        }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
      });
  }

  function getFileSHA(path) {
    var token = getToken();
    if (!token) return Promise.resolve(null);
    return global.fetch(API_BASE + '/contents/' + path + '?ref=' + BRANCH, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' },
    }).then(function (r) {
      if (r.status === 404) return null;
      return r.json().then(function (d) { return d && d.sha ? d.sha : null; });
    }).catch(function () { return null; });
  }

  function writeFile(path, content, msg) {
    return isLocalMode().then(function (local) {
      if (local) {
        // 本地测试：写入本地 data/ 目录，无需 Token，不碰线上库
        // 注意：本地服务器 /api/write 只接受纯文件名（如 study.json），
        // 因此需要去掉可能带有的 data/ 前缀，服务器自己会拼到 DATA_DIR。
        var cleanPath = String(path).replace(/^data\//, '');
        return global.fetch('/api/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: cleanPath, content: content, message: msg || ('更新数据: ' + path) }),
        }).then(function (r) {
          if (!r.ok) throw new Error('本地写入失败: ' + r.status);
          return r.json();
        });
      }
      return writeFileRemote(path, content, msg);
    });
  }

  function writeFileRemote(path, content, msg) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('请先设置 GitHub Token'));
    return getFileSHA(path).then(function (sha) {
      var body = {
        message: msg || '更新数据: ' + path,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        branch: BRANCH,
      };
      if (sha) body.sha = sha;
      return global.fetch(API_BASE + '/contents/' + path, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || 'GitHub API 错误: ' + r.status); });
      return r.json();
    });
  }

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function genId(prefix) {
    return (prefix || 'rec') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function firstDefined(obj, keys, dflt) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && String(v) !== '') return v;
    }
    return dflt;
  }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* ═══════════ 1. 派生数据重算函数（核心，计算口径与主站保持一致） ═══════════ */

  // 1.1 从 xpRecords 重算 totalXP + pendingCount + returnedCount
  function recomputeXpStats(xpRecords) {
    var verifiedXp = 0, pending = 0, returned = 0, verifiedCount = 0;
    (xpRecords || []).forEach(function (r) {
      var st = r.reviewStatus || '';
      if (st === '已通过') { verifiedXp += num(r.xp); verifiedCount++; }
      else if (st === '待确认') { pending++; }
      else if (st === '已退回') { returned++; }
    });
    return { totalXP: Math.round(verifiedXp * 100) / 100, verifiedCount: verifiedCount, pendingCount: pending, returnedCount: returned };
  }

  // 1.2 根据 totalXP 重算等级解锁（levels.json 的 privileges[].unlocked）
  function recomputeLevels(levels, totalXP, xpSources) {
    var unlockedRedeem = 0;
    var list = (levels || []).slice();
    // 先把配置的权益补齐到等级上（接入 xpSources 中的兑换类，保证权益随等级联动）
    var redeemPriv = null;
    (xpSources || []).forEach(function (cat) {
      (cat.tasks || []).forEach(function (t) {
        if ((t.method === '兑换' || /兑换/.test(t.name)) && t.privilege) redeemPriv = t.privilege;
      });
    });
    list.forEach(function (lv) {
      lv = lv || {};
      var isUnlocked = totalXP >= num(lv.xp);
      var privs = lv.privileges || [];
      privs.forEach(function (p) {
        var oldUnlocked = !!p.unlocked;
        // 权益解锁跟随等级
        p.unlocked = isUnlocked;
        if (p.unlocked && !oldUnlocked && p.redeemed) { p.redeemed = false; p.redeemedAt = ''; p.redeemedDate = ''; }
      });
      if (redeemPriv && isUnlocked && privs.length === 0) {
        privs.push(Object.assign({}, redeemPriv, { unlocked: true }));
      }
      if (isUnlocked) unlockedRedeem = Math.max(unlockedRedeem, num(lv.xp));
    });
    return list;
  }

  // 1.3 从 finance.recentTransactions 重算 accounts 余额 + totalAssets
  function recomputeFinance(finance) {
    var fin = finance || {};
    var accounts = (fin.accounts || []).map(function (acc) {
      return Object.assign({}, acc, {
        balance: 0,
        goal: acc.goal !== undefined ? acc.goal : null,
        goalTarget: acc.goalTarget !== undefined ? acc.goalTarget : null,
      });
    });
    var accByKey = {};
    accounts.forEach(function (a) { accByKey[a.key] = a; });
    // 按时间正序叠加每笔流水，得到权威余额
    var txs = (fin.recentTransactions || []).slice().sort(function (a, b) {
      return String(a.date) < String(b.date) ? -1 : (String(a.date) > String(b.date) ? 1 : 0);
    });
    txs.forEach(function (tx) {
      var acc = accByKey[tx.account];
      if (!acc) return;
      var raw = num(tx.rawAmount);
      if (!raw) raw = tx.type === 'expense' ? -Math.abs(num(tx.amount)) : Math.abs(num(tx.amount));
      acc.balance = Math.round((acc.balance + raw) * 100) / 100;
    });
    var totalAssets = accounts.reduce(function (s, a) { return s + num(a.balance); }, 0);
    totalAssets = Math.round(totalAssets * 100) / 100;
    return { totalAssets: totalAssets, accounts: accounts, recentTransactions: fin.recentTransactions || [] };
  }

  // 1.4 从 xpRecords(commitmentBonus) 同步 familyMeetings 承诺完成状态
  function syncCommitmentsFromXp(xpRecords, familyMeetings) {
    var meetings = (familyMeetings || []).map(function (m) {
      return Object.assign({}, m, {
        commitments: (m.commitments || []).map(function (c) {
          var c2 = Object.assign({}, c);
          // 找到匹配该承诺、且已通过的"承诺兑现"XP 记录
          var matched = (xpRecords || []).find(function (r) {
            if (r.reviewStatus !== '已通过' || !r.commitmentBonus) return false;
            var text = (c.text || '').trim();
            if (text && (r.taskName || '').trim() === text) return true;
            if (text && (r.description || '').indexOf('[承诺兑现]') >= 0 && (r.description || '').indexOf(text) >= 0) return true;
            return false;
          });
          if (matched) { c2.completed = true; c2.linked = true; }
          return c2;
        }),
      });
    });
    return meetings;
  }

  // 1.5 汇总各记录类型的真实条数（用于记录管理页）；raw 键为文件名如 'xpRecords.json'
  function computeCounts(raw) {
    var fin = raw['finance.json'] || {};
    var study = raw['study.json'] || {};
    var xp = raw['xpRecords.json'] || [];
    var diary = raw['diaryEntries.json'] || [];
    var mtg = raw['familyMeetings.json'] || [];
    var levels = raw['levels.json'] || [];
    return {
      finance: (fin.recentTransactions || []).length,
      xp: xp.length,
      homework: (Array.isArray(study.allHomework) ? study.allHomework : []).reduce(function (s, day) { return s + (Array.isArray((day && day.items)) ? day.items.length : 0); }, 0),
      exam: ((study.examRecords || [])).length +
            ((study.subjects || [])).reduce(function (s, sub) { return s + ((sub && sub.history) || []).length; }, 0),
      evaluation: (study.evaluations || []).length,
      diary: diary.length,
      commitment: mtg.reduce(function (s, m) { return s + ((m && m.commitments) || []).length; }, 0),
      level: levels.length,
      aiweekly: (raw['aiWeeklyReports.json'] || []).length,
      redeem: (raw['redeemRecords.json'] || []).length,
    };
  }

  /* ═══════════ 2. 关系注册表 ═══════════ */

  // 每条记录类型的：文件、运行时加载为数组、主键、以及该记录变更后需要级联的目标
  var RELATIONS = {
    // 能量记录：任务打卡/手动打分 → 总XP → 等级 → 权益；承诺兑现 → 回写家庭会议
    xp: {
      label: '能量记录',
      file: 'xpRecords.json',
      isArray: true,
      idKey: 'id',
      listFields: ['taskCategory', 'title', 'xp', 'date', 'reviewStatus'],
      fields: [
        { key: 'taskRef', name: '关联任务', type: 'taskRef', deriveTo: { xp: 'xp', taskCategory: 'taskCategory', title: 'title' } },
        { key: 'taskCategory', name: '任务类别', type: 'text' },
        { key: 'title', name: '任务名称', type: 'text', use: ['title', 'taskName'] },
        { key: 'xp', name: '分值(XP)', type: 'number' },
        { key: 'date', name: '日期', type: 'date' },
        { key: 'reviewStatus', name: '状态', type: 'select', options: ['待确认', '已通过', '已退回'] },
        { key: 'description', name: '描述', type: 'textarea' },
      ],
      // 该记录变更后需要重算的关联文件
      cascade: ['levels.json', 'familyMeetings.json'],
      deriveKey: 'xp',
    },
    // 财富记录：流水 → 账户余额 → 总资产
    finance: {
      label: '财富记录',
      file: 'finance.json',
      isArray: false,
      idKey: 'id',
      listPath: 'recentTransactions',
      listFields: ['date', 'type', 'amount', 'category', 'accountName'],
      fields: [
        { key: 'date', name: '日期', type: 'date' },
        { key: 'type', name: '类型', type: 'select', options: [{ v: 'income', l: '收入' }, { v: 'expense', l: '支出' }] },
        { key: 'amount', name: '金额', type: 'number' },
        { key: 'category', name: '分类', type: 'text' },
        { key: 'account', name: '账户', type: 'select', options: [{ v: 'wealth', l: '财富增值账户' }, { v: 'free', l: '自由基金账户' }] },
        { key: 'accountName', name: '账户名', type: 'text', use: ['accountName', 'accountType'] },
        { key: 'description', name: '说明', type: 'textarea' },
        { key: 'worthIt', name: '是否值得(支出)', type: 'select', options: ['值得', '一般', '不值得'] },
        { key: 'reason', name: '消费心得', type: 'textarea' },
        { key: 'suggestion', name: '建议/改进', type: 'textarea' },
      ],
      cascade: ['finance.json'],
      deriveKey: 'finance',
    },
    // 作业记录：作业状态 → XP
    homework: {
      label: '作业记录',
      file: 'study.json',
      isArray: false,
      idKey: 'id',
      listPath: 'allHomework',
      listFields: ['date', 'subject', 'title', 'homeworkType', 'status'],
      fields: [
        { key: 'subject', name: '科目', type: 'text' },
        { key: 'title', name: '标题', type: 'text' },
        { key: 'homeworkType', name: '作业类型', type: 'text' },
        { key: 'status', name: '状态', type: 'select', options: [{ v: 'pending', l: '待完成' }, { v: 'done', l: '已完成' }] },
        { key: 'dueDate', name: '日期', type: 'date' },
      ],
      cascade: [] // 级联 XP 由 addXpRecord 侧处理（homeworkId 关联）
    },
    // 成绩记录
    exam: {
      label: '成绩记录',
      file: 'study.json',
      isArray: false,
      idKey: 'id',
      listPath: 'examRecords',
      listFields: ['semesterLabel', 'subject', 'grade', 'examType', 'date'],
      fields: [
        { key: 'semesterLabel', name: '学期', type: 'text', use: ['semesterLabel', 'semester'] },
        { key: 'subject', name: '科目', type: 'text' },
        { key: 'grade', name: '等级', type: 'text' },
        { key: 'examType', name: '考试类型', type: 'text' },
        { key: 'date', name: '日期', type: 'date' },
        { key: 'errorModules', name: '失分模块', type: 'textarea' },
      ],
      cascade: []
    },
    // 期末评价
    evaluation: {
      label: '期末评价',
      file: 'study.json',
      isArray: false,
      idKey: 'id',
      listPath: 'evaluations',
      listFields: ['semesterLabel', 'teacherComment', 'date'],
      fields: [
        { key: 'semesterLabel', name: '学期', type: 'text', use: ['semesterLabel', 'semester', 'title'] },
        { key: 'teacherComment', name: '老师评语', type: 'textarea', use: ['teacherComment', 'summary', 'content'] },
        { key: 'parentComment', name: '家长评语', type: 'textarea', use: ['parentComment'] },
        { key: 'date', name: '日期', type: 'date', use: ['date'] },
      ],
      cascade: []
    },
    // 日记：日记 XP → 总XP 去重
    diary: {
      label: '日记',
      file: 'diaryEntries.json',
      isArray: true,
      idKey: 'id',
      listFields: ['date', 'title', 'mood'],
      fields: [
        { key: 'date', name: '日期', type: 'date' },
        { key: 'taskRef', name: '关联任务', type: 'taskRef', deriveTo: { xp: 'xp', title: 'title' } },
        { key: 'title', name: '任务名称', type: 'text', use: ['title', 'taskName', 'task'] },
        { key: 'mood', name: '心情', type: 'text' },
        { key: 'content', name: '内容', type: 'textarea' },
        { key: 'xp', name: '分值(XP)', type: 'number' },
      ],
      cascade: []
    },
    // 家庭会议承诺：承诺完成 → 关联XP → 总XP
    commitment: {
      label: '家庭会议承诺',
      file: 'familyMeetings.json',
      isArray: true,
      idKey: 'id',
      listPath: 'commitments',
      listFields: ['text', 'category', 'xp', 'completed'],
      fields: [
        { key: 'text', name: '承诺内容', type: 'textarea' },
        { key: 'category', name: '分类', type: 'text' },
        { key: 'xp', name: '分值(XP)', type: 'number' },
        { key: 'completed', name: '完成', type: 'select', options: [true, false] },
      ],
      cascade: []
    },
    // AI周报：纯数组文件，展示每周汇总
    aiweekly: {
      label: 'AI周报',
      file: 'aiWeeklyReports.json',
      isArray: true,
      idKey: 'id',
      listFields: ['weekNumber', 'date', 'summary'],
      fields: [
        { key: 'weekNumber', name: '周次', type: 'number', use: ['weekNumber', 'week'] },
        { key: 'year', name: '年份', type: 'number' },
        { key: 'date', name: '日期', type: 'date' },
        { key: 'summary', name: '本周概览', type: 'textarea', use: ['summary'] },
      ],
      cascade: []
    },
  };

  /* ═══════════ 3. 关联引擎 DataRelations ═══════════ */

  var DataRelations = {
    _raw: {},
    _loaded: {},

    RELATIONS: RELATIONS,

    // 加载所有数据文件
    load: function () {
      var files = [
        'xpRecords.json', 'finance.json', 'study.json', 'diaryEntries.json',
        'familyMeetings.json', 'levels.json', 'xpSources.json', 'config.json',
        'aiWeeklyReports.json', 'redeemRecords.json',
      ];
      var self = this;
      return Promise.all(files.map(function (f) {
        return fetchRaw(f).then(function (d) { self._raw[f] = clone(d || {}); })
          .catch(function () { self._raw[f] = null; });
      })).then(function () { return self._raw; });
    },

    // 取某记录类型的记录数组
    getRecords: function (type) {
      var rel = RELATIONS[type];
      if (!rel) return [];
      var file = rel.file;
      var data = this._raw[file];
      var listPath = rel.listPath;
      // 嵌套结构优先（即使外层文件是数组）
      if (listPath === 'commitments') {
        return (Array.isArray(data) ? data : []).reduce(function (s, m) {
          var mid = m && m.id;
          return s.concat(((m && m.commitments) || []).map(function (c, i) {
            return Object.assign({ _meetingId: mid, _commitmentIdx: i }, c);
          }));
        }, []);
      }
      if (listPath === 'allHomework') {
        return (data && data.allHomework || []).reduce(function (s, day) {
          return s.concat(((day && day.items) || []).map(function (it) {
            return Object.assign({ _day: day.date }, it);
          }));
        }, []);
      }
      if (rel.isArray) return Array.isArray(data) ? data : [];
      return (data && data[listPath]) || [];
    },

    // 根据一条记录的变更，返回需要同步重算的关联文件与重算结果
    // 返回 [{ file, data, reason }]
    computeCascade: function (type, action, record) {
      var self = this;
      var results = [];

      // 能量记录：重算 levels（等级/权益）+ 重算 familyMeetings（承诺回写）
      if (type === 'xp') {
        var xpStats = recomputeXpStats(this._raw['xpRecords.json']);
        var leveled = recomputeLevels(this._raw['levels.json'], xpStats.totalXP, this._raw['xpSources.json']);
        results.push({ file: 'levels.json', data: leveled, reason: 'XP记录变更 → 重算等级与权益' });
        var mtg = syncCommitmentsFromXp(this._raw['xpRecords.json'], this._raw['familyMeetings.json']);
        results.push({ file: 'familyMeetings.json', data: mtg, reason: 'XP记录变更 → 同步承诺完成状态' });
      }

      // 财富记录：重算 accounts 余额 + totalAssets
      if (type === 'finance') {
        var recomputed = recomputeFinance(this._raw['finance.json']);
        results.push({ file: 'finance.json', data: recomputed, reason: '财务流水变更 → 重算账户余额与总资产' });
      }

      return results;
    },

    // 统一操作入口：对 type 记录执行增/改/删，并级联更新所有关联文件
    // action: 'create' | 'update' | 'remove'
    apply: function (type, action, record) {
      var self = this;
      return this.load().then(function () {
        var rel = RELATIONS[type];
        if (!rel) return { ok: false, error: '未知记录类型: ' + type };
        return self._applyNow(type, rel, action, record).then(function (summary) {
          return self._writeCascade(type, summary);
        });
      });
    },

    _applyNow: function (type, rel, action, record) {
      var self = this;
      var file = rel.file;
      var isArr = rel.isArray;

      function save(newData) {
        self._raw[file] = clone(newData);
        return newData;
      }

      // ── 数组型文件（xp / diary / commitments 外层） ──
      if (isArr) {
        var arr = Array.isArray(this._raw[file]) ? this._raw[file].slice() : [];
        var actionSummary = {};
        if (action === 'create') {
          var nrec = clone(record || {});
          nrec.id = nrec.id || genId(rel.idKey || 'rec_');
          if (type === 'xp') {
            nrec.domain = 'XP';
            nrec.type = 'XP获得';
            nrec.title = nrec.title || nrec.taskName || '';
            nrec.taskName = firstDefined(nrec, ['taskName', 'title'], '');
            nrec.date = nrec.date || todayStr();
            nrec.datetime = nrec.datetime || todayStr().replace(/-/g, '-') + ' 00:00:00';
            nrec.reviewStatus = nrec.reviewStatus || '待确认';
          }
          arr.unshift(nrec);
          actionSummary = { id: nrec.id, action: 'create' };
        } else {
          var id = record && record.id;
          var idx = arr.findIndex(function (r) { return r && r.id === id; });
          if (idx < 0 && type === 'commitment') {
            // 承诺在外层 meetings，走特殊处理
            return self._applyCommitment(type, rel, action, record);
          }
          if (idx < 0) return { id: id, action: action, skipped: '未找到该记录' };
          if (action === 'update') {
            arr[idx] = Object.assign({}, arr[idx], clone(record || {}));
            actionSummary = { id: id, action: 'update' };
          } else if (action === 'remove') {
            arr.splice(idx, 1);
            actionSummary = { id: id, action: 'remove' };
          }
        }
        save(arr);
        return Promise.resolve(actionSummary);
      }

      // ── 对象型文件（finance / study） ──
      var obj = clone(this._raw[file] || {});
      var listPath = rel.listPath;

      // 作业/成绩/评价 在 study.json 的嵌套列表
      if (file === 'study.json' && (listPath === 'allHomework' || listPath === 'examRecords' || listPath === 'evaluations')) {
        var idRec = record && record.id;
        if (listPath === 'allHomework') {
          var arr = obj.allHomework;
          // allHomework 是数组：绝大多数元素是 { date, items } 天对象，可能混杂平铺作业项
          if (arr === null || arr === undefined || typeof arr !== 'object' || !Array.isArray(arr)) {
            obj.allHomework = arr = Array.isArray(arr) ? arr.slice() : (arr && typeof arr === 'object' ? arr : []);
          }
          // 定位该条作业（优先天对象 items，也可在平铺项中发现）
          var loc = { list: null, idx: -1 };
          arr.forEach(function (day) {
            if (!day || typeof day !== 'object') return;
            if (Array.isArray(day.items)) {
              var i = day.items.findIndex(function (it) { return it && it.id === idRec; });
              if (i >= 0) { loc.list = day.items; loc.idx = i; }
            }
          });
          if (action === 'create') {
            var nrec = clone(record || {});
            nrec.id = nrec.id || genId('rec_');
            var dk = (record && record.date) || todayStr();
            var dayObj = arr.find(function (day) { return day && Array.isArray(day.items) && day.date === dk; });
            if (dayObj) dayObj.items.unshift(nrec);
            else arr.push({ date: dk, items: [nrec] });
          } else if (loc.list && loc.idx >= 0) {
            if (action === 'update') loc.list[loc.idx] = Object.assign({}, loc.list[loc.idx], clone(record));
            else if (action === 'remove') loc.list.splice(loc.idx, 1);
          } else if (action !== 'create') {
            save(obj);
            return Promise.resolve({ id: idRec, action: action, skipped: '未找到该作业' });
          }
          save(obj);
          return Promise.resolve({ id: idRec, action: action });
        } else {
          var list = obj[listPath] || [];
          if (action === 'create') {
            var n2 = clone(record || {});
            n2.id = n2.id || genId('rec_');
            list.unshift(n2);
          } else {
            var li = list.findIndex(function (r) { return r && r.id === idRec; });
            if (li >= 0) {
              if (action === 'update') list[li] = Object.assign({}, list[li], clone(record));
              else if (action === 'remove') list.splice(li, 1);
            }
          }
          obj[listPath] = list;
        }
        save(obj);
        return Promise.resolve({ id: idRec, action: action });
      }

      // finance.json（对象型，流水列表）
      var txList = (obj.recentTransactions || []).slice();
      var txId = record && record.id;
      if (action === 'create') {
        var ntx = clone(record || {});
        ntx.id = ntx.id || genId('fin_');
        ntx.rawAmount = ntx.rawAmount !== undefined ? num(ntx.rawAmount) :
          (ntx.type === 'expense' ? -Math.abs(num(ntx.amount)) : Math.abs(num(ntx.amount)));
        ntx.amount = num(ntx.amount) || Math.abs(ntx.rawAmount);
        txList.unshift(ntx);
        obj.recentTransactions = txList;
        obj = recomputeFinance(obj);
        save(obj);
        return Promise.resolve({ id: ntx.id, action: 'create' });
      }
      var ti = txList.findIndex(function (t) { return t && t.id === txId; });
      if (ti >= 0) {
        if (action === 'update') {
          txList[ti] = Object.assign({}, txList[ti], clone(record || {}));
          obj.recentTransactions = txList;
          obj = recomputeFinance(obj);
          save(obj);
        } else if (action === 'remove') {
          txList.splice(ti, 1);
          obj.recentTransactions = txList;
          obj = recomputeFinance(obj);
          save(obj);
        }
      }
      return Promise.resolve({ id: txId, action: action });
    },

    // 承诺记录（在 familyMeetings 数组的 commitments 内）
    _applyCommitment: function (type, rel, action, record) {
      var self = this;
      var meetings = Array.isArray(this._raw['familyMeetings.json']) ? this._raw['familyMeetings.json'].slice() : [];
      var mIdx = meetings.findIndex(function (m) { return m && m.id === (record && record._meetingId); });
      if (mIdx < 0 && meetings.length > 0) mIdx = 0; // 兜底用最近的会议
      if (mIdx < 0) return Promise.resolve({ id: record && record.id, action: action, skipped: '无家庭会议' });
      var m = clone(meetings[mIdx]);
      var list = (m.commitments || []).slice();
      if (action === 'create') {
        var nc = clone(record || {});
        nc.text = nc.text || nc.taskName || '';
        nc.xp = num(nc.xp) || 5;
        nc.completed = !!nc.completed;
        nc.linked = !!nc.linked;
        list.push(nc);
      } else {
        var id = record && record.id;
        var li = list.findIndex(function (c, i) {
          return (c && c.id === id) || (record && record._commitmentIdx === i);
        });
        if (li >= 0) {
          if (action === 'update') list[li] = Object.assign({}, list[li], clone(record || {}));
          else if (action === 'remove') list.splice(li, 1);
        }
      }
      m.commitments = list;
      meetings[mIdx] = m;
      this._raw['familyMeetings.json'] = clone(meetings);
      // 承诺变更关联：如果完成状态变化，重算承诺关联的 XP/等级
      return Promise.resolve({ id: record && record.id, action: action });
    },

    // 把主文件写回 + 写入所有级联文件
    _writeCascade: function (type, summary) {
      var self = this;
      var rel = RELATIONS[type];
      var writes = [];
      // 1. 主文件写回
      var primaryFile = rel.file;
      var primaryData = this._raw[primaryFile];
      writes.push({ file: primaryFile, data: clone(primaryData) });
      // 2. 级联文件（重算后再写）
      var cascade = this.computeCascade(type, summary && summary.action, summary);
      cascade.forEach(function (c) {
        writes.push({ file: c.file, data: clone(c.data), reason: c.reason });
      });
      // 去重：级联文件可能与主文件重复（finance 同时写）
      var seen = {};
      var unique = writes.filter(function (w) {
        if (seen[w.file]) return false;
        seen[w.file] = true;
        return true;
      });
      var self2 = this;
      // 顺序写：避免 Git SHA 竞态导致级联文件部分覆盖/不一致
      return unique.reduce(function (chain, w) {
        var path = 'data/' + w.file;
        var msg = w.reason ? (type + '记录' + (summary.action || '') + ' → ' + w.reason) : (type + '记录' + (summary.action || ''));
        return chain.then(function () {
          return writeFile(path, w.data, msg);
        }).catch(function (err) { throw new Error('写入 ' + w.file + ' 失败: ' + (err && err.message || err)); });
      }, Promise.resolve()).then(function () {
        return { ok: true, type: type, action: summary && summary.action, id: summary && summary.id, written: unique.map(function (w) { return w.file; }), reason: cascade.map(function (c) { return c.reason; }) };
      });
    },

    // 全系统唯一 GitHub 写入出口：复用内部 writeFile（getFileSHA+btoa+分支写入）
    // 供记录管理页（原 writeGithubFile）与任务规则/分值同步等直接调用，消除重复实现。
    writeDataFile: function (path, content, msg) {
      if (!path) return Promise.reject(new Error('缺少文件路径'));
      var p = String(path).indexOf('data/') === 0 ? path : ('data/' + path);
      return writeFile(p, content, msg || ('更新数据: ' + path));
    },

    // 一键重算所有关联的派生数据并写回（用于统一校准）
    recomputeAll: function () {
      var self = this;
      return this.load().then(function () {
        var xpStats = recomputeXpStats(self._raw['xpRecords.json']);
        var writes = [];
        // XP → 等级
        var leveled = recomputeLevels(self._raw['levels.json'], xpStats.totalXP, self._raw['xpSources.json']);
        if (JSON.stringify(leveled) !== JSON.stringify(self._raw['levels.json'])) {
          writes.push({ file: 'levels.json', data: leveled, reason: '一键重算：等级与权益' });
          self._raw['levels.json'] = clone(leveled);
        }
        // XP → 家庭会议承诺
        var mtg = syncCommitmentsFromXp(self._raw['xpRecords.json'], self._raw['familyMeetings.json']);
        if (JSON.stringify(mtg) !== JSON.stringify(self._raw['familyMeetings.json'])) {
          writes.push({ file: 'familyMeetings.json', data: mtg, reason: '一键重算：承诺完成状态' });
          self._raw['familyMeetings.json'] = clone(mtg);
        }
        // 财务流水的权威余额
        var recomputed = recomputeFinance(self._raw['finance.json']);
        if (JSON.stringify(recomputed) !== JSON.stringify(self._raw['finance.json'])) {
          writes.push({ file: 'finance.json', data: recomputed, reason: '一键重算：账户余额与总资产' });
          self._raw['finance.json'] = clone(recomputed);
        }
        return Promise.all(writes.map(function (w) {
          return writeFile('data/' + w.file, w.data, w.reason);
        })).then(function () {
          return { ok: true, written: writes.map(function (w) { return w.file; }), reasons: writes.map(function (w) { return w.reason; }) };
        });
      });
    },

    // 查看某条记录的所有关联（管理页/调试用）
    getRelations: function (type, record) {
      if (!record) return [];
      var rel = RELATIONS[type];
      var out = [];
      // 关联 1：若是 XP 记录，说明与等级/承诺/对应源记录关联
      if (type === 'xp') {
        out.push({ kind: '等级', desc: '计入总XP，参与等级与权益解锁', target: 'levels.json' });
        if (record.commitmentBonus) out.push({ kind: '家庭会议承诺', desc: '承诺兑现，审批通过回写承诺完成', target: 'familyMeetings.json' });
        if (record.homeworkId) out.push({ kind: '作业', desc: '由作业完成产生（homeworkId 关联）', target: 'study.json' });
        if ((record.taskName || '').indexOf('写日记') === 0) out.push({ kind: '日记', desc: '由写日记产生，同日去重', target: 'diaryEntries.json' });
        if ((record.taskName || '').indexOf('财务') === 0 || (record.taskName || '').indexOf('花销') === 0) out.push({ kind: '财富', desc: '由财务操作产生', target: 'finance.json' });
        if ((record.taskName || '').indexOf('作业·') === 0) out.push({ kind: '作业', desc: '作业完成任务', target: 'study.json' });
        if ((record.taskName || '').indexOf('成绩') === 0) out.push({ kind: '成绩', desc: '成绩录入任务', target: 'study.json' });
      }
      if (type === 'finance') {
        out.push({ kind: '账户余额', desc: '流水计入对应账户余额与总资产', target: 'finance.json' });
        if (record && ((record.category || '').indexOf('零花') >= 0 || (record.description || '').indexOf('零花') >= 0)) {
          out.push({ kind: 'XP', desc: '每周零花钱→"财务进账"XP', target: 'xpRecords.json' });
        }
      }
      if (type === 'homework') {
        out.push({ kind: 'XP', desc: '完成→自动发放"作业·XX"积分', target: 'xpRecords.json' });
      }
      if (type === 'diary') {
        out.push({ kind: 'XP', desc: '写日记→发放"写日记"积分（同日去重）', target: 'xpRecords.json' });
      }
      if (type === 'commitment') {
        out.push({ kind: 'XP', desc: '承诺兑现→"承诺兑现"关联任务+XP', target: 'xpRecords.json' });
      }
      return out;
    },

    getCounts: function () { return computeCounts(this._raw); },
    getSnapshot: function () { return this._raw; },

    // ═══ 内部纯函数导出（供单元测试/高级调用） ═══
    _recomputeXpStats: recomputeXpStats,
    _recomputeLevels: recomputeLevels,
    _recomputeFinance: recomputeFinance,
    _syncCommitments: syncCommitmentsFromXp,
  };

  if (global.window) { if (global.window !== global) global.window.DataRelations = DataRelations; global.DataRelations = DataRelations; }
  if (typeof module !== 'undefined' && module.exports) module.exports = DataRelations;
  return DataRelations;
})(typeof window !== 'undefined' ? window : this);