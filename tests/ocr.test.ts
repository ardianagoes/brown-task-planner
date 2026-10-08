import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parseOcrText, parseDeadlineDate, parseDeadlineTime } from "../lib/ocr-parser";
import { analyzeScreenshotLocally, imageMatchesType, type OcrProgress } from "../lib/browser-ocr";
import { draftFromCandidate, taskFromDraft } from "../lib/assignment-draft";
const now = new Date("2026-10-08T02:00:00Z");
const zone = "America/New_York";
const parse = (text: string, confidence = 100) => parseOcrText(text, zone, now, confidence);

test("general OCR text parsing works across assignment pages, discussion, PDFs, emails and other apps", () => {
  const samples = [
    ["CSCI 0150 | Fruit Ninja Project\nDue October 12, 2026 at 11:59 PM America/New_York", "Fruit Ninja Project", "2026-10-12", "23:59", "Homework"],
    ["Problem Set 13 due Thursday, October 15 at 5 PM EST", "Problem Set 13", "2026-10-15", "17:00", "Homework"],
    ["Summer Internship Application\nDeadline: 10/15/2026", "Summer Internship Application", "2026-10-15", null, "Applications"],
    ["Essay from PDF syllabus\nSubmit by 20 October 2026", "Essay from PDF syllabus", "2026-10-20", null, "Homework"],
    ["Client deliverable\nDue date\n2026-10-20\n17:30 UTC", "Client deliverable", "2026-10-20", "17:30", "Job Tasks"],
    ["Personal reminder\nDeadline: 15/10/2026", "Personal reminder", "2026-10-15", null, "Other"],
  ];
  for (const [text, name, date, time, category] of samples) {
    const candidate = parse(text!).candidates[0];
    assert.equal(candidate.name, name); assert.equal(candidate.dueDate, date); assert.equal(candidate.dueTime, time); assert.equal(candidate.category, category);
  }
});

test("relative dates use the browser's current date in configured timezone; inferred years stay flagged", () => {
  for (const [expression, date] of [["tomorrow", "2026-10-08"], ["Friday", "2026-10-09"], ["in three days", "2026-10-10"], ["tonight", "2026-10-07"]]) {
    const result = parse("Homework\nDue " + expression);
    assert.equal(result.referenceDate, "2026-10-07");
    assert.equal(result.candidates[0].dueDate, date); assert.ok(result.candidates[0].uncertainFields.includes("dueDate"));
    assert.equal(result.candidates[0].dueTime, null);
  }
  assert.equal(parseOcrText("Homework\nDue tomorrow", "Asia/Tokyo", now).candidates[0].dueDate, "2026-10-09");
  assert.equal(parse("Homework\nDue January 15").candidates[0].dueDate, "2027-01-15");
  assert.equal(parseDeadlineDate("February 29", "2026-10-07").value, "2028-02-29");
  assert.ok(parse("Homework\nDue 10/15/26").candidates[0].uncertainFields.includes("dueDate"));
});

test("missing, ambiguous, conflicting and incidental dates are not invented as deadlines", () => {
  for (const text of ["Homework\nDue 10/11/2026", "Homework\nDue February 30, 2026",
    "Homework\nDue October 15, 2026 or October 20, 2026", "Homework\nPosted October 15, 2026\nMeeting October 20, 2026", "Homework", ""]) {
    const candidate = parse(text).candidates[0];
    assert.equal(candidate.dueDate, null); assert.ok(candidate.uncertainFields.includes("dueDate"));
  }
  const candidate = parse("Essay\nPosted October 1, 2026\nDue October 15, 2026\nAvailable until October 20, 2026").candidates[0];
  assert.equal(candidate.name, "Essay"); assert.equal(candidate.dueDate, "2026-10-15");
  const conflict = parse("Essay\nDue October 15, 2026\nDeadline October 20, 2026");
  assert.equal(conflict.candidates.length, 1); assert.equal(conflict.candidates[0].dueDate, null);
});

test("date-only OCR stays all-day; clear times convert correctly and ambiguous times stay blank", () => {
  const dateOnly = parse("Homework\nDue October 15, 2026").candidates[0];
  const task = taskFromDraft(draftFromCandidate(dateOnly, zone), "local-ocr");
  assert.equal(task.allDay, true); assert.equal(task.dueAt, "2026-10-15"); assert.equal(task.source, "Manual");
  const timed = parse("Homework\nDue October 15, 2026 at 5 PM EST").candidates[0];
  assert.equal(taskFromDraft(draftFromCandidate(timed, zone), "timed").dueAt, "2026-10-15T22:00:00Z");
  for (const expression of ["tomorrow at midnight", "October 15 at 5", "October 15 at 5 PM or 6 PM"]) {
    const result = parseDeadlineTime(expression);
    assert.equal(result.time, null); assert.equal(result.uncertain, true);
  }
  assert.equal(parseDeadlineTime("October 15 at 11:59 p.m.").time, "23:59");
  assert.equal(parseDeadlineTime("October 15 17:30 UTC+05:30").time, "17:30");
});

test("multiple deadlines produce candidates without platform-specific rules; OCR uncertainty and URLs stay reviewable", () => {
  const result = parse("Problem Set 1\nDue October 15, 2026\nhttps://example.edu/pset\nInternship application\nDeadline January 15, 2027");
  assert.equal(result.candidates.length, 2); assert.equal(result.candidates[1].category, "Applications");
  assert.equal(result.candidates[0].usefulUrl, "https://example.edu/pset");
  assert.equal(parse("Essay\nDue October 15, 2026\nhttps://example.edu/assig…").candidates[0].usefulUrl, null);
  const low = parse("Homework\nDue October 15, 2026 at 5 PM", 70).candidates[0];
  assert.ok(low.uncertainFields.includes("name")); assert.ok(low.uncertainFields.includes("dueDate")); assert.equal(low.dueTime, null);
});

function fakeWorker() {
  const messages: unknown[] = [];
  let terminated = 0;
  const fake = { onmessage: null, onerror: null, onmessageerror: null, postMessage: (value: unknown) => { messages.push(value); }, terminate: () => { terminated++; } } as unknown as Worker;
  const emit = (data: unknown) => fake.onmessage?.({ data } as MessageEvent);
  return { fake, messages, emit, get terminated() { return terminated; } };
}
test("browser orchestration posts pixels only to its local worker, reports progress, and terminates after OCR", async () => {
  const worker = fakeWorker(), progress: OcrProgress[] = [];
  const image = new Blob(["local test pixels"]);
  const pending = analyzeScreenshotLocally(new File(["x"], "private.png"), zone, value => progress.push(value), undefined,
    { prepare: async () => image, worker: () => worker.fake, now });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(worker.messages, [{ image }]);
  worker.emit({ type: "progress", status: "recognizing text", progress: 0.5 });
  worker.emit({ type: "result", text: "Homework\nDue tomorrow", confidence: 95 });
  assert.equal((await pending).candidates[0].dueDate, "2026-10-08"); assert.equal(worker.terminated, 1);
  assert.ok(progress.some(value => value.percent > 35 && value.percent < 100)); assert.equal(progress.at(-1)?.percent, 100);
});

test("local workers terminate on failure, malformed results, timeout or cancellation", async () => {
  for (const kind of ["error", "malformed", "timeout", "abort"]) {
    const worker = fakeWorker(), controller = new AbortController();
    const pending = analyzeScreenshotLocally(new File(["x"], "screen.png"), zone, undefined, controller.signal,
      { prepare: async () => new Blob(["x"]), worker: () => worker.fake, timeoutMs: kind === "timeout" ? 10 : 500 });
    const rejected = assert.rejects(pending);
    await new Promise(resolve => setImmediate(resolve));
    if (kind === "error") worker.emit({ type: "error" });
    if (kind === "malformed") worker.emit({ type: "result", text: 12, confidence: 90 });
    if (kind === "abort") controller.abort();
    await rejected; assert.equal(worker.terminated, 1);
  }
});

test("local image signatures reject spoofed PNG/JPEG/WebP contents", () => {
  assert.ok(imageMatchesType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"));
  assert.ok(imageMatchesType(new Uint8Array([255, 216, 255]), "image/jpeg"));
  assert.ok(imageMatchesType(new TextEncoder().encode("RIFF1234WEBP"), "image/webp"));
  assert.equal(imageMatchesType(new TextEncoder().encode("fake png"), "image/png"), false);
});

test("actual worker wrapper configures only local assets and no image/model cache or external OCR", async () => {
  const source = await readFile(new URL("../public/ocr-runner.js", import.meta.url), "utf8");
  const imported: string[] = [], sent: Record<string, unknown>[] = [];
  let options: Record<string, unknown> | undefined, terminated = 0;
  const scope = {
    Blob, URL, importScripts: (url: string) => imported.push(url),
    self: { location: { origin: "https://desk.example" }, onmessage: null as unknown, postMessage: (data: Record<string, unknown>) => sent.push(data), close() {} },
    Tesseract: { PSM: { AUTO: "3" }, createWorker: async (_language: string, _mode: number, config: Record<string, unknown>) => {
      options = config;
      return { setParameters: async () => {}, recognize: async () => ({ data: { text: "Homework due tomorrow", confidence: 95 } }), terminate: async () => { terminated++; } };
    } },
  };
  runInNewContext(source, scope);
  await (scope.self.onmessage as (event: unknown) => Promise<void>)({ data: { image: new Blob(["pixels"]) } });
  assert.deepEqual(imported, ["/ocr/tesseract.min.js"]);
  for (const key of ["workerPath", "corePath", "langPath"]) assert.equal(new URL(String(options![key])).origin, "https://desk.example");
  assert.equal(options!.cacheMethod, "none"); assert.equal(options!.workerBlobURL, false);
  assert.equal(sent[0].type, "result"); assert.equal(terminated, 1);
});

test("all engine variants and English data are bundled locally from installed packages", async () => {
  for (const name of ["tesseract.min.js", "worker.min.js", "eng.traineddata.gz", "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
    assert.ok((await stat(new URL("../public/ocr/" + name, import.meta.url))).size > 1000);
  }
  const manifest = JSON.parse(await readFile(new URL("../public/ocr/ASSETS.json", import.meta.url), "utf8"));
  assert.equal(manifest.tesseract, "7.0.0"); assert.equal(manifest.english, "1.0.0");
});
