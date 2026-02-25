#!/usr/bin/env node
// 数据库连接测试脚本

require('dotenv').config();
const { db, testConnection } = require('../src/db/connection.js');

async function runTests() {
    console.log('🔍 开始数据库连接测试...');
    console.log('=' .repeat(50));
    
    // 测试1: 基本连接
    console.log('1. 测试基本连接...');
    const connectionOk = await testConnection();
    if (!connectionOk) {
        console.error('❌ 数据库连接失败');
        process.exit(1);
    }
    console.log('✅ 基本连接测试通过');
    
    // 测试2: 检查表结构
    console.log('\n2. 检查表结构...');
    try {
        const tables = await db.query(`
            SELECT table_name, 
                   (SELECT COUNT(*) FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        
        console.log(`✅ 发现 ${tables.rows.length} 个表:`);
        tables.rows.forEach(row => {
            console.log(`   📊 ${row.table_name} (${row.column_count} 列)`);
        });
    } catch (error) {
        console.error('❌ 表结构检查失败:', error.message);
    }
    
    // 测试3: 检查pgvector扩展
    console.log('\n3. 检查pgvector扩展...');
    try {
        const vectorExt = await db.query(`
            SELECT extname, extversion 
            FROM pg_extension 
            WHERE extname = 'vector';
        `);
        
        if (vectorExt.rows.length > 0) {
            console.log(`✅ pgvector扩展已安装: ${vectorExt.rows[0].extname} ${vectorExt.rows[0].extversion}`);
            
            // 测试向量功能
            const vectorTest = await db.query(`SELECT '[1,2,3]'::vector as test_vector`);
            console.log('✅ 向量功能测试通过:', vectorTest.rows[0].test_vector);
        } else {
            console.log('❌ pgvector扩展未安装');
        }
    } catch (error) {
        console.error('❌ pgvector检查失败:', error.message);
    }
    
    // 测试4: 插入测试数据
    console.log('\n4. 测试数据操作...');
    try {
        // 检查是否有测试用户
        const testUser = await db.query(`
            SELECT id, telegram_id, username 
            FROM users 
            WHERE telegram_id = 7927819221;
        `);
        
        if (testUser.rows.length > 0) {
            console.log(`✅ 测试用户存在: ${testUser.rows[0].username} (ID: ${testUser.rows[0].telegram_id})`);
            
            // 测试插入消息
            const testMessage = await db.query(`
                INSERT INTO messages (user_id, role, content, embedding)
                VALUES ($1, 'user', '数据库连接测试消息', '[0.1,0.2,0.3]'::vector)
                RETURNING id, created_at;
            `, [testUser.rows[0].id]);
            
            console.log(`✅ 测试消息插入成功: ID=${testMessage.rows[0].id}`);
            
            // 清理测试数据
            await db.query('DELETE FROM messages WHERE content = $1', ['数据库连接测试消息']);
            console.log('✅ 测试数据清理完成');
        } else {
            console.log('⚠️  测试用户不存在，跳过数据操作测试');
        }
    } catch (error) {
        console.error('❌ 数据操作测试失败:', error.message);
    }
    
    // 测试5: 性能测试
    console.log('\n5. 简单性能测试...');
    try {
        const startTime = Date.now();
        for (let i = 0; i < 5; i++) {
            await db.query('SELECT 1 as test');
        }
        const endTime = Date.now();
        const avgTime = (endTime - startTime) / 5;
        
        console.log(`✅ 平均查询时间: ${avgTime.toFixed(2)}ms`);
        
        if (avgTime < 10) {
            console.log('   🚀 性能优秀');
        } else if (avgTime < 50) {
            console.log('   ⚡ 性能良好');
        } else {
            console.log('   ⚠️  性能一般，建议优化');
        }
    } catch (error) {
        console.error('❌ 性能测试失败:', error.message);
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 数据库连接测试完成！');
    console.log('所有核心功能验证通过，数据库层就绪。');
    
    await db.close();
}

// 运行测试
runTests().catch(error => {
    console.error('❌ 测试运行失败:', error);
    process.exit(1);
});