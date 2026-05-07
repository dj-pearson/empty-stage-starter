import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import type { FoodCategory } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import {
  suggestUnits,
  suggestCategory,
  ALL_UNIT_OPTIONS,
  CATEGORIES,
} from '../lib/unit-suggestions';
import {
  sanitizeTextInput,
  validateNumericInput,
  INPUT_LIMITS,
} from '../lib/validation';

export interface EditableItem {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: FoodCategory | null;
  notes?: string;
}

interface Props {
  visible: boolean;
  mode: 'add' | 'edit';
  initial?: EditableItem;
  onClose: () => void;
  onSave: (item: EditableItem) => void;
}

export function ItemDetailModal({ visible, mode, initial, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<string>('');
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [notes, setNotes] = useState('');
  const [showAllUnits, setShowAllUnits] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setQuantity(initial?.quantity != null ? String(initial.quantity) : '1');
      setUnit(initial?.unit ?? '');
      setCategory(initial?.category ?? null);
      setNotes(initial?.notes ?? '');
      setShowAllUnits(false);
    }
  }, [visible, initial]);

  const suggestedUnits = useMemo(() => suggestUnits(name), [name]);
  const suggestedCategory = useMemo(() => suggestCategory(name), [name]);

  useEffect(() => {
    if (mode === 'add' && !category && suggestedCategory) setCategory(suggestedCategory);
  }, [suggestedCategory, category, mode]);

  const stepQty = (delta: number) => {
    const current = parseFloat(quantity) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setQuantity(String(next));
  };

  const handleSave = () => {
    const cleanName = sanitizeTextInput(name, INPUT_LIMITS.foodName);
    if (!cleanName) return;
    // validateNumericInput returns null on out-of-range / malformed; fall back to 1.
    const qty = validateNumericInput(quantity, 'quantity');
    onSave({
      id: initial?.id,
      name: cleanName,
      quantity: qty == null || qty <= 0 ? 1 : qty,
      unit: unit.trim().slice(0, 32) || undefined,
      category: category ?? undefined,
      notes: sanitizeTextInput(notes, INPUT_LIMITS.notes) || undefined,
    });
  };

  const unitOptions = showAllUnits ? [...ALL_UNIT_OPTIONS] : suggestedUnits;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{mode === 'add' ? 'Add item' : 'Edit item'}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Milk, Chicken breast"
              placeholderTextColor={colors.textSecondary}
              autoFocus={mode === 'add'}
              returnKeyType="done"
            />

            <Text style={styles.label}>Quantity</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => stepQty(-1)}
                accessibilityLabel="Decrease quantity"
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.qtyInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel="Quantity"
              />
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => stepQty(1)}
                accessibilityLabel="Increase quantity"
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.unitHeaderRow}>
              <Text style={styles.label}>Size / Unit</Text>
              <TouchableOpacity onPress={() => setShowAllUnits(v => !v)}>
                <Text style={styles.linkText}>
                  {showAllUnits ? 'Show suggested' : 'Show all'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chipRow}>
              {unitOptions.map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, unit === u && styles.chipActive]}
                  onPress={() => setUnit(unit === u ? '' : u)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: unit === u }}
                >
                  <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.unitCustomInput]}
              value={unit}
              onChangeText={setUnit}
              placeholder="Custom unit (optional)"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, category === c.key && styles.chipActive]}
                  onPress={() => setCategory(category === c.key ? null : c.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === c.key }}
                >
                  <Text style={[styles.chipText, category === c.key && styles.chipTextActive]}>
                    {c.emoji} {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Brand, freshness, etc."
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
              disabled={!name.trim()}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>{mode === 'add' ? 'Add' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  backdropPress: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  closeText: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  label: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
    fontSize: fontSize.md, color: colors.text, backgroundColor: colors.background,
  },
  notesInput: { height: 72, paddingTop: spacing.sm, textAlignVertical: 'top' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: 48, height: 48, borderRadius: borderRadius.md, borderWidth: 1,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface,
  },
  qtyBtnText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  qtyInput: {
    flex: 1, height: 48, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, textAlign: 'center',
    fontSize: fontSize.lg, color: colors.text, fontWeight: '600',
  },
  unitHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  linkText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.text },
  chipTextActive: { color: colors.background, fontWeight: '600' },
  unitCustomInput: { marginTop: spacing.sm },
  footer: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  saveBtn: {
    flex: 2, height: 48, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: fontSize.md, color: colors.background, fontWeight: '700' },
});
