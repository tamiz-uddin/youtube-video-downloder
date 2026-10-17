module.exports = {
  apps: [
    {
      name: 'vidloader-studio',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3333
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3333,
        HOST: '0.0.0.0',
        MAX_CONCURRENT_DOWNLOADS: 3
      },
      kill_timeout: 10000,
      listen_timeout: 8000,
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
