import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseFeed } from "../lib/ics";
import { canvasImportWindow } from "../lib/import-policy";
import { toTaskRow } from "../lib/task-store";

const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const migrationPath = new URL("../supabase/migrations/20261006000000_production_tasks.sql", import.meta.url);

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${alice}'), ('${bob}');
  `);
  await db.exec(await readFile(migrationPath, "utf8"));
});
after(async () => { await db.close(); });

async function asUser<T>(userId: string | null, callback: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  try { return await callback(); }
  finally { await db.exec("reset role"); }
}
function task(id: string, overrides: Record<string, unknown> = {}) {
  return { id, name: "Homework", due_at: "2026-10-07T18:00:00Z", due_date: null,
    category: "Homework", status: "To Do", urls: [], source: "Canvas", ...overrides };
}
async function importTasks(tasks: unknown[]) {
  return db.query<{ count: number }>("select public.import_tasks($1::jsonb) as count", [JSON.stringify(tasks)]);
}
async function migrate(tasks: unknown[], key: string) {
  const result = await db.query<{ result: { alreadyMigrated: boolean; inserted: number } }>(
    "select public.migrate_browser_tasks($1::jsonb, $2) as result", [JSON.stringify(tasks), key]);
  return result.rows[0].result;
}

test("migration can be reapplied without deleting existing task rows", async () => {
  await asUser(alice, () => importTasks([task("retained")]));
  await db.exec(await readFile(migrationPath, "utf8"));
  const result = await asUser(alice, () => db.query("select id from public.tasks where id='retained'"));
  assert.equal(result.rows.length, 1);
});

test("RLS restricts authenticated reads, inserts, updates and deletes to their owner", async () => {
  await asUser(alice, () => importTasks([task("alice-row")]));
  await asUser(bob, () => importTasks([task("bob-row")]));
  await asUser(bob, async () => {
    const read = await db.query("select id from public.tasks where id='alice-row'");
    assert.equal(read.rows.length, 0);
    const updated = await db.query("update public.tasks set status='Submitted/Done' where id='alice-row' returning id");
    assert.equal(updated.rows.length, 0);
    const deleted = await db.query("delete from public.tasks where id='alice-row' returning id");
    assert.equal(deleted.rows.length, 0);
    await assert.rejects(db.query("insert into public.tasks(user_id,id,name,due_at,category,status,source) values($1,'forged','Bad','2026-10-07','Homework','To Do','Manual')", [alice]), /row-level security/);
    await assert.rejects(db.query("update public.tasks set user_id=$1 where id='bob-row'", [alice]), /row-level security/);
    await db.query("update public.tasks set status='In Progress' where id='bob-row'");
    const own = await db.query<{ status: string }>("select status from public.tasks where id='bob-row'");
    assert.equal(own.rows[0].status, "In Progress");
    const deletedOwn = await db.query("delete from public.tasks where id='bob-row' returning id");
    assert.equal(deletedOwn.rows.length, 1);
  });
});

test("anonymous users cannot CRUD tasks or call privileged task functions", async () => {
  await asUser(null, async () => {
    for (const query of ["select * from public.tasks", "insert into public.tasks(id) values('anon')", "update public.tasks set name='Bad'", "delete from public.tasks",
      "select public.import_tasks('[]'::jsonb)", "select public.migrate_browser_tasks('[]'::jsonb,'anon')", "select public.consume_import_slot()"])
      await assert.rejects(db.exec(query), /permission denied/);
  });
});

test("feed refresh preserves a concurrently completed status/category and scopes ownership", async () => {
  await asUser(alice, async () => {
    await importTasks([task("import-row", { user_id: bob })]);
    await db.exec("update public.tasks set status='Submitted/Done',category='Other' where id='import-row'");
    await importTasks([task("import-row", { name: "Moved deadline", due_at: "2026-10-09T18:00:00Z" })]);
    const result = await db.query<{ user_id: string; status: string; category: string; name: string }>("select user_id,status,category,name from public.tasks where id='import-row'");
    assert.deepEqual(result.rows[0], { user_id: alice, status: "Submitted/Done", category: "Other", name: "Moved deadline" });
  });
  const invisible = await asUser(bob, () => db.query("select id from public.tasks where id='import-row'"));
  assert.equal(invisible.rows.length, 0);
});

test("Repeated Canvas feed imports create one database record and preserve status/category/history", async () => {
  const feed = "https://school.instructure.com/private-test-calendar.ics";
  const calendar = (name: string, due: string) => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:repeat-canvas\nSUMMARY:${name}\nDTSTART:${due}\nEND:VEVENT\nEND:VCALENDAR`;
  const first = await parseFeed(calendar("Original assignment", "20261008T180000Z"), feed, "Canvas");
  const id = first.tasks[0].id;
  await asUser(alice, async () => {
    const window = canvasImportWindow(first.tasks, new Set(), new Date("2026-10-06T12:00:00Z"));
    for (let attempt = 0; attempt < 3; attempt++) await importTasks(window.tasks.map(item => toTaskRow(item, alice)));
    await db.query("update public.tasks set status='Submitted/Done', category='Applications' where id=$1", [id]);
    const next = await parseFeed(calendar("Moved assignment", "20261009T180000Z"), feed, "Canvas");
    assert.equal(next.tasks[0].id, id);
    const refresh = canvasImportWindow(next.tasks, new Set([id]), new Date("2026-10-06T12:00:00Z"));
    await importTasks(refresh.tasks.map(item => toTaskRow(item, alice)));
    // An existing assignment may still refresh after its deadline; never delete its history.
    const history = canvasImportWindow(next.tasks, new Set([id]), new Date("2026-12-01T12:00:00Z"));
    assert.equal(history.tasks.length, 1);
    await importTasks(history.tasks.map(item => toTaskRow(item, alice)));
    const records = await db.query<{ name: string; status: string; category: string }>("select name,status,category from public.tasks where id=$1", [id]);
    assert.deepEqual(records.rows, [{ name: "Moved assignment", status: "Submitted/Done", category: "Applications" }]);
  });
});

test("browser migration is idempotent, preserves newer cloud rows, and is isolated per user", async () => {
  await asUser(alice, async () => {
    await importTasks([task("cloud-newer", { name: "Cloud latest", status: "Submitted/Done" })]);
    const first = await migrate([task("cloud-newer", { name: "Old browser" }), task("browser-only", { status: "In Progress" })], "device-one");
    assert.deepEqual(first, { alreadyMigrated: false, inserted: 1 });
    const retry = await migrate([task("browser-only", { status: "To Do" })], "device-one");
    assert.deepEqual(retry, { alreadyMigrated: true, inserted: 0 });
    const rows = await db.query<{ name: string; status: string }>("select name,status from public.tasks where id='cloud-newer'");
    assert.deepEqual(rows.rows[0], { name: "Cloud latest", status: "Submitted/Done" });
  });
  const other = await asUser(bob, () => migrate([task("bob-local")], "device-one"));
  assert.equal(other.inserted, 1);
  const receipts = await asUser(bob, () => db.query<{ user_id: string }>("select user_id from public.task_migrations"));
  assert.ok(receipts.rows.every(row => row.user_id === bob));
});

test("a failed batch rolls back its browser migration receipt and all inserted rows", async () => {
  await asUser(alice, async () => {
    await assert.rejects(migrate([task("rollback-valid"), task("rollback-invalid", { status: "invalid" })], "rollback-device"), /check constraint/);
    const receipts = await db.query("select * from public.task_migrations where migration_key='rollback-device'");
    const tasks = await db.query("select * from public.tasks where id='rollback-valid'");
    assert.equal(receipts.rows.length, 0);
    assert.equal(tasks.rows.length, 0);
    assert.equal((await migrate([task("rollback-valid")], "rollback-device")).inserted, 1);
  });
});

test("DATE-only rows retain their date and require exactly one deadline representation", async () => {
  await asUser(alice, async () => {
    await importTasks([task("all-day", { due_at: null, due_date: "2026-10-08" })]);
    const row = await db.query<{ due_date: string; due_at: null }>("select due_date::text,due_at from public.tasks where id='all-day'");
    assert.deepEqual(row.rows[0], { due_date: "2026-10-08", due_at: null });
    await assert.rejects(importTasks([task("double-date", { due_date: "2026-10-08" })]), /check constraint/);
  });
});

test("durable import limits are per-user and cannot be reset by ordinary clients", async () => {
  await asUser(alice, async () => {
    for (let i = 0; i < 11; i++) {
      const result = await db.query<{ result: { allowed: boolean; retryAfter: number } }>("select public.consume_import_slot() as result");
      assert.equal(result.rows[0].result.allowed, i < 10);
      assert.ok(result.rows[0].result.retryAfter > 0);
    }
    await assert.rejects(db.exec("delete from public.import_rate_limits"), /permission denied/);
    await assert.rejects(db.exec("select * from public.import_rate_limits"), /permission denied/);
  });
  const bobLimit = await asUser(bob, () => db.query<{ result: { allowed: boolean } }>("select public.consume_import_slot() as result"));
  assert.equal(bobLimit.rows[0].result.allowed, true);
  await db.query("update public.import_rate_limits set window_start=now()-interval '11 minutes' where user_id=$1", [alice]);
  const reset = await asUser(alice, () => db.query<{ result: { allowed: boolean } }>("select public.consume_import_slot() as result"));
  assert.equal(reset.rows[0].result.allowed, true);
});
