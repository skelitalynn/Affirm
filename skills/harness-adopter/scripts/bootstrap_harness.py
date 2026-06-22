#!/usr/bin/env python3
"""Incrementally adopt a minimal Agent Harness into an existing repository.

The installer is deliberately conservative:
- plan mode is the default and performs no writes;
- existing knowledge documents are preserved;
- apply mode creates missing managed artifacts and appends one idempotent
  routing block to docs/README.md unless disabled.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import stat
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

VERSION = "0.1.0"
MANAGED_START = "<!-- harness-adopter:start -->"
MANAGED_END = "<!-- harness-adopter:end -->"


@dataclass
class Detection:
    repo: Path
    docs_dir: Path
    documents: dict[str, str]
    stacks: list[str] = field(default_factory=list)
    commands: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def rel(path: Path, repo: Path) -> str:
    return path.relative_to(repo).as_posix()


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def existing_casefold(directory: Path, filename: str) -> Path | None:
    if not directory.exists():
        return None
    wanted = filename.casefold()
    for path in directory.iterdir():
        if path.is_file() and path.name.casefold() == wanted:
            return path
    return None


def make_target(makefile_text: str, target: str) -> bool:
    return bool(re.search(rf"(?m)^{re.escape(target)}\s*:", makefile_text))


def detect_documents(repo: Path) -> tuple[Path, dict[str, str]]:
    docs_dir = repo / "docs"
    targets = {
        "entrypoint": "README.md",
        "architecture": "ARCHITECTURE.md",
        "progress": "PROGRESS.md",
        "decisions": "DECISIONS.md",
        "development": "DEVELOPMENT.md",
        "testing": "TESTING.md",
        "features": "FEATURES.json",
    }
    documents: dict[str, str] = {}
    for role, default_name in targets.items():
        existing = existing_casefold(docs_dir, default_name)
        path = existing or docs_dir / default_name
        documents[role] = rel(path, repo)
    return docs_dir, documents


def detect_node(repo: Path, detection: Detection) -> None:
    package_path = repo / "package.json"
    if not package_path.exists():
        return
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        detection.notes.append("package.json exists but could not be parsed.")
        return
    detection.stacks.append("Node.js")
    scripts = package.get("scripts", {}) if isinstance(package.get("scripts"), dict) else {}
    if (repo / "pnpm-lock.yaml").exists():
        runner, setup = "pnpm", "pnpm install --frozen-lockfile"
    elif (repo / "yarn.lock").exists():
        runner, setup = "yarn", "yarn install --immutable"
    elif (repo / "bun.lock").exists() or (repo / "bun.lockb").exists():
        runner, setup = "bun", "bun install --frozen-lockfile"
    else:
        runner, setup = "npm", "npm ci" if (repo / "package-lock.json").exists() else "npm install"
    detection.commands.setdefault("setup", setup)

    def run_script(name: str) -> str | None:
        if name not in scripts:
            return None
        return f"{runner} {name}" if runner in {"pnpm", "yarn", "bun"} else f"npm run {name}"

    for candidate in ("dev", "start"):
        cmd = run_script(candidate)
        if cmd:
            detection.commands.setdefault("dev", cmd)
            break
    checks: list[str] = detection.commands.setdefault("check", [])
    for candidate in ("lint", "typecheck", "test", "build"):
        cmd = run_script(candidate)
        if cmd and cmd not in checks:
            checks.append(cmd)


def detect_python(repo: Path, detection: Detection) -> None:
    pyproject = repo / "pyproject.toml"
    requirements = repo / "requirements.txt"
    if not pyproject.exists() and not requirements.exists() and not (repo / "setup.py").exists():
        return
    detection.stacks.append("Python")
    text = read_text(pyproject)
    if (repo / "uv.lock").exists():
        prefix = "uv run "
        detection.commands.setdefault("setup", "uv sync")
    elif (repo / "poetry.lock").exists():
        prefix = "poetry run "
        detection.commands.setdefault("setup", "poetry install")
    else:
        prefix = "python -m "
        if requirements.exists():
            detection.commands.setdefault("setup", "python -m pip install -r requirements.txt")
    checks: list[str] = detection.commands.setdefault("check", [])
    if "ruff" in text:
        command = f"{prefix}ruff check ." if prefix != "python -m " else "python -m ruff check ."
        if command not in checks:
            checks.append(command)
    if "mypy" in text:
        command = f"{prefix}mypy ." if prefix != "python -m " else "python -m mypy ."
        if command not in checks:
            checks.append(command)
    if (repo / "tests").exists() or "pytest" in text:
        command = f"{prefix}pytest" if prefix != "python -m " else "python -m pytest"
        if command not in checks:
            checks.append(command)


def detect_go_rust(repo: Path, detection: Detection) -> None:
    checks: list[str] = detection.commands.setdefault("check", [])
    if (repo / "go.mod").exists():
        detection.stacks.append("Go")
        if "go test ./..." not in checks:
            checks.append("go test ./...")
    if (repo / "Cargo.toml").exists():
        detection.stacks.append("Rust")
        for command in ("cargo fmt --check", "cargo clippy --all-targets -- -D warnings", "cargo test"):
            if command not in checks:
                checks.append(command)


def detect_makefile(repo: Path, detection: Detection) -> None:
    text = read_text(repo / "Makefile")
    if not text:
        return
    if make_target(text, "setup"):
        detection.commands.setdefault("setup", "make setup")
    if make_target(text, "dev"):
        detection.commands.setdefault("dev", "make dev")
    if make_target(text, "check"):
        detection.commands["check"] = ["make check"]
        detection.notes.append("Existing Makefile check target preferred as the unified verification command.")
    elif make_target(text, "test") and not detection.commands.get("check"):
        detection.commands["check"] = ["make test"]


def detect_repository(repo: Path) -> Detection:
    docs_dir, documents = detect_documents(repo)
    result = Detection(repo=repo, docs_dir=docs_dir, documents=documents, commands={"check": []})
    detect_node(repo, result)
    detect_python(repo, result)
    detect_go_rust(repo, result)
    detect_makefile(repo, result)
    if not result.stacks:
        result.notes.append("No supported project stack detected automatically; configure commands manually.")
    if not result.commands.get("check"):
        result.notes.append("No verification chain detected; complete commands.check in .harness/config.json.")
    return result


def config_payload(detection: Detection) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "generated_by": "harness-adopter",
        "generator_version": VERSION,
        "documents": detection.documents,
        "commands": detection.commands,
        "rules": {
            "wip_limit": 1,
            "completion_requires_verification": True,
            "evidence_directory": ".harness/evidence",
            "session_directory": ".harness/session",
        },
    }


def agents_md(detection: Detection) -> str:
    docs = detection.documents
    lines = [
        "# Agent Entry Point",
        "",
        "## 项目文档入口",
        f"所有项目知识从 `{docs['entrypoint']}` 开始阅读。不要在根目录复制第二套架构、进度或决策文档。",
        "",
        "## 开始任务前",
        f"1. 阅读 `{docs['entrypoint']}`。",
        f"2. 阅读 `{docs['progress']}` 与 `{docs['features']}`。",
        f"3. 涉及结构性修改时阅读 `{docs['architecture']}` 与 `{docs['decisions']}`。",
        "4. 执行 `python3 scripts/harness/doctor.py` 检查 Harness 路由与命令映射。",
        "",
        "## 工作规则",
        "- 任意时刻只有一个功能项可以处于 `active` 状态。",
        "- 没有验证证据，不得将功能项标记为 `passing`。",
        "- 当前功能验证通过前，不扩展到无关重构或新功能。",
        "- 对不能由现有文档或代码支持的架构规则，不作臆测；记录为待确认项。",
        "",
        "## Harness 命令",
        "- 列出任务：`python3 scripts/harness/task.py list`",
        "- 激活任务：`python3 scripts/harness/task.py start <ID>`",
        "- 验证任务：`python3 scripts/harness/task.py verify <ID>`",
        "- 会话收尾：`python3 scripts/harness/finish.py`",
        "",
        "## 已检测到的验证链路",
    ]
    checks = detection.commands.get("check", [])
    if checks:
        lines.extend(f"- `{command}`" for command in checks)
    else:
        lines.append("- 尚未可靠检测到；必须在 `.harness/config.json` 中补充后再声明任务完成。")
    return "\n".join(lines) + "\n"


def router_block(documents: dict[str, str], repo: Path) -> str:
    entry = repo / documents["entrypoint"]
    base = entry.parent
    labels = [
        ("architecture", "架构规则"),
        ("progress", "当前进度"),
        ("decisions", "决策记录"),
        ("development", "开发环境"),
        ("testing", "测试与完成定义"),
        ("features", "功能状态"),
    ]
    lines = [MANAGED_START, "## Agent Harness", ""]
    for role, label in labels:
        target = repo / documents[role]
        relative = target.relative_to(base).as_posix()
        lines.append(f"- [{label}](./{relative})")
    lines.extend(["", "该区块由 Harness 管理；详细执行入口见仓库根目录 `AGENTS.md`。", MANAGED_END, ""])
    return "\n".join(lines)


def planned_actions(detection: Detection, update_route: bool, force: bool) -> list[tuple[str, str]]:
    repo = detection.repo
    paths = [
        "AGENTS.md",
        ".harness/config.json",
        ".harness/evidence/.gitkeep",
        ".harness/session/.gitkeep",
        "scripts/harness/doctor.py",
        "scripts/harness/task.py",
        "scripts/harness/finish.py",
        *[path for role, path in detection.documents.items() if role != "entrypoint"],
    ]
    actions: list[tuple[str, str]] = []
    for relative in paths:
        target = repo / relative
        if target.exists():
            if force and relative in {"AGENTS.md", ".harness/config.json", "scripts/harness/doctor.py", "scripts/harness/task.py", "scripts/harness/finish.py"}:
                actions.append(("UPDATE", relative))
            else:
                actions.append(("PRESERVE", relative))
        else:
            actions.append(("CREATE", relative))
    entry = repo / detection.documents["entrypoint"]
    if not entry.exists():
        actions.append(("CREATE", detection.documents["entrypoint"]))
    elif update_route and MANAGED_START not in read_text(entry):
        actions.append(("APPEND", detection.documents["entrypoint"]))
    else:
        actions.append(("PRESERVE", detection.documents["entrypoint"]))
    return actions


def render_report(detection: Detection, actions: list[tuple[str, str]], applied: bool) -> str:
    doc = detection.documents
    lines = [
        "# Harness Adoption Report",
        "",
        f"- Mode: `{'applied' if applied else 'plan only'}`",
        f"- Repository: `{detection.repo}`",
        f"- Documentation entrypoint: `{doc['entrypoint']}`",
        f"- Detected stack: `{', '.join(detection.stacks) if detection.stacks else 'unknown'}`",
        "",
        "## Detected commands",
        "",
    ]
    for key in ("setup", "dev"):
        if detection.commands.get(key):
            lines.append(f"- {key}: `{detection.commands[key]}`")
    checks = detection.commands.get("check", [])
    if checks:
        lines.append("- check:")
        lines.extend(f"  - `{command}`" for command in checks)
    else:
        lines.append("- check: _not detected_ ")
    lines.extend(["", "## File actions", "", "| Action | Path |", "|---|---|"])
    for action, path in actions:
        lines.append(f"| {action} | `{path}` |")
    if detection.notes:
        lines.extend(["", "## Items requiring review", ""])
        lines.extend(f"- {note}" for note in detection.notes)
    lines.extend([
        "",
        "## Next project-specific work",
        "",
        "- Review actual architecture constraints; do not invent them from directory names.",
        "- Add only currently relevant feature items with executable acceptance commands.",
        "- Compare configured checks with CI and add missing integration/E2E gates where required.",
    ])
    return "\n".join(lines) + "\n"


def write_unless_exists(path: Path, content: str, force: bool = False) -> None:
    if path.exists() and not force:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def copy_template(skill_root: Path, template_relative: str, target: Path, force: bool = False) -> None:
    if target.exists() and not force:
        return
    source = skill_root / "assets" / "templates" / template_relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    if target.suffix == ".py":
        target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def apply_install(detection: Detection, update_route: bool, force: bool) -> None:
    repo = detection.repo
    skill_root = Path(__file__).resolve().parents[1]
    docs = detection.documents
    config_force = force
    write_unless_exists(repo / "AGENTS.md", agents_md(detection), force=force)
    write_unless_exists(
        repo / ".harness" / "config.json",
        json.dumps(config_payload(detection), ensure_ascii=False, indent=2) + "\n",
        force=config_force,
    )
    write_unless_exists(repo / ".harness" / "evidence" / ".gitkeep", "")
    write_unless_exists(repo / ".harness" / "session" / ".gitkeep", "")
    docs_templates = {
        "architecture": "docs/ARCHITECTURE.md",
        "progress": "docs/PROGRESS.md",
        "decisions": "docs/DECISIONS.md",
        "development": "docs/DEVELOPMENT.md",
        "testing": "docs/TESTING.md",
        "features": "docs/FEATURES.json",
    }
    for role, source in docs_templates.items():
        copy_template(skill_root, source, repo / docs[role])
    for filename in ("doctor.py", "task.py", "finish.py"):
        copy_template(skill_root, f"scripts/harness/{filename}", repo / "scripts" / "harness" / filename, force=force)
    entry = repo / docs["entrypoint"]
    if not entry.exists():
        entry.parent.mkdir(parents=True, exist_ok=True)
        entry.write_text("# Documentation Index\n\n" + router_block(docs, repo), encoding="utf-8")
    elif update_route and MANAGED_START not in read_text(entry):
        original = entry.read_text(encoding="utf-8")
        separator = "\n" if original.endswith("\n") else "\n\n"
        entry.write_text(original + separator + router_block(docs, repo), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Incrementally install an Agent Harness while preserving existing project documents.")
    parser.add_argument("--repo", default=".", help="Repository root to inspect or modify.")
    parser.add_argument("--apply", action="store_true", help="Create missing managed artifacts. Without this flag, run in plan-only mode.")
    parser.add_argument("--force", action="store_true", help="Regenerate managed entry/config/runtime scripts; existing docs remain preserved.")
    parser.add_argument("--no-route-update", action="store_true", help="Do not append the managed Harness block to an existing docs/README.md.")
    parser.add_argument("--report", help="Write the adoption report to this path in addition to stdout.")
    args = parser.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    if not repo.exists() or not repo.is_dir():
        print(f"ERROR: Repository directory does not exist: {repo}", file=sys.stderr)
        return 2
    detection = detect_repository(repo)
    actions = planned_actions(detection, update_route=not args.no_route_update, force=args.force)
    if args.apply:
        apply_install(detection, update_route=not args.no_route_update, force=args.force)
    report = render_report(detection, actions, applied=args.apply)
    print(report, end="")
    if args.report:
        path = Path(args.report).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(report, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
