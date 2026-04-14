# Affirm 文档入口

**更新日期**：2026-04-10  
**当前状态**：v1 闭环已落地，v2 工程化增强已部分落地并完成主要文档同步。

## 当前主线

Affirm 当前不是“把所有上下文都塞进 prompt”的玩具项目，而是按三层上下文拆分：

1. `messages`：短期上下文
2. `profiles`：长期记忆
3. `Haystack`：外部知识

在 v2 里，又补了三层工程能力：

1. `MemoryService`：异步整理长期记忆
2. `sync_jobs`：记录异步任务状态
3. `Conversation Trace`：给每轮对话加 `trace_id` 和生成元数据

## 第一次接手项目先看

1. [项目概述](project/项目概述.md)
2. [闭环 v2 架构](architecture/closed-loop-v2-architecture.md)
3. [系统架构](architecture/system-architecture.md)
4. [数据库设计](database/数据库设计.md)

## 按目标阅读

| 目标 | 文档 |
|------|------|
| 快速理解项目和边界 | [项目概述](project/项目概述.md) |
| 理解 v2 怎么比 v1 更工程化 | [闭环 v2 架构](architecture/closed-loop-v2-architecture.md) |
| 理解整体系统组成 | [系统架构](architecture/system-architecture.md) |
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
│   └── 06-测试与交付.md
└── project/
    ├── 项目概述.md
    └── 面试项目说明.md
```

## 当前需要记住的几件事

- 业务入口是 `src/index.js`
- 后台入口是 `src/admin/server.js`
- 配置入口只有 `src/config.js`
- v2 新增的关键模块是 `src/services/memory-service.js`、`src/services/conversation-trace.js`、`src/models/sync-job.js`
- 运行时 Knowledge RAG 走 `src/services/rag/provider.js`
- `knowledge_chunks` 是桥接层，不是最终运行时检索主库
