import { extname } from 'node:path';

// ---------------------------------------------------------------------------
// Extension → language map
// ---------------------------------------------------------------------------

export const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.lua': 'lua',
  '.r': 'r',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.zig': 'zig',
  '.nim': 'nim',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini',
  '.conf': 'ini',
  '.csv': 'csv',
  '.txt': 'plaintext',
};

// ---------------------------------------------------------------------------
// Filename → language map
// ---------------------------------------------------------------------------

export const FILENAME_MAP: Record<string, string> = {
  Makefile: 'makefile',
  Dockerfile: 'dockerfile',
  '.gitignore': 'plaintext',
  '.env': 'plaintext',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
  'tsconfig.json': 'json',
  'package.json': 'json',
};

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

export function detectLanguage(filePath: string): string {
  const basename = filePath.split('/').pop() ?? '';
  if (basename in FILENAME_MAP) {
    return FILENAME_MAP[basename];
  }
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'plaintext';
}
