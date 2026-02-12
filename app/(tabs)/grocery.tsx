import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, Button, EmptyState, LoadingScreen, Separator } from '../components/ui';

export default function GroceryScreen() {
  const { groceryItems, addGroceryItem, updateGroceryItem, deleteGroceryItem, isLoading, refreshData } = useMobileApp();
  const { colors } = useTheme();
  const [newItemName, setNewItemName] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { unchecked, checked } = useMemo(() => {
    const unchecked = groceryItems.filter(i => !i.checked);
    const checked = groceryItems.filter(i => i.checked);
    return { unchecked, checked };
  }, [groceryItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const handleAddItem = async () => {
    const name = newItemName.trim();
    if (!name) return;
    await addGroceryItem({ name, checked: false });
    setNewItemName('');
  };

  const handleToggle = async (id: string, currentChecked: boolean) => {
    await updateGroceryItem(id, { checked: !currentChecked });
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Item', `Remove "${name}" from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteGroceryItem(id) },
    ]);
  };

  const handleClearChecked = () => {
    if (checked.length === 0) return;
    Alert.alert(
      'Clear Checked Items',
      `Remove ${checked.length} checked item${checked.length > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => checked.forEach(item => deleteGroceryItem(item.id)),
        },
      ]
    );
  };

  if (isLoading) return <LoadingScreen message="Loading grocery list..." />;

  const renderItem = ({ item }: { item: typeof groceryItems[0] }) => (
    <TouchableOpacity
      onPress={() => handleToggle(item.id, item.checked)}
      onLongPress={() => handleDelete(item.id, item.name)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.checked }}
      accessibilityHint="Tap to toggle, long press to delete"
    >
      <Card style={[styles.itemCard, { backgroundColor: colors.card }]}>
        <CardContent style={styles.itemRow}>
          <View style={[
            styles.checkbox,
            {
              borderColor: item.checked ? colors.primary : colors.border,
              backgroundColor: item.checked ? colors.primary : 'transparent',
            },
          ]}>
            {item.checked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.itemInfo}>
            <Text
              style={[
                styles.itemName,
                { color: item.checked ? colors.mutedForeground : colors.foreground },
                item.checked && styles.itemNameChecked,
              ]}
            >
              {item.name}
            </Text>
            {item.quantity && (
              <Text style={[styles.itemQuantity, { color: colors.mutedForeground }]}>
                {item.quantity} {item.unit || ''}
              </Text>
            )}
          </View>
          {item.category && (
            <Text style={[styles.itemCategory, { color: colors.mutedForeground }]}>
              {item.category}
            </Text>
          )}
        </CardContent>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Add Item Bar */}
      <View style={styles.addBar}>
        <TextInput
          style={[styles.addInput, { backgroundColor: colors.muted, color: colors.foreground }]}
          placeholder="Add grocery item..."
          placeholderTextColor={colors.mutedForeground}
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
          accessibilityLabel="New grocery item name"
        />
        <Button onPress={handleAddItem} size="md" disabled={!newItemName.trim()}>
          Add
        </Button>
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={[styles.summaryText, { color: colors.mutedForeground }]}>
          {unchecked.length} remaining · {checked.length} checked
        </Text>
        {checked.length > 0 && (
          <TouchableOpacity onPress={handleClearChecked}>
            <Text style={[styles.clearText, { color: colors.destructive }]}>Clear checked</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={[...unchecked, ...checked]}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="🛒"
            title="Your grocery list is empty"
            description="Add items above or generate a list from your meal plan."
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  addInput: { flex: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  summaryText: { fontSize: 13, fontWeight: '500' },
  clearText: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  itemCard: { marginBottom: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500' },
  itemNameChecked: { textDecorationLine: 'line-through' },
  itemQuantity: { fontSize: 13, marginTop: 2 },
  itemCategory: { fontSize: 12, fontWeight: '500' },
});
