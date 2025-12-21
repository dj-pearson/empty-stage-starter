import { useState, useEffect } from 'react';

export function useScanner() {
  const [scannerReady, setScannerReady] = useState(false);
  const [scannedData, setScannedData] = useState<string[]>([]);

  // Placeholder for scanner initialization logic
  useEffect(() => {
    const initializeScanner = async () => {
      // Simulate async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      setScannerReady(true);
    };

    initializeScanner();
  }, []);

  const handleScan = (data: string) => {
    setScannedData((prev) => [...prev, data]);
  };

  return { scannerReady, scannedData, handleScan };
}
