import { requireUser, reply, apiError } from "@/lib/api";
import { assertSameOrigin, HttpError, readJson } from "@/lib/http";
import { isTask } from "@/lib/tasks";
import { databaseError, toTaskRow } from "@/lib/task-store";
import type { Json } from "@/lib/supabase/database.types";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const body = await readJson(request, 2 * 1024 * 1024);
    if (!body || typeof body !== "object" || !("key" in body) || !("tasks" in body) ||
      typeof body.key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.key) ||
      !Array.isArray(body.tasks) || body.tasks.length > 2000 || !body.tasks.every(isTask) ||
      new Set(body.tasks.map(task => task.id)).size !== body.tasks.length) throw new HttpError(400, "Invalid browser migration data.");
    const { data, error } = await supabase.rpc("migrate_browser_tasks", {
      p_key: body.key, p_tasks: body.tasks.map(task => toTaskRow(task, user.id)) as Json,
    });
    databaseError(error);
    return reply({ migration: data });
  } catch (error) { return apiError(error); }
}
