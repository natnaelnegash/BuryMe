import { useCallback, useEffect, useState } from "react";

/**
 * Trails `value` by `delayMs`, restarting the wait on every change — so a
 * burst of keystrokes settles to one value once typing pauses.
 *
 * Returns the settled value and a `flush` that adopts the current one
 * immediately, for when the user asks for the result now (Enter, or a
 * Search button) instead of waiting out the delay.
 */
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
