#!/bin/bash
set -euo pipefail

echo "🔍 Affirm 环境验证（Shell 包装）"
echo "=========================="

node tools/verify-environment.js
