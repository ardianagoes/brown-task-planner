import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { supabaseConfig } from "./config";
import type { Database } from "./database.types";
export function authHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache"); response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer"); response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export function authRouteClient(request: NextRequest, secure: boolean, config = supabaseConfig(), fetchImpl?: typeof fetch) {
  const changes = NextResponse.next();
  const client = createServerClient<Database>(config.url, config.key, {
    cookieOptions: { secure, sameSite: "lax", path: "/" },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value, options }) => { request.cookies.set(name, value); changes.cookies.set(name, value, options); });
        Object.entries(headers).forEach(([key, value]) => changes.headers.set(key, value));
      },
    },
  });
  return { client, apply(response: NextResponse) {
    changes.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    for (const name of ["cache-control", "expires", "pragma"]) { const value = changes.headers.get(name); if (value) response.headers.set(name, value); }
    return authHeaders(response);
  } };
}
