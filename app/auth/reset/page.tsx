import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import ResetPassword from "@/components/reset-password";
import { cookies } from "next/headers";
import { RECOVERY_COOKIE, requireRecovery } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";
export default async function ResetPage() {
  const supabase = await serverClient();
  let allowed = false;
  try { await requireRecovery(supabase.auth, (await cookies()).get(RECOVERY_COOKIE)?.value, process.env.AUTH_RECOVERY_SECRET); allowed = true; } catch { /* No secret-bearing diagnostics on render. */ }
  if (!allowed) redirect("/login?error=recovery&mode=forgot");
  return <ResetPassword />;
}
