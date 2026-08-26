/**
 * Content for the /solutions pages (US-649).
 *
 * /solutions/* has 301'd to /guides since the redirect cleanup, because
 * public/llms.txt advertised /solutions/arfid-meal-planning for months and the
 * page behind it was never built. This module is that page, plus the two other
 * audiences the product genuinely serves.
 *
 * Rules this file follows, and any new entry has to follow:
 *
 * 1. Every capability claimed here points at a file that exists. `evidence` is
 *    checked by src/lib/solutions-content.test.ts against the filesystem, so a
 *    page cannot describe a feature that was planned and never shipped. This is
 *    the mechanical version of the check US-649 asked for in prose, and it is
 *    the reason the feeding-therapist page in the original story is absent:
 *    there is no client management, session tracking or billing anywhere in the
 *    repo to point at.
 * 2. The health-adjacent pages carry a disclaimer and no reviewer. Nobody
 *    clinical has read this copy, so MedicalWebPageSchema is emitted without
 *    `reviewedBy` and the page says in the body that it is educational. Naming
 *    a reviewer who does not exist is the same mistake as the invented author
 *    bio this repo already had to strip (see src/pages/Authors.tsx).
 * 3. No numbers we cannot source. No prevalence statistics, no success rates,
 *    no claims about outcomes.
 */

export interface SolutionCapability {
  /** Short label, e.g. "Food chaining suggestions". */
  name: string;
  /** What it does, in the reader's terms. */
  what: string;
  /**
   * A path in this repo that implements it, relative to the repo root. Asserted
   * to exist by the test. Never rendered -- it is here to keep the copy honest.
   */
  evidence: string;
}

export interface SolutionFaq {
  question: string;
  answer: string;
}

export interface SolutionContent {
  slug: string;
  /** Page <h1>. */
  title: string;
  /** One line, used on the /solutions index and in the meta description. */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  /** Opening paragraphs, rendered in order. */
  intro: string[];
  capabilities: SolutionCapability[];
  /** Plain statements of what this does not do. Every page needs at least two. */
  limits: string[];
  faqs: SolutionFaq[];
  /**
   * Set on health-adjacent pages. Presence switches on MedicalWebPageSchema and
   * the educational-content disclaimer. There is deliberately no `reviewedBy`
   * field: see rule 2 above.
   */
  medical?: {
    about: string[];
    mentions: string[];
  };
}

const NOT_MEDICAL_ADVICE =
  'This page is educational. It has not been reviewed by a clinician, and nothing here diagnoses a feeding disorder or replaces an assessment by a paediatrician, dietitian or feeding therapist. If your child is losing weight, refusing whole food groups or distressed at meals, start with a professional.';

export const solutionsDisclaimer = NOT_MEDICAL_ADVICE;

const CONTENT: SolutionContent[] = [
  {
    slug: 'arfid',
    title: 'Meal planning for a child with ARFID',
    summary:
      'Plan around the foods your child already accepts, and add one new thing at a time instead of a new dinner every night.',
    metaTitle: 'ARFID meal planning for kids | EatPal',
    metaDescription:
      'Meal planning built around a short list of accepted foods. Track what your child ate, tasted or refused, and expand the list one step at a time with food chaining.',
    keywords:
      'ARFID meal planning, ARFID meal plan for kids, ARFID food chaining, extreme picky eating app, safe foods list',
    intro: [
      'Most meal planning tools start from a recipe library and ask what you feel like cooking. That is the wrong question when a child eats eleven things and one of them has just dropped off the list.',
      'EatPal starts from the list. You record which foods your child accepts, and the plan is built out of those. New foods arrive as single steps next to a safe food, not as a replacement dinner, and every attempt gets logged so the next suggestion comes from what actually happened rather than from what should have worked.',
    ],
    capabilities: [
      {
        name: 'A safe food list per child',
        what: "Each food is marked as a safe food or a try bite for a specific child, so a plan for one sibling is not built from another one's accepted list.",
        evidence: 'src/types/index.ts',
      },
      {
        name: 'Food chaining suggestions',
        what: 'Suggestions start from a food your child already eats and change one attribute at a time, which is the method feeding therapists call food chaining. Texture, category and preparation are compared per food rather than guessed from the name.',
        evidence: 'src/components/FoodChainingRecommendations.tsx',
      },
      {
        name: 'Logging what happened, not what was served',
        what: 'A try bite is recorded as eaten, tasted or refused. Refusals are as useful as acceptances here, and they are the input the next suggestion uses.',
        evidence: 'src/pages/FoodTracker.tsx',
      },
      {
        name: 'A grocery list built from the plan',
        what: 'The week turns into an aisle-organised list, so the two or three brands that work do not get missed on a distracted shop.',
        evidence: 'src/pages/Grocery.tsx',
      },
      {
        name: 'A quiz that sorts picky eating from something more',
        what: 'Ordinary selective eating, sensory-driven refusal and ARFID need different responses. The quiz is free and points you at the right one, including away from this app.',
        evidence: 'src/pages/PickyEaterQuiz.tsx',
      },
    ],
    limits: [
      'It does not diagnose ARFID. ARFID is a clinical diagnosis and this is a planning tool.',
      'It is not a therapy programme and does not replace one. If you are working with a feeding therapist, their plan comes first and this is the record-keeping between sessions.',
      'It does not push a child toward a food. You decide what goes on the plate; the app decides what to suggest next based on what you logged.',
    ],
    faqs: [
      {
        question: 'Is this a treatment for ARFID?',
        answer:
          'No. It is meal planning and tracking for a household that is already dealing with one. Treatment is a clinical matter, and the page you are on says so because we would rather lose the sign-up than imply otherwise.',
      },
      {
        question: 'What if my child accepts fewer than ten foods?',
        answer:
          'That is the case this was built for. The plan is generated from the accepted list however short it is, and try bites are added at a rate you set rather than one per meal.',
      },
      {
        question: 'What happens when a safe food drops off the list?',
        answer:
          'Mark it as no longer safe and it stops appearing in plans and suggestions. Losing a safe food is the event most tools have no way to record, and it is the one that changes the whole week.',
      },
    ],
    medical: {
      about: ['ARFID', 'Avoidant Restrictive Food Intake Disorder', 'Selective Eating'],
      mentions: ['Food chaining', 'Systematic desensitization'],
    },
  },
  {
    slug: 'autism-sensory',
    title: 'Meal planning for autistic and sensory-sensitive eaters',
    summary:
      'Plan around texture rather than food groups, and keep the details that decide whether a meal is eaten.',
    metaTitle: 'Autism and sensory feeding: meal planning that respects texture | EatPal',
    metaDescription:
      'Meal planning for autistic children and sensory-sensitive eaters. Foods carry texture data, suggestions change one attribute at a time, and the brand and preparation that work stay recorded.',
    keywords:
      'autism meal planning, sensory food aversion, autistic child picky eating, texture sensitivity food, sensory feeding app',
    intro: [
      'A sensory-driven refusal is not fussiness about vegetables. It is usually about crunch, wetness, temperature, smell, or the fact that this week the shop had a different brand.',
      'EatPal treats those details as data rather than as noise. Foods carry texture information, suggestions move one attribute at a time, and the specific preparation that works is recorded against the food instead of living in your head.',
    ],
    capabilities: [
      {
        name: 'Texture treated as data',
        what: 'Foods carry a primary and secondary texture and a texture score, and the suggestion engine compares those directly rather than assuming that two vegetables are interchangeable.',
        evidence: 'src/components/FoodChainingRecommendations.tsx',
      },
      {
        name: 'One attribute changes at a time',
        what: 'A suggestion holds texture constant and moves flavour, or holds flavour and moves shape. A step that changes three things at once is the step that gets refused.',
        evidence: 'src/lib/exposureLadder.ts',
      },
      {
        name: 'The exact item, not the category',
        what: 'A food is whatever you name it, down to the brand and the preparation, and the pack size and servings per container are stored with it. The version that works reaches the grocery list instead of a generic ingredient a substitute shopper will guess at.',
        evidence: 'src/components/AddFoodDialog.tsx',
      },
      {
        name: 'Separate profiles for separate kids',
        what: 'Sensory profiles are not shared between siblings. Each child has their own accepted foods, allergens and goals.',
        evidence: 'src/pages/Kids.tsx',
      },
    ],
    limits: [
      'It does not assess sensory processing, and it does not produce a sensory profile. It records what you tell it.',
      'It is not autism-specific software. It is a feeding tool whose data model happens to carry the attributes that matter here.',
      'It has no AAC, visual-schedule or communication features. If that is what you need at mealtimes, this is not the tool.',
      'It does not track brands as products. The brand that works is part of the food name you type, not an entry in a product database that would tell you when the recipe changed.',
    ],
    faqs: [
      {
        question: 'Does it handle brand-specific acceptance?',
        answer:
          'Up to a point. Name the food the way you buy it and record the pack size, and the right item reaches the grocery list. There is no product database behind it, so it cannot tell you a manufacturer has changed the recipe.',
      },
      {
        question: 'Can I plan around a single texture?',
        answer:
          'Yes. If everything accepted is dry and crunchy, the plan and the suggestions stay dry and crunchy, and expansion happens inside that texture before it tries to leave it.',
      },
      {
        question: 'Is this only for autistic children?',
        answer:
          'No. Sensory-driven food refusal turns up with and without an autism diagnosis, and the app does not ask for one.',
      },
    ],
    medical: {
      about: ['Sensory Processing', 'Autism Spectrum Disorder', 'Selective Eating'],
      mentions: ['Food chaining'],
    },
  },
  {
    slug: 'multiple-kids',
    title: 'Feeding several kids with different safe foods',
    summary: 'One dinner that each child will actually eat, instead of three meals or a standoff.',
    metaTitle: 'Meal planning for several kids with different safe foods | EatPal',
    metaDescription:
      'Separate food profiles per child and a finder that looks for the meals every child in the house will accept, with the smallest changes needed to get there.',
    keywords:
      'meal planning for multiple kids, siblings different diets, one meal whole family picky eater, family meal planning app',
    intro: [
      'Two children with overlapping but different accepted lists is a harder scheduling problem than one child with a short list. Cook separately and you are running a restaurant; cook one thing and somebody does not eat.',
      'EatPal keeps a profile per child and then looks for the overlap deliberately. The sibling meal finder searches for meals every selected child accepts, shows how each one scores per child, and relaxes constraints one at a time when nothing clears the bar.',
    ],
    capabilities: [
      {
        name: 'A profile per child',
        what: 'Accepted foods, try bites, allergens and goals are held per child, not per household.',
        evidence: 'src/pages/Kids.tsx',
      },
      {
        name: 'Sibling meal finder',
        what: 'Pick the kids eating tonight and it searches for meals that clear every one of their lists, scoring each option per child so you can see who is compromising.',
        evidence: 'src/pages/SiblingMealFinder.tsx',
      },
      {
        name: 'Fairness across the week',
        what: 'The finder shows how often each child is the one accommodated, because the child who never gets their meal notices long before anybody says so.',
        evidence: 'src/components/sibling-meal-finder/FairnessIndicator.tsx',
      },
      {
        name: 'One grocery list for the household',
        what: 'Separate plans still produce a single aisle-organised list.',
        evidence: 'src/pages/Grocery.tsx',
      },
    ],
    limits: [
      'It will not invent an overlap that does not exist. When no meal clears every list it says so and shows what would have to give.',
      'Allergens are a filter, not a safety system. Check labels; a household allergy plan is not something to delegate to an app.',
    ],
    faqs: [
      {
        question: 'What if there is no meal all of them will eat?',
        answer:
          'The finder relaxes one constraint at a time and shows you which one it dropped, so the trade-off is a decision you make rather than a result you get handed.',
      },
      {
        question: 'Can one child be on a try bite while the others are not?',
        answer:
          "Yes. Try bites are per child, so an expansion step for one sibling does not become a new food on everybody's plate.",
      },
      {
        question: 'Does it work for one child?',
        answer:
          'It does, but the sibling finder is the part that earns its place with two or more. With one child the planner and the food list are the surfaces you will live in.',
      },
    ],
  },
];

/** Every published /solutions page, in the order they appear on the index. */
export const solutionPages: SolutionContent[] = CONTENT;

export function getSolution(slug: string | undefined): SolutionContent | null {
  if (!slug) return null;
  return solutionPages.find((page) => page.slug === slug) ?? null;
}

export const solutionPath = (slug: string) => `/solutions/${slug}`;
export const solutionCanonical = (slug: string) => `https://tryeatpal.com/solutions/${slug}`;
