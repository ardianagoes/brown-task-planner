import { test } from "node:test";
import assert from "node:assert/strict";
import { groupAgenda, groupCalendarDays } from "../components/agenda-groups";
import type { Task } from "../lib/tasks";
const now = new Date(2026, 10, 9, 12).getTime();
const task = (id: string, dueAt: string, allDay = true): Task => ({ id, name: id, dueAt, allDay, status: "To Do", category: "Homework", urls: [], source: "Manual" });
test("agenda groups literal all-day and local timed dates without losing past or distant tasks", () => {
  const tasks = [task("past", "2026-11-08"), task("today", "2026-11-09"), task("early-today", new Date(2026, 10, 9, 8).toISOString(), false), task("tomorrow", "2026-11-10"), task("week", "2026-11-13"), task("later", "2026-11-30")];
  const groups = groupAgenda(tasks, now);
  assert.deepEqual(groups.map(group => group.label), ["Overdue", "Today", "Tomorrow", "Later This Week", "Later"]);
  assert.deepEqual(groups.find(group => group.label === "Today")!.tasks.map(task => task.id), ["early-today", "today"]);
  assert.equal(groups.flatMap(group => group.tasks).length, tasks.length);
  assert.deepEqual(groupAgenda(tasks, now, false).flatMap(group => group.tasks).map(task => task.id), [...groups.flatMap(group => group.tasks)].reverse().map(task => task.id));
  assert.equal(tasks[0].id, "past");
});
test("tomorrow remains its own calendar day across DST and week/year boundaries", () => {
  for (const [date, tomorrow] of [[new Date(2026, 2, 7, 23), "2026-03-08"], [new Date(2026, 9, 31, 23), "2026-11-01"], [new Date(2026, 11, 31, 23), "2027-01-01"]] as const) {
    assert.equal(groupAgenda([task("tomorrow", tomorrow)], date.getTime())[0].label, "Tomorrow");
  }
});
test("completed history is never labeled overdue and calendar grouping retains all statuses", () => {
  const done = { ...task("done", "2026-11-08"), status: "Submitted/Done" as const };
  assert.equal(groupAgenda([done], now, true, true)[0].label, "Earlier");
  const grouped = groupCalendarDays([task("future", "2026-12-01"), done, task("active", "2026-11-08")]);
  assert.deepEqual(grouped.map(group => group.day), ["2026-11-08", "2026-12-01"]);
  assert.equal(grouped[0].tasks.length, 2); assert.ok(grouped[0].tasks.includes(done));
});
