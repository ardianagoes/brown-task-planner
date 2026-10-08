"use client";
import { useMemo, useState, type FormEvent } from "react";
import { CATEGORIES, type Category, type Task } from "@/lib/tasks";
import { possibleDuplicate, taskFromManualFields } from "@/lib/assignment-draft";
const empty = { name: "", dueAt: "", category: "Homework" as Category, urls: "" };
export default function ManualTaskForm({ tasks, disabled, onSave }: { tasks: readonly Task[]; disabled: boolean; onSave: (task: Task) => Promise<void> }) {
  const [fields, setFields] = useState(empty);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [error, setError] = useState("");
  const duplicate = useMemo(() => { try { return possibleDuplicate(tasks, taskFromManualFields(fields)); } catch { return false; } }, [tasks, fields]);
  const update = (patch: Partial<typeof fields>) => { setFields(previous => ({ ...previous, ...patch })); setAllowDuplicate(false); setError(""); };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const task = taskFromManualFields(fields);
      if (possibleDuplicate(tasks, task) && !allowDuplicate) throw new Error("Confirm that you want to add another copy.");
      await onSave(task); setFields(empty); setAllowDuplicate(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this task."); }
  }
  return <form onSubmit={submit} className="space-y-3 text-sm text-slate-300" aria-label="Manual task entry">
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
      <label className="block">Task name<input className="control mt-1.5" name="name" required maxLength={200} placeholder="e.g. Problem set 4"
        value={fields.name} onChange={event => update({ name: event.target.value })} /></label>
      <label className="block">Due date and time<input className="control mt-1.5" name="dueAt" type="datetime-local" required
        value={fields.dueAt} onChange={event => update({ dueAt: event.target.value })} /></label>
      <p className="text-xs text-slate-400">Times use your browser’s timezone.</p>
      <label className="block">Category<select className="control mt-1.5" name="category" value={fields.category}
        onChange={event => update({ category: event.target.value as Category })}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label className="block">Useful URLs <span className="text-xs text-slate-400">(optional)</span><textarea className="control mt-1.5" name="urls" rows={2} placeholder="https://…"
        value={fields.urls} onChange={event => update({ urls: event.target.value })} /></label>
      {duplicate && <label className="flex items-start gap-2 text-xs text-amber-100"><input type="checkbox" required className="mt-0.5 h-4 w-4 accent-blue-500"
        checked={allowDuplicate} onChange={event => setAllowDuplicate(event.target.checked)} />A task with this name and deadline exists. Add another copy anyway.</label>}
      <button className="button-primary w-full" disabled={disabled} type="submit">{disabled ? "Saving…" : "Add task"}</button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </form>;
}
