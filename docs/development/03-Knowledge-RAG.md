# 03 Knowledge RAG

## 1. 什么时候看这篇

当你要改这些内容时：

- Haystack 知识导入
- 知识切块
- 检索过滤
- top-k / 排序
- 知识管理后台
- 知识同步状态

## 2. 先读哪些文件

按顺序读：

1. [Knowledge RAG 架构](../architecture/knowledge-rag-architecture.md)
2. `src/admin/routes/knowledge.js`
3. `src/models/knowledge.js`
4. `src/services/rag/provider.js`
5. `src/services/rag/haystack-client.js`
6. `src/services/telegram.js`
7. `src/services/ai.js`

## 3. 当前写入流

### 单条知识

```text
Admin form
  -> /admin/knowledge
  -> normalize payload
  -> Knowledge.create()
  -> write knowledge_chunks + rag_sync
  -> ragProvider.upsertKnowledge()
  -> Haystack indexing pipeline
```

### 批量导入

```text
Admin import
  -> split / normalize
  -> add metadata
  -> Knowledge.createBatch()
  -> write knowledge_chunks + rag_sync
  -> ragProvider.upsertKnowledge()
  -> Haystack indexing pipeline
```

## 4. 当前查询流

```text
Telegram userMessage
  -> Knowledge.semanticSearch(query, userId)
  -> ragProvider.searchKnowledge(query, userId)
  -> filter(global + user-scoped)
  -> top-k knowledge chunks
  -> AIService.prepareMessages()
```

## 5. 你改不同目标时应该动哪里

| 目标 | 主要文件 |
|------|----------|
| 知识导入字段规范 | `src/admin/routes/knowledge.js` |
| 本地桥接与同步状态 | `src/models/knowledge.js` |
| RAG provider 适配 | `src/services/rag/*` |
| 检索参数 / top-k | `src/services/rag/*` + `src/services/telegram.js` |
| Prompt 注入格式 | `src/services/ai.js` |
| 长文切块规则 | 导入链路 / Haystack pipeline |

## 6. 当前必须记住的边界

- Haystack 只处理外部知识
- 用户长期记忆不进入 Haystack
- 运行时检索必须同时查：
  - `scope = global`
  - `scope = user AND user_id = current_user`
- `knowledge_chunks` 是桥接层，不是最终主检索库

## 7. metadata 最小要求

每条知识至少带：

- `scope`
- `user_id`
- `source`
- `document_id`
- `chunk_id`
- `import_batch`
- `rag_sync`

## 8. v2 相关点

- 后台 Dashboard 会显示 Knowledge RAG 状态
- `/admin/sync-jobs` 可辅助排查知识同步任务
- `knowledge_chunks` 仍保留为回填和审计来源

## 9. 最小验证方式

1. 通过后台新增一条全局知识
2. 通过后台新增一条用户知识
3. 检查 `rag_sync` 状态
4. 让对应用户发起相关问题
5. 确认返回结果同时支持全局和用户私有知识
6. 如有历史数据，执行 `npm run knowledge:sync`

## 10. 改这条链路时最容易犯的错

1. 只改后台，不改 provider
2. 只改 provider，不改 prompt 注入
3. 忘了带 `scope`
4. 只按 `user_id` 过滤，导致全局知识失效
5. 把长期记忆错误塞进 Haystack
6. 只看保存成功，不看同步是否成功
