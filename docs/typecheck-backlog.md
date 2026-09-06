# Typecheck & lint backlog — ratchet + shrink plan (US-545)

## How the gate works

CI runs `tsc -b` (`npm run typecheck`) and compares the `error TS` count to the
committed baseline in [`.ci/typecheck-baseline.txt`](../.ci/typecheck-baseline.txt)
via [`scripts/ci/typecheck-ratchet.sh`](../scripts/ci/typecheck-ratchet.sh).

- The build **fails if the count grows** beyond the baseline — a PR can never add
  net-new type errors.
- When the count **drops**, the step passes and prints a notice to lower the
  baseline. **Lower it in the same PR** to lock in the win (the number only ever
  goes down).
- A separate diff-scoped gate
  ([`scripts/ci/no-new-any.sh`](../scripts/ci/no-new-any.sh)) fails on any newly
  ADDED explicit `any` in changed `src/` files.

Current baseline: **read it from [`.ci/typecheck-baseline.txt`](../.ci/typecheck-baseline.txt)**.
This line used to carry the number as well, and it went stale twice (it said 1257 long
after the file said otherwise), so the number now lives in exactly one place. It was 1537
when the ratchet was introduced on 2026-08-06 and has only ever moved down — the drops came
from US-536/US-546 and the stories after them, not from excluding anything.

A caveat worth keeping in mind when reading any of these figures: `npm run typecheck`
alone is not a reliable local signal, because `tsc -b` skips the project when
`tsconfig.app.tsbuildinfo` looks current and exits 0 without checking. Delete the
`*.tsbuildinfo` files first. The gate is `scripts/ci/typecheck-ratchet.sh`.

## Shrink plan

Owner: whoever touches a listed area next (opportunistic) + a standing cleanup
task. Prefer **narrow `// @ts-expect-error` on the exact offending line** over a
blanket file/glob exclude, so type coverage self-heals: an `@ts-expect-error`
that stops being needed becomes a lint error and forces its own removal.

### `tsconfig-bypass.json` excluded nothing (US-776, 2026-09-06)

**The file was inert and is deleted.** It listed a blanket
`src/components/admin/**/*.tsx` plus nine per-file excludes, and this section
used to describe retiring them one at a time. None of them was ever in effect.

`npm run typecheck` is `tsc -b`, which builds the references in `tsconfig.json`:
`tsconfig.app.json` and `tsconfig.node.json`. `tsconfig.app.json` is
`"include": ["src"]` with **no `exclude` key at all**, and nothing in the repo --
no tsconfig, no script, no workflow -- ever referenced `tsconfig-bypass.json`.
Everything it named has been typechecked all along, and its errors were always
inside the ratchet count.

So the story that owned this expected removing the exclude to *raise* the
baseline by the newly counted errors. There were none to count: the number did
not move. `src/lib/tsconfigCoverage.test.ts` now asserts no tsconfig excludes
anything under `src/`, so a real bypass cannot arrive quietly the way this
imaginary one persisted.

The admin errors this section worried about did fall, but from US-761 rather
than from any exclude: regenerating `types.ts` against the migrated schema took
the whole-repo count from 1152 to 814, and most of what it fixed was exactly the
missing table types named below.

### Top non-excluded error hotspots (from the baseline run)

`src/components/admin/SEOManager.tsx` (~281), `src/lib/pseo/generator.ts` (~123),
`src/lib/user-segmentation.ts` (~97), `src/lib/activity-tracker.ts` (~80),
`src/components/admin/pseo/PseoAdminDashboard.tsx` (~76). Many stem from tables
(`pseo_pages`, etc.) absent from the generated `src/integrations/supabase/types.ts`
— regenerating types after those migrations deploy will clear a large batch.

## Definition of done

When the baseline reaches **0**: delete `scripts/ci/typecheck-ratchet.sh`, drop
`tsconfig-bypass.json`, and make `npm run typecheck` a plain hard gate (remove
the `continue-on-error` from the lint step too once its backlog is likewise 0).
