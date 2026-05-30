import { useMemo, type ReactNode } from 'react';
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
    if (e.propertyName === 'transform' && !visible) {
      onCollapseReady?.();
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
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {children}
      </div>
    </div>
  );
}
