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
