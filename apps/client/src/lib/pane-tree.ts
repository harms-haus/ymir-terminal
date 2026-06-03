/**
 * Pane tree data model for the terminal workspace layout.
 *
 * The layout is a binary tree where:
 * - `PaneNode` leaves represent actual terminal panes.
 * - `SplitNode` internal nodes divide space horizontally or vertically
 *   with exactly two children and percentage-based sizes (for react-resizable-panels v4).
 */

export type SplitDirection = 'horizontal' | 'vertical';

export interface PaneNode {
  type: 'pane';
  id: string;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  children: LayoutNode[];
  sizes: [string, string];
}

export type LayoutNode = PaneNode | SplitNode;

// ── Helpers ─────────────────────────────────────────────────────────────────

function isPaneNode(node: LayoutNode): node is PaneNode {
  return node.type === 'pane';
}

function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split';
}

// ── Factory / Creation ──────────────────────────────────────────────────────

/** Return a single-pane default layout. */
export function createDefaultLayout(): PaneNode {
  return { type: 'pane', id: crypto.randomUUID() };
}

// ── Query ───────────────────────────────────────────────────────────────────

/**
 * Recursively search the tree for a node with the given `id`.
 * Returns the node or `null` if not found.
 */
export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (isSplitNode(root)) {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find the parent `SplitNode` that contains the child with `childId`.
 * Returns `{ parent, index }` or `null` if not found (or if `childId` is the root).
 */
export function findParentSplit(
  root: LayoutNode,
  childId: string,
): { parent: SplitNode; index: number } | null {
  if (!isSplitNode(root)) return null;

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (child.id === childId) {
      return { parent: root, index: i };
    }
    if (isSplitNode(child)) {
      const found = findParentSplit(child, childId);
      if (found) return found;
    }
  }
  return null;
}

// ── Mutation (immutable) ────────────────────────────────────────────────────

/**
 * Return a new tree with the node identified by `targetId` replaced by `replacement`.
 * Does not mutate the original tree.
 */
export function replaceNode(
  root: LayoutNode,
  targetId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (root.id === targetId) return replacement;

  if (isSplitNode(root)) {
    return {
      ...root,
      children: root.children.map((child) => replaceNode(child, targetId, replacement)),
    };
  }

  return root;
}

/**
 * Split the pane identified by `paneId` into a `SplitNode` containing the original
 * pane (children[0]) and a new empty pane (children[1]), both at 50%.
 * Returns a new tree. The original tree is not mutated.
 */
export function splitPane(root: LayoutNode, paneId: string, direction: SplitDirection): LayoutNode {
  const replacement: SplitNode = {
    type: 'split',
    id: crypto.randomUUID(),
    direction,
    children: [
      // The original pane stays in place (its id is paneId)
      { type: 'pane', id: paneId },
      // A brand-new empty pane
      { type: 'pane', id: crypto.randomUUID() },
    ],
    sizes: ['50%', '50%'],
  };

  return replaceNode(root, paneId, replacement);
}

/**
 * Remove the pane identified by `paneId`.
 *
 * - If the pane is the root node and it's a single `PaneNode` (no split), returns `null`.
 * - Otherwise the parent `SplitNode` is replaced by the sibling subtree.
 *
 * Returns `{ layout, removedPanes }` where `removedPanes` lists every `PaneNode` id
 * in the removed subtree (the subtree that was replaced, including the target pane).
 */
export function removePane(
  root: LayoutNode,
  paneId: string,
): { layout: LayoutNode; removedPanes: string[] } | null {
  // If root is a single pane and it's the target, cannot remove
  if (isPaneNode(root) && root.id === paneId) return null;

  // Find the parent split
  const parentInfo = findParentSplit(root, paneId);
  if (!parentInfo) return null;

  const { parent: parentSplit, index } = parentInfo;
  const otherIndex = index === 0 ? 1 : 0;
  const otherChild = parentSplit.children[otherIndex];
  const removedSubtree = parentSplit.children[index];

  // Collect all pane IDs in the removed subtree
  const removedPanes = collectPaneIds(removedSubtree);

  // Replace the parent split with the sibling
  const layout = replaceNode(root, parentSplit.id, otherChild);
  return { layout, removedPanes };
}

// ── Collection ──────────────────────────────────────────────────────────────

/** Collect all `PaneNode` ids in the tree. */
export function collectPaneIds(root: LayoutNode): string[] {
  if (isPaneNode(root)) return [root.id];
  return root.children.flatMap(collectPaneIds);
}

/**
 * Returns `true` if `paneId` is the only pane in the tree
 * (i.e. the root is a single `PaneNode`).
 */
export function isOnlyPane(root: LayoutNode, paneId: string): boolean {
  return isPaneNode(root) && root.id === paneId;
}

// ── Serialization ───────────────────────────────────────────────────────────

/** Serialise the layout tree to a JSON string. */
export function serializeLayout(node: LayoutNode): string {
  return JSON.stringify(node);
}

/**
 * Deserialise a JSON string back into a `LayoutNode`.
 * Returns `null` if the input is invalid or does not conform to the schema.
 */
export function deserializeLayout(json: string): LayoutNode | null {
  try {
    const parsed = JSON.parse(json);
    if (!isValidLayoutNode(parsed)) return null;
    return parsed as LayoutNode;
  } catch {
    return null;
  }
}

// ── Validation (internal) ───────────────────────────────────────────────────

function isValidLayoutNode(value: unknown): value is LayoutNode {
  if (typeof value !== 'object' || value === null) return false;

  const node = value as Record<string, unknown>;

  if (typeof node.id !== 'string' || node.id === '') return false;
  if (node.type !== 'pane' && node.type !== 'split') return false;

  if (node.type === 'pane') return true;

  // It's a split node
  if (node.direction !== 'horizontal' && node.direction !== 'vertical') return false;

  if (!Array.isArray(node.children) || node.children.length !== 2) return false;
  if (!node.children.every((c: unknown) => isValidLayoutNode(c))) return false;

  if (
    !Array.isArray(node.sizes) ||
    node.sizes.length !== 2 ||
    typeof node.sizes[0] !== 'string' ||
    typeof node.sizes[1] !== 'string'
  ) {
    return false;
  }

  return true;
}
