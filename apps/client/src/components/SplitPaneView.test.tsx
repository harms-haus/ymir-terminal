/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { SplitPaneView } from './SplitPaneView';
import type { LayoutNode, PaneNode, SplitNode } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSplitPane(layout: LayoutNode) {
  const renderPane = (paneId: string) =>
    React.createElement('div', { 'data-testid': `pane-content-${paneId}` }, `Pane: ${paneId}`);

  return render(React.createElement(SplitPaneView, { layout, renderPane }));
}

function makePane(id: string): PaneNode {
  return { id, type: 'pane' };
}

function makeSplit(
  id: string,
  direction: 'horizontal' | 'vertical',
  children: LayoutNode[],
  sizes?: number[],
): SplitNode {
  return { id, type: 'split', direction, children, ...(sizes ? { sizes } : {}) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SplitPaneView', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders a single pane when given a PaneNode
  // -----------------------------------------------------------------------
  test('renders a single pane when given a PaneNode', () => {
    const layout = makePane('editor-1');
    const { getByTestId } = renderSplitPane(layout);

    const pane = getByTestId('pane-editor-1');
    expect(pane).toBeTruthy();
    expect(pane.textContent).toContain('editor-1');
  });

  // -----------------------------------------------------------------------
  // 2. Renders split panels when given a SplitNode with direction and children
  // -----------------------------------------------------------------------
  test('renders split panels when given a SplitNode with direction and children', () => {
    const layout = makeSplit('split-1', 'horizontal', [makePane('a'), makePane('b')]);
    const { getByTestId, container } = renderSplitPane(layout);

    // Both panes should be rendered
    expect(getByTestId('pane-a')).toBeTruthy();
    expect(getByTestId('pane-b')).toBeTruthy();

    // A PanelGroup should exist
    const group = container.querySelector('[data-group]');
    expect(group).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Horizontal split renders children side by side
  // -----------------------------------------------------------------------
  test('horizontal split renders children side by side', () => {
    const layout = makeSplit('split-h', 'horizontal', [makePane('left'), makePane('right')]);
    const { container } = renderSplitPane(layout);

    const group = container.querySelector('[data-group]') as HTMLElement;
    expect(group).toBeTruthy();
    expect(group.getAttribute('data-orientation')).toBe('horizontal');

    // There should be a separator between the two panels
    const separators = container.querySelectorAll('[data-separator]');
    expect(separators.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 4. Vertical split renders children stacked
  // -----------------------------------------------------------------------
  test('vertical split renders children stacked', () => {
    const layout = makeSplit('split-v', 'vertical', [makePane('top'), makePane('bottom')]);
    const { container } = renderSplitPane(layout);

    const group = container.querySelector('[data-group]') as HTMLElement;
    expect(group).toBeTruthy();
    expect(group.getAttribute('data-orientation')).toBe('vertical');

    const separators = container.querySelectorAll('[data-separator]');
    expect(separators.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 5. Each pane has a data-testid
  // -----------------------------------------------------------------------
  test('each pane has a data-testid', () => {
    const layout = makeSplit('split-ids', 'horizontal', [
      makePane('pane-alpha'),
      makePane('pane-beta'),
      makePane('pane-gamma'),
    ]);
    const { getByTestId } = renderSplitPane(layout);

    expect(getByTestId('pane-pane-alpha')).toBeTruthy();
    expect(getByTestId('pane-pane-beta')).toBeTruthy();
    expect(getByTestId('pane-pane-gamma')).toBeTruthy();
  });
});
