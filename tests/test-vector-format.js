// 测试pgvector向量格式
require('dotenv').config();
const { db } = require('./src/db/connection');

async function testVectorFormat() {
    console.log('🔍 测试pgvector向量格式');
    
    try {
        // 1. 检查vector维度
        console.log('\n1. 检查vector类型维度...');
        const dimResult = await db.query(`
            SELECT 
                atttypmod as dimension
            FROM pg_attribute 
            WHERE attrelid = 'messages'::regclass 
            AND attname = 'embedding'
        `);
        
        if (dimResult.rows.length > 0) {
            const dimension = dimResult.rows[0].dimension;
            console.log(`📊 embedding列维度: ${dimension}`);
            // typmod编码：低16位是维度
            if (dimension > 0) {
                const actualDim = dimension & 0xFFFF;
                console.log(`📊 实际向量维度: ${actualDim}`);
            }
        }
        
        // 2. 测试不同格式的向量插入
        console.log('\n2. 测试向量格式插入...');
        
        // 先创建一个临时测试用户
        const testTelegramId = Math.floor(Date.now() / 1000);
        const userResult = await db.query(
            'INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id',
            [testTelegramId, 'vector_test_user']
        );
        const testUserId = userResult.rows[0].id;
        console.log(`✅ 创建测试用户: ${testUserId}`);
        
        // 测试1: 使用数组格式插入
        console.log('\n测试1: 使用JavaScript数组格式');
        const testArray = [0.1, 0.2, 0.3, 0.4];
        // 只测试4维，避免维度不匹配
        
        try {
            const insert1 = await db.query(`
                INSERT INTO messages (user_id, role, content, embedding)
                VALUES ($1, $2, $3, $4::vector)
                RETURNING id, pg_typeof(embedding) as type
            `, [testUserId, 'user', '测试数组格式', testArray]);
            
            console.log(`✅ 数组格式插入成功: ID=${insert1.rows[0].id}, 类型=${insert1.rows[0].type}`);
        } catch (error) {
            console.error(`❌ 数组格式插入失败: ${error.message}`);
        }
        
        // 测试2: 使用字符串格式插入
        console.log('\n测试2: 使用字符串格式 [0.5, 0.6, 0.7, 0.8]');
        try {
            const insert2 = await db.query(`
                INSERT INTO messages (user_id, role, content, embedding)
                VALUES ($1, $2, $3, $4::vector)
                RETURNING id, pg_typeof(embedding) as type
            `, [testUserId, 'user', '测试字符串格式', '[0.5, 0.6, 0.7, 0.8]']);
            
            console.log(`✅ 字符串格式插入成功: ID=${insert2.rows[0].id}, 类型=${insert2.rows[0].type}`);
        } catch (error) {
            console.error(`❌ 字符串格式插入失败: ${error.message}`);
        }
        
        // 测试3: 使用pgvector Vector对象
        console.log('\n测试3: 使用pgvector Vector对象');
        try {
            const { Vector } = require('pgvector');
            const vectorObj = new Vector([0.9, 1.0, 1.1, 1.2]);
            
            const insert3 = await db.query(`
                INSERT INTO messages (user_id, role, content, embedding)
                VALUES ($1, $2, $3, $4)
                RETURNING id, pg_typeof(embedding) as type
            `, [testUserId, 'user', '测试Vector对象', vectorObj]);
            
            console.log(`✅ Vector对象插入成功: ID=${insert3.rows[0].id}, 类型=${insert3.rows[0].type}`);
        } catch (error) {
            console.error(`❌ Vector对象插入失败: ${error.message}`);
        }
        
        // 测试4: 查询向量相似度
        console.log('\n测试4: 测试向量相似度查询');
        try {
            const queryResult = await db.query(`
                SELECT 
                    id,
                    content,
                    embedding <=> '[0.1, 0.2, 0.3, 0.4]'::vector as distance
                FROM messages 
                WHERE user_id = $1 AND embedding IS NOT NULL
                ORDER BY embedding <=> '[0.1, 0.2, 0.3, 0.4]'::vector
                LIMIT 3
            `, [testUserId]);
            
            console.log(`📊 相似度查询结果: ${queryResult.rows.length}条`);
            queryResult.rows.forEach(row => {
                console.log(`  ID: ${row.id}, 内容: "${row.content}", 距离: ${row.distance}`);
            });
        } catch (error) {
            console.error(`❌ 相似度查询失败: ${error.message}`);
        }
        
        // 清理测试数据
        console.log('\n清理测试数据...');
        await db.query('DELETE FROM messages WHERE user_id = $1', [testUserId]);
        await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
        console.log('✅ 测试数据清理完成');
        
        // 3. 检查实际数据库中的vector维度定义
        console.log('\n3. 检查表定义...');
        const tableDef = await db.query(`
            SELECT pg_get_expr(adbin, adrelid) as column_def
            FROM pg_attrdef 
            WHERE adrelid = 'messages'::regclass 
            AND adnum = (
                SELECT attnum FROM pg_attribute 
                WHERE attrelid = 'messages'::regclass 
                AND attname = 'embedding'
            )
        `);
        
        if (tableDef.rows.length > 0) {
            console.log(`📊 embedding列定义: ${tableDef.rows[0].column_def}`);
        }
        
        // 检查创建表的SQL
        const createSQL = await db.query(`
            SELECT pg_get_viewdef('messages'::regclass, true) as create_sql
        `);
        
        console.log('\n✅ 向量格式测试完成');
        return true;
        
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        return false;
    }
}

// 运行测试
testVectorFormat().then(success => {
    process.exit(success ? 0 : 1);
});