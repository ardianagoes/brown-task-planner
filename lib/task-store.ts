import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TaskRow } from "./supabase/database.types";
import { isTask, type Task } from "./tasks";
import { HttpError } from "./http";
import { validateTaskUpdate } from "./task-editing";

export async function updateOwnedTask(supabase: SupabaseClient<Database>, userId: string, id: string, body: unknown): Promise<Task> {
  if (!id || id.length > 128) throw new HttpError(400, "Invalid task ID.");
  const changes = validateTaskUpdate(body);
  const update = "dueAt" in changes ? { name: changes.name.trim(), category: changes.category, status: changes.status, urls: changes.urls,
    due_at: changes.allDay ? null : new Date(changes.dueAt).toISOString(), due_date: changes.allDay ? changes.dueAt : null } : changes;
  const { data, error } = await supabase.from("tasks").update(update).eq("user_id", userId).eq("id", id).select().maybeSingle();
  databaseError(error);
  if (!data) throw new HttpError(404, "Task not found.");
  return fromTaskRow(data);
}

export function toTaskRow(task: Task, userId: string): Omit<TaskRow, "created_at"> {
  return { user_id: userId, id: task.id, name: task.name.trim(),
    due_at: task.allDay ? null : new Date(task.dueAt).toISOString(),
    due_date: task.allDay ? task.dueAt : null,
    category: task.category, status: task.status, urls: task.urls, source: task.source };
}
export function fromTaskRow(row: TaskRow): Task {
  const task = { id: row.id, name: row.name, dueAt: row.due_date || row.due_at,
    allDay: row.due_date !== null, category: row.category, status: row.status, urls: row.urls, source: row.source };
  if (!isTask(task)) throw new HttpError(500, "A saved task has invalid data.");
  return task;
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code || "")) throw new HttpError(503, "Apply the Supabase production migration before using task storage.");
  throw new HttpError(500, "Task storage is unavailable. Your browser backup is unchanged.");
}
export async function listTasks(supabase: SupabaseClient<Database>, userId: string): Promise<Task[]> {
  const tasks: Task[] = [];
  // Paginate beyond PostgREST's default 1,000-row cap so history is never truncated.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("tasks").select("*").eq("user_id", userId)
      .order("id").range(offset, offset + 499);
    databaseError(error);
    const rows = data || [];
    tasks.push(...rows.map(fromTaskRow));
    if (rows.length < 500) break;
  }
  return tasks;
}

export async function listTaskIds(supabase: SupabaseClient<Database>, userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("tasks").select("id").eq("user_id", userId)
      .order("id").range(offset, offset + 499);
    databaseError(error);
    const rows = data || [];
    rows.forEach(row => ids.add(row.id));
    if (rows.length < 500) return ids;
  }
}
