/**
 * One dish, one slot, every selected sibling.
 *
 * The badge and the primary button come from `reconciled` (the solver result
 * checked against per-kid plates and the allergen floor), never from the
 * solver's own `resolutionType`. The solver can call a dish a full match while a
 * plate is blocked by a severe allergen or left empty, so reading it here would
 * put "Works for everyone" on a dish one child cannot eat.
 *
 * The card also re-checks the plates it was handed before it says "everyone":
 * a blocked or empty plate, an unchecked ingredient or a child with no allergy
 * list always demotes the tier, whatever `reconciled` says.
 */

import { memo, useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  ChefHat,
  ChevronDown,
  Clock,
  ImageIcon,
  Loader2,
  Repeat,
  ShieldQuestion,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PerKidPlateBreakdown } from '@/components/PerKidPlateBreakdown';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import type { SolverResult } from '@/lib/siblingConstraintSolver';
import type { Reconciled } from '@/lib/siblingMealFinder';
import type { KidPlate } from '@/lib/platePlanner';
import '@/i18n/appLocale';

type TFn = ReturnType<typeof useTranslation>['t'];

export interface SiblingMealResultCardProps {
  result: SolverResult;
  reconciled: Reconciled;
  /** Ingredient names the allergen matcher could not check (typed-in, unknown). */
  uncheckedIngredients: string[];
  /** Selected kids whose allergy list was never filled in. */
  unknownAllergyKidNames: string[];
  variant?: 'hero' | 'compact';
  /** US-613 per-kid plating, present only for recipes broken into components. */
  plates?: KidPlate[];
  platesLoading?: boolean;
  platesError?: boolean;
  isPending?: boolean;
  isAccepted?: boolean;
  /** Human slot text, e.g. "dinner tonight". Carried by the visible button label. */
  slotText: string;
  plannerHref: string;
  /** Why planning is unavailable (e.g. offline). Cook now stays enabled. */
  disabledReason?: string;
  onUse: (result: SolverResult, kidIds: string[]) => void;
  onCook: (result: SolverResult) => void;
  recipeHref?: string;
}

type DisplayTier = Reconciled['tier'];
type KidStatus = 'as_is' | 'changed' | 'blocked';

interface KidRow {
  kidId: string;
  kidName: string;
  status: KidStatus;
  details: { key: string; text: string }[];
}

function formatList(names: string[], lang: string): string {
  const unique = Array.from(new Set(names.filter(Boolean)));
  // Intl.ListFormat is ES2021; the app's TS lib predates it, so reach it untyped.
  const ListFormat = (
    Intl as unknown as {
      ListFormat?: new (
        locale: string,
        options: { style: 'long'; type: 'conjunction' }
      ) => { format: (items: string[]) => string };
    }
  ).ListFormat;
  if (!ListFormat) return unique.join(', ');
  try {
    return new ListFormat(lang, { style: 'long', type: 'conjunction' }).format(unique);
  } catch {
    return unique.join(', ');
  }
}

function plateIsOut(p: KidPlate): boolean {
  return p.blocked || p.isEmpty;
}

/**
 * The tier the card actually shows. `reconciled` is authoritative except in one
 * direction: it can be made more cautious here, never less.
 */
function displayTier(
  reconciled: Reconciled,
  plates: KidPlate[] | undefined,
  uncheckedIngredients: string[],
  unknownAllergyKidNames: string[]
): DisplayTier {
  const plateOut = (plates ?? []).some(plateIsOut);
  let tier = reconciled.tier;
  if (plateOut && (tier === 'everyone' || tier === 'with_changes' || tier === 'unverified')) {
    tier = 'some_blocked';
  }
  if (
    (tier === 'everyone' || tier === 'with_changes') &&
    (uncheckedIngredients.length > 0 || unknownAllergyKidNames.length > 0)
  ) {
    tier = 'unverified';
  }
  return tier;
}

function blockedDetail(
  kidName: string,
  plate: KidPlate | undefined,
  entry: Reconciled['blocked'][number] | undefined,
  t: TFn
): string {
  if (plate?.blockedBy?.kind === 'severe_allergen') {
    return plate.blockedBy.copyKind === 'severe'
      ? t('siblingMealFinder.card.row.severe', {
          food: plate.blockedBy.foodName,
          defaultValue: 'severe allergy: {{food}}',
        })
      : t('siblingMealFinder.card.row.unrated', {
          food: plate.blockedBy.foodName,
          defaultValue: 'allergy to {{food}}, severity not set',
        });
  }
  if (plate?.blockedBy?.kind === 'cannot_hold_back') {
    return t('siblingMealFinder.card.row.cannotHoldBack', {
      component: plate.blockedBy.componentName,
      defaultValue: "{{component}} can't come off the plate",
    });
  }
  if (entry?.allergen) {
    return entry.copyKind === 'severeUnrated'
      ? t('siblingMealFinder.card.row.unrated', {
          food: entry.allergen,
          defaultValue: 'allergy to {{food}}, severity not set',
        })
      : entry.copyKind === 'severe'
        ? t('siblingMealFinder.card.row.severe', {
            food: entry.allergen,
            defaultValue: 'severe allergy: {{food}}',
          })
        : t('siblingMealFinder.card.row.allergen', {
            food: entry.allergen,
            defaultValue: 'allergy: {{food}}',
          });
  }
  if (plate?.isEmpty || entry?.cause === 'plate_empty') {
    return t('siblingMealFinder.card.row.empty', {
      name: kidName,
      defaultValue: 'nothing left on the plate',
    });
  }
  return t('siblingMealFinder.card.row.notThisOne', { defaultValue: 'not this one' });
}

function buildKidRows(
  result: SolverResult,
  reconciled: Reconciled,
  plates: KidPlate[] | undefined,
  t: TFn,
  lang: string
): KidRow[] {
  const plateByKid = new Map((plates ?? []).map((p) => [p.kidId, p]));
  const blockedByKid = new Map(reconciled.blocked.map((b) => [b.kidId, b]));

  // Every kid the solver scored, plus each kid only a plate or a block names.
  const order: { kidId: string; kidName: string }[] = [];
  const seen = new Set<string>();
  const push = (kidId: string, kidName: string) => {
    if (seen.has(kidId)) return;
    seen.add(kidId);
    order.push({ kidId, kidName });
  };
  result.perKidSatisfaction.forEach((ks) => push(ks.kidId, ks.kidName));
  (plates ?? []).forEach((p) => push(p.kidId, p.kidName));
  reconciled.blocked.forEach((b) => push(b.kidId, b.kidName));

  return order.map(({ kidId, kidName }) => {
    const plate = plateByKid.get(kidId);
    const entry = blockedByKid.get(kidId);

    if ((plate && plateIsOut(plate)) || entry) {
      return {
        kidId,
        kidName,
        status: 'blocked' as const,
        details: [{ key: 'blocked', text: blockedDetail(kidName, plate, entry, t) }],
      };
    }

    const details: { key: string; text: string }[] = [];
    if (plate) {
      if (plate.heldBack.length > 0) {
        details.push({
          key: 'held',
          text: t('siblingMealFinder.card.row.holdBack', {
            items: formatList(
              plate.heldBack.map((c) => c.componentName),
              lang
            ),
            defaultValue: 'hold the {{items}}',
          }),
        });
      }
      if (plate.separated.length > 0) {
        details.push({
          key: 'separated',
          text: t('siblingMealFinder.card.row.onTheSide', {
            items: formatList(
              plate.separated.map((c) => c.componentName),
              lang
            ),
            defaultValue: '{{items}} on the side',
          }),
        });
      }
    } else {
      const split = result.splitPlates.find((p) => p.kidId === kidId);
      if (split) {
        details.push({ key: `split-${split.kidId}`, text: split.plateDescription });
      }
    }
    result.swaps
      .filter((s) => s.kidId === kidId)
      .forEach((s) =>
        details.push({
          key: s.kidId + s.swapOutFoodId,
          text: t('siblingMealFinder.card.row.swap', {
            from: s.swapOutFoodName,
            to: s.swapInFoodName,
            defaultValue: 'swap {{from}} for {{to}}',
          }),
        })
      );

    return { kidId, kidName, status: details.length > 0 ? 'changed' : 'as_is', details };
  });
}

function changeCount(result: SolverResult, plates: KidPlate[] | undefined): number {
  const swaps = result.swaps.length;
  if (plates && plates.length > 0) {
    return (
      swaps + plates.reduce((sum, p) => sum + p.heldBack.length + p.separated.length, 0)
    );
  }
  return swaps + result.splitPlates.reduce((sum, p) => sum + p.modifications.length, 0);
}

const STATUS_META: Record<KidStatus, { icon: LucideIcon; chip: string; iconClass: string }> = {
  as_is: { icon: Check, chip: 'bg-success/15', iconClass: 'text-success' },
  changed: { icon: Repeat, chip: 'bg-warning/15', iconClass: 'text-warning' },
  blocked: { icon: AlertTriangle, chip: 'bg-destructive/10', iconClass: 'text-destructive' },
};

function KidRows({ rows }: { rows: KidRow[] }) {
  const { t } = useTranslation();
  const statusLabel: Record<KidStatus, string> = {
    as_is: t('siblingMealFinder.card.status.asIs', { defaultValue: 'as is' }),
    changed: t('siblingMealFinder.card.status.changed', { defaultValue: 'changed' }),
    blocked: t('siblingMealFinder.card.status.blocked', { defaultValue: 'not this one' }),
  };
  return (
    <ul
      className="mt-3 space-y-2"
      aria-label={t('siblingMealFinder.card.perKidLabel', { defaultValue: 'Each child' })}
    >
      {rows.map((row) => {
        const meta = STATUS_META[row.status];
        const Icon = meta.icon;
        return (
          <li
            key={row.kidId}
            className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm"
            data-testid={`kid-row-${row.kidId}`}
            data-status={row.status}
          >
            <span className="font-medium min-w-0">{row.kidName}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-foreground',
                meta.chip
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', meta.iconClass)} aria-hidden="true" />
              {statusLabel[row.status]}
            </span>
            {row.details.length > 0 && (
              <span className="basis-full text-muted-foreground">
                {row.details.map((d, i) => (
                  <span key={d.key}>
                    {i > 0 ? '; ' : ''}
                    {d.text}
                  </span>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SiblingMealResultCardImpl({
  result,
  reconciled,
  uncheckedIngredients,
  unknownAllergyKidNames,
  variant = 'hero',
  plates,
  platesLoading = false,
  platesError = false,
  isPending = false,
  isAccepted = false,
  slotText,
  plannerHref,
  disabledReason,
  onUse,
  onCook,
  recipeHref,
}: SiblingMealResultCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const reasonId = useId();

  const hasPlates = !!plates && plates.length > 0;
  const tier = displayTier(reconciled, plates, uncheckedIngredients, unknownAllergyKidNames);

  const rows = useMemo(
    () => buildKidRows(result, reconciled, plates, t, lang),
    [result, reconciled, plates, t, lang]
  );

  const blockedIds = new Set(rows.filter((r) => r.status === 'blocked').map((r) => r.kidId));
  const blockedNames = rows.filter((r) => r.status === 'blocked').map((r) => r.kidName);
  // Only kids reconciled says are usable AND whose plate the card can see is not out.
  const usableKidIds = reconciled.usableKidIds.filter((id) => !blockedIds.has(id));
  const nameById = new Map(rows.map((r) => [r.kidId, r.kidName]));
  const usableNames = usableKidIds.map((id) => nameById.get(id) ?? '').filter(Boolean);

  // ---- tier badge ---------------------------------------------------------
  let badge: { label: string; icon: LucideIcon; className?: string; destructive?: boolean };
  switch (tier) {
    case 'everyone':
      badge = {
        label: t('siblingMealFinder.card.tier.everyone', { defaultValue: 'Works for everyone' }),
        icon: Check,
        className: 'bg-success/15 text-success border-transparent',
      };
      break;
    case 'with_changes': {
      const count = changeCount(result, plates);
      badge = {
        label:
          count > 0
            ? t('siblingMealFinder.card.tier.changes', {
                count,
                defaultValue: count === 1 ? '{{count}} change' : '{{count}} changes',
              })
            : t('siblingMealFinder.card.tier.smallChanges', { defaultValue: 'Small changes' }),
        icon: Repeat,
        className: 'bg-warning/15 text-foreground border-transparent',
      };
      break;
    }
    case 'unverified':
      badge = {
        label:
          uncheckedIngredients.length > 0
            ? t('siblingMealFinder.card.tier.checkIngredients', {
                count: uncheckedIngredients.length,
                defaultValue:
                  uncheckedIngredients.length === 1
                    ? 'Check {{count}} ingredient'
                    : 'Check {{count}} ingredients',
              })
            : t('siblingMealFinder.card.tier.allergiesNotSet', {
                names: formatList(unknownAllergyKidNames, lang),
                defaultValue: '{{names}}: allergies not set',
              }),
        icon: ShieldQuestion,
        className: 'bg-warning/15 text-foreground border-transparent',
      };
      break;
    case 'some_blocked':
      badge = {
        label: t('siblingMealFinder.card.tier.notFor', {
          names: formatList(blockedNames, lang),
          defaultValue: 'Not for {{names}}',
        }),
        icon: AlertTriangle,
        destructive: true,
      };
      break;
    case 'none':
    default:
      badge = {
        label: t('siblingMealFinder.card.tier.none', {
          defaultValue: 'Not for these kids',
        }),
        icon: AlertTriangle,
        destructive: true,
      };
      break;
  }
  const TierIcon = badge.icon;

  const tierBadge = (
    <Badge
      variant={badge.destructive ? 'destructive' : 'outline'}
      className={cn('gap-1', badge.className)}
      data-testid="tier-badge"
      data-tier={tier}
    >
      <TierIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {badge.label}
    </Badge>
  );

  const prepBadge =
    result.prepMinutes > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {t('siblingMealFinder.card.prepMinutes', {
          count: result.prepMinutes,
          defaultValue: '{{count}} min',
        })}
      </span>
    ) : null;

  // ---- primary action -----------------------------------------------------
  const showPrimary = tier !== 'none' && usableKidIds.length > 0;
  const platesPending = platesLoading && !hasPlates;
  // Without the plate check, a 'with_changes' dish has no per-child note for a
  // mild component to hold back, so only a dish that needs no change for a
  // child can still be planned.
  const blockedByPlateError = platesError && tier !== 'everyone';
  const primaryDisabled = isPending || platesPending || blockedByPlateError;
  const softDisabled = !!disabledReason && !primaryDisabled;

  const primaryLabel =
    tier === 'some_blocked'
      ? t('siblingMealFinder.card.planForKids', {
          names: formatList(usableNames, lang),
          slotText,
          defaultValue: 'Plan for {{names}}, {{slotText}}',
        })
      : t('siblingMealFinder.card.planFor', {
          slotText,
          defaultValue: 'Plan for {{slotText}}',
        });

  const handleUse = () => {
    if (primaryDisabled || softDisabled) return;
    onUse(result, usableKidIds);
  };

  let primary: ReactNode = null;
  if (isAccepted) {
    primary = (
      <Link
        to={plannerHref}
        className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
        {t('siblingMealFinder.card.onThePlan', {
          slotText,
          defaultValue: 'On the plan, {{slotText}}. View in Planner',
        })}
      </Link>
    );
  } else if (showPrimary) {
    primary = (
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        onClick={handleUse}
        disabled={primaryDisabled}
        aria-disabled={softDisabled ? true : undefined}
        aria-busy={isPending ? true : undefined}
        aria-describedby={softDisabled ? reasonId : undefined}
        data-testid="primary-use"
      >
        {isPending && (
          <Loader2
            className={cn('h-4 w-4', !reducedMotion && 'animate-spin')}
            aria-hidden="true"
          />
        )}
        {primaryLabel}
      </Button>
    );
  }

  const actions = (
    <div className="mt-4 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        {primary}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          onClick={() => onCook(result)}
        >
          <ChefHat className="h-4 w-4" aria-hidden="true" />
          {t('siblingMealFinder.card.cookNow', { defaultValue: 'Cook now' })}
        </Button>
      </div>
      {softDisabled && !isAccepted && showPrimary && (
        <p id={reasonId} className="text-xs text-muted-foreground">
          {disabledReason}
        </p>
      )}
    </div>
  );

  // ---- body ---------------------------------------------------------------
  const verificationNotes =
    uncheckedIngredients.length > 0 || unknownAllergyKidNames.length > 0 ? (
      <div className="mt-3 flex items-start gap-2 rounded-md bg-muted p-2.5 text-xs text-foreground">
        <ShieldQuestion className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="space-y-1">
          {uncheckedIngredients.length > 0 && (
            <p>
              {t('siblingMealFinder.card.uncheckedList', {
                names: formatList(uncheckedIngredients, lang),
                defaultValue: "Couldn't check for allergens: {{names}}",
              })}
              {recipeHref && (
                <>
                  {' '}
                  <Link
                    to={recipeHref}
                    className="font-medium underline underline-offset-2 hover:text-primary"
                  >
                    {t('siblingMealFinder.card.linkIngredients', {
                      defaultValue: 'Link ingredients',
                    })}
                  </Link>
                </>
              )}
            </p>
          )}
          {unknownAllergyKidNames.length > 0 && (
            <p>
              {t('siblingMealFinder.card.allergiesNotSetBody', {
                names: formatList(unknownAllergyKidNames, lang),
                defaultValue: "{{names}}: allergies not set, so this couldn't be checked for them",
              })}
            </p>
          )}
        </div>
      </div>
    ) : null;

  const splitBox =
    !hasPlates && !platesLoading && result.splitPlates.length > 0 ? (
      <div
        className="mt-3 rounded-md bg-muted p-2.5 text-xs text-foreground"
        data-testid="split-plate-box"
      >
        <p className="mb-1 flex items-center gap-1.5 font-semibold">
          <UtensilsCrossed className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
          {t('siblingMealFinder.card.splitTitle', { defaultValue: 'Plate by plate' })}
        </p>
        <ul className="space-y-1">
          {result.splitPlates.map((p) => (
            <li key={p.kidId}>
              <span className="font-medium">{p.kidName}:</span>
              <ul className="ml-3 list-disc list-inside">
                {p.modifications.map((m, j) => (
                  <li key={`${p.kidId}-${j}`}>{m}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  let plateSlot: ReactNode = null;
  if (platesPending) {
    plateSlot = (
      <div
        className="mt-3 space-y-2"
        data-testid="plates-loading"
        aria-busy="true"
        aria-label={t('siblingMealFinder.card.platesLoading', {
          defaultValue: 'Checking each plate',
        })}
      >
        <Skeleton className={cn('h-4 w-3/4', reducedMotion && 'animate-none')} />
        <Skeleton className={cn('h-4 w-1/2', reducedMotion && 'animate-none')} />
      </div>
    );
  } else if (platesError && !hasPlates) {
    plateSlot = (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
        {t('siblingMealFinder.card.platesError', { defaultValue: 'Plate check unavailable' })}
      </p>
    );
  } else if (hasPlates) {
    plateSlot = <PerKidPlateBreakdown plates={plates} />;
  }

  const body = (
    <>
      <KidRows rows={rows} />
      {result.fairnessNote && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {result.fairnessNote}
        </p>
      )}
      {verificationNotes}
      {splitBox}
      {plateSlot}
      {actions}
    </>
  );

  const image = (className: string, eager: boolean) => (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden bg-muted shrink-0',
        className
      )}
    >
      {result.imageUrl ? (
        <img
          src={result.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : (
        <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );

  if (variant === 'compact') {
    return (
      <Card className={cn('overflow-hidden', isAccepted && 'ring-2 ring-primary')}>
        <CardContent className="p-0">
          <button
            type="button"
            className="flex w-full min-h-11 items-center gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((v) => !v)}
          >
            {image('h-14 w-14 rounded-md', false)}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold line-clamp-2">{result.recipeName}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                {tierBadge}
                {prepBadge}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-5 w-5 shrink-0 text-muted-foreground',
                !reducedMotion && 'transition-transform',
                expanded && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
          {expanded && (
            <div id={bodyId} className="px-3 pb-3">
              {body}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', isAccepted && 'ring-2 ring-primary')}>
      <CardContent className="p-0 md:flex md:gap-4 md:p-4">
        {image('aspect-video w-full md:w-56 md:rounded-md md:self-start', true)}
        <div className="min-w-0 flex-1 p-4 md:p-0">
          <div className="flex flex-wrap items-center gap-2">
            {tierBadge}
            {prepBadge}
          </div>
          <h3 className="mt-2 text-lg font-semibold line-clamp-2">{result.recipeName}</h3>
          {body}
        </div>
      </CardContent>
    </Card>
  );
}

export const SiblingMealResultCard = memo(SiblingMealResultCardImpl);
