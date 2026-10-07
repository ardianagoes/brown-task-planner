"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { CATEGORIES, CATEGORY_STYLE, STATUSES, deadlineMillis, isTask, localDay,
  safeUrl, taskDay, urgency, type Category, type Status, type Task } from "@/lib/tasks";
import CalendarView from "./calendar-view";

const STORAGE_KEY = "deadline-desk.tasks.v1";
const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";
const button = "rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-700 disabled:opacity-50";

export default function Dashboard({ user }: { user: { id: string; email: string } }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const readSequence = useRef(0);
  const accountEpoch = useRef(0);
  const pendingManual = useRef<{ signature: string; task: Task } | null>(null);
  const [legacyCount, setLegacyCount] = useState(0);
  const [migrationError, setMigrationError] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [hideDone, setHideDone] = useState(true);
  const [category, setCategory] = useState<Category | "All">("All");
  const [ascending, setAscending] = useState(true);
  const [now, setNow] = useState(0);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const epoch = accountEpoch.current;
    const response = await fetch(path, { cache: "no-store", ...options });
    if (epoch !== accountEpoch.current) throw new Error("Your account changed. Sign in again.");
    if (response.status === 401) {
      ++accountEpoch.current; ++readSequence.current;
      setTasks([]); setReady(false); router.replace("/login"); router.refresh();
      throw new Error("Your session expired. Sign in again.");
    }
    const result = await response.json();
    if (epoch !== accountEpoch.current) throw new Error("Your account changed. Sign in again.");
    if (!response.ok) throw new Error(result.error || "The request failed. Try again.");
    return result;
  }, [router]);

  const loadTasks = useCallback(async () => {
    const sequence = ++readSequence.current;
    try {
      const result = await apiRequest("/api/tasks");
      if (!Array.isArray(result.tasks) || !result.tasks.every(isTask)) throw new Error("Invalid saved tasks returned by the server.");
      if (sequence !== readSequence.current) return;
      setTasks(result.tasks); setReady(true); setStorageError("");
    } catch (error) {
      if (sequence === readSequence.current) setStorageError(error instanceof Error ? error.message : "Could not load your tasks.");
    }
  }, [apiRequest]);

  useEffect(() => {
    void loadTasks();
    setNow(Date.now());
    const refresh = () => { if (!busy.current) void loadTasks(); };
    const timer = setInterval(() => { setNow(Date.now()); if (document.visibilityState === "visible") refresh(); }, 60000);
    window.addEventListener("focus", refresh);
    const { data: { subscription } } = browserClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user && session.user.id !== user.id)) {
        ++accountEpoch.current; ++readSequence.current; setTasks([]); setReady(false);
        router.replace("/login"); router.refresh();
      }
    });
    return () => { ++accountEpoch.current; ++readSequence.current; clearInterval(timer); window.removeEventListener("focus", refresh); subscription.unsubscribe(); };
  }, [loadTasks, router, user.id]);

  useEffect(() => {
    try {
      const owner = localStorage.getItem("deadline-desk.migration-owner.v1");
      if (owner && owner !== user.id) return;
      if (owner === user.id) return;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const decoded: unknown = JSON.parse(stored);
      if (!Array.isArray(decoded) || !decoded.every(isTask)) throw new Error("Invalid backup");
      setLegacyCount(decoded.length);
    } catch { setMigrationError("Your browser backup could not be read. It has been preserved unchanged."); }
  }, [user.id]);

  const visible = useMemo(() => tasks.filter(task =>
    (!hideDone || task.status !== "Submitted/Done") && (category === "All" || task.category === category)
  ).sort((a, b) => (deadlineMillis(a) - deadlineMillis(b)) * (ascending ? 1 : -1)),
  [tasks, hideDone, category, ascending]);
  const active = tasks.filter(task => task.status !== "Submitted/Done");
  const urgent = active.filter(task => {
    const delta = deadlineMillis(task) - now;
    return delta >= 0 && delta <= 48 * 3600000;
  }).length;
  const overdue = active.filter(task => deadlineMillis(task) < now).length;

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setFormError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const inputDate = String(data.get("dueAt") || "");
    const date = new Date(inputDate);
    if (!name || !Number.isFinite(date.getTime())) { setFormError("Enter a task name and valid deadline."); return; }
    // datetime-local uses the browser timezone. Reject nonexistent DST local times.
    const normalized = `${localDay(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    if (normalized !== inputDate) { setFormError("This time does not exist in your timezone. Choose another time."); return; }
    const rawUrls = String(data.get("urls") || "").split(/\s+/).filter(Boolean);
    const urls = rawUrls.map(safeUrl);
    if (urls.some(url => !url)) { setFormError("Use full http:// or https:// URLs, separated by spaces or new lines."); return; }
    const selected = String(data.get("category")) as Category;
    const signature = JSON.stringify({ name, date: date.toISOString(), category: selected, urls });
    const task: Task = pendingManual.current?.signature === signature ? pendingManual.current.task : {
      id: crypto.randomUUID(), name, dueAt: date.toISOString(), allDay: false,
      category: selected, status: "To Do", urls: urls as string[], source: "Manual",
    };
    if (!isTask(task)) { setFormError("Use at most 20 URLs, each under 4,096 characters."); return; }
    pendingManual.current = { signature, task };
    busy.current = true; setSaving(true); ++readSequence.current;
    try {
      const result = await apiRequest("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) });
      if (!isTask(result.task)) throw new Error("Could not confirm the task save.");
      setTasks(previous => [...previous.filter(item => item.id !== result.task.id), result.task]);
      pendingManual.current = null; setCategory("All"); form.reset(); setNotice("Task saved to your account.");
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not save this task. Try again."); }
    finally { busy.current = false; setSaving(false); }
  }

  async function changeStatus(id: string, status: Status) {
    if (busy.current) return;
    busy.current = true; setSaving(true); ++readSequence.current;
    try {
      const result = await apiRequest(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!isTask(result.task)) throw new Error("Could not confirm the status save.");
      setTasks(previous => previous.map(task => task.id === id ? result.task : task));
      setStorageError("");
    } catch (error) { setStorageError(error instanceof Error ? error.message : "Could not save this status. Try again."); }
    finally { busy.current = false; setSaving(false); }
  }

  async function migrateBackup() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setMigrationError("");
    try {
      const backup = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(backup) || !backup.every(isTask)) throw new Error("Your backup is invalid. It has not been changed.");
      let key = localStorage.getItem("deadline-desk.migration-key.v1");
      if (!key) { key = crypto.randomUUID(); localStorage.setItem("deadline-desk.migration-key.v1", key); }
      await apiRequest("/api/tasks/migrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, tasks: backup }) });
      localStorage.setItem("deadline-desk.migration-owner.v1", user.id);
      setLegacyCount(0); setNotice("Browser tasks imported. Your original browser backup is unchanged.");
      await loadTasks();
    } catch (error) { setMigrationError(error instanceof Error ? error.message : "Migration failed. Your browser backup is unchanged; try again."); }
    finally { busy.current = false; setSaving(false); }
  }

  async function signOut() {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try {
      await apiRequest("/auth/signout", { method: "POST" });
      ++accountEpoch.current; ++readSequence.current; setTasks([]); setReady(false); router.replace("/login"); router.refresh();
    } catch (error) { setStorageError(error instanceof Error ? error.message : "Could not sign out."); }
    finally { busy.current = false; setSaving(false); }
  }

  async function importFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    busy.current = true; setSaving(true); ++readSequence.current; setImporting(true);
    setImportMessage("");
    try {
      const result = await apiRequest("/api/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: String(data.get("feed")), source: String(data.get("source")) }),
        signal: AbortSignal.timeout(20000),
      });
      if (typeof result.count !== "number" || !Array.isArray(result.warnings)) throw new Error("Could not confirm this import.");
      setImportMessage(`Imported or refreshed ${result.count} tasks.${result.warnings.length ? " " + result.warnings.join(" ") : ""}`);
      await loadTasks();
      setCategory("All");
      form.reset(); // Do not retain private feed tokens in the form or storage.
    } catch (error) {
      setImportMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Import timed out. Try again.");
    } finally { busy.current = false; setSaving(false); setImporting(false); }
  }

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-700">Personal workspace</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Deadline desk</h1>
        <p className="mt-3 text-slate-600">Homework, applications, and everything due next.</p></div>
      <div className="flex flex-wrap items-center gap-3"><p className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600">{user.email} · Saved to your account</p><button type="button" disabled={saving} className="text-sm text-blue-700 underline" onClick={signOut}>Sign out</button></div>
    </header>
    {storageError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">{storageError}</p>}
    {migrationError && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-amber-900">{migrationError}</p>}
    {legacyCount > 0 && <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4"><h2 className="font-semibold">Bring your browser tasks into this account</h2><p className="my-2">Import {legacyCount} saved tasks to {user.email}. Existing account tasks and your browser backup will be preserved.</p><button type="button" disabled={!ready || saving} className={button} onClick={migrateBackup}>Import browser tasks</button></section>}
    <section aria-label="Deadline summary" className="mb-8 grid grid-cols-3 gap-3">
      {[{ label: "Active tasks", value: active.length }, { label: "Due within 48h", value: urgent },
        { label: "Overdue", value: overdue }].map(item => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <p className="text-sm text-slate-600">{item.label}</p><p className="mt-2 text-3xl font-semibold">{item.value}</p></div>)}
    </section>
    <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-5 text-xl font-semibold">Add a task</h2>
          <form onSubmit={addTask} className="space-y-4">
            <label className="block">Task name<input className={`${control} mt-1.5`} name="name" required maxLength={200} placeholder="e.g. Problem set 4" /></label>
            <label className="block">Due date and time<input className={`${control} mt-1.5`} name="dueAt" type="datetime-local" required /></label>
            <p className="text-sm text-slate-500">Times use your browser’s timezone{ready ? ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : ""}.</p>
            <label className="block">Category<select className={`${control} mt-1.5`} name="category">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="block">Useful URLs <span className="text-sm text-slate-500">(optional)</span><textarea className={`${control} mt-1.5`} name="urls" rows={2} placeholder="https://…" /></label>
            {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
            <button className={`${button} w-full`} disabled={!ready || saving} type="submit">{saving && !importing ? "Saving…" : "Add task"}</button>
            <p role="status" className="text-sm text-slate-600">{notice}</p>
          </form>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xl font-semibold">Import a calendar</h2>
          <p className="mb-4 text-sm text-slate-600">Paste a private ICS feed URL. Import again to refresh deadlines and keep your statuses.</p>
          <form onSubmit={importFeed} className="space-y-4">
            <label className="block">Source<select name="source" className={`${control} mt-1.5`}><option>Canvas</option><option>Gradescope</option></select></label>
            <label className="block">Calendar feed URL<input name="feed" className={`${control} mt-1.5`} type="text" required maxLength={4096} placeholder="https://…/calendar.ics" autoComplete="off" spellCheck={false} /></label>
            <button className={`${button} w-full`} type="submit" disabled={!ready || saving}>{importing ? "Importing…" : "Import feed"}</button>
            <p role="status" className="text-sm text-slate-600">{importMessage}</p>
          </form>
          <p className="mt-3 text-sm text-slate-500">Gradescope requires an available ICS feed from your institution or an exporter. A course page URL will not work.</p>
        </section>
      </aside>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Your tasks">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Your deadlines <span className="text-base font-normal text-slate-500">({visible.length})</span></h2>
          <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="View">
            {(["list", "calendar"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
              className={`rounded-md px-4 py-2 capitalize ${view === mode ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}>{mode}</button>)}
          </div>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-slate-200 pb-5">
          <label className="flex items-center gap-2">Category<select className="rounded-lg border border-slate-300 p-2" value={category} onChange={e => setCategory(e.target.value as Category | "All")}><option>All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} className="h-4 w-4 accent-slate-900" />Hide done</label>
          {view === "list" && <label className="flex items-center gap-2">Sort<select className="rounded-lg border border-slate-300 p-2" value={ascending ? "nearest" : "latest"} onChange={e => setAscending(e.target.value === "nearest")}><option value="nearest">Nearest first</option><option value="latest">Latest first</option></select></label>}
        </div>
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Category colors">{CATEGORIES.map(c => <span key={c} className={`rounded-md border px-2.5 py-1 text-sm ${CATEGORY_STYLE[c]}`}>{c}</span>)}</div>
        {!ready ? <div><p role="status">{storageError ? "Tasks could not be loaded." : "Loading your account tasks…"}</p>{storageError && <button type="button" className="mt-3 text-blue-700 underline" onClick={() => void loadTasks()}>Retry</button>}</div> : view === "calendar" ?
          <CalendarView tasks={visible} now={now} onStatusChange={changeStatus} disabled={saving} /> :
          visible.length === 0 ? <div className="py-16 text-center text-slate-500"><p className="text-lg font-medium text-slate-700">No tasks in this view</p><p className="mt-2">Add a task, import a feed, or adjust your filters.</p></div> :
          <ul className="space-y-3">{visible.map(task => {
            const flag = urgency(task, now);
            return <li key={task.id} className={`rounded-lg border p-4 ${flag.urgent ? "border-red-300 bg-red-50/60" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><h3 className={`break-words text-lg font-semibold ${task.status === "Submitted/Done" ? "text-slate-500 line-through" : "text-slate-900"}`}>{task.name}</h3>
                  <p className="mt-1 text-slate-600"><time dateTime={task.dueAt}>{task.allDay ? `${taskDay(task)} · all day (time unspecified)` : new Date(task.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p>
                </div>
                <span className={`rounded-md px-2 py-1 text-sm font-semibold ${flag.urgent ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>{flag.text}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className={`rounded-md border px-2 py-1 text-sm ${CATEGORY_STYLE[task.category]}`}>{task.category}</span>
                <span className="text-sm text-slate-500">{task.source}</span>
                <label className="ml-auto flex items-center gap-2"><span className="sr-only">Status for {task.name}</span><select disabled={saving} aria-label={`Status for ${task.name}`} value={task.status} onChange={e => changeStatus(task.id, e.target.value as Status)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
              </div>
              {task.urls.length > 0 && <div className="mt-3 flex flex-wrap gap-4">{task.urls.map((url, index) => <a key={`${url}-${index}`} href={safeUrl(url) || undefined} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-blue-700 underline">{new URL(url).hostname}{task.urls.length > 1 ? ` (${index + 1})` : ""}</a>)}</div>}
            </li>;
          })}</ul>}
      </section>
    </div>
  </main>;
}
