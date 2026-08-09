#!/usr/bin/env node
/**
 * migrate-feishu.js — 步骤 2：原始数据 → data/*.json
 *
 * 用 scripts/raw/ 下的最新飞书原始数据驱动 vendor/server.js 的 getDashboard()
 * 转换逻辑，生成前端依赖的 9 个 data/*.json 文件，使 GitHub 成为唯一数据源。
 *
 * 关键：先复刻 feishu-api 的 toRow()/convertCellValue() 转换，再做整值展开
 * （单元素数组→标量），与真实 fetchTable 行为完全一致。
 *
 * 前置条件：已运行 dump-tables.py（或 scripts/raw/ 下已有 .raw.json）。
 * 路径统一读取同目录 config.json。
 *
 * 用法：
 *     node migrate-feishu.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SCRIPT_DIR = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, "config.json"), "utf8"));
const RAW_DIR = path.join(SCRIPT_DIR, CONFIG.paths.rawDir);
const OUT_DIR = path.join(SCRIPT_DIR, CONFIG.paths.dataDir);
const VENDOR_DIR = path.join(SCRIPT_DIR, CONFIG.paths.vendorDir);
const MULTI = CONFIG.multiValueFields || {};

// —— 复刻 feishu-api.toRow / convertCellValue ——
function convertCellValue(name, value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      const first = value[0];
      if (first.record_ids !== undefined) {
        return value.map(v => ({ id: (v.record_ids && v.record_ids[0]) || "", text: v.text || "" }));
      }
      if (first.link_record_id !== undefined) {
        return value.map(v => ({ id: v.link_record_id, text: v.text || "" }));
      }
      return value;
    }
    return value;
  }
  if (typeof value === "number" && value > 1000000000000) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return value;
}
function toRow(record, multiValueFields) {
  const obj = { record_id: record.record_id };
  const fields = record.fields || record; // 兼容已有 {record_id, ...} 结构
  for (const name of Object.keys(fields)) {
    if (name === "record_id") continue;
    let val = convertCellValue(name, fields[name]);
    if (Array.isArray(val) && val.length === 1 && !multiValueFields.includes(name)) {
      const first = val[0];
      if (typeof first === "object" && first !== null) {
        obj[name] = val;
      } else {
        obj[name] = first;
      }
    } else {
      obj[name] = val;
    }
  }
  return obj;
}

// 读取 vendor/server.js 的转换引擎与表 ID 映射
const server = require(path.join(VENDOR_DIR, "server.js"));
const TABLES = server.TABLES;

const RAW = {};
fs.readdirSync(RAW_DIR).filter(f => f.endsWith(".raw.json")).forEach(f => {
  const key = f.replace(".raw.json", "");
  RAW[key] = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
});

// 覆盖 feishu.fetchTable：按 tableId 返回经 toRow 处理的本地数据
const feishuApi = require(path.join(VENDOR_DIR, "feishu-api.js"));
feishuApi.fetchTable = async function (tableId, multiValueFields = []) {
  const key = Object.keys(TABLES).find(k => TABLES[k] === tableId);
  const rows = RAW[key];
  if (!rows) throw new Error("缺少本地原始表: " + tableId);
  const keepArr = MULTI[key] || [];
  return rows.map(r => toRow(r, keepArr));
};

// —— 特殊修正（固化历史纠错，保证每次同步都产出正确状态）——
// HW-0002（英语作业）曾在飞书误绑数学模块，已清空待重新绑定；
// 但 server.js 的 inferModule() 会对无模块的英语作业回填默认"单词"，这里显式清除。
function applySpecialFixes(files) {
  const study = files["study.json"];
  const allItems = (study.allHomework || []).flatMap(g => g.items)
    .concat(study.recentAssignments || []);
  for (const item of allItems) {
    if (item.id === "recvrd7AIv0ER4") {
      item.module = "";
      item.modules = [];
    }
  }
}

(async () => {
  const data = await server.getDashboard();
  const files = {
    "child.json": data.child,
    "calendar.json": data.calendar,
    "levels.json": data.levels,
    "xpRecords.json": data.xpRecords,
    "xpSources.json": data.xpSources,
    "redeemRecords.json": data.redeemRecords,
    "finance.json": data.finance,
    "study.json": data.study,
    "config.json": data.config,
  };
  applySpecialFixes(files);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, obj] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(obj, null, 2) + "\n", "utf8");
    console.log(`已写入 ${name} (${(fs.statSync(path.join(OUT_DIR, name)).size / 1024).toFixed(1)} KB)`);
  }
  console.log("\n迁移完成。currentXP:", data.currentXP, "| pendingCount:", data.pendingCount,
              "| xpRecords:", data.xpRecords.length, "| allHomework:", data.study.allHomework.reduce((s, g) => s + g.items.length, 0));
})().catch(e => { console.error("迁移失败:", e); process.exit(1); });