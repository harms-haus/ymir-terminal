// ---------------------------------------------------------------------------
// AgentStatusTracker tests
// ---------------------------------------------------------------------------

import { describe, test, expect } from 'bun:test';
import { AgentStatusTracker } from './status-tracker';
import type { TerminalAgentState } from './status-tracker';
import type { OSC777AgentEvent } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOSC777Event(overrides: Partial<OSC777AgentEvent> = {}): OSC777AgentEvent {
  return {
    v: 1,
    agent: 'claude',
    event: 'session_start',
    session_id: 'sess-1',
    cwd: '/home/user/project',
    project: 'project',
    ...overrides,
  };
}

/** Freeze `Date.now` to a fixed value, run `fn`, then restore. */
function withFrozenTime(now: number, fn: () => void): void {
  const real = Date.now;
  try {
    Date.now = () => now;
    fn();
  } finally {
    Date.now = real;
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AgentStatusTracker', () => {
  // -----------------------------------------------------------------------
  // OSC-777 updates
  // -----------------------------------------------------------------------

  describe('updateFromOSC777', () => {
    test('sets status to "working" for working events', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromOSC777(
        'term-1',
        makeOSC777Event({ event: 'session_start' }),
      );
      expect(result).toBe('working');
      expect(tracker.getStatus('term-1')).toMatchObject({
        status: 'working',
        agent: 'claude',
        source: 'osc777',
      });
    });

    test('sets status to "halted" for halted events', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromOSC777(
        'term-1',
        makeOSC777Event({ event: 'permission_request' }),
      );
      expect(result).toBe('halted');
      expect(tracker.getStatus('term-1')).toMatchObject({
        status: 'halted',
        source: 'osc777',
      });
    });

    test('sets status to "done" for done events', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'stop' }));
      expect(result).toBe('done');
      expect(tracker.getStatus('term-1')).toMatchObject({
        status: 'done',
        source: 'osc777',
      });
    });

    test('maps known event strings via parser', () => {
      const tracker = new AgentStatusTracker();
      // 'tool_complete' → working
      expect(tracker.updateFromOSC777('t1', makeOSC777Event({ event: 'tool_complete' }))).toBe(
        'working',
      );
      // 'idle_prompt' → halted
      expect(tracker.updateFromOSC777('t2', makeOSC777Event({ event: 'idle_prompt' }))).toBe(
        'halted',
      );
      // 'prompt_submit' → working
      expect(tracker.updateFromOSC777('t3', makeOSC777Event({ event: 'prompt_submit' }))).toBe(
        'working',
      );
    });

    test('returns null when status does not change', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'working' }));
      const result = tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'working' }));
      expect(result).toBeNull();
    });

    test('still updates metadata when status is unchanged', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777(
        'term-1',
        makeOSC777Event({ event: 'session_start', agent: 'claude' }),
      );
      // Same status, different agent field
      tracker.updateFromOSC777(
        'term-1',
        makeOSC777Event({ event: 'session_start', agent: 'opencode' }),
      );
      expect(tracker.getStatus('term-1')?.agent).toBe('opencode');
    });

    test('returns new status when status changes (working → halted → done)', () => {
      const tracker = new AgentStatusTracker();
      expect(tracker.updateFromOSC777('t1', makeOSC777Event({ event: 'session_start' }))).toBe(
        'working',
      );
      expect(tracker.updateFromOSC777('t1', makeOSC777Event({ event: 'permission_request' }))).toBe(
        'halted',
      );
      expect(tracker.updateFromOSC777('t1', makeOSC777Event({ event: 'stop' }))).toBe('done');
    });
  });

  // -----------------------------------------------------------------------
  // Process-monitor updates
  // -----------------------------------------------------------------------

  describe('updateFromProcessMonitor', () => {
    test('sets status to "working" when present and active', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromProcessMonitor('term-1', true, true, 'claude');
      expect(result).toBe('working');
      expect(tracker.getStatus('term-1')).toMatchObject({
        status: 'working',
        agent: 'claude',
        source: 'process-monitor',
      });
    });

    test('sets status to "halted" when present but not active', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromProcessMonitor('term-1', true, false);
      expect(result).toBe('halted');
      expect(tracker.getStatus('term-1')).toMatchObject({
        status: 'halted',
        source: 'process-monitor',
      });
    });

    test('sets status to "done" when not present', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromProcessMonitor('term-1', false, false);
      expect(result).toBe('done');
      expect(tracker.getStatus('term-1')).toMatchObject({
        status: 'done',
        source: 'process-monitor',
      });
    });

    test('returns null when status does not change', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromProcessMonitor('term-1', true, true);
      const result = tracker.updateFromProcessMonitor('term-1', true, true);
      expect(result).toBeNull();
    });

    test('returns new status when transitioning from working→halted→done', () => {
      const tracker = new AgentStatusTracker();
      expect(tracker.updateFromProcessMonitor('t1', true, true)).toBe('working');
      expect(tracker.updateFromProcessMonitor('t1', true, false)).toBe('halted');
      expect(tracker.updateFromProcessMonitor('t1', false, false)).toBe('done');
    });
  });

  // -----------------------------------------------------------------------
  // Priority: OSC 777 takes precedence over process monitor
  // -----------------------------------------------------------------------

  describe('OSC-777 priority over process monitor', () => {
    test('process monitor update ignored when OSC 777 is recent (< 30 s)', () => {
      const now = 1_000_000_000;
      withFrozenTime(now, () => {
        const tracker = new AgentStatusTracker();

        // OSC 777 sets status to 'working'
        tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
        expect(tracker.getStatus('term-1')?.status).toBe('working');
        expect(tracker.getStatus('term-1')?.source).toBe('osc777');

        // Process monitor says agent is gone — should be ignored (fresh OSC 777)
        const result = tracker.updateFromProcessMonitor('term-1', false, false);
        expect(result).toBeNull();
        expect(tracker.getStatus('term-1')?.status).toBe('working');
      });
    });

    test('process monitor update applies when OSC 777 is stale (> 30 s)', () => {
      const now = 1_000_000_000;
      withFrozenTime(now, () => {
        const tracker = new AgentStatusTracker();

        // OSC 777 sets status to 'working'
        tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
        expect(tracker.getStatus('term-1')?.status).toBe('working');

        // Advance time by 31 seconds
        const later = now + 31_000;
        Date.now = () => later;

        // Process monitor says agent is gone — should apply (stale OSC 777)
        const result = tracker.updateFromProcessMonitor('term-1', false, false);
        expect(result).toBe('done');
        expect(tracker.getStatus('term-1')?.status).toBe('done');
        expect(tracker.getStatus('term-1')?.source).toBe('process-monitor');
      });
    });

    test('process monitor always applies when there is no prior OSC 777', () => {
      const tracker = new AgentStatusTracker();
      const result = tracker.updateFromProcessMonitor('term-1', true, true);
      expect(result).toBe('working');
      expect(tracker.getStatus('term-1')?.source).toBe('process-monitor');
    });

    test('process monitor freshness check uses source field, not just timing', () => {
      const now = 1_000_000_000;
      withFrozenTime(now, () => {
        const tracker = new AgentStatusTracker();

        // Process monitor first
        tracker.updateFromProcessMonitor('term-1', true, true);
        expect(tracker.getStatus('term-1')?.source).toBe('process-monitor');

        // 1 ms later, process monitor says not present — should NOT be ignored
        // because source is NOT 'osc777'
        const later = now + 1;
        Date.now = () => later;

        const result = tracker.updateFromProcessMonitor('term-1', false, false);
        expect(result).toBe('done');
        expect(tracker.getStatus('term-1')?.source).toBe('process-monitor');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Listener notifications
  // -----------------------------------------------------------------------

  describe('onStatusChange', () => {
    test('listener fires when status changes', () => {
      const tracker = new AgentStatusTracker();
      const calls: Array<[string, TerminalAgentState]> = [];

      const unsub = tracker.onStatusChange((id, state) => {
        calls.push([id, state]);
      });

      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('term-1');
      expect(calls[0][1].status).toBe('working');

      unsub();
    });

    test('listener does NOT fire on duplicate updates (same status)', () => {
      const tracker = new AgentStatusTracker();
      const calls: Array<[string, TerminalAgentState]> = [];

      tracker.onStatusChange((id, state) => {
        calls.push([id, state]);
      });

      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' })); // duplicate

      expect(calls).toHaveLength(1); // only the first change
    });

    test('listener does NOT fire on process-monitor duplicate', () => {
      const tracker = new AgentStatusTracker();
      const calls: Array<[string, TerminalAgentState]> = [];

      tracker.onStatusChange((id, state) => {
        calls.push([id, state]);
      });

      tracker.updateFromProcessMonitor('term-1', true, true);
      tracker.updateFromProcessMonitor('term-1', true, true); // duplicate

      expect(calls).toHaveLength(1);
    });

    test('unsubscribe function removes listener', () => {
      const tracker = new AgentStatusTracker();
      const calls: Array<[string, TerminalAgentState]> = [];

      const unsub = tracker.onStatusChange((id, state) => {
        calls.push([id, state]);
      });

      unsub();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      expect(calls).toHaveLength(0);
    });

    test('multiple listeners all receive notifications', () => {
      const tracker = new AgentStatusTracker();
      let count1 = 0;
      let count2 = 0;

      tracker.onStatusChange(() => {
        count1++;
      });
      tracker.onStatusChange(() => {
        count2++;
      });

      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  describe('getStatus', () => {
    test('returns undefined for unknown terminal', () => {
      const tracker = new AgentStatusTracker();
      expect(tracker.getStatus('unknown')).toBeUndefined();
    });

    test('returns state after OSC-777 update', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      const state = tracker.getStatus('term-1');
      expect(state).toBeDefined();
      expect(state!.status).toBe('working');
      expect(state!.agent).toBe('claude');
      expect(state!.sessionId).toBe('sess-1');
      expect(state!.cwd).toBe('/home/user/project');
      expect(state!.source).toBe('osc777');
      expect(typeof state!.lastUpdated).toBe('number');
    });
  });

  describe('getAllStatuses', () => {
    test('returns empty map when no terminals tracked', () => {
      const tracker = new AgentStatusTracker();
      expect(tracker.getAllStatuses().size).toBe(0);
    });

    test('returns all tracked terminals', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      tracker.updateFromOSC777('term-2', makeOSC777Event({ event: 'permission_request' }));
      tracker.updateFromOSC777('term-3', makeOSC777Event({ event: 'stop' }));

      const all = tracker.getAllStatuses();
      expect(all.size).toBe(3);
      expect(all.get('term-1')?.status).toBe('working');
      expect(all.get('term-2')?.status).toBe('halted');
      expect(all.get('term-3')?.status).toBe('done');
    });

    test('returned map is a snapshot (mutations do not affect internal state)', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      const snapshot = tracker.getAllStatuses();
      snapshot.delete('term-1');
      expect(tracker.getStatus('term-1')).toBeDefined();
    });
  });

  describe('clearTerminal', () => {
    test('removes entry for the given terminal', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      expect(tracker.getStatus('term-1')).toBeDefined();
      tracker.clearTerminal('term-1');
      expect(tracker.getStatus('term-1')).toBeUndefined();
    });

    test('does not affect other terminals', () => {
      const tracker = new AgentStatusTracker();
      tracker.updateFromOSC777('term-1', makeOSC777Event({ event: 'session_start' }));
      tracker.updateFromOSC777('term-2', makeOSC777Event({ event: 'stop' }));
      tracker.clearTerminal('term-1');
      expect(tracker.getStatus('term-2')).toBeDefined();
    });
  });
});
