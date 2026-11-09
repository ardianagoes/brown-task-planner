"use client";
import { useEffect, useId, useRef } from "react";
import type { Status, Task } from "@/lib/tasks";
import TaskRow from "./task-row";
import { trapDialogTab } from "./dialog-focus";

export default function CalendarDayDetails({ day, tasks, allTasks, now, initialTaskId, disabled, onClose, onStatusChange, onDeleteTask, onEditTask }: {
  day: string; tasks: Task[]; now: number; initialTaskId?: string; disabled?: boolean;
  onClose: () => void; onStatusChange: (id: string, status: Status) => void;
  onDeleteTask: (id: string) => Promise<void>;
  allTasks: readonly Task[]; onEditTask: (task: Task) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!element) return;
    element.showModal();
    if (initialTaskId) {
      const selected = [...element.querySelectorAll<HTMLElement>("[data-task-id]")]
        .find(row => row.dataset.taskId === initialTaskId);
      selected?.focus();
    }
    return () => { element.close(); if (opener?.isConnected) opener.focus(); };
  }, [initialTaskId]);
  const date = new Date(`${day}T12:00:00`);
  return <dialog ref={dialog} aria-labelledby={title} aria-describedby={description} tabIndex={-1} onKeyDown={trapDialogTab}
    onClose={() => { if (!dialog.current?.open) onClose(); }}
    className="day-dialog calendar-detail-dialog w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 px-5 py-4">
      <div><h2 id={title} className="text-lg font-semibold">{date.toLocaleDateString(undefined, { dateStyle: "full" })}</h2>
        <p id={description} className="mt-1 text-sm text-slate-400">{tasks.length} {tasks.length === 1 ? "deadline" : "deadlines"} · Times use your browser timezone</p></div>
      <button type="button" className="button-secondary shrink-0" autoFocus onClick={() => dialog.current?.close()} aria-label="Close day details">Close</button>
    </header>
    <div className="task-list px-3 py-2 sm:px-5">
      {tasks.length === 0 ? <p className="p-4 text-slate-400">No deadlines for this day.</p> : tasks.map(task =>
        <TaskRow key={task.id} task={task} tasks={allTasks} onEditTask={onEditTask} now={now} disabled={disabled} onStatusChange={onStatusChange} variant="calendar"
          onDeleteTask={async id => {
            await onDeleteTask(id);
            dialog.current?.querySelector<HTMLButtonElement>('button[aria-label="Close day details"]')?.focus();
          }} />)}
    </div>
    <p className="border-t border-slate-800 px-5 py-3 text-xs text-slate-400">Press Escape to close.</p>
  </dialog>;
}
