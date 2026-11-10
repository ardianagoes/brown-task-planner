# DueDrop security and financial-risk review

Reviewed November 9–10, 2026. Base: latest `main` at `2e6bd60` in
`ardianagoes/due-drop`. This is a source/local-test audit, not a penetration test or
proof of complete security. No hosted database, auth, secrets, provider spending
settings or production deployment was modified. No real account, reset email or
billable AI call was used for testing.

## Decision before public use

Keep paid analysis **disabled** until the opt-in database policy and provider
limits below are approved. This PR makes the safe default explicit:
`SCREENSHOT_AI_ENABLED` must be exactly `true`; a key alone no longer enables AI.
Public signup does not grant paid-feature access. Normal task storage/imports keep
their existing authentication and RLS protections.

The dependency patch and code safeguards take effect only after the owner merges
and deploys this PR. The currently deployed app was not patched by local work.
Correct canonical-origin drift and verify hosted RLS before considering the public
task app operationally ready. Hosted billing/firewall/auth settings could not be
inspected, so current dollar exposure cannot be certified.

## Ranked findings

| Severity | Finding and consequence | Disposition |
| --- | --- | --- |
| Critical | Next.js 16.3.8 was flagged for framework RCE advisories affecting SVG image optimization and typed-array cache handling, plus a Server Actions DoS advisory. Applicable exploit preconditions were not exercised. | Updated within major 16 to 16.4.1; fresh npm audit reports zero known vulnerabilities. Production needs the patched deployment. |
| High | A valid account/key formerly allowed paid extraction with only a 10-attempt/10-minute per-user limit. New accounts, direct API clients and distributed concurrency could multiply charges; no shared daily/monthly cap or entitlement existed. | Paid AI now defaults off. New code requires a successful durable reservation before upload/decoding/provider work. The reviewed SQL proposal remains unapplied pending approval. |
| High | Production domain drift: old host redirects to DueDrop, while credential-free DueDrop callbacks redirect to the old host. This strongly indicates stale canonical-origin settings and can break strict Origin checks/recovery. | Exact Vercel/Supabase corrections documented for owner approval. No auth logic or hosted setting was changed to bypass the mismatch. |
| Medium | JSON/form bodies had size limits but no read deadline; DNS lookup preceded the feed network timer. Slow inputs could consume serverless execution. | Added ten-second bounded body reads and a twelve-second total feed deadline including DNS. |
| Medium | Feed oversize rejection relied on a later request error; a rapid end event could settle the promise first. | Reject immediately on declared/streamed oversize before destroying the request; regression-tested. DNS pinning, TLS, HTTPS/host checks and redirect rejection remain. |
| Medium | Public account creation and direct Supabase task writes can consume database/storage/egress resources. App endpoints alone cannot constrain direct authenticated Data API calls. | Residual. Review signup/CAPTCHA/rate settings, quotas and provider spend controls. Any persistent task-storage quota needs a separately approved database change. |
| Medium | Existing routes had no global anti-framing/sniffing policy. A complete script CSP was also absent. | Added DENY framing, `frame-ancestors 'none'`, nosniff, base/object restrictions and permission restrictions. This is intentionally not a full nonce/script CSP; React escaping/input validation remain essential. |
| Medium | Hosting/SMTP request tracking, logs and billing settings are external. App code cannot guarantee token-bearing email URLs are absent from provider logs, or that spend caps are configured. | Residual. Review drains/query/body logging, email link tracking, provider budgets and Vercel firewall/spend management. Application diagnostics continue to exclude private URLs, tokens and raw provider errors. |
| Low | Repository About description and license are missing; no current or reachable GitHub Actions workflows were found. Historical names remain in implementation records. | Updated current branding/docs and ignore rules. Kept useful history. Suggest an About description and deliberate license decision; no license or privileged workflow was added. |

Dependency advisory evidence:
[SVG optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[typed-array cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr),
[Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r).
Zero reported advisories is a point-in-time result, not proof of no vulnerabilities.

## What was reviewed and retained

- All application/API/auth entry points, UI-to-API calls, validators, storage
  helpers, feed downloader/parser, configuration, existing SQL and tests were
  inspected. There are no checked-in Vercel project credentials or Actions workflows.
- Every task read/update/delete is scoped to the verified user; creation derives
  ownership server-side. Authenticated mutations reject missing/foreign Origin.
  RLS provides the actual account boundary even for direct Data API calls.
- The original migration has owner-only task policies and constraints.
  `import_tasks` and `migrate_browser_tasks` are SECURITY INVOKER, derive ownership
  with `auth.uid()` and use RLS. `consume_import_slot` is SECURITY DEFINER with an
  empty search path, derives the caller and writes only its private per-user bucket.
  Anonymous execution is revoked. Existing migrations were not rewritten.
- Auth uses verified `getUser()`/`getClaims()`, copied SSR cookie chunks, fixed
  destinations, staged single-use-link confirmation, Origin/nonce checks and a
  signed HttpOnly recovery grant bound to account/session. Session cookies retain
  Secure in production, Lax SameSite and host-only scope. Magic links do not create
  unknown accounts. Public signup behavior was not silently changed.
- No service-role key is used. Only the Supabase project URL/publishable key and
  app URL are public configuration. OpenAI/recovery secrets stay server-side.
- No dynamic HTML execution was found. Task/calendar/provider text renders through
  React escaping, URLs allow only HTTP(S), screenshot input excludes SVG and upload
  MIME is checked against actual decoding. API/provider errors remain sanitized.
- Feed URLs require HTTPS, approved hostname, no credentials/fragments/nonstandard
  ports or literal IPs. Every DNS answer must be public; one address is pinned while
  TLS validates the original hostname. Redirects are not followed. Input remains
  bounded to 2 MB and 2,000 parsed tasks; invalid/cancelled/recurring entries are
  rejected/skipped. Malicious parser CPU use is not fully isolated by a worker;
  provider execution limits and edge abuse controls still matter.

## Accessible Git history and repository review

A redacted local scan covered 27 reachable commits, 221 unique blobs and 218 text
blobs, including accessible branches/stash refs. It checked high-confidence OpenAI,
Supabase secret, GitHub-token, private-key, AWS-key and privileged/session-JWT
patterns. No candidates were found; values were never printed. No tracked `.env`,
`.env.local`, `.env.production`, `.vercel/project.json` or SSH-key filenames were
found. This does not cover unreachable/deleted objects, other forks, external
logs, all possible credential formats or secrets encoded inside binary assets.
No history rewrite or secret rotation was performed without evidence/approval.

`.gitignore` already excluded environment files, node_modules and Next caches;
it now also excludes Vercel local metadata, logs, coverage and test artifacts.
No useful documentation, original SQL, icon artwork or source was deleted for
cosmetic cleanup. `AGENTS.md`/`CLAUDE.md` are intentional tool guidance; verification
records are historical, not duplicate current setup guides. No accidental tracked
archives/build outputs were identified.

GitHub metadata showed a public repository, confirmed homepage
`https://due-drop.vercel.app/`, no description and no license. Suggested description:
“DueDrop is a student deadline manager with reviewed screenshot extraction,
calendar-feed imports and private task tracking.” License selection remains the
owner's decision. Review future Actions with read-only contents permissions,
untrusted-fork isolation and no production secrets in PR jobs. No workflow exists
whose checked-in permissions need lowering now; repository-level settings were
not inspected.

## Approval required: persistent AI admission policy

Review [the opt-in SQL proposal](sql/20261109000000_ai_admission_proposal.sql).
It is outside the migration runner and was executed **only in local PGlite tests**.
It adds two RLS-protected private limiter tables and one narrow authenticated
SECURITY DEFINER RPC with a fixed empty search path. It does not alter tasks,
existing functions/policies, accounts or migrations. Do not enable the paid flag
before approving/applying this proposal and checking provider limits.

The private policy starts with an empty approved-user UUID array. Only the project
owner can update it via the SQL Editor; browser accounts cannot read or change
policy/usage tables. The function derives `auth.uid()` and serializes admission
checks/insertion with a policy-row lock across serverless instances.

Defaults: 20 attempts/day and 100/month globally, 5/day per approved user, 3/ten
minutes per HMAC IP bucket, two global 60-second leases and one per user. Day/month
boundaries are UTC. Failed/aborted reservations are retained. Request UUID replay
is denied; optional omitted IDs still receive quotas. Anonymous/new/unapproved
accounts cannot reserve. Account deletion does not erase shared spend history.

These bound admitted request counts, not dollars or all infrastructure traffic.
Changing the model, price, key usage elsewhere or policy caps changes potential
spend. A 60-second lease bounds app admissions, not guaranteed provider job
termination: cancellation may leave accepted provider work billable. No code can
enforce a cap on another app using the same key. Approved accounts can deliberately
consume their quota through direct RPC calls without producing AI work; treat the
allowlist as trusted users. Edge/database DoS remains an operational concern.

IP attribution follows [Vercel's request-header documentation](https://vercel.com/docs/headers/request-headers).
Production paid work fails closed off Vercel or without a valid platform IP.
Local tests/development use a shared bucket. IPs are pseudonymous HMAC values,
not anonymized identities; NATs and rotating proxies limit IP controls. The
existing server recovery secret derives a purpose-separated hashing key. Review
this use before enabling; no secret change is applied automatically.

## External actions — not performed by this PR

1. **Vercel:** approve the canonical `NEXT_PUBLIC_APP_URL` correction to
   `https://due-drop.vercel.app`, rebuild public variables, and configure preview
   origins separately. Preserve deployment protection and strict Origin checks.
   Review Spend Management notifications/actions and existing firewall/rate controls
   available on your plan, plus maximum function duration/traffic. A public endpoint
   can still incur hosting execution even when app admission denies paid AI.
2. **Supabase:** confirm the deployed original migration/RLS/function grants match
   the tested source. Review signup policy, email verification, CAPTCHA/rate limits,
   database/storage/egress quotas and spend controls. Fix Site URL, redirect allowlist
   and email display text using [EMAIL_AUTH_SETUP.md](EMAIL_AUTH_SETUP.md). Do not
   disable RLS or reset accounts/passwords. Approve/apply the AI proposal only if
   paid extraction is wanted; approve specific existing user UUIDs deliberately.
3. **OpenAI:** use a dedicated project/key with only necessary endpoint access.
   Review current project usage, configure a suitably small enforced spend limit
   where available, alerts below it and conservative request/token limits. Alerts
   alone do not stop traffic. Official [spend-limit documentation](https://developers.openai.com/api/docs/guides/spend-limits)
   describes hard limits and notes enforcement can lag, allowing slight overshoot.
   Settings and key usage could not be inspected. Do not treat application quotas
   or an unverified dashboard budget as proof of zero unexpected charges.
4. **Enable only after sign-off:** set server-only `SCREENSHOT_AI_ENABLED=true`
   after approval/configuration and a non-billable admission check. If any prerequisite
   is missing, leave it false. Disabling it is the immediate kill switch for new
   app-originated paid calls; accepted upstream work may still finish.

No paid infrastructure was introduced. The optional limiter uses the existing
Supabase database; existing provider plan charges/quotas still apply.

## Verification and limits

Focused tests exercise actual proposed SQL permissions, allowlisting, NULL handling,
durable counts, UTC boundaries, duplicate IDs, per-IP/global/user limits and lease
expiry. PGlite serializes one local connection; tests do not independently prove
multi-instance production database behavior. The row-lock transaction is the
intended PostgreSQL concurrency boundary, to verify in an approved staging setup.

Mocked route tests verify authentication/Origin before paid work, feature-off and
limiter-error denial before uploads, image caps, provider cancellation, sanitized
errors and one request without automatic retries. Feed tests cover pinned lookup,
private/mixed DNS, redirects, explicit User-Agent, oversize and total timeout.
Existing auth/recovery, account-isolation/RLS, CRUD, screenshot review, calendar and
timezone tests remain part of the required full suite. No live account/AI testing
is implied by a green local run.

Final local validation on November 10:

- `npm run typecheck`: passed.
- `npm test`: 116 passed, zero failed (19 new focused guard/database/feed tests).
- `npm run build`: passed with Next.js 16.4.1.
- `npm run check:branding`: passed across 63 current files; README 240 words
  excluding commands.
- `npm audit`: zero known vulnerabilities at the time of the check.
- `npm run test:smoke`: passed against a local dev server, covering current
  branding, global/auth headers, unauthenticated API denial, Origin rejection,
  private responses and callback/confirmation redirect safety.
- A value-redacted browser-asset check found no occurrence of the one configured
  server secret across 35 generated JavaScript/JSON/source-map assets. No local
  OpenAI key was configured; this is not a general proof against secret leakage.
- Read-only production probes on November 10 reconfirmed the live DueDrop login,
  former-host redirect and canonical auth redirect mismatch described above.

The first added tests exposed a feed rejection settlement race, which was fixed;
initial test typing issues were also corrected. All final checks passed. Generated
Next dev guidance/type-path changes were excluded from the source changes.
