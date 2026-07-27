# Codebase Audit — Results Summary

Branch: `claude/audit-fixes` (off `main`). **Nothing pushed; `main` untouched.**
Verification: full typecheck clean on every batch; `npm run test:run` passes (exit 0).
Backlog tracked in `prd.json` as **US-554 – US-582** (per-item notes there are authoritative).

Scope: deep-dive across security, performance, SEO/GEO, UI/UX/a11y (4 parallel audit passes),
synthesized and worked through on this branch.

## Status: 22 of 29 resolved

### ✅ Fully fixed / resolved (22)
- **Security (complete):**
  - US-554/555 — admin-auth gate on `update-user` / `list-users` (were open admin-escalation / PII dump)
  - US-558 — auth on AI-generation + recipe-parse edge fns (denial-of-wallet), with a service-role bypass for scheduled callers
  - US-582 — gated `update-blog-image` + `test-blog-webhook` (SSRF); classified all `verify_jwt=false` functions
  - US-557 — removed committed secret file; hardened `.gitignore`; SECURITY.md remediation notes
  - US-559 — tightened over-permissive RLS (`rate_limits`, `backup_logs`, `automation_email_queue`); found `ai_usage_logs` already fixed by a prior migration
  - US-560 — origin-locked CORS on admin-only web endpoints (native flows left untouched)
  - US-561 — DB-level rate limit on anonymous quiz submissions
  - US-581 — **false alarm, resolved by code trace:** admin gating uses `user_roles` (default `user`), not the cosmetic `user_profiles.role` the CSV showed (already demoted by a prior migration)
- **Perf/SEO/UX:**
  - US-565/569 — lazy card images; dropped an orphaned 367 KB PNG
  - US-571/575 — removed fabricated review schema; reduced-motion guards on confetti
  - US-572 — dynamic sitemap now serves; fixed the 404 robots reference
  - US-573 — Article + HowTo schema wired into pSEO guides (GEO)
  - US-578 — Blog listing skeleton (other data views already had skeletons)
  - US-579 — autoComplete on the signup + capture/contact/reset forms
  - US-580 — **i18n across 32 user-facing pages** (~26 namespaces)
- **Investigative resolutions (findings that were already-handled / invalid):**
  - US-563 (would regress reduced-motion a11y), US-566 (`select(*)` is correct here),
    US-567 (hook migration already complete), US-568 (batching is a documented WONTFIX)

### 🟡 Advanced, needs your QA / decision (partial)
- **US-564** — recipe **list** view virtualized (verified); the responsive multi-column **grid** view still needs column-count + dynamic-measurement work (unverifiable headlessly)
- **US-577** — `success`/`warning` tokens added + clearly-semantic files converted; the full sweep is **blocked on a token-value decision** (a blind sweep would map 271 mostly-decorative brand-greens onto a `success` semantic token, and `destructive` ≠ `red-500` so red would visibly shift)
- **US-574** — keyword-stuffing + invalid schema screenshot fixed; the homepage **consumer-vs-B2B positioning** rewrite is your strategic call
- **US-576** — grocery controls made keyboard-reachable; **44px tap targets** would shrink the item-name area on mobile even when hidden (needs your approval + QA)

### ⛔ Blocked on you (external action / verification)
- **US-556** — rotate the leaked credential in Supabase + Coolify (repo-side done; purge script verified + caveats documented in SECURITY.md)
- **US-562** — move Apple signing keys to a secret store (gitignored; can't move to your external store)
- **US-570** — prerender for AI-crawler visibility (**highest remaining value**): needs an approach choice (`vite-react-ssg` vs a Cloudflare bot-render function) **and** a preview deploy to verify the CF Pages runtime. Note: the root `functions/` dir mixes CF Pages + Supabase-style functions and `wrangler.toml` is fully commented — worth a look regardless.

## To finish the remaining 7, send one of:
- `vite-react-ssg` / `cloudflare` (+ a preview deploy) → US-570
- a token-value decision → US-577
- "approve mobile density" → US-576
- "approve grid QA" → US-564 grid
- your positioning choice → US-574
- rotate credential / move keys → US-556 / US-562
