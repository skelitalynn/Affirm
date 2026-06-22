# 10 AI Agent Evals 方法与落地

**更新日期**：2026-04-16  
**状态**：Affirm 已落地第一版长期记忆 eval matrix：`memory recall / write / injection / utilization / conversation replay / degradation` 基线可运行；下一步重点是扩充真实 transcript 样本、加入 live-AI 利用质量评估和发布门禁

## 1. 为什么要单独写这篇

当前仓库已经不是“只有一个 prompt”的小项目，而是一个有多段链路的 AI agent：

1. Telegram 收消息
2. 读取最近上下文
3. 读取 `profiles`
4. 检索 `memory_events`
5. 检索外部 Knowledge RAG
6. 组装 prompt 并生成回复
7. 回复后异步更新长期记忆

所以真正要评估的，不是“模型答得像不像”，而是：

1. 该不该记住的东西有没有被写进去
2. 该想起来的时候能不能召回对的记忆
3. 召回的记忆有没有真的进入 prompt
4. 回复有没有正确利用这些记忆
5. 整条链路在降级、超时、缺配置时是否还能稳定运行

这也是这篇文档的目的：把“AI agent evals”从泛泛概念，落成当前项目能执行、能复盘、能迭代的工程方法。

## 2. 参考思路

这篇文档主要参考 Anthropic 的文章：

- Anthropic, [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

对当前项目最有用的不是某个单一指标，而是下面几条方法论：

1. 评估要围绕真实任务，不要围绕抽象能力标签
2. 先做小而可重复、能解释失败原因的 eval，再扩大规模
3. 对 agent 来说，要评估整条任务链路，而不只是最后一句回复
4. 样本要尽量来自真实 transcript、真实失败案例和真实用户分布
5. 评估的价值不只是“打分”，更重要的是帮助定位问题和指导下一轮改动

把这几条翻译到 Affirm，就是：

1. 不要只问“回复像不像显化导师”
2. 要问“这条用户历史记忆有没有被正确写入、召回、注入、利用”
3. 不要先追求一个很大的统一总分
4. 先把关键链路拆开，分别建立可重复的 eval
5. 每个 eval 都必须能回答“失败是坏在写入、检索、排序、注入、还是生成”

## 3. Affirm 里什么才算 eval

在这个项目里，eval 不等于单测，也不等于人工看几段对话。

更准确地说，eval 是：

```text
给定固定输入样本 + 固定执行路径
  -> 运行真实或近真实链路
  -> 输出可比较结果
  -> 计算明确指标
  -> 沉淀失败案例
  -> 反过来指导实现调整
```

它和其他验证方式的区别：

| 类型 | 解决什么问题 | 不能替代什么 |
|------|--------------|--------------|
| unit test | 单个函数或模块行为是否符合预期 | 不能回答真实 agent 效果 |
| integration test | 多模块连通性是否正常 | 不能回答质量优劣 |
| manual QA | 能快速发现明显异常 | 难以稳定复现和量化 |
| eval | 评估任务表现和失败模式 | 不能替代基础 correctness 测试 |

所以正确关系不是“有 eval 就不用测试”，而是：

```text
单测 / 集成测试
  保证系统没坏

eval
  保证系统往对的方向变好
```

## 4. 当前项目最应该评估的 5 条链路

### 4.1 长期记忆写入质量

问题：

- 本轮对话里应该进入 `profiles` 或 `memory_events` 的信号，有没有被写进去
- 不该写的噪声、脑补、一次性情绪，有没有被误写

对应代码：

- `src/services/memory-service.js`
- `src/services/memory-event-service.js`
- `src/models/profile.js`
- `src/models/memory-event.js`

### 4.2 长期记忆召回质量

问题：

- 用户问到相关历史时，`memory_events` 能不能召回对的事件
- 会不会串到别的用户
- raw hybrid 和 rerank 谁在起作用

对应代码：

- `src/services/memory-retrieval-service.js`
- `src/services/memory-embedding-service.js`
- `src/models/memory-event.js`
- `tools/evaluate-memory-recall.js`

### 4.3 Prompt 注入质量

问题：

- 召回结果有没有真的进入 prompt
- 注入量是否过多、过少、或格式混乱

对应代码：

- `src/services/telegram.js`
- `src/services/ai.js`
- `src/services/conversation-trace.js`

### 4.4 回复利用质量

问题：

- assistant 是否真的利用了已召回的记忆
- 是否出现“明明召回了，但回复里没用”
- 是否出现“用了记忆，但用错了对象或事实”

对应代码：

- `src/services/ai.js`
- `src/services/conversation-trace.js`
- `messages` / `memory_refs` / `trace` 相关记录

### 4.5 运行可靠性与降级质量

问题：

- embedding provider、Haystack、数据库、Redis 不稳定时，系统是否可降级
- 降级后是“空结果继续服务”，还是“整条链路坏掉”

对应代码：

- `src/services/memory-embedding-service.js`
- `src/services/rag/provider.js`
- `src/services/telegram.js`
- `src/utils/message-queue.js`

## 5. 当前已经落地的 eval

当前仓库已经有一组可重复运行的 baseline eval：

- `tools/evaluate-memory-recall.js`
- `tools/evaluate-memory-write.js`
- `tools/evaluate-memory-injection.js`
- `tools/evaluate-memory-utilization.js`
- `tools/evaluate-conversation-replay.js`
- `tools/evaluate-degradation.js`

这组 eval 分别覆盖：

1. `memory_events` 的召回 / rerank / isolation
2. 长期记忆写入、候选过滤、局部失败收口与 `sync_jobs`
3. recalled memory 是否进入 prompt、顺序是否正确、trace 是否完整
4. 回复是否真正使用 recalled memory
5. 固定 transcript 回放下的召回、注入、利用与 trace
6. embedding / retrieval / knowledge RAG 失败时的降级路径

执行方式：

```bash
npm run db:migrate
npm run eval:memory:recall
npm run eval:memory:write
npm run eval:memory:injection
npm run eval:memory:utilization
npm run eval:conversation:replay
npm run eval:degradation
```

当前实现已经说明一件更重要的事：

> Affirm 现在不是“只有 retrieval eval”，而是“已经有第一版 agent eval matrix；但样本规模、真实 transcript 覆盖和发布门禁还需要继续补齐”。

## 6. 当前 retrieval eval 的实现口径

这条评估的执行链路是：

```text
load fixture
  -> create temp users
  -> insert fixture memory_events
  -> build query embedding
  -> searchHybrid()
  -> rerankEvents()
  -> compare expected hits
  -> summarize metrics
  -> cleanup temp data
```

当前固定指标包括：

### `expected_hit_rate@k`

前 `k` 个结果里，只要出现任意一个预期事件，就算命中。

### `top1_hit_rate`

第 1 条结果是否就是期望的那条事件。

### `precision@k`

前 `k` 条里，有多少条是真正相关的。

### `user_isolation_pass_rate`

结果中是否完全没有其他用户的数据。

### `ranking_changed_case_rate`

raw hybrid 的 top1 经过 rerank 后是否发生变化。

这个指标不是越高越好，它只是帮助你判断：

1. rerank 有没有实际介入排序
2. 当前数据集是否足够暴露 rerank 的价值

## 7. 按 Anthropic 思路，Affirm 下一步该怎么扩成真正的 evals 体系

不要直接上一个“大而全”的评估平台。

更适合当前项目的推进顺序是 4 层。

### 7.1 第 1 层：离线 fixture eval

用途：

- 快速回归
- 调整 retrieval / rerank / prompt 结构时验证基线

当前已具备：

- memory recall eval
- memory write eval
- prompt injection eval
- assistant memory utilization eval
- baseline conversation replay eval
- degradation eval

下一步要补：

1. 把 `conversation replay` 的 hand-crafted fixture 扩到真实 transcript
2. 为 `memory utilization / replay` 增加 `live_ai` 样本与失败案例
3. 把 eval 结果接到发布门禁

### 7.2 第 2 层：真实对话回放 eval

这仍然是当前最值得继续加强的一层。

建议做法：

1. 从 `messages` 和 trace 中抽样真实用户会话
2. 脱敏
3. 固定 replay 输入
4. 标注“应该召回哪些 memory / 不该召回哪些 / 回复应该体现什么”
5. 周期性回放

为什么这层重要：

因为 hand-crafted fixture 适合起步，但会天然偏干净、偏简单，容易高估系统表现。当前仓库里已经有 `tools/evaluate-conversation-replay.js` 的 baseline fixture，但还不够代表真实线上分布。

### 7.3 第 3 层：线上样本抽检 eval

用途：

- 看真实分布下的质量
- 及时发现 drift 和脏记忆问题

建议方式：

1. 每天或每周抽取一定量会话
2. 记录 `memory_refs`、`knowledge_refs`、最终回复
3. 人工或半自动标注
4. 沉淀为新的 replay eval 样本

这层的目标不是全自动，而是让线上问题能反哺离线评估集。

### 7.4 第 4 层：发布门禁 eval

当 retrieval / prompt / memory write 有改动时，不要求所有高阶评估都跑，但至少要有最小门禁：

1. unit / integration 基础不挂
2. offline retrieval eval 不回退
3. user isolation 不能退化
4. 已知高风险 replay case 不能回退

## 8. 建议的 eval matrix

| eval 名称 | 主要目标 | 当前状态 | 推荐位置 |
|-----------|----------|----------|----------|
| memory recall eval | 验证召回 / rerank / isolation | 已实现第一版 | `tools/evaluate-memory-recall.js` |
| memory write eval | 验证候选提取与入库质量 | 已实现 baseline | `tools/evaluate-memory-write.js` |
| prompt injection eval | 验证 recalled memory 是否进入 prompt | 已实现 baseline | `tools/evaluate-memory-injection.js` |
| memory utilization eval | 验证回复是否真正使用 recalled memory | 已实现 fixture baseline | `tools/evaluate-memory-utilization.js` |
| replay conversation eval | 用固定历史对话回放整条链路 | 已实现 fixture baseline | `tools/evaluate-conversation-replay.js` |
| degradation eval | 验证 embedding / Haystack 异常时的降级 | 已实现 baseline | `tools/evaluate-degradation.js` |

## 9. 当前项目里最值得继续加强的 3 个 eval

### 9.1 `memory-write-eval`

虽然 baseline 已经落地，但下一步仍应该优先扩充样本和失败案例。

目标：

- 给定一段对话
- 检查 `MemoryService` 和 `MemoryEventService` 输出的候选是否合理

建议样本结构：

```json
{
  "id": "commitment-extraction-01",
  "messages": [
    { "role": "user", "content": "这周我想重新开始写显化日记。" },
    { "role": "assistant", "content": "可以先设成每天一条最小记录。" }
  ],
  "expected_memory_events": [
    {
      "event_type": "commitment",
      "title_contains": "显化日记"
    }
  ],
  "disallowed_patterns": [
    "一次性情绪发泄"
  ]
}
```

要验证的不是字符串完全相等，而是：

1. 类型是否对
2. 核心事实有没有提取出来
3. 是否写入了明显不该入库的噪声

### 9.2 `prompt-injection-eval`

这个 baseline 已有，但还需要继续覆盖更多“召回正确却注入错误”的失败模式。

目标：

- 给定用户 query 和已有 memory
- 跑 `loadConversationContext()`
- 检查 recalled memory 是否真的进入 prompt block

这里不要只看“有无召回”，还要看：

1. 注入数量是否合理
2. 顺序是否合理
3. 有没有把不该注入的 memory 带进去

### 9.3 `conversation-replay-eval`

这个 baseline 已有，但最需要继续投入的是把 hand-crafted case 扩成真实 transcript 回放集。

目标：

- 用真实对话回放完整链路
- 看最终 assistant 是否做到了“记得、用对、说得自然”

这个 eval 最接近用户真实感受，也最接近 Anthropic 文章里强调的“围绕真实任务而不是抽象能力标签”。

## 10. 当前已经遇到，或者很可能会遇到的问题

## 10.1 embedding 配置导致评估路径变化

已遇到的问题：

- embedding provider 返回 `404`
- 检索自动退回关键词或 deterministic 向量
- 同一条 eval 看起来“还能跑通”，但其实不是同一条技术路径

这会导致一个危险：

- 指标看似可比
- 实际上向量链路和回退链路混在一起了

解决方法：

1. 在评估输出中显式记录 embedding mode / provider / model
2. 区分 `remote-embedding eval` 和 `fallback eval`
3. 不要把不同运行模式的结果直接混在同一张趋势图里

当前相关代码：

- `src/services/memory-embedding-service.js`

## 10.2 fixture 太干净，容易高估效果

常见问题：

- 手工样本通常语义明确
- 干扰项太少
- 用户表达方式太标准

结果：

- 离线分数很好看
- 上线后用户仍觉得“它还是没真记住我”

解决方法：

1. 保留 hand-crafted fixture，但只把它当基线
2. 逐步引入真实对话回放样本
3. 每次线上发现失败案例，都回灌进 fixture / replay 集

## 10.3 指标过于局部，无法代表用户体验

已知事实：

- `expected_hit_rate@k = 1` 不代表最终回复就一定好
- 召回正确，也可能没有注入 prompt
- 注入 prompt，也可能没有被 assistant 利用

解决方法：

1. 把 eval 按链路拆层
2. retrieval、injection、utilization 分开评估
3. 不再用单个分数代表整个 agent

## 10.4 rerank 是否有效，容易被样本误导

已观察到的现象：

- 有时 `ranking_changed_case_rate > 0`
- 有时换成真实 embedding 后变成 `0`

这不一定代表 rerank 失效，而可能意味着：

1. 原始向量召回已经足够强
2. 当前样本不足以暴露 rerank 的增益
3. rerank 的收益只会出现在更难、更脏的案例上

解决方法：

1. 单独构造“旧事件 vs 新事件”“相似事件竞争”“高 importance 干扰项”案例
2. 不把 `ranking_changed_case_rate` 当成成功率指标
3. 更关注它改变后是否更接近期望结果

## 10.5 真实 agent 输出有随机性

后续一旦做回复质量 eval，会遇到：

1. LLM 输出不稳定
2. 同一个输入可能有多种合理说法
3. 很难做严格字符串匹配

解决方法：

1. 优先用 rubric 或结构化判定，而不是全文精确匹配
2. 必要时允许多次运行取分布，而不是只看单次结果
3. 先用高价值 case 小规模评估，再考虑更大规模自动化

## 10.6 环境依赖太多，评估不够稳定

当前项目的评估可能依赖：

1. PostgreSQL
2. pgvector
3. embedding provider
4. 可选的 Haystack

这意味着 eval 很容易被环境问题污染。

解决方法：

1. 每条 eval 明确标注依赖项
2. 先做“可脱网”的离线 eval，再补“近真实”的在线 eval
3. 把环境自检和评估结果分开输出，不要混在一起解释

## 11. 当前推荐的执行顺序

如果你现在继续补 evals，建议顺序如下：

1. 保持整套 baseline eval 作为回归基线
2. 从真实 Telegram 历史中整理第一批 replay 样本
3. 为 `memory utilization / replay` 加入 `live_ai` 对照运行
4. 沉淀高风险失败 case，扩大 fixture 集
5. 为发布建立最小门禁
6. 把评估结果接进日常治理和人工抽检

原因很直接：

1. retrieval 已经有基础，不该停
2. 当前最大缺口不再是“有没有 recall eval”
3. 而是“写入、注入、利用”这三层还没有稳定量化

## 12. 对当前项目最重要的结论

结论只有三条：

1. Affirm 现在最需要的不是更大的模型，而是更完整的 evals 体系
2. 这个体系应该从“长期记忆链路”拆层建立，而不是先追求一个总分
3. 当前最现实的路线是：`fixture eval -> replay eval -> 线上抽检 -> 发布门禁`

如果后续只允许优先做一件事，建议优先做：

**真实对话回放 eval。**

因为它最能把“用户觉得你记住了我没有”这种主观体验，转成可复盘的工程问题。
