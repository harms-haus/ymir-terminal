export type SplitDirection = 'horizontal' | 'vertical';

export type PaneNode = {
  id: string;
  type: 'pane';
};

export type SplitNode = {
  id: string;
  type: 'split';
  direction: SplitDirection;
  children: LayoutNode[];
  sizes?: number[];
};

export type LayoutNode = SplitNode | PaneNode;

// ── Type guards ──────────────────────────────────────────────────────────────

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split';
}

export function isPaneNode(node: LayoutNode): node is PaneNode {
  return node.type === 'pane';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find a `PaneNode` anywhere in the tree by its id. */
export function findPaneById(
  root: LayoutNode,
  id: string,
): PaneNode | undefined {
  if (isPaneNode(root)) {
    return root.id === id ? root : undefined;
  }
  // SplitNode — search children
  for (const child of root.children) {
    const found = findPaneById(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Return a new tree with the node at `paneId` replaced by `replacement` (immutable). */
export function replacePane(
  root: LayoutNode,
  paneId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (isPaneNode(root)) {
    return root.id === paneId ? replacement : root;
  }
  // SplitNode — rebuild children
  const newChildren = root.children.map((child) =>
    replacePane(child, paneId, replacement),
  );
  return { ...root, children: newChildren };
}

/**
 * Remove the pane with `paneId` from the tree.
 * If a `SplitNode` ends up with only one child after removal, it is replaced
 * by that single child (simplification). A single `PaneNode` root is returned
 * as-is. The operation is immutable — a new tree is returned.
 */
export function removePane(root: LayoutNode, paneId: string): LayoutNode {
  if (isPaneNode(root)) {
    return root;
  }
  // SplitNode — filter out the pane from children (recursively)
  const newChildren = root.children
    .map((child) => removePane(child, paneId))
    .filter((child) => {
      // If the child is a PaneNode that matched paneId, filter it out
      if (isPaneNode(child) && child.id === paneId) return false;
      return true;
    });

  // Simplify: single child → return that child directly
  if (newChildren.length === 1) {
    return newChildren[0];
  }

  return { ...root, children: newChildren };
}
