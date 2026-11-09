"use client";
import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { CATEGORIES, localDay, urgency, type Status, type Task } from "@/lib/tasks";
import { groupCalendarDays } from "./agenda-groups";
import CalendarDayDetails from "./calendar-day-details";
import TaskRow from "./task-row";

export default function CalendarView({ tasks, allTasks, now, onStatusChange, onDeleteTask, onEditTask, disabled = false }: {
  tasks: Task[]; now: number; onStatusChange: (id: string, status: Status) => void; disabled?: boolean;
  onDeleteTask: (id: string) => Promise<void>; allTasks: readonly Task[]; onEditTask: (task: Task) => Promise<void>;
}) {
  const [month, setMonth] = useState(() => { const date = new Date(now); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [selected, setSelected] = useState<{ day: string; taskId?: string } | null>(null);
  const calendarContainer = useRef<HTMLDivElement>(null), agendaContainer = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => groupCalendarDays(tasks), [tasks]);
  const byDay = useMemo(() => new Map(grouped.map(group => [group.day, group.tasks])), [grouped]);
  const start = new Date(month.getFullYear(), month.getMonth(), 1); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const monthKey = localDay(month).slice(0, 7), agenda = grouped.filter(group => group.day.startsWith(monthKey));
  function moveMonth(delta: number) { setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + delta, 1)); }
  return <div className="calendar-view">
    <div className="calendar-toolbar"><h3 aria-live="polite"><CalendarDays size={16} aria-hidden="true" />{month.toLocaleString(undefined, { month: "long", year: "numeric" })}</h3>
      <div><button type="button" className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} aria-hidden="true" /></button>
        <button type="button" className="calendar-today" onClick={() => { const date = new Date(now); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}>Today</button>
        <button type="button" className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={17} aria-hidden="true" /></button></div>
    </div>
    <div className="calendar-category-key" aria-label="Category colors">{CATEGORIES.map(category => <span key={category}><i className="category-dot" data-category={category} />{category}</span>)}</div>
    <div ref={calendarContainer} className="calendar-desktop" tabIndex={-1} aria-label="Monthly calendar">
      <div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="calendar-weekday">{day}</div>)}
        {days.map(day => {
          const key = localDay(day), dayTasks = byDay.get(key) || [], today = key === localDay(new Date(now));
          return <section key={key} aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })} className={`calendar-cell ${day.getMonth() !== month.getMonth() ? "outside-month" : ""}`}>
            <time className={`calendar-day-number ${today ? "is-today" : ""}`} dateTime={key} aria-current={today ? "date" : undefined}>{day.getDate()}</time>
            <div className="calendar-events">{dayTasks.slice(0, 2).map(task => {
              const flag = urgency(task, now), time = task.allDay ? "All day" : new Date(task.dueAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              const completed = task.status === "Submitted/Done";
              return <button key={task.id} type="button" title={`${time} · ${task.name} · ${flag.text}`} aria-label={`${task.name}, ${time}, ${flag.text}. Open day details`}
                onClick={() => setSelected({ day: key, taskId: task.id })} className="calendar-event" data-category={task.category} data-completed={completed}>
                <span className="category-dot" data-category={task.category} /><span className="calendar-event-copy"><span>{time}</span><strong>{task.name}</strong></span>
                {flag.urgent && <span className="calendar-urgent" aria-label={flag.text} />}
              </button>;
            })}</div>
            {dayTasks.length > 2 && <button type="button" className="calendar-overflow" aria-label={`Show ${dayTasks.length - 2} more deadlines for ${day.toLocaleDateString(undefined, { dateStyle: "full" })}`} onClick={() => setSelected({ day: key })}>+{dayTasks.length - 2} more</button>}
          </section>;
        })}
      </div>
    </div>
    <div ref={agendaContainer} className="calendar-agenda task-list" tabIndex={-1} aria-label="Monthly agenda">
      <p className="mobile-agenda-note">Your month, in agenda view. All statuses are shown.</p>
      {agenda.length === 0 ? <p className="calendar-empty">No deadlines this month. Choose another month or add a task.</p> : agenda.map(group => <section key={group.day} className="agenda-group" aria-label={new Date(`${group.day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}>
        <header className="agenda-group-heading"><h4>{new Date(`${group.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</h4><span>{group.tasks.length}</span><div /></header>
        <ul>{group.tasks.map(task => <li key={task.id}><TaskRow task={task} tasks={allTasks} now={now} disabled={disabled} onStatusChange={onStatusChange} onEditTask={onEditTask} variant="calendar" onDeleteTask={async id => { await onDeleteTask(id); agendaContainer.current?.focus(); }} /></li>)}</ul>
      </section>)}
    </div>
    {selected && <CalendarDayDetails day={selected.day} initialTaskId={selected.taskId} tasks={byDay.get(selected.day) || []} allTasks={allTasks} onEditTask={onEditTask} now={now} disabled={disabled} onStatusChange={onStatusChange} onDeleteTask={onDeleteTask}
      onClose={() => { setSelected(null); calendarContainer.current?.focus(); }} />}
  </div>;
}
