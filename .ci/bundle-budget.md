# Bundle budgets

Enforced by `scripts/ci/check-bundle-budget.mjs`, which runs in the Build job
after `npm run build`. Values live in `.ci/bundle-budget.json`; this file records
what was measured and why the gate exists.

## Why

`vite.config.ts` carries 200+ lines of manual chunking, and every rule is
annotated with a production breakage it prevents: Sentry blanking the app via a
TDZ, TipTap's CJS interop, recharts and react-redux racing at module init, a
`vendor-misc` catch-all that produced `Cannot set properties of undefined`. It
is empirically derived and one dependency bump from shifting again. Nothing
measured the result, so a chunking change that moved a megabyte into the entry
bundle would have shipped looking exactly like one that helped.

Two budgets, because they catch different regressions. A per-chunk budget
catches one dependency ballooning. The total catches work being shuffled
between chunks without getting smaller.

Sizes are gzipped, because that is what crosses the wire.

## Measured 2026-09-03

Branch `claude/web-platform-roadmap-vd2zid`, after the US-771 deletions.
320 JS files, **2617.3 kB gzipped total**.

Budgets are the measured value plus 5%, rounded up to the nearest kB, with a
2 kB floor. The floor matters for the small chunks: 5% of a 1 kB shim is 50
bytes, which would fail on noise, and a gate that fails on noise gets
re-measured until it means nothing.

| Chunk                 | Measured (gz) | Budget  |
| --------------------- | ------------- | ------- |
| `vendor-swagger`      | 291.1 kB      | 306 kB  |
| `vendor-three-core`   | 171.8 kB      | 181 kB  |
| `vendor-tiptap`       | 141.1 kB      | 149 kB  |
| `vendor-markdown`     | 140.7 kB      | 148 kB  |
| `vendor-sentry`       | 129.1 kB      | 136 kB  |
| `index` (entry)       | 112.8 kB      | 124 kB  |
| `vendor-react`        | 61.4 kB       | 65 kB   |
| `vendor-gsap`         | 58.4 kB       | 62 kB   |
| `vendor-three-eco`    | 51.5 kB       | 55 kB   |
| `vendor-animation`    | ~39 kB        | 41 kB   |
| `vendor-swagger-deps` | ~34 kB        | 36 kB   |
| `vendor-utils`        | ~15 kB        | 16 kB   |
| `vendor-forms`        | ~12 kB        | 13 kB   |
| `vendor-query`        | ~12 kB        | 13 kB   |
| `vendor-router`       | ~9 kB         | 10 kB   |
| `vendor-supabase`     | 39.5 kB       | 42 kB   |
| **Total JS**          | **2617.3 kB** | 2749 kB |

## What the numbers say

Four chunks are worth calling out, and all four have an open story:

- **`vendor-swagger` at 291 kB is the single largest thing shipped**, and it
  serves exactly one page (`/api/docs`). US-772 lazy-loads or replaces it.
- **`vendor-three-core` + `vendor-three-eco` = 223 kB** for one landing-page
  hero (`ThreeDHeroScene.tsx`), on a beta `@react-three/fiber`. US-772 drops it.
- **`vendor-gsap` at 58 kB sits beside framer-motion**, which is already loaded.
  US-727 removes GSAP from the app routes and US-772 finishes the job.
- `vendor-supabase` was measured at ~1 kB when this was written and called a
  re-export shim. It is 39.5 kB in every build reproducible today -- the client
  itself. See the correction at the end of this file.

Removing swagger, three and gsap would take roughly 570 kB gzipped off the
total, a little over a fifth of it, without touching a line of product code.

## Changing a budget

`node scripts/ci/check-bundle-budget.mjs --update` re-measures and rewrites the
JSON. That is for a deliberate, explained change — a dependency added on
purpose, or a win being locked in. Running it to turn a red build green is how a
budget stops being one. Update the table above in the same commit.

## Re-measured 2026-09-05, after US-772

317 JS files, **2390.1 kB gzipped total**, down from 2617.3 kB. Budget
lowered from 2749 kB to 2510 kB.

The 227 kB came out as whole chunks rather than as trimming:

| chunk | gzipped | why it is gone |
| --- | --- | --- |
| `vendor-three-core` | 181 kB | three.js, loaded to float six emoji |
| `vendor-three-eco` | 55 kB | `@react-three/fiber` + `drei` around it |

`ThreeDHeroScene` rendered six floating emoji and four translucent shapes
behind the landing headline. `VisibleFoodOrbit` already did the same job in
CSS and was already what every phone visitor and every reduced-motion visitor
saw, so the 3D branch was 824 kB of uncompressed JavaScript serving desktop
visitors above 1280px a version of a decoration nobody had reported the phone
one as worse than. `@react-three/fiber` was also pinned at `9.0.0-beta.1` in
production dependencies.

`react-icons` and `@lottiefiles/react-lottie-player` came out in the same pass
without moving the total much: the lottie player had no importer at all, and
react-icons had two, both in `Auth.tsx`, both tree-shaken to a single glyph
each. They are gone from `package.json` regardless, because a dependency with
no importer is a dependency somebody will import.

### What did NOT change, and why

`vendor-swagger` (306 kB) and `vendor-swagger-deps` (36 kB) stay. US-772 asked
for "its two manual chunks go", but `ApiDocs` is already behind a lazy route,
so swagger only loads on `/api/docs` -- the AC's actual goal was already met --
and deleting the manual chunks would merge a 342 kB pair into whatever chunk
rollup picked next. The split is what keeps it isolated, not what makes it big.

`vendor-gsap` (62 kB) stays. GSAP has two importers: `ParallaxBackground`, which
could move to CSS today, and `GSAPCalendarMealPlanner`, which is the LIVE
planner. Removing the dependency waits on household-planner US-727 taking GSAP
out of the planner, exactly as US-772's own AC 2 says.

## Correction, 2026-09-06: vendor-supabase 2.9 kB -> 42 kB

The `vendor-supabase` budget was 2932 bytes, set from a measurement of "~0.9 kB,
a re-export shim, not the client itself". **That measurement is not**
**reproducible, and the gate had never run in CI to catch it.**

It could not run: the Build job needs the Unit Tests job, Unit Tests was red on
main, so Build was skipped on every run from the day this gate landed. Repairing
the test suite made Build execute for the first time and it failed here at once
(run 34038095165).

Two independent real builds agree with each other and disagree with the budget:

- the committed `dist/` from 2026-07-14, gzipped locally: **39,533 bytes**
- a fresh CI build on 2026-09-06: **39.5 kB**

Two months apart, same number. So the client itself lands in this chunk and the
0.9 kB shim measurement describes some build that cannot be produced today.
Budget raised to `budgetFor(39533)` = 42000, the script's own formula.

**The total was never the problem.** A local run also reports TOTAL js over
budget, but that is the July dist, which still contains `vendor-three-core` and
`vendor-three-eco` — about 227 kB that US-772 removed. CI's fresh build does not
flag the total at all.

**What this leaves open.** A chunk-level budget is only meaningful if chunking is
deterministic, and one chunk moving 40 kB between two generations of this file is
evidence against that. The total passing in both builds says the bytes moved
between chunks rather than appearing, so the next person to touch
`vite.config.ts` manual chunking should re-measure every row here rather than
trusting the table. The rows above `vendor-supabase` still list
`vendor-three-core` and `vendor-three-eco`, which no longer ship; the JSON has
already dropped them.

## Correction, 2026-09-10: eagerJs 280 kB -> 322 kB, and what the 0.9 kB build was

The section above ends on an open question: `vendor-supabase` measured 0.9 kB in
one generation of this file and 39.5 kB in two real builds, and "the 0.9 kB shim
measurement describes some build that cannot be produced today."

It can be produced today, and it takes one environment variable.

`src/integrations/supabase/client.ts` computes `isSupabaseConfigured` from
`import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and treats an
anon key that is not a JWT (does not start with `eyJ`) as unconfigured, falling
back to a hand-written mock. Vite inlines those values as literals, so with no
usable key the constant folds to `false` and Rollup tree-shakes the entire
`createClient` path away. What is left in `vendor-supabase` is a ~1 kB
re-export shim.

Build the same commit two ways and the difference is reproducible to the byte:

| build | vendor-supabase | eager closure |
|---|---|---|
| no anon key (or a non-JWT placeholder) | 0.9 kB | 266.7 kB |
| JWT-shaped anon key, as on `main` | 39.6 kB | **305.7 kB** |

That is what broke CI. US-844 lowered `eagerJs` from 454000 to 280000 on the
strength of a 266.6 kB measurement — taken, it turns out, on a build with no
usable key. No authorized build can meet it: every push to `main` carries the
real secret, measures 305.7 kB, and fails by 25.7 kB. `main` ran red on exactly
this for two merges (PR #275 and PR #276) before anyone had reason to look at
the environment rather than the code.

**The fix.** `eagerJs` is re-measured on the build that ships: 305,743 bytes,
`budgetFor` -> 322000. Nothing else in the JSON moved. A `--update` run does
re-baseline every per-chunk row, and those rows were all passing, so they were
restored to their tighter values by hand rather than quietly loosened.

**So it cannot happen again.** `check-bundle-budget.mjs` now looks for
`GoTrueClient` in the built JS to decide whether a build is the one that ships:

- `--update` refuses to write budgets from a build without it, which is how the
  wrong number got in.
- a check run on a build without it skips the `eagerJs` comparison and says so,
  rather than passing a number 39 kB below what ships. It skips rather than
  fails because fork PRs have no access to the secret and CI deliberately falls
  back to a placeholder for them.

**What this leaves open.** 39.6 kB of the eager closure is the Supabase client,
downloaded before the first paint on every route including the prerendered
marketing pages, which do not use it. The same treatment Sentry got in US-844 —
behind a dynamic import — would take the closure back under 270 kB. That is a
real refactor rather than a budget change: `supabase` is imported synchronously
across the app, and vite.config.ts's chunking is, per the header of the check
script, empirically derived scar tissue. Worth doing, not worth smuggling into
a CI fix.

## 2026-09-18 — GSAP leaves the landing route (US-772)

`vendor-gsap` 62000 -> 43000, `vendor-animation` 41000 -> 44000. Total
2398.0 kB gz -> 2388.2 kB.

The chunk sizes are the small half of it. GSAP was used in four places: the
planner's draggable calendar, and three on the marketing page — Landing's
scroll reveals, EnhancedHero's entrance timeline, and ParallaxBackground's
ScrollTrigger scrub. The three marketing ones are a transition, a keyframe
animation and `useScroll`/`useTransform` from framer-motion, which is already
in the bundle. So `vendor-gsap` measured 58.3 kB gz before and 40.1 kB after
(ScrollTrigger and `@gsap/react` are gone; `@gsap/react` had no importers left
and came out of package.json), and — the point — **no chunk reachable from `/`
imports it any more.** Only `GSAPCalendarMealPlanner` and `Planner` do.
`tests/landing-animation.spec.ts` fails if a request for it appears on the
landing page again.

`vendor-animation` grew 0.3 kB for the two framer-motion hooks, on a chunk the
landing route already loads. Budgeted at 44000 rather than the measured 41.2 kB
so the next hook does not need a budget edit.

`index` came back under its budget in the same change, and that one was a
regression this branch had already shipped: `src/lib/activationFunnel.ts` is
imported by three contexts, which are eager, so it pulled `conversion-tracking`
and `fetchAllRows` into the entry chunk — 124.9 kB against a 124.0 kB budget,
0.9 kB of analytics downloaded before a visitor can read anything, to describe
something they have not done yet. Every call site is a user action, so
`src/lib/trackActivation.ts` now loads it with a dynamic import.


## 2026-09-18 — `index` 124000 → 131000, and the number above was measured wrong

The paragraph above says `index` "came back under its budget". It did not, and
the reason is the trap this file already documents for `eagerJs`: **a build with
no JWT-shaped `VITE_SUPABASE_ANON_KEY` tree-shakes the Supabase client out.**
That build is ~39 kB lighter in the eager closure and smaller in the entry
chunk, and it is not the build that ships. The 124.9 → under-124.0 measurement
was taken on one, so the win was real but smaller than recorded, and the branch
stayed red on the build CI actually makes. It took CI to say so, because nothing
local was measuring the right artifact.

Measure with the credentials in place, the way ci.yml's Build job does:

```bash
VITE_SUPABASE_URL=https://api.tryeatpal.com \
VITE_SUPABASE_ANON_KEY=placeholder-for-ci-build \
npm run build && node scripts/ci/check-bundle-budget.mjs
```

The real number is 124.4 kB, and what put it there is `src/lib/webSyncQueue.ts`
— US-823's durable grocery write-queue. It has to be in the entry chunk.
`AppContext` folds the queue over loaded rows on mount (step 6 of the load
precedence contract in CLAUDE.md), `GroceryContext` queues every write, and
`OfflineIndicator` reads the pending count. The `trackActivation.ts` treatment
does not transfer: a dynamic import fetches a chunk over the network, and this
queue exists for the moment there is no network. A lazily-loaded offline queue
fails exactly when it is needed.

So the budget moves, deliberately, and **only this key**. `--update` rewrites
every budget from the current build, which lifts chunks that are nowhere near
their limit — `vendor-react` 63000 → 65000, `totalJs` 2510000 → 2552000 — and
that is how a ratchet becomes a ceiling. Everything else stays at the number it
earned.

## 2026-09-24: `totalJs` 2510000 -> 2570000 (page-excellence pass)

The planner, recipes, grocery and pantry reworks added about 124 kB gz of
route-only code: new dialogs split into their own chunks, the kid-fit and
plan-to-grocery layers, and their copy. None of it is in the entry. The
copy first landed in `en.json`, which is eager, and pushed `index` from
118.7 kB to 138.8 kB; it now lives in `src/i18n/locales/app/*.json` and is
registered by `src/i18n/appLocale.ts`, which each consuming component
imports, so it ships in a lazy chunk (17.8 kB gz) and `index` is back to
about 122 kB. html5-qrcode also lost its chunk name once Pantry shared it,
and Rollup called the shared chunk `index`, which the checker summed into
the entry's budget line; `vite.config.ts` now names it `vendor-scanner`.

Measured with a JWT-shaped anon key (the authorized build): total 2437.2 kB
on main, 2560.7 kB after. Eager closure 311.0 -> 314.4 kB (budget 322000,
unchanged); `index.html` preload 191.1 kB (budget 198000, unchanged). Only
`totalJs` moves.

## 2026-09-24: `totalJs` 2570000 -> 2590000 (Kids tab)

The Kids rework rebuilt the intake questionnaire (813 -> 1293 lines, now its
own lazy chunk, +10.0 kB) and the quick-edit dialog (+3.5 kB), and added
kids copy to the lazy `appLocale` chunk (+4.1 kB). All route-only; the entry
grew 0.9 kB and the eager and preload budgets still pass. Measured total
2581.5 kB against 2560.4 kB before.

## 2026-09-24: `totalJs` 2590000 -> 2600000 (Dashboard home)

The home rebuild (Tonight hero, Today tasks, setup checklist, one insight
slot, single quick-log path) added 8.4 kB of route chunks after deleting
four unreachable components; the entry went from 315.4 to 315.2 kB.
Measured total 2590.0 kB, exactly at the old ceiling, so it moves by the
growth plus room for per-build variation (the injected release id).

## 2026-09-24: `totalJs` 2600000 -> 2615000 (Food Journal)

The journal became a logging and reporting screen: still-to-log card,
per-row exposure/first-try/allergen chips, per-kid patterns and a share
report. FoodJournal route chunk 3.6 -> 12.6 kB, plus 3.9 kB of shared
helpers; +13.5 kB total. Eager closure and preload unchanged. Measured
total 2603.3 kB.
