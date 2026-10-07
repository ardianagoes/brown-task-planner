import { redirect } from "next/navigation";
import { configured } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import AuthPanel from "@/components/auth-panel";

export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!configured()) return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">Connect Deadline desk</h1><p className="mt-4">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your environment, apply the database migration, and restart the app.</p></main>;
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  const params = await searchParams;
  return <AuthPanel linkError={params.error ? "This email link is invalid or has expired. Request a new one or sign in." : ""} />;
}
