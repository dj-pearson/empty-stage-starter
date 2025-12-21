import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScanner } from './useScanner';

describe('useScanner', () => {
  it('should provide feedback after a scan', () => {
    const { result } = renderHook(() => useScanner());
    
    act(() => {
      result.current.handleScan('123');
    });
    
    expect(result.current.feedback).toBe('Scan successful!');
  });
});
