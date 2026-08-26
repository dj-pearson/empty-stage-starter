/**
 * The claim register for EatPal's live marketing surfaces (US-655).
 *
 * Three times now this repo has had to remediate copy that said something the
 * product could not back: the invented author credentials in src/pages/Authors.tsx,
 * the invented aggregateRating, and the grocery-delivery integrations llms.txt
 * advertised while every provider call in the edge function was commented out.
 * US-649 found the fourth batch while checking which audiences the product
 * genuinely serves.
 *
 * The pattern in all four is the same: copy is written once, the feature it
 * describes never lands or is later removed, and nothing connects the two. This
 * module is that connection, and src/lib/marketingClaims.test.ts enforces it.
 *
 * WHAT THIS DOES NOT DO: it cannot tell you whether a claim is *true*, only
 * whether anything in the repo backs it. A compliance certification is not a
 * file, which is why COMPLIANCE_TERMS is a denylist rather than an evidence map.
 */

/**
 * Every file that tells the outside world what EatPal is. The /privacy page's
 * meta lives in seo-config.ts, which is why the page itself is not listed
 * separately -- its body is prose about obligations, not a claim register.
 */
export const MARKETING_SURFACES = [
  'public/llms.txt',
  'public/llms-full.txt',
  'src/lib/seo-config.ts',
  'index.html',
  'src/pages/Landing.tsx',
] as const;

/**
 * Certification-style claims. Each of these asserts that an external body, an
 * audit or a statute has been satisfied, which no amount of code in this repo
 * can evidence -- so the rule is simply that they do not appear.
 *
 * Not on this list, deliberately: GDPR, CCPA/CPRA and COPPA. The privacy policy
 * has sections setting out what it does under each, which is a description of
 * obligations rather than a claim of certification. "GDPR compliant" as a
 * marketing badge would still be caught by the badge patterns below.
 */
export const COMPLIANCE_TERMS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /HIPAA/i,
    why: 'No BAA, no covered-entity relationship, and no professional tier to attach it to (US-654).',
  },
  {
    pattern: /SOC\s?-?2/i,
    why: 'Infrastructure claim about a self-hosted deployment, with no audit report behind it.',
  },
  { pattern: /ISO\s?27001/i, why: 'No certification.' },
  {
    pattern: /PCI[\s-]?DSS/i,
    why: 'Payment handling is delegated to Stripe; the claim would be about Stripe, not EatPal.',
  },
  { pattern: /FDA[\s-]?(approved|cleared)/i, why: 'This is not a medical device.' },
  {
    pattern: /\b(GDPR|CCPA|COPPA|WCAG)[^.\n]{0,20}\bcompliant\b/i,
    why: 'A compliance badge. Describe the obligation and link the evidence instead -- the VPAT for WCAG, the privacy policy for the rest.',
  },
];

/**
 * Unsourced scale and superlative claims, all of which this repo has shipped and
 * had to remove at least once: "#1", "200+ feeding therapists", "2,000+ families
 * helped", "over 10,000 families" (which contradicted the previous one on the
 * same site), "50,000+ meals planned", "4.9 stars".
 */
export const UNSOURCED_CLAIM_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\b(#\s?1|no\.\s?1)\b/i, why: 'Ranking claim with no ranking behind it.' },
  {
    pattern: /\bthe only\b[^.\n]{0,60}\b(platform|app|tool)\b/i,
    why: 'Category-exclusivity claim; nobody has surveyed the category.',
  },
  {
    pattern: /\b\d[\d,]*\+?\s+(families|therapists|parents|users|children|kids|meals)\b/i,
    why: 'Usage number with no source. Every one of these on the site has been wrong.',
  },
  {
    pattern: /\b\d+(\.\d+)?\s?%\s+(accuracy|success|of (parents|families|users))\b/i,
    why: 'Outcome statistic with no study behind it.',
  },
  { pattern: /\b\d(\.\d)?\s?(stars|\/\s?5)\b/i, why: 'Rating with no rating store behind it.' },
];

/**
 * Evidence for every entry in seoConfig.keyFeatures. Same mechanism as
 * src/lib/solutions-content.ts: the path has to exist, so a feature list cannot
 * outlive the feature. Add the file before you add the line.
 */
export const FEATURE_CLAIM_EVIDENCE: Record<string, string> = {
  'AI Predictive Food Acceptance': 'src/components/FoodChainingRecommendations.tsx',
  'Professional Therapist Dashboard': 'src/pages/dashboard/ProfessionalSettings.tsx',
};

/**
 * Claims that are still live and are NOT this story's to change, because they
 * describe what a purchasable tier promises. Removing them is a product
 * decision; US-654 is where that decision belongs. Recorded here with their
 * files so the decision has the full surface list rather than a sample.
 *
 * No line numbers on purpose: they rot. The test asserts the files exist.
 */
export const AWAITING_PRODUCT_DECISION: { file: string; claim: string }[] = [
  {
    file: 'src/pages/Pricing.tsx',
    claim:
      'The Professional plan is purchasable and is sold on "multi-client management, food chain design tools, shared progress data, and insurance-compatible documentation". None of the four exists.',
  },
  {
    file: 'src/pages/Landing.tsx',
    claim:
      'The therapist section offers a portal for shared goals and session notes, real-time meal logs between sessions, and insurance-compatible progress documentation. It also states the product "was built alongside SLPs, OTs, and pediatric dietitians", which is a provenance claim nothing in the repo evidences.',
  },
  {
    file: 'src/lib/seo-config.ts',
    claim:
      'strategicPillars and competitiveMoats contain internal positioning language ("Therapist Lock-In", "Data Insights Marketplace"). Nothing renders them today, which is the only reason they are not a live claim.',
  },
];
