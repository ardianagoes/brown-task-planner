"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

export default function ResetPassword() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (password !== data.get("confirm")) { setError("The passwords must match."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await browserClient().auth.updateUser({ password });
      if (error) throw error;
      router.replace("/"); router.refresh();
    } catch { setError("Could not update your password. Request a fresh recovery link and try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md p-6 py-16"><h1 className="text-2xl font-bold">Choose a new password</h1>
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <label className="block">New password<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="mt-1 w-full rounded-lg border p-3" /></label>
      <label className="block">Confirm password<input name="confirm" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="mt-1 w-full rounded-lg border p-3" /></label>
      <button disabled={busy} className="w-full rounded-lg bg-slate-900 p-3 text-white">{busy ? "Updating…" : "Update password"}</button><p role="alert">{error}</p>
    </form></main>;
}
