import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

// Camera and barcode scanning will be implemented when expo-camera is fully configured
// For now, provide a placeholder that explains the feature

interface ScannedFood {
  name: string;
  barcode: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export default function ScanScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Will request camera permission when expo-camera is active
    // For now, set to null to show the setup state
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    try {
      // Dynamic import to avoid build issues if expo-camera isn't linked
      const Camera = await import('expo-camera').catch(() => null);
      if (Camera) {
        const { status } = await Camera.Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
      } else {
        setHasPermission(false);
      }
    } catch {
      setHasPermission(false);
    }
  };

  const handleManualEntry = () => {
    Alert.alert(
      'Manual Entry',
      'Manual barcode entry will be available in a future update. For now, use the web app to add food items.',
      [{ text: 'OK' }]
    );
  };

  const handleAddFood = async () => {
    if (!scannedFood) return;
    setIsProcessing(true);
    try {
      // Will integrate with Supabase to add food
      Alert.alert('Success', `"${scannedFood.name}" added to your foods!`);
      setScannedFood(null);
    } catch {
      Alert.alert('Error', 'Failed to add food. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Scan Food</Text>

      <View style={styles.content}>
        {/* Camera Preview Area */}
        <View style={styles.cameraArea}>
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraTitle}>Barcode Scanner</Text>
            {hasPermission === false ? (
              <>
                <Text style={styles.cameraText}>
                  Camera permission is required to scan barcodes.
                </Text>
                <TouchableOpacity
                  style={styles.permissionButton}
                  onPress={checkCameraPermission}
                  accessibilityLabel="Grant camera permission"
                  accessibilityRole="button"
                >
                  <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
              </>
            ) : hasPermission === null ? (
              <Text style={styles.cameraText}>
                Point your camera at a food barcode to scan nutrition information.
              </Text>
            ) : (
              <Text style={styles.cameraText}>
                Camera ready. Point at a barcode to scan.
              </Text>
            )}
          </View>
        </View>

        {/* Scanned Result */}
        {scannedFood && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{scannedFood.name}</Text>
            <Text style={styles.resultBarcode}>Barcode: {scannedFood.barcode}</Text>
            <View style={styles.nutritionRow}>
              {scannedFood.calories != null && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedFood.calories}</Text>
                  <Text style={styles.nutritionLabel}>cal</Text>
                </View>
              )}
              {scannedFood.protein != null && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedFood.protein}g</Text>
                  <Text style={styles.nutritionLabel}>protein</Text>
                </View>
              )}
              {scannedFood.carbs != null && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedFood.carbs}g</Text>
                  <Text style={styles.nutritionLabel}>carbs</Text>
                </View>
              )}
              {scannedFood.fat != null && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedFood.fat}g</Text>
                  <Text style={styles.nutritionLabel}>fat</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddFood}
              disabled={isProcessing}
              accessibilityLabel={`Add ${scannedFood.name} to foods`}
              accessibilityRole="button"
            >
              {isProcessing ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.addButtonText}>Add to My Foods</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Manual Entry Option */}
        <TouchableOpacity
          style={styles.manualButton}
          onPress={handleManualEntry}
          accessibilityLabel="Enter barcode manually"
          accessibilityRole="button"
        >
          <Text style={styles.manualButtonText}>Enter Barcode Manually</Text>
        </TouchableOpacity>

        {/* Flashlight toggle placeholder */}
        {hasPermission && (
          <TouchableOpacity
            style={styles.flashButton}
            accessibilityLabel="Toggle flashlight"
            accessibilityRole="button"
          >
            <Text style={styles.flashIcon}>🔦</Text>
            <Text style={styles.flashText}>Flashlight</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  screenTitle: {
    fontSize: fontSize.xxl, fontWeight: '700', color: colors.text,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  content: { flex: 1, paddingHorizontal: spacing.md },
  cameraArea: {
    aspectRatio: 4 / 3, borderRadius: borderRadius.lg, overflow: 'hidden',
    marginBottom: spacing.md, backgroundColor: colors.text,
  },
  cameraPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  cameraIcon: { fontSize: 48, marginBottom: spacing.md },
  cameraTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.background, marginBottom: spacing.sm },
  cameraText: {
    fontSize: fontSize.sm, color: '#9ca3af', textAlign: 'center', lineHeight: 20,
  },
  permissionButton: {
    marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 48,
    justifyContent: 'center',
  },
  permissionButtonText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.background },
  resultCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  resultTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  resultBarcode: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  nutritionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  nutritionLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  addButton: {
    height: 48, backgroundColor: colors.primary, borderRadius: borderRadius.md,
    justifyContent: 'center', alignItems: 'center', marginTop: spacing.md,
  },
  addButtonText: { fontSize: fontSize.md, fontWeight: '600', color: colors.background },
  manualButton: {
    height: 48, backgroundColor: colors.background, borderRadius: borderRadius.md,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  manualButtonText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  flashButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, minHeight: 48,
  },
  flashIcon: { fontSize: 20 },
  flashText: { fontSize: fontSize.sm, color: colors.textSecondary },
});
