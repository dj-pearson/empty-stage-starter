/**
 * Per-kid plate breakdown (US-613, web surface).
 *
 * Presentational only — every decision comes from `planPlates`. The component
 * shows all four outcomes per child, including what was taken off, because the
 * held-back list is the part a parent actually acts on at the counter.
 *
 * A plate that is blocked says so plainly rather than being shown as a shorter
 * plate: "there is nothing safe here for this child" and "this child's plate is
 * smaller" are different sentences, and only one of them means don't serve it.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle, CircleOff, Sparkles, Split, UtensilsCrossed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ComponentPlacement, KidPlate, PlatingReason } from '@/lib/platePlanner';

interface Props {
  plates: KidPlate[];
}

function reasonText(reason: PlatingReason, t: ReturnType<typeof useTranslation>['t']): string {
  switch (reason.kind) {
    case 'allergen':
      return t('plating.reasons.allergen', { food: reason.foodName, detail: reason.detail });
    case 'dietary':
      return t('plating.reasons.dietary', { food: reason.foodName, detail: reason.detail });
    case 'disliked':
      return t('plating.reasons.disliked', { food: reason.foodName });
    case 'texture':
      return t('plating.reasons.texture', { texture: reason.texture });
    case 'no_touching':
      return t('plating.reasons.noTouching');
    case 'component_separate':
      return t('plating.reasons.componentSeparate');
    case 'due_exposure':
      return t('plating.reasons.dueExposure', {
        rung: t(`foodLadder.rungs.${reason.rung}`, { defaultValue: reason.rung }),
      });
    case 'safe_food':
      return t('plating.reasons.safeFood', { food: reason.foodName });
    case 'cannot_hold_back':
      return t('plating.reasons.cannotHoldBack');
  }
}

function PlacementLine({ placement }: { placement: ComponentPlacement }) {
  const { t } = useTranslation();
  const reasons = placement.reasons.map((reason) => reasonText(reason, t)).filter(Boolean);

  return (
    <li className="text-xs">
      <span className="font-medium">{placement.componentName}</span>
      {reasons.length > 0 && <span className="text-muted-foreground"> — {reasons.join('; ')}</span>}
    </li>
  );
}

export function PerKidPlateBreakdown({ plates }: Props) {
  const { t } = useTranslation();

  if (plates.length === 0) return null;

  return (
    <section className="mt-3 rounded-md border border-border p-3" aria-label={t('plating.title')}>
      <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
        <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden="true" />
        {t('plating.title')}
      </h4>
      <p className="text-xs text-muted-foreground mb-3 max-w-[70ch]">{t('plating.subtitle')}</p>

      <ul className="space-y-3">
        {plates.map((plate) => (
          <li key={plate.kidId}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-medium">{plate.kidName}</span>
              {plate.exposure && (
                <Badge variant="secondary" className="font-normal">
                  <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                  {t('plating.exposureBadge', { component: plate.exposure.componentName })}
                </Badge>
              )}
              {plate.blocked && (
                <Badge variant="destructive" className="font-normal">
                  <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                  {t('plating.blockedBadge')}
                </Badge>
              )}
            </div>

            {plate.blocked && (
              <p className="text-xs text-muted-foreground mb-1 max-w-[70ch]">
                {t('plating.blockedBody', { name: plate.kidName })}
              </p>
            )}
            {!plate.blocked && plate.isEmpty && (
              <p className="text-xs text-muted-foreground mb-1 max-w-[70ch]">
                {t('plating.emptyBody', { name: plate.kidName })}
              </p>
            )}

            {plate.onPlate.length > 0 && (
              <PlacementGroup label={t('plating.onPlate')} placements={plate.onPlate} />
            )}
            {plate.separated.length > 0 && (
              <PlacementGroup
                label={t('plating.separated')}
                placements={plate.separated}
                icon={<Split className="h-3 w-3" aria-hidden="true" />}
              />
            )}
            {plate.heldBack.length > 0 && (
              <PlacementGroup
                label={t('plating.heldBack')}
                placements={plate.heldBack}
                icon={<CircleOff className="h-3 w-3" aria-hidden="true" />}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlacementGroup({
  label,
  placements,
  icon,
}: {
  label: string;
  placements: ComponentPlacement[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="mt-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <ul className="ml-3 list-disc list-inside space-y-0.5">
        {placements.map((placement) => (
          <PlacementLine key={placement.componentId} placement={placement} />
        ))}
      </ul>
    </div>
  );
}
