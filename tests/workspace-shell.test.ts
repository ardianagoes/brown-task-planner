import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:3000" });
let root: Root, container: HTMLDivElement, createRoot: typeof import("react-dom/client").createRoot;
let Shell: typeof import("../components/workspace-shell").default;
before(async () => {
  for (const key of ["window", "document", "Element", "HTMLElement", "HTMLInputElement", "HTMLDialogElement", "Event", "MouseEvent", "KeyboardEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key as keyof typeof dom.window] });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  ({ createRoot } = await import("react-dom/client")); Shell = (await import("../components/workspace-shell")).default;
});
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });
after(() => dom.window.close());
const q = <T extends Element = HTMLElement>(selector: string) => { const item = container.querySelector<T>(selector); assert.ok(item, selector); return item; };
async function click(selector: string) { await act(async () => { q(selector).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); }
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Shell, { email: "", tasks: [], ready: true, saving: false, hasError: false, now: Date.now(), category: "All", onCategoryChange() {}, onSignOut() {},
    settings: createElement("form", { "aria-label": "Import feed" }, createElement("input", { name: "feed" })),
    renderCreator: (onBusyChange, initialFiles) => createElement("div", { "data-pasted-count": initialFiles.length }, createElement("button", { onClick: () => onBusyChange(true) }, "Begin operation"), createElement("button", { onClick: () => onBusyChange(false) }, "Finish operation")),
    children: section => createElement("h1", null, section),
  })));
}
test("navigation switches workspace destinations and sidebar collapse retains accessible labels", async () => {
  await mount(); assert.equal(q("h1").textContent, "upcoming");
  await click('nav[aria-label="Main navigation"] [aria-label="Today"]'); assert.equal(q("h1").textContent, "today");
  await click('[aria-label="Collapse sidebar"]'); assert.ok(q(".workspace-shell").classList.contains("sidebar-collapsed"));
  assert.equal(q('[aria-label="Expand sidebar"]').getAttribute("aria-expanded"), "false");
  await click('nav[aria-label="Mobile workspace navigation"] button:nth-child(3)'); assert.equal(q("h1").textContent, "calendar");
  await click('nav[aria-label="Main navigation"] [aria-label="Completed"]'); assert.equal(q("h1").textContent, "completed");
});
test("creation is modal-only, restores focus, and cannot dismiss an in-flight operation", async () => {
  await mount(); const opener = q<HTMLButtonElement>(".add-task-button"); opener.focus(); await click(".add-task-button");
  const dialog = q<HTMLDialogElement>("dialog"); assert.equal(dialog.open, true); assert.equal(document.body.style.overflow, "hidden");
  await click(".dialog-content button"); assert.equal(q<HTMLButtonElement>('[aria-label="Close add task"]').disabled, true);
  await act(async () => { dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })); }); assert.ok(dialog.open);
  await click(".dialog-content button:nth-child(2)");
  await act(async () => { dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })); });
  assert.equal(container.querySelector("dialog"), null); assert.equal(document.activeElement, opener); assert.equal(document.body.style.overflow, "");
});
test("calendar imports live in Settings and do not occupy the task workspace", async () => {
  await mount(); assert.equal(container.querySelector('[name="feed"]'), null);
  await click('.workspace-sidebar [aria-label="Settings"]'); assert.ok(q('[name="feed"]'));
  assert.match(q(".settings-section").textContent!, /Account/);
  await click('[aria-label="Close settings"]'); assert.equal(container.querySelector('[name="feed"]'), null);
});

test("Tab and Shift+Tab cycle within the modal instead of losing focus to browser chrome", async () => {
  await mount(); await click(".add-task-button");
  const controls = [...q("dialog").querySelectorAll<HTMLButtonElement>("button")];
  for (const control of controls) control.getClientRects = () => [{ width: 30, height: 30 }] as unknown as DOMRectList;
  const first = controls[0], last = controls.at(-1)!; first.focus();
  await act(async () => { first.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
  assert.equal(document.activeElement, last);
  await act(async () => { last.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
  assert.equal(document.activeElement, first);
});

test("workspace image paste opens creation while ordinary text-field pasting remains untouched", async () => {
  await mount(); const input = document.createElement("textarea"); container.append(input);
  const paste = (target: Element) => { const event = new dom.window.Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(event, "clipboardData", { value: { files: [new File(["test"], "screenshot.png", { type: "image/png" })] } }); target.dispatchEvent(event); return event; };
  let ordinary!: Event; await act(async () => { ordinary = paste(input); }); assert.equal(ordinary.defaultPrevented, false); assert.equal(container.querySelector("dialog"), null);
  let image!: Event; await act(async () => { image = paste(document.body); }); assert.equal(image.defaultPrevented, true);
  assert.equal(q('[data-pasted-count]').getAttribute("data-pasted-count"), "1");
  await click('[aria-label="Close add task"]'); await click('.add-task-button'); assert.equal(q('[data-pasted-count]').getAttribute("data-pasted-count"), "0");
});
