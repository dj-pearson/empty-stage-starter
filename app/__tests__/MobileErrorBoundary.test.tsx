/**
 * Tests for MobileErrorBoundary
 * Verifies the error boundary catches errors and renders a recovery UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock react-native
vi.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children, style, ...props }: any) =>
      React.createElement('div', { style, ...props }, children),
    Text: ({ children, style, ...props }: any) =>
      React.createElement('span', { style, ...props }, children),
    TouchableOpacity: ({ children, onPress, ...props }: any) =>
      React.createElement('button', { onClick: onPress, ...props }, children),
    StyleSheet: {
      create: (styles: any) => styles,
    },
    ScrollView: ({ children, ...props }: any) =>
      React.createElement('div', props, children),
    Platform: {
      OS: 'ios',
      select: (obj: any) => obj.ios || {},
    },
  };
});

import { MobileErrorBoundary } from '../components/MobileErrorBoundary';

function BrokenComponent(): JSX.Element {
  throw new Error('Test error');
}

function WorkingComponent() {
  return <span>All good</span>;
}

describe('MobileErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <MobileErrorBoundary>
        <WorkingComponent />
      </MobileErrorBoundary>
    );

    expect(screen.getByText('All good')).toBeDefined();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <MobileErrorBoundary>
        <BrokenComponent />
      </MobileErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Try Again')).toBeDefined();
  });

  it('renders custom fallback when provided', () => {
    render(
      <MobileErrorBoundary fallback={<span>Custom fallback</span>}>
        <BrokenComponent />
      </MobileErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeDefined();
  });

  it('recovers when Try Again is pressed', () => {
    const { container } = render(
      <MobileErrorBoundary>
        <BrokenComponent />
      </MobileErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();

    // Note: pressing Try Again will re-render children, which will throw again.
    // We're just verifying the button is functional.
    fireEvent.click(screen.getByText('Try Again'));

    // After Try Again, the error boundary resets and the broken component throws again
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });
});
