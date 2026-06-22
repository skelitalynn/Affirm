# Progress

## 当前状态

仓库当前有两个同时成立的事实：

1. `v2-min` 运行样本已经可用，`memory_events` 第一版效果闭环也已经接起来
2. 这套代码更适合作为产品和记忆模型样本，而不是继续无限堆功能的长期基座

## 最近完成

1. 把高层项目定义、产品边界和重建建议收口到 `docs/` 顶层 Harness 文档
2. 删除已经被吸收的高层重复文档，避免继续维护两套项目说明
3. 把派生表达材料从项目主路由中隔离出去
4. 保留 `skills/harness-adopter/`、`.harness/` 和 `scripts/harness/` 作为文档工作流和任务验证基座

## 当前优先级

### 如果继续维护当前仓库

1. 真实 transcript replay eval 扩样
2. `utilization` 与 `live_ai` 回归
3. `ranking v2` 优化
4. `memory_events` compaction / merge / 衰减治理

### 如果准备重建 `v3`

1. 明确 `coaching_state`
2. 用更轻的应用层重搭 `messages / profiles / memory_events`
3. 延后多 provider、复杂侧车和外围系统

## 阻塞

1. 当前没有执行层面的硬阻塞
2. 真正待决策的是方向：继续在现仓库迭代，还是以当前文档为口径启动 `v3`

## 下一步

1. 用这套顶层文档和另一个候选项目做对比
2. 决定重建范围后，再开新的真实功能项，而不是继续扩文档范围
