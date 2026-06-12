# functions/_shared — Edge Function Shared Utilities

Deno modules reused across Supabase edge functions. Keep these importable from
both Deno (functions) and, where logic is pure, from vitest (`src/test/**`).

## Modules

- `auth.ts` — `authenticateRequest(req)` verifies the JWT and returns `{ user }` or `{ error: Response }` (401). Call first in every authed function.
- `cors.ts` — `getCorsHeaders(req)` / `handleCorsPreFlight(req)`. Spread `corsHeaders` into every Response.
- `household.ts` — household/kid authorization (see below).
- `admin.ts` — admin-role gating for content/marketing fns (see below).
- `stripe-pricing.ts` — Stripe price allowlist / server-side resolution (see below).
- `rate-limit.ts` — per-user/per-IP rate limiting + image-size + text caps for AI/LLM fns (see below).
- `sanitize.ts`, `url-validator.ts` — input sanitization / SSRF-safe URL checks.

## household.ts — authorization (US-324)

Never trust a client-supplied `householdId`/`kidIds`; forwarded-JWT RLS alone is
a brittle single control (IDOR risk). After `authenticateRequest`:

```ts
import { assertHouseholdMember, assertKidsAccessible } from '../_shared/household.ts';

// householdId from the body:
const err = await assertHouseholdMember(supabase, user, body.householdId, corsHeaders);
if (err) return err;                 // 403 if not a member; null if no householdId (fall back to user.id scoping)

// kidIds from the body:
const kidErr = await assertKidsAccessible(supabase, kid_ids, corsHeaders);
if (kidErr) return kidErr;           // 403 if any kid isn't RLS-accessible
```

Membership is defined solely by a `household_members` row (`household_id`,`user_id`);
`households` has no owner column. Helpers fail closed on query error.

## admin.ts — admin-only content generation (US-327)

`generate-social-content` and `generate-blog-content` drive paid LLM calls and
publish brand copy, so they must be admin-only. After `authenticateRequest`
(which verifies JWT signature + expiry via `auth.getUser()`), gate on the
`admin` role:

```ts
import { assertAdmin } from '../_shared/admin.ts';

const adminError = await assertAdmin(auth.supabase, auth.user, corsHeaders);
if (adminError) return adminError;   // 403 if not admin; null if admin
```

- Role source of truth: an `admin` row in `user_roles` (`user_id`,`role`), the
  same table the web `useAdminCheck` hook reads.
- **Fails CLOSED** (deny → 403) on any query error — opposite of rate-limit.ts.
  A privilege check must never let someone through on an infra blip.
- Pair with `capText()` + a system-prompt SECURITY BOUNDARY note when embedding
  untrusted free text (topic/content_summary) into an LLM prompt.

## stripe-pricing.ts — price/tier tampering defense (US-326)

`create-checkout` must never forward a client-supplied `price_id` into a Stripe
line item — a client could pick an arbitrary or cheaper price. Resolve the price
server-side instead:

```ts
import { resolveCheckoutPrice } from '../_shared/stripe-pricing.ts';

const r = resolveCheckoutPrice(
  { priceId: body.price_id, planKey: body.planId ?? body.plan ?? body.tier, billingCycle: body.billingCycle },
  (key) => Deno.env.get(key),
);
if (!r.ok) return new Response(JSON.stringify({ error: r.error }), { status: r.status, ... }); // 400 invalid, 503 unconfigured
const price_id = r.priceId; // server-validated
```

Config (edge-function secrets, never hardcoded):

- `STRIPE_PRICE_MAP` — JSON `{"<planKey>_<cycle>":"price_xxx", ...}` (e.g. `pro_monthly`,
  `pro_yearly`, or a bare `family`). The map values double as the allowlist. The
  key the client sends as `planId` must match a key here (the web app sends the
  `subscription_plans.id`, so key the map by those IDs in prod).
- `STRIPE_PRICE_ALLOWLIST` — comma/whitespace-separated extra valid price IDs for
  clients that pass a `price_id` directly (e.g. native apps).

Fails **closed**: if neither env is set the resolver returns 503 "not configured"
so checkout can't run against an unvalidated price. So this env MUST be set in
prod for checkout to work — it is a deploy/ops prerequisite, not just code.

## rate-limit.ts — AI cost-abuse / DoS defense (US-325)

Every expensive AI/LLM function must gate the spend. After resolving the user:

```ts
import { enforceRateLimit, getClientIp, assertImageWithinLimit, capText, RATE_LIMITS } from '../_shared/rate-limit.ts';

// vision fns: reject oversize images BEFORE paying for vision
const sizeErr = assertImageWithinLimit(imageBase64, corsHeaders);  // 413 | null
if (sizeErr) return sizeErr;

// all AI fns: per-user + per-IP limit -> 429 with Retry-After, or null
const limitErr = await enforceRateLimit(
  supabase,                                   // any JWT-scoped client; calls the check_rate_limit RPC
  { userId: user.id, clientIp: getClientIp(req) },
  RATE_LIMITS['parse-receipt-image'],         // per-endpoint config (single source of truth)
  corsHeaders,
);
if (limitErr) return limitErr;

// before embedding untrusted text into a prompt:
const safe = capText(body.content_summary);   // truncates to 4000 chars
```

- **Fails open** on RPC/infra error (the `check_rate_limit` RPC may not be
  deployed yet — US-323 prod-deploy gap). A *definitive* "limit exceeded" still
  returns 429. So this is NOT a hard dependency on the migration being applied.
- Limits live in `RATE_LIMITS` (documented in SECURITY.md). `authenticateRequest`
  now also returns the JWT-scoped `supabase` client so you don't build a second
  one. Functions that only check the auth-header presence (ai-meal-plan,
  suggest-foods, suggest-recipe) resolve the user via `supabase.auth.getUser()`
  to get the per-user key.

## Gotchas

- To keep a shared module unit-testable, do NOT add `https://esm.sh/...` URL
  imports to it — inject the supabase client as a parameter and type it with a
  minimal structural interface (the client builder is chainable AND thenable, so
  model it as `extends PromiseLike<ListResult>` with `.maybeSingle()`).
- `functions/` is not in tsconfig.app `include` or the vitest `include`, so a
  `src/test/**` file that imports a `_shared` helper via relative path is what
  actually typechecks and tests it.
