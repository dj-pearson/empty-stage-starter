/**
 * Content for the /arfid/* cluster.
 *
 * This is the largest gap between what EatPal is about and what it ranks for. Keyword
 * Planner puts "arfid eating", "arfid food disorder" and "avoidant restrictive food
 * intake disorder arfid" each in the 50,000/month tier at Low competition, and Search
 * Console shows EatPal ranking for none of them. The tail is unusually explicit about
 * what it wants: "arfid safe foods list" and "arfid food list pdf" are people asking for
 * a document, not an essay.
 *
 * Writing about an eating disorder for parents deciding what to do about their child is
 * the highest-stakes copy on this site, so the rules are tighter than the meal-ideas
 * cluster's and src/lib/arfid-content.test.ts enforces them:
 *
 * 1. Every page states, in its own words, that EatPal is a meal planning tool and not
 *    treatment. `careNote` is a required field for exactly this reason: it cannot be
 *    forgotten, because the type will not compile without it.
 * 2. No statistic, no prevalence figure, no "studies show". ARFID prevalence numbers
 *    vary widely by population and method, and a number quoted without its study is
 *    worse than no number.
 * 3. Clinical statements are limited to what the DSM-5 itself sets out and are marked as
 *    such. Anything past that is attributed to the published food chaining work of Cheri
 *    Fraker, RD and Laura Walbert, SLP, matching how the rest of the site does it.
 * 4. No page implies EatPal or its author can assess, diagnose or treat. EatPal has no
 *    clinicians on staff; src/lib/no-false-credentials.test.ts fails the build over it.
 * 5. Where a reader might be in trouble, the page says who to call before it says what
 *    the app does.
 */

/** A block of body content under its own h2. */
export interface ArfidSection {
  heading: string;
  paragraphs: string[];
  /** Optional list under the paragraphs. */
  bullets?: string[];
}

export interface ArfidFaq {
  question: string;
  answer: string;
}

export interface ArfidPage {
  slug: string;
  h1: string;
  /** <title>, without the site suffix. */
  title: string;
  metaDescription: string;
  /**
   * The direct answer, first thing under the h1 and first thing in the meta description.
   * Assistants quote the sentence that answers the question.
   */
  answer: string;
  intro: string[];
  sections: ArfidSection[];
  /**
   * Required. The sentence that separates a meal planning tool from treatment. Rule 1.
   */
  careNote: string;
  faqs: ArfidFaq[];
  /** Slugs of sibling pages in this cluster. */
  related: string[];
}

const NOT_TREATMENT =
  "EatPal is a meal planning tool. It does not assess, diagnose or treat ARFID, and " +
  "nothing on this page is a substitute for a feeding therapist, a dietitian or your " +
  "child's doctor.";

export const ARFID_PAGES: readonly ArfidPage[] = [
  {
    slug: "what-is-arfid",
    h1: "What Is ARFID?",
    title: "What Is ARFID? Avoidant Restrictive Food Intake Disorder Explained",
    metaDescription:
      "ARFID is an eating disorder where someone eats too little or too narrow a range of food, without the body-image concerns of anorexia. What it is, how it differs from picky eating, and when to seek an assessment.",
    answer:
      "ARFID, avoidant/restrictive food intake disorder, is an eating disorder in which " +
      "someone eats too little food or too narrow a range of it to meet their " +
      "nutritional needs, and the avoidance is not driven by concern about body shape or " +
      "weight. It was added to the DSM-5 in 2013 and is diagnosed at any age.",
    intro: [
      "The last clause is what separates ARFID from anorexia and bulimia. Someone with " +
        "ARFID is not trying to lose weight. They avoid food because it is frightening, " +
        "because it feels wrong in the mouth, or because eating simply does not interest " +
        "them, and the avoidance has consequences serious enough to matter.",
      "That is also what separates it from ordinary picky eating, which is common, " +
        "usually stable, and tends to loosen with age. ARFID does not loosen on its own, " +
        "and the list of accepted foods often gets shorter rather than longer.",
    ],
    sections: [
      {
        heading: "The three patterns the DSM-5 describes",
        paragraphs: [
          "The DSM-5 sets out three reasons someone with ARFID avoids food. They overlap " +
            "and plenty of people show more than one, but they point toward different kinds " +
            "of help, so it is worth knowing which is in front of you.",
        ],
        bullets: [
          "Sensory avoidance. Food is rejected on how it feels, smells, looks or sounds. This is the pattern most often mistaken for stubbornness, and it is the one a parent is most likely to recognise from years of watching their child gag at a texture nobody else noticed.",
          "Lack of interest in eating. Appetite is low or absent, meals are forgotten, and eating feels like a chore rather than a pleasure. Weight and growth are usually where this one shows up first.",
          "Fear of aversive consequences. Eating is avoided because of what might happen: choking, vomiting, pain. This one often starts with a single event that everyone else has forgotten about.",
        ],
      },
      {
        heading: "When to ask for an assessment",
        paragraphs: [
          "None of the following diagnoses anything. They are the situations where the " +
            "answer is a professional rather than another strategy from the internet.",
        ],
        bullets: [
          "The list of accepted foods is getting shorter over months rather than longer.",
          "Weight is dropping, or a child is not gaining along their own established line.",
          "Nutritional supplements or drinks are doing the work meals used to do.",
          "Eating is causing real distress rather than negotiation, for the person eating or for the household.",
          "Mealtimes have started to shape what the family can do: which invitations get declined, which trips do not happen.",
        ],
      },
      {
        heading: "Who assesses and treats it",
        paragraphs: [
          "A diagnosis comes from a clinician, usually a doctor, a psychologist or a " +
            "psychiatrist, often after a feeding evaluation. Treatment tends to involve " +
            "more than one person: a feeding therapist or speech-language pathologist for " +
            "the mechanics of eating, a registered dietitian for what the body is missing, " +
            "and often a therapist for the anxiety wrapped around it.",
          "Ask your child's pediatrician for a referral. In the United States, an eating " +
            "disorder that affects a child's ability to learn can also route through the " +
            "school system, which is worth asking about because it is free.",
        ],
      },
      {
        heading: "Where meal planning fits, and where it does not",
        paragraphs: [
          "Food chaining, the feeding therapy method published by Cheri Fraker, RD and " +
            "Laura Walbert, SLP, expands a diet by starting from a food already accepted " +
            "and changing one attribute at a time: taste, texture, shape or preparation, " +
            "while everything else stays the same. That approach is what EatPal is built " +
            "around, and it is the part of the work that happens at home between " +
            "appointments.",
          "It is not the appointments. Planning meals around a short accepted list makes " +
            "the week workable and gives a therapist something to look at; it does not " +
            "replace the assessment that tells you what is actually going on.",
        ],
      },
    ],
    careNote: NOT_TREATMENT,
    faqs: [
      {
        question: "Is ARFID the same as being a picky eater?",
        answer:
          "No. Picky eating is common and usually stable, and the range of accepted foods " +
          "tends to widen slowly with age. ARFID involves avoidance serious enough to " +
          "affect weight, growth, nutrition or daily life, and the range often narrows " +
          "instead. Where the line falls is a clinical judgement.",
      },
      {
        question: "Can adults have ARFID?",
        answer:
          "Yes. ARFID is diagnosed at any age. Many adults with it grew up being called " +
          "fussy and never had the pattern named, and the referral to ask for is the same " +
          "one a parent would ask for on a child's behalf.",
      },
      {
        question: "What does ARFID stand for?",
        answer:
          "Avoidant/restrictive food intake disorder. It replaced the older DSM category " +
          "of feeding disorder of infancy or early childhood when the DSM-5 was published " +
          "in 2013, which is part of why it is less familiar than anorexia or bulimia.",
      },
      {
        question: "Does ARFID go away on its own?",
        answer:
          "It is not something to wait out. Ordinary picky eating usually loosens with " +
          "age; ARFID is defined partly by the fact that the restriction persists and " +
          "carries consequences. If you are asking the question, that is a reason to book " +
          "the assessment rather than another six months of waiting.",
      },
    ],
    related: ["arfid-vs-picky-eating", "safe-foods-list", "arfid-in-adults"],
  },
  {
    slug: "safe-foods-list",
    h1: "ARFID Safe Foods List",
    title: "ARFID Safe Foods List: How to Build the One That Fits Your Child",
    metaDescription:
      "There is no universal ARFID safe foods list, because safe foods are individual. Here is how to write down the one your child actually has, protect it from burnout, and add to it.",
    answer:
      "A safe food is one a person with ARFID can eat reliably, without the sensory or " +
      "anxiety response other foods set off. There is no universal ARFID safe foods " +
      "list: a safe food for one person is intolerable to the next, so the list worth " +
      "having is the one you write down for the person in front of you.",
    intro: [
      "Searching for a downloadable ARFID food list is reasonable and the results are " +
        "mostly unhelpful, because they are somebody else's list. Chicken nuggets, plain " +
        "pasta and crackers turn up on every one of them, and if your child rejects all " +
        "three you have learned nothing.",
      "What does transfer between people is the method: how to record a safe food " +
        "precisely enough to reorder it, how to keep one from burning out, and how to add " +
        "the next one. That is what this page covers.",
    ],
    sections: [
      {
        heading: "Write down the brand, not the food",
        paragraphs: [
          "\"Chicken nuggets\" is not a safe food. A specific brand, in a specific shape, " +
            "cooked a specific way, on a specific plate, is a safe food. Families learn " +
            "this the hard way when a supermarket changes a supplier and a reliable dinner " +
            "stops working overnight.",
          "Record enough detail that a stranger could shop from your list: brand, product " +
            "name, packaging, how it is cooked, how it is served, what it is served with " +
            "and what it must not touch. Photograph the packaging. When the recipe changes " +
            "or the line is discontinued, that photograph is what you take to the " +
            "substitute.",
        ],
      },
      {
        heading: "Group the list by what the foods have in common",
        paragraphs: [
          "Once the list is written down, sort it by attribute rather than by meal. The " +
            "shared attributes are the map of what is actually acceptable, and they are " +
            "where the next food comes from.",
        ],
        bullets: [
          "Texture: dry and crunchy, smooth and uniform, soft and even. Most lists cluster hard around one or two.",
          "Temperature: several safe lists are entirely room temperature or entirely hot, and a food served at the wrong one is a different food.",
          "Colour: beige-heavy lists are common enough to be a cliche, and the pattern is real information rather than a joke.",
          "Packaging and presentation: whether it arrives in its own wrapper, whether it can touch anything else, which plate it needs.",
          "Preparation: air fried and oven baked are not interchangeable if the surface comes out different.",
        ],
      },
      {
        heading: "Protect the list from burnout",
        paragraphs: [
          "Food burnout is when a safe food stops being safe, usually after it has carried " +
            "too many meals in a row, and it is the single worst thing that can happen to a " +
            "short list. Losing one food off a list of eight is not an eighth of a problem; " +
            "it can take a fortnight of meals with it.",
          "Rotating safe foods rather than leaning on this week's favourite is the usual " +
            "defence, and it is the least intuitive advice on this page, because the " +
            "obvious move when something works is to serve it again tomorrow. Keeping more " +
            "than one option in play for each meal costs a little friction now against a " +
            "food you do not lose later.",
        ],
      },
      {
        heading: "Add to the list one attribute at a time",
        paragraphs: [
          "Food chaining, the feeding therapy method published by Cheri Fraker, RD and " +
            "Laura Walbert, SLP, works outward from a food already on the list by changing " +
            "one attribute and holding everything else constant. Same brand of cracker, " +
            "different shape. Same nugget, different dip beside it, not on it.",
          "A step that changes two things at once is not a smaller step, it is a new food, " +
            "and it usually fails. When one does fail, the food it started from stays on " +
            "the list; go back to it and take a smaller step next time rather than treating " +
            "the refusal as a setback.",
        ],
      },
    ],
    careNote: NOT_TREATMENT,
    faqs: [
      {
        question: "Is there a standard ARFID safe foods list?",
        answer:
          "No, and any list presented as standard should be read as one family's list. " +
          "Safe foods are individual, which is why this page is about building your own " +
          "rather than downloading someone else's.",
      },
      {
        question: "How many safe foods do people with ARFID usually have?",
        answer:
          "It varies far too much to put a number on, and any number quoted without the " +
          "study behind it is guesswork. What matters more than the count is the " +
          "direction: a list that is shrinking over months is the thing to raise with a " +
          "clinician.",
      },
      {
        question: "What do I do when a safe food gets discontinued?",
        answer:
          "Work from the attributes rather than the product. Take your notes and the " +
          "packaging photograph and look for the closest match on texture and appearance " +
          "first, since those usually carry more weight than flavour. Introduce the " +
          "substitute while the original is still available if you have any warning.",
      },
      {
        question: "Should I hide new foods inside safe foods?",
        answer:
          "Hiding food inside an accepted one risks the accepted one. If it is detected, " +
          "and with a sensory-driven eater it usually is, you can lose the safe food along " +
          "with the trust that the plate contains what it appears to contain. Put the new " +
          "food beside it instead.",
      },
    ],
    related: ["what-is-arfid", "arfid-vs-picky-eating", "arfid-in-adults"],
  },
  {
    slug: "arfid-vs-picky-eating",
    h1: "ARFID vs Picky Eating",
    title: "ARFID vs Picky Eating: How to Tell the Difference",
    metaDescription:
      "Picky eating is common, stable and tends to widen with age. ARFID restricts enough to affect weight, growth or daily life, and often narrows. The differences that actually matter, and when to get an assessment.",
    answer:
      "Picky eating means a narrow but stable list of accepted foods that usually widens " +
      "with age. ARFID means avoidance serious enough to affect weight, growth, nutrition " +
      "or daily life, without concern about body shape driving it, and the list of " +
      "accepted foods often narrows instead. The line between them is a clinical " +
      "judgement, not a checklist.",
    intro: [
      "Almost every parent who searches this has already been told their child is just " +
        "fussy, usually by someone who has not sat through the meals. The question behind " +
        "the search is not really about definitions. It is whether this warrants a " +
        "referral.",
      "The differences below are the ones clinicians actually weigh. None of them settles " +
        "the question on its own, and a child can look like several at once.",
    ],
    sections: [
      {
        heading: "Direction of travel",
        paragraphs: [
          "This is the most useful single signal and the easiest to check. Picky eating " +
            "loosens. Slowly, unevenly, with reversals, but over a year or two the list " +
            "gets longer. ARFID does not, and the list frequently gets shorter as foods " +
            "burn out and nothing replaces them.",
          "Look back rather than at this week. What could your child eat two years ago " +
            "that they cannot eat now? If that question has answers, it matters more than " +
            "anything that happened at dinner last night.",
        ],
      },
      {
        heading: "Consequences",
        paragraphs: [
          "Picky eating is inconvenient. ARFID has costs that show up somewhere " +
            "measurable, and that is much of what the diagnosis turns on.",
        ],
        bullets: [
          "Weight loss, or a child falling away from their own growth line rather than off a population chart.",
          "Nutritional gaps a doctor can see, or supplements and drinks doing work that meals used to do.",
          "Distress rather than negotiation: a child who is frightened rather than holding out for something better.",
          "A household reorganised around it, where invitations, holidays and school trips get declined over food.",
        ],
      },
      {
        heading: "What is driving the avoidance",
        paragraphs: [
          "A picky eater usually has preferences. Someone with ARFID usually has a reason " +
            "and can sometimes name it: the texture is unbearable, the smell is too much, " +
            "they choked once and have not eaten that shape since, or eating simply does " +
            "not appeal at all.",
          "The distinction matters because it is what neither pressure nor rewards can " +
            "reach. A child holding out for chicken nuggets responds to a rule at the " +
            "table. A child who gags on the texture does not, and pressure at that point " +
            "makes the next meal worse.",
        ],
      },
      {
        heading: "What both have in common",
        paragraphs: [
          "The home strategy is largely the same either way, which is worth saying because " +
            "it means you are not waiting on a diagnosis to start. Work from foods already " +
            "accepted, change one attribute at a time, keep pressure off the table, and " +
            "keep a written list.",
          "What the diagnosis changes is who else is involved and what else gets checked: " +
            "bloodwork, growth, and the anxiety that often travels with it. That part " +
            "cannot be done at home.",
        ],
      },
    ],
    careNote: NOT_TREATMENT,
    faqs: [
      {
        question: "How do I know if my child has ARFID or is just picky?",
        answer:
          "You do not, from a web page, and that is the honest answer. The signals worth " +
          "acting on are a list that is shrinking over months, weight or growth falling " +
          "away, distress rather than bargaining, and a family reorganising around food. " +
          "Any of those is a reason to ask your pediatrician for a feeding assessment.",
      },
      {
        question: "Can a child grow out of ARFID?",
        answer:
          "ARFID is distinguished partly by the fact that it persists where ordinary picky " +
          "eating resolves. Treating it as a phase to wait out is the mistake the " +
          "diagnosis exists to prevent.",
      },
      {
        question: "Is ARFID a form of autism?",
        answer:
          "No, they are separate diagnoses, though they co-occur often enough that a " +
          "feeding assessment for an autistic child is a normal thing to ask for. Sensory " +
          "sensitivity is common to both, which is part of why the eating can look " +
          "similar.",
      },
      {
        question: "Does pressure at mealtimes make picky eating worse?",
        answer:
          "It reliably makes sensory-driven avoidance worse, because the food was never " +
          "the negotiable part. Where the avoidance is a preference rather than a sensory " +
          "response, pressure works in the short term and costs trust at the table, which " +
          "is the thing you need most if this turns out to be the other kind.",
      },
    ],
    related: ["what-is-arfid", "safe-foods-list", "arfid-in-adults"],
  },
  {
    slug: "arfid-in-adults",
    h1: "ARFID in Adults",
    title: "ARFID in Adults: Signs, Assessment and What Helps",
    metaDescription:
      "ARFID is diagnosed at any age, and many adults with it were called fussy as children and never assessed. What it looks like in adulthood, how to get assessed, and what actually helps.",
    answer:
      "ARFID is diagnosed at any age, not only in childhood. In adults it usually looks " +
      "like a narrow list of reliable foods carried since childhood, arranged around " +
      "rather than treated, and it is frequently reached adulthood without ever being " +
      "named as anything other than fussiness.",
    intro: [
      "Adults searching this have usually spent decades managing it privately: eating " +
        "before events, checking menus in advance, ordering the same thing everywhere, " +
        "declining invitations that are really about food. None of that is unusual and " +
        "none of it means the pattern is untreatable.",
      "The obstacle is more often that nobody ever put a name to it. An adult who was " +
        "called a fussy eater at seven is rarely offered a feeding assessment at thirty.",
    ],
    sections: [
      {
        heading: "What it looks like in adulthood",
        paragraphs: [
          "The pattern is the same as in childhood; the accommodations are just better " +
            "hidden, because an adult controls their own kitchen and their own diary.",
        ],
        bullets: [
          "A list of reliable foods that has stayed roughly the same for years, or shortened.",
          "Eating beforehand so that a meal out can be got through without eating much.",
          "Checking a menu before agreeing to a restaurant, and ordering the same dish every time.",
          "Work lunches, dates and holidays planned around what can be eaten rather than where you want to be.",
          "Blood results, dental problems or fatigue that trace back to a narrow diet.",
        ],
      },
      {
        heading: "Getting assessed as an adult",
        paragraphs: [
          "Start with your GP or primary care doctor and describe the consequences rather " +
            "than the preferences: what you cannot eat, what it costs you, and what your " +
            "bloodwork looks like. Ask specifically about eating disorder services, and say " +
            "the word ARFID, because adult eating disorder services are often assumed to " +
            "be for anorexia and bulimia and you may need to steer the referral.",
          "It is worth saying explicitly that this is not about body image, since that is " +
            "the assumption most services will start from and correcting it early saves an " +
            "appointment.",
        ],
      },
      {
        heading: "What helps between appointments",
        paragraphs: [
          "The same approach that works for children works for adults, with the advantage " +
            "that you are the one deciding: food chaining, the feeding therapy method " +
            "published by Cheri Fraker, RD and Laura Walbert, SLP, starting from a food " +
            "already reliable and altering one attribute at a time.",
          "Adults tend to try to skip steps, because the whole thing feels childish and " +
            "the temptation is to prove otherwise by going straight at a difficult food. " +
            "Smaller steps than feel dignified is the advice, and it is the reason keeping " +
            "a written list helps: progress across a narrow diet is invisible from " +
            "inside it.",
        ],
      },
    ],
    careNote: NOT_TREATMENT,
    faqs: [
      {
        question: "Can you develop ARFID as an adult?",
        answer:
          "Yes. It can begin in adulthood, often after a choking episode, food poisoning " +
          "or an illness that made eating painful. More commonly it started in childhood " +
          "and was never assessed.",
      },
      {
        question: "Who diagnoses ARFID in adults?",
        answer:
          "Usually an eating disorder service, a psychologist or a psychiatrist, reached " +
          "through your GP or primary care doctor. Say ARFID by name in the referral " +
          "conversation, since adult services are often set up around anorexia and " +
          "bulimia.",
      },
      {
        question: "Is ARFID in adults treatable?",
        answer:
          "It is treated, by feeding therapists, dietitians and therapists working on the " +
          "anxiety around eating. What that treatment looks like and how well it works for " +
          "any individual is a question for the clinician doing it, not for a meal " +
          "planning app.",
      },
      {
        question: "Do I need a diagnosis to start expanding what I eat?",
        answer:
          "No. Working outward from foods you already eat, one attribute at a time, does " +
          "not require anyone's permission. Get assessed anyway if your diet is affecting " +
          "your health, because the parts that need bloodwork and a dietitian cannot be " +
          "done alone.",
      },
    ],
    related: ["what-is-arfid", "arfid-vs-picky-eating", "safe-foods-list"],
  },
];

/** Route paths for the cluster, used by the sitemap and prerender tests. */
export const ARFID_ROUTES: readonly string[] = ARFID_PAGES.map(
  (page) => `/arfid/${page.slug}`,
);

export function getArfidPage(slug: string | undefined): ArfidPage | undefined {
  if (!slug) return undefined;
  return ARFID_PAGES.find((page) => page.slug === slug);
}
