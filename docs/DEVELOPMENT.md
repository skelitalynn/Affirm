# Development

## 环境与安装

标准启动顺序：

1. `cp .env.example .env`
2. `npm ci`
3. `npm run db:migrate`
4. `npm run verify`

详细环境变量说明看 [环境启动与自检](./development/01-环境启动与自检.md)。

## 启动方式

1. 主服务：`npm start`
2. 开发模式：`npm run dev`
3. Admin：`npm run admin`
4. 外部知识同步：`npm run knowledge:sync`
5. Harness 路由自检：`python3 scripts/harness/doctor.py`

## 常用命令

1. `npm run lint`
2. `npm run test:unit`
3. `npm run test:integration`
4. `npm run test:misc`
5. `npm test`
6. `python3 scripts/harness/task.py list`

## 按任务找文档

| 任务类型 | 优先阅读 |
|---|---|
| 环境起不来 / 配置异常 | [环境启动与自检](./development/01-环境启动与自检.md) |
| Telegram 对话、prompt、trace | [Telegram 对话链路](./development/02-Telegram-对话链路.md) |
| Haystack、知识导入、外部知识检索 | [Knowledge RAG](./development/03-Knowledge-RAG.md) |
| Admin 后台 | [Admin 后台](./development/04-Admin-后台.md) |
| 表结构、迁移、索引、约束 | [数据库与迁移](./development/05-数据库与迁移.md) |
| 测试、交付、验证 | [测试与交付](./development/06-测试与交付.md)、[测试与完成定义](./TESTING.md) |
| 长期记忆升级、历史召回、`memory_events` | [长期记忆升级路线](./development/07-长期记忆升级路线.md) |
| 评估、排序和治理 | [memory_events 评估排序与治理](./development/09-memory-events-评估排序与治理.md)、[AI Agent Evals 方法与落地](./development/10-AI-Agent-Evals-方法与落地.md) |

## 当前开发约定

1. 配置输入只来自 `.env -> src/config.js -> 业务模块`
2. 业务逻辑只放在 `src/`
3. 高层项目信息优先更新 `docs/` 顶层文档，不再额外维护平行项目说明
4. `scripts/harness/` 只负责任务状态、验证证据和会话交接，不替代业务脚本
5. 涉及长期记忆边界的改动，要同时检查 `profiles / memory_events / knowledge` 是否被写错层

## 推荐的下一步工程顺序

### 如果继续演进当前仓库

1. 扩充真实 transcript replay eval
2. 补 `utilization` 和 `live_ai` 回归
3. 基于失败样本做 `ranking v2`
4. 补 `memory_events` compaction / merge / 衰减治理

### 如果直接准备重建 `v3`

1. 先定义 `coaching_state`
2. 只保留 `messages / profiles / memory_events`
3. 先跑通最小召回和异步写回
4. 把外部知识、复杂 provider 兼容和重基础设施后置
