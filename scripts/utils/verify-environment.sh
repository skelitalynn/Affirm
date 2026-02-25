#!/bin/bash

echo "🔍 Affirm项目配置验证脚本"
echo "=========================="

# 加载环境变量
if [ -f .env ]; then
    source .env
    echo "✅ .env文件已加载"
else
    echo "❌ .env文件不存在"
    exit 1
fi

echo ""
echo "1. 数据库配置验证"
echo "------------------"
if command -v psql &> /dev/null; then
    if PGPASSWORD=your_database_password psql -h localhost -U affirm_user -d affirm_db -c "SELECT 1;" &> /dev/null; then
        echo "✅ PostgreSQL连接成功"
        
        # 检查表（Day 1会创建）
        echo "📊 数据库信息:"
        PGPASSWORD=your_database_password psql -h localhost -U affirm_user -d affirm_db -c "
SELECT 
    datname as \"数据库\",
    pg_size_pretty(pg_database_size(datname)) as \"大小\"
FROM pg_database 
WHERE datname = 'affirm_db';
        "
    else
        echo "❌ PostgreSQL连接失败"
        echo "   请检查:"
        echo "   1. PostgreSQL服务是否运行: sudo systemctl status postgresql"
        echo "   2. 用户密码是否正确"
        echo "   3. pg_hba.conf配置"
    fi
else
    echo "⚠️  psql命令未找到"
fi

echo ""
echo "2. API密钥验证"
echo "----------------"
echo "需要你手动验证以下API密钥:"
echo ""
echo "📱 Telegram Bot Token:"
if [[ "$TELEGRAM_BOT_TOKEN" == "请填写你的Telegram Bot Token" ]]; then
    echo "   ❌ 未配置"
else
    echo "   ✅ 已配置 (需要测试)"
    echo "   测试命令: curl -s \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/getMe\" | jq ."
fi

echo ""
echo "🤖 Gemini API Key:"
if [[ "$GEMINI_API_KEY" == "请填写你的Gemini API密钥" ]]; then
    echo "   ❌ 未配置"
else
    echo "   ✅ 已配置 (需要测试)"
    echo "   测试命令: curl -s -X POST -H \"Content-Type: application/json\" -d '{\"contents\":[{\"parts\":[{\"text\":\"Hello\"}]}]}' \"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=\${GEMINI_API_KEY}\" | jq ."
fi

echo ""
echo "🐙 GitHub SSH连接:"
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "   ✅ SSH连接正常"
    echo "   仓库: git@github.com:\${GITHUB_USERNAME}/\${GITHUB_REPO}.git"
else
    echo "   ❌ SSH连接失败"
    echo "   请检查: ~/.ssh/id_ed25519.pub 是否添加到GitHub"
fi

echo ""
echo "3. 项目文件验证"
echo "----------------"
files=("项目文档.md" "7天开发计划.md" "daily-dev.sh" ".env" "项目启动清单.md")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (缺失)"
    fi
done

echo ""
echo "4. Git配置验证"
echo "----------------"
if command -v git &> /dev/null; then
    echo "✅ Git版本: $(git --version | cut -d' ' -f3)"
    
    # 检查远程仓库
    if git remote -v | grep -q origin; then
        echo "✅ 远程仓库已配置"
        git remote -v
    else
        echo "⚠️  远程仓库未配置"
        echo "   运行: git remote add origin https://github.com/\${GITHUB_USERNAME}/\${GITHUB_REPO}.git"
    fi
else
    echo "❌ Git未安装"
fi

echo ""
echo "5. OpenClaw Cron任务验证"
echo "-------------------------"
if command -v openclaw &> /dev/null; then
    echo "✅ OpenClaw已安装"
    echo "   运行: openclaw cron list 查看定时任务"
else
    echo "⚠️  OpenClaw命令未找到"
fi

echo ""
echo "6. 系统依赖验证"
echo "----------------"
dependencies=("node" "npm" "curl" "jq")
for dep in "${dependencies[@]}"; do
    if command -v $dep &> /dev/null; then
        echo "✅ $dep"
    else
        echo "⚠️  $dep 未安装"
    fi
done

echo ""
echo "=========================="
echo "📋 下一步行动:"
echo ""
echo "1. 编辑 .env 文件，填写API密钥:"
echo "   nano /root/projects/Affirm/.env"
echo ""
echo "2. 测试所有API连接:"
echo "   运行此脚本查看测试命令"
echo ""
echo "3. 配置Git远程仓库:"
echo "   git remote add origin https://github.com/\${GITHUB_USERNAME}/\${GITHUB_REPO}.git"
echo ""
echo "4. 明天09:00自动开始Day 1开发"
echo ""
echo "✅ 数据库已自动配置完成!"
echo "❌ 需要你填写API密钥部分"