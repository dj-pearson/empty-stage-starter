import React from 'react';
import { useScanner } from '../hooks/useScanner';

export const BarcodeScannerScreen: React.FC = () => {
  const { scannerReady, scannedData, handleScan, feedback } = useScanner();

  return (
    <div className="barcode-scanner-screen">
      <h1>Scan Barcode</h1>
      {!scannerReady && <p>Loading scanner...</p>}
      {scannerReady && (
        <div className="camera-feed-placeholder">
          {/* Placeholder for camera feed */}
          <p>Camera Feed Area</p>
        </div>
      )}
      {scannedData.length > 0 && (
        <div>
          <h2>Scanned Data:</h2>
          <ul>
            {scannedData.map((data, index) => (
              <li key={index}>{data}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback && <p className="feedback">{feedback}</p>}
      <button onClick={() => handleScan(`simulated-barcode-${Date.now()}`)}>Simulate Scan</button>
    </div>
  );
};
