// Notion归档测试脚本
const DailyArchiver = require('./archiver');
const ArchiveTracker = require('./tracker');
const RetryManager = require('./retry');

async function testArchive() {
    console.log('🧪 开始Notion归档测试...');
    
    try {
        // 初始化组件
        const tracker = new ArchiveTracker();
        const retryManager = new RetryManager(2, 500); // 最多重试2次
        const archiver = new DailyArchiver();
        
        // 模拟归档日期
        const testDate = new Date();
        const dateStr = testDate.toISOString().split('T')[0];
        
        console.log(`📅 测试归档日期: ${dateStr}`);
        
        // 开始跟踪
        const archiveId = tracker.startArchive(dateStr);
        
        // 使用重试机制执行归档
        try {
            const result = await retryManager.executeWithRetry(async () => {
                // 注意：实际测试需要配置Notion API密钥
                // 这里模拟归档成功
                console.log('📦 模拟归档执行...');
                
                // 模拟网络延迟
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 模拟成功
                return {
                    id: 'mock_page_123',
                    url: 'https://notion.so/mock-page',
                    archivedAt: new Date().toISOString()
                };
            });
            
            // 记录成功
            tracker.completeArchive(archiveId, result.id);
            console.log(`✅ 归档测试成功: ${result.url}`);
            
        } catch (error) {
            // 记录失败
            tracker.failArchive(archiveId, error);
            console.error(`❌ 归档测试失败: ${error.message}`);
        }
        
        // 显示统计
        const stats = tracker.getStats();
        console.log('📊 归档统计:', stats);
        
        // 显示日期状态
        const dateStatus = tracker.getDateArchiveStatus(dateStr);
        console.log('📅 日期归档状态:', dateStatus);
        
        console.log('🧪 Notion归档测试完成');
        
    } catch (error) {
        console.error('💥 测试过程中出现错误:', error);
    }
}

// 运行测试
testArchive();
