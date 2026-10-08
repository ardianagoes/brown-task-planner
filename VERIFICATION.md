# Verification — screenshot task creation

Checked on October 7, 2026 in the existing brown-task-planner checkout.
Branch: `codex/screenshot-task-creation`, based on current main (`9433761`).
No duplicate project, ZIP, hosted deployment, or main push was made.

## Scope

Screenshot input, analysis and editable review reuse the existing manual-task API.
Supabase schema/migration, Auth/session checks, RLS, ICS parsing/downloader,
status changes, deletion and calendar filtering/styling remain unchanged.
The new route verifies identity with server-side getUser(), checks mutation origin,
and uses the existing Postgres consume_import_slot() limiter. Screenshot analyses
and feed imports share ten attempts per account per ten minutes. No SQL is needed.

Credentials are server-only. Images remain in transient memory, are decoded and
resized with metadata removed, and are sent to OpenAI only on Analyze Screenshot.
No screenshot/image/base64 logging or permanent storage is added. Provider
retention policies still apply; Responses storage is disabled with store:false.

## Automated checks

- `npm run typecheck`: passed.
- `npm test`: all **50 tests** passed.
- `npm run build`: passed.
- `npm run test:smoke`: passed against the local development server, including
  the new extract-image route's unsigned, foreign-origin and missing-origin checks.

Tests mock all OpenAI requests: no paid API calls occur. Coverage includes:

- Clipboard image handling without intercepting ordinary text-field paste.
- Drop/file replacement, removal, type/size rejection and local-only preview.
- Explicit analyze action; no save until Add Assignment; multiple candidates with
  no arbitrary selection; editable review; required missing/uncertain details.
- Duplicate warnings and opt-in, retained images/drafts on failure, unchanged retry
  IDs, manual entry, and all-day/timed switching.
- PNG/JPEG/WebP real decoding, MIME spoofing, excessive pixels, actual streamed size
  caps, metadata removal, authentication-before-reading/AI and fail-closed limits.
- Structured-output validation, malformed/refused/incomplete/oversized responses,
  safe provider failure messages, prompt injection boundaries and request budgets.
- Current New York calendar date across UTC midnight, tomorrow/Friday/tonight/in
  three days, inferred years, missing/conflicting dates, date-only deadlines,
  explicit offsets and IANA timezone conversion, DST gaps/repeated times.
- Reviewed tasks persisted in PostgreSQL/PGlite through the manual-create conflict
  policy: date vs UTC timestamp, Manual/To Do, no overwrite on retry, owner isolation.
- All existing task/auth/ICS/SSRF/database/status/calendar tests.

Mocked results include Canvas, discussion, email, PDF syllabus and slide candidates.
They verify the universal extraction contract, not real model recognition accuracy.

## Browser checks

Used the real TaskCreator and TaskWorkspace components with a temporary local UI
fixture, sample pixels and mocked analysis. The fixture was removed before the
final build and is not committed. No real account/task/provider data was changed.

- Binary PNG browser clipboard + actual Ctrl+V replaced the image preview.
- Preview, explicit Analyze, no task write on analysis, multiple-candidate selection,
  uncertainty fields/confirmation and Add Assignment rendered and worked.
- Confirmed task appeared in the normal list and calendar; screenshot cleared.
- Repeating the sample showed the duplicate checkbox and retained the existing task.
- Dark theme, editable time/zone fields and controls were readable.
- No browser error/warning console messages occurred during these interactions.

Visual proof is saved outside the repository as outputs/screenshot-task-review.jpg.
This uses sample data and clearly labels the mocked analysis.

## Remaining real-service checks / setup

1. Add OPENAI_API_KEY and OPENAI_IMAGE_MODEL=gpt-5.4-mini to local/Vercel server
   environment settings. Keep APP_TIMEZONE=America/New_York and the existing
   Supabase/canonical URL settings. Restart locally or redeploy Vercel.
2. Sign in, paste real screenshots from several sources, analyze and check extraction
   accuracy before saving. Try relative, ambiguous, date-only and multi-task images.
3. Confirm the saved task after reload and on another device; verify all-day/calendar
   date and timed deadline in your browser timezone. Test a duplicate and safe retry.
4. Monitor OpenAI API usage, quota and costs. Standard provider retention applies.

No real paid vision analysis or authenticated hosted persistence was performed.
PostgreSQL tests are local and do not modify the hosted Supabase project.
