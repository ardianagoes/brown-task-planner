import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthMode } from "./auth-messages";
type Auth = SupabaseClient["auth"];
export function clientAuthDiagnostic(stage: AuthMode, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const data = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const codes = ["invalid_credentials", "email_not_confirmed", "email_address_not_authorized", "over_email_send_rate_limit", "over_request_rate_limit", "weak_password", "signup_disabled", "user_not_found", "email_address_invalid"];
  console.warn("[auth]", { stage, code: codes.includes(String(data.code)) ? data.code : "unclassified_auth_error",
    status: Number.isInteger(data.status) && Number(data.status) >= 100 && Number(data.status) <= 599 ? data.status : undefined });
}
export async function requestEmail(auth: Pick<Auth, "resetPasswordForEmail" | "signInWithOtp">, mode: "forgot" | "magic", email: string, origin: string) {
  const base = new URL(origin);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("Configure the HTTPS app URL.");
  const result = mode === "forgot"
    ? await auth.resetPasswordForEmail(email, { redirectTo: `${base.origin}/auth/callback?next=/auth/reset` })
    : await auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${base.origin}/auth/callback` } });
  if (result.error) throw result.error;
}
export async function sendPasswordUpdate(password: string, confirm: string) {
  const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" },
    cache: "no-store", credentials: "same-origin", body: JSON.stringify({ password, confirm }) });
  const result = await response.json();
  if (!response.ok || result.updated !== true) throw new Error(typeof result.error === "string" ? result.error : "Could not confirm the password update. Try again.");
}
