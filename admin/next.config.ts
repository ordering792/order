import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Docker image ထဲမှာ လိုအပ်တဲ့ file တွေပဲ ထည့်စုဖို့ (self-hosting / Railway)
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["node_modules/sharp/**/*"],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
