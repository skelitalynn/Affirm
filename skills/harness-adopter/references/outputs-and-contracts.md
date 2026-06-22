# 生成工件与契约

## 文件职责

| 路径 | 职责 | 更新方式 |
|---|---|---|
| `AGENTS.md` | Agent 启动入口，链接文档路由并声明最低工作规则 | 首次生成；后续保持精简 |
| `docs/README.md` | 人与 Agent 的文档总路由 | 只追加受管理块或人工最小补丁 |
| `docs/ARCHITECTURE.md` | 全局架构边界与模块链接 | 人或理解项目后的 Agent 更新 |
| `docs/PROGRESS.md` | 当前阶段目标、阻塞、下一步 | 每次长任务/会话结束更新 |
| `docs/DECISIONS.md` | 决策索引；大型项目可链接 ADR | 重要决策发生时更新 |
| `docs/FEATURES.json` | 可执行功能状态机 | `scripts/harness/task.py` 更新 |
| `docs/DEVELOPMENT.md` | 安装、启动与环境说明 | 工具链变化时更新 |
| `docs/TESTING.md` | 验证层级和完成定义 | 测试策略变化时更新 |
| `.harness/config.json` | 文档路径、命令映射和门控规则 | 初始化和工具链变化时更新 |
| `.harness/evidence/` | 每次功能验证的日志与结果 | `task.py verify` 自动写入 |
| `.harness/session/` | 会话结束报告 | `finish.py` 自动写入 |

## `.harness/config.json` 结构

```json
{
  "schema_version": 1,
  "generated_by": "harness-adopter",
  "documents": {
    "entrypoint": "docs/README.md",
    "architecture": "docs/ARCHITECTURE.md",
    "progress": "docs/PROGRESS.md",
    "decisions": "docs/DECISIONS.md",
    "development": "docs/DEVELOPMENT.md",
    "testing": "docs/TESTING.md",
    "features": "docs/FEATURES.json"
  },
  "commands": {
    "setup": "pnpm install --frozen-lockfile",
    "dev": "pnpm dev",
    "check": ["pnpm lint", "pnpm test", "pnpm build"]
  },
  "rules": {
    "wip_limit": 1,
    "completion_requires_verification": true,
    "evidence_directory": ".harness/evidence",
    "session_directory": ".harness/session"
  }
}
```

命令由安装器尽可能推断，无法确定时应保留为空并在报告中列为待确认项。

## `docs/FEATURES.json` 状态结构

```json
{
  "schema_version": 1,
  "features": [
    {
      "id": "F-001",
      "behavior": "用户可以通过邮箱登录并获得访问令牌",
      "state": "active",
      "verification": ["python -m pytest tests/integration/test_login.py -x"],
      "evidence": null,
      "blocked_reason": null
    }
  ]
}
```

允许状态：

- `not_started`
- `active`
- `blocked`
- `passing`

状态转移：

| 来源 | 目标 | 条件 |
|---|---|---|
| `not_started` / `blocked` | `active` | 没有其他 `active` 项；由 `task.py start` 完成 |
| `active` | `passing` | 所有 verification 命令成功；由 `task.py verify` 自动完成 |
| `active` | `blocked` | 明确记录阻塞理由；由 `task.py block` 完成 |

不得直接手改 `passing` 来绕过验证证据。

## 验证证据

每次 `task.py verify <id>` 生成一个目录：

```text
.harness/evidence/F-001/20260603T081500Z/
├── command-01.log
├── command-02.log
└── result.json
```

`result.json` 记录命令、返回码、时间、git HEAD 和工作树是否有未提交改动。通过验证只说明所配置行为已通过，并不代表未被配置的需求也已覆盖。
