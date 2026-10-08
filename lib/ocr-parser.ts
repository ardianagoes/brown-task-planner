import { parseExtraction, referenceDay, relativeDate, validCalendarDate, validTimezone, type Candidate, type Extraction } from "./assignment-draft";
import { safeUrl, type Category } from "./tasks";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_PATTERN = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DEADLINE = /\b(?:due(?:\s+(?:date|by|on))?|deadline(?:\s+date)?|submit\s+by|submission\s+deadline)\b\s*[:–—-]?\s*/i;
const INCIDENTAL = /^(?:posted|published|available(?: from| until)?|submitted|graded|meeting|updated|starts?|opens?)\b/i;
const META = /^(?:home|calendar|assignments?|announcements?|details|instructions|points?\b.*|submitting\b.*|submission type\b.*|due(?: date| time)?|deadline|category|time zone|timezone)$/i;
type DateDetail = { value: string | null; kind: Candidate["dateKind"]; uncertain: boolean; note?: string };
const dateString = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
function calendarDate(month: number, day: number, year: string | undefined, reference: string): DateDetail {
  const inferred = !year || year.length === 2;
  let numericYear = year ? Number(year) + (year.length === 2 ? 2000 : 0) : Number(reference.slice(0, 4));
  if (!year) {
    for (let attempts = 0; attempts < 8; attempts++, numericYear++) {
      const suggestion = dateString(numericYear, month, day);
      if (validCalendarDate(suggestion) && suggestion >= reference) return { value: suggestion, kind: "inferred", uncertain: true, note: "Year inferred; check it against the screenshot." };
    }
    return { value: null, kind: "unknown", uncertain: true };
  }
  const value = dateString(numericYear, month, day);
  return validCalendarDate(value) ? { value, kind: inferred ? "inferred" : "explicit", uncertain: inferred } : { value: null, kind: "unknown", uncertain: true };
}
export function parseDeadlineDate(text: string, reference: string): DateDetail {
  const found: DateDetail[] = [];
  const used: [number, number][] = [];
  for (const match of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    found.push(calendarDate(Number(match[2]), Number(match[3]), match[1], reference));
    used.push([match.index!, match.index! + match[0].length]);
  }
  for (const match of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/g)) {
    if (used.some(([start, end]) => match.index! >= start && match.index! < end)) continue;
    const a = Number(match[1]), b = Number(match[2]);
    if (a <= 12 && b <= 12 && a !== b) found.push({ value: null, kind: "unknown", uncertain: true, note: "Ambiguous numeric date; enter the intended month and day." });
    else found.push(calendarDate(a > 12 ? b : a, a > 12 ? a : b, match[3], reference));
  }
  const monthFirst = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}|\\d{2})(?![\\d:]))?\\b`, "gi");
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\.?(?:,?\\s+(\\d{4}|\\d{2})(?![\\d:]))?\\b`, "gi");
  for (const match of text.matchAll(monthFirst)) found.push(calendarDate(MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]), match[3], reference));
  for (const match of text.matchAll(dayFirst)) found.push(calendarDate(MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[1]), match[3], reference));
  // A weekday accompanying an explicit month/day isn't another relative deadline.
  if (!found.length) {
    const relative = relativeDate(text, reference);
    if (relative) found.push({ value: relative, kind: "relative", uncertain: true, note: "Relative date uses today in the configured timezone; older screenshots may refer to another day." });
  }
  if (!found.length) return { value: null, kind: "unknown", uncertain: true, note: "No clear due date was found. Enter it manually." };
  if (found.some(item => !item.value) || new Set(found.map(item => item.value)).size > 1)
    return { value: null, kind: "unknown", uncertain: true, note: found.find(item => item.note)?.note || "Conflicting dates were found; choose the actual deadline." };
  return found[0];
}
export function parseDeadlineTime(raw: string): { time: string | null; uncertain: boolean; timezone: string | null } {
  const text = raw.replace(/https?:\/\/\S+/gi, "").replace(/\b([ap])\.?\s*m\.?/gi, "$1m");
  const values: string[] = [];
  const used: [number, number][] = [];
  for (const match of text.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/gi)) {
    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) continue;
    values.push(`${String(hour % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2] || "00"}`);
    used.push([match.index!, match.index! + match[0].length]);
  }
  for (const match of text.matchAll(/(?<![\d:+-])\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) {
    if (used.some(([start, end]) => match.index! >= start && match.index! < end)) continue;
    // A UTC offset is not a deadline time.
    if (/[+-]$/.test(text.slice(0, match.index!))) continue;
    values.push(`${match[1].padStart(2, "0")}:${match[2]}`);
  }
  const offsets = text.match(/\b(?:UTC|GMT)\s*([+-]\d{2}:?\d{2})\b/i);
  const zone = text.match(/\b[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/)?.[0];
  let timezone = offsets ? offsets[1].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2") :
    /\bEST\b/.test(text) ? "-05:00" : /\bEDT\b/.test(text) ? "-04:00" :
    /\b(?:UTC|GMT)\b/i.test(text) ? "UTC" : /\bET\b/.test(text) ? "America/New_York" : zone || null;
  if (timezone && !validTimezone(timezone)) timezone = null;
  const uncertain = /\b(?:midnight|noon|tonight)\b/i.test(text) || new Set(values).size > 1 ||
    (!values.length && /\bat\s+\d{1,2}\b|\b(?:am|pm)\b/i.test(text));
  return { time: uncertain ? null : values[0] || null, uncertain, timezone };
}
function categoryFrom(text: string): Category {
  if (/\b(?:application|apply|admissions|internship|scholarship|fellowship|resume)\b/i.test(text)) return "Applications";
  if (/\b(?:client|work|job|sprint|invoice|deliverable|manager|team meeting)\b/i.test(text)) return "Job Tasks";
  if (/\b(?:assignment|homework|problem set|pset|quiz|exam|project|course|class|essay|lab|syllabus|lecture|csci)\b/i.test(text)) return "Homework";
  return "Other";
}
function cleanTitle(line: string): string | null {
  const title = line.replace(/^(?:task|assignment|title|subject|project|quiz|exam)\s*[:|]\s*/i, "").replace(/\s*[|:]\s*$/, "").trim();
  return title && !META.test(title) && !INCIDENTAL.test(title) && !DEADLINE.test(title) && !/^https?:/i.test(title) && !/^\d+[\s/:-]*$/.test(title) ? title.slice(0, 200) : null;
}
function titleBefore(lines: string[], index: number, inline: string): string | null {
  const direct = cleanTitle(inline);
  if (direct) return direct.split(/\s+\|\s+/).at(-1)!;
  for (let i = index - 1; i >= Math.max(0, index - 6); i--) {
    const title = cleanTitle(lines[i]); if (title) return title.split(/\s+\|\s+/).at(-1)!;
  }
  return null;
}
function visibleUrl(text: string): string | null {
  const raw = text.match(/\bhttps?:\/\/[^\s<>"']+/i)?.[0];
  return raw && !/\.{3}|…/.test(raw) ? safeUrl(raw.replace(/[.,;:)]+$/, "")) : null;
}
export function emptyOcrExtraction(timezone = "America/New_York", now = new Date()): Extraction {
  return parseOcrText("", timezone, now);
}
export function parseOcrText(raw: string, timezone = "America/New_York", now = new Date(), confidence = 100): Extraction {
  const reference = referenceDay(now, timezone);
  const lines = raw.slice(0, 50000).normalize("NFKC").replace(/\r/g, "").split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 250);
  const candidates: Candidate[] = [];
  const notes: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(DEADLINE);
    if (!match || INCIDENTAL.test(lines[index])) continue;
    const title = titleBefore(lines, index, lines[index].slice(0, match.index));
    let detail = lines[index].slice(match.index! + match[0].length);
    // Common label/value layouts put the date/time on the next line.
    for (let next = index + 1; next < Math.min(lines.length, index + 4); next++) {
      if (DEADLINE.test(lines[next]) || INCIDENTAL.test(lines[next])) break;
      if (!detail || /^(?:at\b|\d|(?:due )?time\b|(?:UTC|GMT|EST|EDT|ET)\b)/i.test(lines[next])) detail += " " + lines[next];
      else break;
    }
    const date = parseDeadlineDate(detail, reference);
    const time = parseDeadlineTime(detail);
    const uncertainFields: Candidate["uncertainFields"] = [];
    if (!title || confidence < 85) uncertainFields.push("name");
    if (date.uncertain || confidence < 85) uncertainFields.push("dueDate");
    if (time.uncertain || (time.time && confidence < 85)) uncertainFields.push("dueTime");
    if (time.time && !time.timezone) uncertainFields.push("timezone");
    const entry: Candidate = {
      name: title, dueDate: date.value, dueTime: time.time, timezone: time.timezone, category: categoryFrom((title || "") + " " + detail),
      usefulUrl: visibleUrl(lines.slice(Math.max(0, index - 1), index + 3).join(" ")),
      uncertainFields, notes: date.note ? [date.note] : [], dateKind: date.kind, dateExpression: detail.trim().slice(0, 200) || null,
    };
    if (time.uncertain) entry.notes.push("The due time is unclear. Keep all day or enter the exact time.");
    const previous = candidates.find(item => item.name && item.name === entry.name);
    if (previous) {
      if (previous.dueDate !== entry.dueDate) {
        previous.dueDate = null; previous.dateKind = "unknown"; previous.uncertainFields.push("dueDate");
        previous.notes = ["Conflicting deadlines for this title. Enter the actual due date."];
      }
      if (previous.dueTime !== entry.dueTime) { previous.dueTime = null; previous.uncertainFields.push("dueTime"); }
    } else if (candidates.length < 5) candidates.push(entry);
    else { notes.push("More than five deadlines were detected. Crop the screenshot to the tasks you want."); break; }
  }
  if (!candidates.length) {
    candidates.push({ name: lines.map(cleanTitle).find(Boolean) || null, dueDate: null, dueTime: null, timezone: null,
      category: categoryFrom(lines.join(" ")), usefulUrl: visibleUrl(raw), uncertainFields: ["name", "dueDate"],
      notes: ["No clear labeled deadline was found. Fill in or correct the task details below."], dateKind: "unknown", dateExpression: null });
  }
  if (confidence < 85) notes.push("OCR confidence is low. Check all details against the image.");
  return parseExtraction({ candidates, notes }, reference, timezone);
}
