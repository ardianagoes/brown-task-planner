import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { request } from "node:https";
import { allowedFeedUrl, fetchFeed } from "../lib/feed-fetch";
const feed = new URL("https://school.instructure.com/private.ics?token=PRIVATE_TEST_TOKEN");
const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
function downloader(status = 200, chunks: Buffer[] = [Buffer.from("BEGIN:VCALENDAR\nEND:VCALENDAR")], headers: Record<string, string> = {}, hang = false) {
  let options: Record<string, unknown> = {}, url: URL | undefined, calls = 0;
  const connect = ((target: URL, input: Record<string, unknown>, callback: (response: unknown) => void) => {
    calls++; options = input; url = target;
    const req = new EventEmitter() as EventEmitter & { destroy(error: Error): void; end(): void };
    req.destroy = error => { queueMicrotask(() => { req.emit("error", error); req.emit("close"); }); };
    req.end = () => queueMicrotask(() => {
      const response = Object.assign(new EventEmitter(), { statusCode: status, headers, resume() {} });
      callback(response);
      if (!hang && status === 200) { for (const chunk of chunks) response.emit("data", chunk); response.emit("end"); }
      if (!hang) req.emit("close");
    });
    return req;
  }) as unknown as typeof request;
  return { connect, inspect: () => ({ options, url, calls }) };
}

test("secure feed downloader retains allowlist, HTTPS, explicit headers, pinned lookup and TLS hostname", async () => {
  const fake = downloader(); const text = await fetchFeed(feed, { resolve, connect: fake.connect });
  assert.match(text, /BEGIN:VCALENDAR/); const { options, url } = fake.inspect();
  assert.equal(url?.hostname, feed.hostname); assert.equal(options.agent, false); assert.notEqual(options.rejectUnauthorized, false);
  assert.deepEqual(options.headers, { Accept: "text/calendar", "Accept-Encoding": "identity", "User-Agent": "DueDrop/1.0" });
  const pinned = options.lookup as (host: string, options: unknown, callback: (error: null, address: string, family: number) => void) => void;
  pinned("changed-host", {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, "8.8.8.8"); assert.equal(family, 4); });
  for (const value of ["http://school.instructure.com/feed", "https://school.instructure.com.evil.test/feed", "https://user:pass@school.instructure.com/feed", "https://127.0.0.1/feed", "https://[::1]/feed", "https://school.instructure.com:444/feed"]) assert.throws(() => allowedFeedUrl(value));
});

test("mixed/private DNS answers never open a connection and DNS resolution shares the total timeout", async () => {
  const fake = downloader();
  for (const address of ["169.254.169.254", "127.0.0.1", "::ffff:127.0.0.1", "fc00::1"]) await assert.rejects(fetchFeed(feed, { resolve: async () => [...await resolve(), { address, family: address.includes(":") ? 6 : 4 }], connect: fake.connect }), /public internet/);
  assert.equal(fake.inspect().calls, 0);
  await assert.rejects(fetchFeed(feed, { resolve: () => new Promise(() => {}), connect: fake.connect, timeoutMs: 15 }), /timed out/);
  assert.equal(fake.inspect().calls, 0);
});

test("redirects are rejected without following or exposing their private locations", async () => {
  const fake = downloader(302, [], { location: "https://127.0.0.1/?SECRET_REDIRECT" });
  await assert.rejects(fetchFeed(feed, { resolve, connect: fake.connect }), error => error instanceof Error && /direct feed URL/.test(error.message) && !/PRIVATE|SECRET/.test(error.message));
  assert.equal(fake.inspect().calls, 1);
});

test("feed limits reject declared or streamed oversize bodies and stalled downloads", async () => {
  for (const fake of [downloader(200, [], { "content-length": String(2 * 1024 * 1024 + 1) }), downloader(200, [Buffer.alloc(2 * 1024 * 1024 + 1)])]) await assert.rejects(fetchFeed(feed, { resolve, connect: fake.connect }), /2 MB/);
  await assert.rejects(fetchFeed(feed, { resolve, connect: downloader(200, [], {}, true).connect, timeoutMs: 15 }), /timed out/);
});
