"use client";
import { Circle, CircleCheck, CircleDot } from "lucide-react";
import { STATUSES, type Status, type Task } from "@/lib/tasks";

export default function TaskStatusControls({ task, disabled, onStatusChange }: {
  task: Task; disabled?: boolean; onStatusChange: (id: string, status: Status) => void;
}) {
  const Icon = task.status === "Submitted/Done" ? CircleCheck : task.status === "In Progress" ? CircleDot : Circle;
  return <label className="task-status" data-status={task.status} title={`Status: ${task.status}`}>
    <Icon size={13} aria-hidden="true" /><select disabled={disabled} aria-label={`Status for ${task.name}`} value={task.status}
      onChange={event => onStatusChange(task.id, event.target.value as Status)}>
      {STATUSES.map(status => <option key={status} value={status}>{status === "Submitted/Done" ? "Done" : status === "To Do" ? "To do" : "In progress"}</option>)}
    </select>
  </label>;
}
