import "server-only";
import { NextResponse } from "next/server";
import { serverClient } from "./supabase/server";
import { appOrigin, safeNext } from "./http";

export async function finishAuth(request: Request) {
  const url = new URL(request.url);
  let origin: string;
  try { origin = appOrigin(request); }
  catch { return NextResponse.json({ error: "Configure the app URL before using email links." }, { status: 503 }); }
  const failure = () => NextResponse.redirect(new URL("/login?error=link", origin));
  try {
    const supabase = await serverClient();
    const code = url.searchParams.get("code");
    const token = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    let error;
    if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
    else if (token && (type === "email" || type === "signup" || type === "recovery")) {
      ({ error } = await supabase.auth.verifyOtp({ token_hash: token, type }));
    } else return failure();
    if (error) return failure();
    const response = NextResponse.redirect(new URL(type === "recovery" ? "/auth/reset" : safeNext(url.searchParams.get("next")), origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch { return failure(); }
}
