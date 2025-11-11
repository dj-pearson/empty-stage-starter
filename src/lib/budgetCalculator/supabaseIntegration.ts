// @ts-nocheck
/**
 * Supabase Integration for Budget Calculator
 * Handles database operations for budget calculations and lead capture
 */

import { supabase } from '@/lib/supabase';
import {
  BudgetCalculatorInput,
  BudgetCalculation,
  BudgetEmailCaptureData,
  BudgetAnalyticsEvent,
  BudgetEventType,
} from '@/types/budgetCalculator';

/**
 * Save budget calculation to database
 */
export async function saveBudgetCalculation(
  sessionId: string,
  input: BudgetCalculatorInput,
  calculation: BudgetCalculation
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('budget_calculations')
      .insert({
        session_id: sessionId,
        family_size: input.familySize,
        adults: input.adults,
        children: input.children,
        zip_code: input.zipCode,
        state: input.state,
        dietary_restrictions: input.dietaryRestrictions,
        recommended_monthly_budget: calculation.recommendedMonthlyBudget,
        cost_per_meal: calculation.costPerMeal,
        cost_per_person_per_day: calculation.costPerPersonPerDay,
        usda_plan_level: calculation.usdaPlanLevel,
        vs_meal_kits_savings: calculation.vsMealKitsSavings,
        vs_dining_out_savings: calculation.vsDiningOutSavings,
        annual_savings: calculation.annualSavings,
        email_captured: false,
        meal_plan_downloaded: false,
        trial_started: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving budget calculation:', error);
      throw error;
    }

    // Track analytics event
    await trackAnalyticsEvent({
      toolName: 'budget_calculator',
      sessionId,
      calculationId: data.id,
      eventType: 'calculation_completed',
      eventData: {
        family_size: input.familySize,
        monthly_budget: calculation.recommendedMonthlyBudget,
        plan_level: calculation.usdaPlanLevel,
        dietary_restrictions: input.dietaryRestrictions,
        state: input.state,
      },
    });

    return data.id;
  } catch (error) {
    console.error('Failed to save budget calculation:', error);
    throw error;
  }
}

/**
 * Capture email lead from budget calculator
 */
export async function captureBudgetEmailLead(
  calculationId: string,
  emailData: BudgetEmailCaptureData,
  monthlyBudget: number,
  familySize: number
): Promise<void> {
  try {
    // Generate referral code
    const referralCode = generateReferralCode(emailData.email);

    // Check if lead already exists
    const { data: existingLead, error: checkError } = await supabase
      .from('budget_leads')
      .select('id')
      .eq('email', emailData.email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is ok
      console.error('Error checking existing lead:', checkError);
    }

    if (existingLead) {
      // Update existing lead
      const { error: updateError } = await supabase
        .from('budget_leads')
        .update({
          budget_calculation_id: calculationId,
          family_size: familySize,
          monthly_budget: monthlyBudget,
          accepts_marketing: emailData.acceptsMarketing,
          updated_at: new Date().toISOString(),
        })
        .eq('email', emailData.email);

      if (updateError) {
        console.error('Error updating lead:', updateError);
      }
    } else {
      // Create new lead
      const { error: insertError } = await supabase.from('budget_leads').insert({
        email: emailData.email,
        name: emailData.name,
        budget_calculation_id: calculationId,
        family_size: familySize,
        monthly_budget: monthlyBudget,
        referral_code: referralCode,
        accepts_marketing: emailData.acceptsMarketing,
        email_sequence_started: false,
        trial_started: false,
      });

      if (insertError) {
        console.error('Error creating lead:', insertError);
        throw insertError;
      }
    }

    // Update calculation with email
    const { error: updateCalcError } = await supabase
      .from('budget_calculations')
      .update({
        email: emailData.email,
        name: emailData.name,
        email_captured: true,
      })
      .eq('id', calculationId);

    if (updateCalcError) {
      console.error('Error updating calculation with email:', updateCalcError);
    }

    // Track analytics event
    const { data: calcData } = await supabase
      .from('budget_calculations')
      .select('session_id')
      .eq('id', calculationId)
      .single();

    if (calcData) {
      await trackAnalyticsEvent({
        toolName: 'budget_calculator',
        sessionId: calcData.session_id,
        calculationId,
        eventType: 'email_captured',
        eventData: {
          accepts_marketing: emailData.acceptsMarketing,
        },
      });
    }
  } catch (error) {
    console.error('Failed to capture email lead:', error);
    throw error;
  }
}

/**
 * Track PDF download
 */
export async function trackBudgetPDFDownload(calculationId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('budget_calculations')
      .update({
        meal_plan_downloaded: true,
      })
      .eq('id', calculationId);

    if (error) {
      console.error('Error tracking PDF download:', error);
    }

    // Track analytics
    const { data: calcData } = await supabase
      .from('budget_calculations')
      .select('session_id')
      .eq('id', calculationId)
      .single();

    if (calcData) {
      await trackAnalyticsEvent({
        toolName: 'budget_calculator',
        sessionId: calcData.session_id,
        calculationId,
        eventType: 'meal_plan_downloaded',
      });
    }
  } catch (error) {
    console.error('Failed to track PDF download:', error);
  }
}

/**
 * Track trial start
 */
export async function trackBudgetTrialStart(email: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('budget_leads')
      .update({
        trial_started: true,
        trial_started_at: new Date().toISOString(),
      })
      .eq('email', email);

    if (error) {
      console.error('Error tracking trial start:', error);
    }

    // Also update calculations
    await supabase
      .from('budget_calculations')
      .update({
        trial_started: true,
      })
      .eq('email', email);
  } catch (error) {
    console.error('Failed to track trial start:', error);
  }
}

/**
 * Track analytics event
 */
export async function trackAnalyticsEvent(event: BudgetAnalyticsEvent): Promise<void> {
  try {
    const { error } = await supabase.from('tool_analytics').insert({
      tool_name: event.toolName,
      session_id: event.sessionId,
      event_type: event.eventType,
      event_data: event.eventData || {},
      time_on_page_seconds: event.timeOnPageSeconds,
      device_type: event.deviceType || getDeviceType(),
      ab_test_variant: event.abTestVariant,
    });

    if (error) {
      console.error('Error tracking analytics event:', error);
    }
  } catch (error) {
    console.error('Failed to track analytics event:', error);
  }
}

/**
 * Track social share
 */
export async function trackBudgetSocialShare(
  calculationId: string,
  platform: 'facebook' | 'twitter' | 'email'
): Promise<void> {
  try {
    // Mark calculation as shared
    const { error } = await supabase
      .from('budget_calculations')
      .update({
        shared: true,
      })
      .eq('id', calculationId);

    if (error) {
      console.error('Error tracking social share:', error);
    }

    // Track analytics
    const { data: calcData } = await supabase
      .from('budget_calculations')
      .select('session_id')
      .eq('id', calculationId)
      .single();

    if (calcData) {
      await trackAnalyticsEvent({
        toolName: 'budget_calculator',
        sessionId: calcData.session_id,
        calculationId,
        eventType: 'shared',
        eventData: {
          platform,
        },
      });
    }
  } catch (error) {
    console.error('Failed to track social share:', error);
  }
}

/**
 * Get budget analytics summary
 */
export async function getBudgetAnalyticsSummary(): Promise<{
  totalCalculations: number;
  emailCaptureRate: number;
  averageBudget: number;
  averageFamilySize: number;
  downloadRate: number;
  trialStartRate: number;
  topStates: { state: string; count: number }[];
  recentLeads: Array<{
    id: string;
    email: string;
    name: string | null;
    monthly_budget: number;
    family_size: number;
    created_at: string;
    trial_started: boolean;
  }>;
}> {
  try {
    // Get total calculations
    const { count: totalCalculations } = await supabase
      .from('budget_calculations')
      .select('*', { count: 'exact', head: true });

    // Get calculations with email captured
    const { count: emailsCaptured } = await supabase
      .from('budget_calculations')
      .select('*', { count: 'exact', head: true })
      .eq('email_captured', true);

    // Get average budget and family size
    const { data: avgData } = await supabase
      .from('budget_calculations')
      .select('recommended_monthly_budget, family_size');

    const averageBudget =
      avgData?.reduce((sum, c) => sum + c.recommended_monthly_budget, 0) / (avgData?.length || 1) ||
      0;
    const averageFamilySize =
      avgData?.reduce((sum, c) => sum + c.family_size, 0) / (avgData?.length || 1) || 0;

    // Get download rate
    const { count: downloadsCount } = await supabase
      .from('budget_calculations')
      .select('*', { count: 'exact', head: true })
      .eq('meal_plan_downloaded', true);

    // Get trial start rate
    const { count: trialsCount } = await supabase
      .from('budget_calculations')
      .select('*', { count: 'exact', head: true })
      .eq('trial_started', true);

    // Get top states
    const { data: stateData } = await supabase
      .from('budget_calculations')
      .select('state')
      .not('state', 'is', null);

    const stateCounts: Record<string, number> = {};
    stateData?.forEach((c) => {
      if (c.state) {
        stateCounts[c.state] = (stateCounts[c.state] || 0) + 1;
      }
    });

    const topStates = Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get recent leads
    const { data: recentLeads } = await supabase
      .from('budget_leads')
      .select('id, email, name, monthly_budget, family_size, created_at, trial_started')
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      totalCalculations: totalCalculations || 0,
      emailCaptureRate:
        totalCalculations && emailsCaptured
          ? (emailsCaptured / totalCalculations) * 100
          : 0,
      averageBudget: Math.round(averageBudget * 100) / 100,
      averageFamilySize: Math.round(averageFamilySize * 10) / 10,
      downloadRate:
        totalCalculations && downloadsCount ? (downloadsCount / totalCalculations) * 100 : 0,
      trialStartRate:
        emailsCaptured && trialsCount ? (trialsCount / emailsCaptured) * 100 : 0,
      topStates,
      recentLeads: recentLeads || [],
    };
  } catch (error) {
    console.error('Failed to get budget analytics summary:', error);
    throw error;
  }
}

/**
 * Helper: Generate referral code from email
 */
function generateReferralCode(email: string): string {
  const hash = email
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    .toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `BUDGET-${hash}-${random}`.toUpperCase();
}

/**
 * Helper: Get device type
 */
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
