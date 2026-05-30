import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { sendRequest } from '../lib/send-request';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaneVisibility {
  left: boolean;
  right: boolean;
  bottom: boolean;
}

interface PaneVisibilityContextValue extends PaneVisibility {
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBottom: () => void;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PaneVisibilityContext = createContext<PaneVisibilityContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PaneVisibilityProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState<PaneVisibility>({
    left: true,
    right: true,
    bottom: true,
  });
  const [loading, setLoading] = useState(true);

  // Load persisted visibility from server on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await sendRequest<{ key: string; value: string | null }>(
          'config.get',
          { key: 'ui_pane_visibility' },
        );

        if (cancelled) return;

        if (res.value != null) {
          try {
            const parsed = JSON.parse(res.value);
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              typeof parsed.left === 'boolean' &&
              typeof parsed.right === 'boolean' &&
              typeof parsed.bottom === 'boolean'
            ) {
              setVisibility(parsed);
            }
          } catch {
            // Invalid JSON — keep defaults
          }
        }
      } catch {
        // Network or other error — keep defaults
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Save visibility changes to server (skip during initial load)
  useEffect(() => {
    if (loading) return;

    sendRequest('config.set', {
      key: 'ui_pane_visibility',
      value: JSON.stringify(visibility),
    }).catch(() => {
      // Silently ignore save failures
    });
  }, [visibility, loading]);

  const toggleLeft = useCallback(() => {
    setVisibility(prev => ({ ...prev, left: !prev.left }));
  }, []);

  const toggleRight = useCallback(() => {
    setVisibility(prev => ({ ...prev, right: !prev.right }));
  }, []);

  const toggleBottom = useCallback(() => {
    setVisibility(prev => ({ ...prev, bottom: !prev.bottom }));
  }, []);

  return (
    <PaneVisibilityContext.Provider
      value={{ ...visibility, toggleLeft, toggleRight, toggleBottom, loading }}
    >
      {children}
    </PaneVisibilityContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaneVisibility(): PaneVisibilityContextValue {
  const ctx = useContext(PaneVisibilityContext);
  if (!ctx) {
    throw new Error('usePaneVisibility must be used within a PaneVisibilityProvider');
  }
  return ctx;
}
