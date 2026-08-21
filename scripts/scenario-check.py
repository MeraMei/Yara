#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scenario-check.py — 上传前【场景化】检查
由 upload.sh 统一调用，与 pre-commit-check.py（全平台体检）互补。

职责（按改动场景触发，避免每次无谓地跑全部）：
  必跑（只要相关类型文件有改动就查）：
    S1 语法     .html/.js/.py/.sh 语法校验
    S2 空文件   改动文件不得为 0 字节
    S3 编码     UTF-8 可解码 + 无 BOM
    S4 敏感信息 不得混入 token / 私钥（data/ 与已 ignore 的除外）
  按场景：
    S5 移动端UI 有 UI/样式文件改动时，提示人工抽查移动端（无法自动，仅提醒）

用法（仓库根目录）:
    python3 scripts/scenario-check.py [--verbose]

退出码:
    0 = 全部通过（或通过 + 建议项）
    1 = 存在必须修复的问题

注：data/ 下是线上数据库，由 git add 的 data 隔离逻辑控制，不在此扫描范围内，
    以免误把合法数据 JSON 里的内容当成敏感泄漏。
"""

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 跳过扫描的目录/文件（设计草稿、中间产物、数据库）
SKIP = {
    ".superpowers",
    "__pycache__",
    ".git",
    "diary-fusion.html",
    "diary-preview.html",
    "scripts/raw",
}
# 敏感信息正则（覆盖最常见 token / 私钥形态）
SENSITIVE_PATTERNS = [
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),                    # GitHub personal token
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),            # GitHub fine-grained token
    re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
    re.compile(r"AKIA[0-9A-Z]{16}"),                         # AWS access key
    re.compile(r"sk-[A-Za-z0-9]{20,}"),                      # OpenAI 等 key
    re.compile(r"\bAPCA[A-Za-z0-9]{6,}\b"),                  # Alpaca 等
]
# 需做语法检查的后缀
SYNTAX = {".html", ".js", ".mjs", ".py", ".sh"}


def changed_files():
    """返回相对仓库根目录的改动文件列表（已排除 SKIP 与 data/）。"""
    out = subprocess.run(
        ["git", "-c", "core.quotepath=false", "status", "--porcelain"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout
    files = []
    for line in out.splitlines():
        if not line:
            continue
        # 状态码 + 文件名（处理 rename 形式 "R  old -> new"）
        rest = line[3:].strip()
        if " -> " in rest:
            rest = rest.split(" -> ")[-1]
        files.append(rest)
    result = []
    for f in files:
        parts = f.replace(os.sep, "/").split("/")
        if any(p in SKIP for p in parts):
            continue
        if f.startswith("data/"):
            continue
        result.append(f)
    return result


def check_syntax(files, verbose):
    """S1 语法校验：按后缀交给对应解释器。返回错误列表。"""
    errs = []
    for f in files:
        path = os.path.join(ROOT, f)
        if not os.path.exists(path):
            continue
        ext = os.path.splitext(f)[1].lower()
        if ext in (".js", ".mjs"):
            r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
            if r.returncode != 0:
                errs.append(f"S1 语法 node --check {f}: {r.stderr.strip()[:300]}")
        elif ext == ".py":
            r = subprocess.run([sys.executable, "-m", "py_compile", path], capture_output=True, text=True)
            if r.returncode != 0:
                errs.append(f"S1 语法 py_compile {f}: {r.stderr.strip()[:300]}")
        elif ext == ".sh":
            r = subprocess.run(["bash", "-n", path], capture_output=True, text=True)
            if r.returncode != 0:
                errs.append(f"S1 语法 bash -n {f}: {r.stderr.strip()[:300]}")
        elif ext == ".html":
            # HTML 结构粗检：每个顶级标签闭合（下沉到 pre-commit 全量；此处只提示非阻断）
            if verbose:
                print(f"  (S1) {f}: HTML 交 pre-commit-check.py 全量体检")
    return errs


def check_empty(files, verbose):
    """S2 空文件：0 字节 报错。"""
    errs = []
    for f in files:
        path = os.path.join(ROOT, f)
        if not os.path.exists(path):
            continue
        if os.path.getsize(path) == 0:
            errs.append(f"S2 空文件: {f} 为 0 字节，禁止上传空文件")
    return errs


def check_encoding(files, verbose):
    """S3 编码：UTF-8 可解码 + 无 BOM。跳过二进制/图片。"""
    errs = []
    BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
                  ".ttf", ".mp4", ".pdf"}
    for f in files:
        path = os.path.join(ROOT, f)
        if not os.path.exists(path):
            continue
        if os.path.splitext(f)[1].lower() in BINARY_EXT:
            continue
        with open(path, "rb") as fh:
            raw = fh.read()
        if raw.startswith(b"\xef\xbb\xbf"):
            errs.append(f"S3 编码: {f} 含 UTF-8 BOM，应去掉")
        try:
            raw.decode("utf-8")
        except UnicodeDecodeError as e:
            errs.append(f"S3 编码: {f} 非 UTF-8 编码（{e}）")
    return errs


def check_sensitive(files, verbose):
    """S4 敏感信息：改动文件里不得混入 token / 私钥。"""
    errs = []
    for f in files:
        path = os.path.join(ROOT, f)
        if not os.path.exists(path) or os.path.isdir(path):
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                content = fh.read()
        except Exception:
            continue
        for pattern in SENSITIVE_PATTERNS:
            m = pattern.search(content)
            if m:
                # 打码后展示，避免在输出里再泄一次
                secret = m.group(0)
                masked = secret[:6] + "…" + secret[-4:] if len(secret) > 12 else "***"
                errs.append(f"S4 敏感信息: {f} 疑似泄露密钥（{masked}），禁止提交")
                break
    return errs


def check_mobile_ui(files, verbose):
    """S5 移动端 UI 抽查：有 UI/样式文件改动时提示人工抽查。返回警告列表。"""
    wants = [".html", ".css", ".js"]
    hints = [f for f in files if os.path.splitext(f)[1].lower() in wants]
    if not hints:
        return []
    return [
        f"S5 移动端UI: 上述 {len(hints)} 个 UI 文件有改动，请人工在手机/窄屏抽查移动端显示（无法自动判定）"
    ]


def main():
    verbose = "--verbose" in sys.argv
    files = changed_files()

    print("=" * 60)
    print("Yara 场景化检查（scenario-check.py）")
    print("=" * 60)

    if not files:
        print("  ✓ 无相关代码文件改动，跳过场景化检查。")
        return 0

    print(f"  待检文件 ({len(files)}): {', '.join(files)}")
    print()

    errors = []
    warns = []

    errors += check_syntax(files, verbose)
    errors += check_empty(files, verbose)
    errors += check_encoding(files, verbose)
    errors += check_sensitive(files, verbose)
    warns += check_mobile_ui(files, verbose)

    # 敏感信息/语法是"每次相关改动必跑"，属于必跑项；UI 抽查为按场景提醒
    if errors:
        print(f"\n[✗ 必须修复] {len(errors)} 项")
        for e in errors:
            print(f"  ✗ {e}")
        print("\n  请修复以上问题后再上传。")
        return 1

    print("  ✓ 语法 / 空文件 / 编码 / 敏感信息 检查全部通过。")
    if warns:
        print(f"\n[! 建议关注] {len(warns)} 项")
        for w in warns:
            print(f"  ! {w}")
    print()
    print("  场景化检查通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())