/**
 * Async Operation Hooks
 *
 * Hooks for managing async operations with loading, error, and data states.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Hook for async operations with automatic loading and error states
 *
 * Usage:
 * ```tsx
 * const { data, loading, error, execute } = useAsync(async () => {
 *   return await fetchData();
 * });
 *
 * // Execute on mount
 * const { data, loading, error } = useAsync(fetchData, { immediate: true });
 * ```
 */
export function useAsync<T>(
  asyncFunction: (...args: any[]) => Promise<T>,
  options: {
    immediate?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const { immediate = false, onSuccess, onError } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: immediate,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: any[]) => {
      setState({ data: null, error: null, loading: true });

      try {
        const data = await asyncFunction(...args);

        if (isMountedRef.current) {
          setState({ data, error: null, loading: false });
          onSuccess?.(data);
        }

        return data;
      } catch (error) {
        const err = error as Error;

        if (isMountedRef.current) {
          setState({ data: null, error: err, loading: false });
          onError?.(err);
        }

        throw error;
      }
    },
    [asyncFunction, onSuccess, onError]
  );

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for fetching data with caching
 *
 * Usage:
 * ```tsx
 * const { data, loading, error, refetch } = useFetch('/api/users', {
 *   cache: true,
 *   cacheDuration: 5 * 60 * 1000, // 5 minutes
 * });
 * ```
 */
export function useFetch<T>(
  url: string | null,
  options: RequestInit & {
    cache?: boolean;
    cacheDuration?: number;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const { cache = false, cacheDuration = 5 * 60 * 1000, onSuccess, onError, ...fetchOptions } = options;

  const cacheRef = useRef<Map<string, { data: T; timestamp: number }>>(new Map());

  const fetchData = useCallback(async (): Promise<T> => {
    if (!url) throw new Error('URL is required');

    // Check cache
    if (cache && cacheRef.current.has(url)) {
      const cached = cacheRef.current.get(url)!;
      const isExpired = Date.now() - cached.timestamp > cacheDuration;

      if (!isExpired) {
        return cached.data;
      }
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Update cache
    if (cache) {
      cacheRef.current.set(url, { data, timestamp: Date.now() });
    }

    return data;
  }, [url, cache, cacheDuration, fetchOptions]);

  const { data, loading, error, execute } = useAsync<T>(fetchData, {
    immediate: !!url,
    onSuccess,
    onError,
  });

  const refetch = useCallback(() => {
    if (url) {
      // Clear cache for this URL
      cacheRef.current.delete(url);
      return execute();
    }
  }, [url, execute]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
    clearCache,
  };
}

/**
 * Hook for polling data at intervals
 *
 * Usage:
 * ```tsx
 * const { data, loading, error, start, stop } = usePoll(
 *   async () => await fetchStatus(),
 *   { interval: 5000, immediate: true }
 * );
 * ```
 */
export function usePoll<T>(
  asyncFunction: () => Promise<T>,
  options: {
    interval?: number;
    immediate?: boolean;
    stopOnError?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const {
    interval = 5000,
    immediate = false,
    stopOnError = false,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const [isPolling, setIsPolling] = useState(immediate);
  const isMountedRef = useRef(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const poll = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const data = await asyncFunction();

      if (isMountedRef.current) {
        setState({ data, error: null, loading: false });
        onSuccess?.(data);
      }
    } catch (error) {
      const err = error as Error;

      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, error: err, loading: false }));
        onError?.(err);

        if (stopOnError) {
          setIsPolling(false);
        }
      }
    }
  }, [asyncFunction, onSuccess, onError, stopOnError]);

  useEffect(() => {
    if (isPolling) {
      // Initial fetch
      poll();

      // Set up interval
      intervalRef.current = setInterval(poll, interval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [isPolling, poll, interval]);

  const start = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stop = useCallback(() => {
    setIsPolling(false);
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false });
  }, []);

  return {
    ...state,
    isPolling,
    start,
    stop,
    reset,
  };
}

/**
 * Hook for retry logic with exponential backoff
 *
 * Usage:
 * ```tsx
 * const { data, loading, error, retry } = useRetry(
 *   async () => await fetchData(),
 *   { maxRetries: 3, backoff: true }
 * );
 * ```
 */
export function useRetry<T>(
  asyncFunction: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    backoff?: boolean;
    immediate?: boolean;
  } = {}
) {
  const {
    maxRetries = 3,
    delay = 1000,
    backoff = true,
    immediate = false,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: immediate,
  });

  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async () => {
    setState({ data: null, error: null, loading: true });
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const data = await asyncFunction();

        if (isMountedRef.current) {
          setState({ data, error: null, loading: false });
          setRetryCount(attempt);
        }

        return data;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt <= maxRetries) {
          const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    if (isMountedRef.current && lastError) {
      setState({ data: null, error: lastError, loading: false });
      setRetryCount(attempt);
    }

    throw lastError;
  }, [asyncFunction, maxRetries, delay, backoff]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  const retry = useCallback(() => {
    return execute();
  }, [execute]);

  return {
    ...state,
    retryCount,
    retry,
    execute,
  };
}
