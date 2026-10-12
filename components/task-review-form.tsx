"use client";
import { useMemo, useState, type FormEvent } from "react";
import { CATEGORIES, type Task } from "@/lib/tasks";
import { possibleDuplicate, taskFromDraft, type AssignmentDraft, type Candidate } from "@/lib/assignment-draft";

export default function TaskReviewForm({ candidate, defaultTimezone, tasks, disabled, onSave, onTryAgain }: {
  candidate: Candidate; defaultTimezone: string; tasks: readonly Task[]; disabled: boolean;
  onSave: (task: Task) => Promise<void>; onTryAgain: () => void;
}) {
  const [draft, setDraft] = useState<AssignmentDraft>(() => ({
    name: candidate.name || "", dueDate: candidate.dueDate || "", dueTime: candidate.dueTime || "", timezone: candidate.timezone || defaultTimezone,
    category: candidate.category, urls: candidate.usefulUrl || "", allDay: !candidate.dueTime,
  }));
  const [checked, setChecked] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [error, setError] = useState("");
  const duplicate = useMemo(() => { try { return possibleDuplicate(tasks, taskFromDraft(draft, "draft")); } catch { return false; } }, [tasks, draft]);
  const update = (patch: Partial<AssignmentDraft>) => { setDraft(previous => ({ ...previous, ...patch })); setChecked(false); setAllowDuplicate(false); setError(""); };
  const uncertain = (field: Candidate["uncertainFields"][number]) => candidate.uncertainFields.includes(field);
  const style = (field: Candidate["uncertainFields"][number]) => `control mt-1 ${uncertain(field) ? "border-amber-500/70" : ""}`;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (candidate.uncertainFields.length && !checked) { setError("Confirm the uncertain details before saving."); return; }
    try {
      const task = taskFromDraft(draft, "draft");
      if (possibleDuplicate(tasks, task) && !allowDuplicate) { setError("Confirm that you want to add another copy."); return; }
      await onSave(task);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this task."); }
  }
  return <form onSubmit={submit} className="mt-4 space-y-3 text-sm text-slate-300" aria-label="Review detected task">
    <h3 className="font-semibold text-slate-100">Detected task · review before saving</h3>
    {candidate.dateExpression && <p className="text-xs text-slate-400">Deadline text: {candidate.dateExpression}</p>}
    {candidate.notes.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs text-amber-200">{candidate.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
      <label className="block">Task name{uncertain("name") && <span className="ml-1 text-xs text-amber-200">· check</span>}
        <input name="name" className={style("name")} value={draft.name} required maxLength={200} onChange={event => update({ name: event.target.value })} /></label>
      <label className="block">Due date{uncertain("dueDate") && <span className="ml-1 text-xs text-amber-200">· check date/year</span>}
        <input name="dueDate" type="date" className={style("dueDate")} value={draft.dueDate} required onInput={event => update({ dueDate: event.currentTarget.value })} onChange={event => update({ dueDate: event.target.value })} /></label>
      <label className="flex min-h-9 items-center gap-2"><input name="allDay" type="checkbox" checked={draft.allDay}
        className="h-4 w-4 accent-blue-500" onChange={event => update({ allDay: event.target.checked })} />All day · time unspecified</label>
      {!candidate.dueTime && <p className="text-xs text-amber-200">No clear due time was detected. Keep all day or enter a time.</p>}
      {!draft.allDay && <>
        <label className="block">Due time{uncertain("dueTime") && <span className="ml-1 text-xs text-amber-200">· check</span>}
          <input name="dueTime" type="time" className={style("dueTime")} value={draft.dueTime} required onInput={event => update({ dueTime: event.currentTarget.value })} onChange={event => update({ dueTime: event.target.value })} /></label>
        <label className="block">Timezone{uncertain("timezone") && <span className="ml-1 text-xs text-amber-200">· confirm</span>}
          <input name="timezone" className={style("timezone")} value={draft.timezone} required maxLength={100} placeholder="America/New_York"
            onChange={event => update({ timezone: event.target.value })} /></label>
      </>}
      <label className="block">Category<select name="category" className="control mt-1" value={draft.category}
        onChange={event => update({ category: event.target.value as AssignmentDraft["category"] })}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label className="block">Useful URLs <span className="text-xs text-slate-400">(optional)</span><textarea name="urls" className={style("usefulUrl")} rows={2}
        value={draft.urls} onChange={event => update({ urls: event.target.value })} /></label>
      {candidate.uncertainFields.length > 0 && <label className="flex items-start gap-2 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-xs text-amber-100">
        <input type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" checked={checked} onChange={event => setChecked(event.target.checked)} />
        I checked and corrected the uncertain details.</label>}
      {duplicate && <label className="flex items-start gap-2 rounded-lg border border-amber-900/70 p-3 text-xs text-amber-100">
        <input type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" checked={allowDuplicate} onChange={event => setAllowDuplicate(event.target.checked)} />
        A task with this name and deadline exists. Add another copy anyway.</label>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="button-primary">{disabled ? "Saving…" : "Add Assignment"}</button>
        <button type="button" className="button-secondary" onClick={onTryAgain}>Try Again</button></div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </form>;
}
