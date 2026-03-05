# Affirm Repository Rules

> 本文件定义仓库规范，Claude Code 和所有开发者必须遵守。

---

## 文档规范

### 规则 1：所有文档必须写入 `docs/` 目录

禁止在项目根目录创建 Markdown 文件（`.md`）。

唯一允许留在根目录的 Markdown 文件：
- `README.md`
- `CLAUDE.md`

### 规则 2：AI 不允许在 root 创建 markdown 文件

AI 自动生成的任何文档、报告、分析，必须写入对应的 `docs/` 子目录。

### 规则 3：文档必须按类型分类存放

| 文档类型 | 目标目录 |
|---------|---------|
| 架构设计、技术方案 | `docs/architecture/` |
| 开发日志、进度报告、审计 | `docs/reports/` |
| 数据库设计、ER 图 | `docs/database/` |
| 项目概述、需求说明 | `docs/project/` |
| 开发计划、技术路线 | `docs/development/` |

---

## 文件命名规范

### 规则 4：禁止创建备份文件

以下命名模式的文件不允许提交到版本库：

- `*.backup`
- `*-old.js`
- `*.backup2`
- `*.bak`
- `*.swp`
- `*.tmp`

如需保留历史版本，使用 Git 分支或 `git stash`，不要创建备份副本。

### 规则 5：诊断和调试脚本放入 `tools/`

临时性的测试连接、诊断、修复脚本放入 `tools/` 目录，不能散落在根目录。

---

## 代码规范

### 规则 6：根目录只允许保留以下文件

```
README.md
CLAUDE.md
package.json
package-lock.json
Dockerfile
docker-compose.yml
.env.example
.gitignore
.dockerignore
```

其余文件必须放入对应目录：
- 源代码 → `src/`
- 文档 → `docs/`
- 脚本 → `scripts/`
- 测试 → `tests/`
- 工具 → `tools/`
- Docker 相关 → `docker/`（根目录 Dockerfile 除外）

### 规则 7：环境变量文件规范

- `.env` — 本地开发（gitignored）
- `.env.example` — 模板（提交到版本库，不含真实密钥）
- `.env.production` — 生产环境（gitignored，不提交）

---

## AI 操作规范

### 规则 8：AI 生成代码前必须先读取相关文件

在修改任何文件前，必须先用 Read 工具读取文件内容，理解现有实现后再进行修改。

### 规则 9：禁止在 src/ 以外创建业务逻辑文件

所有核心业务逻辑文件必须位于 `src/` 目录结构内。

---

## Git 规范

- 提交前检查：不提交 `.env`、真实密钥、`*.backup` 文件
- 分支命名：`feature/xxx`、`fix/xxx`、`docs/xxx`
- commit message 使用英文或中文，遵循 conventional commits 格式

---

## 目录结构速查

```
Affirm/
├── src/           # 核心源代码（唯一业务逻辑存放处）
├── docs/          # 所有文档（按子目录分类）
├── scripts/       # 自动化脚本
├── tests/         # 测试代码
├── tools/         # 调试诊断工具
├── docker/        # Docker 附属配置
├── monitoring/    # 监控配置
├── migrations/    # 数据库迁移
└── skills/        # OpenClaw Skill 模块
```
