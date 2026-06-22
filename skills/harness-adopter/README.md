# harness-adopter

一个符合 Agent Skills 开放格式的 Skill，用于把 **已有项目** 增量接入 Agent Harness，而不是重新组织项目文档。

## 默认约定

- 优先复用 `docs/README.md` 作为文档路由。
- 保留已有 `ARCHITECTURE`、`PROGRESS`、`DECISIONS` 等文档。
- 生成极薄的 `AGENTS.md` 与零依赖 Harness 脚本。
- 默认以 `docs/FEATURES.json` 保存机器可读状态，避免新增 YAML 运行时依赖。
- 状态转移受验证命令门控，默认 WIP=1。

## 安装

`harness-adopter` 是一个可复用于多个已有项目的 Skill，因此推荐安装到个人 Skill 目录。安装一次后，即可在不同项目中调用它完成 Harness 接入。

### Claude Code

个人级安装：

```bash
git clone --depth 1 https://github.com/skelitalynn/harness-adopter-skill.git ~/.claude/skills/harness-adopter
```

安装后，在任意目标项目中调用：

```text
/harness-adopter 请为当前已有项目接入 Harness，保留 docs/README.md 作为文档入口。
```

更新 Skill：

```bash
git -C ~/.claude/skills/harness-adopter pull --ff-only
```

### Codex

个人级安装：

```bash
git clone --depth 1 https://github.com/skelitalynn/harness-adopter-skill.git ~/.agents/skills/harness-adopter
```

安装后，在任意目标项目中显式提及 Skill：

```text
$harness-adopter 请为当前已有项目接入 Harness，保留 docs/README.md 作为文档入口。
```

Codex 也可以根据 Skill 的 `description` 在匹配任务中自动触发。

更新 Skill：

```bash
git -C ~/.agents/skills/harness-adopter pull --ff-only
```

### 仓库级安装

只有当你希望某个项目将该 Skill 固定纳入版本管理，并让团队成员共享时，才建议使用仓库级安装。

#### Claude Code

在目标项目根目录执行：

```bash
git submodule add https://github.com/skelitalynn/harness-adopter-skill.git .claude/skills/harness-adopter
git commit -m "chore: add harness-adopter skill"
```

调用：

```text
/harness-adopter 请为当前已有项目接入 Harness，保留 docs/README.md 作为文档入口。
```

#### Codex

在目标项目根目录执行：

```bash
git submodule add https://github.com/skelitalynn/harness-adopter-skill.git .agents/skills/harness-adopter
git commit -m "chore: add harness-adopter skill"
```

调用：

```text
$harness-adopter 请为当前已有项目接入 Harness，保留 docs/README.md 作为文档入口。
```

## 直接运行安装器

Skill 同时提供可独立运行的零依赖安装器。克隆本仓库后，在仓库根目录执行：

```bash
python3 scripts/bootstrap_harness.py --repo /path/to/project
python3 scripts/bootstrap_harness.py --repo /path/to/project --apply
```

第一条命令只输出拟接入报告，不修改目标项目。

第二条命令增量创建缺失工件，包括 Agent 入口、Harness 配置、任务状态文件和验证脚本。安装器不会覆盖已有业务文档，除非显式传入 `--force`；即使使用 `--force`，也只处理 Harness 管理文件。

## 包含内容

```text
harness-adopter-skill/
├── SKILL.md
├── README.md
├── LICENSE
├── agents/
│   └── openai.yaml
├── scripts/
│   └── bootstrap_harness.py
├── references/
│   ├── adoption-workflow.md
│   └── outputs-and-contracts.md
├── assets/
│   └── templates/
└── tests/
    └── test_bootstrap_harness.py
```
