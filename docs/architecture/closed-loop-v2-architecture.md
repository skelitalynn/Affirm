# 闭环 v2 架构

**更新日期**：2026-04-10  
**状态**：v2 工程化增强方案，当前已部分落地

## 1. v2 想解决什么

v1 解决的是“功能闭环”问题：系统已经能稳定读短期上下文、读长期记忆、读外部知识，再生成回复。

v2 解决的是“工程闭环”问题：这个系统需要更像正式项目，而不是只会跑主流程的 demo。

v2 的目标：

1. 把长期记忆更新从 TelegramService 中抽离
2. 给异步任务补状态追踪
3. 给每轮对话补 trace 和生成元数据
4. 让后台和健康检查能直接看到系统状态
5. 给后续 hybrid retrieval、rerank、独立 worker 留扩展点

## 2. v1 到 v2 的变化

| 维度 | v1 | v2 |
|------|----|----|
| 长期记忆更新 | 主链路内异步调用 | 抽到 `MemoryService` |
| 异步任务状态 | 主要靠日志 | 写入 `sync_jobs` |
| 对话可追踪性 | 只看 message 内容 | `trace_id` + generation metadata |
| 后台可观测性 | 基础计数 | 队列 / RAG / sync jobs 总览 |
| 数据库治理 | 以能跑为主 | 补约束、索引、去重迁移 |

## 3. v2 当前新增的核心层

### 3.1 `MemoryService`

职责：

- 接收回复后的上下文
- 调用 LLM 生成 memory patch
- 将 patch 合并进 `profiles`
- 写入 `memory_update` 类型的 `sync_jobs`

落点：

- `src/services/memory-service.js`

### 3.2 `SyncJob`

职责：

- 记录知识同步、记忆更新等异步任务
- 为后台和健康检查提供统一状态来源

落点：

- `src/models/sync-job.js`
- 数据表：`sync_jobs`

### 3.3 `Conversation Trace`

职责：

- 每轮对话生成 `trace_id`
- 在 `messages.metadata` 中记录最小可追踪上下文
- 给 assistant message 增加 provider、model、knowledge refs、memory update strategy

落点：

- `src/services/conversation-trace.js`

### 3.4 后台与健康检查增强

当前已经补齐：

- Dashboard 展示队列模式、Knowledge RAG 状态、同步任务计数
- 新增 `/admin/sync-jobs` 管理页
- `/health` 暴露 `message_queue`、`sync_jobs`、`profile_memory`、`knowledge_rag`

## 4. v2 当前读写链路

### 读路径

```text
Telegram message
  -> create trace_id
  -> Message.create(user, metadata.trace_id)
  -> Profile.findOrCreate()
  -> Message.getRecentMessages()
  -> Knowledge.semanticSearch()
  -> AIService.prepareMessages()
  -> AI provider
  -> Message.create(assistant, metadata.generation / knowledge_refs)
```

### 写路径

```text
assistant reply sent
  -> MemoryService.updateLongTermMemory()
  -> SyncJob(memory_update)
  -> AIService.generateMemoryPatch()
  -> Profile.applyMemoryPatch()
  -> mark sync_job completed / failed
```

## 5. 当前已经落地的 v2 能力

1. `MemoryService` 独立服务层
2. `sync_jobs` 模型访问层
3. 对话 `trace_id`
4. assistant message generation metadata
5. 健康检查增强
6. 后台同步任务页
7. 数据库层的 `profiles` / `sync_jobs` 约束与索引补强

## 6. 仍处于规划中的 v2.1 能力

这些能力还不应在面试里说成“已经完全实现”：

1. 真正的 hybrid retrieval
2. rerank
3. 用户可见引用
4. 独立 memory worker
5. 记忆冲突检测和衰减策略
6. 更完整的评估与监控面板

## 7. 为什么 v2 更像正式项目

因为它补的是工程系统的四个关键能力：

1. 责任拆分：主链路和记忆更新解耦
2. 可观测性：异步任务和队列状态可追踪
3. 可治理性：后台可直接查看同步任务和 RAG 状态
4. 可演进性：为独立 worker、混合检索、评估链路保留接口

换句话说，v2 的重点不是“更聪明”，而是“更像可维护的线上系统”。

## 8. 面试时怎么讲 v2

可以这样概括：

> v1 解决的是闭环问题，v2 解决的是工程化问题。我把长期记忆更新抽成了独立的 MemoryService，把异步任务状态写进 sync_jobs，把每轮对话补上 trace metadata，并在后台和健康检查里暴露队列、知识检索和同步任务状态。这样这个项目就不是一个调用模型的脚本，而是一个有服务边界、可观测性和演进路径的系统。
