import '@/i18n/appLocale';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Contrast, PauseCircle, Type, BookOpenText, type LucideIcon } from 'lucide-react';
import { useAccessibility, type AccessibilityPreferences } from '@/contexts/AccessibilityContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { A11yTextSizeToggle } from '@/components/settings/A11yTextSizeToggle';
import { cn } from '@/lib/utils';

type ComfortKey = Extract<keyof AccessibilityPreferences, 'highContrast' | 'reducedMotion' | 'dyslexiaFont'>;

interface ComfortTile {
  key: ComfortKey;
  /** Registered in settingsSections.ts, so ?focus= lands here. */
  id: string;
  icon: LucideIcon;
  label: string;
}

const TILES: ReadonlyArray<ComfortTile> = [
  { key: 'highContrast', id: 'high-contrast', icon: Contrast, label: 'High contrast' },
  { key: 'reducedMotion', id: 'reduced-motion', icon: PauseCircle, label: 'Reduce motion' },
  { key: 'dyslexiaFont', id: 'dyslexia-font', icon: BookOpenText, label: 'Easier-to-read font' },
];

const tileBase = 'flex min-h-11 flex-col gap-2 rounded-xl border p-3 text-left';

/**
 * The four settings a tired parent is most likely to want, in one glance:
 * text size, contrast, motion and an easier font. Each applies the moment it
 * is pressed, and the sample sentence underneath shows the result in place.
 *
 * Two by two on a phone, one row of four from md up.
 */
export function QuickComfortRow({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { preferences, updatePreference, announce } = useAccessibility();
  const reduceMotion = useReducedMotion();
  const sizeLabelId = useId();

  const toggle = (tile: ComfortTile) => {
    const next = !preferences[tile.key];
    updatePreference(tile.key, next);
    announce(
      t('settings.a11y.announce.toggled', {
        defaultValue: '{{label}} {{state}}',
        label: t(`settings.a11y.${tile.key}.label`, { defaultValue: tile.label }),
        state: next
          ? t('settings.a11y.state.on', { defaultValue: 'on' })
          : t('settings.a11y.state.off', { defaultValue: 'off' }),
      }),
      'polite'
    );
  };

  return (
    <div
      role="group"
      aria-label={t('settings.a11y.quick.label', { defaultValue: 'Comfort settings' })}
      className={cn('space-y-3', className)}
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className={cn(tileBase, 'border-border bg-card')}>
          <span id={sizeLabelId} className="flex items-center gap-2 text-sm font-medium">
            <Type className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t('settings.a11y.textSize.label', { defaultValue: 'Text size' })}
          </span>
          <A11yTextSizeToggle id="font-size" labelledBy={sizeLabelId} />
        </div>

        {TILES.map((tile) => {
          const on = preferences[tile.key];
          const Icon = tile.icon;
          return (
            <button
              key={tile.key}
              id={tile.id}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(tile)}
              className={cn(
                tileBase,
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
                !reduceMotion && 'transition-colors duration-150 ease-out',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-card-foreground hover:bg-muted'
              )}
            >
              <Icon
                className={cn('h-5 w-5 shrink-0', on ? 'text-primary-foreground' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className="text-sm font-medium leading-snug">
                {t(`settings.a11y.${tile.key}.label`, { defaultValue: tile.label })}
              </span>
              <span
                className={cn('text-xs', on ? 'text-primary-foreground' : 'text-muted-foreground')}
                aria-hidden="true"
              >
                {on
                  ? t('settings.a11y.quick.on', { defaultValue: 'On' })
                  : t('settings.a11y.quick.off', { defaultValue: 'Off' })}
              </span>
            </button>
          );
        })}
      </div>

      <p className="rounded-xl bg-muted px-3 py-2 text-base text-foreground">
        <span className="sr-only">{t('settings.a11y.quick.previewLabel', { defaultValue: 'Preview' })}: </span>
        {t('settings.a11y.quick.preview', {
          defaultValue: 'Tonight: pasta with a few peas on the side, and a no-thank-you bite of broccoli.',
        })}
      </p>
    </div>
  );
}
