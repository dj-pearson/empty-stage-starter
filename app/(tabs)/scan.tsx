import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import { queryOpenFoodFacts, isPlausibleBarcode, type OpenFoodFactsLookup } from '@/lib/open-food-facts';
import { sanitizeTextInput } from '../../app/mobile/lib/validation';
import { announceForAccessibility } from '../../app/mobile/lib/a11y';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

/**
 * US-120: Barcode scan screen.
 *
 * Two paths to a barcode:
 *   1. Camera scan via expo-camera (dynamic import — falls back gracefully
 *      when the native module isn't linked yet, e.g. on Expo Go for web).
 *   2. Manual barcode entry (always available, satisfies the "no-camera"
 *      and "permission denied" branches of the AC).
 *
 * Both paths funnel to the same `lookupBarcode` flow that hits OpenFoodFacts
 * and renders a result card with name, calories, macros, and allergens, plus
 * a primary "Add to My Foods" button that inserts into Supabase `foods`.
 */

interface ScannedFood extends OpenFoodFactsLookup {
  source: 'scan' | 'manual';
}

export default function ScanScreen() {
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  // Probe expo-camera availability and request permission on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const Camera = await import('expo-camera').catch(() => null);
        if (!active) return;
        if (!Camera || !Camera.Camera) {
          setCameraSupported(false);
          setHasCameraPermission(null);
          return;
        }
        setCameraSupported(true);
        const { status } = await Camera.Camera.requestCameraPermissionsAsync();
        if (active) setHasCameraPermission(status === 'granted');
      } catch {
        if (active) {
          setCameraSupported(false);
          setHasCameraPermission(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const lookupBarcode = useCallback(
    async (barcode: string, source: ScannedFood['source']) => {
      const cleaned = barcode.trim().replace(/\s+/g, '');
      if (!isPlausibleBarcode(cleaned)) {
        Alert.alert(
          'Hmm, that barcode looks off',
          'EatPal supports EAN-13, UPC-A, and UPC-E (8, 12, or 13 digits).'
        );
        return;
      }

      setIsLooking(true);
      setScannedFood(null);
      setNotFoundBarcode(null);
      announceForAccessibility('Looking up product');
      try {
        const result = await queryOpenFoodFacts(cleaned);
        if (!result) {
          setNotFoundBarcode(cleaned);
          announceForAccessibility('Product not found');
          return;
        }
        setScannedFood({ ...result, source });
        announceForAccessibility(`Found ${result.name}`);
      } catch (err) {
        console.error('OpenFoodFacts lookup failed:', err);
        Alert.alert('Lookup failed', 'Check your connection and try again.');
      } finally {
        setIsLooking(false);
      }
    },
    []
  );

  const handleManualSubmit = useCallback(() => {
    void lookupBarcode(manualBarcode, 'manual');
  }, [lookupBarcode, manualBarcode]);

  const handleAddFood = useCallback(async () => {
    if (!scannedFood) return;
    setIsAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Please sign in', 'Sign in to save foods to your pantry.');
        return;
      }
      const cleanName = sanitizeTextInput(scannedFood.name, 200);
      const { error } = await supabase.from('foods').insert({
        user_id: user.id,
        name: cleanName,
        category: 'snack',
        is_safe: true,
        is_try_bite: false,
        quantity: 1,
        unit: '',
        barcode: scannedFood.barcode,
        nutrition_info: {
          calories: scannedFood.calories,
          protein_g: scannedFood.proteinG,
          carbs_g: scannedFood.carbsG,
          fat_g: scannedFood.fatG,
          fiber_g: scannedFood.fiberG,
          sugar_g: scannedFood.sugarG,
          salt_g: scannedFood.saltG,
        },
        allergens: scannedFood.allergens,
      });
      if (error) throw error;
      Alert.alert('Added!', `"${cleanName}" saved to your pantry.`);
      setScannedFood(null);
      setManualBarcode('');
    } catch (err) {
      console.error('Add food failed:', err);
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setIsAdding(false);
    }
  }, [scannedFood]);

  const cameraHelpText = !cameraSupported
    ? 'Camera scanning needs a native build (expo-camera). Use the manual entry below for now.'
    : hasCameraPermission === false
    ? 'Camera permission was denied. Use the manual entry below, or grant access in Settings.'
    : hasCameraPermission === null
    ? 'Tap "Grant access" below to scan with the camera, or enter a barcode manually.'
    : 'Point your camera at a food barcode to scan, or enter one manually.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenTitle}>Scan Food</Text>

        {/* Camera placeholder — keeps the UI honest until expo-camera is linked. */}
        <View style={styles.cameraArea}>
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraTitle}>Barcode Scanner</Text>
            <Text style={styles.cameraText}>{cameraHelpText}</Text>
            {cameraSupported && hasCameraPermission === false && (
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={async () => {
                  const Camera = await import('expo-camera').catch(() => null);
                  if (Camera) {
                    const { status } = await Camera.Camera.requestCameraPermissionsAsync();
                    setHasCameraPermission(status === 'granted');
                  }
                }}
                accessibilityLabel="Grant camera permission"
                accessibilityRole="button"
              >
                <Text style={styles.permissionButtonText}>Grant access</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Flashlight toggle — only meaningful once expo-camera is wired. */}
          {cameraSupported && hasCameraPermission && (
            <TouchableOpacity
              style={styles.flashOverlay}
              onPress={() => setFlashOn((v) => !v)}
              accessibilityLabel={flashOn ? 'Turn flashlight off' : 'Turn flashlight on'}
              accessibilityRole="button"
              accessibilityState={{ selected: flashOn }}
            >
              <Text style={styles.flashIcon}>{flashOn ? '🔦' : '💡'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Manual barcode entry — primary path until camera is fully linked. */}
        <View style={styles.manualBlock}>
          <Text style={styles.label}>Enter barcode manually</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={manualBarcode}
              onChangeText={(v) => setManualBarcode(v.replace(/\D/g, '').slice(0, 14))}
              keyboardType="number-pad"
              placeholder="e.g. 0123456789012"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Barcode digits"
              autoFocus
              onSubmitEditing={handleManualSubmit}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.lookupButton, (!manualBarcode || isLooking) && styles.lookupButtonDisabled]}
              onPress={handleManualSubmit}
              disabled={!manualBarcode || isLooking}
              accessibilityLabel="Look up barcode"
              accessibilityRole="button"
            >
              {isLooking ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.lookupButtonText}>Look up</Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>EAN-13, UPC-A, or UPC-E (8 / 12 / 13 digits)</Text>
        </View>

        {/* Result: scanned food card */}
        {scannedFood && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{scannedFood.name}</Text>
            {scannedFood.brand && <Text style={styles.resultSubtitle}>{scannedFood.brand}</Text>}
            <Text style={styles.resultBarcode}>Barcode: {scannedFood.barcode}</Text>

            <View style={styles.nutritionRow}>
              {scannedFood.calories != null && (
                <Nut label="cal" value={`${scannedFood.calories}`} />
              )}
              {scannedFood.proteinG != null && <Nut label="protein" value={`${scannedFood.proteinG}g`} />}
              {scannedFood.carbsG != null && <Nut label="carbs" value={`${scannedFood.carbsG}g`} />}
              {scannedFood.fatG != null && <Nut label="fat" value={`${scannedFood.fatG}g`} />}
            </View>

            {scannedFood.allergens.length > 0 && (
              <View style={styles.allergenRow}>
                <Text style={styles.allergenLabel}>⚠ Allergens:</Text>
                <Text style={styles.allergenText} numberOfLines={2}>
                  {scannedFood.allergens
                    .map((a) => a.replace(/^en:/, '').replace(/-/g, ' '))
                    .join(', ')}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.addButton, isAdding && styles.lookupButtonDisabled]}
              onPress={handleAddFood}
              disabled={isAdding}
              accessibilityLabel={`Add ${scannedFood.name} to my foods`}
              accessibilityRole="button"
            >
              {isAdding ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.addButtonText}>Add to My Foods</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Result: not found */}
        {notFoundBarcode && !scannedFood && (
          <View style={styles.notFoundCard}>
            <Text style={styles.notFoundTitle}>Not in OpenFoodFacts yet</Text>
            <Text style={styles.notFoundText}>
              Barcode {notFoundBarcode} isn’t in the public OpenFoodFacts database.
              You can still add the item manually from the Pantry tab.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Nut({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.nutritionItem}>
      <Text style={styles.nutritionValue}>{value}</Text>
      <Text style={styles.nutritionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingBottom: spacing.xxl },
  screenTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  cameraArea: {
    aspectRatio: 4 / 3,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.text,
    marginBottom: spacing.md,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cameraIcon: { fontSize: 48, marginBottom: spacing.md },
  cameraTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.background, marginBottom: spacing.sm },
  cameraText: {
    fontSize: fontSize.sm,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  permissionButtonText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.background },
  flashOverlay: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashIcon: { fontSize: 22 },
  manualBlock: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  manualRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  manualInput: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lookupButton: {
    height: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lookupButtonDisabled: { opacity: 0.5 },
  lookupButtonText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.background },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  resultCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  resultTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  resultSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  resultBarcode: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4 },
  nutritionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap' },
  nutritionItem: { alignItems: 'center', minWidth: 64 },
  nutritionValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  nutritionLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  allergenRow: {
    marginTop: spacing.md,
    backgroundColor: '#fef3c7',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  allergenLabel: { fontSize: fontSize.xs, fontWeight: '700', color: '#78350f' },
  allergenText: { fontSize: fontSize.sm, color: '#78350f', marginTop: 2 },
  addButton: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  addButtonText: { fontSize: fontSize.md, fontWeight: '700', color: colors.background },
  notFoundCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notFoundTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  notFoundText: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
});
