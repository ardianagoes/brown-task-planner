import { requireUser, reply, apiError } from "@/lib/api";
import { assertSameOrigin, HttpError, readJson } from "@/lib/http";
import { isTask } from "@/lib/tasks";
import { databaseError, fromTaskRow, listTasks, toTaskRow } from "@/lib/task-store";

export const runtime = "nodejs";
export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return reply({ tasks: await listTasks(supabase, user.id) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const task = await readJson(request, 100000);
    if (!isTask(task) || task.source !== "Manual") throw new HttpError(400, "Provide a valid manual task.");
    const { data, error } = await supabase.from("tasks").upsert(toTaskRow(task, user.id), {
      onConflict: "user_id,id", ignoreDuplicates: true,
    }).select();
    databaseError(error);
    if (data?.[0]) return reply({ task: fromTaskRow(data[0]) }, 201);
    const saved = await supabase.from("tasks").select("*").eq("user_id", user.id).eq("id", task.id).single();
    databaseError(saved.error);
    if (!saved.data) throw new HttpError(500, "Could not confirm the task save.");
    return reply({ task: fromTaskRow(saved.data) });
  } catch (error) { return apiError(error); }
}
