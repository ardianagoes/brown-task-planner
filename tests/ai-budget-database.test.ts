import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Admission } from "../lib/ai-admission";
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111", bob = "22222222-2222-4222-8222-222222222222", carol = "33333333-3333-4333-8333-333333333333";
const proposal = new URL("../docs/sql/20261109000000_ai_admission_proposal.sql", import.meta.url);
const ip = "a".repeat(64);
before(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(await readFile(proposal, "utf8"));
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.screenshot_ai_attempts");
  await db.query("update public.screenshot_ai_policy set allowed_user_ids=$1::uuid[],global_daily=20,global_monthly=100,user_daily=5,ip_ten_minutes=3,global_active=2", [[alice, bob, carol]]);
});
after(async () => db.close());
async function asUser<T>(id: string | null, action: () => Promise<T>) {
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ""]);
  try { return await action(); } finally { await db.exec("reset role"); }
}
async function reserve(user = alice, hash = ip, id = randomUUID()): Promise<Admission> {
  return asUser(user, async () => (await db.query<{ slot: Admission }>("select public.reserve_screenshot($1,$2::uuid) as slot", [hash, id])).rows[0].slot);
}
async function expireLeases() { await db.exec("update public.screenshot_ai_attempts set lease_until=clock_timestamp()-interval '1 second'"); }

test("proposal is repeatable and defaults to no paid accounts; NULL allowlist elements never grant access", async () => {
  await db.exec(await readFile(proposal, "utf8"));
  await db.exec("update public.screenshot_ai_policy set allowed_user_ids='{}'");
  assert.equal((await reserve()).reason, "account");
  await db.exec("update public.screenshot_ai_policy set allowed_user_ids=array[null]::uuid[]");
  assert.equal((await reserve()).reason, "account");
  assert.equal((await db.query("select * from public.screenshot_ai_attempts")).rows.length, 0);
});

test("anonymous callers and unapproved/new accounts cannot reserve shared AI quota", async () => {
  await assert.rejects(asUser(null, () => db.query("select public.reserve_screenshot($1,$2::uuid)", [ip, randomUUID()])), /permission denied/);
  await db.query("update public.screenshot_ai_policy set allowed_user_ids=$1::uuid[]", [[alice]]);
  assert.equal((await reserve(bob)).reason, "account"); assert.equal((await reserve(alice)).allowed, true);
  assert.equal((await db.query("select * from public.screenshot_ai_attempts")).rows.length, 1);
});

test("private policy and usage tables cannot be read, changed or cleared by authenticated users", async () => {
  await reserve();
  await asUser(alice, async () => {
    for (const query of ["select * from public.screenshot_ai_policy", "update public.screenshot_ai_policy set global_daily=200", "delete from public.screenshot_ai_attempts", "select * from public.screenshot_ai_attempts", "truncate public.screenshot_ai_attempts"])
      await assert.rejects(db.exec(query), /permission denied/);
  });
});

test("per-user and global admission leases persist across calls and expire conservatively", async () => {
  assert.equal((await reserve(alice)).allowed, true);
  assert.equal((await reserve(alice, "b".repeat(64))).reason, "busy");
  assert.equal((await reserve(bob)).allowed, true);
  assert.equal((await reserve(carol)).reason, "busy");
  await expireLeases(); assert.equal((await reserve(carol)).allowed, true);
});

test("replayed request IDs cannot spend twice, including after their lease expires", async () => {
  const id = randomUUID(); assert.equal((await reserve(alice, ip, id)).allowed, true);
  assert.equal((await reserve(alice, ip, id)).reason, "duplicate"); await expireLeases();
  assert.equal((await reserve(alice, ip, id)).reason, "duplicate");
  assert.equal((await db.query("select * from public.screenshot_ai_attempts")).rows.length, 1);
});

test("per-IP and per-user daily caps cannot be bypassed by changing request IDs", async () => {
  await db.exec("update public.screenshot_ai_policy set ip_ten_minutes=2");
  assert.equal((await reserve(alice)).allowed, true); await expireLeases();
  assert.equal((await reserve(bob)).allowed, true); await expireLeases();
  assert.equal((await reserve(carol)).reason, "ip");
  await db.exec("truncate public.screenshot_ai_attempts; update public.screenshot_ai_policy set user_daily=2,ip_ten_minutes=20");
  for (let n = 0; n < 2; n++) { assert.equal((await reserve(alice)).allowed, true); await expireLeases(); }
  assert.equal((await reserve(alice, "b".repeat(64))).reason, "daily");
});

test("global daily and monthly caps apply across users and IPs, retaining all admitted attempts", async () => {
  await db.exec("update public.screenshot_ai_policy set global_daily=2");
  assert.equal((await reserve(alice)).allowed, true); await expireLeases(); assert.equal((await reserve(bob)).allowed, true); await expireLeases();
  assert.equal((await reserve(carol, "c".repeat(64))).reason, "daily");
  await db.exec("update public.screenshot_ai_policy set global_daily=20,global_monthly=2");
  assert.equal((await reserve(carol)).reason, "monthly");
  assert.equal((await db.query("select * from public.screenshot_ai_attempts")).rows.length, 2);
});

test("UTC quota rollover and bounded limiter retention do not remove current-month budget records", async () => {
  await reserve(); await expireLeases();
  await db.exec("update public.screenshot_ai_attempts set created_at=date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC'");
  assert.equal((await reserve(bob)).allowed, true);
  await db.query("insert into public.screenshot_ai_attempts values($1,$2,$3,clock_timestamp()-interval '36 days',clock_timestamp()-interval '36 days')", [carol, randomUUID(), ip]);
  await expireLeases(); await reserve(carol);
  assert.equal((await db.query("select * from public.screenshot_ai_attempts")).rows.length, 3);
  await assert.rejects(reserve(alice, "raw IP address"), /Invalid admission request/);
});
