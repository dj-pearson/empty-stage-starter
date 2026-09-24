import '@/i18n/appLocale';
import { useState, useCallback, useRef, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Accessibility, X, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAccessibility, type AccessibilityPreferences } from '@/contexts/AccessibilityContext';
import { useFocusTrap } from '@/components/SkipToContent';
import { A11yTextSizeToggle } from '@/components/settings/A11yTextSizeToggle';
import { settingsHref } from '@/lib/settingsSections';
import { cn } from '@/lib/utils';

type BooleanKey = {
  [K in keyof AccessibilityPreferences]: AccessibilityPreferences[K] extends boolean ? K : never;
}[keyof AccessibilityPreferences];

interface QuickSwitch {
  key: BooleanKey;
  id: string;
  /** i18n key under settings.a11y, and its English default. */
  labelKey: string;
  label: string;
}

const SEEING: ReadonlyArray<QuickSwitch> = [
  { key: 'highContrast', id: 'a11y-high-contrast', labelKey: 'highContrast', label: 'High contrast' },
  { key: 'dyslexiaFont', id: 'a11y-dyslexia-font', labelKey: 'dyslexiaFont', label: 'Easier-to-read font' },
];

const MOTION: ReadonlyArray<QuickSwitch> = [
  { key: 'reducedMotion', id: 'a11y-reduced-motion', labelKey: 'reducedMotion', label: 'Reduce motion' },
];

const KEYBOARD: ReadonlyArray<QuickSwitch> = [
  { key: 'enhancedFocus', id: 'a11y-enhanced-focus', labelKey: 'enhancedFocus', label: 'Clearer focus outlines' },
  { key: 'keyboardShortcuts', id: 'a11y-keyboard-shortcuts', labelKey: 'keyboardShortcuts', label: 'Single-key shortcuts' },
  {
    key: 'screenReaderMode',
    id: 'a11y-screen-reader',
    labelKey: 'screenReaderMode',
    label: 'Move focus to the page heading on navigation',
  },
];

/**
 * Floating Accessibility Widget
 *
 * Provides quick access to essential accessibility settings from any page.
 * WCAG 2.1 AA: Ensures users with disabilities can find and adjust
 * accessibility preferences without navigating to a settings page.
 *
 * Features:
 * - Floating button always visible (bottom-left, avoids conflict with FAB)
 * - Quick toggles for most-used settings, and the same A / A+ / A++ text
 *   size control the settings page uses
 * - Link to the Accessibility section of the settings hub
 * - Keyboard accessible (Escape to close, Tab navigation)
 * - Screen reader announcements for state changes
 */
export function AccessibilityWidget() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { preferences, updatePreference, announce } = useAccessibility();
  const navigate = useNavigate();
  const location = useLocation();
  const sizeLabelId = useId();

  // Focus management: trap focus within the panel while open, and restore focus
  // to the trigger button on close (WCAG 2.4.3 Focus Order).
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(panelRef, isOpen);

  const openedText = t('settings.a11y.widget.opened', { defaultValue: 'Accessibility settings panel opened' });
  const closedText = t('settings.a11y.widget.closed', { defaultValue: 'Accessibility settings panel closed' });

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      announce(next ? openedText : closedText, 'polite');
      return next;
    });
  }, [announce, openedText, closedText]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    announce(closedText, 'polite');
    // Return focus to the trigger so keyboard users aren't dropped at the top.
    triggerRef.current?.focus();
  }, [announce, closedText]);

  const handleToggle = useCallback(
    (key: BooleanKey, checked: boolean, label: string) => {
      updatePreference(key, checked);
      announce(
        t('settings.a11y.announce.toggled', {
          defaultValue: '{{label}} {{state}}',
          label,
          state: checked
            ? t('settings.a11y.state.on', { defaultValue: 'on' })
            : t('settings.a11y.state.off', { defaultValue: 'off' }),
        }),
        'polite'
      );
    },
    [updatePreference, announce, t]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    },
    [handleClose]
  );

  const goToFullSettings = useCallback(() => {
    handleClose();
    // Inside the app, the settings hub's Accessibility section. On public
    // pages there may be no session, so the public statement page instead.
    if (location.pathname.startsWith('/dashboard')) {
      navigate(settingsHref('accessibility'));
    } else {
      navigate('/accessibility');
    }
  }, [navigate, location.pathname, handleClose]);

  const closeLabel = t('settings.a11y.widget.close', { defaultValue: 'Close accessibility settings' });

  const renderSwitch = (item: QuickSwitch) => {
    const label = t(`settings.a11y.${item.labelKey}.label`, { defaultValue: item.label });
    return (
      <div key={item.key} className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor={item.id} className="cursor-pointer text-sm leading-snug">
          {label}
        </Label>
        <Switch
          id={item.id}
          checked={preferences[item.key]}
          onCheckedChange={(checked) => handleToggle(item.key, checked, label)}
        />
      </div>
    );
  };

  const groupHeading = (text: string) => <h3 className="mb-2 text-sm font-medium">{text}</h3>;

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        ref={triggerRef}
        onClick={togglePanel}
        className={cn(
          'fixed bottom-20 left-4 z-50 md:bottom-6',
          'flex items-center justify-center',
          'w-12 h-12 rounded-full shadow-lg',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'transition-transform active:scale-95',
          isOpen && 'ring-2 ring-ring ring-offset-2'
        )}
        aria-label={isOpen ? closeLabel : t('settings.a11y.widget.open', { defaultValue: 'Open accessibility settings' })}
        aria-expanded={isOpen}
        aria-controls="accessibility-widget-panel"
      >
        <Accessibility className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            ref={panelRef}
            id="accessibility-widget-panel"
            role="dialog"
            aria-label={t('settings.a11y.widget.dialogLabel', { defaultValue: 'Quick accessibility settings' })}
            aria-modal="true"
            onKeyDown={handleKeyDown}
            className={cn(
              'fixed bottom-36 left-4 z-50 md:bottom-20',
              'w-[calc(100vw-2rem)] max-w-sm',
              'bg-card border border-border rounded-xl',
              'overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="font-semibold text-base">
                  {t('settings.a11y.widget.title', { defaultValue: 'Accessibility' })}
                </h2>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose} aria-label={closeLabel} className="h-11 w-11">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Quick Settings */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <section>
                {groupHeading(t('settings.a11y.widget.seeing', { defaultValue: 'Seeing and reading' }))}
                <div className="space-y-2">
                  <div className="space-y-2">
                    <span id={sizeLabelId} className="text-sm">
                      {t('settings.a11y.textSize.label', { defaultValue: 'Text size' })}
                    </span>
                    <A11yTextSizeToggle id="a11y-font-size" labelledBy={sizeLabelId} />
                  </div>
                  {SEEING.map(renderSwitch)}
                </div>
              </section>

              <Separator />

              <section>
                {groupHeading(t('settings.a11y.widget.motion', { defaultValue: 'Motion' }))}
                <div className="space-y-2">{MOTION.map(renderSwitch)}</div>
              </section>

              <Separator />

              <section>
                {groupHeading(t('settings.a11y.widget.keyboard', { defaultValue: 'Keyboard and focus' }))}
                <div className="space-y-2">{KEYBOARD.map(renderSwitch)}</div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-muted/50">
              <Button variant="outline" size="sm" className="w-full min-h-11" onClick={goToFullSettings}>
                <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('settings.a11y.widget.all', { defaultValue: 'All accessibility settings' })}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
