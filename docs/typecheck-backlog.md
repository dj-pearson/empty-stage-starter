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

Current baseline: see `.ci/typecheck-baseline.txt` — **1257**, ratcheted down from the
1537 measured at introduction (2026-08-06). The drop came from US-536/US-546 and the
stories after them, not from excluding anything: the ratchet only ever moves down.

## Shrink plan

Owner: whoever touches a listed area next (opportunistic) + a standing cleanup
task. Prefer **narrow `// @ts-expect-error` on the exact offending line** over a
blanket file/glob exclude, so type coverage self-heals: an `@ts-expect-error`
that stops being needed becomes a lint error and forces its own removal.

### `tsconfig-bypass.json` excludes to retire (highest-value first)

`src/components/admin/**/*.tsx` is the largest blanket exclude (SEOManager.tsx
alone is ~281 errors — see US-553 for its decomposition). Replace the glob with
per-file entries, then convert each file's errors to `@ts-expect-error` and
delete it from the exclude list. Track progress here:

- [ ] `src/components/admin/**/*.tsx` → split into per-file entries
- [ ] `src/components/AIMealCoach.tsx`
- [ ] `src/components/FoodChainingRecommendations.tsx`
- [ ] `src/components/ImportCsvDialog.tsx`
- [ ] `src/components/ManageKidsDialog.tsx`
- [ ] `src/components/OrderIngredientsDialog.tsx`
- [ ] `src/components/RecipeExportActions.tsx`
- [ ] `src/components/RecipeSchemaMarkup.tsx`
- [ ] `src/components/SmartRestockSuggestions.tsx`
- [ ] `src/components/SupportWidget.tsx`

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
