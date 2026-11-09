# Productivity workspace UI refactor

Branch: `codex/productivity-ui-redesign`, based on main `6a30ede`.
This refactor changes frontend presentation and interaction only. Task types, API
contracts, server routes, authentication, SQL and timezone conversion stay intact.

## Phase 1 — foundation and navigation

- Added self-hosted Geist, Lucide icons and shared dark-theme tokens.
- Added collapsible desktop navigation and mobile navigation.
- Moved screenshot/manual creation into a native modal; screenshot remains default.
- Moved the existing calendar-import form into Settings, preserving its handler.
- Kept account, migration, loading, storage-error and save states available.
- Added modal focus restoration, in-flight dismissal protection and reduced-motion
  support. Screenshot uploads/extraction/review/save logic remains in TaskCreator.
- Typecheck passed; 85 tests passed; production build passed. The first build
  failed because the installed font package has no `latin.css` export. Switching
  to the package's provided stylesheet fixed the failure.

## Phase 2 — agenda, rows and responsive calendar

- Added Today, Tomorrow and Later This Week grouping, with explicit Overdue and
  Later groups so past/distant deadlines remain reachable. Latest-first sorting
  reverses both group order and row order. Completed history is labeled Earlier,
  never Overdue. Group boundaries use local calendar arithmetic across DST.
- Replaced the two row checkboxes with one native status selector, preserving the
  existing To Do / In Progress / Submitted/Done values and status mutation handler.
- Added compact rows, subdued completed titles/times/category indicators, explicit
  delete confirmation, editable task titles and retained useful links.
- Added an actual-data deadline outlook and next-seven-days strip on wide screens.
- Kept the full desktop month calendar and day detail/edit dialogs; mobile uses a
  monthly agenda with every task and the same edit/delete/status controls.
- Preserved workspace-wide image paste: an image opens the creation modal locally,
  with existing file validation. Analysis and task persistence still require their
  original explicit actions. Text-field pasting is not intercepted.
- Added explicit Tab/Shift+Tab cycling to task, Settings, edit and day dialogs.
  Browser review caught focus escaping the new modal; the fix is regression-tested.
- Final `npm run typecheck`: passed. `npm test`: **97 passed**, no failures/skips.
  `npm run build`: passed. `npm run test:smoke`: passed against the local server.
- An intermediate final check failed because Next retained a generated type for
  the removed temporary visual-review page. Removing only that stale ignored type
  fixed typecheck/build. No application route or typecheck configuration was changed.

## Browser review and limits

Reviewed the real UI components at 1440×960, 390×844 and 320×740 using an empty,
temporary local presentation harness. No fictional user tasks were seeded, no
hosted task/account data was changed and no paid extraction request was made.
The harness was removed before the final successful build; no preview/bypass
route is included in this change.

Verified the dark theme and locally bundled Geist font, desktop sidebar collapse,
the default screenshot modal and manual tab, Settings/import layout, native modal
focus containment and Escape restoration, and the mobile calendar agenda. Narrow
layouts had no horizontal overflow. The review tab reported no console warnings
or errors. Temporary viewport overrides were reset after review.

Existing auth, database/RLS, date/timezone, ICS, screenshot-confirmation and CRUD
tests remain green. New tests cover grouping/ordering, one status control per row,
completed calendar/agenda visibility, deletion failures, empty/loading/retry states,
modal navigation, focus cycling and workspace-paste handoff. These do not replace
a user's final signed-in check with their own deadlines on a physical phone.

Both phases are local commits on the redesign branch. No deployment was performed.

## Dependency audit

Installing the two UI packages reported one critical advisory group affecting the
existing Next.js 16.3.8 dependency. `npm audit --omit=dev` identifies:
[GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and
[GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr).
The font/icon packages are not listed as affected. Framework/security upgrades
are outside this frontend-only change; the application has not been deployed.
