import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/trends/:path*",
        destination: "http://localhost:4000/trends/:path*",
      },
    ];
  },
};

export default nextConfig;
