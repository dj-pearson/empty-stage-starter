import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useMobileApp } from './providers/MobileAppProvider';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, Avatar, Button, EmptyState, Input } from './components/ui';

export default function KidsListScreen() {
  const { kids, addKid, deleteKid } = useMobileApp();
  const { colors } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }
    await addKid({
      name: newName.trim(),
      age: newAge ? parseInt(newAge, 10) : undefined,
    });
    setNewName('');
    setNewAge('');
    setShowAddModal(false);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Child', `Are you sure you want to remove ${name}? This will also delete their meal plans.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteKid(id) },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Kids', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FlatList
          data={kids}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="👶"
              title="No children added yet"
              description="Add your children to start planning meals tailored to their needs."
              action={<Button onPress={() => setShowAddModal(true)}>Add Child</Button>}
            />
          }
          ListHeaderComponent={
            kids.length > 0 ? (
              <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>{kids.length} child{kids.length !== 1 ? 'ren' : ''}</Text>
                <Button onPress={() => setShowAddModal(true)} size="sm" variant="outline">
                  Add
                </Button>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/kid/${item.id}`)}
              onLongPress={() => handleDelete(item.id, item.name)}
              accessibilityHint="Tap to view, long press to delete"
            >
              <Card style={[styles.kidCard, { backgroundColor: colors.card }]}>
                <CardContent style={styles.kidRow}>
                  <Avatar name={item.name} size={44} />
                  <View style={styles.kidInfo}>
                    <Text style={[styles.kidName, { color: colors.foreground }]}>{item.name}</Text>
                    {item.age !== undefined && (
                      <Text style={[styles.kidAge, { color: colors.mutedForeground }]}>
                        Age {item.age}
                      </Text>
                    )}
                    {item.allergens && item.allergens.length > 0 && (
                      <Text style={[styles.kidAllergens, { color: colors.warning }]}>
                        Allergens: {item.allergens.join(', ')}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.arrow, { color: colors.mutedForeground }]}>›</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          )}
        />

        {/* Add Child Modal */}
        <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Text style={[styles.modalCancel, { color: colors.primary }]}>Cancel</Text>
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Child</Text>
                <View style={{ width: 60 }} />
              </View>

              <View style={styles.modalContent}>
                <Input
                  label="Name"
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Child's name"
                  autoCapitalize="words"
                  autoFocus
                  accessibilityLabel="Child's name"
                />
                <Input
                  label="Age (optional)"
                  value={newAge}
                  onChangeText={setNewAge}
                  placeholder="Age"
                  keyboardType="number-pad"
                  accessibilityLabel="Child's age"
                />
                <Button onPress={handleAdd} size="lg">
                  Add Child
                </Button>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  kidCard: { marginBottom: 8 },
  kidRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  kidInfo: { flex: 1 },
  kidName: { fontSize: 17, fontWeight: '600' },
  kidAge: { fontSize: 14, marginTop: 2 },
  kidAllergens: { fontSize: 13, marginTop: 2 },
  arrow: { fontSize: 24, fontWeight: '300' },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
  },
  modalCancel: { fontSize: 16, fontWeight: '500' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalContent: { padding: 16 },
});
