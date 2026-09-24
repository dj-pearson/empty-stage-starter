import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge } from '@/components/ui/badge';
import { useFoods, usePlan } from '@/contexts/AppContext';
import { KID_ALLERGEN_PICKER, allergenSeverityFor, canonicalAllergen } from '@/lib/allergens';
import { addIsoDays } from '@/lib/date-utils';
import { buildFoodById, checkUpcomingAllergens, type AllergenHit } from '@/lib/insights';
import type { Kid, MealSlot } from '@/types';
import '@/i18n/appLocale';

/**
 * An honest allergy check on the next two weeks of this child's plan.
 *
 * The page used to promise that "all meal plans automatically exclude these
 * ingredients", which nothing enforced. This section only says what it
 * actually checked: planned foods matched canonically against the child's
 * list. An unrecorded list or a food it cannot resolve is said out loud and
 * never reads as "clear".
 */
export interface AllergyCheckSectionProps {
  kid: Kid;
  todayIso: string;
}

const LOOKAHEAD_DAYS = 14;

const PICKER_BY_CANONICAL = new Map(KID_ALLERGEN_PICKER.map((p) => [canonicalAllergen(p.value), p.labelKey]));

function allergenLabel(t: TFunction, raw: string): string {
  const key = PICKER_BY_CANONICAL.get(canonicalAllergen(raw));
  return key ? t(key, { defaultValue: raw }) : raw;
}

function slotLabel(t: TFunction, slot: MealSlot): string {
  switch (slot) {
    case 'breakfast':
      return t('insightsVariety.allergy.slots.breakfast', { defaultValue: 'breakfast' });
    case 'lunch':
      return t('insightsVariety.allergy.slots.lunch', { defaultValue: 'lunch' });
    case 'dinner':
      return t('insightsVariety.allergy.slots.dinner', { defaultValue: 'dinner' });
    case 'snack1':
      return t('insightsVariety.allergy.slots.snack1', { defaultValue: 'morning snack' });
    case 'snack2':
      return t('insightsVariety.allergy.slots.snack2', { defaultValue: 'afternoon snack' });
    case 'try_bite':
      return t('insightsVariety.allergy.slots.tryBite', { defaultValue: 'try bite' });
    default:
      return String(slot);
  }
}

/** A 'YYYY-MM-DD' day as a local Date, so formatting never shifts the day. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDay(iso: string, todayIso: string, locale: string): string {
  // Within the week a weekday is unambiguous; past that it needs the date.
  const opts: Intl.DateTimeFormatOptions =
    iso < addIsoDays(todayIso, 7) ? { weekday: 'long' } : { weekday: 'short', month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(localDate(iso));
  } catch {
    return iso;
  }
}

function joinOr(t: TFunction, items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const or = t('insightsVariety.allergy.or', { defaultValue: 'or' });
  return `${items.slice(0, -1).join(', ')} ${or} ${items[items.length - 1]}`;
}

function severityWord(t: TFunction, level: 'mild' | 'moderate' | 'severe'): string {
  if (level === 'severe') return t('insightsVariety.allergy.severity.severe', { defaultValue: 'severe' });
  if (level === 'moderate') return t('insightsVariety.allergy.severity.moderate', { defaultValue: 'moderate' });
  return t('insightsVariety.allergy.severity.mild', { defaultValue: 'mild' });
}

function HitLine({ hit, t, todayIso, locale }: { hit: AllergenHit; t: TFunction; todayIso: string; locale: string }) {
  return (
    <li className="text-sm">
      {t('insightsVariety.allergy.hit', {
        food: hit.foodName,
        day: formatDay(hit.date, todayIso, locale),
        slot: slotLabel(t, hit.mealSlot),
        allergen: allergenLabel(t, hit.allergen),
        defaultValue: '{{food}} on {{day}} {{slot}} contains {{allergen}}',
      })}
    </li>
  );
}

function AllergyCheckSectionImpl({ kid, todayIso }: AllergyCheckSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const foodById = useMemo(() => buildFoodById(foods), [foods]);
  const check = useMemo(
    () => checkUpcomingAllergens({ kid, foodById, planEntries, todayIso, days: LOOKAHEAD_DAYS }),
    [kid, foodById, planEntries, todayIso],
  );

  const allergens = kid.allergens ?? [];
  const allergenNames = joinOr(t, allergens.map((a) => allergenLabel(t, a)));
  // Allergies, always: this link sits next to the allergy answer it corrects.
  const profileLink = `/dashboard/kids?kid=${encodeURIComponent(kid.id)}&section=allergies`;
  const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';
  const titleId = 'insights-allergy-title';

  const clearLine = t('insightsVariety.allergy.clear', {
    allergens: allergenNames,
    defaultValue: 'Nothing planned in the next 2 weeks contains {{allergens}}.',
  });

  return (
    <section id="insights-allergy" aria-labelledby={titleId} className="space-y-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('insightsVariety.allergy.title', { defaultValue: 'Allergy check' })}
      </h2>

      {allergens.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('insightsVariety.allergy.listLabel', { name: kid.name, defaultValue: "{{name}}'s allergies" })}>
          {allergens.map((a) => {
            const label = allergenLabel(t, a);
            // Canonical: a severity saved under "Peanuts" still labels "peanuts".
            const level = allergenSeverityFor(kid, a);
            const aria = level
              ? t('insightsVariety.allergy.chipAria', {
                  allergen: label,
                  severity: severityWord(t, level),
                  defaultValue: '{{allergen}}, {{severity}} allergy',
                })
              : label;
            return (
              <li key={a}>
                <Badge variant="outline" className="gap-1 font-normal" aria-label={aria}>
                  <span>{label}</span>
                  {level && <span className="text-muted-foreground">{severityWord(t, level)}</span>}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      {kid.cross_contamination_sensitive && allergens.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('insightsVariety.allergy.crossContact', { defaultValue: 'Sensitive to cross-contact' })}
        </p>
      )}

      {check.status === 'unknown-list' && (
        <p className="text-sm">
          {t('insightsVariety.allergy.unknown', {
            name: kid.name,
            defaultValue: "Allergies not recorded for {{name}}. Plan checks can't run.",
          })}{' '}
          <Link to={profileLink} className={linkClass}>
            {t('insightsVariety.allergy.record', { defaultValue: 'Record allergies' })}
          </Link>
        </p>
      )}

      {check.status === 'none-recorded' && (
        <p className="text-sm">
          {t('insightsVariety.allergy.none', { defaultValue: 'No known allergies' })}{' '}
          <Link to={profileLink} className={linkClass}>
            {t('insightsVariety.allergy.edit', { defaultValue: 'Edit profile' })}
          </Link>
        </p>
      )}

      {(check.status === 'clear' || check.status === 'partial') && <p className="text-sm">{clearLine}</p>}

      {check.status === 'partial' && (
        <p className="text-sm text-muted-foreground">
          {t('insightsVariety.allergy.unchecked', {
            count: check.uncheckedCount,
            defaultValue_one: '{{count}} planned item could not be checked.',
            defaultValue: '{{count}} planned items could not be checked.',
          })}
        </p>
      )}

      {check.status === 'hits' && (
        <div className="space-y-2">
          <ul className="space-y-1">
            {check.hits.map((hit) => (
              <HitLine key={`${hit.date}|${hit.mealSlot}|${hit.foodId}`} hit={hit} t={t} todayIso={todayIso} locale={locale} />
            ))}
          </ul>
          {check.uncheckedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('insightsVariety.allergy.unchecked', {
                count: check.uncheckedCount,
                defaultValue_one: '{{count}} planned item could not be checked.',
                defaultValue: '{{count}} planned items could not be checked.',
              })}
            </p>
          )}
          <Link to="/dashboard/planner" className={`inline-block text-sm ${linkClass}`}>
            {t('insightsVariety.allergy.fix', { defaultValue: 'Swap these in the planner' })}
          </Link>
        </div>
      )}
    </section>
  );
}

export const AllergyCheckSection = memo(AllergyCheckSectionImpl);
