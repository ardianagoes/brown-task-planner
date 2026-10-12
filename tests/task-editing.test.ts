import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TaskRow } from "../lib/supabase/database.types";
import { draftFromTask, taskFromEditDraft, taskChanges, validateTaskUpdate } from "../lib/task-editing";
import { updateOwnedTask, toTaskRow } from "../lib/task-store";
import type { Task } from "../lib/tasks";
const original: Task = { id: "canvas-same-id", name: "Problem Set", dueAt: "2026-11-01T06:30:37.123Z", allDay: false,
  category: "Homework", status: "Submitted/Done", urls: ["https://example.edu/task"], source: "Canvas" };

test("editing prepopulates local timed/all-day fields and preserves exact deadlines on detail-only edits", () => {
  const initial = draftFromTask(original, "America/New_York");
  assert.equal(initial.dueDate, "2026-11-01"); assert.equal(initial.dueTime, "01:30"); assert.equal(initial.urls, original.urls[0]);
  const edited = taskFromEditDraft({ ...initial, name: "Corrected title" }, "In Progress", original, initial);
  assert.equal(edited.dueAt, original.dueAt); assert.equal(edited.id, original.id); assert.equal(edited.source, "Canvas"); assert.equal(edited.status, "In Progress");
  const allDay = { ...original, dueAt: "2026-10-20", allDay: true };
  assert.equal(draftFromTask(allDay, "Pacific/Honolulu").dueDate, "2026-10-20");
});
test("edited deadlines switch between timed and all-day; DST gaps/ambiguous times require correction", () => {
  const initial = draftFromTask(original, "America/New_York");
  const allDay = taskFromEditDraft({ ...initial, allDay: true, dueDate: "2026-10-20" }, "To Do", original, initial);
  assert.equal(allDay.dueAt, "2026-10-20"); assert.equal(allDay.allDay, true);
  const timed = taskFromEditDraft({ ...initial, dueDate: "2026-10-20", dueTime: "23:59" }, "To Do", original, initial);
  assert.equal(timed.dueAt, "2026-10-21T03:59:00Z");
  assert.throws(() => taskFromEditDraft({ ...initial, dueDate: "2027-03-14", dueTime: "02:30" }, "To Do", original, initial), /timezone/);
  assert.throws(() => taskFromEditDraft({ ...initial, dueTime: "01:31" }, "To Do", original, initial), /timezone/);
});
test("task PATCH accepts only editable fields or the original status-only operation", () => {
  assert.deepEqual(validateTaskUpdate({ status: "In Progress" }), { status: "In Progress" });
  assert.deepEqual(validateTaskUpdate(taskChanges(original)), taskChanges(original));
  for (const bad of [{ ...taskChanges(original), id: "other" }, { ...taskChanges(original), source: "Manual" },
    { ...taskChanges(original), user_id: "other" }, { ...taskChanges(original), created_at: "2020" },
    { ...taskChanges(original), name: " " }, { ...taskChanges(original), urls: ["javascript:alert(1)"] },
    { ...taskChanges(original), dueAt: "2026-02-30T00:00:00Z" }, { status: "Deleted" }, { name: "only" }]) assert.throws(() => validateTaskUpdate(bad));
});
test("owned task update scopes both identity and owner, nulls the opposite deadline column, and never upserts", async () => {
  let update: Record<string, unknown> = {}, filters: unknown[] = [], calls = 0;
  let row: TaskRow | null = { ...toTaskRow(original, "alice"), created_at: "2026-10-01" };
  const query = { update: (value: Record<string, unknown>) => { update = value; calls++; return query; },
    eq: (...args: unknown[]) => { filters.push(args); return query; }, select: () => query, maybeSingle: async () => ({ data: row, error: null }) };
  const db = { from: () => query } as unknown as SupabaseClient<Database>;
  await updateOwnedTask(db, "alice", original.id, { ...taskChanges(original), dueAt: "2026-10-20", allDay: true });
  assert.deepEqual(filters, [["user_id", "alice"], ["id", original.id]]); assert.equal(update.due_at, null); assert.equal(update.due_date, "2026-10-20");
  assert.equal("source" in update, false); assert.equal("id" in update, false); assert.equal("user_id" in update, false);
  filters = []; row = null;
  await assert.rejects(updateOwnedTask(db, "bob", original.id, { status: "To Do" }), /not found/);
  assert.deepEqual(update, { status: "To Do" }); assert.equal(calls, 2);
  await assert.rejects(updateOwnedTask(db, "alice", original.id, { ...taskChanges(original), id: "hijack" })); assert.equal(calls, 2);
});
