# Dashboard UX refresh verification

Verified October 6, 2026 with the repository's locked Next.js, React, Supabase,
node-ical and PGlite dependencies.

## Repository and database scope

Pulled current `main` and inspected the existing implementation before editing.
Work is in the existing `ardianagoes/brown-task-planner` checkout on
`codex/dashboard-ux-refresh`. No duplicate project or ZIP was created.

The owner reports that `20261006000000_production_tasks.sql` has already been
applied to the live Supabase project. This refresh requires no schema changes;
the applied migration is unchanged. Auth/session verification, RLS, persisted
status writes, browser-backup migration and the secure HTTPS downloader are
unchanged. No personal feed URL was retained or logged.

## Automated verification

- `npm run typecheck`: passed.
- `npm test`: all **28 tests** passed.
- `npm run build`: passed.
- `npm run test:smoke`: passed against the local development server.

The tests include nine actual PostgreSQL/PGlite migration tests covering owner
isolation, anonymous denial, atomic imports, rollback, repeated feed imports,
status/category preservation, browser-migration receipts, date constraints and
durable rate limits. SQL execution is local and does not alter the live project.

New coverage checks yesterday/today/tomorrow and all-day Canvas deadlines;
earlier-today inclusion; New York fallback, UTC midnight, DST and Tokyo date
boundaries; existing history preservation; repeated parser-to-database imports
producing one record; status/category preservation after a deadline moves;
Active/Completed partitions; completed calendar retention; and checkbox
transitions. The timezone process test also checks all-day dates east of UTC.
Existing task/date validation, URL/SSRF and request protections remain covered.

HTTP smoke checks cover signed-out dashboard/recovery protection, rejection of
unauthenticated reads/mutations, foreign/missing mutation-origin rejection,
private/no-store responses and safe callback destinations.

## Browser verification

Used the real workspace, task rows, status controls and calendar components with
temporary local sample data. The fixture route was removed before the final build
and is not included in the commit.

- Active/Completed counts, keyboard tab navigation and task movement passed.
- Checking either status clears the other; unchecking returns to To Do.
- Completed tasks remain visible in the calendar, dimmed and crossed out.
- Two compact previews and +N more open every task's full details, links and status.
- Escape and Close dismiss the native dialog and restore focus to the opener.
- At a 390px viewport, the calendar scrolls within its container and the dialog
  fits the viewport with readable wrapped task names.
- Dark sign-in, signup and forgot-password forms rendered without console errors.

These browser checks use sample data for UI interaction, not a signed-in account.
Persisted status writes retain the existing API path; database behavior is covered
by the SQL tests. No account was created, email sent or password changed.

## Manual checks before merging/deploying

- Sign in to the hosted project, create a task, toggle both statuses, reload and
  confirm persistence from another device.
- Import a personal Canvas feed twice. Confirm new past dates are skipped, today's
  earlier deadlines remain, and existing history/status/category are preserved.
- Check category filtering and calendar day details on desktop and mobile.
- Check browser-backup migration and account isolation using a second real account.
- Exercise actual email confirmation/recovery and session refresh.
- Verify the Vercel canonical HTTPS URL, Auth redirects and
  `APP_TIMEZONE=America/New_York`.

No hosted deployment or authenticated live-project verification was performed
during this refresh.
