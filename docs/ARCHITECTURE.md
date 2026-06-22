# Architecture

## 产品定义

Affirm 是一个运行在 Telegram 上的长期陪伴型 AI 显化导师。它的价值不是单轮回答，而是跨会话持续理解用户、召回关键经历、跟进目标推进，并让长期记忆可观测、可治理、可验证。

这个项目真正要解决五件事：

1. 记住用户是谁、在追什么、常见阻碍是什么
2. 在合适时召回过去相关经历，而不是每轮重新认识用户
3. 明确拆开稳定长期记忆、历史事件记忆和外部知识
4. 回复后异步整理长期记忆，不拖慢主回复
5. 用 eval、trace 和治理动作验证记忆是否真的有用

## 当前值得保留的内核

如果准备重建 `v3`，最该保留的是边界和方法，不是当前偏重的应用层实现。

应继续继承：

1. `messages / profiles / memory_events / knowledge` 的分层思路
2. 回复后异步写回长期记忆
3. 用户记忆与外部知识分离
4. `memory_events` 作为历史事件召回层
5. `recall / write / injection / utilization / replay / degradation` 的评估意识
6. trace、治理动作、降级路径和最小管理后台

不应原样继承：

1. 初期就搬入多 provider、复杂配置和所有侧车服务
2. 当前偏重的应用层编排方式
3. 把实现细节误当成产品定义
4. 在没有明确 `coaching_state` 时，把目标推进逻辑都塞进自然语言摘要

## 当前运行架构

技术底座：

1. 运行入口：`src/index.js`
2. Telegram 主链路：`src/services/telegram.js`
3. 模型接入：`src/services/ai.js`
4. 长期记忆整理：`src/services/memory-service.js`
5. 历史召回：`src/services/memory-retrieval-service.js`
6. 历史事件写入和治理：`src/services/memory-event-service.js`
7. 管理后台：`src/admin/server.js`
8. 基础设施：Node.js、PostgreSQL + pgvector、Redis/BullMQ

主回复上下文顺序：

```text
system -> profile memory -> recalled memory events -> recent messages -> knowledge -> user message
```

主链路：

1. 用户消息进入 Telegram 主服务
2. 队列按用户串行处理
3. 写入 user message，并生成 `trace_id`
4. 读取 `profiles`
5. 检索 `memory_events`
6. 读取最近 `messages`
7. 检索 PostgreSQL/pgvector 外部知识
8. 组装 prompt，生成回复
9. 写入 assistant message，并记录 `memory_refs`
10. 回复发出后异步触发 `MemoryService`
11. 更新 `profiles`，写入 `memory_events` 候选，并记录 `sync_jobs`

## 数据边界

| 层 | 当前载体 | 当前职责 | 明确不负责什么 |
|---|---|---|---|
| 原始日志与短期上下文 | `messages` | 保存原始消息、提供最近上下文、支持审计和回放 | 长期记忆主检索 |
| 稳定长期记忆 | `profiles` | 保存稳定事实、长期目标、偏好、open loops | 大量具体历史事件 |
| 历史事件记忆 | `memory_events` | 保存承诺、阻碍、突破、关系上下文等可召回事件 | 外部知识 |
| 外部知识层 | `knowledge_chunks + pgvector` | 外部知识导入、同库向量检索、关键词降级 | 用户长期记忆 |
| 治理与观测层 | `sync_jobs / trace / admin / evals` | 追踪写回、治理错误记忆、暴露运行状态 | 直接承担回复生成 |

核心规则：

1. `messages` 是原始日志，不直接承担长期记忆主检索
2. `profiles` 只保存少量稳定事实、长期目标、偏好和 open loops
3. `memory_events` 保存可检索的历史经历，必须有重要性、置信度、来源和治理状态
4. `knowledge_chunks` 只保存外部知识，不保存用户画像、承诺、偏好或历史经历
5. prompt 注入时，用户记忆优先于外部知识

## Knowledge RAG 选型

Knowledge RAG 只解决三件事：

1. 外部知识导入
2. 外部知识检索
3. 将结果以稳定格式返回给主应用

它不负责：

1. 用户长期记忆
2. 用户历史经历召回
3. 原始消息日志
4. 最终回答生成

当前配置口径：

1. 主检索使用 PostgreSQL + pgvector，数据仍保存在 `knowledge_chunks`
2. 远程 embeddings 可选；未配置或不可用时，检索链路降级到 deterministic embedding 或关键词检索
3. 关键词 fallback 在同一个 PostgreSQL 数据库内完成，不引入独立 RAG sidecar
4. 不再把 Haystack 作为当前项目的默认选型

这个选择是基于当前知识规模做出的：约 300 篇、篇幅不大的外部文档，单库检索比独立 pipeline 更容易维护、调试和验证。只有未来出现大量多格式 ingestion、复杂多路 retriever、独立 rerank pipeline 或独立 RAG 服务边界时，才重新评估 Haystack 这类框架。

查询过滤必须同时支持：

1. 全局知识：`scope == global`
2. 用户知识：`scope == user AND user_id == current_user`

## 目标记忆模型

更成熟的 `v3` 应拆成四层记忆、一层状态、一层外部知识：

| 目标层 | 当前可复用模块 | 下一步缺口 |
|---|---|---|
| System Layer | `src/services/ai.js` | 精简 prompt 文本 |
| Recent Conversation | `src/models/message.js` | 长度裁切、条数收敛、预算控制 |
| Rolling Summary | 暂无明确独立层 | 新增摘要存储与刷新逻辑 |
| Core Memory | `src/models/profile.js` + `src/services/memory-service.js` | 收敛字段和常驻预算 |
| Archival Memory | `src/models/memory-event.js` + `src/services/memory-retrieval-service.js` | 更严格的读取条件、排序和注入裁切 |
| Coaching State | 暂无独立层 | 新增结构化状态模型 |
| External Knowledge | `src/models/knowledge.js` + `src/services/rag/*` | 与 archival memory 分开装配，默认使用 pgvector + keyword fallback |

`coaching_state` 是重建时最重要的新增概念。它应保存当前目标、阶段、承诺、主要阻碍、open loops、下一步和最近进展信号，避免每轮都靠自然语言摘要猜当前辅导状态。

## 当前仓库与目标 `v3` 的差距

当前系统已经能跑，但还不等于长期陪伴体验成熟。主要差距：

1. 接入层、编排层、记忆层和治理层耦合较深
2. `coaching_state` 还不明确
3. `replay / utilization` 虽然已有 baseline，但真实 transcript 样本和 `live_ai` 回归还不够
4. `memory_events` 的 compaction、merge、衰减和自动治理还不成熟
5. 文档和实现历史较重，适合作为样本，不适合作为下一代产品直接基座

## 更合理的 `v3` 最小范围

第一版重建建议只保留：

1. Telegram 对话
2. `messages`
3. `profiles`
4. `memory_events`
5. 明确的 `coaching_state`
6. 最小记忆召回
7. 最小记忆写回
8. 最小 trace 和 eval

复杂外部知识 pipeline、多 provider、独立 sidecar、重管理后台和高级治理都可以后置。
