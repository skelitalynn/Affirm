#!/usr/bin/env python3
"""Verify the adopted Harness document layout and isolation rules."""
from __future__ import annotations

import re
import sys
from pathlib import Path


def find_repo() -> Path:
    for candidate in [Path.cwd(), *Path.cwd().parents, Path(__file__).resolve().parents[2]]:
        if (candidate / ".harness" / "config.json").exists():
            return candidate
    raise SystemExit("ERROR: .harness/config.json not found. Run from the repository root.")


def main() -> int:
    repo = find_repo()
    failures: list[str] = []

    required_docs = [
        repo / "docs/README.md",
        repo / "docs/ARCHITECTURE.md",
        repo / "docs/DEVELOPMENT.md",
        repo / "docs/TESTING.md",
        repo / "docs/PROGRESS.md",
        repo / "docs/DECISIONS.md",
        repo / "docs/FEATURES.json",
    ]
    for path in required_docs:
        if not path.exists():
            failures.append(f"Missing required document: {path.relative_to(repo)}")

    forbidden_files = [
        repo / "docs/project/项目概述.md",
        repo / "docs/project/产品思路整理.md",
        repo / "docs/project/文档整理说明.md",
        repo / "docs/project/项目说明书-对比底稿.md",
        repo / "docs/project/面试项目说明.md",
        repo / "docs/project/面试讲稿-3分钟版.md",
        repo / "docs/project/面试速查表.md",
        repo / "docs/project/简历最终版.md",
        repo / "docs/project/简历表述草稿.md",
        repo / "docs/architecture/system-architecture.md",
        repo / "docs/development/00-开发总流程.md",
        repo / "docs/reports/development-progress.md",
    ]
    for path in forbidden_files:
        if path.exists():
            failures.append(f"Legacy document still exists: {path.relative_to(repo)}")

    project_dir = repo / "docs/project"
    if project_dir.exists():
        lingering = sorted(path.relative_to(repo) for path in project_dir.rglob("*.md"))
        if lingering:
            failures.append(f"Project directory still contains migrated markdown files: {', '.join(str(path) for path in lingering)}")
        else:
            failures.append("Legacy project document directory still exists: docs/project")

    project_facing_docs = [
        repo / "README.md",
        repo / "AGENTS.md",
        repo / "CLAUDE.md",
        repo / "docs/README.md",
        repo / "docs/ARCHITECTURE.md",
        repo / "docs/DEVELOPMENT.md",
        repo / "docs/TESTING.md",
        repo / "docs/PROGRESS.md",
        repo / "docs/DECISIONS.md",
    ]
    forbidden_fragments = [
        "reports/interview/",
        "docs/project/",
        "system-architecture.md",
        "00-开发总流程.md",
        "development-progress.md",
    ]
    for path in project_facing_docs:
        text = path.read_text(encoding="utf-8")
        for fragment in forbidden_fragments:
            if fragment in text:
                failures.append(f"Project-facing document references archived material: {path.relative_to(repo)} -> {fragment}")

    archive_dir = repo / "docs/reports/interview"
    if not archive_dir.exists():
        failures.append("Archived derived-material directory is missing: docs/reports/interview")
    else:
        archive_docs = sorted(archive_dir.glob("*.md"))
        if not archive_docs:
            failures.append("Archived derived-material directory is empty: docs/reports/interview")
        for path in archive_docs:
            text = path.read_text(encoding="utf-8")
            links = re.findall(r"\]\(([^)]+)\)", text)
            if links:
                failures.append(f"Archived derived-material document should not link to other docs: {path.relative_to(repo)}")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("PASS")
    print("- top-level Harness documents are present")
    print("- migrated legacy documents are removed")
    print("- project-facing documents do not reference archived derived materials")
    print("- archived derived-material documents are isolated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
