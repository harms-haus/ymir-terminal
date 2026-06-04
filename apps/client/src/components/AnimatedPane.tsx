import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { ANIMATION_TRANSITION } from '../lib/theme';

interface AnimatedPaneProps {
  direction: 'left' | 'right' | 'bottom';
  visible: boolean;
  onCollapseReady?: () => void;
  children: ReactNode;
}

export function AnimatedPane({ direction, visible, onCollapseReady, children }: AnimatedPaneProps) {
  // Detect prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const transition = prefersReducedMotion ? 'none' : ANIMATION_TRANSITION;

  const [prevVisible, setPrevVisible] = useState(visible);
  const [overlayActive, setOverlayActive] = useState(false);
  const justHiddenRef = useRef(false);

  // Sync the ref inside an effect to satisfy react-hooks/refs
  useEffect(() => {
    if (visible !== prevVisible && prevVisible && !visible) {
      justHiddenRef.current = true;
    }
  }, [visible, prevVisible]);

  // Detect visibility changes during render (React "adjusting state" pattern).
  // This avoids calling setState inside useEffect.
  if (visible !== prevVisible) {
    if (prevVisible && !visible) {
      // Hiding: activate overlay and schedule collapse callback
      if (!prefersReducedMotion) {
        setOverlayActive(true);
      }
    } else if (!prevVisible && visible) {
      // Showing again: clean up any residual overlay
      setOverlayActive(false);
    }
    setPrevVisible(visible);
  }

  // Fire onCollapseReady as an external side-effect (not setState).
  // The ref guards against spurious calls when deps change independently.
  useEffect(() => {
    if (justHiddenRef.current) {
      justHiddenRef.current = false;
      onCollapseReady?.(); // triggers panelRef.collapse() in AppLayout
    }
  }, [onCollapseReady, visible]);

  const transform = useMemo(() => {
    if (visible) return 'none';
    switch (direction) {
      case 'left':
        return 'translateX(-100%)';
      case 'right':
        return 'translateX(100%)';
      case 'bottom':
        return 'translateY(100%)';
    }
  }, [visible, direction]);

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.propertyName === 'transform') {
      // Animation completed — clean up overlay
      if (!visible) {
        setOverlayActive(false);
      }
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: '100%',
          transform,
          transition,
          willChange: 'transform',
          ...(overlayActive && {
            position: 'relative' as const,
          }),
        }}
        onTransitionEnd={handleTransitionEnd}
        aria-hidden={!visible || undefined}
      >
        {children}
      </div>
    </div>
  );
}
