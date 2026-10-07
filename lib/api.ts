import "server-only";
import { NextResponse } from "next/server";
import { serverClient } from "./supabase/server";
import { configured } from "./supabase/config";
import { HttpError } from "./http";

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}
export async function requireUser() {
  if (!configured()) throw new HttpError(503, "Supabase is not configured.");
  const supabase = await serverClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, "Sign in to continue.");
  return { supabase, user };
}
export function apiError(error: unknown) {
  if (error instanceof HttpError) return reply({ error: error.message }, error.status);
  // Tokens, feed URLs, database details, and auth cookies must not appear in errors.
  return reply({ error: "The request could not be completed. Try again." }, 500);
}
