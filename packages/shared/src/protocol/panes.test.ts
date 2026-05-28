import { test, expect, describe } from 'bun:test';
import {
  isSplitNode,
  isPaneNode,
  findPaneById,
  replacePane,
  removePane,
  type SplitNode,
  type PaneNode,
  type LayoutNode,
} from './panes';

// Helper to build a 2-level deep split tree:
//
//          split-root (horizontal)
//         /          \
//    pane-A      split-child (vertical)
//                /          \
//            pane-B       pane-C
//
function makeTwoLevelTree(): SplitNode {
  return {
    id: 'split-root',
    type: 'split',
    direction: 'horizontal',
    children: [
      { id: 'pane-A', type: 'pane' },
      {
        id: 'split-child',
        type: 'split',
        direction: 'vertical',
        children: [
          { id: 'pane-B', type: 'pane' },
          { id: 'pane-C', type: 'pane' },
        ],
      },
    ],
  };
}

describe('isSplitNode', () => {
  test('returns true for a SplitNode', () => {
    const node: LayoutNode = {
      id: 's1',
      type: 'split',
      direction: 'horizontal',
      children: [],
    };
    expect(isSplitNode(node)).toBe(true);
  });

  test('returns false for a PaneNode', () => {
    const node: LayoutNode = { id: 'p1', type: 'pane' };
    expect(isSplitNode(node)).toBe(false);
  });
});

describe('isPaneNode', () => {
  test('returns true for a PaneNode', () => {
    const node: LayoutNode = { id: 'p1', type: 'pane' };
    expect(isPaneNode(node)).toBe(true);
  });

  test('returns false for a SplitNode', () => {
    const node: LayoutNode = {
      id: 's1',
      type: 'split',
      direction: 'vertical',
      children: [],
    };
    expect(isPaneNode(node)).toBe(false);
  });
});

describe('findPaneById', () => {
  test('finds a top-level pane in a nested tree', () => {
    const root = makeTwoLevelTree();
    const found = findPaneById(root, 'pane-A');
    expect(found).toBeDefined();
    expect(found!.id).toBe('pane-A');
    expect(found!.type).toBe('pane');
  });

  test('finds a deeply nested pane in a nested tree', () => {
    const root = makeTwoLevelTree();
    const found = findPaneById(root, 'pane-C');
    expect(found).toBeDefined();
    expect(found!.id).toBe('pane-C');
    expect(found!.type).toBe('pane');
  });

  test('returns undefined for non-existent id', () => {
    const root = makeTwoLevelTree();
    expect(findPaneById(root, 'does-not-exist')).toBeUndefined();
  });

  test('returns undefined when searching a single pane that does not match', () => {
    const pane: PaneNode = { id: 'only', type: 'pane' };
    expect(findPaneById(pane, 'wrong')).toBeUndefined();
  });

  test('returns the pane when searching a single pane that matches', () => {
    const pane: PaneNode = { id: 'only', type: 'pane' };
    const found = findPaneById(pane, 'only');
    expect(found).toBeDefined();
    expect(found!.id).toBe('only');
  });
});

describe('replacePane', () => {
  test('replaces a top-level pane and returns new root tree (immutable)', () => {
    const root = makeTwoLevelTree();
    const replacement: PaneNode = { id: 'pane-A-new', type: 'pane' };

    const result = replacePane(root, 'pane-A', replacement);

    // Original is unchanged
    expect(findPaneById(root, 'pane-A')).toBeDefined();

    // Result has the replacement
    expect(findPaneById(result, 'pane-A')).toBeUndefined();
    const found = findPaneById(result, 'pane-A-new');
    expect(found).toBeDefined();
    expect(found!.id).toBe('pane-A-new');
  });

  test('replaces a deeply nested pane', () => {
    const root = makeTwoLevelTree();
    const replacement: PaneNode = { id: 'pane-C-replaced', type: 'pane' };

    const result = replacePane(root, 'pane-C', replacement);

    expect(findPaneById(result, 'pane-C')).toBeUndefined();
    expect(findPaneById(result, 'pane-C-replaced')).toBeDefined();
  });

  test('returns unchanged tree when paneId does not exist', () => {
    const root = makeTwoLevelTree();
    const replacement: PaneNode = { id: 'new', type: 'pane' };
    const result = replacePane(root, 'nonexistent', replacement);
    // Should be same structure — pane-B still there
    expect(findPaneById(result, 'pane-B')).toBeDefined();
    expect(findPaneById(result, 'new')).toBeUndefined();
  });

  test('replaces a pane with a split node (pane becomes a split)', () => {
    const root = makeTwoLevelTree();
    const replacement: SplitNode = {
      id: 'split-new',
      type: 'split',
      direction: 'vertical',
      children: [
        { id: 'pane-X', type: 'pane' },
        { id: 'pane-Y', type: 'pane' },
      ],
    };

    const result = replacePane(root, 'pane-B', replacement);
    expect(findPaneById(result, 'pane-X')).toBeDefined();
    expect(findPaneById(result, 'pane-Y')).toBeDefined();
    expect(findPaneById(result, 'pane-B')).toBeUndefined();
  });
});

describe('removePane', () => {
  test('removes a pane from a nested split; parent split with one child simplifies to that child', () => {
    const root = makeTwoLevelTree();

    // Remove pane-B from split-child. split-child then has only pane-C,
    // so it simplifies: split-child becomes just pane-C in the root.
    const result = removePane(root, 'pane-B');

    // pane-B is gone
    expect(findPaneById(result, 'pane-B')).toBeUndefined();
    // split-child is gone (simplified away)
    // The result root should still be a split with pane-A and pane-C (no intermediate split)
    expect(isSplitNode(result)).toBe(true);
    const splitResult = result as SplitNode;
    expect(splitResult.children).toHaveLength(2);
    expect(splitResult.children[0]).toEqual({ id: 'pane-A', type: 'pane' });
    expect(splitResult.children[1]).toEqual({ id: 'pane-C', type: 'pane' });
  });

  test('removes a pane from top-level split; root simplifies when only one child remains', () => {
    // Build: split-root (horizontal) with [pane-A, pane-B]
    const root: SplitNode = {
      id: 'split-root',
      type: 'split',
      direction: 'horizontal',
      children: [
        { id: 'pane-A', type: 'pane' },
        { id: 'pane-B', type: 'pane' },
      ],
    };

    // Remove pane-A. split-root now has only one child (pane-B), so it simplifies.
    const result = removePane(root, 'pane-A');
    expect(result).toEqual({ id: 'pane-B', type: 'pane' });
  });

  test('single pane: removePane returns the same node', () => {
    const pane: PaneNode = { id: 'only', type: 'pane' };
    const result = removePane(pane, 'only');
    expect(result).toBe(pane);
  });

  test('single pane: removePane with non-matching id returns same node', () => {
    const pane: PaneNode = { id: 'only', type: 'pane' };
    const result = removePane(pane, 'other');
    expect(result).toBe(pane);
  });

  test('deeply nested: remove from 3-level tree collapses correctly', () => {
    // Build a 3-level deep tree:
    //
    //          split-1 (horizontal)
    //         /          \
    //    pane-1       split-2 (vertical)
    //                /          \
    //           pane-2       split-3 (horizontal)
    //                       /          \
    //                   pane-3       pane-4
    //
    const root: SplitNode = {
      id: 'split-1',
      type: 'split',
      direction: 'horizontal',
      children: [
        { id: 'pane-1', type: 'pane' },
        {
          id: 'split-2',
          type: 'split',
          direction: 'vertical',
          children: [
            { id: 'pane-2', type: 'pane' },
            {
              id: 'split-3',
              type: 'split',
              direction: 'horizontal',
              children: [
                { id: 'pane-3', type: 'pane' },
                { id: 'pane-4', type: 'pane' },
              ],
            },
          ],
        },
      ],
    };

    // Remove pane-3 => split-3 has one child (pane-4) => simplifies to pane-4
    // split-2 now has [pane-2, pane-4]
    const result = removePane(root, 'pane-3');

    expect(findPaneById(result, 'pane-3')).toBeUndefined();
    expect(findPaneById(result, 'pane-1')).toBeDefined();
    expect(findPaneById(result, 'pane-2')).toBeDefined();
    expect(findPaneById(result, 'pane-4')).toBeDefined();

    // Verify structure: split-2 should now be [pane-2, pane-4] (no split-3)
    const r = result as SplitNode;
    expect(r.id).toBe('split-1');
    const split2 = r.children[1] as SplitNode;
    expect(split2.id).toBe('split-2');
    expect(split2.children).toHaveLength(2);
    expect(split2.children[0]).toEqual({ id: 'pane-2', type: 'pane' });
    expect(split2.children[1]).toEqual({ id: 'pane-4', type: 'pane' });
  });

  test('does not mutate the original tree', () => {
    const root = makeTwoLevelTree();
    const originalJson = JSON.stringify(root);
    removePane(root, 'pane-B');
    expect(JSON.stringify(root)).toBe(originalJson);
  });
});
