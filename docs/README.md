# Affirm 文档入口

**更新日期**：2026-04-04

这套文档只保留两类内容：

1. 当前真实状态
2. 按流程开发的指南

历史审计、旧开发计划、日报和重复 API 文档已移除，避免继续误导开发路径。

## 第一次接手项目

按这个顺序读：

1. [项目概述](project/项目概述.md)
2. [开发总流程](development/00-开发总流程.md)
3. [系统架构](architecture/system-architecture.md)
4. [数据库设计](database/数据库设计.md)

## 按流程开发

| 目标 | 先看这篇 |
|------|----------|
| 启动项目、检查环境 | [01-环境启动与自检](development/01-环境启动与自检.md) |
| 改 Telegram 对话、Prompt、队列、Webhook | [02-Telegram 对话链路](development/02-Telegram-对话链路.md) |
| 改知识库导入、检索、LangChain 向量链路 | [03-Knowledge RAG](development/03-Knowledge-RAG.md) |
| 改管理后台页面、表单、路由 | [04-Admin 后台](development/04-Admin-后台.md) |
| 改数据库表、索引、触发器、迁移 | [05-数据库与迁移](development/05-数据库与迁移.md) |
| 跑测试、收尾、准备提交 | [06-测试与交付](development/06-测试与交付.md) |

## 当前最重要的事实

- 业务入口是 `src/index.js`
- 后台入口是 `src/admin/server.js`
- `knowledge RAG` 走 `src/services/rag/knowledge-vector-store.js`
- `messages` 语义记忆当前停用，见 `src/models/message.js`
- 数据库结构来源于 `scripts/database/schemas/init.sql` 和 `migrations/*.sql`

## 文档结构

```text
docs/
├── README.md
├── architecture/
│   ├── system-architecture.md
│   └── knowledge-rag-architecture.md
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
    └── 项目概述.md
```
