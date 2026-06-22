---
name: harness-adopter
description: 为已有软件仓库增量安装、审计或升级 Agent Harness。Use when the user asks to 接入/初始化/封装/迁移 harness, 建立 AGENTS.md 或 CLAUDE.md 工作流, 持久化 PROGRESS/DECISIONS, 加入 WIP=1 功能清单或验证门控，尤其当 docs/README.md 是文档路由入口时。Do not use for ordinary feature implementation unless the harness itself must be changed.
license: MIT
compatibility: Requires filesystem and shell access. Bundled installer uses Python 3.11+; git is recommended for evidence and checkpoints.
metadata:
  author: custom
  version: "0.1.0"
---

# Harness Adopter

为现有代码仓库安装最小、可执行、可持续迭代的 Agent Harness。默认尊重既有文档体系，特别是以 `docs/README.md` 作为文档路由的仓库；不要把用户已有的架构、进度、决策文档迁移到根目录或复制成第二套知识库。

## 适用任务

在以下请求中使用本 Skill：

- “给这个已有项目接入 harness / agent harness”。
- “把我的文档结构变成可供 Agent 工作的流程”。
- “生成精简的 `AGENTS.md`，并建立进度、任务状态和验证门控”。
- “审计或修复已有 Harness，防止 Agent 提前宣布完成”。

普通业务功能开发、普通代码审查或只要求修改一份已有文档时，不要主动安装 Harness。

## 不可破坏的默认原则

1. **识别后增量接入。** 首先读取仓库，不要一开始生成或覆盖文件。
2. **复用文档路由。** 若存在 `docs/README.md`（大小写不敏感匹配），将其作为唯一文档总入口。
3. **根目录入口必须薄。** `AGENTS.md` 只载入启动路径、文档入口、工作规则和验证命令；详细规则留在 `docs/`。
4. **默认不覆盖已有内容。** 保留既有 `AGENTS.md`、架构文档、进度文档、决策文档和脚本；除非用户明确要求改写，或你在读取后做最小、有解释的补丁。
5. **状态机器可读。** 默认使用 `docs/FEATURES.json`，因为它由 Python 标准库可稳定读写且无需向目标项目添加 YAML 依赖。若仓库已经统一使用 YAML 且有可靠解析工具，可将其适配为 YAML。
6. **WIP=1。** 任意时刻只有一个功能项可以处于 `active`；没有验证证据，不得进入 `passing`。
7. **复用现有验证链路。** 从已有 package scripts、Python/Go/Rust 配置、Makefile 和 CI 中推断命令，不强迫项目改用某一种构建工具。
8. **证据落库。** 验证输出存入 `.harness/evidence/`，会话交接信息存入 `.harness/session/`。

## 标准工作流

### 1. 定位入口并读取现状

先查找并读取：

- `docs/README.md` 或同义的文档路由文件；
- 其链接到的 `ARCHITECTURE`、`PROGRESS`、`DECISIONS`、`DEVELOPMENT`、`TESTING` 文档；
- 根目录 `AGENTS.md` / `CLAUDE.md`；
- `package.json`、`pyproject.toml`、`Makefile`、锁文件、CI 配置和测试目录。

确认用户已有知识工件后，再决定缺失项。

### 2. 生成只读接入报告

使用本 Skill 自带安装器的只读模式：

```bash
python3 <skill-root>/scripts/bootstrap_harness.py --repo . --report /tmp/harness-adoption-report.md
```

读取报告，确认：文档路由、检测到的技术栈、现有命令、将创建的文件和将保留的文件。报告中不能虚构业务验收标准。

### 3. 执行增量安装

当用户要求实际接入或生成文件时，执行：

```bash
python3 <skill-root>/scripts/bootstrap_harness.py --repo . --apply --report /tmp/harness-adoption-report.md
```

安装器应当：

- 复用已有 `docs/README.md`，只追加一个受标记保护的 Harness 路由块；
- 对缺失文档创建骨架文件，对已存在文档保留原状；
- 生成缺失的薄 `AGENTS.md`、`.harness/config.json`、`docs/FEATURES.json`；
- 生成零依赖的 `scripts/harness/doctor.py`、`task.py`、`finish.py`；
- 创建证据和会话目录；
- 重复执行时保持幂等。

只有用户明确要求重置生成文件时，才使用 `--force`。即使使用 `--force`，也不要覆盖未被 Harness 管理的业务文档。

### 4. 根据仓库内容补足项目特有规则

安装器只生成结构和可执行门控。你必须读取实际项目后，对下列内容进行最小补丁：

- `docs/ARCHITECTURE.md`：已有架构边界及禁止依赖；没有证据时不要臆造规则。
- `docs/PROGRESS.md`：用户当前真实目标、已知阻塞、下一步。
- `docs/FEATURES.json`：仅添加当前待做或已明确验收的功能项，不回填未经验证的历史功能。
- `.harness/config.json`：补全不能由扫描可靠推断的 setup、integration、e2e 或安全检查命令。

### 5. 建立第一个可验证任务

针对用户当前要做的真实任务，添加一个功能项：

```bash
python3 scripts/harness/task.py add \
  --id F-001 \
  --behavior "<可观察的业务行为>" \
  --verify "<可独立执行的验证命令>"
python3 scripts/harness/task.py start F-001
```

行为必须可观察，验证命令必须能在目标仓库执行。没有真实任务时保持 `features` 为空，不创建伪任务。

### 6. 验证接入质量

运行：

```bash
python3 scripts/harness/doctor.py
python3 scripts/harness/doctor.py --run
```

第一条验证路由、状态文件和命令映射存在；第二条执行已配置的检查链路。若项目原本已失败，记录为基线问题，不得谎称 Harness 接入已使项目通过。

### 7. 报告结果

向用户说明：

- 保留并复用了哪些既有文档；
- 创建或修改了哪些文件；
- 自动检测到哪些验证命令，哪些仍需项目确认；
- 当前是否存在执行失败或未定义的端到端验收；
- 如何触发后续工作：`task.py start`、`task.py verify`、`finish.py`。

## 生成后的文件职责

读取 [references/outputs-and-contracts.md](references/outputs-and-contracts.md) 获取文件职责、配置结构和状态转移约束。

读取 [references/adoption-workflow.md](references/adoption-workflow.md) 获取审计、已有文档兼容、CI 接入和演进建议。

## 安全与边界

- 不运行目标仓库提供的验证命令，除非用户要求实际安装/验证或当前任务明确需要执行它们。
- `docs/FEATURES.json` 中的验证命令属于仓库可执行代码；在不信任的仓库中，执行前先展示并审查。
- 不自动提交 Git，不自动合并分支，不自动改写 CI；生成更改后由用户或当前任务决定是否提交。
- 不因存在 Harness 就扩大当前业务任务范围；任务边界仍以用户请求和 `active` 功能项为准。
