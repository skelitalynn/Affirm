#!/bin/bash

echo "🔒 安全检查脚本"
echo "=========================================="

# 检查.env文件是否在Git中
echo "1. 检查.env文件状态..."
if git ls-files | grep -q "^\.env$"; then
    echo "❌ 严重安全漏洞：.env文件在Git版本控制中！"
    echo "   立即执行: git rm --cached .env"
    echo "   然后提交: git commit -m '移除.env文件'"
    echo "   最后推送: git push origin main"
    exit 1
else
    echo "✅ .env文件不在Git版本控制中"
fi

# 检查.gitignore是否包含.env
echo ""
echo "2. 检查.gitignore配置..."
if grep -q "^\\.env$" .gitignore; then
    echo "✅ .gitignore正确配置了.env规则"
else
    echo "⚠️  .gitignore缺少.env规则"
    echo "   添加: echo '.env' >> .gitignore"
fi

# 检查.env文件是否存在
echo ""
echo "3. 检查本地.env文件..."
if [ -f ".env" ]; then
    echo "✅ 本地.env文件存在"
    
    # 检查是否包含示例值
    if grep -q "your_telegram_bot_token_here" .env || \
       grep -q "your_openai_api_key_here" .env || \
       grep -q "change_this_to" .env; then
        echo "⚠️  .env文件中可能包含示例值，请更新为真实密钥"
    else
        echo "✅ .env文件已配置真实密钥"
    fi
    
    # 检查文件权限
    perms=$(stat -c "%a" .env)
    if [ "$perms" = "600" ] || [ "$perms" = "400" ]; then
        echo "✅ .env文件权限正确: $perms"
    else
        echo "⚠️  .env文件权限可能过宽: $perms"
        echo "   建议设置: chmod 600 .env"
    fi
else
    echo "❌ 本地.env文件不存在"
    echo "   从模板创建: cp .env.example .env"
    echo "   然后编辑: nano .env"
fi

# 检查.env.example是否存在
echo ""
echo "4. 检查.env.example模板..."
if [ -f ".env.example" ]; then
    echo "✅ .env.example模板文件存在"
    
    # 检查是否包含真实密钥
    if grep -q "your_telegram_bot_token_here" .env.example || \
       grep -q "your_openai_api_key_here" .env.example; then
        echo "❌ 严重：.env.example中包含真实密钥！"
        echo "   立即删除并重新创建模板文件"
        exit 1
    else
        echo "✅ .env.example中不包含真实密钥"
    fi
else
    echo "❌ .env.example模板文件不存在"
fi

# 检查Git历史中是否有敏感信息
echo ""
echo "5. 检查Git历史中的敏感信息..."
sensitive_patterns=(
    "your_telegram_bot_token_here"
    "your_openai_api_key_here"
    "your_database_password"
    "your_openclaw_gateway_token"
)

found_sensitive=0
for pattern in "${sensitive_patterns[@]}"; do
    if git log -p --all | grep -q "$pattern"; then
        echo "❌ Git历史中发现敏感信息: $pattern"
        found_sensitive=1
    fi
done

if [ $found_sensitive -eq 0 ]; then
    echo "✅ Git历史中未发现已知敏感信息"
else
    echo ""
    echo "⚠️  需要从Git历史中彻底清除敏感信息:"
    echo "   考虑使用: git filter-repo --force --invert-paths --path .env"
    echo "   或联系GitHub支持删除包含敏感信息的提交"
fi

echo ""
echo "=========================================="
echo "📋 安全建议:"
echo ""
echo "1. 定期轮换API密钥"
echo "2. 使用环境变量而不是硬编码"
echo "3. 设置适当的文件权限"
echo "4. 定期运行此安全检查脚本"
echo "5. 使用密钥管理服务（如Vault）"
echo ""
echo "🔗 相关命令:"
echo "   git rm --cached .env              # 从Git移除.env"
echo "   git commit -m '移除敏感文件'      # 提交更改"
echo "   git push origin main              # 推送到远程"
echo "   chmod 600 .env                    # 设置文件权限"
echo ""
echo "✅ 安全检查完成"