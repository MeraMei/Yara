#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dump-tables.py — 步骤 1：从飞书多维表格拉取全部原始表

把 11 张飞书表导出为 {table_key}.raw.json，每文件为 [{record_id, 字段名: 值}, ...]。
关联字段值保留 [{id:"rec_xxx"}] 形式（含 text 时同时保留）。

前置条件：已安装 lark-cli 并完成登录（lark-cli auth login）。
输出目录、表 ID 等配置统一读取同目录 config.json。

用法：
    python3 dump-tables.py
"""
import json
import subprocess
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(SCRIPT_DIR, "config.json"), "r", encoding="utf-8") as f:
    CONFIG = json.load(f)

BASE = CONFIG["feishuBase"]
TABLES = CONFIG["tables"]
OUT = os.path.join(SCRIPT_DIR, CONFIG["paths"]["rawDir"])


def fetch(key, tid):
    cmd = ["lark-cli", "base", "+record-list", "--base-token", BASE,
           "--table-id", tid, "--as", "user", "--limit", "200", "--json"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{key}: {r.stderr[:300]}")
    env = json.loads(r.stdout)
    d = env["data"]
    fields = d["fields"]
    rids = d["record_id_list"]
    rows = d["data"]
    out = []
    for rid, row in zip(rids, rows):
        rec = {"record_id": rid}
        for fname, val in zip(fields, row):
            rec[fname] = val
        out.append(rec)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    failed = False
    for key, tid in TABLES.items():
        try:
            rows = fetch(key, tid)
            with open(os.path.join(OUT, f"{key}.raw.json"), "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False, indent=1)
            print(f"[OK]   {key}: {len(rows)} 条 -> {os.path.join(OUT, key + '.raw.json')}")
        except Exception as e:
            failed = True
            print(f"[FAIL] {key}: {e}")
    if failed:
        sys.exit(1)
    print(f"\n全部完成，原始数据已写入 {OUT}")


if __name__ == "__main__":
    main()