import { useMemo, useState } from 'react';
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
import { parseGroceryText, type ParsedGroceryItem } from '@/lib/parse-grocery-text';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { CATEGORIES } from '../lib/unit-suggestions';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (items: ParsedGroceryItem[]) => void;
}

const EXAMPLE = `chicken
bananas
2 gal milk
1 lb ground beef
mac and cheese
½ dozen eggs`;

export function BulkAddSheet({ visible, onClose, onConfirm }: Props) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseGroceryText(text), [text]);

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleConfirm = () => {
    if (parsed.length === 0) return;
    onConfirm(parsed);
    setText('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Quick add</Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Type free-form — one per line or comma-separated. Add quantities/sizes now or later.
          </Text>

          <TextInput
            style={styles.textarea}
            value={text}
            onChangeText={setText}
            placeholder={EXAMPLE}
            placeholderTextColor={colors.textSecondary}
            multiline
            autoFocus
            textAlignVertical="top"
            accessibilityLabel="Grocery items bulk entry"
          />

          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewLabel}>
              Preview ({parsed.length} {parsed.length === 1 ? 'item' : 'items'})
            </Text>
            {text.length > 0 && (
              <TouchableOpacity onPress={() => setText('')}>
                <Text style={styles.linkText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.previewList} keyboardShouldPersistTaps="handled">
            {parsed.length === 0 ? (
              <Text style={styles.emptyPreview}>Your items will appear here as you type.</Text>
            ) : (
              parsed.map((item, i) => {
                const cat = CATEGORIES.find(c => c.key === item.category);
                return (
                  <View key={`${item.name}-${i}`} style={styles.previewRow}>
                    <Text style={styles.previewEmoji}>{cat?.emoji ?? '🛒'}</Text>
                    <View style={styles.previewInfo}>
                      <Text style={styles.previewName}>{item.name}</Text>
                      {(item.quantity !== 1 || item.unit) && (
                        <Text style={styles.previewQty}>
                          {item.quantity} {item.unit}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.previewCategory}>{cat?.label ?? '—'}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, parsed.length === 0 && styles.saveBtnDisabled]}
              disabled={parsed.length === 0}
              onPress={handleConfirm}
            >
              <Text style={styles.saveText}>
                Add {parsed.length > 0 ? parsed.length : ''}
              </Text>
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
    height: '88%',
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
  hint: {
    fontSize: fontSize.xs, color: colors.textSecondary,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  textarea: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    minHeight: 140,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  previewHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  previewLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  linkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  previewList: { flex: 1, paddingHorizontal: spacing.lg },
  emptyPreview: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    textAlign: 'center', paddingVertical: spacing.xl,
  },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  previewEmoji: { fontSize: fontSize.lg },
  previewInfo: { flex: 1 },
  previewName: { fontSize: fontSize.md, color: colors.text },
  previewQty: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  previewCategory: {
    fontSize: fontSize.xs, color: colors.primary, fontWeight: '500',
  },
  footer: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
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
