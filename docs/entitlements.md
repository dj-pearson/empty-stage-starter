# Plan limits: what exists, and the gap

Written 2026-09-03 while implementing US-780, whose premise turned out to be
wrong. Recorded here so nobody repeats the mistake.

## US-780's premise was wrong

That story says nothing gates any feature and asks for gating to be built. A
gating system already exists and has for months:

- **`src/lib/featureLimits.ts`** — `checkFeatureLimit(featureType, currentCount)`
  calls the `check_feature_limit` RPC before an insert. Fails open on error,
  deliberately, so a flaky RPC never blocks a legitimate user.
- **`enforce_plan_row_limit`** (migration `20260723123300`) — a database trigger
  that re-checks `max_children` and `max_pantry_foods` on insert. This is the
  authoritative gate; the client check is UX.
- **`subscription_plans`** carries `max_children`, `max_pantry_foods`,
  `max_recipes`, `max_meal_plans`. A NULL means unlimited.
- **`isPlanLimitError`** turns the trigger's `plan_limit_exceeded` rejection into
  an upgrade prompt rather than an error toast.

Enforced call sites today: children (`KidsContext.addKid`), pantry foods
(`FoodsContext`, two paths), plus `food_tracker`, `receipt_scan`,
`hidden_veggies_rewrite` and the generic `FeatureGate` component.

The earlier survey missed all of this because it grepped for `isSubscribed`,
`tier ===` and `subscription.status` — the shapes a hand-rolled check would
take — and never for `checkFeatureLimit`. Searching for the pattern you expect
finds only the pattern you expect.

## The real gap: paying customers billed as free -- FIXED 2026-09-03

Migration `20260903000001_apple_subscribers_count_as_paid.sql`. Verified against
Postgres 16 with `supabase/tests/us780_apple_entitlement.test.sql`; the header of
that file says how to run it.

### What was wrong

Three tables grant entitlement. No function read more than two of them:

| | `user_subscriptions` (Stripe) | `complementary_subscriptions` (comps) | `apple_subscriptions` (App Store) |
| --- | --- | --- | --- |
| `check_feature_limit` (client pre-check) | yes | **no** | **no** |
| `enforce_plan_row_limit` (the trigger) | yes | **no** | **no** |
| `get_usage_stats` (usage dashboard) | yes | yes | **no** |
| custom-domain INSERT policies | yes | **no** | **no** |

So an App Store subscriber fell through to the `Free` row and was capped at 1
child and 50 pantry foods while paying. Nothing looked broken, because the
client pre-check and the server trigger agreed with each other and the upgrade
prompt invited someone to buy a plan they already owned. Comped users had the
same cap, while their usage dashboard showed the paid plan.

Measured before the fix, kid capacity by user shape:

```
free                 1
stripe Pro           3     <- the Pro seed is max_children = 3
apple Family Plus    1     <- paying, capped at Free
complementary        1     <- comped, capped at Free
apple Professional   1     <- paying, capped at Free
```

and after:

```
free                 1
stripe Pro           3     <- unchanged, no regression
apple Family Plus    unlimited
complementary        unlimited
apple Professional   unlimited
```

An App Store Professional subscriber was also refused by the
`professional_custom_domains` / `professional_brand_settings` INSERT policies,
which gated on a Stripe-only `EXISTS`. Verified refused before, accepted after,
with a Stripe Professional subscriber accepted both ways.

### How it was fixed

One resolver, `public.effective_plan_id(uuid)`, reads all three tables and every
consumer calls it. Notes worth keeping:

- **Ordered by generosity, not by store.** Someone holding two entitlements at
  once (a web subscriber who later buys on the phone) must never get the smaller
  one, and no source ranking guarantees that. A user with one entitlement has one
  candidate, so Stripe-only subscribers resolve exactly as before.
- **`check_feature_limit` and `get_usage_stats` were copied verbatim** with only
  the plan-lookup block changed and inserted respectively. A first attempt
  rewrote `check_feature_limit` from what its call sites appeared to need and
  silently dropped the `ai_coach` and `food_tracker` usage branches, both live.
  The diffs are pure insertions; nothing was removed.
- **`effective_plan_id` is revoked from `PUBLIC`.** It is `SECURITY DEFINER` and
  takes a user id, so left executable it would report any user's plan past RLS.
  Its two callers are themselves `SECURITY DEFINER` and reach it regardless. RLS
  policies, which evaluate as the querying user, use the argument-free
  `current_user_plan_name()` instead.
- **Product ids are mapped most-specific-first.** `professional` contains `pro`,
  so a naive map silently downgrades the most expensive tier. All six ids in
  `StoreKitService.swift` are pinned in the test.

### Known, not fixed here

- `get_usage_stats` reports `is_complementary: false` for a comped user. Cause:
  PL/pgSQL `RECORD IS NOT NULL` is true only when *every* field is non-null, and
  Family Plus has `max_children = NULL`, so the flag never gets set. Pre-existing
  and cosmetic -- it does not affect entitlement. Confirmed present before this
  migration.
- The `Pro` seed has `max_children = 3`, but the agreed table below says
  unlimited. That is a data change to `subscription_plans`, not a code change,
  and is left for whoever owns the pricing page.
- `can_add_child` (migration `20251008141000`) is also Stripe-only, and dead --
  no call site outside the generated types. Left alone.

## The agreed table

Signed off by Dj on 2026-09-03. Rows already enforced are marked.

| Feature | Free | Pro | Family Plus | Professional | Status |
| --- | --- | --- | --- | --- | --- |
| Children | 1 | unlimited | unlimited | unlimited | **enforced** (client + trigger); the Pro seed still says 3 |
| Pantry foods | capped | unlimited | unlimited | unlimited | **enforced** (client + trigger) |
| AI recipe imports | 5 / month | unlimited | unlimited | unlimited | not enforced — no usage counter exists |
| AI meal-plan generations | 1 / week | unlimited | unlimited | unlimited | not enforced — `max_meal_plans` column exists, unused |
| Household members | 1 | 1 | unlimited | unlimited | not enforced |
| Food chaining / ladders | view only | full | full | full | partial — `food_chaining` is a FeatureType; verify the call site |

## What is actually left to do

1. ~~Fix the Apple gap.~~ Done, see above -- and the comp gap and the
   custom-domain RLS gap with it.
2. Household-member seats: no gate exists at the invite path.
3. The two AI rate limits need a usage counter. `user_usage_tracking` counts
   `ai_coach_requests` and `food_tracker_entries` per day but has no column for
   recipe imports or meal-plan generations, so this needs new schema and is the
   largest of the three.
4. Hand iOS the same table. `StoreKitService.isSubscribed(to:)` still has no
   call sites outside its own file, so the phone enforces nothing locally even
   though the server now does.

## Rule

There is one entitlement system. Anything new goes through
`featureLimits.ts` and the `subscription_plans` columns — not a second module
beside it. A parallel `src/lib/entitlements.ts` was written during US-780 and
deleted before commit for exactly this reason; this repo has already paid for
three shortfall functions, three grocery insert allowlists and two calendar
implementations.
