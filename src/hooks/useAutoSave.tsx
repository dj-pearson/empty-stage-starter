import { useEffect, useRef, useCallback, useState } from "react";
import { useDebounce } from "./use-debounce";
import { logger } from "@/lib/logger";

interface UseAutoSaveOptions<T> {
  key: string;
  data: T;
  onSave?: (data: T) => void | Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave<T>({
  key,
  data,
  onSave,
  delay = 2000,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const debouncedData = useDebounce(data, delay);
  const isFirstRender = useRef(true);
  const lastSavedData = useRef<string>("");

  const save = useCallback(
    async (dataToSave: T) => {
      if (!enabled) return;

      const dataString = JSON.stringify(dataToSave);

      // Don't save if data hasn't changed
      if (dataString === lastSavedData.current) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        // Save to localStorage
        localStorage.setItem(`autosave-${key}`, dataString);
        localStorage.setItem(`autosave-${key}-timestamp`, new Date().toISOString());

        // Call custom save function if provided
        if (onSave) {
          await onSave(dataToSave);
        }

        lastSavedData.current = dataString;
        setLastSaved(new Date());
      } catch (error) {
        logger.error("Auto-save error", error);
        setSaveError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsSaving(false);
      }
    },
    [key, onSave, enabled]
  );

  // Auto-save when debounced data changes
  useEffect(() => {
    // Skip first render to avoid saving initial empty state
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    save(debouncedData);
  }, [debouncedData, save]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(`autosave-${key}`);
    localStorage.removeItem(`autosave-${key}-timestamp`);
    lastSavedData.current = "";
    setLastSaved(null);
  }, [key]);

  const loadDraft = useCallback((): T | null => {
    try {
      const saved = localStorage.getItem(`autosave-${key}`);
      if (!saved) return null;

      return JSON.parse(saved) as T;
    } catch (error) {
      logger.error("Error loading draft", error);
      return null;
    }
  }, [key]);

  const getDraftInfo = useCallback(() => {
    const timestampStr = localStorage.getItem(`autosave-${key}-timestamp`);
    if (!timestampStr) return null;

    return {
      timestamp: new Date(timestampStr),
      exists: localStorage.getItem(`autosave-${key}`) !== null,
    };
  }, [key]);

  return {
    isSaving,
    lastSaved,
    saveError,
    clearDraft,
    loadDraft,
    getDraftInfo,
    manualSave: () => save(data),
  };
}

// Component for showing auto-save status
interface AutoSaveIndicatorProps {
  isSaving: boolean;
  lastSaved: Date | null;
  error: Error | null;
}

export function AutoSaveIndicator({
  isSaving,
  lastSaved,
  error,
}: AutoSaveIndicatorProps) {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Failed to save</span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg
          className="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Saving...</span>
      </div>
    );
  }

  if (lastSaved) {
    const timeSince = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
    let timeText = "just now";

    if (timeSince >= 60) {
      const minutes = Math.floor(timeSince / 60);
      timeText = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    } else if (timeSince > 5) {
      timeText = `${timeSince} seconds ago`;
    }

    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg
          className="h-4 w-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span>Saved {timeText}</span>
      </div>
    );
  }

  return null;
}

// Draft recovery dialog component
interface DraftRecoveryProps {
  draftTimestamp: Date;
  onRecover: () => void;
  onDiscard: () => void;
}

export function DraftRecovery({
  draftTimestamp,
  onRecover,
  onDiscard,
}: DraftRecoveryProps) {
  const timeAgo = useCallback(() => {
    const seconds = Math.floor((Date.now() - draftTimestamp.getTime()) / 1000);

    if (seconds < 60) return "less than a minute ago";
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    }
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }, [draftTimestamp]);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2">
          <svg
            className="h-5 w-5 text-blue-600 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">Unsaved Draft Found</h4>
          <p className="text-sm text-muted-foreground mb-3">
            We found an unsaved draft from {timeAgo()}. Would you like to
            recover it?
          </p>
          <div className="flex gap-2">
            <button
              onClick={onRecover}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
            >
              Recover Draft
            </button>
            <button
              onClick={onDiscard}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
            >
              Start Fresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
