#!/bin/bash

# Affirm项目 - 每日开发脚本
# 每天自动执行当日开发任务并提交进度

set -e  # 遇到错误退出

# 配置变量
PROJECT_DIR="/root/projects/Affirm"
LOG_FILE="$PROJECT_DIR/dev.log"
REPORT_FILE="$PROJECT_DIR/daily-report.md"
DAY_PLAN="$PROJECT_DIR/7天开发计划.md"
# GitHub仓库信息（使用SSH）
if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
    GITHUB_REPO="git@github.com:$GITHUB_USERNAME/$GITHUB_REPO.git"
else
    # 从当前git配置获取
    GITHUB_REPO=$(git remote get-url origin 2>/dev/null || echo "git@github.com:skelitalynn/Affirm.git")
fi

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

# 进入项目目录
cd "$PROJECT_DIR" || error "无法进入项目目录: $PROJECT_DIR"

# 获取当前是第几天
START_DATE="2026-02-25"
TODAY=$(date '+%Y-%m-%d')
DAY_NUM=$(( ($(date -d "$TODAY" +%s) - $(date -d "$START_DATE" +%s)) / 86400 + 1 ))

# 如果今天是第1天之前，设为第1天
if [ "$DAY_NUM" -lt 1 ]; then
    DAY_NUM=1
    log "开发周期未开始，从第 $DAY_NUM 天开始"
fi

# 如果超过7天，设为第7天
if [ "$DAY_NUM" -gt 7 ]; then
    DAY_NUM=7
    log "开发周期已结束，执行第 $DAY_NUM 天收尾任务"
fi

log "🎯 开始第 $DAY_NUM 天开发任务"

# 1. 拉取最新代码
log "1. 同步Git仓库..."
git pull origin main 2>/dev/null || log "首次运行，跳过pull"

# 2. 执行当日任务
log "2. 执行Day $DAY_NUM 任务..."
case $DAY_NUM in
    1)
        log "执行Day 1任务：环境搭建"
        # 检查Day 1任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day1-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day1-tasks.sh"
        else
            error "Day 1任务脚本不存在: $PROJECT_DIR/scripts/development/day1-tasks.sh"
        fi
        ;;
    2)
        log "执行Day 2任务：数据层开发"
        # 检查Day 2任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day2-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day2-tasks.sh"
        else
            error "Day 2任务脚本不存在: $PROJECT_DIR/scripts/development/day2-tasks.sh"
        fi
        ;;
    3)
        log "执行Day 3任务：OpenClaw集成"
        # 检查Day 3任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day3-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day3-tasks.sh"
        else
            error "Day 3任务脚本不存在: $PROJECT_DIR/scripts/development/day3-tasks.sh"
        fi
        ;;
    4)
        log "执行Day 4任务：Notion集成"
        # 检查Day 4任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day4-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day4-tasks.sh"
        else
            error "Day 4任务脚本不存在: $PROJECT_DIR/scripts/development/day4-tasks.sh"
        fi
        ;;
    5)
        log "执行Day 5任务：后台配置页"
        # 检查Day 5任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day5-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day5-tasks.sh"
        else
            error "Day 5任务脚本不存在: $PROJECT_DIR/scripts/development/day5-tasks.sh"
        fi
        ;;
    6)
        log "执行Day 6任务：测试优化"
        # 检查Day 6任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day6-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day6-tasks.sh"
        else
            error "Day 6任务脚本不存在: $PROJECT_DIR/scripts/development/day6-tasks.sh"
        fi
        ;;
    7)
        log "执行Day 7任务：部署上线"
        # 检查Day 7任务脚本是否存在
        if [ -f "$PROJECT_DIR/scripts/development/day7-tasks.sh" ]; then
            bash "$PROJECT_DIR/scripts/development/day7-tasks.sh"
        else
            error "Day 7任务脚本不存在: $PROJECT_DIR/scripts/development/day7-tasks.sh"
        fi
        ;;
esac

# 3. 生成进度报告
log "3. 生成每日进度报告..."
{
    echo "# 📊 Affirm项目 - 第 $DAY_NUM 天进度报告"
    echo "**日期：** $TODAY"
    echo "**开发日：** Day $DAY_NUM / 7"
    echo ""
    echo "## ✅ 今日完成"
    echo "- [ ] 任务1"
    echo "- [ ] 任务2"
    echo "- [ ] 任务3"
    echo ""
    echo "## 🐛 遇到的问题"
    echo "- 暂无"
    echo ""
    echo "## 📝 代码变更"
    echo "\`\`\`bash"
    git status --short 2>/dev/null || echo "无变更"
    echo "\`\`\`"
    echo ""
    echo "## 🗓️ 明日计划 (Day $((DAY_NUM + 1)))"
    echo "根据7天开发计划执行"
    echo ""
    echo "## 📈 总体进度"
    echo "- 已完成：$((DAY_NUM - 1)) / 7 天"
    echo "- 剩余：$((7 - DAY_NUM + 1)) 天"
    echo ""
    echo "---"
    echo "*报告生成时间：$(date)*"
} > "$REPORT_FILE"

# 4. 提交代码
log "4. 提交代码到GitHub..."
git add . 2>/dev/null || true
if git diff --cached --quiet; then
    log "没有代码变更，跳过提交"
else
    git commit -m "Day $DAY_NUM: 完成当日开发任务 - $TODAY" 2>/dev/null || error "提交失败"
    git push origin main 2>/dev/null || error "推送失败"
    log "✅ 代码已提交并推送到GitHub"
fi

# 5. 发送通知（通过OpenClaw）
log "5. 准备发送Telegram通知..."
# 这里可以调用OpenClaw发送消息

log "🎉 第 $DAY_NUM 天开发任务完成！"
log "📄 详细报告：$REPORT_FILE"
log "📋 日志文件：$LOG_FILE"

# 显示报告摘要
echo ""
echo "================================"
head -20 "$REPORT_FILE"
echo "================================"