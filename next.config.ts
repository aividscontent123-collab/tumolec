import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project — without it Turbopack walks up
  // to C:\Users\miros and picks up an unrelated stray package-lock.json.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.steamstatic.com" },
      { protocol: "https", hostname: "*.akamai.steamstatic.com" },
    ],
  },
};

export default nextConfig;
