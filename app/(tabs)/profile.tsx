import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client.mobile';
import { safeStorage } from '@/lib/platform';
import { sanitizeTextInput, INPUT_LIMITS } from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';
import { useTheme, type ThemeMode } from '../../app/mobile/contexts/ThemeContext';

const PREF_KEYS = {
  notifications: 'eatpal.profile.notifications',
  biometric: 'eatpal.profile.biometric',
  darkMode: 'eatpal.profile.darkMode',
} as const;

interface UserProfile {
  email: string;
  name: string;
}

interface Kid {
  id: string;
  name: string;
  age?: number;
}

interface SubscriptionSummary {
  plan: string;
  isActive: boolean;
  renewalDate: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary>({
    plan: 'Free',
    isActive: true,
    renewalDate: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  // Dark-mode preference is now owned by ThemeContext (light / dark / system).
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Load persisted settings on mount. (ThemeContext handles its own hydration.)
  useEffect(() => {
    (async () => {
      try {
        const [notif, bio] = await Promise.all([
          safeStorage.getItem(PREF_KEYS.notifications),
          safeStorage.getItem(PREF_KEYS.biometric),
        ]);
        if (notif !== null) setNotificationsEnabled(notif === 'true');
        if (bio !== null) setBiometricEnabled(bio === 'true');
      } catch (err) {
        console.error('Failed to load profile prefs:', err);
      }
    })();
  }, []);

  const persistPref = useCallback(async (key: string, value: boolean) => {
    try {
      await safeStorage.setItem(key, value ? 'true' : 'false');
    } catch (err) {
      console.error('Failed to persist pref', key, err);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }

      setProfile({
        email: user.email ?? '',
        name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
      });

      const { data: kidsData } = await supabase
        .from('kids')
        .select('id, name, age')
        .eq('user_id', user.id)
        .order('name');

      if (kidsData) setKids(kidsData as Kid[]);

      // Fetch real subscription so the screen doesn't always show "Free Plan".
      const { data: subRows } = await supabase
        .from('user_subscriptions')
        .select('tier, status, current_period_end')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (subRows && subRows.length > 0) {
        const sub = subRows[0] as { tier: string | null; status: string | null; current_period_end: string | null };
        setSubscription({
          plan: (sub.tier ?? 'free').replace(/^./, c => c.toUpperCase()),
          isActive: sub.status === 'active' || sub.status === 'trialing',
          renewalDate: sub.current_period_end,
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleAddKid = () => {
    Alert.prompt(
      'Add a kid',
      "What's their name?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (input?: string) => {
            const name = sanitizeTextInput(input ?? '', INPUT_LIMITS.kidName);
            if (!name) return;
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              const { data, error } = await supabase
                .from('kids')
                .insert({ user_id: user.id, name })
                .select('id, name, age')
                .single();
              if (error) throw error;
              if (data) setKids(prev => [...prev, data as Kid].sort((a, b) => a.name.localeCompare(b.name)));
            } catch (err) {
              console.error('Add kid failed:', err);
              Alert.alert('Could not add kid', 'Please try again.');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleEditKid = (kid: Kid) => {
    Alert.prompt(
      'Rename kid',
      'New name',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (input?: string) => {
            const name = sanitizeTextInput(input ?? '', INPUT_LIMITS.kidName);
            if (!name || name === kid.name) return;
            try {
              const { error } = await supabase.from('kids').update({ name }).eq('id', kid.id);
              if (error) throw error;
              setKids(prev => prev.map(k => k.id === kid.id ? { ...k, name } : k).sort((a, b) => a.name.localeCompare(b.name)));
            } catch (err) {
              console.error('Rename kid failed:', err);
              Alert.alert('Could not rename', 'Please try again.');
            }
          },
        },
      ],
      'plain-text',
      kid.name
    );
  };

  const handleDeleteKid = (kid: Kid) => {
    Alert.alert(
      'Delete kid?',
      `Remove ${kid.name} and all of their meal data?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('kids').delete().eq('id', kid.id);
              if (error) throw error;
              setKids(prev => prev.filter(k => k.id !== kid.id));
            } catch (err) {
              console.error('Delete kid failed:', err);
              Alert.alert('Could not delete', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenTitle}>Profile</Text>

        {/* User Info */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.name ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.userName}>{profile?.name}</Text>
          <Text style={styles.userEmail}>{profile?.email}</Text>
        </View>

        {/* Kids Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Kids</Text>
            <TouchableOpacity
              onPress={handleAddKid}
              accessibilityLabel="Add kid"
              accessibilityRole="button"
              style={styles.addKidPill}
            >
              <Text style={styles.addKidPillText}>＋ Add</Text>
            </TouchableOpacity>
          </View>
          {kids.length > 0 ? (
            kids.map((kid) => (
              <TouchableOpacity
                key={kid.id}
                style={styles.kidRow}
                onPress={() => handleEditKid(kid)}
                onLongPress={() => handleDeleteKid(kid)}
                delayLongPress={400}
                accessibilityLabel={`${kid.name}. Tap to rename, long-press to delete.`}
                accessibilityHint="Tap to rename, long-press to delete"
              >
                <View style={styles.kidAvatar}>
                  <Text style={styles.kidAvatarText}>
                    {kid.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.kidInfo}>
                  <Text style={styles.kidName}>{kid.name}</Text>
                  {kid.age != null && (
                    <Text style={styles.kidAge}>Age {kid.age}</Text>
                  )}
                </View>
                <Text style={styles.kidChevron}>›</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No kids added yet. Tap + Add to create a profile.
            </Text>
          )}
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.subCard}>
            <Text style={styles.subPlan}>{subscription.plan} Plan</Text>
            {subscription.isActive && subscription.renewalDate ? (
              <Text style={styles.subDetail}>
                Renews {new Date(subscription.renewalDate).toLocaleDateString()}
              </Text>
            ) : (
              <Text style={styles.subDetail}>
                Upgrade to unlock AI meal planning and more
              </Text>
            )}
            {!subscription.isActive || subscription.plan.toLowerCase() === 'free' ? (
              <TouchableOpacity
                style={styles.upgradeButton}
                accessibilityLabel="Upgrade subscription"
                accessibilityRole="button"
              >
                <Text style={styles.upgradeButtonText}>Upgrade</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => { setNotificationsEnabled(v); void persistPref(PREF_KEYS.notifications, v); }}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={notificationsEnabled ? colors.primary : '#f4f3f4'}
              accessibilityLabel="Toggle notifications"
              accessibilityRole="switch"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Biometric Lock</Text>
            <Switch
              value={biometricEnabled}
              onValueChange={(v) => { setBiometricEnabled(v); void persistPref(PREF_KEYS.biometric, v); }}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={biometricEnabled ? colors.primary : '#f4f3f4'}
              accessibilityLabel="Toggle biometric authentication"
              accessibilityRole="switch"
            />
          </View>

          {/* US-129: theme mode picker — Light / Dark / System */}
          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Appearance</Text>
            <View style={styles.themeSegment}>
              {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => {
                const active = themeMode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.themeSegmentBtn, active && styles.themeSegmentBtnActive]}
                    onPress={() => setThemeMode(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set appearance to ${m}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.themeSegmentText, active && styles.themeSegmentTextActive]}>
                      {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>EatPal v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  screenTitle: {
    fontSize: fontSize.xxl, fontWeight: '700', color: colors.text,
    paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  profileCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: colors.background },
  userName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  userEmail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  section: { marginBottom: spacing.md },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
  },
  addKidPill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, backgroundColor: colors.primary,
    minHeight: 32, justifyContent: 'center',
  },
  addKidPillText: { color: colors.background, fontSize: fontSize.xs, fontWeight: '700' },
  kidChevron: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.xs },
  kidRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border, minHeight: 48,
  },
  kidAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#dbeafe',
    justifyContent: 'center', alignItems: 'center',
  },
  kidAvatarText: { fontSize: 16, fontWeight: '600', color: '#3b82f6' },
  kidInfo: { flex: 1 },
  kidName: { fontSize: fontSize.md, fontWeight: '500', color: colors.text },
  kidAge: { fontSize: fontSize.xs, color: colors.textSecondary },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  subCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  subPlan: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  subDetail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  upgradeButton: {
    height: 40, backgroundColor: colors.primary, borderRadius: borderRadius.md,
    justifyContent: 'center', alignItems: 'center', marginTop: spacing.md,
  },
  upgradeButtonText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.background },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border,
    minHeight: 48,
  },
  settingLabel: { fontSize: fontSize.md, color: colors.text },
  settingColumn: {
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border,
    minHeight: 48,
  },
  themeSegment: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: 4, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  themeSegmentBtn: {
    flex: 1, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center',
    minHeight: 40,
  },
  themeSegmentBtnActive: { backgroundColor: colors.primary },
  themeSegmentText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  themeSegmentTextActive: { color: colors.background, fontWeight: '700' },
  signOutButton: {
    height: 48, backgroundColor: '#fef2f2', borderRadius: borderRadius.md,
    justifyContent: 'center', alignItems: 'center', marginTop: spacing.md,
    borderWidth: 1, borderColor: '#fecaca',
  },
  signOutText: { fontSize: fontSize.md, fontWeight: '600', color: colors.error },
  versionText: {
    fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.lg,
  },
});
