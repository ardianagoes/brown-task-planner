"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { clientAuthDiagnostic, requestEmail } from "@/lib/auth-requests";
import type { AuthMode } from "@/lib/auth-messages";

export default function AuthPanel({ linkError, initialMode = "login", initialNotice = "", authClient = browserClient }: {
  linkError: string; initialMode?: AuthMode; initialNotice?: string; authClient?: typeof browserClient;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(linkError || initialNotice);
  const active = useRef(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (active.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    active.current = true; setBusy(true); setMessage("");
    try {
      const supabase = authClient();
      const base = new URL(process.env.NEXT_PUBLIC_APP_URL || window.location.origin).origin;
      if (mode === "forgot" || mode === "magic") {
        await requestEmail(supabase.auth, mode, email, base);
        setMessage(mode === "forgot" ? "If this account exists, check your email for a password reset link. Open the newest email and select Continue." : "If this account exists, check your email for a sign-in link. Open the newest email and select Continue.");
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
    } catch (error) {
      clientAuthDiagnostic(mode, error);
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      setMessage(mode === "magic" && (code === "user_not_found" || code === "signup_disabled") ? "If this account exists, check your email for a sign-in link." : mode === "login" ? "Could not sign in. Check your credentials and email confirmation." : "Could not send the email. Wait a minute and try again, or contact the app owner if delivery continues to fail.");
    } finally { active.current = false; setBusy(false); }
  }
  return <main className="mx-auto max-w-md px-4 py-16">
    <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-300">Deadline desk</p>
    <section className="panel p-6">
      <h1 className="text-2xl font-bold">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "magic" ? "Email sign-in" : "Sign in"}</h1>
      <p className="mt-3 text-slate-400">Your deadlines are private and saved to your account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">Email<input name="email" type="email" autoComplete="email" required maxLength={254} className="control mt-1" /></label>
        {(mode === "login" || mode === "signup") && <label className="block">Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : undefined} maxLength={256} className="control mt-1" />{mode === "signup" && <span className="mt-1 block text-sm text-slate-400">Use at least 12 characters.</span>}</label>}
        <button disabled={busy} className="button-primary w-full">{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "magic" ? "Send sign-in link" : "Sign in"}</button>
        <p role="status" className="text-sm text-slate-300">{message}</p>
      </form>
      <div className="mt-5 flex flex-wrap gap-4 text-sm text-blue-300">
        <button type="button" disabled={busy} className="underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Create an account" : "Back to sign in"}</button>
        {mode === "login" && <button type="button" disabled={busy} className="underline" onClick={() => { setMode("forgot"); setMessage(""); }}>Forgot password?</button>}
        {mode !== "magic" && <button type="button" disabled={busy} className="underline" onClick={() => { setMode("magic"); setMessage(""); }}>Email me a sign-in link</button>}
        {mode !== "forgot" && mode !== "login" && <button type="button" disabled={busy} className="underline" onClick={() => { setMode("forgot"); setMessage(""); }}>Request a password-reset link</button>}
      </div>
    </section>
  </main>;
}
