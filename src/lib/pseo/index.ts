/**
 * pSEO System — Central Exports
 *
 * The programmatic SEO system for EatPal generates ~1,500 pages
 * targeting food chaining, picky eater meal planning, and feeding
 * challenge content across 9 page types and 5 taxonomy dimensions.
 *
 * Architecture:
 * - Types: src/types/pseo.ts (Phase 2-3: schemas and interfaces)
 * - Taxonomy: src/lib/pseo/taxonomy-seed.ts (Phase 1: dimension values)
 * - Prompts: src/lib/pseo/prompts.ts (Phase 4: generation prompts)
 * - Quality: src/lib/pseo/quality.ts (Phase 6D: validation)
 * - Generator: src/lib/pseo/generator.ts (Phase 6A-B: pipeline)
 * - Roadmap: src/lib/pseo/roadmap.ts (Phase 7: launch plan)
 * - Components: src/pages/pseo/ (Phase 5: React pages)
 * - Admin: src/components/admin/pseo/ (Admin coordinator)
 * - Database: supabase/migrations/20260313000000_pseo_pages.sql (Phase 6C)
 */

export {
  SAFE_FOODS,
  AGE_GROUPS,
  FEEDING_CHALLENGES,
  MEAL_OCCASIONS,
  DIETARY_RESTRICTIONS,
  ALL_TAXONOMY_ITEMS,
  COMBINATION_MATRIX,
  getTotalEstimatedPages,
  generateCombinations,
} from './taxonomy-seed';

export {
  validatePageQuality,
  calculateWordCount,
  calculateSimilarity,
} from './quality';

export type {
  QualityCheckResult,
  QualityReport,
} from './quality';

export {
  LAUNCH_ROADMAP,
  FULL_BUILDOUT_ESTIMATE,
  getCurrentRoadmapWeek,
  getCumulativeTarget,
  evaluateRolloutHealth,
} from './roadmap';

export type {
  RoadmapWeek,
  RolloutMetrics,
} from './roadmap';
