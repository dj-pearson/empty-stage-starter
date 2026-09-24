import '@/i18n/appLocale';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Accessibility,
  ChevronDown,
  Navigation,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAccessibility, type AccessibilityPreferences } from '@/contexts/AccessibilityContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { QuickComfortRow } from '@/components/settings/QuickComfortRow';
import { SHORTCUTS } from '@/lib/dashboardShortcuts';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/** Preferences shown as a switch on this page. Each one has a consumer outside the context. */
type SwitchKey = Extract<
  keyof AccessibilityPreferences,
  | 'extendedTimeouts'
  | 'screenReaderMode'
  | 'announcePageChanges'
  | 'enhancedFocus'
  | 'simplifiedUI'
  | 'keyboardShortcuts'
>;

interface SwitchRow {
  key: SwitchKey;
  /** DOM id; the hub's ?focus= deep links use the ones in settingsSections.ts. */
  id: string;
  label: string;
  description: string;
}

const PRIMARY_ROWS: ReadonlyArray<SwitchRow> = [
  {
    key: 'extendedTimeouts',
    id: 'extended-timeouts',
    label: 'Keep messages on screen longer',
    description: 'Pop-up messages stay for 12 seconds instead of 4, so there is time to read them or press Undo.',
  },
  {
    key: 'screenReaderMode',
    id: 'screen-reader-mode',
    label: 'Move focus to the page heading on navigation',
    description:
      'After you open a new page, keyboard and screen reader focus starts at its main content instead of the top of the window.',
  },
];

const MORE_ROWS: ReadonlyArray<SwitchRow> = [
  {
    key: 'enhancedFocus',
    id: 'enhanced-focus',
    label: 'Clearer focus outlines',
    description: 'A thicker outline around whatever the keyboard is on.',
  },
  {
    key: 'simplifiedUI',
    id: 'simplified-ui',
    label: 'Flatter look (no shadows or gradients)',
    description: 'Removes drop shadows and color gradients. Nothing is hidden.',
  },
  {
    key: 'announcePageChanges',
    id: 'announce-page-changes',
    label: 'Announce page changes',
    description: 'Screen readers say the name of each new page you open.',
  },
  {
    key: 'keyboardShortcuts',
    id: 'keyboard-shortcuts',
    label: 'Single-key shortcuts',
    description:
      'On the dashboard, one letter jumps to a page: T for today, G for groceries, S for the pantry, L to log a meal, ? for the list. Turn off if you use speech input or a switch device and letters fire by accident. Ctrl/Cmd + K and Escape keep working either way.',
  },
];

interface SettingItemProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function SettingItem({ id, label, description, checked, onCheckedChange }: SettingItemProps) {
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="text-sm font-medium leading-snug">
          {label}
        </Label>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={descriptionId}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded bg-muted px-2 py-1 font-mono text-xs">{children}</kbd>;
}

function ShortcutsReference({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const always: ReadonlyArray<[string, string]> = [
    [t('settings.a11y.shortcuts.search', { defaultValue: 'Open search and commands' }), 'Ctrl/Cmd + K'],
    [
      t('settings.a11y.shortcuts.skip', { defaultValue: 'Skip to main content' }),
      t('settings.a11y.shortcuts.skipKey', { defaultValue: 'Tab (first press)' }),
    ],
    [t('settings.a11y.shortcuts.close', { defaultValue: 'Close a dialog or menu' }), 'Esc'],
    [
      t('settings.a11y.shortcuts.lists', { defaultValue: 'Move through menus and choices' }),
      t('settings.a11y.shortcuts.listsKey', { defaultValue: 'Arrow keys' }),
    ],
    [
      t('settings.a11y.shortcuts.activate', { defaultValue: 'Select or activate' }),
      t('settings.a11y.shortcuts.activateKey', { defaultValue: 'Enter / Space' }),
    ],
  ];

  return (
    <div className="space-y-4 rounded-xl bg-muted/50 p-4">
      <h4 className="text-sm font-semibold">
        {t('settings.a11y.shortcuts.title', { defaultValue: 'Keyboard shortcuts' })}
      </h4>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t('settings.a11y.shortcuts.singleKey', { defaultValue: 'Single-key (dashboard)' })}
        </p>
        {!enabled && (
          <p className="text-sm text-muted-foreground">
            {t('settings.a11y.shortcuts.offNote', { defaultValue: 'Single-key shortcuts are off.' })}
          </p>
        )}
        <dl className={cn('grid gap-2 text-sm', !enabled && 'text-muted-foreground')}>
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <dt>{t(s.labelKey, { defaultValue: s.label })}</dt>
              <dd>
                <Kbd>{s.display}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('settings.a11y.shortcuts.always', { defaultValue: 'Always on' })}</p>
        <dl className="grid gap-2 text-sm">
          {always.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <dt>{label}</dt>
              <dd>
                <Kbd>{keys}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

interface AccessibilitySettingsProps {
  /**
   * Embedded in the settings hub, which supplies the section heading and the
   * statement links: drop this component's own card header and help footer.
   */
  headless?: boolean;
}

export function AccessibilitySettings({ headless = false }: AccessibilitySettingsProps) {
  const { t } = useTranslation();
  const { preferences, updatePreference, updatePreferences, resetPreferences, announce, syncsToAccount } =
    useAccessibility();
  const reduceMotion = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleReset = () => {
    const previous = resetPreferences();
    // No separate announce(): sonner's toast is itself a live region, and
    // saying it twice is noise.
    toast.success(t('settings.a11y.reset.done', { defaultValue: 'Accessibility settings reset' }), {
      action: {
        label: t('settings.a11y.reset.undo', { defaultValue: 'Undo' }),
        onClick: () => updatePreferences(previous),
      },
    });
  };

  const handlePreferenceChange = <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K],
    label: string
  ) => {
    updatePreference(key, value);
    const state =
      typeof value === 'boolean'
        ? value
          ? t('settings.a11y.state.on', { defaultValue: 'on' })
          : t('settings.a11y.state.off', { defaultValue: 'off' })
        : String(value);
    announce(t('settings.a11y.announce.toggled', { defaultValue: '{{label}} {{state}}', label, state }), 'polite');
  };

  const renderRow = (row: SwitchRow) => {
    const label = t(`settings.a11y.${row.key}.label`, { defaultValue: row.label });
    return (
      <SettingItem
        key={row.key}
        id={row.id}
        label={label}
        description={t(`settings.a11y.${row.key}.description`, { defaultValue: row.description })}
        checked={preferences[row.key]}
        onCheckedChange={(checked) => handlePreferenceChange(row.key, checked, label)}
      />
    );
  };

  const savedNote = syncsToAccount
    ? t('settings.a11y.saved.account', { defaultValue: 'Saved to your account' })
    : t('settings.a11y.saved.device', { defaultValue: 'Saved on this device' });

  const body = (
    <div className="space-y-6">
      <QuickComfortRow />

      <section aria-labelledby="a11y-reading-heading" className="space-y-1">
        <h3 id="a11y-reading-heading" className="flex items-center gap-2 text-base font-semibold">
          <Navigation className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('settings.a11y.groups.reading', { defaultValue: 'Reading and navigation' })}
        </h3>
        <div className="divide-y divide-border">{PRIMARY_ROWS.map(renderRow)}</div>
      </section>

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-2 px-2 text-left">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-base font-semibold">
                  {t('settings.a11y.groups.more', { defaultValue: 'More options' })}
                </span>
                <span className="whitespace-normal text-sm font-normal text-muted-foreground">
                  {t('settings.a11y.groups.moreHint', {
                    defaultValue: 'Focus outlines, a flatter look, page announcements and keyboard shortcuts.',
                  })}
                </span>
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0',
                !reduceMotion && 'transition-transform duration-150',
                moreOpen && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div className="divide-y divide-border">{MORE_ROWS.map(renderRow)}</div>
          <ShortcutsReference enabled={preferences.keyboardShortcuts} />
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {savedNote}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('settings.a11y.reset.hint', {
              defaultValue: 'Keeps what your device asks for, such as reduced motion.',
            })}
          </p>
        </div>
        <Button variant="outline" onClick={handleReset} className="min-h-11 gap-2">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('settings.a11y.reset.button', { defaultValue: 'Reset to defaults' })}
        </Button>
      </div>
    </div>
  );

  if (headless) return body;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>{t('settings.a11y.title', { defaultValue: 'Accessibility' })}</CardTitle>
          </div>
          <CardDescription>
            {t('settings.a11y.intro', { defaultValue: 'Changes apply straight away, on every page.' })}
          </CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>

      <section aria-labelledby="a11y-help-heading" className="space-y-3">
        <h3 id="a11y-help-heading" className="text-base font-semibold">
          {t('settings.a11y.statement.title', { defaultValue: 'Need help?' })}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('settings.a11y.statement.body', {
            defaultValue: 'If something in EatPal is hard to use, tell us and we will fix it or find another way.',
          })}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" asChild>
            <Link to="/accessibility">
              {t('settings.a11y.statement.link', { defaultValue: 'Read the accessibility statement' })}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href="mailto:accessibility@tryeatpal.com">
              {t('settings.a11y.statement.contact', { defaultValue: 'Email accessibility@tryeatpal.com' })}
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

export default AccessibilitySettings;
