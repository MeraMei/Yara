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

    if not only_files or "system-settings.html" in only_files:
        html = read(SETTINGS)
        for tag in ["html", "body"]:
            open_n = len(re.findall(rf"<{tag}[\s>]", html))
            close_n = len(re.findall(rf"</{tag}>", html))
            report("E", f"A1 system-settings.html <{tag}> 配对", open_n == close_n,
                   f"open={open_n} close={close_n}")

    # ─────────────────────────────────────────────
    # B. 交互可用性：所有 onclick 函数都有定义
    # ─────────────────────────────────────────────
    def check_functions(path, label):
        html = read(path)
        calls = set()
        for m in re.finditer(r'on(?:click|change|input|submit)="\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(', html):
            calls.add(m.group(1))
        # window.xxx = function / function xxx / const xxx = () => / xxx: function
        defs = set()
        defs |= set(re.findall(r'\bfunction\s+([A-Za-z_]\w*)\s*\(', html))
        defs |= set(re.findall(r'\bwindow\.([A-Za-z_]\w*)\s*=(?:\s*async)?\s*function', html))
        defs |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?function', html))
        defs |= set(re.findall(r'^\s*([A-Za-z_]\w*)\s*:\s*function\b', html, re.M))
        defs |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(', html))
        # 过滤 JS 保留字/非函数名（如 onclick="if(...)" 中 if 是关键字）
        reserved = {"if", "void", "return", "for", "while", "switch", "new", "typeof", "delete", "function"}
        undef = sorted(c for c in calls if c not in defs and c not in reserved)
        report("E", f"B1 {label} onclick 函数定义", not undef,
               f"未定义: {', '.join(undef)}" if undef else "全部有定义")

    if not only_files or "index.html" in only_files:
        check_functions(INDEX, "index.html")
    if not only_files or "system-settings.html" in only_files:
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
    def check_css_vars(path, label):
        html = read(path)
        # used/safe 均带 -- 前缀（var(--x)），defined 必须同样带 -- 前缀，三者才能直接取差集
        used = set(re.findall(r'var\((--[a-zA-Z0-9-]+)', html))
        defined = set(re.findall(r'(?:^|\s)(--[a-zA-Z0-9-]+)\s*:', html))
        block = re.search(r':root\s*\{([^}]*)\}', html)
        if block:
            defined |= set(re.findall(r'(--[a-zA-Z0-9-]+)\s*:', block.group(1)))
        # 带内置回退值的（var(--x, fallback)）可安全降级
        safe = set(re.findall(r'var\((--[a-zA-Z0-9-]+)\s*,\s*[^)]+\)', html))
        missing = sorted(v for v in used if v not in defined and v not in safe)
        report("W", f"D1 {label} 未定义 CSS 变量", not missing,
               f"缺失: {', '.join(missing)}" if missing else "无")

    if not only_files or "index.html" in only_files:
        check_css_vars(INDEX, "index.html")
    if not only_files or "system-settings.html" in only_files:
        check_css_vars(SETTINGS, "system-settings.html")

    # ─────────────────────────────────────────────
    # E. Token 闭环：设置页与主站共用同一 key
    # ─────────────────────────────────────────────
    if not only_files or "system-settings.html" in only_files:
        settings = read(SETTINGS)
        token_key_s = set(re.findall(r'GITHUB_TOKEN_KEY\s*=\s*"([^"]+)"', settings)) or \
                      set(re.findall(r'localStorage\.(?:getItem|setItem|removeItem)\("([^"]+)"', settings))
        index = read(INDEX)
        token_key_i = set(re.findall(r'localStorage\.(?:getItem|setItem)\("([^"]+)"\s*,\s*github_token|github_token', index))
        # 主站用 'github_token' 字面量
        index_uses = "github_token" in index
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