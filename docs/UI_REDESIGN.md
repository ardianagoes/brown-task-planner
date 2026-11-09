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

## Dependency audit

Installing the two UI packages reported one critical advisory group affecting the
existing Next.js 16.3.8 dependency. `npm audit --omit=dev` identifies:
[GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and
[GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr).
The font/icon packages are not listed as affected. Framework/security upgrades
are outside this frontend-only change; the application has not been deployed.
