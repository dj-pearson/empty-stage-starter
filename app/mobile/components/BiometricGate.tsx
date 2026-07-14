import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import {
  isBiometricLockEnabled,
  authenticateBiometric,
  getBiometricLabel,
} from '../lib/biometricAuth';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';

/**
 * Biometric lock overlay.
 *
 * Wraps the authenticated app tree. When the user has opted into biometric
 * lock (Profile → "Biometric Lock") it:
 *   - requires a Face ID / Touch ID pass on cold start before revealing content;
 *   - re-locks when the app is backgrounded and re-prompts on return, so a
 *     handed-over / re-opened phone doesn't expose the family's data.
 *
 * When `active` is false (no session) the gate is inert and just renders
 * children. If biometrics aren't enrolled or the module is unavailable, the
 * preference can't have been enabled (Profile guards that), so this stays open.
 */
export function BiometricGate({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [label, setLabel] = useState('Face ID');
  const authInFlight = useRef(false);

  const promptUnlock = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    try {
      const ok = await authenticateBiometric('Unlock EatPal');
      if (ok) setLocked(false);
    } finally {
      authInFlight.current = false;
    }
  }, []);

  // On becoming active (session present), decide whether to lock.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!active) {
        setLocked(false);
        setChecking(false);
        return;
      }
      setChecking(true);
      const enabled = await isBiometricLockEnabled();
      if (cancelled) return;
      if (enabled) {
        setLabel(await getBiometricLabel());
        setLocked(true);
        setChecking(false);
        void promptUnlock();
      } else {
        setLocked(false);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, promptUnlock]);

  // Re-lock on background → foreground transitions.
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        void isBiometricLockEnabled().then((enabled) => {
          if (enabled) setLocked(true);
        });
      }
    });
    return () => sub.remove();
  }, [active]);

  if (checking && active) {
    return <View style={styles.cover} />;
  }

  return (
    <>
      {children}
      {locked && (
        <View style={styles.cover} accessibilityViewIsModal accessibilityLabel="App locked">
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.title}>EatPal is locked</Text>
          <Text style={styles.subtitle}>Unlock with {label} to continue</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => void promptUnlock()}
            accessibilityRole="button"
            accessibilityLabel={`Unlock with ${label}`}
          >
            <Text style={styles.buttonText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 1000,
  },
  lockIcon: { fontSize: 56, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  button: {
    height: 48,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { fontSize: fontSize.md, fontWeight: '700', color: colors.background },
});
