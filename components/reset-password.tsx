"use client";
import { useRef, useState, type FormEvent } from "react";
import { sendPasswordUpdate } from "@/lib/auth-requests";

export default function ResetPassword({ onUpdate = sendPasswordUpdate }: { onUpdate?: typeof sendPasswordUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false), active = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (active.current) return;
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (password !== data.get("confirm")) { setError("The passwords must match."); return; }
    active.current = true; setBusy(true); setError("");
    try {
      await onUpdate(password, String(data.get("confirm") || "")); form.reset(); setSuccess(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update your password. Request a fresh recovery link and try again."); }
    finally { active.current = false; setBusy(false); }
  }
  if (success) return <main className="mx-auto max-w-md p-6 py-16"><section className="panel p-6"><h1 className="text-2xl font-bold">Password updated</h1>
    <p role="status" className="my-4 text-slate-300">Your new password is saved. Continue to sign in with it.</p><a className="button-primary inline-block" href="/login?notice=password_updated">Continue to sign in</a></section></main>;
  return <main className="mx-auto max-w-md p-6 py-16"><h1 className="text-2xl font-bold">Choose a new password</h1>
    <form onSubmit={submit} className="mt-6 space-y-4 panel p-6">
      <label className="block">New password<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="control mt-1" /></label>
      <label className="block">Confirm password<input name="confirm" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="control mt-1" /></label>
      <button disabled={busy} className="button-primary w-full">{busy ? "Updating…" : "Update password"}</button><p role="alert">{error}</p>
    </form><a className="link mt-4 inline-block text-sm" href="/login?mode=forgot">Request a fresh password-reset link</a></main>;
}
