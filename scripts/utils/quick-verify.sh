#!/bin/bash
set -euo pipefail

echo "🔍 Affirm 快速验证"
echo "=================================================="

echo "1. 运行环境验证"
node tools/verify-environment.js

echo -e "\n2. 运行运行态状态检查"
node tools/check-status.js || true

echo -e "\n✅ 快速验证完成"
