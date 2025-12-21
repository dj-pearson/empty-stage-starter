import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useScanner } from '../../hooks/useScanner';

describe('Scanner Initialization and Basic Functionality', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skip('should initialize the scanner and report it as ready', async () => {
    const { result } = renderHook(() => useScanner());

    // Advance timers to allow the setTimeout in useScanner to complete
    act(() => {
      vi.runAllTimers();
    });

    await waitFor(() => {
      expect(result.current.scannerReady).toBe(true);
    });
  });

  it('should return scanned data after a scan', async () => {
    const { result } = renderHook(() => useScanner());
    
    expect(result.current.scannedData).toBeNull();
    
    act(() => {
      result.current.handleScan('123456789');
    });

    expect(result.current.scannedData).toBe('123456789');
  });
});

