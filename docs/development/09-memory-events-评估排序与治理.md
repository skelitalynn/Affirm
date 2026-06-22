# 09 memory_events 评估、排序与治理现状与下一步

**更新日期**：2026-04-16  
**目标**：同步 `memory_events` Phase 6/7/8 第一版的实际落地状态，并明确下一轮优化重点

## 1. 当前基线

截至当前，`memory_events` 已经完成第一版效果闭环：

1. 存储层已落地
2. 回复后可写入候选事件
3. 回复前可执行 hybrid retrieval
4. 已有 `v1-rule-based` rerank
5. recalled memory 已注入 prompt
6. Admin 已支持查看、编辑、删除、命中详情和治理动作
7. 已有固定样本的 retrieval eval baseline

当前真正还没完成的是三件事：

1. recalled memory 是否真的被 assistant 回复利用
2. 真实 transcript replay 如何系统性评估
3. 更成熟的 ranking v2 / compaction / 自动治理如何继续推进

这份文档只解决这三件事。

## 2. 设计原则

### 2.1 先建评估基线，再调排序

没有评估基线时，排序优化很容易变成“主观感觉更像对了”。

### 2.2 先做 rule-based，可验证，再谈复杂 rerank

第一版不要直接上重型 LLM rerank，因为：

1. 它会增加主链路时延
2. 更难定位问题
3. 没有评估集时很难判断收益

### 2.3 治理优先逻辑下线，不优先物理删除

错误记忆应优先支持：

1. `suppress`
2. `restore`
3. `merge`
4. `review`

而不是一发现不对就硬删。

### 2.4 所有优化都不能破坏三条底线

1. 不跨用户召回
2. 没命中时可降级为空结果
3. 不让评估和治理逻辑阻塞主回复

## 3. Phase 6：召回效果评估（第一版已落地）

## 3.1 目标

把“当前召回看起来还行”变成“当前召回在固定样本上表现如何”。

## 3.2 当前第一版评估样本来源

当前已落地的是手工构造 baseline fixture；下一阶段建议继续补真实对话回放样本。

### A. 手工构造样本

适合快速启动，结构稳定。

每条样本建议包含：

```json
{
  "name": "morning-review-commitment",
  "user_id": "uuid",
  "query_text": "我最近晨间复盘又断了",
  "expected_event_ids": ["uuid-1"],
  "disallowed_event_ids": ["uuid-2"],
  "notes": "应该命中晨间复盘承诺，不应该命中无关关系事件"
}
```

### B. 真实对话回放样本

从真实 Telegram 历史中选取：

1. query
2. 当前用户已有的 `memory_events`
3. 你期望应该命中的事件
4. 明确不该命中的事件

这种样本更接近线上真实分布。

## 3.3 推荐落地位置

第一版建议：

1. 样本文件：`tests/fixtures/memory-recall-eval/*.json`
2. 执行工具：`tools/evaluate-memory-recall.js`
3. 输出结果：控制台表格 + JSON 摘要

## 3.4 当前第一版评估指标

当前已固定的核心指标是：

1. `expected_hit_rate@k`
2. `top1_hit_rate`
3. `precision@k`
4. `user_isolation_pass_rate`
5. `ranking_changed_case_rate`

当前暂未自动化的指标是：

1. `prompt_injection_rate`
2. `memory_utilization_rate`

## 3.5 第一版执行流程

建议流程：

1. 读取评估样本
2. 调用 `MemoryRetrievalService.searchRelevantEvents()`
3. 输出每条样本的 topK 结果
4. 计算汇总指标
5. 保存结果快照，供后续优化前后对比

## 3.6 当前已落地和仍建议补的 trace 字段

当前 assistant metadata 已记录：

1. `generation.memory_ranking_version`
2. `generation.memory_retrieval_strategy`

下一阶段仍建议补：

1. `generation.memory_candidate_count`
2. `generation.memory_topk`

## 3.7 当前完成状态

1. 已有固定样本集
2. 已有可重复运行的评估命令
3. 已能输出汇总指标
4. 已能对比优化前后的结果差异

当前仍未完成：

1. 真实 transcript replay eval
2. `prompt_injection_rate` / `memory_utilization_rate` 自动统计

## 4. Phase 7：排序与权重优化（v1 已落地）

## 4.1 当前基线

当前运行中的排序已经是：

- `70%` 向量相似度
- `30%` 关键词权重
- `importance / recency / confidence / event_type` 的 v1 rule-based rerank

这个版本的优点是简单、稳定、容易验证；缺点是：

1. 业务重要性还没被纳入
2. 最近发生的事件没有优势
3. 高置信度事件和低置信度事件权重相近
4. 重复被召回的老事件可能反复顶到前面

## 4.2 当前第一版优化思路

当前实现没有把所有逻辑压进 SQL。

建议采用“两段式排序”：

### 第一段：SQL 层取候选

继续保留当前 `searchHybrid()`，取 `topN = 20` 左右候选。

### 第二段：Node 层 rule-based rerank

当前在 `MemoryRetrievalService` 里用 `rerankEvents()`，只对 `topN` 做二次排序。

这样做的好处是：

1. 便于快速试公式
2. 便于打印调试信息
3. 不需要频繁改复杂 SQL

## 4.3 当前已加入的排序特征

当前第一版已加入这 5 类：

1. `hybrid_score`
2. `importance`
3. `recency`
4. `confidence`
5. `event_type` 轻量权重

## 4.4 一个可落地的第一版公式

可以先试这个保守版本：

```text
rerank_score =
  0.55 * hybrid_score
  + 0.15 * importance
  + 0.10 * recency_score
  + 0.10 * confidence
  + 0.10 * event_type_boost
```

其中：

### `hybrid_score`

直接使用当前 SQL 返回的 `final_score`。

### `recency_score`

建议先做衰减，而不是线性时间差：

```text
recency_score = exp(-age_days / 45)
```

如果没有 `happened_at`，可退回 `created_at`。

### `event_type_boost`

第一版只建议做轻量提升，例如：

1. `commitment`：更高
2. `setback` / `fear_pattern`：中等
3. `preference_signal`：对某些 query 可更高

不要一开始写太多 if/else 分支。

## 4.5 需要特别防止的问题

### 重复召回同一条老事件

第一版建议不使用 `recall_count` 直接正向加分。  
更合理的是：

1. 只保留展示用
2. 或在高频重复时加轻微惩罚

### 同类事件占满 topK

建议在 rerank 后做一次简单去重或多样性控制，例如：

1. 同 `event_type + 关键词高度重合` 的事件只保留一条最强项
2. 同 `source_message_ids` 高度重叠的事件优先保留 canonical item

## 4.6 第一版推荐改动文件

1. `src/services/memory-retrieval-service.js`
2. `src/models/memory-event.js`
3. `src/services/conversation-trace.js`
4. `tools/evaluate-memory-recall.js`
5. `tests/unit/services/memory-retrieval-service.test.js`

## 4.7 当前完成状态

1. 排序公式已有明确版本号
2. 评估样本上已可对比优化前后结果
3. 排序优化不影响降级和用户隔离
4. trace 中已能看到本轮排序版本

当前仍未完成：

1. 基于更多真实失败案例的 ranking v2 优化
2. 更成熟的 compaction / stale-event 处理

## 5. Phase 8：更成熟的记忆治理策略（第一版已落地）

## 5.1 为什么 CRUD 不够

当前后台已经能：

1. 看
2. 改
3. 删
4. 看命中详情
5. `suppress / restore`
6. `mark verified / mark rejected`
7. `merge into canonical event`

但还不够，因为真实线上治理更常见的是：

1. 先逻辑下线错误记忆
2. 合并重复事件
3. 标记某条记忆已确认可靠
4. 区分“暂时不用”和“彻底删除”

## 5.2 第一版推荐的治理状态

建议先引入两个维度：

### `status`

用于决定检索层是否可见：

1. `active`
2. `suppressed`
3. `merged`
4. `archived`

### `review_status`

用于表达人工治理进度：

1. `pending`
2. `verified`
3. `edited`
4. `rejected`

## 5.3 第一版建议新增字段

建议优先加这几个：

1. `status`
2. `review_status`
3. `merged_into_event_id`
4. `last_reviewed_at`

治理细节可先放进：

`metadata.governance`

例如：

```json
{
  "governance": {
    "last_action": "suppress",
    "last_reason": "duplicate_event",
    "last_actor": "admin",
    "last_action_at": "2026-04-15T12:00:00.000Z"
  }
}
```

第一版不要急着上独立审计表。

## 5.4 检索层的治理规则

治理状态必须真正影响召回：

1. `active`：可召回
2. `suppressed`：默认不召回
3. `merged`：默认不召回，必要时跳到 canonical event
4. `archived`：默认低优先级或不召回

如果状态不影响检索，那治理就只是“后台装饰”。

## 5.5 第一版后台动作建议

建议优先支持：

1. `suppress`
2. `restore`
3. `mark verified`
4. `mark rejected`
5. `merge into canonical event`

物理删除继续保留，但不再作为主要治理手段。

## 5.6 第一版合并策略

重复事件处理建议：

1. 保留一条 canonical event
2. 其他重复项标为 `merged`
3. `merged_into_event_id` 指向 canonical event
4. canonical event 的 `metadata` 记录来源合并信息

第一版不需要自动合并，先人工合并即可。

## 5.7 第一版推荐改动文件

1. `migrations/*memory_events*_governance*.sql`
2. `src/models/memory-event.js`
3. `src/services/memory-retrieval-service.js`
4. `src/admin/routes/memory-events.js`
5. `src/admin/views/memory-events/*`
6. `tests/integration/admin-routes.test.js`
7. `tests/unit/models/memory-event.test.js`

## 5.8 当前完成状态

1. 后台可以逻辑下线错误记忆
2. 被下线的记忆不会继续参与召回
3. 重复事件可以人工合并
4. 治理动作已留下最小痕迹

当前仍未完成：

1. 自动 compaction / 自动合并
2. 更成熟的批量治理工作流

## 6. 推荐实现顺序

最稳的顺序建议是：

1. 先做真实 transcript replay eval
2. 再做 recalled memory utilization eval
3. 然后继续做 ranking v2
4. 最后补 compaction / 自动治理

原因很简单：

1. 没评估就调排序，等于盲调
2. 没排序基线就做复杂治理，很难判断收益
3. 先有基础治理，再加复杂状态机更稳

## 7. 一次实现时建议遵守的边界

这轮实现建议严格遵守：

1. 不恢复旧 `messages` 语义检索
2. 不把用户历史记忆塞进 Haystack
3. 不先上复杂 LLM rerank
4. 不先做自动合并和自动压缩
5. 不让评估工具进入主链路阻塞回复

## 8. 一句话结论

接下来最应该做的，不是继续“感觉上优化记忆”，而是：

`先补 replay eval / utilization eval -> 再做 ranking v2 -> 最后补 compaction 和自动治理`
