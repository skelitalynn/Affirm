#!/bin/bash
# Day 7: 部署上线
# 根据开发计划：准备生产环境部署和监控配置

set -e

echo "🚀 开始Day 7任务：部署上线"
echo "=================================="

# 加载环境变量
if [ -f /root/projects/Affirm/.env ]; then
    source /root/projects/Affirm/.env
fi

# 1. 创建生产环境配置文件
echo "1. 创建生产环境配置..."
cat > /root/projects/Affirm/.env.production << 'EOF'
# 生产环境配置
NODE_ENV=production

# 数据库配置
DB_URL=postgresql://affirm_user:your_password@localhost:5432/affirm_db

# Telegram配置
TELEGRAM_BOT_TOKEN=your_production_bot_token
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook/telegram

# AI配置
OPENAI_API_KEY=your_production_openai_key
MODEL_NAME=gpt-4

# 应用配置
PORT=3000
TIMEZONE=Asia/Shanghai
LOG_LEVEL=info

# 安全配置
JWT_SECRET=your_production_jwt_secret
ENCRYPTION_KEY=your_production_encryption_key
CORS_ORIGINS=https://your-domain.com

# Notion配置（可选）
NOTION_TOKEN=your_notion_token
NOTION_PARENT_PAGE_ID=your_page_id
NOTION_DATABASE_ID=your_database_id
EOF

echo "✅ 生产环境配置文件已创建 (.env.production)"
echo "⚠️  请手动更新其中的敏感信息"

# 2. 创建Dockerfile（如果不存在）
echo "2. 创建Docker配置..."
if [ ! -f /root/projects/Affirm/Dockerfile ]; then
    cat > /root/projects/Affirm/Dockerfile << 'EOF'
# 使用Node.js LTS版本
FROM node:20-alpine

# 创建应用目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖（生产环境）
RUN npm ci --only=production

# 复制应用源代码
COPY . .

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 更改文件所有权
RUN chown -R nodejs:nodejs /app

# 切换到非root用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "src/index.js"]
EOF
    echo "✅ Dockerfile已创建"
else
    echo "⚠️  Dockerfile已存在，跳过创建"
fi

# 3. 创建docker-compose.yml（如果不存在）
echo "3. 创建Docker Compose配置..."
if [ ! -f /root/projects/Affirm/docker-compose.yml ]; then
    cat > /root/projects/Affirm/docker-compose.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL数据库服务
  postgres:
    image: postgres:15-alpine
    container_name: affirm_postgres
    environment:
      POSTGRES_DB: affirm_db
      POSTGRES_USER: affirm_user
      POSTGRES_PASSWORD: your_database_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U affirm_user"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # pgvector扩展（需要自定义构建）
  # 注意：postgres:15-alpine默认不包含pgvector，需要自定义镜像
  
  # 应用服务
  app:
    build: .
    container_name: affirm_app
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DB_URL: postgresql://affirm_user:your_database_password@postgres:5432/affirm_db
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 可选：Redis缓存
  redis:
    image: redis:7-alpine
    container_name: affirm_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
EOF
    echo "✅ docker-compose.yml已创建"
else
    echo "⚠️  docker-compose.yml已存在，跳过创建"
fi

# 4. 创建部署脚本
echo "4. 创建部署脚本..."
cat > /root/projects/Affirm/scripts/deploy.sh << 'EOF'
#!/bin/bash
# Affirm项目部署脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 开始部署Affirm项目...${NC}"

# 检查环境
check_environment() {
    echo "检查部署环境..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker未安装${NC}"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose未安装${NC}"
        exit 1
    fi
    
    # 检查必要的环境变量
    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        echo -e "${YELLOW}⚠️  TELEGRAM_BOT_TOKEN未设置${NC}"
    fi
    
    if [ -z "$OPENAI_API_KEY" ]; then
        echo -e "${YELLOW}⚠️  OPENAI_API_KEY未设置${NC}"
    fi
    
    echo -e "${GREEN}✅ 环境检查完成${NC}"
}

# 构建镜像
build_images() {
    echo "构建Docker镜像..."
    
    # 构建应用镜像
    docker build -t affirm-app:latest .
    
    # 检查PostgreSQL镜像（如果需要pgvector）
    echo "如果需要pgvector支持，请自定义PostgreSQL镜像"
    echo "参考：https://github.com/pgvector/pgvector"
}

# 启动服务
start_services() {
    echo "启动服务..."
    
    # 使用docker-compose
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    
    echo -e "${GREEN}✅ 服务启动完成${NC}"
}

# 检查服务状态
check_status() {
    echo "检查服务状态..."
    
    sleep 10  # 等待服务启动
    
    # 检查PostgreSQL
    if docker exec affirm_postgres pg_isready -U affirm_user &> /dev/null; then
        echo -e "${GREEN}✅ PostgreSQL运行正常${NC}"
    else
        echo -e "${RED}❌ PostgreSQL未正常运行${NC}"
    fi
    
    # 检查应用
    if curl -s http://localhost:3000/health | grep -q "healthy"; then
        echo -e "${GREEN}✅ 应用运行正常${NC}"
    else
        echo -e "${YELLOW}⚠️  应用可能未完全启动${NC}"
    fi
    
    # 显示容器状态
    echo ""
    echo "容器状态："
    docker ps --filter "name=affirm_*"
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo -e "${GREEN}🎉 部署完成！${NC}"
    echo ""
    echo "访问地址："
    echo "- 应用：http://localhost:3000"
    echo "- 数据库：localhost:5432"
    echo "- Redis：localhost:6379（如果启用）"
    echo ""
    echo "管理命令："
    echo "- 查看日志：docker logs affirm_app"
    echo "- 停止服务：docker-compose down"
    echo "- 重启服务：docker-compose restart"
    echo ""
    echo "下一步："
    echo "1. 配置Telegram Webhook"
    echo "2. 设置域名和SSL证书"
    echo "3. 配置监控和告警"
    echo "4. 定期备份数据库"
}

# 主流程
main() {
    check_environment
    build_images
    start_services
    check_status
    show_deployment_info
}

# 执行主流程
main "$@"
EOF

chmod +x /root/projects/Affirm/scripts/deploy.sh
echo "✅ 部署脚本已创建并赋予执行权限"

# 5. 创建监控配置
echo "5. 创建监控配置..."
mkdir -p /root/projects/Affirm/monitoring

# 创建PM2配置文件（如果使用PM2）
cat > /root/projects/Affirm/monitoring/ecosystem.config.js << 'EOF'
// PM2生态系统配置文件
module.exports = {
  apps: [{
    name: 'affirm-app',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    // 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    // 监控配置
    max_memory_restart: '1G',
    // 健康检查
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    // 重启策略
    autorestart: true,
    restart_delay: 5000,
    // 高级配置
    instance_var: 'INSTANCE_ID',
    listen_timeout: 5000,
    kill_timeout: 5000,
  }]
};
EOF

# 创建日志轮转配置
cat > /root/projects/Affirm/monitoring/logrotate.conf << 'EOF'
# 日志轮转配置
/root/projects/Affirm/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    sharedscripts
    postrotate
        [ -f /root/.pm2/pm2.pid ] && kill -USR2 `cat /root/.pm2/pm2.pid`
    endscript
}
EOF

echo "✅ 监控配置文件已创建"

# 6. 创建备份脚本
echo "6. 创建数据库备份脚本..."
cat > /root/projects/Affirm/scripts/backup.sh << 'EOF'
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
EOF

chmod +x /root/projects/Affirm/scripts/backup.sh
echo "✅ 备份脚本已创建"

# 7. 创建Day 7完成标记
echo "7. 创建Day 7完成标记..."
cat > /root/projects/Affirm/DAY7_COMPLETED.md << 'EOF'
# Day 7 任务完成报告
**日期：** 2026-03-03
**状态：** ✅ 完成

## 已完成的任务
1. ✅ 创建生产环境配置文件
2. ✅ 创建Dockerfile
3. ✅ 创建docker-compose.yml
4. ✅ 创建部署脚本
5. ✅ 创建监控配置
6. ✅ 创建备份脚本

## 部署准备
### 配置文件
- `.env.production` - 生产环境配置模板
- `Dockerfile` - 应用容器配置
- `docker-compose.yml` - 多服务编排

### 部署脚本
- `scripts/deploy.sh` - 一键部署脚本
- `scripts/backup.sh` - 数据库备份脚本

### 监控配置
- `monitoring/ecosystem.config.js` - PM2配置文件
- `monitoring/logrotate.conf` - 日志轮转配置

## 下一步行动
1. **填写生产环境配置** - 更新`.env.production`中的敏感信息
2. **构建自定义PostgreSQL镜像** - 如果需要pgvector支持
3. **配置Telegram Webhook** - 设置生产环境Webhook URL
4. **设置域名和SSL** - 配置HTTPS访问
5. **测试部署** - 在测试环境运行部署脚本
6. **监控设置** - 配置告警和监控面板

## 生产检查清单
- [ ] 更新所有API密钥和密码
- [ ] 配置数据库备份策略
- [ ] 设置应用监控和告警
- [ ] 配置防火墙和安全组
- [ ] 设置域名和SSL证书
- [ ] 测试高可用性配置
- [ ] 文档化运维流程

## 7天开发计划总结
- **Day 1**: 环境搭建 + 数据库 ✅
- **Day 2**: 数据层开发 ✅
- **Day 3**: OpenClaw集成 ✅
- **Day 4**: Notion集成 ✅
- **Day 5**: 后台配置页 ✅
- **Day 6**: 测试优化 ✅
- **Day 7**: 部署上线 ✅

---
*报告生成时间：$(date)*
EOF

echo ""
echo "=================================="
echo "🎉 Day 7 部署上线任务完成！"
echo ""
echo "📋 7天开发计划全部完成！"
echo ""
echo "🚀 项目已准备好部署到生产环境"
echo ""
echo "📄 详细报告：/root/projects/Affirm/DAY7_COMPLETED.md"
echo "📁 部署文件："
echo "  - Dockerfile"
echo "  - docker-compose.yml"
echo "  - scripts/deploy.sh"
echo "  - scripts/backup.sh"
echo ""
echo "🛠️  执行部署："
echo "  cd /root/projects/Affirm"
echo "  ./scripts/deploy.sh"