import type { RunEvent } from '@/hooks/use-run-stream';

export interface PersistedAssistantDelta {
  mode: 'append' | 'replace';
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractPersistedAssistantDelta(event: RunEvent): PersistedAssistantDelta | null {
  const payload = event.payload;
  if (!isRecord(payload)) {
    return null;
  }

  const explicit = isRecord(payload.assistantDelta) ? payload.assistantDelta : null;
  if (
    explicit &&
    (explicit.mode === 'append' || explicit.mode === 'replace') &&
    typeof explicit.text === 'string' &&
    explicit.text.length > 0
  ) {
    return {
      mode: explicit.mode,
      text: explicit.text,
    };
  }

  const item = isRecord(payload.item) ? payload.item : null;
  if (
    item?.type === 'agent_message' &&
    typeof item.text === 'string' &&
    item.text.trim().length > 0
  ) {
    return {
      mode: 'replace',
      text: item.text,
    };
  }

  if (
    typeof payload.delta === 'string' &&
    payload.delta.length > 0 &&
    typeof payload.type === 'string' &&
    (payload.type.includes('assistant') || payload.type.includes('message') || payload.type.includes('delta'))
  ) {
    return {
      mode: 'append',
      text: payload.delta,
    };
  }

  return null;
}

export function mergeAssistantText(
  current: string | null | undefined,
  delta: PersistedAssistantDelta,
) {
  const existing = current ?? '';

  if (delta.mode === 'replace') {
    return delta.text;
  }

  if (!existing) {
    return delta.text;
  }

  if (delta.text.startsWith(existing)) {
    return delta.text;
  }

  if (existing.endsWith(delta.text)) {
    return existing;
  }

  return `${existing}${delta.text}`;
}

export function normalizeAssistantText(text: string | null | undefined) {
  return (text ?? '').trimEnd();
}
