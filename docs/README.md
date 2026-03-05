# Affirm 文档索引

**项目**：Affirm — 显化导师 AI Agent
**更新日期**：2026-03-05

---

## 文档结构

```
docs/
├── README.md                          本文件（文档索引）
├── DOCUMENTATION_RULES.md             文档治理规则
│
├── architecture/                      架构文档
│   ├── system-architecture.md         系统架构（主文档）
│   └── 数据层API文档.md                数据模型 API 参考
│
├── database/                          数据库文档
│   └── 数据库设计.md                   表结构、索引、触发器设计
│
├── project/                           项目说明
│   └── 项目概述.md                     项目定位、技术栈、快速开始
│
└── reports/                           技术报告
    ├── Affirm 项目技术审计报告.md        安全、运行时、架构全面审计
    ├── 架构升级评估报告.md               升级路线评估（RAG / Webhook / Redis）
    └── repository-refactor.md          仓库结构整理记录
```

---

## 架构文档

### [系统架构](architecture/system-architecture.md)

当前项目完整架构说明，包含：
- 系统整体架构图
- Telegram Bot 消息处理流程
- AI Provider 多提供商结构
- MessageQueue 串行化机制
- Vector Memory 向量存储设计
- RAG 检索增强设计（现状 + 目标架构）
- 数据库表结构
- 部署架构

### [数据层 API 文档](architecture/数据层API文档.md)

数据模型方法参考：`User`、`Message`、`Profile`、`Knowledge` 各模型的方法签名和示例。

---

## 数据库文档

### [数据库设计](database/数据库设计.md)

包含：
- 5 张数据表的完整 SQL 定义（`users`、`profiles`、`messages`、`knowledge_chunks`、`sync_jobs`）
- 索引设计（功能索引 + ivfflat 向量索引）
- 触发器设计（`updated_at` 自动更新）
- 数据关系图
- 性能优化和安全设计说明

---

## 项目文档

### [项目概述](project/项目概述.md)

包含：
- 项目定位和核心特性（含状态标注）
- 技术栈总览
- AI Provider 配置说明
- 核心环境变量
- 快速开始指南
- 已知问题与升级路线

---

## 技术报告

### [Affirm 项目技术审计报告](reports/Affirm%20项目技术审计报告.md)

**日期**：2026-03-05
**审计范围**：全项目源码 + 配置 + 数据库 Schema

涵盖：
- 安全漏洞（高危 / 中危 / 低危）及修复状态
- 运行时 Bug 分析
- AI 模型架构评估
- 测试覆盖率
- 基础设施与部署
- 优化路线图

### [架构升级评估报告](reports/架构升级评估报告.md)

**日期**：2026-03-05

涵盖：
- 现有架构各模块分析（复用 / 改造 / 重写判断）
- 5 个升级项的详细评估：
  - Embedding Provider 独立（Low，立即执行）
  - RAG Integration（Low，立即执行）
  - Webhook 架构（Medium）
  - Redis Queue / BullMQ（Medium）
  - LangGraph Agent（High，按需评估）
- 推荐升级顺序和实施计划

### [仓库整理报告](reports/repository-refactor.md)

**日期**：2026-03-05

涵盖：
- 整理前问题分析
- 新目录结构
- 文件移动 / 删除 / 新建清单
- Import 路径修复记录

---

## 快速导航

| 我想了解… | 去这里 |
|-----------|-------|
| 系统如何工作 | [系统架构](architecture/system-architecture.md) |
| RAG 怎么接入 | [系统架构 §6 RAG 设计](architecture/system-architecture.md#6-rag-设计) |
| 数据库有哪些表 | [数据库设计](database/数据库设计.md) |
| 如何调用数据模型 | [数据层 API 文档](architecture/数据层API文档.md) |
| 项目有哪些安全问题 | [技术审计报告](reports/Affirm%20项目技术审计报告.md) |
| 下一步该升级什么 | [架构升级评估报告](reports/架构升级评估报告.md) |
| 项目快速上手 | [项目概述](project/项目概述.md) |
