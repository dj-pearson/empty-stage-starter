/**
 * Supabase Integration for Meal Plan Generator
 * Handles database operations for meal plans and lead capture
 */

import { supabase } from '@/lib/supabase';
import { MealPlanInput, MealPlanResult } from '@/types/mealPlanGenerator';

export interface MealPlanEmailCaptureData {
  email: string;
  name?: string;
  acceptsMarketing: boolean;
}

/**
 * Save meal plan generation to database
 */
export async function saveMealPlanGeneration(
  sessionId: string,
  input: MealPlanInput,
  mealPlan: MealPlanResult
): Promise<string> {
  try {
    // @ts-ignore - meal_plan_generations table exists but types not yet regenerated
    const { data, error } = await supabase
      .from('meal_plan_generations')
      .insert({
        session_id: sessionId,
        family_size: input.familySize,
        adults: input.adults,
        children: input.children,
        children_ages: input.childrenAges,
        dietary_restrictions: input.dietaryRestrictions,
        allergies: input.allergies,
        picky_eater_level: input.pickyEaterLevel,
        cooking_time_available: input.cookingTimeAvailable,
        cooking_skill_level: input.cookingSkillLevel,
        kitchen_equipment: input.kitchenEquipment,
        meal_plan_json: {
          meals: mealPlan.meals,
          groceryList: mealPlan.groceryList,
          tips: {
            prepAhead: mealPlan.prepAheadTips,
            timeSaving: mealPlan.timeSavingTips,
            budget: mealPlan.budgetTips,
            pickyEater: mealPlan.pickyEaterTips,
          },
        },
        total_estimated_cost: mealPlan.totalEstimatedCost,
        total_prep_time: mealPlan.totalPrepTime,
        email_captured: false,
        plan_downloaded: false,
        trial_started: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving meal plan generation:', error);
      throw error;
    }

    // Track analytics event
    await trackMealPlanAnalytics({
      toolName: 'meal_plan_generator',
      sessionId,
      eventType: 'plan_generated',
      eventData: {
        family_size: input.familySize,
        picky_eater_level: input.pickyEaterLevel,
        dietary_restrictions: input.dietaryRestrictions,
        allergies: input.allergies,
        total_cost: mealPlan.totalEstimatedCost,
        meal_count: mealPlan.meals.length,
      },
    });

    return data.id;
  } catch (error) {
    console.error('Failed to save meal plan generation:', error);
    throw error;
  }
}

/**
 * Capture email lead from meal plan generator
 */
export async function captureMealPlanEmailLead(
  planId: string,
  emailData: MealPlanEmailCaptureData,
  familySize: number,
  estimatedCost: number
): Promise<void> {
  try {
    // Generate referral code
    const referralCode = generateReferralCode(emailData.email);

    // Check if lead already exists
    const { data: existingLead, error: checkError } = await supabase
      .from('meal_plan_leads')
      .select('id')
      .eq('email', emailData.email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing lead:', checkError);
    }

    if (existingLead) {
      // Update existing lead
      const { error: updateError } = await supabase
        .from('meal_plan_leads')
        .update({
          meal_plan_generation_id: planId,
          family_size: familySize,
          estimated_weekly_cost: estimatedCost,
          accepts_marketing: emailData.acceptsMarketing,
          updated_at: new Date().toISOString(),
        })
        .eq('email', emailData.email);

      if (updateError) {
        console.error('Error updating lead:', updateError);
      }
    } else {
      // Create new lead
      const { error: insertError } = await supabase.from('meal_plan_leads').insert({
        email: emailData.email,
        name: emailData.name,
        meal_plan_generation_id: planId,
        family_size: familySize,
        estimated_weekly_cost: estimatedCost,
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

    // Update plan with email
    const { error: updatePlanError } = await supabase
      .from('meal_plan_generations')
      .update({
        email: emailData.email,
        name: emailData.name,
        email_captured: true,
      })
      .eq('id', planId);

    if (updatePlanError) {
      console.error('Error updating plan with email:', updatePlanError);
    }

    // Track analytics
    const { data: planData } = await supabase
      .from('meal_plan_generations')
      .select('session_id')
      .eq('id', planId)
      .single();

    if (planData) {
      await trackMealPlanAnalytics({
        toolName: 'meal_plan_generator',
        sessionId: planData.session_id,
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
export async function trackMealPlanPDFDownload(planId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('meal_plan_generations')
      .update({
        plan_downloaded: true,
      })
      .eq('id', planId);

    if (error) {
      console.error('Error tracking PDF download:', error);
    }

    // Track analytics
    const { data: planData } = await supabase
      .from('meal_plan_generations')
      .select('session_id')
      .eq('id', planId)
      .single();

    if (planData) {
      await trackMealPlanAnalytics({
        toolName: 'meal_plan_generator',
        sessionId: planData.session_id,
        eventType: 'plan_downloaded',
      });
    }
  } catch (error) {
    console.error('Failed to track PDF download:', error);
  }
}

/**
 * Track trial start
 */
export async function trackMealPlanTrialStart(email: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('meal_plan_leads')
      .update({
        trial_started: true,
        trial_started_at: new Date().toISOString(),
      })
      .eq('email', email);

    if (error) {
      console.error('Error tracking trial start:', error);
    }

    // Also update generations
    await supabase
      .from('meal_plan_generations')
      .update({
        trial_started: true,
      })
      .eq('email', email);
  } catch (error) {
    console.error('Failed to track trial start:', error);
  }
}

/**
 * Track social share
 */
export async function trackMealPlanSocialShare(
  planId: string,
  platform: 'facebook' | 'twitter' | 'email'
): Promise<void> {
  try {
    const { error } = await supabase
      .from('meal_plan_generations')
      .update({
        shared: true,
      })
      .eq('id', planId);

    if (error) {
      console.error('Error tracking social share:', error);
    }

    // Track analytics
    const { data: planData } = await supabase
      .from('meal_plan_generations')
      .select('session_id')
      .eq('id', planId)
      .single();

    if (planData) {
      await trackMealPlanAnalytics({
        toolName: 'meal_plan_generator',
        sessionId: planData.session_id,
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
 * Track analytics event
 */
async function trackMealPlanAnalytics(event: {
  toolName: string;
  sessionId: string;
  eventType: string;
  eventData?: Record<string, any>;
  timeOnPageSeconds?: number;
  deviceType?: string;
  abTestVariant?: string;
}): Promise<void> {
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
 * Get meal plan analytics summary
 */
export async function getMealPlanAnalyticsSummary(): Promise<{
  totalGenerations: number;
  emailCaptureRate: number;
  averageCost: number;
  averageFamilySize: number;
  downloadRate: number;
  trialStartRate: number;
  topPickyEaterLevels: { level: string; count: number }[];
  recentLeads: Array<{
    id: string;
    email: string;
    name: string | null;
    estimated_weekly_cost: number;
    family_size: number;
    created_at: string;
    trial_started: boolean;
  }>;
}> {
  try {
    // Get total generations
    const { count: totalGenerations } = await supabase
      .from('meal_plan_generations')
      .select('*', { count: 'exact', head: true });

    // Get generations with email captured
    const { count: emailsCaptured } = await supabase
      .from('meal_plan_generations')
      .select('*', { count: 'exact', head: true })
      .eq('email_captured', true);

    // Get average cost and family size
    const { data: avgData } = await supabase
      .from('meal_plan_generations')
      .select('total_estimated_cost, family_size');

    const averageCost =
      avgData?.reduce((sum, g) => sum + g.total_estimated_cost, 0) / (avgData?.length || 1) || 0;
    const averageFamilySize =
      avgData?.reduce((sum, g) => sum + g.family_size, 0) / (avgData?.length || 1) || 0;

    // Get download rate
    const { count: downloadsCount } = await supabase
      .from('meal_plan_generations')
      .select('*', { count: 'exact', head: true })
      .eq('plan_downloaded', true);

    // Get trial start rate
    const { count: trialsCount } = await supabase
      .from('meal_plan_generations')
      .select('*', { count: 'exact', head: true })
      .eq('trial_started', true);

    // Get top picky eater levels
    const { data: pickyData } = await supabase
      .from('meal_plan_generations')
      .select('picky_eater_level');

    const pickyCounts: Record<string, number> = {};
    pickyData?.forEach((g) => {
      if (g.picky_eater_level) {
        pickyCounts[g.picky_eater_level] = (pickyCounts[g.picky_eater_level] || 0) + 1;
      }
    });

    const topPickyEaterLevels = Object.entries(pickyCounts)
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Get recent leads
    const { data: recentLeads } = await supabase
      .from('meal_plan_leads')
      .select('id, email, name, estimated_weekly_cost, family_size, created_at, trial_started')
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      totalGenerations: totalGenerations || 0,
      emailCaptureRate:
        totalGenerations && emailsCaptured ? (emailsCaptured / totalGenerations) * 100 : 0,
      averageCost: Math.round(averageCost * 100) / 100,
      averageFamilySize: Math.round(averageFamilySize * 10) / 10,
      downloadRate:
        totalGenerations && downloadsCount ? (downloadsCount / totalGenerations) * 100 : 0,
      trialStartRate: emailsCaptured && trialsCount ? (trialsCount / emailsCaptured) * 100 : 0,
      topPickyEaterLevels,
      recentLeads: recentLeads || [],
    };
  } catch (error) {
    console.error('Failed to get meal plan analytics summary:', error);
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
  return `MEAL-${hash}-${random}`.toUpperCase();
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
