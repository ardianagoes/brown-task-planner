import Dashboard from "@/components/dashboard";
import { redirect } from "next/navigation";
import { configured } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) redirect("/login");
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <Dashboard key={user.id} user={{ id: user.id, email: user.email || "Your account" }} />;
}
