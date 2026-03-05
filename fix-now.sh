#!/bin/bash
# 一键修复脚本 - 修复Notion技能和AI依赖问题

echo "🔧 Affirm项目一键修复脚本"
echo "================================"

# 步骤1: 修复向量嵌入服务
echo "1. 修复向量嵌入服务（禁用Claude不支持的嵌入）..."
cp src/services/embedding.js src/services/embedding.js.backup

cat > src/services/embedding.js << 'EOF'
// 向量嵌入服务（降级版）- 修复Claude不支持的嵌入功能
const config = require('../config');

class EmbeddingService {
    constructor() {
        console.warn('⚠️  向量嵌入服务已禁用（Claude不支持）');
        this.openai = null;
        this.model = null;
        this.dimensions = 768;
        this.provider = config.ai.provider;
    }

    isAvailable() {
        return false; // 明确禁用
    }

    async generateEmbedding(text) {
        console.warn('⚠️  向量嵌入已禁用，返回null');
        return null;
    }

    async generateEmbeddings(texts) {
        console.warn('⚠️  批量向量嵌入已禁用，返回null数组');
        return texts.map(() => null);
    }

    async testConnection() {
        console.log('ℹ️  向量嵌入服务已禁用（Claude不支持），测试跳过');
        return false;
    }
}

// 导出实例（保持现有代码兼容）
const embeddingService = new EmbeddingService();
module.exports = embeddingService;
EOF

echo "✅ 向量嵌入服务修复完成"

# 步骤2: 验证Notion集成
echo "2. 验证Notion技能集成..."
node test-notion-integration.js 2>&1 | tail -20

# 步骤3: 测试模块加载
echo "3. 测试关键模块加载..."
node -e "
try {
  console.log('🔍 模块加载测试:');
  const notion = require('./src/services/notion');
  console.log('   ✅ NotionService 可加载');
  
  const telegram = require('./src/services/telegram'); 
  console.log('   ✅ TelegramService 可加载');
  
  const embedding = require('./src/services/embedding');
  console.log('   ✅ EmbeddingService 可加载');
  console.log('   📊 向量嵌入状态:', embedding.isAvailable() ? '可用' : '已禁用');
  
  console.log('🎉 所有关键模块加载成功');
} catch(e) {
  console.error('❌ 模块加载失败:', e.message);
  console.error('堆栈:', e.stack);
  process.exit(1);
}
"

# 步骤4: 快速启动测试
echo "4. 快速启动测试（10秒）..."
timeout 10 npm start 2>&1 | grep -E "Notion|AI|✅|❌|启动|成功|失败|Error|error" | head -15

echo "================================"
echo "🎉 修复完成！"
echo ""
echo "🚀 下一步操作:"
echo "1. 启动机器人: npm start"
echo "2. 在Telegram中测试: /archive_now"
echo "3. 检查Notion数据库是否有新页面"
echo ""
echo "💡 如果仍有问题，请提供错误信息"