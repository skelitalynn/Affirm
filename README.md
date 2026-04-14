# Affirm

基于 Telegram 的 AI 显化导师项目。

这个项目的目标不是做一个“能回答问题的聊天机器人”，而是做一个跨会话、长期陪伴型的显化导师系统。它需要同时做到：

1. 记住用户是谁、在做什么、卡在哪里
2. 跨会话维护稳定长期记忆
3. 从很多历史内容中召回相关经历
4. 在需要时接入外部知识，但不把外部知识和用户记忆混在一起
5. 保持可观测、可运维、可持续迭代

当前仓库已经完成 v2 最小闭环可运行版本，但“理想中的长期记忆效果”还没有全部落地。文档现在明确区分了：

- 当前已经实现的能力
- 目标中的长期记忆体验
- 为达成目标计划新增的记忆架构

当前系统边界：

- `messages`：原始对话日志与最近上下文
- `profiles`：稳定长期记忆
- `memory_events`：计划新增的可检索历史事件记忆层
- `Haystack`：外部知识检索
- `sync_jobs`：异步任务可观测层
- `Admin`：Profiles、Knowledge、Sync Jobs 管理面

核心文档入口：

- [文档总入口](docs/README.md)
- [项目概述](docs/project/项目概述.md)
- [显化导师长期记忆架构](docs/architecture/manifest-coach-memory-architecture.md)
- [闭环 v2 架构](docs/architecture/closed-loop-v2-architecture.md)
- [面试项目说明](docs/project/面试项目说明.md)

## 快速开始

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run verify
npm start
```

最小闭环不要求先接 Haystack。

如果要启用知识增强，再额外执行：

```bash
# 配置 HAYSTACK_BASE_URL 后执行
npm run knowledge:sync
```

单独启动后台：

```bash
npm run admin
```

## 常用命令

```bash
npm start
npm run admin
npm run db:migrate
npm run knowledge:sync
npm run test:unit
npm run test:integration
npm run lint
```

## 当前状态

- v2 最小闭环已可运行：`Telegram Polling + PostgreSQL + AI + MemoryService + Admin`
- 当前已实现：`profiles` 稳定记忆、`recent messages` 短期上下文、可选 `Haystack` 外部知识、`sync_jobs`/`trace` 工程治理
- 当前未实现：独立的“可检索历史记忆层”，也就是用户历史经历的 episodic memory / hybrid recall
- `knowledge_chunks` 继续保留为本地桥接表，不再作为运行时主检索库
- `messages` 语义记忆已停用，不再是主链路
- 未配置 `HAYSTACK_BASE_URL` 时，Knowledge RAG 会降级为空结果，但主回复仍可运行
- 当前推荐的下一阶段方向是：`profiles + memory_events + recent messages + knowledge` 四层上下文

## 建议阅读顺序

1. [环境启动与自检](docs/development/01-环境启动与自检.md)
2. [项目概述](docs/project/项目概述.md)
3. [显化导师长期记忆架构](docs/architecture/manifest-coach-memory-architecture.md)
4. [开发总流程](docs/development/00-开发总流程.md)
5. 根据任务选择对应文档：
   - [Telegram 对话链路](docs/development/02-Telegram-对话链路.md)
   - [Knowledge RAG](docs/development/03-Knowledge-RAG.md)
   - [Admin 后台](docs/development/04-Admin-后台.md)
   - [数据库与迁移](docs/development/05-数据库与迁移.md)
   - [测试与交付](docs/development/06-测试与交付.md)
   - [长期记忆升级路线](docs/development/07-长期记忆升级路线.md)
