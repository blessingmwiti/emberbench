module.exports = {
  apps: [
    {
      name: 'emberbench',
      script: 'scripts/serve-dist.mjs',
      interpreter: 'node',
      cwd: __dirname,
      env: {
        HOST: process.env.HOST ?? '127.0.0.1',
        NODE_ENV: 'production',
        PORT: process.env.PORT ?? '4173',
      },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
