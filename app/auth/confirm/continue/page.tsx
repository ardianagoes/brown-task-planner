import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LINK_COOKIE, readTicket } from "@/lib/auth-flow";
export const dynamic = "force-dynamic";
export default async function ContinueEmail() {
  const ticket = readTicket((await cookies()).get(LINK_COOKIE)?.value);
  if (!ticket) redirect("/login?error=expired&mode=magic");
  const recovery = ticket.type === "recovery";
  return <main className="mx-auto max-w-md px-4 py-16"><section className="panel p-6">
    <h1 className="text-2xl font-bold">{recovery ? "Continue password reset" : "Confirm email sign-in"}</h1>
    <p className="my-4 text-slate-300">{recovery ? "Continue to verify this email link and choose a new password." : "Continue to verify this email link and sign in to DueDrop."}</p>
    <p className="mb-5 text-sm text-slate-400">Only continue if you requested this email. This step helps prevent email scanners from using your single-use link.</p>
    <form method="post" action="/auth/confirm"><input type="hidden" name="nonce" value={ticket.nonce} />
      <button className="button-primary w-full">{recovery ? "Continue to reset password" : "Continue to sign in"}</button></form>
    <a href="/login" className="link mt-4 inline-block text-sm">Back to sign in</a>
  </section></main>;
}
