# Verification — free local screenshot OCR

Checked October 8, 2026 in the existing brown-task-planner checkout.
Branch: `codex/free-screenshot-ocr`, based on main (`5c1a1e5`).

## Scope and privacy

Tesseract.js runs in browser workers. Engine scripts, all six WebAssembly core
variants and English trained data are copied from pinned npm packages into
`public/ocr` during install, development, tests and production builds. Worker
paths are explicitly same-origin; worker Content Security Policy restricts script,
worker and connection destinations to this application. No OCR CDN, API key,
external model or cloud OCR request is used.

Screenshots remain transient browser memory: no server upload, localStorage or
IndexedDB OCR cache. Local canvas normalization strips file metadata. Recognition
has cancellation and a 90-second timeout. Only explicitly confirmed task details
use the existing Supabase task-saving API. No schema changes are required.

The paid extraction endpoint and provider helpers are removed. Supabase Auth,
task persistence, duplicate handling, ICS download/parsing, task status, deletion
and calendar behavior are unchanged.

## Automated checks

- `npm run typecheck`: passed.
- `npm test`: all **55 tests** passed.
- `npm run build`: passed.
- `npm run test:smoke`: passed against the local development server, including
  same-origin OCR asset headers and removal of the paid extraction endpoint.
- Production OCR asset HEAD checks and same-origin worker policy: passed. The
  additional full production smoke run reached the existing HTTPS-origin guard
  (503) with local HTTP settings; no security behavior was changed for testing.

Coverage includes common month-name/ISO/numeric deadlines, missing and conflicting
dates, ambiguous day/month order, inferred years, leap days, relative dates across
timezone midnight, timed/all-day assignments, explicit offsets and DST validation.
Parser fixtures represent assignment pages, discussions, PDFs and emails. OCR
confidence, multiple candidates, bounded text, worker lifecycle/failure/cancel/
timeout, image signatures and local asset presence are checked. The actual worker
wrapper is exercised with controlled engine callbacks to verify local paths and
disabled persistent language caching.

UI tests cover clipboard/drop/upload, retained previews, manual correction,
uncertainty confirmation, no save before Add Assignment, failure recovery without
starting over, duplicates and stable retry IDs. Existing database tests verify
reviewed task persistence and owner isolation using local PostgreSQL/PGlite.

## Real browser checks

A temporary local screen used the real TaskCreator, TaskWorkspace and actual
Tesseract engine, with sample PNG screenshots and memory-only task saves. The
screen was removed before the final production build and is not committed.

- Clear light and dark screenshots extracted Problem Set 13, October 15, 2026,
  5 PM EST, and Homework correctly.
- Multiple deadlines produced separate candidates without arbitrary selection.
- Tomorrow resolved to October 9 using October 8 in America/New_York and was
  flagged for review. An ambiguous 10/11/2026 date remained blank.
- A blank screenshot opened the editable form with the screenshot retained.
- Editing the title and confirming created the reviewed timed task; confirming a
  date-only application created an all-day task. Analysis itself created no task.
- No browser warning or error messages occurred.

Visual proof is outside the repository: `outputs/free-screenshot-ocr.jpg`.
Real authenticated hosted Supabase writes were not performed; browser saves used
disposable sample data in memory. No paid provider was configured or contacted.

## Deployment

Keep existing Supabase, APP_TIMEZONE and canonical URL settings. No OCR service
configuration is needed. Former OPENAI_API_KEY / OPENAI_IMAGE_MODEL settings can
be deleted: the application no longer reads them. Standard npm install/build
bundles the OCR assets locally; redeploy the branch to publish the replacement.
English OCR and heuristic parsing need review for blurry images or unusual text.
