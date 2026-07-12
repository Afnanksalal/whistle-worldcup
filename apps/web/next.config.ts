import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@whistle/shared"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
