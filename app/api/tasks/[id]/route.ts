import { requireUser, reply, apiError } from "@/lib/api";
import { assertSameOrigin, HttpError, readJson } from "@/lib/http";
import { STATUSES, type Status } from "@/lib/tasks";
import { databaseError, fromTaskRow } from "@/lib/task-store";

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
    const body = await readJson(request, 1024);
    if (!body || typeof body !== "object" || !("status" in body) || !STATUSES.includes(body.status as Status)) throw new HttpError(400, "Choose a valid status.");
    if (!id || id.length > 128) throw new HttpError(400, "Invalid task ID.");
    const { data, error } = await supabase.from("tasks").update({ status: body.status as Status })
      .eq("user_id", user.id).eq("id", id).select().maybeSingle();
    databaseError(error);
    if (!data) throw new HttpError(404, "Task not found.");
    return reply({ task: fromTaskRow(data) });
  } catch (error) { return apiError(error); }
}
