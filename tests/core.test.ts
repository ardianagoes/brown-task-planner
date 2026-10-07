import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "../lib/ics";
import { allowedFeedUrl, publicAddress } from "../lib/feed-fetch";
import { deadlineMillis, isTask, mergeImported, safeUrl, urgency, type Task } from "../lib/tasks";

function calendar(events: string) { return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`; }
function event(uid: string, start: string, extra = "") {
  return `BEGIN:VEVENT\nUID:${uid}\nDTSTAMP:20261001T120000Z\nSUMMARY:Assignment\\, part one\n${start}\n${extra}\nEND:VEVENT`;
}
const feed = "https://school.instructure.com/feeds/private.ics";

test("ICS parses UTC, TZID across DST, escaped titles, and calendar dates", async () => {
  const result = await parseFeed(calendar([
    event("utc", "DTSTART:20261007T180000Z"),
    event("edt", "DTSTART;TZID=America/New_York:20261007T140000"),
    event("est", "DTSTART;TZID=America/New_York:20261107T140000"),
    event("date", "DTSTART;VALUE=DATE:20261008\nDTEND;VALUE=DATE:20261009"),
  ].join("\n")), feed, "Canvas");
  assert.equal(result.tasks.length, 4);
  assert.equal(result.tasks[0].name, "Assignment, part one");
  assert.equal(result.tasks[0].dueAt, "2026-10-07T18:00:00.000Z");
  assert.equal(result.tasks[1].dueAt, "2026-10-07T18:00:00.000Z");
  assert.equal(result.tasks[2].dueAt, "2026-11-07T19:00:00.000Z");
  assert.equal(result.tasks[3].dueAt, "2026-10-08");
  assert.equal(result.tasks[3].allDay, true);
});

test("Re-import updates a moved deadline while preserving done status and identity", async () => {
  const original = await parseFeed(calendar(event("same", "DTSTART:20261007T180000Z")), feed, "Canvas");
  const incoming = await parseFeed(calendar(event("same", "DTSTART:20261008T180000Z")), feed, "Canvas");
  original.tasks[0].status = "Submitted/Done";
  original.tasks[0].category = "Other";
  const merged = mergeImported(original.tasks, incoming.tasks);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "Submitted/Done");
  assert.equal(merged[0].category, "Other");
  assert.equal(merged[0].dueAt, "2026-10-08T18:00:00.000Z");
  assert.ok(!JSON.stringify(merged).includes("private.ics"));
});

test("Import ignores non-calendar HTML, unsafe links, cancelled and recurring events", async () => {
  await assert.rejects(parseFeed("<html>Sign in</html>", feed, "Canvas"));
  const result = await parseFeed(calendar([
    event("safe", "DTSTART:20261007T180000Z", "URL:javascript:alert(1)"),
    event("cancelled", "DTSTART:20261007T180000Z", "STATUS:CANCELLED"),
    event("repeat", "DTSTART:20261007T180000Z", "RRULE:FREQ=WEEKLY"),
  ].join("\n")), feed, "Canvas");
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].urls, []);
  assert.equal(result.warnings.length, 2);
});

test("VTODO uses DUE instead of DTSTART", async () => {
  const result = await parseFeed(calendar("BEGIN:VTODO\nUID:todo\nSUMMARY:Submit essay\nDTSTART:20261001T120000Z\nDUE:20261009T120000Z\nEND:VTODO"), feed, "Canvas");
  assert.equal(result.tasks[0].dueAt, "2026-10-09T12:00:00.000Z");
});

test("Oversized feed links cannot make saved tasks unreadable", async () => {
  const result = await parseFeed(calendar(event("long-link", "DTSTART:20261007T180000Z",
    "URL:https://example.com/" + "a".repeat(4096))), feed, "Canvas");
  assert.equal(result.tasks.length, 1);
  assert.equal(isTask(result.tasks[0]), true);
  assert.deepEqual(result.tasks[0].urls, []);
});

test("Feed URL allowlist and public IP checks reject SSRF targets", () => {
  assert.equal(allowedFeedUrl("webcal://school.instructure.com/feed.ics").protocol, "https:");
  for (const url of ["http://school.instructure.com/feed.ics", "https://instructure.com.evil.test/feed.ics", "https://127.0.0.1/feed.ics", "https://school.instructure.com:8443/feed.ics", "https://user:pass@school.instructure.com/feed.ics"]) {
    assert.throws(() => allowedFeedUrl(url));
  }
  assert.equal(allowedFeedUrl("https://canvas.brown.edu/feed.ics", "canvas.brown.edu").hostname, "canvas.brown.edu");
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "fc00::1", "100.64.0.1"]) assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("8.8.8.8"), true);
});

test("Urgency boundaries include 48 hours; completed tasks are never urgent", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const task: Task = { id: "test", name: "Deadline", dueAt: new Date(now + 48 * 3600000).toISOString(), allDay: false,
    category: "Applications", status: "To Do", urls: [], source: "Manual" };
  assert.equal(urgency(task, now).urgent, true);
  assert.equal(urgency({ ...task, dueAt: new Date(deadlineMillis(task) + 1).toISOString() }, now).urgent, false);
  assert.equal(urgency({ ...task, dueAt: new Date(now - 1).toISOString() }, now).text, "Overdue");
  assert.equal(urgency({ ...task, status: "Submitted/Done" }, now).urgent, false);
  assert.equal(safeUrl("javascript:alert(1)"), null);
});
