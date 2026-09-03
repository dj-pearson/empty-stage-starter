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
| `vendor-supabase`     | ~0.9 kB       | 2.9 kB  |
| **Total JS**          | **2617.3 kB** | 2749 kB |

## What the numbers say

Four chunks are worth calling out, and all four have an open story:

- **`vendor-swagger` at 291 kB is the single largest thing shipped**, and it
  serves exactly one page (`/api/docs`). US-772 lazy-loads or replaces it.
- **`vendor-three-core` + `vendor-three-eco` = 223 kB** for one landing-page
  hero (`ThreeDHeroScene.tsx`), on a beta `@react-three/fiber`. US-772 drops it.
- **`vendor-gsap` at 58 kB sits beside framer-motion**, which is already loaded.
  US-727 removes GSAP from the app routes and US-772 finishes the job.
- `vendor-supabase` at ~1 kB is a re-export shim, not the client itself.

Removing swagger, three and gsap would take roughly 570 kB gzipped off the
total, a little over a fifth of it, without touching a line of product code.

## Changing a budget

`node scripts/ci/check-bundle-budget.mjs --update` re-measures and rewrites the
JSON. That is for a deliberate, explained change — a dependency added on
purpose, or a win being locked in. Running it to turn a red build green is how a
budget stops being one. Update the table above in the same commit.
