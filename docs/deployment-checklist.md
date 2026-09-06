# Production Deployment Checklist

## Pre-Deploy

- [ ] CI pipeline passes (all jobs green)
- [ ] `bash scripts/ci/lint-ratchet.sh` - at or below `.ci/lint-baseline.txt`
- [ ] `rm -f *.tsbuildinfo && bash scripts/ci/typecheck-ratchet.sh` - at or below
      `.ci/typecheck-baseline.txt`

  Neither gate is "zero errors", and asking for zero here made this checklist
  unpassable rather than strict: both are ratchets against a committed baseline,
  and there is a standing backlog. A green run means you added nothing new. The
  `rm` matters — `tsc -b` skips the project when the buildinfo looks current and
  exits 0 having checked nothing.
- [ ] `npx vitest run` - all tests pass
- [ ] `npx vite build` - production build succeeds
- [ ] Review PR changes for security concerns (no exposed secrets, XSS, SQL injection)
- [ ] Database migrations reviewed for safety:
  - [ ] No destructive changes without data backup
  - [ ] New tables have RLS enabled
  - [ ] New columns have sensible defaults or are nullable
  - [ ] Indexes added for new query patterns
- [ ] Environment variables documented in `.env.example` if new ones added
- [ ] No `console.log` in production code (terser `drop_console` handles this, but verify no critical logs)

## Deploy - Web (Cloudflare Pages)

### Automatic (preferred)
```bash
# Push to main triggers auto-deploy via GitHub Actions
git push origin main
```

### Manual
```bash
# Build
npx vite build

# Deploy
npx wrangler pages deploy dist
```

### Verify Deployment
```bash
# Check site loads
curl -s -o /dev/null -w "%{http_code}" https://tryeatpal.com

# Check health endpoint
curl https://functions.tryeatpal.com/health-check
```

## Deploy - Database (Supabase)

```bash
# Push migrations
supabase db push

# Verify migrations applied
supabase migration list
```

**Safety checks:**
- Run on staging first if migration modifies existing data
- Backup database before destructive migrations
- Test RLS policies work after migration

## Deploy - Edge Functions

```bash
# Deploy specific function
supabase functions deploy <function-name>

# Deploy all functions
supabase functions deploy
```

**Available functions:** see [`docs/EDGE_FUNCTIONS.md`](EDGE_FUNCTIONS.md).

This line used to name twelve of them. There are 95 under `supabase/functions/`
and 50 under `functions/` (two trees — `scripts/ci/check-function-trees.sh` says
which copy is live), so a hand-maintained list here was wrong within a release
and read as authoritative. US-774 is auditing which of them any client still
calls.

## Post-Deploy

- [ ] Health check endpoint returns 200: `curl https://functions.tryeatpal.com/health-check`
- [ ] Landing page loads with no console errors
- [ ] Auth flow works (sign in, sign out)
- [ ] Dashboard loads for authenticated user
- [ ] Sentry error rate stable (no spike in new errors)
- [ ] Stripe webhooks receiving events (check Stripe Dashboard)
- [ ] Real-time subscriptions connecting (check browser DevTools network tab)

### Critical Flow Smoke Tests
- [ ] Can create a child profile
- [ ] Can add a food item
- [ ] Can create a meal plan entry
- [ ] Can view grocery list
- [ ] Pricing page displays plans correctly

## Rollback

### Web (Cloudflare Pages)
1. Cloudflare Dashboard > Pages > Deployments
2. Find last known good deployment
3. Click "Rollback to this deploy"

### Database
- Destructive migration: Restore from Supabase backup
- Additive migration: Safe to leave in place, deploy code fix

### Edge Functions
```bash
# Redeploy previous version
git checkout <previous-commit> -- functions/<function-name>/index.ts
supabase functions deploy <function-name>
```

## Environment Variable Changes

1. Update in Cloudflare Pages Dashboard > Settings > Environment Variables
2. Update in `.env.example` for documentation
3. Trigger redeploy (variables take effect on next build)
4. For Supabase Edge Functions: update in Supabase Dashboard > Edge Functions > Secrets

**Never commit real secrets to the repository.**
