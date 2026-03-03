# Affirm - 显化导师Agent

基于OpenClaw + Telegram构建的长期记忆AI导师，支持向量检索和每日自动归档。

## 🚀 快速开始

### 1. 环境准备
```bash
# 克隆项目
git clone git@github.com:skelitalynn/Affirm.git
cd Affirm

# 配置环境变量
cp .env.example .env
# 编辑.env文件，填写你的API密钥

# 安装依赖
npm install
```

### 2. 数据库初始化
```bash
# 确保PostgreSQL运行
sudo systemctl start postgresql

# 初始化数据库
psql -f scripts/database/schemas/init.sql
```

### 3. 验证环境
```bash
# 快速验证
./scripts/utils/quick-verify.sh

# 详细验证
node scripts/utils/verify-environment.js
```

### 4. 启动开发
```bash
# 查看开发计划
cat docs/development/开发计划.md

# 运行Day 1任务（示例）
./scripts/development/day1-tasks.sh
```

## 📁 项目结构

```
Affirm/
├── docs/                    # 项目文档
│   ├── project/            # 项目概述和架构
│   ├── development/        # 开发计划和指南
│   └── reports/            # 进度报告和总结
├── scripts/                # 工具脚本
│   ├── development/        # 开发自动化脚本
│   ├── database/           # 数据库脚本
│   └── utils/              # 工具和验证脚本
├── src/                    # 源代码
│   ├── config.js          # 配置管理
│   └── db/connection.js   # 数据库连接
├── tests/                  # 测试代码（预留）
├── .env                   # 环境变量配置
├── .gitignore            # Git忽略配置
├── package.json          # 项目依赖配置
└── README.md             # 本文件
```

## 📚 文档目录

### 项目文档 (`docs/project/`)
- `项目概述.md` - 完整项目说明、架构、技术栈
- `数据库设计.md` - 数据库表结构和关系

### 开发文档 (`docs/development/`)
- `开发计划.md` - 7天详细开发计划
- `开发指南.md` - 编码规范和最佳实践

### 报告文档 (`docs/reports/`)
- `day1-complete.md` - Day 1完成报告
- 后续每日报告将在此目录生成

## 🔧 工具脚本

### 开发脚本 (`scripts/development/`)
- `daily-development.sh` - 每日自动化开发脚本
- `day1-tasks.sh` - Day 1具体任务脚本
- 后续每日任务脚本将在此目录

### 数据库脚本 (`scripts/database/`)
- `schemas/init.sql` - 数据库初始化脚本
- `migrations/` - 数据库迁移脚本（预留）

### 工具脚本 (`scripts/utils/`)
- `quick-verify.sh` - 快速环境验证
- `verify-environment.js` - 完整环境验证
- `test-database.js` - 数据库连接测试

## ⚙️ 配置说明

### 必需配置 (.env)
```bash
# 数据库
DB_URL=postgresql://user:password@localhost:5432/dbname

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# AI模型
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.ikuncode.cc/v1
MODEL_NAME=gpt-5.3-codex

# GitHub
GITHUB_USERNAME=your_username
GITHUB_REPO=Affirm
```

完整配置说明见 `docs/project/项目概述.md`

## 📅 开发计划

### 7天自动化开发
- **Day 1**: 环境搭建 + 数据库 ✅ 完成
- **Day 2**: 核心数据层 (2026-02-26)
- **Day 3**: OpenClaw集成 (2026-02-27)
- **Day 4**: Notion集成 (2026-02-28)
- **Day 5**: 后台配置页 (2026-03-01)
- **Day 6**: 测试优化 (2026-03-02)
- **Day 7**: 部署上线 (2026-03-03)

每日09:00自动执行开发任务，19:00发送进度报告。

## 🆘 支持与帮助

### 常见问题
1. **数据库连接失败**: 运行 `./scripts/utils/quick-verify.sh`
2. **环境配置问题**: 查看 `docs/project/项目概述.md`
3. **开发流程问题**: 查看 `docs/development/开发计划.md`

### 获取帮助
- 查看详细文档: `docs/` 目录
- 运行验证脚本: `scripts/utils/` 目录
- 检查进度报告: `docs/reports/` 目录

## 📄 许可证

MIT License - 详见 LICENSE 文件
