# Knowledge RAG 架构

**更新日期**：2026-04-10  
**状态**：Haystack 版知识链路已接入

本文档只描述“外部知识层”，不讨论用户长期记忆。长期记忆统一放在 `profiles`。

## 1. 目标边界

Knowledge RAG 只解决三件事：

1. 知识内容导入
2. 知识内容检索
3. 将结果以稳定格式返回给主应用

它不负责：

- 用户长期记忆
- 原始消息日志
- 最终回答生成

## 2. 目标组件

### Node 主应用

职责：

- 接收后台知识管理请求
- 做最小规范化
- 调用统一 `ragProvider`
- 将检索结果传给 `AIService`

### Haystack 侧车

职责：

- 文档清洗
- 切块
- 向量化
- 元数据过滤
- 检索
- 可选重排

### 本地桥接层

- `src/models/knowledge.js`
- `knowledge_chunks`

当前作用：

- 本地落库
- 同步状态追踪
- 回填来源
- 审计来源

## 3. 知识文档模型

每条知识最少包含：

- `content`
- `source`
- `scope`
- `user_id`
- `document_id`
- `chunk_id`
- `import_batch`

推荐元数据示例：

```json
{
  "scope": "global",
  "source": "admin-import",
  "document_id": "doc-001",
  "chunk_id": "doc-001#03",
  "import_batch": "admin-import-20260410"
}
```

## 4. 导入流

```text
Admin form / import
  -> normalize payload
  -> Knowledge.create() / createBatch()
  -> write knowledge_chunks
  -> ragProvider.upsertKnowledge()
  -> Haystack indexing pipeline
  -> update metadata.rag_sync
```

## 5. 查询流

```text
Telegram userMessage
  -> Knowledge.semanticSearch(query, userId)
  -> ragProvider.searchKnowledge(query, userId)
  -> filter(global + user-scoped)
  -> return top-k chunks
  -> AIService.prepareMessages()
```

## 6. 过滤规则

查询时必须同时覆盖两类知识：

1. 全局知识：`scope == global`
2. 用户知识：`scope == user AND user_id == current_user`

这是硬约束。不能只查用户知识，也不能混查所有用户的私有知识。

## 7. 推荐的 Haystack 管道

### 写入管道

- `DocumentCleaner`
- `DocumentSplitter` 或 `HierarchicalDocumentSplitter`
- `SentenceTransformersDocumentEmbedder`
- `DocumentWriter`

### 查询管道

- `SentenceTransformersTextEmbedder`
- `EmbeddingRetriever`
- 可选 `AutoMergingRetriever`
- 可选 `SimilarityRanker`

当前优先级仍是把基础检索跑通，不是先上复杂 hybrid search。

## 8. 与长期记忆的关系

- 用户目标、偏好、待跟进事项不写进 Haystack
- `profiles` 不用来存知识库 chunk
- prompt 注入顺序里，`profile memory` 永远在 `knowledge` 前面

## 9. Node 与 Haystack 的接口边界

主应用和 Haystack 之间只暴露三类接口：

- `upsertKnowledge(docs)`
- `deleteKnowledge(ids)`
- `searchKnowledge(query, userId)`

这样业务代码不会直接耦合 Haystack 内部 pipeline 细节。

## 10. 最小验证

1. 后台新增一条全局知识
2. 后台新增一条用户知识
3. 检查 `rag_sync` 状态正确
4. 发起相关问题，确认命中结果正确
5. Haystack 不可用时，确认主应用能降级运行
