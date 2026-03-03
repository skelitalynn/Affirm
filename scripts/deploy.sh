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
