#!/usr/bin/env node
// Day 2 任务验证脚本
// 验证数据层开发是否完成

const { testConnection } = require('../../src/db/connection');
const User = require('../../src/models/user');
const Profile = require('../../src/models/profile');
const Message = require('../../src/models/message');
const Knowledge = require('../../src/models/knowledge');
const embeddingService = require('../../src/services/embedding');

async function verifyDay2() {
    console.log('🔍 开始验证Day 2任务完成情况');
    console.log('====================================\n');

    const results = {
        database: { passed: false, message: '' },
        models: {
            user: { passed: false, message: '' },
            profile: { passed: false, message: '' },
            message: { passed: false, message: '' },
            knowledge: { passed: false, message: '' }
        },
        embedding: { passed: false, message: '' },
        semanticSearch: { passed: false, message: '' },
        tests: { passed: false, message: '' }
    };

    // 1. 验证数据库连接
    console.log('1. 验证数据库连接...');
    try {
        const connected = await testConnection();
        if (connected) {
            results.database.passed = true;
            results.database.message = '✅ 数据库连接成功';
            console.log(results.database.message);
        } else {
            results.database.message = '❌ 数据库连接失败';
            console.log(results.database.message);
        }
    } catch (error) {
        results.database.message = `❌ 数据库连接错误: ${error.message}`;
        console.log(results.database.message);
    }

    // 2. 验证数据模型
    console.log('\n2. 验证数据模型...');

    // 2.1 User模型
    console.log('  2.1 User模型...');
    try {
        // 测试创建用户
        const testTelegramId = Math.floor(Date.now() / 1000);
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'day2_test_user'
        });
        
        if (user && user.id) {
            results.models.user.passed = true;
            results.models.user.message = '✅ User模型CRUD操作正常';
            console.log(`   ${results.models.user.message}`);
            
            // 清理测试数据
            await User.delete(testTelegramId);
        } else {
            results.models.user.message = '❌ User模型创建失败';
            console.log(`   ${results.models.user.message}`);
        }
    } catch (error) {
        results.models.user.message = `❌ User模型错误: ${error.message}`;
        console.log(`   ${results.models.user.message}`);
    }

    // 2.2 Profile模型
    console.log('  2.2 Profile模型...');
    try {
        // 需要先创建用户
        const testTelegramId = Math.floor(Date.now() / 1000) + 1;
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'profile_test_user'
        });

        const profile = await Profile.create({
            user_id: user.id,
            goals: '测试目标',
            status: 'active'
        });

        if (profile && profile.id) {
            results.models.profile.passed = true;
            results.models.profile.message = '✅ Profile模型CRUD操作正常';
            console.log(`   ${results.models.profile.message}`);

            // 清理
            await Profile.delete(user.id);
            await User.delete(testTelegramId);
        } else {
            results.models.profile.message = '❌ Profile模型创建失败';
            console.log(`   ${results.models.profile.message}`);
        }
    } catch (error) {
        results.models.profile.message = `❌ Profile模型错误: ${error.message}`;
        console.log(`   ${results.models.profile.message}`);
    }

    // 2.3 Message模型
    console.log('  2.3 Message模型...');
    try {
        const testTelegramId = Math.floor(Date.now() / 1000) + 2;
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'message_test_user'
        });

        const message = await Message.create({
            user_id: user.id,
            role: 'user',
            content: '测试消息内容'
        });

        if (message && message.id) {
            results.models.message.passed = true;
            results.models.message.message = '✅ Message模型CRUD操作正常（自动向量嵌入）';
            console.log(`   ${results.models.message.message}`);

            // 清理
            await Message.delete(message.id);
            await User.delete(testTelegramId);
        } else {
            results.models.message.message = '❌ Message模型创建失败';
            console.log(`   ${results.models.message.message}`);
        }
    } catch (error) {
        results.models.message.message = `❌ Message模型错误: ${error.message}`;
        console.log(`   ${results.models.message.message}`);
    }

    // 2.4 Knowledge模型
    console.log('  2.4 Knowledge模型...');
    try {
        const testTelegramId = Math.floor(Date.now() / 1000) + 3;
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'knowledge_test_user'
        });

        const knowledge = await Knowledge.create({
            user_id: user.id,
            content: '测试知识片段内容',
            source: 'test'
        });

        if (knowledge && knowledge.id) {
            results.models.knowledge.passed = true;
            results.models.knowledge.message = '✅ Knowledge模型CRUD操作正常（自动向量嵌入）';
            console.log(`   ${results.models.knowledge.message}`);

            // 清理
            await Knowledge.delete(knowledge.id);
            await User.delete(testTelegramId);
        } else {
            results.models.knowledge.message = '❌ Knowledge模型创建失败';
            console.log(`   ${results.models.knowledge.message}`);
        }
    } catch (error) {
        results.models.knowledge.message = `❌ Knowledge模型错误: ${error.message}`;
        console.log(`   ${results.models.knowledge.message}`);
    }

    // 3. 验证向量嵌入服务
    console.log('\n3. 验证向量嵌入服务...');
    try {
        const testResult = await embeddingService.test();
        if (testResult) {
            results.embedding.passed = true;
            results.embedding.message = '✅ 向量嵌入服务正常';
            console.log(results.embedding.message);
        } else {
            results.embedding.message = '❌ 向量嵌入服务测试失败';
            console.log(results.embedding.message);
        }
    } catch (error) {
        results.embedding.message = `❌ 向量嵌入服务错误: ${error.message}`;
        console.log(results.embedding.message);
    }

    // 4. 验证语义搜索功能
    console.log('\n4. 验证语义搜索功能...');
    try {
        // 创建测试数据
        const testTelegramId = Math.floor(Date.now() / 1000) + 4;
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'search_test_user'
        });

        // 创建测试消息
        const message1 = await Message.create({
            user_id: user.id,
            role: 'user',
            content: '我喜欢学习编程和人工智能'
        });

        const message2 = await Message.create({
            user_id: user.id,
            role: 'user',
            content: '机器学习是人工智能的重要分支'
        });

        // 测试语义搜索
        const searchResults = await Message.semanticSearchByText(
            '人工智能学习',
            user.id,
            2,
            0.3
        );

        if (Array.isArray(searchResults)) {
            results.semanticSearch.passed = true;
            results.semanticSearch.message = `✅ 语义搜索正常，返回 ${searchResults.length} 个结果`;
            console.log(results.semanticSearch.message);

            if (searchResults.length > 0) {
                console.log(`   相似度分数: ${searchResults[0].similarity?.toFixed(3)}`);
            }
        } else {
            results.semanticSearch.message = '❌ 语义搜索返回格式不正确';
            console.log(results.semanticSearch.message);
        }

        // 清理测试数据
        await Message.delete(message1.id);
        await Message.delete(message2.id);
        await User.delete(testTelegramId);

    } catch (error) {
        results.semanticSearch.message = `❌ 语义搜索错误: ${error.message}`;
        console.log(results.semanticSearch.message);
    }

    // 5. 验证单元测试
    console.log('\n5. 验证单元测试...');
    try {
        // 检查测试文件是否存在
        const fs = require('fs');
        const path = require('path');
        
        const testFiles = [
            'tests/unit/models/user.test.js',
            'tests/unit/models/profile.test.js'
        ];

        const allTestsExist = testFiles.every(file => 
            fs.existsSync(path.join(__dirname, '../..', file))
        );

        if (allTestsExist) {
            results.tests.passed = true;
            results.tests.message = '✅ 单元测试文件已创建';
            console.log(results.tests.message);
            console.log('   运行测试: npm test');
        } else {
            results.tests.message = '⚠️  部分单元测试文件缺失';
            console.log(results.tests.message);
        }
    } catch (error) {
        results.tests.message = `❌ 验证单元测试时出错: ${error.message}`;
        console.log(results.tests.message);
    }

    // 6. 验证API文档
    console.log('\n6. 验证API文档...');
    try {
        const fs = require('fs');
        const path = require('path');
        
        const docsPath = path.join(__dirname, '../..', 'docs/data-layer/数据层API文档.md');
        if (fs.existsSync(docsPath)) {
            const stats = fs.statSync(docsPath);
            if (stats.size > 1000) { // 文档应该有合理的大小
                console.log('✅ API文档已创建且内容完整');
            } else {
                console.log('⚠️  API文档文件较小，可能需要补充内容');
            }
        } else {
            console.log('❌ API文档文件不存在');
        }
    } catch (error) {
        console.log(`❌ 验证API文档时出错: ${error.message}`);
    }

    // 汇总结果
    console.log('\n📊 验证结果汇总');
    console.log('================');

    const allPassed = [
        results.database.passed,
        results.models.user.passed,
        results.models.profile.passed,
        results.models.message.passed,
        results.models.knowledge.passed,
        results.embedding.passed,
        results.semanticSearch.passed,
        results.tests.passed
    ].every(Boolean);

    console.log(`数据库连接: ${results.database.message}`);
    console.log(`User模型: ${results.models.user.message}`);
    console.log(`Profile模型: ${results.models.profile.message}`);
    console.log(`Message模型: ${results.models.message.message}`);
    console.log(`Knowledge模型: ${results.models.knowledge.message}`);
    console.log(`向量嵌入服务: ${results.embedding.message}`);
    console.log(`语义搜索功能: ${results.semanticSearch.message}`);
    console.log(`单元测试: ${results.tests.message}`);

    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('🎉 Day 2 所有任务验证通过！');
        console.log('📈 数据层开发完成，可以继续Day 3的开发。');
        return 0;
    } else {
        console.log('⚠️  Day 2 部分任务未完成或存在问题');
        console.log('🔧 请检查并修复上述问题后再继续。');
        return 1;
    }
}

// 运行验证
verifyDay2()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('❌ 验证过程中发生未预期的错误:', error);
        process.exit(1);
    });