// Registers the kids.card.* copy this module's keys resolve against.
import '@/i18n/appLocale';
import type { Kid } from '@/types';
import { kidAgeParts } from '@/lib/utils';
import { kidAllergenChips, kidAllergyState, type KidAllergyFields } from '@/lib/kidAllergenChips';

/**
 * The translate function the care card needs. Narrower than i18next's TFunction
 * so this module stays pure and testable with a stub; call sites pass
 * `(key, opts) => t(key, opts)`.
 */
export type CareCardT = (key: string, options: { defaultValue: string } & Record<string, unknown>) => string;

export type CareCardKid = Pick<
  Kid,
  | 'name'
  | 'age'
  | 'date_of_birth'
  | 'always_eats_foods'
  | 'disliked_foods'
  | 'texture_dislikes'
  | 'helpful_strategies'
> &
  KidAllergyFields & { cross_contamination_sensitive?: boolean | null };

/** "18 months old", "2 years 4 months old", "7 years old"; null when unknown. */
export function formatKidAge(kid: Pick<Kid, 'age' | 'date_of_birth'>, t: CareCardT): string | null {
  const parts = kidAgeParts(kid.date_of_birth, kid.age);
  if (!parts) return null;
  const totalMonths = parts.years * 12 + parts.months;
  if (kid.date_of_birth && totalMonths < 24) {
    return t('kids.card.age.months', {
      count: totalMonths,
      defaultValue: totalMonths === 1 ? '{{count}} month old' : '{{count}} months old',
    });
  }
  if (kid.date_of_birth && totalMonths < 36 && parts.months > 0) {
    return t('kids.card.age.yearsMonths', {
      years: parts.years,
      count: parts.months,
      defaultValue: parts.months === 1 ? '{{years}} years {{count}} month old' : '{{years}} years {{count}} months old',
    });
  }
  return t('kids.card.age.years', {
    count: parts.years,
    defaultValue: parts.years === 1 ? '{{count}} year old' : '{{count}} years old',
  });
}

export function severityLabel(severity: 'mild' | 'moderate' | 'severe', t: CareCardT): string {
  const english = { mild: 'mild', moderate: 'moderate', severe: 'severe' }[severity];
  return t(`kids.card.severity.${severity}`, { defaultValue: english });
}

/** Turn a stored snake_case value into words: "one_bite_rule" -> "one bite rule". */
export function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const clean = (list: readonly string[] | null | undefined) =>
  (list ?? []).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => humanize(v));

/**
 * Plain text a parent can send to a grandparent, sitter or daycare: who the
 * child is, what they must not eat and how seriously, then what makes a meal
 * go well. Allergies come first and are never omitted: an unrecorded list says
 * so rather than reading like "no allergies".
 */
export function buildCareCardText(kid: CareCardKid, t: CareCardT): string {
  const lines: string[] = [];
  const age = formatKidAge(kid, t);
  lines.push(
    age
      ? t('kids.card.careCard.titleWithAge', { name: kid.name, age, defaultValue: '{{name}}, {{age}}' })
      : kid.name,
  );

  const state = kidAllergyState(kid);
  if (state === 'unknown') {
    lines.push(t('kids.card.careCard.allergiesUnknown', { defaultValue: 'Allergies: not recorded' }));
  } else if (state === 'none') {
    lines.push(t('kids.card.careCard.noAllergies', { defaultValue: 'No known allergies' }));
  } else {
    const list = kidAllergenChips(kid)
      .map((c) => (c.severity ? `${c.label} (${severityLabel(c.severity, t)})` : c.label))
      .join(', ');
    lines.push(t('kids.card.careCard.allergies', { list, defaultValue: 'Allergies: {{list}}' }));
  }
  if (kid.cross_contamination_sensitive) {
    lines.push(
      t('kids.card.careCard.crossContact', {
        defaultValue: 'Cross-contact sensitive: even traces matter (shared utensils, boards, fryers)',
      }),
    );
  }

  const section = (key: string, english: string, list: readonly string[] | null | undefined) => {
    const items = clean(list);
    if (items.length > 0) lines.push(t(key, { list: items.join(', '), defaultValue: english }));
  };
  section('kids.card.careCard.alwaysEats', 'Always eats: {{list}}', kid.always_eats_foods);
  section('kids.card.careCard.dislikes', "Doesn't like right now: {{list}}", kid.disliked_foods);
  section('kids.card.careCard.textures', 'Texture dislikes: {{list}}', kid.texture_dislikes);
  section('kids.card.careCard.strategies', 'What helps: {{list}}', kid.helpful_strategies);

  return lines.join('\n');
}
