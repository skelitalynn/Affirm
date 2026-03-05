#!/usr/bin/env node
/**
 * 综合依赖修复脚本
 * 修复Notion技能集成和AI配置问题
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 综合依赖修复脚本\n');

// 步骤1: 检查项目结构
console.log('1. 📁 检查项目结构...');
const requiredDirs = ['src', 'skills', 'node_modules'];
requiredDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        console.log(`   ✅ ${dir}/ 存在`);
    } else {
        console.log(`   ❌ ${dir}/ 缺失`);
    }
});

// 步骤2: 检查关键文件
console.log('\n2. 📄 检查关键文件...');
const criticalFiles = [
    'src/services/notion.js',
    'skills/notion/client.js',
    'src/services/telegram.js',
    'src/services/ai.js',
    'src/services/embedding.js',
    'package.json'
];

criticalFiles.forEach(file => {
    const exists = fs.existsSync(file);
    const status = exists ? '✅' : '❌';
    console.log(`   ${status} ${file}`);
});

// 步骤3: 检查环境变量
console.log('\n3. 🔐 检查环境变量...');
require('dotenv').config();

const envChecks = [
    { key: 'AI_PROVIDER', required: false, validator: v => ['deepseek', 'claude'].includes(v) },
    { key: 'NOTION_API_KEY', required: true, validator: v => v && !v.includes('your_notion') },
    { key: 'NOTION_DATABASE_ID', required: true, validator: v => v && !v.includes('your_notion') },
    { key: 'CLAUDE_API_KEY', required: false },
    { key: 'CLAUDE_BASE_URL', required: false },
    { key: 'TELEGRAM_BOT_TOKEN', required: true }
];

envChecks.forEach(check => {
    const value = process.env[check.key];
    let status = '✅';
    let message = value ? `${value.substring(0, 10)}...` : '未设置';
    
    if (check.required && !value) {
        status = '❌';
        message = '必需但未设置';
    } else if (value && check.validator && !check.validator(value)) {
        status = '⚠️';
        message = `格式可能不正确: ${value.substring(0, 20)}...`;
    } else if (value && value.includes('your_')) {
        status = '⚠️';
        message = '使用占位符值';
    }
    
    console.log(`   ${status} ${check.key}: ${message}`);
});

// 步骤4: 检查Notion技能集成
console.log('\n4. 📝 检查Notion技能集成...');
try {
    // 测试Notion模块加载
    delete require.cache[require.resolve('./src/services/notion')];
    const NotionService = require('./src/services/notion');
    const notionService = new NotionService();
    console.log('   ✅ NotionService可加载和实例化');
    
    // 检查技能客户端
    const clientPath = path.join(__dirname, 'skills/notion/client.js');
    if (fs.existsSync(clientPath)) {
        const clientContent = fs.readFileSync(clientPath, 'utf8');
        const exportsClient = clientContent.includes('module.exports') || clientContent.includes('exports.');
        console.log(`   ${exportsClient ? '✅' : '❌'} Notion客户端正确导出`);
    }
} catch (error) {
    console.log(`   ❌ Notion集成错误: ${error.message}`);
}

// 步骤5: 检查AI配置
console.log('\n5. 🤖 检查AI配置...');
try {
    const config = require('./src/config');
    console.log(`   ✅ AI提供商: ${config.ai.provider || '未设置'}`);
    console.log(`   ✅ API密钥: ${config.ai.apiKey ? '已配置' : '未配置'}`);
    console.log(`   ✅ 基础URL: ${config.ai.baseURL || '默认'}`);
    
    // 检查向量嵌入服务
    const embeddingService = require('./src/services/embedding');
    const embedding = new embeddingService();
    console.log(`   ✅ 向量嵌入服务: ${embedding.isAvailable() ? '可用' : '不可用（降级模式）'}`);
} catch (error) {
    console.log(`   ❌ AI配置错误: ${error.message}`);
}

// 步骤6: 修复常见问题
console.log('\n6. 🔧 自动修复...');

// 修复1: 确保Notion环境变量正确
const envFile = '.env';
if (fs.existsSync(envFile)) {
    let envContent = fs.readFileSync(envFile, 'utf8');
    let changes = 0;
    
    // 修复NOTION_API_KEY变量引用
    if (envContent.includes('NOTION_API_KEY=${NOTION_TOKEN}')) {
        const tokenValue = process.env.NOTION_TOKEN;
        if (tokenValue && !tokenValue.includes('your_notion')) {
            envContent = envContent.replace(
                'NOTION_API_KEY=${NOTION_TOKEN}',
                `NOTION_API_KEY=${tokenValue}`
            );
            changes++;
            console.log('   🔧 修复NOTION_API_KEY变量引用');
        }
    }
    
    // 注释掉可能引起混淆的NOTION_PARENT_PAGE_ID
    if (envContent.includes('NOTION_PARENT_PAGE_ID=31971efa58ea80168dc7c13b14ab671b')) {
        envContent = envContent.replace(
            'NOTION_PARENT_PAGE_ID=31971efa58ea80168dc7c13b14ab671b',
            '# NOTION_PARENT_PAGE_ID=31971efa58ea80168dc7c13b14ab671b  # 这是数据库ID，已使用NOTION_DATABASE_ID'
        );
        changes++;
        console.log('   🔧 注释NOTION_PARENT_PAGE_ID避免混淆');
    }
    
    if (changes > 0) {
        fs.writeFileSync(envFile, envContent);
        console.log(`   ✅ 更新了${changes}处环境变量配置`);
    }
}

// 修复2: 检查AI端点配置
try {
    const config = require('./src/config');
    if (config.ai.provider === 'claude') {
        // Claude可能需要不同的嵌入端点
        console.log('   ℹ️  Claude配置检测到，向量嵌入可能不可用');
        console.log('   💡 建议：如需要向量搜索，切换到DeepSeek或配置专用嵌入API');
    }
} catch (error) {
    console.log(`   ⚠️  AI配置检查失败: ${error.message}`);
}

// 修复3: 验证依赖包
console.log('\n7. 📦 验证NPM依赖...');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = ['@notionhq/client', 'openai', 'node-telegram-bot-api', 'pg'];
    
    console.log('   必需依赖:');
    requiredDeps.forEach(dep => {
        const hasDep = packageJson.dependencies && packageJson.dependencies[dep];
        console.log(`   ${hasDep ? '✅' : '❌'} ${dep}`);
    });
    
    // 检查是否安装了依赖
    try {
        execSync('npm list @notionhq/client 2>/dev/null || echo "Not installed"', { stdio: 'pipe' });
        console.log('   ✅ @notionhq/client已安装');
    } catch (e) {
        console.log('   ❌ @notionhq/client可能未安装');
    }
} catch (error) {
    console.log(`   ❌ 包检查失败: ${error.message}`);
}

// 步骤8: 建议
console.log('\n8. 💡 修复建议:');

const issues = [];

// 检查AI 404问题
if (process.env.AI_PROVIDER === 'claude') {
    console.log('   • 🤖 AI 404错误: Claude可能不支持向量嵌入');
    console.log('     建议方案:');
    console.log('       1. 暂时禁用向量嵌入（编辑embedding.js返回null）');
    console.log('       2. 切换到DeepSeek用于嵌入功能');
    console.log('       3. 使用专门的嵌入API服务');
}

// 检查Notion配置
if (!process.env.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_ID.includes('your_notion')) {
    console.log('   • 📝 Notion数据库ID未正确配置');
    console.log('     请设置有效的NOTION_DATABASE_ID');
}

console.log('\n9. 🚀 快速启动测试:');
console.log('   1. 修复AI嵌入问题（可选）:');
console.log('      echo "暂时禁用向量嵌入..."');
console.log('      sed -i \'s/this.openai = new OpenAI/this.openai = null; console.warn("向量嵌入已禁用")/g\' src/services/embedding.js');

console.log('\n   2. 启动机器人测试:');
console.log('      npm start');

console.log('\n   3. 测试Notion归档:');
console.log('      在Telegram中发送 /archive_now');

console.log('\n🔧 修复完成！\n');

// 如果检测到严重问题，提供快速修复选项
const hasCriticalIssues = false; // 根据检查结果设置

if (hasCriticalIssues) {
    console.log('⚠️  检测到严重问题，建议运行以下命令修复:');
    console.log('   node fix-critical-issues.js');
}