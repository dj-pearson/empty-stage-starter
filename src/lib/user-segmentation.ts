/**
 * User Segmentation Service
 *
 * Provides cohort analysis and targeted user segments for marketing,
 * support, and product analytics.
 *
 * Segment Types:
 * - Manual: Admin-created segments with hand-picked users
 * - Dynamic: Auto-calculated based on filter criteria
 * - Cohort: Time-based or event-based groupings
 *
 * Usage:
 * ```typescript
 * import { userSegmentation } from '@/lib/user-segmentation';
 *
 * // Get all segments
 * const segments = await userSegmentation.getSegments();
 *
 * // Get users in a segment
 * const users = await userSegmentation.getSegmentMembers('power_users');
 *
 * // Create a new segment
 * await userSegmentation.createSegment({
 *   name: 'weekly_planners',
 *   displayName: 'Weekly Meal Planners',
 *   segmentType: 'dynamic',
 *   filterCriteria: { mealsPlanned30d: { gte: 7 } },
 * });
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

/**
 * Segment types
 */
export type SegmentType = 'manual' | 'dynamic' | 'cohort';

/**
 * Segment definition
 */
export interface Segment {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  segmentType: SegmentType;
  filterCriteria: Record<string, unknown>;
  cohortType?: string;
  cohortValue?: string;
  color: string;
  icon: string;
  isActive: boolean;
  isSystem: boolean;
  memberCount: number;
  avgHealthScore?: number;
  lastCalculatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Segment member
 */
export interface SegmentMember {
  id: string;
  segmentId: string;
  userId: string;
  addedAt: string;
  addedBy?: string;
  metadata: Record<string, unknown>;
}

/**
 * User attributes for segmentation
 */
export interface UserAttributes {
  userId: string;
  signupDate?: string;
  signupSource?: string;
  countryCode?: string;
  timezone?: string;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  mrrCents: number;
  lifetimeValueCents: number;
  primaryUseCase?: string;
  familySize?: number;
  kidsCount: number;
  totalSessions: number;
  totalFoodsAdded: number;
  totalMealsPlanned: number;
  totalRecipesCreated: number;
  aiUsageCount: number;
  isPowerUser: boolean;
  isAtRisk: boolean;
  hasCompletedOnboarding: boolean;
  hasUsedAiCoach: boolean;
  hasUsedBarcodeScanner: boolean;
  firstActivityAt?: string;
  lastActivityAt?: string;
}

/**
 * Create segment options
 */
export interface CreateSegmentOptions {
  name: string;
  displayName: string;
  description?: string;
  segmentType: SegmentType;
  filterCriteria?: Record<string, unknown>;
  cohortType?: string;
  cohortValue?: string;
  color?: string;
  icon?: string;
}

/**
 * Filter operators for dynamic segments
 */
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

/**
 * Filter criteria for dynamic segments
 */
export interface FilterCriteria {
  [field: string]: {
    [operator in FilterOperator]?: unknown;
  };
}

/**
 * Predefined segment filters
 */
export const PREDEFINED_FILTERS: Record<string, FilterCriteria> = {
  power_users: {
    isPowerUser: { eq: true },
  },
  new_users: {
    signupDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
  },
  at_risk: {
    isAtRisk: { eq: true },
  },
  premium_users: {
    subscriptionStatus: { eq: 'active' },
    subscriptionTier: { in: ['premium', 'enterprise'] },
  },
  picky_eater_parents: {
    primaryUseCase: { eq: 'picky_eater' },
  },
  meal_planners: {
    totalMealsPlanned: { gte: 10 },
  },
};

/**
 * User Segmentation Service
 */
class UserSegmentationService {
  private readonly log = logger.withContext('UserSegmentation');

  /**
   * Get all segments
   */
  async getSegments(options: { activeOnly?: boolean } = {}): Promise<Segment[]> {
    try {
      let query = supabase
        .from('user_segments')
        .select('*')
        .order('member_count', { ascending: false });

      if (options.activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        this.log.error('Failed to get segments', error);
        return [];
      }

      return (data || []).map(this.mapRowToSegment);
    } catch (error) {
      this.log.error('Segments query error', error);
      return [];
    }
  }

  /**
   * Get a segment by ID
   */
  async getSegment(segmentId: string): Promise<Segment | null> {
    try {
      const { data, error } = await supabase
        .from('user_segments')
        .select('*')
        .eq('id', segmentId)
        .single();

      if (error) {
        this.log.error(`Failed to get segment ${segmentId}`, error);
        return null;
      }

      return this.mapRowToSegment(data);
    } catch (error) {
      this.log.error('Segment query error', error);
      return null;
    }
  }

  /**
   * Get a segment by name
   */
  async getSegmentByName(name: string): Promise<Segment | null> {
    try {
      const { data, error } = await supabase
        .from('user_segments')
        .select('*')
        .eq('name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        this.log.error(`Failed to get segment by name: ${name}`, error);
        return null;
      }

      return this.mapRowToSegment(data);
    } catch (error) {
      this.log.error('Segment query error', error);
      return null;
    }
  }

  /**
   * Create a new segment
   */
  async createSegment(options: CreateSegmentOptions): Promise<Segment | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('user_segments')
        .insert({
          name: options.name,
          display_name: options.displayName,
          description: options.description,
          segment_type: options.segmentType,
          filter_criteria: options.filterCriteria || {},
          cohort_type: options.cohortType,
          cohort_value: options.cohortValue,
          color: options.color || '#6366f1',
          icon: options.icon || 'users',
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) {
        this.log.error('Failed to create segment', error);
        return null;
      }

      this.log.info(`Segment created: ${options.name}`);
      return this.mapRowToSegment(data);
    } catch (error) {
      this.log.error('Segment creation error', error);
      return null;
    }
  }

  /**
   * Update a segment
   */
  async updateSegment(
    segmentId: string,
    updates: Partial<CreateSegmentOptions>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_segments')
        .update({
          display_name: updates.displayName,
          description: updates.description,
          filter_criteria: updates.filterCriteria,
          cohort_type: updates.cohortType,
          cohort_value: updates.cohortValue,
          color: updates.color,
          icon: updates.icon,
        })
        .eq('id', segmentId)
        .eq('is_system', false); // Cannot update system segments

      if (error) {
        this.log.error(`Failed to update segment ${segmentId}`, error);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('Segment update error', error);
      return false;
    }
  }

  /**
   * Delete a segment
   */
  async deleteSegment(segmentId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_segments')
        .delete()
        .eq('id', segmentId)
        .eq('is_system', false); // Cannot delete system segments

      if (error) {
        this.log.error(`Failed to delete segment ${segmentId}`, error);
        return false;
      }

      this.log.info(`Segment deleted: ${segmentId}`);
      return true;
    } catch (error) {
      this.log.error('Segment deletion error', error);
      return false;
    }
  }

  /**
   * Get members of a segment
   */
  async getSegmentMembers(
    segmentIdOrName: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SegmentMember[]> {
    try {
      // First, try to find the segment
      let segment = await this.getSegment(segmentIdOrName);
      if (!segment) {
        segment = await this.getSegmentByName(segmentIdOrName);
      }

      if (!segment) {
        this.log.warn(`Segment not found: ${segmentIdOrName}`);
        return [];
      }

      let query = supabase
        .from('user_segment_members')
        .select('*')
        .eq('segment_id', segment.id)
        .order('added_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        this.log.error(`Failed to get segment members for ${segment.name}`, error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        segmentId: row.segment_id,
        userId: row.user_id,
        addedAt: row.added_at,
        addedBy: row.added_by,
        metadata: row.metadata || {},
      }));
    } catch (error) {
      this.log.error('Segment members query error', error);
      return [];
    }
  }

  /**
   * Add user to a segment
   */
  async addToSegment(
    segmentId: string,
    userId: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('user_segment_members')
        .insert({
          segment_id: segmentId,
          user_id: userId,
          added_by: user?.id,
          metadata: metadata || {},
        });

      if (error) {
        if (error.code === '23505') {
          // Already a member
          return true;
        }
        this.log.error(`Failed to add user ${userId} to segment ${segmentId}`, error);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('Add to segment error', error);
      return false;
    }
  }

  /**
   * Add multiple users to a segment
   */
  async addManyToSegment(
    segmentId: string,
    userIds: string[]
  ): Promise<number> {
    let addedCount = 0;

    await Promise.all(
      userIds.map(async (userId) => {
        const success = await this.addToSegment(segmentId, userId);
        if (success) addedCount++;
      })
    );

    return addedCount;
  }

  /**
   * Remove user from a segment
   */
  async removeFromSegment(segmentId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_segment_members')
        .delete()
        .eq('segment_id', segmentId)
        .eq('user_id', userId);

      if (error) {
        this.log.error(`Failed to remove user ${userId} from segment ${segmentId}`, error);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('Remove from segment error', error);
      return false;
    }
  }

  /**
   * Check if user is in a segment
   */
  async isInSegment(segmentIdOrName: string, userId: string): Promise<boolean> {
    try {
      let segment = await this.getSegment(segmentIdOrName);
      if (!segment) {
        segment = await this.getSegmentByName(segmentIdOrName);
      }

      if (!segment) return false;

      const { count, error } = await supabase
        .from('user_segment_members')
        .select('*', { count: 'exact', head: true })
        .eq('segment_id', segment.id)
        .eq('user_id', userId);

      if (error) return false;

      return (count || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get all segments a user belongs to
   */
  async getUserSegments(userId: string): Promise<Segment[]> {
    try {
      const { data, error } = await supabase
        .from('user_segment_members')
        .select('segment_id')
        .eq('user_id', userId);

      if (error) {
        this.log.error(`Failed to get segments for user ${userId}`, error);
        return [];
      }

      if (!data || data.length === 0) return [];

      const segmentIds = data.map((row) => row.segment_id);

      const { data: segments, error: segmentsError } = await supabase
        .from('user_segments')
        .select('*')
        .in('id', segmentIds);

      if (segmentsError) {
        this.log.error('Failed to get segment details', segmentsError);
        return [];
      }

      return (segments || []).map(this.mapRowToSegment);
    } catch (error) {
      this.log.error('User segments query error', error);
      return [];
    }
  }

  /**
   * Get user attributes
   */
  async getUserAttributes(userId: string): Promise<UserAttributes | null> {
    try {
      const { data, error } = await supabase
        .from('user_attributes')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        this.log.error(`Failed to get attributes for user ${userId}`, error);
        return null;
      }

      return {
        userId: data.user_id,
        signupDate: data.signup_date,
        signupSource: data.signup_source,
        countryCode: data.country_code,
        timezone: data.timezone,
        subscriptionTier: data.subscription_tier,
        subscriptionStatus: data.subscription_status,
        mrrCents: data.mrr_cents || 0,
        lifetimeValueCents: data.lifetime_value_cents || 0,
        primaryUseCase: data.primary_use_case,
        familySize: data.family_size,
        kidsCount: data.kids_count || 0,
        totalSessions: data.total_sessions || 0,
        totalFoodsAdded: data.total_foods_added || 0,
        totalMealsPlanned: data.total_meals_planned || 0,
        totalRecipesCreated: data.total_recipes_created || 0,
        aiUsageCount: data.ai_usage_count || 0,
        isPowerUser: data.is_power_user || false,
        isAtRisk: data.is_at_risk || false,
        hasCompletedOnboarding: data.has_completed_onboarding || false,
        hasUsedAiCoach: data.has_used_ai_coach || false,
        hasUsedBarcodeScanner: data.has_used_barcode_scanner || false,
        firstActivityAt: data.first_activity_at,
        lastActivityAt: data.last_activity_at,
      };
    } catch (error) {
      this.log.error('User attributes query error', error);
      return null;
    }
  }

  /**
   * Refresh segment member counts
   */
  async refreshSegmentCounts(): Promise<void> {
    try {
      const { error } = await supabase.rpc('refresh_segment_counts');

      if (error) {
        this.log.error('Failed to refresh segment counts', error);
      }
    } catch (error) {
      this.log.error('Refresh segment counts error', error);
    }
  }

  /**
   * Get segment summary (admin)
   */
  async getSegmentSummary(): Promise<Array<Segment & { avgHealthScore: number }>> {
    try {
      const { data, error } = await supabase
        .from('admin_segment_summary')
        .select('*');

      if (error) {
        this.log.error('Failed to get segment summary', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        description: '',
        segmentType: row.segment_type as SegmentType,
        filterCriteria: {},
        color: row.color,
        icon: 'users',
        isActive: row.is_active,
        isSystem: false,
        memberCount: row.member_count,
        avgHealthScore: row.avg_health_score,
        lastCalculatedAt: row.last_calculated_at,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      }));
    } catch (error) {
      this.log.error('Segment summary query error', error);
      return [];
    }
  }

  /**
   * Map database row to Segment
   */
  private mapRowToSegment(row: any): Segment {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      segmentType: row.segment_type as SegmentType,
      filterCriteria: row.filter_criteria || {},
      cohortType: row.cohort_type,
      cohortValue: row.cohort_value,
      color: row.color || '#6366f1',
      icon: row.icon || 'users',
      isActive: row.is_active !== false,
      isSystem: row.is_system === true,
      memberCount: row.member_count || 0,
      lastCalculatedAt: row.last_calculated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  }
}

// Export singleton instance
export const userSegmentation = new UserSegmentationService();

// Export types
export type { Segment, SegmentMember, UserAttributes, CreateSegmentOptions };
