import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Accessibility, X, Settings, Eye, Type, MousePointer, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { cn } from '@/lib/utils';

/**
 * Floating Accessibility Widget
 *
 * Provides quick access to essential accessibility settings from any page.
 * WCAG 2.1 AA: Ensures users with disabilities can find and adjust
 * accessibility preferences without navigating to a settings page.
 *
 * Features:
 * - Floating button always visible (bottom-left, avoids conflict with FAB)
 * - Quick toggles for most-used settings
 * - Link to full accessibility settings page
 * - Keyboard accessible (Escape to close, Tab navigation)
 * - Screen reader announcements for state changes
 */
export function AccessibilityWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { preferences, updatePreference, announce } = useAccessibility();
  const navigate = useNavigate();
  const location = useLocation();

  const togglePanel = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      announce(next ? 'Accessibility settings panel opened' : 'Accessibility settings panel closed', 'polite');
      return next;
    });
  }, [announce]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    announce('Accessibility settings panel closed', 'polite');
  }, [announce]);

  const handleToggle = useCallback((key: keyof typeof preferences, label: string) => {
    const newValue = !preferences[key];
    updatePreference(key, newValue as never);
    announce(`${label} ${newValue ? 'enabled' : 'disabled'}`, 'polite');
  }, [preferences, updatePreference, announce]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  const goToFullSettings = useCallback(() => {
    handleClose();
    // Navigate to dashboard settings if authenticated, otherwise to public accessibility page
    if (location.pathname.startsWith('/dashboard')) {
      navigate('/dashboard/accessibility-settings');
    } else {
      navigate('/accessibility');
    }
  }, [navigate, location.pathname, handleClose]);

  return (
    <>
      {/* Floating Trigger Button */}
      <button
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
        aria-label={isOpen ? 'Close accessibility settings' : 'Open accessibility settings'}
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
            className="fixed inset-0 z-50 bg-black/20"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            id="accessibility-widget-panel"
            role="dialog"
            aria-label="Quick accessibility settings"
            aria-modal="true"
            onKeyDown={handleKeyDown}
            className={cn(
              'fixed bottom-36 left-4 z-50 md:bottom-20',
              'w-[calc(100vw-2rem)] max-w-sm',
              'bg-card border border-border rounded-xl shadow-xl',
              'overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="font-semibold text-base">Accessibility</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                aria-label="Close accessibility settings"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Quick Settings */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Visual Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visual</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a11y-high-contrast" className="text-sm cursor-pointer">
                      High Contrast
                    </Label>
                    <Switch
                      id="a11y-high-contrast"
                      checked={preferences.highContrast}
                      onCheckedChange={() => handleToggle('highContrast', 'High contrast')}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a11y-large-text" className="text-sm cursor-pointer">
                      Large Text
                    </Label>
                    <Switch
                      id="a11y-large-text"
                      checked={preferences.largeText}
                      onCheckedChange={() => handleToggle('largeText', 'Large text')}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Motion Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MousePointer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Motion</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a11y-reduced-motion" className="text-sm cursor-pointer">
                      Reduce Motion
                    </Label>
                    <Switch
                      id="a11y-reduced-motion"
                      checked={preferences.reducedMotion}
                      onCheckedChange={() => handleToggle('reducedMotion', 'Reduced motion')}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Keyboard & Focus Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Keyboard & Focus</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a11y-enhanced-focus" className="text-sm cursor-pointer">
                      Enhanced Focus Indicators
                    </Label>
                    <Switch
                      id="a11y-enhanced-focus"
                      checked={preferences.enhancedFocus}
                      onCheckedChange={() => handleToggle('enhancedFocus', 'Enhanced focus indicators')}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a11y-keyboard-shortcuts" className="text-sm cursor-pointer">
                      Keyboard Shortcuts
                    </Label>
                    <Switch
                      id="a11y-keyboard-shortcuts"
                      checked={preferences.keyboardShortcuts}
                      onCheckedChange={() => handleToggle('keyboardShortcuts', 'Keyboard shortcuts')}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Screen Reader Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Screen Reader</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a11y-screen-reader" className="text-sm cursor-pointer">
                      Screen Reader Mode
                    </Label>
                    <Switch
                      id="a11y-screen-reader"
                      checked={preferences.screenReaderMode}
                      onCheckedChange={() => handleToggle('screenReaderMode', 'Screen reader mode')}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-muted/50">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={goToFullSettings}
              >
                <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                All Accessibility Settings
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
