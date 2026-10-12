"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { deadlineMillis, isTask, type Category, type Status, type Task } from "@/lib/tasks";
import { parseExtraction, validCalendarDate, validTimezone } from "@/lib/assignment-draft";
import { taskChanges } from "@/lib/task-editing";
import TaskWorkspace from "./task-workspace";
import TaskCreator from "./task-creator";

const STORAGE_KEY = "deadline-desk.tasks.v1";
const control = "control";
const button = "button-primary";

export default function Dashboard({ user, timezone }: { user: { id: string; email: string }; timezone: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const readSequence = useRef(0);
  const accountEpoch = useRef(0);
  const [legacyCount, setLegacyCount] = useState(0);
  const [migrationError, setMigrationError] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [now, setNow] = useState(0);
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

  const active = tasks.filter(task => task.status !== "Submitted/Done");
  const urgent = active.filter(task => {
    const delta = deadlineMillis(task) - now;
    return delta >= 0 && delta <= 48 * 3600000;
  }).length;
  const overdue = active.filter(task => deadlineMillis(task) < now).length;

  async function analyzeScreenshot(file: File, signal: AbortSignal) {
    const body = new FormData(); body.set("image", file);
    const result = await apiRequest("/api/tasks/extract-image", { method: "POST", body, signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
    const extraction = result.extraction;
    if (!extraction || !validCalendarDate(extraction.referenceDate) || !validTimezone(extraction.referenceTimezone)) throw new Error("Could not validate the detected task details.");
    return parseExtraction({ candidates: extraction.candidates, notes: extraction.notes }, extraction.referenceDate, extraction.referenceTimezone);
  }

  async function editTask(task: Task) {
    if (busy.current) throw new Error("Another save is in progress. Try again.");
    if (!isTask(task)) throw new Error("Check the edited task details.");
    busy.current = true; setSaving(true); ++readSequence.current;
    try {
      const result = await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taskChanges(task)) });
      if (!isTask(result.task) || result.task.id !== task.id || result.task.source !== task.source) throw new Error("Could not confirm the task changes.");
      setTasks(previous => previous.map(item => item.id === task.id ? result.task : item)); setStorageError("");
    } finally { busy.current = false; setSaving(false); }
  }

  async function saveCreatedTask(task: Task) {
    if (busy.current) throw new Error("Another save is in progress. Try again.");
    if (!isTask(task) || task.source !== "Manual" || task.status !== "To Do") throw new Error("Check the task details before saving.");
    busy.current = true; setSaving(true); ++readSequence.current;
    try {
      const result = await apiRequest("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) });
      if (!isTask(result.task) || result.task.id !== task.id) throw new Error("Could not confirm the task save.");
      setTasks(previous => [...previous.filter(item => item.id !== result.task.id), result.task]);
      setCategory("All"); setStorageError("");
    }
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

  async function deleteTask(id: string) {
    if (busy.current) throw new Error("Another save is in progress. Try again.");
    busy.current = true; setSaving(true); ++readSequence.current;
    try {
      const result = await apiRequest(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (result.deletedId !== id) throw new Error("Could not confirm the task deletion.");
      setTasks(previous => previous.filter(task => task.id !== id));
      setStorageError("");
    } finally { busy.current = false; setSaving(false); }
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
      if (!Number.isInteger(result.count) || !Number.isInteger(result.skippedPast) || !Array.isArray(result.warnings)) throw new Error("Could not confirm this import.");
      setImportMessage(`Imported or refreshed ${result.count} assignments.${result.skippedPast ? ` Skipped ${result.skippedPast} past assignments.` : ""}${result.warnings.length ? " " + result.warnings.join(" ") : ""}`);
      await loadTasks();
      setCategory("All");
      form.reset(); // Do not retain private feed tokens in the form or storage.
    } catch (error) {
      setImportMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Import timed out. Try again.");
    } finally { busy.current = false; setSaving(false); setImporting(false); }
  }

  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
      <div><p className="eyebrow">Personal workspace</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Deadline desk</h1>
        <p className="mt-2 text-sm text-slate-400">Homework, applications, and everything due next.</p></div>
      <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
        <div><p className="max-w-60 truncate text-xs text-slate-300">{user.email}</p><p className="mt-0.5 text-[11px] text-slate-400">Saved to your account</p></div>
        <button type="button" disabled={saving} className="button-secondary" onClick={signOut}>Sign out</button>
      </div>
    </header>
    {storageError && <p role="alert" className="alert-error mb-4">{storageError}</p>}
    {migrationError && <p role="alert" className="alert-info mb-4">{migrationError}</p>}
    {notice && <p role="status" className="alert-info mb-4">{notice}</p>}
    {legacyCount > 0 && <section className="alert-info mb-5"><h2 className="font-semibold">Bring your browser tasks into this account</h2>
      <p className="my-2">Import {legacyCount} saved tasks to {user.email}. Existing account tasks and your browser backup will be preserved.</p>
      <button type="button" disabled={!ready || saving} className={button} onClick={migrateBackup}>Import browser tasks</button></section>}
    <section aria-label="Deadline summary" className="mb-6 grid grid-cols-3 gap-3">
      {[{ label: "Active tasks", value: active.length }, { label: "Due within 48h", value: urgent },
        { label: "Overdue", value: overdue }].map(item => <div key={item.label} className="panel px-3 py-4 sm:px-5">
        <p className="text-xs text-slate-400">{item.label}</p><p className={`mt-1.5 text-2xl font-semibold tabular-nums ${item.label !== "Active tasks" && item.value > 0 ? "text-red-300" : "text-slate-100"}`}>{ready ? item.value : "—"}</p></div>)}
    </section>
    <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-5">
        <TaskCreator tasks={tasks} disabled={!ready || saving} timezone={timezone} onAnalyze={analyzeScreenshot} onSaveTask={saveCreatedTask} />
        <section className="panel p-4 sm:p-5">
          <h2 className="mb-2 text-base font-semibold">Import a calendar</h2>
          <p className="mb-4 text-xs leading-relaxed text-slate-400">New Canvas assignments start today. Import again to refresh deadlines and keep your statuses.</p>
          <form onSubmit={importFeed} className="space-y-3 text-sm text-slate-300">
            <label className="block">Source<select name="source" className={`${control} mt-1.5`}><option>Canvas</option><option>Gradescope</option></select></label>
            <label className="block">Private calendar feed URL<input name="feed" className={`${control} mt-1.5`} type="text" required maxLength={4096} placeholder="https://…/calendar.ics" autoComplete="off" spellCheck={false} /></label>
            <button className={`${button} w-full`} type="submit" disabled={!ready || saving}>{importing ? "Importing…" : "Import feed"}</button>
            {importMessage && <p role="status" className="text-xs leading-relaxed text-slate-300">{importMessage}</p>}
          </form>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">Gradescope needs an ICS feed from your institution or an exporter. A course page URL will not work.</p>
        </section>
      </aside>
      <TaskWorkspace tasks={tasks} onEditTask={editTask} now={now} ready={ready} saving={saving} category={category} onCategoryChange={setCategory}
        onStatusChange={changeStatus} onDeleteTask={deleteTask} hasError={Boolean(storageError)} onRetry={() => void loadTasks()} />
    </div>
  </main>;
}
