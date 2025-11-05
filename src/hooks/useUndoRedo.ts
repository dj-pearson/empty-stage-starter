import { useState, useCallback, useRef } from "react";

export interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseUndoRedoOptions {
  maxHistory?: number;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UseUndoRedoOptions = {}
) {
  const { maxHistory = 50 } = options;

  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const set = useCallback(
    (newPresent: T | ((prev: T) => T)) => {
      setState((currentState) => {
        const actualNewPresent =
          typeof newPresent === "function"
            ? (newPresent as (prev: T) => T)(currentState.present)
            : newPresent;

        // Don't add to history if state hasn't changed
        if (JSON.stringify(actualNewPresent) === JSON.stringify(currentState.present)) {
          return currentState;
        }

        const newPast = [...currentState.past, currentState.present];

        // Limit history size
        if (newPast.length > maxHistory) {
          newPast.shift();
        }

        return {
          past: newPast,
          present: actualNewPresent,
          future: [],
        };
      });
    },
    [maxHistory]
  );

  const undo = useCallback(() => {
    setState((currentState) => {
      if (currentState.past.length === 0) {
        return currentState;
      }

      const previous = currentState.past[currentState.past.length - 1];
      const newPast = currentState.past.slice(0, currentState.past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [currentState.present, ...currentState.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((currentState) => {
      if (currentState.future.length === 0) {
        return currentState;
      }

      const next = currentState.future[0];
      const newFuture = currentState.future.slice(1);

      return {
        past: [...currentState.past, currentState.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const reset = useCallback((newPresent: T) => {
    setState({
      past: [],
      present: newPresent,
      future: [],
    });
  }, []);

  const clear = useCallback(() => {
    setState((currentState) => ({
      past: [],
      present: currentState.present,
      future: [],
    }));
  }, []);

  return {
    state: state.present,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    clear,
    history: {
      past: state.past,
      future: state.future,
    },
  };
}

// Hook for tracking recent deletions with restore capability
interface DeletedItem<T> {
  item: T;
  timestamp: number;
  type: string;
}

export function useDeletedItems<T>(maxItems = 10) {
  const [deletedItems, setDeletedItems] = useState<DeletedItem<T>[]>([]);

  const addDeleted = useCallback(
    (item: T, type: string) => {
      setDeletedItems((prev) => {
        const newItems = [
          { item, timestamp: Date.now(), type },
          ...prev,
        ];

        // Limit the number of deleted items stored
        return newItems.slice(0, maxItems);
      });
    },
    [maxItems]
  );

  const restore = useCallback(
    (index: number): T | null => {
      const item = deletedItems[index];
      if (!item) return null;

      setDeletedItems((prev) => prev.filter((_, i) => i !== index));
      return item.item;
    },
    [deletedItems]
  );

  const clear = useCallback(() => {
    setDeletedItems([]);
  }, []);

  return {
    deletedItems,
    addDeleted,
    restore,
    clear,
  };
}
