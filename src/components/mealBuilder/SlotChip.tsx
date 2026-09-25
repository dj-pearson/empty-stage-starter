/**
 * Which meal the plate is for, as one chip: "Dinner, today". Tapping it opens
 * a day and a meal picker. The try-bite row is not offered here: the try bite
 * rides along with the meal (see the save bar's placement toggle).
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RECIPE_PLAN_SLOTS, slotLabel } from '@/lib/planSlotLabels';
import { addIsoDays, parseIsoDate } from '@/lib/date-utils';
import type { MealSlot } from '@/types';
import '@/i18n/appLocale';

export const BUILDER_SLOTS: readonly MealSlot[] = RECIPE_PLAN_SLOTS.filter((s) => s !== 'try_bite');

export function isBuilderSlot(value: string | null | undefined): value is MealSlot {
  return typeof value === 'string' && (BUILDER_SLOTS as readonly string[]).includes(value);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const d = parseIsoDate(value);
  return !Number.isNaN(d.getTime());
}

/** "today", "tomorrow", or the weekday, in the UI language. */
export function dayLabel(t: TFunction, date: string, todayIso: string, locale?: string): string {
  if (date === todayIso) return t('mealBuilder.day.today', { defaultValue: 'today' });
  if (date === addIsoDays(todayIso, 1)) return t('mealBuilder.day.tomorrow', { defaultValue: 'tomorrow' });
  const d = parseIsoDate(date);
  try {
    return new Intl.DateTimeFormat(locale || undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(d);
  }
}

export interface SlotChipProps {
  date: string;
  slot: MealSlot;
  todayIso: string;
  onChange: (next: { date: string; slot: MealSlot }) => void;
}

export function SlotChip({ date, slot, todayIso, onChange }: SlotChipProps) {
  const { t, i18n } = useTranslation();
  const dateId = useId();
  const slotId = useId();
  const slotText = slotLabel(t, slot);
  const day = dayLabel(t, date, todayIso, i18n.language);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-full"
          aria-label={t('mealBuilder.slotChipLabel', {
            slot: slotText,
            day,
            defaultValue: 'Meal: {{slot}}, {{day}}. Change',
          })}
        >
          <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('mealBuilder.slotChip', { slot: slotText, day, defaultValue: '{{slot}}, {{day}}' })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <p className="text-sm font-semibold">{t('mealBuilder.slotPicker.title', { defaultValue: 'Which meal?' })}</p>
        <label htmlFor={dateId} className="block space-y-1">
          <span className="text-sm font-medium">{t('mealBuilder.slotPicker.date', { defaultValue: 'Day' })}</span>
          <input
            id={dateId}
            type="date"
            value={date}
            min={todayIso}
            onChange={(e) => {
              if (isIsoDay(e.target.value)) onChange({ date: e.target.value, slot });
            }}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label htmlFor={slotId} className="block space-y-1">
          <span className="text-sm font-medium">{t('mealBuilder.slotPicker.slot', { defaultValue: 'Meal' })}</span>
          <select
            id={slotId}
            value={slot}
            onChange={(e) => {
              if (isBuilderSlot(e.target.value)) onChange({ date, slot: e.target.value });
            }}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {BUILDER_SLOTS.map((s) => (
              <option key={s} value={s}>
                {slotLabel(t, s)}
              </option>
            ))}
          </select>
        </label>
      </PopoverContent>
    </Popover>
  );
}
