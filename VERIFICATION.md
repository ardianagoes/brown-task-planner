# Supabase migration verification

Verified October 6, 2026 with Node 24.19.0, Next.js 16.3.8, React 19.3.0,
node-ical 0.27.3, and the locked Supabase SSR/JS packages.

## Repository inspection

Before editing, inspected the workspace's source, configuration, dependency
manifests/locks, SQL, tests and previous verification notes. Compared the two app
copies. Work was applied to `outputs/deadline-tracker-starter`, which has the
configured Supabase environment and installed SDKs. The earlier
`outputs/deadline-tracker` copy and original starter ZIP were left intact.
Generated dependency/build directories were inventoried rather than treated as
application source. Environment values were not exposed in tool output or archives.

## Passed

- All **20 tests** passed. Eight tests execute the actual migration using PGlite's
  PostgreSQL engine with modeled Supabase auth roles and `auth.uid()`.
- SQL can be reapplied without deleting rows. Two users cannot read, insert,
  update, delete, or migrate each other's tasks. Anonymous task access is denied.
- Feed refresh preserves status/category. Browser migration preserves newer cloud
  rows, retries safely, and rolls back both rows and receipts on failure.
- Import limits persist per user, expire correctly, and cannot be reset/read by
  ordinary clients. DATE-only constraints and timestamp mappings passed.
- Seven ICS/core tests cover UTC/TZID/DST dates, reimport identity, cancelled and
  recurring entries, VTODO deadlines, unsafe/oversized links, SSRF protections,
  and 48-hour urgency.
- Five request/data tests cover task validation, row mapping, same-origin
  enforcement, safe auth destinations and actual UTF-8 body limits.
- Production build passed, including TypeScript validation. Dashboard, login,
  recovery, callback and API routes are dynamic; session proxy is present.
- Live development-server HTTP smoke checks passed: dashboard/recovery protection,
  signed-out rejection on every mutation/read route, rejection of foreign/missing
  mutation origins, no-store task responses, and callback destination safety.
- Browser checks passed: signed-out dashboard redirects to sign-in; signup and
  forgot-password navigation render the appropriate forms. No account was created,
  no real email sent, and no password changed during these checks.

## Hosted project check

The existing configured Supabase Auth endpoint responds successfully. Email/password
is enabled, signup is available, and email confirmation is required.
The final read-only check still returns **404 / PGRST205** for the tasks table:
**the hosted SQL migration has not yet been applied/verified**. The user elected to
run the finished migration in Supabase's SQL Editor. No management credentials or
database password were available, and none are needed by the application.

## Remaining checks after applying SQL

- Actual hosted row policies and functions through signed-in Supabase sessions.
- Confirmation/recovery emails and refreshed/expired-session behavior.
- Manual task/status persistence, browser-backup import and cross-device reads.
- A real personal Canvas/Gradescope feed and repeat import.
- Sign-in with a second real account to confirm hosted isolation.
- Vercel deployment with canonical HTTPS app URL and Auth redirect settings.

The old starter's localStorage dashboard checks do not count as verification of
these newly migrated authenticated flows. No hosted deployment was performed.
