#!/bin/bash
# 数据库备份脚本

set -e

# 备份目录
BACKUP_DIR="/root/backups/affirm"
DATE=$(date '+%Y-%m-%d_%H-%M-%S')
BACKUP_FILE="$BACKUP_DIR/affirm_db_$DATE.sql.gz"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份数据库
echo "备份数据库..."
PGPASSWORD=your_database_password pg_dump -h localhost -U affirm_user -d affirm_db | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ 备份成功: $BACKUP_FILE"
    
    # 删除超过30天的备份
    find "$BACKUP_DIR" -name "affirm_db_*.sql.gz" -mtime +30 -delete
    
    # 备份统计
    echo ""
    echo "备份统计："
    du -h "$BACKUP_FILE"
    echo ""
    echo "当前备份文件："
    ls -lh "$BACKUP_DIR"/affirm_db_*.sql.gz | tail -5
else
    echo "❌ 备份失败"
    exit 1
fi
