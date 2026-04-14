# Affirm 文档入口

**更新日期**：2026-04-14
**当前状态**：v2 最小闭环已可运行；长期记忆目标架构已重新定义，但尚未全部实现。

## 当前文档口径

当前文档不再把“当前代码已经实现的能力”和“项目希望达到的最终效果”混在一起，而是明确区分两层：

1. 当前实现
   - `messages`：原始日志与最近上下文
   - `profiles`：稳定长期记忆
   - `Haystack`：外部知识
   - `MemoryService` / `sync_jobs` / `trace`：工程治理层

2. 目标效果
   - 机器人稳定记住用户身份、目标、偏好、阻碍和承诺
   - 机器人能从大量历史内容中召回相关经历
   - 用户长期记忆和外部知识分别处理，不相互污染
   - 记忆系统支持后续 hybrid retrieval、摘要、评估和后台治理

## 第一次接手项目先看

1. [项目概述](project/项目概述.md)
2. [显化导师长期记忆架构](architecture/manifest-coach-memory-architecture.md)
3. [闭环 v2 架构](architecture/closed-loop-v2-architecture.md)
4. [系统架构](architecture/system-architecture.md)
5. [数据库设计](database/数据库设计.md)

## 按目标阅读

| 目标 | 文档 |
|------|------|
| 快速理解项目和边界 | [项目概述](project/项目概述.md) |
| 理解产品目标中的长期记忆效果 | [显化导师长期记忆架构](architecture/manifest-coach-memory-architecture.md) |
| 理解 v2 当前交付和下一阶段差距 | [闭环 v2 架构](architecture/closed-loop-v2-architecture.md) |
| 理解整体系统组成 | [系统架构](architecture/system-architecture.md) |
| 理解长期记忆升级实施顺序 | [长期记忆升级路线](development/07-长期记忆升级路线.md) |
| 维护知识检索与 Haystack 集成 | [Knowledge RAG](development/03-Knowledge-RAG.md) |
| 维护 Telegram 主链路 | [Telegram 对话链路](development/02-Telegram-对话链路.md) |
| 维护后台管理面 | [Admin 后台](development/04-Admin-后台.md) |
| 改数据库或迁移 | [数据库与迁移](development/05-数据库与迁移.md) |
| 准备测试与交付 | [测试与交付](development/06-测试与交付.md) |
| 准备面试表达 | [面试项目说明](project/面试项目说明.md) |

## 文档结构

```text
docs/
├── README.md
├── architecture/
│   ├── closed-loop-v1-architecture.md
│   ├── closed-loop-v2-architecture.md
│   ├── knowledge-rag-architecture.md
│   ├── manifest-coach-memory-architecture.md
│   └── system-architecture.md
├── database/
│   └── 数据库设计.md
├── development/
│   ├── 00-开发总流程.md
│   ├── 01-环境启动与自检.md
│   ├── 02-Telegram-对话链路.md
│   ├── 03-Knowledge-RAG.md
│   ├── 04-Admin-后台.md
│   ├── 05-数据库与迁移.md
│   ├── 06-测试与交付.md
│   └── 07-长期记忆升级路线.md
└── project/
    ├── 项目概述.md
    └── 面试项目说明.md
```

## 当前需要记住的几件事

- 业务入口是 `src/index.js`
- 后台入口是 `src/admin/server.js`
- 配置入口只有 `src/config.js`
- v2 已接入的关键模块是 `src/services/memory-service.js`、`src/services/conversation-trace.js`、`src/models/sync-job.js`
- 运行时 Knowledge RAG 走 `src/services/rag/provider.js`
- `knowledge_chunks` 是桥接层，不是最终运行时检索主库
- 当前还没有独立的“用户历史记忆召回层”
- 下一阶段主线不是恢复旧 `messages` 语义检索，而是新增 `memory_events + hybrid recall`
