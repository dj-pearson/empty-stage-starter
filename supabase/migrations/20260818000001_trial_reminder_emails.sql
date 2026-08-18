-- US-631: trial-ending reminders.
--
-- The machinery for this existed three times over as admin UI options and an
-- unreferenced library (src/lib/trial-automation.ts), and zero times as
-- something that sends. Now that US-630 makes the trial real, a trial that
-- converts with no warning is the FTC negative-option pattern, so the reminder
-- has to actually exist.
--
-- Additive per CLAUDE.md: two new template rows, one partial unique index on a
-- notification_type no row currently uses. Nothing existing changes shape.

INSERT INTO automation_email_templates
  (template_key, template_name, subject, html_body, text_body, category, variables)
VALUES
(
  'trial_ending_3d',
  'Trial Ending in 3 Days',
  'Your EatPal trial ends in 3 days',
  '<html><body style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2421;">
<div style="padding: 32px 24px;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Your trial ends in 3 days</h1>
  <p>Hi {{user_name}},</p>
  <p>Your EatPal {{plan_name}} trial ends on <strong>{{trial_end_date}}</strong>. After that we will
     charge <strong>{{amount}}</strong> per {{cadence}} and your plan continues.</p>
  <p>If EatPal is not for you, cancel before {{trial_end_date}} and you will not be billed.
     Cancelling takes two clicks in Account Settings.</p>
  <p><a href="{{manage_url}}" style="display: inline-block; padding: 12px 20px; background: #2f6f4e; color: #ffffff; text-decoration: none; border-radius: 12px;">Manage your subscription</a></p>
  <p style="font-size: 13px; color: #5b6660;">Questions? Reply to this email or write to Support@TryEatPal.com.</p>
</div>
</body></html>',
  'Hi {{user_name}},

Your EatPal {{plan_name}} trial ends on {{trial_end_date}}. After that we will charge {{amount}} per {{cadence}} and your plan continues.

If EatPal is not for you, cancel before {{trial_end_date}} and you will not be billed. Cancelling takes two clicks in Account Settings.

Manage your subscription: {{manage_url}}

Questions? Reply to this email or write to Support@TryEatPal.com.',
  'transactional',
  '["user_name", "plan_name", "trial_end_date", "amount", "cadence", "manage_url"]'::jsonb
),
(
  'trial_ending_1d',
  'Trial Ending Tomorrow',
  'Your EatPal trial ends tomorrow',
  '<html><body style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2421;">
<div style="padding: 32px 24px;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Your trial ends tomorrow</h1>
  <p>Hi {{user_name}},</p>
  <p>This is the last reminder: your EatPal {{plan_name}} trial ends on
     <strong>{{trial_end_date}}</strong>, and we will then charge <strong>{{amount}}</strong> per {{cadence}}.</p>
  <p>Cancel before then and you will not be billed.</p>
  <p><a href="{{manage_url}}" style="display: inline-block; padding: 12px 20px; background: #2f6f4e; color: #ffffff; text-decoration: none; border-radius: 12px;">Manage your subscription</a></p>
  <p style="font-size: 13px; color: #5b6660;">Questions? Reply to this email or write to Support@TryEatPal.com.</p>
</div>
</body></html>',
  'Hi {{user_name}},

This is the last reminder: your EatPal {{plan_name}} trial ends on {{trial_end_date}}, and we will then charge {{amount}} per {{cadence}}.

Cancel before then and you will not be billed.

Manage your subscription: {{manage_url}}

Questions? Reply to this email or write to Support@TryEatPal.com.',
  'transactional',
  '["user_name", "plan_name", "trial_end_date", "amount", "cadence", "manage_url"]'::jsonb
)
ON CONFLICT (template_key) DO NOTHING;

-- Idempotency for the reminder job. One row per user, per subscription, per
-- window ('3d' / '1d'), so a re-run or an overlapping cron fire cannot send the
-- same warning twice. Partial: no row currently uses notification_type
-- 'trial_ending', so this cannot conflict with existing data.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_notifications_trial_window
  ON public.subscription_notifications (
    user_id,
    (metadata ->> 'stripe_subscription_id'),
    (metadata ->> 'window')
  )
  WHERE notification_type = 'trial_ending';
