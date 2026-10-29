# Spec: Authentication (F-03)

| | |
|-|-|
| **Implements** | FR-1, FR-2, FR-3; UF-1, UF-2, UF-3; AUTH-01 – AUTH-07; engineering doc §6.2.1, §15.1, D-09, D-27, D-28 |
| **Milestone** | M2 |
| **Depends on** | `project-foundation.md`, `messages-and-ui-copy.md` |
| **Files** | `src/app/(auth)/**`, `src/app/auth/confirm/route.ts`, `src/proxy.ts`, `src/lib/supabase-browser.ts`, `src/server/supabase/server-client.ts`, `src/server/http/auth.ts`, `src/features/auth/*`, `supabase/config.toml`, `supabase/templates/*.html` |

## 1. Behaviour summary
- Email + password only. Email confirmation is required before login (FR-1). Minimum password length 8, maximum 72.
- The browser talks to Supabase **Auth only** (`createBrowserClient`, publishable key). It never reads app tables.
- The verification link confirms the email, then **signs the new session out** and sends the user to `/log-in?verified=1` (D-09). The recovery link keeps its session so the user can set a new password.
- Emails go through Supabase's built-in sender (D-28). Locally and in CI they land in Mailpit.
- No account enumeration: sign-up, resend and reset show the same result whether or not the email exists.

## 2. Supabase Auth settings
**Hosted projects (dashboard, per project):**

| Setting | Dev project | Prod project |
|-|-|-|
| Site URL | any stable dev URL (only the fallback when a redirect isn't allow-listed; D-55) | `https://<prod domain>` |
| Redirect URLs | `https://*-<vercel-team-slug>.vercel.app`, `http://localhost:3000` | `https://<prod domain>` |
| Email provider | enabled, **Confirm email on** | same |
| Other providers | all disabled | all disabled |
| Minimum password length | 8 | 8 |
| JWT signing keys | asymmetric (default on new projects) | same |
| Email templates | §3 (paste the HTML) | same |
| SMTP | Resend (D-55): host `smtp.resend.com`, port 465, user `resend`, password = a sending-only Resend API key, sender `no-reply@<mail subdomain>` | same, with its own key |

**Local stack (`supabase/config.toml`, relevant parts):**
```toml
[api]
schemas = ["public", "graphql_public"]   # app, app_private, metrics are NOT exposed

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/confirm"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = true
minimum_password_length = 8

[auth.email]
enable_signup = true
enable_confirmations = true
double_confirm_changes = true
max_frequency = "1m0s"

[auth.email.template.confirmation]
subject = "Confirm your Gym Coach account"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Reset your Gym Coach password"
content_path = "./supabase/templates/recovery.html"

[inbucket]          # local email catcher (Mailpit UI at http://127.0.0.1:54324)
enabled = true
port = 54324
```

## 3. Email templates (`supabase/templates/`)
The app sends its own origin as the redirect (`siteUrl()`), so `{{ .RedirectTo }}` is the preview, prod or local origin the user signed up on. If that origin isn't in the redirect allow-list, Supabase uses the Site URL instead and the link still works (D-55).

`confirmation.html`:
```html
<h2>Confirm your email</h2>
<p>Tap the button to confirm your Gym Coach account. Then log in with your email and password.</p>
<p><a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my email</a></p>
<p>If you didn't create an account, you can ignore this email.</p>
```
`recovery.html`:
```html
<h2>Reset your password</h2>
<p>Tap the button to set a new Gym Coach password.</p>
<p><a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password">Set a new password</a></p>
<p>If you didn't ask for this, you can ignore this email.</p>
```

## 4. Supabase clients
- Browser (`src/lib/supabase-browser.ts`): `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)`. Used only for `auth.*` calls. A lint rule bans `.from(` and `.rpc(` on it.
- Server (`src/server/supabase/server-client.ts`): `createServerClient(url, publishableKey, { cookies: { getAll, setAll } })` with `next/headers` `cookies()`.
- Admin (`src/server/supabase/admin-client.ts`): `createClient(url, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`. Imported only by `account.service.ts` (lint rule).
- Cookies are set by `@supabase/ssr`: `HttpOnly`, `Secure` (except localhost), `SameSite=Lax`, `Path=/`.

## 5. Session refresh (`src/proxy.ts`)
```ts
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();          // refreshes an expired access token
  const isAppPage = APP_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));   // /onboarding /plan /history /profile
  if (!data?.claims && isAppPage) {
    const to = new URL('/log-in', request.url);
    to.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }
  applySecurityHeaders(response, request);                     // CSP nonce (security-and-privacy.md §2)
  return response;
}
```
API routes are not redirected; `apiHandler` returns 401 instead.

## 6. Server auth helpers
`requireUser()` and `requireProfile()` are specified in `api-conventions.md` §5. Claims passed to `withUserTx`: `{ sub, role: 'authenticated', email, aal }`.

## 7. Browser auth calls
| ID | Call | Request validation (Zod, client) | Success | Error → UI copy key |
|-|-|-|-|-|
| AUTH-01 | `supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } })` | `email: z.email()`, `password: z.string().min(8).max(72)`, `confirm_password` equal | Store the email in `sessionStorage['gc.pending-email']` (try/catch); `router.push('/verify-email')` | `weak_password` → `auth.weakPassword`; `over_request_rate_limit` / `over_email_send_rate_limit` → `auth.rateLimited`; other → `toast.unexpected` |
| AUTH-02 | `GET /auth/confirm` (§8) | — | see §8 | → `/log-in?error=link_invalid` |
| AUTH-03 | `supabase.auth.signInWithPassword({ email, password })` | `email`, `password` non-empty | `router.replace(next ?? '/')` (`next` validated as in §8) | `invalid_credentials` → `logIn.invalidCredentials`; `email_not_confirmed` → `logIn.unverified` + **Resend verification email** button (AUTH-07); rate limit → `auth.rateLimited` |
| AUTH-04 | `supabase.auth.signOut()` (Log out on `/profile`) | — | `queryClient.clear()`; `router.replace('/log-in')` | — |
| AUTH-05 | `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL })` | `email` | Always show the "Check your inbox" state with `forgot.sentBody` | rate limit → `auth.rateLimited`; anything else still shows the sent state |
| AUTH-06 | `supabase.auth.updateUser({ password })` on `/update-password` | `password` 8–72, confirm equal | `router.replace('/plan')` | `weak_password` → `auth.weakPassword`; no session → redirect `/log-in?error=link_invalid` |
| AUTH-07 | `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: SITE_URL } })` | `email` | Toast `verifyEmail.sentToast` | rate limit → `auth.rateLimited` |

`/verify-email` reads the email from `sessionStorage['gc.pending-email']`; if it is unavailable it renders `{email}` as "your email" and shows an email field for **Resend email**. Emails never go in URLs.

## 8. `/auth/confirm` Route Handler (`src/app/auth/confirm/route.ts`)
```ts
export const runtime = 'nodejs';
const Query = z.object({
  token_hash: z.string().min(1),
  type: z.enum(['signup', 'recovery', 'email_change']),
  next: z.string().optional(),
});
const safeNext = (n: string | undefined, fallback: string) =>
  n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') && !n.includes('://') ? n : fallback;

export async function GET(request: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const fail = () => NextResponse.redirect(new URL('/log-in?error=link_invalid', request.url));
  if (!parsed.success) return fail();
  const { token_hash, type, next } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) return fail();
  if (type === 'signup') {
    await supabase.auth.signOut({ scope: 'local' });        // D-09: confirm, then log in manually
    return NextResponse.redirect(new URL('/log-in?verified=1', request.url));
  }
  return NextResponse.redirect(new URL(safeNext(next, type === 'recovery' ? '/update-password' : '/plan'), request.url));
}
```
An absolute or protocol-relative `next` (`https://evil.test`, `//evil.test`, `/\evil.test`) falls back to the default (open-redirect defence).

## 9. Pages
Layouts, fields and copy follow the handoff "Auth" table and `messages-and-ui-copy.md` §6.
- `/sign-up`: Email, Password (helper "At least 8 characters"), Confirm password (inline "Passwords don't match"), then the `SIGNUP_NOTICE` box (catalog text, D-27), then **Create account** (disabled until the form is valid) and "Already have an account? Log in".
- `/log-in`: with `?verified=1`, an ink status banner with `EMAIL_VERIFIED` above the title. With `?error=link_invalid`, an outline banner with `logIn.linkInvalid` and the **Resend verification email** action (asks for the email).
- `/forgot-password`, `/update-password`, `/verify-email`: as the handoff table.
- Signed-in visitors to `/sign-up` or `/log-in` are redirected to `/`.

## 10. Tests
- `auth-confirm.int.test.ts`: valid signup hash → redirect `/log-in?verified=1` and no `sb-*` auth cookie in the response; recovery → `/update-password` with a session cookie; invalid hash → `/log-in?error=link_invalid`; `next=https://evil.test` and `next=//evil.test` → default path.
- `signup-notice.test.tsx`: renders the exact `SIGNUP_NOTICE` catalog string.
- `auth.spec.ts` (E2E, Mailpit at `http://127.0.0.1:54324`, API `GET /api/v1/search?query=to:<email>` then the message's HTML):
  1. Sign up (notice visible) → `/verify-email` → open the link from Mailpit → `/log-in` shows "Email verified. Log in to continue." and the user is **not** signed in → log in → `/onboarding`.
  2. Logging in before verifying shows "Verify your email first" and the resend button.
  3. Forgot password → Mailpit link → `/update-password` → new password → `/plan` (user with a profile).

## 11. Acceptance criteria
1. The three E2E journeys pass on Chromium and WebKit.
2. An unverified user cannot log in.
3. `/auth/confirm` never redirects off-site.
4. No app-table request is made from the browser (Playwright network assertion: no request to `/rest/v1/`).
