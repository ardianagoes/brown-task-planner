import { NextRequest, NextResponse } from "next/server";
import { appOrigin, assertSameOrigin, readForm } from "./http";
import { authHeaders, authRouteClient } from "./supabase/route";
import { LINK_COOKIE, RECOVERY_COOKIE, LINK_TTL, RECOVERY_TTL, AuthFlowError, authDiagnostic, encodeTicket, readTicket, ticketFromUrl, verifyEmailLink } from "./auth-flow";
export function linkFailure(origin: string, reason = "invalid", recovery = false) {
  return authHeaders(NextResponse.redirect(new URL(`/login?error=${reason}&mode=${recovery ? "forgot" : "magic"}`, origin), 303));
}
export async function stageAuth(request: NextRequest) {
  let origin: string;
  try { origin = appOrigin(request); } catch { return authHeaders(NextResponse.json({ error: "Configure the production app URL before using email links." }, { status: 503 })); }
  try {
    const ticket = ticketFromUrl(new URL(request.url));
    const response = authHeaders(NextResponse.redirect(new URL("/auth/confirm/continue", origin), 303));
    response.cookies.set(LINK_COOKIE, encodeTicket(ticket), { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/auth/confirm", maxAge: LINK_TTL });
    return response;
  } catch (error) { authDiagnostic("stage_email_link", error); return linkFailure(origin, error instanceof AuthFlowError ? error.reason : "invalid", new URL(request.url).searchParams.get("type") === "recovery"); }
}
export async function confirmAuth(request: NextRequest, dependencies: { secret?: string; route?: typeof authRouteClient } = {}) {
  let origin: string;
  try { origin = appOrigin(request); assertSameOrigin(request); } catch { return authHeaders(NextResponse.json({ error: "Request origin rejected." }, { status: 403 })); }
  const ticket = readTicket(request.cookies.get(LINK_COOKIE)?.value);
  if (!ticket) return linkFailure(origin, "expired");
  let form: URLSearchParams;
  try { form = await readForm(request, 1024); } catch { return linkFailure(origin, "invalid", ticket.type === "recovery"); }
  if (form.getAll("nonce").length !== 1 || form.get("nonce") !== ticket.nonce) return linkFailure(origin, "invalid", ticket.type === "recovery");
  let route: ReturnType<typeof authRouteClient>;
  try { route = (dependencies.route || authRouteClient)(request, origin.startsWith("https:")); }
  catch (error) { authDiagnostic("email_link_configuration", error); return linkFailure(origin, "configuration", ticket.type === "recovery"); }
  let response: NextResponse;
  try {
    const result = await verifyEmailLink(route.client.auth, ticket, dependencies.secret);
    response = NextResponse.redirect(new URL(result.destination, origin), 303);
    response.cookies.set(RECOVERY_COOKIE, result.recovery || "", { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: result.recovery ? RECOVERY_TTL : 0 });
  } catch (error) { authDiagnostic("confirm_email_link", error); response = linkFailure(origin, error instanceof AuthFlowError ? error.reason : "unavailable", ticket.type === "recovery"); }
  response.cookies.set(LINK_COOKIE, "", { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/auth/confirm", maxAge: 0 });
  return route.apply(response);
}
