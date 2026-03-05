# Affirm 系统架构文档

**版本**：v2.0
**更新日期**：2026-03-05
**状态**：当前生产架构

---

## 目录

1. [系统整体架构](#1-系统整体架构)
2. [Telegram Bot 架构](#2-telegram-bot-架构)
3. [AI Provider 结构](#3-ai-provider-结构)
4. [MessageQueue 机制](#4-messagequeue-机制)
5. [Vector Memory 设计](#5-vector-memory-设计)
6. [RAG 设计](#6-rag-设计)
7. [数据库结构](#7-数据库结构)
8. [Admin 管理后台](#8-admin-管理后台)
9. [部署架构](#9-部署架构)
10. [目录结构](#10-目录结构)

---

## 1. 系统整体架构

Affirm 是一个基于 Telegram Bot 的 AI 显化导师助手。用户通过 Telegram 对话，后端对接多个 AI Provider，所有消息持久化到 PostgreSQL（含 pgvector 语义向量），对话支持归档到 Notion。

```
┌──────────────────────────────────────────────────────┐
│                   用户（Telegram）                    │
└─────────────────────────┬────────────────────────────┘
                          │ 文本消息 / 命令
                          ▼
┌──────────────────────────────────────────────────────┐
│              Telegram Bot API（Polling 模式）          │
│              node-telegram-bot-api                    │
└─────────────────────────┬────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│                  TelegramService                      │
│  ┌──────────────┐    ┌─────────────────────────────┐ │
│  │ MessageQueue │    │       Command Handlers       │ │
│  │（用户级串行）  │    │ /start /help /history       │ │
│  └──────┬───────┘    │ /clear  /archive_now        │ │
│         │            └─────────────────────────────┘ │
└─────────┼────────────────────────────────────────────┘
          │
    ┌─────┴──────────────────────────┐
    │                                │
    ▼                                ▼
┌──────────┐                 ┌───────────────┐
│AIService │                 │ NotionService │
│（多 Provider）│             │（对话归档）    │
└────┬─────┘                 └───────────────┘
     │
     ▼
┌────────────────────────────────┐
│      AI Provider（可配置）      │
│  - DeepSeek（默认）             │
│  - Claude（via AiGoCode 代理）  │
│  - OpenAI                      │
└────────────────────────────────┘

┌────────────────────────────────┐
│    PostgreSQL + pgvector       │
│  - users                       │
│  - messages（含 embedding）     │
│  - profiles                    │
│  - knowledge_chunks            │
│  - sync_jobs                   │
└────────────────────────────────┘
```

---

## 2. Telegram Bot 架构

### 消息处理流程

```
Telegram Message
      │
      ▼
TelegramService.handleMessage()
      │
      ├─► sendChatAction('typing')     // 立即反馈，不等队列
      │
      ▼
MessageQueue.enqueue(userId, fn)       // 按用户串行化
      │
      ▼（同一用户的消息保证顺序执行）
_processSingleMessage()
      │
      ├─► ensureUser()                 // 创建或查找用户记录
      ├─► Message.create(user_msg)     // 保存消息，自动生成 embedding
      ├─► Message.getRecentMessages()  // 获取最近 N 条时序上下文
      │
      ├─► [RAG] EmbeddingService       // 语义检索
      │         ├─► Knowledge.semanticSearch()      // 相关知识片段
      │         └─► Message.semanticSearchByText()  // 相关历史消息
      │
      ├─► AIService.generateResponse() // 调用 LLM（含 RAG 上下文）
      ├─► Message.create(ai_reply)     // 保存 AI 回复
      └─► bot.sendMessage()            // 返回结果给用户
```

### Bot 命令

| 命令 | 功能 |
|------|------|
| `/start` | 欢迎用户，注册用户记录 |
| `/help` | 显示帮助和命令列表 |
| `/history` | 查看最近对话（条数可配置） |
| `/clear` | 清除全部对话历史 |
| `/archive_now` | 手动触发当日对话归档到 Notion |

---

## 3. AI Provider 结构

### 多 Provider 配置

通过环境变量 `AI_PROVIDER` 选择当前提供商，所有 Provider 统一使用 `openai` npm 包（OpenAI 兼容 API），无需为每个 Provider 编写独立客户端。

| Provider | 环境变量 | 默认 Base URL | 默认模型 |
|----------|---------|--------------|---------|
| `deepseek`（默认） | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-reasoner` |
| `claude` | `CLAUDE_API_KEY` | `https://api.aigocode.com/v1` | `claude-sonnet-4-6` |
| `openai` | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4` |

### AIService 结构（`src/services/ai.js`）

```
AIService
  ├── initialize()        // 初始化 OpenAI 兼容客户端，测试连接
  ├── generateResponse()  // 生成回复（接收含 RAG 结果的 context）
  ├── prepareMessages()   // 组装 system prompt + RAG 上下文 + 历史 + 用户消息
  └── testConnection()    // 连接健康检查
```

### System Prompt 结构

```
[system]
  你是一个有帮助的显化导师，帮助用户通过积极肯定语和思维重塑来达成目标。
  用户信息：{ username, id }
  [RAG 注入] 相关知识背景（若有匹配片段）
  [RAG 注入] 相关历史记忆（若有语义相关消息）

[messages]
  最近 N 条对话（时序上下文）

[user]
  当前用户消息
```

---

## 4. MessageQueue 机制

**文件**：`src/utils/message-queue.js`

### 设计目标

防止同一用户的并发消息竞争 AI 上下文，保证同一用户的消息严格串行处理，同时不阻塞其他用户。

### 结构

```
MessageQueue（进程级单例）
  │
  ├── userQueues: Map<userId, Promise链>
  │     每个用户独立队列，互不影响
  │
  ├── enqueue(userId, processFn, context)
  │     将任务挂载到该用户的 Promise 链末尾
  │
  ├── 超时控制：30 秒（defaultTimeout）
  │
  └── 统计监控
        ├── totalProcessed   累计处理消息数
        ├── activeQueues     当前活跃用户队列数
        ├── maxQueueSize     历史最大队列深度
        └── timeouts         超时次数
```

### 当前限制与升级路线

| 限制 | 说明 | 升级方案（见架构升级评估报告）|
|------|------|------------------------------|
| 纯内存实现 | 进程重启后队列丢失 | 替换为 BullMQ + Redis |
| 单进程 | 无法水平扩展 | 配合 Webhook + BullMQ Worker |

---

## 5. Vector Memory 设计

**文件**：`src/services/embedding.js`、`src/models/message.js`

### Embedding 生成

Embedding 使用独立 Provider 配置（`config.embedding`），与主 AI Provider 完全解耦。

| 参数 | 配置 |
|------|------|
| 配置来源 | `config.embedding`（独立于 `config.ai`）|
| 向量维度 | 768（与数据库 `VECTOR(768)` 列一致，由 `EMBEDDING_DIMENSIONS` 控制）|
| 默认模型 | `text-embedding-3-small`（OpenAI，支持原生 768 维输出）|
| 默认 Base URL | `https://api.openai.com/v1` |
| 环境变量 | `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_BASE_URL` / `EMBEDDING_DIMENSIONS` |

### 消息向量写入流程

```
Message.create({ content })
  │
  ├── EmbeddingService.generateEmbedding(content)
  │     └── 返回 Float32Array / number[]
  │
  ├── toSql(embedding)    // pgvector 格式转换（pgvector npm 包）
  │
  └── INSERT INTO messages
        (user_id, role, content, embedding, metadata)
```

### 失败降级

embedding 生成失败时，`embedding` 写入 `NULL`。消息仍正常存储，语义检索功能对该条消息不可用，时序上下文功能不受影响。

---

## 6. RAG 设计

### 当前状态（Phase 1 已完成）

| 组件 | 实现状态 | 接入状态 |
|------|---------|---------|
| `Knowledge.semanticSearch()` | ✅ 已实现 | ✅ 已接入对话链路 |
| `Message.semanticSearchByText()` | ✅ 已实现 | ✅ 已接入对话链路 |
| EmbeddingService | ✅ 已实现 | ✅ 独立 Provider 配置 |

### RAG 架构

```
用户消息
  │
  ▼（Step 3a）
EmbeddingService.generateEmbedding(userMessage)
  │
  ├──► Knowledge.semanticSearch(embedding, userId, topK=5, threshold=0.6)
  │         └── SELECT content FROM knowledge_chunks
  │               WHERE user_id = ?
  │               ORDER BY embedding <=> $query_vector
  │               LIMIT 5
  │
  └──► Message.semanticSearchByText(userMessage, userId, topK=3, threshold=0.65)
            └── 语义相似的历史消息（跨越时序上下文窗口的长期记忆）

  ▼（Step 4）
构建 AI Context：
  {
    recentMessages:    最近 N 条时序消息（短期记忆）
    relevantKnowledge: RAG 知识片段（用户注入的外部知识）
    semanticMessages:  RAG 历史消息（长期语义记忆）
  }

  ▼（Step 5）
AIService.prepareMessages(context)
  └── System Prompt 中注入 RAG 结果
```

### RAG 检索参数

| 参数 | 知识库检索 | 历史消息检索 |
|------|-----------|------------|
| topK | 5 | 3 |
| 相似度阈值 | 0.6 | 0.65 |
| 距离度量 | 余弦相似度（`<=>` 操作符） | 余弦相似度 |
| 索引类型 | ivfflat | ivfflat |

### 接入代码位置

- **检索调用**：`src/services/telegram.js` → `_processSingleMessage()` Step 3a，`Promise.all` 并行执行两路检索，失败静默降级
- **Prompt 注入**：`src/services/ai.js` → `prepareMessages()`，RAG 结果注入 System Prompt 的知识背景和历史记忆段落

---

## 7. 数据库结构

### 技术栈

| 项目 | 规格 |
|------|------|
| 数据库 | PostgreSQL 15+ |
| 向量扩展 | pgvector 0.8.x |
| 连接方式 | `pg` 模块，连接池（min 5，max 20）|
| ORM | 无（原生参数化 SQL）|

### 数据表

#### `users` — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | 内部主键 |
| `telegram_id` | BIGINT UNIQUE | Telegram 用户 ID |
| `username` | VARCHAR(100) | 用户名（可为空）|
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

#### `messages` — 消息表（核心）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | 主键 |
| `user_id` | UUID FK → users | 所属用户 |
| `role` | VARCHAR(20) | `user` / `assistant` / `system` |
| `content` | TEXT | 消息内容 |
| `embedding` | VECTOR(768) | 语义向量（可为 NULL）|
| `metadata` | JSONB | 扩展元数据 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

索引：
- `idx_messages_user_created ON messages(user_id, created_at DESC)`
- `idx_messages_embedding ON messages USING ivfflat (embedding vector_cosine_ops)`

#### `profiles` — 用户画像表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | 主键 |
| `user_id` | UUID FK → users | 所属用户 |
| `goals` | TEXT | 用户目标 |
| `status` | TEXT | 用户状态 |
| `preferences` | JSONB | 用户偏好（JSON）|

#### `knowledge_chunks` — 知识库表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | 主键 |
| `user_id` | UUID FK → users | 所属用户 |
| `content` | TEXT | 知识内容 |
| `source` | VARCHAR(255) | 来源说明 |
| `embedding` | VECTOR(768) | 语义向量 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

索引：
- `idx_knowledge_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)`

#### `sync_jobs` — 归档任务表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | 主键 |
| `job_type` | VARCHAR(50) | 任务类型（如 `notion_sync`）|
| `date_key` | DATE | 归档日期 |
| `status` | VARCHAR(20) | `pending` / `processing` / `completed` / `failed` |
| `details` | JSONB | 任务详情 |
| `completed_at` | TIMESTAMPTZ | 完成时间 |

### 数据关系图

```
users
  ├── profiles         (1:1，CASCADE DELETE)
  ├── messages         (1:N，CASCADE DELETE，含 embedding 向量)
  └── knowledge_chunks (1:N，CASCADE DELETE，含 embedding 向量)

sync_jobs              (独立表，记录归档任务状态)
```

---

## 8. Admin 管理后台

**目录**：`src/admin/`

| 路由 | 功能 |
|------|------|
| `GET /` | Dashboard 概览 |
| `GET /profiles` | 用户画像列表 |
| `PUT /profiles/:id` | 更新用户画像（字段白名单校验）|
| `GET /knowledge` | 知识库管理 |
| `POST /knowledge` | 添加知识条目 |

**认证**：JWT Bearer Token（`src/admin/middleware/auth.js`）

**安全修复（已完成）**：
- 移除管理员认证绕过漏洞
- 使用 timing-safe 字符串比较
- CORS 限制为配置的来源（非通配符）
- 字段白名单防止批量赋值（`User.update`、`Profile.update`）

---

## 9. 部署架构

### 当前架构（生产）

```
Docker Compose
  ├── app          Node.js 18（src/index.js）
  │                PORT=3000
  │                AI_PROVIDER=deepseek/claude/openai
  │
  └── postgres     pgvector/pgvector:pg16
                   数据持久化到 Docker Volume
                   密码通过环境变量注入（非硬编码）
```

### 进程管理

PM2 配置：`monitoring/ecosystem.config.js`
日志轮转：`monitoring/logrotate.conf`

### 目标架构（Phase 2，见架构升级评估报告）

```
Nginx（SSL 终止）
  │
  ├── Express Webhook 端点（POST /webhook/:token）
  │
  ├── BullMQ Producer → Redis → BullMQ Worker
  │
  └── PostgreSQL + pgvector
```

---

## 10. 目录结构

```
Affirm/
├── src/                        核心源代码
│   ├── index.js                程序入口
│   ├── config.js               多 Provider 全局配置
│   ├── health.js               健康检查端点
│   ├── config/
│   │   └── manager.js          运行时配置管理（热更新）
│   ├── db/
│   │   └── connection.js       PostgreSQL 连接池
│   ├── models/                 数据模型（原生 SQL）
│   │   ├── user.js
│   │   ├── message.js          含 embedding 自动生成 + 语义检索
│   │   ├── profile.js
│   │   └── knowledge.js        含 semanticSearch()
│   ├── services/               业务服务层
│   │   ├── telegram.js         Bot 主逻辑 + 命令处理
│   │   ├── ai.js               多 Provider AI 客户端
│   │   ├── notion.js           Notion 归档服务
│   │   └── embedding.js        向量嵌入生成
│   ├── utils/
│   │   ├── message-queue.js    用户级串行消息队列
│   │   └── error-handler.js    统一错误处理 + 自定义错误类
│   ├── admin/                  Web 管理面板（Express + EJS）
│   │   ├── server.js
│   │   ├── middleware/auth.js
│   │   ├── routes/
│   │   └── views/
│   └── notion/
│       └── config-ui.js        Notion 配置界面
│
├── docs/                       所有文档
│   ├── README.md               文档索引
│   ├── DOCUMENTATION_RULES.md  文档治理规则
│   ├── architecture/           架构文档
│   │   ├── system-architecture.md   本文档
│   │   └── 数据层API文档.md
│   ├── database/               数据库文档
│   │   └── 数据库设计.md
│   ├── project/                项目说明
│   │   └── 项目概述.md
│   └── reports/                技术报告
│       ├── Affirm 项目技术审计报告.md
│       ├── 架构升级评估报告.md
│       └── repository-refactor.md
│
├── scripts/                    自动化脚本
├── tests/                      测试代码
├── tools/                      调试诊断工具
├── docker/                     Docker 附属配置
├── monitoring/                 PM2 + 日志配置
├── migrations/                 数据库迁移（预留）
├── skills/                     OpenClaw Skill 模块
│
├── Dockerfile
├── docker-compose.yml
├── CLAUDE.md                   仓库操作规范
└── README.md
```
