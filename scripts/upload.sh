#!/usr/bin/env bash
# upload.sh — 上传脚本：默认【安全模式】，仅在用户明确授权后才会推送 GitHub 线上
#
# 用法（新约定，默认绝不 push）：
#   bash scripts/upload.sh "说明"                 # 【安全模式】仅本地体检 + 提交前检查，绝不 push
#   bash scripts/upload.sh --push "说明"          # 需要推送时：显式开启 push 方向闸
#   bash scripts/upload.sh --push --auth "确认词"  # 推送前必须额外通过【授权闸】
#   bash scripts/upload.sh --with-data --push --auth "确认词"   # 代码 + data/ 一起推送
#
# 两道闸（防止未经用户确认就擅自推送 GitHub）：
#   ┌─ 第一道【方向闸】────────────────────────────────────────────
#   │ 脚本默认【安全模式】：只做本地体检/提交前检查，绝不 push。
#   │ 必须显式加 --push 才会进入“提交并推送”环节。
#   │ 目的：即使误运行，也只会做本地验证，不会误推线上。
#   └────────────────────────────────────────────────────────────
#   ┌─ 第二道【授权闸】────────────────────────────────────────────
#   │ 进入 --push 后，还必须提供用户签发的确认词，即用户在对话里
#   │ 说的“可以上传 / 确认上传 / 上传到GitHub”等授权信号。
#   │ 没有它：exit 1 拒绝推送。目的：物理上锁死“未经授权硬推”。
#   └────────────────────────────────────────────────────────────
# 前置条件：
#   1. 本地测试已通过（node scripts/local-server.js 启动，浏览器验证 OK）
#   2. 用户已明确确认"可以上传/上线/推送"（把该授权交给 AI 作为 --auth 参数传入）
#
# 安全机制（保留并强化）：
#   - 默认不 push，必须 --push
#   - push 前必须 --auth 带上用户授权词
#   - push 前自动运行提交前体检（pre-commit-check.py），失败则阻断
#   - push 后验证线上版本号
set -e

cd "$(dirname "$0")/.."

# ═══ 默认【安全模式】：绝不 push，除非显式 --push ═══
PUSH=0
WITH_DATA=0
AUTH=""
COMMIT_MSG=""
FORCE=""

# 用下标循环解析参数（避免 for in "$@" 快照 + shift 导致 --auth 值抓取错位）
args=("$@")
_idx=0
while [ "$_idx" -lt "${#args[@]}" ]; do
  _arg="${args[$_idx]}"
  case "$_arg" in
    --push) PUSH=1 ;;
    --with-data) WITH_DATA=1 ;;
    --yes|--force) FORCE="--yes" ;;
    --auth)
      # 取下一个参数作为授权词；兼容 "--auth xxx"
      _idx=$((_idx + 1))
      if [ "$_idx" -lt "${#args[@]}" ]; then
        AUTH="${args[$_idx]}"
      fi
      ;;
    --auth=*) AUTH="${_arg#--auth=}" ;;
    --*) echo "未知选项: $_arg"; echo "可用: --push --with-data --auth <确认词> [提交说明]"; exit 1 ;;
    *) COMMIT_MSG="$_arg" ;;
  esac
  _idx=$((_idx + 1))
done
unset _idx _arg
[ -z "$COMMIT_MSG" ] && COMMIT_MSG="更新：本地测试通过后的代码"

echo "════════════════════════════════════════"
echo " Yara 上传脚本 · 安全模式"
echo "════════════════════════════════════════"
if [ "$PUSH" = "1" ]; then
  echo "  ▶ 已开启【方向闸】--push：本次允许进入“提交并推送”环节"
else
  echo "  ●【安全模式】未加 --push：仅做本地体检/提交前检查，绝不推送 GitHub"
fi
echo ""

# ═══ 步骤 1/4：检查 Git 状态 ═══
echo "════════════════════════════════════════"
echo " 步骤 1/4：检查 Git 状态"
echo "════════════════════════════════════════"
git status --short
echo ""
echo "当前分支: $(git branch --show-current)"
# 只显示远程 host，绝不打印 remote URL（其内嵌了 token，泄露即被盗用）
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
# 先剥离 URL 里的 user:pass@ 凭证段，再取 host
REMOTE_CLEAN=$(printf '%s' "$REMOTE_URL" | sed -E 's#(https?://)[^/@]*@#\1#')
REMOTE_HOST=$(printf '%s' "$REMOTE_CLEAN" | sed -E 's#(https?://[^/]+).*#\1#')
if [ -z "$REMOTE_HOST" ]; then
  REMOTE_HOST="$REMOTE_CLEAN"
fi
echo "远程 host: ${REMOTE_HOST:-未知}"

# 检查是否有未提交改动
if [ -z "$(git status --porcelain)" ]; then
  echo "⚠️  没有检测到任何改动，无需处理。"
  exit 0
fi

# ═══ 步骤 2/4：提交前体检（无论是否 push 都跑）═══
echo ""
echo "════════════════════════════════════════"
echo " 步骤 2/4：运行提交前体检"
echo "════════════════════════════════════════"
if [ -f scripts/pre-commit-check.py ]; then
  RC=0
  python3 scripts/pre-commit-check.py || RC=$?
  if [ "$RC" -eq 1 ]; then
    echo ""
    echo "❌ 提交前体检存在【必须修复】问题，阻断上传。请修复后重试。"
    exit 1
  elif [ "$RC" -eq 2 ]; then
    echo ""
    echo "! 体检有【建议项】未阻断，继续。（可用 git commit --no-verify 跳过）"
  fi
else
  echo "  ⚠️ 未找到 scripts/pre-commit-check.py，跳过体检。"
fi

# ═══ 步骤 2.5/4：场景化检查（语法/空文件/编码/敏感信息/移动端UI）═══
echo ""
echo "════════════════════════════════════════"
echo " 步骤 2.5/4：运行场景化检查"
echo "════════════════════════════════════════"
if [ -f scripts/scenario-check.py ]; then
  RC=0
  python3 scripts/scenario-check.py || RC=$?
  if [ "$RC" -eq 1 ]; then
    echo ""
    echo "❌ 场景化检查存在【必须修复】问题，阻断上传。请修复后重试。"
    exit 1
  fi
else
  echo "  ⚠️ 未找到 scripts/scenario-check.py，跳过场景化检查。"
fi

# ═══ 若未 --push，到此为止（仅本地体检，不回退到 push）═══
if [ "$PUSH" != "1" ]; then
  echo ""
  echo "════════════════════════════════════════"
  echo " ✅【安全模式】本地体检完成，未推送 GitHub。"
  echo "    如需推送线上，请先获得用户授权后，再加 --push --auth \"确认词\" 运行。"
  echo "════════════════════════════════════════"
  exit 0
fi

# ═══ 步骤 3/4：授权闸（方向闸已开启，此处必须拿到用户授权词）═══
echo ""
echo "════════════════════════════════════════"
echo " 步骤 3/4：授权校验"
echo "════════════════════════════════════════"
# 授权词：用户在对话中明确说"可以上传/确认上传/上传到GitHub"等授权信号。
# AI 必须在用户确实授权后，把该授权信号作为 --auth <词> 传入本脚本。
# 这里要求授权词必须包含“上传”或“push”或“github”等授权语义，防止被随便填一个词糊弄。
if [ -z "$AUTH" ]; then
  echo "  ❌ 未收到用户授权词（--auth）。"
  echo "     安全模式拒绝推送。请先获得用户明确授权，再加 --auth \"授权词\"。"
  echo ""
  echo "════════════════════════════════════════"
  echo " ✗ 未被授权，取消推送（不会推送到 GitHub）。"
  echo "════════════════════════════════════════"
  exit 1
fi
# 授权语义校验：授权词需体现"上传/确认"的语义。
# 正则匹配：含有 上传 / push / github / 推送 / 上线 之一即视为含授权语义。
if ! echo "$AUTH" | grep -qiE "上传|推送|上线|push|github|confirm|确认|upload"; then
  echo "  ❌ 授权词 \"$AUTH\" 不含授权语义（上传/推送/上线/push等）。"
  echo "     安全模式拒绝推送。"
  echo "════════════════════════════════════════"
  exit 1
fi
echo "  ✅ 已通过授权校验，确认携带用户授权信号，允许推送。"

# 进入 push 方向的二次交互确认（除非 --yes/--force 且已带授权）
if [ "$FORCE" != "--yes" ]; then
  read -r -p "你已授权上传，但在最终 push 前再确认一次：推送 GitHub 线上？(y/N) " answer
  case "$answer" in
    y|Y|yes|YES) echo "已确认，执行推送..." ;;
    *) echo "已取消推送。"; exit 0 ;;
  esac
fi

# ═══ 步骤 3.5/4：提交 ═══
echo ""
echo "════════════════════════════════════════"
echo " 步骤 3.5/4：提交并推送"
echo "════════════════════════════════════════"
if [ "$WITH_DATA" = "1" ]; then
  echo "  ✓ 本次将同时上传代码和 data/（--with-data）"
  # 重新生成 all.json（精简版：去掉首页不需要的重型字段，如 examRecords 等）
  echo "  → 重新生成 data/all.json（精简版）..."
  node -e "
    const fs = require('fs');
    const path = require('path');
    const dataDir = 'data';
    const files = ['child.json', 'calendar.json', 'levels.json', 'xpRecords.json', 'finance.json', 'study.json', 'config.json', 'xpSources.json', 'redeemRecords.json', 'diaryEntries.json', 'aiWeeklyReports.json', 'familyMeetings.json'];
    const combined = {};
    for (const f of files) {
      try { combined[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')); } catch (e) {}
    }
    // 精简 study：首页不需要 examRecords/semesterAnalysis/strengthsAnalysis
    var study = combined.study || null;
    if (study) {
      study = Object.assign({}, study);
      delete study.examRecords;
      delete study.semesterAnalysis;
      delete study.strengthsAnalysis;
    }
    const result = { child: combined.child || {}, calendar: combined.calendar || [], levels: combined.levels || [], xpRecords: combined.xpRecords || [], finance: combined.finance || null, study: study, config: combined.config || null, xpSources: combined.xpSources || [], redeemRecords: combined.redeemRecords || [], diaryEntries: combined.diaryEntries || [], aiWeeklyReports: combined.aiWeeklyReports || [], familyMeetings: combined.familyMeetings || [] };
    fs.writeFileSync(path.join(dataDir, 'all.json'), JSON.stringify(result));
    const raw = Buffer.byteLength(JSON.stringify(result));
    const was = Buffer.byteLength(JSON.stringify(combined));
    const kb = (raw / 1024).toFixed(1);
    const pct = Math.round((1 - raw/was) * 100);
    console.log('     all.json 已生成 (' + kb + ' KB, 精简 ' + pct + '%, CDN gzip 后约 ' + (raw * 0.3 / 1024).toFixed(1) + ' KB)');
  " 2>&1
  git add -A --force data/all.json 2>/dev/null || true
  git add -A
else
  echo "  ✓ 默认模式：仅上传代码/样式/脚本，跳过 data/（不影响线上数据库）"
  # 排除 data/
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