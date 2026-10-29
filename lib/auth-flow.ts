import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkReason } from "./auth-messages";
export const LINK_COOKIE = "dd-email-link", RECOVERY_COOKIE = "dd-recovery";
export const LINK_TTL = 600, RECOVERY_TTL = 1800;
type Auth = SupabaseClient["auth"];
export type LinkTicket = { method: "hash" | "pkce"; credential: string; type: "email" | "recovery"; nonce: string; expires: number; flowId?: string };
export class AuthFlowError extends Error { constructor(public reason: LinkReason) { super(reason); } }
const fail = (reason: LinkReason): never => { throw new AuthFlowError(reason); };
export function providerReason(error: unknown, pkce = false): LinkReason {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "otp_expired") return "expired";
  if (pkce && ["pkce_code_verifier_not_found", "flow_state_not_found", "flow_state_expired", "bad_code_verifier", "validation_failed"].includes(String(code))) return "pkce";
  if (["over_request_rate_limit", "over_email_send_rate_limit", "request_timeout"].includes(String(code))) return "unavailable";
  return "invalid";
}
export function authDiagnostic(stage: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const known = ["otp_expired", "pkce_code_verifier_not_found", "flow_state_not_found", "flow_state_expired", "bad_code_verifier", "validation_failed", "session_not_found", "refresh_token_not_found", "over_request_rate_limit", "over_email_send_rate_limit", "weak_password", "same_password"];
  const data = error && typeof error === "object" ? error as Record<string, unknown> : {};
  // Never emit raw messages/objects/stacks: provider errors may contain credentials.
  console.warn("[auth]", { stage, reason: error instanceof AuthFlowError ? error.reason : providerReason(error),
    code: known.includes(String(data.code)) ? data.code : "unclassified_auth_error",
    status: Number.isInteger(data.status) && Number(data.status) >= 100 && Number(data.status) <= 599 ? data.status : undefined });
}
export function ticketFromUrl(url: URL, now = Date.now()): LinkTicket {
  for (const name of ["code", "token_hash", "type", "next", "sb_flow_id"]) if (url.searchParams.getAll(name).length > 1) fail("invalid");
  if (url.searchParams.has("error")) fail(providerReason({ code: url.searchParams.get("error_code") }));
  const code = url.searchParams.get("code"), token = url.searchParams.get("token_hash"), type = url.searchParams.get("type");
  const flowId = url.searchParams.get("sb_flow_id");
  if (flowId !== null && !/^[\w-]{8,64}$/.test(flowId)) fail("invalid");
  if (code && !token && /^[\w.-]{8,1024}$/.test(code)) return { method: "pkce", credential: code,
    type: type === "recovery" || url.searchParams.get("next") === "/auth/reset" ? "recovery" : "email", nonce: randomUUID(), expires: now + LINK_TTL * 1000, ...(flowId ? { flowId } : {}) };
  if (!code && token && /^[\w-]{16,512}$/.test(token) && ["email", "signup", "magiclink", "recovery"].includes(type || ""))
    return { method: "hash", credential: token, type: type === "recovery" ? "recovery" : "email", nonce: randomUUID(), expires: now + LINK_TTL * 1000 };
  return fail("invalid");
}
export const encodeTicket = (ticket: LinkTicket) => Buffer.from(JSON.stringify(ticket)).toString("base64url");
export function readTicket(value: string | undefined, now = Date.now()): LinkTicket | null {
  try {
    if (!value || value.length > 3000) return null;
    const t = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!["hash", "pkce"].includes(t.method) || !["email", "recovery"].includes(t.type) ||
      typeof t.credential !== "string" || !/^[\w.-]{8,1024}$/.test(t.credential) || typeof t.nonce !== "string" || !/^[\w-]{36}$/.test(t.nonce) ||
      (t.flowId !== undefined && (typeof t.flowId !== "string" || !/^[\w-]{8,64}$/.test(t.flowId))) ||
      !Number.isFinite(t.expires) || t.expires <= now || t.expires > now + LINK_TTL * 1000) return null;
    return t;
  } catch { return null; }
}
function secretKey(secret: string | undefined): string {
  if (!secret || secret.trim().length < 32) return fail("configuration");
  return secret;
}
export function signRecovery(userId: string, sessionId: string, secret: string | undefined, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ userId, sessionId, expires: now + RECOVERY_TTL * 1000 })).toString("base64url");
  return payload + "." + createHmac("sha256", secretKey(secret)).update(payload).digest("base64url");
}
export function validRecovery(value: string | undefined, userId: string, sessionId: string, secret: string | undefined, now = Date.now()): boolean {
  try {
    if (!value || value.length > 1500) return false;
    const [payload, signature, extra] = value.split("."); if (!payload || !signature || extra) return false;
    const expected = createHmac("sha256", secretKey(secret)).update(payload).digest(), supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.userId === userId && data.sessionId === sessionId && Number.isFinite(data.expires) && data.expires > now && data.expires <= now + RECOVERY_TTL * 1000;
  } catch { return false; }
}
export async function verifiedIdentity(auth: Pick<Auth, "getUser" | "getClaims">) {
  const { data: { user }, error } = await auth.getUser();
  if (error || !user) return fail("session");
  const claims = await auth.getClaims();
  if (claims.error || !claims.data || claims.data.claims.sub !== user.id || typeof claims.data.claims.session_id !== "string") return fail("session");
  return { userId: user.id, sessionId: claims.data.claims.session_id, claims: claims.data.claims };
}
export async function verifyEmailLink(auth: Pick<Auth, "verifyOtp" | "exchangeCodeForSession" | "getUser" | "getClaims">, ticket: LinkTicket, secret?: string) {
  if (ticket.type === "recovery") secretKey(secret);
  const result = ticket.method === "hash" ? await auth.verifyOtp({ token_hash: ticket.credential, type: ticket.type }) : await auth.exchangeCodeForSession(ticket.credential, ticket.flowId ? { flowId: ticket.flowId } : undefined);
  if (result.error) { authDiagnostic("verify_email_link", result.error); return fail(providerReason(result.error, ticket.method === "pkce")); }
  if (!result.data.session?.access_token || !result.data.user?.id) return fail("session");
  const identity = await verifiedIdentity(auth);
  if (identity.userId !== result.data.user.id) return fail("session");
  // Hash verification can issue generic 'otp' AMR; its verified input type proves
  // recovery. PKCE instead needs the Auth server's signed recovery claim.
  const amr = identity.claims.amr;
  const recovery = ticket.method === "hash" ? ticket.type === "recovery" : Array.isArray(amr) && amr.some(item => typeof item === "string" ? item === "recovery" : item.method === "recovery");
  if (ticket.type === "recovery" && !recovery) return fail("recovery");
  return { destination: recovery ? "/auth/reset" : "/", recovery: recovery ? signRecovery(identity.userId, identity.sessionId, secret) : null };
}
export async function requireRecovery(auth: Pick<Auth, "getUser" | "getClaims">, grant: string | undefined, secret?: string) {
  const identity = await verifiedIdentity(auth);
  if (!validRecovery(grant, identity.userId, identity.sessionId, secret)) return fail("recovery");
  return identity;
}
export async function updateRecoveryPassword(auth: Pick<Auth, "getUser" | "getClaims" | "updateUser" | "signOut">, grant: string | undefined, secret: string | undefined, body: unknown) {
  const identity = await requireRecovery(auth, grant, secret);
  const fields = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof fields.password !== "string" || fields.password.length < 12 || fields.password.length > 256 || fields.password !== fields.confirm)
    throw new Error("Enter matching passwords with at least 12 characters (up to 256).");
  const result = await auth.updateUser({ password: fields.password });
  if (result.error || result.data.user?.id !== identity.userId) { authDiagnostic("update_password", result.error); throw new Error("Could not update your password. Try again or request a fresh recovery link."); }
  // auth-js removes local storage even when the logout HTTP request fails.
  try { const signedOut = await auth.signOut({ scope: "local" }); if (signedOut.error) authDiagnostic("sign_out_after_reset", signedOut.error); }
  catch (error) { authDiagnostic("sign_out_after_reset", error); }
}
