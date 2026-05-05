import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { MealResult, MealSlot } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';

const SLOT_OPTIONS: { value: MealSlot; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack1', label: 'Snack', emoji: '🍎' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface PlannerEntryGroup {
  signature: string;
  foodId: string;
  foodName: string;
  recipeId: string | null;
  date: string;
  slot: MealSlot;
  result: MealResult;
  perKid: { kidId: string; entryId: string }[];
}

interface Props {
  visible: boolean;
  entry: PlannerEntryGroup | null;
  audienceLabel: string;
  onClose: () => void;
  onMoveSlot: (entry: PlannerEntryGroup, newSlot: MealSlot) => Promise<void>;
  onMoveDate: (entry: PlannerEntryGroup, newDate: string) => Promise<void>;
  onDuplicateNextDay: (entry: PlannerEntryGroup) => Promise<void>;
  onMarkResult: (entry: PlannerEntryGroup, result: MealResult) => Promise<void>;
  onAddToGrocery: (entry: PlannerEntryGroup) => Promise<void>;
  onDelete: (entry: PlannerEntryGroup) => Promise<void>;
}

function buildDayStrip(fromIso: string, count = 14) {
  const start = new Date(`${fromIso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: { iso: string; dayLabel: string; dateLabel: string; isToday: boolean }[] = [];
  for (let i = -1; i < count - 1; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    out.push({
      iso,
      dayLabel: DAY_NAMES[d.getDay()],
      dateLabel: String(d.getDate()),
      isToday: iso === today.toISOString().split('T')[0],
    });
  }
  return out;
}

export function PlannerEntryActionSheet({
  visible,
  entry,
  audienceLabel,
  onClose,
  onMoveSlot,
  onMoveDate,
  onDuplicateNextDay,
  onMarkResult,
  onAddToGrocery,
  onDelete,
}: Props) {
  const [view, setView] = useState<'main' | 'moveDay'>('main');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setView('main');
      setBusy(null);
    }
  }, [visible]);

  if (!entry) return null;

  const wrap = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      onClose();
    } catch (err) {
      console.error('Planner action failed:', err);
    } finally {
      setBusy(null);
    }
  };

  const days = buildDayStrip(entry.date, 14);
  const isRecipe = !!entry.recipeId;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {entry.foodName}
              </Text>
              <Text style={styles.subtitle}>
                {SLOT_OPTIONS.find((s) => s.value === entry.slot)?.label ?? entry.slot} ·{' '}
                {audienceLabel}
                {entry.perKid.length > 1 ? ` · ${entry.perKid.length} kids` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {view === 'main' ? (
            <ScrollView style={styles.body}>
              <Text style={styles.sectionLabel}>Move to meal</Text>
              <View style={styles.slotRow}>
                {SLOT_OPTIONS.map((s) => {
                  const isCurrent = s.value === entry.slot;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.slotChip, isCurrent && styles.slotChipDisabled]}
                      onPress={() =>
                        !isCurrent && wrap(`slot:${s.value}`, () => onMoveSlot(entry, s.value))
                      }
                      disabled={isCurrent || !!busy}
                      accessibilityLabel={`Move to ${s.label}`}
                    >
                      <Text style={styles.slotEmoji}>{s.emoji}</Text>
                      <Text style={[styles.slotText, isCurrent && styles.slotTextMuted]}>
                        {s.label}
                      </Text>
                      {isCurrent && <Text style={styles.slotBadge}>Now</Text>}
                      {busy === `slot:${s.value}` && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Quick actions</Text>
              <ActionRow
                icon="📆"
                label="Move to another day"
                hint="Pick any day in the next two weeks"
                onPress={() => setView('moveDay')}
              />
              <ActionRow
                icon="🔁"
                label="Duplicate to tomorrow"
                hint="Same meal, same kids"
                busy={busy === 'dup'}
                onPress={() => wrap('dup', () => onDuplicateNextDay(entry))}
              />
              {isRecipe && (
                <ActionRow
                  icon="🛒"
                  label="Add ingredients to grocery"
                  hint="Only what you don't have on hand"
                  busy={busy === 'grocery'}
                  onPress={() => wrap('grocery', () => onAddToGrocery(entry))}
                />
              )}

              <Text style={styles.sectionLabel}>How did it go?</Text>
              <View style={styles.resultRow}>
                <ResultChip
                  emoji="🍽"
                  label="Ate it"
                  active={entry.result === 'ate'}
                  busy={busy === 'res:ate'}
                  onPress={() => wrap('res:ate', () => onMarkResult(entry, 'ate'))}
                />
                <ResultChip
                  emoji="👅"
                  label="Tasted"
                  active={entry.result === 'tasted'}
                  busy={busy === 'res:tasted'}
                  onPress={() => wrap('res:tasted', () => onMarkResult(entry, 'tasted'))}
                />
                <ResultChip
                  emoji="🙅"
                  label="Refused"
                  active={entry.result === 'refused'}
                  busy={busy === 'res:refused'}
                  onPress={() => wrap('res:refused', () => onMarkResult(entry, 'refused'))}
                />
                <ResultChip
                  emoji="↺"
                  label="Reset"
                  active={entry.result == null}
                  busy={busy === 'res:null'}
                  onPress={() => wrap('res:null', () => onMarkResult(entry, null))}
                />
              </View>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => wrap('del', () => onDelete(entry))}
                disabled={!!busy}
                accessibilityLabel="Remove from plan"
              >
                {busy === 'del' ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.deleteText}>Remove from plan</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.body}>
              <View style={styles.moveDayHeader}>
                <TouchableOpacity onPress={() => setView('main')} accessibilityLabel="Back">
                  <Text style={styles.backText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.moveDayTitle}>Pick a day</Text>
                <View style={{ width: 50 }} />
              </View>
              <ScrollView contentContainerStyle={styles.dayGrid}>
                {days.map((d) => {
                  const isCurrent = d.iso === entry.date;
                  return (
                    <TouchableOpacity
                      key={d.iso}
                      style={[
                        styles.dayCell,
                        isCurrent && styles.dayCellCurrent,
                        d.isToday && !isCurrent && styles.dayCellToday,
                      ]}
                      disabled={isCurrent || !!busy}
                      onPress={() => wrap(`day:${d.iso}`, () => onMoveDate(entry, d.iso))}
                      accessibilityLabel={`Move to ${d.dayLabel} ${d.dateLabel}`}
                    >
                      <Text style={[styles.dayCellLabel, isCurrent && styles.dayCellMuted]}>
                        {d.dayLabel}
                      </Text>
                      <Text style={[styles.dayCellNum, isCurrent && styles.dayCellMuted]}>
                        {d.dateLabel}
                      </Text>
                      {d.isToday && <Text style={styles.dayCellTag}>Today</Text>}
                      {isCurrent && <Text style={styles.dayCellTag}>Now</Text>}
                      {busy === `day:${d.iso}` && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  onPress,
  busy,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      disabled={busy}
      accessibilityLabel={label}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={styles.actionChevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

function ResultChip({
  emoji,
  label,
  active,
  onPress,
  busy,
}: {
  emoji: string;
  label: string;
  active: boolean;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.resultChip, active && styles.resultChipActive]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={styles.resultEmoji}>{emoji}</Text>
      <Text style={[styles.resultText, active && styles.resultTextActive]}>{label}</Text>
      {busy && (
        <ActivityIndicator size="small" color={active ? colors.background : colors.primary} />
      )}
    </TouchableOpacity>
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
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  closeText: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  slotChipDisabled: { opacity: 0.55 },
  slotEmoji: { fontSize: fontSize.md },
  slotText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  slotTextMuted: { color: colors.textSecondary },
  slotBadge: {
    fontSize: 10,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionIcon: { fontSize: fontSize.lg, width: 28, textAlign: 'center' },
  actionLabel: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  actionHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  actionChevron: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
  },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  resultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  resultChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  resultEmoji: { fontSize: fontSize.md },
  resultText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  resultTextActive: { color: colors.background },
  deleteBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  deleteText: { fontSize: fontSize.md, color: colors.error, fontWeight: '700' },
  moveDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  moveDayTitle: { fontSize: fontSize.md, color: colors.text, fontWeight: '700' },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dayCell: {
    width: '22%',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  dayCellCurrent: { backgroundColor: colors.surface, opacity: 0.55 },
  dayCellToday: { borderColor: colors.primary, borderWidth: 2 },
  dayCellLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  dayCellNum: { fontSize: fontSize.lg, color: colors.text, fontWeight: '700', marginTop: 2 },
  dayCellMuted: { color: colors.textSecondary },
  dayCellTag: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
