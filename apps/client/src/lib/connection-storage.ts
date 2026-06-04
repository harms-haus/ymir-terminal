// ---------------------------------------------------------------------------
// localStorage-backed storage for connection favorites & recent connections.
// ---------------------------------------------------------------------------

const FAVORITES_KEY = 'ymir-connection-favorites';
const RECENT_KEY = 'ymir-connection-recent';
const MAX_RECENT = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionEntry {
  id: string;
  label: string;
  host: string;
  port: number;
  createdAt: number;
}

export interface RecentConnection extends ConnectionEntry {
  lastConnectedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export function getFavorites(): ConnectionEntry[] {
  const data = readJSON<ConnectionEntry[]>(FAVORITES_KEY);
  if (!Array.isArray(data)) return [];
  return data;
}

export function saveFavorites(entries: ConnectionEntry[]): void {
  writeJSON(FAVORITES_KEY, entries);
}

export function addFavorite(entry: Omit<ConnectionEntry, 'id' | 'createdAt'>): ConnectionEntry {
  const favorites = getFavorites();

  // Deduplicate by host+port: update label if already exists
  const existing = favorites.find((f) => f.host === entry.host && f.port === entry.port);
  if (existing) {
    existing.label = entry.label;
    saveFavorites(favorites);
    return existing;
  }

  const newEntry: ConnectionEntry = {
    id: crypto.randomUUID(),
    label: entry.label,
    host: entry.host,
    port: entry.port,
    createdAt: Date.now(),
  };
  favorites.push(newEntry);
  saveFavorites(favorites);
  return newEntry;
}

export function removeFavorite(id: string): void {
  const favorites = getFavorites();
  const next = favorites.filter((f) => f.id !== id);
  saveFavorites(next);
}

export function updateFavorite(
  id: string,
  updates: Partial<Pick<ConnectionEntry, 'label' | 'host' | 'port'>>,
): ConnectionEntry | null {
  const favorites = getFavorites();
  const entry = favorites.find((f) => f.id === id);
  if (!entry) return null;

  if (updates.label !== undefined) entry.label = updates.label;
  if (updates.host !== undefined) entry.host = updates.host;
  if (updates.port !== undefined) entry.port = updates.port;

  saveFavorites(favorites);
  return entry;
}

export function isFavorite(host: string, port: number): boolean {
  return getFavorites().some((f) => f.host === host && f.port === port);
}

// ---------------------------------------------------------------------------
// Recent connections
// ---------------------------------------------------------------------------

export function getRecentConnections(): RecentConnection[] {
  const data = readJSON<RecentConnection[]>(RECENT_KEY);
  if (!Array.isArray(data)) return [];
  return data;
}

export function addRecentConnection(host: string, port: number, label?: string): void {
  let recent = getRecentConnections();
  const now = Date.now();

  // Check for existing entry with same host+port
  const existing = recent.find((r) => r.host === host && r.port === port);
  if (existing) {
    existing.lastConnectedAt = now;
    if (label !== undefined) existing.label = label;
  } else {
    const entry: RecentConnection = {
      id: crypto.randomUUID(),
      label: label ?? `${host}:${port}`,
      host,
      port,
      createdAt: now,
      lastConnectedAt: now,
    };
    recent.unshift(entry);
  }

  // Sort by lastConnectedAt descending and trim
  recent.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  recent = recent.slice(0, MAX_RECENT);

  writeJSON(RECENT_KEY, recent);
}

export function clearRecentConnections(): void {
  localStorage.removeItem(RECENT_KEY);
}
