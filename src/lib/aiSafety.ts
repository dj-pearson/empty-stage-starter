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
