# Production Monitoring & Alerting Runbook

## Severity Levels

| Level | Response Time | Description | Examples |
|-------|-------------|-------------|---------|
| **P0** | < 15 min | Service down, data loss risk | Site blank page, DB unreachable, auth broken |
| **P1** | < 1 hour | Major feature broken | Payments failing, meal planner not saving, real-time broken |
| **P2** | < 4 hours | Degraded experience | Slow queries, intermittent errors, UI glitches |
| **P3** | Next business day | Minor issues | Cosmetic bugs, non-critical feature gaps |

## Sentry Alert Triage

### Setup
- **DSN**: Set `VITE_SENTRY_DSN` in environment
- **Org/Project**: Set `SENTRY_ORG` and `SENTRY_PROJECT` for sourcemap uploads
- Session replay enabled in production for debugging

### Triage Process
1. Check Sentry dashboard for new unresolved issues
2. Assess severity by impact (users affected, feature criticality)
3. P0/P1: Immediately investigate stack trace and session replay
4. P2: Create issue, schedule fix within sprint
5. P3: Triage in weekly review

### Common Sentry Patterns
- **ChunkLoadError**: Deployment cache issue - users need hard refresh
- **TypeError: Cannot read properties of undefined**: Check optional chaining, likely missing data guard
- **Network errors (fetch failed)**: Supabase connectivity or CORS issue

## Health Check Monitoring

### Endpoint
- **URL**: `{VITE_FUNCTIONS_URL}/health-check`
- **Auth**: None required (`verify_jwt = false`)
- **Response**: JSON with `status`, `version`, `database_connected`, `timestamp`

### Setup
Configure uptime monitoring (e.g., Cloudflare Health Checks, UptimeRobot):
- Check interval: 60 seconds
- Timeout: 10 seconds
- Alert on: 2 consecutive failures
- Expected response: HTTP 200 with `"status": "healthy"`

## Cloudflare Pages Deployment

### Rollback Procedure
1. Go to Cloudflare Dashboard > Pages > eatpal
2. Click "Deployments" tab
3. Find the last known good deployment
4. Click "..." menu > "Rollback to this deploy"
5. Verify site loads at `tryeatpal.com`
6. Check health endpoint: `curl https://functions.tryeatpal.com/health-check`

### Cache Purge
```bash
# Purge entire cache after deployment issues
# Cloudflare Dashboard > Caching > Purge Everything
```

## Supabase Emergency Procedures

### Database Backup Restore
1. Access Supabase Dashboard > Database > Backups
2. Select backup point (daily automatic backups)
3. Click "Restore" - creates new project with restored data
4. Update DNS/environment to point to restored instance

### RLS Debugging
```sql
-- Temporarily check what a user can see (DO NOT disable RLS in production)
-- Use Supabase SQL Editor with service role
SELECT * FROM public.foods WHERE user_id = '<user-uuid>' LIMIT 10;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'foods';
```

### Connection Issues
- Check Supabase status: `status.supabase.com`
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
- Check connection pooler limits in Supabase Dashboard > Settings > Database

## Stripe Webhook Recovery

### Webhook Failure Detection
1. Stripe Dashboard > Developers > Webhooks
2. Check for failed webhook deliveries (red indicators)
3. Review event payload and error message

### Recovery Steps
1. **Retry**: Click "Resend" on failed webhook events in Stripe Dashboard
2. **Manual sync**: For `checkout.session.completed`:
   ```sql
   -- Update subscription status manually
   UPDATE user_subscriptions
   SET status = 'active', stripe_subscription_id = '<sub_id>'
   WHERE user_id = '<user_uuid>';
   ```
3. **Verify**: Check user can access premium features after fix

### Common Webhook Issues
- **Signature verification failed**: Check `STRIPE_WEBHOOK_SECRET` env var
- **Timeout**: Edge function took > 30s - check Supabase function logs
- **Table not found**: Run pending migrations: `supabase db push`

## Escalation Contacts

| Role | Responsibility | When to Contact |
|------|---------------|----------------|
| On-call Engineer | First responder for P0/P1 | Any production incident |
| Tech Lead | Architecture decisions | P0 requiring code changes |
| Product Owner | User communication | P0/P1 affecting many users |
| Stripe Support | Payment issues | Webhook failures, charge disputes |
| Supabase Support | Database issues | Connection limits, backup restore |
| Cloudflare Support | CDN/Pages issues | Deployment failures, DNS issues |

## Communication Templates

### Incident Start (Internal)
```
[P{level}] {title}
Impact: {description of user impact}
Start: {time}
Status: Investigating
Lead: {engineer name}
```

### Status Update
```
[P{level}] {title} - Update
Current status: {investigating|identified|fixing|monitoring}
ETA: {estimated resolution}
Actions taken: {brief summary}
```

### Incident Resolved
```
[P{level}] {title} - Resolved
Duration: {start} to {end}
Root cause: {brief description}
Fix: {what was done}
Follow-up: {any follow-up items}
```
