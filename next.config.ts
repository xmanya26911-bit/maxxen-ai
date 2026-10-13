import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  // Framework default: double-invokes effects in dev to surface missing
  // cleanup / refetch bugs. Dev-only — production builds are unaffected.
  reactStrictMode: true,
};

export default nextConfig;
