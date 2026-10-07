import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "../lib/ics";
import { canvasImportWindow } from "../lib/import-policy";
import type { Task } from "../lib/tasks";

const now = new Date("2026-10-06T20:00:00Z");
const feed = "https://school.instructure.com/private-calendar.ics";
function calendar(events: string) { return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`; }
function event(uid: string, start: string) {
  return `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:${uid}\n${start}\nEND:VEVENT`;
}
function task(id: string, dueAt: string, allDay = false): Task {
  return { id, name: id, dueAt, allDay, category: "Homework", status: "To Do", urls: [], source: "Canvas" };
}
async function inZone(zone: string | undefined, callback: () => Promise<void>) {
  const previous = process.env.APP_TIMEZONE;
  if (zone === undefined) delete process.env.APP_TIMEZONE; else process.env.APP_TIMEZONE = zone;
  try { await callback(); }
  finally { if (previous === undefined) delete process.env.APP_TIMEZONE; else process.env.APP_TIMEZONE = previous; }
}

test("Canvas skips yesterday but keeps earlier today, tomorrow and all-day today", async () => {
  await inZone("America/New_York", async () => {
    const parsed = await parseFeed(calendar([
      event("yesterday", "DTSTART:20261005T180000Z"),
      event("today-earlier", "DTSTART:20261006T050000Z"),
      event("tomorrow", "DTSTART:20261007T180000Z"),
      event("all-day-today", "DTSTART;VALUE=DATE:20261006"),
    ].join("\n")), feed, "Canvas");
    const filtered = canvasImportWindow(parsed.tasks, new Set(), now);
    assert.deepEqual(filtered.tasks.map(item => item.name), ["today-earlier", "tomorrow", "all-day-today"]);
    assert.equal(filtered.skippedPast, 1);
    assert.equal(filtered.tasks[2].dueAt, "2026-10-06");
  });
});

test("Canvas filtering uses the configured calendar day across UTC midnight and DST", async () => {
  await inZone("America/New_York", async () => {
    const tasks = [task("yesterday", "2026-10-06T03:59:59Z"), task("today", "2026-10-06T04:00:00Z"),
      task("utc-tomorrow-local-today", "2026-10-07T00:00:00Z"), task("date-today", "2026-10-06", true)];
    assert.deepEqual(canvasImportWindow(tasks, new Set(), new Date("2026-10-07T00:30:00Z")).tasks.map(item => item.id),
      ["today", "utc-tomorrow-local-today", "date-today"]);
    const dst = [task("dst-yesterday", "2026-11-01T03:59:59Z"), task("first-1am", "2026-11-01T05:00:00Z"), task("second-1am", "2026-11-01T06:00:00Z")];
    assert.deepEqual(canvasImportWindow(dst, new Set(), new Date("2026-11-01T07:00:00Z")).tasks.map(item => item.id), ["first-1am", "second-1am"]);
  });
  await inZone("Asia/Tokyo", async () => {
    const tasks = [task("yesterday", "2026-10-06T14:59:59Z"), task("today", "2026-10-06T15:00:00Z"),
      task("date-yesterday", "2026-10-06", true), task("date-today", "2026-10-07", true)];
    assert.deepEqual(canvasImportWindow(tasks, new Set(), new Date("2026-10-06T23:30:00Z")).tasks.map(item => item.id), ["today", "date-today"]);
  });
});

test("Canvas defaults to New York and preserves existing history and non-Canvas tasks", async () => {
  await inZone(undefined, async () => {
    const history = { ...task("history", "2026-10-05T18:00:00Z"), status: "Submitted/Done" as const, category: "Other" as const };
    const manual = { ...task("manual", "2026-10-05T18:00:00Z"), source: "Manual" as const };
    const gradescope = { ...manual, id: "gradescope", source: "Gradescope" as const };
    const tasks = [history, task("new-past", "2026-10-06T03:59:59Z"), manual, gradescope];
    const filtered = canvasImportWindow(tasks, new Set([history.id]), new Date("2026-10-07T00:30:00Z"));
    assert.deepEqual(filtered.tasks, [history, manual, gradescope]);
    assert.equal(filtered.skippedPast, 1);
    assert.equal(tasks.length, 4); // Filtering never mutates or deletes saved history.
  });
});
