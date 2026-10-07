import { test } from "node:test";
import assert from "node:assert/strict";
import { statusAfterToggle, tasksForView, type StatusOption } from "../lib/task-workflow";
import type { Status, Task } from "../lib/tasks";

function task(id: string, status: Status, category: Task["category"] = "Homework"): Task {
  return { id, status, category, name: id, dueAt: "2026-10-07T18:00:00Z", allDay: false, urls: [], source: "Manual" };
}
const tasks = [task("todo", "To Do"), task("progress", "In Progress"), task("done", "Submitted/Done"), task("job-done", "Submitted/Done", "Job Tasks")];

test("Active and Completed lists partition records while category filtering stays consistent", () => {
  assert.deepEqual(tasksForView(tasks, "list", "active", "All").map(item => item.id), ["todo", "progress"]);
  assert.deepEqual(tasksForView(tasks, "list", "completed", "All").map(item => item.id), ["done", "job-done"]);
  assert.deepEqual(tasksForView(tasks, "list", "completed", "Job Tasks").map(item => item.id), ["job-done"]);
  assert.equal(tasks.length, 4);
});

test("Calendar keeps completed records regardless of the selected list tab", () => {
  for (const tab of ["active", "completed"] as const) {
    assert.equal(tasksForView(tasks, "calendar", tab, "All").length, 4);
    assert.equal(tasksForView(tasks, "calendar", tab, "Homework").length, 3);
    assert.ok(tasksForView(tasks, "calendar", tab, "All").some(item => item.id === "done"));
  }
});

test("Status checkboxes are mutually exclusive and unchecking restores To Do", () => {
  const transitions: [Status, StatusOption, boolean, Status][] = [
    ["To Do", "In Progress", true, "In Progress"],
    ["To Do", "Submitted/Done", true, "Submitted/Done"],
    ["In Progress", "Submitted/Done", true, "Submitted/Done"],
    ["Submitted/Done", "In Progress", true, "In Progress"],
    ["Submitted/Done", "Submitted/Done", false, "To Do"],
    ["In Progress", "In Progress", false, "To Do"],
  ];
  for (const [current, option, checked, expected] of transitions) {
    const result = statusAfterToggle(current, option, checked);
    assert.equal(result, expected);
    assert.ok(Number(result === "In Progress") + Number(result === "Submitted/Done") <= 1);
  }
});
