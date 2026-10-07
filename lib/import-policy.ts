import type { Task } from "./tasks";

export function calendarDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function canvasImportWindow(tasks: Task[], existingIds: ReadonlySet<string>, now = new Date()) {
  const timeZone = process.env.APP_TIMEZONE || "America/New_York";
  const today = calendarDate(now, timeZone);
  let skippedPast = 0;
  const eligible = tasks.filter(task => {
    if (task.source !== "Canvas" || existingIds.has(task.id)) return true;
    // DATE-only deadlines are calendar dates already: never convert them to UTC.
    const dueDay = task.allDay ? task.dueAt : calendarDate(new Date(task.dueAt), timeZone);
    if (dueDay >= today) return true;
    skippedPast++;
    return false;
  });
  return { tasks: eligible, skippedPast };
}
