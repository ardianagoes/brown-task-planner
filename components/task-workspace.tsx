"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, CalendarDays, CheckCheck, List, ListFilter, Plus, Sparkles } from "lucide-react";
import { CATEGORIES, deadlineMillis, localDay, taskDay, type Category, type Status, type Task } from "@/lib/tasks";
import { tasksForView, type TaskTab } from "@/lib/task-workflow";
import type { WorkspaceSection } from "./workspace-shell";
import { groupAgenda } from "./agenda-groups";
import CalendarView from "./calendar-view";
import TaskRow from "./task-row";
import UpcomingPanel from "./upcoming-panel";

export default function TaskWorkspace({ tasks, now, ready, saving, category, onCategoryChange, onStatusChange, onDeleteTask, onEditTask, onRetry, hasError, section, onSectionChange, onCreate }: {
  tasks: Task[]; now: number; ready: boolean; saving: boolean; category: Category | "All";
  onCategoryChange: (category: Category | "All") => void; onStatusChange: (id: string, status: Status) => void;
  onRetry: () => void; hasError: boolean; onDeleteTask: (id: string) => Promise<void>; onEditTask: (task: Task) => Promise<void>;
  section?: WorkspaceSection; onSectionChange?: (section: WorkspaceSection) => void; onCreate?: () => void;
}) {
  const [internalSection, setInternalSection] = useState<WorkspaceSection>("upcoming"), [ascending, setAscending] = useState(true);
  const destination = section || internalSection, navigate = onSectionChange || setInternalSection;
  const view = destination === "calendar" ? "calendar" : "list", tab: TaskTab = destination === "completed" ? "completed" : "active";
  const id = useId(), tabButtons = useRef<(HTMLButtonElement | null)[]>([]), listPanel = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const visible = useMemo(() => tasksForView(tasks, view, tab, category, ascending).filter(task => destination !== "today" || taskDay(task) === localDay(new Date(now))), [tasks, view, tab, category, ascending, destination, now]);
  const groups = useMemo(() => groupAgenda(visible, now, ascending, tab === "completed"), [visible, now, ascending, tab]);
  const counts = { active: tasksForView(tasks, "list", "active", category).length, completed: tasksForView(tasks, "list", "completed", category).length };
  const active = tasks.filter(task => task.status !== "Submitted/Done" && (category === "All" || task.category === category));
  const urgent = active.filter(task => { const delta = deadlineMillis(task) - now; return delta >= 0 && delta <= 48 * 3600000; }).length;
  const overdue = active.filter(task => deadlineMillis(task) < now).length;
  const tabs: TaskTab[] = ["active", "completed"];
  useEffect(() => {
    if (!pendingFocus.current) return;
    if (!visible.some(task => task.id === pendingFocus.current) && document.activeElement === document.body) listPanel.current?.focus();
    pendingFocus.current = null;
  }, [visible]);
  const changeStatus = (taskId: string, status: Status) => { pendingFocus.current = taskId; onStatusChange(taskId, status); };
  const titles = { today: "Today", upcoming: "Upcoming", calendar: "Your calendar", completed: "Completed" };
  return <section className="task-workspace" aria-label="Your tasks">
    <header className="workspace-heading"><div><p className="workspace-date">{ready ? new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Your personal workspace"}</p>
      <h1>{titles[destination]}<span className="heading-dot" aria-hidden="true" /></h1><p>{destination === "today" ? "A little focus for the day ahead." : destination === "completed" ? "A record of everything you’ve moved forward." : destination === "calendar" ? "The big picture, one day at a time." : "Everything coming up. Nothing slipping through."}</p>
      <div aria-label="Deadline summary" className="deadline-summary"><span><strong>{ready ? counts.active : "—"}</strong> active</span><span><strong>{ready ? urgent : "—"}</strong> due within 48h</span><span className={ready && overdue > 0 ? "text-red-300" : ""}><strong>{ready ? overdue : "—"}</strong> overdue</span></div></div>
      <div className="view-switch" role="group" aria-label="View">{(["list", "calendar"] as const).map(mode => {
        const Icon = mode === "list" ? List : CalendarDays;
        return <button key={mode} type="button" aria-label={`${mode === "list" ? "List" : "Calendar"} view`} aria-pressed={view === mode} onClick={() => navigate(mode === "calendar" ? "calendar" : "upcoming")}><Icon size={14} aria-hidden="true" />{mode}</button>;
      })}</div>
    </header>
    <div className={`workspace-columns ${view === "calendar" || destination === "completed" ? "full-width" : ""}`}><div className="agenda-workspace">
      <div className="agenda-toolbar">
        {view === "list" ? <div className="completion-tabs" role="tablist" aria-label="Task completion">{tabs.map((mode, index) => <button key={mode} type="button" role="tab" id={`${id}-${mode}`} aria-selected={tab === mode} aria-controls={`${id}-panel`}
          tabIndex={tab === mode ? 0 : -1} ref={element => { tabButtons.current[index] = element; }} onClick={() => navigate(mode === "completed" ? "completed" : "upcoming")}
          onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
            navigate(tabs[next] === "completed" ? "completed" : "upcoming"); tabButtons.current[next]?.focus(); }}>
          {mode === "active" ? "Active" : "Completed"}<span>{ready ? counts[mode] : "—"}</span></button>)}</div> : <p className="calendar-legend">All statuses · category colors</p>}
        <div className="agenda-filters"><label className="filter-control"><ListFilter size={13} aria-hidden="true" /><span className="sr-only">Category</span><select value={category} onChange={event => onCategoryChange(event.target.value as Category | "All")}><option value="All">All categories</option>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
          {view === "list" && <label className="filter-control"><ArrowDownWideNarrow size={13} aria-hidden="true" /><span className="sr-only">Sort</span><select value={ascending ? "nearest" : "latest"} onChange={event => setAscending(event.target.value === "nearest")}><option value="nearest">Nearest first</option><option value="latest">Latest first</option></select></label>}
        </div>
      </div>
      <div ref={listPanel} id={view === "list" ? `${id}-panel` : undefined} role={view === "list" ? "tabpanel" : undefined} aria-labelledby={view === "list" ? `${id}-${tab}` : undefined} tabIndex={view === "list" ? 0 : -1} aria-busy={!ready || saving} className="task-list">
        {!ready ? <div className="workspace-loading"><p role="status">{hasError ? "Tasks could not be loaded." : "Loading your deadlines…"}</p>
          {hasError ? <button type="button" className="button-secondary mt-4" onClick={onRetry}>Retry</button> : <div className="skeleton-rows" aria-hidden="true">{[1, 2, 3, 4].map(item => <div key={item}><i /><span /><small /></div>)}</div>}</div> :
          view === "calendar" ? <CalendarView tasks={visible} allTasks={tasks} now={now} onStatusChange={changeStatus} onDeleteTask={onDeleteTask} onEditTask={onEditTask} disabled={saving} /> :
          visible.length === 0 ? <div className="workspace-empty"><span className="empty-icon">{tab === "completed" ? <CheckCheck size={23} aria-hidden="true" /> : <Sparkles size={23} aria-hidden="true" />}</span>
            <h2>{tab === "completed" ? "Your progress will live here" : destination === "today" ? "A clear day ahead" : "A little room to breathe"}</h2>
            <p>{tab === "completed" ? "Completed tasks stay here, along with their dates and useful links." : category !== "All" ? "No active deadlines in this category. Try another filter or add a task." : destination === "today" ? "Nothing is due today. Check Upcoming for what’s next." : "Add your first deadline, or connect a calendar feed in Settings."}</p>
            {tab === "active" && onCreate && <button type="button" className="button-secondary" disabled={saving} onClick={onCreate}><Plus size={14} aria-hidden="true" />Add a task</button>}
          </div> : groups.map(group => <section key={group.label} className="agenda-group" aria-label={group.label}><header className="agenda-group-heading"><h2 className={group.label === "Overdue" ? "text-red-300" : ""}>{group.label}</h2><span>{group.tasks.length}</span><div /></header>
            <ul>{group.tasks.map(task => <li key={task.id}><TaskRow task={task} tasks={tasks} onEditTask={onEditTask} now={now} disabled={saving} onStatusChange={changeStatus} onDeleteTask={async taskId => { await onDeleteTask(taskId); listPanel.current?.focus(); }} /></li>)}</ul>
          </section>)}
      </div>
      <p className="agenda-timezone">Times use your browser timezone. All-day tasks have no specified due time.</p>
    </div>{view === "list" && destination !== "completed" && <UpcomingPanel tasks={tasks.filter(task => category === "All" || task.category === category)} now={now} ready={ready} disabled={saving} onEditTask={onEditTask} onCalendar={() => navigate("calendar")} />}</div>
  </section>;
}
