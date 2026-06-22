# Testing and Completion Definition

## 验证层级

建议按下面的层级运行，而不是只靠主观判断“应该没问题”：

1. Harness 结构检查：`python3 scripts/harness/doctor.py`
2. 静态检查：`npm run lint`
3. 单元测试：`npm run test:unit`
4. 集成测试：`npm run test:integration`
5. 其他仓库级测试：`npm run test:misc`
6. Memory eval：`npm run eval:memory:recall`、`npm run eval:memory:write`、`npm run eval:memory:injection`、`npm run eval:memory:utilization`、`npm run eval:conversation:replay`、`npm run eval:degradation`
7. 特定任务验证：由 `docs/FEATURES.json` 中每个功能项的 `verification` 定义

`npm test` 是聚合命令，但在受限环境里分项执行更稳定。

## 什么时候跑什么

### 只改文档或 Harness 路由

至少跑：

1. `python3 scripts/harness/doctor.py`
2. 当前功能项的 `task.py verify`

### 改 Telegram、记忆主链路或模型编排

至少跑：

1. `npm run lint`
2. `npm run test:unit`
3. 相关 integration tests
4. 至少一组相关 memory eval

### 改数据库、Admin 或外部知识

至少跑：

1. `npm run db:migrate`
2. `npm run test:integration`
3. 必要时补 `npm run test:misc`

## 当前仓库的完成定义

一次任务可以算完成，至少要同时满足：

1. 相关代码或文档已经落地
2. 高层边界变化已经同步到 `docs/` 顶层文档
3. 没有制造新的平行知识源或错误职责分层
4. `docs/FEATURES.json` 对应功能项有可执行验证
5. 验证证据已经写入 `.harness/evidence/`

## 当前已知现实

1. 当前仓库已经不只是“能跑”，而是对 retrieval、rerank、trace、embedding fallback 和 governance 有自动化保护
2. `replay / utilization` 已有 baseline，但真实 transcript 覆盖还不够
3. 文档任务也要有验证证据，不能只以“文件改了”作为完成标准
