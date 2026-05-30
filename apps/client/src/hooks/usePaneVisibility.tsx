import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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
    <PaneVisibilityContext.Provider value={{ ...visibility, toggleLeft, toggleRight, toggleBottom }}>
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
