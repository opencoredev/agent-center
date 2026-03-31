import type { RunEvent } from "./types.js";

type ParseSuccess<TData> = {
  success: true;
  data: TData;
};

type ParseFailure = {
  success: false;
  error: string;
};

export type RealtimeParseResult<TData> = ParseSuccess<TData> | ParseFailure;

export const REALTIME_CLIENT_MESSAGE_TYPES = ["subscribe_run", "unsubscribe_run", "ping"] as const;

export const REALTIME_SERVER_MESSAGE_TYPES = ["subscribed", "run_event", "error", "pong"] as const;

export interface SubscribeRunMessage {
  type: "subscribe_run";
  runId: string;
}

export interface UnsubscribeRunMessage {
  type: "unsubscribe_run";
  runId: string;
}

export interface PingMessage {
  type: "ping";
}

export type RealtimeClientMessage = SubscribeRunMessage | UnsubscribeRunMessage | PingMessage;

export interface SubscribedMessage {
  type: "subscribed";
  runId: string;
}

export interface RunEventMessage {
  type: "run_event";
  runId: string;
  event: RunEvent;
}

export interface RealtimeErrorMessage {
  type: "error";
  message: string;
}

export interface PongMessage {
  type: "pong";
}

export type RealtimeServerMessage =
  | SubscribedMessage
  | RunEventMessage
  | RealtimeErrorMessage
  | PongMessage;

export function parseRealtimeClientMessage(
  payload: string,
): RealtimeParseResult<RealtimeClientMessage> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return {
      success: false,
      error: "Expected a JSON object message.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      success: false,
      error: "Expected a JSON object message.",
    };
  }

  const { type } = parsed;

  if (type === "ping") {
    return {
      success: true,
      data: {
        type: "ping",
      },
    };
  }

  if (type === "subscribe_run" || type === "unsubscribe_run") {
    const { runId } = parsed;

    if (typeof runId !== "string" || runId.length === 0) {
      return {
        success: false,
        error: "Expected a non-empty runId string.",
      };
    }

    return {
      success: true,
      data: {
        type,
        runId,
      },
    };
  }

  return {
    success: false,
    error: "Unsupported realtime message type.",
  };
}

export function parseRealtimeServerMessage(
  payload: string,
): RealtimeParseResult<RealtimeServerMessage> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return {
      success: false,
      error: "Expected a JSON object message.",
    };
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return {
      success: false,
      error: "Expected a JSON object message.",
    };
  }

  if (parsed.type === "pong") {
    return {
      success: true,
      data: {
        type: "pong",
      },
    };
  }

  if (parsed.type === "error") {
    if (typeof parsed.message !== "string" || parsed.message.length === 0) {
      return {
        success: false,
        error: "Expected a non-empty realtime error message.",
      };
    }

    return {
      success: true,
      data: {
        type: "error",
        message: parsed.message,
      },
    };
  }

  if (parsed.type === "subscribed") {
    if (typeof parsed.runId !== "string" || parsed.runId.length === 0) {
      return {
        success: false,
        error: "Expected a non-empty runId string.",
      };
    }

    return {
      success: true,
      data: {
        type: "subscribed",
        runId: parsed.runId,
      },
    };
  }

  if (parsed.type === "run_event") {
    if (typeof parsed.runId !== "string" || parsed.runId.length === 0) {
      return {
        success: false,
        error: "Expected a non-empty runId string.",
      };
    }

    const event = normalizeRunEvent(parsed.event, parsed.runId);

    if (event === undefined) {
      return {
        success: false,
        error: "Expected a valid run event payload.",
      };
    }

    return {
      success: true,
      data: {
        type: "run_event",
        runId: parsed.runId,
        event,
      },
    };
  }

  return {
    success: false,
    error: "Unsupported realtime message type.",
  };
}

export function serializeRealtimeClientMessage(message: RealtimeClientMessage): string {
  return JSON.stringify(message);
}

export function serializeRealtimeServerMessage(message: RealtimeServerMessage): string {
  return JSON.stringify(message);
}

function normalizeRunEvent(value: unknown, runId: string): RunEvent | undefined {
  if (!isRunEventRecord(value)) {
    return undefined;
  }

  return {
    createdAt: value.createdAt,
    eventType: value.eventType,
    id:
      typeof value.id === "string" && value.id.length > 0 ? value.id : `${runId}:${value.sequence}`,
    level: value.level,
    message: value.message,
    payload: value.payload,
    runId: typeof value.runId === "string" && value.runId.length > 0 ? value.runId : runId,
    sequence: value.sequence,
  };
}

function isRunEventRecord(
  value: unknown,
): value is Omit<RunEvent, "id"> & Partial<Pick<RunEvent, "id">> {
  return (
    isRecord(value) &&
    typeof value.sequence === "number" &&
    typeof value.eventType === "string" &&
    (value.level === null || typeof value.level === "string") &&
    (value.message === null || typeof value.message === "string") &&
    (value.payload === null || isRecord(value.payload)) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.runId === undefined || typeof value.runId === "string") &&
    typeof value.createdAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
