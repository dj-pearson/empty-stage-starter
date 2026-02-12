import { Tabs } from 'expo-router';
import { Platform, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../providers/MobileThemeProvider';

function TabIcon({ name, focused, color }: { name: string; focused: boolean; color: string }) {
  const icons: Record<string, string> = {
    home: '🏠',
    planner: '📅',
    pantry: '🍎',
    grocery: '🛒',
    more: '⚙️',
  };

  return (
    <View style={tabStyles.iconContainer}>
      <Text style={[tabStyles.icon, { opacity: focused ? 1 : 0.6 }]}>
        {icons[name] || '📱'}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  icon: { fontSize: 22 },
});

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background,
          ...Platform.select({
            ios: {
              shadowColor: 'transparent',
            },
            android: {
              elevation: 0,
            },
          }),
        },
        headerTitleStyle: {
          color: colors.foreground,
          fontWeight: '700',
          fontSize: 18,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 80 + insets.bottom : 64,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          headerTitle: 'EatPal',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="home" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planner',
          headerTitle: 'Meal Planner',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="planner" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          headerTitle: 'My Pantry',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="pantry" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Grocery',
          headerTitle: 'Grocery List',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="grocery" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          headerTitle: 'Settings',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="more" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
