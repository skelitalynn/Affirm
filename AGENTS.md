# Affirm Repository Rules

> 本文件定义仓库规范，OpenAI Codex 和所有开发者必须遵守。
> 内容与 `CLAUDE.md` 保持同步，两者规则完全一致。

---

## 文档规范

### 规则 1：所有文档必须写入 `docs/` 目录

禁止在项目根目录创建 Markdown 文件（`.md`）。

唯一允许留在根目录的 Markdown 文件：
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`

### 规则 2：AI 不允许在 root 创建 markdown 文件

AI 自动生成的任何长期项目文档、报告、分析，必须合并进 `docs/` 顶层 Harness 文档。

### 规则 3：项目文档只维护顶层 Harness 文件

当前项目不再按专题子目录拆分项目说明。

长期维护的项目文档只允许使用：

- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/TESTING.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`
- `docs/FEATURES.json`

新增项目知识必须合并进上述文件之一。不要重新创建平行知识源目录。

---

## 文件命名规范

### 规则 4：禁止创建备份文件

以下命名模式的文件不允许提交到版本库：

- `*.backup`
- `*-old.js`
- `*.backup2`
- `*.bak`
- `*.swp`
- `*.tmp`

如需保留历史版本，使用 Git 分支或 `git stash`，不要创建备份副本。

删除操作执行原则（避免过度询问）：
- 对以下文件可直接删除，无需先询问：临时文件、构建产物、日志、缓存、`*.backup`/`*.bak`/`*.tmp` 等明确无业务价值文件。
- 涉及核心代码、数据库迁移、配置文件（如 `.env*`）、或超过 20 个文件的批量删除，必须先询问并说明影响范围。
- 删除后需在回复中说明删除了哪些路径，并给出可回滚方式（如 `git restore` / `git checkout` / `git revert`）。

### 规则 5：诊断和调试脚本放入 `tools/`

临时性的测试连接、诊断、修复脚本放入 `tools/` 目录，不能散落在根目录。

---

## 代码规范

### 规则 6：根目录只允许保留以下文件

```
README.md
CLAUDE.md
AGENTS.md
package.json
package-lock.json
Dockerfile
docker-compose.yml
.env.example
.gitignore
.dockerignore
```

其余文件必须放入对应目录：
- 源代码 → `src/`
- 文档 → `docs/`
- 脚本 → `scripts/`
- 测试 → `tests/`
- 工具 → `tools/`
- Docker 相关 → `docker/`（根目录 Dockerfile 除外）

### 规则 7：环境变量文件规范

- `.env` — 本地开发（gitignored）
- `.env.example` — 模板（提交到版本库，不含真实密钥）
- `.env.production` — 生产环境（gitignored，不提交）

---

## AI 操作规范

### 规则 8：AI 生成代码前必须先读取相关文件

在修改任何文件前，必须先读取文件内容，理解现有实现后再进行修改。

### 规则 9：禁止在 src/ 以外创建业务逻辑文件

所有核心业务逻辑文件必须位于 `src/` 目录结构内。

### 规则 10：默认执行优先，禁止仅口头建议

当用户请求“修复/实现/修改/优化/排查”时，AI 必须默认直接执行必要命令和文件修改，并返回实际结果；不能只给方案不落地。

### 规则 11：仅在高风险或信息缺失时提问

仅以下场景允许先提问再执行：
- 高风险破坏性操作（删除核心文件、重置历史、不可逆数据变更）
- 缺少关键参数且无法从仓库或上下文推断
- 需要越权（网络、系统级权限）且当前环境无法直接执行

除上述场景外，应先行动、后汇报。

---

## Git 规范

- 提交前检查：不提交 `.env`、真实密钥、`*.backup` 文件
- 分支命名：`feature/xxx`、`fix/xxx`、`docs/xxx`
- commit message 使用英文或中文，遵循 conventional commits 格式

---

## 项目背景

Telegram Bot AI "显化导师"。技术栈：Node.js + PostgreSQL + pgvector + BullMQ + Redis。

入口：`src/index.js`

### 关键目录

```
Affirm/
├── src/           # 核心源代码（唯一业务逻辑存放处）
│   ├── services/  # telegram.js、ai.js、embedding.js、notion.js
│   ├── models/    # user.js、message.js、knowledge.js
│   ├── utils/     # message-queue.js、error-handler.js
│   ├── config.js  # 唯一配置入口（只读）
│   ├── admin/     # Express 管理后台
│   └── db/        # 数据库连接
├── docs/          # Harness 顶层项目文档
├── scripts/       # 自动化脚本
├── tests/         # 测试代码
├── tools/         # 调试诊断工具
├── docker/        # Docker 附属配置（含 nginx/nginx.conf）
├── monitoring/    # 监控配置
├── migrations/    # 数据库迁移
└── skills/        # OpenClaw Skill 模块
```

### 关键文件

| 文件 | 说明 |
|------|------|
| `src/config.js` | 项目唯一配置入口：从 `.env` 解析并导出只读 `config` |
| `src/services/telegram.js` | Bot 主逻辑，支持 Polling / Webhook 双模式 |
| `src/services/ai.js` | AIService，OpenAI 兼容 SDK |
| `src/services/embedding.js` | 向量嵌入（独立 Provider，支持 RAG） |
| `src/utils/message-queue.js` | BullMQ 队列 + 内存降级，`init(fn)` / `enqueue(userId, data)` |
| `src/utils/error-handler.js` | 统一错误处理 |
| `src/admin/server.js` | Express 管理后台（port 3001） |

### 配置约定

当前项目配置链路固定为：

`.env` -> `src/config.js` -> 只读 `config` 对象 -> 业务模块

- `.env` / 进程环境变量是唯一配置输入源
- 业务代码统一读取 `src/config.js` 导出的 `config`
- 禁止重新引入运行时配置管理器
- Notion Skill 配置由 `src/services/notion.js` 显式传参，不通过 env 桥接

### 环境变量关键项

```
AI_PROVIDER=claude            # 主 LLM Provider（claude / openai）
EMBEDDING_API_KEY=...         # 可选；未配置时 RAG 会退回 deterministic fallback
WEBHOOK_ENABLED=false         # true 启用 Webhook 模式
REDIS_URL=redis://localhost:6379
TELEGRAM_BOT_TOKEN=...        # 必填
DB_URL=...                    # 必填
```
