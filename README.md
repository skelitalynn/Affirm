# Affirm

基于 Telegram 的 AI 显化导师项目，当前主链路是：

- Telegram 对话
- PostgreSQL 持久化
- Knowledge RAG
- Admin 后台管理
- Notion 对话归档

当前最重要的说明不在旧的日报或 7 天计划里，而在新的流程文档里：

- 文档入口：[docs/README.md](docs/README.md)
- 项目概览：[docs/project/项目概述.md](docs/project/项目概述.md)
- 开发总流程：[docs/development/00-开发总流程.md](docs/development/00-开发总流程.md)

当前配置模型也已经固定：

- `.env` 是唯一配置输入源
- `src/config.js` 是唯一配置代码入口
- 主业务模块统一读取只读 `config`

## 快速开始

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run verify
npm start
```

后台管理单独启动：

```bash
npm run admin
```

常用命令：

```bash
npm start
npm run admin
npm run db:migrate
npm run test:unit
npm run test:integration
npm run lint
```

## 当前状态

- `knowledge RAG` 已切到 `LangChain + PGVectorStore`
- `messages` 语义记忆当前停用，不要再按旧 embedding 链路开发
- `EMBEDDING_API_KEY` 现在不是必填；未配置或远程 embeddings 不可用时，knowledge RAG 会退回本地 deterministic 向量

## 你应该从哪里开始

1. 先看 [docs/development/01-环境启动与自检.md](docs/development/01-环境启动与自检.md)
2. 再看 [docs/development/00-开发总流程.md](docs/development/00-开发总流程.md)
3. 然后按你的任务选择对应流程文档：
   - Telegram 主链路：[docs/development/02-Telegram-对话链路.md](docs/development/02-Telegram-对话链路.md)
   - Knowledge RAG：[docs/development/03-Knowledge-RAG.md](docs/development/03-Knowledge-RAG.md)
   - Admin 后台：[docs/development/04-Admin-后台.md](docs/development/04-Admin-后台.md)
   - 数据库与迁移：[docs/development/05-数据库与迁移.md](docs/development/05-数据库与迁移.md)
   - 测试与交付：[docs/development/06-测试与交付.md](docs/development/06-测试与交付.md)
