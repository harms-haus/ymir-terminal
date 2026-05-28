import { describe, test, expect } from 'bun:test';
import {
  PROTOCOL_VERSION,
  type MessageEnvelope,
  generateId,
  isRequestEnvelope,
  type SplitNode,
  REQUEST_TYPES,
  type WorkspaceSummary,
} from './index';

describe('shared package exports', () => {
  test('exports are accessible', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(typeof generateId()).toBe('string');
    expect(REQUEST_TYPES).toContain('auth');
  });

  test('type imports compile without error', () => {
    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      payload: null,
    };
    expect(isRequestEnvelope(envelope)).toBe(false);

    const summary: WorkspaceSummary = {
      id: 'ws-1',
      name: 'test',
      cwd: '/tmp',
      color: '#fff',
    };
    expect(summary.id).toBe('ws-1');

    const node: SplitNode = {
      id: 'test',
      type: 'split',
      direction: 'horizontal',
      children: [],
    };
    expect(node.type).toBe('split');
  });
});
