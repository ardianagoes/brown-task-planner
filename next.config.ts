import type { NextConfig } from "next";
const config: NextConfig = {
  logging: { incomingRequests: { ignore: [/^\/auth\//, /^\/api\/auth\//] } },
  async headers() {
    return ["/auth/:path*", "/api/auth/:path*", "/login"].map(source => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ] }));
  },
};
export default config;
