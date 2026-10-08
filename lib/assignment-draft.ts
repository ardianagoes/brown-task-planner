import { Temporal } from "@js-temporal/polyfill";
import { CATEGORIES, isTask, localDay, safeUrl, type Category, type Task } from "./tasks";

export const REVIEW_FIELDS = ["name", "dueDate", "dueTime", "timezone", "usefulUrl"] as const;
export type ReviewField = typeof REVIEW_FIELDS[number];
export type Candidate = {
  name: string | null; dueDate: string | null; dueTime: string | null; timezone: string | null;
  category: Category; usefulUrl: string | null; uncertainFields: ReviewField[]; notes: string[];
  dateKind: "explicit" | "relative" | "inferred" | "unknown"; dateExpression: string | null;
};
export type Extraction = { candidates: Candidate[]; notes: string[]; referenceDate: string; referenceTimezone: string };
export type AssignmentDraft = { name: string; dueDate: string; dueTime: string; timezone: string; category: Category; urls: string; allDay: boolean };
export function validCalendarDate(value: string): boolean {
  try { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Temporal.PlainDate.from(value).toString() === value; }
  catch { return false; }
}
export function validTimezone(value: string): boolean {
  try { Temporal.Now.zonedDateTimeISO(value); return value.length <= 100; }
  catch { return false; }
}
export function referenceDay(now: Date, timezone: string): string {
  return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone).toPlainDate().toString();
}
export function relativeDate(expression: string, reference: string): string | null {
  const text = expression.toLowerCase();
  const day = Temporal.PlainDate.from(reference);
  if (/\btomorrow\b/.test(text)) return day.add({ days: 1 }).toString();
  if (/\b(today|tonight)\b/.test(text)) return day.toString();
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
  const inDays = text.match(/\bin (\d{1,3}|zero|one|two|three|four|five|six|seven) days?\b/);
  if (inDays) return day.add({ days: /^\d+$/.test(inDays[1]) ? Number(inDays[1]) : words.indexOf(inDays[1]) }).toString();
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const weekday = weekdays.findIndex(name => new RegExp(`\\b${name}\\b`).test(text));
  if (weekday >= 0) {
    let days = (weekday + 1 - day.dayOfWeek + 7) % 7;
    if (days === 0 && /\bnext\b/.test(text)) days = 7;
    return day.add({ days }).toString();
  }
  return null;
}
export function parseExtraction(value: unknown, referenceDate: string, referenceTimezone: string): Extraction {
  const invalid = () => new Error("Invalid extracted assignment details");
  const notesValid = (notes: unknown): notes is string[] => Array.isArray(notes) && notes.length <= 8 && notes.every(note => typeof note === "string" && note.length <= 300);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || !Array.isArray(data.candidates) || data.candidates.length > 5 || !notesValid(data.notes)) throw invalid();
  const candidates = data.candidates.map((entry: unknown): Candidate => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid();
    const item = entry as Record<string, unknown>;
    const keys = [...REVIEW_FIELDS, "category", "uncertainFields", "notes", "dateKind", "dateExpression"];
    if (Object.keys(item).length !== keys.length || keys.some(key => !(key in item))) throw invalid();
    const nullable = (key: string, max: number) => item[key] === null || (typeof item[key] === "string" && item[key].length <= max && item[key].trim().length > 0);
    if (!nullable("name", 200) || !nullable("dueDate", 10) || !nullable("dueTime", 5) || !nullable("timezone", 100) || !nullable("usefulUrl", 4096) || !nullable("dateExpression", 200) ||
      !CATEGORIES.includes(item.category as Category) || !["explicit", "relative", "inferred", "unknown"].includes(String(item.dateKind)) ||
      !Array.isArray(item.uncertainFields) || item.uncertainFields.length > 5 || item.uncertainFields.some(field => !REVIEW_FIELDS.includes(field)) || !notesValid(item.notes)) throw invalid();
    if ((item.dueDate && !validCalendarDate(String(item.dueDate))) ||
      (item.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.dueTime))) ||
      (item.timezone && !validTimezone(String(item.timezone))) ||
      (item.usefulUrl && (!safeUrl(String(item.usefulUrl)) || !/^https?:\/\//i.test(String(item.usefulUrl))))) throw invalid();
    const result = { ...item, uncertainFields: [...new Set(item.uncertainFields)], notes: [...item.notes] } as Candidate;
    const flag = (field: ReviewField) => { if (!result.uncertainFields.includes(field)) result.uncertainFields.push(field); };
    if (result.dateKind === "relative") {
      result.dueDate = result.dateExpression ? relativeDate(result.dateExpression, referenceDate) : null;
      flag("dueDate"); // Relative wording in an old screenshot may refer to a different day.
    }
    if (result.dateKind === "inferred") flag("dueDate");
    if (result.dateKind === "unknown") result.dueDate = null;
    if (!result.name) flag("name");
    if (!result.dueDate) flag("dueDate");
    if (result.uncertainFields.includes("dueTime")) result.dueTime = null;
    if (result.uncertainFields.includes("timezone")) result.timezone = null;
    if (result.dueTime && !result.timezone) flag("timezone");
    return result;
  });
  return { candidates, notes: data.notes, referenceDate, referenceTimezone };
}
export function draftFromCandidate(value: Candidate, defaultTimezone: string): AssignmentDraft {
  return { name: value.name || "", dueDate: value.dueDate || "", dueTime: value.dueTime || "",
    timezone: value.timezone || defaultTimezone, category: value.category, urls: value.usefulUrl || "", allDay: !value.dueTime };
}
export function taskFromDraft(draft: AssignmentDraft, id: string): Task {
  if (!draft.name.trim()) throw new Error("Enter a task name.");
  if (!validCalendarDate(draft.dueDate)) throw new Error("Enter a complete valid due date, including the year.");
  let dueAt = draft.dueDate;
  if (!draft.allDay) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.dueTime)) throw new Error("Enter a due time or choose All day.");
    try {
      const [year, month, day] = draft.dueDate.split("-").map(Number);
      const [hour, minute] = draft.dueTime.split(":").map(Number);
      dueAt = Temporal.ZonedDateTime.from({ timeZone: draft.timezone, year, month, day, hour, minute }, { disambiguation: "reject" }).toInstant().toString();
    } catch { throw new Error("Check the timezone and time. For an ambiguous DST time, enter its UTC offset (such as -04:00 or -05:00)."); }
  }
  const urls = draft.urls.split(/\s+/).filter(Boolean).map(safeUrl);
  if (urls.some(url => !url)) throw new Error("Use complete http:// or https:// URLs.");
  const task: Task = { id, name: draft.name.trim(), dueAt, allDay: draft.allDay,
    category: draft.category, urls: urls as string[], source: "Manual", status: "To Do" };
  if (!isTask(task)) throw new Error("Check the task fields and URL lengths.");
  return task;
}
export function possibleDuplicate(tasks: readonly Task[], candidate: Task): boolean {
  return tasks.some(task => task.name.trim().toLowerCase() === candidate.name.trim().toLowerCase() &&
    task.allDay === candidate.allDay && (task.allDay ? task.dueAt === candidate.dueAt : Date.parse(task.dueAt) === Date.parse(candidate.dueAt)));
}
export type SaveAttempt = { signature: string; task: Task };
export function stableSaveAttempt(previous: SaveAttempt | null, candidate: Task, newId: () => string): SaveAttempt {
  const signature = JSON.stringify({ ...candidate, id: "" });
  return previous?.signature === signature ? previous : { signature, task: { ...candidate, id: newId() } };
}
export function taskFromManualFields(fields: { name: string; dueAt: string; category: Category; urls: string }): Task {
  const date = new Date(fields.dueAt);
  if (!fields.name.trim() || !Number.isFinite(date.getTime())) throw new Error("Enter a task name and valid deadline.");
  const normalized = `${localDay(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (normalized !== fields.dueAt) throw new Error("This time does not exist in your timezone. Choose another time.");
  const urls = fields.urls.split(/\s+/).filter(Boolean).map(safeUrl);
  if (urls.some(url => !url)) throw new Error("Use full http:// or https:// URLs.");
  const task: Task = { id: "draft", name: fields.name.trim(), dueAt: date.toISOString(), allDay: false,
    category: fields.category, urls: urls as string[], source: "Manual", status: "To Do" };
  if (!isTask(task)) throw new Error("Check the task fields and URL lengths.");
  return task;
}
