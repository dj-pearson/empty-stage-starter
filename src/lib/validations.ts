import { z } from 'zod';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const UUIDSchema = z.string().uuid('Invalid UUID format');

export const DateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

export const EmailSchema = z.string().email('Invalid email address').max(255);

/**
 * Strong password validation schema
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const PasswordSchema = z.string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');

/**
 * Weaker password schema for legacy support
 * Use PasswordSchema for new implementations
 * @deprecated
 */
export const LegacyPasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters');

export const URLSchema = z.string().url('Invalid URL format').max(2000);

// ============================================================================
// ENUM SCHEMAS
// ============================================================================

export const FoodCategorySchema = z.enum([
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack'
]);

export const MealSlotSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack1',
  'snack2',
  'try_bite'
]);

export const MealResultSchema = z.enum(['ate', 'tasted', 'refused']).nullable();

export const FoodAttemptStageSchema = z.enum([
  'looking',
  'touching',
  'smelling',
  'licking',
  'tiny_taste',
  'small_bite',
  'full_bite',
  'full_portion'
]);

export const FoodAttemptOutcomeSchema = z.enum([
  'success',
  'partial',
  'refused',
  'tantrum'
]);

export const MoodSchema = z.enum(['happy', 'neutral', 'anxious', 'resistant']);

export const AmountConsumedSchema = z.enum(['none', 'quarter', 'half', 'most', 'all']);

// ============================================================================
// FOOD SCHEMAS
// ============================================================================

export const FoodSchema = z.object({
  name: z.string()
    .min(1, 'Food name is required')
    .max(100, 'Food name too long')
    .trim(),
  category: FoodCategorySchema,
  is_safe: z.boolean(),
  is_try_bite: z.boolean(),
  allergens: z.array(z.string().max(50)).max(10).optional(),
  aisle: z.string().max(50).optional(),
  quantity: z.number().int().min(0).max(9999).optional(),
  unit: z.string().max(20).optional(),
  servings_per_container: z.number().positive().max(1000).optional(),
  package_quantity: z.string().max(50).optional(),
});

export const FoodUpdateSchema = FoodSchema.partial();

export const BulkFoodImportSchema = z.array(FoodSchema).max(100, 'Maximum 100 foods at once');

// ============================================================================
// KID SCHEMAS
// ============================================================================

export const KidSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .trim(),
  age: z.number().int().min(0).max(18).optional(),
  date_of_birth: DateStringSchema.optional(),
  notes: z.string().max(1000).optional(),
  allergens: z.array(z.string().max(50)).max(20).optional(),
  profile_picture_url: URLSchema.optional(),
  favorite_foods: z.array(z.string().max(100)).max(50).optional(),
  pickiness_level: z.enum(['not_picky', 'somewhat_picky', 'very_picky', 'extremely_picky']).optional(),
  profile_completed: z.boolean().optional(),
  texture_preferences: z.array(z.string().max(50)).max(20).optional(),
  texture_dislikes: z.array(z.string().max(50)).max(20).optional(),
  flavor_preferences: z.array(z.string().max(50)).max(20).optional(),
  dietary_restrictions: z.array(z.string().max(50)).max(20).optional(),
  health_goals: z.array(z.string().max(100)).max(10).optional(),
  disliked_foods: z.array(z.string().max(100)).max(50).optional(),
  always_eats_foods: z.array(z.string().max(100)).max(50).optional(),
});

export const KidUpdateSchema = KidSchema.partial();

// ============================================================================
// RECIPE SCHEMAS
// ============================================================================

export const RecipeSchema = z.object({
  name: z.string()
    .min(1, 'Recipe name is required')
    .max(200, 'Recipe name too long')
    .trim(),
  description: z.string().max(1000).optional(),
  food_ids: z.array(UUIDSchema)
    .min(1, 'Recipe must have at least one food')
    .max(20, 'Maximum 20 foods per recipe'),
  category: FoodCategorySchema.optional(),
  instructions: z.string().max(5000).optional(),
  prepTime: z.string().max(50).optional(),
  cookTime: z.string().max(50).optional(),
  servings: z.string().max(50).optional(),
  additionalIngredients: z.string().max(500).optional(),
  tips: z.string().max(1000).optional(),
});

export const RecipeUpdateSchema = RecipeSchema.partial();

// ============================================================================
// PLAN ENTRY SCHEMAS
// ============================================================================

export const PlanEntrySchema = z.object({
  kid_id: UUIDSchema,
  date: DateStringSchema,
  meal_slot: MealSlotSchema,
  food_id: UUIDSchema,
  result: MealResultSchema.optional(),
  notes: z.string().max(500).optional(),
  recipe_id: UUIDSchema.optional(),
  is_primary_dish: z.boolean().optional(),
});

export const PlanEntryUpdateSchema = PlanEntrySchema.partial().extend({
  result: MealResultSchema,
});

export const BulkPlanEntrySchema = z.array(PlanEntrySchema.omit({ result: true }))
  .max(50, 'Maximum 50 entries at once');

// ============================================================================
// FOOD ATTEMPT SCHEMAS
// ============================================================================

export const FoodAttemptSchema = z.object({
  kid_id: UUIDSchema,
  food_id: UUIDSchema,
  attempted_at: z.string().datetime().optional(),
  stage: FoodAttemptStageSchema.optional(),
  outcome: FoodAttemptOutcomeSchema,
  bites_taken: z.number().int().min(0).max(100).optional(),
  amount_consumed: AmountConsumedSchema.optional(),
  meal_slot: MealSlotSchema.optional(),
  preparation_method: z.string().max(100).optional(),
  presentation_notes: z.string().max(500).optional(),
  mood_before: MoodSchema.optional(),
  mood_after: MoodSchema.optional(),
  reaction_notes: z.string().max(1000).optional(),
  parent_notes: z.string().max(1000).optional(),
  strategies_used: z.array(z.string().max(50)).max(10).optional(),
  is_milestone: z.boolean().optional(),
  plan_entry_id: UUIDSchema.optional(),
});

export const FoodAttemptUpdateSchema = FoodAttemptSchema.partial();

// ============================================================================
// GROCERY ITEM SCHEMAS
// ============================================================================

export const GroceryItemSchema = z.object({
  name: z.string()
    .min(1, 'Item name is required')
    .max(100, 'Item name too long')
    .trim(),
  quantity: z.number().int().min(1).max(999),
  unit: z.string().max(20),
  category: FoodCategorySchema,
  aisle: z.string().max(50).optional(),
  checked: z.boolean().optional(),
  auto_generated: z.boolean().optional(),
  restock_reason: z.string().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

export const GroceryItemUpdateSchema = GroceryItemSchema.partial();

// ============================================================================
// AI REQUEST SCHEMAS
// ============================================================================

export const AIMealPlanRequestSchema = z.object({
  kid_id: UUIDSchema,
  start_date: DateStringSchema,
  days: z.number().int().min(1).max(14),
  preferences: z.object({
    include_try_bites: z.boolean().optional(),
    balance_nutrition: z.boolean().optional(),
    variety_level: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
});

export const AIRecipeSuggestionRequestSchema = z.object({
  pantryFoods: z.array(z.object({
    id: UUIDSchema,
    name: z.string(),
    category: FoodCategorySchema,
    quantity: z.number().optional(),
  })).min(1, 'At least one pantry food required'),
  childProfile: z.object({
    age: z.number().optional(),
    allergens: z.array(z.string()).optional(),
    pickiness_level: z.string().optional(),
    texture_preferences: z.array(z.string()).optional(),
    flavor_preferences: z.array(z.string()).optional(),
    always_eats_foods: z.array(z.string()).optional(),
    disliked_foods: z.array(z.string()).optional(),
  }).optional(),
  count: z.number().int().min(1).max(10).optional(),
});

export const AICoachMessageSchema = z.object({
  conversation_id: UUIDSchema.optional(),
  message: z.string()
    .min(1, 'Message is required')
    .max(2000, 'Message too long'),
  context: z.object({
    kid_id: UUIDSchema.optional(),
    recent_meals: z.array(z.any()).optional(),
  }).optional(),
});

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export const UserRoleSchema = z.object({
  user_id: UUIDSchema,
  role: z.enum(['admin', 'moderator', 'user']),
});

export const SubscriptionSchema = z.object({
  user_id: UUIDSchema,
  tier: z.enum(['free', 'premium', 'enterprise']),
  expires_at: z.string().datetime().optional(),
});

export const RateLimitConfigSchema = z.object({
  endpoint: z.string().min(1).max(100),
  free_tier_limit: z.number().int().min(0).max(10000),
  premium_tier_limit: z.number().int().min(0).max(50000),
  enterprise_tier_limit: z.number().int().min(0).max(1000000),
  window_minutes: z.number().int().min(1).max(1440),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate data against a schema and return typed result
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
  return { success: false, errors };
}

/**
 * Validate data and throw error if invalid
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Comprehensive HTML sanitization to prevent XSS attacks
 * Removes all HTML tags, scripts, and dangerous attributes
 *
 * For rich text content, consider using a library like DOMPurify
 * This is a basic sanitizer for simple text inputs
 */
export function sanitizeHTML(html: string): string {
  if (typeof html !== 'string') return '';

  // Use DOM API to escape HTML entities
  const div = document.createElement('div');
  div.textContent = html;
  let sanitized = div.innerHTML;

  // Additional XSS prevention patterns
  sanitized = sanitized
    // Remove any remaining script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (onclick, onerror, etc.)
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Remove data: protocol (can be used for XSS)
    .replace(/data:text\/html/gi, '')
    // Remove vbscript: protocol
    .replace(/vbscript:/gi, '')
    // Remove any HTML comments that might contain code
    .replace(/<!--[\s\S]*?-->/g, '');

  return sanitized;
}

/**
 * Sanitize user input for general text fields
 * Prevents XSS, SQL injection patterns, and command injection
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove dangerous protocols
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/vbscript:/gi, '')
    // Remove SQL injection patterns (basic)
    .replace(/('|(--)|;|\/\*|\*\/|xp_|sp_|exec|execute|select|insert|update|delete|drop|create|alter|union)/gi, (match) => {
      // Only remove if it looks like SQL syntax, not regular words
      return match.match(/^(--|;|\/\*|\*\/|xp_|sp_)/) ? '' : match;
    })
    // Remove null bytes
    .replace(/\0/g, '')
    // Limit length to prevent DoS
    .slice(0, 10000);
}

/**
 * Sanitize filename to prevent directory traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';

  return filename
    .trim()
    // Remove path traversal attempts
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove special characters that could cause issues
    .replace(/[<>:"|?*]/g, '')
    // Limit length
    .slice(0, 255);
}

/**
 * Sanitize URL to prevent open redirect attacks
 * Only allows http, https, and relative URLs
 */
export function sanitizeURL(url: string): string {
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Allow relative URLs
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  // Allow only http and https protocols
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Invalid URL, return empty string
    return '';
  }

  return '';
}

/**
 * Sanitize email to prevent header injection
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return '';

  return email
    .trim()
    .toLowerCase()
    // Remove newlines that could be used for header injection
    .replace(/[\r\n]/g, '')
    // Basic email format validation
    .replace(/[^a-z0-9@._+-]/g, '')
    .slice(0, 255);
}
