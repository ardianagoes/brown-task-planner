import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { readBoundedBody, HttpError } from "../lib/http";
import { screenshotIpHash, screenshotRequestId, reserveScreenshot, type Admission } from "../lib/ai-admission";
import { processImageExtraction } from "../lib/image-extraction";
import { extractWithOpenAI } from "../lib/openai-image";
import config from "../next.config";
const origin = "http://127.0.0.1:3000", secret = "unit-test-purpose-separated-secret";
process.env.NEXT_PUBLIC_APP_URL = origin;
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
const request = (headers: Record<string, string> = {}) => new Request(origin + "/api/tasks/extract-image", { method: "POST", headers: { Origin: origin, ...headers } });

test("paid AI is off by default even with a key, before body reading, quota reservation or provider calls", async () => {
  const req = request(); let reservations = 0, calls = 0;
  Object.defineProperty(req, "body", { get() { throw new Error("Body must not be read"); } });
  const access = { reserve: async (): Promise<Admission> => { reservations++; return { allowed: true, reason: "allowed", retryAfter: 60 }; }, consumeSlot: async () => ({ allowed: true, retryAfter: 600 }) };
  for (const enabled of [undefined, false]) await assert.rejects(processImageExtraction(req, { enabled, apiKey: "mock", authorize: async () => access, extract: async () => { calls++; throw new Error(); } }), status(503));
  assert.equal(reservations, 0); assert.equal(calls, 0);
});

test("shared quota denial or failure blocks uploads and all paid work, including direct API callers", async () => {
  let calls = 0;
  for (const reason of ["account", "duplicate", "daily", "monthly", "busy", "ip"] as const) {
    const req = request(); Object.defineProperty(req, "body", { get() { throw new Error("Must not read"); } });
    await assert.rejects(processImageExtraction(req, { enabled: true, apiKey: "mock", authorize: async () => ({ reserve: async () => ({ allowed: false, reason, retryAfter: 60 }), consumeSlot: async () => { throw new Error("Must not consume legacy slot"); } }), extract: async () => { calls++; throw new Error(); } }), status(reason === "account" ? 403 : reason === "duplicate" ? 409 : 429));
  }
  await assert.rejects(processImageExtraction(request(), { enabled: true, apiKey: "mock", authorize: async () => ({ reserve: async () => { throw new HttpError(503, "Safeguards unavailable"); }, consumeSlot: async () => ({ allowed: true, retryAfter: 60 }) }) }), status(503));
  assert.equal(calls, 0);
});

test("IP limits trust platform headers only on Vercel and canonicalize IPv4-mapped addresses", () => {
  const env = { vercel: "1", nodeEnv: "production" } as const;
  const hashed = screenshotIpHash(request({ "x-vercel-forwarded-for": "8.8.8.8", "x-forwarded-for": "1.1.1.1" }), secret, env);
  assert.match(hashed, /^[a-f0-9]{64}$/); assert.ok(!hashed.includes("8.8.8.8"));
  assert.equal(screenshotIpHash(request({ "x-vercel-forwarded-for": "::ffff:8.8.8.8" }), secret, env), hashed);
  for (const headers of [{}, { "x-forwarded-for": "8.8.8.8" }, { "x-vercel-forwarded-for": "8.8.8.8, 1.1.1.1" }, { "x-vercel-forwarded-for": "127.0.0.1" }, { "x-vercel-forwarded-for": "not an IP" }] as Record<string, string>[]) assert.throws(() => screenshotIpHash(request(headers), secret, env), status(503));
  assert.throws(() => screenshotIpHash(request({ "x-vercel-forwarded-for": "8.8.8.8" }), secret, { vercel: undefined, nodeEnv: "production" }), status(503));
  assert.throws(() => screenshotIpHash(request({ "x-vercel-forwarded-for": "8.8.8.8" }), undefined, env), status(503));
  const dev = { vercel: undefined, nodeEnv: "development" } as const;
  assert.equal(screenshotIpHash(request({ "x-forwarded-for": "8.8.8.8" }), secret, dev), screenshotIpHash(request({ "x-forwarded-for": "1.1.1.1" }), secret, dev));
});

test("admission RPC errors and malformed results fail closed without leaking provider details", async () => {
  for (const response of [{ data: null, error: { message: "SECRET database details" } }, { data: { allowed: true, reason: "daily", retryAfter: 60 }, error: null }, { data: { allowed: true, reason: "allowed", retryAfter: -1 }, error: null }]) {
    const supabase = { rpc: async () => response } as unknown as SupabaseClient<Database>;
    await assert.rejects(reserveScreenshot(supabase, request(), secret), error => error instanceof HttpError && error.status === 503 && !error.message.includes("SECRET"));
  }
  const id = randomUUID(); let args: unknown;
  const supabase = { rpc: async (name: string, input: unknown) => { assert.equal(name, "reserve_screenshot"); args = input; return { data: { allowed: true, reason: "allowed", retryAfter: 60 }, error: null }; } } as unknown as SupabaseClient<Database>;
  await reserveScreenshot(supabase, request({ "X-Extraction-Id": id }), secret);
  assert.equal((args as { p_request_id: string }).p_request_id, id); assert.match((args as { p_ip_hash: string }).p_ip_hash, /^[a-f0-9]{64}$/);
  assert.throws(() => screenshotRequestId(request({ "X-Extraction-Id": "SECRET not a UUID" })), status(400));
});

test("stream byte caps and deadlines cannot be bypassed by false lengths or stalled cancellation", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(20)); }, cancel() { return new Promise(() => {}); } });
  const oversized = new Request(origin, { method: "POST", headers: { "Content-Length": "1" }, body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(oversized, 10, 20), status(413));
  const stalled = new Request(origin, { method: "POST", body: new ReadableStream({ pull() { return new Promise(() => {}); } }), duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(stalled, 100, 15), status(408));
});

test("client cancellation prevents a new OpenAI request and never exposes a private error", async () => {
  const abort = new AbortController(); abort.abort(); let calls = 0;
  await assert.rejects(extractWithOpenAI(Buffer.from("test"), "mock", { referenceDate: "2026-11-09", timezone: "America/New_York" }, undefined, async () => { calls++; throw new Error("SECRET"); }, abort.signal), status(408));
  assert.equal(calls, 0);
});

test("global response headers prevent framing/sniffing while auth keeps no-referrer and no-store", async () => {
  assert.equal(config.poweredByHeader, false);
  const headers = await config.headers!();
  const global = headers.find(item => item.source === "/:path*")!;
  assert.ok(global.headers.some(header => header.key === "X-Content-Type-Options" && header.value === "nosniff"));
  assert.ok(global.headers.some(header => header.key === "Content-Security-Policy" && header.value.includes("frame-ancestors 'none'")));
  for (const path of ["/auth/:path*", "/api/auth/:path*", "/login"]) {
    const item = headers.find(item => item.source === path)!;
    assert.ok(item.headers.some(header => header.key === "Referrer-Policy" && header.value === "no-referrer"));
    assert.ok(item.headers.some(header => header.key === "Cache-Control" && header.value.includes("no-store")));
  }
});
