import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { MealSlot } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';

interface RecipeForPlanner {
  id: string;
  name: string;
  food_ids: string[];
}

interface Kid {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  recipe: RecipeForPlanner | null;
  onClose: () => void;
  onAdded?: (info: { date: string; slot: MealSlot; kidCount: number }) => void;
}

const SLOTS: { value: MealSlot; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack1', label: 'Snack', emoji: '🍎' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildDateStrip(count = 14) {
  const out: { iso: string; dayLabel: string; dateLabel: string; isToday: boolean; isTomorrow: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    out.push({
      iso,
      dayLabel: DAY_NAMES[d.getDay()],
      dateLabel: String(d.getDate()),
      isToday: i === 0,
      isTomorrow: i === 1,
    });
  }
  return out;
}

export function RecipeAddToPlannerModal({ visible, recipe, onClose, onAdded }: Props) {
  const [kids, setKids] = useState<Kid[]>([]);
  const [selectedKids, setSelectedKids] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [saving, setSaving] = useState(false);

  const dates = useMemo(() => buildDateStrip(14), []);

  useEffect(() => {
    if (!visible || !recipe) return;
    setSelectedDate(dates[0].iso);
    setSlot(new Date().getHours() >= 16 ? 'dinner' : 'lunch');
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('kids').select('id, name').eq('user_id', user.id);
        const list = (data ?? []) as Kid[];
        setKids(list);
        setSelectedKids(new Set(list.map(k => k.id)));
      } catch (err) {
        console.error('Failed loading kids:', err);
      }
    })();
  }, [visible, recipe, dates]);

  const toggleKid = (id: string) => {
    setSelectedKids(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!recipe || !selectedDate) return;
    if (kids.length > 0 && selectedKids.size === 0) {
      Alert.alert('Pick at least one child', 'Select who this meal is for.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const kidIds = kids.length > 0 ? Array.from(selectedKids) : [null];
      const foodIds = recipe.food_ids.length > 0 ? recipe.food_ids : [null];

      const rows = kidIds.flatMap(kid_id =>
        foodIds.map(food_id => ({
          user_id: user.id,
          kid_id,
          date: selectedDate,
          meal_slot: slot,
          food_id,
          recipe_id: recipe.id,
          result: null as null,
        })),
      );

      const validRows = rows.filter(r => r.kid_id && r.food_id);
      if (validRows.length === 0) {
        Alert.alert(
          'Nothing to plan',
          recipe.food_ids.length === 0
            ? 'This recipe has no ingredients linked for planning.'
            : 'Add a child to your profile first.',
        );
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('plan_entries').insert(validRows);
      if (error) throw error;

      onAdded?.({ date: selectedDate, slot, kidCount: selectedKids.size });
      onClose();
    } catch (err) {
      console.error('Add to plan failed:', err);
      Alert.alert('Error', 'Failed to add to planner.');
    } finally {
      setSaving(false);
    }
  };

  if (!recipe) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add to planner</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{recipe.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Date</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateStrip}
            >
              {dates.map(d => (
                <TouchableOpacity
                  key={d.iso}
                  style={[
                    styles.dateChip,
                    selectedDate === d.iso && styles.dateChipActive,
                  ]}
                  onPress={() => setSelectedDate(d.iso)}
                  accessibilityState={{ selected: selectedDate === d.iso }}
                >
                  <Text style={[styles.dateDay, selectedDate === d.iso && styles.dateActive]}>
                    {d.isToday ? 'Today' : d.isTomorrow ? 'Tmrw' : d.dayLabel}
                  </Text>
                  <Text style={[styles.dateNum, selectedDate === d.iso && styles.dateActive]}>
                    {d.dateLabel}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Meal</Text>
            <View style={styles.slotRow}>
              {SLOTS.map(s => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.slotChip, slot === s.value && styles.slotChipActive]}
                  onPress={() => setSlot(s.value)}
                  accessibilityState={{ selected: slot === s.value }}
                >
                  <Text style={styles.slotEmoji}>{s.emoji}</Text>
                  <Text style={[styles.slotText, slot === s.value && styles.slotTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {kids.length > 0 && (
              <>
                <Text style={styles.label}>For</Text>
                <View style={styles.kidList}>
                  {kids.map(k => {
                    const isOn = selectedKids.has(k.id);
                    return (
                      <TouchableOpacity
                        key={k.id}
                        style={styles.kidRow}
                        onPress={() => toggleKid(k.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isOn }}
                      >
                        <View style={[styles.checkbox, isOn && styles.checkboxActive]}>
                          {isOn && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.kidName}>{k.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {kids.length === 0 && (
              <Text style={styles.hint}>
                Add a child to your profile to track meals per kid.
              </Text>
            )}

            {recipe.food_ids.length === 0 && (
              <Text style={[styles.hint, { color: colors.warning }]}>
                ⚠ This recipe has no linked foods yet, so nothing will be planned.
              </Text>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (saving || recipe.food_ids.length === 0) && styles.saveBtnDisabled,
              ]}
              disabled={saving || recipe.food_ids.length === 0}
              onPress={handleAdd}
            >
              {saving ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.saveText}>Add to plan</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    maxHeight: '88%',
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  closeText: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  label: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  dateStrip: { gap: spacing.xs, paddingVertical: spacing.xs },
  dateChip: {
    minWidth: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center',
  },
  dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateDay: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  dateNum: { fontSize: fontSize.lg, color: colors.text, fontWeight: '700', marginTop: 2 },
  dateActive: { color: colors.background },
  slotRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  slotChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotEmoji: { fontSize: fontSize.md },
  slotText: { fontSize: fontSize.sm, color: colors.text },
  slotTextActive: { color: colors.background, fontWeight: '600' },
  kidList: { gap: spacing.xs },
  kidRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, minHeight: 48,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { fontSize: 12, color: colors.background, fontWeight: '700' },
  kidName: { fontSize: fontSize.md, color: colors.text },
  hint: {
    fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, marginTop: spacing.sm,
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
