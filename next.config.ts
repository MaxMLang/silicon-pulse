import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/mip", destination: "/about#news-digests", permanent: true }]
  },
};

export default nextConfig;
