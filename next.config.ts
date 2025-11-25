import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 增加 Server Actions 请求体大小限制到 10MB
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // 增加 API 路由请求体大小限制
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default nextConfig;
