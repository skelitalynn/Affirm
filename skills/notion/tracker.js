// 归档状态跟踪器
class ArchiveTracker {
    constructor() {
        this.archives = new Map(); // dateStr -> archiveInfo
        this.stats = {
            totalArchives: 0,
            successfulArchives: 0,
            failedArchives: 0,
            lastArchiveDate: null,
            lastArchiveStatus: null
        };
    }

    // 记录归档开始
    startArchive(dateStr) {
        const archiveId = `${dateStr}_${Date.now()}`;
        
        this.archives.set(archiveId, {
            id: archiveId,
            date: dateStr,
            startTime: new Date().toISOString(),
            status: 'processing',
            attempts: 1,
            error: null,
            pageId: null
        });
        
        console.log(`📊 开始归档跟踪: ${archiveId}`);
        return archiveId;
    }

    // 记录归档成功
    completeArchive(archiveId, pageId) {
        const archive = this.archives.get(archiveId);
        if (!archive) {
            console.warn(`⚠️ 未找到归档记录: ${archiveId}`);
            return;
        }

        archive.status = 'completed';
        archive.endTime = new Date().toISOString();
        archive.pageId = pageId;
        archive.duration = new Date(archive.endTime) - new Date(archive.startTime);

        // 更新统计
        this.stats.totalArchives++;
        this.stats.successfulArchives++;
        this.stats.lastArchiveDate = archive.date;
        this.stats.lastArchiveStatus = 'success';

        console.log(`✅ 归档完成: ${archiveId} (${archive.duration}ms)`);
    }

    // 记录归档失败
    failArchive(archiveId, error) {
        const archive = this.archives.get(archiveId);
        if (!archive) {
            console.warn(`⚠️ 未找到归档记录: ${archiveId}`);
            return;
        }

        archive.status = 'failed';
        archive.endTime = new Date().toISOString();
        archive.error = error.message || String(error);
        archive.duration = new Date(archive.endTime) - new Date(archive.startTime);

        // 更新统计
        this.stats.totalArchives++;
        this.stats.failedArchives++;
        this.stats.lastArchiveDate = archive.date;
        this.stats.lastArchiveStatus = 'failed';

        console.error(`❌ 归档失败: ${archiveId} - ${archive.error}`);
    }

    // 重试归档
    retryArchive(archiveId) {
        const archive = this.archives.get(archiveId);
        if (!archive) {
            console.warn(`⚠️ 未找到归档记录: ${archiveId}`);
            return null;
        }

        archive.attempts++;
        archive.status = 'retrying';
        archive.startTime = new Date().toISOString();
        archive.endTime = null;
        archive.error = null;

        console.log(`🔄 重试归档: ${archiveId} (尝试 ${archive.attempts})`);
        return archiveId;
    }

    // 获取归档状态
    getArchiveStatus(archiveId) {
        return this.archives.get(archiveId);
    }

    // 获取日期归档状态
    getDateArchiveStatus(dateStr) {
        const archives = Array.from(this.archives.values())
            .filter(archive => archive.date === dateStr)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        if (archives.length === 0) {
            return {
                date: dateStr,
                status: 'not_started',
                lastAttempt: null
            };
        }

        const latest = archives[0];
        return {
            date: dateStr,
            status: latest.status,
            lastAttempt: latest.startTime,
            attempts: archives.length,
            pageId: latest.pageId,
            error: latest.error
        };
    }

    // 获取统计信息
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalArchives > 0 
                ? (this.stats.successfulArchives / this.stats.totalArchives * 100).toFixed(2) + '%'
                : '0%',
            averageAttempts: this.stats.totalArchives > 0
                ? (Array.from(this.archives.values()).reduce((sum, a) => sum + a.attempts, 0) / this.stats.totalArchives).toFixed(2)
                : 0
        };
    }

    // 清理旧记录（保留最近30天）
    cleanupOldRecords(daysToKeep = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysToKeep);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        let removed = 0;
        for (const [id, archive] of this.archives.entries()) {
            if (archive.date < cutoffStr) {
                this.archives.delete(id);
                removed++;
            }
        }

        console.log(`🧹 清理归档记录: 移除了${removed}条${daysToKeep}天前的记录`);
        return removed;
    }

    // 导出所有记录（用于备份）
    exportRecords() {
        return {
            archives: Array.from(this.archives.values()),
            stats: this.stats,
            exportTime: new Date().toISOString()
        };
    }

    // 导入记录（用于恢复）
    importRecords(data) {
        if (data.archives && Array.isArray(data.archives)) {
            for (const archive of data.archives) {
                this.archives.set(archive.id, archive);
            }
        }
        
        if (data.stats) {
            this.stats = data.stats;
        }

        console.log(`📥 导入归档记录: ${data.archives?.length || 0}条记录`);
    }
}

module.exports = ArchiveTracker;
