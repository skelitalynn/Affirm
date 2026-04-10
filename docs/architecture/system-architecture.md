# 系统架构

**更新日期**：2026-04-10  
**状态**：v1 闭环已落地，v2 工程增强已部分接入

## 1. 运行入口

| 入口 | 文件 | 作用 |
|------|------|------|
| Telegram 主服务 | `src/index.js` | 启动 Bot、AI、队列、主链路 |
| Admin 后台 | `src/admin/server.js` | 管理 Profile、Knowledge、Sync Jobs |
| 数据库迁移 | `scripts/database/migrate.js` | 管理应用表结构 |
| Haystack 侧车 | 独立服务 | 管理知识导入、检索、可选重排 |

## 2. 系统总览

```text
Telegram
  -> src/index.js
  -> TelegramService
     -> MessageQueue
     -> Profile memory
     -> Recent messages
     -> Haystack RAG
     -> AIService
     -> Message.create()
     -> MemoryService
     -> SyncJob

Admin Browser
  -> src/admin/server.js
  -> /admin/profiles
  -> /admin/knowledge
  -> /admin/sync-jobs

Application DB
  -> users
  -> profiles
  -> messages
  -> knowledge_chunks
  -> sync_jobs
  -> schema_migrations

Haystack Sidecar
  -> document store
  -> retrieval pipeline
  -> optional reranker
```

## 3. Telegram 主链路

关键文件：

- `src/services/telegram.js`
- `src/services/ai.js`
- `src/services/memory-service.js`
- `src/services/conversation-trace.js`
- `src/models/message.js`
- `src/models/profile.js`
- `src/models/knowledge.js`
- `src/services/rag/provider.js`

处理流程：

1. 用户消息进入 `handleMessage()`
2. 通过 `messageQueue` 进入用户级串行处理
3. 生成 `trace_id`
4. 写入 user message
5. 读取 `profiles`
6. 读取最近 `messages`
7. 通过 Haystack 检索知识
8. `AIService.prepareMessages()` 组装 prompt
9. 生成回复
10. 写入 assistant message
11. 异步调用 `MemoryService`
12. 更新 `profiles`，记录 `sync_jobs`

## 4. 上下文三层边界

### `messages`

- 原始日志
- 最近 N 条上下文
- 排查和归档来源

### `profiles`

- 长期目标
- 稳定事实
- 沟通偏好
- 待跟进事项

### `Haystack`

- 只负责外部知识
- 支持 `global + user-scoped` 检索
- 不承载用户长期记忆

## 5. v2 工程增强层

### `MemoryService`

- 统一管理长期记忆 patch 生成和写回
- 避免 Telegram 主服务承担过多职责

### `Conversation Trace`

- 给每轮对话加 `trace_id`
- 记录 provider、model、knowledge refs、memory update strategy

### `SyncJob`

- 为 memory / knowledge 的异步动作提供状态层
- 直接服务于后台与健康检查

## 6. 后台职责

关键文件：

- `src/admin/server.js`
- `src/admin/routes/profiles.js`
- `src/admin/routes/knowledge.js`
- `src/admin/routes/sync-jobs.js`

职责：

- 管理长期记忆
- 管理外部知识
- 查看知识同步状态
- 查看记忆更新任务状态
- 汇总系统运行状态

## 7. 配置链路

```text
.env / process env
  -> src/config.js
  -> application modules
  -> Haystack client config
```

关键点：

- `src/config.js` 仍是唯一配置入口
- 主链路显式读取 `haystack` 和 `memory` 配置
- Haystack 内部 embedding / rerank 配置不应散落在 Node 业务代码里

## 8. 当前边界结论

1. `messages` 不是长期记忆主库
2. `knowledge_chunks` 不是运行时主检索库
3. `sync_jobs` 是 v2 的工程治理层，而不是业务数据表
4. Haystack 负责知识检索基础设施，Node 负责会话、记忆和业务规则
