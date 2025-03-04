import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: false,
  basePath: process.env.NODE_ENV === "production" ? "/teaching-llm-agent" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/teaching-llm-agent/" : "",
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  }
};

export default nextConfig;