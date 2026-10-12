import { requireUser, reply, apiError } from "@/lib/api";
import { assertSameOrigin, HttpError, readJson } from "@/lib/http";
import { databaseError, updateOwnedTask } from "@/lib/task-store";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const { id } = await context.params;
    if (!id || id.length > 128) throw new HttpError(400, "Invalid task ID.");
    const { error } = await supabase.from("tasks").delete().eq("user_id", user.id).eq("id", id);
    databaseError(error);
    // Idempotent: retrying an already-deleted task succeeds without revealing
    // whether an ID exists in another account.
    return reply({ deletedId: id });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const { id } = await context.params;
    return reply({ task: await updateOwnedTask(supabase, user.id, id, await readJson(request, 100000)) });
  } catch (error) { return apiError(error); }
}
