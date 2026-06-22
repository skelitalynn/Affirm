# Decisions

记录当前项目、文档体系和后续重建直接相关的重要决策。

| Date | Decision | Reason | Status |
|---|---|---|---|
| 2026-06-22 | 以 `docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md`、`docs/TESTING.md`、`docs/PROGRESS.md`、`docs/DECISIONS.md` 作为唯一高层项目知识源 | 高层项目说明如果继续散落在多个子目录，会持续制造第二套知识库 | accepted |
| 2026-06-22 | 删除旧专题目录，把必要内容合并进顶层 Harness 文档 | 用户明确反馈文档太多，AI 和人都不容易判断哪个是准确信息源 | accepted |
| 2026-06-22 | 将派生表达材料隔离出项目主路由 | 这类材料是对项目的外部表达，不是项目本身；继续混在主入口里会污染项目口径 | accepted |
| 2026-06-22 | 删除已被吸收的高层重复文档，而不是保留“旧版备份” | 用户明确要求迁移后消除双知识源，后续历史应靠 Git 追溯 | accepted |
| 2026-06-22 | 保留 `messages / profiles / memory_events / knowledge` 的分层，不把用户记忆和外部知识混在一起 | 这是当前产品内核最清晰、也最可迁移的边界 | accepted |
| 2026-06-22 | 长期记忆整理继续采用回复后异步写回 | 把记忆整理塞进主回复同步链路会拖慢体验，也让故障耦合更重 | accepted |
| 2026-06-22 | 若重建 `v3`，优先继承产品边界和数据模型，不原样继承当前偏重的应用层编排 | 当前仓库更像运行样本和方法论样本，不适合作为下一代产品的直接底座 | accepted |
| 2026-06-22 | Knowledge RAG 默认选型改为 PostgreSQL + pgvector，关键词检索作为 fallback，移除 Haystack sidecar | 当前知识库约 300 篇，独立 RAG pipeline 的部署和同步成本高于收益；同库检索更容易维护、观测和验证 | accepted |
