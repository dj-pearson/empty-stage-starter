/**
 * Content for the /picky-eater/* meal-occasion pages.
 *
 * These target the largest commercial cluster in this niche and the one EatPal has no
 * presence in at all. "dinner ideas for picky eaters", "lunch ideas for picky eaters",
 * "healthy meals for picky eaters" and roughly forty siblings each sit in Keyword
 * Planner's 5,000/month tier with live advertiser bids, and Search Console shows the
 * site ranking for none of them. Not position 40. Absent. Meanwhile 180 blog posts
 * cover themes like "mealtime battles" that nobody searches for.
 *
 * The `fussy` phrasings are not synonyms to fold in silently: they are how the UK and
 * Australia say it, and those two markets already convert at 3.09% and 6.50% against a
 * US 2.32%. Each page names both.
 *
 * Rules any new entry has to follow. These exist because this repo has already had to
 * strip invented author credentials, an invented aggregateRating, an invented "10,000
 * families", and a "Join thousands of parents" CTA. A listicle is the easiest place in
 * the world to invent a number.
 *
 * 1. No nutrition statistics, no "studies show", no percentages. If a claim needs
 *    evidence, either attribute it to something checkable or cut it.
 * 2. No medical or therapeutic claims. These pages describe an approach to planning
 *    meals; they do not treat ARFID. Anything that edges toward treatment says plainly
 *    that a feeding therapist is the right call.
 * 3. Ideas are foods, not recipes with invented specifics. "Pasta with butter and
 *    grated cheese" is checkable. "Our 15-minute high-protein pasta bake that kids love"
 *    is marketing dressed as a recipe.
 * 4. Every page is organised around the child's existing accepted foods, because that
 *    is what food chaining actually is and it is the only thing making these pages
 *    different from the thousand listicles already ranking. A page that is just a list
 *    of meals has no reason to outrank the ones with ten years of links.
 *
 * src/lib/meal-ideas-content.test.ts enforces 1 and 4 mechanically.
 */

/** A cluster of ideas that all start from one food the child already accepts. */
export interface IdeaGroup {
  /** The accepted food this group builds from, e.g. "Plain pasta". */
  anchor: string;
  /** Why starting here works, in the parent's terms. */
  why: string;
  /** Concrete, plainly-describable meals. No invented recipe names. */
  ideas: string[];
  /** One food chaining step out from the anchor: change one attribute, keep the rest. */
  nextStep: string;
}

export interface MealIdeasFaq {
  question: string;
  answer: string;
}

export interface MealIdeasPage {
  slug: string;
  h1: string;
  /** <title>, without the site suffix. */
  title: string;
  metaDescription: string;
  /**
   * The direct answer, first thing on the page and first thing in the meta description.
   * Assistants quote the sentence that answers the question; burying it under a warm
   * anecdote is why the existing blog posts do not get extracted.
   */
  answer: string;
  /** Body paragraphs under the answer. */
  intro: string[];
  groups: IdeaGroup[];
  /** Common mistakes, each paired with what to do instead. */
  insteadOf: { dont: string; instead: string }[];
  faqs: MealIdeasFaq[];
  /** Slugs of sibling pages, for the in-cluster link block. */
  related: string[];
}

export const MEAL_IDEAS_PAGES: readonly MealIdeasPage[] = [
  {
    slug: "dinner-ideas",
    h1: "Dinner Ideas for Picky Eaters",
    title: "Dinner Ideas for Picky Eaters (Built From Foods They Already Eat)",
    metaDescription:
      "Dinner ideas for picky and fussy eaters, grouped by the food your child already accepts rather than by recipe. Includes one small next step from each.",
    answer:
      "The dinners that work for a picky eater are the ones built outward from a food the child already accepts, changing one thing at a time. Start from their anchor food, keep it on the plate, and put the new thing beside it rather than inside it.",
    intro: [
      "Most dinner lists for picky eaters are lists of dinners other children eat. That is why they fail: the meal arrives with nothing familiar on the plate, and a child who is anxious about food reads an unfamiliar plate as a plate with no food on it.",
      "The approach below is food chaining, the feeding therapy method published by Cheri Fraker, RD and Laura Walbert, SLP. Each dinner starts from something already accepted, and each group ends with one small step out from it. Change one attribute at a time, taste or texture or shape or preparation, and keep everything else the same.",
      "Serve the anchor food every time, including on the nights you are introducing something new. It is what makes the meal safe enough to sit at.",
    ],
    groups: [
      {
        anchor: "Plain pasta",
        why: "Predictable texture, no sauce to negotiate, and it tolerates additions on the side without contaminating the bowl.",
        ideas: [
          "Buttered pasta with grated cheese on top, cheese served separately so they add it",
          "Pasta with a plain protein alongside, not mixed in: chicken strips, meatballs, or flaked fish",
          "Pasta with a small pile of one raw vegetable on the side, not on the pasta",
          "Cold pasta with olive oil, for children who dislike hot food",
        ],
        nextStep:
          "Keep the same shape and swap only the surface: butter to a thin layer of olive oil, or plain to a very light dusting of the cheese they already accept.",
      },
      {
        anchor: "Bread, toast, or a plain wrap",
        why: "Bread is the most forgiving anchor there is. It carries other foods without hiding them, and the child can see exactly what is on it.",
        ideas: [
          "Deconstructed sandwich: bread, filling, and any vegetable in separate piles",
          "Toast fingers with a plain protein beside them",
          "Wrap served open and flat, so nothing is concealed",
          "Toast with a thin spread of something they already eat, plus one new item on the side",
        ],
        nextStep:
          "Change the bread's form, not its flavour: the same loaf toasted rather than soft, or cut into a different shape.",
      },
      {
        anchor: "Potato in any accepted form",
        why: "Potato spans a huge texture range, so it lets you move within one familiar food rather than between two unfamiliar ones.",
        ideas: [
          "Baked potato with butter, toppings served alongside",
          "Mashed potato with a plain protein next to it",
          "Roast potato pieces with a dip they already accept",
          "Potato with one vegetable of a similar colour on the plate",
        ],
        nextStep:
          "Move one step along the texture range they already accept: chips to roast pieces, or mash to a softly baked wedge.",
      },
      {
        anchor: "Breaded chicken",
        why: "It is the most common anchor in this whole category, and the coating is doing more work than the chicken. That makes it a long chain rather than a dead end.",
        ideas: [
          "Nuggets with a plain carbohydrate and a dip on the side",
          "Breaded strips instead of shaped nuggets, same coating",
          "Breaded chicken with a small piece of the same chicken uncoated on the plate, no expectation to eat it",
          "Chicken with a dip they already accept, used on something new",
        ],
        nextStep:
          "Shape first, coating second, meat last. Nuggets to strips to a lightly breaded piece to plain baked chicken, and only when the previous step is genuinely comfortable.",
      },
    ],
    insteadOf: [
      {
        dont: "Hiding vegetables in a sauce.",
        instead:
          "Serve them visibly and separately. A child who finds something hidden learns that the plate cannot be trusted, and that costs you more than the vegetable was worth.",
      },
      {
        dont: "Making a separate meal from scratch every night.",
        instead:
          "Cook one meal and deconstruct it. Put the components in separate piles and let the child assemble, which is far less work and gives them the control that makes trying anything possible.",
      },
      {
        dont: "Requiring a bite before dessert.",
        instead:
          "Put the new food on the plate with no expectation attached. Pressure at the table reliably narrows the diet over time, which is the opposite of what you want.",
      },
    ],
    faqs: [
      {
        question: "What if my child only eats three or four dinners?",
        answer:
          "Rotate them deliberately rather than letting one take over, and keep each of the accepted foods in circulation. A food that stops appearing for several weeks can drop off the accepted list entirely, so a narrow rotation that stays wide enough is better than serving the current favourite every night.",
      },
      {
        question: "How many times do I need to offer something before it works?",
        answer:
          "More often than feels reasonable, and without pressure attached. The important part is that repeated exposure means the food appearing on the plate, not the child eating it. Looking at it, touching it, and moving it are all steps.",
      },
      {
        question: "Is this the same as dinner ideas for fussy eaters?",
        answer:
          "Yes. Fussy eater is the usual phrasing in the UK, Ireland and Australia, and picky eater is the American one. The approach is the same.",
      },
      {
        question: "When is this not enough?",
        answer:
          "When a child's diet is narrow enough to affect growth or nutrition, when eating causes real distress, or when they are losing foods faster than they gain them. That is the point to see a feeding therapist, a paediatric dietitian, or your doctor. EatPal is a planning tool, not a treatment.",
      },
    ],
    related: ["lunch-ideas", "healthy-meals", "breakfast-ideas", "healthy-snacks"],
  },

  {
    slug: "lunch-ideas",
    h1: "Lunch Ideas for Picky Eaters",
    title: "Lunch Ideas for Picky Eaters, Including Lunch Boxes",
    metaDescription:
      "Lunch and lunch box ideas for picky and fussy eaters, organised by the foods your child already accepts. Packing rules that survive a school lunch break.",
    answer:
      "A lunch a picky eater will actually eat is one they can recognise in under a second, open without help, and finish in the time they are given. Build it from an accepted anchor food, and add at most one unfamiliar item beside it.",
    intro: [
      "School lunch is the hardest meal to change, and the worst place to try. The child is on a clock, surrounded by other people, and you are not there. A lunch box is for maintaining accepted foods, not for introducing new ones.",
      "Do the introducing at home, where a refusal costs nothing. Pack what already works, and let one small new item ride along with no expectation attached.",
    ],
    groups: [
      {
        anchor: "A sandwich they already accept",
        why: "The known quantity. Changing anything about it at school is a wasted attempt, so change it at home first and pack it once it holds.",
        ideas: [
          "The same sandwich, cut a different way",
          "The filling and the bread packed separately, assembled by the child",
          "Rolled rather than stacked, using the same bread and filling",
          "Two halves, one exactly as usual and one with a single change",
        ],
        nextStep:
          "Change the cut or the shape before you change the filling. Shape is the cheapest attribute to move and it costs nothing if it fails.",
      },
      {
        anchor: "Crackers and other dry, crunchy foods",
        why: "Crunch is often the point rather than the flavour. If the crunch survives until lunchtime, a lot else can vary underneath it.",
        ideas: [
          "Crackers packed apart from anything moist, so they stay crisp",
          "Crackers with cheese and a plain meat in separate compartments",
          "A crunchy accepted food plus one new crunchy food of a similar colour",
          "Breadsticks with a dip they already accept",
        ],
        nextStep:
          "Hold the texture and move the shape: a round cracker to a square one, same brand and flavour.",
      },
      {
        anchor: "Fruit they reliably eat",
        why: "It is usually the only produce that makes it home from a lunch box, so it is worth protecting rather than experimenting with.",
        ideas: [
          "The accepted fruit, prepared exactly the way it is accepted",
          "The same fruit cut two ways in the same box",
          "A small amount of a new fruit of the same colour beside the accepted one",
          "Fruit kept separate from anything with a strong smell",
        ],
        nextStep:
          "Same fruit, different preparation. Slices to chunks, or peeled to unpeeled, before you try a different fruit.",
      },
    ],
    insteadOf: [
      {
        dont: "Packing something new and hoping.",
        instead:
          "Introduce at home first. A new food that fails at school fails in front of an audience, and that can put the food out of reach for months.",
      },
      {
        dont: "Packing a full, balanced lunch that comes home untouched.",
        instead:
          "Pack less, and pack what gets eaten. A smaller lunch that is finished beats a complete one that is not.",
      },
      {
        dont: "Containers the child cannot open alone.",
        instead:
          "Check they can open every item without help. A surprising share of uneaten lunches is a lid problem rather than a food problem.",
      },
    ],
    faqs: [
      {
        question: "What are good lunch box ideas for fussy eaters?",
        answer:
          "The same as for picky eaters: an accepted anchor food, packed in a way that survives until lunchtime, with components kept separate. Fussy eater is the UK, Irish and Australian phrasing for the same thing.",
      },
      {
        question: "My child eats lunch at home but not at school. Why?",
        answer:
          "Usually time, noise, and the absence of the usual routine rather than the food itself. Pack food that can be eaten quickly and one-handed, and check how long they actually get to eat once queuing and sitting down are accounted for.",
      },
      {
        question: "Should I send a note asking staff to encourage eating?",
        answer:
          "Encouragement from an adult who is not you, in front of other children, is pressure. It usually costs more than it gains. Ask instead that the food simply comes home so you can see what was and was not eaten.",
      },
    ],
    related: ["dinner-ideas", "healthy-snacks", "breakfast-ideas", "healthy-meals"],
  },

  {
    slug: "breakfast-ideas",
    h1: "Breakfast Ideas for Picky Eaters",
    title: "Breakfast Ideas for Picky Eaters and Kids Who Skip Meals",
    metaDescription:
      "Breakfast ideas for picky and fussy eaters, including children who refuse to eat in the morning. Built from accepted foods, with one small step from each.",
    answer:
      "Breakfast is the easiest meal to widen, because it is the most repetitive and the least negotiated. Pick one accepted breakfast, serve it consistently, and change one attribute at a time rather than offering a different breakfast each morning.",
    intro: [
      "Plenty of children are genuinely not hungry first thing, and pushing a full breakfast into a child who is not hungry mostly teaches them that mornings involve an argument. A small breakfast that happens every day is worth more than a large one that happens twice a week.",
      "Breakfast foods also sit close together in texture and flavour, which makes the chains short. Moving from one cereal to another is a much smaller step than moving between two dinners.",
    ],
    groups: [
      {
        anchor: "A cereal they accept",
        why: "Cereal varies along one axis at a time, shape or sweetness or crunch, so each step is small and reversible.",
        ideas: [
          "The accepted cereal, dry, with milk on the side",
          "The same cereal with a different milk, offered separately first",
          "Two cereals in the same bowl, mostly the accepted one",
          "The accepted cereal with one piece of accepted fruit beside it",
        ],
        nextStep:
          "Same brand, different shape, before you try a different brand or a different sweetness.",
      },
      {
        anchor: "Toast",
        why: "The same anchor that works at dinner, and mornings are the lowest-pressure time to move it.",
        ideas: [
          "Toast with the usual spread, cut differently",
          "Toast with the spread served on the side to apply themselves",
          "A thinner layer of the usual spread",
          "Toast with one new item on the plate, no expectation to eat it",
        ],
        nextStep:
          "Change how done the toast is before you change what goes on it. Colour and crunch are one attribute; flavour is another.",
      },
      {
        anchor: "Something drinkable",
        why: "For a child who cannot face solid food in the morning, a drink is a real breakfast rather than a failure.",
        ideas: [
          "Milk or a milk alternative they already accept",
          "A smoothie made only from fruits they already eat",
          "The same smoothie with one familiar ingredient added visibly, so they saw it go in",
          "A drink alongside one small solid item, with no requirement to eat it",
        ],
        nextStep:
          "Add ingredients in front of them, one at a time. A drink whose contents were hidden is the fastest way to lose the drink.",
      },
    ],
    insteadOf: [
      {
        dont: "Offering a different breakfast every day to find one that sticks.",
        instead:
          "Serve the same accepted breakfast consistently and vary one attribute. Variety at the start of a chain reads as unpredictability, which is the thing making mornings hard.",
      },
      {
        dont: "Treating a refused breakfast as a lost meal.",
        instead:
          "Move the calories to a mid-morning snack. The goal is that the day's food happens, not that it happens at 7am.",
      },
    ],
    faqs: [
      {
        question: "What if my child refuses to eat anything in the morning?",
        answer:
          "Offer something drinkable and something small, and let the first real meal be mid-morning. Appetite in the first hour after waking varies a lot between children, and a child who is not hungry is not being difficult.",
      },
      {
        question: "Are breakfast ideas different for ARFID?",
        answer:
          "The approach is the same but the pace is slower and the steps are smaller. If eating causes real distress or the accepted list is shrinking, that is a reason to work with a feeding therapist rather than to push harder at home.",
      },
    ],
    related: ["dinner-ideas", "lunch-ideas", "healthy-snacks", "healthy-meals"],
  },

  {
    slug: "healthy-snacks",
    h1: "Healthy Snacks for Picky Eaters",
    title: "Healthy Snacks for Picky Eaters That Do Not Start a Fight",
    metaDescription:
      "Healthy snack ideas for picky and fussy eaters, grouped by texture rather than food group, with one small step out from each accepted snack.",
    answer:
      "Snacks are the best place to introduce a new food, because the stakes are lower than at a meal and the portion is small enough not to look like a demand. Group snacks by texture rather than by food group, because texture is usually what a picky eater is actually sorting on.",
    intro: [
      "A child who eats crunchy things and refuses soft things is not refusing a food group. They are refusing a texture, and that is far more workable, because it tells you exactly which direction to move.",
      "Sort what your child already accepts into crunchy, soft, smooth and chewy. The next food you offer should sit in a group they already accept, not the one you wish they accepted.",
    ],
    groups: [
      {
        anchor: "Crunchy",
        why: "The most commonly accepted texture, and the one with the widest range of foods inside it.",
        ideas: [
          "Crackers, breadsticks, and dry cereal",
          "Raw vegetable sticks, if raw is already accepted",
          "Apple slices, cut thin enough to snap",
          "Freeze-dried fruit, which is crunchy rather than soft",
        ],
        nextStep:
          "Stay crunchy and change the flavour slightly, or stay with the flavour and reduce the crunch by one step. Never both at once.",
      },
      {
        anchor: "Smooth",
        why: "For children who reject anything with pieces in it, smooth is a whole category that avoids the problem entirely.",
        ideas: [
          "Yoghurt with no fruit pieces",
          "Smooth nut or seed butter on an accepted cracker",
          "A fruit puree pouch",
          "A dip they already accept, with an accepted dipper",
        ],
        nextStep:
          "Introduce texture in the smallest possible amount: a smooth food with one visible piece in it, so nothing is a surprise.",
      },
      {
        anchor: "Soft and chewy",
        why: "Often the last texture to be accepted, so it is worth building toward rather than starting from.",
        ideas: [
          "Soft fruit cut into pieces they can manage",
          "Cheese cut into a shape they already accept",
          "Soft bread without a crust",
          "A soft food served alongside a crunchy accepted one",
        ],
        nextStep:
          "Pair rather than replace. A new soft food next to an accepted crunchy one is a much smaller ask than a plate of only soft food.",
      },
    ],
    insteadOf: [
      {
        dont: "Grazing all day.",
        instead:
          "Keep snacks to set times. A child who has eaten steadily since breakfast arrives at dinner with no appetite, which makes dinner harder for reasons that have nothing to do with the food.",
      },
      {
        dont: "Calling one snack healthy and another a treat in front of the child.",
        instead:
          "Describe foods by what they are. Sorting food into good and bad tends to make the bad ones more interesting and adds a layer of anxiety to a table that already has enough.",
      },
    ],
    faqs: [
      {
        question: "What are healthy snacks for fussy eaters?",
        answer:
          "The same list. Sort by the textures your child already accepts, offer new foods inside an accepted texture, and keep the portion small enough that it does not read as a demand.",
      },
      {
        question: "My child only wants crunchy, beige snacks. Is that a problem?",
        answer:
          "It is very common and it is a workable starting point rather than a failure. Beige, crunchy foods are predictable, which is exactly why an anxious eater chooses them. Work outward within that texture first.",
      },
      {
        question: "How do I add protein to snacks for a picky eater?",
        answer:
          "Attach it to something already accepted rather than replacing the snack. Cheese with the crackers they already eat, or a smooth nut butter on the bread they already accept, changes one thing rather than the whole snack.",
      },
    ],
    related: ["dinner-ideas", "lunch-ideas", "breakfast-ideas", "healthy-meals"],
  },

  {
    slug: "healthy-meals",
    h1: "Healthy Meals for Picky Eaters",
    title: "Healthy Meals for Picky Eaters Without the Mealtime Battle",
    metaDescription:
      "How to make meals healthier for a picky or fussy eater without losing the foods that already work. Small changes to accepted meals, not new meals.",
    answer:
      "Making a picky eater's meals healthier works better as a series of small changes to meals they already accept than as a set of new, healthier meals. Change one attribute of an accepted meal and keep everything else identical.",
    intro: [
      "The instinct is to replace what a child eats with something better. It rarely survives contact with a selective eater, because the replacement is a new food and a new food is the hard part.",
      "The alternative is slower and works: keep the meal, and move one component. This is deliberately unglamorous. A child who eats four things and now eats five is a real result, and it compounds.",
      "If a child's diet is narrow enough that you are worried about growth or nutrition, that is a conversation with a paediatric dietitian or your doctor rather than something to solve from a list of ideas.",
    ],
    groups: [
      {
        anchor: "The meal they eat most often",
        why: "It is the highest-leverage meal on the list, because a small improvement to it happens several times a week.",
        ideas: [
          "The same meal with the accepted vegetable served on the side",
          "The same meal with a slightly larger portion of the component you want more of",
          "The same meal with a plain protein added beside it",
          "The same meal, unchanged, on the days it needs to just be easy",
        ],
        nextStep:
          "Adjust the proportions before you adjust the ingredients. More of an accepted good thing is a smaller ask than any new thing.",
      },
      {
        anchor: "Foods they already accept from each texture group",
        why: "A varied diet within accepted textures is a genuine result, and it is reachable now rather than eventually.",
        ideas: [
          "Two accepted foods from the same texture group in one meal",
          "An accepted food prepared a second way",
          "A new food that matches the colour and texture of an accepted one",
          "The same meal with one component swapped for a close relative",
        ],
        nextStep:
          "Match on the attribute they care about most, usually texture, and vary the one they care about least.",
      },
      {
        anchor: "Foods that carry other foods",
        why: "Bread, pasta, potato and dips all carry something else without hiding it, which is what makes them useful rather than sneaky.",
        ideas: [
          "An accepted dip used with one new dipper",
          "An accepted bread with one new thing beside it",
          "Pasta with a new item served alongside rather than stirred through",
          "A plain base with toppings offered separately",
        ],
        nextStep:
          "Keep the carrier constant while the passenger changes. Two variables at once is how a chain breaks.",
      },
    ],
    insteadOf: [
      {
        dont: "Removing an accepted food because it is not nutritious.",
        instead:
          "Keep it and add beside it. Taking away a safe food shrinks the accepted list, and the list shrinking is the actual problem you are trying to solve.",
      },
      {
        dont: "Aiming for a balanced plate at every meal.",
        instead:
          "Look at the week rather than the plate. Intake across several days is a much more useful measure than any single meal, and it is far less stressful to aim at.",
      },
      {
        dont: "Negotiating at the table.",
        instead:
          "Decide what is served and let the child decide what they eat from it. Splitting the decision this way is what takes the argument out of the meal.",
      },
    ],
    faqs: [
      {
        question: "How do I get more nutrients into a very limited diet?",
        answer:
          "Start by widening within what is already accepted, since that is the lowest-resistance path, and get advice from a paediatric dietitian if the accepted list is small enough to worry you. Supplements are a conversation with your doctor, not something to decide from an article.",
      },
      {
        question: "Are healthy meals for fussy eaters different?",
        answer:
          "No. Fussy is the UK, Irish and Australian phrasing for picky, and the approach is identical.",
      },
      {
        question: "How long does this take?",
        answer:
          "Longer than any article can honestly promise, and it varies enormously between children. What is reasonable to expect is that the accepted list stops shrinking first, and starts growing after that.",
      },
      {
        question: "Is this a treatment for ARFID?",
        answer:
          "No. Food chaining is used in feeding therapy, but a planning tool is not therapy and this page is not a treatment plan. ARFID needs a qualified clinician, and EatPal is something you might use alongside that.",
      },
    ],
    related: ["dinner-ideas", "lunch-ideas", "breakfast-ideas", "healthy-snacks"],
  },
] as const;

/** Look up one page by its slug. */
export function getMealIdeasPage(slug: string | undefined): MealIdeasPage | undefined {
  if (!slug) return undefined;
  return MEAL_IDEAS_PAGES.find((page) => page.slug === slug);
}

/** Every route this cluster owns, for the sitemap and the prerenderer. */
export const MEAL_IDEAS_ROUTES: readonly string[] = MEAL_IDEAS_PAGES.map(
  (page) => `/picky-eater/${page.slug}`
);
