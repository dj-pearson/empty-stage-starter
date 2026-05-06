import { useState, useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * US-131: mirrors the web `useReducedMotion` hook so mobile screens can
 * conditionally disable transitions/animations when the OS-level
 * "Reduce motion" setting is enabled.
 *
 * Honours both Android and iOS accessibility settings via
 * AccessibilityInfo. Web returns `false` (no reduce-motion query).
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        if (mounted) setReduce(!!on);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on: boolean) => {
      setReduce(!!on);
    });

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}
