/**
 * Native haptic feedback for the Expo (iOS/Android) app.
 *
 * The web helper in `src/lib/haptics.ts` is built on `navigator.vibrate`,
 * which iOS Safari / WKWebView does not implement — so those calls are silent
 * no-ops on iPhone. This module is the native counterpart: it drives Apple's
 * Taptic Engine (and Android's vibrator) through `expo-haptics`, giving real
 * tactile feedback on device.
 *
 * The exported function names mirror `src/lib/haptics.ts` so call sites read
 * the same on both platforms. `expo-haptics` is imported dynamically and
 * cached, so a missing native module (e.g. web bundle, Expo Go without the
 * module linked) degrades gracefully to a no-op instead of throwing.
 */

import { Platform } from 'react-native';

// expo-haptics types, kept local so we don't hard-depend on the module type
// surface at build time. Only the members we use are declared.
type ExpoHaptics = {
  impactAsync: (style: unknown) => Promise<void>;
  notificationAsync: (type: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown; Heavy: unknown };
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
};

let cached: ExpoHaptics | null | undefined;

async function getHaptics(): Promise<ExpoHaptics | null> {
  if (Platform.OS === 'web') return null;
  if (cached !== undefined) return cached;
  cached = ((await import('expo-haptics').catch(() => null)) as unknown as ExpoHaptics) ?? null;
  return cached;
}

/** Fire-and-forget: haptics should never block UI or surface errors. */
function fire(run: (h: ExpoHaptics) => Promise<void>): void {
  void getHaptics()
    .then((h) => {
      if (h) return run(h);
    })
    .catch(() => {
      // Device without a Taptic Engine, or a transient failure — ignore.
    });
}

/** Light tap — button presses, toggles. */
export function hapticLight(): void {
  fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
}

/** Medium tap — list item selection, checkbox toggle. */
export function hapticMedium(): void {
  fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium));
}

/** Heavy tap — important / confirming actions. */
export function hapticHeavy(): void {
  fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Heavy));
}

/** Success notification — item added, operation completed. */
export function hapticSuccess(): void {
  fire((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
}

/** Warning notification — destructive actions, "not found". */
export function hapticWarning(): void {
  fire((h) => h.notificationAsync(h.NotificationFeedbackType.Warning));
}

/** Error notification — validation errors, failed operations. */
export function hapticError(): void {
  fire((h) => h.notificationAsync(h.NotificationFeedbackType.Error));
}

/** Selection tick — scrubbing pickers / segmented controls. */
export function hapticSelection(): void {
  fire((h) => h.selectionAsync());
}

/**
 * Object form mirroring `src/lib/haptics.ts`'s `haptic` export, for call
 * sites that prefer `haptic.success()` over the named imports.
 */
export const haptic = {
  light: hapticLight,
  medium: hapticMedium,
  heavy: hapticHeavy,
  success: hapticSuccess,
  warning: hapticWarning,
  error: hapticError,
  selection: hapticSelection,
} as const;
