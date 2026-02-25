#!/bin/bash
# 发送Telegram报告脚本

TELEGRAM_BOT_TOKEN="8660795224:AAHPGWzHMqTmPLcK6Ldgo1esBdlvnjo8ZTI"
CHAT_ID="7927819221"  # 你的Telegram用户ID

REPORT_FILE="/root/projects/Affirm/daily-report.md"

# 从报告文件中提取关键信息
DATE=$(date '+%Y-%m-%d')
DAY_NUM=1
TOTAL_DAYS=7

# 创建消息内容（使用HTML格式）
MESSAGE="<b>🚀 Affirm项目 - Day $DAY_NUM 进度报告</b>

<b>📅 日期：</b> $DATE
<b>📊 开发日：</b> Day $DAY_NUM / $TOTAL_DAYS

<b>✅ 今日完成：</b>
• 创建项目目录结构
• 初始化Node.js项目 (package.json)
• 创建数据库初始化脚本
• 创建基础配置文件
• 创建数据库连接模块
• 创建.gitignore文件
• 更新自动化脚本
• 创建Day 1完成标记

<b>⚠️ 遇到的问题：</b>
1. PostgreSQL pgvector扩展需要手动安装
2. API密钥需要用户填写
3. 数据库表结构部分创建（需要pgvector）

<b>📝 代码变更：</b>
已提交9个文件，包括：
- package.json
- src/config.js
- src/db/connection.js
- scripts/init-db.sql
- .gitignore
- DAY1_COMPLETED.md

<b>🗓️ 明日计划 (Day 2)：</b>
核心数据层开发：
1. 安装项目依赖
2. 测试数据库连接
3. 实现messages表的CRUD操作
4. 实现向量嵌入生成和存储
5. 实现语义检索功能
6. 编写基础测试

<b>📈 总体进度：</b>
• 已完成：$DAY_NUM / $TOTAL_DAYS 天 ($(echo "scale=1; $DAY_NUM*100/$TOTAL_DAYS" | bc)%)
• 剩余：$((TOTAL_DAYS - DAY_NUM)) 天

<b>🔧 需要手动完成：</b>
1. 填写API密钥：编辑 <code>/root/projects/Affirm/.env</code>
2. 安装pgvector扩展
3. 测试配置：运行 <code>./verify-setup.sh</code>

<b>🔗 GitHub提交：</b> https://github.com/skelitalynn/Affirm/commit/6886dbb

---
<i>报告生成时间：$(date '+%H:%M %p %Z')</i>"

# 发送到Telegram
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "text=${MESSAGE}" \
    -d "parse_mode=HTML" \
    -d "disable_web_page_preview=true"

echo ""
echo "✅ Telegram报告已发送"