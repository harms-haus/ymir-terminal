const EXT_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'react_ts',
  js: 'javascript',
  jsx: 'react',
  css: 'css',
  scss: 'sass',
  html: 'html',
  json: 'json',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  txt: 'document',
  xml: 'xml',
  svg: 'svg',
  png: 'image',
  jpg: 'image',
  gif: 'image',
  lock: 'lock',
};

const NAME_MAP: Record<string, string> = {
  Makefile: 'makefile',
  Dockerfile: 'docker',
  '.gitignore': 'git',
  '.env': 'env',
  'package.json': 'nodejs',
  'tsconfig.json': 'typescript',
};

export function getFileIconName(filename: string): string {
  if (filename === 'folder') return 'folder';
  if (filename === 'folder.open') return 'folder_open';
  if (NAME_MAP[filename]) return NAME_MAP[filename];
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXT_MAP[ext] || 'file';
}

export function getLanguageFromPath(path: string): string | null {
  const filename = path.split('/').pop() || '';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    css: 'css',
    scss: 'css',
    html: 'html',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
  };
  return langMap[ext] || null;
}
