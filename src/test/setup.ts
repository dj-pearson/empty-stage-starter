import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
} as any;

// Mock localStorage and sessionStorage with in-memory store
const createStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    length: vi.fn(() => Object.keys(store).length),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
};

Object.defineProperty(global, 'localStorage', {
  value: createStorageMock(),
  writable: true,
});

Object.defineProperty(global, 'sessionStorage', {
  value: createStorageMock(),
  writable: true,
});

// Mock expo-camera
vi.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: vi.fn(() => Promise.resolve({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: true,
    })),
    // Add other methods/properties used in tests if necessary
  },
}));

// Mock react-native
vi.mock('react-native', async (importActual) => {
  const actual = await importActual<typeof import('react-native')>();
  return {
    ...actual,
    // Add any specific mocks for components or APIs that cause issues
    // For example, if Text or View components are used and cause issues in JSDOM:
    // Text: ({ children }) => children,
    // View: ({ children }) => children,
  };
});

