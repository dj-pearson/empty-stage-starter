/**
 * Prose for the two free tool pages, /picky-eater-quiz and /budget-calculator.
 *
 * Both pages rank without deserving to. /picky-eater-quiz prerenders 106 words and sits
 * at position 10.8 on 1,754 impressions; "picky eater quiz" and "picky eater test" are
 * the site's second and fourth queries by impressions. /budget-calculator prerenders 270
 * words at position 21.8 on 2,566 impressions. In both cases the page is an interactive
 * form with nothing on it to read, so there is nothing for Google to rank on and nothing
 * for an assistant to quote.
 *
 * Most of the fix is surfacing content that already exists. The six eating patterns in
 * src/lib/quiz/personalityTypes.ts are the best writing on the site and were reachable
 * only by finishing the quiz and then handing over an email address. The quiz page now
 * renders all six before you start.
 *
 * The query data also shows an intent this site answers for nobody: "am i a picky eater
 * quiz" and "are you a picky eater quiz" are adults asking about themselves, and every
 * word here is addressed to a parent about a child. QUIZ_PAGE.adultNote answers them
 * without pretending the quiz is an adult ARFID screen, which it is not.
 *
 * Rules, same as src/lib/meal-ideas-content.ts and enforced the same way in
 * src/lib/tool-page-content.test.ts:
 *
 * 1. No statistic that is not attributed to something a reader can check. The USDA
 *    figures below are quoted from the table in src/lib/budgetCalculator/usdaData.ts,
 *    which cites fns.usda.gov, so they are fair game. Nothing else is.
 * 2. No clinical claim, and no implication that EatPal assesses or treats anything.
 *    Where a question edges toward diagnosis the answer says a clinician does that.
 * 3. Describe the tool as it is actually built. The budget calculator does not ask for
 *    ages and assumes 35 and 8; it has no waste factor; the quiz gates its food
 *    recommendations behind an email. All three are said out loud rather than papered
 *    over, because a page that oversells the tool is the same failure as a page that
 *    invents a credential.
 */

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolHowToStep {
  name: string;
  text: string;
}

export interface ToolPageContent {
  /** The route this content renders on, checked against the prerender list. */
  route: string;
  /**
   * The direct answer, rendered first under the h1. Assistants quote the sentence that
   * answers the question, and an interactive form gives them nothing to quote.
   */
  answer: string;
  /** Body paragraphs under the answer. */
  intro: string[];
  /** Rendered as visible steps and as HowTo markup. */
  howTo: {
    name: string;
    description: string;
    /** ISO 8601 duration. */
    totalTime: string;
    steps: ToolHowToStep[];
  };
  /** Rendered as a visible list and as FAQPage markup. */
  faqs: ToolFaq[];
}

export const QUIZ_PAGE: ToolPageContent & {
  /** Answers the adult self-assessment queries the quiz itself does not serve. */
  adultNote: { heading: string; body: string[] };
} = {
  route: "/picky-eater-quiz",
  answer:
    "The picky eater quiz is twelve questions about what your child eats, how they react " +
    "to unfamiliar food, and what actually happens at the table. It takes about two " +
    "minutes, and it sorts the answers into one of six eating patterns so you can pick " +
    "strategies that fit yours. It is not a diagnosis.",
  intro: [
    "Refusing food is one behaviour with several unrelated causes. A child who gags on " +
      "anything mushy, a child who eats only beige food, and a child who would happily eat " +
      "a wide range as long as nothing on the plate touches are three different problems. " +
      "The advice that solves one does nothing for the other two, which is why so much " +
      "picky eating advice reads as useless: it was written for a different child.",
    "The six patterns are listed further down this page, with the behaviours that point " +
      "to each one. Nothing is held back until you take the quiz. Most children look " +
      "mostly like one pattern with a bit of another, and the quiz is faster than reading " +
      "all six and guessing.",
    "A quiz is not an assessment. If your child's list of accepted foods is getting " +
      "shorter rather than longer, if they are losing weight or not gaining it, or if " +
      "mealtimes involve real distress rather than negotiation, that is a conversation " +
      "with your pediatrician or a feeding therapist, and it should not wait behind a web " +
      "form.",
  ],
  adultNote: {
    heading: "Taking this for yourself?",
    body: [
      "Plenty of people arrive here searching for a picky eater quiz for themselves rather " +
        "than for a child, and every question below is phrased for a parent. You can still " +
        "answer for yourself by reading \"your child\" as \"you\". The six patterns hold up: " +
        "texture sensitivity, needing foods kept separate, and eating from a short reliable " +
        "list do not stop at eighteen.",
      "What the quiz cannot do is tell you whether you have ARFID. ARFID is diagnosed at " +
        "any age, not only in childhood, and finding out means an assessment with a " +
        "clinician rather than a questionnaire on a website. If your own eating has " +
        "narrowed to the point where it affects your health, your bloodwork or your social " +
        "life, that is the referral to ask for.",
    ],
  },
  howTo: {
    name: "How to find your child's eating pattern",
    description:
      "Identify which of the six eating patterns describes your child, then change one " +
      "thing at a time starting from a food they already accept.",
    totalTime: "PT10M",
    steps: [
      {
        name: "Write down what they already eat",
        text:
          "List the foods your child has eaten in the last week without a fight. This list " +
          "matters more than the list of foods they refuse, because every step that " +
          "follows starts from something already on it.",
      },
      {
        name: "Answer the twelve questions",
        text:
          "Answer for the child in front of you rather than the child you are hoping for. " +
          "The result is only as useful as the honesty of the answers, and nobody else " +
          "sees them.",
      },
      {
        name: "Check the pattern against last week's meals",
        text:
          "Read the common behaviours listed for your result. If three or four of them " +
          "describe meals in your house, the match is right. If none do, read the other " +
          "five patterns and take the one that fits.",
      },
      {
        name: "Change one attribute at a time",
        text:
          "Take a food from your list and alter a single thing about it: the brand, the " +
          "shape, the temperature, the dip next to it. Keep everything else identical. " +
          "That is what food chaining is, and it is why knowing the pattern matters.",
      },
    ],
  },
  faqs: [
    {
      question: "How long does the picky eater quiz take?",
      answer:
        "Twelve questions, about two minutes. There is no account to create and no payment " +
        "at any point. Your personality type result is shown straight away; the food " +
        "recommendations that go with it ask for an email address first.",
    },
    {
      question: "Is there a picky eater quiz for adults?",
      answer:
        "This one is written about a child, but the six patterns describe adults just as " +
        "well, so you can answer for yourself by reading \"your child\" as \"you\". It will " +
        "not tell you whether you have ARFID, which is something a clinician assesses.",
    },
    {
      question: "What are the six picky eater personality types?",
      answer:
        "The Texture Detective, The Beige Brigade, The Slow Explorer, The Visual Critic, " +
        "The Mix Master and The Flavor Seeker. All six are described on this page, with " +
        "the behaviours that point to each one, before you answer anything.",
    },
    {
      question: "Does this quiz diagnose ARFID?",
      answer:
        "No. ARFID, avoidant restrictive food intake disorder, is diagnosed by a clinician " +
        "after an assessment, and no questionnaire on a website can stand in for that. The " +
        "quiz describes a pattern of eating so you can choose strategies that suit it.",
    },
    {
      question: "What is the difference between picky eating and ARFID?",
      answer:
        "Picky eating usually means a narrow but stable list of accepted foods that widens " +
        "slowly with age. ARFID involves avoidance serious enough to affect weight, growth " +
        "or nutrition, or to interfere with normal life, and the list of accepted foods " +
        "often gets narrower instead of wider. Where the line falls is a clinical " +
        "judgement, not a quiz score.",
    },
    {
      question: "Is the picky eater quiz free?",
      answer:
        "Yes. The quiz and your result cost nothing and need no account. EatPal is a paid " +
        "meal planning app and this page links to it, but the quiz is not a trial and does " +
        "not expire.",
    },
  ],
};

export const BUDGET_PAGE: ToolPageContent = {
  route: "/budget-calculator",
  answer:
    "The grocery budget calculator estimates what your household should spend on food " +
    "each month, starting from the USDA Food Plans and adjusting for how many adults and " +
    "children you have, which state you live in, and any dietary restrictions. It returns " +
    "all four USDA levels and recommends the moderate one.",
  intro: [
    "The USDA publishes what food costs a household that cooks at home, split by age and " +
      "by four spending levels, and updates it every month. The thrifty plan is the one " +
      "SNAP benefit amounts are calculated from. The moderate plan is the middle of the " +
      "four and the one this calculator recommends. The 2024 figures it uses come from " +
      "the USDA Food Plans cost of food reports at fns.usda.gov.",
    "For two adults and two school-age children, those figures work out at $818 a month " +
      "on the thrifty plan, $1,072 on low-cost, $1,334 on moderate and $1,604 on liberal, " +
      "before any state adjustment. Twenty-six states then move that up or down: Hawaii " +
      "and Alaska are the two highest, Mississippi the lowest, and a state without its " +
      "own adjustment keeps the national figure.",
    "Two things the arithmetic does not do, both worth knowing before you trust the " +
      "number. It never asks anyone's age, so it assumes an adult of 35 and a child of 8; " +
      "if your children are teenagers the real cost is higher, because USDA costs for a " +
      "12 to 18 year old exceed those for a 6 to 11 year old at every level. And it has " +
      "no waste factor, which matters here more than most places.",
    "Picky eating costs money in a way no food plan models. You buy the safe foods, then " +
      "you buy what everyone else is eating, and a share of the second gets scraped into " +
      "the bin uneaten. Treat the calculator's number as what a household spends when " +
      "everyone eats the same meal, and expect to sit above it while a short accepted " +
      "food list is doing the shopping.",
  ],
  howTo: {
    name: "How to set a grocery budget for a family",
    description:
      "Work out a monthly grocery figure from the USDA Food Plans, adjust it for where " +
      "you live, and check it against what you actually spent.",
    totalTime: "PT15M",
    steps: [
      {
        name: "Count who you are feeding",
        text:
          "Adults and children separately, because the USDA figures differ by a wide " +
          "margin. Anyone eating most meals at your table counts, including a child who " +
          "is only there half the week.",
      },
      {
        name: "Pick the plan level that matches how you shop",
        text:
          "Thrifty assumes every meal is cooked at home from the cheapest workable " +
          "ingredients. Liberal assumes convenience and cuts of meat you chose rather " +
          "than settled for. Most households that cook most nights land on moderate.",
      },
      {
        name: "Adjust for your state and your restrictions",
        text:
          "Regional food costs move the figure by a lot more than people expect, and a " +
          "gluten-free or dairy-free household pays a premium on staples that the " +
          "national number does not carry.",
      },
      {
        name: "Compare it against last month's actual spend",
        text:
          "Pull one month of grocery receipts or one month of card statements. The gap " +
          "between that and the calculator is the useful output, not the calculator's " +
          "number on its own.",
      },
    ],
  },
  faqs: [
    {
      question: "How much should a family of four spend on groceries per month?",
      answer:
        "Using USDA 2024 food plan costs, this calculator puts two adults and two " +
        "school-age children at $1,334 a month on the moderate plan before any state " +
        "adjustment. The same family comes to $818 on the thrifty plan, $1,072 on " +
        "low-cost and $1,604 on liberal. Where you live moves all four.",
    },
    {
      question: "What are the four USDA food plans?",
      answer:
        "Thrifty, low-cost, moderate and liberal, in rising order of what they assume you " +
        "spend. The thrifty plan is what SNAP benefit amounts are calculated from. All " +
        "four assume meals are prepared at home, so none of them include takeaway or " +
        "eating out.",
    },
    {
      question: "Why does the calculator ask which state I live in?",
      answer:
        "Because food costs are not national. The USDA figures are a country-wide average, " +
        "and this calculator scales them by state: Hawaii and Alaska sit well above the " +
        "average, Mississippi well below it. Twenty-six states carry their own adjustment " +
        "and the rest use the national figure unchanged.",
    },
    {
      question: "Does having a picky eater make groceries more expensive?",
      answer:
        "In most houses, yes, and this calculator does not account for it. You end up " +
        "buying the safe foods and buying what the rest of the family is eating, and some " +
        "of the second gets thrown out. There is no waste factor in the arithmetic, so " +
        "read the result as a floor rather than a target.",
    },
    {
      question: "What ages does the grocery budget calculator assume?",
      answer:
        "It does not ask, so it assumes every adult is 35 and every child is 8. USDA costs " +
        "for a 12 to 18 year old are higher than for a 6 to 11 year old on all four plan " +
        "levels, so a household with teenagers should expect to spend more than the figure " +
        "shown here.",
    },
    {
      question: "Is the grocery budget calculator free?",
      answer:
        "Yes, and it needs no account. Your budget and the full breakdown appear straight " +
        "away. Saving that breakdown as a PDF asks for an email address first.",
    },
  ],
};
