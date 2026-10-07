import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("APP_TIMEZONE startup preserves floating DST dates, explicit zones and all-day dates", () => {
  const calendar = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:summer
SUMMARY:Summer deadline
DTSTART:20261007T140000
END:VEVENT
BEGIN:VEVENT
UID:winter
SUMMARY:Winter deadline
DTSTART:20261107T140000
END:VEVENT
BEGIN:VEVENT
UID:utc
SUMMARY:UTC deadline
DTSTART:20261007T180000Z
END:VEVENT
BEGIN:VEVENT
UID:explicit-zone
SUMMARY:Paris deadline
DTSTART;TZID=Europe/Paris:20261007T140000
END:VEVENT
BEGIN:VEVENT
UID:all-day
SUMMARY:All-day deadline
DTSTART;VALUE=DATE:20261008
END:VEVENT
END:VCALENDAR`;
  const script = `
    const { register } = require('./instrumentation.ts');
    register();
    const { parseFeed } = require('./lib/ics.ts');
    parseFeed(${JSON.stringify(calendar)}, 'https://school.instructure.com/feed.ics', 'Canvas')
      .then(result => process.stdout.write(JSON.stringify(result.tasks.map(task => task.dueAt))))
      .catch(() => { process.exitCode = 1; });
  `;
  // Isolated processes avoid changing the test runner's timezone. Start each in
  // UTC to prove the app setting, rather than the host timezone, controls parsing.
  for (const timezone of [undefined, "", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"]) {
    const env: NodeJS.ProcessEnv = { ...process.env, NEXT_RUNTIME: "nodejs", TZ: "UTC" };
    if (timezone === undefined) delete env.APP_TIMEZONE;
    else env.APP_TIMEZONE = timezone;
    const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      env, encoding: "utf8", timeout: 15000,
    }));
    const pacific = timezone === "America/Los_Angeles";
    const tokyo = timezone === "Asia/Tokyo";
    assert.deepEqual(result, [
      tokyo ? "2026-10-07T05:00:00.000Z" : pacific ? "2026-10-07T21:00:00.000Z" : "2026-10-07T18:00:00.000Z",
      tokyo ? "2026-11-07T05:00:00.000Z" : pacific ? "2026-11-07T22:00:00.000Z" : "2026-11-07T19:00:00.000Z",
      "2026-10-07T18:00:00.000Z",
      "2026-10-07T12:00:00.000Z",
      "2026-10-08",
    ], `APP_TIMEZONE=${timezone ?? "(missing)"}`);
  }
});
