/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_COLS, DEFAULT_ROWS } from '@ymir/shared';

// ---------------------------------------------------------------------------
// ResizeObserver mock
// ---------------------------------------------------------------------------

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

let resizeCallbacks: ResizeCallback[] = [];

class MockResizeObserver {
  private callback: ResizeCallback;

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    resizeCallbacks.push(callback);
  }

  observe() {}
  unobserve() {}
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((cb) => cb !== this.callback);
  }
}

(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

// ---------------------------------------------------------------------------
// Helper: simulate a resize event on the container element
// ---------------------------------------------------------------------------

function simulateResize(width: number, height: number) {
  for (const cb of resizeCallbacks) {
    cb([
      {
        target: document.createElement('div'),
        contentRect: {
          width,
          height,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          toJSON: () => {},
        },
        borderBoxSize: [] as unknown as ResizeObserverSize[],
        contentBoxSize: [] as unknown as ResizeObserverSize[],
        devicePixelContentBoxSize: [] as unknown as ResizeObserverSize[],
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { useTerminalResize } = await import('./useTerminalResize');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTerminalResize', () => {
  beforeEach(() => {
    resizeCallbacks = [];
  });

  afterEach(() => {
    resizeCallbacks = [];
  });

  // -----------------------------------------------------------------------
  // 1. useTerminalResize() returns { containerRef, cols, rows }
  // -----------------------------------------------------------------------
  test('returns containerRef, cols, and rows', () => {
    const { result } = renderHook(() => useTerminalResize());

    expect(typeof result.current.containerRef).toBe('function');
    expect(result.current).toHaveProperty('cols');
    expect(result.current).toHaveProperty('rows');
    expect(result.current.cols).toBe(DEFAULT_COLS);
    expect(result.current.rows).toBe(DEFAULT_ROWS);
  });

  // -----------------------------------------------------------------------
  // 2. When containerRef is set, cols and rows are computed from element size
  // -----------------------------------------------------------------------
  test('computes cols and rows from element dimensions when ref is attached', () => {
    const { result } = renderHook(() => useTerminalResize());

    const mockDiv = {
      getBoundingClientRect: mock(() => ({
        width: 640,
        height: 384,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 384,
        toJSON: () => {},
      })),
    } as unknown as HTMLDivElement;

    // Attach via callback ref
    act(() => {
      result.current.containerRef(mockDiv);
    });

    // Trigger a resize callback to exercise the computation path
    act(() => {
      simulateResize(640, 384);
    });

    // 640 / 8 = 80 cols, 384 / 16 = 24 rows
    expect(result.current.cols).toBe(80);
    expect(result.current.rows).toBe(24);
  });

  // -----------------------------------------------------------------------
  // 3. Uses DEFAULT_COLS=80 and DEFAULT_ROWS=24 as defaults
  // -----------------------------------------------------------------------
  test('uses DEFAULT_COLS and DEFAULT_ROWS as defaults when no container', () => {
    const { result } = renderHook(() => useTerminalResize());

    expect(result.current.cols).toBe(DEFAULT_COLS);
    expect(result.current.rows).toBe(DEFAULT_ROWS);
    expect(DEFAULT_COLS).toBe(80);
    expect(DEFAULT_ROWS).toBe(24);
  });

  // -----------------------------------------------------------------------
  // 4. Computation: cols = Math.floor(width / charWidth), rows = Math.floor(height / charHeight)
  // -----------------------------------------------------------------------
  test('correctly computes cols = floor(width / charWidth) and rows = floor(height / charHeight)', () => {
    const { result } = renderHook(() => useTerminalResize());

    const mockDiv = {
      getBoundingClientRect: mock(() => ({
        width: 800,
        height: 480,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 480,
        toJSON: () => {},
      })),
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.containerRef(mockDiv);
    });

    act(() => {
      simulateResize(800, 480);
    });

    // 800 / 8 = 100 cols, 480 / 16 = 30 rows
    expect(result.current.cols).toBe(100);
    expect(result.current.rows).toBe(30);
  });

  // -----------------------------------------------------------------------
  // 5. Uses charWidth=8, charHeight=16 for default terminal font
  // -----------------------------------------------------------------------
  test('uses charWidth=8 and charHeight=16 for computation', () => {
    const { result } = renderHook(() => useTerminalResize());

    // 123px width / 8 = 15.375 → floor = 15 cols
    // 33px height / 16 = 2.0625 → floor = 2 rows
    const mockDiv = {
      getBoundingClientRect: mock(() => ({
        width: 123,
        height: 33,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 123,
        bottom: 33,
        toJSON: () => {},
      })),
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.containerRef(mockDiv);
    });

    act(() => {
      simulateResize(123, 33);
    });

    expect(result.current.cols).toBe(Math.floor(123 / 8)); // 15
    expect(result.current.rows).toBe(Math.floor(33 / 16)); // 2
  });

  // -----------------------------------------------------------------------
  // 6. Cols and rows are at least 1 (no zero/negative values)
  // -----------------------------------------------------------------------
  test('cols and rows are clamped to minimum of 1', () => {
    const { result } = renderHook(() => useTerminalResize());

    const mockDiv = {
      getBoundingClientRect: mock(() => ({
        width: 3,
        height: 5,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 3,
        bottom: 5,
        toJSON: () => {},
      })),
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.containerRef(mockDiv);
    });

    act(() => {
      simulateResize(3, 5);
    });

    // 3/8 = 0.375 → max(1, floor(0.375)) = 1
    // 5/16 = 0.3125 → max(1, floor(0.3125)) = 1
    expect(result.current.cols).toBe(1);
    expect(result.current.rows).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 7. ResizeObserver disconnects on unmount
  // -----------------------------------------------------------------------
  test('ResizeObserver disconnects on unmount', () => {
    const { result, unmount } = renderHook(() => useTerminalResize());

    const mockDiv = {
      getBoundingClientRect: mock(() => ({
        width: 640,
        height: 384,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 384,
        toJSON: () => {},
      })),
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.containerRef(mockDiv);
    });

    expect(resizeCallbacks.length).toBeGreaterThanOrEqual(1);

    unmount();

    expect(resizeCallbacks.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 8. updateSize is exposed and can be called manually
  // -----------------------------------------------------------------------
  test('updateSize can be called to recompute dimensions', () => {
    const { result } = renderHook(() => useTerminalResize());

    const mockDiv = {
      getBoundingClientRect: mock(() => ({
        width: 320,
        height: 160,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 160,
        toJSON: () => {},
      })),
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.containerRef(mockDiv);
    });

    act(() => {
      result.current.updateSize();
    });

    // 320 / 8 = 40, 160 / 16 = 10
    expect(result.current.cols).toBe(40);
    expect(result.current.rows).toBe(10);
  });
});
