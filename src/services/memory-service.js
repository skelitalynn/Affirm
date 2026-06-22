const Profile = require('../models/profile');
const SyncJob = require('../models/sync-job');
const MemoryEventService = require('./memory-event-service');
const config = require('../config');

class MemoryService {
    constructor({ aiService, memoryEventService } = {}) {
        this.aiService = aiService || null;
        this.memoryEventService = memoryEventService || new MemoryEventService();
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

    async generateMemoryArtifacts(payload = {}) {
        if (!this.aiService) {
            return {
                profile_patch: null,
                memory_event_candidates: []
            };
        }

        if (typeof this.aiService.generateMemoryArtifacts === 'function') {
            const artifacts = await this.aiService.generateMemoryArtifacts(payload);
            return {
                profile_patch: artifacts?.profile_patch || null,
                memory_event_candidates: Array.isArray(artifacts?.memory_event_candidates)
                    ? artifacts.memory_event_candidates
                    : []
            };
        }

        const profilePatch = await this.aiService.generateMemoryPatch(payload);
        return {
            profile_patch: profilePatch,
            memory_event_candidates: []
        };
    }

    async saveMemoryEventCandidates({ userId, candidates = [], sourceMessageIds = [], traceId = null, username = null, telegramUserId = null } = {}) {
        if (!this.memoryEventService || !Array.isArray(candidates) || candidates.length === 0) {
            return {
                createdEvents: [],
                error: null
            };
        }

        try {
            const createdEvents = await this.memoryEventService.saveCandidates({
                userId,
                candidates,
                sourceMessageIds,
                metadata: {
                    trace_id: traceId,
                    username,
                    telegram_user_id: telegramUserId
                }
            });

            return {
                createdEvents,
                error: null
            };
        } catch (error) {
            console.warn(`⚠️ 写入 memory_events 失败: ${error.message}`);
            return {
                createdEvents: [],
                error
            };
        }
    }

    async updateLongTermMemory({ user, username, telegramUserId, userMessage, aiResponse, recentMessages, profile, traceId = null, sourceMessageIds = [] } = {}) {
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
            const artifacts = await this.generateMemoryArtifacts({
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
            const memoryPatch = artifacts?.profile_patch || null;
            const memoryEventCandidates = Array.isArray(artifacts?.memory_event_candidates)
                ? artifacts.memory_event_candidates
                : [];

            let updatedProfile = null;
            let profileUpdated = false;

            if (memoryPatch?.should_update) {
                updatedProfile = await Profile.applyMemoryPatch(user.id, memoryPatch, {
                    status: profile?.status || 'active',
                    goals: profile?.goals || '',
                    preferences: profile?.preferences || Profile.buildDefaultMemory()
                });
                profileUpdated = true;
            }

            const {
                createdEvents,
                error: memoryEventError
            } = await this.saveMemoryEventCandidates({
                userId: user?.id,
                candidates: memoryEventCandidates,
                sourceMessageIds,
                traceId,
                username,
                telegramUserId
            });

            const changed = profileUpdated || createdEvents.length > 0;
            const result = memoryEventError
                ? (changed ? 'updated_with_memory_event_errors' : 'memory_event_write_failed')
                : (changed ? 'updated' : 'no_update');

            await this.completeJob(job, {
                ...baseDetails,
                changed,
                profile_updated: profileUpdated,
                result,
                open_loop_count: Array.isArray(memoryPatch.open_loops) ? memoryPatch.open_loops.length : 0,
                fact_count: Array.isArray(memoryPatch?.facts) ? memoryPatch.facts.length : 0,
                memory_event_candidate_count: memoryEventCandidates.length,
                memory_event_saved_count: createdEvents.length,
                ...(memoryEventError ? { memory_event_error_message: memoryEventError.message } : {})
            });

            return {
                updated: changed,
                profile: updatedProfile,
                patch: memoryPatch,
                memoryEventCandidates,
                createdMemoryEvents: createdEvents,
                memoryEventError: memoryEventError ? memoryEventError.message : null,
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
