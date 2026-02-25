#!/bin/bash

echo "🔍 Affirm项目 - Day 1完善验证"
echo "=================================================="

# 1. 检查文件完整性
echo "1. 检查项目文件完整性..."
files=(
    "README.md"
    "package.json"
    "package-lock.json"
    ".env"
    ".gitignore"
    "src/config.js"
    "src/db/connection.js"
    "scripts/init-db.sql"
    "scripts/test-db-connection.js"
    "scripts/verify-env.js"
    "DAY1_COMPLETED.md"
    "7天开发计划.md"
)

missing_files=0
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (缺失)"
        missing_files=$((missing_files + 1))
    fi
done

if [ $missing_files -eq 0 ]; then
    echo "✅ 所有项目文件完整"
else
    echo "⚠️  缺失 $missing_files 个文件"
fi

# 2. 检查数据库
echo -e "\n2. 检查数据库状态..."
if PGPASSWORD=affirm_password_123 psql -h localhost -U affirm_user -d affirm_db -c "SELECT 1" &>/dev/null; then
    echo "✅ 数据库连接正常"
    
    # 检查表
    table_count=$(PGPASSWORD=affirm_password_123 psql -h localhost -U affirm_user -d affirm_db -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
    echo "✅ 数据库表数量: $table_count"
    
    # 检查pgvector
    if PGPASSWORD=affirm_password_123 psql -h localhost -U affirm_user -d affirm_db -t -c "SELECT 1 FROM pg_extension WHERE extname = 'vector';" | grep -q 1; then
        echo "✅ pgvector扩展已安装"
    else
        echo "❌ pgvector扩展未安装"
    fi
else
    echo "❌ 数据库连接失败"
fi

# 3. 检查环境变量
echo -e "\n3. 检查环境变量配置..."
required_vars=("DB_URL" "TELEGRAM_BOT_TOKEN" "OPENAI_API_KEY" "OPENAI_BASE_URL" "GITHUB_USERNAME" "GITHUB_REPO")
source .env 2>/dev/null

missing_vars=0
for var in "${required_vars[@]}"; do
    if [ -n "${!var}" ] && [[ ! "${!var}" =~ "请填写" ]] && [[ ! "${!var}" =~ "先留空" ]]; then
        echo "✅ $var: 已配置"
    else
        echo "❌ $var: 未配置或需要填写"
        missing_vars=$((missing_vars + 1))
    fi
done

# 4. 检查Git状态
echo -e "\n4. 检查Git状态..."
if git status &>/dev/null; then
    echo "✅ Git仓库已初始化"
    if git remote -v | grep -q origin; then
        echo "✅ 远程仓库已配置"
    else
        echo "❌ 远程仓库未配置"
    fi
else
    echo "❌ Git未初始化"
fi

# 5. 检查OpenClaw
echo -e "\n5. 检查OpenClaw配置..."
if command -v openclaw &>/dev/null; then
    echo "✅ OpenClaw已安装"
else
    echo "❌ OpenClaw未安装"
fi

echo -e "\n=================================================="
echo "📊 Day 1完善验证完成"

if [ $missing_files -eq 0 ] && [ $missing_vars -eq 0 ]; then
    echo "🎉 Day 1所有任务100%完成！"
    echo "项目已完全就绪，可以开始Day 2开发。"
else
    echo "⚠️  还有未完成的任务，请先完善Day 1。"
    echo "缺失文件: $missing_files 个"
    echo "缺失环境变量: $missing_vars 个"
fi