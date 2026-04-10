const haystackClient = require('./haystack-client');

let missingConfigLogged = false;

class RagProvider {
    isConfigured() {
        return haystackClient.isConfigured();
    }

    async getStatus() {
        const health = await haystackClient.healthCheck();

        return {
            mode: 'haystack',
            configured: health.configured,
            healthy: health.healthy,
            enabled: health.configured && health.healthy,
            degraded: !health.healthy,
            message: health.message || null
        };
    }

    async upsertKnowledge(documents = []) {
        return haystackClient.upsertKnowledge(documents);
    }

    async deleteKnowledge(ids = []) {
        return haystackClient.deleteKnowledge(ids);
    }

    async searchKnowledge(queryText, options = {}) {
        if (!queryText || !String(queryText).trim()) {
            return [];
        }

        if (!this.isConfigured()) {
            if (!missingConfigLogged) {
                console.warn('⚠️ Haystack 未配置，knowledge RAG 将返回空结果');
                missingConfigLogged = true;
            }

            return [];
        }

        try {
            return await haystackClient.searchKnowledge(queryText, options);
        } catch (error) {
            console.warn(`⚠️ Haystack 检索失败，knowledge RAG 降级为空结果: ${error.message}`);
            return [];
        }
    }
}

module.exports = new RagProvider();
