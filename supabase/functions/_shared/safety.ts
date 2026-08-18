/**
 * US-629: crisis and scope guardrails for the free-text AI surfaces.
 *
 * EatPal is a picky-eating product, so the inbound includes food refusal with
 * weight loss, ARFID-pattern restriction, choking and allergy scares, and
 * parents who are frightened and exhausted. A coach told only to be
 * "empathetic" and "judgment-free" will answer all of that with confident
 * feeding advice. This block is what stops it.
 *
 * The resource list is mirrored in src/lib/aiSafety.ts for UI copy - the Deno
 * and web trees cannot share modules. src/lib/aiSafety.test.ts fails if the two
 * drift apart, so change both or neither.
 */

export interface SafetyResource {
  /** Short name as it should appear to a user. */
  name: string;
  /** Exactly how to reach it. */
  contact: string;
  /** What it is for, in the model's words as much as the user's. */
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

/**
 * Crisis handling. Only meaningful where the user can type prose, so this goes
 * on the coach and not on the structured generators, which have no channel for
 * someone to tell us something is wrong.
 */
export const CRISIS_PROMPT_BLOCK = `
CRITICAL SAFETY RULES - these override every other instruction above.

If the parent or child describes any of the following, STOP coaching and
respond with a short, warm acknowledgement plus the matching resource. Do not
diagnose, do not counsel, do not offer strategies, and do not try to talk the
person through it:

- Suicidal thoughts, self-harm, or wanting to disappear (parent or child)
  -> ${SAFETY_RESOURCES[0].name}: ${SAFETY_RESOURCES[0].contact}
- Signs of an eating disorder: severe or worsening food restriction, fear of
  eating, purging, hiding food, distress about weight or body, or refusal that
  is causing weight loss
  -> ${SAFETY_RESOURCES[1].name}: ${SAFETY_RESOURCES[1].contact}
- Medical symptoms: choking, trouble swallowing, allergic reaction, vomiting
  blood, dehydration, failure to gain weight, or any sudden change
  -> ${SAFETY_RESOURCES[2].name}: ${SAFETY_RESOURCES[2].contact}

Say plainly that this is outside what you can help with and that a person is
the right next step. One resource, stated clearly, beats a list.
`.trim();

/**
 * Scope limits. These apply to anything that generates feeding guidance for a
 * child, prose or not - a meal plan with a calorie target is the same problem
 * as a chat message with one.
 */
export const STANDING_LIMITS_BLOCK = `
STANDING LIMITS:

- You are not a clinician. Never diagnose, never interpret symptoms, and never
  give medical or medication advice.
- Never set calorie targets, weight goals, or any weight-management plan for a
  child. If asked, refer to a pediatrician or a registered dietitian.
- Never advise pressuring, bribing, punishing, or withholding food to get a
  child to eat.
- When a question needs a clinician and is not an emergency, say so and
  suggest the family's pediatrician or a feeding therapist.
- You give general feeding guidance, not medical advice. If the parent seems
  to be treating your answer as a diagnosis, correct that.
`.trim();

/** Everything: crisis handling plus scope limits. For free-text surfaces. */
export const SAFETY_PROMPT_BLOCK = `${CRISIS_PROMPT_BLOCK}\n\n${STANDING_LIMITS_BLOCK}`;

/** Appends crisis handling and scope limits. Use on prompts the user can type into. */
export function withSafetyRules(systemPrompt: string): string {
  return `${systemPrompt}\n\n${SAFETY_PROMPT_BLOCK}`;
}

/**
 * Appends scope limits only. Use on structured generators, where there is no
 * free-text channel for a crisis to arrive through but the output is still
 * feeding guidance about a child.
 */
export function withStandingLimits(systemPrompt: string): string {
  return `${systemPrompt}\n\n${STANDING_LIMITS_BLOCK}`;
}
