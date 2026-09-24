import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { kidAllergenChips } from '@/lib/kidAllergenChips';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

export type AllergyMarker = 'severe' | 'unrated' | 'none';

interface Props {
  kids: Kid[];
  selectedKidIds: string[];
  onChange: (ids: string[]) => void;
  onSelectAll: () => void;
  /**
   * Per-kid allergy marker. 'unrated' (an allergy with no severity recorded)
   * renders exactly like 'severe', because the solver treats it as severe.
   */
  allergyMarkers?: Record<string, AllergyMarker>;
  /**
   * Kept for callers that still pass it. Chips are never disabled: a parent
   * changing who's eating mid-solve should just trigger a re-solve.
   */
  disabled?: boolean;
}

export function SiblingPickerChips({
  kids,
  selectedKidIds,
  onChange,
  onSelectAll,
  allergyMarkers,
}: Props) {
  const { t } = useTranslation();
  const labelId = useId();
  const allSelected = kids.length > 0 && kids.every((k) => selectedKidIds.includes(k.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={labelId} className="text-sm font-medium text-foreground mr-1">
        {t('siblingMealFinder.picker.label', { defaultValue: 'Cooking for' })}
      </span>
      <ToggleGroup
        type="multiple"
        value={selectedKidIds}
        onValueChange={(v) => onChange(v)}
        className="flex-wrap justify-start"
        aria-labelledby={labelId}
      >
        {kids.map((k) => {
          const marker = allergyMarkers?.[k.id] ?? 'none';
          const flagged = marker === 'severe' || marker === 'unrated';
          // Only the allergens that make the marker: severe, or no severity set.
          const allergenNames = kidAllergenChips(k)
            .filter((c) => c.severity === 'severe' || c.severity === null)
            .map((c) => c.label)
            .join(', ');
          return (
            <ToggleGroupItem
              key={k.id}
              value={k.id}
              className="min-h-11 px-4 gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {k.name}
              {flagged && (
                <span
                  className="inline-flex items-center"
                  title={allergenNames || undefined}
                  data-testid={`allergy-marker-${k.id}`}
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">
                    {t('siblingMealFinder.picker.severeAllergy', {
                      defaultValue: 'has a severe allergy',
                    })}
                  </span>
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      {kids.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 px-4"
          onClick={onSelectAll}
          aria-pressed={allSelected}
        >
          {t('siblingMealFinder.picker.everyone', { defaultValue: 'Everyone' })}
        </Button>
      )}
    </div>
  );
}
