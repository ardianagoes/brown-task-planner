import { deadlineMillis, localDay, taskDay, type Task } from "@/lib/tasks";

// Presentation only: calendar arithmetic deliberately avoids adding 24-hour
// durations, which would shift group boundaries across daylight-saving changes.
export function groupAgenda(tasks: readonly Task[], now: number, ascending = true, completed = false) {
  const date = new Date(now), today = localDay(date);
  const tomorrow = localDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
  const sunday = localDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 - (date.getDay() || 7)));
  const labels = [completed ? "Earlier" : "Overdue", "Today", "Tomorrow", "Later This Week", "Later"];
  const grouped = new Map(labels.map(label => [label, [] as Task[]]));
  for (const task of tasks) {
    const day = taskDay(task);
    const label = day < today ? labels[0] : day === today ? "Today" : day === tomorrow ? "Tomorrow" : day <= sunday ? "Later This Week" : "Later";
    grouped.get(label)!.push(task);
  }
  return (ascending ? labels : [...labels].reverse()).map(label => ({ label,
    tasks: grouped.get(label)!.sort((a, b) => (deadlineMillis(a) - deadlineMillis(b)) * (ascending ? 1 : -1)),
  })).filter(group => group.tasks.length);
}

export function groupCalendarDays(tasks: readonly Task[]) {
  const days = new Map<string, Task[]>();
  for (const task of tasks) { const day = taskDay(task); days.set(day, [...(days.get(day) || []), task]); }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day,
    tasks: items.sort((a, b) => deadlineMillis(a) - deadlineMillis(b)),
  }));
}
