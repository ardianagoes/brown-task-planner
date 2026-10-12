import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import type { Task } from "../lib/tasks";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:3000" });
let root: Root, container: HTMLDivElement, createRoot: typeof import("react-dom/client").createRoot;
let Edit: typeof import("../components/task-edit-dialog").default, Workspace: typeof import("../components/task-workspace").default;
before(async () => {
  for (const key of ["window", "document", "Element", "HTMLElement", "HTMLInputElement", "HTMLDialogElement", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key as keyof typeof dom.window] });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  ({ createRoot } = await import("react-dom/client"));
  Edit = (await import("../components/task-edit-dialog")).default; Workspace = (await import("../components/task-workspace")).default;
});
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); });
after(() => dom.window.close());
const task: Task = { id: "existing", name: "Existing homework", dueAt: "2026-10-20", allDay: true, category: "Homework", status: "To Do", urls: ["https://example.edu/task"], source: "Canvas" };
const q = <T extends Element = HTMLElement>(selector: string) => { const element = container.querySelector<T>(selector); assert.ok(element, selector); return element; };
const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent === name)!;
async function click(element: Element) { await act(async () => element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))); }
async function field(name: string, value: string) {
  const input = q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  const prototype = input instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : input instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}
async function submit() { await act(async () => q("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }))); }
async function mount(onSave: (task: Task) => Promise<void>, onClose = () => {}) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Edit, { task, tasks: [task], onSave, onClose })));
}
test("edit modal prepopulates every editable field, saves only on confirmation, and keeps source/ID", async () => {
  const saved: Task[] = []; let closed = 0;
  await mount(async task => { saved.push(task); }, () => closed++);
  assert.equal(q<HTMLInputElement>('[name="name"]').value, task.name); assert.equal(q<HTMLInputElement>('[name="dueDate"]').value, "2026-10-20");
  assert.equal(q<HTMLInputElement>('[name="allDay"]').checked, true); assert.equal(q<HTMLInputElement>('[name="urls"]').value, task.urls[0]);
  assert.match(container.textContent!, /Source: Canvas/); assert.equal(saved.length, 0);
  await field("name", "Edited application"); await field("category", "Applications"); await field("status", "Submitted/Done"); await field("urls", "https://example.com/apply"); await submit();
  assert.equal(saved.length, 1); assert.equal(saved[0].id, task.id); assert.equal(saved[0].source, task.source); assert.equal(saved[0].status, "Submitted/Done");
  assert.equal(saved[0].name, "Edited application"); assert.equal(saved[0].category, "Applications"); assert.equal(closed, 1);
});
test("cancel/Escape do not save; invalid fields and failed saves retain the modal and corrected values", async () => {
  let calls = 0, closed = 0;
  await mount(async () => { calls++; throw new Error("Storage unavailable"); }, () => closed++);
  await click(button("Cancel")); assert.equal(closed, 1); assert.equal(calls, 0);
  await field("urls", "javascript:alert(1)"); await submit(); assert.equal(calls, 0); assert.match(q('[role="alert"]').textContent!, /URLs/);
  await field("urls", "https://example.com"); await field("name", "Retry this title"); await submit();
  assert.equal(calls, 1); assert.equal(closed, 1); assert.match(q('[role="alert"]').textContent!, /Storage unavailable/);
  assert.equal(q<HTMLInputElement>('[name="name"]').value, "Retry this title");
  await act(async () => q("dialog").dispatchEvent(new dom.window.Event("cancel", { cancelable: true }))); assert.equal(closed, 2);
});
test("double submit makes one update and blocks dismissal during the in-flight save", async () => {
  let calls = 0, closed = 0, resolve!: () => void;
  await mount(async () => { calls++; await new Promise<void>(done => { resolve = done; }); }, () => closed++);
  await submit(); await submit(); assert.equal(calls, 1);
  await act(async () => q("dialog").dispatchEvent(new dom.window.Event("cancel", { cancelable: true }))); assert.equal(closed, 0);
  await act(async () => resolve()); assert.equal(closed, 1);
});
test("date and time input events save the displayed deadline when switching all-day to timed", async () => {
  const saved: Task[] = []; await mount(async task => { saved.push(task); });
  await click(q('[name="allDay"]'));
  await field("dueDate", "2026-10-21"); await field("dueTime", "22:00"); await field("timezone", "America/New_York"); await submit();
  assert.equal(saved[0].allDay, false); assert.equal(saved[0].dueAt, "2026-10-22T02:00:00Z");
});
test("background refresh cannot silently substitute a deadline different from the visible edit form", async () => {
  const saved: Task[] = [], onSave = async (task: Task) => { saved.push(task); }, onClose = () => {};
  await mount(onSave, onClose);
  const refreshed = { ...task, dueAt: "2026-10-30" };
  await act(async () => root.render(createElement(Edit, { task: refreshed, tasks: [refreshed], onSave, onClose })));
  await field("name", "Visible edited title"); await submit();
  assert.equal(saved[0].dueAt, "2026-10-20"); assert.equal(saved[0].name, "Visible edited title");
});
test("Edit is available in Active, Completed and calendar day details", async () => {
  const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const active = { ...task, dueAt: today }, done = { ...task, id: "done", name: "Done homework", dueAt: today, status: "Submitted/Done" as const };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Workspace, { tasks: [active, done], now: Date.now(), ready: true, saving: false, category: "All", onCategoryChange() {}, onStatusChange() {}, onDeleteTask: async () => {}, onEditTask: async () => {}, onRetry() {}, hasError: false })));
  await click(q('button[aria-label="Edit Existing homework"]')); assert.ok(container.querySelector('form[aria-label="Edit assignment"]')); await click(button("Cancel"));
  await click([...container.querySelectorAll('[role="tab"]')].find(item => item.textContent!.startsWith("Completed"))!);
  await click(q('button[aria-label="Edit Done homework"]')); assert.equal(q<HTMLSelectElement>('[name="status"]').value, "Submitted/Done"); await click(button("Cancel"));
  await click(button("calendar")); await click(q('button[aria-label*="Existing homework"][aria-label*="Open day details"]'));
  await click(q('button[aria-label="Edit Existing homework"]')); assert.ok(container.querySelector('form[aria-label="Edit assignment"]'));
});
