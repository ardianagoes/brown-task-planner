import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import type { Status, Task } from "../lib/tasks";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:3000" });
let root: Root, container: HTMLDivElement, createRoot: typeof import("react-dom/client").createRoot;
let Workspace: typeof import("../components/task-workspace").default;
type Props = Parameters<typeof Workspace>[0];
const now = new Date(2026, 10, 9, 12).getTime();
const task = (id: string, dueAt: string, status: Status = "To Do"): Task => ({ id, name: id, dueAt, allDay: true, status, category: "Homework", urls: [], source: "Canvas" });
const tasks = [task("Earlier task", "2026-11-08"), task("Today task", "2026-11-09"), task("Tomorrow task", "2026-11-10"), task("Week task", "2026-11-13"), task("Future task", "2026-12-01"), task("Done task", "2026-11-09", "Submitted/Done")];
const defaults: Props = { tasks, now, ready: true, saving: false, category: "All", onCategoryChange() {}, onStatusChange() {}, onDeleteTask: async () => {}, onEditTask: async () => {}, onRetry() {}, hasError: false };
before(async () => {
  for (const key of ["window", "document", "Element", "HTMLElement", "HTMLInputElement", "HTMLDialogElement", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key as keyof typeof dom.window] });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator }); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  ({ createRoot } = await import("react-dom/client")); Workspace = (await import("../components/task-workspace")).default;
});
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); }); after(() => dom.window.close());
const q = <T extends Element = HTMLElement>(selector: string) => { const item = container.querySelector<T>(selector); assert.ok(item, selector); return item; };
async function click(selector: string) { await act(async () => { q(selector).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); }
async function mount(patch: Partial<Props> = {}) { container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(createElement(Workspace, { ...defaults, ...patch }))); }

test("upcoming agenda groups real inputs, retains distant deadlines, and shows one status control per row", async () => {
  await mount(); const labels = [...container.querySelectorAll(".agenda-group > header h2")].map(item => item.textContent);
  assert.deepEqual(labels, ["Overdue", "Today", "Tomorrow", "Later This Week", "Later"]);
  assert.equal(container.querySelectorAll(".task-row").length, 5);
  assert.equal(container.querySelectorAll('.task-row select[aria-label^="Status for"]').length, 5);
  assert.equal(container.querySelectorAll('.task-row input[type="checkbox"]').length, 0);
  assert.equal(container.querySelector('[data-task-id="Done task"]'), null);
});
test("the single status selector emits existing API statuses; completed history stays editable", async () => {
  const changed: [string, Status][] = []; await mount({ onStatusChange: (id, status) => { changed.push([id, status]); } });
  const select = q<HTMLSelectElement>('[aria-label="Status for Today task"]');
  await act(async () => { select.value = "In Progress"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  assert.deepEqual(changed, [["Today task", "In Progress"]]);
  await click('[role="tab"][id$="completed"]'); assert.ok(q('[data-task-id="Done task"][data-completed="true"]'));
  await click('[aria-label="Edit Done task"]'); assert.equal(q<HTMLSelectElement>('dialog [name="status"]').value, "Submitted/Done");
});
test("calendar and monthly mobile agenda retain completed tasks, full time labels, and day details", async () => {
  await mount(); await click('[aria-label="Calendar view"]');
  assert.ok(q('.calendar-desktop button[data-completed="true"]'));
  assert.match(q('.calendar-desktop button[data-completed="true"]').textContent!, /All day.*Done task/);
  assert.equal(q('.calendar-desktop button[data-completed="true"]').querySelector('.calendar-urgent'), null);
  assert.ok(q('.calendar-agenda [data-task-id="Done task"]')); assert.ok(q('.calendar-agenda [aria-label="Edit Today task"]'));
  await click('button[aria-label^="Today task,"][aria-label$="Open day details"]'); assert.ok(q('dialog[open] [data-task-id="Today task"]'));
});
test("delete confirmation stays explicit, restores focus on cancel, and preserves failed deletions", async () => {
  let calls = 0; await mount({ onDeleteTask: async () => { calls++; throw new Error("Storage unavailable. Try again."); } });
  await click('[aria-label="Delete Today task"]'); assert.equal(calls, 0);
  const group = q('[aria-label="Confirm deletion of Today task"]');
  await act(async () => { group.querySelector("button")!.click(); });
  assert.equal(document.activeElement, q('[aria-label="Delete Today task"]'));
  await click('[aria-label="Delete Today task"]'); await click('[aria-label="Confirm delete Today task"]');
  assert.equal(calls, 1); assert.ok(q('[data-task-id="Today task"]')); assert.match(q('[role="alert"]').textContent!, /Storage unavailable/);
});
test("Today, empty, loading, and retry states never render fictional deadlines", async () => {
  let retried = 0; await mount({ section: "today" }); assert.equal(container.querySelectorAll('.task-row').length, 1);
  await act(async () => root.render(createElement(Workspace, { ...defaults, tasks: [], ready: false, hasError: true, onRetry: () => { retried++; } })));
  assert.match(q('[role="status"]').textContent!, /could not be loaded/); assert.equal(container.querySelectorAll('.task-row').length, 0);
  await act(async () => { [...container.querySelectorAll("button")].find(item => item.textContent === "Retry")!.click(); }); assert.equal(retried, 1);
  await act(async () => root.render(createElement(Workspace, { ...defaults, tasks: [] }))); assert.match(q('.workspace-empty').textContent!, /first deadline/);
});
