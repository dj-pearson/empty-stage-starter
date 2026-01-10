/**
 * Customer Health Scoring Service
 *
 * Provides automated scoring based on engagement metrics to identify
 * healthy, at-risk, and churning customers.
 *
 * Health Tiers:
 * - Champion (80-100): Highly engaged, frequent usage, uses many features
 * - Healthy (60-79): Regular engagement, good feature adoption
 * - Neutral (40-59): Moderate engagement, may need attention
 * - At Risk (20-39): Low engagement, likely to churn
 * - Churning (0-19): Minimal/no activity, intervention needed
 *
 * Usage:
 * ```typescript
 * import { customerHealth } from '@/lib/customer-health';
 *
 * // Get user's health score
 * const score = await customerHealth.getScore(userId);
 *
 * // Recalculate health score
 * await customerHealth.recalculateScore(userId);
 *
 * // Get all at-risk customers (admin)
 * const atRisk = await customerHealth.getAtRiskCustomers();
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

/**
 * Health tier definitions
 */
export type HealthTier = 'champion' | 'healthy' | 'neutral' | 'at_risk' | 'churning';

/**
 * Score trend
 */
export type ScoreTrend = 'improving' | 'stable' | 'declining';

/**
 * Health score data
 */
export interface HealthScore {
  userId: string;
  healthScore: number;
  healthTier: HealthTier;

  // Component scores
  engagementScore: number;
  featureAdoptionScore: number;
  activityFrequencyScore: number;
  recencyScore: number;
  breadthScore: number;
  depthScore: number;

  // Metrics
  daysActiveLast30: number;
  daysActiveLast7: number;
  totalSessions30d: number;
  avgSessionDurationMinutes: number;
  featuresUsedCount: number;
  aiInteractions30d: number;
  mealsPlanned30d: number;
  foodsLogged30d: number;
  recipesCreated30d: number;

  // Trend
  scoreTrend: ScoreTrend;
  scoreChange30d: number;

  // Timestamps
  lastActivityAt: string | null;
  calculatedAt: string;
}

/**
 * Health history entry
 */
export interface HealthHistoryEntry {
  id: string;
  userId: string;
  healthScore: number;
  healthTier: HealthTier;
  recordedAt: string;
}

/**
 * Health summary for admin dashboard
 */
export interface HealthSummary {
  tier: HealthTier;
  userCount: number;
  avgScore: number;
  avgEngagement: number;
  avgFeatureAdoption: number;
  avgDaysActive: number;
}

/**
 * Tier thresholds
 */
const TIER_THRESHOLDS = {
  champion: 80,
  healthy: 60,
  neutral: 40,
  at_risk: 20,
  churning: 0,
};

/**
 * Tier display info
 */
export const TIER_INFO: Record<HealthTier, { label: string; color: string; bgColor: string; description: string }> = {
  champion: {
    label: 'Champion',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    description: 'Highly engaged power user',
  },
  healthy: {
    label: 'Healthy',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    description: 'Regular active user',
  },
  neutral: {
    label: 'Neutral',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    description: 'Moderate engagement',
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    description: 'Declining engagement',
  },
  churning: {
    label: 'Churning',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    description: 'Minimal activity, may churn',
  },
};

/**
 * Calculate tier from score
 */
function getTierFromScore(score: number): HealthTier {
  if (score >= TIER_THRESHOLDS.champion) return 'champion';
  if (score >= TIER_THRESHOLDS.healthy) return 'healthy';
  if (score >= TIER_THRESHOLDS.neutral) return 'neutral';
  if (score >= TIER_THRESHOLDS.at_risk) return 'at_risk';
  return 'churning';
}

/**
 * Customer Health Service
 */
class CustomerHealthService {
  private readonly log = logger.withContext('CustomerHealth');

  /**
   * Get user's health score
   */
  async getScore(userId: string): Promise<HealthScore | null> {
    try {
      const { data, error } = await supabase
        .from('customer_health_scores')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No score exists, calculate one
          return this.recalculateScore(userId);
        }
        this.log.error(`Failed to get health score for ${userId}`, error);
        return null;
      }

      return this.mapRowToScore(data);
    } catch (error) {
      this.log.error('Health score query error', error);
      return null;
    }
  }

  /**
   * Recalculate health score for a user
   */
  async recalculateScore(userId: string): Promise<HealthScore | null> {
    try {
      // Call the database function to calculate score
      const { data: scoreResult, error: scoreError } = await supabase
        .rpc('calculate_customer_health_score', { p_user_id: userId });

      if (scoreError) {
        this.log.error(`Failed to calculate health score for ${userId}`, scoreError);
        return null;
      }

      // Fetch the updated score
      return this.getScore(userId);
    } catch (error) {
      this.log.error('Health score calculation error', error);
      return null;
    }
  }

  /**
   * Recalculate scores for all users (admin batch job)
   */
  async recalculateAllScores(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      // Get all users
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id');

      if (error) {
        this.log.error('Failed to fetch users for batch calculation', error);
        return { processed: 0, errors: 1 };
      }

      // Process in batches of 10
      const batchSize = 10;
      for (let i = 0; i < (users || []).length; i += batchSize) {
        const batch = users!.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (user) => {
            const result = await this.recalculateScore(user.id);
            if (result) {
              processed++;
            } else {
              errors++;
            }
          })
        );
      }

      this.log.info(`Batch health score calculation complete: ${processed} processed, ${errors} errors`);
      return { processed, errors };
    } catch (error) {
      this.log.error('Batch calculation error', error);
      return { processed, errors: errors + 1 };
    }
  }

  /**
   * Get health score history for a user
   */
  async getScoreHistory(userId: string, limit = 30): Promise<HealthHistoryEntry[]> {
    try {
      const { data, error } = await supabase
        .from('customer_health_history')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error('Failed to get health history', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        healthScore: row.health_score,
        healthTier: row.health_tier as HealthTier,
        recordedAt: row.recorded_at,
      }));
    } catch (error) {
      this.log.error('Health history query error', error);
      return [];
    }
  }

  /**
   * Get health summary by tier (admin)
   */
  async getHealthSummary(): Promise<HealthSummary[]> {
    try {
      const { data, error } = await supabase
        .from('admin_customer_health_summary')
        .select('*');

      if (error) {
        this.log.error('Failed to get health summary', error);
        return [];
      }

      return (data || []).map((row) => ({
        tier: row.health_tier as HealthTier,
        userCount: row.user_count,
        avgScore: row.avg_score,
        avgEngagement: row.avg_engagement,
        avgFeatureAdoption: row.avg_feature_adoption,
        avgDaysActive: row.avg_days_active,
      }));
    } catch (error) {
      this.log.error('Health summary query error', error);
      return [];
    }
  }

  /**
   * Get at-risk customers (admin)
   */
  async getAtRiskCustomers(limit = 50): Promise<HealthScore[]> {
    try {
      const { data, error } = await supabase
        .from('customer_health_scores')
        .select('*')
        .in('health_tier', ['at_risk', 'churning'])
        .order('health_score', { ascending: true })
        .limit(limit);

      if (error) {
        this.log.error('Failed to get at-risk customers', error);
        return [];
      }

      return (data || []).map(this.mapRowToScore);
    } catch (error) {
      this.log.error('At-risk query error', error);
      return [];
    }
  }

  /**
   * Get champion customers (admin)
   */
  async getChampions(limit = 50): Promise<HealthScore[]> {
    try {
      const { data, error } = await supabase
        .from('customer_health_scores')
        .select('*')
        .eq('health_tier', 'champion')
        .order('health_score', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error('Failed to get champions', error);
        return [];
      }

      return (data || []).map(this.mapRowToScore);
    } catch (error) {
      this.log.error('Champions query error', error);
      return [];
    }
  }

  /**
   * Get customers by tier (admin)
   */
  async getCustomersByTier(tier: HealthTier, limit = 100): Promise<HealthScore[]> {
    try {
      const { data, error } = await supabase
        .from('customer_health_scores')
        .select('*')
        .eq('health_tier', tier)
        .order('health_score', { ascending: tier === 'churning' || tier === 'at_risk' })
        .limit(limit);

      if (error) {
        this.log.error(`Failed to get customers for tier ${tier}`, error);
        return [];
      }

      return (data || []).map(this.mapRowToScore);
    } catch (error) {
      this.log.error('Tier query error', error);
      return [];
    }
  }

  /**
   * Get customers with declining scores (admin)
   */
  async getDecliningCustomers(limit = 50): Promise<HealthScore[]> {
    try {
      const { data, error } = await supabase
        .from('customer_health_scores')
        .select('*')
        .eq('score_trend', 'declining')
        .order('score_change_30d', { ascending: true })
        .limit(limit);

      if (error) {
        this.log.error('Failed to get declining customers', error);
        return [];
      }

      return (data || []).map(this.mapRowToScore);
    } catch (error) {
      this.log.error('Declining query error', error);
      return [];
    }
  }

  /**
   * Search customers by health metrics (admin)
   */
  async searchByMetrics(filters: {
    minScore?: number;
    maxScore?: number;
    tiers?: HealthTier[];
    minDaysActive?: number;
    trend?: ScoreTrend;
  }): Promise<HealthScore[]> {
    try {
      let query = supabase
        .from('customer_health_scores')
        .select('*')
        .order('health_score', { ascending: false });

      if (filters.minScore !== undefined) {
        query = query.gte('health_score', filters.minScore);
      }
      if (filters.maxScore !== undefined) {
        query = query.lte('health_score', filters.maxScore);
      }
      if (filters.tiers && filters.tiers.length > 0) {
        query = query.in('health_tier', filters.tiers);
      }
      if (filters.minDaysActive !== undefined) {
        query = query.gte('days_active_last_30', filters.minDaysActive);
      }
      if (filters.trend) {
        query = query.eq('score_trend', filters.trend);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        this.log.error('Failed to search by metrics', error);
        return [];
      }

      return (data || []).map(this.mapRowToScore);
    } catch (error) {
      this.log.error('Metrics search error', error);
      return [];
    }
  }

  /**
   * Get tier info
   */
  getTierInfo(tier: HealthTier) {
    return TIER_INFO[tier];
  }

  /**
   * Get tier from score
   */
  getTier(score: number): HealthTier {
    return getTierFromScore(score);
  }

  /**
   * Map database row to HealthScore
   */
  private mapRowToScore(row: any): HealthScore {
    return {
      userId: row.user_id,
      healthScore: row.health_score,
      healthTier: row.health_tier as HealthTier,
      engagementScore: row.engagement_score || 0,
      featureAdoptionScore: row.feature_adoption_score || 0,
      activityFrequencyScore: row.activity_frequency_score || 0,
      recencyScore: row.recency_score || 0,
      breadthScore: row.breadth_score || 0,
      depthScore: row.depth_score || 0,
      daysActiveLast30: row.days_active_last_30 || 0,
      daysActiveLast7: row.days_active_last_7 || 0,
      totalSessions30d: row.total_sessions_30d || 0,
      avgSessionDurationMinutes: row.avg_session_duration_minutes || 0,
      featuresUsedCount: row.features_used_count || 0,
      aiInteractions30d: row.ai_interactions_30d || 0,
      mealsPlanned30d: row.meals_planned_30d || 0,
      foodsLogged30d: row.foods_logged_30d || 0,
      recipesCreated30d: row.recipes_created_30d || 0,
      scoreTrend: (row.score_trend || 'stable') as ScoreTrend,
      scoreChange30d: row.score_change_30d || 0,
      lastActivityAt: row.last_activity_at,
      calculatedAt: row.calculated_at,
    };
  }
}

// Export singleton instance
export const customerHealth = new CustomerHealthService();

// Export types and utilities
export { getTierFromScore, TIER_THRESHOLDS };
