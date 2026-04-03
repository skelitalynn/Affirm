# 系统架构

**更新日期**：2026-04-04

本文档只描述当前还有效的系统结构，不再保留历史升级快照。

## 1. 运行入口

| 入口 | 文件 | 用途 |
|------|------|------|
| Telegram 主服务 | `src/index.js` | 启动 Bot、AI、队列、Webhook/Polling |
| Admin 后台 | `src/admin/server.js` | 提供画像和知识管理页面 |
| 数据库迁移 | `scripts/database/migrate.js` | 初始化 schema 并执行 `migrations/*.sql` |

## 2. 系统总览

```text
Telegram
  -> src/index.js
  -> TelegramService
     -> MessageQueue
     -> AIService
     -> Knowledge.semanticSearch()
     -> Message.create()
     -> NotionService

Admin Browser
  -> src/admin/server.js
  -> /admin/profiles
  -> /admin/knowledge
     -> Knowledge.create / createBatch / update / delete

Database
  -> users
  -> profiles
  -> messages
  -> knowledge_chunks
  -> sync_jobs
  -> schema_migrations
```

## 3. Telegram 主链路

核心文件：

- `src/index.js`
- `src/services/telegram.js`
- `src/services/ai.js`
- `src/models/message.js`
- `src/models/knowledge.js`

处理流程：

1. `src/index.js` 创建 `TelegramService`
2. `TelegramService.start()` 根据 `WEBHOOK_ENABLED` 选择 Polling 或 Webhook
3. 用户消息进入 `handleMessage()`，再进入 `_processSingleMessage()`
4. `Message.create()` 保存用户消息
5. `Message.getRecentMessages()` 取短期上下文
6. `Knowledge.semanticSearch()` 查知识库
7. `Message.semanticSearchByText()` 当前固定返回空数组
8. `AIService.generateResponse()` 生成回复
9. `Message.create()` 保存 assistant 回复
10. Bot 回发消息

## 4. Knowledge RAG

核心文件：

- `src/services/rag/knowledge-vector-store.js`
- `src/models/knowledge.js`
- `src/services/chunking.js`
- `src/admin/routes/knowledge.js`

关键事实：

- `knowledge_chunks` 是当前唯一仍在使用的向量检索表
- 写入和检索都通过 `LangChain PGVectorStore`
- 写入时使用 `metadata` 同步 `source` 和 `user_id`
- 没有远程 embedding key，或远程 embeddings 实际不可用时，退回 deterministic 向量

详细见：[knowledge-rag-architecture.md](knowledge-rag-architecture.md)

## 5. Admin 后台

核心文件：

- `src/admin/server.js`
- `src/admin/routes/profiles.js`
- `src/admin/routes/knowledge.js`

设计边界：

- 使用 HTTP Basic Auth
- 所有写操作都经过 Origin/Referer 检查
- 后台只负责管理，不直接承担 Telegram 主流程

## 6. 当前模块边界

### 仍然是主干能力

- `TelegramService`
- `AIService`
- `Knowledge`
- `Profile`
- `NotionService`
- `MessageQueue`

### 当前处于停用或降级状态

- `messages` 语义记忆：停用
- knowledge embeddings：可能处于 deterministic fallback

## 7. 目录责任

```text
src/
├── admin/      后台路由、页面、认证
├── config/     配置管理
├── db/         数据库连接
├── models/     数据读写契约
├── services/   业务服务
├── services/rag/
└── utils/      队列、错误处理
```

如果你准备修改某个功能，先去对应流程文档，不要直接从旧报告开始读。
