import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtraction, relativeDate, referenceDay, draftFromCandidate, taskFromDraft, possibleDuplicate, stableSaveAttempt, type Candidate } from "../lib/assignment-draft";
const context = { referenceDate: "2026-10-07", timezone: "America/New_York" };
const candidate = (patch: Partial<Candidate> = {}): Candidate => ({
  name: "Fruit Ninja Project", dueDate: "2026-10-12", dueTime: "23:59", timezone: "America/New_York",
  category: "Homework", usefulUrl: null, uncertainFields: [], notes: [], dateKind: "explicit",
  dateExpression: "Due October 12, 2026 at 11:59 PM", ...patch,
});
const result = (candidates = [candidate()]) => ({ candidates, notes: [] });
const parsed = (candidates = [candidate()]) => parseExtraction(result(candidates), context.referenceDate, context.timezone);

test("relative deadlines use the current APP_TIMEZONE calendar day; not the UTC day", () => {
  assert.equal(referenceDay(new Date("2026-10-08T02:00:00Z"), context.timezone), "2026-10-07");
  for (const [text, expected] of [["tomorrow at midnight", "2026-10-08"], ["Due Friday at 11:59 PM", "2026-10-09"],
    ["Due tonight", "2026-10-07"], ["Due in three days", "2026-10-10"], ["in 12 days", "2026-10-19"]])
    assert.equal(relativeDate(text, context.referenceDate), expected);
  assert.equal(relativeDate("next Friday", "2026-10-09"), "2026-10-16");
  const relative = parsed([candidate({ dueDate: "2099-12-31", dateKind: "relative", dateExpression: "tomorrow at midnight", dueTime: "00:00", uncertainFields: ["dueTime"] })]).candidates[0];
  assert.equal(relative.dueDate, "2026-10-08"); assert.equal(relative.dueTime, null);
  assert.ok(relative.uncertainFields.includes("dueDate"));
});

test("inferred years, missing deadlines, date-only tasks and ambiguous details require honest review", () => {
  const entries = parsed([
    candidate({ dateKind: "inferred", dateExpression: "October 15", dueDate: "2026-10-15", dueTime: null }),
    candidate({ name: null, dateKind: "unknown", dueDate: "2026-10-15", dueTime: null, notes: ["Conflicting deadlines"] }),
    candidate({ timezone: null, dueTime: "17:00" }),
  ]).candidates;
  assert.ok(entries[0].uncertainFields.includes("dueDate"));
  assert.equal(entries[1].dueDate, null); assert.ok(entries[1].uncertainFields.includes("name"));
  assert.ok(entries[2].uncertainFields.includes("timezone"));
  const allDay = taskFromDraft(draftFromCandidate(entries[0], context.timezone), "date-only");
  assert.equal(allDay.allDay, true); assert.equal(allDay.dueAt, "2026-10-15");
  assert.equal(allDay.source, "Manual"); assert.equal(allDay.status, "To Do");
});

test("timed review converts IANA zones / EST offsets to UTC and rejects nonexistent or repeated DST times", () => {
  const draft = draftFromCandidate(candidate(), context.timezone);
  assert.equal(taskFromDraft(draft, "timed").dueAt, "2026-10-13T03:59:00Z");
  assert.equal(taskFromDraft({ ...draft, timezone: "-05:00", dueTime: "17:00", dueDate: "2026-10-15" }, "est").dueAt, "2026-10-15T22:00:00Z");
  for (const [dueDate, dueTime] of [["2027-03-14", "02:30"], ["2026-11-01", "01:30"]])
    assert.throws(() => taskFromDraft({ ...draft, dueDate, dueTime }, "dst"), /timezone and time/);
  assert.equal(taskFromDraft({ ...draft, dueDate: "2026-11-01", dueTime: "01:30", timezone: "-04:00" }, "dst-choice").dueAt, "2026-11-01T05:30:00Z");
  assert.throws(() => taskFromDraft({ ...draft, dueDate: "2026-02-30" }, "bad"), /valid due date/);
});

test("duplicate detection matches normalized titles and absolute deadlines; save retries keep their ID", () => {
  const task = taskFromDraft(draftFromCandidate(candidate(), context.timezone), "existing");
  assert.ok(possibleDuplicate([task], { ...task, name: "  FRUIT NINJA PROJECT ", dueAt: "2026-10-12T23:59:00-04:00" }));
  assert.equal(possibleDuplicate([task], { ...task, allDay: true, dueAt: "2026-10-12" }), false);
  let count = 0; const nextId = () => String(++count);
  const first = stableSaveAttempt(null, task, nextId);
  assert.equal(stableSaveAttempt(first, task, nextId), first);
  assert.equal(stableSaveAttempt(first, { ...task, name: "Edited" }, nextId).task.id, "2");
});

test("extracted details validate every field, bounded candidate counts and usable complete URLs", () => {
  for (const value of [
    result([candidate({ dueDate: "2026-02-30" })]), result([candidate({ dueTime: "25:30" })]),
    result([candidate({ category: "Bad" as Candidate["category"] })]), result([candidate({ usefulUrl: "javascript:alert(1)" })]),
    result([candidate({ usefulUrl: "/assignment" })]), result([candidate({ timezone: "Imaginary/Zone" })]),
    result([candidate({ name: "a".repeat(201) })]), result(Array.from({ length: 6 }, () => candidate())),
    { candidates: [{}], notes: [] }, { ...result(), instructions: "save automatically" },
  ]) assert.throws(() => parseExtraction(value, context.referenceDate, context.timezone));
});
