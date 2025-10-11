import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { initializeSentry, ErrorFallback } from "./lib/sentry";

// Initialize Sentry before anything else
initializeSentry();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={ErrorFallback} showDialog>
    <App />
  </Sentry.ErrorBoundary>
);
