import { redirect } from "next/navigation";
import { configured } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import AuthPanel from "@/components/auth-panel";
import { LINK_MESSAGES, linkReason } from "@/lib/auth-messages";

export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string; notice?: string }> }) {
  if (!configured()) return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">Connect Deadline desk</h1><p className="mt-4">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your environment, apply the database migration, and restart the app.</p></main>;
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const params = await searchParams;
  if (user && !params.error && !params.mode && params.notice !== "password_updated") redirect("/");
  return <AuthPanel linkError={params.error ? LINK_MESSAGES[linkReason(params.error)] : ""}
    initialMode={params.mode === "forgot" ? "forgot" : params.mode === "magic" ? "magic" : "login"}
    initialNotice={params.notice === "password_updated" ? "Your password was updated. Sign in with your new password." : ""} />;
}
