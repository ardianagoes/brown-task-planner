# Deadline desk

A Next.js App Router application with Supabase Auth and private Postgres task storage.
The dashboard supports screenshot-assisted and manual tasks, list/monthly calendar views, status tracking,
category colors, deadline sorting, category filters, Active/Completed list tabs,
compact calendar day details, and 48-hour urgency. All screens use a dark theme.
Canvas/Gradescope ICS feeds are downloaded and parsed by an authenticated Node route.

## Finish setup

The production SQL migration has already been applied to the configured project.
Screenshot task creation requires no SQL changes. For a new Supabase project only,
apply the migration below; then configure Auth URLs and environment variables.

1. Open `supabase/migrations/20261006000000_production_tasks.sql`.
2. Paste **the entire file** into your project's Supabase SQL Editor and run it.
   It is transactional, can be reapplied, and also supports the original starter
   schema. It creates tables, ownership policies, import functions, migration
   receipts, and durable import limits. Existing tasks are retained.
3. In Supabase **Authentication → URL Configuration**, set Site URL to the app's
   canonical origin. For local testing use `http://127.0.0.1:3000`. Add these exact
   redirect URLs:
   - `http://127.0.0.1:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback?next=/auth/reset`
   When deploying, add the equivalent HTTPS URLs for your deployment and set Site
   URL to that deployment. Keep local URLs only if you still use them.
4. Enable email/password authentication. The currently configured project requires
   email confirmation. Confirm your account before signing in. Configure production
   email delivery in Supabase if needed for your users.
5. Fill `.env.local` using the variables below. **If it already exists, edit it;
   do not overwrite your configured credentials with the example file.**
6. Run the app, create/confirm your account, and sign in.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:3000>. In Windows PowerShell, use `npm.cmd` if execution
policy blocks `npm.ps1`. A current Node.js LTS release with Node 20.9+ is required.

For a new checkout only, copy `.env.example` to `.env.local` first:

```powershell
Copy-Item .env.example .env.local
```

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project's URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your project's publishable key |
| `NEXT_PUBLIC_APP_URL` | Exact public origin: local HTTP for development, HTTPS in production |
| `ICS_ALLOWED_HOSTS` | Optional comma-separated exact school/exporter hostnames |
| `APP_TIMEZONE` | Timezone for screenshot relative dates, floating ICS timestamps and the Canvas import date cutoff; defaults to `America/New_York` |
| `OPENAI_API_KEY` | Server-only OpenAI project API key; screenshot analysis is unavailable without it |
| `OPENAI_IMAGE_MODEL` | Server-only vision + structured-output model; defaults to `gpt-5.4-mini` |

This application requires no service-role key or database password. Public variables
are compiled into the browser bundle; changing them requires a new production build.
Keep `.env.local` out of source control and archives.

Set `APP_TIMEZONE=America/New_York` locally and in Vercel. Vercel reserves `TZ`,
so remove that old environment entry from your deployment settings. At Node server
startup, `instrumentation.ts` applies `APP_TIMEZONE` to the runtime timezone used by
the existing ICS parser. Restart the server after changing it. If the setting is
missing or empty, the runtime uses `America/New_York`.

Auth implementation follows the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).
See [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls) and
[password authentication](https://supabase.com/docs/guides/auth/passwords) for project settings.

## Email confirmation and recovery

The default Supabase email links use the PKCE callback at `/auth/callback`. Open
those links in the browser that requested them so its verifier cookie is available.
The app also supports `/auth/confirm` with token hashes for custom email templates.
To support confirmation/recovery across browsers, configure these link targets in
Supabase's email templates (Site URL must be your intended app origin):

```html
<!-- Confirm signup -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm account</a>
<!-- Reset password -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

Password recovery lands on `/auth/reset`, which requires a verified session. Invalid
or expired links return to sign-in with a clear message. Only `/` and `/auth/reset`
are valid destinations; callback parameters cannot redirect to another site.
The signup/reset forms require at least 12 characters. Supabase's configured password
policy may require more.

## Migrate browser tasks

Sign in on the **same browser and origin** used by the original app. If its
`deadline-desk.tasks.v1` backup is present, the dashboard displays the task count and
account email. Select **Import browser tasks** after checking that email.

The database inserts tasks and a migration receipt in one transaction. Retrying the
same migration is safe, and existing cloud records are never overwritten. The
original browser backup is never removed or changed. A successful import records
which account claimed that browser backup so it is not automatically offered to a
different account. Limits are 2,000 tasks and 2 MB per migration request. An invalid
backup produces an error and remains untouched.

New saves use Supabase exclusively. If storage is unavailable, the app shows an
error and retains the form for retry. It does not silently save cloud changes only
in the browser. Manual-save retries reuse the same task ID to avoid duplicates.

## Screenshot task creation

**Paste Screenshot** is the default Add a task tab. Capture any assignment,
application or deadline with Windows **Win + Shift + S**, then **Ctrl + V** in
the dashboard. You can also drop an image or choose a file. PNG, JPEG and WebP
are accepted up to 3 MB. Pasting in text inputs remains ordinary text entry.
The local preview supports replacement/removal and sends nothing until you click
**Analyze Screenshot**. **Manual Entry** remains available without an AI key.

The server verifies the Supabase session using `getUser()`, checks the request
origin, bounds the upload stream and fully decodes the image. It rejects invalid,
mismatched, animated or excessively large images (16 million input pixels),
strips image metadata, and resizes to at most 1600 × 1600 before sending pixels
to OpenAI. No platform-specific scraping, APIs or recognition rules are used:
the model reads visible information from any website/app/email/PDF/slide.
Screenshot text is treated as untrusted data, and the model has no tools.
Strict structured output is validated again on the server.

Review the detected task's editable name, date, time, timezone, category and URLs.
When several tasks are detected (up to five), choose one; none is selected
automatically. Each analysis saves at most one independently confirmed task.
Only **Add Assignment** creates a record through the existing task API, using
`Manual` / `To Do` and a fresh ID. Tasks appear in both normal views.
Possible duplicates with the same name/deadline require an explicit checkbox;
existing tasks are never overwritten. An unchanged save retry reuses its ID.
Successful saves clear the image; failures keep the draft for retry.

Relative dates use the server's current calendar date in `APP_TIMEZONE`
(fallback `America/New_York`), shown in the review. Supported expressions
include today/tonight, tomorrow, weekdays, and “in three days.” Relative dates
and inferred years are flagged for confirmation because screenshots may be old.
Missing/conflicting/ambiguous dates stay blank. Missing or ambiguous times stay
unspecified: no 11:59 PM default is added. Keep an all-day task or enter a time.
Timed tasks convert an editable IANA zone or explicit UTC offset to UTC;
nonexistent/repeated DST times are rejected until corrected. All-day tasks retain
their literal YYYY-MM-DD date. Complete visible HTTP(S) URLs may be suggested;
partial addresses are never invented. AI extraction can make mistakes: always
check the original deadline before confirming.

### OpenAI setup and request limits

Add these values to your existing `.env.local`, then restart development:

```dotenv
OPENAI_API_KEY=your_project_api_key
OPENAI_IMAGE_MODEL=gpt-5.4-mini
APP_TIMEZONE=America/New_York
```

Use an OpenAI API project with available billing/quota and access to the chosen
model. ChatGPT subscriptions do not configure this server's API credentials.
Never prefix these AI variables with `NEXT_PUBLIC_`, commit the key, or paste
it into the application. In **Vercel → Project → Settings → Environment
Variables**, add the same server-only values for the intended deployment
environments, then redeploy. Existing Supabase settings remain unchanged.
No new SQL migration is needed: extraction uses the existing atomic
`consume_import_slot()` RPC. Screenshot analyses and ICS imports share **ten
attempts per user per ten minutes**, across server instances. Invalid decoded
images and failed provider calls also consume a slot; limiter failure blocks AI.

The default [GPT-5.4 mini model](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
supports image input and structured output. At the documented standard rates,
input costs $0.75 per million tokens and output $4.50 per million tokens; image
input is billed in tokens. Actual cost varies with the image and generated
details. Every request uses one image, a 3,000 output-token cap, a 20-second
provider timeout, and no automatic paid retries. Upload reading times out after
10 seconds; image decode/processing is bounded; the route allows 45 seconds.
These controls bound per-request work, not your total account spending.
Monitor OpenAI project usage and configure budget alerts before broad usage.
Unsupported models, missing keys, quota failures, unusable responses and
timeouts show retryable messages with Manual Entry available.

Images stay in transient browser/server memory; the app writes neither images
nor base64 payloads to storage or logs. The request sends normalized pixels to
OpenAI after your explicit click, with `store: false`. This disables Responses
storage, but [OpenAI retention policies](https://developers.openai.com/api/docs/guides/your-data)
still apply, including standard abuse-monitoring retention. Crop out unrelated
personal information before analysis. Keep screenshot bodies out of any custom
hosting/observability logs. Only your confirmed task fields persist in Supabase.

## File structure

```text
app/
  page.tsx                    server-verified dashboard entry
  login/page.tsx              sign-in, signup and recovery forms
  auth/callback/route.ts      PKCE email callback
  auth/confirm/route.ts       token-hash email confirmation
  auth/reset/page.tsx         authenticated password reset
  auth/signout/route.ts       same-origin sign-out
  api/tasks/route.ts          read/create tasks
  api/tasks/[id]/route.ts     change status or delete an owned task
  api/tasks/migrate/route.ts  atomic browser-backup migration
  api/tasks/extract-image/route.ts  authenticated screenshot analysis (no task writes)
  api/import/route.ts         authenticated ICS import
components/
  dashboard.tsx               task UI and confirmed server saves
  task-creator.tsx             screenshot/manual tabs, candidates and retry identity
  screenshot-input.tsx         local clipboard/drop/upload preview
  task-review-form.tsx         editable confirmation and duplicate warnings
  manual-task-form.tsx         preserved manual input flow
  task-workspace.tsx          view switch, category/sort filters and completion tabs
  task-row.tsx                full task information and useful links
  task-status-controls.tsx    mutually exclusive status checkboxes
  calendar-view.tsx           compact month previews and day overflow
  calendar-day-details.tsx    native dialog with all tasks for a day
  auth-panel.tsx              email/password authentication
  reset-password.tsx          password update form
lib/
  supabase/                   browser/server clients and database types
  api.ts                      verified identity and safe API responses
  http.ts                     origin, redirect and body-size checks
  task-store.ts               task-row mapping and paginated reads
  tasks.ts                    types, validation, colors and urgency
  feed-fetch.ts               restricted HTTPS downloader
  ics.ts                      ICS parsing and stable task IDs
  import-policy.ts            timezone-aware Canvas date cutoff
  task-workflow.ts            list/calendar filtering and status transitions
  assignment-draft.ts         AI validation, date interpretation and draft conversion
  image-limits.ts             shared client/server upload limits
  image-upload.ts             bounded multipart reading and real image decoding
  image-extraction.ts         authenticated/rate-limited extraction orchestration
  openai-image.ts             server-used Responses API and strict output schema
proxy.ts                      cookie refresh and private cache headers
instrumentation.ts            server timezone initialization
supabase/migrations/           authoritative production SQL
supabase/schema.sql            pointer to the migration (executes no SQL)
tests/                        core, request and PostgreSQL/RLS tests
scripts/smoke.cjs              live signed-out HTTP checks
.env.example
VERIFICATION.md
```

## Storage and access

Timed deadlines use `timestamptz`; all-day deadlines use `date`. A constraint requires
exactly one. Tasks have a composite key `(user_id, id)`. Supabase row policies restrict
reads, inserts, updates and deletes to the authenticated owner, including direct Data
API calls. Server routes additionally verify identity with `getUser()`, derive the
owner themselves, validate inputs, and reject foreign/missing mutation origins.

Next.js 16 `proxy.ts` verifies/refreshes the cookie session using `getClaims()` and
passes updated cookies to the server and browser. Personalized pages and API responses
use private, no-store caching. Account changes clear displayed tasks; delayed responses
from the previous account are discarded. Visible tabs refresh account tasks once a
minute and on focus. This is cross-device persistence with polling, not realtime push.

The list reads in pages to avoid Supabase's default 1,000-row response cap. Active
contains To Do and In Progress tasks; Completed retains finished tasks and their
dates, categories, sources and links. Checking In progress or Completed clears the
other state; unchecking the selected state returns the task to To Do. Every change
uses the existing persisted status API.

Select **Delete** on a list row or in calendar day details, then confirm **Delete
task** to permanently remove it from your account. Cancel leaves it unchanged.
The UI removes the record only after a successful server response; failed deletes
remain visible with a retryable error. Deletion is owner-scoped and safe to retry.
Deleting an imported assignment does not suppress it from its feed: a later import
can recreate it if it remains eligible. Your original browser backup is unchanged.

The calendar shows both active and completed tasks, with completed titles dimmed
and crossed out. Category filters apply to both views. Each day shows at most two
previews; select a preview or +N more for all details and status controls. Escape or
Close dismisses the day dialog and restores focus to its opener. Smaller screens
can scroll the month horizontally while the detail panel fits the viewport.
Colors are Homework blue, Applications violet, Job Tasks amber, and Other teal.
Overdue and unfinished deadlines within 48 hours have red flags. These are visual
indicators, not email or push notifications.

## ICS imports

In Canvas, open Calendar → Calendar Feed and copy the subscription URL. Paste it in
the dashboard, select its source, and import. Gradescope requires an actual ICS feed
provided by your institution or exporter; a course page URL does not work.

- `VEVENT.DTSTART` and `VTODO.DUE` supply deadlines. HTTP(S) event URLs become useful
  links. Imported tasks start as Homework / To Do.
- New Canvas entries are imported only when their calendar date is today or later
  in `APP_TIMEZONE` (fallback `America/New_York`). Earlier deadlines on the same
  day are retained. All-day events keep their literal date. Existing Canvas records,
  including historical/completed tasks, can still refresh; no records are deleted
  or automatically completed. Gradescope imports retain their existing behavior.
  The result reports imported/refreshed assignments and skipped past assignments.
- Reimporting the same source, feed URL and event UID updates names, deadlines and
  links while preserving existing status/category. The database applies the batch
  atomically. Feed token rotation changes the identity and can create new entries.
- Each account gets ten download attempts per ten-minute window. The atomic counter
  lives in Postgres so it works across serverless instances; failure to check it
  blocks the import. Failed downloads also consume an attempt.
- Built-in domains are `instructure.com` and `gradescope.com`, including their
  subdomains. Extra `ICS_ALLOWED_HOSTS` entries match exact hostnames. Restart the
  server or redeploy after changing the allowlist.
- `webcal://` becomes HTTPS. The downloader checks hosts/ports/public addresses,
  pins the resolved public IP, rejects redirects, limits feeds to 2 MB and times out
  after 12 seconds. Use the feed's canonical URL when redirects are present.
- Private subscription URLs are sent in the request body and are not retained in
  task storage or logged by this application. Ensure any hosting request-body
  logging you configure also excludes this endpoint.
- Timed events respect UTC/TZID. Floating timestamps use server `APP_TIMEZONE`. Manual entry
  uses the browser timezone and rejects nonexistent spring-DST local times.
- All-day items retain their date and show time unspecified. Urgency uses local
  end-of-day; check the assignment page for an official submission time.
- RRULE series and cancelled/incomplete entries are skipped with messages.
  Previously imported records remain to preserve history. Recurrence expansion,
  automatic feed polling, cancellation reconciliation, and merging assignments
  across Canvas/Gradescope are not implemented.

## Deploy on Vercel

1. Apply the SQL above and complete the local sign-in/task checks below.
2. Push this project directory to your Git repository and import it into Vercel as
   a Next.js project. This repository has its application at the repository root.
3. Set the environment variables from the table, including the server-only OpenAI
   values if screenshot analysis is desired. Production
   `NEXT_PUBLIC_APP_URL` must be the exact HTTPS origin you will open, with no path.
   Origin validation deliberately rejects alternate preview domains; configure
   each preview environment's own app URL and Supabase redirect allowlist.
4. Add the deployment callback URLs to Supabase Auth and set its production Site URL.
5. Deploy/rebuild, then complete confirmation, password recovery, task save/reload,
   a second-account isolation check, and a real feed import.

No hosted deployment has been performed by this migration work.

## Verify

```sh
npm run typecheck
npm test
npm run build
# With npm run dev running separately and no signed-in HTTP cookies:
npm run test:smoke
```

The SQL tests execute the actual migration with PGlite's PostgreSQL engine and model
Supabase's auth roles/UID. They cover two-account CRUD isolation, anonymous denial,
atomic/repeated imports, status/category preservation, rollback, migration retries,
date constraints and durable limits. Unit tests also cover Canvas calendar-date
filtering across timezones, checkbox transitions and list/calendar filtering.
They do not replace verification of the hosted Auth service.

Screenshot tests mock all OpenAI requests (no paid calls). They cover clipboard
and text-paste boundaries, drop/file validation, explicit analyze/save actions,
candidate selection, uncertainty/duplicate confirmation, retained drafts and
stable retry IDs, provider failure/malformed output, upload caps and real image
decoding, relative dates, all-day dates and timezone/DST conversion. SQL tests
persist reviewed timed/all-day tasks through the manual-create conflict policy
and verify owner isolation. Mocked candidate examples include Canvas, discussion,
email, syllabus and slide tasks; they verify the general extraction contract,
not real model recognition accuracy.

Before merging or deploying, verify in your own signed-in browser:

1. Add a task, change its status, reload, and check it in another browser/device.
2. Import a personal Canvas feed twice; verify no duplicate IDs, new past dates are
   skipped, earlier-today entries remain, and existing status/category/history survives.
3. Import the old browser backup; reload and confirm its original data is preserved.
4. Sign out, sign in to a second account, and confirm its task list is separate.
5. Exercise email confirmation and password reset with real email delivery.
6. Check Active/Completed tabs, category filters, both status checkboxes, and compact
   calendar previews/day details on desktop and mobile.
7. Configure the OpenAI key, paste a real screenshot from several sources, analyze,
   correct uncertain fields and explicitly save. Check the list/calendar and reload.
   Test a date-only deadline, relative date, multiple tasks, a duplicate warning,
   and retry after a provider or storage failure.

See `VERIFICATION.md` for results and the remaining hosted checks.
