import { AccessibilityInfo, Platform } from 'react-native';

/**
 * US-131: screen-reader announcement helper. Use for transient state changes
 * the visual user sees but a screen-reader user wouldn't otherwise hear:
 * "Loading...", "12 items added", "Removed milk".
 *
 * Web is a no-op (no native announcement API; web sites use `aria-live`
 * attributes on the live-region element instead).
 *
 * On native, queue=true lets the announcement wait for the current utterance
 * to finish; queue=false interrupts. Default queue=false because most call
 * sites want the new state to be heard immediately.
 */
export function announceForAccessibility(message: string, queue: boolean = false): void {
  if (!message) return;
  if (Platform.OS === 'web') return;
  try {
    if (queue && (AccessibilityInfo as any).announceForAccessibilityWithOptions) {
      (AccessibilityInfo as any).announceForAccessibilityWithOptions(message, { queue: true });
    } else {
      AccessibilityInfo.announceForAccessibility?.(message);
    }
  } catch {
    // Older RN versions may not expose this on every platform.
  }
}

/**
 * Minimum touch target side length per WCAG 2.5.5 / Android Material guidelines.
 * Use as `style={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET }}` on tap
 * surfaces that wouldn't otherwise hit 48dp (icon-only buttons, tight chips).
 */
export const TOUCH_TARGET = 48;
