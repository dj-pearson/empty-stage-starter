-- Performance indexes for frequently queried columns.
-- Uses CREATE INDEX IF NOT EXISTS for idempotency.

-- Meal plan lookups: queried by kid + date range
CREATE INDEX IF NOT EXISTS idx_plan_entries_kid_date
  ON public.plan_entries (kid_id, date);

-- Grocery list filtering: queried by household + checked status
CREATE INDEX IF NOT EXISTS idx_grocery_items_household_checked
  ON public.grocery_items (household_id, checked);

-- Food browsing: queried by user + category
CREATE INDEX IF NOT EXISTS idx_foods_user_category
  ON public.foods (user_id, category);

-- Recipe listing: queried by user + created_at for sorting
CREATE INDEX IF NOT EXISTS idx_recipes_user_created
  ON public.recipes (user_id, created_at);

-- Subscription checks: queried by user + status
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status
  ON public.user_subscriptions (user_id, status);

-- Audit log queries: queried by user + created_at
CREATE INDEX IF NOT EXISTS idx_login_history_user_created
  ON public.login_history (user_id, created_at);
