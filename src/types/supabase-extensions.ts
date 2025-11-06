/**
 * Extended TypeScript types for Supabase data structures
 *
 * These types extend the auto-generated types from supabase/types.ts
 * to provide better type safety throughout the application.
 */

export interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

export interface SupabaseResponse<T> {
  data: T | null;
  error: SupabaseError | null;
}

// Food-related types
export interface FoodAttempt {
  id: string;
  kid_id: string;
  food_id: string;
  outcome: 'success' | 'partial' | 'refused' | 'disliked';
  attempted_at: string;
  notes?: string;
  parent_notes?: string;
  is_milestone: boolean;
  foods?: {
    id: string;
    name: string;
  };
}

export interface KidAchievement {
  id: string;
  kid_id: string;
  achievement_type: string;
  earned_at: string;
  description?: string;
}

// Subscription types
export interface SubscriptionPlan {
  id: string;
  name: string;
  stripe_price_id: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  is_active: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  trial_end?: string;
  plan?: SubscriptionPlan;
}

// Grocery list types
export interface GroceryItem {
  id: string;
  list_id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  aisle?: string;
  checked: boolean;
  added_from_recipe?: boolean;
  recipe_id?: string;
  notes?: string;
}

export interface GroceryList {
  id: string;
  user_id: string;
  household_id?: string;
  name: string;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// Blog types
export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featured_image_url?: string;
  category_id?: string;
  author_id: string;
  status: 'draft' | 'published' | 'archived';
  published_at?: string;
  seo_title?: string;
  seo_description?: string;
  reading_time_minutes?: number;
  view_count: number;
  category?: BlogCategory;
}

// Notification types
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
}

// Profile types
export interface Profile {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// Analytics types
export interface SEOAuditResult {
  url: string;
  score: number;
  issues: SEOIssue[];
  suggestions: string[];
  timestamp: string;
}

export interface SEOIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  element?: string;
  recommendation: string;
}

// Email types
export interface EmailSubscription {
  id: string;
  user_id: string;
  newsletter: boolean;
  promotional: boolean;
  transactional: boolean;
  created_at: string;
  updated_at: string;
}

// Store layout types
export interface StoreLayout {
  id: string;
  name: string;
  address?: string;
  chain?: string;
  user_id: string;
  household_id?: string;
  is_active: boolean;
}

export interface StoreAisle {
  id: string;
  store_layout_id: string;
  aisle_number?: string;
  aisle_name: string;
  category?: string;
  sort_order: number;
}

// Utility types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface PaginationParams {
  page: number;
  pageSize: number;
  totalCount?: number;
}

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

// Generic API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string | SupabaseError;
  message?: string;
  success: boolean;
}

// Event handler types
export type FormSubmitHandler = (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
export type InputChangeHandler = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
export type SelectChangeHandler = (value: string) => void;
