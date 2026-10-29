import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AuthMode } from "../lib/auth-messages";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:3000" });
let root: Root, container: HTMLDivElement, createRoot: typeof import("react-dom/client").createRoot;
let AuthPanel: typeof import("../components/auth-panel").default, ResetPassword: typeof import("../components/reset-password").default;
const navigations: string[] = [];
const router: AppRouterInstance = { replace: (path: string) => { navigations.push(path); }, refresh() {}, back() {}, forward() {}, push() {}, prefetch() {}, bfcacheId: "auth-test" };
before(async () => {
  for (const key of ["window", "document", "Element", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent", "FormData"])
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key as keyof typeof dom.window] });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  ({ createRoot } = await import("react-dom/client"));
  AuthPanel = (await import("../components/auth-panel")).default;
  ResetPassword = (await import("../components/reset-password")).default;
});
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); navigations.length = 0; });
after(() => dom.window.close());
const q = <T extends Element = HTMLElement>(selector: string) => { const element = container.querySelector<T>(selector); assert.ok(element, selector); return element; };
const button = (name: string) => { const result = [...container.querySelectorAll("button")].find(item => item.textContent === name); assert.ok(result, name); return result; };
async function click(element: Element) { await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); }
function field(name: string, value: string) { q<HTMLInputElement>(`[name="${name}"]`).value = value; }
async function submit() { await act(async () => { q("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); }
async function mount(element: ReturnType<typeof createElement>) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(AppRouterContext.Provider, { value: router }, element)));
}
function panel(auth: object, initialMode: AuthMode = "login") {
  return createElement(AuthPanel, { linkError: "", initialMode, authClient: (() => ({ auth })) as NonNullable<Parameters<typeof AuthPanel>[0]["authClient"]> });
}

test("magic-link option removes the password field, sends one private-account request, and never navigates before verification", async () => {
  const requests: unknown[] = []; let resolve!: (value: unknown) => void;
  await mount(panel({ signInWithOtp: (input: unknown) => { requests.push(input); return new Promise(done => { resolve = done; }); } }));
  await click(button("Email me a sign-in link")); assert.equal(container.querySelector('[name="password"]'), null);
  field("email", "owner@example.test"); await submit(); await submit(); assert.equal(requests.length, 1);
  assert.equal(button("Please wait…").disabled, true); assert.deepEqual(navigations, []);
  const request = requests[0] as { options: { shouldCreateUser: boolean; emailRedirectTo: string } };
  assert.equal(request.options.shouldCreateUser, false); assert.equal(new URL(request.options.emailRedirectTo).pathname, "/auth/callback");
  await act(async () => resolve({ error: null }));
  assert.match(q('[role="status"]').textContent!, /If this account exists.*newest email.*Continue/);
  assert.deepEqual(navigations, []);
});

test("forgot-password requests recovery, explains confirmation, and preserves unknown-account privacy", async () => {
  let requested = "";
  await mount(panel({ resetPasswordForEmail: async (_email: string, options: { redirectTo: string }) => { requested = options.redirectTo; return { error: null }; } }, "forgot"));
  field("email", "owner@example.test"); await submit();
  assert.equal(new URL(requested).searchParams.get("next"), "/auth/reset");
  assert.match(q('[role="status"]').textContent!, /If this account exists.*password reset link/); assert.deepEqual(navigations, []);
});

test("magic-link failures expose no raw provider message and allow requesting a fresh recovery link", async () => {
  await mount(panel({ signInWithOtp: async () => ({ error: { code: "user_not_found", message: "PRIVATE PROVIDER DETAILS" } }) }, "magic"));
  field("email", "unknown@example.test"); await submit();
  assert.match(q('[role="status"]').textContent!, /If this account exists/); assert.doesNotMatch(container.textContent!, /PRIVATE PROVIDER DETAILS/);
  await click(button("Request a password-reset link")); assert.match(q("h1").textContent!, /Reset your password/);
});

test("reset form requires matching passwords and shows explicit success/sign-in continuation only after an update", async () => {
  let calls = 0;
  await mount(createElement(ResetPassword, { onUpdate: async () => { calls++; } }));
  assert.match(q("h1").textContent!, /Choose a new password/); assert.equal(calls, 0);
  field("password", "new-strong-password"); field("confirm", "different-password"); await submit();
  assert.equal(calls, 0); assert.match(q('[role="alert"]').textContent!, /must match/);
  field("confirm", "new-strong-password"); await submit(); assert.equal(calls, 1);
  assert.match(q("h1").textContent!, /Password updated/); assert.equal(container.querySelector("form"), null);
  assert.equal(q<HTMLAnchorElement>("a").getAttribute("href"), "/login?notice=password_updated"); assert.deepEqual(navigations, []);
});

test("failed password updates retain the form with a fresh-link option; duplicate submits make one request", async () => {
  let calls = 0, reject!: (error: Error) => void;
  await mount(createElement(ResetPassword, { onUpdate: async () => { calls++; await new Promise<void>((_done, fail) => { reject = fail; }); } }));
  field("password", "new-strong-password"); field("confirm", "new-strong-password"); await submit(); await submit();
  assert.equal(calls, 1); assert.equal(button("Updating…").disabled, true);
  await act(async () => reject(new Error("Your recovery session expired. Request a fresh link.")));
  assert.match(q('[role="alert"]').textContent!, /recovery session expired/);
  assert.equal(q<HTMLInputElement>('[name="password"]').value, "new-strong-password");
  assert.equal(q<HTMLAnchorElement>("a").getAttribute("href"), "/login?mode=forgot");
  assert.doesNotMatch(q("h1").textContent!, /Password updated/);
});
