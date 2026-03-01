# Production Deployment Checklist

## Pre-Deploy

- [ ] CI pipeline passes (all jobs green)
- [ ] `npm run lint` - zero errors
- [ ] `npx tsc --noEmit` - zero TypeScript errors
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

**Available functions:** health-check, calculate-food-similarity, suggest-foods, suggest-recipe, ai-meal-plan, create-checkout, stripe-webhook, parse-recipe, generate-blog-content, generate-social-content, update-blog-image, ai-coach-chat

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
