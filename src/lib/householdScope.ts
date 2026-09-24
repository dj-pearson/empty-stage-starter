/**
 * The one list of what a household shares and what stays with each account.
 *
 * The Household page, the invite dialogs and /join all render from here, so the
 * promise a parent reads before inviting someone is the same everywhere. Each
 * entry is an i18n key; the copy lives in
 * src/i18n/locales/app/en.household-scope.json.
 *
 * What backs each shared item:
 * - kids (and their care cards), plan, grocery, pantry, recipes: the core
 *   household RLS, which scopes those tables by household_id through
 *   user_belongs_to_household.
 * - notes: 20260924000000 lets household members read plan_entry_feedback;
 *   writing stays with the author, so each note keeps who wrote it.
 * - collections and aisles: 20260925000006 (household-shared collections and
 *   aisles). Store layouts: 20260925000003 (a family's store is visible to its
 *   household only; seeded chains stay public).
 *
 * If a table's scope changes, change this list in the same PR.
 */
export const SHARED_SCOPE_KEYS = [
  'household.scope.shared.kids',
  'household.scope.shared.plan',
  'household.scope.shared.grocery',
  'household.scope.shared.pantry',
  'household.scope.shared.recipes',
  'household.scope.shared.collections',
  'household.scope.shared.aisles',
  'household.scope.shared.notes',
] as const;

export type SharedScopeKey = (typeof SHARED_SCOPE_KEYS)[number];

export const PRIVATE_SCOPE_KEYS = [
  'household.scope.private.billing',
  'household.scope.private.notifications',
  'household.scope.private.signIn',
] as const;

export type PrivateScopeKey = (typeof PRIVATE_SCOPE_KEYS)[number];

/**
 * Routes this page links to. Typed as literals rather than looked up in
 * NAV_ITEMS at runtime: that import pulled navigation.ts and its icons into a
 * shared chunk. householdScope.test.ts checks each one is still a NAV_ITEMS
 * route, so a renamed route fails CI instead of leaving a dead link.
 */
export const HOUSEHOLD_LINKS = Object.freeze({
  careCards: '/dashboard/kids',
  foodJournal: '/dashboard/food-journal',
  billing: '/dashboard/billing',
});

export type HouseholdLinkKey = keyof typeof HOUSEHOLD_LINKS;
