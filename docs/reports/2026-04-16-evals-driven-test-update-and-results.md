# 2026-04-16 Evals-Driven 测试补强与结果报告

## 1. 本次目标

本轮工作不是单纯“补几个断言”，而是按照 `docs/development/10-AI-Agent-Evals-方法与落地.md` 的思路，把测试补到更贴近真实 agent 风险的位置：

1. 不只测函数返回值
2. 要测 retrieval 是否可解释
3. 要测 prompt 注入是否可追踪
4. 要测 memory 写入和 embedding 降级是否稳
5. 要测失败时系统是否走可接受的 degrade 路径

## 2. 本次补强内容

### 2.1 Retrieval 与 rerank

补强文件：

1. `tests/unit/services/memory-retrieval-service.test.js`

新增覆盖点：

1. `getStatus()` 是否暴露 `embedding` 状态和 `rankingVersion`
2. `searchRelevantEvents()` 是否执行 `embedding -> hybrid search -> rule-based rerank`
3. `rerankEvents()` 是否按业务权重排序并去重重复事件
4. `embedding` 失败时是否退回关键词检索
5. `markManyRecalled()` 失败时是否不阻塞主结果
6. `searchHybrid()` 失败时是否降级为空结果

对应 eval 思路：

1. 长期记忆召回质量
2. 排序策略是否真的改变 top 结果
3. 降级后是否仍保持主链路可用

### 2.2 Prompt 注入与 trace

补强文件：

1. `tests/unit/services/conversation-trace.test.js`

新增覆盖点：

1. 没有显式 `recalledMemoryBlock` 时，`recalled_memory_in_prompt` 仍应正确记录
2. `context` 显式传入的 `memoryRankingVersion / memoryRetrievalStrategy` 应覆盖默认 trace 统计

对应 eval 思路：

1. recalled memory 是否真的进入 prompt
2. prompt 注入是否可被追踪和复盘

### 2.3 Memory 写入正确性

补强文件：

1. `tests/unit/services/memory-event-service.test.js`
2. `tests/unit/services/memory-service.test.js`

新增覆盖点：

1. `source_message_ids` 优先级和 `metadata` 合并
2. 旧版 `generateMemoryPatch()` 接口兼容回退
3. `memory` 开关关闭时直接短路
4. `memory_event` 写入失败时 profile 更新仍可完成

对应 eval 思路：

1. 该写入的记忆是否被写入
2. 写入失败时是否可局部失败、不拖垮整条链路

### 2.4 Embedding provider 与降级可靠性

新增文件：

1. `tests/unit/services/memory-embedding-service.test.js`

新增覆盖点：

1. 未配置远程 embedding 时是否退回 deterministic 模式
2. 远程鉴权失败时是否自动降级为 deterministic 向量

对应 eval 思路：

1. 运行可靠性与降级质量
2. 外部 provider 不稳定时系统是否仍可持续服务

## 3. 为测试稳定性做的配套处理

涉及文件：

1. `tests/env.setup.js`
2. `tests/setup.js`
3. `tests/jest.globalTeardown.js`
4. `src/config.js`
5. `src/db/connection.js`
6. `package.json`

本次处理重点：

1. Jest 统一加载 `.env`，并强制测试环境为 `NODE_ENV=test`
2. 测试结束后显式关闭 DB pool，减少连接残留
3. 测试环境下缩小 pg pool 配置，降低多 suite 之间的资源竞争
4. 将 `unit / integration / misc / coverage` 分拆为明确命令，便于稳定执行和定位失败点

## 4. 实际执行命令与结果

### 4.1 数据库迁移

执行命令：

```bash
npm run db:migrate
```

结果：

1. 通过
2. `20260415_create_memory_events.sql` 与 `20260416_add_memory_event_governance.sql` 已处于已迁移状态

### 4.2 Unit Tests

执行命令：

```bash
npm run test:unit
```

结果：

1. `Test Suites: 10 passed, 10 total`
2. `Tests: 43 passed, 43 total`
3. 通过

### 4.3 Integration Tests

执行命令：

```bash
npm run test:integration
```

结果：

1. `Test Suites: 4 passed, 4 total`
2. `Tests: 41 passed, 41 total`
3. 通过

### 4.4 Misc Tests

执行命令：

```bash
npm run test:misc
```

结果：

1. `Test Suites: 1 passed, 1 total`
2. `Tests: 5 passed, 5 total`
3. 通过

### 4.5 Coverage

执行命令：

```bash
npm run test:coverage
```

结果：

1. `Test Suites: 10 passed, 10 total`
2. `Tests: 43 passed, 43 total`
3. 全局覆盖率：
4. `Statements: 31.45%`
5. `Branches: 55.76%`
6. `Functions: 64.86%`
7. `Lines: 31.45%`

## 5. 结果解读

这次补强后，可以更有把握地说：

1. `memory_events` 的召回、排序、降级、trace 注入和写入兼容性，已经不再只靠人工感觉判断
2. 关键失败模式已经有自动化回归保护，包括：
3. embedding 不可用
4. recall 计数更新失败
5. 检索层失败降级为空结果
6. memory 写入局部失败
7. 旧接口回退兼容

但也要明确：

1. 当前自动化已经覆盖 retrieval correctness、memory write、prompt injection、fixture-based utilization 和 fixture-based replay
2. 当前缺的不是“有没有这些 eval”，而是“真实 transcript 样本是否足够、`live_ai` 利用质量是否已纳入稳定回归”
3. 下一阶段重点应转向样本扩充、失败案例沉淀和发布门禁

## 6. 当前环境中的已知问题

### 6.1 `npm test` 聚合执行在当前 Codex 沙箱里仍不稳定

执行：

```bash
npm test
```

现象：

1. `unit` 段能通过
2. 进入 `integration` 后，第一条真实 DB 查询就可能报 `AggregateError`
3. 单独执行 `npm run test:integration` 又可以通过

当前判断：

1. 这是“同一个命令会话里的多段测试串行执行”问题
2. 不是 integration 断言本身错误
3. 当前最稳定的验证方式仍是分开执行：
4. `npm run db:migrate`
5. `npm run test:unit`
6. `npm run test:integration`
7. `npm run test:misc`

### 6.2 Eval 命令在当前沙箱里也有同类问题

执行：

```bash
node tools/evaluate-memory-recall.js --fixture=baseline
```

现象：

1. 当前命令在本次 Codex 沙箱中触发了 `EPERM`
2. 症状与上面的“单命令会话 DB 异常”高度一致

这意味着：

1. 这次文档记录的“真实通过结果”以分项测试命令为准
2. retrieval eval 工具本身没有被本轮重构，但在当前沙箱里未能稳定重跑

## 7. 问题详细解释与处理建议

### 7.0 先澄清一个容易混淆的点

这里说的“Codex 沙箱”不是指“另一台机器”。

当前情况更准确的描述是：

1. 项目确实部署在这台云服务器上
2. 但我在会话里执行命令时，不是直接拿你的交互式 SSH shell 裸跑
3. 而是在这台机器上的一个受限执行上下文里跑

所以：

1. 它和你手动 SSH 登录到这台服务器后执行命令，物理机器是同一台
2. 但进程权限、网络访问方式、命令会话生命周期，不一定完全一样

这也是为什么会出现这种现象：

1. 同样是这台服务器
2. 但“我在当前会话里串行跑多段测试”会出错
3. 你手动在服务器 shell 里分开跑，或者重新开一个命令跑，可能又是正常的

后面文档里提到的“沙箱限制”，都应该理解成：

1. 这是当前 AI 代理命令执行上下文的限制
2. 不是在说你的项目跑在别的机器上
3. 也不是在否认这就是你的线上云服务器

### 7.1 `npm test` 里的 `AggregateError` 到底是什么

这个错误不是“某条断言写错了”，也不是 `admin-routes.test.js`、`user.test.js`、`profile.test.js` 这些集成测试本身逻辑坏了。

更准确地说，它是：

1. 进入 `integration` 阶段后的第一条真实数据库查询就失败了
2. 失败位置在 `src/db/connection.js` 的 `pool.query()`
3. 失败发生在测试准备阶段，而不是业务断言阶段
4. 同一批 integration tests 单独执行时可以通过

这四点说明：

1. 测试代码本身不是主要矛盾
2. 问题更像是“测试进程切换时的数据库连接环境不稳定”
3. 它更接近运行环境问题，而不是功能回归

### 7.2 为什么会出现这个问题

基于这次实际复现结果，当前最合理的判断是：

1. 在 Codex 当前沙箱里，把多个依赖数据库的 Jest 进程串在同一个命令会话里执行时，第二段进程的数据库访问不稳定
2. 这种不稳定不是持续存在的，因为独立重新开一个命令再跑 `npm run test:integration` 又恢复正常

这类现象常见的成因通常有三类：

1. 上一段测试进程退出后，数据库连接或本地 socket 还没完全释放
2. `localhost` 在 Node/pg 下可能同时尝试 `::1` 和 `127.0.0.1`，在受限环境里容易表现成空消息的 `AggregateError`
3. 沙箱对“同一命令会话里的后续本地网络访问”比“新开一次命令”更严格

当前更偏向第 2 和第 3 类，因为：

1. 报错集中出现在“新进程刚开始访问 DB”的第一条查询
2. 不是某张表偶发失败，而是整批 integration tests 的第一跳都失败
3. 一旦重新开一个独立命令，数据库访问又恢复
4. 当前实际 `DB_URL` 解析结果就是 `localhost:5432/affirm_db`

### 7.3 这个问题应该怎么处理

短期处理方式：

1. 在当前 Codex 沙箱里，不要把 `unit + integration + misc` 合并成一个“单命令闭环”来判断是否通过
2. 使用已经验证稳定的顺序：
3. `npm run db:migrate`
4. `npm run test:unit`
5. `npm run test:integration`
6. `npm run test:misc`

中期处理方式：

1. 在你自己的宿主机终端或 CI 环境里，再验证一次 `npm test`
2. 如果宿主机里 `npm test` 正常，而 Codex 沙箱里失败，就把它明确记为“沙箱限制”，不要误判为仓库缺陷
3. 如果宿主机里也失败，再继续排查数据库连接链路，而不是继续怀疑测试断言

工程上建议优先做的检查：

1. 把 `.env` 里的 `DB_URL` 主机从 `localhost` 改为 `127.0.0.1` 后再试一次
2. 确认 PostgreSQL 正在监听 IPv4，本机可直接连接
3. 确认数据库没有被 `max_connections` 或本地权限限制打满
4. 在 CI 里把测试拆成独立步骤，而不是强依赖一个聚合命令

如果你想继续深挖，建议检查：

1. PostgreSQL 日志里对应时间点有没有拒绝连接
2. `pg_stat_activity` 里是否有大量残留连接
3. `SHOW listen_addresses;` 是否包含当前测试实际使用的地址

### 7.4 `evaluate-memory-recall.js` 的 `EPERM` 是什么

这里的 `EPERM` 也不是“评估逻辑算错了”，而是命令在当前沙箱里执行真实数据库写入时被拒绝了。

从这次输出看，失败发生在：

1. `INSERT INTO users`
2. 也就是 eval fixture 初始化的第一步

这说明：

1. 评估脚本还没进入真正的 retrieval 指标计算
2. 它先死在了测试样本入库阶段
3. 所以这个失败不能被解读为“召回质量不行”

### 7.5 这个 `EPERM` 应该怎么处理

短期处理方式：

1. 在当前 Codex 沙箱里，不把这次 `EPERM` 当成代码回归
2. 直接在你的宿主机终端里执行：

```bash
npm run db:migrate
node tools/evaluate-memory-recall.js --fixture=baseline
```

如果宿主机仍失败，再继续看这几项：

1. `DB_URL` 对应的数据库用户是否有 `users / memory_events / messages` 的读写权限
2. 迁移是否已经全部执行
3. `DB_URL` 是否同样用了 `localhost`，可以改成 `127.0.0.1` 再验证
4. 本地数据库是否允许当前用户创建、删除和清理 fixture 数据

### 7.6 `HAYSTACK_BASE_URL` 缺失是不是问题

这是信息提示，不是这轮测试失败的主因。

它的含义是：

1. 当前没有配置 Haystack 侧车知识检索
2. knowledge RAG 会自动降级为空结果
3. 这不会阻塞 memory_events 的 unit 和 integration tests

如果你现在不打算启用 Haystack，可以先忽略。

如果你要验证真实 knowledge RAG：

1. 需要补齐 `HAYSTACK_BASE_URL`
2. 确认对应接口健康
3. 再补充一轮针对 knowledge retrieval 的 integration/eval

### 7.7 测试里出现的 embedding 降级 warning 是什么

这类 warning 里有两种情况，要区分：

第一种是“测试故意 mock 出来的失败”：

1. 比如单测里故意让 embedding 鉴权失败
2. 用来验证系统是否能自动退回 deterministic 模式
3. 这是预期行为，不是线上事故

第二种是“真实环境配置缺失或不可用”：

1. 例如 `.env` 里的 embedding provider 404、401 或配置为空
2. 这会让真实召回退回关键词链路或 deterministic 向量
3. 这会影响你观察真实向量召回效果

怎么处理：

1. 如果你只是跑单测，这些 warning 不需要处理
2. 如果你要跑真实 retrieval eval，就需要把 embedding provider 配置修好

## 8. 推荐执行方式

在当前阶段，推荐你把“测试是否通过”和“评估是否有效”拆成两类命令。

### 8.1 稳定验证命令

```bash
npm run db:migrate
npm run test:unit
npm run test:integration
npm run test:misc
npm run test:coverage
```

这一组命令解决的是：

1. 系统有没有坏
2. 关键链路有没有回归

### 8.2 评估命令

```bash
node tools/evaluate-memory-recall.js --fixture=baseline
```

这一组命令解决的是：

1. retrieval 排序效果好不好
2. rerank 是否真的改进了 top 结果
3. user isolation 是否被破坏

当前建议是：

1. 在 Codex 沙箱里，以“分项测试命令通过”为准
2. 在你的宿主机里，再补跑 retrieval eval
3. 如果宿主机里 eval 能通过，再把那组指标回填到新的测试结果文档里

## 9. 当前结论

截至 `2026-04-16`，本轮可以确认：

1. 评估驱动的测试补强已经落地
2. 新增测试覆盖了 retrieval、prompt trace、memory 写入与 embedding degrade 这几条高风险链路
3. `db:migrate`、`test:unit`、`test:integration`、`test:misc`、`test:coverage` 都已单独验证通过
4. 当前仍需后续继续补的是“真实 transcript 扩样、`live_ai` 利用质量评估和发布门禁”

## 10. 继续推进更新（2026-04-16）

在本报告写完后，又继续补做了一轮真实执行验证。

### 10.1 新增确认

本轮确认以下 eval 已经不是“文档计划”，而是可执行基线：

1. `npm run eval:memory:recall`
2. `npm run eval:memory:write`
3. `npm run eval:memory:injection`
4. `npm run eval:memory:utilization`
5. `npm run eval:conversation:replay`
6. `npm run eval:degradation`

### 10.2 实测结果

在可访问本地 PostgreSQL 的环境下，本轮实测结果为：

1. `memory recall eval` 通过
   - `expected_hit_rate@k = 1`
   - `top1_hit_rate = 1`
   - `precision@k = 0.4`
   - `user_isolation_pass_rate = 1`
2. `memory write eval` 通过
   - `overall_pass_rate = 100%`
3. `memory injection eval` 通过
   - `overall_pass_rate = 100%`
4. `memory utilization eval` 通过
   - `overall_pass_rate = 100%`
5. `conversation replay eval` 通过
   - `overall_pass_rate = 100%`
6. `degradation eval` 通过
   - `overall_pass_rate = 100%`

### 10.3 本轮顺手修复

在执行 `memory write eval` 时发现一个真实 SQL bug：

1. `src/models/memory-event.js` 的 `findByUserId()` 在 `LEFT JOIN` 后仍使用未带表别名的 `user_id`
2. 在真实数据库里会报 `column reference "user_id" is ambiguous`
3. 已修复为显式使用 `me.user_id / me.event_type / me.status / me.review_status`
4. 并新增 `tests/integration/models/memory-event.test.js` 做真实 DB 回归保护

### 10.4 相关测试

本轮额外验证：

1. `npm run test:unit` 通过，`43 / 43`
2. `npm run test:integration` 通过，`42 / 42`

### 10.5 环境结论

需要单独记录的一点是：

1. 依赖本地 PostgreSQL 的 eval 在当前 Codex 沙箱内可能直接报 `EPERM`
2. 这不是 eval 实现本身失败
3. 在脱离沙箱后，上述 DB-backed eval 已验证通过
