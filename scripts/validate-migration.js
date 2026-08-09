#!/usr/bin/env node
/**
 * validate-migration.js — 步骤 3：校验 data/*.json 与飞书原始数据的一致性
 *
 * 核对 github-deploy/data/*.json 与 scripts/raw/*.raw.json 的结构与内容一致性，
 * 覆盖：JSON 可解析性、作业能力模块、XP 记录、财务记录、配置数量、特殊修正。
 *
 * 用法：
 *     node validate-migration.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SCRIPT_DIR = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, "config.json"), "utf8"));
const DATA = path.join(SCRIPT_DIR, CONFIG.paths.dataDir);
const RAW = path.join(SCRIPT_DIR, CONFIG.paths.rawDir);

let ok = true;
function check(name, cond, detail) {
  if (!cond) { ok = false; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
  else console.log("  ✓ " + name);
}

// 1) 所有 JSON 可解析
console.log("【1】JSON 结构完整性");
const files = ["child.json", "calendar.json", "levels.json", "xpRecords.json", "finance.json", "study.json", "config.json", "xpSources.json", "redeemRecords.json"];
const data = {};
for (const f of files) {
  try { data[f] = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); check(f + " 可解析", true); }
  catch (e) { check(f + " 可解析", false, e.message); }
}

// 2) study.json 能力模块核对（与飞书 record-homework 原始数据比对）
console.log("\n【2】study.json 能力模块 vs 飞书原始数据");
const hwRaw = JSON.parse(fs.readFileSync(path.join(RAW, "record-homework.raw.json"), "utf8"));
const modRaw = JSON.parse(fs.readFileSync(path.join(RAW, "config-ability-module.raw.json"), "utf8"));
// 能力模块 id -> 名称（record_id 即模块 ID，"能力模块" 字段即名称）
const modNameById = {};
for (const m of modRaw) {
  if (m.record_id) modNameById[m.record_id] = m["能力模块"] || m.record_id;
}
// 作业 id -> 能力模块名称列表
const hwModsByName = {};
for (const h of hwRaw) {
  const modIds = (h["能力模块"] || []).map(x => x.id).filter(Boolean);
  const names = modIds.map(id => modNameById[id] || id);
  hwModsByName[h.record_id] = names;
}
// study 里每组作业
const study = data["study.json"];
const allHw = study.allHomework.flatMap(g => g.items);
let hwMatch = 0, hwMismatch = 0;
for (const item of allHw) {
  const studyMods = (item.modules || []).slice().sort();
  const rawMods = (hwModsByName[item.id] || []).slice().sort();
  if (JSON.stringify(studyMods) === JSON.stringify(rawMods)) hwMatch++;
  else { hwMismatch++; console.log("   ✗ " + item.id + " " + item.subject + "「" + item.title + "」  study=" + JSON.stringify(studyMods) + "  feishu=" + JSON.stringify(rawMods)); }
}
check(`作业能力模块一致 (${hwMatch}/${allHw.length})`, hwMismatch === 0, hwMismatch + " 条不一致");

// 3) XP 记录核对
console.log("\n【3】xpRecords.json vs 飞书 record-xp");
const xpRaw = JSON.parse(fs.readFileSync(path.join(RAW, "record-xp.raw.json"), "utf8"));
const xpRecs = data["xpRecords.json"];
const xpById = {};
for (const r of xpRecs) xpById[r.id] = r;
let xpMatch = 0, xpMismatch = 0;
for (const r of xpRaw) {
  const rec = xpById[r.record_id];
  if (!rec) { xpMismatch++; console.log("   ✗ 缺失记录 " + r.record_id); continue; }
  const rawDate = String(r["获得时间"] || "").slice(0, 10);
  const rawXp = Number(String(r["XP分值"] || "0").replace(/[^\d.]/g, "")) || 0;
  if (rec.date === rawDate && rec.xp === rawXp) xpMatch++;
  else { xpMismatch++; console.log("   ✗ " + r.record_id + "  date=" + rec.date + " feishu=" + rawDate + " xp=" + rec.xp + " feishu=" + rawXp); }
}
check(`XP 记录一致 (${xpMatch}/${xpRaw.length})`, xpMismatch === 0, xpMismatch + " 条不一致");

// 4) 财务核对
console.log("\n【4】finance.json vs 飞书 record-finance");
const finRaw = JSON.parse(fs.readFileSync(path.join(RAW, "record-finance.raw.json"), "utf8"));
const finRecs = data["finance.json"] ? (data["finance.json"].recentTransactions || []) : [];
const finById = {};
for (const r of finRecs) finById[r.id] = r;
let finMatch = 0, finMismatch = 0;
for (const r of finRaw) {
  const rec = finById[r.record_id];
  if (!rec) { finMismatch++; console.log("   ✗ 缺失记录 " + r.record_id); continue; }
  const rawDate = String(r["日期"] || "").slice(0, 10);
  const rawAmt = Math.round(Number(r["存入/提取金额"] == null ? 0 : r["存入/提取金额"]) * 100);
  const recAmt = Math.round((rec.rawAmount != null ? rec.rawAmount : rec.amount) * 100);
  if (rec.date === rawDate && recAmt === rawAmt) finMatch++;
  else { finMismatch++; console.log("   ✗ " + r.record_id + " date=" + rec.date + "/" + rawDate + " amt=" + recAmt + "/" + rawAmt); }
}
check(`财务记录一致 (${finMatch}/${finRaw.length})`, finMismatch === 0, finMismatch + " 条不一致");

// 5) 层级/科目/XP规则 数量
console.log("\n【5】配置数据数量");
const cfg = data["config.json"];
// config-level 表 26 行，但同级多行权益按等级号聚合去重，故 levels.json 为去重后的等级数
const lvlRaw = JSON.parse(fs.readFileSync(path.join(RAW, "config-level.raw.json"), "utf8"));
const distinctLevels = new Set(lvlRaw.filter(r => r["等级类型"] === "XP等级" || !r["等级类型"]).map(r => Number(r["等级"]))).size;
check(`levels 数量 = 聚合后等级数[${distinctLevels}]`, (data["levels.json"] || []).length === distinctLevels, `levels.json=${(data["levels.json"] || []).length}`);
check("config 含 科目/模块/XPRule", !!(cfg && cfg.subjects && cfg.abilityModules && cfg.xpRules));
// HW-0002 特殊修正校验（英语作业误绑数学模块，已清空待重绑）
const allHw2 = data["study.json"].allHomework.flatMap(g => g.items);
const hw2 = allHw2.find(i => i.id === "recvrd7AIv0ER4");
check("HW-0002 模块已清空", hw2 && hw2.module === "" && Array.isArray(hw2.modules) && hw2.modules.length === 0, JSON.stringify(hw2 && { module: hw2.module, modules: hw2.modules }));

console.log("\n" + (ok ? "✅ 全部校验通过，数据可安全提交" : "⚠️ 存在不一致，请修复后再提交"));
process.exit(ok ? 0 : 1);