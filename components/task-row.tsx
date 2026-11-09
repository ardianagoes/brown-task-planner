"use client";
import { useId, useRef, useState } from "react";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { safeUrl, taskDay, urgency, type Status, type Task } from "@/lib/tasks";
import TaskStatusControls from "./task-status-controls";
import TaskEditDialog from "./task-edit-dialog";

export default function TaskRow({ task, tasks, now, disabled, onStatusChange, onDeleteTask, onEditTask, variant = "list" }: {
  task: Task; now: number; disabled?: boolean; onStatusChange: (id: string, status: Status) => void;
  variant?: "list" | "calendar"; onDeleteTask: (id: string) => Promise<void>;
  tasks: readonly Task[]; onEditTask: (task: Task) => Promise<void>;
}) {
  const heading = useId(), flag = urgency(task, now), completed = task.status === "Submitted/Done";
  const [confirmingDelete, setConfirmingDelete] = useState(false), [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState("");
  const deleteButton = useRef<HTMLButtonElement>(null), unavailable = disabled || deleting;
  const date = new Date(task.allDay ? `${taskDay(task)}T12:00:00` : task.dueAt);
  async function confirmDelete() {
    if (unavailable) return;
    setDeleting(true); setDeleteError("");
    try { await onDeleteTask(task.id); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : "Could not delete this task. Try again."); }
    finally { setDeleting(false); }
  }
  return <article data-task-id={task.id} data-completed={completed} data-variant={variant} tabIndex={-1} aria-labelledby={heading} className="task-row">
    <div className="task-copy"><h3 id={heading} className="task-title"><button type="button" disabled={unavailable} onClick={() => setEditing(true)} title={task.name}>{task.name}</button></h3>
      <div className="row-meta"><span className="category-label"><span className="category-dot" data-category={task.category} />{task.category}</span><span className="task-source">{task.source}</span>
        {task.urls.length === 1 && <a href={safeUrl(task.urls[0]) || undefined} target="_blank" rel="noopener noreferrer" className="task-link" title={task.urls[0]}>{new URL(task.urls[0]).hostname}<ArrowUpRight size={11} aria-hidden="true" /></a>}
        {task.urls.length > 1 && <details className="task-links"><summary>{task.urls.length} useful links</summary><div>{task.urls.map((url, index) => <a key={`${url}-${index}`} href={safeUrl(url) || undefined} target="_blank" rel="noopener noreferrer">{new URL(url).hostname} ({index + 1})<ArrowUpRight size={11} aria-hidden="true" /></a>)}</div></details>}
      </div>
    </div>
    <div className="task-deadline"><time dateTime={task.dueAt} className="task-due" title={task.allDay ? "All day · time unspecified" : date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}>
      <span>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span>{task.allDay ? "All day" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
    </time>{flag.urgent && <span className="urgency-label">{flag.text}</span>}</div>
    <TaskStatusControls task={task} disabled={unavailable} onStatusChange={onStatusChange} />
    <div className="row-actions"><button type="button" disabled={unavailable} aria-label={`Edit ${task.name}`} title="Edit task" className="icon-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /></button>
      <button ref={deleteButton} type="button" disabled={unavailable} aria-label={`Delete ${task.name}`} title="Delete task" className="icon-button delete-action" onClick={() => { setConfirmingDelete(true); setDeleteError(""); }}><Trash2 size={14} aria-hidden="true" /></button></div>
    {editing && <TaskEditDialog task={task} tasks={tasks} disabled={unavailable} onSave={onEditTask} onClose={() => setEditing(false)} />}
    {confirmingDelete && <div role="group" aria-label={`Confirm deletion of ${task.name}`} className="row-delete-confirmation">
      <p>Permanently delete this task? This cannot be undone.</p>
      {task.source !== "Manual" && <p className="mt-1 text-xs text-slate-400">It may return if you import its calendar feed again.</p>}
      <div className="mt-3 flex gap-2"><button type="button" autoFocus disabled={unavailable} className="button-secondary" onClick={() => { setConfirmingDelete(false); setDeleteError(""); deleteButton.current?.focus(); }}>Cancel</button>
        <button type="button" disabled={unavailable} aria-label={`Confirm delete ${task.name}`} className="button-secondary delete-confirm" onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete task"}</button></div>
      {deleteError && <p role="alert" className="mt-2 text-sm text-red-300">{deleteError}</p>}
    </div>}
  </article>;
}
