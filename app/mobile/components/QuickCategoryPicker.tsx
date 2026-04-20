import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import type { FoodCategory } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { CATEGORIES } from '../lib/unit-suggestions';

interface Props {
  visible: boolean;
  itemName: string;
  current: FoodCategory | null;
  onClose: () => void;
  onPick: (category: FoodCategory) => void;
}

export function QuickCategoryPicker({ visible, itemName, current, onClose, onPick }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Move "{itemName}"</Text>
          <Text style={styles.subtitle}>to category</Text>
          <View style={styles.grid}>
            {CATEGORIES.map(c => {
              const isCurrent = current === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, isCurrent && styles.chipActive]}
                  onPress={() => onPick(c.key)}
                  accessibilityState={{ selected: isCurrent }}
                >
                  <Text style={styles.chipEmoji}>{c.emoji}</Text>
                  <Text style={[styles.chipText, isCurrent && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg,
  },
  sheet: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.background, borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  chip: {
    minWidth: 92, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', gap: 4,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipEmoji: { fontSize: fontSize.xl },
  chipText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.background },
});
