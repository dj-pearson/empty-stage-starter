import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import "./styles/mobile-first.css";
import { initializeSentry, ErrorFallback } from "./lib/sentry";

// Initialize Sentry before anything else
initializeSentry();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error as Error} resetError={resetError} />} showDialog>
    <App />
  </Sentry.ErrorBoundary>
);
