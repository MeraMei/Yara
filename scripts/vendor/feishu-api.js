/**
 * feishu-api.js — 飞书多维表格 OpenAPI 适配层
 *
 * 原 server.js 通过外部进程 lark-cli --as user 读写飞书多维表格。
 * 本模块改为直接用 tenant_access_token 调用飞书 OpenAPI，无需本地 lark-cli，
 * 可在任意 Node 环境（含云端 serverless）运行。
 *
 * 依赖环境变量：
 *   LARK_APP_ID      企业自建应用的 App ID
 *   LARK_APP_SECRET  企业自建应用的 App Secret
 *
 * 对外暴露：
 *   fetchTable(tableId, multiValueFields)  → 返回 [{record_id, 字段名: 值}, ...]
 *   createRecord(tableId, fields)          → 返回 record_id
 *   updateRecord(tableId, recordId, fields) → 返回 recordId
 *
 * 与 server.js 上层完全兼容：字段名数组、关联字段 [{id},{text}]、日期字符串等。
 */
"use strict";
// 使用全局 fetch（undici）。沙箱/本地若配置了 HTTPS_PROXY 会自动走代理；
// 云端无代理时直连飞书，两种环境均适用。
const FEISHU_HOST = "https://open.feishu.cn";
const PAGE_SIZE = 200;
const REQ_TIMEOUT_MS = 20000;

const APP_ID = process.env.LARK_APP_ID || "";
const APP_SECRET = process.env.LARK_APP_SECRET || "";
const BASE_TOKEN = process.env.LARK_BASE_TOKEN || "EgnqbkrzcafOnrs1ESnc6jiDnkg";

let tokenCache = { token: null, expireAt: 0 };

// 请求辅助：返回 Promise<{status, body}>；body 可能为对象或 {raw}
async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  let res;
  try {
    res = await fetch(FEISHU_HOST + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error("飞书请求超时");
    }
    throw e;
  }
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { parsed = { raw: text }; }
  return { status: res.status, body: parsed };
}

// 获取 tenant_access_token（带缓存，2 小时有效）
async function getToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expireAt) return tokenCache.token;
  if (!APP_ID || !APP_SECRET) {
    throw new Error("缺少 LARK_APP_ID / LARK_APP_SECRET 环境变量");
  }
  const { status, body } = await request("POST", "/open-apis/auth/v3/tenant_access_token/internal", {
    app_id: APP_ID,
    app_secret: APP_SECRET,
  });
  if (status !== 200 || body.code !== 0) {
    throw new Error("获取 tenant_access_token 失败: " + (body.msg || ("HTTP " + status)));
  }
  tokenCache.token = body.tenant_access_token;
  tokenCache.expireAt = now + (body.expire - 120) * 1000; // 提前 2 分钟过期
  return tokenCache.token;
}

// ────────────────────────────────────────────────
// 字段值转换：OpenAPI CellValue → server.js 期望格式
// ────────────────────────────────────────────────
// OpenAPI 常见取值：
//   文本/单选/公式文本: 字符串
//   数字/货币: 数字
//   日期: 毫秒时间戳(数字) 或 "YYYY-MM-DD HH:mm:ss" 字符串
//   多选: ["a","b"]
//   人员: [{id, name, ...}]
//   关联(DuplexLink): [{record_ids:[...], text, text_arr, type}]
//   评级等: 数字
function convertCellValue(name, value) {
  if (value === null || value === undefined) return "";
  // 数组
  if (Array.isArray(value)) {
    // 关联字段：OpenAPI 形式 [{record_ids, text, text_arr}] → server 期望 [{id},{text}] 或 [{link_record_id}]
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      const first = value[0];
      if (first.record_ids !== undefined) {
        // 关联记录：转成 [{id: record_id}]，保留 text 供名称解析
        return value.map((v) => {
          const rid = (v.record_ids && v.record_ids[0]) || "";
          return { id: rid, text: v.text || "" };
        });
      }
      if (first.link_record_id !== undefined) {
        return value.map((v) => ({ id: v.link_record_id, text: v.text || "" }));
      }
      // 人员等其他对象数组：保留原样
      return value;
    }
    // 多选等普通数组：原样返回
    return value;
  }
  // 日期时间戳（数字 ms）→ 转 "YYYY-MM-DD"
  if (typeof value === "number" && value > 1000000000000) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return value;
}

// 批量适配：把 OpenAPI 的 fields 对象转成 server 期望的对象
function toRow(record, multiValueFields) {
  const obj = { record_id: record.record_id };
  const fields = record.fields || {};
  for (const name of Object.keys(fields)) {
    let val = convertCellValue(name, fields[name]);
    // 关联字段会变成数组，保留；普通字段若为单元素数组且有 multiValueFields 标记则保留
    if (Array.isArray(val) && val.length === 1 && !multiValueFields.includes(name)) {
      const first = val[0];
      if (typeof first === "object" && first !== null) {
        // 关联单值：保留数组（server 用 resolveLinkName 解析）
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

// 读取一张表的所有记录
async function fetchTable(tableId, multiValueFields = []) {
  const token = await getToken();
  const allRows = [];
  let pageToken = null;
  do {
    const q = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (pageToken) q.set("page_token", pageToken);
    const pathStr = `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records?${q.toString()}`;
    const { status, body } = await request("GET", pathStr, null, token);
    if (status !== 200 || body.code !== 0) {
      throw new Error("读取表失败: " + (body.msg || ("HTTP " + status)));
    }
    const items = (body.data && body.data.items) || [];
    for (const rec of items) {
      allRows.push(toRow(rec, multiValueFields));
    }
    pageToken = (body.data && body.data.page_token) || null;
  } while (pageToken);
  return allRows;
}

// 写入字段值转换：server 期望 [{id}] → OpenAPI 关联格式 [{record_ids:[id]}]
function convertWriteFields(fields) {
  const out = {};
  for (const name of Object.keys(fields)) {
    let val = fields[name];
    if (Array.isArray(val)) {
      const isLink = val.length > 0 && typeof val[0] === "object" && val[0] !== null &&
        (val[0].id !== undefined || val[0].link_record_id !== undefined);
      if (isLink) {
        out[name] = val.map((v) => {
          const rid = v.id || v.link_record_id;
          return { record_ids: [rid] };
        });
        continue;
      }
    }
    out[name] = val;
  }
  return out;
}

// 创建记录
async function createRecord(tableId, fields) {
  const token = await getToken();
  const payload = { fields: convertWriteFields(fields) };
  const pathStr = `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records`;
  const { status, body } = await request("POST", pathStr, payload, token);
  if (status !== 200 || body.code !== 0) {
    throw new Error("创建记录失败: " + (body.msg || ("HTTP " + status)));
  }
  return (body.data && body.data.record && body.data.record.record_id) || null;
}

// 更新记录
async function updateRecord(tableId, recordId, fields) {
  const token = await getToken();
  const payload = { fields: convertWriteFields(fields) };
  const pathStr = `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records/${recordId}`;
  const { status, body } = await request("PUT", pathStr, payload, token);
  if (status !== 200 || body.code !== 0) {
    throw new Error("更新记录失败: " + (body.msg || ("HTTP " + status)));
  }
  return recordId;
}

module.exports = { fetchTable, createRecord, updateRecord, getToken };