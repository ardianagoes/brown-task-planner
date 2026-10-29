"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseConfig } from "./config";

export function browserClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient<Database>(url, key, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" } });
}
