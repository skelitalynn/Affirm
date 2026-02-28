// 对话管理器
class ConversationManager {
    constructor(config) {
        this.config = config;
        this.conversationHistory = new Map(); // 内存中的对话缓存
    }

    async getContext(userId, userMessage) {
        try {
            // 获取用户信息（这里简化处理，实际应从数据库获取）
            const user = {
                id: userId,
                username: `用户_${userId}`
            };

            // 获取最近的消息历史
            const recentMessages = await this.getRecentMessages(userId);
            
            // 构建对话上下文
            const context = {
                user: user,
                userMessage: userMessage,
                recentMessages: recentMessages,
                timestamp: new Date().toISOString()
            };

            // 更新内存缓存
            this.updateConversationCache(userId, {
                role: 'user',
                content: userMessage,
                timestamp: context.timestamp
            });

            return context;
        } catch (error) {
            console.error('❌ 获取对话上下文失败:', error);
            
            // 返回基本的上下文
            return {
                user: {
                    id: userId,
                    username: '用户'
                },
                userMessage: userMessage,
                recentMessages: [],
                timestamp: new Date().toISOString()
            };
        }
    }

    async getRecentMessages(userId, limit = 10) {
        try {
            // 首先检查内存缓存
            if (this.conversationHistory.has(userId)) {
                const cachedMessages = this.conversationHistory.get(userId);
                if (cachedMessages.length > 0) {
                    return cachedMessages.slice(-limit);
                }
            }

            // 如果没有缓存，返回空数组
            // 实际应用中应该从数据库获取
            return [];
        } catch (error) {
            console.error('❌ 获取最近消息失败:', error);
            return [];
        }
    }

    updateConversationCache(userId, message) {
        if (!this.conversationHistory.has(userId)) {
            this.conversationHistory.set(userId, []);
        }

        const messages = this.conversationHistory.get(userId);
        messages.push(message);

        // 限制缓存大小
        if (messages.length > 50) {
            messages.splice(0, messages.length - 50);
        }

        this.conversationHistory.set(userId, messages);
    }

    async saveAIResponse(userId, aiResponse) {
        try {
            this.updateConversationCache(userId, {
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date().toISOString()
            });

            console.log(`💾 保存AI回复到缓存: ${aiResponse.substring(0, 50)}...`);
        } catch (error) {
            console.error('❌ 保存AI回复失败:', error);
        }
    }

    async clearConversation(userId) {
        try {
            if (this.conversationHistory.has(userId)) {
                this.conversationHistory.delete(userId);
                console.log(`🗑️  清除用户 ${userId} 的对话缓存`);
            }
            
            // 实际应用中还应该清除数据库中的记录
            return true;
        } catch (error) {
            console.error('❌ 清除对话失败:', error);
            return false;
        }
    }

    async getConversationSummary(userId) {
        try {
            if (!this.conversationHistory.has(userId)) {
                return {
                    messageCount: 0,
                    lastMessage: null,
                    hasConversation: false
                };
            }

            const messages = this.conversationHistory.get(userId);
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

            return {
                messageCount: messages.length,
                lastMessage: lastMessage ? {
                    role: lastMessage.role,
                    content: lastMessage.content.substring(0, 100) + '...',
                    timestamp: lastMessage.timestamp
                } : null,
                hasConversation: messages.length > 0
            };
        } catch (error) {
            console.error('❌ 获取对话摘要失败:', error);
            return {
                messageCount: 0,
                lastMessage: null,
                hasConversation: false
            };
        }
    }

    // 清理过期的缓存
    cleanupExpiredCache(maxAgeHours = 24) {
        const now = new Date();
        let cleanedCount = 0;

        for (const [userId, messages] of this.conversationHistory.entries()) {
            const recentMessages = messages.filter(msg => {
                const msgTime = new Date(msg.timestamp);
                const hoursDiff = (now - msgTime) / (1000 * 60 * 60);
                return hoursDiff < maxAgeHours;
            });

            if (recentMessages.length === 0) {
                this.conversationHistory.delete(userId);
                cleanedCount++;
            } else if (recentMessages.length < messages.length) {
                this.conversationHistory.set(userId, recentMessages);
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 清理了 ${cleanedCount} 个过期的对话缓存`);
        }
    }
}

module.exports = ConversationManager;