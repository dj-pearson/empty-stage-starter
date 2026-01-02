/**
 * Schema Markup Components for SEO/GEO Optimization
 *
 * These components implement JSON-LD structured data for:
 * - Traditional search engines (Google, Bing)
 * - AI search platforms (ChatGPT, Perplexity, Claude, Gemini)
 * - Voice assistants (Alexa, Google Assistant, Siri)
 *
 * Usage: Import and add to any page component
 */

export { FAQSchema } from './FAQSchema';
export type { FAQ, FAQSchemaProps } from './FAQSchema';

export { HowToSchema } from './HowToSchema';
export type { HowToStep, HowToSchemaProps } from './HowToSchema';

export { OrganizationSchema } from './OrganizationSchema';

export { SoftwareAppSchema } from './SoftwareAppSchema';
export type { SoftwareAppSchemaProps } from './SoftwareAppSchema';

export { BreadcrumbSchema } from './BreadcrumbSchema';
export type { BreadcrumbItem, BreadcrumbSchemaProps } from './BreadcrumbSchema';

export { ReviewSchema } from './ReviewSchema';
export type { Review, ReviewSchemaProps } from './ReviewSchema';

export { ArticleSchema } from './ArticleSchema';
export type { ArticleSchemaProps } from './ArticleSchema';

export { VideoSchema, formatVideoDuration, validateVideoSchema } from './VideoSchema';
export type { VideoSchemaProps } from './VideoSchema';

export { RecipeSchema, formatRecipeTime, validateRecipeSchema, DIET_TYPES } from './RecipeSchema';
export type {
  RecipeSchemaProps,
  RecipeInstruction,
  RecipeNutrition,
  RecipeRating,
} from './RecipeSchema';
