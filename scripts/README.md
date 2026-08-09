# Yara 成长工作台 · 数据维护手册

本目录存放**唯一数据源（GitHub 仓库）**的同步与校验工具。GitHub 仓库 `meramei/Yara` 的 `data/*.json` 是前端展示的唯一数据来源，如下流程用于从飞书拉取最新数据并重新生成、校验。

## 一、数据架构

```
飞书多维表格 (11 张)
   │  dump-tables.py  ── 步骤1：导出原始快照到 scripts/raw/
   ▼
scripts/raw/*.raw.json   （中间数据，不入库，可随时重新生成）
   │  migrate-feishu.js  ── 步骤2：用 vendor/server.js 的转换引擎生成
   ▼
data/*.json  （9 个文件，前端唯一数据源，入库部署到 GitHub Pages）
   ▲
   │  validate-migration.js ── 步骤3：与 raw 比对一致性
```

| 目录/文件 | 作用 |
| --- | --- |
| `dump-tables.py` | 步骤1：调用 `lark-cli` 拉取飞书 11 张表 → `raw/` |
| `migrate-feishu.js` | 步骤2：`raw/` → `data/*.json`（复用转换引擎） |
| `validate-migration.js` | 步骤3：校验 `data/` 与 `raw/` 一致性与结构完整性 |
| `sync.sh` | 一键依次执行 1→2→3 |
| `config.json` | 飞书 base token、表 ID、多值字段、路径 的集中配置 |
| `vendor/` | 从原部署包复制的转换引擎 `server.js` + `feishu-api.js`，保证自包含、可版本化 |
| `raw/` | 飞书原始快照（gitignore，不入库） |

## 二、日常同步（改完飞书后）

前置条件：已安装 `lark-cli` 并登录（`lark-cli auth login`），且 Node.js 可用。

```bash
cd scripts
bash sync.sh          # 或分步：python3 dump-tables.py && node migrate-feishu.js && node validate-migration.js
```

校验全部通过（输出 `✅ 全部校验通过`）后，在仓库根目录提交 `data/` 变更并推送，GitHub Pages 自动更新。

> 说明：`data/` 是**只读**数据源。前端通过 GitHub REST API（需 Token）写回，见 `data-store.js`。

## 三、各步骤详解

### 步骤1 — 拉取原始数据 `dump-tables.py`
- 读取 `config.json` 的 `feishuBase` 与 `tables`，逐表调用 `lark-cli base +record-list`。
- 输出 `raw/{table_key}.raw.json`，每文件为 `[{record_id, 字段名: 值}, ...]`，关联字段保留 `[{id:"rec_xxx"}]`。
- `raw/` 不入库，随时可重新生成。

### 步骤2 — 生成数据 `migrate-feishu.js`
- 读取 `raw/`，复刻飞书 API 的 `toRow()/convertCellValue()` 转换，再调用 `vendor/server.js` 的 `getDashboard()` 生成 9 个 `data/*.json`。
- 多值字段（作业`能力模块`、成绩`错误模块`）在 `config.json` 的 `multiValueFields` 声明，保持为数组。
- 内置**特殊修正** `applySpecialFixes()`：处理历史纠错（HW-0002 英语作业误绑模块，显式清空，避免被 `inferModule()` 回填默认值）。新增纠错时在此追加。

### 步骤3 — 校验 `validate-migration.js`
- 检查点：JSON 可解析性、作业能力模块 vs 飞书原始、XP 记录、财务记录、配置数量、特殊修正。
- 退出码 `0` = 通过，可安全提交；`1` = 存在不一致，需修复。

## 四、配置说明 `config.json`

| 字段 | 说明 |
| --- | --- |
| `feishuBase` | 飞书多维表格 base token |
| `tables` | 11 张表的 key → 表 ID 映射 |
| `multiValueFields` | 需保持为数组的字段（按表） |
| `paths` | 各路径（相对 `scripts/`），改动仓库布局时只需改这里 |

## 五、vendor/ 转换引擎的更新

`vendor/server.js` 与 `vendor/feishu-api.js` 是从原部署包复制并入库的**转换引擎快照**，保证 `data/` 的生成方式可追溯、可复现。若飞书数据结构或转换逻辑有变更：

1. 更新原转换逻辑（当前维护点在 `vendor/server.js`）。
2. 重新运行 `bash sync.sh`，确认校验通过。
3. 提交 `data/` 与 `vendor/` 变更。

## 六、目录结构

```
github-deploy/
├── index.html            # 前端单页（数据取自 data/*.json）
├── data-store.js         # 数据层（GitHub 读写，含雷达图聚合逻辑）
├── data/                 # ★ 唯一数据源（9 个 JSON，入库部署）
├── assets/               # 静态资源
└── scripts/              # 本维护手册对应的工具
    ├── README.md
    ├── config.json
    ├── sync.sh
    ├── dump-tables.py
    ├── migrate-feishu.js
    ├── validate-migration.js
    ├── vendor/           # 转换引擎快照（server.js + feishu-api.js）
    └── raw/              # 飞书原始快照（gitignore）
```