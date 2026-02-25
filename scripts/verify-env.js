#!/usr/bin/env node
// 环境变量验证脚本

require('dotenv').config();
const fetch = require('node-fetch');

async function testTelegram() {
    console.log('1. 测试Telegram Bot连接...');
    try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
        const data = await response.json();
        
        if (data.ok) {
            console.log(`✅ Telegram Bot连接成功:`);
            console.log(`   🤖 ID: ${data.result.id}`);
            console.log(`   📛 名称: ${data.result.first_name}`);
            console.log(`   @ 用户名: ${data.result.username}`);
            return true;
        } else {
            console.log(`❌ Telegram连接失败: ${data.description}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Telegram连接错误: ${error.message}`);
        return false;
    }
}

async function testCodexAPI() {
    console.log('\n2. 测试Codex 5.3 API连接...');
    try {
        const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: process.env.MODEL_NAME || 'gpt-5.3-codex',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            })
        });
        
        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            console.log(`✅ Codex API连接成功:`);
            console.log(`   🤖 模型: ${process.env.MODEL_NAME}`);
            console.log(`   💬 响应: "${data.choices[0].message.content}"`);
            return true;
        } else if (data.error) {
            console.log(`❌ Codex API错误: ${data.error.message}`);
            return false;
        } else {
            console.log(`❌ Codex API未知响应:`, JSON.stringify(data).substring(0, 200));
            return false;
        }
    } catch (error) {
        console.log(`❌ Codex API连接错误: ${error.message}`);
        return false;
    }
}

async function testGitHubSSH() {
    console.log('\n3. 测试GitHub SSH连接...');
    try {
        const { execSync } = require('child_process');
        const result = execSync('ssh -T git@github.com 2>&1', { encoding: 'utf8' });
        
        if (result.includes('successfully authenticated')) {
            console.log(`✅ GitHub SSH连接成功:`);
            console.log(`   👤 用户: ${process.env.GITHUB_USERNAME}`);
            console.log(`   📦 仓库: ${process.env.GITHUB_REPO}`);
            return true;
        } else {
            console.log(`❌ GitHub SSH连接失败: ${result.trim()}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ GitHub SSH测试错误: ${error.message}`);
        return false;
    }
}

async function testOpenClaw() {
    console.log('\n4. 测试OpenClaw网关连接...');
    try {
        const response = await fetch(`${process.env.OPENCLAW_GATEWAY_URL}/api/health`, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`✅ OpenClaw网关连接成功:`);
            console.log(`   🌐 地址: ${process.env.OPENCLAW_GATEWAY_URL}`);
            console.log(`   📊 状态: ${data.status || 'healthy'}`);
            return true;
        } else {
            console.log(`❌ OpenClaw网关连接失败: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ OpenClaw网关连接错误: ${error.message}`);
        console.log(`   请检查OpenClaw服务是否运行: openclaw gateway status`);
        return false;
    }
}

async function checkDatabaseConfig() {
    console.log('\n5. 检查数据库配置...');
    const dbUrl = process.env.DB_URL;
    
    if (!dbUrl) {
        console.log('❌ DB_URL未配置');
        return false;
    }
    
    try {
        // 解析数据库URL
        const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (urlMatch) {
            const [, user, , host, port, database] = urlMatch;
            console.log(`✅ 数据库配置解析成功:`);
            console.log(`   🗄️  数据库: ${database}`);
            console.log(`   👤 用户: ${user}`);
            console.log(`   🌐 主机: ${host}:${port}`);
            return true;
        } else {
            console.log(`❌ 数据库URL格式不正确`);
            return false;
        }
    } catch (error) {
        console.log(`❌ 数据库配置检查错误: ${error.message}`);
        return false;
    }
}

async function checkRequiredEnvVars() {
    console.log('\n6. 检查必需环境变量...');
    const requiredVars = [
        'DB_URL',
        'TELEGRAM_BOT_TOKEN', 
        'OPENAI_API_KEY',
        'OPENAI_BASE_URL',
        'GITHUB_USERNAME',
        'GITHUB_REPO'
    ];
    
    let allPresent = true;
    
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (!value || value.includes('请填写') || value.includes('先留空')) {
            console.log(`❌ ${varName}: 未配置或需要填写`);
            allPresent = false;
        } else {
            console.log(`✅ ${varName}: 已配置`);
        }
    });
    
    return allPresent;
}

async function runAllTests() {
    console.log('🔍 Affirm项目环境变量验证');
    console.log('=' .repeat(50));
    
    const results = {
        telegram: await testTelegram(),
        codex: await testCodexAPI(),
        github: await testGitHubSSH(),
        openclaw: await testOpenClaw(),
        database: await checkDatabaseConfig(),
        envVars: await checkRequiredEnvVars()
    };
    
    console.log('\n' + '=' .repeat(50));
    console.log('📊 验证结果汇总:');
    console.log(`   📱 Telegram: ${results.telegram ? '✅' : '❌'}`);
    console.log(`   🤖 Codex API: ${results.codex ? '✅' : '❌'}`);
    console.log(`   🐙 GitHub SSH: ${results.github ? '✅' : '❌'}`);
    console.log(`   ⚡ OpenClaw: ${results.openclaw ? '✅' : '❌'}`);
    console.log(`   🗄️  数据库配置: ${results.database ? '✅' : '❌'}`);
    console.log(`   🔧 环境变量: ${results.envVars ? '✅' : '❌'}`);
    
    const allPassed = Object.values(results).every(result => result);
    
    console.log('\n' + '=' .repeat(50));
    if (allPassed) {
        console.log('🎉 所有环境变量验证通过！');
        console.log('项目环境已完全就绪，可以开始开发。');
    } else {
        console.log('⚠️  部分环境变量验证失败');
        console.log('请检查并修复上述问题后再继续开发。');
        process.exit(1);
    }
}

// 运行所有测试
runAllTests().catch(error => {
    console.error('❌ 验证脚本运行失败:', error);
    process.exit(1);
});