# functions/_shared — Edge Function Shared Utilities

Deno modules reused across Supabase edge functions. Keep these importable from
both Deno (functions) and, where logic is pure, from vitest (`src/test/**`).

## Modules

- `auth.ts` — `authenticateRequest(req)` verifies the JWT and returns `{ user }` or `{ error: Response }` (401). Call first in every authed function.
- `cors.ts` — `getCorsHeaders(req)` / `handleCorsPreFlight(req)`. Spread `corsHeaders` into every Response.
- `household.ts` — household/kid authorization (see below).
- `stripe-pricing.ts` — Stripe price allowlist / server-side resolution (see below).
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

## Gotchas

- To keep a shared module unit-testable, do NOT add `https://esm.sh/...` URL
  imports to it — inject the supabase client as a parameter and type it with a
  minimal structural interface (the client builder is chainable AND thenable, so
  model it as `extends PromiseLike<ListResult>` with `.maybeSingle()`).
- `functions/` is not in tsconfig.app `include` or the vitest `include`, so a
  `src/test/**` file that imports a `_shared` helper via relative path is what
  actually typechecks and tests it.
