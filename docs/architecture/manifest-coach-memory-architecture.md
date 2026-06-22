# 显化导师长期记忆架构

**更新日期**：2026-04-16
**状态**：目标架构定义文档；截至 `2026-04-16`，`messages` / `profiles` 已存在，`memory_events` 的存储、写入、检索、rerank、prompt 注入和治理第一版已实现；replay eval、利用质量评估与更成熟治理仍待继续实现

## 1. 这份文档解决什么问题

Affirm 的产品目标，不是“让机器人记住最近几轮对话”，而是让它形成一种长期陪伴感：

1. 记住用户是谁
2. 记住用户在做什么
3. 记住用户常见的阻碍和偏好
4. 在合适的时候想起用户过去发生过的关键经历
5. 把用户记忆和外部知识明确分开

当前仓库已经有了一个可运行的 `v2-min`，但这还不等于“长期记忆效果已经实现”。
这份文档定义的是下一阶段的目标架构。

## 2. 可参考 OpenClaw，但不要照搬 markdown 形态

你希望参考的 OpenClaw 思路，本质上是对的：

1. 保留原始细节
2. 维护精选稳定事实
3. 为历史内容提供混合检索

但在 Affirm 里，更适合落成数据库和服务分层，而不是 markdown 文件分层。

对应关系如下：

| OpenClaw 思想 | Affirm 中的推荐落点 |
|---------------|---------------------|
| `memory/YYYY-MM-DD.md` 追加日志 | `messages` 原始对话日志，必要时后续加日级摘要 |
| `MEMORY.md` 精选事实 | `profiles` 稳定长期记忆 |
| `memory_search` 混合检索 | `memory_events` 历史事件记忆检索层 |

也就是说：

- 思想可以参考 OpenClaw
- 数据形态应遵循本项目现有的 Node.js + PostgreSQL 架构

## 3. 为什么当前架构还不够

当前系统已经做到：

- 读取最近消息
- 读取 `profiles`
- 可选读取 Haystack 外部知识
- 回复后异步更新 `profiles`
- 已具备回复后写入 `memory_events` 候选的基础能力

但它仍然缺少“长期历史召回”的关键一层。

### 3.1 当前问题 1：`profiles` 太像摘要，不像记忆库

`profiles` 很适合保存：

- 用户长期目标
- 稳定事实
- 沟通偏好
- 长期待跟进事项

但它不适合保存：

- 大量具体经历
- 具体承诺与兑现
- 反复出现的卡点事件
- 某次突破的上下文

### 3.2 当前问题 2：`messages` 只有时序上下文，没有长期召回

最近 N 条消息只解决“短期连续性”，解决不了：

- 用户三周前提过的关键承诺
- 某个重复出现的限制性信念
- 上次类似主题下的有效支持方式

### 3.3 当前问题 3：用户记忆和外部知识已经分开，但历史记忆的质量闭环还没建完

这是当前系统的优点，也是当前新的演进方向：

1. 优点：没有把用户记忆和知识库混在一起
2. 已补：用户历史事件记忆已经有独立存储层 `memory_events`
3. 已补：`memory_events` 已有检索层，也已经进入 prompt
4. 上限：召回效果评估、排序优化和成熟治理仍在继续推进

## 4. 目标中的四层记忆模型

Affirm 更合理的记忆架构应是四层。

### 4.1 `messages`：原始日志层

职责：

- 保存完整对话原文
- 提供最近时序上下文
- 作为审计、回放、离线摘要来源

特点：

- 细节最完整
- 噪声也最多
- 不直接承担长期记忆主检索职责

### 4.2 `profiles`：稳定长期记忆层

职责：

- 保存“这个用户是谁”的长期稳定信息
- 给模型提供高置信度、低噪声的长期画像

推荐内容：

- 用户摘要
- 长期目标
- 稳定事实
- 沟通偏好
- 长期待跟进事项

它的角色，类似精选后的长期事实文档。

### 4.3 `memory_events`：历史事件记忆层

职责：

- 保存可检索的历史经历
- 让系统能从大量历史内容中召回“相关片段”
- 支撑“你上次提过”“你之前在类似情境下会怎样”的体验

典型事件类型：

- `goal_progress`
- `breakthrough`
- `setback`
- `commitment`
- `fear_pattern`
- `belief_shift`
- `preference_signal`
- `relationship_context`

`memory_events` 的关键不在“存很多”，而在“能被正确召回”。

### 4.4 `Haystack`：外部知识层

职责：

- 保存和检索外部知识
- 提供知识背景

不负责：

- 用户画像
- 用户历史事件
- 用户偏好记忆

## 5. 推荐的数据模型

### 5.1 `profiles` 当前继续保留

当前结构已经有：

- `summary`
- `facts`
- `communication_preferences`
- `open_loops`

未来可以逐步细化，但不建议在第一步就大改。

### 5.2 `memory_events` 推荐字段

第一版推荐至少包含：

- `id`
- `user_id`
- `event_type`
- `title`
- `summary`
- `detail`
- `keywords`
- `source_message_ids`
- `importance`
- `confidence`
- `happened_at`
- `last_recalled_at`
- `recall_count`
- `embedding`
- `metadata`
- `created_at`
- `updated_at`

### 5.3 为什么要同时保留 `summary` 和 `detail`

- `summary` 用于 prompt 中短文本注入
- `detail` 用于后台查看和后续重写

## 6. 写入策略

回复后不只更新 `profiles`，还应该从本轮对话中抽取 `memory_events` 候选。

### 6.1 目标写路径

```text
assistant reply sent
  -> MemoryService
     -> generate profile patch
     -> extract episodic memory candidates
     -> update profiles
     -> insert / merge memory_events
     -> write sync_jobs / trace metadata
```

### 6.2 写入原则

只保留“对未来有帮助的长期信号”，不要无脑入库。

应该优先写入的事件：

- 用户明确表达的重要目标变化
- 用户重复出现的阻碍模式
- 用户主动承诺的行动
- 用户取得的关键进展
- 用户明确表露的支持偏好

不应优先写入的内容：

- 一次性的短期情绪波动
- 普通寒暄
- 纯粹来自外部知识的内容
- 助手自己的推断性脑补

## 7. 检索策略

### 7.1 为什么要混合检索

如果只做向量检索，会出现：

- 语义相近但业务不重要
- 命中了相似情绪，却没命中关键事件

如果只做关键词检索，会出现：

- 表达稍微换一种说法就查不到
- 用户的长期模式难以被召回

因此第一版推荐：

- `70%` 向量相似度
- `30%` 关键词权重

### 7.2 第二阶段可加入的因素

- `importance`
- `recency`
- `recall_count`
- `event_type` 权重
- `confidence`

一个可行的排序思路：

```text
final_score
  = 0.70 * vector_score
  + 0.30 * keyword_score
  + importance_bonus
  + recency_bonus
```

第一版不必过度复杂，先把 `70/30` 跑通。

## 8. Prompt 组装顺序

目标中的 prompt 顺序建议为：

`system -> profile memory -> recalled memory events -> recent messages -> knowledge -> current user message`

原因：

1. 先给模型稳定人设和长期事实
2. 再给模型与当前问题相关的历史经历
3. 再给最近几轮时序上下文
4. 最后补外部知识

这样可以避免：

- 外部知识压过用户自身上下文
- 最近消息噪声压过稳定长期记忆

## 9. 后台与运维要求

长期记忆不只是算法问题，还要能治理。

推荐后台能力：

1. 查看 `profiles`
2. 查看 `memory_events`
3. 手动删除错误事件
4. 手动提升/降低 `importance`
5. 查看 `sync_jobs`
6. 查看某次回复命中了哪些 `memory_events`

## 10. 与当前实现的关系

这套目标架构里，当前已经有：

- `messages`
- `profiles`
- `MemoryService`
- `sync_jobs`
- `Haystack`
- `memory_events` 数据表与模型
- `memory_event_candidates` 基础写入链路
- 历史事件 hybrid retrieval
- 历史事件 rule-based rerank
- 历史事件 prompt 注入
- 历史事件后台治理基础版
- retrieval eval baseline

还没有的核心能力：

- 真实 transcript replay eval
- assistant 对 recalled memory 的利用质量评估
- 更细的排序与权重优化
- 更成熟的 compaction / 自动治理策略

所以当前可以把“历史事件第一版效果闭环”描述成已完成，但不能把“长期记忆效果优化”描述成已完成。

## 11. 这一架构的优点

### 11.1 相比只用 `profiles`

- 能召回具体历史经历
- 不会把所有信息都压进一个摘要 JSON

### 11.2 相比只用 `messages`

- 检索更可控
- 噪声更低
- 更适合长期陪伴型产品

### 11.3 相比把一切塞进 Haystack

- 数据职责更清晰
- 权限更清晰
- 记忆治理更清晰

## 12. 当前推荐的实施顺序

不要一步做成“最复杂的记忆系统”。
更稳的做法是：

1. 先保留当前 `v2-min` 可运行闭环
2. 已完成 `memory_events` 表和模型
3. 已完成回复后产出 `profile patch + memory events` 的基础写入
4. 下一步在主链路里加入 `memory_events` 检索
5. 再补后台和评估

具体实施步骤见：

[长期记忆升级路线](../development/07-长期记忆升级路线.md)
