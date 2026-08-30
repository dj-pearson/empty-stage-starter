/**
 * Blog posts that were published more than once, and which surviving URL each one
 * folds into.
 *
 * A generator wrote the same brief repeatedly and saved each attempt under the next
 * free slug, so the tree carries `feeding-kids-on-a-schedule-what-actually-works`
 * through `-5`, `turning-snack-time-into-nutrition-time-for-picky-eaters` through `-6`,
 * and thirteen more families like them. Google splits the ranking signal across every
 * copy and none of them win: the five scheduling posts hold 144 impressions and one
 * click between them, and the four snack-time posts have never had a click at all.
 *
 * The worst case is the one that costs money. `meal-planning-apps-for-picky-eaters-what-parents-need`
 * is the best commercial article on the site at 35 clicks and position 7.13, and a
 * second copy of it was bleeding 151 impressions off that URL.
 *
 * Only numeric-suffix duplicates are listed, and only where the un-suffixed slug also
 * exists. That rule is deliberately narrow: it is true by construction rather than by
 * judgement, so nothing here retires a post that merely covers a similar topic. Pairs
 * that need a human to compare the prose, notably
 * `simple-dinners-built-around-your-childs-safe-foods` against the `-your-kids-`
 * spelling, and the four `meal-planning-apps-for-picky-eaters-*-arfid-families`
 * variants, are left alone.
 *
 * The survivor is whichever URL earns the most clicks, then impressions, from the 16
 * months of Search Console data ending 2026-08-29. That is sometimes the `-2` rather
 * than the base: `feeding-kids-on-a-schedule-what-actually-works-2` has a click and 63
 * impressions where the base has none and 54, so the base folds into it. Redirecting
 * the URL that ranks into the one that does not would throw away the only signal these
 * clusters have.
 *
 * Three things must agree, or the site submits URLs it also redirects:
 *
 *   1. public/_redirects                             - serves the 301
 *   2. supabase/functions/generate-sitemap/index.ts  - must not submit a retired slug
 *   3. scripts/prerender.mjs                         - must not write static HTML for
 *      one, because a static file at that path can shadow the redirect
 *
 * src/lib/retired-blog-slugs.test.ts fails the build when they drift apart.
 *
 * Retiring a URL here does NOT unpublish the row in blog_posts. The redirect is what
 * users and crawlers see; the row stays so the content is recoverable. Deleting the
 * rows is a separate, later decision.
 */

/** Retired slug -> the slug it folds into. Keys and values are bare slugs, no /blog/ prefix. */
export const RETIRED_BLOG_SLUGS: Readonly<Record<string, string>> = Object.freeze({
  "build-a-picky-eater-grocery-list-that-actually-works-2":
    "build-a-picky-eater-grocery-list-that-actually-works",

  "building-a-positive-food-relationship-from-the-start-2":
    "building-a-positive-food-relationship-from-the-start",

  "feeding-kids-on-a-schedule-what-actually-works":
    "feeding-kids-on-a-schedule-what-actually-works-2",
  "feeding-kids-on-a-schedule-what-actually-works-3":
    "feeding-kids-on-a-schedule-what-actually-works-2",
  "feeding-kids-on-a-schedule-what-actually-works-4":
    "feeding-kids-on-a-schedule-what-actually-works-2",
  "feeding-kids-on-a-schedule-what-actually-works-5":
    "feeding-kids-on-a-schedule-what-actually-works-2",

  "food-burnout-in-kids-what-it-is-and-how-to-reset-2":
    "food-burnout-in-kids-what-it-is-and-how-to-reset",
  "food-burnout-in-kids-what-it-is-and-how-to-reset-3":
    "food-burnout-in-kids-what-it-is-and-how-to-reset",
  "food-burnout-in-kids-what-it-is-and-how-to-reset-4":
    "food-burnout-in-kids-what-it-is-and-how-to-reset",

  "grocery-shopping-with-kids-who-have-arfid-or-extreme-picky-eating":
    "grocery-shopping-with-kids-who-have-arfid-or-extreme-picky-eating-2",
  "grocery-shopping-with-kids-who-have-arfid-or-extreme-picky-eating-3":
    "grocery-shopping-with-kids-who-have-arfid-or-extreme-picky-eating-2",

  "how-to-add-variety-without-adding-stress-to-mealtimes-2":
    "how-to-add-variety-without-adding-stress-to-mealtimes",

  "kitchen-tools-that-actually-work-for-picky-eaters-2":
    "kitchen-tools-that-actually-work-for-picky-eaters",

  "meal-planning-apps-for-picky-eaters-what-parents-need-2":
    "meal-planning-apps-for-picky-eaters-what-parents-need",

  "new-year-mealtime-goals-that-actually-work-for-arfid-families":
    "new-year-mealtime-goals-that-actually-work-for-arfid-families-2",

  "nutrition-for-kids-who-refuse-veggies-a-real-guide":
    "nutrition-for-kids-who-refuse-veggies-a-real-guide-2",
  "nutrition-for-kids-who-refuse-veggies-a-real-guide-3":
    "nutrition-for-kids-who-refuse-veggies-a-real-guide-2",

  "simple-dinners-built-around-your-childs-safe-foods":
    "simple-dinners-built-around-your-childs-safe-foods-2",

  "simple-dinners-built-around-your-kids-safe-foods-2":
    "simple-dinners-built-around-your-kids-safe-foods",
  "simple-dinners-built-around-your-kids-safe-foods-3":
    "simple-dinners-built-around-your-kids-safe-foods",

  "the-best-lunch-combos-for-picky-eaters-that-actually-work-2":
    "the-best-lunch-combos-for-picky-eaters-that-actually-work",

  "tiny-mealtime-changes-that-make-a-big-difference":
    "tiny-mealtime-changes-that-make-a-big-difference-2",
  "tiny-mealtime-changes-that-make-a-big-difference-3":
    "tiny-mealtime-changes-that-make-a-big-difference-2",

  "turning-snack-time-into-nutrition-time-for-picky-eaters":
    "turning-snack-time-into-nutrition-time-for-picky-eaters-3",
  "turning-snack-time-into-nutrition-time-for-picky-eaters-2":
    "turning-snack-time-into-nutrition-time-for-picky-eaters-3",
  "turning-snack-time-into-nutrition-time-for-picky-eaters-4":
    "turning-snack-time-into-nutrition-time-for-picky-eaters-3",
  "turning-snack-time-into-nutrition-time-for-picky-eaters-5":
    "turning-snack-time-into-nutrition-time-for-picky-eaters-3",
  "turning-snack-time-into-nutrition-time-for-picky-eaters-6":
    "turning-snack-time-into-nutrition-time-for-picky-eaters-3",

  "why-meal-planning-apps-reduce-mealtime-stress-for-arfid-families-2":
    "why-meal-planning-apps-reduce-mealtime-stress-for-arfid-families",
});

/** True when this blog slug has been folded into another URL. */
export function isRetiredBlogSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(RETIRED_BLOG_SLUGS, slug);
}
