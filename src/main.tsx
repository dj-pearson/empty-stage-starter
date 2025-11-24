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

// Initialize Sentry before anything else
try {
  initializeSentry();
} catch (error) {
  console.warn('Sentry initialization failed:', error);
}

// Wrap in Sentry ErrorBoundary only if Sentry is configured
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element not found');
}

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
