# 02 Telegram 对话链路

## 1. 什么时候看这篇

当你要改这些内容时：

- Telegram 消息处理
- Prompt 组装
- 短期上下文读取
- 长期记忆注入与更新
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

## 4. 你改不同目标时应该动哪里

| 目标 | 主要文件 |
|------|----------|
| 消息入口 / 命令 | `src/services/telegram.js` |
| Prompt 组装与顺序 | `src/services/ai.js` |
| 最近消息上下文 | `src/models/message.js` |
| 长期记忆更新 | `src/services/memory-service.js` + `src/models/profile.js` |
| Trace 元数据 | `src/services/conversation-trace.js` |
| RAG 查询接入 | `src/models/knowledge.js` + `src/services/rag/*` |
| 用户级串行队列 | `src/utils/message-queue.js` |

## 5. 当前硬边界

- `messages` 只负责短期上下文
- `profiles` 只负责长期记忆
- Haystack 只负责外部知识
- 长期记忆更新放在回复后
- `Message.semanticSearchByText()` 不属于当前主线

## 6. Prompt 注入顺序

固定顺序：

1. `system prompt`
2. `profile memory`
3. `recent messages`
4. `knowledge RAG`
5. `current user message`

任何人改 prompt 组装时，都不应打乱这个顺序。

## 7. v2 新增点

### `trace_id`

- user / assistant message 都会带 `metadata.trace_id`
- assistant message 还会记录 provider、model、knowledge refs

### `MemoryService`

- 不再让 TelegramService 直接处理记忆 merge
- 通过独立服务生成 memory patch 并写回 `profiles`

### `sync_jobs`

- 记忆整理会写入 `memory_update` 任务
- 失败不会阻塞主回复，但能在后台和健康检查里看到

## 8. 最小验证方式

### Polling

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

### Webhook

```bash
WEBHOOK_ENABLED=true npm start
```

再检查：

- `http://localhost:3002/health`

## 9. 最容易犯的错

1. 把长期记忆写回 `messages`
2. 把知识库内容混进 `profiles`
3. 让记忆更新阻塞主回复
4. 只改 prompt，不改读取链路
5. 新增 metadata 却不保证字段可读可追踪
