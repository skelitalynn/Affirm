#!/usr/bin/env node
/**
 * 系统状态检查脚本
 */
require('dotenv').config();
const config = require('./src/config');
const { db } = require('./src/db/connection');

async function checkSystemStatus() {
    console.log('🔍 Affirm项目系统状态检查');
    console.log('='.repeat(60));
    
    let allOk = true;
    
    // 1. 检查环境变量
    console.log('\n1. 📋 环境变量检查:');
    const requiredVars = [
        'TELEGRAM_BOT_TOKEN',
        'DB_URL'
    ];
    
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (!value || value.includes('请填写')) {
            console.log(`   ❌ ${varName}: 未配置`);
            allOk = false;
        } else {
            console.log(`   ✅ ${varName}: 已配置`);
        }
    });
    
    // 检查AI配置（可选但建议）
    const aiVars = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY'];
    const hasAiKey = aiVars.some(varName => process.env[varName] && !process.env[varName].includes('请填写'));
    if (hasAiKey) {
        console.log(`   ✅ AI API密钥: 已配置 (${aiVars.find(varName => process.env[varName] && !process.env[varName].includes('请填写'))})`);
    } else {
        console.log(`   ⚠️  AI API密钥: 未配置 (AI功能将不可用)`);
        // 这不视为失败，因为AI是可选的
    }
    
    // 2. 检查数据库连接
    console.log('\n2. 🗄️  数据库连接检查:');
    try {
        const result = await db.query('SELECT NOW() as time, COUNT(*) as user_count FROM users');
        console.log(`   ✅ 数据库连接正常`);
        console.log(`     服务器时间: ${result.rows[0].time}`);
        console.log(`     用户数量: ${result.rows[0].user_count}`);
    } catch (error) {
        console.log(`   ❌ 数据库连接失败: ${error.message}`);
        allOk = false;
    }
    
    // 3. 检查数据表
    console.log('\n3. 📊 数据表检查:');
    const requiredTables = ['users', 'messages', 'knowledge_chunks', 'profiles'];
    for (const table of requiredTables) {
        try {
            const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`   ✅ ${table}: 存在 (${result.rows[0].count} 条记录)`);
        } catch (error) {
            console.log(`   ❌ ${table}: 不存在或无法访问`);
            allOk = false;
        }
    }
    
    // 4. 检查配置
    console.log('\n4. ⚙️  配置检查:');
    console.log(`   Telegram Token: ${config.telegram.botToken ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   AI API Key: ${config.ai.apiKey ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   AI Base URL: ${config.ai.baseURL}`);
    console.log(`   AI Model: ${config.ai.model}`);
    
    // 5. 检查Message模型功能
    console.log('\n5. 💬 Message模型检查:');
    try {
        const Message = require('./src/models/message');
        const testCount = await db.query('SELECT COUNT(*) as count FROM messages LIMIT 1');
        console.log(`   ✅ Message模型可用`);
        console.log(`     消息总数: ${testCount.rows[0].count}`);
    } catch (error) {
        console.log(`   ❌ Message模型检查失败: ${error.message}`);
        allOk = false;
    }
    
    // 6. 检查User模型功能
    console.log('\n6. 👤 User模型检查:');
    try {
        const User = require('./src/models/user');
        const testUser = await User.findByTelegramId(7927819221);
        if (testUser) {
            console.log(`   ✅ User模型可用 (测试用户存在)`);
        } else {
            console.log(`   ✅ User模型可用 (测试用户不存在，这是正常的)`);
        }
    } catch (error) {
        console.log(`   ❌ User模型检查失败: ${error.message}`);
        allOk = false;
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (allOk) {
        console.log('🎉 系统状态: ✅ 所有必需检查通过');
        console.log('\n📝 启动建议:');
        console.log('   1. 运行 `npm start` 启动Telegram机器人');
        console.log('   2. 在Telegram中搜索你的机器人用户名');
        console.log('   3. 发送 /start 命令开始对话');
        console.log('   4. 发送任何消息测试AI回复');
    } else {
        console.log('⚠️  系统状态: ❌ 存在一些问题');
        console.log('\n🔧 修复建议:');
        console.log('   1. 检查 .env 文件中的环境变量');
        console.log('   2. 确保数据库服务正在运行');
        console.log('   3. 运行数据库迁移脚本: npm run db:migrate');
        console.log('   4. 重新运行此检查脚本');
    }
    
    console.log('\n🔧 调试命令:');
    console.log('   • 启动机器人: npm start');
    console.log('   • 验证环境: npm run verify');
    console.log('   • 数据库迁移: npm run db:migrate');
    console.log('   • 运行测试: npm test');
    
    process.exit(allOk ? 0 : 1);
}

// 运行检查
checkSystemStatus().catch(error => {
    console.error('❌ 检查过程中出错:', error.message);
    console.error(error.stack);
    process.exit(1);
});