-- ============================================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- ============================================================================
-- Strategic indexes to improve query performance across the platform

-- ============================================================================
-- ENABLE TRIGRAM EXTENSION (for fuzzy text search)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- PLAN ENTRIES INDEXES
-- ============================================================================

-- Most common query: Get plan entries for a kid within a date range
CREATE INDEX IF NOT EXISTS idx_plan_entries_kid_date_desc
  ON plan_entries(kid_id, date DESC)
  WHERE result IS NOT NULL;

-- Query: Get entries by user (for multi-kid households)
CREATE INDEX IF NOT EXISTS idx_plan_entries_user_date
  ON plan_entries(user_id, date DESC);

-- Query: Find entries by recipe
CREATE INDEX IF NOT EXISTS idx_plan_entries_recipe
  ON plan_entries(recipe_id)
  WHERE recipe_id IS NOT NULL;

-- Query: Find entries with detailed tracking
CREATE INDEX IF NOT EXISTS idx_plan_entries_with_attempts
  ON plan_entries(kid_id, food_attempt_id)
  WHERE food_attempt_id IS NOT NULL;

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_plan_entries_analytics
  ON plan_entries(kid_id, date, meal_slot, result);

-- ============================================================================
-- FOOD ATTEMPTS INDEXES
-- ============================================================================

-- Most common query: Get attempts for a kid
CREATE INDEX IF NOT EXISTS idx_food_attempts_kid_date_desc
  ON food_attempts(kid_id, attempted_at DESC);

-- Query: Find attempts by food
CREATE INDEX IF NOT EXISTS idx_food_attempts_food
  ON food_attempts(food_id);

-- Query: Success tracking
CREATE INDEX IF NOT EXISTS idx_food_attempts_outcome
  ON food_attempts(kid_id, outcome, attempted_at DESC)
  WHERE outcome IN ('success', 'partial');

-- Query: Find milestones
CREATE INDEX IF NOT EXISTS idx_food_attempts_milestones
  ON food_attempts(kid_id, attempted_at DESC)
  WHERE is_milestone = true;

-- Query: Food chaining analysis
CREATE INDEX IF NOT EXISTS idx_food_attempts_stage_progression
  ON food_attempts(kid_id, food_id, attempted_at DESC);

-- ============================================================================
-- FOODS INDEXES
-- ============================================================================

-- Most common query: Get user's safe foods by category
CREATE INDEX IF NOT EXISTS idx_foods_user_safe_category
  ON foods(user_id, category, name)
  WHERE is_safe = true;

-- Query: Try bites
CREATE INDEX IF NOT EXISTS idx_foods_try_bites
  ON foods(user_id, name)
  WHERE is_try_bite = true;

-- Query: Foods with inventory
CREATE INDEX IF NOT EXISTS idx_foods_inventory
  ON foods(user_id, quantity DESC NULLS LAST)
  WHERE quantity IS NOT NULL;

-- Full-text search on food names
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
  ON foods USING gin(name gin_trgm_ops);

-- ============================================================================
-- GROCERY ITEMS INDEXES
-- ============================================================================

-- Most common query: Get unchecked items for user
CREATE INDEX IF NOT EXISTS idx_grocery_unchecked
  ON grocery_items(user_id, created_at DESC)
  WHERE checked = false;

-- Query: Auto-generated restock items
CREATE INDEX IF NOT EXISTS idx_grocery_auto_generated
  ON grocery_items(user_id, priority, created_at DESC)
  WHERE auto_generated = true;

-- Query: Items by aisle (for shopping)
CREATE INDEX IF NOT EXISTS idx_grocery_aisle
  ON grocery_items(user_id, aisle, category)
  WHERE checked = false AND aisle IS NOT NULL;

-- ============================================================================
-- RECIPES INDEXES
-- ============================================================================

-- Query: User's recipes by category
CREATE INDEX IF NOT EXISTS idx_recipes_user_category
  ON recipes(user_id, category NULLS LAST, created_at DESC);

-- Query: Recipes containing specific food
CREATE INDEX IF NOT EXISTS idx_recipes_food_ids
  ON recipes USING gin(food_ids);

-- Full-text search on recipe names
CREATE INDEX IF NOT EXISTS idx_recipes_name_trgm
  ON recipes USING gin(name gin_trgm_ops);

-- ============================================================================
-- KIDS INDEXES
-- ============================================================================

-- Query: User's kids
CREATE INDEX IF NOT EXISTS idx_kids_user_created
  ON kids(user_id, created_at ASC);

-- ============================================================================
-- AI COACH INDEXES
-- ============================================================================

-- Query: User's conversations
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_date
  ON ai_coach_conversations(user_id, updated_at DESC)
  WHERE is_archived = false;

-- Query: Messages in conversation
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_date
  ON ai_coach_messages(conversation_id, created_at ASC);

-- ============================================================================
-- FOOD PROPERTIES INDEXES (for chaining)
-- ============================================================================

-- Query: Find similar foods by properties
CREATE INDEX IF NOT EXISTS idx_food_properties_texture
  ON food_properties(texture_primary, food_category);

CREATE INDEX IF NOT EXISTS idx_food_properties_category
  ON food_properties(food_category, flavor_intensity);

-- ============================================================================
-- FOOD CHAIN SUGGESTIONS INDEXES
-- ============================================================================

-- Query: Get suggestions for a food
CREATE INDEX IF NOT EXISTS idx_food_chain_source_score
  ON food_chain_suggestions(source_food_id, similarity_score DESC, recommended_order ASC);

-- ============================================================================
-- MEAL BUILDER INDEXES
-- ============================================================================

-- Query: Kid's meal creations
CREATE INDEX IF NOT EXISTS idx_meal_creations_kid_date
  ON kid_meal_creations(kid_id, created_at DESC);

-- Query: Most requested meals
CREATE INDEX IF NOT EXISTS idx_meal_creations_popular
  ON kid_meal_creations(kid_id, times_requested DESC, kid_approved)
  WHERE kid_approved = true;

-- ============================================================================
-- ACHIEVEMENTS INDEXES
-- ============================================================================

-- Query: Kid's recent achievements
CREATE INDEX IF NOT EXISTS idx_achievements_kid_date
  ON kid_achievements(kid_id, earned_at DESC);

-- ============================================================================
-- USER MANAGEMENT INDEXES
-- ============================================================================

-- Query: Find users by role
CREATE INDEX IF NOT EXISTS idx_user_roles_role
  ON user_roles(role, user_id);

-- Note: Subscription-related indexes commented out until subscription columns are added to profiles table
-- -- Query: Find user's subscription
-- CREATE INDEX IF NOT EXISTS idx_profiles_subscription
--   ON profiles(subscription_tier, subscription_status)
--   WHERE subscription_tier IS NOT NULL;

-- ============================================================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================================================

-- Note: Subscription index commented out until subscription columns are added to profiles table
-- -- Active subscriptions only
-- CREATE INDEX IF NOT EXISTS idx_profiles_active_subscription
--   ON profiles(id, subscription_tier)
--   WHERE subscription_status = 'active';

-- Recent plan entries (last 90 days)
CREATE INDEX IF NOT EXISTS idx_plan_entries_recent
  ON plan_entries(kid_id, date DESC, result);

-- Recent food attempts (last 90 days)
CREATE INDEX IF NOT EXISTS idx_food_attempts_recent
  ON food_attempts(kid_id, attempted_at DESC, outcome);

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

-- Update table statistics for query planner
ANALYZE plan_entries;
ANALYZE food_attempts;
ANALYZE foods;
ANALYZE grocery_items;
ANALYZE recipes;
ANALYZE kids;
ANALYZE ai_coach_conversations;
ANALYZE ai_coach_messages;
ANALYZE food_properties;
ANALYZE food_chain_suggestions;
ANALYZE kid_meal_creations;
ANALYZE kid_achievements;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_plan_entries_kid_date_desc IS 'Optimizes queries for kid meal plans by date';
COMMENT ON INDEX idx_food_attempts_outcome IS 'Optimizes success rate analytics queries';
COMMENT ON INDEX idx_foods_user_safe_category IS 'Optimizes pantry browsing by category';
COMMENT ON INDEX idx_grocery_unchecked IS 'Optimizes grocery list display';
COMMENT ON INDEX idx_recipes_food_ids IS 'Optimizes recipe search by ingredients';
