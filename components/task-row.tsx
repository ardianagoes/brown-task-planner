"use client";
import { useId } from "react";
import { CATEGORY_STYLE, safeUrl, taskDay, urgency, type Status, type Task } from "@/lib/tasks";
import TaskStatusControls from "./task-status-controls";

export default function TaskRow({ task, now, disabled, onStatusChange, variant = "list" }: {
  task: Task; now: number; disabled?: boolean; onStatusChange: (id: string, status: Status) => void;
  variant?: "list" | "calendar";
}) {
  const heading = useId();
  const flag = urgency(task, now);
  const completed = task.status === "Submitted/Done";
  const completedCalendar = completed && variant === "calendar";
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
      <div className="ml-auto"><TaskStatusControls task={task} disabled={disabled} onStatusChange={onStatusChange} /></div>
    </div>
    {task.urls.length > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{task.urls.map((url, index) =>
      <a key={`${url}-${index}`} href={safeUrl(url) || undefined} target="_blank" rel="noopener noreferrer" className="link break-all text-sm">
        {new URL(url).hostname}{task.urls.length > 1 ? ` (${index + 1})` : ""}
      </a>)}</div>}
  </article>;
}
