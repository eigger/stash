const pkg = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    APP_VERSION: pkg.version,
  },
};

module.exports = nextConfig;
