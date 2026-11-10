import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/^\/auth\//, /^\/api\/auth\//] } },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }, ...["/auth/:path*", "/api/auth/:path*", "/login"].map(source => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ] }))];
  },
};
export default config;
