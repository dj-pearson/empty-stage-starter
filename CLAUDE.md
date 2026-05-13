# CLAUDE.md - EatPal (Munch Maker Mate)

> Meal planning & nutrition tracking. Vite 7 + React 19 + TS 5.8 + Supabase + Expo 54.

## Critical Rules

- **No real secrets** in any file — use placeholders (`sk_live_XXXX`, `REPLACE_WITH_...`). If one is committed: stop, alert user, replace.
- **Never** modify `src/components/ui/` (shadcn), commit `.env`, hardcode colors, use `any`, or skip RLS on new tables.
- **Branch first, code second.** iOS is live in the App Store. Before writing or pushing code, confirm with the user *which branch* the work belongs on (see Branching & Release). Never push directly to `main`. Never assume the current branch is correct just because you're on it.
- **Migrations must be backward-compatible.** Users on older app builds (pre-current TestFlight) are still hitting Supabase. Never drop or rename a column/table that any shipped iOS version reads. Additive only — see Migration Rules below.
- Default to concise docs. Ask before writing long docs or many files.

## Stack

Frontend: Vite, React 19, TS, shadcn-ui, Tailwind 3.4, Three.js, Framer Motion. Backend: Supabase (Postgres/Auth/Realtime/Edge Functions). Mobile: Expo Router 6. Deploy: Cloudflare Pages + EAS. Test: Vitest, Playwright, K6. Monitor: Sentry.

## Layout

```
src/
  components/{ui,admin,schema,[feature]}/   # shadcn-ui untouched; schema = JSON-LD
  contexts/AppContext.tsx                    # global state, ~1052 lines
  hooks/                                     # 33 custom hooks
  integrations/supabase/{client.ts,types.ts} # types.ts auto-generated
  lib/platform.ts                            # web/mobile storage abstraction
  pages/                                     # 43 pages
supabase/migrations/   functions/   tests/
```

Entry points: routes → `src/App.tsx`; state → `AppContext.tsx`; supabase → `integrations/supabase/client.ts`.

## Commands

```bash
npm run dev              # port 8080
npm run build
npm run test:run         # vitest
npm run test:e2e         # playwright
npm run lint && npm run format
```

Required env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL`. Optional: `VITE_SENTRY_DSN`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GA_MEASUREMENT_ID`, `RESEND_API_KEY`.

Run `npm run lint && npm run format && npm run test:run` before committing. Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.

## Branching & Release

iOS is live, so branch choice is now a deploy decision. **Always confirm the target branch with the user before pushing or switching.** If unsure, ask — don't guess.

| Branch              | Source from   | Merges to             | Auto-deploys to                                                   |
| ------------------- | ------------- | --------------------- | ----------------------------------------------------------------- |
| `develop`           | `main`        | `release/*`           | TestFlight **internal** build (EAS `preview` profile)             |
| `release/x.y.z`     | `develop`     | `main` + tag          | TestFlight **external** + App Store Connect submission            |
| `hotfix/<slug>`     | `main`        | `main` + `develop`    | Expedited App Store submission with auto-filled review notes      |
| `main`              | (merge only)  | —                     | Tagged commits (`ios/v*`, `web/v*`) trigger production deploys    |
| `web/v*` tag        | `main`        | —                     | Cloudflare Pages production (only when web ships with iOS)        |
| `claude/*`          | `develop`     | `develop` via PR      | Nothing — feature work only                                       |

**Rules of thumb:**

- New feature → branch from `develop`, PR back to `develop`.
- App Store release candidate → cut `release/x.y.z` from `develop`, freeze, only fix-forward commits land there.
- Production bug → branch `hotfix/<slug>` **from `main`**, NOT from `develop`. Keeps the hotfix free of un-reviewed feature work so Apple's expedited review only sees the fix. Cherry-pick or merge back into `develop` after.
- Web-only change while iOS is mid-review → ship from `develop` to a `web/*` tag; do **not** advance the iOS bundle.
- Never force-push `main`, `develop`, or any `release/*`. Never merge `develop` → `main` directly; it must go through a `release/*` or `hotfix/*`.

Commit prefix `hotfix:` is recognized by CI to auto-fill App Store review notes for expedited submission. Use it sparingly — Apple revokes expedited privileges if abused.

## Conventions

- **TS**: interfaces for shapes, types for unions. Use `Database['public']['Tables']['foods']['Row']`. No `any`.
- **Styling**: Tailwind + `cn()`; semantic tokens (`bg-background`); responsive via `md:` prefixes.
- **Components**: named exports (default only for pages). Add shadcn via `npx shadcn-ui@latest add [name]`. Naming: `PascalCase.tsx` / `camelCase.ts` / `use*.ts`.
- **Errors**: try-catch async; `toast` from `sonner` for feedback; Zod at boundaries.
- **a11y**: semantic HTML, ARIA on icon buttons, respect `useReducedMotion()`.
- **Perf**: `lazy()` + `Suspense` for routes/heavy components; `useMemo`/`useCallback`/`memo()` where it matters; `OptimizedImage` for images.

## State (AppContext)

Single source of truth, dual storage (localStorage + Supabase), realtime sync.

```typescript
const { foods, addFood, updateFood, deleteFood, kids, activeKidId } = useApp();
```

Entities: foods, recipes, kids, plan entries, grocery items (each with add/update/delete + bulk). Flow: component → AppContext → local state (sync) → Supabase (async) → localStorage backup → realtime subscription (300ms debounce).

**DB is snake_case, UI is camelCase** — see `normalizeRecipeFromDB()`.

## Supabase

```typescript
// Query
const { data, error } = await supabase.from('foods').select('*').eq('user_id', userId);

// Realtime — remember channel.unsubscribe() in useEffect cleanup
const channel = supabase.channel('changes').on('postgres_changes',
  { event: '*', schema: 'public', table: 'grocery_items', filter: `household_id=eq.${id}` },
  (payload) => { /* handle */ }
).subscribe();
```

Migrations: `supabase migration new <name>` → edit SQL → `supabase db push` → `supabase gen types typescript --local > src/integrations/supabase/types.ts`.

### Migration Rules (Backward Compatibility)

The DB is shared by every shipped iOS version still on users' phones. Min-supported version is whatever sits in `MIN_SUPPORTED_IOS_BUILD` (see app config) — any column/table that build reads is **load-bearing for production users** and cannot be removed.

**Always safe (additive):**

- `ADD COLUMN ... NULL` (or with a default — old clients ignore unknown columns; Supabase JSON tolerates them).
- New tables (with RLS).
- New indexes, new views, new functions.
- New RLS policies that *broaden* access; tighter SELECT policies may break older clients — check first.

**Never do in a single migration (requires a multi-release deprecation):**

- `DROP COLUMN` / `DROP TABLE` on anything an old client reads or writes.
- `RENAME COLUMN` / `RENAME TABLE` — old clients still query the old name. Dual-write through a view or trigger across at least one shipped iOS release before retiring.
- Add `NOT NULL` to an existing column without a default that satisfies old INSERTs.
- Tighten a `CHECK` constraint that existing rows or in-flight writes from old clients might violate.
- Change a column type in place (e.g. `text` → `uuid`). Add new column, dual-write, migrate readers, then retire old column in a later release.
- Remove an enum value or relabel one — older clients send the old label.
- Reduce the columns returned by an RPC. Add a new RPC version (`*_v2`) instead.

**Deprecation flow (over ≥ 2 iOS releases):**

1. Release N: add the new column/table/RPC. Write to *both* old and new from the new client. Old clients keep using the old shape.
2. Release N+1: new client reads from the new shape. Old shape is still populated.
3. Once `MIN_SUPPORTED_IOS_BUILD` is bumped past N, write a follow-up migration that retires the old shape.

If a migration cannot be made backward-compatible (e.g. urgent security fix), it must be paired with a force-update screen in the app *and* with a min-version bump shipped at least one release before the migration lands.

**Always enable RLS on new tables**:
```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own" ON public.my_table FOR SELECT USING (auth.uid() = user_id);
-- Repeat for INSERT (WITH CHECK), UPDATE, DELETE
```

Core tables: `kids`, `foods`, `recipes`, `plan_entries`, `grocery_items`, `grocery_lists`, `user_subscriptions`. Newer: `meal_plan_templates`, `meal_voting`, `voting_sessions`, `grocery_delivery`, `quiz_responses`, `budget_calculations`, `admin_alerts`, `system_health`, `workflow_automations`.

## Hooks

`useApp` (global), `useLocalStorage`, `useIsMobile/Tablet/Desktop`, `useSubscription` (Stripe), `useReducedMotion`, `useKeyboardNavigation`, `useInView`, `useSwipeGesture`, `usePullToRefresh`, `useWindowSize`, `useUndoRedo`, `useFeatureFlag`.

## SEO Schemas

Nine JSON-LD components in `src/components/schema/` (Article, FAQ, Breadcrumb, HowTo, Organization, SoftwareApp, Recipe, Review, Video). Drop into page JSX.

## New Page Recipe

1. `src/pages/MyPage.tsx` with `<Helmet>` for meta.
2. Add lazy route in `src/App.tsx` with `<Suspense>`.
3. Wrap in `<ProtectedRoute>` if auth required.

## Troubleshooting

- `localStorage is not defined` → use `getStorage()` from `src/lib/platform.ts`.
- Realtime silent → check RLS allows SELECT on the filter match.
- `JWT expired` → refresh or redirect to `/auth`.
- Hydration mismatch → no browser-only APIs in initial render.
- Slow page → `npm run analyze:bundle`, lazy load, optimize images.

---
**Last Updated**: 2026-05-11
