# CLAUDE.md - EatPal (Munch Maker Mate)

> Meal planning & nutrition tracking. Vite 7 + React 19 + TS 5.8 + Supabase + Expo 54.

## Critical Rules

- **No real secrets** in any file — use placeholders (`sk_live_XXXX`, `REPLACE_WITH_...`). If one is committed: stop, alert user, replace.
- **Never** modify `src/components/ui/` (shadcn), commit `.env`, hardcode colors, use `any`, or skip RLS on new tables.
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
**Last Updated**: 2026-04-28
