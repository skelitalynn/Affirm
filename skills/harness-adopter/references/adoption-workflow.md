# Harness 增量接入工作流

## 目标

本 Skill 面向已经有代码、测试、CI 与文档沉淀的项目。接入的目标不是替换原有工程规范，而是把现有知识转成 Agent 可稳定发现、可执行验证、可跨会话交接的工作控制面。

## 文档路由优先级

按以下顺序寻找知识入口：

1. `docs/README.md`（大小写不敏感）作为首选文档路由。
2. `AGENTS.md` 或 `CLAUDE.md` 作为 Agent 启动入口；缺失时生成薄入口。
3. 文档路由中已经链接的架构、进度、决策、开发和测试文档。
4. 未被路由但位于 `docs/` 下的同义文档，例如 `Architecture.md`、`progress.md`。

发现已有文档时，不生成内容重复的新文档。路径命名应保持仓库现有大小写习惯。

## 接入分级

### L0：只读审计

适用于用户仅询问“这个项目如何接入 Harness”或想先评估成本。只生成报告，不修改仓库。

检查项：

- 文档入口与路由覆盖率；
- 技术栈、运行时锁定与依赖锁文件；
- 现有测试、lint、类型检查、构建与 E2E 命令；
- CI 是否能复现上述命令；
- 是否已有 Agent 入口、进度、决策与任务状态工件。

### L1：最小安装

适用于首次实际接入。安装器创建缺失工件：

- 薄 `AGENTS.md`；
- `.harness/config.json`；
- `docs/FEATURES.json`；
- 缺失时的 `docs/PROGRESS.md`、`DECISIONS.md`、`ARCHITECTURE.md`、`DEVELOPMENT.md`、`TESTING.md`；
- `scripts/harness/*.py`；
- `.harness/evidence/` 与 `.harness/session/`；
- `docs/README.md` 中的受管理路由块。

### L2：项目特化

Agent 读取实际项目并补充：

- 真实架构边界；
- 真实当前任务及其验证命令；
- 集成测试、端到端测试或安全扫描；
- CI 接入建议或补丁。

不要让自动扫描器编造业务行为或架构规则。

### L3：反馈升级

当同类错误重复出现时，才将其升级为自动检查。例如：

- 禁止某层直接导入某依赖；
- 必须有迁移测试；
- 禁止残留调试代码；
- 对关键用户路径执行端到端检查。

## 对 `docs/README.md` 的变更规则

安装器仅追加以下形式的管理块，不替换原文：

```markdown
<!-- harness-adopter:start -->
## Agent Harness
- [架构规则](./ARCHITECTURE.md)
- [当前进度](./PROGRESS.md)
- [决策记录](./DECISIONS.md)
- [测试与验收](./TESTING.md)
- [功能状态](./FEATURES.json)
<!-- harness-adopter:end -->
```

再次执行时检测标记，避免重复追加。若项目已有等价路由，Agent 可在读取后不追加、或将管理块调整到适合的位置。

## CI 接入原则

默认安装器不改 CI。完成 L1 后，Agent 应检查仓库既有流水线并提出最小补丁：

- CI 中运行与 `.harness/config.json` 的 `commands.check` 等价的命令；
- 验证输出应可追溯到 CI run 或本地 evidence；
- 不因 Harness 接入而重复运行耗时流程，除非它补足了缺失的验证层。

## 完成标准

Harness 接入完成不等于业务功能完成。最低标准是：

- 文档入口可找到关键知识；
- `AGENTS.md` 足够短且指向路由；
- 机器可读功能状态存在；
- WIP=1 可被脚本约束；
- 至少一个配置好的验证链路可以执行，或失败基线已被明确记录；
- 生成的文件和任何未解决项已报告给用户。
