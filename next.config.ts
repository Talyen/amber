import type { NextConfig } from "next";

const browserFixture = process.env.AMBER_BROWSER_TEST_DATABASE_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  ...(browserFixture && {
    experimental: {
      fetchCacheKeyPrefix: new URL(browserFixture).pathname,
      isrFlushToDisk: false,
    },
  }),
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      fallback: [{
        source: "/:path*",
        has: [{ type: "header", key: "x-amber-markdown-fallback", value: "1" }],
        destination: "/agent-not-found",
      }],
    };
  },
};

export default nextConfig;
