import type { FileNode, GitStatusResponse } from '@ymir/shared';

export const GIT_STATUS_COLORS: Record<string, string> = {
  '??': '#73c991', // green — untracked/new
  A: '#73c991', // green — added
  M: '#e2c08d', // gold — modified
  R: '#73c991', // green — renamed
  C: '#73c991', // green — copied
  D: '#c74e39', // dark red — deleted
};

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

export function computeDirectoryStatus(
  node: FileNode,
  gitPathMap: Map<string, { status: string; staged: boolean }>,
  workspaceRoot: string,
): string | null {
  if (!node.isDirectory) {
    const relativePath = node.path.slice(workspaceRoot.length + 1);
    if (gitPathMap.has(relativePath)) {
      return 'M';
    }
    return null;
  }

  if (node.children) {
    for (const child of node.children) {
      if (computeDirectoryStatus(child, gitPathMap, workspaceRoot) !== null) {
        return 'M';
      }
    }
  }

  return null;
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
