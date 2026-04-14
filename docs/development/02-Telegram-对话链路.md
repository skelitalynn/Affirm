# 02 Telegram 对话链路

**更新日期**：2026-04-14
**当前状态**：当前描述 `v2-min` 实际链路，并补充 `v2-target` 目标链路

## 1. 什么时候看这篇

当你要改这些内容时：

- Telegram 消息处理
- Prompt 组装
- 短期上下文读取
- 当前长期记忆注入与更新
- 历史记忆召回接入
- Trace metadata
- 队列策略
- Webhook / Polling

## 2. 先读哪些文件

按顺序读：

1. `src/index.js`
2. `src/services/telegram.js`
3. `src/services/ai.js`
4. `src/services/memory-service.js`
5. `src/services/conversation-trace.js`
6. `src/models/message.js`
7. `src/models/profile.js`
8. `src/utils/message-queue.js`

知识层相关：

- `src/models/knowledge.js`
- `src/services/rag/provider.js`
- `src/services/rag/haystack-client.js`

目标长期记忆扩展相关：

- [显化导师长期记忆架构](../architecture/manifest-coach-memory-architecture.md)
- [长期记忆升级路线](07-长期记忆升级路线.md)

## 3. 当前主链路

```text
user message
  -> TelegramService.handleMessage()
  -> messageQueue.enqueue()
  -> _processSingleMessage()
  -> create trace_id
  -> Message.create(user, metadata.trace_id)
  -> Profile.findOrCreate()
  -> Message.getRecentMessages()
  -> Knowledge.semanticSearch()
  -> AIService.generateResponse()
  -> Message.create(assistant, metadata.generation / knowledge_refs)
  -> bot.sendMessage()
  -> MemoryService.updateLongTermMemory()
  -> SyncJob(memory_update)
```

## 4. 当前上下文读取顺序

当前实际读取的是三层上下文：

1. `profile memory`
2. `recent messages`
3. `knowledge RAG`

再加上：

4. 当前用户输入

因此当前 prompt 顺序是：

`system -> profile memory -> recent messages -> knowledge -> current user message`

## 5. 当前硬边界

当前主链路必须遵守：

1. `messages` 只负责原始日志和短期上下文
2. `profiles` 只负责稳定长期记忆
3. Haystack 只负责外部知识
4. 长期记忆更新放在回复后
5. `Message.semanticSearchByText()` 不属于当前主线

## 6. 为什么当前链路还不够

当前链路可以让机器人：

- 读最近几轮
- 读稳定记忆
- 读外部知识

但它还不能稳定做到：

- 从很多历史内容中召回相关经历
- 把“你之前有过类似情况”这种信息带进当前轮回复

原因不是 prompt 顺序不对，而是当前缺了一层：

- `memory_events`

## 7. 目标链路应该长什么样

### 7.1 目标读路径

```text
user message
  -> TelegramService.handleMessage()
  -> messageQueue.enqueue()
  -> _processSingleMessage()
  -> create trace_id
  -> Message.create(user)
  -> Profile.findOrCreate()
  -> Message.getRecentMessages()
  -> MemoryRetrievalService.searchRelevantEvents()
  -> Knowledge.semanticSearch()
  -> AIService.generateResponse()
  -> Message.create(assistant)
  -> bot.sendMessage()
  -> MemoryService.updateLongTermMemory()
```

### 7.2 目标 prompt 顺序

目标顺序应改成：

`system -> profile memory -> recalled memory events -> recent messages -> knowledge -> current user message`

原因：

1. 先给模型稳定事实
2. 再给模型与当前问题有关的历史经历
3. 再给最近几轮的时序上下文
4. 最后补外部知识

## 8. 当前和目标分别改哪里

| 目标 | 主要文件 |
|------|----------|
| 消息入口 / 命令 | `src/services/telegram.js` |
| Prompt 组装与顺序 | `src/services/ai.js` |
| 最近消息上下文 | `src/models/message.js` |
| 当前长期记忆更新 | `src/services/memory-service.js` + `src/models/profile.js` |
| Trace 元数据 | `src/services/conversation-trace.js` |
| 外部知识查询接入 | `src/models/knowledge.js` + `src/services/rag/*` |
| 用户级串行队列 | `src/utils/message-queue.js` |

未来计划新增的文件：

| 目标 | 计划文件 |
|------|----------|
| 历史事件模型 | `src/models/memory-event.js` |
| 历史事件写入 | `src/services/memory-event-service.js` |
| 历史事件检索 | `src/services/memory-retrieval-service.js` |

这些文件当前还不存在，不要把文档写成已实现。

## 9. `v2-min` 新增点

### `trace_id`

- user / assistant message 都会带 `metadata.trace_id`
- assistant message 还会记录 provider、model、knowledge refs

### `MemoryService`

- 不再让 TelegramService 直接处理记忆 merge
- 通过独立服务生成 memory patch 并写回 `profiles`

### `sync_jobs`

- 记忆整理会写入 `memory_update` 任务
- 失败不会阻塞主回复，但能在后台和健康检查里看到

## 10. 最小验证方式

### 10.1 当前 `v2-min`

```bash
npm start
```

然后在 Telegram 里验证：

1. user message 是否写入 `messages`
2. assistant message 是否写入 `messages`
3. `trace_id` 是否贯穿一轮对话
4. 是否读取了 `profiles`
5. 是否调用了 Haystack
6. 回复后是否产生 `memory_update` 类型的 `sync_jobs`

### 10.2 Webhook

```bash
WEBHOOK_ENABLED=true npm start
```

再检查：

- `http://localhost:3002/health`

### 10.3 未来长期记忆升级后的新增验证

1. 回复后是否生成 `memory_events`
2. 类似主题提问时是否能召回相关历史事件
3. prompt 中是否出现“历史相关记忆片段”
4. 错误历史事件是否能在后台修正

## 11. 最容易犯的错

1. 把长期记忆写回 `messages`
2. 把知识库内容混进 `profiles`
3. 让记忆更新阻塞主回复
4. 只改 prompt，不改读取链路
5. 误以为 Haystack 能替代用户历史记忆召回
6. 把目标中的 `memory_events` 写成已落地能力
