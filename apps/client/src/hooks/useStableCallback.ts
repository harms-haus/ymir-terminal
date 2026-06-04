import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a stable function reference that always invokes the latest version
 * of the provided callback.
 *
 * Useful when passing callbacks to memoised children or into effect
 * dependency arrays where an unstable reference would cause unnecessary
 * re-renders or re-runs.
 *
 * @example
 * ```tsx
 * const handleClick = useStableCallback((id: string) => {
 *   // `onSelect` may change between renders, but this callback's identity
 *   // stays the same so it won't trigger child re-renders.
 *   onSelect(id);
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const ref = useRef<T>(callback);

  // Sync the ref with the latest callback before the browser paints so that
  // the returned wrapper always sees the freshest closure.
  useLayoutEffect(() => {
    ref.current = callback;
  });

  // The returned function never changes identity (empty deps) but always
  // delegates to whatever ref.current points at — which is the latest
  // callback by the time any invocation occurs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useCallback((...args: any[]) => ref.current(...args) as any, []) as T;
}
