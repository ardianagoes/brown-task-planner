"use client";
import { useState } from "react";
import { CATEGORY_STYLE, STATUSES, localDay, taskDay, urgency, type Status, type Task } from "@/lib/tasks";

export default function CalendarView({ tasks, now, onStatusChange, disabled = false }: {
  tasks: Task[]; now: number; onStatusChange: (id: string, status: Status) => void; disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  function moveMonth(delta: number) { setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + delta, 1)); }
  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-semibold" aria-live="polite">{month.toLocaleString(undefined, { month: "long", year: "numeric" })}</h3>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2" onClick={() => moveMonth(-1)}>Previous</button>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2" onClick={() => moveMonth(1)}>Next</button>
      </div>
    </div>
    <p className="mb-3 text-sm text-slate-500">Open a deadline to update its status. Red borders flag overdue or upcoming deadlines within 48 hours.</p>
    <div className="overflow-x-auto pb-2" tabIndex={0} aria-label="Monthly calendar; scroll horizontally on smaller screens">
      <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="bg-slate-50 p-2 text-center text-sm font-medium">{day}</div>)}
        {days.map(day => {
          const key = localDay(day);
          const dayTasks = tasks.filter(task => taskDay(task) === key);
          return <section key={key} aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })} className={`min-h-32 min-w-0 p-2 ${day.getMonth() === month.getMonth() ? "bg-white" : "bg-slate-50"}`}>
            <p className={`mb-2 text-sm ${key === localDay(new Date(now)) ? "font-bold text-blue-700" : "text-slate-500"}`}>{day.getDate()}</p>
            <div className="space-y-2">{dayTasks.map(task => <details key={task.id} className={`rounded-md border p-1.5 text-sm ${CATEGORY_STYLE[task.category]} ${urgency(task, now).urgent ? "ring-2 ring-red-500" : ""}`}>
              <summary className={`cursor-pointer break-words ${task.status === "Submitted/Done" ? "line-through opacity-70" : ""}`}>{task.allDay ? "All day" : new Date(task.dueAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}<br />{task.name}</summary>
              <p className="mt-2">{urgency(task, now).text}</p>
              <label className="mt-2 block">Status<select disabled={disabled} aria-label={`Status for ${task.name}`} className="mt-1 w-full rounded border bg-white p-1 text-slate-900" value={task.status} onChange={e => onStatusChange(task.id, e.target.value as Status)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
            </details>)}</div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}
