import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';

export interface ChipOption {
  key: string;
  label: string;
  emoji?: string;
}

export interface FilterGroup {
  key: string;
  title: string;
  /** true = multi-select (e.g. tags); false = single-select toggle. */
  multi: boolean;
  options: ChipOption[];
  /** Currently selected option keys. */
  selected: string[];
  onChange: (selected: string[]) => void;
}

export interface SortOptionDef {
  key: string;
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  groups: FilterGroup[];
  sort?: {
    options: SortOptionDef[];
    value: string;
    onChange: (value: string) => void;
  };
  onReset: () => void;
  /** Number of active filters, shown in the header. */
  activeCount: number;
}

/**
 * Reusable advanced-filter / sort bottom sheet. Config-driven so Recipes and
 * Pantry (and future screens) share one implementation instead of each growing
 * its own ad-hoc chip rows. Single-select groups behave like a radio (tap the
 * active chip to clear); multi-select groups toggle each chip independently.
 */
export function FilterSortSheet({
  visible,
  onClose,
  title = 'Filter & sort',
  groups,
  sort,
  onReset,
  activeCount,
}: Props) {
  const toggleOption = (group: FilterGroup, key: string) => {
    if (group.multi) {
      const next = group.selected.includes(key)
        ? group.selected.filter((k) => k !== key)
        : [...group.selected, key];
      group.onChange(next);
    } else {
      group.onChange(group.selected.includes(key) ? [] : [key]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {title}
              {activeCount > 0 ? ` · ${activeCount}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close filters">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            {groups.map((group) => (
              <View key={group.key} style={styles.section}>
                <Text style={styles.sectionTitle}>{group.title}</Text>
                <View style={styles.chipRow}>
                  {group.options.map((opt) => {
                    const active = group.selected.includes(opt.key);
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleOption(group, opt.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${group.title}: ${opt.label}`}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {opt.emoji ? `${opt.emoji} ` : ''}
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {sort && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sort by</Text>
                <View style={styles.chipRow}>
                  {sort.options.map((opt) => {
                    const active = sort.value === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => sort.onChange(opt.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Sort by ${opt.label}`}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={onReset}
              accessibilityLabel="Reset all filters"
            >
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={onClose}
              accessibilityLabel="Apply filters"
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Compact filter-trigger button with an active-count badge. */
export function FilterButton({
  activeCount,
  onPress,
  label = 'Filter',
}: {
  activeCount: number;
  onPress: () => void;
  label?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterBtn, activeCount > 0 && styles.filterBtnActive]}
      onPress={onPress}
      accessibilityLabel={`${label}${activeCount > 0 ? `, ${activeCount} active` : ''}`}
    >
      <Text style={[styles.filterBtnText, activeCount > 0 && styles.filterBtnTextActive]}>
        ⚙︎ {label}
      </Text>
      {activeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeCount}</Text>
        </View>
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
    maxHeight: '85%',
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  closeText: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  body: { paddingHorizontal: spacing.lg },
  section: { marginTop: spacing.lg },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.text },
  chipTextActive: { color: colors.background, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetBtn: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  doneBtn: {
    flex: 2,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneText: { fontSize: fontSize.md, color: colors.background, fontWeight: '700' },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterBtnActive: { borderColor: colors.primary, backgroundColor: '#ecfdf5' },
  filterBtnText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  filterBtnTextActive: { color: colors.primaryDark },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, color: colors.background, fontWeight: '700' },
});
