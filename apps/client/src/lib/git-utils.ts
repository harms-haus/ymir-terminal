import type { FileNode, GitStatusResponse } from '@ymir/shared';

// ── formatRelativeTime ──────────────────────────────────────────────────────

export function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

export function buildGitPathMap(
  gitStatus: GitStatusResponse | null,
): Map<string, { status: string; staged: boolean }> {
  const map = new Map<string, { status: string; staged: boolean }>();
  if (!gitStatus) return map;

  for (const change of gitStatus.changes) {
    map.set(change.path, { status: change.status, staged: false });
  }

  for (const staged of gitStatus.staged) {
    map.set(staged.path, { status: staged.status, staged: true });
  }

  return map;
}

const STATUS_PRIORITY: Record<string, number> = {
  D: 4,
  A: 3,
  M: 2,
  R: 1,
  C: 1,
  '??': 0,
};

function highestPriorityStatus(a: string, b: string): string {
  return (STATUS_PRIORITY[a] ?? -1) >= (STATUS_PRIORITY[b] ?? -1) ? a : b;
}

export function computeDirectoryStatus(
  node: FileNode,
  gitPathMap: Map<string, { status: string; staged: boolean }>,
  workspaceRoot: string,
): string | null {
  if (!node.isDirectory) {
    const relativePath = node.path.slice(workspaceRoot.length + 1);
    const entry = gitPathMap.get(relativePath);
    if (entry) {
      return entry.status;
    }
    return null;
  }

  let aggregated: string | null = null;

  if (node.children) {
    for (const child of node.children) {
      const childStatus = computeDirectoryStatus(child, gitPathMap, workspaceRoot);
      if (childStatus !== null) {
        aggregated =
          aggregated === null ? childStatus : highestPriorityStatus(aggregated, childStatus);
      }
    }
  }

  return aggregated;
}

export function mergeDeletedFiles(
  tree: FileNode[],
  gitStatus: GitStatusResponse | null,
  workspaceRoot: string,
): FileNode[] {
  if (!gitStatus) return tree;

  // Collect all paths with status 'D' (deleted) from both unstaged and staged
  const deletedPaths = new Set<string>();
  for (const change of gitStatus.changes) {
    if (change.status === 'D') deletedPaths.add(change.path);
  }
  for (const staged of gitStatus.staged) {
    if (staged.status === 'D') deletedPaths.add(staged.path);
  }

  if (deletedPaths.size === 0) return tree;

  // Group deleted files by their parent directory's relative path
  // so we can process all children of a directory in one pass.
  const parents = new Map<string, { name: string; absolutePath: string }[]>();
  for (const relativePath of deletedPaths) {
    const absolutePath = workspaceRoot + '/' + relativePath;
    const segments = relativePath.split('/');
    const fileName = segments.pop()!;
    const parentKey = segments.join('/');
    let list = parents.get(parentKey);
    if (!list) {
      list = [];
      parents.set(parentKey, list);
    }
    list.push({ name: fileName, absolutePath });
  }

  // ── recursive walk with structural sharing ──────────────────────────────
  // Walk the tree top-down, reusing unchanged subtrees.  Returns a new array
  // only when synthetic nodes are inserted or a child subtree changed.
  function walk(nodes: FileNode[], parentKey: string): FileNode[] {
    let changed = false;
    const result: FileNode[] = [];

    for (const node of nodes) {
      if (node.isDirectory) {
        const childKey = parentKey ? parentKey + '/' + node.name : node.name;
        let newChildren: FileNode[] | undefined = node.children;

        if (node.children) {
          const walked = walk(node.children, childKey);
          if (walked !== node.children) {
            newChildren = walked;
          }
        }

        // Insert any synthetic deleted-file nodes into this directory
        const synths = parents.get(childKey);
        if (synths !== undefined && synths.length > 0) {
          changed = true;
          const merged = newChildren ? [...newChildren] : [];
          const seen = new Set(merged.map((n) => n.name));
          for (const synth of synths) {
            if (seen.has(synth.name)) continue;
            seen.add(synth.name);
            merged.push({
              name: synth.name,
              path: synth.absolutePath,
              isDirectory: false,
            });
          }
          merged.sort((a, b) => a.name.localeCompare(b.name));
          result.push({ ...node, children: merged });
        } else if (newChildren !== node.children) {
          changed = true;
          result.push({ ...node, children: newChildren });
        } else {
          // Reuse the original directory node (including its children) unchanged
          result.push(node);
        }
      } else {
        // Leaf node – never changes, just reuse the reference
        result.push(node);
      }
    }

    return changed ? result : nodes;
  }

  const result = walk(tree, '');

  // Handle root-level deleted files
  const rootSynths = parents.get('');
  if (rootSynths !== undefined && rootSynths.length > 0) {
    const newResult = result === tree ? [...result] : result;
    const seen = new Set(newResult.map((n) => n.name));
    for (const synth of rootSynths) {
      if (seen.has(synth.name)) continue;
      seen.add(synth.name);
      newResult.push({
        name: synth.name,
        path: synth.absolutePath,
        isDirectory: false,
      });
    }
    newResult.sort((a, b) => a.name.localeCompare(b.name));
    return newResult;
  }

  return result;
}
