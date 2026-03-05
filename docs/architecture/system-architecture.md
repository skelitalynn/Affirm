# Affirm 系统架构文档

> 生成日期：2026-03-05

---

## 1. 系统整体架构

Affirm 是一个基于 Telegram Bot 的 AI 显化导师助手，采用 Node.js 构建，支持多 AI Provider，并集成 PostgreSQL 向量数据库和 Notion 归档。

```
┌─────────────────────────────────────────────────┐
│                   用户 (Telegram)                │
└───────────────────────┬─────────────────────────┘
                        │ 消息
                        ▼
┌─────────────────────────────────────────────────┐
│              Telegram Bot API (Polling)          │
│              node-telegram-bot-api               │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│                TelegramService                   │
│  ┌──────────────┐   ┌──────────────────────┐    │
│  │ MessageQueue │   │   Command Handlers   │    │
│  │ (并发控制)    │   │ /start /help /clear  │    │
│  └──────┬───────┘   │ /history /archive    │    │
│         │           └──────────────────────┘    │
└─────────┼───────────────────────────────────────┘
          │
    ┌─────┴──────────────────┐
    │                        │
    ▼                        ▼
┌──────────┐         ┌──────────────┐
│AIService │         │NotionService │
│(OpenAI   │         │(归档对话)     │
│compat)   │         └──────────────┘
└────┬─────┘
     │
     ▼
┌──────────────────────────────┐
│    AI Provider (可配置)       │
│  - DeepSeek (默认)            │
│  - Claude (via proxy)        │
│  - OpenAI                    │
└──────────────────────────────┘

┌──────────────────────────────┐
│   PostgreSQL + pgvector      │
│  - users                     │
│  - messages (+ embedding)    │
│  - profiles                  │
│  - knowledge                 │
└──────────────────────────────┘
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
      ├─► sendChatAction('typing')  // 立即响应，无需等待
      │
      ▼
MessageQueue.enqueue(userId, processFn)
      │
      ▼ (串行执行，同一用户的消息按序处理)
_processSingleMessage()
      │
      ├─► ensureUser()          // 创建或查找用户
      ├─► Message.create()      // 保存用户消息 + 生成 embedding
      ├─► Message.getRecent()   // 获取上下文 (最近20条)
      ├─► AIService.generate()  // 调用 AI 生成回复
      ├─► Message.create()      // 保存 AI 回复
      └─► bot.sendMessage()     // 发送回复
```

### 命令列表

| 命令 | 功能 |
|------|------|
| `/start` | 欢迎用户，创建用户记录 |
| `/help` | 显示帮助信息 |
| `/history` | 查看最近对话（可配置条数）|
| `/clear` | 清除对话历史 |
| `/archive_now` | 手动归档今日对话到 Notion |

---

## 3. AI Provider 结构

### 多提供商配置（src/config.js）

通过环境变量 `AI_PROVIDER` 选择提供商，支持：

| Provider | API Key 变量 | Base URL | 默认模型 |
|----------|-------------|----------|---------|
| `deepseek` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-reasoner` |
| `claude` | `CLAUDE_API_KEY` | `https://api.aigocode.com/v1` | `claude-sonnet-4-6` |
| `openai` | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4` |

所有 Provider 均使用 OpenAI 兼容 SDK（`openai` npm 包），无需为每个提供商编写独立客户端。

### AIService 核心逻辑（src/services/ai.js）

```
AIService
  ├── initialize()        // 初始化客户端，测试连接
  ├── generateResponse()  // 生成 AI 回复
  ├── prepareMessages()   // 组装 system + history + user 消息
  └── testConnection()    // 连接测试
```

系统提示（System Prompt）定位：显化导师角色，温暖鼓励语气，协助目标转化和肯定语生成。

---

## 4. MessageQueue 工作流程

文件：`src/utils/message-queue.js`

```
MessageQueue (singleton)
  │
  ├── userQueues: Map<userId, Queue>
  │     每个用户独立队列，保证串行处理
  │
  ├── enqueue(userId, processFn, context)
  │     将任务加入队列，返回 Promise
  │
  ├── 超时控制: 30秒 (defaultTimeout)
  │
  └── 统计监控
        ├── totalProcessed  // 累计处理数
        ├── activeQueues    // 当前活跃队列数
        ├── maxQueueSize    // 历史最大队列深度
        └── timeouts        // 超时次数
```

**设计目标**：防止同一用户并发消息竞争，确保 AI 上下文连贯性。

---

## 5. Vector Memory 设计

文件：`src/services/embedding.js`，`src/models/message.js`

### 向量生成

- 维度：768（与数据库 `vector(768)` 列匹配）
- DeepSeek 提供商：`text-embedding` 模型
- OpenAI 提供商：`text-embedding-3-small` 模型
- 失败降级：embedding 为 NULL（消息仍存储，语义检索禁用）

### 消息存储流程

```
Message.create(content)
  │
  ├── EmbeddingService.generateEmbedding(content)
  │     └── 返回 float[] 向量
  │
  ├── toSql(embedding)  // pgvector 格式转换
  │
  └── INSERT INTO messages (user_id, role, content, embedding, metadata)
```

### 语义检索（预留）

数据库 `messages.embedding` 列支持 pgvector 的 `<=>` 余弦相似度查询，为未来的语义记忆检索功能预留。

---

## 6. 数据库结构

### 技术栈

- PostgreSQL 16 + pgvector 扩展
- 连接：`pg`（pg-promise 风格），连接池 5~20
- ORM：无（原生 SQL）

### 主要数据表

#### `users` 表
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `telegram_id` | BIGINT | Telegram 用户 ID（唯一） |
| `username` | VARCHAR | 用户名 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

#### `messages` 表
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `user_id` | UUID | 外键 → users |
| `role` | VARCHAR | `user` / `assistant` |
| `content` | TEXT | 消息内容 |
| `embedding` | vector(768) | 语义向量（可为 NULL）|
| `metadata` | JSONB | 扩展元数据 |
| `created_at` | TIMESTAMP | 创建时间 |

#### `profiles` 表
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `user_id` | UUID | 外键 → users |
| `system_prompt` | TEXT | 自定义系统提示 |
| `preferences` | JSONB | 用户偏好设置 |

#### `knowledge` 表
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `title` | VARCHAR | 知识条目标题 |
| `content` | TEXT | 内容 |
| `embedding` | vector(768) | 语义向量 |
| `tags` | TEXT[] | 标签数组 |

### 初始化脚本

`scripts/database/schemas/init.sql` — 包含所有表创建语句和 pgvector 扩展启用。

---

## 7. Admin 管理面板

`src/admin/` 提供 Express + EJS 的 Web 管理界面：

```
/admin
  ├── GET  /             → dashboard.ejs  // 概览
  ├── GET  /profiles     → 用户 Profile 列表
  ├── PUT  /profiles/:id → 更新 Profile
  ├── GET  /knowledge    → 知识库管理
  └── POST /knowledge    → 添加知识条目

认证：JWT Bearer Token（src/admin/middleware/auth.js）
```

---

## 8. 目录结构总览

```
Affirm/
├── src/                    # 核心源代码
│   ├── index.js            # 程序入口
│   ├── config.js           # 全局配置（多 Provider）
│   ├── health.js           # 健康检查端点
│   ├── config/
│   │   └── manager.js      # 运行时配置管理
│   ├── db/
│   │   └── connection.js   # 数据库连接池
│   ├── models/             # 数据模型层
│   │   ├── user.js
│   │   ├── message.js      # 含 embedding 自动生成
│   │   ├── profile.js
│   │   └── knowledge.js
│   ├── services/           # 业务服务层
│   │   ├── telegram.js     # Bot 主逻辑
│   │   ├── ai.js           # 多 Provider AI 客户端
│   │   ├── notion.js       # Notion 归档
│   │   └── embedding.js    # 向量嵌入生成
│   ├── utils/
│   │   ├── message-queue.js # 并发控制队列
│   │   └── error-handler.js # 统一错误处理
│   ├── admin/              # Web 管理面板
│   │   ├── server.js
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── views/          # EJS 模板
│   │   └── static/
│   └── notion/
│       └── config-ui.js    # Notion 配置 UI
│
├── docs/                   # 所有文档
│   ├── architecture/       # 架构文档
│   ├── database/           # 数据库文档
│   ├── development/        # 开发计划
│   ├── project/            # 项目说明
│   └── reports/            # 开发报告、审计
│
├── scripts/                # 自动化脚本
│   ├── deploy.sh
│   ├── backup.sh
│   ├── database/           # DB Schema
│   └── development/        # 每日开发任务脚本
│
├── tests/                  # 测试代码
│   ├── unit/
│   └── notion-integration.test.js
│
├── tools/                  # 调试和诊断工具
│   ├── diagnose-claude-api.js
│   ├── test-ai-connection.js
│   └── fix-*.js / fix-*.sh
│
├── docker/                 # Docker 配置
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── monitoring/             # 监控配置
│   ├── ecosystem.config.js # PM2 配置
│   └── logrotate.conf
│
├── skills/                 # OpenClaw Skill 模块
│   ├── affirm/
│   └── notion/
│
├── migrations/             # 数据库迁移（预留）
│
├── Dockerfile              # 生产 Docker 镜像
├── docker-compose.yml      # 服务编排
├── package.json
└── README.md
```
