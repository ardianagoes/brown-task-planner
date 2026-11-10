# Email authentication: production setup and verification

Production origin: `https://due-drop.vercel.app`.
Apply these hosted settings manually; repository changes cannot edit your Supabase
email templates, Site URL or Vercel environment. No SQL migration is required.

**Canonical URL review (November 9, 2026):** the former
`https://brown-task-planner.vercel.app` redirects to the confirmed working DueDrop
origin. However, credential-free callbacks on DueDrop currently redirect back to
the former host, indicating stale canonical-origin configuration. This can conflict
with strict mutation Origin checks. Review/approve the Production and Preview
`NEXT_PUBLIC_APP_URL`, Supabase Site URL and redirect entries below, then redeploy.
No hosted authentication setting was changed by this rebrand. Keep the old domain
redirect while older email links exist, and request fresh links after configuration.

## Why the old links failed

The previous forms used PKCE email redirects. Exchanging a code requires the
verifier cookie from the browser that requested the email. Requesting on a computer
and opening on iPhone cannot supply that cookie. Verification failures all became
`/login?error=link`, obscuring the cause. Magic-link requests had no login UI, and
the reset page checked a signed-in user without proving recovery authentication.

Changing `NEXT_PUBLIC_APP_URL` fixes newly generated application redirect targets
after redeploying, but does not change Supabase's separate Site URL/templates or
links already sent. Hosted template/URL settings were not accessible for inspection;
they remain a manual prerequisite, rather than a confirmed hosted root cause.

The updated flow follows the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
and [passwordless token-hash example](https://supabase.com/docs/guides/auth/auth-email-passwordless).
GET stages a credential without calling Supabase; a confirmation POST verifies it,
checks `getUser()` and verified `getClaims()`, and copies every session-cookie chunk
to the final redirect. GET-only email scanners cannot consume the token; a scanner
that actively submits forms could still do so. Request a fresh link if one is used.

## 1. Vercel environment

In the existing project's **Settings → Environment Variables**, set Production:

```dotenv
NEXT_PUBLIC_APP_URL=https://due-drop.vercel.app
AUTH_RECOVERY_SECRET=<a newly generated random secret>
```

Generate a 64-character hex secret locally, then paste it only into private server
environment settings (and your ignored `.env.local` for local testing):

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not put the generated value in source control, a `NEXT_PUBLIC_` variable or
logs. Use one stable value for all production instances/deployments. Rotating it
invalidates outstanding recovery grants, so users need fresh recovery links.
Existing Supabase URL/publishable-key settings stay in place. No service-role key
is used. Redeploy this branch after setting variables; public variables are built
into browser code. Use separate preview environment settings for preview origins.

Recovery verification issues a signed 30-minute HttpOnly grant bound to the verified
user and JWT session ID. This is necessary because successful hash verification
may issue generic OTP AMR claims, rather than a recovery AMR. The successful
`verifyOtp({ token_hash, type: 'recovery' })` call proves the recovery flow. For
legacy PKCE, the server-verified recovery AMR must prove it. A `next` query, browser
storage value, user metadata or unverified JWT cannot authorize a password update.

## 2. Supabase URL Configuration

Go to **Authentication → URL Configuration**.

Set **Site URL** exactly to:

```text
https://due-drop.vercel.app
```

Add these exact **Redirect URLs** (no production wildcard):

```text
https://due-drop.vercel.app/auth/confirm
https://due-drop.vercel.app/auth/callback
https://due-drop.vercel.app/auth/callback?next=/auth/reset
https://due-drop.vercel.app/auth/reset
```

The callback entries retain compatibility with current signup/reset/magic API
redirect options and older PKCE emails. `/auth/reset` is the authenticated recovery
destination. The preferred templates below link directly to `/auth/confirm`;
they do not pass through Supabase's automatic link-consuming redirect endpoint.

Keep `http://127.0.0.1:3000/auth/callback`,
`http://127.0.0.1:3000/auth/callback?next=/auth/reset`,
`http://127.0.0.1:3000/auth/confirm` and `http://127.0.0.1:3000/auth/reset` only if
you use that exact local origin. These entries do not override `.SiteURL`: with
the production Site URL, the templates intentionally send email users to production.
For isolated local email testing, use a separate development Supabase project with
its Site URL and `NEXT_PUBLIC_APP_URL` both set to that local origin. `localhost`
and `127.0.0.1` are different cookie origins; choose one consistently.

See [Supabase redirect URL rules](https://supabase.com/docs/guides/auth/redirect-urls).

## 3. Supabase Email Templates: exact HTML

Go to **Authentication → Email Templates**. Keep your existing subject/body text,
but replace the action link in each template with the corresponding HTML below.
Remove competing `{{ .ConfirmationURL }}` links or standalone OTP instructions that
would consume the token before this application's confirmation step. Use `&amp;`
inside the HTML `href`; the browser interprets it as the query separator `&`.

**Reset Password**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
```

**Magic Link**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Sign in to DueDrop</a>
```

**Confirm Signup**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Confirm your email</a>
```

`email` is Supabase's current token-hash verification type for signup/email sign-in;
`recovery` verifies password recovery. Legacy `signup`/`magiclink` callback types are
normalized to `email`. `.RedirectTo` is unnecessary: `.SiteURL` deliberately pins
these links to the canonical production origin instead of a requesting device's
localhost or preview redirect. The app still supplies canonical API redirect options
for legacy PKCE compatibility. See [email template variables and scanner guidance](https://supabase.com/docs/guides/auth/auth-email-templates).

Leave the Email provider enabled and preserve email confirmation/password policy.
Magic-link requests set `shouldCreateUser: false`, so only existing accounts can
receive sign-in links. Public forms use account-neutral messages; a message is not
proof of email delivery. Check Supabase Auth logs and SMTP configuration for delivery
failures or rate limits, without copying private email URLs/tokens into logs/issues.
Disable email-provider link tracking/rewriting if it consumes or corrupts auth links.

Templates/settings only affect new emails. Discard older emails and request a fresh
link after saving these templates and deploying. PKCE emails already sent still
need the original browser's verifier; their URLs cannot be retroactively repaired.

## 4. Vercel Deployment Protection

Read-only anonymous checks on November 9, 2026 reached production `/login` (200),
`/auth/confirm` and `/auth/callback` (application redirects when missing credentials).
No Vercel authentication wall was observed on those canonical routes. Project
protection settings were not available for inspection and were not changed.
No Vercel protection adjustment is indicated by these checks.

If a future link first opens a Vercel sign-in wall, that gate runs before this app.
The smallest safe action is to authenticate to the protected deployment on the
iPhone using an authorized Vercel account, then open a fresh email link on the same
canonical domain. Do not disable protection globally or put bypass credentials in
emails. OPTIONS allowlisting does not permit normal GET/POST email callbacks.

If you explicitly require access without Vercel accounts, review domain-level
exceptions with the owner. Making an origin publicly reachable changes deployment
privacy; app authentication and Supabase RLS still protect tasks, but are separate
from the deployment gate. This change does not make such an exception or relax
authentication. See [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).

## 5. Production verification: desktop request → iPhone

After deploying and applying settings, use one existing confirmed test account.
Do not repeatedly send emails; respect the project's delivery/rate limits.

1. In desktop `/login`, choose Forgot password, enter the account email and send
   one reset link. Open the **newest** email on iPhone Safari, initially signed out.
2. Check the link's domain privately: it must be the production app, never localhost.
   It opens a clean Continue password reset page without consuming the token yet.
   Do not share the original link or capture its query in logs/screenshots.
3. Select Continue to reset password. Expect `/auth/reset`, never ordinary login
   after successful verification. Enter matching new passwords (12+ characters).
4. Confirm Password updated, select Continue to sign in, and sign in with the new
   password. Reload the dashboard to confirm the session persists. Existing tasks
   must remain unchanged. The completed reset clears the local recovery session.
5. On desktop choose Email me a sign-in link; request one email for the same account.
   Open on a signed-out iPhone browser, select Continue to sign in, and expect the
   dashboard. Reload to check persisted cookies. Repeat in a clean desktop browser
   if desired; no requesting-browser verifier is needed with token-hash templates.
6. Reopen a used link and test one malformed/expired link. Expect an explanation
   and fresh recovery/magic forms, not authentication success. A GET preview alone
   should leave a fresh link usable until Continue is selected. Opening `/auth/reset`
   while signed out, or after ordinary password sign-in without a recovery grant,
   must return to the fresh-recovery form. Signed-out dashboard/APIs stay protected.
7. Verify a newly created account's confirmation link, if signup is enabled. Verify
   tasks remain isolated between accounts. Never paste credentials into test output.

Automated tests mock Supabase network responses and use the real SSR cookie adapter,
including chunked cookies and a new browser with no PKCE state. They cover success,
invalid/expired/used links, missing sessions, PKCE compatibility, CSRF, safe errors,
recovery authorization, password updates and UI confirmation. They do not send real
emails or prove the hosted templates, SMTP, Vercel settings or iPhone delivery are
configured. Live production verification remains required after the manual setup.
