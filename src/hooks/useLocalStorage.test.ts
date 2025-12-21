import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLocalStorage, useSessionStorage, useLocalStorageValue } from './useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should use initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'initialValue'));

    expect(result.current[0]).toBe('initialValue');
  });

  it('should load value from localStorage if it exists', () => {
    // @ts-ignore - mock returns value
    localStorage.getItem.mockReturnValueOnce(JSON.stringify('storedValue'));

    const { result } = renderHook(() => useLocalStorage('testKey', 'initialValue'));

    expect(result.current[0]).toBe('storedValue');
  });

  it('should update localStorage when value changes', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'initialValue'));

    act(() => {
      result.current[1]('newValue');
    });

    expect(result.current[0]).toBe('newValue');
    expect(localStorage.setItem).toHaveBeenCalledWith('testKey', JSON.stringify('newValue'));
  });

  it('should work with function updater', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
  });

  it('should handle objects and arrays', () => {
    const { result } = renderHook(() =>
      useLocalStorage('testKey', { name: 'John', age: 30 })
    );

    expect(result.current[0]).toEqual({ name: 'John', age: 30 });

    act(() => {
      result.current[1]({ name: 'Jane', age: 25 });
    });

    expect(result.current[0]).toEqual({ name: 'Jane', age: 25 });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'testKey',
      JSON.stringify({ name: 'Jane', age: 25 })
    );
  });

  it('should remove value from localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'initialValue'));

    act(() => {
      result.current[1]('newValue');
    });

    expect(result.current[0]).toBe('newValue');

    act(() => {
      result.current[2](); // removeValue
    });

    expect(result.current[0]).toBe('initialValue');
    expect(localStorage.removeItem).toHaveBeenCalledWith('testKey');
  });

  it('should handle JSON parse errors gracefully', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('testKey', 'invalid-json');

    const { result } = renderHook(() => useLocalStorage('testKey', 'fallback'));

    // Should use initial value on parse error
    expect(result.current[0]).toBe('fallback');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should sync changes across hook instances via storage event', () => {
    const { result: result1 } = renderHook(() => useLocalStorage('sharedKey', 'value1'));
    const { result: result2 } = renderHook(() => useLocalStorage('sharedKey', 'value1'));

    // Simulate storage event (from another tab) using dispatchEvent directly
    act(() => {
      const event = new Event('storage') as StorageEvent;
      Object.defineProperty(event, 'key', { value: 'sharedKey', writable: false });
      Object.defineProperty(event, 'newValue', { value: JSON.stringify('syncedValue'), writable: false });
      Object.defineProperty(event, 'storageArea', { value: localStorage, writable: false });
      window.dispatchEvent(event);
    });

    expect(result1.current[0]).toBe('syncedValue');
    expect(result2.current[0]).toBe('syncedValue');
  });
});

describe('useSessionStorage', () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalWindow = global.window;
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it('should use initial value when sessionStorage is empty', () => {
    const { result } = renderHook(() => useSessionStorage('testKey', 'initialValue'));

    expect(result.current[0]).toBe('initialValue');
  });

  it('should load value from sessionStorage if it exists', () => {
    sessionStorage.setItem('testKey', JSON.stringify('storedValue'));

    const { result } = renderHook(() => useSessionStorage('testKey', 'initialValue'));

    expect(result.current[0]).toBe('storedValue');
  });

  it('should update sessionStorage when value changes', () => {
    const { result } = renderHook(() => useSessionStorage('testKey', 'initialValue'));

    act(() => {
      result.current[1]('newValue');
    });

    expect(result.current[0]).toBe('newValue');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('testKey', JSON.stringify('newValue'));
  });

  it('should remove value from sessionStorage', () => {
    const { result } = renderHook(() => useSessionStorage('testKey', 'initialValue'));

    act(() => {
      result.current[1]('newValue');
    });

    act(() => {
      result.current[2](); // removeValue
    });

    expect(result.current[0]).toBe('initialValue');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('testKey');
  });

  it('should work with complex data types', () => {
    const initialData = {
      user: { name: 'John', id: 1 },
      settings: { theme: 'dark', notifications: true },
    };

    const { result } = renderHook(() => useSessionStorage('userData', initialData));

    expect(result.current[0]).toEqual(initialData);

    const updatedData = {
      user: { name: 'Jane', id: 2 },
      settings: { theme: 'light', notifications: false },
    };

    act(() => {
      result.current[1](updatedData);
    });

    expect(result.current[0]).toEqual(updatedData);
  });
});

describe('useLocalStorageValue', () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalWindow = global.window;
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it('should return false when key does not exist', () => {
    const { result } = renderHook(() => useLocalStorageValue('nonExistentKey'));

    expect(result.current).toBe(false);
  });

  it('should return true when key exists', () => {
    localStorage.setItem('existingKey', JSON.stringify('value'));

    const { result } = renderHook(() => useLocalStorageValue('existingKey'));

    expect(result.current).toBe(true);
  });

  it('should update when storage event occurs', () => {
    const { result } = renderHook(() => useLocalStorageValue('testKey'));

    expect(result.current).toBe(false);

    // Simulate storage event (key added)
    act(() => {
      const event = new Event('storage') as StorageEvent;
      Object.defineProperty(event, 'key', { value: 'testKey', writable: false });
      Object.defineProperty(event, 'newValue', { value: JSON.stringify('value'), writable: false });
      Object.defineProperty(event, 'storageArea', { value: localStorage, writable: false });
      window.dispatchEvent(event);
    });

    expect(result.current).toBe(true);

    // Simulate storage event (key removed)
    act(() => {
      const event = new Event('storage') as StorageEvent;
      Object.defineProperty(event, 'key', { value: 'testKey', writable: false });
      Object.defineProperty(event, 'newValue', { value: null, writable: false });
      Object.defineProperty(event, 'storageArea', { value: localStorage, writable: false });
      window.dispatchEvent(event);
    });

    expect(result.current).toBe(false);
  });
});
