#!/usr/bin/env node
/**
 * Affirm项目 - 主入口文件
 * Telegram机器人 + AI助手
 */
require('dotenv').config();


const TelegramService = require('./services/telegram');
const config = require('./config');

// 初始化服务
async function initialize() {
    console.log('🤖 Affirm项目启动中...');
    console.log('📊 环境:', config.app.nodeEnv || 'development');
    console.log('🔧 配置检查:');
    console.log('   Telegram Token:', config.telegram.botToken ? '✅ 已配置' : '❌ 未配置');
    if (config.telegram.botToken) {
        console.log(`   Token预览: ${config.telegram.botToken.substring(0, 10)}...${config.telegram.botToken.substring(config.telegram.botToken.length - 4)}`);
    }
    console.log('   AI API Key:', config.ai.apiKey ? '✅ 已配置' : '❌ 未配置');
    console.log('   AI Provider:', config.ai.provider || 'deepseek');
    console.log('   Database URL:', config.database.url ? '✅ 已配置' : '❌ 未配置');
    
    try {
        // 启动Telegram机器人
        const telegramService = new TelegramService(config);
        await telegramService.start();
        
        console.log('🎉 Affirm机器人已启动');
        console.log('📱 机器人已准备好接收消息');
        
        // 保持进程运行
        process.on('SIGINT', () => {
            console.log('🛑 收到终止信号，正在关闭...');
            telegramService.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('🛑 收到终止信号，正在关闭...');
            telegramService.stop();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ 启动失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('⚠️  未捕获的异常:', error.message);
    console.error(error.stack);
    
    // 如果是JSON解析错误，尝试获取更多上下文
    if (error.message.includes('JSON') || error.message.includes('parse') || error.name === 'SyntaxError') {
        console.error('🔍 JSON解析错误详细信息:');
        console.error(`   错误名称: ${error.name}`);
        console.error(`   错误消息: ${error.message}`);
        
        // 尝试从错误堆栈中提取更多信息
        const stackLines = error.stack.split('\n');
        console.error(`   错误堆栈:`, stackLines.slice(0, 5).join('\n    '));
        
        // 如果错误有额外的属性，打印它们
        for (const key in error) {
            if (key !== 'message' && key !== 'stack' && key !== 'name') {
                try {
                    console.error(`   错误属性 ${key}: ${JSON.stringify(error[key])}`);
                } catch (e) {
                    console.error(`   错误属性 ${key}: [不可序列化]`);
                }
            }
        }
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  未处理的Promise拒绝:', reason);
    if (reason instanceof Error) {
        console.error('   拒绝堆栈:', reason.stack);
    }
});

// 启动应用
if (require.main === module) {
    initialize();
}

module.exports = { initialize };