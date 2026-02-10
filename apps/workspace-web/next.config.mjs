/** @type {import('next').NextConfig} */
const nextConfig = {
  // [通用推荐] 启用 React 严格模式，有助于发现潜在问题。
  reactStrictMode: true,

  // [Monorepo / 部署优化] 启用 standalone 模式。
  // 目的: 为 Docker/容器化部署创建最小化构建输出，只包含生产运行所需文件。
  output: 'standalone',

  // [Monorepo 兼容性] 确保 Next.js 编译共享的内部包（如果存在）。
  // 目的: 解决在 Monorepo 中引入未编译的 ES 模块时可能出现的构建/运行时错误。
  transpilePackages: [
    // 请在此处添加您在 packages/* 目录下创建的共享包名称
    // 例如: '@orbitaskflow/shared-ui', '@orbitaskflow/utils'
  ],

  experimental: {
    // [TypeScript 增强] 启用类型化路由，提供更好的路由类型安全和开发体验。
    typedRoutes: true,
  },

  // [运行时环境变量] 在服务器启动时读取，不会被打包到客户端。
  // Runtime environment variables: read at server startup, not bundled into client.
  env: {
    // 网关地址（如果配置了网关，优先使用；否则回退到直接访问 site-auth）。
    // Gateway URL (if gateway is configured, use it; otherwise fallback to direct site-auth access).
    // 注意：PUBLIC_APISIX_* 变量名保持向后兼容，实际使用 Nginx 网关。
    // Note: PUBLIC_APISIX_* variable names are kept for backward compatibility, but Nginx gateway is used.
    PUBLIC_APISIX_BASE_URL: process.env.PUBLIC_APISIX_BASE_URL || process.env.PUBLIC_NGINX_BASE_URL || '',
    PUBLIC_APISIX_WS_URL: process.env.PUBLIC_APISIX_WS_URL || process.env.PUBLIC_NGINX_WS_URL || '',
    // 保留向后兼容的变量。
    // Keep backward-compatible variables.
    SITE_AUTH_SERVICE_URL: process.env.SITE_AUTH_SERVICE_URL || '',
    AGENT_GATEWAY_SERVICE_URL: process.env.AGENT_GATEWAY_SERVICE_URL || '',
  },
};

export default nextConfig;