import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

const MAX_BYTES = 2 * 1024 * 1024;
export function allowedFeedUrl(input: string, extraHosts = process.env.ICS_ALLOWED_HOSTS || ""): URL {
  let url: URL;
  try { url = new URL(input.trim().replace(/^webcal:/i, "https:")); }
  catch { throw new Error("Enter a valid HTTPS calendar feed URL."); }
  const host = url.hostname.toLowerCase();
  const providers = ["instructure.com", "gradescope.com"];
  const extra = extraHosts.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") || isIP(host.replace(/^\[|\]$/g, "")) ||
      !(providers.some(domain => host === domain || host.endsWith(`.${domain}`)) || extra.includes(host))) {
    throw new Error("Use an HTTPS Canvas or Gradescope feed. Add your school’s exact feed hostname to ICS_ALLOWED_HOSTS if needed.");
  }
  return url;
}
export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; }
  catch { return false; }
}

export async function fetchFeed(url: URL, dependencies: {
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  connect?: typeof request; timeoutMs?: number;
} = {}): Promise<string> {
  url = allowedFeedUrl(url.href);
  const timeoutMs = dependencies.timeoutMs ?? 12000, started = Date.now();
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  // Validate DNS then pin the resolved IP for this request to avoid DNS rebinding.
  const addresses = await Promise.race([
    (dependencies.resolve || (host => lookup(host, { all: true })))(url.hostname),
    new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error("Feed download timed out.")), timeoutMs); }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) {
    throw new Error("The feed hostname must resolve to a public internet address.");
  }
  const target = addresses[0];
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining <= 0) throw new Error("Feed download timed out.");
  return new Promise((resolve, reject) => {
    const req = (dependencies.connect || request)(url, {
      method: "GET", agent: false, family: target.family,
      headers: {
        Accept: "text/calendar",
        "Accept-Encoding": "identity",
        "User-Agent": "DueDrop/1.0",
      },
      // HTTPS still verifies the certificate against url.hostname.
      lookup: (_host, _options, callback) => callback(null, target.address, target.family),
    }, response => {
      response.on("error", reject);
      if (response.statusCode !== 200) {
        if (process.env.NODE_ENV === "development") {
          // Log only the status: feed URLs, redirects and response bodies may contain private tokens.
          console.warn("Calendar feed upstream returned a non-200 response.", {
            statusCode: response.statusCode ?? "unknown",
          });
        }
        response.resume();
        const error = new Error("The feed did not return a calendar. Use the direct feed URL, not a login page or redirect.");
        reject(error); req.destroy(error);
        return;
      }
      if (Number(response.headers["content-length"]) > MAX_BYTES) { const error = new Error("Calendar feeds must be smaller than 2 MB."); reject(error); req.destroy(error); return; }
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { const error = new Error("Calendar feeds must be smaller than 2 MB."); reject(error); req.destroy(error); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    const timer = setTimeout(() => req.destroy(new Error("Feed download timed out.")), remaining);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}
