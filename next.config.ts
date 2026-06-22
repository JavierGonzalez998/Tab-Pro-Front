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
};

export default nextConfig;
