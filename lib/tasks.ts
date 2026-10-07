export const CATEGORIES = ["Homework", "Applications", "Job Tasks", "Other"] as const;
export const STATUSES = ["To Do", "In Progress", "Submitted/Done"] as const;
export type Category = typeof CATEGORIES[number];
export type Status = typeof STATUSES[number];
export type Task = {
  id: string;
  name: string;
  // Timed deadlines are UTC ISO strings; all-day deadlines are YYYY-MM-DD.
  dueAt: string;
  allDay: boolean;
  category: Category;
  status: Status;
  urls: string[];
  source: "Manual" | "Canvas" | "Gradescope";
};

// Literal class names let Tailwind discover every category color at build time.
export const CATEGORY_STYLE: Record<Category, string> = {
  Homework: "bg-blue-950/60 text-blue-200 border-blue-700/60",
  Applications: "bg-violet-950/60 text-violet-200 border-violet-700/60",
  "Job Tasks": "bg-amber-950/50 text-amber-200 border-amber-700/60",
  Other: "bg-teal-950/60 text-teal-200 border-teal-700/60",
};

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : null;
  } catch { return null; }
}
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function taskDay(task: Task): string {
  return task.allDay ? task.dueAt : localDay(new Date(task.dueAt));
}
export function deadlineMillis(task: Task): number {
  // No exact time exists in a DATE-only feed: use local end of day, visibly labeled.
  return new Date(task.allDay ? `${task.dueAt}T23:59:59.999` : task.dueAt).getTime();
}
export function urgency(task: Task, now: number) {
  if (task.status === "Submitted/Done") return { urgent: false, text: "Completed" };
  const delta = deadlineMillis(task) - now;
  if (delta < 0) return { urgent: true, text: "Overdue" };
  if (delta <= 48 * 3600000) return { urgent: true, text: `Due in ${Math.ceil(delta / 3600000)}h` };
  return { urgent: false, text: `Due in ${Math.ceil(delta / 86400000)} days` };
}
export function mergeImported(existing: Task[], incoming: Task[]): Task[] {
  const byId = new Map(existing.map(task => [task.id, task]));
  for (const task of incoming) {
    const previous = byId.get(task.id);
    byId.set(task.id, previous ? { ...task, status: previous.status, category: previous.category } : task);
  }
  return [...byId.values()];
}
export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const t = value as Task;
  const validDate = typeof t.dueAt === "string" && (t.allDay
    ? /^\d{4}-\d{2}-\d{2}$/.test(t.dueAt) && Number.isFinite(Date.parse(t.dueAt)) && new Date(t.dueAt).toISOString().slice(0, 10) === t.dueAt
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(t.dueAt));
  return typeof t.id === "string" && t.id.length > 0 && t.id.length <= 128 &&
    typeof t.name === "string" && t.name.trim().length > 0 && t.name.length <= 200 &&
    typeof t.dueAt === "string" && typeof t.allDay === "boolean" &&
    validDate && Number.isFinite(deadlineMillis(t)) && CATEGORIES.includes(t.category) &&
    STATUSES.includes(t.status) && ["Manual", "Canvas", "Gradescope"].includes(t.source) &&
    Array.isArray(t.urls) && t.urls.length <= 20 && t.urls.every(url => typeof url === "string" && url.length <= 4096 && safeUrl(url));
}
