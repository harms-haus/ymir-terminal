import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
import { setupTestDom } from '../test-helpers/mock-setup';
import {
  getFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  updateFavorite,
  getRecentConnections,
  addRecentConnection,
  clearRecentConnections,
  isFavorite,
} from './connection-storage';
import type { ConnectionEntry } from './connection-storage';

// ---------------------------------------------------------------------------
// Register happy-dom so localStorage is available in Node/Bun
// ---------------------------------------------------------------------------
beforeAll(async () => {
  await setupTestDom();
});

// ---------------------------------------------------------------------------
// Reset localStorage between every test
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------
describe('favorites', () => {
  test('getFavorites() returns [] when no data', () => {
    expect(getFavorites()).toEqual([]);
  });

  test('addFavorite() creates and persists entry', () => {
    const entry = addFavorite({
      label: 'Production',
      host: '192.168.1.100',
      port: 8080,
    });

    expect(entry.id).toBeTypeOf('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.label).toBe('Production');
    expect(entry.host).toBe('192.168.1.100');
    expect(entry.port).toBe(8080);
    expect(entry.createdAt).toBeTypeOf('number');
    expect(entry.createdAt).toBeGreaterThan(0);

    const persisted = getFavorites();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe(entry.id);
  });

  test('addFavorite() deduplicates by host+port (updates label)', () => {
    const first = addFavorite({
      label: 'Old Label',
      host: '10.0.0.1',
      port: 3000,
    });
    const second = addFavorite({
      label: 'New Label',
      host: '10.0.0.1',
      port: 3000,
    });

    // Same id reused — label was updated, not duplicated
    expect(second.id).toBe(first.id);
    expect(second.label).toBe('New Label');

    const all = getFavorites();
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe('New Label');
  });

  test('removeFavorite() removes by id', () => {
    const a = addFavorite({ label: 'A', host: '1.1.1.1', port: 1111 });
    const b = addFavorite({ label: 'B', host: '2.2.2.2', port: 2222 });

    expect(getFavorites()).toHaveLength(2);

    removeFavorite(a.id);

    const remaining = getFavorites();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });

  test('removeFavorite() is a no-op for unknown id', () => {
    addFavorite({ label: 'X', host: '3.3.3.3', port: 3333 });
    removeFavorite('non-existent-id');

    expect(getFavorites()).toHaveLength(1);
  });

  test('updateFavorite() updates fields and returns updated entry', () => {
    const entry = addFavorite({ label: 'Dev', host: '5.5.5.5', port: 5555 });

    const updated = updateFavorite(entry.id, {
      label: 'Dev Updated',
      host: '6.6.6.6',
      port: 6666,
    });

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(entry.id);
    expect(updated!.label).toBe('Dev Updated');
    expect(updated!.host).toBe('6.6.6.6');
    expect(updated!.port).toBe(6666);

    const all = getFavorites();
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe('Dev Updated');
  });

  test('updateFavorite() returns null for missing id', () => {
    const result = updateFavorite('no-such-id', { label: 'Nope' });
    expect(result).toBeNull();
  });

  test('updateFavorite() partial update only changes supplied fields', () => {
    const entry = addFavorite({ label: 'Keep', host: '7.7.7.7', port: 7777 });

    const updated = updateFavorite(entry.id, { label: 'Changed' });

    expect(updated).not.toBeNull();
    expect(updated!.label).toBe('Changed');
    expect(updated!.host).toBe('7.7.7.7');
    expect(updated!.port).toBe(7777);
  });

  test('isFavorite() returns correct boolean', () => {
    addFavorite({ label: 'Fav', host: '9.9.9.9', port: 9999 });

    expect(isFavorite('9.9.9.9', 9999)).toBe(true);
    expect(isFavorite('9.9.9.9', 8888)).toBe(false);
    expect(isFavorite('8.8.8.8', 9999)).toBe(false);
  });

  test('saveFavorites() writes raw data and getFavorites() reads it back', () => {
    const raw: ConnectionEntry[] = [
      {
        id: 'custom-id',
        label: 'Manual',
        host: '127.0.0.1',
        port: 4000,
        createdAt: 1000,
      },
    ];
    saveFavorites(raw);

    const result = getFavorites();
    expect(result).toEqual(raw);
  });
});

// ---------------------------------------------------------------------------
// Recent connections
// ---------------------------------------------------------------------------
describe('recent connections', () => {
  test('getRecentConnections() returns [] when no data', () => {
    expect(getRecentConnections()).toEqual([]);
  });

  test('addRecentConnection() adds and persists entry', () => {
    addRecentConnection('10.0.0.1', 3000, 'My Server');

    const recent = getRecentConnections();
    expect(recent).toHaveLength(1);
    expect(recent[0].host).toBe('10.0.0.1');
    expect(recent[0].port).toBe(3000);
    expect(recent[0].label).toBe('My Server');
    expect(recent[0].lastConnectedAt).toBeTypeOf('number');
  });

  test('addRecentConnection() prepends newest first', () => {
    addRecentConnection('1.1.1.1', 1111);
    addRecentConnection('2.2.2.2', 2222);

    const recent = getRecentConnections();
    expect(recent).toHaveLength(2);
    expect(recent[0].host).toBe('2.2.2.2'); // newest first
    expect(recent[1].host).toBe('1.1.1.1');
  });

  test('addRecentConnection() limits to 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      addRecentConnection(`10.0.0.${i}`, 3000 + i);
    }

    const recent = getRecentConnections();
    expect(recent).toHaveLength(10);

    // Most recent (i=14) should be first
    expect(recent[0].host).toBe('10.0.0.14');
    expect(recent[9].host).toBe('10.0.0.5'); // oldest kept
  });

  test('addRecentConnection() updates lastConnectedAt for existing host+port', () => {
    addRecentConnection('5.5.5.5', 5555);
    const before = getRecentConnections()[0].lastConnectedAt;

    // Small delay to ensure timestamp differs
    addRecentConnection('5.5.5.5', 5555);
    const after = getRecentConnections()[0];

    expect(after.host).toBe('5.5.5.5');
    expect(after.lastConnectedAt).toBeGreaterThanOrEqual(before);
    // Still only one entry — not duplicated
    expect(getRecentConnections()).toHaveLength(1);
  });

  test('clearRecentConnections() clears all entries', () => {
    addRecentConnection('1.1.1.1', 1111);
    addRecentConnection('2.2.2.2', 2222);
    expect(getRecentConnections()).toHaveLength(2);

    clearRecentConnections();
    expect(getRecentConnections()).toEqual([]);
  });

  test('addRecentConnection() works without label', () => {
    addRecentConnection('9.9.9.9', 9090);

    const recent = getRecentConnections();
    expect(recent[0].label).toBe('9.9.9.9:9090');
  });
});

// ---------------------------------------------------------------------------
// Error handling — corrupted localStorage
// ---------------------------------------------------------------------------
describe('corrupted localStorage', () => {
  test('getFavorites() returns [] for corrupted JSON', () => {
    localStorage.setItem('ymir-connection-favorites', '{bad json!!!');
    expect(getFavorites()).toEqual([]);
  });

  test('getRecentConnections() returns [] for corrupted JSON', () => {
    localStorage.setItem('ymir-connection-recent', 'not-json[');
    expect(getRecentConnections()).toEqual([]);
  });

  test('getFavorites() returns [] for non-array JSON', () => {
    localStorage.setItem('ymir-connection-favorites', '"just a string"');
    expect(getFavorites()).toEqual([]);
  });

  test('getRecentConnections() returns [] for non-array JSON', () => {
    localStorage.setItem('ymir-connection-recent', '{"object": true}');
    expect(getRecentConnections()).toEqual([]);
  });
});
