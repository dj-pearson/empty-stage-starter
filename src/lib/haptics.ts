/**
 * Haptic Feedback Utilities for Mobile Devices
 *
 * Provides tactile feedback using the Vibration API
 * Gracefully degrades on devices that don't support vibration
 */

/**
 * Check if vibration API is supported
 */
export function isHapticSupported(): boolean {
  return 'vibrate' in navigator;
}

/**
 * Trigger a light haptic feedback (like a tap)
 * Duration: 10ms
 * Use for: Button presses, toggle switches
 */
export function hapticLight(): void {
  if (isHapticSupported()) {
    navigator.vibrate(10);
  }
}

/**
 * Trigger a medium haptic feedback
 * Duration: 20ms
 * Use for: List item selection, checkbox toggle
 */
export function hapticMedium(): void {
  if (isHapticSupported()) {
    navigator.vibrate(20);
  }
}

/**
 * Trigger a heavy haptic feedback
 * Duration: 40ms
 * Use for: Important actions, errors, confirmations
 */
export function hapticHeavy(): void {
  if (isHapticSupported()) {
    navigator.vibrate(40);
  }
}

/**
 * Trigger a success haptic pattern
 * Pattern: Two short pulses
 * Use for: Successful operations, item added to cart
 */
export function hapticSuccess(): void {
  if (isHapticSupported()) {
    navigator.vibrate([15, 50, 15]);
  }
}

/**
 * Trigger an error haptic pattern
 * Pattern: Three quick pulses
 * Use for: Validation errors, failed operations
 */
export function hapticError(): void {
  if (isHapticSupported()) {
    navigator.vibrate([20, 50, 20, 50, 20]);
  }
}

/**
 * Trigger a warning haptic pattern
 * Pattern: Long pulse
 * Use for: Destructive actions, warnings
 */
export function hapticWarning(): void {
  if (isHapticSupported()) {
    navigator.vibrate(50);
  }
}

/**
 * Trigger a selection haptic pattern
 * Pattern: Very light pulse
 * Use for: Scrolling through picker, sliding through carousel
 */
export function hapticSelection(): void {
  if (isHapticSupported()) {
    navigator.vibrate(5);
  }
}

/**
 * Trigger a notification haptic pattern
 * Pattern: Two distinct pulses
 * Use for: New message, notification received
 */
export function hapticNotification(): void {
  if (isHapticSupported()) {
    navigator.vibrate([30, 100, 30]);
  }
}

/**
 * Custom haptic pattern
 * @param pattern Array of vibration durations in milliseconds [vibrate, pause, vibrate, pause, ...]
 */
export function hapticCustom(pattern: number[]): void {
  if (isHapticSupported()) {
    navigator.vibrate(pattern);
  }
}

/**
 * Stop any ongoing vibration
 */
export function hapticStop(): void {
  if (isHapticSupported()) {
    navigator.vibrate(0);
  }
}

/**
 * Hook for integrating haptic feedback with React components
 *
 * Usage:
 * const haptic = useHaptic();
 *
 * <button onClick={() => {
 *   haptic.light();
 *   handleAction();
 * }}>
 *   Click me
 * </button>
 */
export const haptic = {
  light: hapticLight,
  medium: hapticMedium,
  heavy: hapticHeavy,
  success: hapticSuccess,
  error: hapticError,
  warning: hapticWarning,
  selection: hapticSelection,
  notification: hapticNotification,
  custom: hapticCustom,
  stop: hapticStop,
  isSupported: isHapticSupported,
};

export default haptic;
