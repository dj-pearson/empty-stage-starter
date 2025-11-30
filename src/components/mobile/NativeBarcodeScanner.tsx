/**
 * Native Barcode Scanner for Expo/React Native
 * Uses expo-camera for optimal mobile barcode scanning performance
 */

import { useState, useEffect, useRef } from 'react';
import { isMobile } from '@/lib/platform';

// Types for the barcode scanner
interface BarcodeScanningResult {
  type: string;
  data: string;
  bounds?: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
}

interface NativeBarcodeScannerProps {
  onBarcodeScanned: (barcode: string) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  isActive: boolean;
}

// Supported barcode types for food products
const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
];

export function NativeBarcodeScanner({
  onBarcodeScanned,
  onError,
  onCancel,
  isActive,
}: NativeBarcodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannedRef = useRef(false);

  // Only render on mobile platforms
  if (!isMobile()) {
    return null;
  }

  // Dynamic imports for React Native components
  const [CameraModule, setCameraModule] = useState<any>(null);
  const [RNComponents, setRNComponents] = useState<any>(null);

  useEffect(() => {
    // Dynamically import expo-camera and react-native components
    const loadModules = async () => {
      try {
        const camera = await import('expo-camera');
        const rn = await import('react-native');
        setCameraModule(camera);
        setRNComponents(rn);
      } catch (err) {
        console.error('Failed to load camera modules:', err);
        onError('Camera module not available');
      }
    };

    loadModules();
  }, []);

  useEffect(() => {
    if (!CameraModule) return;

    const requestPermission = async () => {
      try {
        const { status } = await CameraModule.Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
        if (status !== 'granted') {
          onError('Camera permission denied. Please enable camera access in settings.');
        }
      } catch (err) {
        console.error('Permission request failed:', err);
        onError('Failed to request camera permission');
      }
    };

    requestPermission();
  }, [CameraModule]);

  useEffect(() => {
    if (isActive) {
      scannedRef.current = false;
      setIsScanning(true);
    } else {
      setIsScanning(false);
    }
  }, [isActive]);

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    // Prevent duplicate scans
    if (scannedRef.current) return;

    scannedRef.current = true;
    setIsScanning(false);

    // Small delay to ensure clean UI transition
    setTimeout(() => {
      onBarcodeScanned(result.data);
    }, 100);
  };

  // Don't render until modules are loaded
  if (!CameraModule || !RNComponents) {
    return null;
  }

  const { CameraView } = CameraModule;
  const { View, Text, StyleSheet, TouchableOpacity, Dimensions } = RNComponents;

  const { width: screenWidth } = Dimensions.get('window');
  const scanAreaSize = screenWidth * 0.7;

  // Native styles
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    camera: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scanArea: {
      width: scanAreaSize,
      height: scanAreaSize * 0.6,
      borderWidth: 2,
      borderColor: '#22c55e',
      borderRadius: 12,
      backgroundColor: 'transparent',
    },
    scanLine: {
      position: 'absolute',
      top: '50%',
      left: 10,
      right: 10,
      height: 2,
      backgroundColor: '#22c55e',
    },
    instructions: {
      marginTop: 24,
      paddingHorizontal: 20,
    },
    instructionText: {
      color: '#fff',
      fontSize: 16,
      textAlign: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    cancelButton: {
      position: 'absolute',
      bottom: 40,
      alignSelf: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 25,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    cancelText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
      padding: 20,
    },
    permissionText: {
      color: '#fff',
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 20,
    },
    retryButton: {
      backgroundColor: '#22c55e',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
    },
    retryText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  // Permission denied state
  if (hasPermission === false) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera access is required to scan barcodes.{'\n\n'}
          Please enable camera permission in your device settings.
        </Text>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading state
  if (hasPermission === null) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!isActive || !isScanning) {
    return null;
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: BARCODE_TYPES,
        }}
        onBarcodeScanned={handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={styles.scanLine} />
          </View>
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>
              Position the barcode within the frame
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

export default NativeBarcodeScanner;
