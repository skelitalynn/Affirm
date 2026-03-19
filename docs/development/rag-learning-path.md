# RAG 从零到一学习路径

**更新日期**：2026-03-19
**适用对象**：重新熟悉 RAG、并希望结合 Affirm 现有代码学习的维护者

---

## 1. 先用一句话理解 RAG

RAG = `先检索，再生成`。

对 Affirm 来说，这句话可以进一步翻译成：

1. 用户发来一个问题
2. 系统先去找和这个问题最相关的知识片段、历史记忆
3. 再把这些检索结果和最近对话一起交给 LLM 生成回复

所以，Affirm 不是“纯聊天机器人”，也不是“纯文档问答系统”，而是一个：

- 对话机器人
- 带知识库检索
- 带长期语义记忆

的 `Conversational RAG` 系统。

---

## 2. 你这个项目里的 RAG 对应关系

| RAG 概念 | 在 Affirm 里的对应实现 | 代码位置 |
|------|------------------|---------|
| 用户问题 | Telegram 文本消息 | `src/services/telegram.js` |
| Query Embedding | 把用户问题转成向量 | `src/services/embedding.js` |
| 向量库 | PostgreSQL + pgvector | `scripts/database/schemas/init.sql` |
| 知识检索 | 从 `knowledge_chunks` 查相似片段 | `src/models/knowledge.js` |
| 历史记忆检索 | 从 `messages` 查相似历史消息 | `src/models/message.js` |
| Prompt 组装 | 把检索结果注入 system prompt | `src/services/ai.js` |
| 最终生成 | 调用 LLM 输出回复 | `src/services/ai.js` |
| 导入切分 | 把长文本切成可检索片段 | `src/services/chunking.js` |
| 降级策略 | embedding 不可用时只使用时序上下文 | `src/services/embedding.js`、`src/services/telegram.js` |

你要先建立一个基本认识：

- `recentMessages` 不是 RAG，它是短期时序上下文
- `knowledge_chunks` 检索才是外部知识 RAG
- `messages` 语义检索是“长期记忆 RAG”

Affirm 的回答质量，实际上来自这三者的组合。

---

## 3. 当前回答链路

```text
Telegram 用户消息
-> TelegramService._processSingleMessage()
-> Message.create() 保存用户消息，并为消息生成 embedding
-> Message.getRecentMessages() 读取最近 N 条消息
-> Promise.all 并行执行两路检索
   -> Knowledge.semanticSearch(userMessage, user.id, 5, 0.6)
   -> Message.semanticSearchByText(userMessage, user.id, 3, 0.65)
-> AIService.prepareMessages()
   -> 注入 recentMessages
   -> 注入 relevantKnowledge
   -> 注入 semanticMessages
-> AIService.generateResponse()
-> Message.create() 保存 assistant 回复
-> Telegram 回发给用户
```

学习时要重点注意：

- 系统不是只查知识库
- 系统不是只看最近聊天
- 系统不是直接把数据库整表塞给模型

它做的是“先压缩成少量相关上下文，再生成”。

---

## 4. 你需要先补齐的基础概念

### 4.1 Embedding 是什么

Embedding 就是把一句话变成一串浮点数向量，用于表示语义。

在当前项目里：

- 写入消息时会为 `content` 生成 embedding
- 写入知识片段时也会生成 embedding
- 查询时，用户问题也要先生成 query embedding

### 4.2 向量相似度是什么

两个文本越相近，它们的向量距离通常越近。

当前项目使用：

- PostgreSQL `pgvector`
- 余弦相似度相关算子：`embedding <=> query_vector`

你不需要一开始就推导数学公式，但要知道：

- 检索不是关键词匹配
- 检索是在比较“语义位置”

### 4.3 TopK 和阈值是什么

当前项目不是把所有结果都交给模型，而是只拿：

- 知识库 topK = 5
- 历史消息 topK = 3

并且要求相似度高于阈值。

这决定了两个重要问题：

- 召回够不够
- 噪音大不大

### 4.4 Chunking 是什么

Chunking 就是把长文拆成适合检索的小片段。

当前项目状态：

- 后台导入已经接入 `ChunkingService`
- 当前规则是“按空行切段 + 短段合并 + 长段切片 + overlap”
- 这解决了长文本直接整块入库时的基础检索问题

### 4.5 Recall 和 Ranking 是什么

- Recall：能不能把相关内容找出来
- Ranking：找出来之后，排序是否准确

在当前项目中：

- `chunking / query rewrite / hybrid search` 更偏向改善 recall
- `reranker` 更偏向改善 ranking

### 4.6 Citation 是什么

Citation 不是让模型“更聪明”，而是让系统更可解释。

它回答的是：

- 这次回复用了哪几条知识片段
- 是哪几条历史消息影响了回答

对学习和排错非常重要。

---

## 5. 推荐阅读代码顺序

按这个顺序读，会比从数据库或模型层硬啃更容易：

1. `src/services/telegram.js`
   先看 `_processSingleMessage()`，理解一条消息从进入系统到回复用户的主链路。
2. `src/services/ai.js`
   看 `prepareMessages()`，理解 RAG 结果是怎么进 Prompt 的。
3. `src/services/embedding.js`
   看 embedding 是如何生成、失败时如何降级的。
4. `src/models/message.js`
   看消息是如何写入向量、如何做历史语义检索的。
5. `src/models/knowledge.js`
   看知识片段是如何写入和语义搜索的。
6. `src/services/chunking.js`
   看长文本是如何在导入阶段切成可检索片段的。
7. `scripts/database/schemas/init.sql`
   最后看表结构和索引，把前面代码和数据库结构对上。

---

## 6. 建议学习顺序

### 阶段 1：先把当前链路看懂

目标：

- 知道一条用户消息从哪里进来
- 知道检索发生在哪一步
- 知道生成发生在哪一步

完成标准：

- 你能自己口头复述主链路
- 你能说清 `recentMessages`、`relevantKnowledge`、`semanticMessages` 的区别

### 阶段 2：理解向量检索最小闭环

目标：

- 明白为什么消息和知识都要生成 embedding
- 明白为什么用户问题也要生成 embedding
- 明白 topK 和 threshold 的作用

完成标准：

- 你能解释“为什么没有 embedding 就无法做语义检索”
- 你能解释“为什么 embedding 失败时系统还能继续工作”

### 阶段 3：理解 Prompt 注入

目标：

- 理解检索结果不是直接返回给用户
- 理解检索结果只是“给模型参考的上下文”

完成标准：

- 你能指出 RAG 结果在 prompt 里的注入位置
- 你能解释为什么 RAG 检索到了，回答仍然可能不理想

### 阶段 4：再理解增强项

建议顺序：

1. 理解当前 `chunking` 是如何落在后台导入链路里的
2. 再补 `citation`
3. 最后再考虑 `hybrid search / query rewrite / reranker`

---

## 7. 当前增强项怎么理解

### `chunking`

**当前状态**：✅ 已实现（v1）  
**你现在要知道什么**：

- 它解决的是长文切分质量问题
- 它优先影响召回效果
- 当前版本已经覆盖后台导入长文本的基础切分需求
- 后续若继续增强，重点会转向标题感知、语义分块和元数据保留

### `citation`

**当前状态**：⚠️ 待实现  
**你现在要知道什么**：

- 它主要提升可解释性和可观测性
- 它是当前最适合继续补的下一步增强
- 它能帮助你判断“这次回答到底依据了什么”

### `hybrid search`

**当前状态**：⚠️ 待实现  
**你现在要知道什么**：

- 它适合补关键词精确匹配
- 当知识库有术语、专有名词、日期时价值更高

### `query rewrite`

**当前状态**：⚠️ 待实现  
**你现在要知道什么**：

- 它解决“用户问题表达不完整”的问题
- 对省略式、口语化、多指代问题更有价值

### `reranker`

**当前状态**：⚠️ 待实现  
**你现在要知道什么**：

- 它不负责“找出来”，而负责“排顺序”
- 适合在语料变大后再加

---

## 8. 对你当前最实用的学习顺序

如果你的目标是“尽快重新上手这个项目”，建议按下面的顺序：

1. 先彻底看懂当前 RAG 链路
2. 再理解 embedding、向量相似度、topK、threshold
3. 再理解知识库和历史记忆为什么要分成两路检索
4. 再理解当前 `chunking` 为什么放在导入阶段而不是查询阶段
5. 然后补 `citation`
6. 最后再考虑 `hybrid search / query rewrite / reranker`

---

## 9. 学完这份文档后，你应该能回答的问题

- 什么是 RAG？
- Affirm 为什么不是纯文档问答系统？
- `knowledge_chunks` 和 `messages` 在 RAG 里的角色分别是什么？
- `recentMessages` 为什么不等于 RAG？
- 为什么 embedding 缺失时系统还能回复，但语义检索会降级？
- 为什么当前已经落地了 v1 `chunking`，但仍然可能需要继续增强？
- `reranker`、`query rewrite`、`hybrid search`、`citation` 分别解决什么问题？

---

## 10. 下一步建议

读完这份文档后，建议你继续看：

- `docs/architecture/system-architecture.md`
- `docs/project/项目概述.md`
- `docs/database/数据库设计.md`

如果你准备继续实操，最自然的下一步是：

1. 跟读 `_processSingleMessage()` 一次完整链路
2. 再单独梳理 `Message.semanticSearchByText()` 和 `Knowledge.semanticSearch()`
3. 最后回到 `ChunkingService`，看知识导入是如何被切成可检索片段的
