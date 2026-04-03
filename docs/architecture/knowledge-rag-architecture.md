# Knowledge RAG 架构

**更新日期**：2026-04-04

本文只描述当前仓库里已经启用的 knowledge RAG，不讨论历史迁移计划。

## 1. 核心文件

- `src/services/rag/knowledge-vector-store.js`
- `src/models/knowledge.js`
- `src/services/chunking.js`
- `src/admin/routes/knowledge.js`
- `src/services/telegram.js`

## 2. 数据表

当前使用表：`knowledge_chunks`

关键列：

- `id`
- `user_id`
- `content`
- `source`
- `embedding`
- `metadata`
- `created_at`

`metadata` 是当前检索和写入的主字段，`source` / `user_id` 保留为兼容旧 SQL 和后台列表。

## 3. Embedding 模式选择

`KnowledgeVectorStore.createRuntime()` 的选择顺序：

1. `EMBEDDING_API_KEY`
2. `OPENAI_API_KEY`
3. 本地 deterministic 向量

如果前两者存在但远程 embeddings 返回鉴权或网络错误，运行时会自动降级到 deterministic 向量。

这意味着：

- 你不需要单独配置 embedding key 才能跑通系统
- 但没有远程 key 时，knowledge 检索只能作为开发态或低质量兜底

## 4. 写入流程

### 单条新增

```text
POST /admin/knowledge
  -> Knowledge.create()
  -> knowledgeVectorStore.addKnowledge()
  -> PGVectorStore.addDocuments()
  -> knowledge_chunks
```

### 批量导入

```text
POST /admin/knowledge/import
  -> chunkingService.buildKnowledgeItems()
  -> Knowledge.createBatch()
  -> knowledgeVectorStore.addKnowledgeBatch()
  -> PGVectorStore.addDocuments()
  -> knowledge_chunks
```

导入时会写入这些 metadata：

- `created_by`
- `import_batch`
- `chunk_index`
- `chunk_count`

## 5. 检索流程

```text
Telegram userMessage
  -> Knowledge.semanticSearch(queryText, userId, limit, threshold)
  -> knowledgeVectorStore.similaritySearch()
  -> PGVectorStore.similaritySearchWithScore()
  -> threshold 过滤
  -> relevantKnowledge
  -> AIService.prepareMessages()
```

## 6. 当前边界

### 已启用

- knowledge 写入
- knowledge 批量导入
- knowledge 语义检索
- metadata 同步

### 未启用

- message 语义记忆
- reranker
- hybrid search
- citation

## 7. 开发这个模块时的最低顺序

1. 先看 `src/services/rag/knowledge-vector-store.js`
2. 再看 `src/models/knowledge.js`
3. 然后看 `src/admin/routes/knowledge.js`
4. 如果改导入切分，再看 `src/services/chunking.js`
5. 如果改对话注入，再回到 `src/services/telegram.js`
