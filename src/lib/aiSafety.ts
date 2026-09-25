/**
 * US-629: the user-facing half of the AI safety work.
 *
 * The model-facing rules live in supabase/functions/_shared/safety.ts. The Deno
 * and web trees cannot share modules, so the resource list is mirrored here and
 * src/lib/aiSafety.test.ts fails if the two drift. Change both or neither.
 */

export interface SafetyResource {
  name: string;
  contact: string;
  scope: string;
}

export const SAFETY_RESOURCES: SafetyResource[] = [
  {
    name: '988 Suicide & Crisis Lifeline',
    contact: 'call or text 988 (US)',
    scope: 'thoughts of suicide, self-harm, or being in crisis',
  },
  {
    name: 'ANAD Eating Disorders Helpline',
    contact: '1-888-375-7767',
    scope: 'disordered eating, food restriction, or purging',
  },
  {
    name: 'your pediatrician or emergency services',
    contact: '911 in an emergency (US)',
    scope: 'choking, allergic reaction, weight loss, or any medical symptom',
  },
];

/** Shown wherever the coach's output is displayed. */
export const AI_COACH_DISCLAIMER =
  'Answers are AI-generated general feeding guidance, not medical advice. ' +
  'For a medical concern, contact your pediatrician.';

/** Shown alongside the disclaimer so the numbers are on screen, not only in the model. */
export const CRISIS_HELP_LINE =
  'In a crisis, call or text 988 (US). For disordered eating, ANAD is at 1-888-375-7767.';

/**
 * US-632: shown before a photo is submitted to an AI feature.
 *
 * The capture dialogs said only "Analyzing image..." while the photo was being
 * sent to a third-party LLM. The decision to send a picture of your kitchen,
 * your receipt or your child's plate belongs to the person holding the camera,
 * which means before the shutter, not after.
 */
export const PHOTO_AI_NOTICE =
  'Your photo is sent to a third-party AI provider to identify items. ' +
  "We don't store it, and their business API terms don't use it for training.";

/**
 * Red flags in what a parent types, found without the model. The coach pins
 * an escalation card from these whether or not the model follows its own
 * safety rules, and whether or not the call succeeds.
 *
 * Whole words, any case. Deliberately broad: a card shown once too often
 * costs a glance, one missing costs far more.
 *
 * Known false positive, kept on purpose: "chokes up with emotion" matches
 * the choking pattern. Figurative uses are rare in a feeding question and
 * the emergency card is harmless when read by someone who is fine.
 */
export type RedFlagTier = 'emergency' | 'clinician' | 'eating_disorder' | 'crisis';

// Straight or curly apostrophe, written as an escape so no look-alike
// character sits in the source.
const APOS = "['\\u2019]";
const NUMBER_WORD =
  '(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';

const RED_FLAG_PATTERNS: Record<RedFlagTier, RegExp[]> = {
  emergency: [
    /\bchok(?:e|es|ed|ing)\b/i,
    new RegExp(`\\b(?:can${APOS}?t|cannot|can not|couldn${APOS}?t|could not)\\s+breathe?\\b`, 'i'),
    /\b(?:struggling|trouble|difficulty)\s+breathing\b/i,
    /\bturn(?:ing|ed|s)?\s+blue\b/i,
    /\bswelling\b/i,
    /\bswollen\b/i,
    /\bhives\b/i,
    /\banaphyla\w*/i,
  ],
  clinician: [
    /\blost\s+(?:\w+\s+)?weight\b/i,
    /\blosing\s+(?:\w+\s+)?weight\b/i,
    /\bnot\s+gaining\b/i,
    /\bdehydrat\w*/i,
    new RegExp(`\\b(?:hasn${APOS}?t|has not|hadn${APOS}?t|not)\\s+eaten\\s+(?:anything\\s+)?(?:in|for)\\s+${NUMBER_WORD}\\s+days?\\b`, 'i'),
    /\bvomit\w*\s+(?:\w+\s+)?(?:at|after)\s+(?:every\s+|each\s+|most\s+)?(?:meals?|eating|dinner|lunch|breakfast)\b/i,
  ],
  eating_disorder: [
    new RegExp(`\\bonly\\s+eats\\s+(?:about\\s+|like\\s+)?${NUMBER_WORD}\\s+(?:different\\s+)?foods?\\b`, 'i'),
    new RegExp(`\\b(?:won${APOS}?t|will not|refuses to)\\s+eat\\s+anything\\b`, 'i'),
    /\bfear\s+of\s+eating\b/i,
    /\bARFID\b/i,
  ],
  crisis: [
    /\bsuicid\w*/i,
    /\bself[-\s]?harm\w*/i,
    /\bwants?\s+to\s+die\b/i,
  ],
};

const TIER_ORDER: readonly RedFlagTier[] = ['emergency', 'crisis', 'clinician', 'eating_disorder'];

function resourceFor(tier: RedFlagTier): SafetyResource {
  const byName = (needle: string) =>
    SAFETY_RESOURCES.find((r) => r.name.includes(needle)) ?? SAFETY_RESOURCES[SAFETY_RESOURCES.length - 1];
  switch (tier) {
    case 'crisis':
      return byName('988');
    case 'eating_disorder':
      return byName('ANAD');
    default:
      // Emergencies and medical symptoms: the pediatrician / 911 entry.
      return byName('pediatrician');
  }
}

/**
 * The red-flag tiers a message hits, one entry per tier, emergency first,
 * each with the resource to show for it.
 */
export function detectRedFlags(text: string): { tier: RedFlagTier; resource: SafetyResource }[] {
  if (!text) return [];
  return TIER_ORDER.filter((tier) => RED_FLAG_PATTERNS[tier].some((re) => re.test(text))).map((tier) => ({
    tier,
    resource: resourceFor(tier),
  }));
}

/**
 * A tel: link for the number in a SafetyResource.contact, or null when there
 * is none: 'call or text 988 (US)' -> 'tel:988', '1-888-375-7767' ->
 * 'tel:18883757767'. Takes the first run of digits joined by hyphens or spaces.
 */
export function telHref(contact: string): string | null {
  const m = /\d(?:[\d -]*\d)?/.exec(String(contact ?? ''));
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  return digits.length >= 3 ? `tel:${digits}` : null;
}
