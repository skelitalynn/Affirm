jest.mock('../../../src/config', () => ({
    memory: {
        enabled: true,
        recordJobs: true
    }
}));

jest.mock('../../../src/models/profile', () => ({
    normalizeMemory: jest.fn(() => ({
        memory_version: 1,
        summary: '',
        facts: [],
        communication_preferences: [],
        open_loops: [],
        legacy_preferences: {},
        last_updated_at: null
    })),
    buildDefaultMemory: jest.fn(() => ({
        memory_version: 1,
        summary: '',
        facts: [],
        communication_preferences: [],
        open_loops: [],
        legacy_preferences: {},
        last_updated_at: null
    })),
    applyMemoryPatch: jest.fn()
}));

jest.mock('../../../src/models/sync-job', () => ({
    create: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn()
}));

jest.mock('../../../src/services/memory-event-service', () => {
    return jest.fn().mockImplementation(() => ({
        saveCandidates: jest.fn().mockResolvedValue([])
    }));
});

const Profile = require('../../../src/models/profile');
const SyncJob = require('../../../src/models/sync-job');
const MemoryService = require('../../../src/services/memory-service');

describe('MemoryService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('应在 LLM 返回 should_update=true 时更新 profile 并写入 sync job', async () => {
        const aiService = {
            client: {},
            generateMemoryPatch: jest.fn().mockResolvedValue({
                should_update: true,
                goals: 'become better',
                status: 'active',
                summary: 'user summary',
                facts: ['fact 1'],
                communication_preferences: ['direct'],
                open_loops: ['follow up']
            })
        };
        SyncJob.create.mockResolvedValue({ id: 'job-1' });
        SyncJob.markCompleted.mockResolvedValue({ id: 'job-1', status: 'completed' });
        Profile.applyMemoryPatch.mockResolvedValue({ id: 'profile-1' });

        const service = new MemoryService({ aiService });
        const result = await service.updateLongTermMemory({
            user: { id: 'user-1' },
            username: 'alice',
            telegramUserId: 'tg-1',
            userMessage: '我想更自律',
            aiResponse: '我们来制定计划',
            recentMessages: [{ role: 'user', content: 'hello' }],
            profile: { goals: '', status: 'active', preferences: {} },
            traceId: 'trace-1'
        });

        expect(aiService.generateMemoryPatch).toHaveBeenCalledTimes(1);
        expect(Profile.applyMemoryPatch).toHaveBeenCalledWith(
            'user-1',
            expect.objectContaining({
                should_update: true,
                goals: 'become better'
            }),
            expect.any(Object)
        );
        expect(SyncJob.create).toHaveBeenCalledWith(expect.objectContaining({
            job_type: 'memory_update',
            status: 'processing'
        }));
        expect(SyncJob.markCompleted).toHaveBeenCalledWith('job-1', expect.objectContaining({
            trace_id: 'trace-1',
            changed: true,
            result: 'updated'
        }));
        expect(result.updated).toBe(true);
        expect(result.jobId).toBe('job-1');
    });

    it('应在 should_update=false 时跳过写入 profile，但仍完成 sync job', async () => {
        const aiService = {
            client: {},
            generateMemoryPatch: jest.fn().mockResolvedValue({
                should_update: false
            })
        };
        SyncJob.create.mockResolvedValue({ id: 'job-2' });
        SyncJob.markCompleted.mockResolvedValue({ id: 'job-2', status: 'completed' });

        const service = new MemoryService({ aiService });
        const result = await service.updateLongTermMemory({
            user: { id: 'user-1' },
            username: 'alice',
            telegramUserId: 'tg-1',
            userMessage: '今天状态一般',
            aiResponse: '先休息一下',
            recentMessages: [],
            profile: { goals: '', status: 'active', preferences: {} },
            traceId: 'trace-2'
        });

        expect(Profile.applyMemoryPatch).not.toHaveBeenCalled();
        expect(SyncJob.markCompleted).toHaveBeenCalledWith('job-2', expect.objectContaining({
            trace_id: 'trace-2',
            changed: false,
            result: 'no_update'
        }));
        expect(result.updated).toBe(false);
    });

    it('应在 artifacts 包含 memory_event_candidates 时调用 MemoryEventService 保存事件', async () => {
        const aiService = {
            client: {},
            generateMemoryArtifacts: jest.fn().mockResolvedValue({
                profile_patch: {
                    should_update: false,
                    goals: '',
                    status: '',
                    summary: '',
                    facts: [],
                    communication_preferences: [],
                    open_loops: []
                },
                memory_event_candidates: [
                    {
                        event_type: 'commitment',
                        title: '开始晨间复盘',
                        summary: '用户承诺连续 7 天晨间复盘',
                        importance: 0.9,
                        confidence: 0.8
                    }
                ]
            })
        };
        const memoryEventService = {
            saveCandidates: jest.fn().mockResolvedValue([{ id: 'event-1' }])
        };

        SyncJob.create.mockResolvedValue({ id: 'job-3' });
        SyncJob.markCompleted.mockResolvedValue({ id: 'job-3', status: 'completed' });

        const service = new MemoryService({ aiService, memoryEventService });
        const result = await service.updateLongTermMemory({
            user: { id: 'user-1' },
            username: 'alice',
            telegramUserId: 'tg-1',
            userMessage: '我准备连续 7 天做晨间复盘',
            aiResponse: '那我们先把动作缩小到每天 10 分钟',
            recentMessages: [{ id: 'msg-1', role: 'user', content: 'hello' }],
            profile: { goals: '', status: 'active', preferences: {} },
            traceId: 'trace-3',
            sourceMessageIds: ['msg-user-1', 'msg-ai-1']
        });

        expect(memoryEventService.saveCandidates).toHaveBeenCalledWith({
            userId: 'user-1',
            candidates: [
                expect.objectContaining({
                    event_type: 'commitment',
                    title: '开始晨间复盘'
                })
            ],
            sourceMessageIds: ['msg-user-1', 'msg-ai-1'],
            metadata: {
                trace_id: 'trace-3',
                username: 'alice',
                telegram_user_id: 'tg-1'
            }
        });
        expect(Profile.applyMemoryPatch).not.toHaveBeenCalled();
        expect(SyncJob.markCompleted).toHaveBeenCalledWith('job-3', expect.objectContaining({
            changed: true,
            result: 'updated',
            memory_event_candidate_count: 1,
            memory_event_saved_count: 1
        }));
        expect(result.updated).toBe(true);
        expect(result.createdMemoryEvents).toEqual([{ id: 'event-1' }]);
    });

    it('应在 memory_events 写入失败时记录部分失败，但不阻塞 profile 更新', async () => {
        const aiService = {
            client: {},
            generateMemoryArtifacts: jest.fn().mockResolvedValue({
                profile_patch: {
                    should_update: true,
                    goals: 'become better',
                    status: 'active',
                    summary: 'user summary',
                    facts: ['fact 1'],
                    communication_preferences: ['direct'],
                    open_loops: ['follow up']
                },
                memory_event_candidates: [
                    {
                        event_type: 'commitment',
                        title: '开始晨间复盘',
                        summary: '用户承诺连续 7 天晨间复盘'
                    }
                ]
            })
        };
        const memoryEventService = {
            saveCandidates: jest.fn().mockRejectedValue(new Error('insert failed'))
        };

        SyncJob.create.mockResolvedValue({ id: 'job-4' });
        SyncJob.markCompleted.mockResolvedValue({ id: 'job-4', status: 'completed' });
        Profile.applyMemoryPatch.mockResolvedValue({ id: 'profile-1' });

        const service = new MemoryService({ aiService, memoryEventService });
        const result = await service.updateLongTermMemory({
            user: { id: 'user-1' },
            username: 'alice',
            telegramUserId: 'tg-1',
            userMessage: '我想更自律',
            aiResponse: '我们来制定计划',
            recentMessages: [{ role: 'user', content: 'hello' }],
            profile: { goals: '', status: 'active', preferences: {} },
            traceId: 'trace-4'
        });

        expect(Profile.applyMemoryPatch).toHaveBeenCalledTimes(1);
        expect(SyncJob.markCompleted).toHaveBeenCalledWith('job-4', expect.objectContaining({
            changed: true,
            result: 'updated_with_memory_event_errors',
            memory_event_error_message: 'insert failed'
        }));
        expect(result.updated).toBe(true);
        expect(result.memoryEventError).toBe('insert failed');
    });

    it('应在旧 aiService 仅提供 generateMemoryPatch 时兼容回退并完成 profile 更新', async () => {
        const aiService = {
            client: {},
            generateMemoryPatch: jest.fn().mockResolvedValue({
                should_update: true,
                goals: 'become better',
                status: 'active',
                summary: 'user summary',
                facts: ['fact 1'],
                communication_preferences: ['direct'],
                open_loops: ['follow up']
            })
        };
        SyncJob.create.mockResolvedValue({ id: 'job-5' });
        SyncJob.markCompleted.mockResolvedValue({ id: 'job-5', status: 'completed' });
        Profile.applyMemoryPatch.mockResolvedValue({ id: 'profile-2' });

        const service = new MemoryService({ aiService });
        const result = await service.updateLongTermMemory({
            user: { id: 'user-1' },
            username: 'alice',
            telegramUserId: 'tg-1',
            userMessage: '我想更自律',
            aiResponse: '我们来制定计划',
            recentMessages: [{ role: 'user', content: 'hello' }],
            profile: { goals: '', status: 'active', preferences: {} },
            traceId: 'trace-5'
        });

        expect(aiService.generateMemoryPatch).toHaveBeenCalledTimes(1);
        expect(Profile.applyMemoryPatch).toHaveBeenCalledTimes(1);
        expect(SyncJob.markCompleted).toHaveBeenCalledWith('job-5', expect.objectContaining({
            changed: true,
            result: 'updated'
        }));
        expect(result.updated).toBe(true);
    });

    it('应在 memory disabled 时直接跳过，不创建 sync job', async () => {
        const aiService = {
            client: {},
            generateMemoryPatch: jest.fn()
        };

        const service = new MemoryService({ aiService });
        service.config = {
            enabled: false,
            recordJobs: true
        };

        const result = await service.updateLongTermMemory({
            user: { id: 'user-1' },
            username: 'alice',
            telegramUserId: 'tg-1',
            userMessage: '我想更自律',
            aiResponse: '我们来制定计划',
            recentMessages: [],
            profile: { goals: '', status: 'active', preferences: {} },
            traceId: 'trace-6'
        });

        expect(result).toEqual({
            updated: false,
            skipped: 'memory_disabled'
        });
        expect(SyncJob.create).not.toHaveBeenCalled();
        expect(aiService.generateMemoryPatch).not.toHaveBeenCalled();
    });
});
