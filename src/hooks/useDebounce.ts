import { useState, useEffect, useCallback } from "react";

/**
 * Debounce a value by the given delay in milliseconds.
 * Returns [debouncedValue, flush] — call flush(v) to bypass the
 * delay and set the debounced value immediately (e.g. on clear).
 */
export function useDebounce<T>(value: T, delay: number): [T, (v: T) => void] {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const flush = useCallback((v: T) => setDebounced(v), []);

  return [debounced, flush];
}
