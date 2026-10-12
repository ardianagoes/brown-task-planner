# Verification — GPT screenshots and task editing

Checked October 12, 2026 in the existing brown-task-planner repository.
Branch: `codex/gpt-screenshot-and-task-editing`, based on latest main
`211562d88052672d1203c071da687360f162e6a5` (the merged free OCR change).

## Implementation

- Removed Tesseract dependencies, parser, worker, generated assets and prep script.
- Restored server-side Responses image extraction using gpt-5.4-mini by default,
  strict JSON, high image detail, reasoning none, store:false and 2,400 output tokens.
  One explicit Analyze click makes at most one provider request; no automatic retry.
- Kept screenshot paste/drop/upload, preview, editable candidates and explicit save.
  Analysis/failure never saves a task. Failure opens the same editable review.
- Added editing in Active, Completed and expanded calendar day details, including
  name, deadline, all-day, category, status and URLs. Source/ID/owner are immutable.
- Existing task PATCH now accepts only editable details or the original status-only
  operation. Updates scope both owner and ID; RLS and getUser() remain in force.
- Supabase schema, Auth, ICS downloader/parser/import policy and calendar completed
  styling remain unchanged. No SQL migration or service-role credential is needed.

## Checks

- `npm run typecheck`: passed.
- `npm test`: **61 tests passed**, no skipped/failed tests.
- `npm run build`: passed using the configured supported Webpack mode.
- `npm run test:smoke`: passed against the development server, including extraction
  authentication, foreign/missing origins, full edit authentication and obsolete
  OCR worker removal.
- Dependency installation audit: zero reported vulnerabilities after upgrading
  Sharp to 0.35.5.

Next's Turbopack could not create a native Sharp junction in the Windows sandbox.
The dev/build scripts now explicitly use Next's supported --webpack option.
An old dev route cache was moved aside within ignored .next; no product data was
removed or security protection relaxed to fix the environment.

## Automated coverage

Provider requests are mocked: no real paid API calls occur. Tests inspect Responses
schema, model, detail, no reasoning/tools/storage, one call, bounded output and
safe handling of malformed/refused/incomplete/error responses. Upload tests fully
decode PNG/JPEG/WebP, reject MIME spoofing/excessive pixels/bytes, bound the actual
stream despite false Content-Length, and verify image metadata removal. Auth and
origin precede image reading; durable rate-limit failures block provider calls.

Date tests cover relative words, missing/inferred/ambiguous dates, all-day literals,
IANA zones/offsets and DST gaps/repeated times. UI tests exercise screenshot input,
review selection, required uncertainty/duplicate confirmation, manual corrections,
retained drafts, stable retry IDs and rapid Analyze double-click prevention.

Editing tests verify prefilled fields, exact deadline preservation for detail-only
edits, all-day/timed switching, DST correction, all three entry points, Cancel/Escape,
failed-save retention, single in-flight updates and source/ID preservation. The
server helper is tested for strict writable fields, owner/ID scoping, nulling the
opposite deadline column, not-found handling and absence of upserts. Existing
PostgreSQL/PGlite tests verify RLS, task persistence and database date constraints.

## Browser verification

Used actual UI components in a temporary local page with sample tasks, a mocked
GPT result and memory-only saves. The page was removed before the final build.
No real account, hosted task or private screenshot was modified/transmitted.

- Opened prefilled timed editing from Active and all-day editing from Completed.
- Changed task title, date and time; confirmed it moved to the new calendar day
  with the correct local time and retained source/identity.
- Opened editing inside the native calendar day modal; saving a moved task returned
  focus to the remaining Close button when the original row disappeared.
- Screenshot analysis showed editable review without creating a task. Correcting
  its date and clicking Add Assignment created the reviewed all-day sample only.
- No browser warning/error messages during the interactions. A sample screenshot
  of the edit dialog is outside Git at outputs/gpt-task-editing.jpg.

## Configuration and remaining live checks

Set OPENAI_API_KEY server-side, OPENAI_IMAGE_MODEL=gpt-5.4-mini and the existing
APP_TIMEZONE / Supabase / canonical HTTPS-origin settings; restart or redeploy.
The README explains project spending limits/alerts and external-provider retention.
No real GPT extraction or authenticated hosted Supabase update was performed in
this verification. Check real image accuracy and save/reload after configuring the
key in your signed-in deployment. Imported edits retain existing refresh behavior:
later feed imports can refresh names/deadlines/URLs, preserving status/category.
