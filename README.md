# Affirm

基于 Telegram 的 AI 显化导师项目。当前主链路已经完成 v1 闭环，并在此基础上补了 v2 的工程化增强层。

当前系统边界：

- `messages`：短期上下文与原始对话日志
- `profiles`：长期记忆
- `Haystack`：外部知识检索
- `sync_jobs`：异步任务可观测层
- `Admin`：Profiles、Knowledge、Sync Jobs 管理面

核心文档入口：

- [文档总入口](docs/README.md)
- [项目概述](docs/project/项目概述.md)
- [闭环 v2 架构](docs/architecture/closed-loop-v2-architecture.md)
- [面试项目说明](docs/project/面试项目说明.md)

## 快速开始

```bash
cp .env.example .env
npm install
npm run db:migrate
# 先启动 Haystack，并配置 HAYSTACK_BASE_URL
npm run verify
npm run knowledge:sync
npm start
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

- v1 已落地：`profile memory -> recent messages -> knowledge RAG -> user message`
- v2 已部分落地：`MemoryService`、`Conversation Trace`、`sync_jobs`、后台同步任务页、健康检查增强
- `knowledge_chunks` 继续保留为本地桥接表，不再作为运行时主检索库
- `messages` 语义记忆已停用，不再是主链路
- 未配置 `HAYSTACK_BASE_URL` 时，Knowledge RAG 会降级为空结果，但主回复仍可运行

## 建议阅读顺序

1. [环境启动与自检](docs/development/01-环境启动与自检.md)
2. [开发总流程](docs/development/00-开发总流程.md)
3. 根据任务选择对应文档：
   - [Telegram 对话链路](docs/development/02-Telegram-对话链路.md)
   - [Knowledge RAG](docs/development/03-Knowledge-RAG.md)
   - [Admin 后台](docs/development/04-Admin-后台.md)
   - [数据库与迁移](docs/development/05-数据库与迁移.md)
   - [测试与交付](docs/development/06-测试与交付.md)
