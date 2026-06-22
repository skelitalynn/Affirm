# Affirm 文档入口

**更新日期**：2026-06-22  
**当前状态**：高层项目知识已经收口到 `docs/` 顶层 Harness 文档；`architecture/`、`development/` 和 `reports/` 只承担技术深挖或历史追溯，不再并行维护第二套项目说明书。

## 1. 先看这 6 份

第一次接手项目，优先读下面这些：

1. [架构与产品边界](ARCHITECTURE.md)
2. [开发与启动](DEVELOPMENT.md)
3. [测试与完成定义](TESTING.md)
4. [当前进度](PROGRESS.md)
5. [关键决策](DECISIONS.md)
6. [功能状态](FEATURES.json)

## 2. 按问题查

| 你现在要解决什么 | 去看哪里 |
|---|---|
| 这个项目到底要做什么、哪些该保留到重建版 | [架构与产品边界](ARCHITECTURE.md) |
| 现在这套系统是怎么分层的 | [架构与产品边界](ARCHITECTURE.md) |
| 环境、配置、启动、自检 | [开发与启动](DEVELOPMENT.md)、[环境启动与自检](development/01-环境启动与自检.md) |
| Telegram 主链路、prompt、trace | [Telegram 对话链路](development/02-Telegram-对话链路.md) |
| Haystack 和外部知识 | [Knowledge RAG](development/03-Knowledge-RAG.md)、[Knowledge RAG 架构](architecture/knowledge-rag-architecture.md) |
| 数据库和迁移 | [数据库与迁移](development/05-数据库与迁移.md)、[数据库设计](database/数据库设计.md) |
| 测试、验收、eval 怎么跑 | [测试与完成定义](TESTING.md) |
| 长期记忆目标架构 | [分层上下文管理架构](architecture/layered-context-management-architecture.md)、[显化导师长期记忆架构](architecture/manifest-coach-memory-architecture.md) |
| `memory_events` 评估、排序和治理 | [memory_events 评估排序与治理](development/09-memory-events-评估排序与治理.md) |
| eval 方法与发布前验证思路 | [AI Agent Evals 方法与落地](development/10-AI-Agent-Evals-方法与落地.md) |
| 当前仓库真实状态和下一步 | [当前进度](PROGRESS.md) |
| 为什么文档这样收口 | [关键决策](DECISIONS.md) |

## 3. 建议阅读顺序

### 第一次接手项目

1. [架构与产品边界](ARCHITECTURE.md)
2. [开发与启动](DEVELOPMENT.md)
3. [当前进度](PROGRESS.md)
4. [测试与完成定义](TESTING.md)
5. [Telegram 对话链路](development/02-Telegram-对话链路.md)
6. [memory_events 评估排序与治理](development/09-memory-events-评估排序与治理.md)

### 准备重建 `v3`

1. [架构与产品边界](ARCHITECTURE.md)
2. [分层上下文管理架构](architecture/layered-context-management-architecture.md)
3. [显化导师长期记忆架构](architecture/manifest-coach-memory-architecture.md)
4. [长期记忆升级路线](development/07-长期记忆升级路线.md)
5. [memory_events 评估排序与治理](development/09-memory-events-评估排序与治理.md)
6. [当前进度](PROGRESS.md)

## 4. 目录口径

当前 `docs/` 的职责很简单：

1. 顶层文档是唯一高层项目知识源
2. `architecture/` 保留专题架构设计
3. `development/` 保留模块级维护文档
4. `reports/` 只保留历史验证和阶段报告

## 5. Harness 路由

当前仓库使用 `harness-adopter` 的增量接入方式维护 Agent 工作流。

如需查看 Harness 状态，优先看：

1. [架构与产品边界](ARCHITECTURE.md)
2. [当前进度](PROGRESS.md)
3. [关键决策](DECISIONS.md)
4. [开发与启动](DEVELOPMENT.md)
5. [测试与完成定义](TESTING.md)
6. [功能状态](FEATURES.json)
