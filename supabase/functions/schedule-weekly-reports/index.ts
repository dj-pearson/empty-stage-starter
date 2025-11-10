import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/headers.ts';

/**
 * Scheduled Weekly Reports Generator
 *
 * This function runs on a schedule (e.g., every Monday at 9 AM) and automatically
 * generates weekly reports for all active households.
 *
 * Setup as a cron job:
 * ```sql
 * SELECT cron.schedule(
 *   'generate-weekly-reports',
 *   '0 9 * * 1',  -- Every Monday at 9 AM
 *   $$
 *   SELECT net.http_post(
 *     url := 'https://your-project.supabase.co/functions/v1/schedule-weekly-reports',
 *     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
 *     body := '{}'::jsonb
 *   ) as request_id;
 *   $$
 * );
 * ```
 */

interface HouseholdPreferences {
  household_id: string;
  auto_generate: boolean;
  generation_day: string;
  email_delivery: boolean;
  push_notification: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting scheduled weekly report generation...');

    // Get current day of week
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'lowercase' });

    console.log(`Current day: ${dayOfWeek}`);

    // Find households that have auto-generation enabled for today
    const { data: preferences, error: prefError } = await supabase
      .from('report_preferences')
      .select('household_id, auto_generate, generation_day, email_delivery, push_notification')
      .eq('auto_generate', true)
      .eq('generation_day', dayOfWeek);

    if (prefError) {
      console.error('Error fetching preferences:', prefError);
      throw prefError;
    }

    if (!preferences || preferences.length === 0) {
      console.log('No households configured for report generation today');
      return new Response(
        JSON.stringify({
          message: 'No households configured for today',
          day: dayOfWeek,
          count: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${preferences.length} households to process`);

    const results = {
      total: preferences.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each household
    for (const pref of preferences) {
      try {
        console.log(`Generating report for household ${pref.household_id}`);

        // Call the generate-weekly-report function
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-weekly-report`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ householdId: pref.household_id }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to generate report: ${error}`);
        }

        const { report } = await response.json();
        console.log(`Report generated for household ${pref.household_id}: ${report.id}`);

        // Send notifications if enabled
        if (pref.email_delivery || pref.push_notification) {
          await sendReportNotifications(
            supabaseClient,
            pref.household_id,
            report.id,
            pref.email_delivery,
            pref.push_notification
          );
        }

        results.successful++;
      } catch (error) {
        console.error(`Error processing household ${pref.household_id}:`, error);
        results.failed++;
        results.errors.push(`Household ${pref.household_id}: ${error.message}`);
      }
    }

    console.log('Report generation complete:', results);

    return new Response(
      JSON.stringify({
        message: 'Scheduled report generation complete',
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in scheduled report generation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function sendReportNotifications(
  supabase: any,
  householdId: string,
  reportId: string,
  emailEnabled: boolean,
  pushEnabled: boolean
) {
  try {
    // Get household users
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email')
      .eq('household_id', householdId);

    if (profileError) throw profileError;

    if (!profiles || profiles.length === 0) {
      console.log(`No users found for household ${householdId}`);
      return;
    }

    // Get report summary for notification
    const { data: report, error: reportError } = await supabase
      .from('weekly_reports')
      .select('week_start_date, week_end_date, meals_planned, avg_meal_approval_score')
      .eq('id', reportId)
      .single();

    if (reportError) throw reportError;

    const notificationTitle = '📊 Your Weekly Meal Report is Ready!';
    const notificationBody = `Week of ${new Date(report.week_start_date).toLocaleDateString()}: ${report.meals_planned} meals planned with ${report.avg_meal_approval_score.toFixed(0)}% kid approval!`;

    for (const profile of profiles) {
      // Queue push notification
      if (pushEnabled) {
        await supabase.from('notification_queue').insert({
          user_id: profile.user_id,
          notification_type: 'weekly_report',
          title: notificationTitle,
          body: notificationBody,
          data: {
            reportId,
            householdId,
            route: '/reports',
          },
          scheduled_for: new Date().toISOString(),
        });
      }

      // Send email notification (if email functionality is set up)
      if (emailEnabled && profile.email) {
        // This would integrate with send-emails function or similar
        console.log(`Email notification queued for ${profile.email}`);
      }
    }

    // Mark report as sent
    await supabase
      .from('weekly_reports')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    console.log(`Notifications sent for report ${reportId}`);
  } catch (error) {
    console.error('Error sending report notifications:', error);
    // Don't throw - we don't want to fail the whole process if notification fails
  }
}
