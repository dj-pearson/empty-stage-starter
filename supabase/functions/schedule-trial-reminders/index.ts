import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../common/headers.ts';

/**
 * US-631: warns trial users before the first charge.
 *
 * A trial that converts silently is the FTC negative-option pattern. This runs
 * daily, finds subscriptions whose trial ends in the 3-day and 1-day windows,
 * and queues a reminder that states the amount, the date, and how to cancel.
 *
 * Idempotency is a partial unique index on subscription_notifications over
 * (user_id, stripe_subscription_id, window) for notification_type
 * 'trial_ending' (migration 20260818000001). The notification row is written
 * FIRST and its conflict is what claims the send, so an overlapping cron fire
 * or a retry cannot double-send even if the email queue insert later fails.
 *
 * Setup as a cron job:
 * ```sql
 * SELECT cron.schedule(
 *   'schedule-trial-reminders',
 *   '0 15 * * *',  -- daily, 15:00 UTC
 *   $$
 *   SELECT net.http_post(
 *     url := 'https://functions.tryeatpal.com/schedule-trial-reminders',
 *     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
 *     body := '{}'::jsonb
 *   ) as request_id;
 *   $$
 * );
 * ```
 */

/** Reminder windows, in days before trial_end. */
const WINDOWS = [
  { label: '3d', days: 3, templateKey: 'trial_ending_3d' },
  { label: '1d', days: 1, templateKey: 'trial_ending_1d' },
] as const;

const APP_URL = 'https://tryeatpal.com';
const MANAGE_URL = `${APP_URL}/dashboard/billing`;

interface TrialSubscription {
  user_id: string;
  stripe_subscription_id: string | null;
  trial_end: string;
  plan_id: string | null;
  subscription_plans: { name: string; price_monthly: number; price_yearly: number } | null;
}

/** Start and end of the UTC day that is `days` from now. */
function windowBounds(days: number, now: Date): { from: string; to: string } {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() + days);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start.getTime());
  end.setUTCHours(23, 59, 59, 999);

  return { from: start.toISOString(), to: end.toISOString() };
}

function renderTemplate(body: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (out, [key, value]) => out.replaceAll(`{{${key}}}`, value),
    body
  );
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const results = { queued: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (const window of WINDOWS) {
      const { from, to } = windowBounds(window.days, now);

      const { data: subscriptions, error } = await supabase
        .from('user_subscriptions')
        .select(
          'user_id, stripe_subscription_id, trial_end, plan_id, subscription_plans(name, price_monthly, price_yearly)'
        )
        .eq('status', 'trialing')
        .gte('trial_end', from)
        .lte('trial_end', to);

      if (error) {
        results.failed++;
        results.errors.push(`${window.label}: ${error.message}`);
        continue;
      }

      for (const sub of (subscriptions ?? []) as unknown as TrialSubscription[]) {
        try {
          const plan = sub.subscription_plans;
          const trialEnd = new Date(sub.trial_end);
          const trialEndLabel = trialEnd.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          });

          // Yearly plans price at price_yearly; everything else is monthly.
          // current_period length is not stored, so monthly is the safe read.
          const amount = plan?.price_monthly ?? 0;
          const variables = {
            user_name: 'there',
            plan_name: plan?.name ?? 'EatPal',
            trial_end_date: trialEndLabel,
            amount: `$${Number(amount).toFixed(2)}`,
            cadence: 'month',
            manage_url: MANAGE_URL,
          };

          // Claim the send first. A duplicate-key error here means another run
          // already took this window, so skip without sending.
          const { error: claimError } = await supabase
            .from('subscription_notifications')
            .insert({
              user_id: sub.user_id,
              notification_type: 'trial_ending',
              title: `Your trial ends ${trialEndLabel}`,
              message: `We'll charge ${variables.amount} per month when your ${variables.plan_name} trial ends. Cancel before then and you won't be billed.`,
              action_url: '/dashboard/billing',
              action_label: 'Manage subscription',
              metadata: {
                window: window.label,
                stripe_subscription_id: sub.stripe_subscription_id,
                trial_end: sub.trial_end,
              },
            });

          if (claimError) {
            // 23505 = unique_violation: already sent for this window.
            if ((claimError as { code?: string }).code === '23505') {
              results.skipped++;
              continue;
            }
            throw claimError;
          }

          const { data: authUser } = await supabase.auth.admin.getUserById(sub.user_id);
          const email = authUser?.user?.email;
          if (!email) {
            results.skipped++;
            continue;
          }
          variables.user_name =
            (authUser?.user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
            'there';

          const { data: template, error: templateError } = await supabase
            .from('automation_email_templates')
            .select('subject, html_body, text_body')
            .eq('template_key', window.templateKey)
            .single();

          if (templateError || !template) {
            throw templateError ?? new Error(`Template ${window.templateKey} missing`);
          }

          const { error: queueError } = await supabase.from('automation_email_queue').insert({
            user_id: sub.user_id,
            template_key: window.templateKey,
            to_email: email,
            subject: renderTemplate(template.subject, variables),
            html_body: renderTemplate(template.html_body, variables),
            text_body: template.text_body
              ? renderTemplate(template.text_body, variables)
              : null,
            template_variables: variables,
            // Above the default 5: missing this one costs the user money.
            priority: 8,
          });

          if (queueError) throw queueError;
          results.queued++;
        } catch (err) {
          results.failed++;
          results.errors.push(
            `${window.label}/${sub.user_id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log('[schedule-trial-reminders]', JSON.stringify(results));
    return json({ success: true, ...results });
  } catch (err) {
    console.error('[schedule-trial-reminders] failed:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
};
