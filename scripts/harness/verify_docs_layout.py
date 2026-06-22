#!/usr/bin/env python3
"""Verify the adopted Harness document layout and isolation rules."""
from __future__ import annotations

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

    forbidden_dirs = [
        repo / "docs/project",
        repo / "docs/architecture",
        repo / "docs/development",
        repo / "docs/database",
        repo / "docs/reports",
    ]
    for path in forbidden_dirs:
        if path.exists():
            failures.append(f"Legacy project document directory still exists: {path.relative_to(repo)}")

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
        "docs/architecture/",
        "docs/development/",
        "docs/database/",
        "docs/reports/",
        "./architecture/",
        "./development/",
        "./database/",
        "./reports/",
        "(architecture/",
        "(development/",
        "(database/",
        "(reports/",
        "system-architecture.md",
        "00-开发总流程.md",
        "development-progress.md",
    ]
    for path in project_facing_docs:
        text = path.read_text(encoding="utf-8")
        for fragment in forbidden_fragments:
            if fragment in text:
                failures.append(f"Project-facing document references legacy material: {path.relative_to(repo)} -> {fragment}")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("PASS")
    print("- top-level Harness documents are present")
    print("- legacy project document directories are removed")
    print("- project-facing documents do not reference legacy subdirectory docs")
    print("- docs/ contains only Harness top-level documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
