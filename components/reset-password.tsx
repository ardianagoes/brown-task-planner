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
    <form onSubmit={submit} className="mt-6 space-y-4 panel p-6">
      <label className="block">New password<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="control mt-1" /></label>
      <label className="block">Confirm password<input name="confirm" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="control mt-1" /></label>
      <button disabled={busy} className="button-primary w-full">{busy ? "Updating…" : "Update password"}</button><p role="alert">{error}</p>
    </form></main>;
}
