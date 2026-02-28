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
    console.log('📊 环境:', config.env);
    console.log('🔧 配置检查:');
    console.log('   Telegram Token:', config.telegram.botToken ? '✅ 已配置' : '❌ 未配置');
    console.log('   OpenAI API Key:', config.openai.apiKey ? '✅ 已配置' : '❌ 未配置');
    console.log('   DeepSeek API Key:', config.deepseek.apiKey ? '✅ 已配置' : '❌ 未配置');
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
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  未处理的Promise拒绝:', reason);
});

// 启动应用
if (require.main === module) {
    initialize();
}

module.exports = { initialize };