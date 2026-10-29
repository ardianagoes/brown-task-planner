import { NextRequest, NextResponse } from "next/server";
import { appOrigin, assertSameOrigin, HttpError, readJson } from "@/lib/http";
import { authHeaders, authRouteClient } from "@/lib/supabase/route";
import { AuthFlowError, RECOVERY_COOKIE, authDiagnostic, updateRecoveryPassword } from "@/lib/auth-flow";
export async function POST(request: NextRequest) {
  let origin: string;
  try { origin = appOrigin(request); assertSameOrigin(request); } catch { return authHeaders(NextResponse.json({ error: "Request origin rejected." }, { status: 403 })); }
  let route: ReturnType<typeof authRouteClient>;
  try { route = authRouteClient(request, origin.startsWith("https:")); }
  catch (error) { authDiagnostic("password_reset_configuration", error); return authHeaders(NextResponse.json({ error: "Password recovery is unavailable. Contact the app owner." }, { status: 503 })); }
  try {
    const body = await readJson(request, 4096);
    await updateRecoveryPassword(route.client.auth, request.cookies.get(RECOVERY_COOKIE)?.value, process.env.AUTH_RECOVERY_SECRET, body);
    const response = NextResponse.json({ updated: true });
    response.cookies.set(RECOVERY_COOKIE, "", { path: "/", secure: origin.startsWith("https:"), httpOnly: true, sameSite: "lax", maxAge: 0 });
    return route.apply(response);
  } catch (error) {
    authDiagnostic("password_reset", error);
    const recovery = error instanceof AuthFlowError;
    return route.apply(NextResponse.json({ error: recovery ? "Your recovery session is missing or expired. Request a fresh password-reset link." : error instanceof HttpError ? error.message : "Could not update your password. Check that both passwords match and use at least 12 characters, then try again.",
      recoveryRequired: recovery }, { status: recovery ? 401 : error instanceof HttpError ? error.status : 400 }));
  }
}
