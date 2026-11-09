import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/server/security-headers";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/approvals",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders({
          nodeEnv: process.env.NODE_ENV,
          appUrl: process.env.APP_URL ?? "http://localhost:3000",
        }),
      },
    ];
  },
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
