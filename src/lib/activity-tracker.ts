/**
 * User Activity Tracking Service
 *
 * Provides unified API for tracking user actions across the application.
 * Creates a comprehensive activity timeline for support and analytics.
 *
 * Usage:
 * ```typescript
 * import { activityTracker } from '@/lib/activity-tracker';
 *
 * // Track a meal planning action
 * await activityTracker.track('meal_planned', {
 *   title: 'Planned dinner for Monday',
 *   entityType: 'plan_entry',
 *   entityId: 'plan-entry-uuid',
 *   metadata: { mealSlot: 'dinner', kidId: 'kid-uuid' },
 * });
 *
 * // Get user's activity timeline
 * const timeline = await activityTracker.getTimeline(userId, { limit: 50 });
 *
 * // Get activity summary
 * const summary = await activityTracker.getActivitySummary(userId, 30);
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

/**
 * Activity types
 */
export type ActivityType =
  | 'login'
  | 'logout'
  | 'signup'
  | 'food_created'
  | 'food_updated'
  | 'food_deleted'
  | 'recipe_created'
  | 'recipe_updated'
  | 'recipe_deleted'
  | 'meal_planned'
  | 'meal_logged'
  | 'meal_result_recorded'
  | 'grocery_item_added'
  | 'grocery_item_checked'
  | 'grocery_list_created'
  | 'kid_added'
  | 'kid_updated'
  | 'kid_deleted'
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'payment_processed'
  | 'profile_updated'
  | 'settings_changed'
  | 'export_requested'
  | 'ai_coach_used'
  | 'barcode_scanned'
  | 'recipe_imported'
  | 'quiz_completed'
  | 'budget_calculated'
  | 'achievement_earned'
  | 'file_uploaded'
  | 'file_deleted'
  | 'custom';

/**
 * Activity categories
 */
export type ActivityCategory =
  | 'account'
  | 'content'
  | 'meal_planning'
  | 'shopping'
  | 'family'
  | 'billing'
  | 'ai'
  | 'engagement'
  | 'storage'
  | 'general';

/**
 * Activity entry
 */
export interface ActivityEntry {
  id: string;
  userId: string;
  activityType: ActivityType;
  activityCategory: ActivityCategory;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Track options
 */
export interface TrackOptions {
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  userId?: string; // Override current user
}

/**
 * Timeline query options
 */
export interface TimelineOptions {
  limit?: number;
  offset?: number;
  category?: ActivityCategory;
  activityType?: ActivityType;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Activity summary
 */
export interface ActivitySummary {
  totalActivities: number;
  activeDays: number;
  topActivities: { type: ActivityType; count: number }[];
  categoryBreakdown: { category: ActivityCategory; count: number }[];
  recentTrend: 'increasing' | 'stable' | 'decreasing';
  averagePerDay: number;
}

/**
 * Map activity type to category
 */
function getActivityCategory(type: ActivityType): ActivityCategory {
  const categoryMap: Record<ActivityType, ActivityCategory> = {
    login: 'account',
    logout: 'account',
    signup: 'account',
    profile_updated: 'account',
    settings_changed: 'account',
    food_created: 'content',
    food_updated: 'content',
    food_deleted: 'content',
    recipe_created: 'content',
    recipe_updated: 'content',
    recipe_deleted: 'content',
    meal_planned: 'meal_planning',
    meal_logged: 'meal_planning',
    meal_result_recorded: 'meal_planning',
    grocery_item_added: 'shopping',
    grocery_item_checked: 'shopping',
    grocery_list_created: 'shopping',
    kid_added: 'family',
    kid_updated: 'family',
    kid_deleted: 'family',
    subscription_started: 'billing',
    subscription_cancelled: 'billing',
    payment_processed: 'billing',
    export_requested: 'general',
    ai_coach_used: 'ai',
    barcode_scanned: 'ai',
    recipe_imported: 'ai',
    quiz_completed: 'engagement',
    budget_calculated: 'engagement',
    achievement_earned: 'engagement',
    file_uploaded: 'storage',
    file_deleted: 'storage',
    custom: 'general',
  };

  return categoryMap[type] || 'general';
}

/**
 * Activity Tracker Class
 */
class ActivityTrackerService {
  private readonly log = logger.withContext('ActivityTracker');
  private sessionId: string | null = null;

  constructor() {
    this.initSession();
  }

  private initSession(): void {
    if (typeof window !== 'undefined') {
      this.sessionId = sessionStorage.getItem('activity_session_id');
      if (!this.sessionId) {
        this.sessionId = crypto.randomUUID();
        sessionStorage.setItem('activity_session_id', this.sessionId);
      }
    }
  }

  /**
   * Track a user activity
   */
  async track(type: ActivityType, options: TrackOptions): Promise<string | null> {
    try {
      // Get current user if not provided
      let userId = options.userId;
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      }

      if (!userId) {
        this.log.warn('Cannot track activity: no user ID');
        return null;
      }

      const category = getActivityCategory(type);

      const { data, error } = await supabase
        .from('user_activity_timeline')
        .insert({
          user_id: userId,
          activity_type: type,
          activity_category: category,
          title: options.title,
          description: options.description,
          entity_type: options.entityType,
          entity_id: options.entityId,
          metadata: {
            ...options.metadata,
            sessionId: this.sessionId,
          },
          session_id: this.sessionId,
        })
        .select('id')
        .single();

      if (error) {
        this.log.error(`Failed to track activity: ${type}`, error);
        return null;
      }

      this.log.debug(`Activity tracked: ${type} - ${options.title}`);
      return data?.id || null;
    } catch (error) {
      this.log.error('Activity tracking error', error);
      return null;
    }
  }

  /**
   * Track multiple activities at once
   */
  async trackBatch(
    activities: Array<{ type: ActivityType; options: TrackOptions }>
  ): Promise<number> {
    let successCount = 0;

    await Promise.all(
      activities.map(async ({ type, options }) => {
        const id = await this.track(type, options);
        if (id) successCount++;
      })
    );

    return successCount;
  }

  /**
   * Get user's activity timeline
   */
  async getTimeline(
    userId: string,
    options: TimelineOptions = {}
  ): Promise<ActivityEntry[]> {
    try {
      let query = supabase
        .from('user_activity_timeline')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }
      if (options.category) {
        query = query.eq('activity_category', options.category);
      }
      if (options.activityType) {
        query = query.eq('activity_type', options.activityType);
      }
      if (options.entityType) {
        query = query.eq('entity_type', options.entityType);
      }
      if (options.startDate) {
        query = query.gte('created_at', options.startDate.toISOString());
      }
      if (options.endDate) {
        query = query.lte('created_at', options.endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        this.log.error('Failed to get timeline', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type as ActivityType,
        activityCategory: row.activity_category as ActivityCategory,
        title: row.title,
        description: row.description,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    } catch (error) {
      this.log.error('Timeline query error', error);
      return [];
    }
  }

  /**
   * Get activity for a specific entity
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    limit = 50
  ): Promise<ActivityEntry[]> {
    try {
      const { data, error } = await supabase
        .from('user_activity_timeline')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error('Failed to get entity history', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type as ActivityType,
        activityCategory: row.activity_category as ActivityCategory,
        title: row.title,
        description: row.description,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    } catch (error) {
      this.log.error('Entity history query error', error);
      return [];
    }
  }

  /**
   * Get activity summary for a user
   */
  async getActivitySummary(userId: string, days = 30): Promise<ActivitySummary> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const { data, error } = await supabase
        .from('user_activity_timeline')
        .select('activity_type, activity_category, created_at')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString());

      if (error) {
        this.log.error('Failed to get activity summary', error);
        return this.getEmptySummary();
      }

      const activities = data || [];
      const totalActivities = activities.length;

      // Count unique active days
      const uniqueDays = new Set(
        activities.map((a) => new Date(a.created_at).toDateString())
      );
      const activeDays = uniqueDays.size;

      // Count by activity type
      const typeCounts: Record<string, number> = {};
      activities.forEach((a) => {
        typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
      });

      const topActivities = Object.entries(typeCounts)
        .map(([type, count]) => ({ type: type as ActivityType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Count by category
      const categoryCounts: Record<string, number> = {};
      activities.forEach((a) => {
        categoryCounts[a.activity_category] = (categoryCounts[a.activity_category] || 0) + 1;
      });

      const categoryBreakdown = Object.entries(categoryCounts)
        .map(([category, count]) => ({ category: category as ActivityCategory, count }))
        .sort((a, b) => b.count - a.count);

      // Calculate trend
      const midpoint = new Date();
      midpoint.setDate(midpoint.getDate() - Math.floor(days / 2));

      const firstHalf = activities.filter((a) => new Date(a.created_at) < midpoint).length;
      const secondHalf = activities.filter((a) => new Date(a.created_at) >= midpoint).length;

      let recentTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (secondHalf > firstHalf * 1.2) recentTrend = 'increasing';
      else if (secondHalf < firstHalf * 0.8) recentTrend = 'decreasing';

      return {
        totalActivities,
        activeDays,
        topActivities,
        categoryBreakdown,
        recentTrend,
        averagePerDay: activeDays > 0 ? totalActivities / activeDays : 0,
      };
    } catch (error) {
      this.log.error('Activity summary error', error);
      return this.getEmptySummary();
    }
  }

  private getEmptySummary(): ActivitySummary {
    return {
      totalActivities: 0,
      activeDays: 0,
      topActivities: [],
      categoryBreakdown: [],
      recentTrend: 'stable',
      averagePerDay: 0,
    };
  }

  /**
   * Get recent activities across all users (admin)
   */
  async getRecentActivities(limit = 100): Promise<ActivityEntry[]> {
    try {
      const { data, error } = await supabase
        .from('user_activity_timeline')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error('Failed to get recent activities', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type as ActivityType,
        activityCategory: row.activity_category as ActivityCategory,
        title: row.title,
        description: row.description,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    } catch (error) {
      this.log.error('Recent activities query error', error);
      return [];
    }
  }

  /**
   * Search activities
   */
  async searchActivities(
    query: string,
    options: { userId?: string; limit?: number } = {}
  ): Promise<ActivityEntry[]> {
    try {
      let dbQuery = supabase
        .from('user_activity_timeline')
        .select('*')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(options.limit || 50);

      if (options.userId) {
        dbQuery = dbQuery.eq('user_id', options.userId);
      }

      const { data, error } = await dbQuery;

      if (error) {
        this.log.error('Failed to search activities', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type as ActivityType,
        activityCategory: row.activity_category as ActivityCategory,
        title: row.title,
        description: row.description,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    } catch (error) {
      this.log.error('Activity search error', error);
      return [];
    }
  }
}

// Export singleton instance
export const activityTracker = new ActivityTrackerService();

// Export types
export type { ActivityEntry, TrackOptions, TimelineOptions, ActivitySummary };
