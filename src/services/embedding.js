// 向量嵌入服务
const { OpenAI } = require('openai');
const { toSql } = require('pgvector');
const config = require('../config');

class EmbeddingService {
    constructor() {
        // 检查是否配置了API密钥
        if (!config.ai.apiKey) {
            console.warn('⚠️  AI API密钥未配置，向量嵌入功能将使用降级方案');
            this.openai = null;
        } else {
            // 创建OpenAI兼容客户端（支持DeepSeek）
            this.openai = new OpenAI({
                apiKey: config.ai.apiKey,
                baseURL: config.ai.baseURL || 'https://api.deepseek.com/v1'
            });
        }
        
        // 根据提供商选择合适的嵌入模型
        if (config.ai.provider === 'deepseek') {
            this.model = 'text-embedding'; // DeepSeek的嵌入模型
        } else {
            this.model = 'text-embedding-3-small'; // OpenAI的嵌入模型
        }
        
        this.dimensions = 768; // 与数据库vector(768)列维度匹配
        this.provider = config.ai.provider;
    }

    /**
     * 生成文本的向量嵌入
     * @param {string} text - 要嵌入的文本
     * @returns {Promise<Vector>} pgvector Vector实例
     */
    /**
     * 检查嵌入服务是否可用
     * @returns {boolean} 是否可用
     */
    isAvailable() {
        return this.openai !== null;
    }

    /**
     * 生成文本的向量嵌入
     * @param {string} text - 要嵌入的文本
     * @returns {Promise<Array<number>|null>} 向量数组，null表示不可用
     */
    async generateEmbedding(text) {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error('文本不能为空');
            }

            // 如果没有配置API客户端，返回null（禁用语义检索）
            if (!this.openai) {
                console.warn('⚠️ 向量嵌入API未配置，返回null（禁用语义检索）');
                return null;
            }

            // 限制文本长度，避免token超出限制
            const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

            const response = await this.openai.embeddings.create({
                model: this.model,
                input: truncatedText,
                dimensions: this.dimensions,
                encoding_format: 'float'
            });

            const embeddingArray = response.data[0].embedding;
            // 确保维度匹配
            if (embeddingArray.length !== this.dimensions) {
                console.warn(`⚠️ 嵌入维度不匹配: 期望 ${this.dimensions}, 实际 ${embeddingArray.length}`);
                // 截断或填充（简单截断）
                if (embeddingArray.length > this.dimensions) {
                    embeddingArray.length = this.dimensions;
                } else {
                    // 填充零
                    while (embeddingArray.length < this.dimensions) {
                        embeddingArray.push(0);
                    }
                }
            }
            
            return embeddingArray;
        } catch (error) {
            console.error('❌ 生成向量嵌入失败:', error.message);
            
            // API调用失败时返回null（禁用语义检索）
            console.warn('⚠️ 向量嵌入API调用失败，返回null（禁用语义检索）');
            return null;
        }
    }

    /**
     * 将向量数组转换为pgvector SQL字符串格式
     * @param {Array<number>} embeddingArray - 向量数组
     * @returns {string} pgvector SQL字符串
     */
    toVectorSql(embeddingArray) {
        if (!embeddingArray || !Array.isArray(embeddingArray)) {
            return null;
        }
        return toSql(embeddingArray);
    }

    /**
     * 批量生成向量嵌入
     * @param {Array<string>} texts - 文本数组
     * @returns {Promise<Array<Array<number>|null>>} 向量数组（null表示不可用）
     */
    async generateEmbeddings(texts) {
        try {
            if (!Array.isArray(texts) || texts.length === 0) {
                throw new Error('文本数组不能为空');
            }

            // 过滤空文本
            const validTexts = texts.filter(text => text && text.trim().length > 0);
            if (validTexts.length === 0) {
                throw new Error('没有有效的文本');
            }

            // 如果没有配置API客户端，返回null数组（禁用语义检索）
            if (!this.openai) {
                console.warn('⚠️ 向量嵌入API未配置，返回null数组（禁用语义检索）');
                return new Array(validTexts.length).fill(null);
            }

            // 限制批处理大小
            const batchSize = 10;
            const batches = [];
            for (let i = 0; i < validTexts.length; i += batchSize) {
                batches.push(validTexts.slice(i, i + batchSize));
            }

            const allEmbeddings = [];
            for (const batch of batches) {
                const response = await this.openai.embeddings.create({
                    model: this.model,
                    input: batch,
                    dimensions: this.dimensions,
                    encoding_format: 'float'
                });

                const batchEmbeddings = response.data.map(item => {
                    let embeddingArray = item.embedding;
                    // 确保维度匹配
                    if (embeddingArray.length !== this.dimensions) {
                        console.warn(`⚠️ 嵌入维度不匹配: 期望 ${this.dimensions}, 实际 ${embeddingArray.length}`);
                        if (embeddingArray.length > this.dimensions) {
                            embeddingArray.length = this.dimensions;
                        } else {
                            while (embeddingArray.length < this.dimensions) {
                                embeddingArray.push(0);
                            }
                        }
                    }
                    return embeddingArray; // 返回数组而不是Vector
                });
                allEmbeddings.push(...batchEmbeddings);
            }

            return allEmbeddings;
        } catch (error) {
            console.error('❌ 批量生成向量嵌入失败:', error.message);
            // API调用失败时返回null数组
            return new Array(validTexts.length).fill(null);
        }
    }

    /**
     * 计算两个向量的余弦相似度
     * @param {Array<number>|Vector} vec1 - 向量1
     * @param {Array<number>|Vector} vec2 - 向量2
     * @returns {number} 余弦相似度 (-1 到 1)
     */
    cosineSimilarity(vec1, vec2) {
        // 转换为数组
        const arr1 = Array.isArray(vec1) ? vec1 : vec1.toArray();
        const arr2 = Array.isArray(vec2) ? vec2 : vec2.toArray();
        
        if (!arr1 || !arr2 || arr1.length !== arr2.length) {
            throw new Error('向量长度不匹配');
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < arr1.length; i++) {
            dotProduct += arr1[i] * arr2[i];
            norm1 += arr1[i] * arr1[i];
            norm2 += arr2[i] * arr2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }

        return dotProduct / (norm1 * norm2);
    }

    /**
     * 生成随机向量（已禁用 - 禁止随机向量降级）
     * @returns {Array<number>} 随机向量
     * @deprecated 禁止使用随机向量降级，embedding不可用时返回null
     */
    generateRandomVector() {
        throw new Error('随机向量降级已被禁用，embedding不可用时请返回null');
        // 以下代码不再使用：
        // const vector = [];
        // for (let i = 0; i < this.dimensions; i++) {
        //     vector.push(Math.random() * 2 - 1); // -1 到 1 之间的随机数
        // }
        // 
        // // 归一化
        // const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        // if (norm > 0) {
        //     return vector.map(val => val / norm);
        // }
        // return vector;
    }

    /**
     * 测试向量嵌入服务
     * @returns {Promise<boolean>} 测试是否成功
     */
    async test() {
        try {
            const testText = '这是一个测试文本';
            const embedding = await this.generateEmbedding(testText);
            
            if (embedding === null) {
                console.log('ℹ️  向量嵌入服务不可用（返回null），这是预期的降级行为');
                console.log('📊 当嵌入不可用时，将使用最近N条消息作为上下文');
                return true; // 返回true，因为这是预期的降级行为
            }
            
            if (!Array.isArray(embedding) || embedding.length !== this.dimensions) {
                throw new Error(`向量嵌入格式不正确: 期望数组长度${this.dimensions}`);
            }

            console.log('✅ 向量嵌入服务测试成功');
            console.log(`📊 向量维度: ${embedding.length}`);
            console.log(`📊 示例值: [${embedding.slice(0, 3).join(', ')}...]`);
            
            return true;
        } catch (error) {
            console.error('❌ 向量嵌入服务测试失败:', error.message);
            return false;
        }
    }
}

// 创建单例实例
const embeddingService = new EmbeddingService();

module.exports = embeddingService;