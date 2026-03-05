# 仓库整理报告

**日期：** 2026-03-05
**执行人：** Claude Code (架构整理)

---

## 一、整理前问题分析

| 问题 | 描述 |
|------|------|
| 文档散落 | `daily-report.md`、`DAY7_COMPLETED.md`、`dev.log` 在根目录 |
| 历史文件 | `.env.backup`、`.env.swp`、多个 `*-old.js`、`*.backup2` |
| 调试脚本混杂 | 4 个 `test-*.js`、3 个 `fix-*.js/sh` 在根目录 |
| docs 内部无序 | `data-layer/` 子目录与 `project/` 混用，审计报告在 docs 根 |
| 无仓库规范 | 无 CLAUDE.md，AI 会在任意位置生成文件 |
| 缺少架构文档 | 无系统架构说明文件 |

---

## 二、新目录结构

```
Affirm/
├── src/                      # 核心源代码
│   ├── index.js
│   ├── config.js
│   ├── health.js
│   ├── config/manager.js
│   ├── db/connection.js
│   ├── models/               # user, message, profile, knowledge
│   ├── services/             # telegram, ai, notion, embedding
│   ├── utils/                # message-queue, error-handler
│   ├── admin/                # Web 管理面板
│   └── notion/
│
├── docs/                     # 所有文档 (规范化)
│   ├── architecture/
│   │   ├── system-architecture.md   [新建]
│   │   └── 数据层API文档.md          [移入]
│   ├── database/
│   │   └── 数据库设计.md             [移入]
│   ├── development/
│   │   └── 开发计划.md
│   ├── project/
│   │   └── 项目概述.md
│   └── reports/
│       ├── Affirm 项目技术审计报告.md [移入]
│       ├── 架构升级评估报告.md
│       ├── daily-report.md           [移入，使用更新版本]
│       ├── dev.log                   [移入]
│       ├── day1-complete.md
│       ├── day2-complete.md
│       ├── DAY6_COMPLETED.md
│       ├── DAY7_COMPLETED.md
│       ├── performance-optimization.md [从 tests/ 移入]
│       └── repository-refactor.md    [新建]
│
├── tools/                    # 调试诊断工具 (新建目录)
│   ├── diagnose-claude-api.js  [从根目录移入]
│   ├── fix-all-deps.js         [从根目录移入]
│   ├── fix-now.sh              [从根目录移入]
│   ├── test-ai-connection.js   [从根目录移入]
│   ├── test-deepseek.js        [从根目录移入]
│   ├── test-notion-connection.js [从根目录移入]
│   └── test-notion-integration.js [从根目录移入]
│
├── scripts/                  # 自动化脚本 (保持现状)
├── tests/                    # 测试代码 (保持现状)
├── docker/                   # Docker 配置 (已存在)
├── monitoring/               # 监控配置 (已存在)
├── migrations/               # 数据库迁移 (预留)
├── skills/                   # OpenClaw Skills (已存在)
│
├── README.md                 # 保留
├── CLAUDE.md                 # [新建] 仓库规范
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 三、移动文件清单

### 根目录 → docs/reports/

| 原路径 | 新路径 | 备注 |
|--------|--------|------|
| `daily-report.md` | `docs/reports/daily-report.md` | 使用更新版（2026-03-05）|
| `DAY7_COMPLETED.md` | - | 删除根目录副本（内容与 docs 版本相同）|
| `dev.log` | `docs/reports/dev.log` | 开发日志 |

### docs/ 内部重组

| 原路径 | 新路径 |
|--------|--------|
| `docs/Affirm 项目技术审计报告.md` | `docs/reports/Affirm 项目技术审计报告.md` |
| `docs/data-layer/数据层API文档.md` | `docs/architecture/数据层API文档.md` |
| `docs/project/数据库设计.md` | `docs/database/数据库设计.md` |

### tests/ → docs/reports/

| 原路径 | 新路径 |
|--------|--------|
| `tests/performance-optimization.md` | `docs/reports/performance-optimization.md` |

### 根目录 → tools/

| 原路径 | 新路径 |
|--------|--------|
| `diagnose-claude-api.js` | `tools/diagnose-claude-api.js` |
| `fix-all-deps.js` | `tools/fix-all-deps.js` |
| `fix-now.sh` | `tools/fix-now.sh` |
| `test-ai-connection.js` | `tools/test-ai-connection.js` |
| `test-deepseek.js` | `tools/test-deepseek.js` |
| `test-notion-connection.js` | `tools/test-notion-connection.js` |
| `test-notion-integration.js` | `tools/test-notion-integration.js` |

---

## 四、删除文件清单

| 文件 | 原因 |
|------|------|
| `.env.backup` | 备份文件，已在 .gitignore 中，含敏感信息 |
| `.env.swp` | Vim 交换文件，已在 .gitignore 中 |
| `DAY7_COMPLETED.md`（根目录） | 与 docs/reports/ 版本内容相同，删除重复 |
| `src/config-old.js` | 历史遗留（已 git staged 删除）|
| `src/services/ai-old.js` | 历史遗留（已 git staged 删除）|
| `src/services/ai.js.backup2` | 备份文件（已 git staged 删除）|
| `src/services/notion-old.js` | 历史遗留（已 git staged 删除）|
| `src/services/notion.backup.js` | 备份文件（已 git staged 删除）|

---

## 五、新建文件清单

| 文件 | 说明 |
|------|------|
| `docs/architecture/system-architecture.md` | 系统架构全面说明 |
| `docs/database/` | 数据库文档目录 |
| `docs/architecture/` | 架构文档目录 |
| `tools/` | 调试工具目录 |
| `CLAUDE.md` | 仓库规范（AI 操作准则）|
| `docs/reports/repository-refactor.md` | 本报告 |

---

## 六、Import 路径修复

`tools/` 目录下的文件由根目录移入子目录，相对路径从 `./src/` 修正为 `../src/`：

| 文件 | 修改内容 |
|------|---------|
| `tools/test-notion-integration.js` | `./src/` → `../src/`，`./skills/` → `../skills/` |
| `tools/fix-all-deps.js` | `./src/` → `../src/` |
| `tools/fix-now.sh` | `./src/` → `../src/`，`../config` → `../src/config` |

---

## 七、项目架构说明

### 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 18+ |
| Bot 框架 | node-telegram-bot-api |
| AI 客户端 | openai（兼容 API，支持多 Provider）|
| 数据库 | PostgreSQL 16 + pgvector |
| 归档 | Notion API |
| 容器化 | Docker + docker-compose |
| 进程管理 | PM2 (monitoring/ecosystem.config.js) |

### 核心设计模式

1. **多 Provider AI**：通过 `AI_PROVIDER` 环境变量无缝切换 DeepSeek / Claude / OpenAI
2. **MessageQueue 串行化**：每个用户独立队列，防止并发竞争
3. **Vector Memory**：消息自动生成 768 维向量，支持未来语义检索
4. **统一错误处理**：`src/utils/error-handler.js` 集中管理，用户友好消息

---

## 八、后续建议

1. **补全 `migrations/`**：将 `scripts/database/schemas/init.sql` 拆分为版本化迁移文件
2. **清理 `scripts/development/`**：day1~day7 开发任务脚本可归档到 `docs/reports/`
3. **coverage/ 目录**：已在 `.gitignore` 中，确认不提交到版本库
4. **`docker/` 与根目录 `Dockerfile`**：建议统一，根目录 Dockerfile 用于生产构建，`docker/` 用于开发环境
5. **skills/ 内部文档**：`skills/notion/SKILL.md`、`skills/notion/performance.md` 可保留在原位（属于 Skill 模块自文档）
