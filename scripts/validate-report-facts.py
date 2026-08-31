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
  - 只提取计数类单位：项 / 天 / 次 / 篇 / XP，逐一对照源数据算出的"允许值集合"；
    大于1且无法匹配的即为疑似编造。数值=1 视为泛化语（如"做一件小事"）放行。

说明：本校验锁死"数字类"事实；叙事用词（如"帮妈妈/和妈妈一起"）无法全自动判定，
由"周报一律走脚本再生成、正文取源数据派生字符串"这一入口约束兜底。

用法：
  python3 scripts/validate-report-facts.py     # 0通过 / 1阻断
"""

import json
import re
import os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def load_json(name, default=None):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []


def compute_facts():
    """从源数据推导关键事实，供上下文匹配校验。"""
    xp = load_json("xpRecords.json", [])
    diaries = load_json("diaryEntries.json", [])
    fm = load_json("familyMeetings.json", [])

    total_xp = 0
    days = set()
    reading = 0
    comm = 0
    house = 0
    homework_by_day = {}

    for r in xp:
        d = str(r.get("date") or r.get("datetime") or "")[:10]
        if d:
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
        if prev is not None:
            try:
                y1, m1, d1 = map(int, d.split("-"))
                y2, m2, d2 = map(int, prev.split("-"))
                delta = (date(y1, m1, d1) - date(y2, m2, d2)).days
            except Exception:
                delta = 99
        else:
            delta = 99
        cur = cur + 1 if prev is not None and delta == 1 else 1
        max_streak = max(max_streak, cur)
        prev = d

    hw_max_day = max(homework_by_day.values()) if homework_by_day else 0

    return {
        "activeDays": len(days),
        "maxStreak": max_streak,
        "reading": reading,
        "comm": comm,
        "house": house,
        "diary": len(diaries),
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


# 受保护断言规则：(正则, 断言说明, 期望的源事实函数)。只在这些关键词语境下校验数字，
# 避免把"每完成一项+5XP"这类奖励建议误判为数据断言。
def _fact_factory(key):
    return lambda f: f[key]


RULES = [
    # N项作业 / N项假期作业 → 单日作业完成项数
    (re.compile(r"(\d+)\s*\**\s*项(?=\s*\**\s*(作业|任务))"), "作业项数", "homeworkMaxDay"),
    # 连续/连 N 天 → 最长连续打卡天数
    (re.compile(r"连续\s*\**\s*(\d+)\s*\**\s*天"), "连续打卡天数", "maxStreak"),
    # 活跃 N 天（历史）→ 活跃天数
    (re.compile(r"活跃\s*\**\s*(\d+)\s*\**\s*天"), "活跃天数", "activeDays"),
    # N 次阅读 → 累计阅读次数
    (re.compile(r"(\d+)\s*\**\s*次(?=\s*\**\s*阅读)"), "阅读次数", "reading"),
    # N 次沟通 → 累计沟通次数
    (re.compile(r"(\d+)\s*\**\s*次(?=\s*\**\s*沟通)"), "沟通次数", "comm"),
    # N 次家务/收拾/照顾 → 累计该项次数
    (re.compile(r"(\d+)\s*\**\s*次(?=\s*\**\s*(家务|收拾|照顾|帮忙|整理))"), "家务次数", "house"),
    # N 篇日记 → 累计日记篇数
    (re.compile(r"(\d+)\s*\**\s*篇(?=\s*\**\s*日记)"), "日记篇数", "diary"),
    # 累计/总共 N XP → 累计总 XP
    (re.compile(r"(?:累计|总共|一共)\s*(?:获得|得到|攒|收获)?\s*\**\s*(\d+)\s*\**\s*XP"), "累计总XP", "totalXp"),
]


def validate_report(report, facts):
    problems = []
    week = report.get("weekNumber", "?")
    for t in _collect_texts(report):
        t = str(t)
        for rx, label, fact_key in RULES:
            for m in rx.finditer(t):
                num = int(m.group(1))
                allowed = facts[fact_key]
                if num != allowed:
                    problems.append(
                        f"第{week}周 疑似事实编造: “{num}{label}”应为{allowed} → “{t[:38]}...”"
                    )
    return problems


def main():
    reports = load_json("aiWeeklyReports.json", [])
    facts = compute_facts()
    all_problems = []
    for r in reports:
        all_problems += validate_report(r, facts)

    print("=" * 60)
    print("Yara 周报事实校验（validate-report-facts）")
    print("=" * 60)
    print(f"  源数据事实: 总XP={sorted(facts['XP'])} 连续{sorted(facts['天'])}天 "
          f"阅读{sorted(facts['次'])}次 日记{sorted(facts['篇'])}篇 单日假期作业{sorted(facts['项'])}项")
    if not all_problems:
        print("  ✅ 所有周报的数字断言均可从源数据追溯，无编造")
        return 0
    for p in all_problems:
        print(f"  ✗ {p}")
    print(f"\n✗ 发现 {len(all_problems)} 个无法追溯的数据断言，阻断提交（请核对源数据修正后重试）")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())