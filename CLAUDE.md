# CLAUDE.md - EatPal (Munch Maker Mate)

> Meal planning & nutrition tracking app. Vite + React 19 + TypeScript + Supabase + Expo.

---

## CRITICAL RULES

### Security
- **NEVER** include real secrets (API keys, JWT tokens, DB passwords, OAuth secrets) in any file.
- Use placeholders like `sk_live_XXXXXXXXXXXXXXXX` or `REPLACE_WITH_...` in examples.
- If you accidentally commit a real secret: STOP, tell the user, replace with placeholder.

### Documentation & Token Usage
- Ask scope before creating docs (one file vs many, level of detail).
- Default to concise. One document at a time, then ask if more needed.
- Don't write 1000+ line documents without checking.

---

## Stack Summary

- **Frontend**: Vite 7, React 19, TypeScript 5.8, shadcn-ui, Tailwind 3.4
- **3D/Animation**: Three.js, @react-three/fiber, Framer Motion, GSAP
- **Backend**: Supabase 2.74 (Postgres, Auth, Realtime, Edge Functions)
- **Mobile**: Expo 54 + Expo Router 6
- **Deploy**: Cloudflare Pages (web), EAS Build (mobile)
- **Testing**: Vitest, Playwright, K6
- **Monitoring**: Sentry 10

---

## Directory Structure

```
src/
├── components/          # 264 components
│   ├── ui/             # shadcn-ui (DO NOT modify directly)
│   ├── admin/          # Admin dashboard
│   ├── schema/         # SEO JSON-LD components (9 schemas)
│   └── [feature]/      # Feature components
├── contexts/AppContext.tsx  # Main state (~1052 lines)
├── hooks/              # 33 custom hooks
├── integrations/supabase/   # Client & generated types
├── lib/                # Business logic & utilities
├── pages/              # 43 page components
supabase/migrations/    # DB migrations
functions/              # Supabase Edge Functions
tests/                  # Playwright E2E
```

### Key Files
| Purpose | Location |
|---------|----------|
| Routes | `src/App.tsx` |
| Global state | `src/contexts/AppContext.tsx` |
| Supabase client | `src/integrations/supabase/client.ts` |
| DB types | `src/integrations/supabase/types.ts` (auto-generated) |
| Platform utils | `src/lib/platform.ts` (web/mobile storage) |

---

## Commands

```bash
# Dev
npm run dev              # Vite dev server (port 8080)
npm run expo:start       # Expo dev server
npm run build            # Production build

# Test
npm run test             # Vitest watch
npm run test:run         # Vitest once
npm run test:e2e         # Playwright
npm run test:a11y        # Accessibility
npm run test:perf        # K6 load

# Quality
npm run lint
npm run format
npm run analyze:bundle
```

### Environment Variables
Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL`
Optional: `VITE_SENTRY_DSN`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GA_MEASUREMENT_ID`, `RESEND_API_KEY`

---

## Conventions

### TypeScript
- **Interfaces** for object shapes, **types** for unions/primitives.
- Use generated DB types: `Database['public']['Tables']['foods']['Row']`.
- No `any` types.

### Styling
- Tailwind utility classes with `cn()` for conditionals.
- Use semantic tokens (`bg-background`, `text-foreground`) — never hardcode colors.
- Responsive: `flex-col md:flex-row`.

### Components
- Named exports for components; default export only for pages.
- Add shadcn components via CLI: `npx shadcn-ui@latest add [name]`.
- File naming: `PascalCase.tsx` for components, `camelCase.ts` for utils, `use*.ts` for hooks.

### Error Handling
- Try-catch around async ops; user feedback via `toast` from `sonner`.
- Validate with Zod at boundaries.

### Git / Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- Run `npm run lint && npm run format && npm run test:run` before committing.

---

## State Management (AppContext)

Location: `src/contexts/AppContext.tsx`. Single source of truth, dual storage (localStorage + Supabase), realtime sync.

```typescript
import { useApp } from '@/contexts/AppContext';
const { foods, addFood, updateFood, deleteFood, kids, activeKidId } = useApp();
```

Entities managed: foods, recipes, kids, plan entries, grocery items. Each has `add/update/delete` + bulk variants. Flow: component → AppContext method → local state (immediate) → Supabase (async) → localStorage (backup) → realtime subscription → debounced update (300ms).

**Note**: DB uses snake_case, UI uses camelCase. See `normalizeRecipeFromDB()` for mapping pattern.

---

## Supabase

### Basic Query
```typescript
import { supabase } from '@/integrations/supabase/client';
const { data, error } = await supabase.from('foods').select('*').eq('user_id', userId);
```

### Realtime
```typescript
const channel = supabase.channel('changes').on('postgres_changes',
  { event: '*', schema: 'public', table: 'grocery_items', filter: `household_id=eq.${id}` },
  (payload) => { /* handle */ }
).subscribe();
// Cleanup in useEffect return: channel.unsubscribe();
```

### Migrations
```bash
supabase migration new add_my_table
# Edit the SQL file
supabase db push
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

### RLS — ALWAYS enable on new tables
```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own" ON public.my_table FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own" ON public.my_table FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Similar for UPDATE, DELETE
```

### Core Tables
`kids`, `foods`, `recipes`, `plan_entries`, `grocery_items`, `grocery_lists`, `user_subscriptions`, plus newer: `meal_plan_templates`, `meal_voting`, `voting_sessions`, `grocery_delivery`, `delivery_providers`, `quiz_responses`, `budget_calculations`, `prompt_templates`, `admin_alerts`, `system_health`, `workflow_automations`.

---

## Key Hooks

```typescript
useApp()                  // Global state
useLocalStorage(key, val) // Persisted state
useIsMobile/Tablet/Desktop()
useSubscription()         // Stripe subscription state
useReducedMotion()        // a11y
useKeyboardNavigation()
useInView(ref)
useSwipeGesture() / usePullToRefresh() / useWindowSize()
useUndoRedo(initial)
useFeatureFlag(name)
```

---

## SEO Schema Components

Nine JSON-LD components in `src/components/schema/`: `ArticleSchema`, `FAQSchema`, `BreadcrumbSchema`, `HowToSchema`, `OrganizationSchema`, `SoftwareAppSchema`, `RecipeSchema`, `ReviewSchema`, `VideoSchema`. Drop into page JSX for rich search results.

---

## Common Patterns

### New Page
1. Create `src/pages/MyPage.tsx` with `<Helmet>` for title/meta.
2. Add lazy route in `src/App.tsx` with `<Suspense>` fallback.
3. Wrap in `<ProtectedRoute>` if auth required.

### New Component
Location: `src/components/[feature]/Name.tsx`. Use shadcn UI primitives, `cn()` for classes, destructure props with defaults.

### Performance
- Lazy load routes/heavy components with `lazy()` + `Suspense`.
- `useMemo` for expensive compute, `useCallback` for handler props, `memo()` for pure components.
- `OptimizedImage` component handles lazy loading, WebP/AVIF, priority LCP.

### Accessibility
- Semantic HTML, ARIA labels on icon buttons, keyboard handlers (Escape/Enter).
- Respect `useReducedMotion()`.

---

## Troubleshooting Quick Reference

- **"localStorage is not defined"**: Use `getStorage()` from `src/lib/platform.ts`.
- **Realtime not firing**: Check RLS policies allow SELECT on filter match.
- **"JWT expired"**: Implement refresh or redirect to `/auth`.
- **Hydration mismatch**: No browser-only APIs in initial render.
- **Slow page**: Run `npm run analyze:bundle`, lazy load, optimize images.

---

## Do / Don't

**Do**: TypeScript strict, conventional commits, enable RLS, clean up subscriptions, optimize images, accessibility attrs, toast feedback, loading states.

**Don't**: Commit `.env`, modify `src/components/ui/` directly, hardcode colors, use `any`, expose keys in frontend, skip RLS, leave console.logs in production.

---

**Last Updated**: 2026-04-14
