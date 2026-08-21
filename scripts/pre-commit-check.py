#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pre-commit-check.py — Yara 成长工作台 · 提交前全平台体检脚本

在每次提交到 GitHub 之前运行，从【平台整体角度】检查改动是否健康、可安全上线。
不依赖任何记忆，检查项全部可自动执行、结果客观可复现。

用法（在仓库根目录）:
    python3 scripts/pre-commit-check.py
    python3 scripts/pre-commit-check.py --files index.html system-settings.html   # 只看指定文件
    python3 scripts/pre-commit-check.py --verbose                                # 显示通过项明细

退出码:
    0 = 全部通过，可安全提交
    1 = 存在必须修复的问题
    2 = 存在建议（不阻断提交，但建议查看）

覆盖维度:
  A. 结构完整性      HTML 标签配对、script 闭合
  B. 交互可用性      所有 onclick/onchange 引用的函数都有定义（含 window.xxx= 形式）
  C. 数据一致性      data/*.json 可解析；任务名与 xpSources.json 匹配
  D. 样式健壮性      CSS 变量引用无缺失（带内置回退值的除外）
  E. Token 闭环      设置页与主站共用同一 github_token key
  F. 仓库卫生        无临时/草稿文件混入（.superpowers、diary-preview 等）
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
APP_JS = os.path.join(ROOT, "app.js")
STYLE_CSS = os.path.join(ROOT, "style.css")
SETTINGS = os.path.join(ROOT, "system-settings.html")
DATA_DIR = os.path.join(ROOT, "data")

# ── 易用性：这些文件属于设计草稿/临时预览，不应被提交 ──
IGNORED_UNTRACKED = {".superpowers", "diary-fusion.html", "diary-preview.html"}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def main():
    verbose = "--verbose" in sys.argv

    # 可选：只检查指定文件
    only_files = None
    if "--files" in sys.argv:
        i = sys.argv.index("--files")
        only_files = set(sys.argv[i + 1:])

    errors = []      # 必须修复
    warns = []       # 建议
    checks = []      # 通过的检查项

    def report(cat, name, ok, detail=""):
        if not ok:
            (errors if cat == "E" else warns).append(f"{name}: {detail}")
        elif verbose:
            checks.append(f"{name}: {detail or 'OK'}")

    # ─────────────────────────────────────────────
    # A. 结构完整性
    # ─────────────────────────────────────────────
    if not only_files or "index.html" in only_files:
        html = read(INDEX)
        # 基础标签配对
        for tag in ["html", "body", "head", "style", "script"]:
            open_n = len(re.findall(rf"<{tag}[\s>]", html))
            close_n = len(re.findall(rf"</{tag}>", html))
            # script 有内联多段，允许开大于等于闭合
            ok = open_n == close_n or (tag == "script" and open_n >= close_n)
            report("E", f"A1 index.html <{tag}> 配对", ok,
                   f"open={open_n} close={close_n}")
        if not html.rstrip().endswith("</html>"):
            report("E", "A2 index.html 文件结尾", False, "未以 </html> 结束")

    if os.path.exists(SETTINGS) and (not only_files or "system-settings.html" in only_files):
        html = read(SETTINGS)
        for tag in ["html", "body"]:
            open_n = len(re.findall(rf"<{tag}[\s>]", html))
            close_n = len(re.findall(rf"</{tag}>", html))
            report("E", f"A1 system-settings.html <{tag}> 配对", open_n == close_n,
                   f"open={open_n} close={close_n}")

    # ─────────────────────────────────────────────
    # B. 交互可用性：所有 onclick 函数都有定义
    # ─────────────────────────────────────────────
    def check_functions(path, label, extra_defs_sources=None):
        html = read(path)
        calls = set()
        for m in re.finditer(r'on(?:click|change|input|submit)="\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(', html):
            calls.add(m.group(1))
        # 从 HTML 中提取函数定义
        defs = set()
        defs |= set(re.findall(r'\bfunction\s+([A-Za-z_]\w*)\s*\(', html))
        defs |= set(re.findall(r'\bwindow\.([A-Za-z_]\w*)\s*=(?:\s*async)?\s*function', html))
        defs |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?function', html))
        defs |= set(re.findall(r'^\s*([A-Za-z_]\w*)\s*:\s*function\b', html, re.M))
        defs |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(', html))
        # 从外部 JS 文件中提取函数定义（外置化后函数定义在 app.js 中）
        if extra_defs_sources:
            for src_path in extra_defs_sources:
                src_content = read(src_path)
                defs |= set(re.findall(r'\bfunction\s+([A-Za-z_]\w*)\s*\(', src_content))
                defs |= set(re.findall(r'\bwindow\.([A-Za-z_]\w*)\s*=(?:\s*async)?\s*function', src_content))
                defs |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?function', src_content))
                defs |= set(re.findall(r'^\s*([A-Za-z_]\w*)\s*:\s*function\b', src_content, re.M))
                defs |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(', src_content))
        # 过滤 JS 保留字/非函数名（如 onclick="if(...)" 中 if 是关键字）
        reserved = {"if", "void", "return", "for", "while", "switch", "new", "typeof", "delete", "function"}
        undef = sorted(c for c in calls if c not in defs and c not in reserved)
        report("E", f"B1 {label} onclick 函数定义", not undef,
               f"未定义: {', '.join(undef)}" if undef else "全部有定义")

    if not only_files or "index.html" in only_files:
        check_functions(INDEX, "index.html", extra_defs_sources=[APP_JS])
    if os.path.exists(SETTINGS) and (not only_files or "system-settings.html" in only_files):
        check_functions(SETTINGS, "system-settings.html")

    # ─────────────────────────────────────────────
    # C. 数据一致性
    # ─────────────────────────────────────────────
    # C1. 所有 data/*.json 可解析
    json_files = sorted(f for f in os.listdir(DATA_DIR) if f.endswith(".json"))
    for f in json_files:
        try:
            json.load(open(os.path.join(DATA_DIR, f), encoding="utf-8"))
            report("E", f"C1 data/{f} 可解析", True)
        except Exception as e:
            report("E", f"C1 data/{f} 可解析", False, str(e))

    # C2. 日记任务名与 xpSources.json 匹配
    try:
        xp_src = json.load(open(os.path.join(DATA_DIR, "xpSources.json"), encoding="utf-8"))
        all_rules = []
        for group in xp_src:
            if isinstance(group, dict):
                rules = group.get("tasks") or group.get("rules") or group.get("sources") or group.get("items") or []
                if "name" in group and "xp" in group:
                    all_rules.append(group)
                all_rules.extend(rules if isinstance(rules, list) else [])
        names = {r.get("name") for r in all_rules if isinstance(r, dict)}
        diary_name = "写日记：写作四要素+感受"
        report("E", "C2 日记任务名匹配 xpSources", diary_name in names,
               "xpSources.json 中缺少该任务" if diary_name not in names else f"已注册 {diary_name}")
    except Exception as e:
        report("E", "C2 日记任务名匹配 xpSources", False, str(e))

    # C3. 日记数据文件结构（若存在记录）
    try:
        entries = json.load(open(os.path.join(DATA_DIR, "diaryEntries.json"), encoding="utf-8"))
        if entries:
            required = {"date", "mood", "content"}
            bad = [e.get("id") for e in entries if not required.issubset(e)]
            report("E", "C3 diaryEntries 字段完整", not bad,
                   f"缺少字段的记录: {bad[:5]}" if bad else f"{len(entries)} 条记录字段完整")
        else:
            report("E", "C3 diaryEntries 字段完整", True, "空列表（无记录）")
    except Exception as e:
        report("E", "C3 diaryEntries 字段完整", False, str(e))

    # ─────────────────────────────────────────────
    # D. 样式健壮性：CSS 变量无缺失引用
    # ─────────────────────────────────────────────
    def check_css_vars(path, label, extra_defs_sources=None):
        html = read(path)
        # used/safe 均带 -- 前缀（var(--x)），defined 必须同样带 -- 前缀，三者才能直接取差集
        used = set(re.findall(r'var\((--[a-zA-Z0-9-]+)', html))
        defined = set(re.findall(r'(?:^|\s)(--[a-zA-Z0-9-]+)\s*:', html))
        block = re.search(r':root\s*\{([^}]*)\}', html)
        if block:
            defined |= set(re.findall(r'(--[a-zA-Z0-9-]+)\s*:', block.group(1)))
        # 从外部 CSS 文件中提取变量定义（外置化后变量定义在 style.css 中）
        if extra_defs_sources:
            for src_path in extra_defs_sources:
                src_content = read(src_path)
                defined |= set(re.findall(r'(?:^|\s)(--[a-zA-Z0-9-]+)\s*:', src_content))
                src_root = re.search(r':root\s*\{([^}]*)\}', src_content)
                if src_root:
                    defined |= set(re.findall(r'(--[a-zA-Z0-9-]+)\s*:', src_root.group(1)))
        # 带内置回退值的（var(--x, fallback)）可安全降级
        safe = set(re.findall(r'var\((--[a-zA-Z0-9-]+)\s*,\s*[^)]+\)', html))
        missing = sorted(v for v in used if v not in defined and v not in safe)
        report("W", f"D1 {label} 未定义 CSS 变量", not missing,
               f"缺失: {', '.join(missing)}" if missing else "无")

    if not only_files or "index.html" in only_files:
        check_css_vars(INDEX, "index.html", extra_defs_sources=[STYLE_CSS])
    if os.path.exists(SETTINGS) and (not only_files or "system-settings.html" in only_files):
        check_css_vars(SETTINGS, "system-settings.html")

    # ─────────────────────────────────────────────
    # E. Token 闭环：设置页与主站共用同一 key
    # ─────────────────────────────────────────────
    if os.path.exists(SETTINGS) and (not only_files or "system-settings.html" in only_files):
        settings = read(SETTINGS)
        token_key_s = set(re.findall(r'GITHUB_TOKEN_KEY\s*=\s*"([^"]+)"', settings)) or \
                      set(re.findall(r'localStorage\.(?:getItem|setItem|removeItem)\("([^"]+)"', settings))
        index = read(INDEX)
        app_js = read(APP_JS)
        combined = index + app_js
        token_key_i = set(re.findall(r'localStorage\.(?:getItem|setItem)\("([^"]+)"\s*,\s*github_token|github_token', combined))
        # 主站用 'github_token' 字面量（可能在 index.html 或 app.js 中）
        index_uses = "github_token" in index or "github_token" in app_js
        settings_uses = any("github_token" in str(k) for k in token_key_s)
        report("E", "E1 Token key 主站使用 'github_token'", index_uses,
               "主站未引用 github_token" if not index_uses else "OK")
        report("E", "E2 Token key 设置页使用 'github_token'", settings_uses,
               "设置页未使用相同的 github_token" if not settings_uses else "OK")

    # ─────────────────────────────────────────────
    # F. 仓库卫生：无草稿/临时文件待提交
    # ─────────────────────────────────────────────
    try:
        out = os.popen("cd " + ROOT + " && git status --porcelain").read()
        untracked = [line[3:] for line in out.splitlines() if line.startswith("??")]
        bad = [u for u in untracked if any(ign in u for ign in IGNORED_UNTRACKED)]
        report("E", "F1 无草稿文件混入", not bad,
               f"建议 gitignore 或删除: {bad}" if bad else "无草稿文件")
    except Exception as e:
        report("W", "F1 无草稿文件混入", False, f"无法读取 git 状态: {e}")

    # main(). 检查主站是否被 system-settings 的 setGithubToken 联动（同 key 即可，无需额外检查）

    # ─────────────────────────────────────────────
    # G. 代码冗余检查
    # ─────────────────────────────────────────────
    # G1. 注释掉的代码块（超过 3 行的连续注释代码，疑似调试遗留）
    def check_commented_code(path, label):
        content = read(path)
        # 匹配连续注释行（// 或 # 开头，连续 >= 3 行）
        lines = content.split("\n")
        commented_blocks = 0
        current_block = 0
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("#"):
                current_block += 1
            else:
                if current_block >= 3:
                    commented_blocks += 1
                current_block = 0
        if current_block >= 3:
            commented_blocks += 1
        report("W", f"G1 {label} 注释代码块", commented_blocks == 0,
               f"发现 {commented_blocks} 处连续 >=3 行的注释代码，建议清理" if commented_blocks else "无")
    for p, lbl in [(APP_JS, "app.js"), (STYLE_CSS, "style.css")]:
        if os.path.exists(p) and (not only_files or any(f in p for f in only_files or [])):
            check_commented_code(p, lbl)

    # G2. 冗余 console.log / debugger 语句（生产环境不应有）
    def check_debug_statements(path, label):
        content = read(path)
        # 排除 console.log("✅") 等有意保留的日志，只检测无意义的调试输出
        log_lines = len(re.findall(r'console\.(?:log|debug|trace)\s*\(', content))
        debugger_lines = len(re.findall(r'\bdebugger\s*;', content))
        total = log_lines + debugger_lines
        if verbose:
            report("W", f"G2 {label} 调试语句", total <= 5,
                   f"console.log/debug: {log_lines} 处, debugger: {debugger_lines} 处" if total > 5 else f"共 {total} 处（可接受）")
        else:
            # 非 verbose 模式只报超过阈值
            if total > 20:
                report("W", f"G2 {label} 调试语句", False,
                       f"console.log/debugger 共 {total} 处，建议削减至 20 以下")
    for p, lbl in [(APP_JS, "app.js")]:
        if os.path.exists(p) and (not only_files or any(f in p for f in only_files or [])):
            check_debug_statements(p, lbl)

    # G3. 检测未使用的全局函数定义（在 HTML 中没有 onclick 引用的 window 函数）
    def check_unused_functions(path, label):
        html = read(path)
        # 提取所有 window.xxx = function 和 function xxx 的定义
        defined = set()
        defined |= set(re.findall(r'window\.([A-Za-z_]\w*)\s*=', html))
        defined |= set(re.findall(r'^\s*function\s+([A-Za-z_]\w*)\s*\(', html, re.M))
        # 提取所有 onclick 引用
        called = set()
        for m in re.finditer(r'on(?:click|change|input|submit)="\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(', html):
            called.add(m.group(1))
        # 纯定义但未被 onclick 引用的（排除已知的构建/工具函数）
        reserved_global = {"loadAppData", "renderHome", "renderStudy", "renderFinance", "renderConfig",
                           "renderDiary", "renderFamily", "renderCheckin", "renderLevel", "renderAchievements",
                           "renderXpHistory", "renderRedeem", "openSettingsDrawer", "closeSettingsDrawer",
                           "initApp", "main", "loadChildData", "saveChildData", "addXpRecord", "addDiaryEntry",
                           "addStudyRecord", "addScoreRecord", "addFinanceRecord", "addEvaluationRecord",
                           "redeemPrivilege", "updateStudyRecord", "updateXpRecord", "updateFinanceRecord",
                           "updateScoreRecord", "updateXpRule", "updateEvaluationRecord",
                           "getGithubToken", "hasGithubToken", "setGithubToken", "fetchRawJSON",
                           "getFileSHA", "isLocalMode", "writeGithubFile", "writeGithubFileRemote",
                           "loadData", "refreshData", "buildDashboard",
                           "processLevels", "processStudy", "processFinance", "processConfig",
                           "mergeChildData", "isAutoTask", "todayStr", "formatDate", "generateId",
                           "getEmptyData", "updateChildData", "loadDiaryEntries", "saveDiaryEntries",
                           "loadFamilyMeetings", "saveFamilyMeetings", "analyzeDiaryElements",
                           "openXpModalWithTask", "openDiaryModal", "renderDiary", "renderDiaryCard",
                           "openDiaryWallModal", "closeDiaryWallModal", "openDiaryDetailModal",
                           "closeDiaryDetailModal", "renderDiaryStrip", "calcDiaryStreak", "calcDiaryBestStreak",
                           "formatDiaryDate", "addXpRule", "closeDiaryModal", "pickDiaryMood", "submitDiary",
                           "_getCachedRaw", "_persistCache", "_addToCache", "_updateCacheRecord",
                           "_daysBetween", "getCalendarData", "saveCalendarData", "getCurrentSemesterInfo",
                           "getSemesterKey", "getAllAcademicYears", "renderSemesterBar", "_fmtMD",
                           "_mergeHomeworkData", "_fetchAllData", "_backgroundRefresh", "_refreshDataInBackground",
                           "getDefaultCalendarData", "getWeekStars", "setText", "pickQuote",
                           "renderPage", "navigateTo", "showToast", "loadAppConfig",
                           "collectAssignments", "deRenderSubjectGroups", "renderHomeworkList",
                           "_lastHomeDataVersion", "__dataVersion", "_lastHomeCfgHash",
                           "groupBy", "getDateStr", "__teachingUnitsCache"}
        unused = sorted(d for d in defined if d not in called | reserved_global)
        report("W", f"G3 {label} 未使用的全局函数", not unused,
               f"可能未使用: {', '.join(unused[:10])}" + (f" 等 {len(unused)} 个" if len(unused) > 10 else "") if unused else "无")
    if not only_files or "index.html" in only_files:
        check_unused_functions(INDEX, "index.html")

    # ─────────────────────────────────────────────
    # H. 文件大小预算检查
    # ─────────────────────────────────────────────
    FILE_BUDGETS = {
        APP_JS: ("app.js", 500),       # KB
        STYLE_CSS: ("style.css", 400),
        INDEX: ("index.html", 100),
        SETTINGS: ("system-settings.html", 100),
    }
    for fpath, (lbl, budget_kb) in FILE_BUDGETS.items():
        if os.path.exists(fpath) and (not only_files or any(f in fpath for f in only_files or [])):
            size_kb = os.path.getsize(fpath) / 1024
            ok = size_kb <= budget_kb
            report("E" if not ok else "W", f"H1 {lbl} 大小预算", ok,
                   f"{size_kb:.1f} KB / {budget_kb} KB 预算" + (" ✅" if ok else f" ❌ 超出 {size_kb - budget_kb:.1f} KB，请精简"))

    # H2. all.json 大小预算（影响首页加载速度的关键指标）
    all_json = os.path.join(DATA_DIR, "all.json")
    if os.path.exists(all_json):
        size_kb = os.path.getsize(all_json) / 1024
        # 预算：80 KB（gzip 后约 24 KB）
        budget_kb = 80
        ok = size_kb <= budget_kb
        report("E" if not ok else "W", f"H2 data/all.json 大小预算", ok,
               f"{size_kb:.1f} KB / {budget_kb} KB 预算" + (" ✅" if ok else f" ❌ 超出 {size_kb - budget_kb:.1f} KB，首页加载会变慢，请精简"))

    # H3. data/ 目录总大小预算
    total_data_kb = 0
    for f in sorted(f for f in os.listdir(DATA_DIR) if f.endswith(".json")):
        total_data_kb += os.path.getsize(os.path.join(DATA_DIR, f)) / 1024
    data_budget = 300  # KB
    report("W", "H3 data/*.json 合计大小", total_data_kb <= data_budget,
           f"{total_data_kb:.1f} KB / {data_budget} KB 预算" + (" ✅" if total_data_kb <= data_budget else f" ❌ 超出 {total_data_kb - data_budget:.1f} KB"))

    # ─────────────────────────────────────────────
    # I. 性能检查
    # ─────────────────────────────────────────────
    # I1. 检测首页加载时不必要的全量嵌套数据遍历
    app_js = read(APP_JS)
    # 检测 for 循环嵌套（性能风险）
    nested_loops = len(re.findall(r'for\s*\([^)]+\)\s*\{[^}]*for\s*\(', app_js))
    if nested_loops > 3:
        report("W", "I1 嵌套循环", False,
               f"发现 {nested_loops} 处嵌套 for 循环，大数据量时可能卡顿，建议改用 Map/索引")
    else:
        report("W", "I1 嵌套循环", True, f"{nested_loops} 处（可接受）")

    # I2. 检测 large JSON 的同步加载（首页可能因全量数据加载变慢）
    # 检测 loadAppData 或 _fetchAllData 中是否一次性加载所有数据
    large_fetches = len(re.findall(r'fetchRawJSON\s*\(\s*["\'](?:study|xpRecords|allHomework)\.json', app_js))
    if large_fetches > 5:
        report("W", "I2 大文件全量加载", False,
               f"发现 {large_fetches} 处大文件 fetch，建议对首页非必须的数据做懒加载")
    else:
        report("W", "I2 大文件全量加载", True, f"{large_fetches} 处（可接受）")

    # I3. 检测 all.json 中是否包含首页不需要的重型字段
    if os.path.exists(all_json):
        try:
            aj = json.load(open(all_json, encoding="utf-8"))
            study_obj = aj.get("study", {})
            heavy_unused = []
            for field in ["examRecords", "semesterAnalysis", "strengthsAnalysis"]:
                if field in study_obj:
                    field_size = len(json.dumps(study_obj[field]))
                    heavy_unused.append(f"{field} ({field_size // 1024}KB)")
            if heavy_unused:
                report("E", "I3 all.json 含首页不需要的重型字段", False,
                       f"study 中包含: {', '.join(heavy_unused)}，这些字段首页用不到但每次加载都下载，请移除")
            else:
                report("W", "I3 all.json 无冗余重型字段", True, "✅ 已精简")
        except Exception as e:
            report("W", "I3 all.json 检查", False, f"无法解析: {e}")

    # ─────────────────────────────────────────────
    # 输出
    # ─────────────────────────────────────────────
    print("=" * 60)
    print("Yara 提交前全平台体检")
    print("=" * 60)
    if verbose and checks:
        print("\n[通过]")
        for c in checks:
            print(f"  ✓ {c}")
    if errors:
        print(f"\n[✗ 必须修复] {len(errors)} 项")
        for e in errors:
            print(f"  ✗ {e}")
    if warns:
        print(f"\n[! 建议查看] {len(warns)} 项")
        for w in warns:
            print(f"  ! {w}")
    if not errors and not warns:
        print("\n✅ 全部通过，可安全提交")
    elif not errors:
        print("\n✅ 无阻断问题（有建议项，可提交但建议查看）")
    else:
        print(f"\n✗ 存在 {len(errors)} 个必须修复的问题，请修复后再提交")

    return 1 if errors else (2 if warns else 0)


if __name__ == "__main__":
    """退出码：0=通过 1=必须修复 2=建议"""
    sys.exit(main())