/**
 * Web Entry Point for EatPal
 * This file is only used for web builds via Vite
 * Mobile builds use index.mobile.js and Expo Router
 */

// Import React first to ensure it's available before any components load
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/mobile-first.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initializeSentry } from "./lib/sentry";
import { validateEnv } from "./lib/env";
import { initWebVitals } from "./lib/webVitals";

// Validate environment variables before anything else
validateEnv();

// Debug logging helper - only logs in development
const debugLog = (message: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(`[EatPal] ${message}`, ...args);
  }
};

debugLog('main.tsx loading...');

// Make React available globally for UMD modules (if any)
if (typeof window !== 'undefined') {
  (window as any).React = React;
  debugLog('React made global');
}

// Log environment info for debugging (only in development)
debugLog('Starting application...');
debugLog('Environment:', import.meta.env.MODE);
debugLog('Sentry DSN configured:', !!import.meta.env.VITE_SENTRY_DSN);
debugLog('Supabase URL configured:', !!import.meta.env.VITE_SUPABASE_URL);

// Initialize Sentry before anything else
try {
  initializeSentry();
  debugLog('Sentry initialized successfully');
} catch (error) {
  // Always log Sentry init errors - important for production debugging
  console.warn('[EatPal] Sentry initialization failed:', error);
}

// Wrap in global ErrorBoundary for crash recovery
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element not found');
}

try {
  debugLog('Creating React root...');
  createRoot(rootElement).render(
    <ErrorBoundary fullPage>
      <App />
    </ErrorBoundary>
  );
  debugLog('React root rendered successfully');

  // Initialize Core Web Vitals monitoring
  initWebVitals().catch(() => {
    debugLog('Web vitals initialization failed (non-critical)');
  });
} catch (error) {
  // Always log render errors - critical for production debugging
  console.error('[EatPal] Failed to render app:', error);
  // Show a basic error message - use safe DOM methods to prevent XSS
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: system-ui, -apple-system, sans-serif;';

  const content = document.createElement('div');
  content.style.cssText = 'max-width: 500px; text-align: center;';

  const heading = document.createElement('h1');
  heading.style.cssText = 'color: #dc2626; margin-bottom: 16px;';
  heading.textContent = 'Unable to Load Application';

  const message = document.createElement('p');
  message.style.cssText = 'color: #6b7280; margin-bottom: 24px;';
  message.textContent = 'We encountered an error while starting the app. Please try refreshing the page.';

  const button = document.createElement('button');
  button.style.cssText = 'background: #3b82f6; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;';
  button.textContent = 'Refresh Page';
  button.onclick = () => window.location.reload();

  content.appendChild(heading);
  content.appendChild(message);
  content.appendChild(button);

  // In development mode, show error details safely using textContent
  if (import.meta.env.MODE === 'development') {
    const errorPre = document.createElement('pre');
    errorPre.style.cssText = 'margin-top: 24px; padding: 12px; background: #f3f4f6; border-radius: 6px; text-align: left; overflow: auto; font-size: 12px;';
    errorPre.textContent = error instanceof Error ? error.message : String(error);
    content.appendChild(errorPre);
  }

  container.appendChild(content);
  rootElement.innerHTML = '';
  rootElement.appendChild(container);
}
