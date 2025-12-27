import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 standalone 输出模式（用于 Docker 部署）
  output: "standalone",
  // 增加 Server Actions 请求体大小限制到 10MB
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "doubao.luzhipeng.com",
      },
    ],
  },
};

export default nextConfig;
