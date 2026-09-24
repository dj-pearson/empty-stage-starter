import '@/i18n/appLocale';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAccessibility, type AccessibilityPreferences } from '@/contexts/AccessibilityContext';
import { cn } from '@/lib/utils';

type FontSize = AccessibilityPreferences['fontSize'];

const SIZES: ReadonlyArray<FontSize> = ['default', 'large', 'x-large'];
const SHORT: Record<FontSize, string> = { default: 'A', large: 'A+', 'x-large': 'A++' };
const LONG: Record<FontSize, string> = { default: 'Standard', large: 'Large', 'x-large': 'Extra large' };
// The letters grow with the size they pick, so the choice reads without words.
const GLYPH: Record<FontSize, string> = { default: 'text-sm', large: 'text-base', 'x-large': 'text-lg' };

const isFontSize = (value: string): value is FontSize => (SIZES as ReadonlyArray<string>).includes(value);

interface A11yTextSizeToggleProps {
  /** DOM id of the group; the settings hub deep-links to 'font-size'. */
  id?: string;
  /** Id of the element naming the group. Falls back to an aria-label. */
  labelledBy?: string;
  className?: string;
}

/**
 * Text size as one segmented control: A / A+ / A++. A Radix toggle group, so
 * it is a single tab stop and the arrow keys move between sizes. Used by the
 * settings page, the comfort row and the floating accessibility panel, so the
 * three always agree on what the sizes are called.
 */
export function A11yTextSizeToggle({ id = 'font-size', labelledBy, className }: A11yTextSizeToggleProps) {
  const { t } = useTranslation();
  const { preferences, updatePreference, announce } = useAccessibility();
  const label = t('settings.a11y.textSize.label', { defaultValue: 'Text size' });

  const onValueChange = (value: string) => {
    // A single group sends '' when the pressed item is pressed again. A size
    // must always be chosen, so that is not a change.
    if (!isFontSize(value) || value === preferences.fontSize) return;
    updatePreference('fontSize', value);
    announce(
      t('settings.a11y.announce.toggled', {
        defaultValue: '{{label}} {{state}}',
        label,
        state: t(`settings.a11y.textSize.${value}`, { defaultValue: LONG[value] }),
      }),
      'polite'
    );
  };

  return (
    <ToggleGroup
      id={id}
      type="single"
      value={preferences.fontSize}
      onValueChange={onValueChange}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={cn('grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1', className)}
    >
      {SIZES.map((size) => (
        <ToggleGroupItem
          key={size}
          value={size}
          aria-label={t(`settings.a11y.textSize.${size}`, { defaultValue: LONG[size] })}
          className={cn(
            'min-h-11 w-full font-semibold data-[state=on]:bg-background data-[state=on]:text-foreground',
            GLYPH[size]
          )}
        >
          <span aria-hidden="true">{t(`settings.a11y.textSize.short.${size}`, { defaultValue: SHORT[size] })}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
