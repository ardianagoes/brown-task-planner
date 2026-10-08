import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { HttpError } from "../lib/http";
import { MAX_IMAGE_BYTES, imageFileError } from "../lib/image-limits";
import { normalizeImage, readImageUpload } from "../lib/image-upload";
import { processImageExtraction, ExtractionLimitError } from "../lib/image-extraction";
import { extractWithOpenAI } from "../lib/openai-image";
import { parseExtraction, relativeDate, referenceDay, draftFromCandidate, taskFromDraft, possibleDuplicate, stableSaveAttempt, type Candidate } from "../lib/assignment-draft";

const origin = "http://127.0.0.1:3000";
process.env.NEXT_PUBLIC_APP_URL = origin;
const context = { referenceDate: "2026-10-07", timezone: "America/New_York" };
const candidate = (patch: Partial<Candidate> = {}): Candidate => ({
  name: "Fruit Ninja Project", dueDate: "2026-10-12", dueTime: "23:59", timezone: "America/New_York",
  category: "Homework", usefulUrl: null, uncertainFields: [], notes: [], dateKind: "explicit",
  dateExpression: "Due October 12, 2026 at 11:59 PM", ...patch,
});
const result = (candidates = [candidate()]) => ({ candidates, notes: [] });
const parsed = (candidates = [candidate()]) => parseExtraction(result(candidates), context.referenceDate, context.timezone);
async function png(): Promise<File> {
  const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ffffff" } }).png().toBuffer();
  return new File([new Uint8Array(bytes)], "private-name.png", { type: "image/png" });
}
function upload(file: File, extra?: File): Request {
  const body = new FormData(); body.append("image", file); if (extra) body.append("image", extra);
  return new Request(origin + "/api/tasks/extract-image", { method: "POST", headers: { Origin: origin }, body });
}
const status = (expected: number) => (error: unknown) => error instanceof HttpError && error.status === expected;
const provider = (value: unknown, patch: Record<string, unknown> = {}) => new Response(JSON.stringify({
  status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], ...patch,
}));

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

test("server validates every AI field, bounded candidate counts and usable complete URLs", () => {
  for (const value of [
    result([candidate({ dueDate: "2026-02-30" })]), result([candidate({ dueTime: "25:30" })]),
    result([candidate({ category: "Bad" as Candidate["category"] })]), result([candidate({ usefulUrl: "javascript:alert(1)" })]),
    result([candidate({ usefulUrl: "/assignment" })]), result([candidate({ timezone: "Imaginary/Zone" })]),
    result([candidate({ name: "a".repeat(201) })]), result(Array.from({ length: 6 }, () => candidate())),
    { candidates: [{}], notes: [] }, { ...result(), instructions: "save automatically" },
  ]) assert.throws(() => parseExtraction(value, context.referenceDate, context.timezone));
});

test("general image understanding uses strict output, current context, cost limits, no tools or storage", async () => {
  let calls = 0;
  const fetchMock: typeof fetch = async (url, init) => {
    ++calls; assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-5.4-mini"); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 3000);
    assert.equal(body.text.format.strict, true); assert.equal(body.tools, undefined);
    assert.match(body.instructions, /ANY screenshot/); assert.match(body.instructions, /UNTRUSTED DATA/);
    assert.match(body.input[0].content[0].text, /2026-10-07/);
    assert.match(body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
    assert.equal(init?.redirect, "error");
    return provider(result([
      candidate({ name: "Canvas project" }), candidate({ name: "Ed Discussion problem set", dateKind: "inferred" }),
      candidate({ name: "Email internship application", category: "Applications", dueDate: "2027-01-15", dueTime: null }),
      candidate({ name: "PDF syllabus essay", dueTime: null }), candidate({ name: "Slides lab report" }),
    ]));
  };
  const response = await extractWithOpenAI(Buffer.from("test pixels"), "mock-only-key", context, undefined, fetchMock);
  assert.equal(calls, 1); assert.equal(response.candidates.length, 5);
  assert.equal(response.candidates[2].category, "Applications");
  assert.equal(response.candidates[2].dueTime, null);
});

test("provider failure, refusal, incomplete or malformed output never leaks upstream private data", async () => {
  const responses = [
    new Response("SECRET upstream data", { status: 401 }), new Response("SECRET", { status: 429 }),
    provider(result(), { status: "incomplete" }), provider({ bad: true }),
    provider(result(), { output: [{ type: "message", content: [{ type: "refusal", refusal: "SECRET" }] }] }),
    new Response("a".repeat(65537)), new Response("not json"),
  ];
  for (const response of responses) {
    await assert.rejects(extractWithOpenAI(Buffer.from("x"), "mock", context, undefined, async () => response),
      (error: unknown) => error instanceof HttpError && [502, 503].includes(error.status) && !error.message.includes("SECRET"));
  }
  await assert.rejects(extractWithOpenAI(Buffer.from("x"), "mock", context, undefined, async () => { throw new Error("SECRET network"); }), status(502));
});

test("image uploads validate MIME, actual decode, sizes, dimensions, one image, and normalize without metadata", async () => {
  const file = await png();
  assert.equal((await readImageUpload(upload(file))).size, file.size);
  const normalized = await normalizeImage(file);
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.format, "jpeg"); assert.equal(metadata.exif, undefined);
  const privateJpeg = await sharp(await file.arrayBuffer()).jpeg().withExif({ IFD0: { ImageDescription: "private test metadata" } }).toBuffer();
  assert.ok((await sharp(privateJpeg).metadata()).exif);
  const stripped = await normalizeImage(new File([new Uint8Array(privateJpeg)], "private.jpg", { type: "image/jpeg" }));
  assert.equal((await sharp(stripped).metadata()).exif, undefined);
  assert.equal(imageFileError({ type: "image/gif", size: 20 }) !== "", true);
  await assert.rejects(readImageUpload(upload(file, file)), status(400));
  await assert.rejects(normalizeImage(new File(["fake"], "spoof.png", { type: "image/png" })), status(415));
  await assert.rejects(normalizeImage(new File([await file.arrayBuffer()], "wrong.jpg", { type: "image/jpeg" })), status(415));
  await assert.rejects(normalizeImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.png", { type: "image/png" })), status(413));
  const bomb = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: "#fff" } }).png().toBuffer();
  await assert.rejects(normalizeImage(new File([new Uint8Array(bomb)], "bomb.png", { type: "image/png" })), status(415));
  for (const format of ["jpeg", "webp"] as const) {
    const bytes = await sharp(await file.arrayBuffer()).toFormat(format).toBuffer();
    assert.ok((await normalizeImage(new File([new Uint8Array(bytes)], "screen", { type: "image/" + format }))).length);
  }
});

test("streamed upload cap cannot be bypassed with a false Content-Length", async () => {
  const request = new Request(origin, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" },
    body: new Uint8Array(MAX_IMAGE_BYTES + 8193) });
  await assert.rejects(readImageUpload(request), status(413));
});

test("authentication and same-origin checks precede reading images and AI; missing config is graceful", async () => {
  let reads = 0, paidCalls = 0;
  const request = new Request(origin, { method: "POST", headers: { Origin: origin } });
  Object.defineProperty(request, "body", { get: () => { ++reads; throw new Error("must not read"); } });
  const denied = { authorize: async () => { throw new HttpError(401, "Sign in"); }, apiKey: "mock", extract: async () => { ++paidCalls; return parsed(); } };
  await assert.rejects(processImageExtraction(request, denied), status(401));
  assert.equal(reads, 0); assert.equal(paidCalls, 0);
  await assert.rejects(processImageExtraction(new Request(origin, { method: "POST", headers: { Origin: "https://foreign.example" } }), denied), status(403));
  await assert.rejects(processImageExtraction(upload(await png()), { authorize: async () => ({ consumeSlot: async () => ({ allowed: true, retryAfter: 600 }) }) }), status(503));
});

test("authenticated extraction consumes durable slot before AI; no task is saved by analysis", async () => {
  let consumed = 0, called = 0;
  const dependencies = {
    apiKey: "mock-only-key", now: new Date("2026-10-08T02:00:00Z"),
    authorize: async () => ({ consumeSlot: async () => { ++consumed; return { allowed: true, retryAfter: 600 }; } }),
    extract: async (_image: Buffer, _key: string, actualContext: typeof context) => {
      ++called; assert.equal(consumed, 1); assert.deepEqual(actualContext, context); return parsed();
    },
  };
  const response = await processImageExtraction(upload(await png()), dependencies);
  assert.equal(response.extraction.candidates.length, 1); assert.equal(called, 1);
  await assert.rejects(processImageExtraction(upload(await png()), { ...dependencies, authorize: async () => ({
    consumeSlot: async () => ({ allowed: false, retryAfter: 51 }),
  }) }), (error: unknown) => error instanceof ExtractionLimitError && error.retryAfter === 51);
  assert.equal(called, 1);
  await assert.rejects(processImageExtraction(upload(await png()), { ...dependencies, authorize: async () => ({
    consumeSlot: async () => { throw new HttpError(503, "Limiter unavailable"); },
  }) }), status(503));
  assert.equal(called, 1);
  await assert.rejects(processImageExtraction(upload(await png()), { ...dependencies, extract: async () => parsed([]) }), status(422));
});
