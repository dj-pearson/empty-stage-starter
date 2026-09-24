/**
 * One zone of the plate as a set of choices the child can pick from.
 *
 * Division of responsibility, in the markup: the parent's side is what gets
 * offered (at most three foods per zone, every one of them already checked
 * against the child's allergies), the child's side is which one. Each zone is
 * a radiogroup named by its visible heading, with roving focus: the arrow
 * keys move between choices, Space or a tap picks one.
 *
 * The zone is always named in text and with an icon; colour only repeats it.
 * The bridge food is optional, so it is a pressed/unpressed toggle rather
 * than a radio.
 */

import { memo, useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, CircleCheck, Link2, PieChart, RotateCw, Sprout, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PlateOption, PlateZone, ZoneStatus } from '@/lib/plateBuilder';
import type { BalanceGroup } from '@/lib/insights';
import '@/i18n/appLocale';

export const ZONE_ICONS: Record<PlateZone, LucideIcon> = {
  safe: CircleCheck,
  tryBite: Sprout,
  bridge: Link2,
  gap: PieChart,
};

const REASON_DEFAULTS: Record<PlateOption['reasonKey'], string> = {
  mastered: 'now a safe food',
  alwaysEats: 'always eats',
  reliable: 'eats it often',
  householdUnconfirmed: 'marked safe for the family',
  dueToday: 'due today',
  closeToSafe: 'nearly safe',
  chainPair: 'goes with the try bite',
  chainSuggestion: 'like the safe food',
  gapPantry: 'in the pantry',
  gapOnList: 'on the grocery list',
  gapOther: 'easy to add',
};

const ZONE_NAME_DEFAULTS: Record<PlateZone, string> = {
  safe: 'safe food',
  tryBite: 'try bite',
  bridge: 'bridge food',
  gap: 'food-group filler',
};

export const GROUP_DEFAULTS: Record<BalanceGroup, string> = {
  protein: 'protein',
  carb: 'grain or starch',
  dairy: 'dairy',
  fruit: 'fruit',
  vegetable: 'vegetable',
};

export function zoneName(t: TFunction, zone: PlateZone): string {
  return t(`mealBuilder.zoneName.${zone}`, { defaultValue: ZONE_NAME_DEFAULTS[zone] });
}

export function groupName(t: TFunction, group: BalanceGroup): string {
  return t(`mealBuilder.groups.${group}`, { defaultValue: GROUP_DEFAULTS[group] });
}

/** Why this food is offered, in a few words. */
export function reasonText(t: TFunction, option: PlateOption): string {
  if (option.reasonKey === 'reliable' && option.ate && option.offered) {
    return t('mealBuilder.reason.reliableCount', {
      ate: option.ate,
      offered: option.offered,
      defaultValue: 'ate it {{ate}} of {{offered}} times',
    });
  }
  return t(`mealBuilder.reason.${option.reasonKey}`, { defaultValue: REASON_DEFAULTS[option.reasonKey] });
}

/** "Peas, try bite, due today": what a screen reader hears for a choice. */
export function choiceLabel(t: TFunction, option: PlateOption): string {
  return t('mealBuilder.choiceLabel', {
    food: option.food.name,
    zone: zoneName(t, option.zone),
    reason: reasonText(t, option),
    defaultValue: '{{food}}, {{zone}}, {{reason}}',
  });
}

const chipBase =
  'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-reduce:transition-none';
const chipLarge = 'min-h-14 px-5 text-lg';
const chipOn = 'border-primary bg-primary text-primary-foreground';
const chipOff = 'border-border bg-background text-foreground hover:bg-muted';

function ZoneHeading({
  id,
  zone,
  title,
  hint,
}: {
  id: string;
  zone: PlateZone;
  title: string;
  hint?: string;
}) {
  const Icon = ZONE_ICONS[zone];
  return (
    <div className="space-y-0.5">
      <h3 id={id} className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {title}
      </h3>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface ZoneChoicesProps {
  zone: Exclude<PlateZone, 'bridge'>;
  headingId: string;
  title: string;
  hint?: string;
  options: readonly PlateOption[];
  status: ZoneStatus;
  selectedId: string | undefined;
  onSelect: (zone: PlateZone, foodId: string) => void;
  /** Hand-to-child mode: bigger targets. */
  large?: boolean;
  kidName: string;
  gapGroup: BalanceGroup | null;
  onRetry?: () => void;
}

function StatusLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

const linkClass =
  'inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function ZoneStatusCopy({
  zone,
  status,
  kidName,
  gapGroup,
  onRetry,
}: Pick<ZoneChoicesProps, 'zone' | 'status' | 'kidName' | 'gapGroup' | 'onRetry'>) {
  const { t } = useTranslation();
  if (zone === 'tryBite' && status === 'pending') {
    return (
      <div aria-busy="true" className="flex gap-2">
        <span className="sr-only">
          {t('mealBuilder.status.tryBitePending', { defaultValue: 'Loading the ladder' })}
        </span>
        <Skeleton className="h-11 w-28 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-11 w-24 rounded-full motion-reduce:animate-none" />
      </div>
    );
  }
  if (zone === 'tryBite' && status === 'unavailable') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <StatusLine>
          {t('mealBuilder.status.tryBiteUnavailable', { defaultValue: "Couldn't load the ladder." })}
        </StatusLine>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
            <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('mealBuilder.status.retry', { defaultValue: 'Retry' })}
          </Button>
        ) : null}
      </div>
    );
  }
  if (zone === 'gap' && status === 'balanced') {
    return (
      <StatusLine>
        {t('mealBuilder.status.balanced', { defaultValue: 'Every food group is covered today.' })}
      </StatusLine>
    );
  }
  if (zone === 'safe') {
    return (
      <div className="flex flex-wrap items-center gap-x-3">
        <StatusLine>
          {t('mealBuilder.empty.safe', { name: kidName, defaultValue: 'No safe foods for {{name}} yet.' })}
        </StatusLine>
        <Link to="/dashboard/food-tracker" className={linkClass}>
          {t('mealBuilder.empty.safeLink', {
            name: kidName,
            defaultValue: 'Mark what {{name}} eats in Food Tracker',
          })}
        </Link>
      </div>
    );
  }
  if (zone === 'tryBite') {
    return (
      <div className="flex flex-wrap items-center gap-x-3">
        <StatusLine>{t('mealBuilder.empty.tryBite', { defaultValue: 'No ladder step due today.' })}</StatusLine>
        <Link to="/dashboard/food-tracker" className={linkClass}>
          {t('mealBuilder.empty.tryBiteLink', { defaultValue: 'Pick a food to work on in Food Tracker' })}
        </Link>
      </div>
    );
  }
  return (
    <StatusLine>
      {t('mealBuilder.empty.gap', {
        group: gapGroup ? groupName(t, gapGroup) : '',
        defaultValue: 'Nothing you have fills the {{group}} gap.',
      })}
    </StatusLine>
  );
}

function ZoneChoicesImpl({
  zone,
  headingId,
  title,
  hint,
  options,
  status,
  selectedId,
  onSelect,
  large = false,
  kidName,
  gapGroup,
  onRetry,
}: ZoneChoicesProps) {
  const { t } = useTranslation();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.food.id === selectedId);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabStop = focusIndex !== null && focusIndex < options.length ? focusIndex : Math.max(0, selectedIndex);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = options.length - 1;
      let next: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      if (next === null) return;
      event.preventDefault();
      setFocusIndex(next);
      buttons.current[next]?.focus();
    },
    [options.length],
  );

  const showChoices = options.length > 0 && (status === 'ready' || zone !== 'tryBite');

  return (
    <div className="space-y-2" data-zone={zone}>
      <ZoneHeading id={headingId} zone={zone} title={title} hint={hint} />
      {showChoices ? (
        <div role="radiogroup" aria-labelledby={headingId} className="flex flex-wrap gap-2">
          {options.map((option, index) => {
            const checked = option.food.id === selectedId;
            return (
              <button
                key={option.food.id}
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={choiceLabel(t, option)}
                tabIndex={index === tabStop ? 0 : -1}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={(e) => onKeyDown(e, index)}
                onClick={() => onSelect(zone, option.food.id)}
                className={cn(chipBase, large && chipLarge, checked ? chipOn : chipOff)}
              >
                {checked ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                <span className="min-w-0">
                  <span className="block truncate">{option.food.name}</span>
                  <span
                    className={cn(
                      'block text-xs font-normal',
                      checked ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {reasonText(t, option)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <ZoneStatusCopy zone={zone} status={status} kidName={kidName} gapGroup={gapGroup} onRetry={onRetry} />
      )}
    </div>
  );
}

export const ZoneChoices = memo(ZoneChoicesImpl);

export interface BridgeChoicesProps {
  headingId: string;
  options: readonly PlateOption[];
  status: ZoneStatus;
  selectedId: string | undefined;
  onToggle: (foodId: string) => void;
  large?: boolean;
}

function BridgeChoicesImpl({ headingId, options, status, selectedId, onToggle, large = false }: BridgeChoicesProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-zone="bridge">
      <ZoneHeading
        id={headingId}
        zone="bridge"
        title={t('mealBuilder.zones.bridge', { defaultValue: 'Bridge food' })}
        hint={t('mealBuilder.zoneHint.bridge', { defaultValue: 'Close to the safe food. Optional.' })}
      />
      {options.length > 0 ? (
        <div role="group" aria-labelledby={headingId} className="flex flex-wrap gap-2">
          {options.map((option) => {
            const pressed = option.food.id === selectedId;
            return (
              <button
                key={option.food.id}
                type="button"
                aria-pressed={pressed}
                aria-label={choiceLabel(t, option)}
                onClick={() => onToggle(option.food.id)}
                className={cn(chipBase, large && chipLarge, pressed ? chipOn : chipOff)}
              >
                {pressed ? (
                  <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{option.food.name}</span>
                  <span
                    className={cn(
                      'block text-xs font-normal',
                      pressed ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {reasonText(t, option)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : status === 'pending' ? (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          {t('mealBuilder.status.bridgePending', { defaultValue: 'Looking for a bridge food' })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('mealBuilder.empty.bridge', { defaultValue: 'No bridge food for this safe food yet.' })}
        </p>
      )}
    </div>
  );
}

export const BridgeChoices = memo(BridgeChoicesImpl);
