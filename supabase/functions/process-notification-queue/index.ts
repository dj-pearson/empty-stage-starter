import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../common/headers.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Process 100 notifications per run
const MAX_RETRY_ATTEMPTS = 3;

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase with service role (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting notification queue processing...');

    // Get pending notifications that are due to be sent
    const now = new Date().toISOString();
    const { data: pendingNotifications, error: fetchError } = await supabaseAdmin
      .from('notification_queue')
      .select(`
        *,
        notification_preferences (
          push_enabled,
          email_enabled,
          quiet_hours_enabled,
          quiet_hours_start,
          quiet_hours_end,
          max_notifications_per_day
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('priority', { ascending: false }) // High priority first
      .order('scheduled_for', { ascending: true }) // Oldest first
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingNotifications?.length || 0} pending notifications`);

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending notifications', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let throttled = 0;

    // Process each notification
    for (const notification of pendingNotifications) {
      try {
        // Check if notification should be sent
        const { data: shouldSend } = await supabaseAdmin
          .rpc('should_send_notification', {
            p_user_id: notification.user_id,
            p_notification_type: notification.notification_type,
            p_scheduled_time: notification.scheduled_for
          });

        if (!shouldSend) {
          console.log(`Notification ${notification.id} throttled by user preferences`);

          // Mark as throttled
          await supabaseAdmin
            .from('notification_queue')
            .update({
              status: 'throttled',
              error_message: 'User preferences or quiet hours',
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          throttled++;
          processed++;
          continue;
        }

        // Send based on channel
        let sendResult;
        switch (notification.channel) {
          case 'push':
            sendResult = await sendPushNotification(supabaseAdmin, notification);
            break;
          case 'email':
            sendResult = await sendEmailNotification(supabaseAdmin, notification);
            break;
          case 'sms':
            sendResult = await sendSMSNotification(supabaseAdmin, notification);
            break;
          case 'in_app':
            sendResult = await saveInAppNotification(supabaseAdmin, notification);
            break;
          default:
            throw new Error(`Unknown channel: ${notification.channel}`);
        }

        if (sendResult.success) {
          // Update status to sent
          await supabaseAdmin
            .from('notification_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          // Record in history
          await supabaseAdmin
            .from('notification_history')
            .insert({
              user_id: notification.user_id,
              notification_type: notification.notification_type,
              title: notification.title,
              body: notification.body,
              channel: notification.channel,
              sent_at: new Date().toISOString(),
              was_delivered: true
            });

          sent++;
        } else {
          throw new Error(sendResult.error || 'Send failed');
        }

        processed++;

      } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error);

        // Increment retry count
        const newRetryCount = (notification.retry_count || 0) + 1;

        if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
          // Mark as failed
          await supabaseAdmin
            .from('notification_queue')
            .update({
              status: 'failed',
              error_message: error.message || 'Unknown error',
              retry_count: newRetryCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          failed++;
        } else {
          // Schedule retry
          const retryDelay = Math.pow(2, newRetryCount) * 60 * 1000; // Exponential backoff
          const nextRetry = new Date(Date.now() + retryDelay);

          await supabaseAdmin
            .from('notification_queue')
            .update({
              retry_count: newRetryCount,
              scheduled_for: nextRetry.toISOString(),
              error_message: `Retry ${newRetryCount}: ${error.message}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);
        }

        processed++;
      }
    }

    console.log(`Processed ${processed} notifications: ${sent} sent, ${failed} failed, ${throttled} throttled`);

    return new Response(
      JSON.stringify({
        message: 'Notification queue processed',
        processed,
        sent,
        failed,
        throttled
      }),
      { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-notification-queue:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Send push notification via Expo Push API
async function sendPushNotification(supabaseAdmin: any, notification: any) {
  try {
    // Get user's push tokens
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from('push_tokens')
      .select('*')
      .eq('user_id', notification.user_id)
      .eq('is_active', true);

    if (tokenError || !tokens || tokens.length === 0) {
      return { success: false, error: 'No active push tokens' };
    }

    // Build Expo push messages
    const messages = tokens.map((token: any) => ({
      to: token.token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      channelId: notification.notification_type,
      priority: notification.priority === 'high' ? 'high' : 'normal',
      badge: 1,
    }));

    // Send to Expo Push API
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    // Check for errors
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        const ticketResult = result.data[i];
        if (ticketResult.status === 'error') {
          // Update token if invalid
          if (ticketResult.details?.error === 'DeviceNotRegistered') {
            await supabaseAdmin
              .from('push_tokens')
              .update({
                is_active: false,
                last_error: ticketResult.message,
                failed_attempts: tokens[i].failed_attempts + 1
              })
              .eq('id', tokens[i].id);
          }
        }
      }
    }

    return { success: true };

  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

// Send email notification (placeholder - integrate with Resend)
async function sendEmailNotification(supabaseAdmin: any, notification: any) {
  try {
    // TODO: Integrate with Resend email service
    // For now, just log
    console.log('Email notification would be sent:', notification.title);

    return { success: true };

  } catch (error) {
    console.error('Error sending email notification:', error);
    return { success: false, error: error.message };
  }
}

// Send SMS notification (placeholder - integrate with Twilio)
async function sendSMSNotification(supabaseAdmin: any, notification: any) {
  try {
    // TODO: Integrate with Twilio SMS service
    console.log('SMS notification would be sent:', notification.title);

    return { success: true };

  } catch (error) {
    console.error('Error sending SMS notification:', error);
    return { success: false, error: error.message };
  }
}

// Save in-app notification (just marks as sent, UI will fetch)
async function saveInAppNotification(supabaseAdmin: any, notification: any) {
  try {
    // In-app notifications are just stored in the database
    // The frontend will fetch and display them
    return { success: true };

  } catch (error) {
    console.error('Error saving in-app notification:', error);
    return { success: false, error: error.message };
  }
}
