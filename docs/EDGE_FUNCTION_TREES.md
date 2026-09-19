# The edge-function trees

This repo holds edge functions in two directories and Cloudflare Pages
Functions in one of them. Nothing said so, and that ambiguity caused a
production payments bug (US-616), so this page is the reference.

US-773 removed the duplication: no endpoint exists in both trees any more.

## Which is which

| | `supabase/functions/` | `functions/` |
| --- | --- | --- |
| Size | 95 directories, 93 with an `index.ts` | 35 directories, plus 3 loose `.ts` files (see below) |
| Handler shape | `export default async (req: Request) => Response` | `serve(async (req) => …)` (Deno std) |
| Runtime | `edge-functions-server.ts` | Supabase CLI / Edge Runtime |
| Deployed by | **Both Dockerfiles** — `Dockerfile:11`, `Dockerfile.functions:18`, each as `COPY supabase/functions ./functions` | not copied by either Dockerfile; reached through explicit `entrypoint = "../functions/…"` lines in `supabase/config.toml` |
| Exercised by CI | `tests/functions/critical/` smoke tests, plus `deno test supabase/functions/_shared/…` | `deno test functions/_shared/…` |
| Contains | the product surface: auth, payments, AI, SEO, blog | the **Agentic OS** — `agent-*`, dispatcher, approval-executor, support intake, CSAT, nurture — plus ~75 shared logic modules with Deno tests |

**`supabase/functions/` is what serves production traffic.** All 93 handlers
there use `export default`, which is exactly the contract
`edge-functions-server.ts` calls (`module.default(req)`). Inside the container
that tree is mounted at `./functions`, which is why the server discovers its
routes under `./functions/<name>/index.ts` and still means the deployed tree.

**`functions/` is not dead, and it is not internal-only.** It holds the Agentic
OS and its unit tests, and `supabase/config.toml` gives ~30 of those an explicit
`entrypoint`, so the Supabase CLI deploys them from here. `agent-blog-writer` is
live from this tree and is the sole writer to the `blog-images` bucket
(`src/lib/functionTreeBuckets.test.ts` pins that).

## A third runtime lives here too

`functions/feed.xml.ts`, `functions/rss.xml.ts` and `functions/sitemap.xml.ts`
are **Cloudflare Pages Functions** — `export async function onRequest(context)`,
served at `/feed.xml`, `/rss.xml` and `/sitemap.xml` on tryeatpal.com. Pages
takes its Functions from a `functions/` directory at the project root by
convention, which is why they sit beside 35 Deno directories that have nothing
to do with Cloudflare.

They have not been moved. Relocating them means telling Pages where to look,
and this project's Pages configuration lives in the Cloudflare dashboard:
`wrangler.toml` must stay entirely commented out (US-762 — uncommenting one line
broke the deploy in August 2026). So the move is a dashboard change plus a repo
change, in that order, and it belongs to whoever holds that dashboard.

## The trap this page exists for

15 names used to exist in **both** trees as parallel implementations for the two
runtimes. Editing the wrong copy shipped nothing, and did so silently. That is
what happened in US-519 → US-616: the Stripe webhook idempotency guard was
written into `functions/stripe-webhook/index.ts`, which uses `serve()` and
therefore cannot be loaded by the live server at all. The migration creating
`stripe_webhook_events` shipped, the table sat empty for a month, and every
Stripe redelivery re-ran the handlers.

`create-checkout` (US-626) and `tonight-mode` were resolved first. US-773 did
the remaining twelve, and found the same shape every time: **the guards were in
the copy that never runs.** Across those twelve, the deployed copy was missing a
method check on eleven, a per-user rate limit on nine, and on
`update-blog-image` an SSRF check and a byte cap around a `fetch()` of an
admin-supplied URL — the US-710 story over again, in a function whose own
comment called itself an SSRF surface.

A text diff over-reports this badly: the two trees use different helper names
for the same protection (`authenticateRequest` vs `requireUser`,
`assertAdmin` vs `requireAdmin`, `safeFetch` vs `fetchGuardedResource`), so
compare capabilities, not tokens.

## The guard

`scripts/ci/check-function-trees.sh` runs in the `quality` job and fails on:

1. a routing table in `edge-functions-server.ts` that does not reach every
   handler in `supabase/functions/`, or that names a directory which does not
   exist. The table is derived from the tree (US-774), so the first direction is
   satisfied by construction and the check fails if it ever reverts to a list --
   a hand-maintained one had drifted by eleven names, `delete-account` and both
   `bind-email-*` among them, each answering 404;
2. **any** cross-tree name collision. `_shared` is the single exception, and it
   is a different kind of thing: a directory of helper modules per tree, not two
   implementations of one endpoint. Do not add a name to that list to silence a
   collision — put the function in one tree;
3. a remaining collision whose non-deployed copy has a newer last-commit date.

`src/lib/edgeFunctionHandlers.test.ts` covers what that script cannot see: every
handler in the deployed tree parses, and exports a default rather than calling
`serve()`. 17 of the 93 did not parse before US-773 — each ended with a stray
`});`, the tail of a removed `serve(...)` wrapper — so their routes were dead on
a server that imports them dynamically. `Dockerfile:19` does walk every
`index.ts` with `deno cache`, and ends the line with `|| true`, which turned a
file that cannot be parsed into a silent skip.

## Adding a function

Put it in `supabase/functions/<name>/index.ts`, use
`export default async (req: Request)`, and gate it. The route needs no second
edit -- `edge-functions-server.ts` finds the directory at boot. The runtime runs
with `--no-verify-jwt`, so **in-function auth is the only gate**.

- Spends model tokens → `gateAiRequest` from `_shared/ai-gate.ts` (method check,
  `requireUser`, per-user budget in one call).
- Admin-only → `requireAdmin` from `_shared/require-admin.ts`, then
  `enforceRateLimit` directly. Do not reach for `gateAiRequest` here: it
  authenticates any signed-in user and would widen the endpoint.
- Fetches a caller-supplied URL → `fetchGuardedResource` from
  `_shared/url-validator.ts`. Never the global `fetch`.
- On an unexpected error, return `Internal server error`. The thrown message is
  built from upstream responses and can carry an internal URL.

Only add to `functions/` if you are extending the Agentic OS, which has its own
dispatcher and shared-secret conventions, or if you are adding a Cloudflare
Pages route (a `*.ts` file exporting `onRequest`, at the top level).

## Open question

`Dockerfile.functions` runs `supabase functions serve`, but the tree it copies
(`supabase/functions`) uses bare `export default` handlers rather than the
`Deno.serve` / `export default { fetch }` shape the Supabase Edge Runtime
expects. That Dockerfile therefore appears unable to serve this tree. The root
`Dockerfile` (which runs `edge-functions-server.ts`) is the one consistent with
the code. Confirm which one Coolify actually builds and delete the other.
