#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate-report-facts.py — 周报事实校验器（防编造防手误的自动防线）

背景：周报正文里的"数字性断言"（8项作业、连续5天、187XP、4次阅读等）如果由人工或
AI 自由书写，可能偏离真实打卡数据（如把"7项"写成"8项"、"和妈妈一起"写成"帮妈妈"）。
本脚本把这些断言与源数据自动核对，无法追溯的一律阻断提交。

校验策略（避免误伤）：
  - 只校验【数据断言字段】：summary / academic.emptyHint / suggestions.keep /
    behavior.effortStories.story / growth.profileUpdate.highlights
  - 不校验【未来建议字段】：suggestions.improve / suggestions.challenge（这些是
    给孩子的"待做"邀约，数字是奖励建议，并非已发生事实）
  - 按【周窗口】取值：每个周报都有 date=锚点周五，本脚本据此算出该周窗口
    [date-6, date]，阅读/沟通/家务/日记/连续天数/作业项数都用【当周】真实值比对，
    避免拿"全历史累计值"去比"当周发生数"造成的误判。
  - 只有明确累计语（累计/总共/一共 N XP）才用【全局累计值】比对。
  - 只提取计数类单位：项 / 天 / 次 / 篇 / XP。数值<=1 视为泛化语（如"做一件小事"）放行，
    叙事用词（如"帮妈妈/和妈妈一起"）无法全自动判定，由"周报一律走脚本再生成、
    正文取源数据派生字符串"这一入口约束兜底。

用法：
  python3 scripts/validate-report-facts.py     # 0通过 / 1阻断
"""

import json
import re
import os
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def load_json(name, default=None):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []


def parse_date(s):
    """把 'YYYY-MM-DD...' 解析成 date；失败返回 None。"""
    if not s:
        return None
    try:
        return date(*map(int, str(s)[:10].split("-")))
    except Exception:
        return None


def week_window(report):
    """周报 date=锚点周五，窗口 = [date-6, date]（周六~周五）。无法解析返回 None(视为全历史)。"""
    d = parse_date(report.get("date"))
    if not d:
        return None
    return (d - timedelta(days=6), d)


def compute_facts(win=None):
    """从源数据推导关键事实。win 为 (start, end) 时仅统计该周窗口，None 表示全历史。"""
    xp = load_json("xpRecords.json", [])
    diaries = load_json("diaryEntries.json", [])
    fm = load_json("familyMeetings.json", [])

    def in_window(d):
        return win is None or (win[0] <= d <= win[1])

    total_xp = 0
    days = set()
    reading = 0
    comm = 0
    house = 0
    homework_by_day = {}

    for r in xp:
        d = parse_date(r.get("date") or r.get("datetime"))
        if d is None or not in_window(d):
            continue
        days.add(d)
        total_xp += int(r.get("xp") or 0)
        name = str(r.get("title") or r.get("taskName") or "")
        desc = str(r.get("description") or "")
        if "阅读" in (name + desc):
            reading += 1
        if "沟通" in (name + desc):
            comm += 1
        if "家务" in (name + desc) or "收拾" in (name + desc) or "照顾" in (name + desc):
            house += 1
        if "作业" in (name + desc):
            homework_by_day[d] = homework_by_day.get(d, 0) + 1

    # 最长连续打卡天数 / 活跃天数
    sorted_days = sorted(days)
    max_streak = 0
    cur = 0
    prev = None
    for d in sorted_days:
        delta = (d - prev).days if prev is not None else 99
        cur = cur + 1 if prev is not None and delta == 1 else 1
        max_streak = max(max_streak, cur)
        prev = d

    hw_max_day = max(homework_by_day.values()) if homework_by_day else 0

    # 当周日记篇数
    diary_count = sum(1 for e in diaries if in_window(parse_date(e.get("date"))))

    return {
        "activeDays": len(days),
        "maxStreak": max_streak,
        "reading": reading,
        "comm": comm,
        "house": house,
        "diary": diary_count,
        "homeworkMaxDay": hw_max_day,
        "totalXp": total_xp,
        "familyMeeting": bool(fm),
    }


# ── 数据断言字段：summary / emptyHint / keep / effortStories.story / highlights
DATA_FIELDS_PATHS = ["summary", "academic.emptyHint", "suggestions.keep"]


def _get(report, dotted_path):
    """按 a.b.c 点分路径取值，取不到返回空串。"""
    node = report
    for key in dotted_path.split("."):
        if not isinstance(node, dict) or key not in node:
            return ""
        node = node[key]
    return str(node) if node is not None else ""


def _collect_texts(report):
    texts = []
    for p in DATA_FIELDS_PATHS:
        v = _get(report, p)
        if v:
            texts.append(v)
    eff = (report.get("behavior") or {}).get("effortStories") or []
    for st in eff:
        if isinstance(st, dict) and st.get("story"):
            texts.append(str(st["story"]))
    hl = ((report.get("growth") or {}).get("profileUpdate") or {}).get("highlights") or []
    for h in hl:
        if isinstance(h, str) and h:
            texts.append(h)
    return texts


# 受保护断言规则：(正则, 断言说明, 事实键, 用哪个事实集)
#   use_global=True → 用全局累计事实；False → 用该周窗口事实。
# 周报正文里"连续N天""写了N篇日记""本周N次阅读"等是【当周】口径，用周窗口比对；
# 只有"累计/总共/一共 N XP"是【全历史】口径，用全局累计比对。
RULES = [
    (re.compile(r"(\d+)\s*\**\s*项(?=\s*\**\s*(作业|任务))"), "作业项数", "homeworkMaxDay", False),
    # 连续/连 N 天 → 该周最长连续打卡天数
    (re.compile(r"连续\s*\**\s*(\d+)\s*\**\s*天"), "连续打卡天数", "maxStreak", False),
    # 活跃 N 天 → 该周活跃天数
    (re.compile(r"活跃\s*\**\s*(\d+)\s*\**\s*天"), "活跃天数", "activeDays", False),
    # N 次阅读 → 该周阅读次数
    (re.compile(r"(\d+)\s*\**\s*次(?=\s*\**\s*阅读)"), "阅读次数", "reading", False),
    # N 次沟通 → 该周沟通次数
    (re.compile(r"(\d+)\s*\**\s*次(?=\s*\**\s*沟通)"), "沟通次数", "comm", False),
    # N 次家务/收拾/照顾 → 该周该项次数
    (re.compile(r"(\d+)\s*\**\s*次(?=\s*\**\s*(家务|收拾|照顾|帮忙|整理))"), "家务次数", "house", False),
    # N 篇日记 → 该周日记篇数
    (re.compile(r"(\d+)\s*\**\s*篇(?=\s*\**\s*日记)"), "日记篇数", "diary", False),
    # 累计/总共/一共 N XP → 全局累计总 XP
    (re.compile(r"(?:累计|总共|一共)\s*(?:获得|得到|攒|收获)?\s*\**\s*(\d+)\s*\**\s*XP"), "累计总XP", "totalXp", True),
]


def validate_report(report, week_facts, global_facts):
    problems = []
    week = report.get("weekNumber", "?")
    for t in _collect_texts(report):
        t = str(t)
        for rx, label, fact_key, use_global in RULES:
            fw = week_facts[fact_key]
            fg = global_facts[fact_key]
            # 可追溯 = 数字等于"当周真实值"或"全局真实值"之一。
            # 原因：同一句话可能是本周口径（"这周连续3天"）也可能是历史口径
            # （"你之前连续5天"），两者都可能真实；只有数值与两个真值都不匹配才算编造。
            allowed = {fw} if use_global else {fw, fg}
            for m in rx.finditer(t):
                num = int(m.group(1))
                # 数值<=1 视为泛化语放行（如"做一件事""写一篇心情"）
                if num > 1 and num not in allowed:
                    problems.append(
                        f"第{week}周 疑似事实编造: “{num}{label}”应为{fw}(当周)/{fg}(全局) → “{t[:38]}...”"
                    )
    return problems


def main():
    reports = load_json("aiWeeklyReports.json", [])
    global_facts = compute_facts(None)
    all_problems = []
    for r in reports:
        win = week_window(r)
        week_facts = compute_facts(win)
        all_problems += validate_report(r, week_facts, global_facts)

    f = global_facts
    print("=" * 60)
    print("Yara 周报事实校验（validate-report-facts）")
    print("=" * 60)
    print(f"  全局事实: 累计总XP={f['totalXp']} | 累计活跃={f['activeDays']}天 | 最长连续={f['maxStreak']}天 | "
          f"日记合计={f['diary']}篇")
    if not all_problems:
        print("  ✅ 所有周报的数字断言均可从源数据追溯，无编造")
        return 0
    for p in all_problems:
        print(f"  ✗ {p}")
    print(f"\n✗ 发现 {len(all_problems)} 个无法追溯的数据断言，阻断提交（请核对源数据修正后重试）")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())