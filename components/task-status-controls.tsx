"use client";
import { statusAfterToggle, type StatusOption } from "@/lib/task-workflow";
import type { Status, Task } from "@/lib/tasks";

export default function TaskStatusControls({ task, disabled, onStatusChange }: {
  task: Task; disabled?: boolean; onStatusChange: (id: string, status: Status) => void;
}) {
  const options: { status: StatusOption; label: string }[] = [
    { status: "In Progress", label: "In progress" }, { status: "Submitted/Done", label: "Completed" },
  ];
  return <fieldset disabled={disabled} className="flex flex-wrap gap-x-4 gap-y-1">
    <legend className="sr-only">Status for {task.name}</legend>
    {options.map(option => <label key={option.status} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-300 has-disabled:cursor-wait has-disabled:opacity-50">
      <input type="checkbox" checked={task.status === option.status}
        aria-label={`${option.label} for ${task.name}`}
        className="h-4 w-4 rounded accent-blue-500"
        onChange={event => onStatusChange(task.id, statusAfterToggle(task.status, option.status, event.target.checked))} />
      {option.label}
    </label>)}
  </fieldset>;
}
