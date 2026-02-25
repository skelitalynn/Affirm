# Affirm - 显化导师Agent

基于OpenClaw + Telegram构建的长期记忆AI导师，支持向量检索、每日Notion归档和个性化配置。

## 🎯 项目概述

**Affirm** 是一个智能的"显化导师"Agent，特点包括：
- 📱 **Telegram对话入口** - 通过Bot进行自然对话
- 🧠 **长期记忆系统** - 基于pgvector的语义记忆检索
- 📅 **自动归档** - 每日对话自动保存到Notion
- ⚙️ **后台配置** - 独立界面管理用户画像和目标
- 🤖 **AI集成** - 支持多种AI模型（当前使用GPT-5.3-Codex）

## 🚀 快速开始

### 环境要求
- Node.js 18+
- PostgreSQL 15+ with pgvector
- Telegram Bot Token
- AI API密钥（支持OpenAI/Gemini等）

### 安装步骤

1. **克隆项目**
```bash
git clone git@github.com:skelitalynn/Affirm.git
cd Affirm
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑.env文件，填写你的API密钥
```

3. **安装依赖**
```bash
npm install
```

4. **初始化数据库**
```bash
# 确保PostgreSQL服务运行
sudo systemctl start postgresql

# 执行数据库初始化
PGPASSWORD=your_password psql -h localhost -U affirm_user -d affirm_db -f scripts/init-db.sql
```

5. **运行验证**
```bash
# 测试环境配置
./scripts/verify-env.js

# 测试数据库连接
./scripts/test-db-connection.js
```

6. **启动服务**
```bash
npm start
```

## 📁 项目结构

```
Affirm/
├── src/                    # 源代码
│   ├── config.js          # 配置文件
│   ├── db/                # 数据库层
│   │   └── connection.js  # 数据库连接
│   ├── api/               # API接口
│   ├── services/          # 业务逻辑
│   └── utils/             # 工具函数
├── scripts/               # 脚本文件
│   ├── init-db.sql       # 数据库初始化
│   ├── test-db-connection.js # 数据库测试
│   └── verify-env.js     # 环境验证
├── tests/                 # 测试文件
├── docs/                  # 文档
├── .env                   # 环境变量
├── .gitignore            # Git忽略配置
├── package.json          # 项目配置
└── README.md             # 本文档
```

## 🗄️ 数据库设计

### 核心表结构
1. **users** - 用户基本信息
2. **profiles** - 用户画像和目标
3. **messages** - 对话记录（含向量嵌入）
4. **knowledge_chunks** - 知识片段（含向量嵌入）
5. **sync_jobs** - 同步任务记录

### 向量检索
- 使用pgvector扩展存储768维向量
- 基于余弦相似度的语义检索
- 支持时间窗口+语义相似度混合召回

## 🔧 配置说明

### 环境变量 (.env)
```bash
# 数据库
DB_URL=postgresql://user:password@localhost:5432/dbname

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# AI模型（当前使用Codex 5.3代理）
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.ikuncode.cc/v1
MODEL_NAME=gpt-5.3-codex

# GitHub（SSH方式）
GITHUB_USERNAME=your_username
GITHUB_REPO=Affirm

# OpenClaw
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your_gateway_token

# Notion（Day 4配置）
NOTION_TOKEN=your_notion_token
NOTION_PARENT_PAGE_ID=your_page_id
```

## 🤖 AI模型集成

### 当前配置
- **模型**: GPT-5.3-Codex
- **提供商**: 通过代理服务
- **特点**: 代码能力强，适合开发场景

### 支持切换
可修改`.env`文件切换其他模型：
- OpenAI GPT系列
- Google Gemini
- 其他兼容OpenAI API的模型

## 📅 开发计划

### 7天开发计划
1. **Day 1**: 环境搭建 + 数据库 ✅
2. **Day 2**: 核心数据层
3. **Day 3**: OpenClaw集成  
4. **Day 4**: Notion集成
5. **Day 5**: 后台配置页
6. **Day 6**: 测试优化
7. **Day 7**: 部署上线

### 自动化开发
项目配置了OpenClaw自动化任务：
- **每日09:00**: 自动执行当日开发任务
- **每日19:00**: 发送进度报告到Telegram
- **自动提交**: 代码自动推送到GitHub

## 🧪 测试与验证

### 环境验证
```bash
# 验证所有环境配置
./scripts/verify-env.js

# 验证数据库连接和功能
./scripts/test-db-connection.js
```

### 单元测试
```bash
npm test
```

## 📞 问题排查

### 常见问题
1. **数据库连接失败**
   - 检查PostgreSQL服务状态
   - 验证DB_URL配置
   - 检查用户权限

2. **Telegram Bot无响应**
   - 验证Bot Token
   - 检查网络连接
   - 确认Bot已启用

3. **AI API调用失败**
   - 验证API密钥
   - 检查配额限制
   - 确认模型名称正确

### 日志查看
```bash
# 查看应用日志
tail -f logs/app.log

# 查看数据库日志
sudo tail -f /var/lib/pgsql/data/log/postgresql-*.log
```

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [OpenClaw](https://openclaw.ai) - 自动化编排框架
- [pgvector](https://github.com/pgvector/pgvector) - PostgreSQL向量扩展
- [Telegram Bot API](https://core.telegram.org/bots/api) - 消息平台

---

**项目状态**: Day 1 ✅ 完成 | 总体进度: 14.3%

**最新更新**: 2026-02-25  
**维护者**: 小苹果 🍎