import { useAccessibility } from '@/contexts/AccessibilityContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  Keyboard,
  Volume2,
  Clock,
  Type,
  Palette,
  RotateCcw,
  Accessibility,
  MonitorSmartphone,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface SettingItemProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}

function SettingItem({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  icon,
}: SettingItemProps) {
  return (
    <div className="flex items-start justify-between space-x-4 py-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 text-muted-foreground" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="space-y-1">
          <Label
            htmlFor={id}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={`${id}-description`}
      />
      <span id={`${id}-description`} className="sr-only">
        {description}
      </span>
    </div>
  );
}

export function AccessibilitySettings() {
  const { preferences, updatePreference, resetPreferences, announce } = useAccessibility();

  const handleReset = () => {
    resetPreferences();
    announce('Accessibility settings reset to defaults', 'polite');
    toast.success('Settings reset to defaults');
  };

  const handlePreferenceChange = (
    key: keyof typeof preferences,
    value: boolean | string
  ) => {
    updatePreference(key, value as any);
    announce(`${key} setting updated`, 'polite');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Accessibility Settings</CardTitle>
          </div>
          <CardDescription>
            Customize your experience to meet your accessibility needs. These settings
            are saved automatically and sync across your devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Visual Settings */}
          <section aria-labelledby="visual-settings-heading">
            <h3
              id="visual-settings-heading"
              className="text-lg font-semibold flex items-center gap-2 mb-4"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Visual Settings
            </h3>

            <SettingItem
              id="high-contrast"
              label="High Contrast Mode"
              description="Increase color contrast for better visibility"
              checked={preferences.highContrast}
              onCheckedChange={(checked) =>
                handlePreferenceChange('highContrast', checked)
              }
              icon={<Palette className="h-4 w-4" />}
            />

            <SettingItem
              id="large-text"
              label="Large Text"
              description="Increase the base font size for easier reading"
              checked={preferences.largeText}
              onCheckedChange={(checked) => {
                handlePreferenceChange('largeText', checked);
                handlePreferenceChange('fontSize', checked ? 'large' : 'default');
              }}
              icon={<Type className="h-4 w-4" />}
            />

            <div className="flex items-start justify-between space-x-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-muted-foreground" aria-hidden="true">
                  <Type className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="font-size" className="text-sm font-medium">
                    Font Size
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Choose your preferred text size
                  </p>
                </div>
              </div>
              <Select
                value={preferences.fontSize}
                onValueChange={(value) =>
                  handlePreferenceChange('fontSize', value)
                }
              >
                <SelectTrigger className="w-32" id="font-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                  <SelectItem value="x-large">Extra Large</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SettingItem
              id="enhanced-focus"
              label="Enhanced Focus Indicators"
              description="Show larger, more visible focus outlines on interactive elements"
              checked={preferences.enhancedFocus}
              onCheckedChange={(checked) =>
                handlePreferenceChange('enhancedFocus', checked)
              }
              icon={<MonitorSmartphone className="h-4 w-4" />}
            />

            <SettingItem
              id="dyslexia-font"
              label="Dyslexia-Friendly Font"
              description="Use a font designed to improve readability for people with dyslexia"
              checked={preferences.dyslexiaFont}
              onCheckedChange={(checked) =>
                handlePreferenceChange('dyslexiaFont', checked)
              }
              icon={<Type className="h-4 w-4" />}
            />
          </section>

          <Separator className="my-6" />

          {/* Motion Settings */}
          <section aria-labelledby="motion-settings-heading">
            <h3
              id="motion-settings-heading"
              className="text-lg font-semibold flex items-center gap-2 mb-4"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              Motion & Animation
            </h3>

            <SettingItem
              id="reduced-motion"
              label="Reduce Motion"
              description="Minimize animations and transitions throughout the app"
              checked={preferences.reducedMotion}
              onCheckedChange={(checked) =>
                handlePreferenceChange('reducedMotion', checked)
              }
              icon={<Zap className="h-4 w-4" />}
            />

            <SettingItem
              id="disable-autoplay"
              label="Disable Autoplay"
              description="Prevent videos and media from playing automatically"
              checked={preferences.disableAutoplay}
              onCheckedChange={(checked) =>
                handlePreferenceChange('disableAutoplay', checked)
              }
              icon={<MonitorSmartphone className="h-4 w-4" />}
            />
          </section>

          <Separator className="my-6" />

          {/* Screen Reader Settings */}
          <section aria-labelledby="screenreader-settings-heading">
            <h3
              id="screenreader-settings-heading"
              className="text-lg font-semibold flex items-center gap-2 mb-4"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              Screen Reader
            </h3>

            <SettingItem
              id="screen-reader-mode"
              label="Screen Reader Optimization"
              description="Optimize the interface for screen reader navigation"
              checked={preferences.screenReaderMode}
              onCheckedChange={(checked) =>
                handlePreferenceChange('screenReaderMode', checked)
              }
              icon={<Volume2 className="h-4 w-4" />}
            />

            <SettingItem
              id="announce-page-changes"
              label="Announce Page Changes"
              description="Announce page navigation to screen readers"
              checked={preferences.announcePageChanges}
              onCheckedChange={(checked) =>
                handlePreferenceChange('announcePageChanges', checked)
              }
              icon={<Volume2 className="h-4 w-4" />}
            />

            <SettingItem
              id="verbose-descriptions"
              label="Verbose Descriptions"
              description="Provide more detailed descriptions for screen readers"
              checked={preferences.verboseDescriptions}
              onCheckedChange={(checked) =>
                handlePreferenceChange('verboseDescriptions', checked)
              }
              icon={<Volume2 className="h-4 w-4" />}
            />
          </section>

          <Separator className="my-6" />

          {/* Keyboard Settings */}
          <section aria-labelledby="keyboard-settings-heading">
            <h3
              id="keyboard-settings-heading"
              className="text-lg font-semibold flex items-center gap-2 mb-4"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              Keyboard Navigation
            </h3>

            <SettingItem
              id="keyboard-shortcuts"
              label="Keyboard Shortcuts"
              description="Enable keyboard shortcuts for common actions (Ctrl/Cmd + K to open command palette)"
              checked={preferences.keyboardShortcuts}
              onCheckedChange={(checked) =>
                handlePreferenceChange('keyboardShortcuts', checked)
              }
              icon={<Keyboard className="h-4 w-4" />}
            />
          </section>

          <Separator className="my-6" />

          {/* Timing Settings */}
          <section aria-labelledby="timing-settings-heading">
            <h3
              id="timing-settings-heading"
              className="text-lg font-semibold flex items-center gap-2 mb-4"
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              Timing & Interactions
            </h3>

            <SettingItem
              id="extended-timeouts"
              label="Extended Timeouts"
              description="Allow more time for completing interactions and reading notifications"
              checked={preferences.extendedTimeouts}
              onCheckedChange={(checked) =>
                handlePreferenceChange('extendedTimeouts', checked)
              }
              icon={<Clock className="h-4 w-4" />}
            />

            <SettingItem
              id="simplified-ui"
              label="Simplified Interface"
              description="Reduce visual complexity by hiding decorative elements"
              checked={preferences.simplifiedUI}
              onCheckedChange={(checked) =>
                handlePreferenceChange('simplifiedUI', checked)
              }
              icon={<MonitorSmartphone className="h-4 w-4" />}
            />
          </section>

          <Separator className="my-6" />

          {/* Reset Button */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleReset}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you need additional accommodations or have questions about accessibility,
            please contact our accessibility team.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button variant="secondary" asChild>
              <a href="/accessibility">View Accessibility Statement</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="mailto:accessibility@tryeatpal.com">
                Contact Accessibility Team
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts Reference */}
      {preferences.keyboardShortcuts && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              Keyboard Shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span>Open Command Palette</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                  Ctrl/Cmd + K
                </kbd>
              </div>
              <div className="flex justify-between">
                <span>Skip to Main Content</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                  Tab (first focus)
                </kbd>
              </div>
              <div className="flex justify-between">
                <span>Close Dialog/Modal</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                  Escape
                </kbd>
              </div>
              <div className="flex justify-between">
                <span>Navigate Lists</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                  Arrow Keys
                </kbd>
              </div>
              <div className="flex justify-between">
                <span>Select/Activate</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                  Enter / Space
                </kbd>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AccessibilitySettings;
