/**
 * Content for the /compare pages (US-646).
 *
 * `comparisonTargets` in src/lib/geo-monitoring.ts has named five comparison
 * pages by slug since the GEO monitoring work landed, and ComparisonSchema has
 * been built and tested the whole time. Neither was ever reachable: there was no
 * route. This module is the missing middle -- it expands each target into the
 * page body, keyed off the same list so the two cannot drift.
 *
 * Rules this file follows, and any new entry has to follow:
 *
 * 1. No invented facts about a competitor. Every claim is either checkable on
 *    that product's own marketing pages or is a category-level statement about
 *    what kind of tool it is. This repo has already had to strip invented author
 *    credentials (see the comment block in src/pages/Authors.tsx) and an
 *    invented aggregateRating; a fabricated competitor feature gap is the same
 *    mistake pointed at someone else.
 * 2. No competitor pricing. It changes often enough that a page stating it is
 *    wrong within a quarter, and a wrong price on a comparison page is the kind
 *    of error that gets screenshotted. Every page links out instead.
 * 3. Every page names at least one thing the competitor genuinely does better.
 *    A table EatPal sweeps is not a comparison, it is an ad, and readers who
 *    have used the other product stop believing the rest of the page.
 *
 * There is a test enforcing 3 mechanically: src/lib/comparison-content.test.ts.
 */

import { comparisonTargets } from '@/lib/geo-monitoring';

export interface ComparisonRow {
  /** What is being compared, e.g. "Who it is built for". */
  dimension: string;
  eatpal: string;
  competitor: string;
  /**
   * True when the competitor is the better answer on this row. At least one row
   * per page must set it -- see rule 3 above.
   */
  competitorWins?: boolean;
}

export interface ComparisonContent {
  slug: string;
  competitor: string;
  /** Page <h1>, from comparisonTargets.comparisonTitle. */
  title: string;
  /** One line, used on the /compare index and in the meta description. */
  differentiator: string;
  /** What the competitor actually is, in the reader's terms. */
  competitorSummary: string;
  competitorUrl?: string;
  rows: ComparisonRow[];
  /** Honest reasons to walk away from EatPal and use the other thing. */
  chooseThemIf: string[];
  chooseEatPalIf: string[];
  verdict: string;
}

const EATPAL_FEATURES = [
  'Food chaining',
  'Try bite tracking',
  'Safe food library',
  'Multi-child profiles',
  'Grocery list generation',
];

const CONTENT: Record<
  string,
  Omit<ComparisonContent, 'slug' | 'competitor' | 'title' | 'differentiator'>
> = {
  'eatpal-vs-mealime': {
    competitorSummary:
      'Mealime is a weeknight meal planning app for households. You pick recipes, it builds the week and turns it into a grocery list, with filters for diets and allergies.',
    competitorUrl: 'https://www.mealime.com',
    rows: [
      {
        dimension: 'Who it is built for',
        eatpal:
          'Parents of children with ARFID, autism-related feeding differences, or extreme picky eating',
        competitor: 'Households cooking for adults who eat a normal range of food',
      },
      {
        dimension: 'How the plan is built',
        eatpal:
          "Around a child's accepted foods, adding one try bite at a time using food chaining, the feeding-therapy method that changes a single attribute per step",
        competitor: 'Around recipes you choose from a curated library',
      },
      {
        dimension: 'Recipe library',
        eatpal: 'Smaller, weighted toward simple foods a selective eater will accept',
        competitor: 'Large curated library with photography and step-by-step cooking mode',
        competitorWins: true,
      },
      {
        dimension: 'Tracking what a child accepted',
        eatpal:
          'Every try bite is logged as eaten, tasted or refused, and the next suggestion adapts',
        competitor: 'No exposure or acceptance tracking',
      },
      {
        dimension: 'Several children with different diets',
        eatpal: 'Separate profiles with their own safe foods, allergens and goals',
        competitor: 'One household plan with shared dietary filters',
      },
      {
        dimension: 'Grocery lists',
        eatpal: 'Generated from the plan, with hand-off to grocery delivery services',
        competitor: 'Generated from the plan, with grocery delivery integrations',
      },
    ],
    chooseThemIf: [
      'You are planning meals for adults, or for kids who already eat a reasonable range of food.',
      "You want a big library of tested weeknight recipes with a proper guided cooking mode. This is Mealime's strength and EatPal does not try to match it.",
      'Nobody in the house has a feeding issue you are actively working on.',
    ],
    chooseEatPalIf: [
      'Your child eats a short list of foods and you need that list to get longer.',
      'You want each new food logged and the next suggestion chosen from what actually went down.',
      'You are managing more than one child with different safe foods.',
    ],
    verdict:
      'These are not the same category of tool. Mealime answers what should we cook this week. EatPal answers how do I get this child to eat something new without a fight. If picky eating is a phase you are waiting out, Mealime is the lighter choice.',
  },

  'eatpal-vs-yummly': {
    competitorSummary:
      'Yummly is a recipe discovery engine. It searches a very large recipe index, learns what you like, and filters on diet, allergy and ingredient.',
    competitorUrl: 'https://www.yummly.com',
    rows: [
      {
        dimension: 'Core job',
        eatpal: 'Expand what one child will eat',
        competitor: 'Help you find a recipe you will want to cook',
      },
      {
        dimension: 'Breadth of recipes',
        eatpal: 'Focused set built around simple, low-sensory-load foods',
        competitor: "Very large index spanning most of the web's recipe publishers",
        competitorWins: true,
      },
      {
        dimension: 'Personalization signal',
        eatpal: "A child's logged acceptances and refusals",
        competitor: 'Your taste preferences and saved recipes',
      },
      {
        dimension: 'Feeding-therapy method',
        eatpal: 'Food chaining and graded exposure are the product',
        competitor: 'Not a goal of the product',
      },
      {
        dimension: 'Sensory detail on foods',
        eatpal: 'Taste, texture, temperature and appearance recorded per food',
        competitor: 'Ingredient and dietary tags',
      },
      {
        dimension: 'Progress over time',
        eatpal: 'Acceptance trends and diet expansion charted per child',
        competitor: 'Saved recipes and cooking history',
      },
    ],
    chooseThemIf: [
      "You want to browse and discover recipes. Yummly's index and its recommendation quality are far ahead of anything EatPal offers here, and that is the whole point of the product.",
      'You are cooking for yourself or for adults.',
      'You want ingredient-level search across the whole recipe web rather than a curated set.',
    ],
    chooseEatPalIf: [
      'Finding recipes is not your problem. Getting your child to eat one is.',
      'You need to know which of the last twenty exposures worked and what to try next.',
      'You want a plan built from the foods your child already trusts.',
    ],
    verdict:
      'Yummly is a search engine for recipes and a good one. EatPal is a plan for a child who refuses most of what those recipes contain. Plenty of families use both.',
  },

  'eatpal-vs-eat-this-much': {
    competitorSummary:
      'Eat This Much generates meal plans automatically from calorie and macronutrient targets. It is built mainly for adults managing body composition or a specific nutrition goal.',
    competitorUrl: 'https://www.eatthismuch.com',
    rows: [
      {
        dimension: 'What the plan optimizes for',
        eatpal: 'Acceptance first, nutrition monitored alongside it',
        competitor: 'Calorie and macronutrient targets',
      },
      {
        dimension: 'Macro and calorie precision',
        eatpal: 'Nutrition adequacy is flagged, not dialed to a gram',
        competitor: 'Plans are generated to hit specified macro targets',
        competitorWins: true,
      },
      {
        dimension: 'Primary user',
        eatpal: 'A parent planning for a child with a restricted diet',
        competitor: 'An adult planning for themselves',
      },
      {
        dimension: 'Handling of a very short food list',
        eatpal: 'Designed for it. The safe food list is the starting point',
        competitor: 'A heavily restricted list tends to produce repetitive plans',
      },
      {
        dimension: 'Introducing new foods',
        eatpal: 'Try bites scheduled and tracked against the exposure research',
        competitor: 'Not a feature',
      },
      {
        dimension: 'Nutrition monitoring for limited diets',
        eatpal: 'Flags likely gaps for children eating a narrow range',
        competitor: 'Tracks intake against adult targets',
      },
    ],
    chooseThemIf: [
      'You need a plan that hits specific calorie and macro numbers. Eat This Much is genuinely better at this and EatPal does not attempt it.',
      'You are planning for yourself rather than a child.',
      'Your goal is body composition or athletic nutrition.',
    ],
    chooseEatPalIf: [
      'The problem is refusal, not macros.',
      'You need the plan to work around a list of six foods without becoming the same six meals forever.',
      'You want to know whether a narrow diet is actually leaving a nutritional gap.',
    ],
    verdict:
      'Eat This Much solves a math problem: fit these foods to these targets. EatPal solves a behaviour problem: get this child to try something. If your child eats widely and you want the numbers right, Eat This Much is the better tool.',
  },

  'eatpal-vs-paprika': {
    competitorSummary:
      'Paprika is a recipe manager. You clip recipes from anywhere on the web, organize them, scale them, and it builds pantry and grocery lists from what you saved.',
    competitorUrl: 'https://www.paprikaapp.com',
    rows: [
      {
        dimension: 'What you are managing',
        eatpal: "A child's accepted foods and what to try next",
        competitor: 'Your own recipe collection',
      },
      {
        dimension: 'Recipe capture',
        eatpal: 'Recipes built in the app or parsed from an image',
        competitor: 'Clip from any site, edit freely, keep it forever, works offline',
        competitorWins: true,
      },
      {
        dimension: 'Who decides what goes on the plan',
        eatpal: "Suggested from the child's history, with try bites scheduled in",
        competitor: 'You do, from your own collection',
      },
      {
        dimension: 'Feeding challenge support',
        eatpal: 'Safe foods, allergens, sensory attributes and exposure counts',
        competitor: 'None. It is a recipe tool and does not claim otherwise',
      },
      {
        dimension: 'Works without an account or a connection',
        eatpal: 'Account required; the mobile app queues offline writes',
        competitor: 'Local-first, syncs across your own devices',
        competitorWins: true,
      },
      {
        dimension: 'Multi-child profiles',
        eatpal: 'Yes, each with its own food list',
        competitor: 'Not applicable',
      },
    ],
    chooseThemIf: [
      "You want to own your recipe collection. Paprika's clipping, offline access and local-first design are better than what EatPal offers and are the reason people stay with it for years.",
      'Your family recipes live on index cards and in browser bookmarks and you want them in one place.',
      'You do not need anything to track what your child will and will not eat.',
    ],
    chooseEatPalIf: [
      'Your bottleneck is refusal at the table, not recipe organization.',
      'You want exposure counts, acceptance history and a next-step suggestion.',
      'You are coordinating meals for several children who eat differently.',
    ],
    verdict:
      'Paprika is a better recipe manager than EatPal will ever be, and it does not overlap much with what EatPal does. If you already use Paprika, keeping it and adding EatPal for the feeding side is a reasonable setup.',
  },

  'eatpal-vs-feeding-therapy-workbooks': {
    competitorSummary:
      'Paper food chaining workbooks and printed exposure trackers, usually worked through with a feeding therapist, are the traditional way this method is delivered. Food chaining itself comes from that literature.',
    rows: [
      {
        dimension: 'The underlying method',
        eatpal: 'Food chaining, the same method the workbooks teach',
        competitor: 'Food chaining, as originally published',
      },
      {
        dimension: 'Clinical oversight',
        eatpal: 'None built in. EatPal is not a substitute for feeding therapy',
        competitor: 'Usually worked through with a therapist who knows the child',
        competitorWins: true,
      },
      {
        dimension: 'Keeping the record up to date',
        eatpal: 'Logged in a few taps at the table; totals add themselves up',
        competitor: 'Handwritten, and the pages that get skipped are the busy weeks',
      },
      {
        dimension: 'Choosing the next food',
        eatpal: "Suggested from the child's own acceptance history",
        competitor: 'Worked out by the parent or the therapist from the chaining principles',
      },
      {
        dimension: 'Cost and commitment',
        eatpal: 'A subscription',
        competitor: 'A one-off purchase, and no screen at the table',
        competitorWins: true,
      },
      {
        dimension: 'Seeing progress across months',
        eatpal: 'Charted automatically per child',
        competitor: 'Requires going back through the pages',
      },
    ],
    chooseThemIf: [
      'You are working with a feeding therapist. Their guidance is worth more than any app, and a clinician who knows your child will beat a suggestion engine that does not.',
      'You would rather not have a phone out at the dinner table. That is a legitimate call and this is the version of the method that respects it.',
      'You want a one-off purchase instead of a subscription.',
    ],
    chooseEatPalIf: [
      'The tracking is what keeps falling apart, not the method.',
      'You want the exposure counts and the acceptance history kept without effort.',
      'You are running this for more than one child at once.',
    ],
    verdict:
      'This is the one comparison where the honest answer is often the other option. If you have a feeding therapist, keep them. EatPal is built for the record-keeping and the between-sessions work, which is where paper tends to fail, and it is designed to sit alongside therapy rather than replace it.',
  },
};

/** Every comparison page, in the order comparisonTargets declares them. */
export const comparisonPages: ComparisonContent[] = comparisonTargets.map((target) => {
  const body = CONTENT[target.slug];
  if (!body) {
    throw new Error(
      `comparisonTargets has slug "${target.slug}" with no entry in src/lib/comparison-content.ts. ` +
        `Add the page body or remove the target.`
    );
  }
  return {
    slug: target.slug,
    competitor: target.competitor,
    title: target.comparisonTitle,
    differentiator: target.keyDifferentiator,
    ...body,
  };
});

export function getComparison(slug: string | undefined): ComparisonContent | null {
  if (!slug) return null;
  return comparisonPages.find((page) => page.slug === slug) ?? null;
}

export const comparisonPath = (slug: string) => `/compare/${slug}`;
export const comparisonCanonical = (slug: string) => `https://tryeatpal.com/compare/${slug}`;

/**
 * Feature list for the EatPal side of ComparisonSchema. Deliberately no rating
 * or ratingCount: the schema component's own docstring shows a 4.8 from 2,847
 * reviews, which is not a real number and is not wired to a rating store.
 */
export const eatpalSchemaItem = {
  name: 'EatPal',
  description:
    'AI meal planning for children with ARFID, autism-related feeding differences and extreme picky eating, built on food chaining.',
  url: 'https://tryeatpal.com',
  image: 'https://tryeatpal.com/Logo-Green.webp',
  features: EATPAL_FEATURES,
};
