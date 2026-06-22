# Development

## 环境与安装

标准启动顺序：

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run verify
npm start
```

后台单独启动：

```bash
npm run admin
```

## 当前配置入口

主应用配置链路固定为：

```text
.env / process env
  -> src/config.js
  -> application modules
```

规则：

1. 应用的唯一配置输入源是 `.env` 或进程环境变量
2. 业务代码统一从 `src/config.js` 读取
3. 禁止重新引入运行时配置管理器
4. Embedding、Knowledge RAG 和 Memory v2 的配置也走同一入口

## 关键环境变量

主应用必填：

```bash
DB_URL
TELEGRAM_BOT_TOKEN
ADMIN_PASSWORD
```

大模型：

```bash
AI_PROVIDER=claude
CLAUDE_API_KEY=...
# 或 OPENAI_API_KEY=...
```

Memory v2：

```bash
MEMORY_V2_ENABLED=true
MEMORY_V2_RECORD_JOBS=true
MEMORY_V2_CONTEXT_MESSAGES=8
```

可选：

```bash
REDIS_URL=redis://localhost:6379
WEBHOOK_ENABLED=false
```

## 常用命令

```bash
npm start
npm run dev
npm run admin
npm run db:migrate
npm run verify
npm run lint
npm run test:unit
npm run test:integration
npm run test:misc
python3 scripts/harness/doctor.py
python3 scripts/harness/verify_docs_layout.py
python3 scripts/harness/task.py list
```

## 维护入口

| 任务 | 主要文件 |
|---|---|
| Telegram 对话、prompt、trace | `src/services/telegram.js`、`src/services/ai.js`、`src/services/conversation-trace.js` |
| 长期记忆写回 | `src/services/memory-service.js`、`src/models/profile.js` |
| 历史事件召回 | `src/services/memory-retrieval-service.js`、`src/models/memory-event.js` |
| 历史事件治理 | `src/services/memory-event-service.js`、`src/admin/routes/memory-events.js` |
| 外部知识 | `src/models/knowledge.js`、`src/services/rag/*`、`knowledge_chunks` |
| Admin 后台 | `src/admin/server.js`、`src/admin/routes/*`、`src/admin/views/*` |
| 数据库连接 | `src/db/connection.js` |
| 数据库迁移 | `migrations/`、`scripts/database/migrate.js`、`scripts/database/schemas/init.sql` |
| Harness 工作流 | `scripts/harness/*`、`.harness/config.json`、`docs/FEATURES.json` |

## 数据库与迁移

数据库相关改动遵循下面顺序：

1. 先改迁移文件或 schema 初始化脚本
2. 再改 `src/models/*`
3. 再改服务层调用
4. 最后补测试或 eval

当前核心表边界：

1. `messages`：原始对话日志和最近上下文
2. `profiles`：稳定长期记忆
3. `memory_events`：可召回历史事件
4. `knowledge_chunks`：外部知识，使用 pgvector 主检索和关键词 fallback
5. `sync_jobs`：异步写回、同步和治理状态

## 开发约定

1. 业务逻辑只放在 `src/`
2. 文档只维护 `docs/` 顶层 Harness 文件
3. 不再新增平行说明目录
4. `scripts/harness/` 只负责任务状态、验证证据和会话交接，不替代业务脚本
5. 涉及长期记忆边界的改动，要同时检查 `profiles / memory_events / knowledge` 是否被写错层
6. 涉及 Telegram 主链路的改动，要检查 trace、降级路径和错误处理
7. Knowledge RAG 不依赖独立 sidecar；不要重新引入 Haystack 作为默认链路

## 推荐工程顺序

如果继续演进当前仓库：

1. 扩充真实 transcript replay eval
2. 补 `utilization` 和 `live_ai` 回归
3. 基于失败样本做 `ranking v2`
4. 补 `memory_events` compaction、merge、衰减治理

如果直接准备重建 `v3`：

1. 先定义 `coaching_state`
2. 只保留 `messages / profiles / memory_events`
3. 先跑通最小召回和异步写回
4. 把复杂外部知识 pipeline、provider 兼容和重基础设施后置
