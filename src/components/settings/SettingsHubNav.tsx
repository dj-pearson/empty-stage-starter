import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { useWeekStartsOn } from '@/hooks/useWeekStartsOn';
import { FROM_INDEX_STATE } from '@/hooks/useSettingsSection';
import { SETTINGS_SECTIONS, settingsHref, type SettingsSectionKey } from '@/lib/settingsSections';
import '@/i18n/appLocale';

/**
 * Live one-line values for the phone index, from cheap in-memory sources only.
 * Nothing here may query: this list renders before any section does, and the
 * subscription in particular stays behind the Plan section's own lazy chunk.
 */
function useLiveSummaries(): Partial<Record<SettingsSectionKey, string>> {
  const { t } = useTranslation();
  const { preferences } = useAccessibility();
  const weekStartsOn = useWeekStartsOn();
  return {
    accessibility: t(`settings.summary.textSize.${preferences.fontSize}`, {
      defaultValue: preferences.fontSize === 'default' ? 'Standard text' : 'Larger text',
    }),
    planner:
      weekStartsOn === 0
        ? t('settings.summary.weekStart.sunday', { defaultValue: 'Weeks start Sunday' })
        : t('settings.summary.weekStart.monday', { defaultValue: 'Weeks start Monday' }),
  };
}

/** Phone: the grouped list of sections, one row each, as real links. */
export function SettingsIndexList() {
  const { t } = useTranslation();
  const live = useLiveSummaries();

  return (
    <nav aria-label={t('settings.nav.label', { defaultValue: 'Settings sections' })}>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.key}>
              <Link
                to={settingsHref(s.key)}
                state={FROM_INDEX_STATE}
                data-settings-row={s.key}
                className="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t(s.titleKey)}</span>
                  <span className="block truncate text-sm text-muted-foreground">{live[s.key] ?? t(s.summaryKey)}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{t(`settings.scope.${s.scope}`)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** md+: the side rail. aria-current marks the section in the content pane. */
export function SettingsRail({ active }: { active: SettingsSectionKey }) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('settings.nav.label', { defaultValue: 'Settings sections' })}>
      <ul className="space-y-1">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = s.icon;
          const current = s.key === active;
          return (
            <li key={s.key}>
              <Link
                to={settingsHref(s.key)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  current ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(s.titleKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
