# Knowledge RAG 架构

**更新日期**：2026-04-15
**状态**：Haystack 外部知识链路已接入；用户长期记忆召回不在本架构内

这份文档只描述“外部知识层”，不描述用户长期记忆。
当前长期记忆在 `profiles`，未来的历史事件记忆在 `memory_events`，两者都不应被塞进 Haystack。

## 1. 先说清边界

Knowledge RAG 只解决三件事：

1. 外部知识导入
2. 外部知识检索
3. 将结果以稳定格式返回给主应用

它不负责：

- 用户长期记忆
- 用户历史经历召回
- 原始消息日志
- 最终回答生成

一句话总结：

`Knowledge RAG = 外部知识层，不是用户记忆层`

## 2. 当前组件划分

### Node 主应用

职责：

- 接收后台知识管理请求
- 做最小规范化
- 调用统一 `ragProvider`
- 将检索结果传给 `AIService`
- 通过 `HAYSTACK_BASE_URL` 调用独立 sidecar，而不是在主进程里直接承载 Haystack pipeline

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

## 3. 当前配置口径

当前主链路关于 Knowledge RAG 的配置应按下面理解：

### `HAYSTACK_BASE_URL`

- 配在 `.env`
- 通过 `src/config.js` 读取
- 用来告诉 Node 主应用如何访问 Haystack

如果未配置：

- Knowledge RAG 降级为空结果
- 机器人主回复仍可运行

### `EMBEDDING_API_KEY`

- 也配在 `.env`
- 但当前主链路不依赖它才能跑通
- 只有你恢复旧的本地 embedding/pgvector 路线，或者在独立检索侧继续扩展 embedding provider 时，才需要它

当前推荐口径：

- `HAYSTACK_BASE_URL` 是 Knowledge RAG 主链路配置
- `EMBEDDING_API_KEY` 不是当前 v2 最小闭环必须项

### `SERPERDEV_API_KEY`

当前项目默认不需要这个变量。

原因：

1. 它只在 Haystack 的 `SerperDevWebSearch` 这类联网搜索组件中需要
2. 当前项目的 `Haystack` 只负责“外部知识库检索”
3. 当前项目不依赖 Serper 做网页搜索，也不把联网搜索作为主链路

因此：

- 不要把 Haystack 官方 quick start 中的 `SERPERDEV_API_KEY` 当成当前项目的必配项
- 只有未来你显式引入 `SerperDevWebSearch` 或其他联网搜索工具时，才需要额外配置

## 4. 知识文档模型

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
  "import_batch": "admin-import-20260414"
}
```

## 5. 当前导入流

```text
Admin form / import
  -> normalize payload
  -> Knowledge.create() / createBatch()
  -> write knowledge_chunks
  -> ragProvider.upsertKnowledge()
  -> Haystack indexing pipeline
  -> update metadata.rag_sync
```

说明：

- `knowledge_chunks` 负责桥接和状态记录
- Haystack 才是实际外部知识检索侧

## 6. 当前查询流

```text
Telegram userMessage
  -> Knowledge.semanticSearch(query, userId)
  -> ragProvider.searchKnowledge(query, userId)
  -> filter(global + user-scoped)
  -> return top-k chunks
  -> AIService.prepareMessages()
```

## 7. 过滤规则

查询时必须同时覆盖两类知识：

1. 全局知识：`scope == global`
2. 用户知识：`scope == user AND user_id == current_user`

这是硬约束。不能只查用户知识，也不能混查所有用户的私有知识。

## 8. 为什么用户记忆不能放进 Haystack

这是当前文档最容易被写错的地方。

不应该把这些内容导进 Haystack：

- 用户是谁
- 用户长期目标
- 用户偏好
- 用户反复卡点
- 用户上次承诺了什么
- 用户最近突破了什么

原因：

1. 这些内容属于“用户记忆”，不是“外部知识”
2. 这类数据需要可纠错、可覆盖、可人工干预
3. 权限和隔离要求不同
4. 生命周期不同
5. 提示词中的优先级也不同

更准确的分工是：

- `profiles` 保存稳定长期记忆
- `memory_events` 保存可召回的历史经历
- `Haystack` 只保存外部知识

## 9. 推荐的 Haystack 管道

### 写入管道

- 可选 `DocumentCleaner`
- 谨慎使用 `DocumentSplitter`
- `SentenceTransformersDocumentEmbedder`
- `DocumentWriter`

### 查询管道

- `SentenceTransformersTextEmbedder`
- `EmbeddingRetriever`
- 可选 `AutoMergingRetriever`
- 可选 `SimilarityRanker`

当前优先级仍然是把“外部知识基础检索”跑通，而不是先把用户记忆也混进来做复杂 hybrid。

补充约束：

- 当前仓库已经在 Node 导入层完成一次切块
- 因此 sidecar 第一版不要默认再次把单条 `knowledge_chunks` 裂变成多个文档主键
- 否则会破坏本地桥接表、同步状态和审计来源的一致性

## 10. 与长期记忆的关系

当前和未来都应遵守：

1. 用户目标、偏好、待跟进事项不写进 Haystack
2. `profiles` 不用来存知识库 chunk
3. `memory_events` 也不等于知识库 chunk
4. prompt 注入顺序里，用户记忆应先于外部知识

推荐顺序：

`system -> profile memory -> recalled memory events -> recent messages -> knowledge -> user`

## 11. Node 与 Haystack 的接口边界

主应用和 Haystack 之间只暴露三类接口：

- `upsertKnowledge(docs)`
- `deleteKnowledge(ids)`
- `searchKnowledge(query, userId)`

这样业务代码不会直接耦合 Haystack 内部 pipeline 细节。

从部署形态上，更准确地说，当前项目期望的是一个独立 sidecar 提供至少以下 HTTP 接口：

- `GET /health`
- `POST /knowledge/upsert`
- `POST /knowledge/delete`
- `POST /knowledge/search`

Node 侧通过 `HAYSTACK_BASE_URL` 和路径配置访问这些接口。

第一版 sidecar 建议只做四件事：

1. 写入文档
2. 删除文档
3. 按 metadata 过滤检索
4. 返回统一结果格式

不要在第一版里同时追求：

- Agent 工具调用
- 联网搜索
- 用户记忆检索
- 复杂 rerank 编排

## 12. 未来与 `memory_events` 的关系

如果后续你为 `memory_events` 做向量检索，也不应该把它直接当成 Knowledge RAG 的一个 scope 去混用。

更推荐：

1. `memory_events` 作为独立记忆检索层
2. `Haystack` 继续作为外部知识层
3. 在 Node 主应用里统一做 prompt 拼装和优先级控制

这样才能保证“记住用户是谁”和“引用外部知识”是两件不同的事。

## 13. 最小验证

1. 后台新增一条全局知识
2. 后台新增一条用户知识
3. 检查 `rag_sync` 状态正确
4. 发起相关问题，确认命中结果正确
5. 断开 Haystack 或移除 `HAYSTACK_BASE_URL`
6. 确认主应用退化为空知识结果但仍能回复

## 14. 推荐实现优先级

因为本项目的 `Haystack` 只是外部知识增强层，不是主回复必需项，所以推荐优先级如下：

1. 先保证 `Telegram + AI + profiles + recent messages` 主链路稳定
2. 再补 `memory_events` 历史事件记忆层
3. 最后再实现独立 Haystack sidecar

这意味着：

- 当前阶段允许 `HAYSTACK_BASE_URL` 留空
- 当前阶段允许 Knowledge RAG 退化为空结果
- 只要主链路可运行，就不应把 Haystack 当成当前阻塞项
