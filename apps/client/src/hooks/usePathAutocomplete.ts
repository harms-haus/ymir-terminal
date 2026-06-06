import { useState, useEffect, useRef } from 'react';
import { sendRequest } from '../lib/send-request';
import type { PathAutocompleteResponse, AutocompleteDirectoryEntry } from '@ymir/shared';
import { useConnectionStatus } from './useConnectionStatus';

export { parsePathInput } from './parsePathInput';

/**
 * Hook that fetches directory listings from the server with debounce and
 * race-condition handling.
 */
export function usePathAutocomplete(
  queryDir: string,
  options?: { enabled?: boolean },
): { directories: AutocompleteDirectoryEntry[]; isLoading: boolean } {
  const [directories, setDirectories] = useState<AutocompleteDirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { isConnected } = useConnectionStatus();

  const effectiveEnabled = isConnected && queryDir !== '' && options?.enabled !== false;

  // Debounce effect: wait 300ms after queryDir changes before triggering fetch
  const [debouncedDir, setDebouncedDir] = useState('');

  useEffect(() => {
    if (!effectiveEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDebouncedDir('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedDir(queryDir);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [queryDir, effectiveEnabled]);

  // Fetch effect: triggered by debouncedDir changes
  useEffect(() => {
    if (!effectiveEnabled || debouncedDir === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDirectories([]);
      setIsLoading(false);
      return;
    }

    // Abort any previous in-flight request
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    sendRequest<PathAutocompleteResponse>(
      'path.autocomplete',
      { path: debouncedDir },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setDirectories(response.directories);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        // Ignore AbortError — this is expected when cancelling previous requests
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          setDirectories([]);
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedDir, effectiveEnabled]);

  return { directories, isLoading };
}
