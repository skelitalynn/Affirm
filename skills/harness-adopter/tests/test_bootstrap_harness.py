#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import sys
from pathlib import Path
from types import SimpleNamespace

SKILL_ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_PATH = SKILL_ROOT / "scripts" / "bootstrap_harness.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


bootstrap = load_module("bootstrap_harness", BOOTSTRAP_PATH)


class BootstrapHarnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo = Path(self.tempdir.name) / "repo"
        (self.repo / "docs").mkdir(parents=True)
        (self.repo / "docs" / "README.md").write_text("# Existing Documentation\n\nKeep this text.\n", encoding="utf-8")
        (self.repo / "docs" / "Architecture.md").write_text("# Existing Architecture\n\nDO NOT OVERWRITE\n", encoding="utf-8")
        (self.repo / "package.json").write_text(json.dumps({"scripts": {"dev": "vite", "lint": "eslint .", "test": "vitest run", "build": "vite build"}}), encoding="utf-8")
        (self.repo / "package-lock.json").write_text("{}", encoding="utf-8")
        self.detection = bootstrap.detect_repository(self.repo)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def apply(self) -> None:
        bootstrap.apply_install(self.detection, update_route=True, force=False)

    def test_plan_mode_does_not_write(self) -> None:
        actions = bootstrap.planned_actions(self.detection, update_route=True, force=False)
        self.assertIn(("CREATE", "AGENTS.md"), actions)
        self.assertFalse((self.repo / "AGENTS.md").exists())
        self.assertFalse((self.repo / ".harness" / "config.json").exists())

    def test_apply_preserves_existing_docs_and_routes_to_them(self) -> None:
        self.apply()
        self.assertEqual((self.repo / "docs" / "Architecture.md").read_text(encoding="utf-8"), "# Existing Architecture\n\nDO NOT OVERWRITE\n")
        router = (self.repo / "docs" / "README.md").read_text(encoding="utf-8")
        self.assertIn("Keep this text.", router)
        self.assertIn("<!-- harness-adopter:start -->", router)
        config = json.loads((self.repo / ".harness" / "config.json").read_text(encoding="utf-8"))
        self.assertEqual(config["documents"]["architecture"], "docs/Architecture.md")
        self.assertEqual(config["commands"]["setup"], "npm ci")
        self.assertIn("npm run test", config["commands"]["check"])

    def test_apply_is_idempotent_for_router_block(self) -> None:
        self.apply()
        bootstrap.apply_install(self.detection, update_route=True, force=False)
        router = (self.repo / "docs" / "README.md").read_text(encoding="utf-8")
        self.assertEqual(router.count("<!-- harness-adopter:start -->"), 1)

    def test_task_verification_records_evidence_and_enforces_wip(self) -> None:
        self.apply()
        task = load_module("generated_task", self.repo / "scripts" / "harness" / "task.py")
        features_path = self.repo / "docs" / "FEATURES.json"
        evidence_root = self.repo / ".harness" / "evidence"
        payload = task.load_json(features_path)
        self.assertEqual(task.cmd_add(SimpleNamespace(id="F-001", behavior="true returns success", verify=["true"]), payload, features_path), 0)
        payload = task.load_json(features_path)
        self.assertEqual(task.cmd_add(SimpleNamespace(id="F-002", behavior="second task", verify=["true"]), payload, features_path), 0)
        payload = task.load_json(features_path)
        self.assertEqual(task.cmd_start(SimpleNamespace(id="F-001"), payload, features_path), 0)
        payload = task.load_json(features_path)
        self.assertEqual(task.cmd_start(SimpleNamespace(id="F-002"), payload, features_path), 1)
        payload = task.load_json(features_path)
        task.git_metadata = lambda repo: {"git_head": None, "working_tree_dirty": None}
        self.assertEqual(task.cmd_verify(SimpleNamespace(id="F-001"), self.repo, payload, features_path, evidence_root), 0)
        payload = task.load_json(features_path)
        feature = payload["features"][0]
        self.assertEqual(feature["state"], "passing")
        self.assertTrue((self.repo / feature["evidence"]).exists())


if __name__ == "__main__":
    unittest.main()
