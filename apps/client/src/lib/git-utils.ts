import type { FileNode, GitStatusResponse } from '@ymir/shared';

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

  const deletedPaths = new Set<string>();
  for (const change of gitStatus.changes) {
    if (change.status === 'D') deletedPaths.add(change.path);
  }
  for (const staged of gitStatus.staged) {
    if (staged.status === 'D') deletedPaths.add(staged.path);
  }

  if (deletedPaths.size === 0) return tree;

  const result: FileNode[] = JSON.parse(JSON.stringify(tree));

  for (const relativePath of deletedPaths) {
    const absolutePath = workspaceRoot + '/' + relativePath;
    const segments = relativePath.split('/');
    const fileName = segments.pop()!;

    let siblings: FileNode[] = result;

    for (const segment of segments) {
      const dir = siblings.find((n) => n.isDirectory && n.name === segment);
      if (!dir || !dir.children) {
        siblings = [];
        break;
      }
      siblings = dir.children;
    }

    if (siblings.length === 0 && segments.length > 0) continue;

    const alreadyExists = siblings.some((n) => n.name === fileName);
    if (alreadyExists) continue;

    const syntheticNode: FileNode = {
      name: fileName,
      path: absolutePath,
      isDirectory: false,
    };

    // Insert in alphabetical order
    let insertIndex = siblings.length;
    for (let i = 0; i < siblings.length; i++) {
      if (fileName.localeCompare(siblings[i].name) < 0) {
        insertIndex = i;
        break;
      }
    }
    siblings.splice(insertIndex, 0, syntheticNode);
  }

  return result;
}
