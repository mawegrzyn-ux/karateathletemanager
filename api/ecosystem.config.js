module.exports = {
  apps: [
    {
      name: "nadakarate-api",
      script: "src/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
