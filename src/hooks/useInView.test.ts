import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInView } from './useInView';

describe('useInView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ref and inView=false initially', () => {
    const { result } = renderHook(() => useInView());

    expect(result.current.ref).toBeDefined();
    expect(result.current.inView).toBe(false);
  });

  it('accepts custom threshold option', () => {
    const { result } = renderHook(() => useInView({ threshold: 0.5 }));

    expect(result.current.ref).toBeDefined();
    expect(result.current.inView).toBe(false);
  });

  it('accepts triggerOnce option', () => {
    const { result } = renderHook(() => useInView({ triggerOnce: false }));

    expect(result.current.ref).toBeDefined();
    expect(result.current.inView).toBe(false);
  });

  it('accepts rootMargin option', () => {
    const { result } = renderHook(() => useInView({ rootMargin: '50px' }));

    expect(result.current.ref).toBeDefined();
    expect(result.current.inView).toBe(false);
  });

  it('uses default options when none provided', () => {
    const { result } = renderHook(() => useInView());

    // Default: threshold=0.1, triggerOnce=true, rootMargin='0px'
    expect(result.current.inView).toBe(false);
  });
});
