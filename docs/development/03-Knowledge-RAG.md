# 03 Knowledge RAG

**更新日期**：2026-04-14
**当前状态**：维护的是“外部知识层”，不是“用户长期记忆层”

## 1. 什么时候看这篇

当你要改这些内容时：

- Haystack 知识导入
- 知识切块
- 检索过滤
- top-k / 排序
- 知识管理后台
- 知识同步状态
- `HAYSTACK_BASE_URL` 相关问题

## 2. 先读哪些文件

按顺序读：

1. [Knowledge RAG 架构](../architecture/knowledge-rag-architecture.md)
2. `src/admin/routes/knowledge.js`
3. `src/models/knowledge.js`
4. `src/services/rag/provider.js`
5. `src/services/rag/haystack-client.js`
6. `src/services/telegram.js`
7. `src/services/ai.js`

如果任务里涉及“机器人记不住过去说过什么”，先去读：

- [显化导师长期记忆架构](../architecture/manifest-coach-memory-architecture.md)
- [长期记忆升级路线](07-长期记忆升级路线.md)

不要先来改 Knowledge RAG。

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

必须同时记住四件事：

1. Haystack 只处理外部知识
2. 用户长期记忆不进入 Haystack
3. 运行时检索必须同时查：
   - `scope = global`
   - `scope = user AND user_id = current_user`
4. `knowledge_chunks` 是桥接层，不是最终主检索库

## 7. 当前配置口径

### `HAYSTACK_BASE_URL`

- 配在 `.env`
- 通过 `src/config.js` 进入应用
- 是当前 Knowledge RAG 主链路的关键配置

未配置时：

- Knowledge RAG 返回空结果
- 机器人主回复仍继续运行

### `EMBEDDING_API_KEY`

- 也配在 `.env`
- 但当前最小闭环不依赖它
- 只有在旧 embedding/pgvector 路线或独立 embedding 扩展里才需要

所以当前不要把“没配 `EMBEDDING_API_KEY`”误判成主链路故障。

## 8. metadata 最小要求

每条知识至少带：

- `scope`
- `user_id`
- `source`
- `document_id`
- `chunk_id`
- `import_batch`
- `rag_sync`

## 9. 为什么它不是用户记忆方案

Knowledge RAG 不能替代这些能力：

1. 记住用户是谁
2. 记住用户长期目标
3. 记住用户偏好
4. 记住用户过去经历过的关键事件

这些能力分别属于：

- `profiles`
- `memory_events`

不是 Haystack。

## 10. v2 相关点

- 后台 Dashboard 会显示 Knowledge RAG 状态
- `/admin/sync-jobs` 可辅助排查知识同步任务
- `knowledge_chunks` 仍保留为回填和审计来源
- 当前主链路里，知识层应排在用户记忆层之后

## 11. 最小验证方式

1. 通过后台新增一条全局知识
2. 通过后台新增一条用户知识
3. 检查 `rag_sync` 状态
4. 让对应用户发起相关问题
5. 确认返回结果同时支持全局和用户私有知识
6. 断开 Haystack 时，确认主链路退化为空知识结果但不宕机
7. 如有历史数据，执行 `npm run knowledge:sync`

## 12. 改这条链路时最容易犯的错

1. 只改后台，不改 provider
2. 只改 provider，不改 prompt 注入
3. 忘了带 `scope`
4. 只按 `user_id` 过滤，导致全局知识失效
5. 把用户长期记忆错误塞进 Haystack
6. 把“历史召回做不好”误判成 Knowledge RAG 问题
7. 只看保存成功，不看同步是否成功
