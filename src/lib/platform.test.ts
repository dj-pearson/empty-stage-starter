import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isWeb, isMobile, getSyncStorage, getStorage, safeStorage, renderPlatform } from './platform';

describe('isWeb', () => {
  it('returns truthy in jsdom environment (window and document exist)', () => {
    // jsdom provides window and window.document
    expect(typeof window).toBe('object');
    expect(isWeb()).toBeTruthy();
  });
});

describe('isMobile', () => {
  it('returns false in jsdom environment (inverse of isWeb)', () => {
    expect(isMobile()).toBe(!isWeb());
  });
});

describe('getSyncStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns an object with storage methods', () => {
    const storage = getSyncStorage();
    expect(storage.getItem).toBeDefined();
    expect(storage.setItem).toBeDefined();
    expect(storage.removeItem).toBeDefined();
    expect(storage.isAvailable).toBeDefined();
  });

  it('isAvailable returns true in web environment', () => {
    const storage = getSyncStorage();
    expect(storage.isAvailable()).toBe(true);
  });

  it('setItem and getItem work correctly', () => {
    const storage = getSyncStorage();
    storage.setItem('test-key', 'test-value');
    expect(storage.getItem('test-key')).toBe('test-value');
  });

  it('removeItem removes the key', () => {
    const storage = getSyncStorage();
    storage.setItem('test-key', 'test-value');
    storage.removeItem('test-key');
    expect(storage.getItem('test-key')).toBeNull();
  });
});

describe('getStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns an async storage interface', async () => {
    const storage = await getStorage();
    expect(storage.getItem).toBeDefined();
    expect(storage.setItem).toBeDefined();
    expect(storage.removeItem).toBeDefined();
  });

  it('setItem and getItem work correctly', async () => {
    const storage = await getStorage();
    await storage.setItem('async-key', 'async-value');
    const value = await storage.getItem('async-key');
    expect(value).toBe('async-value');
  });

  it('removeItem removes the key', async () => {
    const storage = await getStorage();
    await storage.setItem('async-key', 'async-value');
    await storage.removeItem('async-key');
    const value = await storage.getItem('async-key');
    expect(value).toBeNull();
  });
});

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('getItem returns null for missing keys', async () => {
    const value = await safeStorage.getItem('nonexistent');
    expect(value).toBeNull();
  });

  it('setItem and getItem work together', async () => {
    await safeStorage.setItem('safe-key', 'safe-value');
    const value = await safeStorage.getItem('safe-key');
    expect(value).toBe('safe-value');
  });

  it('removeItem removes data', async () => {
    await safeStorage.setItem('safe-key', 'safe-value');
    await safeStorage.removeItem('safe-key');
    const value = await safeStorage.getItem('safe-key');
    expect(value).toBeNull();
  });
});

describe('renderPlatform', () => {
  it('returns web component in web environment', () => {
    const result = renderPlatform({
      web: 'web-component',
      mobile: 'mobile-component',
    });
    expect(result).toBe('web-component');
  });

  it('returns default when no platform match', () => {
    const result = renderPlatform({
      default: 'fallback',
    });
    // In web environment, if web is not provided, returns default
    expect(result).toBe('fallback');
  });

  it('returns null when no components match and no default', () => {
    const result = renderPlatform({
      mobile: 'mobile-only',
    });
    // In web environment without web key, returns null
    expect(result).toBeNull();
  });

  it('prioritizes web over default in web environment', () => {
    const result = renderPlatform({
      web: 'web-component',
      default: 'default-component',
    });
    expect(result).toBe('web-component');
  });
});
