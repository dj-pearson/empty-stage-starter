import { useState, useEffect } from 'react';

export function useScanner() {
  const [scannerReady, setScannerReady] = useState(false);
  const [scannedData, setScannedData] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Placeholder for scanner initialization logic.
  // Create the timer directly in the effect body and return its cleanup — the
  // previous version returned clearTimeout from an inner async function, so the
  // effect's return value was a Promise and React never ran the cleanup (timer
  // leak + setState-after-unmount if unmounted within 100ms).
  useEffect(() => {
    const timer = setTimeout(() => {
      setScannerReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleScan = (data: string) => {
    setScannedData((prev) => [...prev, data]);
    setFeedback('Scan successful!');
  };

  return { scannerReady, scannedData, handleScan, feedback };
}
