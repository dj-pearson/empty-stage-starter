/**
 * Web Entry Point for EatPal
 * This file is only used for web builds via Vite
 * Mobile builds use index.mobile.js and Expo Router
 */

// Import React first to ensure it's available before any components load
import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import "./styles/mobile-first.css";
import { initializeSentry, ErrorFallback } from "./lib/sentry";

// Make React available globally for UMD modules (if any)
if (typeof window !== 'undefined') {
  (window as any).React = React;
}

// Log environment info for debugging
console.log('[EatPal] Starting application...');
console.log('[EatPal] Environment:', import.meta.env.MODE);
console.log('[EatPal] Sentry DSN configured:', !!import.meta.env.VITE_SENTRY_DSN);
console.log('[EatPal] Supabase URL configured:', !!import.meta.env.VITE_SUPABASE_URL);

// Initialize Sentry before anything else
try {
  initializeSentry();
  console.log('[EatPal] Sentry initialized successfully');
} catch (error) {
  console.warn('[EatPal] Sentry initialization failed:', error);
}

// Wrap in Sentry ErrorBoundary only if Sentry is configured
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element not found');
}

try {
  console.log('[EatPal] Creating React root...');
  const AppWithErrorBoundary = import.meta.env.VITE_SENTRY_DSN ? (
    <Sentry.ErrorBoundary 
      fallback={(errorData) => <ErrorFallback error={errorData.error} resetError={errorData.resetError} />}
      showDialog={false}
    >
      <App />
    </Sentry.ErrorBoundary>
  ) : (
    <App />
  );

  createRoot(rootElement).render(AppWithErrorBoundary);
  console.log('[EatPal] React root rendered successfully');
} catch (error) {
  console.error('[EatPal] Failed to render app:', error);
  // Show a basic error message
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="max-width: 500px; text-align: center;">
        <h1 style="color: #dc2626; margin-bottom: 16px;">Unable to Load Application</h1>
        <p style="color: #6b7280; margin-bottom: 24px;">We encountered an error while starting the app. Please try refreshing the page.</p>
        <button onclick="window.location.reload()" style="background: #3b82f6; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
          Refresh Page
        </button>
        ${import.meta.env.MODE === 'development' ? `<pre style="margin-top: 24px; padding: 12px; background: #f3f4f6; border-radius: 6px; text-align: left; overflow: auto; font-size: 12px;">${error}</pre>` : ''}
      </div>
    </div>
  `;
}
