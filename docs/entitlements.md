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

## The real gap: Apple subscribers are billed as free

`enforce_plan_row_limit` resolves a plan like this:

```sql
SELECT us.plan_id FROM user_subscriptions us
WHERE us.user_id = NEW.user_id AND us.status IN ('active','trialing')
```

It reads `user_subscriptions` only. A subscription bought in the iOS app lands
in **`apple_subscriptions`** (migration `20260601000002`), keyed by
`original_transaction_id` with its own `status`, `expires_at` and `product_id`.
Nothing joins the two.

So for anyone who subscribed through the App Store, the trigger finds no plan,
falls through to the `Free` row, and caps them at **1 child and the free pantry
size while they are paying**. `check_feature_limit` has the same blind spot, so
the client agrees with the server and nothing looks broken.

iOS is the live product. This is a billing-correctness bug, not a feature gap.

The four StoreKit product ids that need mapping to plans
(`StoreKitService.swift`):

| Product id | Plan |
| --- | --- |
| `com.eatpal.app.pro.monthly` / `.yearly` | Pro |
| `com.eatpal.app.familyplus.monthly` / `.yearly` | Family Plus |
| `com.eatpal.app.professional.*` | Professional |

## The agreed table

Signed off by Dj on 2026-09-03. Rows already enforced are marked.

| Feature | Free | Pro | Family Plus | Professional | Status |
| --- | --- | --- | --- | --- | --- |
| Children | 1 | unlimited | unlimited | unlimited | **enforced** (client + trigger) |
| Pantry foods | capped | unlimited | unlimited | unlimited | **enforced** (client + trigger) |
| AI recipe imports | 5 / month | unlimited | unlimited | unlimited | not enforced — no usage counter exists |
| AI meal-plan generations | 1 / week | unlimited | unlimited | unlimited | not enforced — `max_meal_plans` column exists, unused |
| Household members | 1 | 1 | unlimited | unlimited | not enforced |
| Food chaining / ladders | view only | full | full | full | partial — `food_chaining` is a FeatureType; verify the call site |

## What is actually left to do

1. **Fix the Apple gap first.** It costs paying customers access today, and it
   is a smaller change than anything else here: extend the plan lookup in
   `enforce_plan_row_limit` and `check_feature_limit` to fall back to an active,
   unexpired `apple_subscriptions` row, mapping `product_id` to a plan.
2. Household-member seats: no gate exists at the invite path.
3. The two AI rate limits need a usage counter. There is no table for it —
   `usage_alerts` is about notifying, not counting — so this is the largest of
   the three and the only one needing new schema.
4. Hand iOS the same table. `StoreKitService.isSubscribed(to:)` still has no
   call sites outside its own file, so the phone enforces nothing locally even
   though the server now would.

## Rule

There is one entitlement system. Anything new goes through
`featureLimits.ts` and the `subscription_plans` columns — not a second module
beside it. A parallel `src/lib/entitlements.ts` was written during US-780 and
deleted before commit for exactly this reason; this repo has already paid for
three shortfall functions, three grocery insert allowlists and two calendar
implementations.
