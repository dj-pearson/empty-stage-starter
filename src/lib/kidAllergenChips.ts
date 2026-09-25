import { canonicalAllergen } from '@/lib/allergens';
import { isAllergyUnknown } from '@/lib/kidFit';
import type { Kid } from '@/types';

export type KidAllergenSeverity = 'mild' | 'moderate' | 'severe';

export interface KidAllergenChip {
  /** canonicalAllergen() of the allergen: stable across "Peanuts" / "peanut". */
  key: string;
  /** The first spelling the parent entered, title-cased. */
  label: string;
  severity: KidAllergenSeverity | null;
}

/**
 * The allergy fields this module reads. Declared here rather than taken from
 * Kid alone so the chips work whether or not Kid carries allergen_severity yet,
 * and because the stored severity map is free-form JSON (any key spelling, any
 * value).
 */
export type KidAllergyFields = Pick<Kid, 'allergens'> & {
  allergen_severity?: Partial<Record<string, string>> | null;
};

const SEVERITY_RANK: Record<KidAllergenSeverity, number> = { severe: 0, moderate: 1, mild: 2 };
const UNKNOWN_RANK = 3;

function asSeverity(value: unknown): KidAllergenSeverity | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v === 'mild' || v === 'moderate' || v === 'severe' ? v : null;
}

function titleCase(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * One chip per allergen, deduped by canonical name, with its severity.
 *
 * The severity map's keys are whatever spelling was saved ("peanuts", "Milk",
 * "dairy"), so each key is canonicalized before it is matched: a severe peanut
 * allergy stored under "peanuts" must still read severe on a chip labelled
 * "Peanut". When two keys fold onto the same allergen the worse one wins.
 * Sorted severe, moderate, mild, then unknown, keeping entry order within a tier.
 */
export function kidAllergenChips(kid: KidAllergyFields): KidAllergenChip[] {
  const severityByKey = new Map<string, KidAllergenSeverity>();
  for (const [raw, value] of Object.entries(kid.allergen_severity ?? {})) {
    const key = canonicalAllergen(raw);
    const sev = asSeverity(value);
    if (!key || !sev) continue;
    const prev = severityByKey.get(key);
    if (!prev || SEVERITY_RANK[sev] < SEVERITY_RANK[prev]) severityByKey.set(key, sev);
  }

  const seen = new Set<string>();
  const chips: KidAllergenChip[] = [];
  for (const raw of kid.allergens ?? []) {
    if (typeof raw !== 'string') continue;
    const key = canonicalAllergen(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chips.push({ key, label: titleCase(raw), severity: severityByKey.get(key) ?? null });
  }

  const rank = (c: KidAllergenChip) => (c.severity ? SEVERITY_RANK[c.severity] : UNKNOWN_RANK);
  return chips
    .map((chip, index) => ({ chip, index }))
    .sort((a, b) => rank(a.chip) - rank(b.chip) || a.index - b.index)
    .map(({ chip }) => chip);
}

/**
 * 'unknown' when allergies were never recorded (allergens undefined), 'none'
 * when the parent said there are none ([]), 'listed' otherwise. A list holding
 * only blanks counts as 'none': there is nothing to show a chip for.
 */
export function kidAllergyState(kid: Pick<Kid, 'allergens'>): 'unknown' | 'none' | 'listed' {
  if (isAllergyUnknown(kid)) return 'unknown';
  const any = (kid.allergens ?? []).some((a) => typeof a === 'string' && canonicalAllergen(a));
  return any ? 'listed' : 'none';
}
