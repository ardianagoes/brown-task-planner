import type { NextConfig } from "next";
const ocrPolicy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'";
const config: NextConfig = {
  async headers() {
    // Isolate only OCR workers: even a library CDN default cannot leave this origin.
    return ["/ocr-runner.js", "/ocr/:path*"].map(source => ({
      source, headers: [{ key: "Content-Security-Policy", value: ocrPolicy }],
    }));
  },
};
export default config;
