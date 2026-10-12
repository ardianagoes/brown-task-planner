import { Temporal } from "@js-temporal/polyfill";
import { taskFromDraft, type AssignmentDraft } from "./assignment-draft";
import { isTask, STATUSES, type Status, type Task } from "./tasks";
import { HttpError } from "./http";

export type TaskChanges = Pick<Task, "name" | "dueAt" | "allDay" | "category" | "status" | "urls">;
export function taskChanges(task: Task): TaskChanges {
  return { name: task.name, dueAt: task.dueAt, allDay: task.allDay, category: task.category, status: task.status, urls: task.urls };
}
export function validateTaskUpdate(value: unknown): { status: Status } | TaskChanges {
  const invalid = () => new HttpError(400, "Provide valid editable task fields.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const fields = value as Record<string, unknown>, keys = Object.keys(fields);
  if (keys.length === 1 && keys[0] === "status" && STATUSES.includes(fields.status as Status)) return { status: fields.status as Status };
  const editable = ["name", "dueAt", "allDay", "category", "status", "urls"];
  if (keys.length !== editable.length || editable.some(key => !keys.includes(key)) || !isTask({ ...fields, id: "validated", source: "Manual" })) throw invalid();
  try { if (!fields.allDay) Temporal.Instant.from(String(fields.dueAt)); } catch { throw invalid(); }
  return taskChanges(fields as Task);
}
export function draftFromTask(task: Task, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): AssignmentDraft {
  const date = task.allDay ? null : Temporal.Instant.from(task.dueAt).toZonedDateTimeISO(timezone);
  return { name: task.name, dueDate: date ? date.toPlainDate().toString() : task.dueAt,
    dueTime: date ? `${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}` : "",
    timezone, category: task.category, urls: task.urls.join("\n"), allDay: task.allDay };
}
export function taskFromEditDraft(draft: AssignmentDraft, status: Status, original: Task, initial: AssignmentDraft): Task {
  // Preserve exact seconds/offsets for detail-only edits, including repeated DST times.
  const sameDeadline = (["allDay", "dueDate", "dueTime", "timezone"] as const).every(key => draft[key] === initial[key]);
  const valid = taskFromDraft(sameDeadline && !draft.allDay ? { ...draft, timezone: Temporal.Instant.from(original.dueAt).toZonedDateTimeISO(initial.timezone).offset } : draft, original.id);
  const task = { ...valid, dueAt: sameDeadline ? original.dueAt : valid.dueAt, source: original.source, status };
  if (!isTask(task)) throw new Error("Check the edited task details.");
  return task;
}
