import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { BarcodeScannerScreen } from './BarcodeScannerScreen';
import React from 'react';
import { useScanner } from '../hooks/useScanner';

// Mock the useScanner hook
vi.mock('../hooks/useScanner');

describe('BarcodeScannerScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default mock implementation for useScanner
    (useScanner as vi.Mock).mockReturnValue({
      scannerReady: true,
      scannedData: [],
      handleScan: vi.fn(),
      feedback: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display the scan screen with a title and camera feed placeholder', async () => {
    render(<BarcodeScannerScreen />);

    expect(screen.getByText('Scan Barcode')).toBeInTheDocument();
    expect(screen.getByText('Camera Feed Area')).toBeInTheDocument();
  });

  it('should show loading scanner message when not ready', () => {
    (useScanner as vi.Mock).mockReturnValue({
      scannerReady: false,
      scannedData: [],
      handleScan: vi.fn(),
      feedback: null,
    });
    render(<BarcodeScannerScreen />);

    expect(screen.getByText('Loading scanner...')).toBeInTheDocument();
    expect(screen.queryByText('Camera Feed Area')).not.toBeInTheDocument();
  });

  it('should display scanned data', async () => {
    (useScanner as vi.Mock).mockReturnValue({
      scannerReady: true,
      scannedData: ['12345', '98765'],
      handleScan: vi.fn(),
      feedback: null,
    });
    render(<BarcodeScannerScreen />);

    expect(screen.getByText('Scanned Data:')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('98765')).toBeInTheDocument();
  });

  it('should display feedback', () => {
    (useScanner as vi.Mock).mockReturnValue({
      scannerReady: true,
      scannedData: [],
      handleScan: vi.fn(),
      feedback: 'Scan successful!',
    });
    render(<BarcodeScannerScreen />);

    expect(screen.getByText('Scan successful!')).toBeInTheDocument();
  });
});
