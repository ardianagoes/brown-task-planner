"use client";
import { useMemo, useState } from "react";
import { CATEGORY_STYLE, deadlineMillis, localDay, taskDay, urgency, type Status, type Task } from "@/lib/tasks";
import CalendarDayDetails from "./calendar-day-details";

export default function CalendarView({ tasks, now, onStatusChange, disabled = false }: {
  tasks: Task[]; now: number; onStatusChange: (id: string, status: Status) => void; disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<{ day: string; taskId?: string } | null>(null);
  const byDay = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      const day = taskDay(task);
      grouped.set(day, [...(grouped.get(day) || []), task]);
    }
    for (const dayTasks of grouped.values()) dayTasks.sort((a, b) => deadlineMillis(a) - deadlineMillis(b));
    return grouped;
  }, [tasks]);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  function moveMonth(delta: number) { setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + delta, 1)); }
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold" aria-live="polite">{month.toLocaleString(undefined, { month: "long", year: "numeric" })}</h3>
      <div className="flex gap-1.5">
        <button type="button" className="button-secondary" onClick={() => moveMonth(-1)} aria-label="Previous month">Previous</button>
        <button type="button" className="button-secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <button type="button" className="button-secondary" onClick={() => moveMonth(1)} aria-label="Next month">Next</button>
      </div>
    </div>
    <p className="mb-4 text-xs text-slate-400">All statuses are shown. Open a day to see full details. Red dots flag urgent deadlines.</p>
    <div className="overflow-x-auto pb-2" tabIndex={0} aria-label="Monthly calendar; scroll horizontally on smaller screens">
      <div className="grid min-w-[600px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="bg-slate-900 p-2 text-center text-xs font-medium text-slate-400">{day}</div>)}
        {days.map(day => {
          const key = localDay(day);
          const dayTasks = byDay.get(key) || [];
          const today = key === localDay(new Date(now));
          return <section key={key} aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })}
            className={`h-28 min-w-0 p-1.5 sm:p-2 ${day.getMonth() === month.getMonth() ? "bg-slate-900" : "bg-slate-950/80"}`}>
            <p className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-xs ${today ? "bg-blue-600 font-bold text-white" : "text-slate-400"}`}>
              <time dateTime={key} aria-current={today ? "date" : undefined}>{day.getDate()}</time>
            </p>
            <div className="space-y-0.5">{dayTasks.slice(0, 2).map(task => {
              const flag = urgency(task, now);
              const time = task.allDay ? "All day" : new Date(task.dueAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              const completed = task.status === "Submitted/Done";
              return <button key={task.id} type="button" title={`${time} · ${task.name} · ${flag.text}`}
                aria-label={`${task.name}, ${time}, ${flag.text}. Open day details`}
                onClick={() => setSelected({ day: key, taskId: task.id })}
                className={`flex h-5 w-full min-w-0 items-center gap-1 rounded border-l-2 px-1 text-left text-[11px] transition-colors hover:brightness-125 ${CATEGORY_STYLE[task.category]} ${completed ? "saturate-50" : ""}`}>
                {flag.urgent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" aria-hidden="true" />}
                <span className={`shrink-0 text-[10px] tabular-nums ${completed ? "text-slate-400 line-through" : ""}`}>{time}</span>
                <span className={`truncate ${completed ? "text-slate-400 line-through" : ""}`}>{task.name}</span>
              </button>;
            })}</div>
            {dayTasks.length > 2 && <button type="button" className="mt-1 min-h-5 rounded px-1 text-xs font-medium text-blue-300 hover:bg-slate-800"
              aria-label={`Show ${dayTasks.length - 2} more deadlines for ${day.toLocaleDateString(undefined, { dateStyle: "full" })}`}
              onClick={() => setSelected({ day: key })}>+{dayTasks.length - 2} more</button>}
          </section>;
        })}
      </div>
    </div>
    {selected && <CalendarDayDetails day={selected.day} initialTaskId={selected.taskId} tasks={byDay.get(selected.day) || []}
      now={now} disabled={disabled} onStatusChange={onStatusChange} onClose={() => setSelected(null)} />}
  </div>;
}
