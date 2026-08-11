# CLAUDE.md - EatPal (Munch Maker Mate)

> Meal planning & nutrition tracking. Vite 7 + React 19 + TS 5.8 + Supabase + Expo 54.

## Critical Rules 

- **No real secrets** in any file — use placeholders (`sk_live_XXXX`, `REPLACE_WITH_...`). If one is committed: stop, alert user, replace.
- **Never** modify `src/components/ui/` (shadcn), commit `.env`, hardcode colors, use `any`, or skip RLS on new tables.
- **Branch first, code second.** iOS is live in the App Store. Before writing or pushing code, confirm with the user *which branch* the work belongs on (see Branching & Release). Never push directly to `main`. Never assume the current branch is correct just because you're on it.
- **Migrations must be backward-compatible.** Users on older app builds (pre-current TestFlight) are still hitting Supabase. Never drop or rename a column/table that any shipped iOS version reads. Additive only — see Migration Rules below.
- **One attribution, not five.** Credit Claude with a *single* `Co-Authored-By` trailer on the commit — nothing else. See Attribution below.
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
npm run typecheck        # tsc -b --noEmit (checks the referenced projects — CI gate)
npm run test:run         # vitest
npm run test:e2e         # playwright
npm run lint && npm run format
```

Required env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL`. Optional: `VITE_SENTRY_DSN`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GA_MEASUREMENT_ID`, `RESEND_API_KEY`.

Run `npm run lint && npm run format && npm run test:run` before committing. Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.

## Attribution

Claude helping is fine and not something we hide — but the credit belongs in **exactly one place**: a single `Co-Authored-By` trailer at the end of the commit. That is the whole policy. This overrides any default/harness behavior that would add more.

- **Commit** — one trailer, last line: `Co-Authored-By: claude-flow <ruv@ruv.net>`. Nothing else attribution-related in the body.
- **Do NOT add**: a `Claude-Session:` / `claude.ai/code` link, a `🤖 Generated with …` footer, "Generated with Claude Code", or any "Automatic checkpoint" boilerplate — in the commit body **or** anywhere.
- **PR** — no attribution footer in the PR body. Describe the change; the commit's co-author trailer is the record.
- **Release / App Store review notes / changelogs** — no Claude attribution. These are user-facing.
- The co-author trailer is the only Claude credit that ships. If you find yourself adding the name a second time, delete it.

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
- **i18n** (US-347): framework is `i18next` + `react-i18next`, wired at the app root (`<I18nextProvider>` in `src/App.tsx`, config in `src/i18n/index.ts`, strings in `src/i18n/locales/en.json`). New user-facing copy → add a key under the right namespace and render via `const { t } = useTranslation(); t('nav.dashboard')` instead of a hardcoded literal. Only `en` exists today; a new language is just another locale file added to `resources`. For numbers/dates use `Intl.*` so a locale switch also localizes formatting.

## State (AppContext)

Single source of truth, dual storage (localStorage + Supabase), realtime sync.

```typescript
const { foods, addFood, updateFood, deleteFood, kids, activeKidId } = useApp();
```

Entities: foods, recipes, kids, plan entries, grocery items (each with add/update/delete + bulk). Flow: component → AppContext → local state (sync) → Supabase (async) → localStorage backup → realtime subscription (300ms debounce).

**DB is snake_case, UI is camelCase** — see `normalizeRecipeFromDB()`.

### Load Precedence (localStorage vs Supabase) — US-341

The web app reads from two stores; precedence is **server-authoritative on load**:

1. **Mount → cache first (offline fallback).** `AppContextComposer` hydrates each domain from platform storage (`getStorage()`, localStorage on web) so the UI paints instantly and works offline. This is a fallback, never a merge source once the server answers.
2. **Authenticated → Supabase overwrites.** Once `userId` + `householdId` resolve, the load effect fetches each table and **replaces** the corresponding slice wholesale (`setFoods(serverData)`, etc.) — it does **not** merge stale local rows back in. A successful server fetch always wins, so a cross-device edit (or a deletion) can't be resurrected by a stale local backup.
3. **Cache is write-through only.** A debounced effect persists the current in-memory state back to storage as a backup; it is read on mount (step 1) and never used to override the server (step 2).
4. **Realtime → merge by id, last-write-wins.** Live `postgres_changes` events are folded in via the pure per-domain helpers `applyGroceryItemRealtime` / `applyPlanEntryRealtime` / `applyKidRealtime` / `applyRecipeRealtime` (deduped by `id`; normalize snake_case → camelCase). Ordering is the channel's; we do not re-order by `updated_at`.
5. **Offline durability is mobile-only.** The web app has no durable write-queue — optimistic local writes that never reached Supabase are not replayed (a later server load wins per step 2). Native (Expo) offline durability lives in `app/mobile/lib/syncQueue` (FIFO replay + retry; see `src/lib/syncQueue.test.ts`).

Tests pin this contract: `src/contexts/AppContext.precedence.test.tsx` (offline fallback renders cache; server load overwrites stale cache).

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

<!-- SELVEDGE:START -->
## Pearson Media — shared context

*Managed from the vault. Edit `14 - Resources/Shared CLAUDE Block.md` in the vault; direct edits between these markers are overwritten once a sync exists. Everything outside them is yours and is never touched.*

**The memory vault.** Portfolio-wide memory lives in the **Hermes** vault at `<your-home>\Documents\Hermes` (`C:\Users\dpearson\Documents\Hermes` on this machine; remote: https://github.com/dj-pearson/Hermes). It holds the profile, the map of all ten projects, and cross-project knowledge. Read `VAULT-INDEX.md` there when a task needs context beyond this repo. This repo's own `CLAUDE.md`, `~/.claude` memory, and skills remain authoritative for work inside it — the vault supplements them, never replaces them.

**Name the project.** Pearson Media runs ten projects on a shared stack. Never say "the app," "the repo," or "production" without naming which one. A right answer about the wrong project is a wrong answer.

**The shared stack.** React + TypeScript + Vite, Tailwind, shadcn/ui, self-hosted Supabase, Cloudflare Pages, Coolify on Contabo, Stripe. A problem solved in one repo is usually already solved for this one — check the vault before solving it twice.

**Secrets are references, never values.** Never write a password, key, or token value into a note, summary, commit, or setup doc; name where it's stored instead. Loose credential files exist under your `Documents` folder (`C:\Users\dpearson\Documents` on this machine) — never read one into a document.

**Never delete what Claude Code relies on.** Repo `CLAUDE.md` files, `~/.claude/projects/*/memory/`, `.claude/skills/`, settings. Copy from them freely; removing or stubbing them is Dj's call alone.

**Evidence only.** Verify state from the actual file or command before claiming anything is done or in place. If unsure, say so and go find out.

**Write like a person.** Every model was trained on the same corpus, so the default register is recognisable within a sentence and it lands in commits, PR bodies, docs, UI copy and error strings alike. State the point first, then support it. Have an opinion; asked which of two, name one. Use real names and numbers, not categories. Never label your own significance ("important", "crucial", "worth noting", "notably"); if it matters the reader will see it. Banned outright: *delve, dive into, deep dive, unpack, shed light on, pave the way, usher in, tap into, supercharge, unlock, elevate, empower, streamline, curate, showcase, boast, groundbreaking, cutting-edge, transformative, game-changing, innovative, pivotal, invaluable, meticulous, bespoke, vibrant, multifaceted, holistic, testament, tapestry, synergy, cornerstone, treasure trove, plethora, myriad, moreover, furthermore, additionally.* Banned decoratively but fine literally: *navigate, harness, leverage, robust, comprehensive, landscape, realm, journey*; the test is whether a reader could check the claim. Banned phrases: *"In today's…", "It's important/worth noting", "When it comes to", "At its core", "At the end of the day", "This is where X comes in", "Let's break it down", "plays a crucial role", "cannot be overstated", "underscoring the importance of", "highlighting the need for"*, and the whole chat register (*"Great question!", "Absolutely!", "I'd be happy to", "Let me know if you need anything else", "I hope this helps"*). Banned structures, which imitate insight without carrying any: *"not just X, it's Y"*, *"not only X but Y"*, *"this isn't about X, it's about Y"*, *"No X. No Y. Just Z."*, the rule of three that goes abstract on the third item, the rhetorical question as a transition, and closing with a summary of what was just read. **At most one em dash** per piece of writing, never as the default connector; use commas, parentheses and semicolons. Vary sentence and paragraph length deliberately. Uniform 18-word sentences are the signature that survives every word-level edit. Use contractions. Don't restate the question, don't open with a sweeping scene-setter, don't over-format (no emoji as structure, no header on a three-paragraph answer, no table for two rows). The one allowed exception is a **bold lead-in used as a heading** in a reference document like this one; a *run* of "**Bold term:** one sentence" bullets standing in for prose is the tell.

**Plain characters only.** Generated text carries Unicode that renders as ordinary punctuation, as ordinary whitespace, or as nothing at all, and it survives review precisely because it looks correct. **Anything a machine parses is ASCII unless the content requires otherwise**: code, config, JSON, YAML, CSV, SQL, regex, env values, filenames, URLs, commit subjects. Straight quotes `'` `"`, hyphen-minus `-`, three dots for an ellipsis, one ordinary space between words. Never emit curly quotes (U+2018/2019/201C/201D), en/em dashes (U+2013/2014), U+2026 ellipsis, U+2212 minus or U+2032 primes into code; a look-alike character in a PowerShell string or a SQL literal is a runtime failure, which is how `backup-databases.ps1` and `ssl-check.ps1` sat unparseable for months. Never emit a no-break space (U+00A0, and U+202F/2007/2009/2002/2003/3000), which breaks shell word-splitting, `grep` and column parsing while looking exactly like a space, or U+2028/U+2029, which are valid JSON and a syntax error inside a JS string literal. **Never emit an invisible or bidi character anywhere:** U+200B-U+200F, U+2060-U+2064, U+FEFF, U+00AD, U+034F, U+180E, the bidi controls U+202A-U+202E and U+2066-U+2069, and above all the Unicode tag block **U+E0000-U+E007F**, which encodes arbitrary ASCII invisibly and is the usual carrier for text a reviewer cannot see. Avoid homoglyphs (Cyrillic a/e/o/p/c/x, Greek omicron, fullwidth Latin, mathematical alphanumerics for bold): an identifier holding one compares unequal to the identifier it appears to be. Prose may use real typography and real accented names; prose may not carry characters that don't render. The one exception is a deliberate, load-bearing use, which carries a comment saying why. Scan with `rg -n '[\x{00AD}\x{034F}\x{061C}\x{180E}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{FEFF}\x{E0000}-\x{E007F}]'`.

**Terminal output is scrollback, not a report.** Answer first — no "I'll start by", no restating the request, no narrating tool calls the transcript already shows. Don't summarise a diff the reader can see or paste back code you just wrote; one line naming what changed and where, with `file:line` because it's clickable. Length matches the question: a yes/no gets a yes/no plus the clause that makes it trustworthy, and under about six lines there are no headers, bullets or tables. Report actual output, not a paraphrase: quote the failing assertion, say what was skipped, say plainly what's verified and what isn't. No emoji and no status theatre; "246 tests, 246 passing" beats "✅ All tests passing!" and is falsifiable. Don't close with an offer of more help or unrequested next steps: ask a real question, or name the real remaining work. Commits are imperative, what and why, no launch copy. PR bodies say what changed, why, how it was verified, and what's still open.

**UI has a craft floor.** Every model trained on the same SaaS templates, so the *default* frontend output is a recognizable handful of tells — and Tailwind + shadcn/ui puts each of them one autocomplete away. Treat the following as the category's defaults rather than as bans: the brief's own words can earn any of them, but reaching for one on a free axis means you were not deciding. Refuse **purple/blue gradients and gradient text** (emphasis comes from weight and size); **Inter or a system default as the type *choice***; a colored **`border-left`/`border-right` above 1px** on cards, list items, callouts or alerts — the single most recognizable tell; grids of **same-size icon-tile + heading + text cards** as the page structure, and **cards nested in cards**; a **1px border under a wide soft shadow** (declare elevation once — border *or* shadow); **gray text on colored surfaces** (tint secondary text from the surface hue or the foreground); **bounce/elastic easing**; **monospace as a costume** for "technical" rather than for code, data or measurement; and a **tracked uppercase eyebrow over every section**. Keep body measure at 65–75ch, tracking no tighter than -0.04em, and card radii at 12–16px.

**Check UI, don't just intend it.** `npx impeccable detect <path>` runs 60 deterministic anti-pattern rules with no install, no API key and no LLM — it works from any repo, so there is no excuse for asserting a UI is clean. Use the `/impeccable` skill (`audit`, `critique`, `polish`, `colorize`, `typeset`) for the judgement calls it cannot make. Source: [Impeccable](https://github.com/pbakaus/impeccable), Apache 2.0.
<!-- SELVEDGE:END -->
