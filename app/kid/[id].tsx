import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Avatar, Badge, Button, Input, Separator } from '../components/ui';

const COMMON_ALLERGENS = [
  'Milk', 'Eggs', 'Peanuts', 'Tree Nuts', 'Wheat',
  'Soy', 'Fish', 'Shellfish', 'Sesame',
];

export default function KidDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { kids, foods, planEntries, updateKid, deleteKid } = useMobileApp();
  const { colors } = useTheme();

  const kid = kids.find(k => k.id === id);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(kid?.name || '');
  const [editAge, setEditAge] = useState(kid?.age?.toString() || '');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(kid?.allergens || []);

  const kidFoodStats = useMemo(() => {
    if (!kid) return { totalMeals: 0, safeFoods: 0 };
    const kidMeals = planEntries.filter(e => e.kid_id === kid.id);
    return {
      totalMeals: kidMeals.length,
      safeFoods: foods.filter(f => f.is_safe).length,
    };
  }, [kid, planEntries, foods]);

  if (!kid) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Child not found.</Text>
      </View>
    );
  }

  const handleSave = async () => {
    await updateKid(kid.id, {
      name: editName.trim() || kid.name,
      age: editAge ? parseInt(editAge, 10) : undefined,
      allergens: selectedAllergens,
    });
    setIsEditing(false);
  };

  const toggleAllergen = (allergen: string) => {
    setSelectedAllergens(prev =>
      prev.includes(allergen)
        ? prev.filter(a => a !== allergen)
        : [...prev, allergen]
    );
  };

  const handleDelete = () => {
    Alert.alert('Remove Child', `This will permanently remove ${kid.name} and their meal plans.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteKid(kid.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerTitle: kid.name }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <Avatar name={kid.name} size={80} />
          <Text style={[styles.name, { color: colors.foreground }]}>{kid.name}</Text>
          {kid.age !== undefined && (
            <Text style={[styles.age, { color: colors.mutedForeground }]}>Age {kid.age}</Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
            <CardContent>
              <Text style={[styles.statValue, { color: colors.primary }]}>{kidFoodStats.totalMeals}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Meals Planned</Text>
            </CardContent>
          </Card>
          <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
            <CardContent>
              <Text style={[styles.statValue, { color: colors.success }]}>{kidFoodStats.safeFoods}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Safe Foods</Text>
            </CardContent>
          </Card>
        </View>

        {/* Allergens */}
        <Card style={{ backgroundColor: colors.card }}>
          <CardHeader>
            <CardTitle>Allergens</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <View style={styles.allergenGrid}>
                {COMMON_ALLERGENS.map(allergen => (
                  <TouchableOpacity
                    key={allergen}
                    style={[
                      styles.allergenChip,
                      {
                        backgroundColor: selectedAllergens.includes(allergen) ? colors.destructive : colors.muted,
                      },
                    ]}
                    onPress={() => toggleAllergen(allergen)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selectedAllergens.includes(allergen) }}
                  >
                    <Text style={{
                      color: selectedAllergens.includes(allergen) ? '#fff' : colors.foreground,
                      fontSize: 13,
                      fontWeight: '500',
                    }}>
                      {allergen}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.allergenGrid}>
                {kid.allergens && kid.allergens.length > 0 ? (
                  kid.allergens.map(a => (
                    <Badge key={a} variant="destructive">{a}</Badge>
                  ))
                ) : (
                  <Text style={{ color: colors.mutedForeground }}>No allergens recorded</Text>
                )}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Edit Section */}
        {isEditing && (
          <Card style={{ backgroundColor: colors.card, marginTop: 12 }}>
            <CardHeader>
              <CardTitle>Edit Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <Input label="Name" value={editName} onChangeText={setEditName} />
              <Input label="Age" value={editAge} onChangeText={setEditAge} keyboardType="number-pad" />
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {isEditing ? (
            <>
              <Button onPress={handleSave} size="lg">Save Changes</Button>
              <Button onPress={() => setIsEditing(false)} variant="outline" size="lg">Cancel</Button>
            </>
          ) : (
            <>
              <Button onPress={() => setIsEditing(true)} variant="outline" size="lg">Edit Profile</Button>
              <Button onPress={handleDelete} variant="destructive" size="lg">Remove Child</Button>
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  name: { fontSize: 24, fontWeight: '800', marginTop: 12 },
  age: { fontSize: 16, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 4 },
  allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergenChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  actions: { marginTop: 24, gap: 10 },
});
