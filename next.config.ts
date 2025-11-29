import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve("buffer"),
      };
    }
    return config;
  },
  // Add empty turbopack config to silence warning
  // The webpack config is needed for Buffer polyfill
  turbopack: {},
};

export default nextConfig;
