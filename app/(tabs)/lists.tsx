import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import { parseGroceryText, type ParsedGroceryItem } from '@/lib/parse-grocery-text';
import type { FoodCategory } from '@/types';
import { sanitizeTextInput } from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';
import { suggestCategory, CATEGORIES } from '../../app/mobile/lib/unit-suggestions';
import { ItemDetailModal, type EditableItem } from '../../app/mobile/components/ItemDetailModal';
import { BulkAddSheet } from '../../app/mobile/components/BulkAddSheet';
import { QuickCategoryPicker } from '../../app/mobile/components/QuickCategoryPicker';

interface GroceryItem {
  id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  checked: boolean;
  category?: FoodCategory | null;
  notes?: string | null;
}

export default function ListsScreen() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailMode, setDetailMode] = useState<'add' | 'edit'>('add');
  const [editingItem, setEditingItem] = useState<EditableItem | undefined>(undefined);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [pickerItem, setPickerItem] = useState<GroceryItem | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('grocery_items')
        .select('id, name, quantity, unit, checked, category, notes')
        .order('checked', { ascending: true })
        .order('created_at', { ascending: false });

      if (data) {
        setItems(data.map(item => ({
          ...item,
          checked: item.checked ?? false,
        })) as GroceryItem[]);
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
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: newChecked } : i));
    try {
      await supabase.from('grocery_items').update({ checked: newChecked }).eq('id', item.id);
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !newChecked } : i));
    }
  };

  const insertOne = async (
    userId: string,
    payload: { name: string; quantity?: number; unit?: string; category?: FoodCategory | null; notes?: string; added_via?: string },
  ) => {
    const { data, error } = await supabase
      .from('grocery_items')
      .insert({
        user_id: userId,
        checked: false,
        name: payload.name,
        quantity: payload.quantity ?? 1,
        unit: payload.unit ?? '',
        category: payload.category ?? 'snack',
        notes: payload.notes ?? null,
        added_via: payload.added_via ?? 'manual',
      })
      .select('id, name, quantity, unit, checked, category, notes')
      .single();
    if (error) throw error;
    return data as GroceryItem;
  };

  const handleQuickAdd = async () => {
    const raw = newItemText.trim();
    if (!raw) return;

    const parsed = parseGroceryText(raw);
    if (parsed.length === 0) return;

    setIsAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (parsed.length === 1) {
        const p = parsed[0];
        const inserted = await insertOne(user.id, {
          name: sanitizeTextInput(p.name),
          quantity: p.quantity,
          unit: p.unit || undefined,
          category: p.category,
          added_via: 'manual',
        });
        setItems(prev => [{ ...inserted, checked: false }, ...prev]);
      } else {
        const inserts = await Promise.all(
          parsed.map(p => insertOne(user.id, {
            name: sanitizeTextInput(p.name),
            quantity: p.quantity,
            unit: p.unit || undefined,
            category: p.category,
            added_via: 'import',
          })),
        );
        setItems(prev => [...inserts.map(i => ({ ...i, checked: false })), ...prev]);
      }
      setNewItemText('');
    } catch (err) {
      console.error('Quick add failed:', err);
      Alert.alert('Error', 'Failed to add items.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleBulkConfirm = async (parsed: ParsedGroceryItem[]) => {
    setBulkVisible(false);
    if (parsed.length === 0) return;
    setIsAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const inserts = await Promise.all(
        parsed.map(p => insertOne(user.id, {
          name: sanitizeTextInput(p.name),
          quantity: p.quantity,
          unit: p.unit || undefined,
          category: p.category,
          added_via: 'import',
        })),
      );
      setItems(prev => [...inserts.map(i => ({ ...i, checked: false })), ...prev]);
    } catch (err) {
      console.error('Bulk add failed:', err);
      Alert.alert('Error', 'Failed to add items.');
    } finally {
      setIsAdding(false);
    }
  };

  const openDetailAdd = () => {
    const prefilledName = sanitizeTextInput(newItemText);
    setDetailMode('add');
    setEditingItem(
      prefilledName
        ? { name: prefilledName, quantity: 1, category: suggestCategory(prefilledName) }
        : { name: '', quantity: 1 },
    );
    setDetailVisible(true);
  };

  const openDetailEdit = (item: GroceryItem) => {
    setDetailMode('edit');
    setEditingItem({
      id: item.id,
      name: item.name,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? '',
      category: (item.category ?? null) as FoodCategory | null,
      notes: item.notes ?? '',
    });
    setDetailVisible(true);
  };

  const handleDetailSave = async (payload: EditableItem) => {
    setDetailVisible(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (detailMode === 'add') {
        const inserted = await insertOne(user.id, {
          name: sanitizeTextInput(payload.name),
          quantity: payload.quantity ?? 1,
          unit: payload.unit,
          category: payload.category ?? null,
          notes: payload.notes,
          added_via: 'manual',
        });
        setItems(prev => [{ ...inserted, checked: false }, ...prev]);
        setNewItemText('');
      } else if (payload.id) {
        const updatePayload = {
          name: sanitizeTextInput(payload.name),
          quantity: payload.quantity ?? 1,
          unit: payload.unit ?? '',
          category: payload.category ?? 'snack',
          notes: payload.notes ?? null,
        };
        setItems(prev =>
          prev.map(i => (i.id === payload.id ? { ...i, ...updatePayload } : i)),
        );
        const { error } = await supabase
          .from('grocery_items')
          .update(updatePayload)
          .eq('id', payload.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Detail save failed:', err);
      Alert.alert('Error', 'Failed to save item.');
      fetchItems();
    }
  };

  const handleMoveCategory = async (item: GroceryItem, newCategory: FoodCategory) => {
    setPickerItem(null);
    if (item.category === newCategory) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, category: newCategory } : i));
    try {
      const { error } = await supabase
        .from('grocery_items')
        .update({ category: newCategory })
        .eq('id', item.id);
      if (error) throw error;
    } catch (err) {
      console.error('Move category failed:', err);
      Alert.alert('Error', 'Failed to move item.');
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, category: item.category } : i));
    }
  };

  const sections = useMemo(() => {
    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);
    const result: { title: string; emoji: string; key: string; data: GroceryItem[] }[] = [];
    CATEGORIES.forEach(cat => {
      const rows = unchecked.filter(i => (i.category ?? 'snack') === cat.key);
      if (rows.length > 0) {
        result.push({ title: cat.label, emoji: cat.emoji, key: cat.key, data: rows });
      }
    });
    if (checked.length > 0) {
      result.push({ title: 'Bought', emoji: '✓', key: 'bought', data: checked });
    }
    return result;
  }, [items]);

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

  const renderRow = (item: GroceryItem) => {
    const cat = CATEGORIES.find(c => c.key === item.category);
    const hasQty = item.quantity != null && item.quantity !== 1;
    const showMeta = hasQty || !!item.unit;
    return (
      <View style={styles.itemRow}>
        <TouchableOpacity
          onPress={() => handleToggleCheck(item)}
          accessibilityLabel={`${item.name}, ${item.checked ? 'checked' : 'unchecked'}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          style={styles.checkboxHit}
        >
          <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
            {item.checked && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.itemInfo}
          onPress={() => openDetailEdit(item)}
          onLongPress={() => handleDeleteItem(item)}
          accessibilityLabel={`Edit ${item.name}`}
          accessibilityHint="Long press to delete"
        >
          <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
            {item.name}
          </Text>
          {showMeta && (
            <Text style={styles.itemQuantity}>
              {hasQty ? item.quantity : ''}{hasQty && item.unit ? ' ' : ''}{item.unit ?? ''}
            </Text>
          )}
        </TouchableOpacity>

        {cat && (
          <TouchableOpacity
            onPress={() => setPickerItem(item)}
            accessibilityLabel={`Change category from ${cat.label}`}
            accessibilityHint="Opens category picker to move item"
          >
            <Text style={styles.itemCategory}>
              {cat.emoji} {cat.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

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

      {totalCount > 0 && (
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${(checkedCount / totalCount) * 100}%` as any }]}
          />
        </View>
      )}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newItemText}
          onChangeText={setNewItemText}
          placeholder="chicken, bananas, 2 gal milk…"
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={handleQuickAdd}
          returnKeyType="done"
          accessibilityLabel="Quick add grocery items"
          editable={!isAdding}
        />
        <TouchableOpacity
          style={[styles.addButton, (!newItemText.trim() || isAdding) && styles.addButtonDisabled]}
          onPress={handleQuickAdd}
          disabled={!newItemText.trim() || isAdding}
          accessibilityLabel="Add items"
          accessibilityRole="button"
        >
          {isAdding ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.addButtonText}>Add</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.secondaryRow}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setBulkVisible(true)}
          accessibilityLabel="Open bulk add"
        >
          <Text style={styles.secondaryIcon}>📝</Text>
          <Text style={styles.secondaryText}>Bulk paste</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={openDetailAdd}
          accessibilityLabel="Open detailed add"
        >
          <Text style={styles.secondaryIcon}>✏️</Text>
          <Text style={styles.secondaryText}>Detailed add</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, groupByCategory && styles.secondaryBtnActive]}
          onPress={() => setGroupByCategory(v => !v)}
          accessibilityLabel="Toggle category grouping"
          accessibilityState={{ selected: groupByCategory }}
        >
          <Text style={styles.secondaryIcon}>{groupByCategory ? '📂' : '📋'}</Text>
          <Text style={[styles.secondaryText, groupByCategory && styles.secondaryTextActive]}>
            {groupByCategory ? 'Grouped' : 'Flat'}
          </Text>
        </TouchableOpacity>
      </View>

      {groupByCategory ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>{section.emoji}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛒</Text>
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptyText}>
                Type a list above (commas or new lines) or tap Bulk paste.
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛒</Text>
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptyText}>
                Type a list above (commas or new lines) or tap Bulk paste.
              </Text>
            </View>
          }
        />
      )}

      <BulkAddSheet
        visible={bulkVisible}
        onClose={() => setBulkVisible(false)}
        onConfirm={handleBulkConfirm}
      />

      <ItemDetailModal
        visible={detailVisible}
        mode={detailMode}
        initial={editingItem}
        onClose={() => setDetailVisible(false)}
        onSave={handleDetailSave}
      />

      <QuickCategoryPicker
        visible={!!pickerItem}
        itemName={pickerItem?.name ?? ''}
        current={pickerItem?.category ?? null}
        onClose={() => setPickerItem(null)}
        onPick={(cat) => pickerItem && handleMoveCategory(pickerItem, cat)}
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
    marginBottom: spacing.sm,
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
  secondaryRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm,
    marginBottom: spacing.md,
  },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm,
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  secondaryIcon: { fontSize: fontSize.md },
  secondaryText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  secondaryBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondaryTextActive: { color: colors.background, fontWeight: '700' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  sectionEmoji: { fontSize: fontSize.md },
  sectionTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: {
    fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600',
    backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.full, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border, minHeight: 48,
  },
  checkboxHit: { padding: 2 },
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
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, paddingHorizontal: spacing.lg, textAlign: 'center' },
});
