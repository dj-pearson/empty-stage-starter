import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock sessionStorage
const mockStorage: Record<string, string> = {};
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
});

// Mock crypto for token generation
vi.stubGlobal('crypto', {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
  subtle: {},
});

describe('CSRF Protection', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it('should exist as a module', async () => {
    // The csrf module should be importable
    const csrfModule = await import('@/lib/csrf');
    expect(csrfModule).toBeDefined();
    expect(typeof csrfModule.getCsrfToken).toBe('function');
    expect(typeof csrfModule.validateCsrfToken).toBe('function');
  });

  it('getCsrfToken returns a non-empty string', async () => {
    const { getCsrfToken } = await import('@/lib/csrf');
    const token = getCsrfToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('getCsrfToken returns consistent token within session', async () => {
    const { getCsrfToken } = await import('@/lib/csrf');
    const token1 = getCsrfToken();
    const token2 = getCsrfToken();
    expect(token1).toBe(token2);
  });

  it('validateCsrfToken rejects empty tokens', async () => {
    const { validateCsrfToken } = await import('@/lib/csrf');
    expect(validateCsrfToken('')).toBe(false);
  });

  it('validateCsrfToken rejects random tokens', async () => {
    const { validateCsrfToken, getCsrfToken } = await import('@/lib/csrf');
    getCsrfToken(); // Generate a session token
    expect(validateCsrfToken('random-invalid-token')).toBe(false);
  });

  it('getCsrfHeaders returns object with csrf token header', async () => {
    const { getCsrfHeaders } = await import('@/lib/csrf');
    const headers = getCsrfHeaders();
    expect(headers).toHaveProperty('x-csrf-token');
    expect(typeof headers['x-csrf-token']).toBe('string');
  });
});
