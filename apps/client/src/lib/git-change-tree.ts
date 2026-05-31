import type { GitFileChange, GitFileChangeStatus } from '@ymir/shared';

export interface ChangeTreeNode {
  name: string;
  path: string; // relative path (full path from repo root)
  isDirectory: boolean;
  status?: GitFileChangeStatus; // only for file nodes
  children?: ChangeTreeNode[]; // only for directory nodes
}

export function buildChangeTree(changes: GitFileChange[]): ChangeTreeNode[] {
  const root: ChangeTreeNode[] = [];

  for (const change of changes) {
    const segments = change.path.split('/');
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      const fullPath = segments.slice(0, i + 1).join('/');

      if (isFile) {
        currentLevel.push({
          name: segment,
          path: fullPath,
          isDirectory: false,
          status: change.status,
        });
      } else {
        let existingDir = currentLevel.find((n) => n.isDirectory && n.name === segment);
        if (!existingDir) {
          existingDir = {
            name: segment,
            path: fullPath,
            isDirectory: true,
            children: [],
          };
          currentLevel.push(existingDir);
        }
        currentLevel = existingDir.children!;
      }
    }
  }

  // Sort: directories first, then files, alphabetical within each group
  return sortNodes(root);
}

function sortNodes(nodes: ChangeTreeNode[]): ChangeTreeNode[] {
  return nodes
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => {
      if (node.children) {
        return { ...node, children: sortNodes(node.children) };
      }
      return node;
    });
}
