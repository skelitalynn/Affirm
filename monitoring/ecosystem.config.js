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
