import { describe, expect, test } from 'bun:test';

import type { RunEvent } from '@/hooks/use-run-stream';

import {
  extractPersistedAssistantDelta,
  mergeAssistantText,
  normalizeAssistantText,
} from './assistant-stream';

function makeEvent(payload: Record<string, unknown>): RunEvent {
  return {
    id: 'evt_1',
    runId: 'run_1',
    eventType: 'run.log',
    sequence: 1,
    level: 'info',
    message: null,
    payload,
    createdAt: new Date().toISOString(),
  };
}

describe('assistant-stream helpers', () => {
  test('extracts legacy agent_message payloads as replace deltas', () => {
    const delta = extractPersistedAssistantDelta(
      makeEvent({
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: 'Hello from storage.',
        },
      }),
    );

    expect(delta).toEqual({
      mode: 'replace',
      text: 'Hello from storage.',
    });
  });

  test('merges append and replace deltas without duplicating the final reply', () => {
    const appended = mergeAssistantText('Hello', {
      mode: 'append',
      text: ' world',
    });

    expect(appended).toBe('Hello world');
    expect(
      normalizeAssistantText(
        mergeAssistantText(appended, {
          mode: 'replace',
          text: 'Hello world',
        }),
      ),
    ).toBe('Hello world');
  });
});
