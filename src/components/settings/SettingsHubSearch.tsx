import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { searchSettings } from '@/lib/settingsSections';
import { FROM_INDEX_STATE } from '@/hooks/useSettingsSection';
import '@/i18n/appLocale';

/**
 * The filter at the top of the Settings hub. Matches typed text against the
 * translated section titles, keywords and control labels, and links each match
 * to its section (and control, via &focus=). Selecting a match only navigates;
 * it never flips a setting.
 */
export function SettingsHubSearch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputId = useId();
  const statusId = useId();

  const hits = useMemo(() => searchSettings(query, (key) => t(key)), [query, t]);
  const trimmed = query.trim();

  return (
    <div className={className} role="search">
      <Label htmlFor={inputId} className="sr-only">
        {t('settings.search.label', { defaultValue: 'Search settings' })}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('settings.search.placeholder', { defaultValue: 'Search settings' })}
          className="h-11 pl-9"
          autoComplete="off"
          aria-describedby={trimmed ? statusId : undefined}
        />
      </div>
      <p id={statusId} className="sr-only" aria-live="polite">
        {trimmed
          ? hits.length > 0
            ? t('settings.search.results', { defaultValue: '{{count}} matches', count: hits.length })
            : t('settings.search.empty', { defaultValue: 'No settings match "{{query}}".', query: trimmed })
          : ''}
      </p>
      {trimmed && hits.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('settings.search.empty', { defaultValue: 'No settings match "{{query}}".', query: trimmed })}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="mt-2 divide-y rounded-xl border bg-card">
          {hits.map((hit) => (
            <li key={`${hit.key}:${hit.controlId ?? ''}`}>
              <Link
                to={hit.href}
                state={FROM_INDEX_STATE}
                onClick={() => setQuery('')}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{hit.label}</span>
                  {hit.controlId && <span className="block text-xs text-muted-foreground">{hit.sectionTitle}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
