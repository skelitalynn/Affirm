# 03 Knowledge RAG

## 1. 什么时候看这篇

当你要改这些内容时：

- 知识新增
- 知识批量导入
- LangChain / PGVectorStore
- chunking
- knowledge 检索策略
- metadata 结构

## 2. 先读哪些文件

按顺序读：

1. `src/services/rag/knowledge-vector-store.js`
2. `src/models/knowledge.js`
3. `src/admin/routes/knowledge.js`
4. `src/services/chunking.js`
5. `src/services/telegram.js`

## 3. 当前写入流程

### 单条知识

```text
Admin form
  -> /admin/knowledge
  -> Knowledge.create()
  -> knowledgeVectorStore.addKnowledge()
  -> PGVectorStore.addDocuments()
```

### 批量导入

```text
Admin import
  -> chunkingService.buildKnowledgeItems()
  -> Knowledge.createBatch()
  -> knowledgeVectorStore.addKnowledgeBatch()
  -> PGVectorStore.addDocuments()
```

## 4. 当前检索流程

```text
Telegram userMessage
  -> Knowledge.semanticSearch()
  -> similaritySearchWithScore()
  -> threshold 过滤
  -> relevantKnowledge
  -> AIService.prepareMessages()
```

## 5. 你改不同目标时，应该动哪里

| 目标 | 主要文件 |
|------|----------|
| Embedding 模式切换 | `src/services/rag/knowledge-vector-store.js` |
| metadata 规则 | `src/services/rag/knowledge-vector-store.js` + `src/models/knowledge.js` |
| 检索阈值 / limit | `src/models/knowledge.js` + `src/services/telegram.js` |
| 导入切分规则 | `src/services/chunking.js` |
| 后台导入字段 | `src/admin/routes/knowledge.js` |

## 6. 当前最重要的现实约束

- `knowledge_chunks` 是当前唯一有效的 RAG 表
- `knowledge` 的向量写入和查询都依赖 LangChain
- 远程 embedding key 缺失，或远程 embeddings 实际不可用时，只能得到 deterministic fallback
- `messages` 语义记忆不属于当前 RAG 主线

## 7. 最小验证方式

1. 用后台新增一条知识
2. 用后台导入一段长文本
3. 在数据库确认 `knowledge_chunks` 有数据
4. 看 `metadata` 是否同步到了 `source/user_id`
5. 给 Bot 发送相关问题，确认回复使用了知识

## 8. 改这个流程时最容易犯的错

1. 只改 `Knowledge`，没改 `knowledge-vector-store`
2. 只改 `metadata`，没考虑旧列兼容
3. 把问题误判到 `messages` 语义记忆
4. 没有先确认当前是不是 deterministic fallback
