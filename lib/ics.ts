import { createHash } from "node:crypto";
import ical, { type DateWithTimeZone, type ParameterValue } from "node-ical";
import { isTask, localDay, safeUrl, type Task } from "./tasks";

function text(value: ParameterValue | undefined): string {
  return typeof value === "string" ? value : value?.val || "";
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function dateOnly(date: DateWithTimeZone): string {
  // node-ical constructs unzoned DATE values at local midnight. Preserve those
  // calendar fields, including on servers east of UTC.
  if (!date.tz) return localDay(date);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: date.tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export async function parseFeed(content: string, feedIdentity: string, source: "Canvas" | "Gradescope") {
  if (!/^BEGIN:VCALENDAR\s*$/m.test(content.replace(/\r/g, "")) || !content.includes("END:VCALENDAR")) {
    throw new Error("This URL did not return an ICS calendar. Copy the calendar subscription URL.");
  }
  const data = await ical.async.parseICS(content);
  const tasks: Task[] = [];
  let skipped = 0;
  let recurring = 0;
  let cancelled = 0;
  for (const event of Object.values(data)) {
    if (!event || (event.type !== "VEVENT" && event.type !== "VTODO")) continue;
    if (event.status === "CANCELLED") { cancelled++; continue; }
    // Assignment feeds normally use individual events. Don't silently import only
    // one occurrence of an RRULE series. Add bounded expansion in a later version.
    if (event.rrule) { recurring++; continue; }
    const due = event.type === "VTODO" ? event.due : event.start;
    const name = text(event.summary).trim();
    if (!due || !Number.isFinite(due.getTime()) || !name || !event.uid) { skipped++; continue; }
    const link = safeUrl(text(event.url));
    const task: Task = {
      id: `ics-${hash(`${source}\n${hash(feedIdentity)}\n${event.uid}`)}`,
      name: name.slice(0, 200), dueAt: due.dateOnly ? dateOnly(due) : due.toISOString(),
      allDay: Boolean(due.dateOnly), category: "Homework", status: "To Do",
      urls: link && link.length <= 4096 ? [link] : [], source,
    };
    // Apply the same contract as saved rows so a feed cannot poison later reads.
    if (!isTask(task)) { skipped++; continue; }
    tasks.push(task);
    if (tasks.length > 2000) throw new Error("Feed contains too many tasks (maximum 2,000).");
  }
  const warnings: string[] = [];
  if (skipped) warnings.push(`Skipped ${skipped} entries without a title, UID, or usable deadline.`);
  if (recurring) warnings.push(`Skipped ${recurring} recurring series; this app imports individual deadlines only.`);
  if (cancelled) warnings.push(`Skipped ${cancelled} cancelled entries. Previously imported records are retained.`);
  return { tasks, warnings };
}
