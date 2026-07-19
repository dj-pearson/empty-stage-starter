import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
}

/**
 * Shared search input: leading magnifier + inline clear button. Replaces the
 * bare, slightly different `TextInput`s that each list screen hand-rolled, so
 * search looks and behaves the same everywhere (and the clear button is no
 * longer missing on the Recipes/Pantry screens).
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search…',
  autoFocus,
  accessibilityLabel,
  onSubmitEditing,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🔎</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          accessibilityLabel="Clear search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.clear}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    height: 44,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { fontSize: fontSize.md },
  input: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: 0 },
  clear: { fontSize: fontSize.md, color: colors.textSecondary, paddingHorizontal: spacing.xs },
});
