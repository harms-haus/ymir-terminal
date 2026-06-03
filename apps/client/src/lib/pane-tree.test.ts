import { describe, test, expect } from 'bun:test';
import {
  createDefaultLayout,
  findNode,
  findParentSplit,
  replaceNode,
  splitPane,
  removePane,
  collectPaneIds,
  isOnlyPane,
  serializeLayout,
  deserializeLayout,
  type LayoutNode,
  type PaneNode,
  type SplitNode,
} from './pane-tree';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Shorthand to build a PaneNode with a given id. */
function pane(id: string): PaneNode {
  return { type: 'pane', id };
}

/** Shorthand to build a SplitNode with known children. */
function split(
  id: string,
  direction: 'horizontal' | 'vertical',
  children: [LayoutNode, LayoutNode],
  sizes: [string, string] = ['50%', '50%'],
): SplitNode {
  return { type: 'split', id, direction, children, sizes };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createDefaultLayout', () => {
  test('returns a valid PaneNode with a non-empty id', () => {
    const layout = createDefaultLayout();
    expect(layout.type).toBe('pane');
    expect(typeof layout.id).toBe('string');
    expect(layout.id.length).toBeGreaterThan(0);
  });

  test('returns a new id each call', () => {
    const a = createDefaultLayout().id;
    const b = createDefaultLayout().id;
    expect(a).not.toBe(b);
  });
});

describe('findNode', () => {
  test('finds the root pane node', () => {
    const root = pane('root');
    expect(findNode(root, 'root')).toEqual(root);
  });

  test('returns null for missing id in single pane', () => {
    const root = pane('root');
    expect(findNode(root, 'nope')).toBeNull();
  });

  test('finds a pane at depth 1 in a split', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const found = findNode(root, 'b');
    expect(found).toEqual(pane('b'));
  });

  test('finds the split node itself', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const found = findNode(root, 's1');
    expect(found).toEqual(root);
  });

  test('finds deeply nested panes (3+ levels)', () => {
    const root = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), split('s3', 'horizontal', [pane('c'), pane('d')])]),
    ]);

    expect(findNode(root, 'c')).toEqual(pane('c'));
    expect(findNode(root, 'd')).toEqual(pane('d'));
    expect(findNode(root, 's3')).toEqual(split('s3', 'horizontal', [pane('c'), pane('d')]));
  });

  test('returns null for missing id in complex tree', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    expect(findNode(root, 'z')).toBeNull();
  });
});

describe('findParentSplit', () => {
  test('returns null for a root pane (no split)', () => {
    expect(findParentSplit(pane('r'), 'r')).toBeNull();
  });

  test('returns parent split for a direct child', () => {
    const parent = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const result = findParentSplit(parent, 'a');
    expect(result).not.toBeNull();
    expect(result!.parent.id).toBe('s1');
    expect(result!.index).toBe(0);
  });

  test('returns parent split for the second child', () => {
    const parent = split('s1', 'vertical', [pane('a'), pane('b')]);
    const result = findParentSplit(parent, 'b');
    expect(result!.parent.id).toBe('s1');
    expect(result!.index).toBe(1);
  });

  test('finds parent split at nested depth', () => {
    const root = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), pane('c')]),
    ]);
    const result = findParentSplit(root, 'c');
    expect(result).not.toBeNull();
    expect(result!.parent.id).toBe('s2');
    expect(result!.index).toBe(1);
  });
});

describe('replaceNode', () => {
  test('replaces the root node', () => {
    const original = pane('a');
    const replacement = pane('b');
    expect(replaceNode(original, 'a', replacement)).toEqual(replacement);
  });

  test('replaces a leaf pane inside a split', () => {
    const original = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const replacement = pane('c');
    const result = replaceNode(original, 'a', replacement);
    expect(result).toEqual(split('s1', 'horizontal', [pane('c'), pane('b')]));
    // Ensure original is untouched
    expect(original).toEqual(split('s1', 'horizontal', [pane('a'), pane('b')]));
  });

  test('replaces a split inside a deeper tree', () => {
    const inner = split('s2', 'vertical', [pane('x'), pane('y')]);
    const original = split('s1', 'horizontal', [pane('a'), inner]);
    const replacement = pane('z');
    const result = replaceNode(original, 's2', replacement);
    expect(result).toEqual(split('s1', 'horizontal', [pane('a'), pane('z')]));
  });
});

describe('splitPane', () => {
  test('splitting a root pane creates a two-pane split', () => {
    const root = pane('p1');
    const result = splitPane(root, 'p1', 'horizontal');

    // Result should be a split node
    expect(result.type).toBe('split');
    const splitNode = result as SplitNode;
    expect(splitNode.direction).toBe('horizontal');
    expect(splitNode.children).toHaveLength(2);
    expect(splitNode.sizes).toEqual(['50%', '50%']);

    // Left child is the original pane
    expect(splitNode.children[0]).toEqual(pane('p1'));

    // Right child is a new pane
    expect(splitNode.children[1].type).toBe('pane');
    expect((splitNode.children[1] as PaneNode).id).not.toBe('p1');
    expect(typeof (splitNode.children[1] as PaneNode).id).toBe('string');

    // Root is not mutated
    expect(root).toEqual(pane('p1'));
  });

  test('splitting a child pane creates nested splits', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const result = splitPane(root, 'b', 'vertical');

    // Root should still be s1
    expect(result.type).toBe('split');
    expect(result.id).toBe('s1');

    const splitNode = result as SplitNode;
    // Left child is still 'a'
    expect(splitNode.children[0]).toEqual(pane('a'));

    // Right child is now a new split node replacing pane 'b'
    const rightChild = splitNode.children[1] as SplitNode;
    expect(rightChild.type).toBe('split');
    expect(rightChild.direction).toBe('vertical');
    expect(rightChild.sizes).toEqual(['50%', '50%']);
    expect(rightChild.children).toHaveLength(2);

    // First child of the new split is the original pane 'b'
    expect(rightChild.children[0]).toEqual(pane('b'));

    // Second child is a new empty pane
    expect(rightChild.children[1].type).toBe('pane');
    expect((rightChild.children[1] as PaneNode).id).not.toBe('b');
  });
});

describe('removePane', () => {
  test('returns null when trying to remove the only pane', () => {
    const root = pane('only');
    expect(removePane(root, 'only')).toBeNull();
  });

  test('removes a child pane and collapses to sibling (left sibling survives)', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const result = removePane(root, 'b');
    expect(result).not.toBeNull();
    expect(result!.layout).toEqual(pane('a'));
  });

  test('removes a child pane and collapses to sibling (right sibling survives)', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const result = removePane(root, 'a');
    expect(result).not.toBeNull();
    expect(result!.layout).toEqual(pane('b'));
  });

  test('removePane then splitPane returns to a single pane', () => {
    // Start with one pane, split it, then remove the new pane
    const one = pane('p1');
    const two = splitPane(one, 'p1', 'horizontal');
    // Remove one of the panes — pick the new one (children[1])
    const rightChild = (two as SplitNode).children[1] as PaneNode;
    const result = removePane(two, rightChild.id);
    expect(result).not.toBeNull();
    expect(result!.layout).toEqual(pane('p1'));
  });

  test('collapses nested split when removing a pane', () => {
    // Tree:
    //   s1 (horizontal)
    //   ├── a
    //   └── s2 (vertical)
    //       ├── b
    //       └── c
    const root = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), pane('c')]),
    ]);

    // Remove 'b' — s2 is replaced by sibling 'c'
    const result = removePane(root, 'b');
    expect(result).not.toBeNull();
    expect(result!.layout).toEqual(split('s1', 'horizontal', [pane('a'), pane('c')]));
  });

  test('removePane returns removedPaneIds for a simple pane', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    const result = removePane(root, 'a');
    expect(result!.removedPanes).toEqual(['a']);
  });

  test('removePane returns removedPaneIds for a pane inside a split subtree', () => {
    // Tree:
    //   s1 (horizontal)
    //   ├── s2 (vertical)
    //   │   ├── a
    //   │   └── b
    //   └── c
    const root = split('s1', 'horizontal', [
      split('s2', 'vertical', [pane('a'), pane('b')]),
      pane('c'),
    ]);

    // Remove 'a' — s2 is replaced by sibling 'b'
    const result = removePane(root, 'a');
    expect(result).not.toBeNull();
    expect(result!.removedPanes).toEqual(['a']);
  });

  test('removePane returns removedPaneIds when an entire split subtree is removed', () => {
    // Tree:
    //   s1 (horizontal)
    //   ├── s2 (vertical)
    //   │   ├── a
    //   │   └── b
    //   └── c
    const root = split('s1', 'horizontal', [
      split('s2', 'vertical', [pane('a'), pane('b')]),
      pane('c'),
    ]);

    // Remove 'c' — s1's left child (the split s2) becomes the root
    const result = removePane(root, 'c');
    expect(result).not.toBeNull();
    // The removed subtree is just pane 'c'
    expect(result!.removedPanes).toEqual(['c']);
    // The layout should be s2 (the sibling of c)
    expect(result!.layout).toEqual(split('s2', 'vertical', [pane('a'), pane('b')]));
  });

  test('removePane returns removedPaneIds for a nested split that gets removed entirely', () => {
    // Tree:
    //   s1 (horizontal)
    //   ├── a
    //   └── s2 (vertical)
    //       ├── b
    //       └── c
    const root = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), pane('c')]),
    ]);

    // Remove 'a' — s1's right child (s2) becomes the root
    const result = removePane(root, 'a');
    expect(result).not.toBeNull();
    // The removed subtree is just pane 'a'
    expect(result!.removedPanes).toEqual(['a']);
    // The layout should be s2
    expect(result!.layout).toEqual(split('s2', 'vertical', [pane('b'), pane('c')]));
  });

  test('removePane preserves sibling when removing from deeply nested split', () => {
    // Tree (3 levels):
    //   s1 (horizontal)
    //   ├── a
    //   └── s2 (vertical)
    //       ├── b
    //       └── s3 (horizontal)
    //           ├── c
    //           └── d
    const originalPaneC = pane('c');
    const originalPaneD = pane('d');
    const s3 = split('s3', 'horizontal', [originalPaneC, originalPaneD]);
    const s2 = split('s2', 'vertical', [pane('b'), s3]);
    const root = split('s1', 'horizontal', [pane('a'), s2]);

    // Remove 'c' — s3 is replaced by its sibling 'd'
    const result = removePane(root, 'c');
    expect(result).not.toBeNull();

    // Expected tree:
    //   s1 (horizontal)
    //   ├── a
    //   └── s2 (vertical)
    //       ├── b
    //       └── d
    const expected = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), pane('d')]),
    ]);
    expect(result!.layout).toEqual(expected);
    expect(result!.removedPanes).toEqual(['c']);
  });
});

describe('collectPaneIds', () => {
  test('single pane returns [id]', () => {
    expect(collectPaneIds(pane('x'))).toEqual(['x']);
  });

  test('flat split returns both pane ids', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    expect(collectPaneIds(root).sort()).toEqual(['a', 'b']);
  });

  test('nested tree returns all pane ids', () => {
    const root = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), split('s3', 'horizontal', [pane('c'), pane('d')])]),
    ]);
    expect(collectPaneIds(root).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('isOnlyPane', () => {
  test('true for a single root pane with matching id', () => {
    expect(isOnlyPane(pane('x'), 'x')).toBe(true);
  });

  test('false for a single root pane with non-matching id', () => {
    expect(isOnlyPane(pane('x'), 'y')).toBe(false);
  });

  test('false when there is a split even if paneId exists', () => {
    const root = split('s1', 'horizontal', [pane('a'), pane('b')]);
    expect(isOnlyPane(root, 'a')).toBe(false);
    expect(isOnlyPane(root, 'b')).toBe(false);
  });
});

describe('serializeLayout / deserializeLayout (round-trip)', () => {
  test('single pane round-trips', () => {
    const original = pane('abc');
    const json = serializeLayout(original);
    const restored = deserializeLayout(json);
    expect(restored).toEqual(original);
  });

  test('nested split round-trips', () => {
    const original: LayoutNode = split('s1', 'horizontal', [
      pane('a'),
      split('s2', 'vertical', [pane('b'), pane('c')]),
    ]);
    const json = serializeLayout(original);
    const restored = deserializeLayout(json);
    expect(restored).toEqual(original);
  });

  test('deserializeLayout returns null for invalid JSON', () => {
    expect(deserializeLayout('not valid json')).toBeNull();
  });

  test('deserializeLayout returns null for a plain object without type', () => {
    expect(deserializeLayout('{"id":"x"}')).toBeNull();
  });

  test('deserializeLayout returns null for a split with invalid direction', () => {
    expect(
      deserializeLayout(
        '{"type":"split","id":"s","direction":"diagonal","children":[],"sizes":[]}',
      ),
    ).toBeNull();
  });

  test('deserializeLayout returns null for a split with wrong children count', () => {
    expect(
      deserializeLayout(
        '{"type":"split","id":"s","direction":"horizontal","children":[{"type":"pane","id":"a"}],"sizes":["100%"]}',
      ),
    ).toBeNull();
  });

  test('deserializeLayout returns null for null input', () => {
    expect(deserializeLayout('null')).toBeNull();
  });

  test('deserializeLayout returns null for non-object JSON', () => {
    expect(deserializeLayout('"hello"')).toBeNull();
  });
});

describe('integration: split then remove then split again', () => {
  test('can split, remove, and re-split multiple times', () => {
    let layout: LayoutNode = createDefaultLayout();
    const rootId = layout.id;

    // Split root horizontally (root pane becomes left, new pane right)
    layout = splitPane(layout, rootId, 'horizontal');
    const s1 = layout as SplitNode;

    // Get IDs of the two panes
    const _leftId = (s1.children[0] as PaneNode).id;
    const rightId = (s1.children[1] as PaneNode).id;

    // Split the right pane vertically
    layout = splitPane(layout, rightId, 'vertical');
    const s2 = (layout as SplitNode).children[1] as SplitNode;
    const rightChildId = (s2.children[1] as PaneNode).id;

    // Remove the rightmost pane (child of the vertical split)
    const result = removePane(layout, rightChildId);
    expect(result).not.toBeNull();
    layout = result!.layout;

    // Should now be back to two panes horizontally
    expect(layout.type).toBe('split');
    const finalSplit = layout as SplitNode;
    expect(finalSplit.direction).toBe('horizontal');
    expect(finalSplit.children).toHaveLength(2);
    expect(collectPaneIds(layout)).toHaveLength(2);
  });
});
