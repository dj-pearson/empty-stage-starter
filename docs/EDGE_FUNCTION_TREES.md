# The two edge-function trees

There are two directories of edge functions in this repo. Nothing previously
said so, and that ambiguity caused a production payments bug (US-616), so this
page is the reference.

## Which is which

| | `supabase/functions/` | `functions/` |
| --- | --- | --- |
| Size | 93 directories | 48 directories |
| Handler shape | `export default async (req: Request) => Response` | `serve(async (req) => …)` (Deno std) |
| Runtime | `edge-functions-server.ts` | Supabase CLI / Edge Runtime |
| Deployed by | **Both Dockerfiles** — `Dockerfile:11`, `Dockerfile.functions:18` | Not copied by either Dockerfile |
| Exercised by CI | `tests/functions/critical/` smoke tests | `deno test functions/_shared/…` (`ci.yml:182,187`) |
| Contains | the product surface: auth, payments, AI, SEO, blog | the **Agentic OS** — `agent-*`, dispatcher, approval-executor, support intake, CSAT, nurture — plus ~75 shared logic modules with Deno tests |

**`supabase/functions/` is what serves production traffic.** All 93 handlers
there use `export default`, which is exactly the contract
`edge-functions-server.ts` calls (`module.default(req)`).

**`functions/` is not dead.** It holds the entire Agentic OS and its unit tests,
and CI runs those tests on every push. Do not delete it.

## The trap

15 names exist in **both** trees as parallel implementations for the two
runtimes:

```
_shared                    generate-social-content   suggest-foods
ai-meal-plan               identify-product          suggest-recipe
calculate-food-similarity  parse-receipt-image       tonight-mode
create-checkout            parse-recipe              update-blog-image
generate-blog-content      stripe-webhook
generate-sitemap
```

Editing the wrong copy ships nothing, and does so silently. That is exactly what
happened in US-519 → US-616: the Stripe webhook idempotency guard was written
into `functions/stripe-webhook/index.ts`, which uses `serve()` and therefore
cannot be loaded by the live server at all. The migration creating
`stripe_webhook_events` shipped, the table sat empty for a month, and every
Stripe redelivery re-ran the handlers.

`create-checkout` currently shows the same shape of divergence — the
top-level copy is newer (2026-07-11) than the deployed one (2026-06-13) and is
a completely different implementation. **It has not been audited yet.** Treat
any behaviour difference in checkout as suspect until it has.

## The guard

`scripts/ci/check-function-trees.sh` runs in the `quality` job and fails on:

1. a `FUNCTIONS_MAP` entry in `edge-functions-server.ts` with no matching
   directory in `supabase/functions/` — an unroutable name;
2. any **new** cross-tree name collision. The 15 above are listed explicitly in
   the script, the same way `check-migration-prefixes.sh` grandfathers its known
   duplicates. Do not add to that list to silence a collision — put the function
   in one tree.

## Adding a function

Put it in `supabase/functions/`, use `export default async (req: Request)`, add
an entry to `FUNCTIONS_MAP` in `edge-functions-server.ts`, and gate it: the
runtime runs with `--no-verify-jwt`, so **in-function auth is the only gate**.
Use `requireUser` / `requireAdmin` from `_shared/require-admin.ts`.

Only add to `functions/` if you are extending the Agentic OS, which has its own
dispatcher and shared-secret conventions.

## Open question

`Dockerfile.functions` runs `supabase functions serve`, but the tree it copies
(`supabase/functions`) uses bare `export default` handlers rather than the
`Deno.serve` / `export default { fetch }` shape the Supabase Edge Runtime
expects. That Dockerfile therefore appears unable to serve this tree. The root
`Dockerfile` (which runs `edge-functions-server.ts`) is the one consistent with
the code. Confirm which one Coolify actually builds and delete the other.
