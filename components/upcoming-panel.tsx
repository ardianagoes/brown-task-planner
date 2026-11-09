"use client";
import { useState } from "react";
import { ArrowUpRight, CalendarClock, Clock3 } from "lucide-react";
import { deadlineMillis, localDay, taskDay, urgency, type Task } from "@/lib/tasks";
import TaskEditDialog from "./task-edit-dialog";

export default function UpcomingPanel({ tasks, now, ready, disabled, onEditTask, onCalendar }: {
  tasks: Task[]; now: number; ready: boolean; disabled: boolean; onEditTask: (task: Task) => Promise<void>; onCalendar: () => void;
}) {
  const [editing, setEditing] = useState<Task | null>(null);
  const active = tasks.filter(task => task.status !== "Submitted/Done").sort((a, b) => deadlineMillis(a) - deadlineMillis(b));
  const next = active.filter(task => deadlineMillis(task) >= now).slice(0, 4);
  const start = new Date(now), today = localDay(start);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weekEnd = localDay(days[6]), weekTasks = active.filter(task => taskDay(task) >= today && taskDay(task) <= weekEnd);
  return <aside className="upcoming-panel" aria-label="Deadline outlook">
    <div className="outlook-heading"><h2>On your horizon</h2><CalendarClock size={16} aria-hidden="true" /></div>
    <div className="week-outlook"><p>Next 7 days<span>{ready ? `${weekTasks.length} deadlines` : "Loading…"}</span></p><div className="week-strip">{!ready ? days.map((_, index) => <div key={index} className="week-placeholder" aria-hidden="true" />) : days.map(day => {
      const key = localDay(day), count = active.filter(task => taskDay(task) === key).length;
      return <div key={key} className={key === today ? "is-today" : ""}><span>{day.toLocaleDateString(undefined, { weekday: "narrow" })}</span><strong>{day.getDate()}</strong><i className={count ? "has-deadlines" : ""} aria-label={`${count} deadlines`} /></div>;
    })}</div></div>
    <section className="next-deadlines"><h3><Clock3 size={13} aria-hidden="true" />Coming up next</h3>
      {!ready ? <p className="outlook-empty" role="status">Loading deadlines…</p> : next.length === 0 ? <p className="outlook-empty">Room to breathe.<br />Your next deadlines will appear here.</p> : next.map(task => {
        const date = new Date(task.allDay ? `${task.dueAt}T12:00:00` : task.dueAt), flag = urgency(task, now);
        return <button key={task.id} type="button" className="next-deadline" disabled={disabled} aria-label={`Review ${task.name}`} onClick={() => setEditing(task)}>
          <span className="category-dot" data-category={task.category} /><span><strong>{task.name}</strong><small>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {task.allDay ? "All day" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small></span>
          {flag.urgent && <span className="deadline-soon" aria-label="Due within 48 hours" />}
        </button>;
      })}
    </section><button type="button" className="outlook-calendar-link" onClick={onCalendar}>Open calendar<ArrowUpRight size={13} aria-hidden="true" /></button>
    <p className="outlook-footnote">A little planning goes a long way.<br />One deadline at a time.</p>
    {editing && <TaskEditDialog task={editing} tasks={tasks} disabled={disabled} onSave={onEditTask} onClose={() => setEditing(null)} />}
  </aside>;
}
