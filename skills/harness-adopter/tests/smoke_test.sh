#!/usr/bin/env bash
set -euo pipefail
SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(mktemp -d)/repo"
trap 'rm -rf "${REPO%/repo}"' EXIT
mkdir -p "$REPO/docs"
printf '# Docs Router\n' > "$REPO/docs/README.md"
printf '{"scripts":{"test":"true"}}\n' > "$REPO/package.json"
printf '{}\n' > "$REPO/package-lock.json"
python3 "$SKILL_ROOT/scripts/bootstrap_harness.py" --repo "$REPO" --apply >/dev/null
python3 "$REPO/scripts/harness/task.py" add --id F-001 --behavior 'Smoke verification succeeds' --verify true >/dev/null
python3 "$REPO/scripts/harness/task.py" start F-001 >/dev/null
python3 "$REPO/scripts/harness/task.py" verify F-001 >/dev/null
python3 - <<PY
import json
from pathlib import Path
repo = Path('$REPO')
data = json.loads((repo / 'docs' / 'FEATURES.json').read_text())
assert data['features'][0]['state'] == 'passing'
assert (repo / data['features'][0]['evidence']).exists()
PY
echo 'Smoke test passed.'
