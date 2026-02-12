import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMobileApp } from './providers/MobileAppProvider';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] as const;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

interface NutritionData {
  name: string;
  brand?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  category?: string;
}

export default function ScannerScreen() {
  const { addFood } = useMobileApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const scannedRef = useRef(false);

  const handleBarCodeScanned = async ({ data, type }: { data: string; type: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);
    setLookingUp(true);

    try {
      // Look up nutrition data from Open Food Facts API
      const nutrition = await lookupBarcode(data);
      setLookingUp(false);

      if (nutrition) {
        Alert.alert(
          'Food Found',
          `${nutrition.name}${nutrition.brand ? ` (${nutrition.brand})` : ''}\n${nutrition.calories ? `${nutrition.calories} cal` : ''}`,
          [
            {
              text: 'Add to Pantry',
              onPress: async () => {
                await addFood({
                  name: nutrition.name,
                  category: nutrition.category || 'other',
                  is_safe: true,
                  barcode: data,
                  nutrition_info: {
                    ...(nutrition.calories !== undefined && { calories: nutrition.calories }),
                    ...(nutrition.protein !== undefined && { protein: nutrition.protein }),
                    ...(nutrition.carbs !== undefined && { carbs: nutrition.carbs }),
                    ...(nutrition.fat !== undefined && { fat: nutrition.fat }),
                  },
                });
                router.back();
              },
            },
            {
              text: 'Scan Again',
              onPress: () => {
                scannedRef.current = false;
                setScanned(false);
              },
            },
            { text: 'Cancel', onPress: () => router.back(), style: 'cancel' },
          ]
        );
      } else {
        Alert.alert(
          'Not Found',
          `No nutrition data found for barcode: ${data}. Would you like to add it manually?`,
          [
            {
              text: 'Scan Again',
              onPress: () => {
                scannedRef.current = false;
                setScanned(false);
              },
            },
            { text: 'Cancel', onPress: () => router.back(), style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      setLookingUp(false);
      Alert.alert('Error', 'Failed to look up barcode. Please try again.', [
        {
          text: 'Retry',
          onPress: () => {
            scannedRef.current = false;
            setScanned(false);
          },
        },
        { text: 'Cancel', onPress: () => router.back() },
      ]);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>
          Camera access is needed to scan barcodes for nutrition information.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            accessibilityLabel="Close scanner"
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          {/* Scan area indicator */}
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            {lookingUp ? (
              <View style={styles.lookingUp}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.instructionText}>Looking up nutrition data...</Text>
              </View>
            ) : (
              <Text style={styles.instructionText}>
                Position the barcode within the frame
              </Text>
            )}
          </View>
        </View>
      </CameraView>
    </View>
  );
}

async function lookupBarcode(barcode: string): Promise<NutritionData | null> {
  try {
    // Open Food Facts API (free, no auth required)
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      const nutriments = product.nutriments || {};

      return {
        name: product.product_name || product.product_name_en || 'Unknown Product',
        brand: product.brands,
        calories: nutriments['energy-kcal_100g'],
        protein: nutriments.proteins_100g,
        carbs: nutriments.carbohydrates_100g,
        fat: nutriments.fat_100g,
        category: mapCategory(product.categories_tags?.[0]),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function mapCategory(tag?: string): string {
  if (!tag) return 'other';
  const lower = tag.toLowerCase();
  if (lower.includes('fruit')) return 'fruit';
  if (lower.includes('vegetable')) return 'vegetable';
  if (lower.includes('meat') || lower.includes('fish') || lower.includes('poultry')) return 'protein';
  if (lower.includes('dairy') || lower.includes('milk') || lower.includes('cheese')) return 'dairy';
  if (lower.includes('grain') || lower.includes('bread') || lower.includes('cereal')) return 'grain';
  if (lower.includes('snack') || lower.includes('candy') || lower.includes('chip')) return 'snack';
  return 'other';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 24 },
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20, lineHeight: 24 },
  permissionButton: { backgroundColor: '#10b981', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10 },
  permissionButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { marginTop: 16, paddingVertical: 10 },
  cancelBtnText: { color: '#a1a1aa', fontSize: 15 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE * 0.6,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#22c55e',
    borderWidth: 3,
  },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  instructions: { marginTop: 32, paddingHorizontal: 20 },
  lookingUp: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
