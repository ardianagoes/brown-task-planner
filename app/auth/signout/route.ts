import { apiError, reply, requireUser } from "@/lib/api";
import { assertSameOrigin, HttpError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireUser();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new HttpError(500, "Could not sign out. Please try again.");
    return reply({ signedOut: true });
  } catch (error) { return apiError(error); }
}
