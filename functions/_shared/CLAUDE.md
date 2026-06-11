# functions/_shared — Edge Function Shared Utilities

Deno modules reused across Supabase edge functions. Keep these importable from
both Deno (functions) and, where logic is pure, from vitest (`src/test/**`).

## Modules

- `auth.ts` — `authenticateRequest(req)` verifies the JWT and returns `{ user }` or `{ error: Response }` (401). Call first in every authed function.
- `cors.ts` — `getCorsHeaders(req)` / `handleCorsPreFlight(req)`. Spread `corsHeaders` into every Response.
- `household.ts` — household/kid authorization (see below).
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

## Gotchas

- To keep a shared module unit-testable, do NOT add `https://esm.sh/...` URL
  imports to it — inject the supabase client as a parameter and type it with a
  minimal structural interface (the client builder is chainable AND thenable, so
  model it as `extends PromiseLike<ListResult>` with `.maybeSingle()`).
- `functions/` is not in tsconfig.app `include` or the vitest `include`, so a
  `src/test/**` file that imports a `_shared` helper via relative path is what
  actually typechecks and tests it.
