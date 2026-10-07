import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson, assertSameOrigin, safeNext, HttpError } from "../lib/http";
import { isTask, type Task } from "../lib/tasks";
import { fromTaskRow, toTaskRow } from "../lib/task-store";

const task: Task = { id: "manual", name: "Finish essay", dueAt: "2026-10-07T18:00:00.000Z", allDay: false,
  category: "Homework", status: "In Progress", urls: ["https://example.com/assignment"], source: "Manual" };
test("task rows round-trip timed and all-day deadlines without timezone shifts", () => {
  const row = toTaskRow(task, "owner");
  assert.deepEqual(fromTaskRow({ ...row, created_at: "2026-10-06T12:00:00Z" }), task);
  const allDay = { ...task, dueAt: "2026-10-08", allDay: true };
  const allDayRow = toTaskRow(allDay, "owner");
  assert.equal(allDayRow.due_at, null);
  assert.equal(allDayRow.due_date, "2026-10-08");
  assert.deepEqual(fromTaskRow({ ...allDayRow, created_at: "2026-10-06T12:00:00Z" }), allDay);
});
test("server validation rejects malformed dates, oversized URLs and empty task names", () => {
  for (const bad of [{ ...task, name: " " }, { ...task, id: "" }, { ...task, allDay: true },
    { ...task, allDay: true, dueAt: "2026-02-30" }, { ...task, dueAt: "2026-10-08" },
    { ...task, urls: Array(21).fill("https://example.com") }, { ...task, urls: ["https://example.com/" + "a".repeat(4096)] }]) assert.equal(isTask(bad), false);
});
test("mutation origin checks reject missing or foreign origins", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://deadline.example";
  try {
    assert.doesNotThrow(() => assertSameOrigin(new Request("http://internal/api/tasks", { headers: { Origin: "https://deadline.example" } })));
    for (const headers of [new Headers(), new Headers({ Origin: "https://evil.example" })]) assert.throws(() => assertSameOrigin(new Request("http://internal/api/tasks", { headers })), HttpError);
  } finally { if (previous) process.env.NEXT_PUBLIC_APP_URL = previous; else delete process.env.NEXT_PUBLIC_APP_URL; }
});
test("auth redirects cannot leave the application", () => {
  for (const target of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/admin"]) assert.equal(safeNext(target), "/");
  assert.equal(safeNext("/auth/reset"), "/auth/reset");
});
test("JSON body limits count actual UTF-8 bytes and return explicit parse failures", async () => {
  const request = (body: string, contentType = "application/json") => new Request("http://localhost", { method: "POST", headers: { "Content-Type": contentType }, body });
  assert.deepEqual(await readJson(request('{"ok":true}'), 100), { ok: true });
  await assert.rejects(readJson(request("{bad"), 100), error => error instanceof HttpError && error.status === 400);
  await assert.rejects(readJson(request('"éé"'), 5), error => error instanceof HttpError && error.status === 413);
  await assert.rejects(readJson(request("{}", "text/plain"), 100), error => error instanceof HttpError && error.status === 415);
});
