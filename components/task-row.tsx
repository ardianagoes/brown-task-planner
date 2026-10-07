"use client";
import { useId, useRef, useState } from "react";
import { CATEGORY_STYLE, safeUrl, taskDay, urgency, type Status, type Task } from "@/lib/tasks";
import TaskStatusControls from "./task-status-controls";

export default function TaskRow({ task, now, disabled, onStatusChange, onDeleteTask, variant = "list" }: {
  task: Task; now: number; disabled?: boolean; onStatusChange: (id: string, status: Status) => void;
  variant?: "list" | "calendar";
  onDeleteTask: (id: string) => Promise<void>;
}) {
  const heading = useId();
  const flag = urgency(task, now);
  const completed = task.status === "Submitted/Done";
  const completedCalendar = completed && variant === "calendar";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteButton = useRef<HTMLButtonElement>(null);
  const unavailable = disabled || deleting;
  async function confirmDelete() {
    if (unavailable) return;
    setDeleting(true); setDeleteError("");
    try { await onDeleteTask(task.id); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : "Could not delete this task. Try again."); }
    finally { setDeleting(false); }
  }
  return <article data-task-id={task.id} tabIndex={-1} aria-labelledby={heading}
    className={`task-row rounded-xl border p-4 ${flag.urgent ? "border-red-900/70 bg-red-950/10" : "border-slate-800 bg-slate-900/40"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h3 id={heading} className={`break-words text-base font-semibold ${completed ? "text-slate-400 line-through" : "text-slate-100"}`}>{task.name}</h3>
        <p className={`mt-1 text-sm text-slate-400 ${completedCalendar ? "line-through" : ""}`}><time dateTime={task.dueAt}>
          {task.allDay ? `${taskDay(task)} · all day (time unspecified)` : new Date(task.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </time></p>
      </div>
      <span className={`rounded-md px-2 py-1 text-xs font-medium ${flag.urgent ? "bg-red-950/70 text-red-300" : "bg-slate-800 text-slate-300"}`}>{flag.text}</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`rounded-md border px-2 py-0.5 text-xs ${CATEGORY_STYLE[task.category]} ${completedCalendar ? "saturate-50 opacity-60" : ""}`}>{task.category}</span>
      <span className="text-xs text-slate-400">{task.source}</span>
      <div className="ml-auto"><TaskStatusControls task={task} disabled={unavailable} onStatusChange={onStatusChange} /></div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">{task.urls.map((url, index) =>
      <a key={`${url}-${index}`} href={safeUrl(url) || undefined} target="_blank" rel="noopener noreferrer" className="link break-all text-sm">
        {new URL(url).hostname}{task.urls.length > 1 ? ` (${index + 1})` : ""}
      </a>)}
      <button ref={deleteButton} type="button" disabled={unavailable} aria-label={`Delete ${task.name}`}
        className="ml-auto min-h-9 rounded-md px-2 text-xs text-slate-400 hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
        onClick={() => { setConfirmingDelete(true); setDeleteError(""); }}>Delete</button>
    </div>
    {confirmingDelete && <div role="group" aria-label={`Confirm deletion of ${task.name}`}
      className="mt-3 rounded-lg border border-red-900/60 bg-red-950/10 p-3">
      <p className="text-sm text-slate-200">Permanently delete this task? This cannot be undone.</p>
      {task.source !== "Manual" && <p className="mt-1 text-xs text-slate-400">It may return if you import its calendar feed again.</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" autoFocus disabled={unavailable} className="button-secondary"
          onClick={() => { setConfirmingDelete(false); setDeleteError(""); deleteButton.current?.focus(); }}>Cancel</button>
        <button type="button" disabled={unavailable} aria-label={`Confirm delete ${task.name}`}
          className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete task"}</button>
      </div>
      {deleteError && <p role="alert" className="mt-2 text-sm text-red-300">{deleteError}</p>}
    </div>}
  </article>;
}
