#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# install-hooks.sh — Yara 成长工作台 · 安装提交前体检钩子
#
# 把带版本的 scripts/hooks/pre-commit 安装到 .git/hooks/pre-commit，
# 使 git commit 自动触发全平台体检（不通过则拒绝提交）。
#
# 用法：
#   bash scripts/install-hooks.sh           # 安装（软链，便于后续免重装）
#   bash scripts/install-hooks.sh --copy    # 安装（复制模式，跨机器更稳）
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/scripts/hooks/pre-commit"
DST="$ROOT/.git/hooks/pre-commit"

if [ ! -d "$ROOT/.git" ]; then
    echo "✗ 当前目录不是 git 仓库（缺少 .git），无法安装钩子。" >&2
    exit 1
fi
if [ ! -f "$SRC" ]; then
    echo "✗ 找不到钩子源文件: $SRC" >&2
    exit 1
fi

MODE="link"
if [ "${1:-}" = "--copy" ]; then
    MODE="copy"
fi

if [ -e "$DST" ] && [ ! -L "$DST" ]; then
    # 已存在一个真实文件（可能是旧版手写钩子），备份后覆盖
    cp "$DST" "$DST.bak.$(date +%s)" 2>/dev/null || true
    echo "· 已备份旧钩子到 $DST.bak.*"
fi

if [ "$MODE" = "link" ]; then
    ln -sf "$SRC" "$DST"
else
    cp "$SRC" "$DST"
fi
chmod +x "$DST" "$SRC" 2>/dev/null || true

echo "✅ 已安装提交前体检钩子 → $DST（$MODE 模式）"
echo "   之后每次 git commit 都会自动执行全平台体检。"
echo "   验证：直接 git commit 即可；如需临时跳过用 --no-verify。"