# Affirm 文档入口

**更新日期**：2026-06-22
**当前状态**：项目主文档已收口为 Harness 顶层文件。旧专题目录不再作为长期维护入口，相关口径已经合并进下面 6 份文档。

## 1. 先看这 6 份

第一次接手项目，只读下面这些：

1. [架构与产品边界](ARCHITECTURE.md)
2. [开发与启动](DEVELOPMENT.md)
3. [测试与完成定义](TESTING.md)
4. [当前进度](PROGRESS.md)
5. [关键决策](DECISIONS.md)
6. [功能状态](FEATURES.json)

## 2. 按问题查

| 你现在要解决什么 | 去看哪里 |
|---|---|
| 项目到底要做什么、重建时保留什么 | [架构与产品边界](ARCHITECTURE.md) |
| 当前系统怎么分层、哪些边界不能混 | [架构与产品边界](ARCHITECTURE.md) |
| 环境变量、启动、常用命令、数据库迁移 | [开发与启动](DEVELOPMENT.md) |
| Telegram、AI、Memory、RAG、Admin 维护入口 | [开发与启动](DEVELOPMENT.md) |
| 测试、eval、交付标准 | [测试与完成定义](TESTING.md) |
| 当前真实状态和下一步 | [当前进度](PROGRESS.md) |
| 为什么文档这样收口、为什么准备重建 | [关键决策](DECISIONS.md) |
| 当前 Harness 任务和验证命令 | [功能状态](FEATURES.json) |

## 3. 文档口径

当前项目文档遵循一个简单规则：

1. `docs/README.md` 是唯一文档入口
2. 顶层 Harness 文档是唯一项目知识源
3. 不再维护专题子目录或平行说明书
4. 新增长期项目知识时，优先合并进 `ARCHITECTURE.md`、`DEVELOPMENT.md`、`TESTING.md`、`PROGRESS.md` 或 `DECISIONS.md`
5. 历史报告和面试表达材料不作为项目主路由，不用于指导实现

## 4. Agent 工作流

当前仓库使用 `harness-adopter` 维护 Agent 工作流。

常用命令：

```bash
python3 scripts/harness/doctor.py
python3 scripts/harness/verify_docs_layout.py
python3 scripts/harness/task.py list
python3 scripts/harness/finish.py
```

任务完成前，必须能从 [功能状态](FEATURES.json) 找到对应行为和验证证据。
