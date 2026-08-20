#!/usr/bin/env bash
# upload.sh — 一键上传：本地测试通过后，把代码与数据推送到 GitHub 线上
#
# 用法：
#   bash scripts/upload.sh "提交说明"                 # 仅上传代码，跳过 data/（推荐）
#   bash scripts/upload.sh --with-data "同步数据"     # 代码 + data/ 一起上传
#   bash scripts/upload.sh --yes --with-data "说明"   # 跳过确认，代码 + 数据一起上传
#   bash scripts/upload.sh --yes "说明"               # 跳过确认，仅代码
#
# 默认行为（重要）：
#   - 默认只提交代码、样式、脚本等，自动排除 data/，确保“上传最新版本不影响线上数据库”。
#   - 本地测试对 data/ 的写入不会被误推上线。
#   - 只有显式加 --with-data 时，才会把 data/ 一起推送到 GitHub，用于主动更新线上数据库。
#
# 前置条件：
#   1. 本地测试已通过（node scripts/local-server.js 启动，浏览器验证 OK）
#   2. 用户已明确确认"可以上传/上线/推送"
#
# 安全机制：
#   - 上传前自动检查是否有未提交的本地改动
#   - 上传前提示确认（除非 --yes）
#   - 上传后验证线上版本号
set -e

cd "$(dirname "$0")/.."

COMMIT_MSG="更新：本地测试通过后的代码"
WITH_DATA=0
FORCE=""
for arg in "$@"; do
  case "$arg" in
    --yes) FORCE="--yes" ;;
    --with-data) WITH_DATA=1 ;;
    --*) echo "未知选项: $arg"; exit 1 ;;
    *) COMMIT_MSG="$arg" ;;
  esac
done

echo "════════════════════════════════════════"
echo " 步骤 1/4：检查 Git 状态"
echo "════════════════════════════════════════"
git status --short
echo ""
echo "当前分支: $(git branch --show-current)"
echo "远程: $(git remote get-url origin)"

# 检查是否有未提交改动
if [ -z "$(git status --porcelain)" ]; then
  echo "⚠️  没有检测到任何改动，无需上传。"
  exit 0
fi

echo ""
echo "════════════════════════════════════════"
echo " 步骤 2/4：确认上传"
echo "════════════════════════════════════════"
if [ "$FORCE" != "--yes" ]; then
  read -r -p "确认将以上改动推送到 GitHub 线上？(y/N) " answer
  case "$answer" in
    y|Y|yes|YES) echo "已确认，继续上传..." ;;
    *) echo "已取消上传。"; exit 0 ;;
  esac
fi

echo ""
echo "════════════════════════════════════════"
echo " 步骤 3/4：提交并推送"
echo "════════════════════════════════════════"
if [ "$WITH_DATA" = "1" ]; then
  echo "  ✓ 本次将同时上传代码和 data/（--with-data）"
  # 重新生成 all.json（合并数据文件，加速首页加载）
  echo "  → 重新生成 data/all.json ..."
  node -e "
    const fs = require('fs');
    const path = require('path');
    const dataDir = 'data';
    const files = ['child.json', 'calendar.json', 'levels.json', 'xpRecords.json', 'finance.json', 'study.json', 'config.json', 'xpSources.json', 'redeemRecords.json', 'diaryEntries.json', 'aiWeeklyReports.json', 'familyMeetings.json'];
    const combined = {};
    for (const f of files) {
      try { combined[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')); } catch (e) {}
    }
    const result = { child: combined.child || {}, calendar: combined.calendar || [], levels: combined.levels || [], xpRecords: combined.xpRecords || [], finance: combined.finance || null, study: combined.study || null, config: combined.config || null, xpSources: combined.xpSources || [], redeemRecords: combined.redeemRecords || [], diaryEntries: combined.diaryEntries || [], aiWeeklyReports: combined.aiWeeklyReports || [], familyMeetings: combined.familyMeetings || [] };
    fs.writeFileSync(path.join(dataDir, 'all.json'), JSON.stringify(result));
    console.log('     all.json 已生成 (' + (Buffer.byteLength(JSON.stringify(result)) / 1024).toFixed(1) + ' KB)');
  "
  git add -A
else
  echo "  ✓ 默认模式：仅上传代码/样式/脚本，跳过 data/（不影响线上数据库）"
  # 排除 data/：对已跟踪的 data 文件排除其改动；对未跟踪的忽略文件，git add 的
  # 退出码为 1（仅提示 ignored path），故用 || true 规避 set -e 中断，暂存结果依然正确。
  git -c advice.addIgnoredFile=false add -A -- . ':(exclude)data' || true
fi
git commit -m "$COMMIT_MSG"
git push origin "$(git branch --show-current)"

echo ""
echo "════════════════════════════════════════"
echo " 步骤 4/4：验证线上版本"
echo "════════════════════════════════════════"
git fetch origin
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$(git branch --show-current)")
echo "本地提交: $LOCAL_SHA"
echo "线上提交: $REMOTE_SHA"
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "✅ 上传成功，线上版本与本地一致。"
else
  echo "⚠️  版本不一致，请检查。"
fi

echo ""
echo "✅ 上传完成。GitHub Pages 将在 1-2 分钟内自动更新。"
echo "   线上地址: https://meramei.github.io/Yara/"
echo "   注意: 线上访问时数据自动走 GitHub 模式（无需 Token 即可读取）。"
