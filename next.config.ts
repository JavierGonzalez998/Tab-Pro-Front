import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ponytail: cache soundfont for 1 year since it never changes
  async headers() {
    return [
      {
        source: "/soundfont/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  // Proxy /api/proxy/* to the private backend so the browser never needs to
  // resolve the internal Railway domain directly.
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
