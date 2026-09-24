/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No wildcard Server Action origins — same-origin by default.
  // Add explicit domains via SERVER_ACTIONS_ALLOWED_ORIGINS="app.example.com,admin.example.com" if needed.
  experimental: {
    serverActions: {
      allowedOrigins: (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
