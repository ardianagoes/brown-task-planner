import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import ResetPassword from "@/components/reset-password";

export const dynamic = "force-dynamic";
export default async function ResetPage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link");
  return <ResetPassword />;
}
