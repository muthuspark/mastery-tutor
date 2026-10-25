import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/", "/login", "/settings", "/course/:path*", "/api/:path*"].map(source => ({ source, headers: [{ key: "Cache-Control", value: "private, no-store" }] }));
  },
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
