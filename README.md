# Affirm

Affirm 是一个基于 Telegram 的长期陪伴型 AI 显化导师项目。它的核心不是单轮回答，而是跨会话长期记忆、历史事件召回、目标跟进，以及可治理的工程闭环。

当前仓库更适合作为 `v2-min` 运行样本和重建参考，而不是下一版产品的直接长期基座。最值得保留的是 `messages / profiles / memory_events / knowledge` 的分层思路、回复后异步写回记忆、以及 `recall / write / injection / utilization / replay / degradation` 的评估意识。

## 文档入口

- [文档总入口](docs/README.md)
- [架构与产品边界](docs/ARCHITECTURE.md)
- [开发与启动](docs/DEVELOPMENT.md)
- [测试与完成定义](docs/TESTING.md)
- [当前进度](docs/PROGRESS.md)
- [关键决策](docs/DECISIONS.md)

## 快速开始

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run verify
npm start
```

需要外部知识增强时，再配置 `HAYSTACK_BASE_URL` 并执行：

```bash
npm run knowledge:sync
```

管理后台：

```bash
npm run admin
```

## 常用命令

```bash
npm start
npm run dev
npm run admin
npm run db:migrate
npm run test:unit
npm run test:integration
npm run test:misc
npm run lint
python3 scripts/harness/doctor.py
```

## 当前状态

- `v2-min` 主链路可运行：`Telegram + PostgreSQL + AI + MemoryService + Admin`
- `memory_events` 第一版效果闭环已落地：写入、hybrid retrieval、rule-based rerank、prompt 注入、基础治理、trace 与降级
- 外部知识通过 Haystack 侧车提供，未配置时主回复可降级运行
- 仓库已经把高层项目知识收口到 `docs/` 顶层 Harness 文档，避免继续维护平行说明书

## 推荐下一步

- 如果继续沿用现仓库演进：优先做真实 transcript replay eval、utilization 回归、ranking v2 和 compaction / 自动治理。
- 如果准备重建 `v3`：先保留 `messages`、`profiles`、`memory_events` 和明确的 `coaching_state`，不要在 MVP 阶段把多 provider、复杂侧车和过重编排一起继承。
