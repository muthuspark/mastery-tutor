import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return [
      ...["/", "/login", "/settings", "/course/:path*", "/api/:path*"].map(source => ({ source, headers: [{ key: "Cache-Control", value: "private, no-store" }] })),
      { source: "/fonts/optimized/:file([a-z0-9-]+\\.[a-f0-9]{12}\\.woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
