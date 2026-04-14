# 系统架构

**更新日期**：2026-04-14
**状态**：当前文档同时描述“已运行的当前架构”和“下一阶段目标架构”

## 1. 先区分两张图

当前这个项目有两套必须同时理解的架构：

1. 当前运行架构
   - 用来描述仓库里已经存在并可运行的系统
2. 目标记忆架构
   - 用来描述显化导师想达到的长期记忆体验

如果不把这两张图拆开，文档就会继续出现“把目标写成现状”的问题。

## 2. 当前运行架构

### 2.1 运行入口

| 入口 | 文件 | 作用 |
|------|------|------|
| Telegram 主服务 | `src/index.js` | 启动 Bot、AI、队列、主链路 |
| Admin 后台 | `src/admin/server.js` | 管理 Profile、Knowledge、Sync Jobs |
| 数据库迁移 | `scripts/database/migrate.js` | 管理应用表结构 |
| Haystack 侧车 | 独立服务 | 负责外部知识导入、检索、可选重排 |

### 2.2 当前系统总览

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
```

### 2.3 当前 Telegram 主链路

关键文件：

- `src/services/telegram.js`
- `src/services/ai.js`
- `src/services/memory-service.js`
- `src/services/conversation-trace.js`
- `src/models/message.js`
- `src/models/profile.js`
- `src/models/knowledge.js`
- `src/services/rag/provider.js`

当前处理流程：

1. 用户消息进入 `handleMessage()`
2. 通过 `messageQueue` 进入用户级串行处理
3. 生成 `trace_id`
4. 写入 user message
5. 读取 `profiles`
6. 读取最近 `messages`
7. 检索 Haystack 外部知识
8. `AIService.prepareMessages()` 组装 prompt
9. 生成回复
10. 写入 assistant message
11. 异步调用 `MemoryService`
12. 更新 `profiles`，记录 `sync_jobs`

## 3. 当前运行架构的边界

### 3.1 `messages`

当前职责：

- 原始聊天日志
- 最近 N 条时序上下文
- 审计、回放、问题排查来源

当前不负责：

- 运行时长期记忆主库
- 历史语义召回主链路

说明：

- `Message.semanticSearchByText()` 当前已停用

### 3.2 `profiles`

当前职责：

- 用户稳定长期记忆
- 当前目标
- 沟通偏好
- 待跟进事项
- 稳定事实摘要

当前不适合负责：

- 承载大量历史事件
- 从很多历史内容里做检索召回

### 3.3 `knowledge_chunks + Haystack`

当前职责：

- 外部知识导入
- 外部知识检索
- `global + user-scoped` 权限过滤
- 检索结果回传主链路

当前不负责：

- 用户长期记忆
- 用户历史经历召回

### 3.4 `sync_jobs`

当前职责：

- 记录异步知识同步状态
- 记录异步记忆更新状态
- 提供后台可观测性

它不是：

- 业务主数据表
- 记忆主存储表

## 4. 当前工程治理层

### `MemoryService`

- 统一管理长期记忆 patch 生成和写回
- 让 Telegram 主服务保持轻量

### `Conversation Trace`

- 每轮对话生成 `trace_id`
- 让消息和异步任务能够按链路追踪

### `Admin`

- 查看 `profiles`
- 管理外部知识
- 查看 `sync_jobs`
- 汇总系统运行状态

## 5. 目标记忆架构

当前运行架构已经足够支撑 `v2-min`，但还不足以支撑“长期陪伴型显化导师”的目标体验。

下一阶段应在不破坏当前边界的前提下，增加一层新的记忆能力。

### 5.1 目标中的四层上下文

| 层级 | 作用 | 当前状态 |
|------|------|----------|
| `messages` | 原始日志和最近时序上下文 | 已实现 |
| `profiles` | 稳定长期记忆 | 已实现 |
| `memory_events` | 可检索历史事件记忆 | 规划中 |
| `Haystack` | 外部知识 | 已实现 |

### 5.2 目标系统总览

```text
Telegram
  -> TelegramService
     -> MessageQueue
     -> recent messages
     -> Profile memory
     -> MemoryRetrievalService
        -> memory_events
     -> Knowledge RAG
        -> Haystack
     -> AIService
     -> Message.create()
     -> MemoryService
        -> Profile patch
        -> MemoryEvent extraction
     -> SyncJob

Admin Browser
  -> profiles
  -> memory events
  -> knowledge
  -> sync jobs

Application DB
  -> users
  -> profiles
  -> messages
  -> memory_events
  -> knowledge_chunks
  -> sync_jobs
```

### 5.3 目标中的新增组件

推荐新增：

- `src/models/memory-event.js`
- `src/services/memory-event-service.js`
- `src/services/memory-retrieval-service.js`

这些组件当前还不存在，文档只是定义方向，不代表代码已经落地。

## 6. 为什么目标架构要这样扩展

### 6.1 不恢复旧 `messages` 语义记忆

原因：

1. 原始消息噪声高
2. 对话碎片多
3. 召回结果难治理
4. 容易把短期情绪误认为长期稳定事实

### 6.2 不把用户记忆塞进 Haystack

原因：

1. 用户记忆和外部知识是两类完全不同的数据
2. 权限边界不同
3. 更新频率不同
4. 纠错方式不同
5. 后台运营动作不同

### 6.3 为什么保留 `profiles`

因为稳定事实层仍然必须存在：

- 用户是谁
- 用户长期目标是什么
- 用户偏好怎样被支持
- 当前有哪些长期待跟进事项

这类信息不应该每次都从事件检索里临时拼出来。

## 7. 配置链路

```text
.env / process env
  -> src/config.js
  -> application modules
  -> AI client / memory config / Haystack client config
```

关键点：

1. `src/config.js` 是唯一配置入口
2. 主链路显式读取 `ai`、`memory`、`haystack` 配置
3. Haystack 的 embedding / rerank 细节应留在检索侧配置，不要散落进业务代码

## 8. 当前必须记住的架构结论

1. `messages` 不是长期记忆主库
2. `profiles` 是当前唯一已经在运行的长期记忆层
3. `memory_events` 是下一阶段要新增的历史记忆层
4. `knowledge_chunks` 是桥接层，不是用户记忆层
5. Haystack 负责外部知识基础设施，Node 负责会话、记忆和业务规则
