#!/usr/bin/env node
/**
 * Notion集成诊断脚本
 * 诊断Notion服务与技能集成的各种问题
 */

const path = require('path');
const fs = require('fs');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function logSuccess(msg) { console.log(`${colors.green}✅ ${msg}${colors.reset}`); }
function logError(msg) { console.log(`${colors.red}❌ ${msg}${colors.reset}`); }
function logWarning(msg) { console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`); }
function logInfo(msg) { console.log(`${colors.blue}🔍 ${msg}${colors.reset}`); }
function logStep(msg) { console.log(`${colors.cyan}📝 ${msg}${colors.reset}`); }

async function runDiagnostics() {
    console.log('\n🔧 Notion集成诊断\n');
    
    // 步骤1: 检查文件存在性
    logStep('1. 检查关键文件...');
    
    const criticalFiles = [
        { path: 'src/services/notion.js', desc: 'Notion服务主文件' },
        { path: 'skills/notion/client.js', desc: 'Notion技能客户端' },
        { path: 'skills/notion/config.js', desc: 'Notion技能配置' },
        { path: 'skills/notion/archiver.js', desc: '归档器' },
        { path: 'skills/notion/tracker.js', desc: '跟踪器' },
        { path: 'skills/notion/retry.js', desc: '重试管理器' }
    ];
    
    let allFilesExist = true;
    for (const file of criticalFiles) {
        const fullPath = path.join(__dirname, file.path);
        if (fs.existsSync(fullPath)) {
            console.log(`   ${colors.green}✓${colors.reset} ${file.desc}: ${file.path}`);
        } else {
            console.log(`   ${colors.red}✗${colors.reset} ${file.desc}: ${file.path} ${colors.red}(缺失)${colors.reset}`);
            allFilesExist = false;
        }
    }
    
    if (!allFilesExist) {
        logError('关键文件缺失，无法继续诊断');
        return;
    }
    
    logSuccess('所有关键文件存在');
    
    // 步骤2: 检查模块加载
    logStep('2. 检查模块加载...');
    
    try {
        const notionService = require('../src/services/notion');
        console.log(`   ${colors.green}✓${colors.reset} NotionService模块可加载`);
        
        // 检查构造函数
        const service = new notionService();
        console.log(`   ${colors.green}✓${colors.reset} NotionService可实例化`);
        
        // 检查配置
        if (service.notionConfig) {
            console.log(`   ${colors.green}✓${colors.reset} 配置对象存在`);
        } else {
            logWarning('配置对象不存在');
        }
    } catch (error) {
        logError(`NotionService加载失败: ${error.message}`);
        console.error(`   堆栈: ${error.stack}`);
    }
    
    // 步骤3: 检查环境变量
    logStep('3. 检查环境变量...');
    
    require('dotenv').config();
    
    const envVars = [
        'NOTION_API_KEY',
        'NOTION_TOKEN', 
        'NOTION_DATABASE_ID',
        'NOTION_PARENT_PAGE_ID'
    ];
    
    envVars.forEach(varName => {
        const value = process.env[varName];
        if (value && !value.includes('your_notion')) {
            const preview = value.length > 20 ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}` : value;
            console.log(`   ${colors.green}✓${colors.reset} ${varName}: ${preview}`);
        } else if (value && value.includes('your_notion')) {
            console.log(`   ${colors.yellow}⚠${colors.reset} ${varName}: ${colors.yellow}占位符${colors.reset}`);
        } else {
            console.log(`   ${colors.red}✗${colors.reset} ${varName}: ${colors.red}未设置${colors.reset}`);
        }
    });
    
    // 步骤4: 检查技能配置模块
    logStep('4. 检查技能配置...');
    
    try {
        // 清除配置模块缓存
        const configPath = require.resolve('../skills/notion/config');
        delete require.cache[configPath];
        
        const skillConfig = require('../skills/notion/config');
        console.log(`   ${colors.green}✓${colors.reset} 技能配置可加载`);
        
        console.log(`   📊 技能配置值:`);
        console.log(`      apiKey: ${skillConfig.apiKey ? skillConfig.apiKey.substring(0, 10) + '...' : '空'}`);
        console.log(`      databaseId: ${skillConfig.databaseId || '空'}`);
        console.log(`      templatePageId: ${skillConfig.templatePageId || '空'}`);
        
        if (!skillConfig.apiKey) {
            logWarning('技能配置中的apiKey为空，可能未从环境变量读取');
        }
    } catch (error) {
        logError(`技能配置加载失败: ${error.message}`);
    }
    
    // 步骤5: 检查技能客户端
    logStep('5. 检查技能客户端...');
    
    try {
        // 清除客户端模块缓存
        const clientPath = require.resolve('../skills/notion/client');
        delete require.cache[clientPath];
        
        const NotionClient = require('../skills/notion/client');
        console.log(`   ${colors.green}✓${colors.reset} NotionClient类可加载`);
        
        // 创建实例
        const client = new NotionClient();
        console.log(`   ${colors.green}✓${colors.reset} NotionClient可实例化`);
        
        // 检查配置
        if (client.config) {
            console.log(`   ${colors.green}✓${colors.reset} 客户端配置存在`);
        } else {
            logWarning('客户端配置不存在');
        }
    } catch (error) {
        logError(`NotionClient加载失败: ${error.message}`);
        console.error(`   堆栈: ${error.stack}`);
    }
    
    // 步骤6: 测试完整初始化
    logStep('6. 测试NotionService初始化...');
    
    try {
        // 确保环境变量已设置
        const apiKey = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
        const databaseId = process.env.NOTION_DATABASE_ID;
        
        if (!apiKey || apiKey.includes('your_notion')) {
            logWarning('API密钥未正确配置，跳过初始化测试');
        } else {
            // 清除所有相关模块缓存
            const modulesToClear = [
                '../skills/notion/config',
                '../skills/notion/client', 
                '../src/services/notion'
            ];
            
            modulesToClear.forEach(modulePath => {
                try {
                    const resolved = require.resolve(modulePath);
                    delete require.cache[resolved];
                } catch (e) {
                    // 忽略
                }
            });
            
            // 重新加载
            const NotionService = require('../src/services/notion');
            const service = new NotionService();
            
            console.log('   🧪 尝试初始化...');
            
            // 模拟初始化（可能失败）
            try {
                await service.initialize();
                logSuccess('NotionService初始化成功');
                
                // 测试简单归档
                console.log('   🧪 测试归档功能...');
                try {
                    const mockMessages = [
                        { role: 'user', content: '测试消息1', timestamp: new Date().toISOString() },
                        { role: 'assistant', content: '测试回复1', timestamp: new Date().toISOString() }
                    ];
                    
                    // 注意：这会实际创建Notion页面，所以暂时注释掉
                    // const pageId = await service.archiveDailyMessages('test-user', '测试用户', mockMessages, new Date());
                    // console.log(`   ${colors.green}✓${colors.reset} 归档测试完成`);
                    
                    console.log(`   ${colors.yellow}⚠${colors.reset} 归档功能测试跳过（避免创建实际页面）`);
                    
                } catch (archiveError) {
                    logError(`归档测试失败: ${archiveError.message}`);
                }
                
            } catch (initError) {
                logError(`初始化失败: ${initError.message}`);
                console.error(`   错误详情: ${initError.stack}`);
                
                // 诊断常见问题
                if (initError.message.includes('未配置')) {
                    console.log(`   💡 建议: 检查环境变量 NOTION_API_KEY 和 NOTION_DATABASE_ID`);
                }
                if (initError.message.includes('MODULE_NOT_FOUND')) {
                    console.log(`   💡 建议: 检查技能文件路径是否正确`);
                }
                if (initError.message.includes('auth') || initError.message.includes('API token')) {
                    console.log(`   💡 建议: 检查Notion API密钥是否正确`);
                }
            }
        }
    } catch (error) {
        logError(`初始化测试失败: ${error.message}`);
    }
    
    // 步骤7: 检查Telegram服务依赖
    logStep('7. 检查Telegram服务依赖...');
    
    try {
        const telegramService = require('../src/services/telegram');
        console.log(`   ${colors.green}✓${colors.reset} TelegramService模块可加载`);
        
        // 检查导入
        const source = fs.readFileSync(path.join(__dirname, '../src/services/telegram.js'), 'utf8');
        const importsNotion = source.includes("require('./notion')") || source.includes("require('../services/notion')");
        
        if (importsNotion) {
            console.log(`   ${colors.green}✓${colors.reset} TelegramService导入NotionService`);
        } else {
            logWarning('TelegramService未导入NotionService');
        }
    } catch (error) {
        logError(`TelegramService检查失败: ${error.message}`);
    }
    
    console.log('\n📊 诊断总结');
    console.log('=' .repeat(50));
    
    console.log('\n💡 建议行动:');
    console.log('1. 确保所有技能文件存在且完整');
    console.log('2. 验证环境变量已正确设置');
    console.log('3. 检查模块缓存问题（重启应用可解决）');
    console.log('4. 运行完整测试: node test-notion-connection.js');
    console.log('5. 启动机器人测试: npm start');
    
    console.log('\n🔧 常见问题修复:');
    console.log('• 模块找不到: 检查require路径是否正确');
    console.log('• 配置为空: 清除模块缓存或重启应用');
    console.log('• 权限错误: 确保Notion数据库已分享给集成');
    console.log('• 网络错误: 检查API密钥和网络连接');
    
    console.log('\n🎉 诊断完成\n');
}

// 运行诊断
runDiagnostics().catch(error => {
    console.error('💥 诊断过程出错:', error);
    process.exit(1);
});
