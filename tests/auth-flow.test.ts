import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthFlowError, RECOVERY_COOKIE, LINK_COOKIE, LINK_TTL, encodeTicket, readTicket, ticketFromUrl, signRecovery, validRecovery, verifiedIdentity, verifyEmailLink, requireRecovery, updateRecoveryPassword, authDiagnostic } from "../lib/auth-flow";
import { stageAuth, confirmAuth } from "../lib/auth-handlers";
import { authRouteClient } from "../lib/supabase/route";
import { requestEmail } from "../lib/auth-requests";
import { readForm } from "../lib/http";
const origin = "https://brown-task-planner.vercel.app", secret = "test-only-".repeat(8), token = "a".repeat(64);
process.env.NEXT_PUBLIC_APP_URL = origin;
const userId = "11111111-1111-4111-8111-111111111111", sessionId = "22222222-2222-4222-8222-222222222222";
type Auth = SupabaseClient["auth"];
function fakeAuth(patch: Record<string, unknown> = {}) {
  const calls = { verify: 0, exchange: 0, update: 0, logout: 0 };
  const auth = {
    verifyOtp: async () => { calls.verify++; return { data: { user: { id: userId }, session: { access_token: "private", user: { id: userId } } }, error: null }; },
    exchangeCodeForSession: async () => { calls.exchange++; return { data: { user: { id: userId }, session: { access_token: "private" } }, error: null }; },
    getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: userId, session_id: sessionId, amr: [{ method: "otp" }] } }, error: null }),
    updateUser: async () => { calls.update++; return { data: { user: { id: userId } }, error: null }; },
    signOut: async () => { calls.logout++; return { error: null }; }, ...patch,
  } as unknown as Auth;
  return { auth, calls };
}
const ticket = (type = "recovery") => ticketFromUrl(new URL(`${origin}/auth/confirm?token_hash=${token}&type=${type}`));
const reason = (value: string) => (error: unknown) => error instanceof AuthFlowError && error.reason === value;

test("valid hash recovery creates a session-bound grant and reaches reset instead of login", async () => {
  const { auth, calls } = fakeAuth(); const result = await verifyEmailLink(auth, ticket(), secret);
  assert.equal(result.destination, "/auth/reset"); assert.ok(validRecovery(result.recovery!, userId, sessionId, secret));
  await requireRecovery(auth, result.recovery!, secret); assert.equal(calls.verify, 1); assert.equal(calls.exchange, 0);
});
test("invalid/expired/used tokens fail closed, including when an older session already exists", async () => {
  for (const [code, expected] of [["otp_expired", "expired"], ["validation_failed", "invalid"]]) {
    const { auth } = fakeAuth({ verifyOtp: async () => ({ data: { user: null, session: null }, error: { code, status: 403, message: "PRIVATE" } }) });
    await assert.rejects(verifyEmailLink(auth, ticket(), secret), reason(expected));
  }
  let used = false;
  const base = fakeAuth(); const original = base.auth.verifyOtp.bind(base.auth);
  base.auth.verifyOtp = (async (...args: Parameters<Auth["verifyOtp"]>) => { if (used) return { data: { user: null, session: null }, error: { code: "otp_expired" } }; used = true; return original(...args); }) as Auth["verifyOtp"];
  await verifyEmailLink(base.auth, ticket(), secret); await assert.rejects(verifyEmailLink(base.auth, ticket(), secret), reason("expired"));
});
test("magic links and legacy signup aliases verify as email; invalid magic links do not sign in", async () => {
  for (const type of ["email", "signup", "magiclink"]) {
    let actual: unknown; const base = fakeAuth(); const original = base.auth.verifyOtp.bind(base.auth);
    base.auth.verifyOtp = (async params => { actual = params; return original(params); }) as Auth["verifyOtp"];
    const result = await verifyEmailLink(base.auth, ticket(type), secret);
    assert.equal(result.destination, "/"); assert.equal(result.recovery, null); assert.deepEqual(actual, { token_hash: token, type: "email" });
  }
  const { auth } = fakeAuth({ verifyOtp: async () => ({ data: { user: null, session: null }, error: { code: "otp_expired" } }) });
  await assert.rejects(verifyEmailLink(auth, ticket("email")), reason("expired"));
});
test("missing sessions, revoked users and unverified/mismatched JWT identities never succeed", async () => {
  for (const patch of [
    { verifyOtp: async () => ({ data: { user: { id: userId }, session: null }, error: null }) },
    { getUser: async () => ({ data: { user: null }, error: new Error("revoked") }) },
    { getClaims: async () => ({ data: null, error: new Error("bad signature") }) },
    { getClaims: async () => ({ data: { claims: { sub: "other", session_id: sessionId } }, error: null }) },
  ]) await assert.rejects(verifyEmailLink(fakeAuth(patch).auth, ticket(), secret), reason("session"));
});
test("PKCE exchanges remain supported, but recovery routing needs signed recovery claims", async () => {
  const pkce = ticketFromUrl(new URL(`${origin}/auth/callback?code=valid-code-123&next=/auth/reset`));
  const base = fakeAuth({ getClaims: async () => ({ data: { claims: { sub: userId, session_id: sessionId, amr: [{ method: "recovery" }] } }, error: null }) });
  assert.equal((await verifyEmailLink(base.auth, pkce, secret)).destination, "/auth/reset"); assert.equal(base.calls.exchange, 1);
  await assert.rejects(verifyEmailLink(fakeAuth().auth, pkce, secret), reason("recovery"));
  const missing = fakeAuth({ exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: { code: "pkce_code_verifier_not_found" } }) });
  await assert.rejects(verifyEmailLink(missing.auth, pkce, secret), reason("pkce"));
  const normal = ticketFromUrl(new URL(`${origin}/auth/callback?code=valid-code-123&next=https://evil.example`));
  assert.equal((await verifyEmailLink(fakeAuth().auth, normal)).destination, "/");
});
test("recovery grants reject tampering, expiry, other accounts/sessions, missing secrets and password-only sessions", async () => {
  const now = Date.now(), grant = signRecovery(userId, sessionId, secret, now);
  assert.equal(validRecovery(grant + "x", userId, sessionId, secret, now), false);
  assert.equal(validRecovery(grant, "other", sessionId, secret, now), false);
  assert.equal(validRecovery(grant, userId, "other", secret, now), false);
  assert.equal(validRecovery(grant, userId, sessionId, secret, now + 1800001), false);
  assert.equal(validRecovery(grant, userId, sessionId, undefined, now), false);
  await assert.rejects(requireRecovery(fakeAuth().auth, undefined, secret), reason("recovery"));
  const base = fakeAuth(); await assert.rejects(verifyEmailLink(base.auth, ticket()), reason("configuration")); assert.equal(base.calls.verify, 0);
});
test("password update requires verified recovery, validates confirmation, and signs out the local session after success", async () => {
  const grant = signRecovery(userId, sessionId, secret), body = { password: "a-long-test-password", confirm: "a-long-test-password" };
  const base = fakeAuth(); await updateRecoveryPassword(base.auth, grant, secret, body); assert.equal(base.calls.update, 1); assert.equal(base.calls.logout, 1);
  await assert.rejects(updateRecoveryPassword(base.auth, undefined, secret, body), reason("recovery"));
  await assert.rejects(updateRecoveryPassword(base.auth, grant, secret, { ...body, confirm: "mismatch" })); assert.equal(base.calls.update, 1);
  const broken = fakeAuth({ updateUser: async () => ({ data: { user: null }, error: { code: "weak_password", message: "PRIVATE" } }) });
  await assert.rejects(updateRecoveryPassword(broken.auth, grant, secret, body), /Could not update/); assert.equal(broken.calls.logout, 0);
});
test("GET callbacks stage links without consuming tokens; clean redirect and secure/private cookies protect the landing page", async () => {
  const response = await stageAuth(new NextRequest(`${origin}/auth/confirm?token_hash=${token}&type=recovery&next=https://evil.example`));
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), `${origin}/auth/confirm/continue`);
  const cookie = response.cookies.get(LINK_COOKIE); assert.ok(cookie?.httpOnly); assert.equal(cookie?.secure, true); assert.equal(cookie?.sameSite, "lax");
  assert.equal(cookie?.maxAge, LINK_TTL); assert.equal(readTicket(cookie?.value)?.credential, token);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer"); assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.cookies.get(RECOVERY_COOKIE), undefined);
});
test("confirmation POST rejects missing/foreign Origin and CSRF nonce before contacting Supabase", async () => {
  const t = ticket();
  for (const headers of [{}, { Origin: "https://evil.example" }, { Origin: origin }] as Record<string, string>[]) {
    let contacted = false;
    const request = new NextRequest(`${origin}/auth/confirm`, { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", Cookie: `${LINK_COOKIE}=${encodeTicket(t)}` }, body: "nonce=wrong" });
    const response = await confirmAuth(request, { secret, route: (() => { contacted = true; throw new Error("not expected"); }) as typeof authRouteClient });
    assert.equal(contacted, false); assert.ok([303, 403].includes(response.status));
  }
});
test("provider error reasons are safe and diagnostics never include secret-bearing messages/objects", () => {
  const previous = process.env.NODE_ENV, messages: string[] = [], original = console.warn;
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  console.warn = (...values) => { messages.push(JSON.stringify(values)); };
  try { authDiagnostic("verify_email_link", { code: "otp_expired", status: 403, message: "SECRET token_hash=secret", token: "SECRET", url: "SECRET" }); }
  finally { console.warn = original; const env = process.env as Record<string, string | undefined>; if (previous) env.NODE_ENV = previous; else delete env.NODE_ENV; }
  assert.match(messages[0], /otp_expired/); assert.match(messages[0], /403/); assert.doesNotMatch(messages[0], /SECRET|token_hash/);
});
test("malformed/duplicate callback parameters cannot cause open redirects or consume a token", async () => {
  for (const query of ["", `token_hash=${token}&type=invite`, `token_hash=${token}&type=email&type=recovery`, `code=valid-code&token_hash=${token}&type=email`]) {
    const response = await stageAuth(new NextRequest(`${origin}/auth/confirm?${query}`));
    assert.equal(new URL(response.headers.get("location")!).origin, origin); assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
  }
  assert.equal(readTicket(encodeTicket({ ...ticket(), expires: Date.now() - 1 })), null);
  await assert.rejects(readForm(new Request(origin, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": "1" }, body: "x".repeat(1025) }), 1024));
});
test("magic email requests never create unknown accounts and use the canonical production redirect", async () => {
  const calls: unknown[] = [];
  const auth = { signInWithOtp: async (value: unknown) => { calls.push(value); return { error: null }; }, resetPasswordForEmail: async (...args: unknown[]) => { calls.push(args); return { error: null }; } } as unknown as Auth;
  await requestEmail(auth, "magic", "test@example.com", origin); await requestEmail(auth, "forgot", "test@example.com", origin);
  assert.deepEqual(calls[0], { email: "test@example.com", options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` } });
  assert.deepEqual(calls[1], ["test@example.com", { redirectTo: `${origin}/auth/callback?next=/auth/reset` }]);
});

function jwt(method = "otp") {
  const now = Math.floor(Date.now() / 1000);
  return [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated", amr: [{ method, timestamp: now }] })).toString("base64url"), Buffer.from("test-signature-bytes").toString("base64url")].join(".");
}
for (const type of ["recovery", "email"]) test(`real SSR cookie adapter establishes a cross-browser ${type} session, including all cookie chunks`, async () => {
  const access = jwt(), user = { id: userId, aud: "authenticated", role: "authenticated", email: "test@example.com", created_at: new Date().toISOString(), app_metadata: {}, user_metadata: { padding: "x".repeat(5000) } };
  const requests: { path: string; body: Record<string, unknown> | null }[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const body = init?.body ? JSON.parse(String(init.body)) : null; requests.push({ path: url.pathname, body });
    if (url.pathname.endsWith("/verify")) { assert.equal(body?.token_hash, token); assert.equal(body?.type, type); return Response.json({ access_token: access, refresh_token: "private-test-refresh", expires_in: 3600, token_type: "bearer", user }); }
    if (url.pathname.endsWith("/user")) return Response.json(user);
    throw new Error("Unexpected mocked request " + url.pathname);
  };
  const t = ticket(type);
  const request = new NextRequest(`${origin}/auth/confirm`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", Cookie: `${LINK_COOKIE}=${encodeTicket(t)}` }, body: new URLSearchParams({ nonce: t.nonce }).toString() });
  const config = { url: "https://project.supabase.co", key: "test-publishable-key" };
  const response = await confirmAuth(request, { secret, route: ((req, secure) => authRouteClient(req, secure, config, fetchMock)) as typeof authRouteClient });
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), origin + (type === "recovery" ? "/auth/reset" : "/"));
  const cookies = response.cookies.getAll().filter(cookie => cookie.name.startsWith("sb-project-auth-token.")); assert.ok(cookies.length > 1);
  assert.ok(cookies.every(cookie => cookie.secure && cookie.sameSite === "lax"));
  assert.ok(response.cookies.get(RECOVERY_COOKIE)?.httpOnly); assert.equal(response.cookies.get(LINK_COOKIE)?.maxAge, 0);
  assert.equal(response.cookies.get(RECOVERY_COOKIE)?.maxAge, type === "recovery" ? 1800 : 0);
  const followup = new NextRequest(`${origin}/auth/reset`, { headers: { Cookie: response.cookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join("; ") } });
  const nextClient = authRouteClient(followup, true, config, fetchMock);
  if (type === "recovery") await requireRecovery(nextClient.client.auth, response.cookies.get(RECOVERY_COOKIE)?.value, secret);
  else assert.equal((await verifiedIdentity(nextClient.client.auth)).userId, userId);
  assert.equal(requests.filter(request => request.path.endsWith("/verify")).length, 1);
  assert.ok(requests.every(request => !request.path.endsWith("/token")), "Hash verification cannot require a PKCE code verifier");
  assert.match(nextClient.apply(NextResponse.next()).headers.get("cache-control")!, /no-store/);
});

test("real SSR PKCE exchange preserves the SDK flow ID and the requesting browser's verifier slot", async () => {
  const flowId = "test-flow-id-1234", verifier = "test-only-pkce-verifier", user = { id: userId, aud: "authenticated", role: "authenticated" };
  let exchanges = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/token")) {
      exchanges++; assert.equal(url.searchParams.get("grant_type"), "pkce");
      assert.equal(JSON.parse(String(init?.body)).code_verifier, verifier);
      return Response.json({ access_token: jwt("recovery"), refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user });
    }
    if (url.pathname.endsWith("/user")) return Response.json(user);
    throw new Error("Unexpected mocked PKCE request");
  };
  const t = ticketFromUrl(new URL(`${origin}/auth/callback?code=test-auth-code&next=/auth/reset&sb_flow_id=${flowId}`));
  const cookie = `sb-project-auth-token-flow-${flowId}-code-verifier=base64-${Buffer.from(JSON.stringify(verifier + "/recovery")).toString("base64url")}`;
  const request = new NextRequest(`${origin}/auth/confirm`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", Cookie: `${LINK_COOKIE}=${encodeTicket(t)}; ${cookie}` }, body: new URLSearchParams({ nonce: t.nonce }).toString() });
  const response = await confirmAuth(request, { secret, route: ((req, secure) => authRouteClient(req, secure, { url: "https://project.supabase.co", key: "test-publishable-key" }, fetchMock)) as typeof authRouteClient });
  assert.equal(response.headers.get("location"), `${origin}/auth/reset`); assert.equal(exchanges, 1);
  assert.ok(response.cookies.get(RECOVERY_COOKIE)?.value);
  assert.equal(response.cookies.get(`sb-project-auth-token-flow-${flowId}-code-verifier`)?.maxAge, 0);
});
