module.exports = {
  apps: [
    {
      name: 'nanobanana-dev',
      script: 'npm',
      args: 'run dev',
      cwd: '/root/docker_tmp/nanobanana',
      env: {
        NODE_ENV: 'development',
      },
      watch: false, // Next.js 自带热更新，不需要 pm2 的 watch
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'nanobanana-prod',
      script: 'node_modules/.bin/next',
      args: 'start -H 0.0.0.0 -p 3004',
      cwd: '/root/docker_tmp/nanobanana',
      env: {
        NODE_ENV: 'production',
        PORT: '3004',
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/pm2-error-prod.log',
      out_file: './logs/pm2-out-prod.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      instances: 1, // 生产环境可以用集群模式，但 Next.js 建议单实例
    },
  ],
};
