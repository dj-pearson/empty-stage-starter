# Admin Automation System - Setup & Deployment Guide

**Version:** 1.0.0
**Date:** 2025-10-13
**Status:** Fixes 1-4 Complete

---

## Overview

This guide covers the deployment and configuration of EatPal's automated sales and marketing system. The system includes:

1. ✅ **Contact Form Lead Capture** - Automatically saves all contact submissions to database
2. ✅ **Email Automation Engine** - Multi-step email sequences triggered by events
3. ✅ **Enhanced Lead Scoring** - Behavioral scoring with automated actions
4. ✅ **Trial Conversion Automation** - Automated workflows for trial users

---

## Prerequisites

- Supabase project with admin access
- Resend API account and API key
- Node.js 18+ for local development
- Supabase CLI installed (`npm install -g supabase`)

---

## Step 1: Database Migrations

Run all new migrations to set up the automation system:

```bash
# Navigate to project root
cd /path/to/empty-stage-starter

# Run migrations (in order)
supabase db push

# Or individually:
supabase migration up 20251013160000_email_sequences
supabase migration up 20251013170000_enhanced_lead_scoring
```

### Migrations Applied

1. **20251013160000_email_sequences.sql**
   - Creates `email_sequences` table
   - Creates `email_sequence_steps` table
   - Creates `user_email_sequences` tracking table
   - Adds functions: `enroll_in_email_sequence()`, `schedule_next_sequence_email()`
   - Adds triggers for automatic enrollment
   - Seeds 5 default email sequences

2. **20251013170000_enhanced_lead_scoring.sql**
   - Creates `lead_score_history` table
   - Enhances `calculate_lead_score()` function with behavioral signals
   - Adds `trigger_score_based_actions()` for automated actions
   - Adds `get_lead_score_breakdown()` for debugging

---

## Step 2: Deploy Edge Functions

Deploy the email processing Edge Functions to Supabase:

### 2.1 Deploy send-emails Function (Existing)

```bash
supabase functions deploy send-emails
```

### 2.2 Deploy process-email-sequences Function (New)

```bash
supabase functions deploy process-email-sequences
```

### 2.3 Set Environment Variables

In Supabase Dashboard → Project Settings → Edge Functions → Secrets:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
RESEND_API_KEY=re_...your-resend-key
EMAIL_FROM=noreply@tryeatpal.com
EMAIL_PROVIDER=resend
CRON_SECRET=your-secret-for-cron-jobs
```

---

## Step 3: Configure Cron Jobs

Set up automated execution of Edge Functions:

### Option A: Supabase Cron (Recommended)

In Supabase SQL Editor, run:

```sql
-- Email queue processing (every 5 minutes)
SELECT cron.schedule(
  'process-email-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Email sequence processing (every hour)
SELECT cron.schedule(
  'process-email-sequences',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/process-email-sequences',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

### Option B: External Cron (Alternative)

Use a service like cron-job.org or GitHub Actions:

```yaml
# .github/workflows/process-emails.yml
name: Process Email Automation
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            https://your-project.supabase.co/functions/v1/send-emails \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

---

## Step 4: Test the System

### 4.1 Test Contact Form Lead Capture

1. Go to `https://your-site.com/contact`
2. Fill out and submit the contact form
3. Check Supabase:
   ```sql
   SELECT * FROM leads ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM lead_interactions ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM email_queue ORDER BY created_at DESC LIMIT 1;
   ```
4. Verify welcome email is in queue with status 'pending'

### 4.2 Test Email Sequence Enrollment

```sql
-- Manually enroll a test lead
SELECT enroll_in_email_sequence(
  p_lead_id := (SELECT id FROM leads WHERE email = 'test@example.com'),
  p_trigger_event := 'lead_created'
);

-- Check enrollment
SELECT * FROM user_email_sequences WHERE lead_id IN (
  SELECT id FROM leads WHERE email = 'test@example.com'
);
```

### 4.3 Test Email Sending

```bash
# Manually trigger email processing
curl -X POST \
  https://your-project.supabase.co/functions/v1/send-emails \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Check Resend dashboard for delivered emails.

### 4.4 Test Lead Scoring

```sql
-- Get score breakdown for a lead
SELECT get_lead_score_breakdown('lead-uuid-here');

-- Manually recalculate all scores
SELECT * FROM recalculate_all_lead_scores();
```

---

## Step 5: Configure Resend for Production

### 5.1 Verify Domain

1. Go to Resend Dashboard → Domains
2. Add your domain (e.g., `tryeatpal.com`)
3. Add DNS records provided by Resend:
   - SPF record
   - DKIM record
   - Return-Path record
4. Wait for verification (usually 10-30 minutes)

### 5.2 Set Up Webhooks

Configure webhooks to track email events:

1. In Resend Dashboard → Webhooks → Add Endpoint
2. URL: `https://your-project.supabase.co/functions/v1/track-email-events`
3. Events to track:
   - `email.sent`
   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.bounced`
   - `email.complained`

Create the webhook handler Edge Function:

```typescript
// supabase/functions/track-email-events/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const event = await req.json();

  await supabase.from('email_events').insert([{
    email_id: event.data.email_id,
    event_type: event.type.replace('email.', ''),
    event_data: event.data,
  }]);

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Deploy:
```bash
supabase functions deploy track-email-events
```

---

## Step 6: Integrate with Application

### 6.1 Add to Signup/Auth Flow

In your signup handler (e.g., `src/pages/Auth.tsx` or signup function):

```typescript
import { captureTrialSignup } from '@/lib/lead-capture';
import { initializeTrialAutomation } from '@/lib/trial-automation';

// After successful signup
const { data, error } = await supabase.auth.signUp({
  email,
  password,
});

if (data.user) {
  // Capture as trial lead
  await captureTrialSignup(
    data.user.id,
    data.user.email!,
    fullName
  );

  // Initialize trial automation
  await initializeTrialAutomation(
    data.user.id,
    data.user.email!,
    fullName
  );
}
```

### 6.2 Track User Activity

In your Dashboard or activity tracking:

```typescript
import { trackTrialActivity } from '@/lib/trial-automation';

// When user logs in
await trackTrialActivity(userId, 'login');

// When user adds a kid
await trackTrialActivity(userId, 'kid_added', {
  kid_name: kidName,
});

// When user logs a meal
await trackTrialActivity(userId, 'meal_logged', {
  meal_type: 'breakfast',
});
```

### 6.3 Handle Subscription Events

In your subscription webhook handler or status change listener:

```typescript
import { handleTrialConversion, handleSubscriptionCancellation } from '@/lib/trial-automation';

// On trial → paid conversion
if (oldStatus === 'trialing' && newStatus === 'active') {
  await handleTrialConversion(userId, subscriptionId);
}

// On cancellation
if (newStatus === 'canceled') {
  await handleSubscriptionCancellation(userId, cancellationReason);
}
```

---

## Step 7: Monitor & Maintain

### Daily Monitoring Dashboard

Create an admin view to monitor automation health:

```typescript
// Example admin dashboard queries
const { data: queueStatus } = await supabase
  .from('email_queue')
  .select('status, count(*)')
  .group('status');

const { data: activeSequences } = await supabase
  .from('user_email_sequences')
  .select('count(*)')
  .is('completed_at', null)
  .is('canceled_at', null);

const { data: highScoreLeads } = await supabase
  .from('leads')
  .select('*')
  .gte('score', 80)
  .eq('status', 'qualified')
  .order('score', { ascending: false });
```

### Key Metrics to Track

1. **Email Performance**
   - Open rate (target: > 25%)
   - Click rate (target: > 3%)
   - Bounce rate (target: < 2%)

2. **Lead Quality**
   - Average lead score
   - New leads per day
   - High-score leads (80+) per week

3. **Conversion Funnel**
   - Lead → Trial conversion rate
   - Trial → Paid conversion rate
   - Days to conversion

4. **Automation Health**
   - Emails pending in queue
   - Failed email sends
   - Active sequence enrollments
   - Cron job execution logs

---

## Troubleshooting

### Issue: Emails Not Sending

**Check:**
1. Email queue has pending items: `SELECT * FROM email_queue WHERE status = 'pending'`
2. Edge function is deployed: `supabase functions list`
3. Cron job is running: Check Supabase logs
4. Resend API key is valid: Test with curl
5. Domain is verified in Resend dashboard

**Fix:**
```bash
# Manually trigger email processing
curl -X POST \
  https://your-project.supabase.co/functions/v1/send-emails \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Issue: Sequences Not Enrolling

**Check:**
1. Sequences are active: `SELECT * FROM email_sequences WHERE is_active = TRUE`
2. Triggers are enabled: `SELECT * FROM pg_trigger`
3. Lead was actually created: `SELECT * FROM leads ORDER BY created_at DESC`

**Fix:**
```sql
-- Manually enroll
SELECT enroll_in_email_sequence(
  p_lead_id := 'lead-uuid',
  p_trigger_event := 'lead_created'
);
```

### Issue: Lead Scores Not Updating

**Check:**
1. Trigger exists: `SELECT * FROM pg_trigger WHERE tgname LIKE '%lead_score%'`
2. Function works: `SELECT calculate_enhanced_lead_score('lead-uuid')`

**Fix:**
```sql
-- Recalculate all scores
SELECT * FROM recalculate_all_lead_scores();
```

### Issue: High-Score Leads Not Creating Notifications

**Check:**
1. `admin_notifications` table exists
2. Score crossed threshold (80+)
3. RLS policies allow insert

**Fix:**
```sql
-- Manually create notification
INSERT INTO admin_notifications (title, message, severity, category)
VALUES ('Test', 'Testing notifications', 'info', 'test');
```

---

## Performance Optimization

### Email Queue Optimization

If email queue grows large (>10,000 pending):

```sql
-- Add index for faster processing
CREATE INDEX IF NOT EXISTS idx_email_queue_processing
  ON email_queue(status, scheduled_for)
  WHERE status = 'pending';

-- Archive old sent emails
INSERT INTO email_queue_archive
SELECT * FROM email_queue
WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '90 days';

DELETE FROM email_queue
WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '90 days';
```

### Lead Score Calculation Optimization

For large lead databases (>100,000 leads):

```sql
-- Only recalculate scores for active leads
UPDATE leads
SET score = calculate_enhanced_lead_score(id)
WHERE status IN ('new', 'contacted', 'qualified')
  AND last_contacted_at > NOW() - INTERVAL '90 days';
```

---

## Security Considerations

1. **Service Role Key**: Never expose in client-side code
2. **Cron Secret**: Use strong random string, rotate quarterly
3. **RLS Policies**: Verify all tables have appropriate policies
4. **Email Webhooks**: Validate signatures from Resend
5. **Rate Limiting**: Implement on Edge Functions if public

---

## Next Steps (Future Enhancements)

After Fixes 1-4 are stable, implement:

1. **Week 2**: CRM enhancements (email sending from admin, tasks, timeline)
2. **Week 3-4**: Analytics & attribution tracking
3. **Month 2**: Advanced segmentation, predictive analytics
4. **Month 3+**: Visual workflow builder, A/B testing framework

---

## Support & Resources

- **Documentation**: `ADMIN_AUTOMATION_STRATEGY.md`
- **Edge Functions**: `supabase/functions/`
- **Migrations**: `supabase/migrations/`
- **Libraries**: `src/lib/lead-capture.ts`, `src/lib/email-automation.ts`, `src/lib/trial-automation.ts`

---

## Changelog

### v1.0.0 (2025-10-13)
- ✅ Implemented Fix 1: Contact Form Lead Capture
- ✅ Implemented Fix 2: Email Automation Engine
- ✅ Implemented Fix 3: Enhanced Lead Scoring
- ✅ Implemented Fix 4: Trial Conversion Automation
- ✅ Created setup documentation

---

**Status**: Ready for Deployment
**Next Review**: After 1 week of production use
