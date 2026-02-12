import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useMobileAuth } from '../providers/MobileAuthProvider';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, Avatar, Separator, Switch } from '../components/ui';

interface MenuItemProps {
  emoji: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  badge?: string;
}

function MenuItem({ emoji, label, onPress, destructive, badge }: MenuItemProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.menuEmoji}>{emoji}</Text>
      <Text style={[styles.menuLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      {badge && (
        <View style={[styles.menuBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.menuArrow, { color: colors.mutedForeground }]}>›</Text>
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { user, signOut } = useMobileAuth();
  const { kids, recipes } = useMobileApp();
  const { colors, isDark, toggleTheme } = useTheme();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const userName = user?.user_metadata?.full_name || user?.email || 'User';
  const userEmail = user?.email || '';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Profile Card */}
      <Card style={{ backgroundColor: colors.card }}>
        <CardContent style={styles.profileContent}>
          <Avatar name={userName} size={56} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{userName}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{userEmail}</Text>
          </View>
        </CardContent>
      </Card>

      {/* Family */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FAMILY</Text>
        <Card style={{ backgroundColor: colors.card }}>
          <MenuItem
            emoji="👶"
            label="Kids"
            badge={kids.length > 0 ? `${kids.length}` : undefined}
            onPress={() => router.push('/kids-list')}
          />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem
            emoji="🍳"
            label="Recipes"
            badge={recipes.length > 0 ? `${recipes.length}` : undefined}
            onPress={() => router.push('/recipes-list')}
          />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem
            emoji="🔗"
            label="Food Chaining"
            onPress={() => router.push('/food-chaining')}
          />
        </Card>
      </View>

      {/* Tools */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TOOLS</Text>
        <Card style={{ backgroundColor: colors.card }}>
          <MenuItem emoji="📷" label="Barcode Scanner" onPress={() => router.push('/scanner')} />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem emoji="🤖" label="AI Meal Coach" onPress={() => router.push('/ai-coach')} />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem emoji="📊" label="Nutrition Insights" onPress={() => router.push('/insights')} />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem emoji="📈" label="Progress Tracker" onPress={() => router.push('/progress')} />
        </Card>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PREFERENCES</Text>
        <Card style={{ backgroundColor: colors.card }}>
          <View style={styles.menuItem}>
            <Text style={styles.menuEmoji}>🌙</Text>
            <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>Dark Mode</Text>
            <Switch value={isDark} onValueChange={toggleTheme} />
          </View>
        </Card>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <Card style={{ backgroundColor: colors.card }}>
          <MenuItem emoji="💳" label="Billing & Subscription" onPress={() => router.push('/billing')} />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem emoji="🔒" label="Privacy & Security" onPress={() => router.push('/privacy-settings')} />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem emoji="❓" label="Help & Support" onPress={() => router.push('/support')} />
          <Separator style={{ marginVertical: 0 }} />
          <MenuItem emoji="🚪" label="Sign Out" onPress={handleSignOut} destructive />
        </Card>
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        EatPal v1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  profileContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700' },
  profileEmail: { fontSize: 14, marginTop: 2 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuEmoji: { fontSize: 20 },
  menuLabel: { fontSize: 15, fontWeight: '500', flex: 1 },
  menuArrow: { fontSize: 22, fontWeight: '300' },
  menuBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  menuBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 24, marginBottom: 8 },
});
