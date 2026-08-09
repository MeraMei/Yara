#!/usr/bin/env bash
# sync.sh — 一键同步：飞书原始数据 → data/*.json 并校验
# 用法：bash scripts/sync.sh（在 github-deploy 根目录）或  直接 ./sync.sh
set -e
cd "$(dirname "$0")"

echo "════════════════════════════════════════"
echo " 步骤 1/3：从飞书拉取原始数据 (dump-tables.py)"
echo "════════════════════════════════════════"
python3 dump-tables.py

echo ""
echo "════════════════════════════════════════"
echo " 步骤 2/3：生成 data/*.json (migrate-feishu.js)"
echo "════════════════════════════════════════"
node migrate-feishu.js

echo ""
echo "════════════════════════════════════════"
echo " 步骤 3/3：校验数据一致性 (validate-migration.js)"
echo "════════════════════════════════════════"
node validate-migration.js

echo ""
echo "✅ 同步完成。请在仓库根目录提交 data/ 变更。"