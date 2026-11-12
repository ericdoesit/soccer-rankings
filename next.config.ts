import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Lets a production build run beside `next dev` (e.g. NEXT_DIST_DIR=.next-prod for load tests)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the workspace root to this project. Without this, Turbopack picks up
  // the stray ~/package-lock.json and treats the home directory as the root,
  // which corrupts the dev cache and breaks module resolution.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
