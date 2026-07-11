# Web Session Storage: localStorage vs httpOnly cookies (US-531)

**Decision:** Keep the Supabase web session in `localStorage`. Do **not** adopt
`@supabase/ssr` cookie (httpOnly) storage at this time. Compensate with the
hardened CSP from US-529 and document the tradeoff (this file).

## Context

`src/integrations/supabase/client.ts` configures the web auth client with
`storage: localStorage`, `storageKey: 'sb-auth-token'`. A session token in
`localStorage` is readable by any JavaScript running on the origin, so a
successful XSS would be able to exfiltrate the full session.

## Evaluation of httpOnly cookie storage

`@supabase/ssr` moves the session into httpOnly cookies so page scripts can't
read it. It is designed for **server-rendered** apps: on every request a server
handler reads the auth cookies, creates a per-request Supabase client, and sets
refreshed cookies on the response.

The EatPal web app is a **static SPA on Cloudflare Pages** — the CI deploy is
`wrangler pages deploy dist` (see `.github/workflows/ci.yml`), a pure static
bundle with **no SSR and no `_worker.js`**. There is no server request handler
to read/set cookies, so `@supabase/ssr` cannot be adopted without:

1. adding a Cloudflare Pages Function / Worker in front of the app to proxy
   Supabase auth and set/read httpOnly cookies, and
2. routing every authenticated `fetch` through that proxy (supabase-js attaches
   the `Authorization` header from client-readable storage today), and
3. reworking the OAuth (PKCE) callback + realtime auth to run through cookies.

That is an auth-layer rearchitecture, not a config flip, and it would move the
app off its static-hosting model. **Not adopted for now.**

## Compensating controls (in place)

- **US-529 — CSP hardening (primary):** `script-src` no longer allows
  `'unsafe-inline'` or `'unsafe-eval'`; the built `index.html` has zero
  executable inline scripts. This blocks the injected-inline-script path an
  attacker would use to read `localStorage`, which is the realistic XSS-to-token
  vector. Browser-verified: no CSP violations on core pages.
- **PKCE OAuth flow** (`flowType: 'pkce'`) — the access token is never placed in
  the URL fragment.
- **Refresh-token rotation (US-531 AC3):** `autoRefreshToken: true` keeps the
  client rotating tokens; server-side rotation is the GoTrue default on the
  self-hosted instance and stays enabled.
- **Origin-scoped storage key** (`sb-auth-token`) — the session is not shared
  across subdomains.

These flags are pinned by
`src/integrations/supabase/client.auth-options.test.ts` so a future edit can't
silently weaken the posture.

## Revisit when

Adopt httpOnly cookie sessions if/when the web app gains an SSR or Worker layer
(e.g. moving to Cloudflare Pages Functions), at which point `@supabase/ssr`
becomes a natural fit and the localStorage tradeoff can be retired.
