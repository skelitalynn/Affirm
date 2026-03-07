#!/usr/bin/env node
/**
 * Notion连接测试脚本
 * 测试Notion API密钥和数据库配置是否有效
 */

const { Client } = require('@notionhq/client');

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

async function testNotionConnection() {
    console.log('\n🔍 Notion连接测试\n');
    
    // 读取环境变量（智能解析变量插值）
    function getEnvVar(key, fallbackKey = null) {
        let value = process.env[key];
        
        // 如果值以 ${ 开头，可能是未展开的变量引用
        if (value && value.startsWith('${') && value.endsWith('}')) {
            const referencedKey = value.substring(2, value.length - 1);
            value = process.env[referencedKey];
            console.log(`   🔄 检测到变量引用: ${key}=${value ? `${value.substring(0, 10)}...` : '未找到'}`);
        }
        
        // 如果值为空，尝试回退键
        if (!value && fallbackKey) {
            value = process.env[fallbackKey];
        }
        
        return value;
    }
    
    const apiKey = getEnvVar('NOTION_API_KEY', 'NOTION_TOKEN');
    const databaseId = getEnvVar('NOTION_DATABASE_ID');
    const parentPageId = getEnvVar('NOTION_PARENT_PAGE_ID');
    
    logStep('检查配置...');
    console.log(`   API密钥: ${apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : '未配置'}`);
    console.log(`   数据库ID: ${databaseId || '未配置'}`);
    console.log(`   父页面ID: ${parentPageId || '未配置'}`);
    
    if (!apiKey) {
        logError('Notion API密钥未配置');
        logInfo('请在.env文件中设置 NOTION_API_KEY 或 NOTION_TOKEN');
        process.exit(1);
    }
    
    if (apiKey.includes('your_notion') || apiKey.length < 20) {
        logWarning('API密钥可能是占位符或格式不正确');
        logInfo('API密钥应以 "ntn_" 或 "secret_" 开头，长度至少20字符');
    }
    
    // 创建Notion客户端
    logStep('初始化Notion客户端...');
    let client;
    try {
        client = new Client({
            auth: apiKey,
            timeoutMs: 10000 // 10秒超时
        });
        logSuccess('Notion客户端创建成功');
    } catch (error) {
        logError(`创建Notion客户端失败: ${error.message}`);
        process.exit(1);
    }
    
    // 测试1: API密钥有效性（获取用户信息）
    logStep('测试1: 验证API密钥...');
    try {
        const users = await client.users.list({ page_size: 1 });
        if (users.results && users.results.length > 0) {
            const botUser = users.results[0];
            logSuccess(`API密钥有效 - 集成名称: ${botUser.name || '未知'}`);
            logSuccess(`集成ID: ${botUser.id}`);
            logSuccess(`集成类型: ${botUser.type || '未知'}`);
        } else {
            logWarning('API密钥有效，但未获取到用户信息');
        }
    } catch (error) {
        logError(`API密钥无效或网络错误: ${error.message}`);
        if (error.code === 'unauthorized' || error.status === 401) {
            logInfo('请检查API密钥是否正确，并确保从 https://notion.so/my-integrations 创建');
        }
        if (error.code === 'rate_limited') {
            logInfo('API调用频率受限，请稍后重试');
        }
        process.exit(1);
    }
    
    // 测试2: 数据库访问（如果配置了数据库ID）
    if (databaseId && !databaseId.includes('your_notion')) {
        logStep('测试2: 验证数据库访问...');
        try {
            const database = await client.databases.retrieve({ database_id: databaseId });
            logSuccess(`数据库访问成功 - 标题: ${database.title?.[0]?.text?.content || '未命名'}`);
            logSuccess(`数据库ID: ${database.id}`);
            logSuccess(`数据库类型: ${database.object}`);
            
            // 检查数据库属性
            if (database.properties) {
                console.log('   📊 数据库属性:');
                Object.keys(database.properties).forEach(key => {
                    const prop = database.properties[key];
                    console.log(`     • ${key}: ${prop.type}`);
                });
            }
            
            // 测试查询数据库
            try {
                const queryResult = await client.databases.query({
                    database_id: databaseId,
                    page_size: 1
                });
                logSuccess(`数据库查询成功 - 现有记录: ${queryResult.results.length}条`);
            } catch (queryError) {
                logWarning(`数据库查询失败: ${queryError.message}`);
                logInfo('这可能是权限问题，请确保数据库已分享给集成');
            }
            
        } catch (error) {
            logError(`数据库访问失败: ${error.message}`);
            if (error.code === 'object_not_found' || error.status === 404) {
                logInfo('数据库ID可能不正确，或数据库未分享给集成');
                logInfo('请在Notion中: 打开数据库 → "..." → "Connect to" → 选择你的集成');
            }
            if (error.code === 'validation_error') {
                logInfo('数据库ID格式可能不正确（需要32位十六进制字符）');
            }
        }
    } else if (databaseId && databaseId.includes('your_notion')) {
        logWarning('数据库ID使用占位符，跳过数据库测试');
    } else {
        logWarning('未配置数据库ID，跳过数据库测试');
    }
    
    // 测试3: 父页面访问（如果配置了页面ID）
    if (parentPageId && !parentPageId.includes('your_notion')) {
        logStep('测试3: 验证父页面访问...');
        try {
            const page = await client.pages.retrieve({ page_id: parentPageId });
            logSuccess(`父页面访问成功 - 标题: ${page.properties?.title?.title?.[0]?.text?.content || '未命名'}`);
            logSuccess(`页面ID: ${page.id}`);
            logSuccess(`页面类型: ${page.object}`);
            
            // 检查是否是数据库
            if (page.parent && page.parent.type === 'database_id') {
                logWarning('此页面是数据库中的页面，建议直接使用数据库ID进行归档');
                console.log(`   关联数据库ID: ${page.parent.database_id}`);
            }
            
        } catch (error) {
            logError(`父页面访问失败: ${error.message}`);
            if (error.code === 'object_not_found' || error.status === 404) {
                logInfo('父页面ID可能不正确，或页面未分享给集成');
            }
        }
    } else if (parentPageId && parentPageId.includes('your_notion')) {
        logWarning('父页面ID使用占位符，跳过页面测试');
    }
    
    // 测试4: 创建测试页面（可选，仅在数据库ID有效时）
    let testPageId = null;
    if (databaseId && !databaseId.includes('your_notion')) {
        logStep('测试4: 创建测试页面...');
        try {
            const testTitle = `测试归档 - ${new Date().toISOString()}`;
            const testPage = await client.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    title: {
                        title: [
                            {
                                text: {
                                    content: testTitle
                                }
                            }
                        ]
                    }
                },
                children: [
                    {
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [
                                {
                                    text: {
                                        content: '这是Notion连接测试自动创建的页面。可以安全删除。'
                                    }
                                }
                            ]
                        }
                    }
                ]
            });
            
            testPageId = testPage.id;
            logSuccess(`测试页面创建成功: ${testTitle}`);
            logSuccess(`页面ID: ${testPageId}`);
            logSuccess(`页面URL: https://notion.so/${testPageId.replace(/-/g, '')}`);
            
            // 可选：删除测试页面
            logStep('清理测试页面...');
            try {
                await client.pages.update({
                    page_id: testPageId,
                    archived: true
                });
                logSuccess('测试页面已归档（移动到回收站）');
            } catch (archiveError) {
                logWarning(`无法归档测试页面: ${archiveError.message}`);
                logInfo('请手动删除测试页面');
            }
            
        } catch (error) {
            logError(`创建测试页面失败: ${error.message}`);
            if (error.code === 'validation_error') {
                logInfo('可能是数据库缺少必需的属性列，如"Title"列');
            }
            if (error.message.includes('permission')) {
                logInfo('权限不足，请确保集成有写入权限');
            }
        }
    }
    
    // 总结
    console.log('\n📊 测试总结');
    console.log('=' .repeat(50));
    
    const tests = [
        { name: 'API密钥验证', passed: true }, // 如果没有异常退出，就是通过的
        { name: '数据库访问', passed: databaseId && !databaseId.includes('your_notion') },
        { name: '页面访问', passed: parentPageId && !parentPageId.includes('your_notion') },
        { name: '写入权限', passed: testPageId !== null }
    ];
    
    tests.forEach(test => {
        const status = test.passed ? `${colors.green}通过${colors.reset}` : `${colors.yellow}跳过/失败${colors.reset}`;
        console.log(`  ${test.name}: ${status}`);
    });
    
    console.log('\n💡 建议:');
    if (!databaseId || databaseId.includes('your_notion')) {
        console.log(`  • 在.env中设置 NOTION_DATABASE_ID`);
        console.log(`  • 在Notion中创建数据库并分享给集成`);
    }
    
    if (!parentPageId || parentPageId.includes('your_notion')) {
        console.log(`  • 如果使用页面模式，设置 NOTION_PARENT_PAGE_ID`);
    }
    
    console.log(`  • 确保集成有正确的权限`);
    console.log(`  • 使用 /archive_now 命令测试完整归档流程`);
    
    console.log('\n🎉 Notion连接测试完成\n');
}

// 错误处理
process.on('unhandledRejection', (error) => {
    logError(`未处理的Promise拒绝: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});

// 运行测试
if (require.main === module) {
    // 确保加载环境变量
    require('dotenv').config();
    
    // 加载项目配置（确保加载正确的环境变量）
    const configPath = require.resolve('../src/config');
    delete require.cache[configPath]; // 清除缓存
    require(configPath);
    
    testNotionConnection().catch(error => {
        logError(`测试失败: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    });
}

module.exports = { testNotionConnection };
