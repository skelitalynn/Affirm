# 02 Telegram 对话链路

## 1. 什么时候看这篇

当你要改这些内容时：

- Telegram 消息处理
- Polling / Webhook
- Prompt 组装
- 队列串行化
- `/start`、`/help`、`/clear` 等命令
- Notion 归档接入

## 2. 先读哪些文件

按顺序读：

1. `src/index.js`
2. `src/services/telegram.js`
3. `src/services/ai.js`
4. `src/utils/message-queue.js`
5. `src/models/message.js`
6. `src/services/notion.js`

## 3. 当前主链路

```text
user message
  -> TelegramService.handleMessage()
  -> _processSingleMessage()
  -> Message.create(user)
  -> Message.getRecentMessages()
  -> Knowledge.semanticSearch()
  -> Message.semanticSearchByText()   # 当前停用
  -> AIService.generateResponse()
  -> Message.create(assistant)
  -> bot.sendMessage()
```

## 4. 你改不同目标时，应该动哪里

| 目标 | 主要文件 |
|------|----------|
| 消息入口 / 命令 | `src/services/telegram.js` |
| Prompt 和上下文拼装 | `src/services/ai.js` |
| 最近消息上下文 | `src/models/message.js` |
| 队列策略 | `src/utils/message-queue.js` |
| Webhook 健康检查 | `src/services/telegram.js` |
| Notion 归档 | `src/services/notion.js` |

## 5. 当前必须记住的边界

- `messages` 语义记忆当前停用
- 所以 Telegram 主链路里真正生效的检索只有 `Knowledge.semanticSearch()`
- 如果你要恢复 `messages` 语义记忆，这会是一个独立任务，不是改一点 prompt 就能恢复
- Notion 归档由 `src/services/notion.js` 从 `src/config.js` 读取配置后显式传给 `skills/notion/client.js`

## 6. 最小验证方式

### Polling

```bash
npm start
```

然后直接在 Telegram 里发消息验证：

- 命令是否正常
- 回复是否正常
- 数据是否写入 `messages`

### Webhook

```bash
WEBHOOK_ENABLED=true npm start
```

再检查：

- `http://localhost:3002/health`

## 7. 结束前检查

- 用户消息是否已保存
- assistant 回复是否已保存
- knowledge 检索是否仍在工作
- 没有误把逻辑写进 Admin 或 Knowledge 模块
