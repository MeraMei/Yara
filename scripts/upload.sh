#!/usr/bin/env bash
# upload.sh — 一键上传：本地测试通过后，把代码与数据推送到 GitHub 线上
#
# 用法：
#   bash scripts/upload.sh "提交说明"      # 推荐：写明本次改动
#   bash scripts/upload.sh                 # 默认提交说明
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

COMMIT_MSG="${1:-更新：本地测试通过后的代码与数据}"
FORCE="${2:-}"

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
git add -A
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
