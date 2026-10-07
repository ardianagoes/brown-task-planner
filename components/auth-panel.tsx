"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

export default function AuthPanel({ linkError }: { linkError: string }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(linkError);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    setBusy(true); setMessage("");
    try {
      const supabase = browserClient();
      const base = new URL(process.env.NEXT_PUBLIC_APP_URL || window.location.origin).origin;
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/callback?next=/auth/reset` });
        if (error) throw error;
        setMessage("If this account exists, check your email for a password reset link.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${base}/auth/callback` } });
        if (error) throw error;
        form.reset();
        if (data.session) { router.replace("/"); router.refresh(); }
        else setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        form.reset(); router.replace("/"); router.refresh();
      }
    } catch {
      setMessage(mode === "login" ? "Could not sign in. Check your credentials and email confirmation." : "Could not complete this request. Check your details and try again shortly.");
    } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md px-4 py-16">
    <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-700">Deadline desk</p>
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-bold">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in"}</h1>
      <p className="mt-3 text-slate-600">Your deadlines are private and saved to your account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">Email<input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
        {mode !== "forgot" && <label className="block">Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : undefined} maxLength={256} className="mt-1 w-full rounded-lg border border-slate-300 p-3" />{mode === "signup" && <span className="mt-1 block text-sm text-slate-500">Use at least 12 characters.</span>}</label>}
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 p-3 font-medium text-white">{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
        <p role="status" className="text-sm text-slate-700">{message}</p>
      </form>
      <div className="mt-5 flex flex-wrap gap-4 text-sm text-blue-700">
        <button type="button" disabled={busy} className="underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Create an account" : "Back to sign in"}</button>
        {mode === "login" && <button type="button" disabled={busy} className="underline" onClick={() => { setMode("forgot"); setMessage(""); }}>Forgot password?</button>}
      </div>
    </section>
  </main>;
}
