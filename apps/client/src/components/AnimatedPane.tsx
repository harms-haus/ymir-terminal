import { useMemo, useState, type ReactNode } from 'react';
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

  // Adjust state during render when visibility changes.
  // Hiding: activate overlay so content remains positioned relatively during animation.
  // Showing: deactivate overlay immediately.
  if (visible !== prevVisible) {
    if (prevVisible && !visible) {
      if (!prefersReducedMotion) {
        setOverlayActive(true);
      }
    } else if (!prevVisible && visible) {
      setOverlayActive(false);
    }
    setPrevVisible(visible);
  }

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
      if (!visible) {
        setOverlayActive(false);
        onCollapseReady?.();
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
