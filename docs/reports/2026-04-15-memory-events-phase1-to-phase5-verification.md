# 2026-04-15 memory_events Phase 1 到 Phase 5 验证汇总

**更新日期**：2026-04-20  
**状态**：汇总 `2026-04-15` 当天分散在 Phase 1/2、Phase 3、Phase 4、Phase 5 的四篇验证报告，作为当前保留的唯一阶段性收口记录

## 1. 这份汇总解决什么问题

原先 `memory_events` 的阶段验证被拆成了四篇短报告：

1. Phase 1/2：存储与基础写入
2. Phase 3：检索
3. Phase 4：prompt 注入
4. Phase 5：基础治理

问题是：

1. 信息碎
2. 结论重复
3. 阅读成本高
4. 当前大多数场景只需要知道“到 2026-04-15 为止，memory_events 到底已经实现到哪”

所以这里把四篇合成一篇保留。

## 2. 汇总结论

截至 `2026-04-15`，`memory_events` 第一版效果闭环已经完成到 Phase 5，已经具备：

1. 存储层落库
2. 回复后基础写入
3. 回复前历史召回
4. recalled memory prompt 注入
5. 命中追踪与后台基础治理

但当时仍未完成：

1. 真实 transcript replay eval
2. assistant 对 recalled memory 的利用质量评估
3. ranking v2 与更成熟的自动治理

一句话：

`memory_events` 在 2026-04-15 已经从“概念层”变成了“可写、可查、可注入、可追踪、可治理”的第一版运行能力。

## 3. 各阶段完成内容

### 3.1 Phase 1 / Phase 2：存储与基础写入

已完成：

1. `memory_events` 表迁移落地
2. `MemoryEvent.create()` 与按用户回读验证通过
3. `AIService.generateMemoryArtifacts()` 支持返回 `profile_patch + memory_event_candidates`
4. `MemoryService.updateLongTermMemory()` 已接入 `memory_event_candidates` 保存
5. `sync_jobs` 能记录 `memory_update` 成功状态与保存数量

当时结论：

`memory_events` 已经会“落库 + 基础写入”，但还没有检索、prompt 注入和治理。

### 3.2 Phase 3：检索闭环

已完成：

1. `MemoryRetrievalService` 的 hybrid retrieval
2. `TelegramService.loadConversationContext()` 在回复前执行历史召回
3. assistant message metadata 写入 `recalled_memory_count` 和 `memory_refs`
4. 命中召回后更新 `recall_count / last_recalled_at`
5. 真实数据库脚本与单测验证通过

当时结论：

`memory_events` 已经会“检索并记录召回”，但 recalled memory 还没真正进入 prompt。

### 3.3 Phase 4：prompt 注入

已完成：

1. `AIService.prepareMessages()` 注入 recalled memory prompt block
2. prompt 顺序调整为  
   `system -> profile memory -> recalled memory events -> recent messages -> knowledge -> current user message`
3. assistant message metadata 写入 `generation.recalled_memory_in_prompt`
4. 单测验证 prompt 顺序、fallback 与 trace metadata
5. 本地运行时打印 `prepareMessages()` 顺序完成核对

当时结论：

`memory_events` 已经会“写入 + 检索 + 进入 prompt + 记录注入状态”，但还缺后台治理。

### 3.4 Phase 5：基础治理

已完成：

1. Admin 页面查看 `memory_events`
2. 支持按 `user_id / event_type / search / recalled_only` 筛选
3. 支持手动编辑 `event_type / title / summary / detail / keywords / importance / confidence / happened_at`
4. 支持手动删除错误事件
5. 支持查看哪些 assistant 回复命中了 `memory_events`
6. 支持查看某轮回复命中的事件详情
7. 集成测试验证完整治理链路

当时结论：

`memory_events` 第一版已经具备“写入 + 检索 + 注入 + 命中追踪 + 基础治理”能力。

## 4. 阶段验证对应的核心代码

| 阶段 | 主要文件 |
|------|----------|
| Phase 1 / 2 | `migrations/20260415_create_memory_events.sql` `src/models/memory-event.js` `src/services/memory-event-service.js` `src/services/memory-service.js` `src/services/ai.js` |
| Phase 3 | `src/services/memory-retrieval-service.js` `src/services/telegram.js` `src/services/conversation-trace.js` |
| Phase 4 | `src/services/ai.js` `src/services/conversation-trace.js` |
| Phase 5 | `src/admin/routes/memory-events.js` `src/admin/views/memory-events/*` `src/models/message.js` |

## 5. 当时的主要验证方式

### 5.1 真实数据库验证

当时已使用：

1. `node tools/test-memory-event.js`
2. `node tools/test-memory-retrieval.js`
3. 直接调用 `MemoryService.updateLongTermMemory()` 的 stub `aiService` 验证

确认了：

1. 表存在
2. 可写入
3. 可按用户回读
4. 可执行召回
5. 可回写 recall 计数

### 5.2 自动化验证

当时已覆盖：

1. `tests/unit/models/memory-event.test.js`
2. `tests/unit/services/memory-event-service.test.js`
3. `tests/unit/services/memory-retrieval-service.test.js`
4. `tests/unit/services/memory-service.test.js`
5. `tests/unit/services/conversation-trace.test.js`
6. `tests/unit/services/ai.test.js`
7. `tests/integration/admin-routes.test.js`

## 6. 阶段性结论如何对外表述

截至 `2026-04-15`，最准确的表述是：

1. `memory_events` 不是只会写数据库的草稿能力
2. `memory_events` 已经进入回复前召回和 prompt 注入主链路
3. assistant metadata 已能追踪命中和注入情况
4. 管理后台已能查看、修正、删除和回溯命中情况
5. 下一阶段重点不再是“把链路接上”，而是“评估质量、优化排序、补自动治理”

不准确的表述是：

1. “长期记忆最终效果已经完成”
2. “只靠 `profiles` 就够了”
3. “Haystack 可以替代用户历史记忆”

## 7. 这份汇总之后还应该看什么

如果你现在要继续推进这条线，优先看：

1. [长期记忆升级路线](../development/07-长期记忆升级路线.md)
2. [memory_events 评估排序与治理](../development/09-memory-events-评估排序与治理.md)
3. [AI Agent Evals 方法与落地](../development/10-AI-Agent-Evals-方法与落地.md)
4. [2026-04-16 Evals-Driven 测试补强与结果报告](./2026-04-16-evals-driven-test-update-and-results.md)
