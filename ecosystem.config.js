module.exports = {
  apps: [{
    name: 'L9Weakness',
    cwd: './discord-bot',
    script: 'index.ts',
    interpreter: 'node',
    interpreter_args: '-r ts-node/register',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Garante 24/7
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
  }],
};
