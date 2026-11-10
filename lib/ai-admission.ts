import { createHmac, randomUUID } from "node:crypto";
import ipaddr from "ipaddr.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { HttpError } from "./http";

export type Admission = { allowed: boolean; reason: "allowed" | "account" | "duplicate" | "monthly" | "daily" | "busy" | "ip"; retryAfter: number };
const unavailable = () => new HttpError(503, "Screenshot safeguards are unavailable. Use Manual Entry or contact the app owner.");
export function screenshotRequestId(request: Request) {
  const id = request.headers.get("X-Extraction-Id") ?? randomUUID();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, "Invalid screenshot request identifier.");
  return id;
}
export function screenshotIpHash(request: Request, secret: string | undefined, environment = { vercel: process.env.VERCEL, nodeEnv: process.env.NODE_ENV }) {
  if (!secret || secret.trim().length < 32) throw unavailable();
  let address: string;
  if (environment.vercel === "1") {
    // Trust only Vercel's platform-supplied address on a Vercel runtime. Never use
    // client-supplied forwarding headers on arbitrary/self-hosted deployments.
    const supplied = request.headers.get("x-vercel-forwarded-for");
    try {
      if (!supplied || supplied.includes(",")) throw new Error();
      const ip = ipaddr.process(supplied.trim());
      if (ip.range() !== "unicast") throw new Error();
      address = ip.toNormalizedString();
    } catch { throw unavailable(); }
  } else if (environment.nodeEnv !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)) {
    address = "local-development"; // One conservative bucket, not spoofable X-Forwarded-For.
  } else throw unavailable();
  // Purpose-separated from recovery-cookie signatures; no plaintext IP is stored.
  const key = createHmac("sha256", secret).update("DueDrop screenshot IP key v1").digest();
  return createHmac("sha256", key).update(address).digest("hex");
}
export async function reserveScreenshot(supabase: SupabaseClient<Database>, request: Request, secret: string | undefined): Promise<Admission> {
  const { data, error } = await supabase.rpc("reserve_screenshot", { p_ip_hash: screenshotIpHash(request, secret), p_request_id: screenshotRequestId(request) });
  const slot = data as Partial<Admission> | null;
  const reasons = ["allowed", "account", "duplicate", "monthly", "daily", "busy", "ip"];
  if (error || !slot || typeof slot.allowed !== "boolean" || !reasons.includes(String(slot.reason)) ||
    !Number.isInteger(slot.retryAfter) || Number(slot.retryAfter) < 1 || Number(slot.retryAfter) > 86400 || (slot.allowed !== (slot.reason === "allowed"))) throw unavailable();
  return slot as Admission;
}
