const Profile = require('../models/profile');
const SyncJob = require('../models/sync-job');
const config = require('../config');

class MemoryService {
    constructor({ aiService } = {}) {
        this.aiService = aiService || null;
        this.config = config.memory || {
            enabled: true,
            recordJobs: true
        };
    }

    isEnabled() {
        return this.config.enabled !== false;
    }

    shouldRecordJobs() {
        return this.config.recordJobs !== false;
    }

    getContextMessages() {
        const parsed = parseInt(this.config.contextMessages, 10);
        if (!Number.isFinite(parsed)) {
            return 8;
        }

        return Math.max(1, parsed);
    }

    buildCurrentMemory(profile) {
        return {
            goals: profile?.goals || '',
            status: profile?.status || 'active',
            ...Profile.normalizeMemory(profile?.preferences)
        };
    }

    buildJobDetails({ user, username, telegramUserId, traceId, userMessage, recentMessages, profile } = {}) {
        return {
            trace_id: traceId || null,
            user_id: user?.id || null,
            telegram_id: telegramUserId || null,
            username: username || user?.username || null,
            recent_message_count: Array.isArray(recentMessages) ? recentMessages.length : 0,
            has_profile: Boolean(profile),
            user_message_preview: String(userMessage || '').slice(0, 120)
        };
    }

    async createJob(baseDetails = {}) {
        if (!this.shouldRecordJobs()) {
            return null;
        }

        try {
            return await SyncJob.create({
                job_type: 'memory_update',
                date_key: new Date().toISOString().slice(0, 10),
                status: 'processing',
                details: baseDetails
            });
        } catch (error) {
            console.warn(`⚠️ 创建 memory_update 任务失败: ${error.message}`);
            return null;
        }
    }

    async completeJob(job, details = {}) {
        if (!job?.id) {
            return null;
        }

        try {
            return await SyncJob.markCompleted(job.id, details);
        } catch (error) {
            console.warn(`⚠️ 更新 memory_update 完成状态失败: ${error.message}`);
            return null;
        }
    }

    async failJob(job, error, details = {}) {
        if (!job?.id) {
            return null;
        }

        try {
            return await SyncJob.markFailed(job.id, error, details);
        } catch (syncError) {
            console.warn(`⚠️ 更新 memory_update 失败状态失败: ${syncError.message}`);
            return null;
        }
    }

    async updateLongTermMemory({ user, username, telegramUserId, userMessage, aiResponse, recentMessages, profile, traceId = null } = {}) {
        if (!this.isEnabled()) {
            return {
                updated: false,
                skipped: 'memory_disabled'
            };
        }

        if (!this.aiService || !this.aiService.client) {
            return {
                updated: false,
                skipped: 'ai_unavailable'
            };
        }

        const baseDetails = this.buildJobDetails({
            user,
            username,
            telegramUserId,
            traceId,
            userMessage,
            recentMessages,
            profile
        });
        const job = await this.createJob(baseDetails);

        try {
            const normalizedRecentMessages = Array.isArray(recentMessages)
                ? recentMessages.slice(-this.getContextMessages())
                : [];
            const memoryPatch = await this.aiService.generateMemoryPatch({
                user: {
                    id: user?.id || '',
                    username: username || user?.username || '用户',
                    telegram_id: telegramUserId
                },
                userMessage,
                aiResponse,
                recentMessages: normalizedRecentMessages,
                currentMemory: this.buildCurrentMemory(profile)
            });

            if (!memoryPatch || !memoryPatch.should_update) {
                await this.completeJob(job, {
                    ...baseDetails,
                    changed: false,
                    result: 'no_update'
                });

                return {
                    updated: false,
                    patch: memoryPatch,
                    jobId: job?.id || null
                };
            }

            const updatedProfile = await Profile.applyMemoryPatch(user.id, memoryPatch, {
                status: profile?.status || 'active',
                goals: profile?.goals || '',
                preferences: profile?.preferences || Profile.buildDefaultMemory()
            });

            await this.completeJob(job, {
                ...baseDetails,
                changed: true,
                result: 'updated',
                open_loop_count: Array.isArray(memoryPatch.open_loops) ? memoryPatch.open_loops.length : 0,
                fact_count: Array.isArray(memoryPatch.facts) ? memoryPatch.facts.length : 0
            });

            return {
                updated: true,
                profile: updatedProfile,
                patch: memoryPatch,
                jobId: job?.id || null
            };
        } catch (error) {
            await this.failJob(job, error, {
                ...baseDetails,
                result: 'failed'
            });
            throw error;
        }
    }

    getStatus() {
        return {
            enabled: this.isEnabled(),
            recordJobs: this.shouldRecordJobs(),
            mode: 'llm_patch_async_v2'
        };
    }
}

module.exports = MemoryService;
