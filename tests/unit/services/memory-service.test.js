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
});
