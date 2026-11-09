"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { CATEGORIES, STATUSES, type Status, type Task } from "@/lib/tasks";
import { possibleDuplicate, type AssignmentDraft } from "@/lib/assignment-draft";
import { draftFromTask, taskFromEditDraft } from "@/lib/task-editing";
import { trapDialogTab } from "./dialog-focus";

export default function TaskEditDialog({ task, tasks, disabled, onSave, onClose }: {
  task: Task; tasks: readonly Task[]; disabled?: boolean; onSave: (task: Task) => Promise<void>; onClose: () => void;
}) {
  const [original] = useState(task);
  const [initial] = useState(() => draftFromTask(original));
  const [draft, setDraft] = useState(initial), [status, setStatus] = useState(task.status);
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [allowDuplicate, setAllowDuplicate] = useState(false);
  const active = useRef(false), dialog = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); if (opener?.isConnected) opener.focus();
      else document.querySelector<HTMLButtonElement>('dialog[open] button[aria-label="Close day details"]')?.focus(); };
  }, []);
  const update = (patch: Partial<AssignmentDraft>) => { setDraft(previous => ({ ...previous, ...patch })); setAllowDuplicate(false); setError(""); };
  const duplicate = useMemo(() => {
    try { return possibleDuplicate(tasks.filter(item => item.id !== original.id), taskFromEditDraft(draft, status, original, initial)); } catch { return false; }
  }, [tasks, original, draft, initial, status]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (active.current || disabled) return;
    setError("");
    try {
      const edited = taskFromEditDraft(draft, status, original, initial);
      if (duplicate && !allowDuplicate) throw new Error("Confirm that you want this task to match another task.");
      active.current = true; setSaving(true); await onSave(edited); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save changes. Try again."); }
    finally { active.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} aria-labelledby={title} tabIndex={-1} onKeyDown={trapDialogTab} onCancel={event => { event.preventDefault(); if (!active.current) onClose(); }}
    className="day-dialog w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl">
    <h2 id={title} className="text-lg font-semibold">Edit Assignment</h2>
    <p className="mt-1 text-xs text-slate-400">Source: {task.source} · Times use the timezone below.</p>
    <form onSubmit={submit} aria-label="Edit assignment" className="mt-4 space-y-3 text-sm text-slate-300">
      <fieldset disabled={saving || disabled} className="space-y-3 disabled:opacity-60">
        <label className="block">Task name<input autoFocus name="name" className="control mt-1" required maxLength={200} value={draft.name} onChange={event => update({ name: event.target.value })} /></label>
        <label className="block">Due date<input name="dueDate" type="date" className="control mt-1" required value={draft.dueDate} onInput={event => update({ dueDate: event.currentTarget.value })} onChange={event => update({ dueDate: event.target.value })} /></label>
        <label className="flex min-h-9 items-center gap-2"><input name="allDay" type="checkbox" className="accent-blue-500" checked={draft.allDay} onChange={event => update({ allDay: event.target.checked })} />All day · time unspecified</label>
        {!draft.allDay && <div className="grid grid-cols-2 gap-3">
          <label>Due time<input name="dueTime" type="time" className="control mt-1" required value={draft.dueTime} onInput={event => update({ dueTime: event.currentTarget.value })} onChange={event => update({ dueTime: event.target.value })} /></label>
          <label>Timezone<input name="timezone" className="control mt-1" required maxLength={100} value={draft.timezone} onChange={event => update({ timezone: event.target.value })} /></label>
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <label>Category<select name="category" className="control mt-1" value={draft.category} onChange={event => update({ category: event.target.value as Task["category"] })}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Status<select name="status" className="control mt-1" value={status} onChange={event => setStatus(event.target.value as Status)}>{STATUSES.map(item => <option key={item}>{item}</option>)}</select></label>
        </div>
        <label className="block">Useful URLs (optional)<textarea name="urls" className="control mt-1" rows={2} value={draft.urls} onChange={event => update({ urls: event.target.value })} /></label>
        {duplicate && <label className="flex items-start gap-2 text-xs text-amber-200"><input type="checkbox" required checked={allowDuplicate} onChange={event => setAllowDuplicate(event.target.checked)} />Another task has this name and deadline. Keep both tasks.</label>}
        <button type="submit" className="button-primary">{saving ? "Saving…" : "Save Changes"}</button>
        <button type="button" className="button-secondary ml-2" onClick={onClose}>Cancel</button>
      </fieldset>
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </form>
  </dialog>;
}
