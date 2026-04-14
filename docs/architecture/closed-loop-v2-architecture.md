# 闭环 v2 架构

**更新日期**：2026-04-14
**状态**：`v2-min` 已落地可运行；`v2-target` 已定义为下一阶段长期记忆目标架构

## 1. 先说结论

当前仓库里的 v2，不应再被笼统描述成“长期记忆已经做好了”。

更准确的说法是：

1. 当前已经完成的是 `v2-min`：
   - Telegram 主链路可运行
   - `profiles` 稳定长期记忆可读可写
   - `MemoryService` / `sync_jobs` / `trace` 已接入
   - `Haystack` 可作为外部知识层接入
2. 当前还没有完成的是 `v2-target`：
   - 可检索的历史事件记忆层
   - 基于大量历史内容的 hybrid recall
   - 真正意义上的长期情境召回能力

这份文档的任务，就是把这两层口径拆开。

## 2. v2 现在有两个层次

| 层次 | 含义 | 当前状态 |
|------|------|----------|
| `v2-min` | 可运行、可观测、边界清晰的最小闭环 | 已实现 |
| `v2-target` | 面向显化导师场景的长期记忆目标架构 | 尚未实现完成 |

如果只说一句话：

- `v2-min` 解决“这个系统能不能稳定跑”
- `v2-target` 解决“这个机器人能不能真的记住你的人生上下文”

## 3. `v2-min` 当前到底解决了什么

### 3.1 工程化目标

相比早期版本，当前 v2 主要补了四类能力：

1. 主链路和记忆更新解耦
2. 异步任务状态化
3. 对话链路可追踪
4. 后台和健康检查可见

### 3.2 当前已经落地的核心组件

#### `MemoryService`

职责：

- 在主回复发送后执行长期记忆整理
- 调用 `AIService.generateMemoryPatch()`
- 将结果合并进 `profiles`
- 为这次异步动作创建 `memory_update` 类型的 `sync_jobs`

代码落点：

- `src/services/memory-service.js`

#### `SyncJob`

职责：

- 为知识同步和记忆更新提供统一状态来源
- 让后台和健康检查能看见异步动作是否成功

代码落点：

- `src/models/sync-job.js`
- 数据表：`sync_jobs`

#### `Conversation Trace`

职责：

- 每轮对话生成 `trace_id`
- 给 user / assistant 消息补最小可追踪 metadata
- 记录 provider、model、knowledge refs、memory update strategy

代码落点：

- `src/services/conversation-trace.js`

#### 后台与健康检查增强

当前已经可见：

- Dashboard 汇总 `profiles`、`messages`、`knowledge`、`sync_jobs`
- `/admin/sync-jobs` 查看异步任务
- `/health` 暴露 `message_queue`、`knowledge_rag`、`profile_memory`、`sync_jobs`

## 4. `v2-min` 当前真实的读写链路

### 4.1 当前读路径

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

### 4.2 当前写路径

```text
assistant reply sent
  -> MemoryService.updateLongTermMemory()
  -> SyncJob(memory_update)
  -> AIService.generateMemoryPatch()
  -> Profile.applyMemoryPatch()
  -> mark sync_job completed / failed
```

### 4.3 当前上下文层级

当前实际注入给模型的顺序是：

`system -> profile memory -> recent messages -> knowledge -> current user message`

注意：

- `messages` 语义检索当前已停用
- `profiles` 是当前唯一正在运行的长期记忆层
- `Haystack` 只负责外部知识，不负责用户历史记忆

## 5. `v2-min` 的优点和边界

### 5.1 当前优点

1. 已经不是“单文件脚本式聊天机器人”
2. 记忆写回不会阻塞主回复
3. 长期记忆、短期上下文、外部知识已经有清晰职责边界
4. 知识层失败时可以降级，主回复还能继续
5. 后续扩展长期记忆检索层时，不需要推翻现有工程结构

### 5.2 当前边界

`v2-min` 仍然缺少显化导师真正需要的长期记忆体验：

1. 没有独立的 `memory_events` 历史事件层
2. 没有从大量历史内容中召回相关经历的能力
3. `profiles` 只能承载“稳定事实”，不适合承载大量具体经历
4. 重要历史信息如果没被提炼进 `profiles`，几轮后就会掉出上下文

换句话说，当前系统“能记住你的一些稳定信息”，但还不能稳定地“想起你之前经历过的关键情境”。

## 6. `v2-target` 目标架构是什么

对这个项目，更合理的下一阶段不是恢复旧 `messages` 语义记忆，而是增加一层专门的历史事件记忆。

### 6.1 目标中的四层上下文

| 层级 | 职责 | 是否已实现 |
|------|------|------------|
| `messages` | 原始日志、最近上下文、审计来源 | 已实现 |
| `profiles` | 稳定长期记忆、用户画像、偏好、目标 | 已实现 |
| `memory_events` | 可检索历史事件、承诺、突破、反复卡点 | 规划中 |
| `Haystack` | 外部知识检索 | 已实现 |

### 6.2 目标读路径

```text
Telegram message
  -> recent messages
  -> profile memory
  -> memory_events hybrid retrieval
  -> knowledge retrieval
  -> prompt assembly
  -> AI reply
```

目标 prompt 顺序：

`system -> profile memory -> recalled memory events -> recent messages -> knowledge -> current user message`

### 6.3 目标写路径

```text
assistant reply sent
  -> MemoryService
     -> generate profile patch
     -> generate episodic memory candidates
     -> update profiles
     -> insert / merge memory_events
     -> record sync_jobs / trace metadata
```

### 6.4 目标检索策略

第一版建议：

- `70%` 向量相似度
- `30%` 关键词权重

后续可以在此基础上再叠加：

- `importance`
- `recency`
- `reinforcement_count`
- `event_type` 权重

## 7. `v2-target` 需要新增哪些组件

以下是推荐的新层，但当前仓库还未落地：

1. `memory_events` 数据表
2. `src/models/memory-event.js`
3. `src/services/memory-event-service.js`
4. `src/services/memory-retrieval-service.js`
5. 可选的 `memory_ranking` / `memory_compaction` 逻辑

这些新组件的职责不是替代 `profiles`，而是补上“可召回的历史经历层”。

## 8. 什么时候算“v2 完成”

### 8.1 如果目标是“v2 最小闭环”

以下条件满足，就已经算完成：

1. Telegram 消息能稳定进主链路
2. `messages` 能保存 user / assistant 日志
3. `profiles` 能读取并更新
4. `MemoryService` 异步写回长期记忆
5. `sync_jobs` / `trace` / 后台 / 健康检查能看见链路状态
6. `Haystack` 可选接入，不影响主链路可运行

### 8.2 如果目标是“长期记忆效果闭环”

还需要继续做：

1. `memory_events` 的写入
2. `memory_events` 的 hybrid retrieval
3. Prompt 中注入历史相关片段
4. 后台可查看和修订历史事件记忆
5. 基本的召回质量验证

## 9. 文档和面试里应该怎么表述 v2

当前推荐口径：

> 当前已经完成的是 v2 最小闭环，也就是一个可运行、可观测、职责清晰的 Telegram AI 显化导师系统。它已经具备短期上下文、稳定长期记忆、外部知识接入和异步记忆更新能力，但“可检索的历史事件记忆层”还在下一阶段规划中。

不推荐口径：

- “我已经实现了完整长期记忆”
- “机器人已经能从大量历史内容里稳定召回经历”
- “hybrid retrieval 已经全面上线”

## 10. 下一步阅读

如果你要继续推进长期记忆主线，按这个顺序：

1. [显化导师长期记忆架构](./manifest-coach-memory-architecture.md)
2. [系统架构](./system-architecture.md)
3. [Telegram 对话链路](../development/02-Telegram-对话链路.md)
4. [长期记忆升级路线](../development/07-长期记忆升级路线.md)
