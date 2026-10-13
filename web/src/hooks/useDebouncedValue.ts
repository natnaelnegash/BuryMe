import { useCallback, useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): [T, () => void] {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (settled === value) return;
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs, settled]);

  const flush = useCallback(() => setSettled(value), [value]);

  return [settled, flush];
}
