import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import { sanitizeTextInput } from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

interface GroceryItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  category?: string;
}

export default function ListsScreen() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('grocery_items')
        .select('id, name, quantity, unit, checked, category')
        .order('checked', { ascending: true })
        .order('created_at', { ascending: false });

      if (data) {
        setItems(data.map(item => ({
          ...item,
          checked: item.checked ?? false,
        })));
      }
    } catch (err) {
      console.error('Error fetching grocery items:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleToggleCheck = async (item: GroceryItem) => {
    const newChecked = !item.checked;
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: newChecked } : i));
    try {
      await supabase.from('grocery_items').update({ checked: newChecked }).eq('id', item.id);
    } catch {
      // Revert on failure
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !newChecked } : i));
    }
  };

  const handleAddItem = async () => {
    const name = sanitizeTextInput(newItemText);
    if (!name) return;

    setIsAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('grocery_items')
        .insert({ name, checked: false, user_id: user.id })
        .select('id, name, quantity, unit, checked, category')
        .single();

      if (data && !error) {
        setItems(prev => [{ ...data, checked: false }, ...prev]);
        setNewItemText('');
      }
    } catch {
      Alert.alert('Error', 'Failed to add item.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteItem = (item: GroceryItem) => {
    Alert.alert('Delete Item', `Remove "${item.name}" from list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setItems(prev => prev.filter(i => i.id !== item.id));
          await supabase.from('grocery_items').delete().eq('id', item.id);
        },
      },
    ]);
  };

  const onRefresh = () => { setIsRefreshing(true); fetchItems(); };

  const checkedCount = items.filter(i => i.checked).length;
  const totalCount = items.length;

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
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Grocery List</Text>
        {totalCount > 0 && (
          <Text style={styles.progressText}>
            {checkedCount}/{totalCount} items
          </Text>
        )}
      </View>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(checkedCount / totalCount) * 100}%` as any },
            ]}
          />
        </View>
      )}

      {/* Add Item Input */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newItemText}
          onChangeText={setNewItemText}
          placeholder="Add item..."
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
          accessibilityLabel="Add grocery item"
          editable={!isAdding}
        />
        <TouchableOpacity
          style={[styles.addButton, (!newItemText.trim() || isAdding) && styles.addButtonDisabled]}
          onPress={handleAddItem}
          disabled={!newItemText.trim() || isAdding}
          accessibilityLabel="Add item to list"
          accessibilityRole="button"
        >
          {isAdding ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.addButtonText}>Add</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Items List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => handleToggleCheck(item)}
            onLongPress={() => handleDeleteItem(item)}
            accessibilityLabel={`${item.name}, ${item.checked ? 'checked' : 'unchecked'}. Tap to toggle, long press to delete.`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
          >
            <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
              {item.checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                {item.name}
              </Text>
              {item.quantity && (
                <Text style={styles.itemQuantity}>
                  {item.quantity} {item.unit ?? ''}
                </Text>
              )}
            </View>
            {item.category && (
              <Text style={styles.itemCategory}>{item.category}</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyText}>Add items above to build your grocery list.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  progressText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  progressBar: {
    height: 4, backgroundColor: colors.border, marginHorizontal: spacing.md,
    borderRadius: 2, marginBottom: spacing.md, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  addRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm,
    marginBottom: spacing.md,
  },
  addInput: {
    flex: 1, height: 48, backgroundColor: colors.background, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, fontSize: fontSize.md, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  addButton: {
    height: 48, paddingHorizontal: spacing.lg, backgroundColor: colors.primary,
    borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center',
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.background },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border, minHeight: 48,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: borderRadius.sm, borderWidth: 2,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { fontSize: 14, color: colors.background, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: fontSize.md, color: colors.text },
  itemNameChecked: { textDecorationLine: 'line-through', color: colors.textSecondary },
  itemQuantity: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  itemCategory: {
    fontSize: fontSize.xs, color: colors.primary, fontWeight: '500',
    backgroundColor: '#ecfdf5', paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.sm, overflow: 'hidden',
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
});
