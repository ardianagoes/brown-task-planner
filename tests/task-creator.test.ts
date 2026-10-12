import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import type { Task } from "../lib/tasks";
import { parseExtraction, taskFromDraft, draftFromCandidate, type Candidate, type Extraction } from "../lib/assignment-draft";
import { MAX_IMAGE_BYTES } from "../lib/image-limits";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:3000" });
let root: Root;
let container: HTMLDivElement;
let createRoot: typeof import("react-dom/client").createRoot;
let TaskCreator: typeof import("../components/task-creator").default;
const revoked: string[] = [];
before(async () => {
  for (const key of ["window", "document", "Element", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key as keyof typeof dom.window] });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  URL.createObjectURL = () => "blob:local-preview";
  URL.revokeObjectURL = url => { revoked.push(url); };
  ({ createRoot } = await import("react-dom/client"));
  TaskCreator = (await import("../components/task-creator")).default;
});
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); });
after(() => dom.window.close());
const candidate = (patch: Partial<Candidate> = {}): Candidate => ({
  name: "Email internship application", dueDate: "2027-01-15", dueTime: null, timezone: null,
  category: "Applications", usefulUrl: null, uncertainFields: [], notes: [], dateKind: "explicit",
  dateExpression: "Application deadline: January 15, 2027", ...patch,
});
function extraction(candidates = [candidate()]): Extraction {
  return parseExtraction({ candidates, notes: [] }, "2026-10-07", "America/New_York");
}
const file = (type = "image/png", size = 10) => new File([new Uint8Array(size)], "screen.png", { type });
async function mount(options: { tasks?: Task[]; onAnalyze?: (file: File) => Promise<Extraction>; onSave?: (task: Task) => Promise<void> } = {}) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const saved: Task[] = [], analyzed: File[] = [];
  await act(async () => root.render(createElement(TaskCreator, {
    tasks: options.tasks || [], disabled: false,
    onAnalyze: options.onAnalyze || (async image => { analyzed.push(image); return extraction(); }),
    onSaveTask: options.onSave || (async task => { saved.push(task); }),
  })));
  return { saved, analyzed };
}
function query<T extends Element = HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector); assert.ok(element, selector); return element;
}
function button(text: string): HTMLButtonElement {
  const element = [...container.querySelectorAll("button")].find(item => item.textContent === text); assert.ok(element, text); return element;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function submit() { await act(async () => query("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }))); }
async function setValue(name: string, value: string) {
  const element = query<HTMLInputElement>(`input[name="${name}"]`);
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(element, value); element.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
async function upload(image = file()) {
  const input = query<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: [image] });
  await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
}
async function paste(target: Element = document.body, images: File[] = [file()]) {
  const event = new dom.window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files: images } });
  await act(async () => target.dispatchEvent(event));
  return event;
}
async function analyze() { await click(button("Analyze Screenshot")); }

test("screenshot tab defaults on; Ctrl+V previews locally; ordinary text-field pasting is untouched", async () => {
  const { analyzed, saved } = await mount();
  assert.equal(query('[role="tab"][aria-selected="true"]').textContent, "Paste Screenshot");
  assert.equal(button("Analyze Screenshot").disabled, true);
  const textField = document.createElement("textarea"); container.append(textField);
  const ordinary = await paste(textField);
  assert.equal(ordinary.defaultPrevented, false); assert.equal(container.querySelector("img"), null);
  const empty = await paste(document.body, []); assert.equal(empty.defaultPrevented, false);
  assert.equal((await paste()).defaultPrevented, true);
  assert.equal(query<HTMLImageElement>("img").alt, "Screenshot preview");
  assert.equal(analyzed.length, 0); assert.equal(saved.length, 0);
  await click(button("Remove screenshot")); assert.equal(container.querySelector("img"), null);
  assert.ok(revoked.includes("blob:local-preview"));
});

test("drag/drop and file chooser validate single images, MIME and size; replacing updates local preview", async () => {
  const { analyzed } = await mount();
  await upload(file("image/gif")); assert.match(query('[role="alert"]').textContent!, /PNG/);
  await upload(file("image/png", MAX_IMAGE_BYTES + 1)); assert.match(query('[role="alert"]').textContent!, /3 MB/);
  await paste(document.body, [file(), file()]); assert.match(query('[role="alert"]').textContent!, /one screenshot/);
  const drop = new dom.window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: { files: [file("image/webp")] } });
  await act(async () => query('button[aria-label="Choose screenshot"]').dispatchEvent(drop));
  assert.ok(container.querySelector("img")); assert.equal(analyzed.length, 0);
  await upload(file("image/jpeg")); assert.ok(container.querySelector('button[aria-label="Replace screenshot"]'));
  await analyze(); assert.equal(analyzed[0].type, "image/jpeg");
});

test("Analyze never saves automatically; Add Assignment persists a reviewed all-day Manual/To Do task and clears image", async () => {
  const { analyzed, saved } = await mount();
  await upload(); await analyze();
  assert.equal(analyzed.length, 1); assert.equal(saved.length, 0);
  assert.equal(query<HTMLInputElement>('input[name="allDay"]').checked, true);
  assert.equal(query<HTMLInputElement>('input[name="dueDate"]').value, "2027-01-15");
  await setValue("name", "Reviewed internship application");
  await submit();
  assert.equal(saved.length, 1); assert.equal(saved[0].name, "Reviewed internship application");
  assert.equal(saved[0].dueAt, "2027-01-15"); assert.equal(saved[0].allDay, true);
  assert.equal(saved[0].source, "Manual"); assert.equal(saved[0].status, "To Do");
  assert.match(saved[0].id, /^[a-f0-9-]{36}$/);
  assert.equal(container.querySelector("img"), null); assert.equal(container.querySelector("form"), null);
  assert.match(query('[role="status"]').textContent!, /Task saved/);
});

test("multiple candidates require selection and save only the chosen, explicitly confirmed task", async () => {
  const saved: Task[] = [];
  await mount({ onAnalyze: async () => extraction([candidate({ name: "Canvas essay" }), candidate({ name: "PDF syllabus exam" })]),
    onSave: async task => { saved.push(task); } });
  await upload(); await analyze();
  assert.equal(container.querySelector("form"), null); assert.equal(saved.length, 0);
  assert.equal(query<HTMLInputElement>('input[type="radio"]').checked, false);
  await click(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
  assert.equal(query<HTMLInputElement>('input[name="name"]').value, "PDF syllabus exam");
  await submit(); assert.equal(saved[0].name, "PDF syllabus exam"); assert.equal(saved.length, 1);
});

test("missing dates and inferred years are highlighted; uncertain details need confirmation", async () => {
  const { saved } = await mount({ onAnalyze: async () => extraction([candidate({ dueDate: null, dateKind: "unknown", notes: ["Deadline not visible"] })]) });
  await upload(); await analyze(); await submit();
  assert.equal(saved.length, 0); assert.match(query('[role="alert"]').textContent!, /uncertain details/);
  assert.equal(query<HTMLInputElement>('input[name="dueDate"]').value, "");
  assert.match(query<HTMLInputElement>('input[name="dueDate"]').className, /amber/);
  await setValue("dueDate", "2027-01-17"); await click(query<HTMLInputElement>('input[type="checkbox"][required]'));
  await submit(); assert.equal(saved.length, 1); assert.equal(saved[0].dueAt, "2027-01-17");
});

test("possible duplicate warning requires opt-in; saving never overwrites the existing ID", async () => {
  const existing = taskFromDraft(draftFromCandidate(candidate(), "America/New_York"), "old-id");
  const { saved } = await mount({ tasks: [existing] });
  await upload(); await analyze(); assert.match(container.textContent!, /name and deadline exists/);
  await submit(); assert.equal(saved.length, 0);
  await click(query<HTMLInputElement>('input[type="checkbox"][required]')); await submit();
  assert.equal(saved.length, 1); assert.notEqual(saved[0].id, existing.id); assert.equal(existing.name, candidate().name);
});

test("failed analysis opens a blank editable review; explicit retry and failed saves keep image and safe retry ID", async () => {
  let analyses = 0; const attempts: Task[] = [];
  await mount({
    onAnalyze: async () => { if (++analyses === 1) throw new Error("Analysis unavailable"); return extraction(); },
    onSave: async task => { attempts.push(task); if (attempts.length === 1) throw new Error("Storage unavailable"); },
  });
  await upload(); await analyze();
  assert.match(query('[role="alert"]').textContent!, /Analysis unavailable/); assert.ok(container.querySelector("img"));
  assert.ok(container.querySelector("form")); assert.equal(query<HTMLInputElement>('input[name="dueDate"]').value, "");
  await click(button("Try Again")); await analyze(); await submit();
  assert.match(query('[role="alert"]').textContent!, /Storage unavailable/);
  assert.ok(container.querySelector("img")); assert.ok(container.querySelector("form"));
  await submit(); assert.equal(attempts.length, 2); assert.equal(attempts[0].id, attempts[1].id);
  assert.equal(container.querySelector("img"), null);
});

test("after analysis failure, manual correction in the same review can be confirmed without restarting", async () => {
  const { saved } = await mount({ onAnalyze: async () => { throw new Error("OCR unavailable"); } });
  await upload(); await analyze();
  assert.equal(saved.length, 0);
  await setValue("name", "Corrected task"); await setValue("dueDate", "2027-01-17");
  await click(query<HTMLInputElement>('input[type="checkbox"][required]')); await submit();
  assert.equal(saved[0].name, "Corrected task"); assert.equal(saved[0].dueAt, "2027-01-17");
});

test("manual entry remains available and image paste is ignored outside screenshot mode", async () => {
  const { analyzed, saved } = await mount();
  await click(button("Manual Entry")); assert.equal((await paste()).defaultPrevented, false);
  assert.equal(container.querySelector("img"), null);
  await setValue("name", "Manual task"); await setValue("dueAt", "2026-10-15T17:00"); await submit();
  assert.equal(saved.length, 1); assert.equal(saved[0].name, "Manual task"); assert.equal(saved[0].allDay, false);
  assert.equal(analyzed.length, 0);
});
test("rapid Analyze clicks make one paid analysis attempt and never save or automatically retry", async () => {
  let calls = 0, finish!: (value: Extraction) => void;
  const { saved } = await mount({ onAnalyze: async () => { calls++; return await new Promise<Extraction>(resolve => { finish = resolve; }); } });
  await upload();
  await act(async () => { const target = button("Analyze Screenshot"); target.dispatchEvent(new MouseEvent("click", { bubbles: true })); target.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  assert.equal(calls, 1); assert.equal(saved.length, 0);
  await act(async () => finish(extraction([candidate({ dueDate: null, dateKind: "unknown" })])));
  assert.equal(calls, 1); assert.equal(saved.length, 0); assert.ok(container.querySelector("form"));
});

test("review can switch from all-day to a timed deadline with editable timezone", async () => {
  const { saved } = await mount(); await upload(); await analyze();
  await click(query<HTMLInputElement>('input[name="allDay"]'));
  await setValue("dueTime", "17:00"); await setValue("timezone", "-05:00"); await submit();
  assert.equal(saved[0].allDay, false); assert.equal(saved[0].dueAt, "2027-01-15T22:00:00Z");
});
