import { useState, useEffect } from 'react';
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
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

interface UserProfile {
  email: string;
  name: string;
}

interface Kid {
  id: string;
  name: string;
  age?: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
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
        .eq('user_id', user.id);

      if (kidsData) setKids(kidsData);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
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
          <Text style={styles.sectionTitle}>Kids</Text>
          {kids.length > 0 ? (
            kids.map((kid) => (
              <View key={kid.id} style={styles.kidRow}>
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
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No kids added yet. Add kids in the web app to get started.
            </Text>
          )}
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.subCard}>
            <Text style={styles.subPlan}>Free Plan</Text>
            <Text style={styles.subDetail}>Upgrade to unlock AI meal planning and more</Text>
            <TouchableOpacity
              style={styles.upgradeButton}
              accessibilityLabel="Upgrade subscription"
              accessibilityRole="button"
            >
              <Text style={styles.upgradeButtonText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
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
              onValueChange={setBiometricEnabled}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={biometricEnabled ? colors.primary : '#f4f3f4'}
              accessibilityLabel="Toggle biometric authentication"
              accessibilityRole="switch"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Dark Mode</Text>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={darkModeEnabled ? colors.primary : '#f4f3f4'}
              accessibilityLabel="Toggle dark mode"
              accessibilityRole="switch"
            />
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
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
  },
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
