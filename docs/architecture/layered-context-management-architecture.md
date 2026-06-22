# 分层上下文管理架构

**更新日期**：2026-04-20
**状态**：目标架构设计文档；截至 `2026-04-20`，仓库当前仍以 `system + profile memory + recalled memory events + recent messages + knowledge + current user message` 的方式组装上下文，本文件定义下一阶段要实现的“分层存储、按需读取、预算装配、超限压缩”方案

## 1. 这份文档解决什么问题

Affirm 的目标不是做一个“能接上最近几轮话”的普通聊天机器人，而是做一个可长期陪伴、可跟进目标、能记住人的导师型对话系统。

当前系统已经具备：

1. 原始消息日志
2. 稳定长期记忆
3. 历史事件召回
4. 外部知识检索

但当前问题也很明显：

1. 上下文来源过多时，容易默认全量拼接
2. `system` 层承担了过多不该常驻的内容
3. 历史消息、长期记忆、知识块都缺少统一预算
4. 无意义输入也会进入主日志与后续链路
5. 长对话会越来越肥，最后挤压可见输出空间

这份文档的目标，是把当前“多来源拼接”升级成“可治理的上下文管理系统”。

## 2. 设计原则

这套方案必须同时满足下面几条：

1. 不把用户记忆和外部知识混成一个桶
2. 不把所有历史都默认拼进当前 prompt
3. 不把每条对话都升级成长期记忆
4. 不用“按条数固定拼接”替代预算管理
5. 不让长上下文挤掉正文输出空间
6. 不让无意义输入污染日志、摘要和长期记忆

一句话：聊天日志可以保留，但上下文进入模型必须经过筛选、预算和压缩。

## 3. 当前实现与目标实现的差距

### 3.1 当前实现

当前仓库主回复链路的上下文来源是：

1. 固定 `system prompt`
2. `profiles` 导出的 `profile memory`
3. `memory_events` 召回结果
4. `messages` 最近若干条原始消息
5. Haystack 外部知识
6. 当前用户输入

当前实现的优点：

1. 已经把用户长期记忆和外部知识拆开
2. 已经有独立历史事件层 `memory_events`
3. 已经有回复后异步写入长期记忆的基础能力

当前实现的主要问题：

1. 读取层过少，缺 rolling summary 和 coaching state
2. 组装层缺 token budget，而是近似“按数量拼接”
3. 存储层缺输入分流，噪音消息也会进入主对话库
4. 读取规则不够细，普通闲聊和目标推进会读到相似层级
5. 超限时没有明确的压缩顺序和降级规则

### 3.2 目标实现

目标是改成：

`消息分流 -> 分层存储 -> 意图路由 -> 预算装配 -> 超限压缩 -> 回复生成 -> 条件写回`

这意味着：

1. 存储前先判断“这条消息值不值得进入正式链路”
2. 读取前先判断“这一轮到底需要哪些层”
3. 组装时按预算而不是按条数
4. 超预算时优先砍低价值层，而不是让模型自己硬截断

## 4. 目标中的四层记忆 + 一层状态 + 一层外部知识

### 4.1 System Layer

职责：

1. 角色设定
2. 风格规则
3. 安全边界
4. 行为准则

边界：

1. 不放 `profile`
2. 不放历史事件
3. 不放知识片段
4. 不放用户 UUID、无关调试信息

要求：

1. 尽量短
2. 只保留硬规则
3. 能被复用，不与某个用户强耦合

### 4.2 Recent Conversation Layer

职责：

1. 保持当前话题连续性
2. 处理指代、省略、语气延续
3. 维持“像刚才那个人在继续说话”的感觉

建议：

1. 默认保留最近 `6~10` 条原始消息
2. 每条消息需要长度上限
3. 更老的原文不再直接拼接，而是移交给 rolling summary

数据来源：

- `messages`

### 4.3 Rolling Summary Layer

职责：

1. 压缩较早对话
2. 保留阶段性背景
3. 提供长对话连续性而不重复灌原文

典型内容：

1. 最近阶段在聊什么
2. 当前矛盾点是什么
3. 用户最近几轮做出的关键判断或变化
4. 未完成但仍相关的话题

边界：

1. 不记录每一句原话
2. 不直接代替长期记忆
3. 不承载外部知识

推荐数据形态：

1. 可按“会话段”或“时间窗口”生成摘要
2. 先支持单条当前摘要，再扩展到多段摘要

### 4.4 Core Memory Layer

职责：

1. 保存少量、稳定、长期有效的信息
2. 作为每轮可低成本加载的常驻背景

典型内容：

1. 长期目标
2. 稳定事实
3. 稳定沟通偏好
4. 高置信度 open loops
5. 明确且长期存在的核心阻力模式

边界：

1. 数量必须小
2. 只存高价值、高稳定度信息
3. 不把一时情绪和一次性表达塞进来

数据来源：

- 当前可由 `profiles` 承接

### 4.5 Archival Memory Layer

职责：

1. 保存大量历史事件
2. 在当前问题需要时按需检索
3. 支撑“你上次提过”“你之前也是这样”的体验

典型内容：

1. 关键关系事件
2. 阶段性挫折或突破
3. 用户做出的承诺与后续兑现情况
4. 重复出现的卡点
5. 关键复盘片段

边界：

1. 默认不常驻
2. 必须检索后再进入 prompt
3. 必须有压缩与治理机制

数据来源：

- 当前可由 `memory_events` 承接

### 4.6 Coaching State Layer

职责：

1. 保存“此刻要推进什么”的结构化状态
2. 避免每轮都靠自然语言摘要猜当前阶段

典型字段：

1. `current_goal`
2. `current_phase`
3. `weekly_commitment`
4. `primary_blocker`
5. `active_open_loops`
6. `next_step`
7. `last_progress_signal`

边界：

1. 它不是通用 profile
2. 它不是历史事件库
3. 它更像“当前辅导工作台状态”

推荐数据形态：

1. 独立结构化对象
2. 单用户当前态为主
3. 必要时保留状态变更历史

### 4.7 External Knowledge Layer

职责：

1. 提供外部知识背景
2. 为需要知识支撑的问题补充信息

边界：

1. 不是用户记忆
2. 不能替代历史事件召回
3. 不应与 archival memory 共用一个注入桶

数据来源：

- Haystack / `knowledge_chunks`

## 5. 与当前仓库模块的映射关系

| 目标层 | 当前可复用模块 | 下一步缺口 |
|--------|----------------|-----------|
| System Layer | `src/services/ai.js` | 需要精简 prompt 文本 |
| Recent Conversation | `src/models/message.js` | 需要长度裁切、条数收敛、预算控制 |
| Rolling Summary | 暂无明确独立层 | 需要新增摘要存储与刷新逻辑 |
| Core Memory | `src/models/profile.js` + `src/services/memory-service.js` | 需要收敛字段和常驻预算 |
| Archival Memory | `src/models/memory-event.js` + `src/services/memory-retrieval-service.js` | 需要更严格的读取条件与注入裁切 |
| Coaching State | 暂无独立层 | 需要新增结构化状态模型 |
| External Knowledge | `src/models/knowledge.js` + `src/services/rag/*` | 需要与 archival memory 分开装配 |

这意味着第一版完全没必要推翻现有结构。

更现实的路线是：

1. 继续复用 `messages / profiles / memory_events / knowledge`
2. 新增 `rolling summary` 和 `coaching state`
3. 在 `TelegramService` 与 `AIService` 之间补一个上下文编排层

## 6. 输入分流与保留策略

这是本方案的关键补充：不是所有输入都应该进入正式存储。

### 6.1 为什么要做输入分流

如果所有用户输入都进入：

1. 原始消息库会快速被噪声污染
2. rolling summary 会吸入无意义流水账
3. 长期记忆抽取会被口水话干扰
4. 后续召回质量会越来越差

典型噪声输入：

1. “在吗”
2. “卡了吗”
3. “？”
4. “收到没”
5. 单个表情、单个语气词、纯测试词
6. 与真实对话内容无关的探活消息

### 6.2 建议采用三级保留策略

#### A. 丢弃或仅做轻日志

适用内容：

1. 探活
2. 催促
3. 空消息
4. 极短重复消息
5. 明显无语义负载的口水词

处理方式：

1. 不进正式 `messages`
2. 不参与上下文
3. 不进入长期记忆
4. 可选写入轻量技术日志或计数器

#### B. 短期保留，不进入长期记忆

适用内容：

1. 普通闲聊
2. 一次性情绪
3. 当下有连续性价值，但没有长期价值的日常内容

处理方式：

1. 可进入短期对话缓存或常规消息表
2. 参与 recent conversation
3. 不升级为 core memory 或 archival memory
4. 过期后可被 rolling summary 覆盖

#### C. 正式保留，可参与长期记忆筛选

适用内容：

1. 长期目标
2. 稳定偏好
3. 重复出现的阻力
4. 关键事件
5. 明确承诺
6. 持续存在的 open loop

处理方式：

1. 进入正式对话日志
2. 参与摘要
3. 进入长期记忆候选流程

### 6.3 推荐实现方式

第一版不要直接上复杂分类模型，先走规则优先：

1. 长度规则
2. 重复规则
3. 探活关键词规则
4. 纯表情/纯标点规则
5. 低语义负载规则

规则无法判定的边界消息，再交给轻量分类器。

### 6.4 重要边界

分流判断应尽量发生在正式入库之前。

否则即便后面不参与长期记忆，它也已经污染了：

1. 原始消息日志
2. recent conversation
3. 后续摘要输入

## 7. 读取规则

目标不是每轮读取所有层，而是先判断问题类型，再决定读取哪些层。

### 7.1 基础路由类型

建议至少区分下面几类：

1. 普通闲聊
2. 回忆/追踪历史
3. 目标推进/导师辅导
4. 知识问答
5. 系统探活/技术类消息

### 7.2 各类型的推荐读取组合

| 问题类型 | 推荐读取层 |
|----------|-----------|
| 普通闲聊 | `system + recent + rolling summary + current user message` |
| 回忆/追踪历史 | `system + recent + rolling summary + core memory + archival retrieval + current user message` |
| 目标推进/导师辅导 | `system + recent + rolling summary + coaching state + core memory + related archival retrieval + current user message` |
| 知识问答 | `system + recent + rolling summary + core memory(少量) + external knowledge + current user message` |
| 系统探活/技术类消息 | 极简 `system + current user message`，必要时完全跳过长期记忆层 |

### 7.3 第一版路由建议

第一版不必追求完美 intent classifier，可以从规则路由开始：

1. 包含“记得 / 上次 / 之前 / 你还记得吗”时，优先开启 archival retrieval
2. 包含“怎么办 / 计划 / 目标 / 这周 / 继续推进”时，优先读取 coaching state
3. 包含明显知识问答意图时，优先读取 external knowledge
4. 探活/短测试消息走极简链路

## 8. 写入规则

原则：聊天日志可以全存，但长期记忆必须筛选。

### 8.1 即时写入

建议即时写入的内容：

1. 当前轮 user / assistant 消息
2. 当前轮 trace metadata
3. 当前轮状态变化标记

### 8.2 延迟写入

建议异步或延迟写入的内容：

1. rolling summary
2. core memory patch
3. archival memory candidates
4. coaching state 更新

### 8.3 条件写入

只有满足条件时才升级为长期记忆：

1. 持续存在
2. 对未来对话有帮助
3. 用户明确表达
4. 不是助手臆测
5. 不是一次性口水内容

### 8.4 严禁直接升级的内容

1. 助手自己的分析结论
2. 一次性情绪波动
3. 外部知识内容本身
4. 低价值闲聊
5. 探活和口水话

## 9. Token Budget 设计

上下文装配必须从“按条数拼接”改成“按预算装配”。

### 9.1 初版推荐预算

以下数值是 prompt 侧推荐范围，不含数据库存储长度。

| 层 | 建议预算 |
|----|---------|
| system | `150~250` |
| recent conversation | `600~900` |
| rolling summary | `200~400` |
| coaching state | `100~300` |
| core memory | `150~300` |
| archival memory | `150~300` |
| external knowledge | `150~300` |
| current user message | 保底，不预先裁掉语义主体 |

### 9.2 必须预留的生成空间

装配 prompt 时，必须先为生成端预留空间：

1. 可见输出保留预算
2. 可选 thinking 预算
3. 重试缓冲预算

如果不先留空间，只会出现：

1. prompt 很完整
2. 正文却被 `MAX_TOKENS` 截断

### 9.3 推荐装配顺序

建议按下面顺序装配：

1. `current user message` 保底
2. `system`
3. `recent conversation`
4. `rolling summary`
5. `coaching state`
6. `core memory`
7. `archival memory`
8. `external knowledge`

说明：

1. 用户当前这句不应被最后才考虑
2. `coaching state` 在导师场景中的优先级通常高于外部长知识
3. `archival memory` 与 `external knowledge` 必须是低优先级可裁层

### 9.4 超预算压缩顺序

推荐按下面顺序裁切：

1. 先砍 `external knowledge`
2. 再砍 `archival memory`
3. 再压 `rolling summary`
4. 再压较旧的 `recent conversation`
5. 最后才动 `core memory`

原则：

1. 不优先动 `system`
2. 不优先动当前用户消息
3. 不让高价值稳定层被低价值检索层挤掉

## 10. Prompt 装配器的职责

当前项目需要新增一个明确的“上下文装配器”概念。

### 10.1 它应该负责什么

1. 接收各层候选上下文
2. 根据路由类型选择读取层
3. 计算预算
4. 压缩与裁切
5. 输出最终 prompt blocks
6. 记录本轮用了哪些层、裁掉了什么

### 10.2 它不应该负责什么

1. 不负责模型调用
2. 不负责 Telegram 收发
3. 不负责真正写库
4. 不负责外部知识检索实现本身

### 10.3 推荐工程落点

可考虑新增独立服务，例如：

- `src/services/context-assembly-service.js`

它位于：

`TelegramService.loadConversationContext()` 和 `AIService.prepareMessages()` 之间。

## 11. Rolling Summary 设计建议

### 11.1 目标

让更早的原始消息不再直接进入 prompt，但其阶段信息不丢。

### 11.2 第一版最小实现

第一版不必一上来就做多段摘要。

可先做：

1. 每个用户一条当前 `rolling summary`
2. 每当 recent conversation 超过窗口后，异步刷新一次
3. prompt 中只注入一条压缩摘要

### 11.3 摘要内容建议

建议保留：

1. 最近阶段主话题
2. 仍在延续的冲突或主题
3. 用户刚形成的新判断
4. 仍未关闭的话题线索

不建议保留：

1. 逐句复述
2. 大段情绪堆叠
3. 助手说过的废话

## 12. Coaching State 设计建议

这是导师场景和普通聊天机器人的核心差异之一。

### 12.1 为什么单独建层

因为很多“对下一轮最有帮助的信息”，并不是事实，而是当前推进状态。

比如：

1. 用户这周最想推进什么
2. 当前卡在哪
3. 上一轮刚立下什么承诺
4. 下一步应该提醒什么

这些内容如果混进通用 profile，会越来越脏；如果混进历史事件，又会丢掉“当前态”。

### 12.2 推荐字段

第一版建议最少只保留：

1. `current_goal`
2. `current_phase`
3. `primary_blocker`
4. `active_open_loops`
5. `next_step`
6. `last_progress_signal`

### 12.3 更新规则

1. 只在用户表达出明确状态变化时更新
2. 状态更新优先走结构化 patch
3. 无变化时不硬刷

## 13. 可观测性与评估

如果做了分层上下文，就必须能回答“这一轮到底读了什么、为什么”。

### 13.1 建议补充的 trace 字段

1. 路由类型
2. 各层候选数量
3. 各层最终注入数量
4. 各层预算占用
5. 被裁掉的层和原因
6. 当前轮是否命中过滤规则
7. 当前轮是否升级为长期记忆候选

### 13.2 建议补充的评估方向

1. 上下文利用质量
2. 长对话连续性
3. 历史事件召回命中率
4. irrelevant knowledge 污染率
5. 噪声消息过滤正确率
6. 截断率与 `finish_reason=MAX_TOKENS` 占比

## 14. 推荐实施顺序

不要一口气全做满。按收益优先顺序，推荐下面的阶段。

### Phase 1：输入分流

目标：

1. 先挡住探活词、口水词、纯噪声
2. 减少正式消息库污染

优先级：最高

### Phase 2：上下文预算装配器

目标：

1. 不再按条数硬拼
2. 明确超限裁切顺序

优先级：最高

### Phase 3：recent conversation 收敛

目标：

1. 从 `20` 条原始消息收敛到 `6~10` 条
2. 给单条消息增加长度上限

优先级：高

### Phase 4：rolling summary

目标：

1. 用摘要替代更老原文
2. 把长对话从“越聊越肥”改成“越聊越稳”

优先级：高

### Phase 5：coaching state

目标：

1. 让导师场景真正有“推进感”
2. 把状态型信息从 profile 和历史事件中解耦

优先级：中高

### Phase 6：更细的路由与评估

目标：

1. 把不同问题类型的读取差异做得更稳
2. 补 utilization / replay / filtering eval

优先级：中

## 15. 推荐涉及的代码文件

| 能力 | 主要文件 |
|------|----------|
| 输入分流 | `src/services/telegram.js` |
| 上下文读取与组装 | `src/services/telegram.js` + 新增 `src/services/context-assembly-service.js` |
| prompt block 组装 | `src/services/ai.js` |
| recent conversation 读取 | `src/models/message.js` |
| rolling summary | 新增模型/服务 |
| core memory | `src/models/profile.js` + `src/services/memory-service.js` |
| archival memory | `src/models/memory-event.js` + `src/services/memory-retrieval-service.js` |
| coaching state | 新增模型/服务 |
| trace metadata | `src/services/conversation-trace.js` |

## 16. 本方案明确拒绝的做法

1. 继续默认把所有来源全量拼进 prompt
2. 继续把用户历史和外部知识混成同一层
3. 继续按“最近 20 条原文”当作长对话方案
4. 继续让无意义输入污染正式消息库
5. 继续把长期记忆写入规则做成“每轮都写”
6. 继续只看 prompt 顺序，不做预算和压缩

## 17. 一句话结论

Affirm 下一阶段的上下文系统，不该再是“读到什么拼什么”，而应该是：

`先分流，再分层；先判断，再读取；先预算，再装配；超限就压缩；高价值信息常驻，低价值信息按需召回，垃圾数据直接 drop。`
