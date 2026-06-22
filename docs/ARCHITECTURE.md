# Architecture

## 产品定义

Affirm 是一个运行在 Telegram 上的长期陪伴型 AI 显化导师。它卖的不是“一次回答”，而是跨会话的持续理解、关键经历召回和目标推进。

这个项目真正想解决的问题有五个：

1. 让系统持续记住用户是谁、在追什么、常见阻碍是什么
2. 让系统在合适的时候召回过去相关经历，而不是每次重新认识用户
3. 把稳定长期记忆、历史事件和外部知识明确拆层
4. 让长期记忆更新不拖慢主回复
5. 让记忆系统可观测、可治理、可验证

## 当前仓库值得保留的内核

如果准备重建，最该保留的不是当前应用层实现，而是下面这些边界和方法：

1. `messages / profiles / memory_events / knowledge` 的分层思路
2. 回复后异步写回长期记忆，而不是把整理链路塞进主回复同步路径
3. 用户记忆与外部知识分离，避免语义、权限和治理混淆
4. `memory_events` 作为“历史事件记忆层”，而不是只靠最近聊天记录伪装记忆
5. 用 `recall / write / injection / utilization / replay / degradation` 去评估长期记忆是否真的有用

## 当前运行架构

### 技术底座

- 运行入口：`src/index.js`
- 主链路：`src/services/telegram.js`
- 模型接入：`src/services/ai.js`
- 长期记忆整理：`src/services/memory-service.js`
- 历史召回：`src/services/memory-retrieval-service.js`
- 管理后台：`src/admin/server.js`
- 基础设施：Node.js + PostgreSQL + Redis/BullMQ + Haystack

### 当前数据边界

| 层 | 当前载体 | 当前职责 | 明确不负责什么 |
|---|---|---|---|
| 原始日志与短期上下文 | `messages` | 保存原始消息、提供最近上下文、支持审计和回放 | 长期记忆主检索 |
| 稳定长期记忆 | `profiles` | 保存稳定事实、长期目标、偏好、open loops | 大量具体历史事件 |
| 历史事件记忆 | `memory_events` | 保存承诺、阻碍、突破、关系上下文等可召回事件 | 外部知识 |
| 外部知识层 | `knowledge_chunks + Haystack` | 外部知识导入、同步、检索 | 用户长期记忆 |
| 治理与观测层 | `sync_jobs / trace / admin / evals` | 追踪写回、治理错误记忆、暴露运行状态 | 直接承担回复生成 |

### 当前主链路

当前回复时的上下文顺序是：

`system -> profile memory -> recalled memory events -> recent messages -> knowledge -> user message`

可以把读写链路理解成：

1. 用户消息进入 Telegram 主服务
2. 通过队列按用户串行处理
3. 写入 user message，并生成 `trace_id`
4. 读取 `profiles`
5. 检索 `memory_events`
6. 读取最近 `messages`
7. 检索 Haystack 外部知识
8. 组装 prompt，生成回复
9. 写入 assistant message，并记录 `memory_refs`
10. 回复发出后异步触发 `MemoryService`
11. 更新 `profiles`，写入 `memory_events` 候选，并记录 `sync_jobs`

## 当前仓库与目标 `v3` 的差距

当前系统已经能跑，但还不等于长期陪伴体验已经成熟。差距主要在四个地方：

1. 应用层实现偏重，接入层、编排层、记忆层和治理层耦合较深
2. `coaching_state` 还不够明确，系统更像“有记忆的对话机器人”，还不够像“持续推进用户目标的辅导系统”
3. `replay / utilization` 虽然已有 baseline，但真实 transcript 样本和 `live_ai` 回归还不够
4. `memory_events` 的 compaction、merge、衰减和自动治理还不成熟

## 重建建议

### 应继续继承

1. `messages` 作为原始日志层
2. `profiles` 作为稳定长期记忆层
3. `memory_events` 作为历史事件召回层
4. 外部知识与用户记忆分离
5. 异步写回、trace、治理动作和 eval 基线

### 不应原样继承

1. 初期就把多 provider、复杂配置和所有侧车服务一起搬进 MVP
2. 当前偏重的应用层编排方式
3. 把“当前实现细节”误当成“产品定义”
4. 缺少明确状态层时，把所有推进逻辑都挤进自然语言摘要

### 更合理的 `v3` 最小范围

1. Telegram 对话
2. `messages`
3. `profiles`
4. `memory_events`
5. 明确的 `coaching_state`
6. 最小记忆召回
7. 最小记忆写回

## 继续深挖时读这些

1. [分层上下文管理架构](./architecture/layered-context-management-architecture.md)
2. [显化导师长期记忆架构](./architecture/manifest-coach-memory-architecture.md)
3. [Knowledge RAG 架构](./architecture/knowledge-rag-architecture.md)
4. [Telegram 对话链路](./development/02-Telegram-对话链路.md)
5. [长期记忆升级路线](./development/07-长期记忆升级路线.md)
6. [memory_events 评估排序与治理](./development/09-memory-events-评估排序与治理.md)
