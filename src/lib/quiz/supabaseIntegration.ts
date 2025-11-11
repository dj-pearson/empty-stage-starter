// @ts-nocheck
/**
 * Supabase Integration for Quiz Tool
 * Handles all database operations for quiz responses, leads, and analytics
 */

import { supabase } from '@/lib/supabase';
import {
  QuizAnswers,
  PersonalityType,
  QuizResponse,
  QuizAnalyticsEvent,
  EmailCaptureData
} from '@/types/quiz';

/**
 * Save quiz response to database
 */
export async function saveQuizResponse(
  sessionId: string,
  answers: Partial<QuizAnswers>,
  personalityType: PersonalityType,
  secondaryType: PersonalityType | undefined,
  scores: Record<PersonalityType, number>,
  completionTimeSeconds: number,
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
  },
  abTestVariant?: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('quiz_responses')
      .insert({
        session_id: sessionId,
        answers: answers,
        personality_type: personalityType,
        secondary_type: secondaryType,
        scores: scores,
        completion_time_seconds: completionTimeSeconds,
        utm_source: utmParams?.source,
        utm_medium: utmParams?.medium,
        utm_campaign: utmParams?.campaign,
        ab_test_variant: abTestVariant,
        device_type: getDeviceType(),
        user_agent: navigator.userAgent,
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  } catch (error) {
    console.error('Error saving quiz response:', error);
    throw error;
  }
}

/**
 * Capture email lead
 */
export async function captureEmailLead(
  quizResponseId: string,
  emailData: EmailCaptureData,
  personalityType: PersonalityType
): Promise<void> {
  try {
    // Generate referral code
    const referralCode = generateReferralCode();

    // Insert or update lead
    const { error } = await supabase
      .from('quiz_leads')
      .upsert({
        email: emailData.email,
        child_name: emailData.childName,
        parent_name: emailData.parentName,
        quiz_response_id: quizResponseId,
        personality_type: personalityType,
        accepts_marketing: emailData.acceptsMarketing,
        referral_code: referralCode,
      }, {
        onConflict: 'email'
      });

    if (error) throw error;

    // Update quiz response with email
    await supabase
      .from('quiz_responses')
      .update({
        email: emailData.email,
        child_name: emailData.childName,
        parent_name: emailData.parentName,
        email_captured: true,
      })
      .eq('id', quizResponseId);

  } catch (error) {
    console.error('Error capturing email lead:', error);
    throw error;
  }
}

/**
 * Track analytics event
 */
export async function trackQuizAnalytics(
  event: QuizAnalyticsEvent
): Promise<void> {
  try {
    await supabase
      .from('quiz_analytics')
      .insert({
        session_id: event.sessionId,
        quiz_response_id: event.quizResponseId,
        event_type: event.eventType,
        event_data: event.eventData,
        current_step: event.currentStep,
        total_steps: event.totalSteps,
        time_on_page_seconds: event.timeOnPageSeconds,
        device_type: event.deviceType || getDeviceType(),
        browser: getBrowser(),
        user_agent: navigator.userAgent,
        ab_test_variant: event.abTestVariant,
      });
  } catch (error) {
    console.error('Error tracking analytics:', error);
    // Don't throw - analytics failures shouldn't break the app
  }
}

/**
 * Track PDF download
 */
export async function trackPDFDownload(
  quizResponseId: string
): Promise<void> {
  try {
    await supabase
      .from('quiz_responses')
      .update({ pdf_downloaded: true })
      .eq('id', quizResponseId);
  } catch (error) {
    console.error('Error tracking PDF download:', error);
  }
}

/**
 * Track social share
 */
export async function trackSocialShare(
  quizResponseId: string,
  platform: 'facebook' | 'instagram' | 'twitter' | 'pinterest' | 'email',
  personalityType: PersonalityType,
  referralCode?: string
): Promise<void> {
  try {
    await Promise.all([
      // Update quiz response
      supabase
        .from('quiz_responses')
        .update({ shared_social: true })
        .eq('id', quizResponseId),

      // Insert share record
      supabase
        .from('quiz_shares')
        .insert({
          quiz_response_id: quizResponseId,
          platform,
          personality_type: personalityType,
          referral_code: referralCode,
          share_url: window.location.href,
        })
    ]);
  } catch (error) {
    console.error('Error tracking social share:', error);
  }
}

/**
 * Get quiz analytics summary (for admin dashboard)
 */
export async function getQuizAnalyticsSummary(
  startDate?: Date,
  endDate?: Date
) {
  try {
    let query = supabase
      .from('quiz_responses')
      .select('*');

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate metrics
    const totalResponses = data.length;
    const completedResponses = data.filter(r => r.completion_time_seconds).length;
    const emailCaptureRate = data.filter(r => r.email_captured).length / totalResponses;
    const pdfDownloadRate = data.filter(r => r.pdf_downloaded).length / totalResponses;
    const socialShareRate = data.filter(r => r.shared_social).length / totalResponses;
    const avgCompletionTime = data.reduce((sum, r) => sum + (r.completion_time_seconds || 0), 0) / completedResponses;

    // Personality type distribution
    const personalityDistribution = data.reduce((acc, r) => {
      acc[r.personality_type] = (acc[r.personality_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalResponses,
      completedResponses,
      emailCaptureRate,
      pdfDownloadRate,
      socialShareRate,
      avgCompletionTime,
      personalityDistribution,
    };
  } catch (error) {
    console.error('Error getting analytics summary:', error);
    throw error;
  }
}

/**
 * Get recent quiz leads (for admin)
 */
export async function getRecentLeads(limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from('quiz_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error getting recent leads:', error);
    throw error;
  }
}

/**
 * Update email sequence tracking
 */
export async function updateEmailSequence(
  email: string,
  emailNumber: number,
  action: 'sent' | 'opened' | 'clicked'
): Promise<void> {
  try {
    const updates: Record<string, any> = {};

    if (action === 'sent') {
      updates[`email_${emailNumber}_sent_at`] = new Date().toISOString();
    } else if (action === 'opened') {
      updates[`email_${emailNumber}_opened`] = true;
    } else if (action === 'clicked') {
      updates[`email_${emailNumber}_clicked`] = true;
    }

    await supabase
      .from('quiz_leads')
      .update(updates)
      .eq('email', email);
  } catch (error) {
    console.error('Error updating email sequence:', error);
  }
}

/**
 * Track trial start
 */
export async function trackTrialStart(
  email: string
): Promise<void> {
  try {
    await Promise.all([
      supabase
        .from('quiz_leads')
        .update({
          trial_started: true,
          trial_started_at: new Date().toISOString(),
        })
        .eq('email', email),

      supabase
        .from('quiz_responses')
        .update({ trial_started: true })
        .eq('email', email)
    ]);
  } catch (error) {
    console.error('Error tracking trial start:', error);
  }
}

/**
 * Track referral
 */
export async function trackReferral(
  referralCode: string,
  referredQuizResponseId: string,
  referredEmail?: string
): Promise<void> {
  try {
    // Get referrer email
    const { data: referrerData } = await supabase
      .from('quiz_leads')
      .select('email')
      .eq('referral_code', referralCode)
      .single();

    if (!referrerData) return;

    // Insert referral record
    await supabase
      .from('quiz_referrals')
      .insert({
        referrer_email: referrerData.email,
        referral_code: referralCode,
        referred_quiz_response_id: referredQuizResponseId,
        referred_email: referredEmail,
      });

    // Increment referral count
    await supabase.rpc('increment_referral_count', {
      referrer_email_param: referrerData.email
    });
  } catch (error) {
    console.error('Error tracking referral:', error);
  }
}

// Helper functions

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Opera')) return 'Opera';
  return 'Unknown';
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
