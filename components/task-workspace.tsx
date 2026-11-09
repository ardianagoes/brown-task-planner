"use client";
import { useId, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_STYLE, type Category, type Status, type Task } from "@/lib/tasks";
import { tasksForView, type TaskTab } from "@/lib/task-workflow";
import CalendarView from "./calendar-view";
import TaskRow from "./task-row";
import type { WorkspaceSection } from "./workspace-shell";
import { localDay, taskDay } from "@/lib/tasks";

export default function TaskWorkspace({ tasks, now, ready, saving, category, onCategoryChange, onStatusChange, onDeleteTask, onEditTask, onRetry, hasError, section, onSectionChange }: {
  tasks: Task[]; now: number; ready: boolean; saving: boolean; category: Category | "All";
  onCategoryChange: (category: Category | "All") => void;
  onStatusChange: (id: string, status: Status) => void; onRetry: () => void; hasError: boolean;
  onDeleteTask: (id: string) => Promise<void>;
  onEditTask: (task: Task) => Promise<void>;
  section?: WorkspaceSection; onSectionChange?: (section: WorkspaceSection) => void;
}) {
  const [internalSection, setInternalSection] = useState<WorkspaceSection>("upcoming");
  const destination = section || internalSection;
  const navigate = onSectionChange || setInternalSection;
  const view = destination === "calendar" ? "calendar" : "list";
  const tab: TaskTab = destination === "completed" ? "completed" : "active";
  const setView = (mode: "list" | "calendar") => navigate(mode === "calendar" ? "calendar" : "upcoming");
  const setTab = (mode: TaskTab) => navigate(mode === "completed" ? "completed" : "upcoming");
  const [ascending, setAscending] = useState(true);
  const id = useId();
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const listPanel = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => tasksForView(tasks, view, tab, category, ascending).filter(task => destination !== "today" || taskDay(task) === localDay(new Date(now))), [tasks, view, tab, category, ascending, destination, now]);
  const counts = { active: tasksForView(tasks, "list", "active", category).length,
    completed: tasksForView(tasks, "list", "completed", category).length };
  const tabs: TaskTab[] = ["active", "completed"];
  return <section className="panel min-w-0 p-4 sm:p-5" aria-label="Your tasks">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="eyebrow">Your workspace</p><h2 className="mt-1 text-xl font-semibold">Deadlines</h2></div>
      <div className="flex rounded-lg border border-slate-800 bg-slate-950/50 p-1" role="group" aria-label="View">
        {(["list", "calendar"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
          className={`rounded-md px-4 py-2 text-sm capitalize transition-colors ${view === mode ? "bg-slate-700 font-medium text-white" : "text-slate-400 hover:text-slate-100"}`}>{mode}</button>)}
      </div>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-300">Category<select className="control w-auto py-2" value={category}
        onChange={event => onCategoryChange(event.target.value as Category | "All")}><option>All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      {view === "list" && <label className="flex items-center gap-2 text-sm text-slate-300">Sort<select className="control w-auto py-2" value={ascending ? "nearest" : "latest"}
        onChange={event => setAscending(event.target.value === "nearest")}><option value="nearest">Nearest first</option><option value="latest">Latest first</option></select></label>}
    </div>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Category colors">{CATEGORIES.map(c =>
      <span key={c} className={`rounded-md border px-2 py-0.5 text-xs ${CATEGORY_STYLE[c]}`}>{c}</span>)}</div>
    {view === "list" && <div className="mb-4 flex gap-1 border-b border-slate-800" role="tablist" aria-label="Task completion">
      {tabs.map((mode, index) => <button key={mode} type="button" role="tab" id={`${id}-${mode}`} aria-selected={tab === mode} aria-controls={`${id}-panel`}
        tabIndex={tab === mode ? 0 : -1} ref={element => { tabButtons.current[index] = element; }}
        onClick={() => setTab(mode)} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
          setTab(tabs[next]); tabButtons.current[next]?.focus();
        }} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === mode ? "border-blue-400 text-blue-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
        {mode === "active" ? "Active" : "Completed"}<span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs tabular-nums">{ready ? counts[mode] : "—"}</span>
      </button>)}
    </div>}
    <div ref={listPanel} id={view === "list" ? `${id}-panel` : undefined} role={view === "list" ? "tabpanel" : undefined}
      aria-labelledby={view === "list" ? `${id}-${tab}` : undefined} tabIndex={view === "list" ? 0 : undefined}>
      {!ready ? <div className="py-12 text-center"><p role="status" className="text-slate-400">{hasError ? "Tasks could not be loaded." : "Loading your account tasks…"}</p>
        {hasError && <button type="button" className="button-secondary mt-4" onClick={onRetry}>Retry</button>}</div> : view === "calendar" ?
        <CalendarView tasks={visible} allTasks={tasks} now={now} onStatusChange={onStatusChange} onDeleteTask={onDeleteTask} onEditTask={onEditTask} disabled={saving} /> :
        visible.length === 0 ? <div className="rounded-xl border border-dashed border-slate-800 px-4 py-14 text-center">
          <p className="font-medium text-slate-200">{tab === "active" ? "You’re all caught up" : "No completed tasks in this view"}</p>
          <p className="mt-2 text-sm text-slate-400">{tab === "active" ? "Add a deadline, import a feed, or choose another category." : "Finished tasks stay here, with their dates and useful links."}</p>
        </div> : <ul className="space-y-3">{visible.map(task => <li key={task.id}>
          <TaskRow task={task} tasks={tasks} onEditTask={onEditTask} now={now} disabled={saving} onStatusChange={onStatusChange}
            onDeleteTask={async id => { await onDeleteTask(id); listPanel.current?.focus(); }} />
        </li>)}</ul>}
    </div>
  </section>;
}
