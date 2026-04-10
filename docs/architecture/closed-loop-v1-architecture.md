# 闭环 v1 架构

**更新日期**：2026-04-09
**状态**：已落地实现的闭环 v1 基线

本文档定义 Affirm 后续实现应对齐的“最小闭环 v1”。它不要求一次性恢复所有历史 RAG / 记忆能力，只要求先打通一个稳定、可验证、可迭代的对话闭环。

## 1. 设计目标

闭环 v1 只解决四件事：

1. Bot 能拿到足够的短期上下文
2. Bot 能跨会话记住用户的稳定事实和待跟进事项
3. Bot 能访问外部知识库
4. 以上三层不会相互污染

## 2. 四层职责

### 短期上下文：`messages`

职责：

- 保存原始对话日志
- 为当前回答提供最近 N 条上下文
- 作为每日归档、审计、排查的真实来源

不负责：

- 长期记忆
- 外部知识检索
- 语义召回主链路

### 长期记忆：`profiles`

职责：

- 保存 Agent 主动维护的精选记忆
- 只存跨会话复用的信息
- 在生成回复前作为独立 memory block 注入

不负责：

- 原始日志存档
- 外部知识
- 大量明细文本堆积

### 外部知识：Haystack

职责：

- 知识导入
- 分块
- 向量化
- 过滤
- 检索
- 可选重排

不负责：

- 用户长期记忆
- 对话日志
- 最终回答生成

### 回复生成：Node 主链路

职责：

- 读取 `profiles`
- 读取最近 `messages`
- 调 Haystack 查知识
- 组装 prompt
- 调用主 LLM 生成回复

## 3. 回复前注入顺序

固定顺序如下：

1. `system prompt`
2. `profile memory`
3. `recent messages`
4. `knowledge RAG`
5. `current user message`

这个顺序的原因是：

- `profile memory` 决定回答风格和长期连续性
- `recent messages` 决定本轮局部上下文
- `knowledge RAG` 只补充外部事实，不覆盖用户状态

## 4. 读路径

```text
Telegram user message
  -> Message.create(user)
  -> Profile.findOrCreate()
  -> Message.getRecentMessages()
  -> Knowledge.semanticSearch(query, userId)
  -> AIService.prepareMessages()
  -> AI provider
  -> Message.create(assistant)
```

### 读路径要求

- `profiles` 读取必须先于 knowledge 检索结果注入
- Haystack 检索必须同时覆盖 `global` 和当前用户的 `user-scoped` 知识
- 任何一层失败都不应直接阻断主回复，除非数据库不可用

## 5. 写路径

```text
user message
  -> 写入 messages
  -> 生成回答
  -> 写入 assistant message
  -> 异步整理长期记忆
  -> 更新 profiles
```

### 写路径要求

- 长期记忆更新必须放在回复之后
- 记忆更新失败不能回滚主回复
- 记忆更新应是合并、覆盖、去重，不是盲目追加

## 6. `profiles` 的最小记忆结构

v1 不要求新增专用 memory 表。最小实现直接复用 `profiles`，其中：

- `goals`：用户的长期目标或当前主要追求
- `status`：当前阶段状态，如 `active` / `paused`
- `preferences`：结构化长期记忆 JSON

推荐 `preferences` 结构：

```json
{
  "memory_version": 1,
  "summary": "一句到三句的当前用户摘要",
  "facts": [
    "稳定事实 1",
    "稳定事实 2"
  ],
  "communication_preferences": [
    "更喜欢直接建议",
    "不喜欢空泛鼓励"
  ],
  "open_loops": [
    "下次值得跟进的话题 1",
    "下次值得跟进的话题 2"
  ],
  "last_updated_at": "2026-04-09T00:00:00.000Z"
}
```

## 7. 什么信息可以写进长期记忆

可以写入：

- 用户明确表达的长期目标
- 重复出现的偏好、限制条件、习惯
- 会影响建议方式的稳定事实
- 下次应该追问或跟进的事项

不要写入：

- 一次性情绪波动
- 当前 recent messages 已经覆盖的临时细节
- 外部知识库内容
- 模型自行推断、没有被用户确认的结论

## 8. Haystack 知识文档要求

每条知识最少携带这些元数据：

- `scope`: `global` / `user`
- `user_id`
- `source`
- `document_id`
- `chunk_id`
- `import_batch`

查询时的过滤规则：

- 全局知识：`scope == global`
- 用户知识：`scope == user` 且 `user_id == current_user`
- 最终结果：两者并集

## 9. 失败与降级策略

### Haystack 不可用

- 继续用 `profile memory + recent messages` 回复
- 标记当前回复为“无外部知识增强”

### `profiles` 不存在

- 自动降级为“只有 recent messages + knowledge”
- 不应阻断主回复

### 记忆整理失败

- 不影响本轮回答
- 记录日志，后续可补算

## 10. v1 明确不做的事

- 恢复 `messages` 语义记忆
- 混合检索之外的复杂记忆图谱
- 多层 agent memory planner
- 自动长期记忆冲突解决器
- 复杂引用系统

## 11. 实施优先级

1. 明确 `messages`、`profiles`、Haystack 的职责边界
2. 让回复前能读取 `profiles`
3. 让回复后能异步更新 `profiles`
4. 用 Haystack 替换旧的本地 knowledge RAG 查询
5. 最后再考虑混合检索、rerank、引用

## 12. 最小验证清单

1. 用户发一条消息后，`messages` 正常写入
2. 回复前能读取到该用户 `profiles`
3. Haystack 能返回 `global + user-scoped` 的知识结果
4. AI prompt 中按顺序注入四层上下文
5. assistant 回复写入后，`profiles` 被异步更新
6. 任何一层失败时主回复仍能继续
