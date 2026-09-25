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

/**
 * The four pickiness levels a kid can be tagged with. The intake used to
 * compute 'adventurous' and 'extreme', which this enum rejected, so every
 * intake save failed validation. Derive from this list instead of retyping it.
 */
export const PICKINESS_LEVELS = ['not_picky', 'somewhat_picky', 'very_picky', 'extremely_picky'] as const;
export type PickinessLevel = (typeof PICKINESS_LEVELS)[number];

export const AllergenSeveritySchema = z.enum(['mild', 'moderate', 'severe']);

// Optional fields that map onto a nullable column are .nullable() as well:
// sending null is how an editor clears one (undefined is dropped from the
// PATCH body and leaves the old value in place).
export const KidSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .trim(),
  age: z.number().int().min(0).max(18).optional(),
  date_of_birth: DateStringSchema.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  allergens: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  allergen_severity: z.record(z.string().max(50), AllergenSeveritySchema).optional(),
  cross_contamination_sensitive: z.boolean().optional(),
  profile_picture_url: URLSchema.nullable().optional(),
  favorite_foods: z.array(z.string().max(100)).max(50).optional(),
  // kids.pickiness_level (item 25). The web only ever writes a computed level,
  // so the enum holds here; the column itself is free text because iOS
  // builds send their own picker labels.
  pickiness_level: z.enum(PICKINESS_LEVELS).nullable().optional(),
  // Free text, not an enum: the intake resends a loaded value unchanged, and
  // a row an iOS build wrote may hold a label the web never offers.
  texture_sensitivity_level: z.string().max(50).nullable().optional(),
  preferred_preparations: z.array(z.string().max(100)).max(50).optional(),
  profile_completed: z.boolean().optional(),
  texture_preferences: z.array(z.string().max(50)).max(20).optional(),
  texture_dislikes: z.array(z.string().max(50)).max(20).optional(),
  flavor_preferences: z.array(z.string().max(50)).max(20).optional(),
  dietary_restrictions: z.array(z.string().max(50)).max(20).optional(),
  health_goals: z.array(z.string().max(100)).max(10).optional(),
  nutrition_concerns: z.array(z.string().max(100)).max(20).optional(),
  disliked_foods: z.array(z.string().max(100)).max(50).optional(),
  always_eats_foods: z.array(z.string().max(100)).max(50).optional(),
  eating_behavior: z.string().max(50).nullable().optional(),
  new_food_willingness: z.string().max(50).nullable().optional(),
  behavioral_notes: z.string().max(1000).nullable().optional(),
  // Health metrics with reasonable ranges for children (ages 0-18)
  height_cm: z.number()
    .min(40, 'Height must be at least 40cm (newborn)')
    .max(220, 'Height must not exceed 220cm')
    .nullable()
    .optional(),
  weight_kg: z.number()
    .min(1, 'Weight must be at least 1kg')
    .max(200, 'Weight must not exceed 200kg')
    .nullable()
    .optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
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
// DATA IMPORT/EXPORT SCHEMAS
// ============================================================================

/**
 * Schema for validating imported backup JSON files
 * Used when importing data from exported JSON backups
 */
export const BackupDataSchema = z.object({
  foods: z.array(z.any()).max(1000, 'Too many foods (max 1000)').optional(),
  kids: z.array(z.any()).max(50, 'Too many kids (max 50)').optional(),
  recipes: z.array(z.any()).max(500, 'Too many recipes (max 500)').optional(),
  planEntries: z.array(z.any()).max(5000, 'Too many plan entries (max 5000)').optional(),
  groceryItems: z.array(z.any()).max(500, 'Too many grocery items (max 500)').optional(),
  activeKidId: z.string().uuid().nullable().optional(),
}).strict(); // Reject unknown properties

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
 * Make untrusted text safe to place in HTML, as text or in a quoted attribute.
 *
 * Every HTML-significant character is escaped, so no tag, attribute, comment
 * or handler can survive, whatever the input spells. This used to escape with
 * the DOM and then run a list of regexes over the result (script tags, on*=,
 * javascript:, comments). Those were dead on escaped text, and on their own
 * they were incomplete: a nested '<scr<script>ipt>' or an unquoted handler got
 * through. A URL is a different job: use sanitizeURL, which allows http(s) only.
 *
 * For rich text that must keep some markup, use DOMPurify instead.
 */
export function sanitizeHTML(html: string): string {
  if (typeof html !== 'string') return '';
  return html.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Drop every complete "<...>" run from a string, then any angle bracket left.
 *
 * An index scan rather than a regex replace: removing a pattern once can join
 * two halves into a new match ('<scr<script>ipt>'), while this never emits a
 * '<' or '>' at all, so the result cannot open a tag. A '<' with no closing
 * '>' is dropped on its own, so "x < 5" keeps its text.
 */
function stripTags(input: string): string {
  let out = '';
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '<') {
      const close = input.indexOf('>', i + 1);
      i = close === -1 ? i + 1 : close + 1;
    } else {
      if (ch !== '>') out += ch;
      i += 1;
    }
  }
  return out;
}

/**
 * Sanitize user input for general plain-text fields.
 *
 * The result holds no '<' or '>' (so no element, attribute or event handler
 * can form in it), no SQL comment or statement separators, and no null bytes,
 * and is capped at 10,000 characters. It is still text: render it through
 * React or escapeHtml, and never use it as a URL (that is sanitizeURL's job).
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';

  return stripTags(input.trim())
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
