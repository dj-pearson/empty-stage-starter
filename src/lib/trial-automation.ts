import { supabase } from "@/integrations/supabase/client";
import { triggerEmailSequence } from "./email-automation";
import { logger } from "@/lib/logger";

/**
 * Trial Automation Library
 * Handles automated workflows for trial users
 */

export interface TrialUser {
  user_id: string;
  email: string;
  full_name?: string;
  trial_start_date: string;
  trial_end_date: string;
  subscription_status: string;
}

/**
 * Initialize trial automation when user starts trial
 * Called from signup/onboarding flow
 */
export async function initializeTrialAutomation(
  userId: string,
  userEmail: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Enroll user in trial onboarding sequence
    const sequenceResult = await triggerEmailSequence({
      userId,
      triggerEvent: 'trial_start',
      metadata: {
        user_name: userName,
        trial_start_date: new Date().toISOString(),
      },
    });

    if (!sequenceResult.success) {
      logger.error('Failed to enroll in trial sequence:', sequenceResult.error);
    }

    // 2. Update or create lead record to track trial
    const { error: leadError } = await supabase
      .from('leads')
      .upsert([{
        email: userEmail,
        full_name: userName || null,
        source: 'trial_signup',
        status: 'qualified',
        converted_user_id: userId,
        metadata: {
          trial_started: true,
          trial_start_date: new Date().toISOString(),
        },
      }], {
        onConflict: 'email',
      });

    if (leadError) {
      logger.error('Error updating lead for trial:', leadError);
    }

    // 3. Create admin notification for high-value trial starts
    // (Could be based on user profile, referral source, etc.)
    await createAdminNotification({
      title: 'New Trial Started',
      message: `${userName || userEmail} started a free trial`,
      severity: 'info',
      category: 'trials',
      entity_type: 'user',
      entity_id: userId,
    });

    return { success: true };
  } catch (error: unknown) {
    logger.error('Error in initializeTrialAutomation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Track trial user activity for engagement scoring
 */
export async function trackTrialActivity(
  userId: string,
  activityType: 'login' | 'kid_added' | 'meal_logged' | 'recipe_created' | 'feature_used',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Update lead metadata with activity
    const { data: lead } = await supabase
      .from('leads')
      .select('id, metadata')
      .eq('converted_user_id', userId)
      .maybeSingle();

    if (lead) {
      const currentMetadata = (lead.metadata as Record<string, any>) || {};
      const activityCounts = (currentMetadata.activity_counts as Record<string, number>) || {};

      activityCounts[activityType] = (activityCounts[activityType] || 0) + 1;

      await supabase
        .from('leads')
        .update({
          metadata: {
            ...currentMetadata,
            activity_counts: activityCounts,
            last_activity: new Date().toISOString(),
            last_activity_type: activityType,
            ...metadata,
          } as any,
          last_contacted_at: new Date().toISOString(),
        })
        .eq('id', lead.id);
    }

    // Trigger specific interventions based on activity
    await triggerTrialInterventions(userId, activityType, metadata);
  } catch (error) {
    logger.error('Error tracking trial activity:', error);
  }
}

/**
 * Check for trial interventions based on user behavior
 */
async function triggerTrialInterventions(
  userId: string,
  activityType: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('created_at, current_period_end, status')
      .eq('user_id', userId)
      .eq('status', 'trialing')
      .maybeSingle();

    if (!subscription) return;

    const daysSinceTrial = Math.floor(
      (Date.now() - new Date(subscription.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const daysUntilEnd = Math.floor(
      (new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);

    const userEmail = authUser?.user?.email;
    if (!userEmail) return;

    // Intervention: Low activity after 3 days
    if (daysSinceTrial >= 3 && activityType === 'login') {
      const { data: lead } = await supabase
        .from('leads')
        .select('metadata')
        .eq('converted_user_id', userId)
        .single();

      const activityCounts = (lead?.metadata as Record<string, any>)?.activity_counts || {};
      const totalActivity = Object.values(activityCounts).reduce((a: any, b: any) => a + b, 0) as number;

      if (totalActivity < 3) {
        // Send "need help?" email
        await supabase
          .from('automation_email_queue')
          .insert([{
            to_email: userEmail,
            subject: `Need help getting started with EatPal, ${profile?.full_name?.split(' ')[0] || 'there'}?`,
            html_body: generateNeedHelpEmail(profile?.full_name),
            scheduled_for: new Date().toISOString(),
            priority: 8,
            template_key: 'trial_help',
          }]);
      }
    }

    // Intervention: High usage after 5 days (power user)
    if (daysSinceTrial >= 5 && activityType === 'meal_logged') {
      const { data: lead } = await supabase
        .from('leads')
        .select('metadata')
        .eq('converted_user_id', userId)
        .single();

      const mealCount = ((lead?.metadata as Record<string, any>)?.activity_counts as Record<string, number>)?.meal_logged || 0;

      if (mealCount >= 10) {
        // Send upgrade offer
        await supabase
          .from('automation_email_queue')
          .insert([{
            to_email: userEmail,
            subject: `You're a power user! Upgrade to unlock more`,
            html_body: generatePowerUserEmail(profile?.full_name, mealCount),
            scheduled_for: new Date().toISOString(),
            priority: 9,
            template_key: 'power_user',
          }]);
      }
    }

    // Intervention: Trial ending soon (3 days)
    if (daysUntilEnd === 3) {
      await supabase
        .from('automation_email_queue')
        .insert([{
          to_email: userEmail,
          subject: `Your EatPal trial ends in 3 days`,
          html_body: generateTrialEndingEmail(profile?.full_name, 3),
          scheduled_for: new Date().toISOString(),
          priority: 10,
          template_key: 'trial_ending_3d',
        }]);
    }

    // Intervention: Trial ending tomorrow
    if (daysUntilEnd === 1) {
      await supabase
        .from('automation_email_queue')
        .insert([{
          to_email: userEmail,
          subject: `Last chance: Your trial ends tomorrow!`,
          html_body: generateTrialEndingEmail(profile?.full_name, 1, true),
          scheduled_for: new Date().toISOString(),
          priority: 10,
          template_key: 'trial_ending_1d',
        }]);
    }
  } catch (error) {
    logger.error('Error in triggerTrialInterventions:', error);
  }
}

/**
 * Handle trial conversion to paid
 */
export async function handleTrialConversion(
  userId: string,
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Update lead status to converted
    const { error: leadError } = await supabase
      .from('leads')
      .update({
        status: 'converted',
        converted_at: new Date().toISOString(),
        metadata: {
          subscription_id: subscriptionId,
          converted_date: new Date().toISOString(),
        },
      })
      .eq('converted_user_id', userId);

    if (leadError) {
      logger.error('Error updating lead on conversion:', leadError);
    }

    // 2. Cancel trial-related email sequences (table doesn't exist, skip)
    // Note: user_email_sequences table doesn't exist in current schema

    // 3. Start customer welcome sequence
    await triggerEmailSequence({
      userId,
      triggerEvent: 'subscription_active',
      metadata: {
        conversion_date: new Date().toISOString(),
      },
    });

    // 4. Create admin notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();

    await createAdminNotification({
      title: 'Trial Converted! 🎉',
      message: `${profile?.full_name || 'User'} upgraded to paid subscription`,
      severity: 'high',
      category: 'conversions',
      entity_type: 'subscription',
      entity_id: subscriptionId,
    });

    // 5. Track conversion in campaign analytics
    const { data: lead } = await supabase
      .from('leads')
      .select('campaign_id')
      .eq('converted_user_id', userId)
      .maybeSingle();

    if (lead?.campaign_id) {
      // Update campaign analytics
      const today = new Date().toISOString().split('T')[0];

      await supabase
        .from('campaign_analytics')
        .upsert([{
          campaign_id: lead.campaign_id,
          date: today,
          conversions: 1,
        }], {
          onConflict: 'campaign_id,date',
          ignoreDuplicates: false,
        });
    }

    return { success: true };
  } catch (error: unknown) {
    logger.error('Error in handleTrialConversion:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle subscription cancellation
 */
export async function handleSubscriptionCancellation(
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Update lead status
    await supabase
      .from('leads')
      .update({
        status: 'lost',
        notes: reason ? `Cancellation reason: ${reason}` : 'Subscription canceled',
      })
      .eq('converted_user_id', userId);

    // 2. Start win-back sequence
    await triggerEmailSequence({
      userId,
      triggerEvent: 'subscription_canceled',
      metadata: {
        cancellation_date: new Date().toISOString(),
        reason: reason || 'not_provided',
      },
    });

    // 3. Create admin notification
    await createAdminNotification({
      title: 'Subscription Canceled',
      message: `User canceled subscription${reason ? `: ${reason}` : ''}`,
      severity: 'medium',
      category: 'churn',
      entity_type: 'user',
      entity_id: userId,
    });

    return { success: true };
  } catch (error: unknown) {
    logger.error('Error in handleSubscriptionCancellation:', error);
    return { success: false, error: error.message };
  }
}

// Email template generators
function generateNeedHelpEmail(userName?: string): string {
  const firstName = userName?.split(' ')[0] || 'there';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Need help getting started, ${firstName}?</h2>
      <p>We noticed you haven't been back to EatPal in a few days.</p>
      <p>Getting started is easy! Here's what to do:</p>
      <ol style="line-height: 1.8;">
        <li>Add your child's profile with their preferences</li>
        <li>Log a few meals to start tracking</li>
        <li>Explore our meal planning features</li>
      </ol>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${window.location.origin}/dashboard"
           style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Continue to Dashboard
        </a>
      </div>
      <p>Have questions? Just reply to this email!</p>
      <p>Best regards,<br>The EatPal Team</p>
    </div>
  `;
}

function generatePowerUserEmail(userName: string | undefined, mealCount: number): string {
  const firstName = userName?.split(' ')[0] || 'there';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">You're crushing it, ${firstName}! 🎉</h2>
      <p>You've logged <strong>${mealCount} meals</strong> already - that's amazing!</p>
      <p>Ready to unlock even more features?</p>
      <ul style="line-height: 1.8;">
        <li>Advanced meal planning</li>
        <li>Unlimited recipes</li>
        <li>Premium food database</li>
        <li>Priority support</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${window.location.origin}/pricing"
           style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Upgrade Now - 20% Off
        </a>
      </div>
      <p>This special offer is just for power users like you!</p>
      <p>Best regards,<br>The EatPal Team</p>
    </div>
  `;
}

function generateTrialEndingEmail(
  userName: string | undefined,
  daysLeft: number,
  urgent: boolean = false
): string {
  const firstName = userName?.split(' ')[0] || 'there';
  const urgencyText = urgent ? 'LAST CHANCE: ' : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${urgent ? '#ef4444' : '#10b981'};">${urgencyText}Your trial ends ${daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}</h2>
      <p>Hi ${firstName},</p>
      <p>Your free trial of EatPal is ending soon. Don't lose access to your meal plans and progress!</p>
      ${urgent ? '<p style="color: #ef4444; font-weight: bold;">Upgrade today to keep all your data and continue your journey.</p>' : ''}
      <div style="text-align: center; margin: 30px 0;">
        <a href="${window.location.origin}/pricing"
           style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 18px;">
          Upgrade to Continue
        </a>
      </div>
      ${urgent ? '<p style="text-align: center;"><strong>Use code LASTCHANCE for 20% off your first month!</strong></p>' : ''}
      <p>Questions? We're here to help!</p>
      <p>Best regards,<br>The EatPal Team</p>
    </div>
  `;
}

// Helper function to create admin notifications
async function createAdminNotification(params: {
  title: string;
  message: string;
  severity: 'low' | 'info' | 'medium' | 'high' | 'critical';
  category: string;
  entity_type?: string;
  entity_id?: string;
}): Promise<void> {
  try {
    await supabase
      .from('admin_notifications')
      .insert([{
        notification_type: params.category,
        title: params.title,
        message: params.message,
        severity: params.severity,
        metadata: {
          entity_type: params.entity_type || null,
          entity_id: params.entity_id || null,
        },
        is_read: false,
      }]);
  } catch (error) {
    logger.error('Error creating admin notification:', error);
  }
}
